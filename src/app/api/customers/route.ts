import { AuditAction, MembershipRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { publicUrl, redirectBackUrl } from "@/server/url";

const customerSchema = z.object({
  code: z.string().max(40).optional(),
  name: z.string().min(2).max(160),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional(),
  tags: z.string().max(240).optional()
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

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  if (session.role === MembershipRole.VIEWER) {
    return NextResponse.redirect(redirectBackUrl(request, "/command", { customer: "forbidden" }), 303);
  }

  const form = await request.formData();
  const parsed = customerSchema.safeParse({
    code: form.get("code"),
    name: form.get("name"),
    email: form.get("email"),
    phone: form.get("phone"),
    tags: form.get("tags")
  });

  if (!parsed.success) {
    return NextResponse.redirect(redirectBackUrl(request, "/command", { customer: "invalid" }), 303);
  }

  const tags = (parsed.data.tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);

  try {
    const customer = await prisma.customer.create({
      data: {
        companyId: session.company.id,
        code: cleanOptional(parsed.data.code),
        name: parsed.data.name.trim(),
        email: cleanOptional(parsed.data.email),
        phone: cleanOptional(parsed.data.phone),
        tags,
        createdById: session.user.id,
        updatedById: session.user.id
      }
    });

    await writeAuditLog({
      companyId: session.company.id,
      actorId: session.user.id,
      action: AuditAction.CREATE,
      entityType: "Customer",
      entityId: customer.id,
      after: {
        code: customer.code,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        tags: customer.tags
      },
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined
    });

    return NextResponse.redirect(redirectBackUrl(request, "/command", { customer: "created" }), 303);
  } catch {
    return NextResponse.redirect(redirectBackUrl(request, "/command", { customer: "duplicate" }), 303);
  }
}
