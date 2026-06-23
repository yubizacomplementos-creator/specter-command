import { MembershipRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import {
  createShopifyState,
  normalizeShopDomain,
  shopifyClientId,
  shopifyRedirectUri,
  shopifyScopes
} from "@/server/shopify-oauth";
import { getCurrentSession } from "@/server/session";
import { publicUrl } from "@/server/url";

function configValue(config: unknown, key: string) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return "";
  }

  const value = (config as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  if (session.role !== MembershipRole.OWNER && session.role !== MembershipRole.ADMIN) {
    return NextResponse.redirect(publicUrl(request, "/command/settings?integration=forbidden"), 303);
  }

  const setting = await prisma.integrationSetting.findUnique({
    where: {
      companyId_provider: {
        companyId: session.company.id,
        provider: "shopify"
      }
    }
  });
  const requestedShop = request.nextUrl.searchParams.get("shop") || configValue(setting?.publicConfig, "shopDomain");
  const shop = normalizeShopDomain(requestedShop);

  if (!shop) {
    return NextResponse.redirect(publicUrl(request, "/command/settings?integration=shopify_missing"), 303);
  }

  const target = new URL(`https://${shop}/admin/oauth/authorize`);
  target.searchParams.set("client_id", shopifyClientId());
  target.searchParams.set("scope", shopifyScopes());
  target.searchParams.set("redirect_uri", shopifyRedirectUri(request));
  target.searchParams.set(
    "state",
    createShopifyState({
      companyId: session.company.id,
      userId: session.user.id
    })
  );

  return NextResponse.redirect(target, 303);
}
