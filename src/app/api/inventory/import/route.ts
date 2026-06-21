import { AuditAction, MembershipRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { publicUrl } from "@/server/url";

type InventoryImportRow = {
  sku: string;
  locationKey: string;
  quantity: number;
  unitCost?: number;
  reason?: string;
};

function clientIp(request: NextRequest) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  );
}

function cleanOptional(value?: string) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseInventoryCsv(csv: string) {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const first = parseCsvLine(lines[0]).map((cell) => cell.trim().toLowerCase());
  const hasHeader = first.includes("sku") || first.includes("cantidad");
  const rows = hasHeader ? lines.slice(1) : lines;

  return rows
    .map(parseCsvLine)
    .map((cells): InventoryImportRow | null => {
      const [sku, location, quantity, unitCost, reason] = cells;
      const parsedQuantity = Number(quantity);
      const parsedCost = cleanOptional(unitCost) ? Number(unitCost) : undefined;

      if (!sku?.trim() || !location?.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
        return null;
      }

      if (parsedCost !== undefined && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
        return null;
      }

      return {
        sku: sku.trim(),
        locationKey: normalizeKey(location),
        quantity: parsedQuantity,
        unitCost: parsedCost,
        reason: cleanOptional(reason) ?? undefined
      };
    })
    .filter((row): row is InventoryImportRow => Boolean(row))
    .slice(0, 500);
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  if (session.role === MembershipRole.VIEWER) {
    return NextResponse.redirect(publicUrl(request, "/command?inventory=forbidden"), 303);
  }

  const form = await request.formData();
  const csvFile = form.get("csvFile");
  const csvText = form.get("csvText");
  const csv =
    csvFile instanceof File && csvFile.size > 0
      ? await csvFile.text()
      : typeof csvText === "string"
        ? csvText
        : "";
  const rows = parseInventoryCsv(csv);

  if (!rows.length) {
    return NextResponse.redirect(publicUrl(request, "/command?inventory=import_invalid"), 303);
  }

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const product = await prisma.product.findFirst({
      where: {
        companyId: session.company.id,
        sku: row.sku,
        controlsStock: true,
        active: true,
        deletedAt: null
      }
    });

    if (!product) {
      skipped += 1;
      continue;
    }

    await prisma.inventoryItem.upsert({
      where: {
        companyId_productId_locationKey: {
          companyId: session.company.id,
          productId: product.id,
          locationKey: row.locationKey
        }
      },
      create: {
        companyId: session.company.id,
        productId: product.id,
        locationKey: row.locationKey,
        quantity: row.quantity,
        unitCost: row.unitCost ?? null,
        metadata: {
          reason: row.reason ?? "cargue-masivo",
          updatedById: session.user.id
        }
      },
      update: {
        quantity: row.quantity,
        unitCost: row.unitCost ?? null,
        metadata: {
          reason: row.reason ?? "cargue-masivo",
          updatedById: session.user.id
        }
      }
    });

    imported += 1;
  }

  await writeAuditLog({
    companyId: session.company.id,
    actorId: session.user.id,
    action: AuditAction.UPDATE,
    entityType: "InventoryItem",
    entityId: session.company.id,
    after: { imported, skipped },
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  return NextResponse.redirect(
    publicUrl(request, `/command?inventory=imported&count=${imported}`),
    303
  );
}
