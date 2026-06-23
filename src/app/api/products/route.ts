import { AuditAction, MembershipRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { publicUrl, redirectBackUrl } from "@/server/url";

const productSchema = z.object({
  sku: z.string().max(60).optional(),
  name: z.string().min(2).max(180),
  description: z.string().max(5000).optional(),
  categoryKey: z.string().min(2).max(80),
  vendor: z.string().max(120).optional(),
  tags: z.string().max(500).optional(),
  status: z.enum(["ACTIVE", "DRAFT"]).default("ACTIVE"),
  mediaUrl: z.string().max(1000).optional(),
  locationKey: z.string().max(80).optional(),
  price: z.string().max(40).optional(),
  variants: z.string().max(5000).optional(),
  controlsStock: z.boolean(),
  sellable: z.boolean(),
  usableAsInput: z.boolean(),
  requiresProduction: z.boolean()
});

function clientIp(request: NextRequest) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  );
}

function cleanOptional(value?: string) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function tagList(value?: string) {
  return (value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function checkboxValue(value: FormDataEntryValue | null) {
  return value === "on";
}

function locationKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function priceValue(value?: string) {
  const cleaned = value?.trim();

  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseVariantLine(line: string, index: number, fallbackPrice: number | null) {
  const cells = line
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);

  if (!cells.length) {
    return null;
  }

  const options: Record<string, string> = {};
  let sku: string | null = null;
  let price = fallbackPrice;
  let location: string | null = null;

  for (const cell of cells) {
    const separator = cell.indexOf("=");
    if (separator === -1) {
      if (!sku) {
        sku = cell;
      }
      continue;
    }

    const key = cell.slice(0, separator).trim();
    const value = cell.slice(separator + 1).trim();
    const normalizedKey = key.toLowerCase();

    if (!value) {
      continue;
    }

    if (["sku", "codigo", "código"].includes(normalizedKey)) {
      sku = value;
    } else if (["precio", "price"].includes(normalizedKey)) {
      price = priceValue(value);
    } else if (["ubicacion", "ubicación", "location"].includes(normalizedKey)) {
      location = locationKey(value);
    } else {
      options[key] = value;
    }
  }

  if (!Object.keys(options).length) {
    options.Variante = sku ?? `Variante ${index + 1}`;
  }

  return {
    sku,
    price,
    location,
    options
  };
}

function parseVariants(value: string | undefined, fallbackPrice: number | null) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line, index) => parseVariantLine(line, index, fallbackPrice))
    .filter((variant): variant is NonNullable<ReturnType<typeof parseVariantLine>> => Boolean(variant))
    .slice(0, 100);
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
  const parsed = productSchema.safeParse({
    sku: form.get("sku"),
    name: form.get("name"),
    description: form.get("description"),
    categoryKey: form.get("categoryKey"),
    vendor: form.get("vendor"),
    tags: form.get("tags"),
    status: form.get("status") === "DRAFT" ? "DRAFT" : "ACTIVE",
    mediaUrl: form.get("mediaUrl"),
    locationKey: form.get("locationKey"),
    price: form.get("price"),
    variants: form.get("variants"),
    controlsStock: checkboxValue(form.get("controlsStock")),
    sellable: !form.has("notSellable"),
    usableAsInput: checkboxValue(form.get("usableAsInput")),
    requiresProduction: checkboxValue(form.get("requiresProduction"))
  });

  if (!parsed.success) {
    return NextResponse.redirect(redirectBackUrl(request, "/command/products", { product: "invalid" }), 303);
  }

  try {
    const requestedLocation = cleanOptional(parsed.data.locationKey);
    const normalizedLocation = requestedLocation ? locationKey(requestedLocation) : null;
    const price = priceValue(parsed.data.price);
    const variants = parseVariants(parsed.data.variants, price);
    const controlsStock = parsed.data.controlsStock || Boolean(normalizedLocation);
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          companyId: session.company.id,
          sku: cleanOptional(parsed.data.sku),
          name: parsed.data.name.trim(),
          categoryKey: parsed.data.categoryKey.trim().toLowerCase().replace(/\s+/g, "-"),
          controlsStock,
          sellable: parsed.data.sellable,
          usableAsInput: parsed.data.usableAsInput,
          requiresProduction: parsed.data.requiresProduction,
          controlsCost: controlsStock,
          attributes: {
            ...(cleanOptional(parsed.data.description) ? { description: cleanOptional(parsed.data.description) } : {}),
            ...(cleanOptional(parsed.data.vendor) ? { vendor: cleanOptional(parsed.data.vendor) } : {}),
            ...(tagList(parsed.data.tags).length ? { tags: tagList(parsed.data.tags) } : {}),
            status: parsed.data.status,
            ...(cleanOptional(parsed.data.mediaUrl) ? { mediaUrl: cleanOptional(parsed.data.mediaUrl) } : {}),
            ...(normalizedLocation ? { primaryLocation: normalizedLocation } : {}),
            ...(price !== null ? { price } : {}),
            ...(variants.length ? { variants } : {})
          },
          createdById: session.user.id,
          updatedById: session.user.id
        }
      });

      if (normalizedLocation) {
        await tx.inventoryItem.create({
          data: {
            companyId: session.company.id,
            productId: created.id,
            locationKey: normalizedLocation,
            quantity: 0,
            metadata: {
              reason: "ubicacion inicial",
              updatedById: session.user.id
            }
          }
        });
      }

      return created;
    });

    await writeAuditLog({
      companyId: session.company.id,
      actorId: session.user.id,
      action: AuditAction.CREATE,
      entityType: "Product",
      entityId: product.id,
      after: {
        sku: product.sku,
        name: product.name,
        categoryKey: product.categoryKey,
        controlsStock: product.controlsStock,
        sellable: product.sellable,
        usableAsInput: product.usableAsInput,
        requiresProduction: product.requiresProduction,
        locationKey: normalizedLocation,
        price,
        variants: variants.length
      },
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined
    });

    return NextResponse.redirect(redirectBackUrl(request, "/command/products", { product: "created" }), 303);
  } catch {
    return NextResponse.redirect(redirectBackUrl(request, "/command/products", { product: "duplicate" }), 303);
  }
}
