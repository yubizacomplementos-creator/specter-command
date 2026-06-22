import { AuditAction, MembershipRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { publicUrl, redirectBackUrl } from "@/server/url";

const optionalText = (max = 2000) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
    z.string().max(max).optional()
  );

const botSettingsSchema = z.object({
  botName: optionalText(80),
  businessName: optionalText(120),
  tone: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : "amable"),
    z.string().max(40)
  ),
  welcomeMessage: optionalText(500),
  fallbackMessage: optionalText(500),
  humanHandoffText: optionalText(500),
  instructions: optionalText(3000),
  businessHours: optionalText(500),
  autoReplyEnabled: z.preprocess((value) => value === "on", z.boolean()),
  collectLeadData: z.preprocess((value) => value === "on", z.boolean())
});

function clientIp(request: NextRequest) {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
}

function businessHoursJson(value?: string) {
  if (!value) {
    return {};
  }

  return {
    description: value
  };
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  if (session.role !== MembershipRole.OWNER && session.role !== MembershipRole.ADMIN) {
    return NextResponse.redirect(redirectBackUrl(request, "/command/bot", { bot: "forbidden" }), 303);
  }

  const form = await request.formData();
  const parsed = botSettingsSchema.safeParse({
    botName: form.get("botName"),
    businessName: form.get("businessName"),
    tone: form.get("tone"),
    welcomeMessage: form.get("welcomeMessage"),
    fallbackMessage: form.get("fallbackMessage"),
    humanHandoffText: form.get("humanHandoffText"),
    instructions: form.get("instructions"),
    businessHours: form.get("businessHours"),
    autoReplyEnabled: form.get("autoReplyEnabled"),
    collectLeadData: form.get("collectLeadData")
  });

  if (!parsed.success) {
    return NextResponse.redirect(redirectBackUrl(request, "/command/bot", { bot: "settings_invalid" }), 303);
  }

  const setting = await prisma.botSetting.upsert({
    where: { companyId: session.company.id },
    create: {
      companyId: session.company.id,
      botName: parsed.data.botName ?? "Specter Bot",
      businessName: parsed.data.businessName ?? session.company.name,
      tone: parsed.data.tone,
      welcomeMessage: parsed.data.welcomeMessage,
      fallbackMessage: parsed.data.fallbackMessage,
      humanHandoffText: parsed.data.humanHandoffText,
      businessHours: businessHoursJson(parsed.data.businessHours),
      autoReplyEnabled: parsed.data.autoReplyEnabled,
      collectLeadData: parsed.data.collectLeadData,
      instructions: parsed.data.instructions,
      updatedById: session.user.id
    },
    update: {
      botName: parsed.data.botName ?? "Specter Bot",
      businessName: parsed.data.businessName ?? session.company.name,
      tone: parsed.data.tone,
      welcomeMessage: parsed.data.welcomeMessage,
      fallbackMessage: parsed.data.fallbackMessage,
      humanHandoffText: parsed.data.humanHandoffText,
      businessHours: businessHoursJson(parsed.data.businessHours),
      autoReplyEnabled: parsed.data.autoReplyEnabled,
      collectLeadData: parsed.data.collectLeadData,
      instructions: parsed.data.instructions,
      updatedById: session.user.id
    }
  });

  await writeAuditLog({
    companyId: session.company.id,
    actorId: session.user.id,
    action: AuditAction.UPDATE,
    entityType: "BotSetting",
    entityId: setting.id,
    after: {
      botName: setting.botName,
      businessName: setting.businessName,
      tone: setting.tone,
      autoReplyEnabled: setting.autoReplyEnabled
    },
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  return NextResponse.redirect(redirectBackUrl(request, "/command/bot", { bot: "settings_saved" }), 303);
}
