import { AuditAction, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { configuredSecretKeys, encryptSecrets } from "@/server/integrations";
import {
  normalizeShopDomain,
  shopifyApiVersion,
  shopifyClientId,
  verifyShopifyHmac,
  verifyShopifyState
} from "@/server/shopify-oauth";
import { publicUrl } from "@/server/url";

type TokenResponse = {
  access_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

function clientIp(request: NextRequest) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  );
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = verifyShopifyState(params.get("state"));
  const shop = normalizeShopDomain(params.get("shop") ?? "");
  const code = params.get("code");

  if (!state || !shop || !code || !verifyShopifyHmac(params)) {
    return NextResponse.redirect(publicUrl(request, "/command/settings?integration=shopify_failed"), 303);
  }

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: shopifyClientId(),
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      code
    })
  });
  const payload = (await response.json()) as TokenResponse;

  if (!response.ok || !payload.access_token) {
    return NextResponse.redirect(publicUrl(request, "/command/settings?integration=shopify_failed"), 303);
  }

  const encrypted = encryptSecrets({ accessToken: payload.access_token });
  const configuredSecrets = configuredSecretKeys({ accessToken: payload.access_token });
  const publicConfig = {
    shopDomain: shop,
    apiVersion: shopifyApiVersion(),
    scopes: payload.scope ?? "",
    connectedAt: new Date().toISOString(),
    configuredSecrets
  } satisfies Prisma.InputJsonObject;

  await prisma.integrationSetting.upsert({
    where: {
      companyId_provider: {
        companyId: state.companyId,
        provider: "shopify"
      }
    },
    create: {
      companyId: state.companyId,
      provider: "shopify",
      publicConfig,
      ...encrypted,
      updatedById: state.userId
    },
    update: {
      publicConfig,
      ...encrypted,
      active: true,
      updatedById: state.userId
    }
  });

  await writeAuditLog({
    companyId: state.companyId,
    actorId: state.userId,
    action: AuditAction.UPDATE,
    entityType: "IntegrationSetting",
    entityId: "shopify",
    after: {
      provider: "shopify",
      shopDomain: shop,
      scopes: payload.scope ?? ""
    },
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  return NextResponse.redirect(publicUrl(request, "/command/settings?integration=shopify_connected"), 303);
}
