import { commandModules } from "@/lib/modules";
import { requireSession } from "@/server/session";
import { prisma } from "@/server/db";

type CommandPageProps = {
  searchParams?: Promise<{
    password?: string;
    user?: string;
    customer?: string;
    product?: string;
    order?: string;
    inventory?: string;
    count?: string;
  }>;
};

const passwordMessages = {
  updated: {
    tone: "success",
    text: "Contrasena actualizada correctamente."
  },
  invalid: {
    tone: "error",
    text: "La nueva contrasena debe tener minimo 12 caracteres, coincidir en ambos campos y ser distinta a la actual."
  },
  credentials: {
    tone: "error",
    text: "La contrasena actual no coincide."
  }
} as const;

const userMessages = {
  invited: {
    tone: "success",
    text: "Usuario invitado correctamente. Le enviamos un enlace para crear su contrasena."
  },
  invalid: {
    tone: "error",
    text: "Completa nombre, correo valido y rol."
  },
  forbidden: {
    tone: "error",
    text: "Tu rol no permite invitar usuarios."
  },
  email_unconfigured: {
    tone: "error",
    text: "El envio de correo no esta configurado."
  },
  email_failed: {
    tone: "error",
    text: "No pudimos enviar la invitacion. Revisa Resend o intenta de nuevo."
  }
} as const;

const customerMessages = {
  created: {
    tone: "success",
    text: "Cliente registrado correctamente."
  },
  invalid: {
    tone: "error",
    text: "Completa el nombre y revisa que el correo sea valido."
  },
  forbidden: {
    tone: "error",
    text: "Tu rol no permite registrar clientes."
  },
  duplicate: {
    tone: "error",
    text: "No pudimos registrar el cliente. Revisa si el codigo ya existe."
  },
  imported: {
    tone: "success",
    text: "Clientes importados correctamente."
  },
  import_invalid: {
    tone: "error",
    text: "El archivo CSV no tiene clientes validos para importar."
  }
} as const;

const productMessages = {
  created: {
    tone: "success",
    text: "Producto registrado correctamente."
  },
  invalid: {
    tone: "error",
    text: "Completa nombre y categoria."
  },
  forbidden: {
    tone: "error",
    text: "Tu rol no permite registrar productos."
  },
  duplicate: {
    tone: "error",
    text: "No pudimos registrar el producto. Revisa si el SKU ya existe."
  },
  imported: {
    tone: "success",
    text: "Productos importados correctamente."
  },
  import_invalid: {
    tone: "error",
    text: "El archivo CSV no tiene productos validos para importar."
  }
} as const;

const orderMessages = {
  created: {
    tone: "success",
    text: "Pedido registrado correctamente."
  },
  invalid: {
    tone: "error",
    text: "Selecciona un producto y revisa cantidad, precio, descuento e impuesto."
  },
  invalid_product: {
    tone: "error",
    text: "El producto seleccionado no esta disponible para venta."
  },
  invalid_customer: {
    tone: "error",
    text: "El cliente seleccionado no existe o esta inactivo."
  },
  insufficient_stock: {
    tone: "error",
    text: "No hay stock suficiente en la ubicacion principal para ese producto."
  },
  forbidden: {
    tone: "error",
    text: "Tu rol no permite registrar pedidos."
  },
  failed: {
    tone: "error",
    text: "No pudimos registrar el pedido. Intenta de nuevo."
  }
} as const;

const inventoryMessages = {
  updated: {
    tone: "success",
    text: "Inventario actualizado correctamente."
  },
  invalid: {
    tone: "error",
    text: "Selecciona producto, ubicacion y una cantidad valida."
  },
  invalid_product: {
    tone: "error",
    text: "El producto seleccionado no controla inventario o esta inactivo."
  },
  forbidden: {
    tone: "error",
    text: "Tu rol no permite actualizar inventario."
  },
  failed: {
    tone: "error",
    text: "No pudimos actualizar el inventario. Intenta de nuevo."
  },
  imported: {
    tone: "success",
    text: "Inventario importado correctamente."
  },
  import_invalid: {
    tone: "error",
    text: "El archivo CSV no tiene inventario valido para importar."
  }
} as const;

function money(value: { toString(): string } | number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(Number(value.toString()));
}

function couponFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || !("couponCode" in metadata)) {
    return null;
  }

  const couponCode = (metadata as { couponCode?: unknown }).couponCode;
  return typeof couponCode === "string" && couponCode ? couponCode : null;
}

function inventoryLocationFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || !("inventoryLocation" in metadata)) {
    return null;
  }

  const inventoryLocation = (metadata as { inventoryLocation?: unknown }).inventoryLocation;
  return typeof inventoryLocation === "string" && inventoryLocation ? inventoryLocation : null;
}

export default async function CommandPage({ searchParams }: CommandPageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const passwordMessage = params?.password
    ? passwordMessages[params.password as keyof typeof passwordMessages]
    : undefined;
  const userMessage = params?.user
    ? userMessages[params.user as keyof typeof userMessages]
    : undefined;
  const canManageUsers = session.role === "OWNER" || session.role === "ADMIN";
  const customerMessage = params?.customer
    ? customerMessages[params.customer as keyof typeof customerMessages]
    : undefined;
  const importCount = params?.count ? Number(params.count) : undefined;
  const canManageCustomers = session.role !== "VIEWER";
  const productMessage = params?.product
    ? productMessages[params.product as keyof typeof productMessages]
    : undefined;
  const canManageProducts = session.role !== "VIEWER";
  const orderMessage = params?.order
    ? orderMessages[params.order as keyof typeof orderMessages]
    : undefined;
  const canManageOrders = session.role !== "VIEWER";
  const inventoryMessage = params?.inventory
    ? inventoryMessages[params.inventory as keyof typeof inventoryMessages]
    : undefined;
  const canManageInventory = session.role !== "VIEWER";
  const enabledModules = await prisma.companyModule.findMany({
    where: { companyId: session.company.id },
    include: { module: true },
    orderBy: { module: { name: "asc" } }
  });
  const memberships = await prisma.membership.findMany({
    where: {
      companyId: session.company.id,
      active: true,
      deletedAt: null
    },
    include: { user: true },
    orderBy: { createdAt: "asc" }
  });
  const [customers, customerCount] = await Promise.all([
    prisma.customer.findMany({
      where: {
        companyId: session.company.id,
        active: true,
        deletedAt: null
      },
      orderBy: { createdAt: "desc" },
      take: 8
    }),
    prisma.customer.count({
      where: {
        companyId: session.company.id,
        active: true,
        deletedAt: null
      }
    })
  ]);
  const [products, productCount] = await Promise.all([
    prisma.product.findMany({
      where: {
        companyId: session.company.id,
        active: true,
        deletedAt: null
      },
      orderBy: { createdAt: "desc" },
      take: 8
    }),
    prisma.product.count({
      where: {
        companyId: session.company.id,
        active: true,
        deletedAt: null
      }
    })
  ]);
  const sellableProducts = products.filter((product) => product.sellable);
  const stockProducts = products.filter((product) => product.controlsStock);
  const [orders, orderCount] = await Promise.all([
    prisma.order.findMany({
      where: {
        companyId: session.company.id,
        active: true,
        deletedAt: null
      },
      include: {
        customer: true,
        items: {
          take: 1,
          include: { product: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 8
    }),
    prisma.order.count({
      where: {
        companyId: session.company.id,
        active: true,
        deletedAt: null
      }
    })
  ]);
  const [inventoryItems, inventoryCount] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: {
        companyId: session.company.id,
        active: true,
        deletedAt: null
      },
      include: { product: true },
      orderBy: { updatedAt: "desc" },
      take: 8
    }),
    prisma.inventoryItem.count({
      where: {
        companyId: session.company.id,
        active: true,
        deletedAt: null
      }
    })
  ]);

  const moduleState = new Map(enabledModules.map((item) => [item.module.key, item.enabled]));

  return (
    <main className="min-h-screen bg-command-ink text-white">
      <header className="border-b border-white/10 bg-command-panel">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-command-cyan">Specter Command</p>
            <h1 className="mt-1 text-2xl font-semibold">{session.company.name}</h1>
            <p className="mt-1 text-sm text-slate-400">{session.user.email} · {session.role}</p>
          </div>
          <form action="/api/auth/logout" method="post">
            <button className="rounded border border-white/15 px-4 py-2 text-sm text-slate-200 hover:border-command-cyan hover:text-command-cyan">
              Salir
            </button>
          </form>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[0.8fr_1.2fr]">
        <aside className="rounded border border-white/10 bg-white/[0.035] p-5">
          <h2 className="text-lg font-semibold">Estado empresarial</h2>
          <div className="mt-5 grid gap-3">
            {[
              ["Empresa", session.company.slug],
              ["Dominio", session.company.domain ?? "Sin dominio"],
              ["White label", session.company.logoUrl ? "Personalizado" : "Base"],
              ["Sesion", "JWT seguro"]
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between border-b border-white/10 pb-3 text-sm">
                <span className="text-slate-400">{label}</span>
                <strong className="text-right text-white">{value}</strong>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-white/10 pt-5">
            <h2 className="text-lg font-semibold">Seguridad</h2>
            {passwordMessage ? (
              <p
                className={`mt-3 rounded border px-3 py-2 text-sm ${
                  passwordMessage.tone === "success"
                    ? "border-command-green/40 bg-command-green/10 text-command-green"
                    : "border-red-400/40 bg-red-400/10 text-red-200"
                }`}
              >
                {passwordMessage.text}
              </p>
            ) : null}
            <form action="/api/account/password" method="post" className="mt-4 grid gap-3">
              <label className="grid gap-2 text-sm text-slate-300">
                Contrasena actual
                <input
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                Nueva contrasena
                <input
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                Confirmar contrasena
                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                />
              </label>
              <button className="rounded bg-command-cyan px-4 py-2 text-sm font-semibold text-command-ink hover:bg-white">
                Actualizar contrasena
              </button>
            </form>
          </div>
        </aside>

        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-slate-400">Centro operativo</p>
              <h2 className="text-2xl font-semibold">Modulos configurables</h2>
            </div>
            <span className="rounded border border-command-green/40 bg-command-green/10 px-3 py-1 text-sm text-command-green">
              Multiempresa activo
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {commandModules.map((module) => {
              const enabled = moduleState.get(module.key) ?? module.status === "active";
              return (
                <article key={module.key} className="rounded border border-white/10 bg-white/[0.035] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{module.name}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{module.description}</p>
                    </div>
                    <span className={`rounded border px-2 py-1 text-xs ${enabled ? "border-command-green/40 bg-command-green/10 text-command-green" : "border-white/15 bg-white/5 text-slate-400"}`}>
                      {enabled ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-8 border-t border-white/10 pt-6">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-sm text-slate-400">Comercial</p>
                <h2 className="text-2xl font-semibold">Clientes</h2>
              </div>
              <span className="rounded border border-white/15 bg-white/5 px-3 py-1 text-sm text-slate-300">
                {customerCount} registrados
              </span>
            </div>

            {customerMessage ? (
              <p
                className={`mb-4 rounded border px-3 py-2 text-sm ${
                  customerMessage.tone === "success"
                    ? "border-command-green/40 bg-command-green/10 text-command-green"
                    : "border-red-400/40 bg-red-400/10 text-red-200"
                }`}
              >
                {customerMessage.text}
                {params?.customer === "imported" && importCount ? ` Total: ${importCount}.` : ""}
              </p>
            ) : null}

            {canManageCustomers ? (
              <div className="mb-4 grid gap-4">
                <form action="/api/customers" method="post" className="grid gap-3 rounded border border-white/10 bg-white/[0.035] p-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm text-slate-300">
                    Nombre del cliente
                    <input
                      name="name"
                      required
                      minLength={2}
                      className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    Codigo interno
                    <input
                      name="code"
                      maxLength={40}
                      placeholder="Opcional"
                      className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    Correo
                    <input
                      name="email"
                      type="email"
                      className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    Telefono
                    <input
                      name="phone"
                      maxLength={40}
                      className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
                    Etiquetas
                    <input
                      name="tags"
                      maxLength={240}
                      placeholder="mayorista, frecuente, credito"
                      className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                    />
                  </label>
                  <button className="rounded bg-command-cyan px-4 py-2 text-sm font-semibold text-command-ink hover:bg-white md:w-fit">
                    Registrar cliente
                  </button>
                </form>

                <form action="/api/customers/import" method="post" encType="multipart/form-data" className="grid gap-3 rounded border border-white/10 bg-white/[0.035] p-4">
                  <div>
                    <h3 className="font-semibold">Cargue masivo de clientes</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      Columnas: codigo,nombre,correo,telefono,etiquetas. Separa etiquetas con |.
                    </p>
                  </div>
                  <input
                    name="csvFile"
                    type="file"
                    accept=".csv,text/csv"
                    className="rounded border border-white/10 bg-command-ink px-3 py-2 text-sm text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-command-cyan file:px-3 file:py-1 file:text-command-ink"
                  />
                  <textarea
                    name="csvText"
                    rows={4}
                    placeholder={'codigo,nombre,correo,telefono,etiquetas\nCLI-001,Cliente prueba,cliente@correo.com,3001234567,mayorista|frecuente'}
                    className="rounded border border-white/10 bg-command-ink px-3 py-2 text-sm text-white outline-none focus:border-command-cyan"
                  />
                  <button className="rounded bg-command-cyan px-4 py-2 text-sm font-semibold text-command-ink hover:bg-white md:w-fit">
                    Importar clientes
                  </button>
                </form>
              </div>
            ) : null}

            {customers.length ? (
              <div className="grid gap-3">
                {customers.map((customer) => (
                  <article key={customer.id} className="rounded border border-white/10 bg-white/[0.035] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{customer.name}</h3>
                        <p className="mt-1 text-sm text-slate-400">
                          {[customer.email, customer.phone].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                        </p>
                      </div>
                      {customer.code ? (
                        <span className="rounded border border-command-cyan/30 bg-command-cyan/10 px-3 py-1 text-xs text-command-cyan">
                          {customer.code}
                        </span>
                      ) : null}
                    </div>
                    {customer.tags.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {customer.tags.map((tag) => (
                          <span key={tag} className="rounded bg-white/10 px-2 py-1 text-xs text-slate-300">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded border border-dashed border-white/15 p-4 text-sm text-slate-400">
                Aun no hay clientes registrados.
              </p>
            )}
          </div>

          <div className="mt-8 border-t border-white/10 pt-6">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-sm text-slate-400">Operaciones</p>
                <h2 className="text-2xl font-semibold">Inventario</h2>
              </div>
              <span className="rounded border border-white/15 bg-white/5 px-3 py-1 text-sm text-slate-300">
                {inventoryCount} existencias
              </span>
            </div>

            {inventoryMessage ? (
              <p
                className={`mb-4 rounded border px-3 py-2 text-sm ${
                  inventoryMessage.tone === "success"
                    ? "border-command-green/40 bg-command-green/10 text-command-green"
                    : "border-red-400/40 bg-red-400/10 text-red-200"
                }`}
              >
                {inventoryMessage.text}
                {params?.inventory === "imported" && importCount ? ` Total: ${importCount}.` : ""}
              </p>
            ) : null}

            {canManageInventory ? (
              <div className="mb-4 grid gap-4">
                <form action="/api/inventory" method="post" className="grid gap-3 rounded border border-white/10 bg-white/[0.035] p-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm text-slate-300">
                    Producto con stock
                    <select
                      name="productId"
                      required
                      className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                    >
                      <option value="">Seleccionar producto</option>
                      {stockProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    Ubicacion
                    <input
                      name="locationKey"
                      required
                      minLength={2}
                      defaultValue="principal"
                      className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    Cantidad disponible
                    <input
                      name="quantity"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    Costo unitario
                    <input
                      name="unitCost"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Opcional"
                      className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
                    Motivo
                    <input
                      name="reason"
                      maxLength={160}
                      placeholder="conteo inicial, compra, ajuste"
                      className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                    />
                  </label>
                  <button className="rounded bg-command-cyan px-4 py-2 text-sm font-semibold text-command-ink hover:bg-white md:w-fit">
                    Actualizar inventario
                  </button>
                </form>

                <form action="/api/inventory/import" method="post" encType="multipart/form-data" className="grid gap-3 rounded border border-white/10 bg-white/[0.035] p-4">
                  <div>
                    <h3 className="font-semibold">Cargue masivo de inventario</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      Columnas: sku,ubicacion,cantidad,costoUnitario,motivo. El SKU debe existir y controlar inventario.
                    </p>
                  </div>
                  <input
                    name="csvFile"
                    type="file"
                    accept=".csv,text/csv"
                    className="rounded border border-white/10 bg-command-ink px-3 py-2 text-sm text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-command-cyan file:px-3 file:py-1 file:text-command-ink"
                  />
                  <textarea
                    name="csvText"
                    rows={4}
                    placeholder={'sku,ubicacion,cantidad,costoUnitario,motivo\nSKU-001,principal,25,42000,compra inicial'}
                    className="rounded border border-white/10 bg-command-ink px-3 py-2 text-sm text-white outline-none focus:border-command-cyan"
                  />
                  <button className="rounded bg-command-cyan px-4 py-2 text-sm font-semibold text-command-ink hover:bg-white md:w-fit">
                    Importar inventario
                  </button>
                </form>
              </div>
            ) : null}

            {inventoryItems.length ? (
              <div className="grid gap-3">
                {inventoryItems.map((item) => (
                  <article key={item.id} className="rounded border border-white/10 bg-white/[0.035] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{item.product.name}</h3>
                        <p className="mt-1 text-sm text-slate-400">{item.locationKey}</p>
                      </div>
                      <span className="rounded border border-command-green/30 bg-command-green/10 px-3 py-1 text-sm text-command-green">
                        {item.quantity.toString()} unidades
                      </span>
                    </div>
                    {item.unitCost ? (
                      <p className="mt-3 text-xs text-slate-400">Costo unitario {money(item.unitCost)}</p>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded border border-dashed border-white/15 p-4 text-sm text-slate-400">
                Aun no hay existencias registradas.
              </p>
            )}
          </div>

          <div className="mt-8 border-t border-white/10 pt-6">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-sm text-slate-400">Ventas</p>
                <h2 className="text-2xl font-semibold">Pedidos</h2>
              </div>
              <span className="rounded border border-white/15 bg-white/5 px-3 py-1 text-sm text-slate-300">
                {orderCount} registrados
              </span>
            </div>

            {orderMessage ? (
              <p
                className={`mb-4 rounded border px-3 py-2 text-sm ${
                  orderMessage.tone === "success"
                    ? "border-command-green/40 bg-command-green/10 text-command-green"
                    : "border-red-400/40 bg-red-400/10 text-red-200"
                }`}
              >
                {orderMessage.text}
              </p>
            ) : null}

            {canManageOrders ? (
              <form action="/api/orders" method="post" className="mb-4 grid gap-3 rounded border border-white/10 bg-white/[0.035] p-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm text-slate-300">
                  Cliente
                  <select
                    name="customerId"
                    className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                  >
                    <option value="">Consumidor final</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  Producto
                  <select
                    name="productId"
                    required
                    className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                  >
                    <option value="">Seleccionar producto</option>
                    {sellableProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  Cantidad
                  <input
                    name="quantity"
                    type="number"
                    min="0.01"
                    step="0.01"
                    defaultValue="1"
                    required
                    className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  Precio unitario
                  <input
                    name="unitPrice"
                    type="number"
                    min="0"
                    step="1"
                    required
                    className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  Cupon
                  <input
                    name="couponCode"
                    maxLength={60}
                    placeholder="Ej: LANZAMIENTO10"
                    className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  Descuento
                  <input
                    name="discount"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue="0"
                    className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  Impuesto
                  <input
                    name="tax"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue="0"
                    className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                  />
                </label>
                <button className="self-end rounded bg-command-cyan px-4 py-2 text-sm font-semibold text-command-ink hover:bg-white md:w-fit">
                  Registrar pedido
                </button>
              </form>
            ) : null}

            {orders.length ? (
              <div className="grid gap-3">
                {orders.map((order) => {
                  const couponCode = couponFromMetadata(order.metadata);
                  const inventoryLocation = inventoryLocationFromMetadata(order.metadata);
                  return (
                    <article key={order.id} className="rounded border border-white/10 bg-white/[0.035] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">{order.code}</h3>
                          <p className="mt-1 text-sm text-slate-400">
                            {order.customer?.name ?? "Consumidor final"} · {order.items[0]?.product?.name ?? order.items[0]?.description ?? "Sin items"}
                          </p>
                        </div>
                        <span className="rounded border border-command-green/30 bg-command-green/10 px-3 py-1 text-sm text-command-green">
                          {money(order.total)}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="rounded bg-white/10 px-2 py-1 text-slate-300">{order.status}</span>
                        {Number(order.discount.toString()) > 0 ? (
                          <span className="rounded bg-white/10 px-2 py-1 text-slate-300">
                            Descuento {money(order.discount)}
                          </span>
                        ) : null}
                        {couponCode ? (
                          <span className="rounded bg-command-cyan/10 px-2 py-1 text-command-cyan">
                            Cupon {couponCode}
                          </span>
                        ) : null}
                        {inventoryLocation ? (
                          <span className="rounded bg-white/10 px-2 py-1 text-slate-300">
                            Stock {inventoryLocation}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="rounded border border-dashed border-white/15 p-4 text-sm text-slate-400">
                Aun no hay pedidos registrados.
              </p>
            )}
          </div>

          <div className="mt-8 border-t border-white/10 pt-6">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-sm text-slate-400">Catalogo</p>
                <h2 className="text-2xl font-semibold">Productos y servicios</h2>
              </div>
              <span className="rounded border border-white/15 bg-white/5 px-3 py-1 text-sm text-slate-300">
                {productCount} registrados
              </span>
            </div>

            {productMessage ? (
              <p
                className={`mb-4 rounded border px-3 py-2 text-sm ${
                  productMessage.tone === "success"
                    ? "border-command-green/40 bg-command-green/10 text-command-green"
                    : "border-red-400/40 bg-red-400/10 text-red-200"
                }`}
              >
                {productMessage.text}
                {params?.product === "imported" && importCount ? ` Total: ${importCount}.` : ""}
              </p>
            ) : null}

            {canManageProducts ? (
              <div className="mb-4 grid gap-4">
                <form action="/api/products" method="post" className="grid gap-3 rounded border border-white/10 bg-white/[0.035] p-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm text-slate-300">
                    Nombre
                    <input
                      name="name"
                      required
                      minLength={2}
                      className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    SKU
                    <input
                      name="sku"
                      maxLength={60}
                      placeholder="Opcional"
                      className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
                    Categoria
                    <input
                      name="categoryKey"
                      required
                      minLength={2}
                      placeholder="ej: suplementos, servicios, combos"
                      className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                    />
                  </label>
                  <div className="grid gap-3 rounded border border-white/10 p-3 text-sm text-slate-300 md:col-span-2 md:grid-cols-2">
                    <label className="flex items-center gap-2">
                      <input name="controlsStock" type="checkbox" className="h-4 w-4 accent-cyan-300" />
                      Controla inventario
                    </label>
                    <label className="flex items-center gap-2">
                      <input name="usableAsInput" type="checkbox" className="h-4 w-4 accent-cyan-300" />
                      Puede ser insumo
                    </label>
                    <label className="flex items-center gap-2">
                      <input name="requiresProduction" type="checkbox" className="h-4 w-4 accent-cyan-300" />
                      Requiere produccion
                    </label>
                    <label className="flex items-center gap-2">
                      <input name="notSellable" type="checkbox" className="h-4 w-4 accent-cyan-300" />
                      No se vende directo
                    </label>
                  </div>
                  <button className="rounded bg-command-cyan px-4 py-2 text-sm font-semibold text-command-ink hover:bg-white md:w-fit">
                    Registrar producto
                  </button>
                </form>

                <form action="/api/products/import" method="post" encType="multipart/form-data" className="grid gap-3 rounded border border-white/10 bg-white/[0.035] p-4">
                  <div>
                    <h3 className="font-semibold">Cargue masivo CSV</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      Columnas: sku,nombre,categoria,controlaInventario,vendible,insumo,produccion
                    </p>
                  </div>
                  <input
                    name="csvFile"
                    type="file"
                    accept=".csv,text/csv"
                    className="rounded border border-white/10 bg-command-ink px-3 py-2 text-sm text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-command-cyan file:px-3 file:py-1 file:text-command-ink"
                  />
                  <textarea
                    name="csvText"
                    rows={4}
                    placeholder={'sku,nombre,categoria,controlaInventario,vendible,insumo,produccion\nSKU-001,Proteina vainilla,suplementos,si,si,no,no'}
                    className="rounded border border-white/10 bg-command-ink px-3 py-2 text-sm text-white outline-none focus:border-command-cyan"
                  />
                  <button className="rounded bg-command-cyan px-4 py-2 text-sm font-semibold text-command-ink hover:bg-white md:w-fit">
                    Importar productos
                  </button>
                </form>
              </div>
            ) : null}

            {products.length ? (
              <div className="grid gap-3">
                {products.map((product) => (
                  <article key={product.id} className="rounded border border-white/10 bg-white/[0.035] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{product.name}</h3>
                        <p className="mt-1 text-sm text-slate-400">{product.categoryKey}</p>
                      </div>
                      {product.sku ? (
                        <span className="rounded border border-command-cyan/30 bg-command-cyan/10 px-3 py-1 text-xs text-command-cyan">
                          {product.sku}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className={`rounded px-2 py-1 ${product.sellable ? "bg-command-green/10 text-command-green" : "bg-white/10 text-slate-400"}`}>
                        {product.sellable ? "Vendible" : "No vendible"}
                      </span>
                      {product.controlsStock ? <span className="rounded bg-white/10 px-2 py-1 text-slate-300">Inventario</span> : null}
                      {product.usableAsInput ? <span className="rounded bg-white/10 px-2 py-1 text-slate-300">Insumo</span> : null}
                      {product.requiresProduction ? <span className="rounded bg-white/10 px-2 py-1 text-slate-300">Produccion</span> : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded border border-dashed border-white/15 p-4 text-sm text-slate-400">
                Aun no hay productos registrados.
              </p>
            )}
          </div>

          <div className="mt-8 border-t border-white/10 pt-6">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-sm text-slate-400">Equipo</p>
                <h2 className="text-2xl font-semibold">Usuarios y roles</h2>
              </div>
              <span className="rounded border border-white/15 bg-white/5 px-3 py-1 text-sm text-slate-300">
                {memberships.length} activos
              </span>
            </div>

            {userMessage ? (
              <p
                className={`mb-4 rounded border px-3 py-2 text-sm ${
                  userMessage.tone === "success"
                    ? "border-command-green/40 bg-command-green/10 text-command-green"
                    : "border-red-400/40 bg-red-400/10 text-red-200"
                }`}
              >
                {userMessage.text}
              </p>
            ) : null}

            {canManageUsers ? (
              <form action="/api/users/invite" method="post" className="mb-4 grid gap-3 rounded border border-white/10 bg-white/[0.035] p-4 md:grid-cols-[1fr_1fr_160px_auto]">
                <label className="grid gap-2 text-sm text-slate-300">
                  Nombre
                  <input
                    name="name"
                    required
                    minLength={2}
                    className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  Correo
                  <input
                    name="email"
                    type="email"
                    required
                    className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  Rol
                  <select
                    name="role"
                    defaultValue="OPERATOR"
                    className="rounded border border-white/10 bg-command-ink px-3 py-2 text-white outline-none focus:border-command-cyan"
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="OPERATOR">OPERATOR</option>
                    <option value="VIEWER">VIEWER</option>
                  </select>
                </label>
                <button className="self-end rounded bg-command-cyan px-4 py-2 text-sm font-semibold text-command-ink hover:bg-white">
                  Invitar
                </button>
              </form>
            ) : null}

            <div className="grid gap-3">
              {memberships.map((membership) => (
                <article key={membership.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/10 bg-white/[0.035] p-4">
                  <div>
                    <h3 className="font-semibold">{membership.user.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">{membership.user.email}</p>
                  </div>
                  <span className="rounded border border-command-cyan/30 bg-command-cyan/10 px-3 py-1 text-xs text-command-cyan">
                    {membership.role}
                  </span>
                </article>
              ))}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
