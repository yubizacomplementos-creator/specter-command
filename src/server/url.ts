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
