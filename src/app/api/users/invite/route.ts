import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { AuditAction, MembershipRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { emailConfigured, sendEmail } from "@/server/mail";
import { getCurrentSession } from "@/server/session";
import { publicUrl } from "@/server/url";

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(120),
  role: z.enum([MembershipRole.ADMIN, MembershipRole.OPERATOR, MembershipRole.VIEWER])
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

function inviteEmailHtml(companyName: string, resetUrl: string) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h1 style="font-size:22px">Te invitaron a Specter Command</h1>
      <p>Fuiste agregado a ${companyName}. Crea tu contrasena para ingresar al centro de comando.</p>
      <p><a href="${resetUrl}" style="display:inline-block;background:#22d3ee;color:#07111f;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:700">Crear contrasena</a></p>
      <p>Este enlace vence en 1 hora.</p>
    </div>
  `;
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  if (session.role !== MembershipRole.OWNER && session.role !== MembershipRole.ADMIN) {
    return NextResponse.redirect(publicUrl(request, "/command?user=forbidden"), 303);
  }

  if (!emailConfigured()) {
    return NextResponse.redirect(publicUrl(request, "/command?user=email_unconfigured"), 303);
  }

  const form = await request.formData();
  const parsed = inviteSchema.safeParse({
    email: form.get("email"),
    name: form.get("name"),
    role: form.get("role")
  });

  if (!parsed.success) {
    return NextResponse.redirect(publicUrl(request, "/command?user=invalid"), 303);
  }

  const email = parsed.data.email.toLowerCase();
  const temporaryPassword = crypto.randomBytes(24).toString("hex");
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetUrl = publicUrl(request, `/reset-password?token=${resetToken}`).toString();

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });
    const user = existingUser
      ? await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            name: parsed.data.name,
            active: true,
            deletedAt: null
          }
        })
      : await prisma.user.create({
          data: {
            email,
            name: parsed.data.name,
            passwordHash
          }
        });

    await prisma.$transaction([
      prisma.membership.upsert({
        where: {
          companyId_userId: {
            companyId: session.company.id,
            userId: user.id
          }
        },
        create: {
          companyId: session.company.id,
          userId: user.id,
          role: parsed.data.role,
          active: true
        },
        update: {
          role: parsed.data.role,
          active: true,
          deletedAt: null
        }
      }),
      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(resetToken),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000)
        }
      }),
      prisma.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
          tokenHash: { not: hashToken(resetToken) }
        },
        data: { usedAt: new Date() }
      })
    ]);

    await sendEmail({
      to: user.email,
      subject: `Invitacion a ${session.company.name}`,
      html: inviteEmailHtml(session.company.name, resetUrl),
      text: `Te invitaron a ${session.company.name}. Crea tu contrasena aqui: ${resetUrl}`
    });

    await writeAuditLog({
      companyId: session.company.id,
      actorId: session.user.id,
      action: AuditAction.CREATE,
      entityType: "Membership",
      entityId: user.id,
      after: { email: user.email, role: parsed.data.role },
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined
    });

    return NextResponse.redirect(publicUrl(request, "/command?user=invited"), 303);
  } catch {
    return NextResponse.redirect(publicUrl(request, "/command?user=email_failed"), 303);
  }
}
