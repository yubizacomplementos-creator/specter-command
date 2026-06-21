import { commandModules } from "@/lib/modules";
import { requireSession } from "@/server/session";
import { prisma } from "@/server/db";

type CommandPageProps = {
  searchParams?: Promise<{
    password?: string;
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

export default async function CommandPage({ searchParams }: CommandPageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const passwordMessage = params?.password
    ? passwordMessages[params.password as keyof typeof passwordMessages]
    : undefined;
  const enabledModules = await prisma.companyModule.findMany({
    where: { companyId: session.company.id },
    include: { module: true },
    orderBy: { module: { name: "asc" } }
  });

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
        </section>
      </section>
    </main>
  );
}
