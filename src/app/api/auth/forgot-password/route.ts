import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { emailConfigured, sendEmail } from "@/server/mail";
import { publicUrl } from "@/server/url";

const forgotPasswordSchema = z.object({
  email: z.string().email()
});

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function resetEmailHtml(resetUrl: string) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h1 style="font-size:22px">Recupera tu acceso a Specter Command</h1>
      <p>Recibimos una solicitud para cambiar la contrasena de tu cuenta.</p>
      <p><a href="${resetUrl}" style="display:inline-block;background:#22d3ee;color:#07111f;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:700">Cambiar contrasena</a></p>
      <p>Este enlace vence en 1 hora. Si no solicitaste este cambio, puedes ignorar este correo.</p>
    </div>
  `;
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const parsed = forgotPasswordSchema.safeParse({
    email: form.get("email")
  });

  if (!parsed.success) {
    return NextResponse.redirect(publicUrl(request, "/forgot-password?status=invalid"), 303);
  }

  if (!emailConfigured()) {
    return NextResponse.redirect(publicUrl(request, "/forgot-password?status=email_unconfigured"), 303);
  }

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: {
        where: { active: true, deletedAt: null },
        include: { company: true },
        take: 1
      }
    }
  });

  if (user?.active && !user.deletedAt && user.memberships[0]?.company.active && !user.memberships[0]?.company.deletedAt) {
    const token = crypto.randomBytes(32).toString("hex");
    const resetUrl = publicUrl(request, `/reset-password?token=${token}`).toString();

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      }
    });

    try {
      await sendEmail({
        to: user.email,
        subject: "Recupera tu acceso a Specter Command",
        html: resetEmailHtml(resetUrl),
        text: `Recupera tu acceso a Specter Command: ${resetUrl}\n\nEste enlace vence en 1 hora.`
      });
    } catch {
      return NextResponse.redirect(publicUrl(request, "/forgot-password?status=email_failed"), 303);
    }
  }

  return NextResponse.redirect(publicUrl(request, "/forgot-password?status=sent"), 303);
}
