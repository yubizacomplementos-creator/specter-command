import { AuditAction, MembershipRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { publicUrl } from "@/server/url";

type CustomerImportRow = {
  code?: string;
  name: string;
  email?: string;
  phone?: string;
  tags: string[];
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

function normalizeHeader(value: string) {
  return value.trim().toLowerCase();
}

function parseCustomersCsv(csv: string) {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const first = parseCsvLine(lines[0]).map(normalizeHeader);
  const hasHeader = first.includes("name") || first.includes("nombre");
  const rows = hasHeader ? lines.slice(1) : lines;

  return rows
    .map(parseCsvLine)
    .map((cells): CustomerImportRow | null => {
      const [code, name, email, phone, tags] = cells;

      if (!name?.trim()) {
        return null;
      }

      return {
        code: cleanOptional(code) ?? undefined,
        name: name.trim(),
        email: cleanOptional(email) ?? undefined,
        phone: cleanOptional(phone) ?? undefined,
        tags: (tags ?? "")
          .split("|")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 12)
      };
    })
    .filter((row): row is CustomerImportRow => Boolean(row))
    .slice(0, 500);
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  if (session.role === MembershipRole.VIEWER) {
    return NextResponse.redirect(publicUrl(request, "/command?customer=forbidden"), 303);
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
  const rows = parseCustomersCsv(csv);

  if (!rows.length) {
    return NextResponse.redirect(publicUrl(request, "/command?customer=import_invalid"), 303);
  }

  let imported = 0;

  for (const row of rows) {
    if (row.code) {
      await prisma.customer.upsert({
        where: {
          companyId_code: {
            companyId: session.company.id,
            code: row.code
          }
        },
        create: {
          companyId: session.company.id,
          code: row.code,
          name: row.name,
          email: row.email,
          phone: row.phone,
          tags: row.tags,
          createdById: session.user.id,
          updatedById: session.user.id
        },
        update: {
          name: row.name,
          email: row.email,
          phone: row.phone,
          tags: row.tags,
          active: true,
          deletedAt: null,
          updatedById: session.user.id
        }
      });
    } else {
      await prisma.customer.create({
        data: {
          companyId: session.company.id,
          name: row.name,
          email: row.email,
          phone: row.phone,
          tags: row.tags,
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
    entityType: "Customer",
    entityId: session.company.id,
    after: { imported },
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  return NextResponse.redirect(publicUrl(request, `/command?customer=imported&count=${imported}`), 303);
}
