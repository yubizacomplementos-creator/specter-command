import { AuditAction, MembershipRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { publicUrl, redirectBackUrl } from "@/server/url";

function clientIp(request: NextRequest) {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  if (session.role !== MembershipRole.OWNER && session.role !== MembershipRole.ADMIN) {
    return NextResponse.redirect(redirectBackUrl(request, "/command/bot", { bot: "forbidden" }), 303);
  }

  const channelSession = await prisma.botChannelSession.upsert({
    where: {
      companyId_provider_channel: {
        companyId: session.company.id,
        provider: "baileys",
        channel: "whatsapp"
      }
    },
    create: {
      companyId: session.company.id,
      provider: "baileys",
      channel: "whatsapp",
      status: "CONNECTING",
      active: true,
      updatedById: session.user.id
    },
    update: {
      status: "CONNECTING",
      qrCode: null,
      lastError: null,
      active: true,
      updatedById: session.user.id
    }
  });

  await writeAuditLog({
    companyId: session.company.id,
    actorId: session.user.id,
    action: AuditAction.UPDATE,
    entityType: "BotChannelSession",
    entityId: channelSession.id,
    after: {
      provider: "baileys",
      channel: "whatsapp",
      status: "CONNECTING"
    },
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  return NextResponse.redirect(redirectBackUrl(request, "/command/bot", { bot: "whatsapp_connecting" }), 303);
}
