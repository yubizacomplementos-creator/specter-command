import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { publicUrl } from "@/server/url";

const resetPasswordSchema = z
  .object({
    token: z.string().min(32),
    password: z.string().min(12),
    confirmPassword: z.string().min(12)
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"]
  });

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function clientIp(request: NextRequest) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  );
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const parsed = resetPasswordSchema.safeParse({
    token: form.get("token"),
    password: form.get("password"),
    confirmPassword: form.get("confirmPassword")
  });

  if (!parsed.success) {
    return NextResponse.redirect(publicUrl(request, "/reset-password?status=invalid"), 303);
  }

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
    include: {
      user: {
        include: {
          memberships: {
            where: { active: true, deletedAt: null },
            include: { company: true },
            take: 1
          }
        }
      }
    }
  });

  const company = resetToken?.user.memberships[0]?.company;

  if (
    !resetToken ||
    resetToken.usedAt ||
    resetToken.expiresAt < new Date() ||
    !resetToken.user.active ||
    resetToken.user.deletedAt ||
    !company?.active ||
    company.deletedAt
  ) {
    return NextResponse.redirect(publicUrl(request, "/reset-password?status=expired"), 303);
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash }
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() }
    }),
    prisma.passwordResetToken.updateMany({
      where: {
        userId: resetToken.userId,
        usedAt: null,
        id: { not: resetToken.id }
      },
      data: { usedAt: new Date() }
    }),
    prisma.auditLog.create({
      data: {
        companyId: company.id,
        actorId: resetToken.userId,
        action: AuditAction.UPDATE,
        entityType: "User",
        entityId: resetToken.userId,
        changes: { passwordReset: true },
        ipAddress: clientIp(request),
        userAgent: request.headers.get("user-agent") ?? undefined
      }
    })
  ]);

  return NextResponse.redirect(publicUrl(request, "/login?reset=updated"), 303);
}
