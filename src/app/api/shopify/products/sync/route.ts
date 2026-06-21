import { AuditAction, MembershipRole, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { decryptSecrets } from "@/server/integrations";
import { getCurrentSession } from "@/server/session";
import { publicUrl, redirectBackUrl } from "@/server/url";

type ShopifyProductNode = {
  id: string;
  legacyResourceId?: string;
  title: string;
  handle: string;
  vendor?: string;
  productType?: string;
  status?: string;
  featuredImage?: { url?: string | null } | null;
  variants: {
    nodes: Array<{
      id: string;
      legacyResourceId?: string;
      title: string;
      sku?: string | null;
      price?: string | null;
      inventoryQuantity?: number | null;
      selectedOptions?: Array<{
        name: string;
        value: string;
      }>;
    }>;
  };
};

type ShopifyProductsResponse = {
  data?: {
    products?: {
      nodes: ShopifyProductNode[];
    };
  };
  errors?: Array<{ message: string }>;
};

const productsQuery = `
  query SpecterProductsSync {
    products(first: 50, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        legacyResourceId
        title
        handle
        vendor
        productType
        status
        featuredImage {
          url
        }
        variants(first: 20) {
          nodes {
            id
            legacyResourceId
            title
            sku
            price
            inventoryQuantity
            selectedOptions {
              name
              value
            }
          }
        }
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

function variantName(product: ShopifyProductNode, variant: ShopifyProductNode["variants"]["nodes"][number]) {
  if (!variant.title || variant.title.toLowerCase() === "default title") {
    return product.title;
  }

  return `${product.title} - ${variant.title}`;
}

function variantSku(product: ShopifyProductNode, variant: ShopifyProductNode["variants"]["nodes"][number]) {
  const cleanSku = variant.sku?.trim();
  if (cleanSku) {
    return cleanSku.slice(0, 60);
  }

  const id = variant.legacyResourceId ?? product.legacyResourceId ?? product.id.split("/").pop() ?? product.handle;
  return `SHOPIFY-${id}`.slice(0, 60);
}

function optionAttributes(variant: ShopifyProductNode["variants"]["nodes"][number]) {
  return Object.fromEntries(
    (variant.selectedOptions ?? [])
      .map((option) => [slug(option.name) || option.name.toLowerCase(), option.value] as const)
      .filter(([key, value]) => Boolean(key) && Boolean(value))
  );
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  if (session.role === MembershipRole.VIEWER) {
    return NextResponse.redirect(redirectBackUrl(request, "/command/products", { product: "forbidden" }), 303);
  }

  const setting = await prisma.integrationSetting.findUnique({
    where: {
      companyId_provider: {
        companyId: session.company.id,
        provider: "shopify"
      }
    }
  });

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

  const response = await fetch(`https://${shopDomain}/admin/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken
    },
    body: JSON.stringify({ query: productsQuery })
  });

  if (!response.ok) {
    return NextResponse.redirect(redirectBackUrl(request, "/command/products", { product: "shopify_failed" }), 303);
  }

  const payload = (await response.json()) as ShopifyProductsResponse;
  if (payload.errors?.length || !payload.data?.products?.nodes) {
    return NextResponse.redirect(redirectBackUrl(request, "/command/products", { product: "shopify_failed" }), 303);
  }

  let synced = 0;
  for (const product of payload.data.products.nodes) {
    const variants = product.variants.nodes.length
      ? product.variants.nodes
      : [{ id: product.id, legacyResourceId: product.legacyResourceId, title: "Default Title" }];

    for (const variant of variants) {
      const sku = variantSku(product, variant);
      const name = variantName(product, variant);
      const categoryKey = slug(product.productType || "shopify") || "shopify";
      const variantAttributes = optionAttributes(variant);
      const attributes = {
        source: "shopify",
        shopDomain,
        productId: product.id,
        variantId: variant.id,
        handle: product.handle,
        vendor: product.vendor ?? null,
        productType: product.productType ?? null,
        status: product.status ?? null,
        imageUrl: product.featuredImage?.url ?? null,
        price: variant.price ?? null,
        inventoryQuantity: variant.inventoryQuantity ?? null,
        variantOptions: variant.selectedOptions ?? [],
        ...variantAttributes
      } satisfies Prisma.InputJsonObject;

      await prisma.product.upsert({
        where: {
          companyId_sku: {
            companyId: session.company.id,
            sku
          }
        },
        create: {
          companyId: session.company.id,
          sku,
          name,
          categoryKey,
          attributes,
          controlsStock: true,
          controlsCost: true,
          sellable: true,
          createdById: session.user.id,
          updatedById: session.user.id
        },
        update: {
          name,
          categoryKey,
          attributes,
          active: true,
          deletedAt: null,
          updatedById: session.user.id
        }
      });
      synced += 1;
    }
  }

  await writeAuditLog({
    companyId: session.company.id,
    actorId: session.user.id,
    action: AuditAction.UPDATE,
    entityType: "ShopifyProductSync",
    entityId: shopDomain,
    after: {
      synced,
      apiVersion
    },
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  return NextResponse.redirect(
    redirectBackUrl(request, "/command/products", { product: "shopify_synced", count: String(synced) }),
    303
  );
}
