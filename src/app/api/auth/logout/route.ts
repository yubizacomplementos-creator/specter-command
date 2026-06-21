import { NextRequest, NextResponse } from "next/server";
import { sessionCookieName } from "@/server/auth";

function publicUrl(request: NextRequest, path: string) {
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

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(publicUrl(request, "/login"), 303);
  response.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/"
  });
  return response;
}
