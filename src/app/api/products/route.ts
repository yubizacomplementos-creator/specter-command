import { AuditAction, MembershipRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { publicUrl } from "@/server/url";

const productSchema = z.object({
  sku: z.string().max(60).optional(),
  name: z.string().min(2).max(180),
  categoryKey: z.string().min(2).max(80),
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

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  if (session.role === MembershipRole.VIEWER) {
    return NextResponse.redirect(publicUrl(request, "/command?product=forbidden"), 303);
  }

  const form = await request.formData();
  const parsed = productSchema.safeParse({
    sku: form.get("sku"),
    name: form.get("name"),
    categoryKey: form.get("categoryKey"),
    controlsStock: checkboxValue(form.get("controlsStock")),
    sellable: !form.has("notSellable"),
    usableAsInput: checkboxValue(form.get("usableAsInput")),
    requiresProduction: checkboxValue(form.get("requiresProduction"))
  });

  if (!parsed.success) {
    return NextResponse.redirect(publicUrl(request, "/command?product=invalid"), 303);
  }

  try {
    const product = await prisma.product.create({
      data: {
        companyId: session.company.id,
        sku: cleanOptional(parsed.data.sku),
        name: parsed.data.name.trim(),
        categoryKey: parsed.data.categoryKey.trim().toLowerCase().replace(/\s+/g, "-"),
        controlsStock: parsed.data.controlsStock,
        sellable: parsed.data.sellable,
        usableAsInput: parsed.data.usableAsInput,
        requiresProduction: parsed.data.requiresProduction,
        controlsCost: parsed.data.controlsStock,
        createdById: session.user.id,
        updatedById: session.user.id
      }
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
        requiresProduction: product.requiresProduction
      },
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined
    });

    return NextResponse.redirect(publicUrl(request, "/command?product=created"), 303);
  } catch {
    return NextResponse.redirect(publicUrl(request, "/command?product=duplicate"), 303);
  }
}
