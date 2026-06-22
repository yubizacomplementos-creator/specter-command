import { CommandShell } from "../_components/command-shell";
import { requireSession } from "@/server/session";
import { prisma } from "@/server/db";
import QRCode from "qrcode";
import { WhatsAppQrRefresh } from "./whatsapp-qr-refresh";

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
  invalid_conversation: { tone: "error", text: "La conversacion seleccionada no existe." },
  settings_invalid: { tone: "error", text: "Revisa la configuracion del bot. El nombre es obligatorio." },
  settings_saved: { tone: "success", text: "Configuracion del bot guardada." },
  whatsapp_connecting: { tone: "success", text: "Conexion solicitada. Espera unos segundos y actualiza para ver el QR." },
  whatsapp_disconnected: { tone: "success", text: "WhatsApp quedo desconectado para este negocio." }
} as const;

function botStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    CONNECTING: "Conectando",
    QR_READY: "QR listo",
    CONNECTED: "Conectado",
    DISCONNECTED: "Desconectado",
    ERROR: "Error"
  };

  return status ? labels[status] ?? status : "Sin conectar";
}

function businessHoursText(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const description = (value as Record<string, unknown>).description;
    return typeof description === "string" ? description : "";
  }

  return "";
}

export default async function BotPage({ searchParams }: BotPageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const message = params?.bot ? botMessages[params.bot as keyof typeof botMessages] : undefined;
  const canOperateBot = session.role !== "VIEWER";
  const canManageBot = session.role === "OWNER" || session.role === "ADMIN";
  const [conversations, customers, botSetting, whatsappSession] = await Promise.all([
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
    }),
    prisma.botSetting.findUnique({
      where: { companyId: session.company.id }
    }),
    prisma.botChannelSession.findUnique({
      where: {
        companyId_provider_channel: {
          companyId: session.company.id,
          provider: "baileys",
          channel: "whatsapp"
        }
      }
    })
  ]);
  const qrDataUrl = whatsappSession?.qrCode
    ? await QRCode.toDataURL(whatsappSession.qrCode, { margin: 1, width: 280 })
    : null;

  return (
    <CommandShell companyName={session.company.name} userEmail={session.user.email} role={session.role}>
      <WhatsAppQrRefresh status={whatsappSession?.status} />
      <div className="mx-auto grid max-w-6xl gap-6">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Bot / IA</p>
              <h1 className="text-3xl font-semibold">Bandeja conversacional</h1>
            </div>
            <span className="rounded-md bg-cyan-50 px-3 py-2 text-sm text-cyan-700">
              WhatsApp por Baileys
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Esta base registra conversaciones, mensajes y respuestas internas. WhatsApp se conecta por QR con Baileys, sin API oficial.
          </p>
          {message ? (
            <p className={`mt-4 rounded-md border px-3 py-2 text-sm ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
              {message.text}
            </p>
          ) : null}
        </section>

        <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 lg:grid-cols-[1fr_320px]">
          <div>
            <p className="text-sm text-slate-500">Canal WhatsApp</p>
            <h2 className="mt-1 text-xl font-semibold">Conexion por QR</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Escanea el QR desde WhatsApp en el celular del negocio: Dispositivos vinculados, Vincular dispositivo.
            </p>
            <div className="mt-4 grid gap-2 text-sm text-slate-600">
              <p><strong>Estado:</strong> {botStatusLabel(whatsappSession?.status)}</p>
              {whatsappSession?.phoneNumber ? <p><strong>Numero:</strong> {whatsappSession.phoneNumber}</p> : null}
              {whatsappSession?.displayName ? <p><strong>Nombre conectado:</strong> {whatsappSession.displayName}</p> : null}
              {whatsappSession?.lastError ? <p className="text-red-600"><strong>Error:</strong> {whatsappSession.lastError}</p> : null}
            </div>
            {canManageBot ? (
              <div className="mt-5 flex flex-wrap gap-3">
                <form action="/api/bot/whatsapp/connect" method="post">
                  <button className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800">
                    {whatsappSession?.status === "CONNECTED" ? "Reconectar WhatsApp" : "Conectar WhatsApp"}
                  </button>
                </form>
                {whatsappSession ? (
                  <form action="/api/bot/whatsapp/disconnect" method="post">
                    <button className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-red-300 hover:text-red-700">
                      Desconectar
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex min-h-72 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 p-4">
            {qrDataUrl ? (
              <div className="text-center">
                <img src={qrDataUrl} alt="QR para conectar WhatsApp" className="mx-auto h-64 w-64 rounded-md bg-white p-2" />
                <p className="mt-3 text-xs text-slate-500">Escanealo de inmediato. Esta pantalla actualiza el QR automaticamente si vence.</p>
              </div>
            ) : (
              <p className="text-center text-sm text-slate-500">
                Presiona Conectar WhatsApp. Cuando el worker genere el QR, aparecera aqui.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Configuracion</p>
              <h2 className="text-xl font-semibold">Bot de WhatsApp</h2>
            </div>
            <span className="rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
              Por negocio
            </span>
          </div>
          <form action="/api/bot/settings" method="post" className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Nombre del bot
              <input name="botName" defaultValue={botSetting?.botName ?? "Specter Bot"} disabled={!canManageBot} className="rounded-md border border-slate-200 px-3 py-2 font-normal outline-none focus:border-cyan-600 disabled:bg-slate-50" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Nombre del negocio
              <input name="businessName" defaultValue={botSetting?.businessName ?? session.company.name} disabled={!canManageBot} className="rounded-md border border-slate-200 px-3 py-2 font-normal outline-none focus:border-cyan-600 disabled:bg-slate-50" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Tono
              <select name="tone" defaultValue={botSetting?.tone ?? "amable"} disabled={!canManageBot} className="rounded-md border border-slate-200 px-3 py-2 font-normal outline-none focus:border-cyan-600 disabled:bg-slate-50">
                <option value="amable">Amable</option>
                <option value="profesional">Profesional</option>
                <option value="cercano">Cercano</option>
                <option value="ventas">Orientado a ventas</option>
                <option value="soporte">Soporte claro</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Horario de atencion
              <input name="businessHours" defaultValue={businessHoursText(botSetting?.businessHours)} placeholder="Lunes a sabado 8am a 6pm" disabled={!canManageBot} className="rounded-md border border-slate-200 px-3 py-2 font-normal outline-none focus:border-cyan-600 disabled:bg-slate-50" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
              Mensaje de bienvenida
              <textarea name="welcomeMessage" defaultValue={botSetting?.welcomeMessage ?? ""} rows={2} disabled={!canManageBot} className="rounded-md border border-slate-200 px-3 py-2 font-normal outline-none focus:border-cyan-600 disabled:bg-slate-50" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Mensaje si no sabe responder
              <textarea name="fallbackMessage" defaultValue={botSetting?.fallbackMessage ?? ""} rows={3} disabled={!canManageBot} className="rounded-md border border-slate-200 px-3 py-2 font-normal outline-none focus:border-cyan-600 disabled:bg-slate-50" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Traspaso a humano
              <textarea name="humanHandoffText" defaultValue={botSetting?.humanHandoffText ?? ""} rows={3} disabled={!canManageBot} className="rounded-md border border-slate-200 px-3 py-2 font-normal outline-none focus:border-cyan-600 disabled:bg-slate-50" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
              Instrucciones internas para la IA
              <textarea name="instructions" defaultValue={botSetting?.instructions ?? ""} rows={4} placeholder="Ej: no prometer descuentos sin confirmacion, pedir ciudad antes de cotizar envio..." disabled={!canManageBot} className="rounded-md border border-slate-200 px-3 py-2 font-normal outline-none focus:border-cyan-600 disabled:bg-slate-50" />
            </label>
            <div className="flex flex-wrap gap-4 text-sm text-slate-700 md:col-span-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="autoReplyEnabled" defaultChecked={botSetting?.autoReplyEnabled ?? false} disabled={!canManageBot} />
                Responder automaticamente
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="collectLeadData" defaultChecked={botSetting?.collectLeadData ?? true} disabled={!canManageBot} />
                Pedir datos de contacto cuando falten
              </label>
            </div>
            {canManageBot ? (
              <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 md:w-fit">
                Guardar configuracion
              </button>
            ) : null}
          </form>
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
