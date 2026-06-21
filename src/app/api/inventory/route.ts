import { AuditAction, MembershipRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { publicUrl, redirectBackUrl } from "@/server/url";

const inventorySchema = z.object({
  productId: z.string().min(1),
  locationKey: z.string().min(2).max(80),
  quantity: z.coerce.number().min(0).max(999999999),
  unitCost: z.coerce.number().nonnegative().max(999999999).optional(),
  reason: z.string().max(160).optional()
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

function locationKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  if (session.role === MembershipRole.VIEWER) {
    return NextResponse.redirect(redirectBackUrl(request, "/command", { inventory: "forbidden" }), 303);
  }

  const form = await request.formData();
  const parsed = inventorySchema.safeParse({
    productId: form.get("productId"),
    locationKey: form.get("locationKey"),
    quantity: form.get("quantity"),
    unitCost: form.get("unitCost") || undefined,
    reason: form.get("reason")
  });

  if (!parsed.success) {
    return NextResponse.redirect(redirectBackUrl(request, "/command", { inventory: "invalid" }), 303);
  }

  const product = await prisma.product.findFirst({
    where: {
      id: parsed.data.productId,
      companyId: session.company.id,
      controlsStock: true,
      active: true,
      deletedAt: null
    }
  });

  if (!product) {
    return NextResponse.redirect(redirectBackUrl(request, "/command", { inventory: "invalid_product" }), 303);
  }

  const normalizedLocation = locationKey(parsed.data.locationKey);

  try {
    const item = await prisma.inventoryItem.upsert({
      where: {
        companyId_productId_locationKey: {
          companyId: session.company.id,
          productId: product.id,
          locationKey: normalizedLocation
        }
      },
      create: {
        companyId: session.company.id,
        productId: product.id,
        locationKey: normalizedLocation,
        quantity: parsed.data.quantity,
        unitCost: parsed.data.unitCost ?? null,
        metadata: {
          reason: cleanOptional(parsed.data.reason),
          updatedById: session.user.id
        }
      },
      update: {
        quantity: parsed.data.quantity,
        unitCost: parsed.data.unitCost ?? null,
        metadata: {
          reason: cleanOptional(parsed.data.reason),
          updatedById: session.user.id
        }
      }
    });

    await writeAuditLog({
      companyId: session.company.id,
      actorId: session.user.id,
      action: AuditAction.UPDATE,
      entityType: "InventoryItem",
      entityId: item.id,
      after: {
        productId: product.id,
        productName: product.name,
        locationKey: item.locationKey,
        quantity: item.quantity.toString(),
        unitCost: item.unitCost?.toString() ?? null,
        reason: cleanOptional(parsed.data.reason)
      },
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined
    });

    return NextResponse.redirect(redirectBackUrl(request, "/command", { inventory: "updated" }), 303);
  } catch {
    return NextResponse.redirect(redirectBackUrl(request, "/command", { inventory: "failed" }), 303);
  }
}
