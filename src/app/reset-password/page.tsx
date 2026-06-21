import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/session";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    token?: string;
    status?: string;
  }>;
};

const statusMessages = {
  invalid: "La nueva contrasena debe tener minimo 12 caracteres y coincidir en ambos campos.",
  expired: "El enlace no existe, ya fue usado o vencio."
} as const;

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const session = await getCurrentSession();
  const params = await searchParams;
  const statusMessage = params.status
    ? statusMessages[params.status as keyof typeof statusMessages]
    : undefined;

  if (session) {
    redirect("/command");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#123047_0,#0b1120_38%,#070b14_100%)] px-6">
      <section className="w-full max-w-md rounded border border-white/10 bg-command-panel/90 p-6 shadow-2xl shadow-black/40">
        <p className="text-xs uppercase tracking-[0.32em] text-command-cyan">Specter Command</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Nueva contrasena</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Crea una contrasena segura para recuperar tu acceso.
        </p>

        {statusMessage ? (
          <div className="mt-5 rounded border border-command-red/40 bg-command-red/10 px-3 py-2 text-sm text-command-red">
            {statusMessage}
          </div>
        ) : null}

        {!params.token ? (
          <div className="mt-5 rounded border border-command-red/40 bg-command-red/10 px-3 py-2 text-sm text-command-red">
            Falta el token de recuperacion.
          </div>
        ) : (
          <form action="/api/auth/reset-password" method="post" className="mt-6 space-y-4">
            <input name="token" type="hidden" value={params.token} />

            <label className="block">
              <span className="text-sm text-slate-300">Nueva contrasena</span>
              <input
                className="mt-2 w-full rounded border border-white/10 bg-white/[0.04] px-3 py-3 text-white outline-none transition focus:border-command-cyan"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-300">Confirmar contrasena</span>
              <input
                className="mt-2 w-full rounded border border-white/10 bg-white/[0.04] px-3 py-3 text-white outline-none transition focus:border-command-cyan"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>

            <button className="w-full rounded bg-command-cyan px-4 py-3 text-sm font-semibold text-command-ink transition hover:bg-cyan-300">
              Cambiar contrasena
            </button>
          </form>
        )}

        <a href="/login" className="mt-5 block text-center text-sm text-command-cyan hover:text-cyan-300">
          Volver al ingreso
        </a>
      </section>
    </main>
  );
}
