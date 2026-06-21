import { AuditAction, MembershipRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { publicUrl, redirectBackUrl } from "@/server/url";

const messageSchema = z.object({
  conversationId: z.string().optional(),
  customerId: z.string().optional(),
  channel: z.string().max(40).optional(),
  message: z.string().min(1).max(4000)
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

function botDraftReply(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("precio") || normalized.includes("cuanto")) {
    return "Recibi tu consulta sobre precios. Ya tengo el contexto guardado para que el equipo responda con datos exactos del catalogo.";
  }

  if (normalized.includes("pedido") || normalized.includes("orden")) {
    return "Recibi tu consulta sobre pedidos. Puedo dejarla trazada y escalarla al equipo comercial.";
  }

  return "Mensaje recibido. Esta conversacion quedo registrada en Specter Command para seguimiento.";
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  if (session.role === MembershipRole.VIEWER) {
    return NextResponse.redirect(redirectBackUrl(request, "/command/bot", { bot: "forbidden" }), 303);
  }

  const form = await request.formData();
  const parsed = messageSchema.safeParse({
    conversationId: form.get("conversationId"),
    customerId: form.get("customerId"),
    channel: form.get("channel"),
    message: form.get("message")
  });

  if (!parsed.success) {
    return NextResponse.redirect(redirectBackUrl(request, "/command/bot", { bot: "invalid" }), 303);
  }

  const customerId = cleanOptional(parsed.data.customerId);
  if (customerId) {
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        companyId: session.company.id,
        active: true,
        deletedAt: null
      },
      select: { id: true }
    });

    if (!customer) {
      return NextResponse.redirect(redirectBackUrl(request, "/command/bot", { bot: "invalid_customer" }), 303);
    }
  }

  const conversation = parsed.data.conversationId
    ? await prisma.botConversation.findFirst({
        where: {
          id: parsed.data.conversationId,
          companyId: session.company.id,
          active: true,
          deletedAt: null
        }
      })
    : await prisma.botConversation.create({
        data: {
          companyId: session.company.id,
          customerId,
          channel: cleanOptional(parsed.data.channel) ?? "internal",
          title: parsed.data.message.slice(0, 80),
          createdById: session.user.id,
          updatedById: session.user.id
        }
      });

  if (!conversation) {
    return NextResponse.redirect(redirectBackUrl(request, "/command/bot", { bot: "invalid_conversation" }), 303);
  }

  const reply = botDraftReply(parsed.data.message);

  await prisma.$transaction([
    prisma.botMessage.create({
      data: {
        conversationId: conversation.id,
        companyId: session.company.id,
        role: "user",
        content: parsed.data.message,
        createdById: session.user.id
      }
    }),
    prisma.botMessage.create({
      data: {
        conversationId: conversation.id,
        companyId: session.company.id,
        role: "assistant",
        content: reply,
        metadata: {
          mode: "internal-draft",
          officialApi: false
        }
      }
    }),
    prisma.botConversation.update({
      where: { id: conversation.id },
      data: {
        status: "OPEN",
        updatedById: session.user.id
      }
    })
  ]);

  await writeAuditLog({
    companyId: session.company.id,
    actorId: session.user.id,
    action: AuditAction.CREATE,
    entityType: "BotConversation",
    entityId: conversation.id,
    after: {
      channel: conversation.channel,
      officialApi: false
    },
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  return NextResponse.redirect(redirectBackUrl(request, "/command/bot", { bot: "sent" }), 303);
}
