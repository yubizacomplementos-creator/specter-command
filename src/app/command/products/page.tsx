import { CommandShell } from "../_components/command-shell";
import { requireSession } from "@/server/session";
import { prisma } from "@/server/db";

type ProductsPageProps = {
  searchParams?: Promise<{
    product?: string;
    count?: string;
    q?: string;
  }>;
};

const productMessages = {
  created: { tone: "success", text: "Producto registrado correctamente." },
  invalid: { tone: "error", text: "Completa nombre y categoria." },
  forbidden: { tone: "error", text: "Tu rol no permite registrar productos." },
  duplicate: { tone: "error", text: "No pudimos registrar el producto. Revisa si el SKU ya existe." },
  imported: { tone: "success", text: "Productos importados correctamente." },
  import_invalid: { tone: "error", text: "El archivo CSV no tiene productos validos para importar." },
  shopify_synced: { tone: "success", text: "Productos importados desde Shopify." },
  shopify_missing: { tone: "error", text: "Configura dominio y token de Shopify en Integraciones antes de sincronizar." },
  shopify_failed: { tone: "error", text: "Shopify no respondio correctamente. Revisa dominio, token y permisos." },
  shopify_published: { tone: "success", text: "Producto publicado o actualizado en Shopify." },
  shopify_publish_invalid: { tone: "error", text: "No encontramos el producto para publicar." },
  shopify_publish_failed: { tone: "error", text: "No pudimos publicar en Shopify. Revisa permisos write_products y el token." }
} as const;

function productPrice(attributes: unknown) {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    return null;
  }

  const value = (attributes as Record<string, unknown>).price;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function hasShopifyProduct(attributes: unknown) {
  return Boolean(
    attributes &&
      typeof attributes === "object" &&
      !Array.isArray(attributes) &&
      typeof (attributes as Record<string, unknown>).shopifyProductId === "string"
  );
}

function variantCount(attributes: unknown) {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    return 0;
  }

  const variants = (attributes as Record<string, unknown>).variants;
  return Array.isArray(variants) ? variants.length : 0;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const searchTerm = params?.q?.trim() ?? "";
  const message = params?.product
    ? productMessages[params.product as keyof typeof productMessages]
    : undefined;
  const importCount = params?.count ? Number(params.count) : undefined;
  const canManageProducts = session.role !== "VIEWER";
  const where = {
    companyId: session.company.id,
    active: true,
    deletedAt: null,
    ...(searchTerm
      ? {
          OR: [
            { name: { contains: searchTerm, mode: "insensitive" as const } },
            { sku: { contains: searchTerm, mode: "insensitive" as const } },
            { categoryKey: { contains: searchTerm, mode: "insensitive" as const } },
            { inventoryItems: { some: { locationKey: { contains: searchTerm, mode: "insensitive" as const } } } }
          ]
        }
      : {})
  };
  const [products, productCount, shopifySetting] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        inventoryItems: {
          where: { active: true, deletedAt: null },
          orderBy: { locationKey: "asc" }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    prisma.product.count({ where }),
    prisma.integrationSetting.findUnique({
      where: {
        companyId_provider: {
          companyId: session.company.id,
          provider: "shopify"
        }
      }
    })
  ]);
  const shopifyConfig = shopifySetting?.publicConfig;
  const hasShopifyDomain =
    shopifyConfig && typeof shopifyConfig === "object" && !Array.isArray(shopifyConfig)
      ? Boolean((shopifyConfig as Record<string, unknown>).shopDomain)
      : false;

  return (
    <CommandShell companyName={session.company.name} userEmail={session.user.email} role={session.role}>
      <div className="mx-auto grid max-w-6xl gap-6">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Catalogo</p>
              <h1 className="text-3xl font-semibold">Productos y servicios</h1>
            </div>
            <span className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
              {productCount} registrados
            </span>
          </div>

          <form method="get" className="mt-5 grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <input
              name="q"
              defaultValue={searchTerm}
              placeholder="Buscar por nombre, SKU o categoria"
              className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600"
            />
            <button className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800">
              Buscar
            </button>
            <a href="/command/products" className="rounded-md border border-slate-200 px-4 py-2 text-center text-sm text-slate-600 hover:border-cyan-700 hover:text-cyan-700">
              Limpiar
            </a>
          </form>

          {message ? (
            <p className={`mt-4 rounded-md border px-3 py-2 text-sm ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
              {message.text}
              {params?.product === "imported" && importCount ? ` Total: ${importCount}.` : ""}
            </p>
          ) : null}
        </section>

        {canManageProducts ? (
          <section className="grid gap-4 lg:grid-cols-3">
            <form action="/api/products" method="post" className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Registrar producto</h2>
                  <p className="mt-1 text-sm text-slate-500">Producto maestro en Specter, listo para publicar en Shopify.</p>
                </div>
                <button className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800">
                  Guardar producto
                </button>
              </div>

              <div className="mt-5 grid gap-4">
                <section className="grid gap-3 rounded-md border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-700">Informacion principal</h3>
                  <input name="name" required minLength={2} placeholder="Titulo del producto" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
                  <textarea name="description" rows={4} placeholder="Descripcion del producto" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
                  <input name="mediaUrl" placeholder="URL de imagen principal (opcional)" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
                </section>

                <section className="grid gap-3 rounded-md border border-slate-200 p-4 md:grid-cols-2">
                  <h3 className="md:col-span-2 text-sm font-semibold text-slate-700">Organizacion</h3>
                  <input name="categoryKey" required minLength={2} placeholder="Tipo / Categoria" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
                  <input name="vendor" maxLength={120} placeholder="Proveedor / marca" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
                  <input name="tags" maxLength={500} placeholder="Etiquetas separadas por coma" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600 md:col-span-2" />
                  <label className="grid gap-2 text-sm text-slate-600">
                    Estado en Shopify
                    <select name="status" defaultValue="ACTIVE" className="rounded-md border border-slate-200 px-3 py-2 text-slate-950 outline-none focus:border-cyan-600">
                      <option value="ACTIVE">Activo</option>
                      <option value="DRAFT">Borrador</option>
                    </select>
                  </label>
                </section>

                <section className="grid gap-3 rounded-md border border-slate-200 p-4 md:grid-cols-2">
                  <h3 className="md:col-span-2 text-sm font-semibold text-slate-700">Precio e inventario</h3>
                  <input name="price" inputMode="decimal" placeholder="Precio de venta" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
                  <input name="sku" maxLength={60} placeholder="SKU del producto o base" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
                  <input name="locationKey" maxLength={80} placeholder="Ubicacion fisica principal" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600 md:col-span-2" />
                  <div className="grid gap-2 rounded-md border border-slate-200 p-3 text-sm text-slate-600 md:col-span-2 sm:grid-cols-2">
                    <label className="flex items-center gap-2"><input name="controlsStock" type="checkbox" /> Controla inventario</label>
                    <label className="flex items-center gap-2"><input name="usableAsInput" type="checkbox" /> Puede ser insumo</label>
                    <label className="flex items-center gap-2"><input name="requiresProduction" type="checkbox" /> Requiere produccion</label>
                    <label className="flex items-center gap-2"><input name="notSellable" type="checkbox" /> No se vende directo</label>
                  </div>
                </section>

                <section className="grid gap-3 rounded-md border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-700">Variantes</h3>
                  <p className="text-sm text-slate-500">
                    Una variante por linea. Ejemplo: Talla=M | Color=Negro | sku=CAM-NEG-M | precio=65000 | ubicacion=caja-camisetas
                  </p>
                  <textarea
                    name="variants"
                    rows={6}
                    placeholder={"Talla=S | Color=Negro | sku=CAM-NEG-S | precio=65000 | ubicacion=caja-camisetas\nTalla=M | Color=Negro | sku=CAM-NEG-M | precio=65000 | ubicacion=caja-camisetas"}
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-600"
                  />
                </section>
              </div>
            </form>

            <form action="/api/products/import" method="post" encType="multipart/form-data" className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold">Cargue masivo CSV</h2>
              <p className="mt-1 text-sm text-slate-500">Columnas: sku,nombre,categoria,controlaInventario,vendible,insumo,produccion.</p>
              <div className="mt-4 grid gap-3">
                <input name="csvFile" type="file" accept=".csv,text/csv" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
                <textarea name="csvText" rows={5} placeholder={'sku,nombre,categoria,controlaInventario,vendible,insumo,produccion\nSKU-001,Proteina vainilla,suplementos,si,si,no,no'} className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-600" />
                <button className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800">
                  Importar productos
                </button>
              </div>
            </form>

            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold">Shopify</h2>
              <p className="mt-1 text-sm text-slate-500">
                Crea el producto en Specter y publicalo desde el listado hacia Shopify. Shopify queda como canal de venta, no como origen principal.
              </p>
              <div className="mt-4 grid gap-3">
                <p className={`rounded-md px-3 py-2 text-sm ${hasShopifyDomain ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {hasShopifyDomain ? "Configuracion detectada" : "Pendiente en Integraciones"}
                </p>
                <p className="text-sm text-slate-500">
                  Despues de guardar un producto, usa el boton Publicar en Shopify de ese producto.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Listado</h2>
          <div className="mt-4 grid gap-3">
            {products.length ? products.map((product) => (
              <article key={product.id} className="rounded-md border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{product.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{product.categoryKey}</p>
                  </div>
                  {product.sku ? <span className="rounded-md bg-cyan-50 px-3 py-1 text-xs text-cyan-700">{product.sku}</span> : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className={`rounded-md px-2 py-1 ${product.sellable ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {product.sellable ? "Vendible" : "No vendible"}
                  </span>
                  {product.controlsStock ? <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">Inventario</span> : null}
                  {product.usableAsInput ? <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">Insumo</span> : null}
                  {product.requiresProduction ? <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">Produccion</span> : null}
                  {product.inventoryItems.length ? (
                    <span className="rounded-md bg-cyan-50 px-2 py-1 text-cyan-700">
                      Ubicacion: {product.inventoryItems.map((item) => item.locationKey).join(", ")}
                    </span>
                  ) : null}
                  {productPrice(product.attributes) !== null ? (
                    <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">
                      Precio: {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(productPrice(product.attributes) ?? 0)}
                    </span>
                  ) : null}
                  {variantCount(product.attributes) ? (
                    <span className="rounded-md bg-purple-50 px-2 py-1 text-purple-700">
                      {variantCount(product.attributes)} variantes
                    </span>
                  ) : null}
                  {hasShopifyProduct(product.attributes) ? (
                    <span className="rounded-md bg-indigo-50 px-2 py-1 text-indigo-700">Publicado en Shopify</span>
                  ) : null}
                </div>
                {canManageProducts ? (
                  <form action="/api/shopify/products/publish" method="post" className="mt-3">
                    <input type="hidden" name="productId" value={product.id} />
                    <button className="rounded-md border border-cyan-200 px-3 py-2 text-xs font-semibold text-cyan-700 hover:border-cyan-700">
                      {hasShopifyProduct(product.attributes) ? "Actualizar en Shopify" : "Publicar en Shopify"}
                    </button>
                  </form>
                ) : null}
              </article>
            )) : (
              <p className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                No hay productos para mostrar.
              </p>
            )}
          </div>
        </section>
      </div>
    </CommandShell>
  );
}
