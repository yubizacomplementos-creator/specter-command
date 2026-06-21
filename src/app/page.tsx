import { architecturePrinciples, commandModules } from "@/lib/modules";

const statusLabel = {
  active: "Activo",
  ready: "Listo",
  planned: "Planeado"
};

const statusClass = {
  active: "border-command-green/40 bg-command-green/10 text-command-green",
  ready: "border-command-cyan/40 bg-command-cyan/10 text-command-cyan",
  planned: "border-white/15 bg-white/5 text-slate-300"
};

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#123047_0,#0b1120_36%,#070b14_100%)]">
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-command-cyan">Specter Command</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Centro de Comando Empresarial</h1>
        </div>
        <div className="hidden rounded border border-white/10 px-3 py-2 text-sm text-slate-300 sm:block">
          En Dios confiamos. Lo demás lo monitoreamos.
        </div>
      </nav>

      <section className="mx-auto grid w-full max-w-7xl gap-6 px-6 pb-8 pt-3 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded border border-white/10 bg-command-panel/80 p-6 shadow-2xl shadow-black/30">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-slate-400">Arquitectura SaaS base</p>
              <h2 className="mt-2 max-w-3xl text-4xl font-semibold leading-tight text-white">
                Plataforma multiempresa, modular y configurable para cualquier negocio.
              </h2>
            </div>
            <span className="rounded border border-command-green/40 bg-command-green/10 px-3 py-1 text-sm text-command-green">
              Tenant-first
            </span>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {[
              ["Empresas", "∞", "Aislamiento por companyId"],
              ["Modulos", "13", "Activables por cliente"],
              ["Codigo fijo", "0", "Operacion por configuracion"]
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm text-slate-400">{label}</p>
                <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
                <p className="mt-1 text-sm text-slate-400">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="rounded border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-lg font-semibold text-white">Reglas de arquitectura</h2>
          <div className="mt-4 space-y-3">
            {architecturePrinciples.map((principle) => (
              <div key={principle} className="flex gap-3 text-sm text-slate-300">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-command-cyan" />
                <span>{principle}</span>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 pb-10">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-sm text-slate-400">Modulos iniciales</p>
            <h2 className="text-2xl font-semibold text-white">Consola operativa</h2>
          </div>
          <button className="rounded border border-command-cyan/50 px-4 py-2 text-sm text-command-cyan">
            Configurar modulos
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {commandModules.map((module) => (
            <article key={module.key} className="rounded border border-white/10 bg-white/[0.035] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">{module.name}</h3>
                  <p className="mt-2 min-h-12 text-sm leading-6 text-slate-400">{module.description}</p>
                </div>
                <span className={`rounded border px-2 py-1 text-xs ${statusClass[module.status]}`}>
                  {statusLabel[module.status]}
                </span>
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                <span className="text-sm text-slate-500">Senal</span>
                <strong className="text-xl text-white">{module.signal}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
