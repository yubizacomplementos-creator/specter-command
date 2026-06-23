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
  categoryKey: z.string().min(2).max(80),
  locationKey: z.string().max(80).optional(),
  price: z.string().max(40).optional(),
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
    categoryKey: form.get("categoryKey"),
    locationKey: form.get("locationKey"),
    price: form.get("price"),
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
            ...(normalizedLocation ? { primaryLocation: normalizedLocation } : {}),
            ...(price !== null ? { price } : {})
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
        price
      },
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined
    });

    return NextResponse.redirect(redirectBackUrl(request, "/command/products", { product: "created" }), 303);
  } catch {
    return NextResponse.redirect(redirectBackUrl(request, "/command/products", { product: "duplicate" }), 303);
  }
}
