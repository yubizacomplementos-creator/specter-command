import { NextResponse } from "next/server";

export async function GET() {
  if (process.env.SENTRY_TEST_ENABLED !== "true") {
    return NextResponse.json({ ok: false, error: "Sentry test disabled" }, { status: 404 });
  }

  throw new Error("Specter Command Sentry test error");
}
