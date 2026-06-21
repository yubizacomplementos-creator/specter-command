import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sessionCookieName, signSession } from "@/server/auth";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { publicUrl } from "@/server/url";

const selectSchema = z.object({
  companyId: z.string().min(1)
});

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  const form = await request.formData();
  const parsed = selectSchema.safeParse({
    companyId: form.get("companyId")
  });

  if (!parsed.success) {
    return NextResponse.redirect(publicUrl(request, "/profiles?profile=forbidden"), 303);
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.user.id,
      companyId: parsed.data.companyId,
      active: true,
      deletedAt: null,
      company: {
        active: true,
        deletedAt: null
      }
    },
    include: { company: true, user: true }
  });

  if (!membership) {
    return NextResponse.redirect(publicUrl(request, "/profiles?profile=forbidden"), 303);
  }

  const token = await signSession({
    sub: membership.userId,
    email: membership.user.email,
    companyId: membership.companyId,
    role: membership.role
  });

  await writeAuditLog({
    companyId: membership.companyId,
    actorId: membership.userId,
    action: AuditAction.LOGIN,
    entityType: "CompanyProfile",
    entityId: membership.companyId,
    after: { companyName: membership.company.name }
  });

  const response = NextResponse.redirect(publicUrl(request, "/command"), 303);
  response.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8,
    path: "/"
  });

  return response;
}
