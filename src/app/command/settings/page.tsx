import { CommandShell } from "../_components/command-shell";
import { requireSession } from "@/server/session";
import { prisma } from "@/server/db";

type SettingsPageProps = {
  searchParams?: Promise<{
    integration?: string;
  }>;
};

const integrationMessages = {
  wompi: { tone: "success", text: "Configuracion de Wompi actualizada." },
  openai: { tone: "success", text: "Configuracion de OpenAI actualizada." },
  r2: { tone: "success", text: "Configuracion de Cloudflare R2 actualizada." },
  resend: { tone: "success", text: "Configuracion de Resend actualizada." },
  sentry: { tone: "success", text: "Configuracion de Sentry actualizada." },
  shopify: { tone: "success", text: "Configuracion de Shopify actualizada." },
  shopify_connected: { tone: "success", text: "Tienda Shopify conectada correctamente." },
  shopify_missing: { tone: "error", text: "Primero escribe el dominio .myshopify.com de la tienda y guarda Shopify." },
  shopify_failed: { tone: "error", text: "No pudimos conectar Shopify. Revisa permisos, dominio o vuelve a intentar." },
  bot: { tone: "success", text: "Configuracion del bot actualizada." },
  forbidden: { tone: "error", text: "Tu rol no permite editar integraciones." },
  invalid: { tone: "error", text: "La integracion seleccionada no es valida." }
} as const;

function configValue(config: unknown, key: string) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return "";
  }

  const value = (config as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function configuredSecrets(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return [];
  }

  const value = (config as Record<string, unknown>).configuredSecrets;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

const integrations = [
  {
    provider: "wompi",
    title: "Wompi",
    description: "Pagos y webhooks de transacciones.",
    publicFields: [
      ["environment", "Ambiente", "production"],
      ["publicKey", "Llave publica", ""]
    ],
    secretFields: [
      ["privateKey", "Llave privada"],
      ["eventsSecret", "Secreto de eventos"]
    ]
  },
  {
    provider: "shopify",
    title: "Shopify",
    description: "Sincronizacion futura de productos, pedidos y clientes.",
    publicFields: [
      ["shopDomain", "Dominio tienda", "mitienda.myshopify.com"],
      ["apiVersion", "Version API", "2026-01"]
    ],
    secretFields: [
      ["accessToken", "Admin API access token"],
      ["webhookSecret", "Webhook secret"]
    ]
  },
  {
    provider: "bot",
    title: "Bot / IA",
    description: "Configuracion base del asistente conversacional.",
    publicFields: [
      ["name", "Nombre del bot", "Specter Assistant"],
      ["tone", "Tono", "profesional y cercano"],
      ["handoffEmail", "Correo de escalamiento", ""]
    ],
    secretFields: [["systemPrompt", "Prompt del sistema"]]
  },
  {
    provider: "openai",
    title: "OpenAI",
    description: "Modelos de IA para automatizaciones.",
    publicFields: [["model", "Modelo", "gpt-5"]],
    secretFields: [["apiKey", "API key"]]
  },
  {
    provider: "r2",
    title: "Cloudflare R2",
    description: "Almacenamiento de archivos y backups remotos.",
    publicFields: [
      ["accountId", "Account ID", ""],
      ["bucket", "Bucket", "specter-command"],
      ["endpoint", "Endpoint S3", ""],
      ["publicUrl", "URL publica", ""]
    ],
    secretFields: [
      ["accessKeyId", "Access key ID"],
      ["secretAccessKey", "Secret access key"]
    ]
  },
  {
    provider: "resend",
    title: "Resend",
    description: "Envio de correos transaccionales.",
    publicFields: [["fromEmail", "Remitente", "Specter Command <no-reply@spectercommand.com>"]],
    secretFields: [["apiKey", "API key"]]
  },
  {
    provider: "sentry",
    title: "Sentry",
    description: "Monitoreo de errores y performance.",
    publicFields: [
      ["dsn", "DSN", ""],
      ["org", "Organizacion", ""],
      ["project", "Proyecto", "specter-command"]
    ],
    secretFields: [["authToken", "Auth token"]]
  }
] as const;

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const message = params?.integration
    ? integrationMessages[params.integration as keyof typeof integrationMessages]
    : undefined;
  const canManageIntegrations = session.role === "OWNER" || session.role === "ADMIN";
  const integrationSettings = await prisma.integrationSetting.findMany({
    where: { companyId: session.company.id, active: true },
    orderBy: { provider: "asc" }
  });
  const integrationMap = new Map(integrationSettings.map((setting) => [setting.provider, setting]));

  return (
    <CommandShell companyName={session.company.name} userEmail={session.user.email} role={session.role}>
      <div className="mx-auto grid max-w-6xl gap-6">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Configuracion</p>
              <h1 className="text-3xl font-semibold">Integraciones</h1>
            </div>
            <span className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
              {integrationSettings.length} configuradas
            </span>
          </div>
          {message ? (
            <p className={`mt-4 rounded-md border px-3 py-2 text-sm ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
              {message.text}
            </p>
          ) : null}
        </section>

        <section className="grid gap-4">
          {integrations.map((integration) => {
            const current = integrationMap.get(integration.provider);
            const secrets = configuredSecrets(current?.publicConfig);
            const shopDomain = integration.provider === "shopify" ? configValue(current?.publicConfig, "shopDomain") : "";
            return (
              <form key={integration.provider} action="/api/integrations" method="post" className="rounded-lg border border-slate-200 bg-white p-5">
                <input type="hidden" name="provider" value={integration.provider} />
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{integration.title}</h2>
                    <p className="mt-1 text-sm text-slate-500">{integration.description}</p>
                  </div>
                  <span className={`rounded-md px-3 py-1 text-xs ${current ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {current ? "Configurada" : "Pendiente"}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {integration.publicFields.map(([name, label, placeholder]) => (
                    <label key={name} className="grid gap-2 text-sm text-slate-600">
                      {label}
                      <input
                        name={name}
                        defaultValue={configValue(current?.publicConfig, name)}
                        placeholder={placeholder}
                        disabled={!canManageIntegrations}
                        className="rounded-md border border-slate-200 px-3 py-2 text-slate-950 outline-none focus:border-cyan-600 disabled:bg-slate-50"
                      />
                    </label>
                  ))}
                  {integration.secretFields.map(([name, label]) => (
                    <label key={name} className="grid gap-2 text-sm text-slate-600">
                      {label}
                      <input
                        name={name}
                        type="password"
                        placeholder={secrets.includes(name) ? "Configurado. Escribe para reemplazar." : "Sin configurar"}
                        disabled={!canManageIntegrations}
                        className="rounded-md border border-slate-200 px-3 py-2 text-slate-950 outline-none focus:border-cyan-600 disabled:bg-slate-50"
                      />
                    </label>
                  ))}
                </div>
                {canManageIntegrations ? (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800">
                      Guardar {integration.title}
                    </button>
                    {integration.provider === "shopify" && shopDomain ? (
                      <a
                        href={`/api/shopify/oauth/start?shop=${encodeURIComponent(shopDomain)}`}
                        className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Conectar Shopify
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </form>
            );
          })}
        </section>
      </div>
    </CommandShell>
  );
}
