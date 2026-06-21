import { AuditAction, MembershipRole, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import {
  configuredSecretKeys,
  encryptSecrets,
  integrationProviders
} from "@/server/integrations";
import { getCurrentSession } from "@/server/session";
import { publicUrl } from "@/server/url";

const providerSchema = z.enum(integrationProviders);

const fieldMap = {
  wompi: {
    public: ["environment", "publicKey"],
    secret: ["privateKey", "eventsSecret"]
  },
  openai: {
    public: ["model"],
    secret: ["apiKey"]
  },
  r2: {
    public: ["accountId", "bucket", "endpoint", "publicUrl"],
    secret: ["accessKeyId", "secretAccessKey"]
  },
  resend: {
    public: ["fromEmail"],
    secret: ["apiKey"]
  },
  sentry: {
    public: ["dsn", "org", "project"],
    secret: ["authToken"]
  },
  shopify: {
    public: ["shopDomain", "apiVersion"],
    secret: ["accessToken", "webhookSecret"]
  },
  bot: {
    public: ["name", "tone", "handoffEmail"],
    secret: ["systemPrompt"]
  }
} as const;

function clientIp(request: NextRequest) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  );
}

function readText(form: FormData, field: string) {
  const value = form.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function objectFromFields(form: FormData, fields: readonly string[]) {
  return Object.fromEntries(
    fields
      .map((field) => [field, readText(form, field)] as const)
      .filter(([, value]) => Boolean(value))
  );
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  if (session.role !== MembershipRole.OWNER && session.role !== MembershipRole.ADMIN) {
    return NextResponse.redirect(publicUrl(request, "/command?integration=forbidden"), 303);
  }

  const form = await request.formData();
  const parsedProvider = providerSchema.safeParse(form.get("provider"));

  if (!parsedProvider.success) {
    return NextResponse.redirect(publicUrl(request, "/command?integration=invalid"), 303);
  }

  const provider = parsedProvider.data;
  const fields = fieldMap[provider];
  const publicConfig = objectFromFields(form, fields.public);
  const newSecrets = objectFromFields(form, fields.secret);
  const encrypted = Object.keys(newSecrets).length ? encryptSecrets(newSecrets) : {};
  const configuredSecrets = Object.keys(newSecrets).length ? configuredSecretKeys(newSecrets) : undefined;
  const existing = await prisma.integrationSetting.findUnique({
    where: {
      companyId_provider: {
        companyId: session.company.id,
        provider
      }
    }
  });
  const existingPublicConfig =
    existing?.publicConfig && typeof existing.publicConfig === "object" && !Array.isArray(existing.publicConfig)
      ? (existing.publicConfig as Record<string, unknown>)
      : {};
  const nextPublicConfig = {
    ...existingPublicConfig,
    ...publicConfig,
    configuredSecrets: configuredSecrets ?? existingPublicConfig.configuredSecrets ?? []
  } as Prisma.InputJsonObject;

  await prisma.integrationSetting.upsert({
    where: {
      companyId_provider: {
        companyId: session.company.id,
        provider
      }
    },
    create: {
      companyId: session.company.id,
      provider,
      publicConfig: nextPublicConfig,
      ...encrypted,
      updatedById: session.user.id
    },
    update: {
      publicConfig: nextPublicConfig,
      ...encrypted,
      active: true,
      updatedById: session.user.id
    }
  });

  await writeAuditLog({
    companyId: session.company.id,
    actorId: session.user.id,
    action: AuditAction.UPDATE,
    entityType: "IntegrationSetting",
    entityId: provider,
    after: {
      provider,
      publicKeys: Object.keys(publicConfig),
      secretKeysUpdated: configuredSecrets ?? []
    },
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  return NextResponse.redirect(publicUrl(request, `/command?integration=${provider}`), 303);
}
