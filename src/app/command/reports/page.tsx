import { OrderStatus } from "@prisma/client";
import { CommandShell } from "../_components/command-shell";
import { requireSession } from "@/server/session";
import { prisma } from "@/server/db";

function money(value: { toString(): string } | number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(Number(value.toString()));
}

export default async function ReportsPage() {
  const session = await requireSession();
  const [closedSales, openSales, cancelledOrderCount, statusCounts, inventorySnapshot, recentOrders] = await Promise.all([
    prisma.order.aggregate({
      where: { companyId: session.company.id, status: OrderStatus.CLOSED, active: true, deletedAt: null },
      _sum: { total: true },
      _count: { id: true }
    }),
    prisma.order.aggregate({
      where: { companyId: session.company.id, status: OrderStatus.OPEN, active: true, deletedAt: null },
      _sum: { total: true },
      _count: { id: true }
    }),
    prisma.order.count({
      where: { companyId: session.company.id, status: OrderStatus.CANCELLED, active: true, deletedAt: null }
    }),
    prisma.order.groupBy({
      by: ["status"],
      where: { companyId: session.company.id, active: true, deletedAt: null },
      _count: { id: true }
    }),
    prisma.inventoryItem.findMany({
      where: { companyId: session.company.id, active: true, deletedAt: null },
      include: { product: true },
      take: 200
    }),
    prisma.order.findMany({
      where: { companyId: session.company.id, active: true, deletedAt: null },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      take: 8
    })
  ]);
  const statusCountMap = new Map(statusCounts.map((item) => [item.status, item._count.id]));
  const inventoryValue = inventorySnapshot.reduce((total, item) => {
    const quantity = Number(item.quantity.toString());
    const unitCost = item.unitCost ? Number(item.unitCost.toString()) : 0;
    return total + quantity * unitCost;
  }, 0);
  const lowStockItems = inventorySnapshot
    .filter((item) => Number(item.quantity.toString()) <= 5)
    .sort((a, b) => Number(a.quantity.toString()) - Number(b.quantity.toString()))
    .slice(0, 10);

  return (
    <CommandShell companyName={session.company.name} userEmail={session.user.email} role={session.role}>
      <div className="mx-auto grid max-w-6xl gap-6">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Reportes</p>
              <h1 className="text-3xl font-semibold">Pulso operativo</h1>
            </div>
            <span className="rounded-md bg-cyan-50 px-3 py-2 text-sm text-cyan-700">Tiempo real</span>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Ventas cerradas</p>
            <h2 className="mt-2 text-2xl font-semibold text-emerald-700">{money(closedSales._sum.total ?? 0)}</h2>
            <p className="mt-1 text-xs text-slate-500">{closedSales._count.id} pedidos cerrados</p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Pedidos abiertos</p>
            <h2 className="mt-2 text-2xl font-semibold text-cyan-700">{money(openSales._sum.total ?? 0)}</h2>
            <p className="mt-1 text-xs text-slate-500">{openSales._count.id} pendientes</p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Inventario valorizado</p>
            <h2 className="mt-2 text-2xl font-semibold">{money(inventoryValue)}</h2>
            <p className="mt-1 text-xs text-slate-500">{inventorySnapshot.length} existencias</p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Cancelaciones</p>
            <h2 className="mt-2 text-2xl font-semibold text-red-700">{cancelledOrderCount}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {statusCountMap.get(OrderStatus.OPEN) ?? 0} abiertos · {statusCountMap.get(OrderStatus.CLOSED) ?? 0} cerrados
            </p>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
          <article className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Stock bajo</h2>
              <span className="text-xs text-slate-500">Umbral: 5 unidades</span>
            </div>
            <div className="mt-4 grid gap-2">
              {lowStockItems.length ? lowStockItems.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
                  <span>{item.product.name}</span>
                  <span className="text-red-700">{item.quantity.toString()} en {item.locationKey}</span>
                </div>
              )) : (
                <p className="text-sm text-slate-500">Sin alertas de stock bajo.</p>
              )}
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Exportaciones CSV</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {[
                ["Clientes", "customers"],
                ["Productos", "products"],
                ["Inventario", "inventory"],
                ["Pedidos", "orders"]
              ].map(([label, type]) => (
                <a key={type} href={`/api/exports?type=${type}`} className="rounded-md border border-cyan-200 px-3 py-2 text-center text-sm text-cyan-700 hover:bg-cyan-50">
                  Descargar {label}
                </a>
              ))}
            </div>
          </article>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Pedidos recientes</h2>
          <div className="mt-4 grid gap-3">
            {recentOrders.length ? recentOrders.map((order) => (
              <article key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-4">
                <div>
                  <h3 className="font-semibold">{order.code}</h3>
                  <p className="mt-1 text-sm text-slate-500">{order.customer?.name ?? "Consumidor final"} · {order.status}</p>
                </div>
                <span className="rounded-md bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">{money(order.total)}</span>
              </article>
            )) : (
              <p className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">No hay pedidos recientes.</p>
            )}
          </div>
        </section>
      </div>
    </CommandShell>
  );
}
