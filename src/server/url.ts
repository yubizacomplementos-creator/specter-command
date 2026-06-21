import type { NextRequest } from "next/server";

export function publicUrl(request: NextRequest, path: string) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (configuredUrl) {
    return new URL(path, configuredUrl);
  }

  const protocol = request.headers.get("x-forwarded-proto") ?? "https";
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "spectercommand.com";

  return new URL(path, `${protocol}://${host}`);
}

export function redirectBackUrl(request: NextRequest, fallbackPath: string, params: Record<string, string | number>) {
  const referer = request.headers.get("referer");
  const fallback = publicUrl(request, fallbackPath);
  const target = referer ? new URL(referer) : fallback;
  const appUrl = publicUrl(request, "/");

  if (target.origin !== appUrl.origin) {
    return fallback;
  }

  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, String(value));
  }

  return target;
}
