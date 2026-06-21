import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "specter-command",
    architecture: {
      multiTenant: true,
      modular: true,
      configurable: true,
      softDelete: true,
      auditReady: true
    }
  });
}
