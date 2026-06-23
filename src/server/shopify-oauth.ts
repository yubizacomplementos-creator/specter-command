import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { publicUrl } from "./url";

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

type ShopifyState = {
  companyId: string;
  userId: string;
  iat: number;
  nonce: string;
};

function secret() {
  const value = process.env.SHOPIFY_CLIENT_SECRET;

  if (!value) {
    throw new Error("SHOPIFY_CLIENT_SECRET no configurado.");
  }

  return value;
}

export function shopifyClientId() {
  const value = process.env.SHOPIFY_CLIENT_ID;

  if (!value) {
    throw new Error("SHOPIFY_CLIENT_ID no configurado.");
  }

  return value;
}

export function shopifyScopes() {
  return (
    process.env.SHOPIFY_SCOPES ||
    "read_products,write_products,read_orders,read_customers,read_inventory,read_locations,read_discounts,write_discounts"
  );
}

export function shopifyApiVersion() {
  return process.env.SHOPIFY_API_VERSION || "2026-01";
}

export function normalizeShopDomain(value: string) {
  const normalized = value
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function sign(value: string) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createShopifyState(input: { companyId: string; userId: string }) {
  const payload: ShopifyState = {
    companyId: input.companyId,
    userId: input.userId,
    iat: Date.now(),
    nonce: crypto.randomBytes(16).toString("base64url")
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");

  return `${encoded}.${sign(encoded)}`;
}

export function verifyShopifyState(value: string | null) {
  if (!value) {
    return null;
  }

  const [encoded, signature] = value.split(".");
  if (!encoded || !signature || sign(encoded) !== signature) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ShopifyState;
    if (!payload.companyId || !payload.userId || Date.now() - payload.iat > STATE_MAX_AGE_MS) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function shopifyRedirectUri(request: NextRequest) {
  return publicUrl(request, "/api/shopify/oauth/callback").toString();
}

export function verifyShopifyHmac(searchParams: URLSearchParams) {
  const hmac = searchParams.get("hmac");

  if (!hmac) {
    return false;
  }

  const message = Array.from(searchParams.entries())
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const digest = crypto.createHmac("sha256", secret()).update(message).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(hmac, "utf8"));
}
