import { AuditAction, MembershipRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { publicUrl, redirectBackUrl } from "@/server/url";

type ProductImportRow = {
  sku?: string;
  name: string;
  categoryKey: string;
  controlsStock: boolean;
  sellable: boolean;
  usableAsInput: boolean;
  requiresProduction: boolean;
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

function booleanCell(value?: string) {
  const normalized = value?.trim().toLowerCase();
  return ["1", "si", "sí", "true", "x", "yes"].includes(normalized ?? "");
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

function parseProductsCsv(csv: string) {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const first = parseCsvLine(lines[0]).map((cell) => normalizeKey(cell));
  const hasHeader = first.includes("name") || first.includes("nombre");
  const rows = hasHeader ? lines.slice(1) : lines;

  return rows
    .map(parseCsvLine)
    .map((cells): ProductImportRow | null => {
      const [sku, name, categoryKey, controlsStock, sellable, usableAsInput, requiresProduction] = cells;

      if (!name?.trim() || !categoryKey?.trim()) {
        return null;
      }

      return {
        sku: cleanOptional(sku) ?? undefined,
        name: name.trim(),
        categoryKey: normalizeKey(categoryKey),
        controlsStock: booleanCell(controlsStock),
        sellable: sellable === undefined || sellable === "" ? true : booleanCell(sellable),
        usableAsInput: booleanCell(usableAsInput),
        requiresProduction: booleanCell(requiresProduction)
      };
    })
    .filter((row): row is ProductImportRow => Boolean(row))
    .slice(0, 500);
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  if (session.role === MembershipRole.VIEWER) {
    return NextResponse.redirect(redirectBackUrl(request, "/command", { product: "forbidden" }), 303);
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
  const rows = parseProductsCsv(csv);

  if (!rows.length) {
    return NextResponse.redirect(redirectBackUrl(request, "/command", { product: "import_invalid" }), 303);
  }

  let imported = 0;

  for (const row of rows) {
    if (row.sku) {
      await prisma.product.upsert({
        where: {
          companyId_sku: {
            companyId: session.company.id,
            sku: row.sku
          }
        },
        create: {
          companyId: session.company.id,
          sku: row.sku,
          name: row.name,
          categoryKey: row.categoryKey,
          controlsStock: row.controlsStock,
          controlsCost: row.controlsStock,
          sellable: row.sellable,
          usableAsInput: row.usableAsInput,
          requiresProduction: row.requiresProduction,
          createdById: session.user.id,
          updatedById: session.user.id
        },
        update: {
          name: row.name,
          categoryKey: row.categoryKey,
          controlsStock: row.controlsStock,
          controlsCost: row.controlsStock,
          sellable: row.sellable,
          usableAsInput: row.usableAsInput,
          requiresProduction: row.requiresProduction,
          active: true,
          deletedAt: null,
          updatedById: session.user.id
        }
      });
    } else {
      await prisma.product.create({
        data: {
          companyId: session.company.id,
          name: row.name,
          categoryKey: row.categoryKey,
          controlsStock: row.controlsStock,
          controlsCost: row.controlsStock,
          sellable: row.sellable,
          usableAsInput: row.usableAsInput,
          requiresProduction: row.requiresProduction,
          createdById: session.user.id,
          updatedById: session.user.id
        }
      });
    }

    imported += 1;
  }

  await writeAuditLog({
    companyId: session.company.id,
    actorId: session.user.id,
    action: AuditAction.CREATE,
    entityType: "Product",
    entityId: session.company.id,
    after: { imported },
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  return NextResponse.redirect(redirectBackUrl(request, "/command", { product: "imported", count: imported }), 303);
}
