import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/session";

type ForgotPasswordPageProps = {
  searchParams: Promise<{ status?: string }>;
};

const statusMessages = {
  sent: {
    tone: "success",
    text: "Si el correo existe y esta activo, enviaremos un enlace de recuperacion."
  },
  invalid: {
    tone: "error",
    text: "Ingresa un correo valido."
  },
  email_unconfigured: {
    tone: "error",
    text: "El envio de correo aun no esta configurado en produccion."
  },
  email_failed: {
    tone: "error",
    text: "No pudimos enviar el correo. Revisa la API key y el dominio verificado en Resend."
  }
} as const;

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
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
        <h1 className="mt-3 text-3xl font-semibold text-white">Recuperar acceso</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Te enviaremos un enlace seguro para crear una nueva contrasena.
        </p>

        {statusMessage ? (
          <div
            className={`mt-5 rounded border px-3 py-2 text-sm ${
              statusMessage.tone === "success"
                ? "border-command-green/40 bg-command-green/10 text-command-green"
                : "border-command-red/40 bg-command-red/10 text-command-red"
            }`}
          >
            {statusMessage.text}
          </div>
        ) : null}

        <form action="/api/auth/forgot-password" method="post" className="mt-6 space-y-4">
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

          <button className="w-full rounded bg-command-cyan px-4 py-3 text-sm font-semibold text-command-ink transition hover:bg-cyan-300">
            Enviar enlace
          </button>
        </form>

        <a href="/login" className="mt-5 block text-center text-sm text-command-cyan hover:text-cyan-300">
          Volver al ingreso
        </a>
      </section>
    </main>
  );
}
