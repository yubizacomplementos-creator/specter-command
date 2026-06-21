import { CommandShell } from "../_components/command-shell";
import { requireSession } from "@/server/session";
import { prisma } from "@/server/db";

type CustomersPageProps = {
  searchParams?: Promise<{
    customer?: string;
    count?: string;
    q?: string;
  }>;
};

const customerMessages = {
  created: { tone: "success", text: "Cliente registrado correctamente." },
  invalid: { tone: "error", text: "Completa el nombre y revisa que el correo sea valido." },
  forbidden: { tone: "error", text: "Tu rol no permite registrar clientes." },
  duplicate: { tone: "error", text: "No pudimos registrar el cliente. Revisa si el codigo ya existe." },
  imported: { tone: "success", text: "Clientes importados correctamente." },
  import_invalid: { tone: "error", text: "El archivo CSV no tiene clientes validos para importar." }
} as const;

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const searchTerm = params?.q?.trim() ?? "";
  const message = params?.customer
    ? customerMessages[params.customer as keyof typeof customerMessages]
    : undefined;
  const importCount = params?.count ? Number(params.count) : undefined;
  const canManageCustomers = session.role !== "VIEWER";
  const where = {
    companyId: session.company.id,
    active: true,
    deletedAt: null,
    ...(searchTerm
      ? {
          OR: [
            { name: { contains: searchTerm, mode: "insensitive" as const } },
            { email: { contains: searchTerm, mode: "insensitive" as const } },
            { phone: { contains: searchTerm, mode: "insensitive" as const } },
            { code: { contains: searchTerm, mode: "insensitive" as const } }
          ]
        }
      : {})
  };
  const [customers, customerCount] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    prisma.customer.count({ where })
  ]);

  return (
    <CommandShell companyName={session.company.name} userEmail={session.user.email} role={session.role}>
      <div className="mx-auto grid max-w-6xl gap-6">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Comercial</p>
              <h1 className="text-3xl font-semibold">Clientes</h1>
            </div>
            <span className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
              {customerCount} registrados
            </span>
          </div>

          <form method="get" className="mt-5 grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <input
              name="q"
              defaultValue={searchTerm}
              placeholder="Buscar por nombre, correo, telefono o codigo"
              className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600"
            />
            <button className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800">
              Buscar
            </button>
            <a href="/command/customers" className="rounded-md border border-slate-200 px-4 py-2 text-center text-sm text-slate-600 hover:border-cyan-700 hover:text-cyan-700">
              Limpiar
            </a>
          </form>

          {message ? (
            <p className={`mt-4 rounded-md border px-3 py-2 text-sm ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
              {message.text}
              {params?.customer === "imported" && importCount ? ` Total: ${importCount}.` : ""}
            </p>
          ) : null}
        </section>

        {canManageCustomers ? (
          <section className="grid gap-4 lg:grid-cols-2">
            <form action="/api/customers" method="post" className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold">Registrar cliente</h2>
              <div className="mt-4 grid gap-3">
                <input name="name" required minLength={2} placeholder="Nombre del cliente" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
                <input name="code" maxLength={40} placeholder="Codigo interno opcional" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
                <input name="email" type="email" placeholder="Correo" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
                <input name="phone" maxLength={40} placeholder="Telefono" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
                <input name="tags" maxLength={240} placeholder="Etiquetas: mayorista, frecuente, credito" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
                <button className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800">
                  Guardar cliente
                </button>
              </div>
            </form>

            <form action="/api/customers/import" method="post" encType="multipart/form-data" className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold">Cargue masivo CSV</h2>
              <p className="mt-1 text-sm text-slate-500">Columnas: codigo,nombre,correo,telefono,etiquetas. Etiquetas con |.</p>
              <div className="mt-4 grid gap-3">
                <input name="csvFile" type="file" accept=".csv,text/csv" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
                <textarea name="csvText" rows={5} placeholder={'codigo,nombre,correo,telefono,etiquetas\nCLI-001,Cliente prueba,cliente@correo.com,3001234567,mayorista|frecuente'} className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-600" />
                <button className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800">
                  Importar clientes
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Listado</h2>
          <div className="mt-4 grid gap-3">
            {customers.length ? customers.map((customer) => (
              <article key={customer.id} className="rounded-md border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{customer.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {[customer.email, customer.phone].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                    </p>
                  </div>
                  {customer.code ? <span className="rounded-md bg-cyan-50 px-3 py-1 text-xs text-cyan-700">{customer.code}</span> : null}
                </div>
                {customer.tags.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {customer.tags.map((tag) => (
                      <span key={tag} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{tag}</span>
                    ))}
                  </div>
                ) : null}
              </article>
            )) : (
              <p className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                No hay clientes para mostrar.
              </p>
            )}
          </div>
        </section>
      </div>
    </CommandShell>
  );
}
