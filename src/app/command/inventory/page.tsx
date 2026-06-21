import { CommandShell } from "../_components/command-shell";
import { requireSession } from "@/server/session";
import { prisma } from "@/server/db";

type InventoryPageProps = {
  searchParams?: Promise<{
    inventory?: string;
    count?: string;
    q?: string;
  }>;
};

const inventoryMessages = {
  updated: { tone: "success", text: "Inventario actualizado correctamente." },
  invalid: { tone: "error", text: "Selecciona producto, ubicacion y una cantidad valida." },
  invalid_product: { tone: "error", text: "El producto seleccionado no controla inventario o esta inactivo." },
  forbidden: { tone: "error", text: "Tu rol no permite actualizar inventario." },
  failed: { tone: "error", text: "No pudimos actualizar el inventario. Intenta de nuevo." },
  imported: { tone: "success", text: "Inventario importado correctamente." },
  import_invalid: { tone: "error", text: "El archivo CSV no tiene inventario valido para importar." }
} as const;

function money(value: { toString(): string } | number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(Number(value.toString()));
}

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const searchTerm = params?.q?.trim() ?? "";
  const message = params?.inventory
    ? inventoryMessages[params.inventory as keyof typeof inventoryMessages]
    : undefined;
  const importCount = params?.count ? Number(params.count) : undefined;
  const canManageInventory = session.role !== "VIEWER";
  const where = {
    companyId: session.company.id,
    active: true,
    deletedAt: null,
    ...(searchTerm
      ? {
          OR: [
            { locationKey: { contains: searchTerm, mode: "insensitive" as const } },
            { product: { name: { contains: searchTerm, mode: "insensitive" as const } } },
            { product: { sku: { contains: searchTerm, mode: "insensitive" as const } } }
          ]
        }
      : {})
  };
  const [inventoryItems, inventoryCount, stockProducts] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      include: { product: true },
      orderBy: { updatedAt: "desc" },
      take: 50
    }),
    prisma.inventoryItem.count({ where }),
    prisma.product.findMany({
      where: {
        companyId: session.company.id,
        active: true,
        deletedAt: null,
        controlsStock: true
      },
      orderBy: { name: "asc" },
      take: 200
    })
  ]);
  const inventoryValue = inventoryItems.reduce((total, item) => {
    const quantity = Number(item.quantity.toString());
    const unitCost = item.unitCost ? Number(item.unitCost.toString()) : 0;
    return total + quantity * unitCost;
  }, 0);

  return (
    <CommandShell companyName={session.company.name} userEmail={session.user.email} role={session.role}>
      <div className="mx-auto grid max-w-6xl gap-6">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Operaciones</p>
              <h1 className="text-3xl font-semibold">Inventario</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">{inventoryCount} existencias</span>
              <span className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{money(inventoryValue)}</span>
            </div>
          </div>

          <form method="get" className="mt-5 grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <input
              name="q"
              defaultValue={searchTerm}
              placeholder="Buscar por producto, SKU o ubicacion"
              className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600"
            />
            <button className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800">
              Buscar
            </button>
            <a href="/command/inventory" className="rounded-md border border-slate-200 px-4 py-2 text-center text-sm text-slate-600 hover:border-cyan-700 hover:text-cyan-700">
              Limpiar
            </a>
          </form>

          {message ? (
            <p className={`mt-4 rounded-md border px-3 py-2 text-sm ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
              {message.text}
              {params?.inventory === "imported" && importCount ? ` Total: ${importCount}.` : ""}
            </p>
          ) : null}
        </section>

        {canManageInventory ? (
          <section className="grid gap-4 lg:grid-cols-2">
            <form action="/api/inventory" method="post" className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold">Ajustar inventario</h2>
              <div className="mt-4 grid gap-3">
                <select name="productId" required className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600">
                  <option value="">Seleccionar producto</option>
                  {stockProducts.map((product) => (
                    <option key={product.id} value={product.id}>{product.name}</option>
                  ))}
                </select>
                <input name="locationKey" required minLength={2} defaultValue="principal" placeholder="Ubicacion" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
                <input name="quantity" type="number" min="0" step="0.01" required placeholder="Cantidad disponible" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
                <input name="unitCost" type="number" min="0" step="1" placeholder="Costo unitario opcional" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
                <input name="reason" maxLength={160} placeholder="Motivo: compra, conteo, ajuste" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
                <button className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800">
                  Actualizar inventario
                </button>
              </div>
            </form>

            <form action="/api/inventory/import" method="post" encType="multipart/form-data" className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold">Cargue masivo CSV</h2>
              <p className="mt-1 text-sm text-slate-500">Columnas: sku,ubicacion,cantidad,costoUnitario,motivo.</p>
              <div className="mt-4 grid gap-3">
                <input name="csvFile" type="file" accept=".csv,text/csv" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
                <textarea name="csvText" rows={5} placeholder={'sku,ubicacion,cantidad,costoUnitario,motivo\nSKU-001,principal,25,42000,compra inicial'} className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-600" />
                <button className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800">
                  Importar inventario
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Existencias</h2>
          <div className="mt-4 grid gap-3">
            {inventoryItems.length ? inventoryItems.map((item) => (
              <article key={item.id} className="rounded-md border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{item.product.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{item.product.sku ?? "Sin SKU"} · {item.locationKey}</p>
                  </div>
                  <span className="rounded-md bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                    {item.quantity.toString()} unidades
                  </span>
                </div>
                {item.unitCost ? (
                  <p className="mt-3 text-sm text-slate-500">
                    Costo unitario {money(item.unitCost)}
                  </p>
                ) : null}
              </article>
            )) : (
              <p className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                No hay existencias para mostrar.
              </p>
            )}
          </div>
        </section>
      </div>
    </CommandShell>
  );
}
