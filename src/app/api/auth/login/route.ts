import bcrypt from "bcryptjs";
import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sessionCookieName, signSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/audit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

function publicUrl(request: NextRequest, path: string) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (configuredUrl) {
    return new URL(path, configuredUrl);
  }

  const protocol = request.headers.get("x-forwarded-proto") ?? "https";
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "spectercommand.com";

  return new URL(path, `${protocol}://${host}`);
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const parsed = loginSchema.safeParse({
    email: form.get("email"),
    password: form.get("password")
  });

  if (!parsed.success) {
    return NextResponse.redirect(publicUrl(request, "/login?error=invalid"), 303);
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    include: {
      memberships: {
        where: { active: true, deletedAt: null },
        include: { company: true },
        take: 1
      }
    }
  });

  const membership = user?.memberships[0];
  const passwordOk = user ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;

  if (!user || !membership || !membership.company.active || membership.company.deletedAt || !passwordOk) {
    return NextResponse.redirect(publicUrl(request, "/login?error=credentials"), 303);
  }

  const token = await signSession({
    sub: user.id,
    email: user.email,
    companyId: membership.companyId,
    role: membership.role
  });

  await writeAuditLog({
    companyId: membership.companyId,
    actorId: user.id,
    action: AuditAction.LOGIN,
    entityType: "User",
    entityId: user.id,
    after: { email: user.email }
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
