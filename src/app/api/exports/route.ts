import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { publicUrl } from "@/server/url";

const exportTypes = ["customers", "products", "inventory", "orders"] as const;
type ExportType = (typeof exportTypes)[number];

function clientIp(request: NextRequest) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  );
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function csv(rows: Array<Array<unknown>>) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvResponse(type: ExportType, content: string) {
  return new NextResponse(`\uFEFF${content}\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="specter-${type}-${new Date().toISOString().slice(0, 10)}.csv"`
    }
  });
}

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  const type = request.nextUrl.searchParams.get("type") as ExportType | null;

  if (!type || !exportTypes.includes(type)) {
    return NextResponse.redirect(publicUrl(request, "/command"), 303);
  }

  let rows: Array<Array<unknown>>;

  if (type === "customers") {
    const customers = await prisma.customer.findMany({
      where: { companyId: session.company.id, active: true, deletedAt: null },
      orderBy: { createdAt: "desc" }
    });
    rows = [
      ["codigo", "nombre", "correo", "telefono", "etiquetas", "creado"],
      ...customers.map((customer) => [
        customer.code,
        customer.name,
        customer.email,
        customer.phone,
        customer.tags.join("|"),
        customer.createdAt.toISOString()
      ])
    ];
  } else if (type === "products") {
    const products = await prisma.product.findMany({
      where: { companyId: session.company.id, active: true, deletedAt: null },
      orderBy: { createdAt: "desc" }
    });
    rows = [
      ["sku", "nombre", "categoria", "controlaInventario", "vendible", "insumo", "produccion"],
      ...products.map((product) => [
        product.sku,
        product.name,
        product.categoryKey,
        product.controlsStock ? "si" : "no",
        product.sellable ? "si" : "no",
        product.usableAsInput ? "si" : "no",
        product.requiresProduction ? "si" : "no"
      ])
    ];
  } else if (type === "inventory") {
    const inventory = await prisma.inventoryItem.findMany({
      where: { companyId: session.company.id, active: true, deletedAt: null },
      include: { product: true },
      orderBy: { updatedAt: "desc" }
    });
    rows = [
      ["sku", "producto", "ubicacion", "cantidad", "costoUnitario", "valorInventario", "actualizado"],
      ...inventory.map((item) => {
        const quantity = Number(item.quantity.toString());
        const unitCost = item.unitCost ? Number(item.unitCost.toString()) : 0;
        return [
          item.product.sku,
          item.product.name,
          item.locationKey,
          item.quantity.toString(),
          item.unitCost?.toString() ?? "",
          quantity * unitCost,
          item.updatedAt.toISOString()
        ];
      })
    ];
  } else {
    const orders = await prisma.order.findMany({
      where: { companyId: session.company.id, active: true, deletedAt: null },
      include: {
        customer: true,
        items: {
          take: 1,
          include: { product: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    rows = [
      ["codigo", "estado", "cliente", "producto", "subtotal", "descuento", "impuesto", "total", "creado"],
      ...orders.map((order) => [
        order.code,
        order.status,
        order.customer?.name ?? "Consumidor final",
        order.items[0]?.product?.name ?? order.items[0]?.description ?? "",
        order.subtotal.toString(),
        order.discount.toString(),
        order.tax.toString(),
        order.total.toString(),
        order.createdAt.toISOString()
      ])
    ];
  }

  await writeAuditLog({
    companyId: session.company.id,
    actorId: session.user.id,
    action: AuditAction.EXPORT,
    entityType: type,
    entityId: session.company.id,
    after: { rows: Math.max(rows.length - 1, 0) },
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  return csvResponse(type, csv(rows));
}
