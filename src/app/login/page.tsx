import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/session";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; reset?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getCurrentSession();
  const params = await searchParams;

  if (session) {
    redirect("/command");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#123047_0,#0b1120_38%,#070b14_100%)] px-6">
      <section className="w-full max-w-md rounded border border-white/10 bg-command-panel/90 p-6 shadow-2xl shadow-black/40">
        <p className="text-xs uppercase tracking-[0.32em] text-command-cyan">Specter Command</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Ingreso al comando</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Accede al centro operativo multiempresa con tu usuario administrador.
        </p>

        {params.error ? (
          <div className="mt-5 rounded border border-command-red/40 bg-command-red/10 px-3 py-2 text-sm text-command-red">
            Credenciales invalidas o usuario sin empresa activa.
          </div>
        ) : null}

        {params.reset === "updated" ? (
          <div className="mt-5 rounded border border-command-green/40 bg-command-green/10 px-3 py-2 text-sm text-command-green">
            Contrasena actualizada. Ya puedes ingresar con tu nueva clave.
          </div>
        ) : null}

        <form action="/api/auth/login" method="post" className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm text-slate-300">Correo</span>
            <input
              className="mt-2 w-full rounded border border-white/10 bg-white/[0.04] px-3 py-3 text-white outline-none transition focus:border-command-cyan"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm text-slate-300">Contrasena</span>
            <input
              className="mt-2 w-full rounded border border-white/10 bg-white/[0.04] px-3 py-3 text-white outline-none transition focus:border-command-cyan"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>

          <button className="w-full rounded bg-command-cyan px-4 py-3 text-sm font-semibold text-command-ink transition hover:bg-cyan-300">
            Entrar
          </button>
        </form>

        <a href="/forgot-password" className="mt-5 block text-center text-sm text-command-cyan hover:text-cyan-300">
          Olvide mi contrasena
        </a>
      </section>
    </main>
  );
}
