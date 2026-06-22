import { AuditAction, MembershipRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { decryptSecrets } from "@/server/integrations";
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

function responseText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const direct = (payload as Record<string, unknown>).output_text;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  const output = (payload as Record<string, unknown>).output;
  if (!Array.isArray(output)) {
    return null;
  }

  const chunks = output.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) {
      return [];
    }
    return content
      .map((part) => {
        if (!part || typeof part !== "object") {
          return null;
        }
        const text = (part as Record<string, unknown>).text;
        return typeof text === "string" ? text : null;
      })
      .filter((text): text is string => Boolean(text));
  });

  return chunks.join("\n").trim() || null;
}

async function openAiConfig(companyId: string) {
  const setting = await prisma.integrationSetting.findUnique({
    where: {
      companyId_provider: {
        companyId,
        provider: "openai"
      }
    }
  });
  const publicConfig =
    setting?.publicConfig && typeof setting.publicConfig === "object" && !Array.isArray(setting.publicConfig)
      ? (setting.publicConfig as Record<string, unknown>)
      : {};
  const secrets = decryptSecrets({
    secretCiphertext: setting?.secretCiphertext,
    secretIv: setting?.secretIv,
    secretTag: setting?.secretTag
  });
  const apiKey = process.env.OPENAI_API_KEY || secrets.apiKey;
  const model =
    process.env.OPENAI_MODEL ||
    (typeof publicConfig.model === "string" && publicConfig.model.trim() ? publicConfig.model.trim() : "gpt-5.5");

  return { apiKey, model };
}

async function businessContext(companyId: string, customerId: string | null) {
  const [products, orders, customer] = await Promise.all([
    prisma.product.findMany({
      where: { companyId, active: true, deletedAt: null, sellable: true },
      include: {
        inventoryItems: {
          where: { active: true, deletedAt: null },
          take: 5
        }
      },
      orderBy: { updatedAt: "desc" },
      take: 12
    }),
    prisma.order.findMany({
      where: { companyId, active: true, deletedAt: null },
      include: { customer: true, items: { take: 2 } },
      orderBy: { createdAt: "desc" },
      take: 8
    }),
    customerId
      ? prisma.customer.findFirst({
          where: { id: customerId, companyId, active: true, deletedAt: null }
        })
      : null
  ]);

  return {
    customer: customer
      ? {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          tags: customer.tags
        }
      : null,
    products: products.map((product) => ({
      sku: product.sku,
      name: product.name,
      category: product.categoryKey,
      attributes: product.attributes,
      inventory: product.inventoryItems.map((item) => ({
        location: item.locationKey,
        quantity: item.quantity.toString()
      }))
    })),
    recentOrders: orders.map((order) => ({
      code: order.code,
      status: order.status,
      customer: order.customer?.name ?? "Consumidor final",
      total: order.total.toString(),
      items: order.items.map((item) => ({
        description: item.description,
        quantity: item.quantity.toString()
      }))
    }))
  };
}

async function aiReply(input: {
  companyName: string;
  companyId: string;
  customerId: string | null;
  conversationId: string;
  message: string;
}) {
  const { apiKey, model } = await openAiConfig(input.companyId);

  if (!apiKey) {
    return {
      text: botDraftReply(input.message),
      metadata: { mode: "internal-draft", officialApi: false, ai: false }
    };
  }

  const [context, history] = await Promise.all([
    businessContext(input.companyId, input.customerId),
    prisma.botMessage.findMany({
      where: {
        conversationId: input.conversationId,
        companyId: input.companyId
      },
      orderBy: { createdAt: "desc" },
      take: 8
    })
  ]);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 500,
        instructions: [
          `Eres el asistente operativo de ${input.companyName}.`,
          "Responde en español claro, breve y útil.",
          "Ayuda con ventas, productos, inventario, pedidos y atención al cliente.",
          "No inventes precios, stock, políticas ni datos no incluidos en el contexto.",
          "Si falta información, pide el dato exacto o indica que debe validarlo el equipo.",
          "Este canal no usa API oficial de WhatsApp; no menciones detalles técnicos al cliente."
        ].join("\n"),
        input: [
          {
            role: "developer",
            content: `Contexto del negocio en JSON:\n${JSON.stringify(context)}`
          },
          ...history
            .slice()
            .reverse()
            .map((item) => ({
              role: item.role === "assistant" ? "assistant" : "user",
              content: item.content
            })),
          {
            role: "user",
            content: input.message
          }
        ]
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      return {
        text: botDraftReply(input.message),
        metadata: {
          mode: "internal-draft",
          officialApi: false,
          ai: false,
          openaiError: response.status
        }
      };
    }

    return {
      text: responseText(payload) ?? botDraftReply(input.message),
      metadata: {
        mode: "openai-responses",
        model,
        officialApi: false,
        ai: true
      }
    };
  } catch (error) {
    return {
      text: botDraftReply(input.message),
      metadata: {
        mode: "internal-draft",
        officialApi: false,
        ai: false,
        openaiError: error instanceof Error ? error.name : "unknown"
      }
    };
  } finally {
    clearTimeout(timeout);
  }
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

  const reply = await aiReply({
    companyName: session.company.name,
    companyId: session.company.id,
    customerId,
    conversationId: conversation.id,
    message: parsed.data.message
  });

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
        content: reply.text,
        metadata: reply.metadata
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
      officialApi: false,
      ai: reply.metadata.ai
    },
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  return NextResponse.redirect(redirectBackUrl(request, "/command/bot", { bot: "sent" }), 303);
}
