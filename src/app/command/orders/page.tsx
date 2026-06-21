import { OrderStatus } from "@prisma/client";
import { CommandShell } from "../_components/command-shell";
import { requireSession } from "@/server/session";
import { prisma } from "@/server/db";

type OrdersPageProps = {
  searchParams?: Promise<{
    order?: string;
    count?: string;
    q?: string;
    orderStatus?: string;
  }>;
};

const orderMessages = {
  created: { tone: "success", text: "Pedido registrado correctamente." },
  invalid: { tone: "error", text: "Selecciona producto y revisa cantidad, precio, descuento e impuesto." },
  invalid_product: { tone: "error", text: "El producto seleccionado no esta disponible para venta." },
  invalid_customer: { tone: "error", text: "El cliente seleccionado no existe o esta inactivo." },
  insufficient_stock: { tone: "error", text: "No hay stock suficiente en la ubicacion principal para ese producto." },
  closed: { tone: "success", text: "Pedido cerrado correctamente." },
  cancelled: { tone: "success", text: "Pedido cancelado correctamente. Si descontaba inventario, el stock fue devuelto." },
  invalid_status: { tone: "error", text: "Solo puedes cerrar o cancelar pedidos abiertos." },
  status_failed: { tone: "error", text: "No pudimos cambiar el estado del pedido." },
  forbidden: { tone: "error", text: "Tu rol no permite registrar pedidos." },
  failed: { tone: "error", text: "No pudimos registrar el pedido. Intenta de nuevo." },
  shopify_synced: { tone: "success", text: "Pedidos sincronizados desde Shopify." },
  shopify_missing: { tone: "error", text: "Configura dominio y token de Shopify en Integraciones antes de sincronizar pedidos." },
  shopify_failed: { tone: "error", text: "Shopify no respondio correctamente. Revisa permisos read_orders/read_customers." }
} as const;

function money(value: { toString(): string } | number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(Number(value.toString()));
}

function metadataValue(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : null;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const searchTerm = params?.q?.trim() ?? "";
  const statusParam = params?.orderStatus?.trim() ?? "";
  const validStatus = Object.values(OrderStatus).includes(statusParam as OrderStatus)
    ? (statusParam as OrderStatus)
    : undefined;
  const message = params?.order ? orderMessages[params.order as keyof typeof orderMessages] : undefined;
  const syncCount = params?.count ? Number(params.count) : undefined;
  const canManageOrders = session.role !== "VIEWER";

  const orderWhere = {
    companyId: session.company.id,
    active: true,
    deletedAt: null,
    ...(validStatus ? { status: validStatus } : {}),
    ...(searchTerm
      ? {
          OR: [
            { code: { contains: searchTerm, mode: "insensitive" as const } },
            { customer: { name: { contains: searchTerm, mode: "insensitive" as const } } }
          ]
        }
      : {})
  };

  const [orders, orderCount, customers, products] = await Promise.all([
    prisma.order.findMany({
      where: orderWhere,
      include: {
        customer: true,
        items: {
          take: 1,
          include: { product: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    prisma.order.count({ where: orderWhere }),
    prisma.customer.findMany({
      where: { companyId: session.company.id, active: true, deletedAt: null },
      orderBy: { name: "asc" },
      take: 200
    }),
    prisma.product.findMany({
      where: { companyId: session.company.id, active: true, deletedAt: null, sellable: true },
      orderBy: { name: "asc" },
      take: 200
    })
  ]);

  return (
    <CommandShell companyName={session.company.name} userEmail={session.user.email} role={session.role}>
      <div className="mx-auto grid max-w-6xl gap-6">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Ventas</p>
              <h1 className="text-3xl font-semibold">Pedidos</h1>
            </div>
            <span className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
              {orderCount} registrados
            </span>
          </div>

          <form method="get" className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_auto_auto]">
            <input
              name="q"
              defaultValue={searchTerm}
              placeholder="Buscar por codigo o cliente"
              className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600"
            />
            <select
              name="orderStatus"
              defaultValue={validStatus ?? ""}
              className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600"
            >
              <option value="">Todos</option>
              <option value={OrderStatus.OPEN}>Abiertos</option>
              <option value={OrderStatus.CLOSED}>Cerrados</option>
              <option value={OrderStatus.CANCELLED}>Cancelados</option>
              <option value={OrderStatus.DRAFT}>Borradores</option>
            </select>
            <button className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800">
              Filtrar
            </button>
            <a href="/command/orders" className="rounded-md border border-slate-200 px-4 py-2 text-center text-sm text-slate-600 hover:border-cyan-700 hover:text-cyan-700">
              Limpiar
            </a>
          </form>

          {message ? (
            <p className={`mt-4 rounded-md border px-3 py-2 text-sm ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
              {message.text}
              {params?.order === "shopify_synced" && syncCount !== undefined ? ` Total: ${syncCount}.` : ""}
            </p>
          ) : null}
        </section>

        {canManageOrders ? (
          <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold">Registrar pedido</h2>
              <form action="/api/orders" method="post" className="mt-4 grid gap-3 md:grid-cols-2">
                <select name="customerId" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600">
                  <option value="">Consumidor final</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </select>
                <select name="productId" required className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600">
                  <option value="">Seleccionar producto</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>{product.name}</option>
                  ))}
                </select>
                <input name="quantity" type="number" min="0.01" step="0.01" defaultValue="1" required placeholder="Cantidad" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
                <input name="unitPrice" type="number" min="0" step="1" required placeholder="Precio unitario" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
                <input name="couponCode" maxLength={60} placeholder="Cupon" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
                <input name="discount" type="number" min="0" step="1" defaultValue="0" placeholder="Descuento" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
                <input name="tax" type="number" min="0" step="1" defaultValue="0" placeholder="Impuesto" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
                <button className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 md:w-fit">
                  Crear pedido
                </button>
              </form>
            </div>

            <form action="/api/shopify/orders/sync" method="post" className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold">Shopify</h2>
              <p className="mt-1 text-sm text-slate-500">
                Importa los pedidos recientes de Shopify sin duplicarlos. No descuenta inventario automaticamente.
              </p>
              <button className="mt-4 rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800">
                Sincronizar pedidos
              </button>
            </form>
          </section>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Listado</h2>
          <div className="mt-4 grid gap-3">
            {orders.length ? orders.map((order) => {
              const coupon = metadataValue(order.metadata, "couponCode");
              const stockLocation = metadataValue(order.metadata, "inventoryLocation");
              return (
                <article key={order.id} className="rounded-md border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{order.code}</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {order.customer?.name ?? "Consumidor final"} · {order.items[0]?.product?.name ?? order.items[0]?.description ?? "Sin items"}
                      </p>
                    </div>
                    <span className="rounded-md bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                      {money(order.total)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">{order.status}</span>
                    {Number(order.discount.toString()) > 0 ? <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">Descuento {money(order.discount)}</span> : null}
                    {coupon ? <span className="rounded-md bg-cyan-50 px-2 py-1 text-cyan-700">Cupon {coupon}</span> : null}
                    {stockLocation ? <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">Stock {stockLocation}</span> : null}
                  </div>
                  {canManageOrders && order.status === OrderStatus.OPEN ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <form action="/api/orders/status" method="post">
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="status" value={OrderStatus.CLOSED} />
                        <button className="rounded-md border border-emerald-200 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50">Cerrar pedido</button>
                      </form>
                      <form action="/api/orders/status" method="post">
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="status" value={OrderStatus.CANCELLED} />
                        <button className="rounded-md border border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50">Cancelar y devolver stock</button>
                      </form>
                    </div>
                  ) : null}
                </article>
              );
            }) : (
              <p className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                No hay pedidos para mostrar.
              </p>
            )}
          </div>
        </section>
      </div>
    </CommandShell>
  );
}
