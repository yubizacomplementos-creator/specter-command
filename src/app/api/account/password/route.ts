import bcrypt from "bcryptjs";
import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { getCurrentSession } from "@/server/session";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(12),
    confirmPassword: z.string().min(12)
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"]
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    path: ["newPassword"]
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

function clientIp(request: NextRequest) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  );
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  const form = await request.formData();
  const parsed = passwordSchema.safeParse({
    currentPassword: form.get("currentPassword"),
    newPassword: form.get("newPassword"),
    confirmPassword: form.get("confirmPassword")
  });

  if (!parsed.success) {
    return NextResponse.redirect(publicUrl(request, "/command?password=invalid"), 303);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id }
  });

  const passwordOk = user
    ? await bcrypt.compare(parsed.data.currentPassword, user.passwordHash)
    : false;

  if (!user || !passwordOk) {
    return NextResponse.redirect(publicUrl(request, "/command?password=credentials"), 303);
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash }
  });

  await writeAuditLog({
    companyId: session.company.id,
    actorId: user.id,
    action: AuditAction.UPDATE,
    entityType: "User",
    entityId: user.id,
    changes: { passwordChanged: true },
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  return NextResponse.redirect(publicUrl(request, "/command?password=updated"), 303);
}
