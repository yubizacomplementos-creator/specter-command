import { AuditAction, MembershipRole, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { decryptSecrets } from "@/server/integrations";
import { getCurrentSession } from "@/server/session";
import { publicUrl, redirectBackUrl } from "@/server/url";

const publishSchema = z.object({
  productId: z.string().min(1)
});

type ShopifyProductSetResponse = {
  data?: {
    productSet?: {
      product?: {
        id: string;
        handle: string;
        variants?: {
          nodes: Array<{
            id: string;
            sku?: string | null;
          }>;
        };
      } | null;
      userErrors: Array<{
        field?: string[] | null;
        message: string;
      }>;
    };
  };
  errors?: Array<{ message: string }>;
};

const productSetMutation = `
  mutation SpecterProductSet($input: ProductSetInput!, $identifier: ProductSetIdentifiers, $synchronous: Boolean!) {
    productSet(input: $input, identifier: $identifier, synchronous: $synchronous) {
      product {
        id
        handle
        variants(first: 10) {
          nodes {
            id
            sku
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function clientIp(request: NextRequest) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  );
}

function configValue(config: unknown, key: string) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return "";
  }

  const value = (config as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDomain(value: string) {
  return value
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
}

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function asRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function priceFromAttributes(attributes: Record<string, unknown>) {
  const value = attributes.price;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 ? value.toFixed(2) : "0.00";
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? parsed.toFixed(2) : "0.00";
  }
  return "0.00";
}

function shopifyHandle(product: { id: string; sku: string | null; name: string }) {
  const source = product.sku || product.name || product.id;
  return slug(source) || `producto-${product.id.slice(-8).toLowerCase()}`;
}

type ProductVariant = {
  sku?: string | null;
  price?: number | string | null;
  options?: Record<string, string>;
};

function descriptionFromAttributes(attributes: Record<string, unknown>) {
  const value = attributes.description;
  return typeof value === "string" ? value : "";
}

function tagsFromAttributes(attributes: Record<string, unknown>, fallback: string) {
  const tags = Array.isArray(attributes.tags)
    ? attributes.tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim()))
    : [];

  return Array.from(new Set([fallback, ...tags])).slice(0, 50);
}

function statusFromAttributes(attributes: Record<string, unknown>, sellable: boolean) {
  return attributes.status === "DRAFT" || !sellable ? "DRAFT" : "ACTIVE";
}

function variantsFromAttributes(attributes: Record<string, unknown>) {
  const variants = attributes.variants;
  return Array.isArray(variants)
    ? variants.filter((variant): variant is ProductVariant => Boolean(variant) && typeof variant === "object" && !Array.isArray(variant))
    : [];
}

function optionNamesFromVariants(variants: ProductVariant[]) {
  const names = new Set<string>();
  for (const variant of variants) {
    for (const name of Object.keys(variant.options ?? {})) {
      if (name.trim()) {
        names.add(name.trim());
      }
    }
  }

  return Array.from(names).slice(0, 3);
}

function optionValues(variants: ProductVariant[], optionName: string) {
  return Array.from(
    new Set(
      variants
        .map((variant) => variant.options?.[optionName]?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).map((name) => ({ name }));
}

function variantPrice(variant: ProductVariant, fallback: string) {
  if (typeof variant.price === "number" && Number.isFinite(variant.price)) {
    return variant.price > 0 ? variant.price.toFixed(2) : fallback;
  }
  if (typeof variant.price === "string" && variant.price.trim()) {
    const parsed = Number(variant.price.replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? parsed.toFixed(2) : fallback;
  }

  return fallback;
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  if (session.role === MembershipRole.VIEWER) {
    return NextResponse.redirect(redirectBackUrl(request, "/command/products", { product: "forbidden" }), 303);
  }

  const form = await request.formData();
  const parsed = publishSchema.safeParse({
    productId: form.get("productId")
  });

  if (!parsed.success) {
    return NextResponse.redirect(redirectBackUrl(request, "/command/products", { product: "shopify_publish_invalid" }), 303);
  }

  const [product, setting] = await Promise.all([
    prisma.product.findFirst({
      where: {
        id: parsed.data.productId,
        companyId: session.company.id,
        active: true,
        deletedAt: null
      },
      include: {
        company: {
          select: { name: true, legalName: true }
        }
      }
    }),
    prisma.integrationSetting.findUnique({
      where: {
        companyId_provider: {
          companyId: session.company.id,
          provider: "shopify"
        }
      }
    })
  ]);

  if (!product) {
    return NextResponse.redirect(redirectBackUrl(request, "/command/products", { product: "shopify_publish_invalid" }), 303);
  }

  const shopDomain = normalizeDomain(configValue(setting?.publicConfig, "shopDomain"));
  const apiVersion = configValue(setting?.publicConfig, "apiVersion") || "2026-01";
  const secrets = decryptSecrets({
    secretCiphertext: setting?.secretCiphertext,
    secretIv: setting?.secretIv,
    secretTag: setting?.secretTag
  });
  const accessToken = secrets.accessToken?.trim();

  if (!shopDomain || !accessToken) {
    return NextResponse.redirect(redirectBackUrl(request, "/command/products", { product: "shopify_missing" }), 303);
  }

  const attributes = asRecord(product.attributes);
  const handle = typeof attributes.shopifyHandle === "string" ? attributes.shopifyHandle : shopifyHandle(product);
  const sku = product.sku || `SPECTER-${product.id.slice(-8).toUpperCase()}`;
  const specterVariants = variantsFromAttributes(attributes);
  const optionNames = optionNamesFromVariants(specterVariants);
  const defaultPrice = priceFromAttributes(attributes);
  const productOptions = optionNames.length
    ? optionNames.map((name, index) => ({
        name,
        position: index + 1,
        values: optionValues(specterVariants, name)
      }))
    : [
        {
          name: "Title",
          position: 1,
          values: [{ name: "Default Title" }]
        }
      ];
  const variants = specterVariants.length
    ? specterVariants.map((variant, index) => ({
        optionValues: optionNames.map((optionName) => ({
          optionName,
          name: variant.options?.[optionName] || "Default"
        })),
        sku: variant.sku || `${sku}-${index + 1}`,
        price: variantPrice(variant, defaultPrice)
      }))
    : [
        {
          optionValues: [{ optionName: "Title", name: "Default Title" }],
          sku,
          price: defaultPrice
        }
      ];
  const variables = {
    synchronous: true,
    identifier: { handle },
    input: {
      title: product.name,
      descriptionHtml: descriptionFromAttributes(attributes),
      handle,
      productType: product.categoryKey,
      vendor: typeof attributes.vendor === "string" ? attributes.vendor : product.company.legalName || product.company.name,
      status: statusFromAttributes(attributes, product.sellable),
      tags: tagsFromAttributes(attributes, product.categoryKey),
      productOptions,
      variants,
      metafields: [
        {
          namespace: "specter",
          key: "product_id",
          type: "single_line_text_field",
          value: product.id
        }
      ]
    }
  };

  const response = await fetch(`https://${shopDomain}/admin/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken
    },
    body: JSON.stringify({ query: productSetMutation, variables })
  });

  if (!response.ok) {
    return NextResponse.redirect(redirectBackUrl(request, "/command/products", { product: "shopify_publish_failed" }), 303);
  }

  const payload = (await response.json()) as ShopifyProductSetResponse;
  const userErrors = payload.data?.productSet?.userErrors ?? [];
  const shopifyProduct = payload.data?.productSet?.product;

  if (payload.errors?.length || userErrors.length || !shopifyProduct) {
    return NextResponse.redirect(redirectBackUrl(request, "/command/products", { product: "shopify_publish_failed" }), 303);
  }

  const variant = shopifyProduct.variants?.nodes.find((node) => node.sku === sku) ?? shopifyProduct.variants?.nodes[0];
  await prisma.product.update({
    where: { id: product.id },
    data: {
      attributes: {
        ...attributes,
        source: attributes.source ?? "specter",
        shopifyProductId: shopifyProduct.id,
        shopifyVariantId: variant?.id ?? null,
        shopifyHandle: shopifyProduct.handle,
        shopifyPublishedAt: new Date().toISOString()
      },
      updatedById: session.user.id
    }
  });

  await writeAuditLog({
    companyId: session.company.id,
    actorId: session.user.id,
    action: AuditAction.UPDATE,
    entityType: "ShopifyProductPublish",
    entityId: product.id,
    after: {
      shopDomain,
      shopifyProductId: shopifyProduct.id,
      shopifyVariantId: variant?.id ?? null,
      handle: shopifyProduct.handle
    },
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  return NextResponse.redirect(redirectBackUrl(request, "/command/products", { product: "shopify_published" }), 303);
}
