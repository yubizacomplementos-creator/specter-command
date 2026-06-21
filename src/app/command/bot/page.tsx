import { CommandShell } from "../_components/command-shell";
import { requireSession } from "@/server/session";
import { prisma } from "@/server/db";

type BotPageProps = {
  searchParams?: Promise<{
    bot?: string;
  }>;
};

const botMessages = {
  sent: { tone: "success", text: "Mensaje registrado y respuesta interna generada." },
  invalid: { tone: "error", text: "Escribe un mensaje valido." },
  forbidden: { tone: "error", text: "Tu rol no permite operar el bot." },
  invalid_customer: { tone: "error", text: "El cliente seleccionado no existe." },
  invalid_conversation: { tone: "error", text: "La conversacion seleccionada no existe." }
} as const;

export default async function BotPage({ searchParams }: BotPageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const message = params?.bot ? botMessages[params.bot as keyof typeof botMessages] : undefined;
  const canOperateBot = session.role !== "VIEWER";
  const [conversations, customers] = await Promise.all([
    prisma.botConversation.findMany({
      where: {
        companyId: session.company.id,
        active: true,
        deletedAt: null
      },
      include: {
        customer: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 2
        }
      },
      orderBy: { updatedAt: "desc" },
      take: 20
    }),
    prisma.customer.findMany({
      where: { companyId: session.company.id, active: true, deletedAt: null },
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
              <p className="text-sm text-slate-500">Bot / IA</p>
              <h1 className="text-3xl font-semibold">Bandeja conversacional</h1>
            </div>
            <span className="rounded-md bg-cyan-50 px-3 py-2 text-sm text-cyan-700">
              Sin API oficial de canal
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Esta base registra conversaciones, mensajes y respuestas internas. Luego conectamos el canal no oficial o proveedor elegido mediante webhook/adaptador.
          </p>
          {message ? (
            <p className={`mt-4 rounded-md border px-3 py-2 text-sm ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
              {message.text}
            </p>
          ) : null}
        </section>

        {canOperateBot ? (
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Probar conversacion</h2>
            <form action="/api/bot/messages" method="post" className="mt-4 grid gap-3">
              <select name="customerId" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600">
                <option value="">Sin cliente asociado</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
              <input name="channel" defaultValue="internal" placeholder="Canal" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
              <textarea name="message" required rows={4} placeholder="Escribe un mensaje de prueba" className="rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-cyan-600" />
              <button className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 md:w-fit">
                Enviar al bot
              </button>
            </form>
          </section>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Conversaciones recientes</h2>
          <div className="mt-4 grid gap-3">
            {conversations.length ? conversations.map((conversation) => (
              <article key={conversation.id} className="rounded-md border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{conversation.title ?? "Conversacion"}</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {conversation.customer?.name ?? "Sin cliente"} - {conversation.channel} - {conversation.status}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500">
                    {conversation.updatedAt.toLocaleString("es-CO", { timeZone: "America/Bogota" })}
                  </span>
                </div>
                <div className="mt-3 grid gap-2">
                  {conversation.messages.slice().reverse().map((item) => (
                    <p key={item.id} className={`rounded-md px-3 py-2 text-sm ${item.role === "assistant" ? "bg-cyan-50 text-cyan-900" : "bg-slate-50 text-slate-700"}`}>
                      <strong>{item.role}:</strong> {item.content}
                    </p>
                  ))}
                </div>
              </article>
            )) : (
              <p className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                No hay conversaciones registradas.
              </p>
            )}
          </div>
        </section>
      </div>
    </CommandShell>
  );
}
