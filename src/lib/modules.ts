export type CommandModule = {
  key: string;
  name: string;
  description: string;
  status: "active" | "ready" | "planned";
  signal: string;
};

export const commandModules: CommandModule[] = [
  {
    key: "sales",
    name: "Ventas",
    description: "Pedidos, cotizaciones, descuentos y atribucion comercial.",
    status: "active",
    signal: "$128.4M"
  },
  {
    key: "inventory",
    name: "Inventario",
    description: "Stock flexible por producto, sede, insumo y costo.",
    status: "active",
    signal: "98.7%"
  },
  {
    key: "production",
    name: "Produccion",
    description: "KDS operativo para pedidos, lotes, calidad y despacho.",
    status: "ready",
    signal: "42"
  },
  {
    key: "crm",
    name: "CRM",
    description: "Vista unica del cliente con compras, notas y conversaciones.",
    status: "active",
    signal: "12.8K"
  },
  {
    key: "loyalty",
    name: "Fidelizacion",
    description: "Puntos, cupones, referidos y niveles VIP configurables.",
    status: "ready",
    signal: "4 reglas"
  },
  {
    key: "marketing",
    name: "Marketing",
    description: "Campanas, influencers, obsequios, ROI y atribucion.",
    status: "ready",
    signal: "7.3x"
  },
  {
    key: "finance",
    name: "Finanzas",
    description: "Gastos, costos, caja, cartera y utilidad real.",
    status: "active",
    signal: "31.2%"
  },
  {
    key: "automation",
    name: "Automatizaciones",
    description: "Reglas SI ocurre algo, ENTONCES ejecutar acciones.",
    status: "planned",
    signal: "0 fallos"
  },
  {
    key: "ai",
    name: "IA opcional",
    description: "Analisis, respuestas y recomendaciones sin bloquear la operacion.",
    status: "planned",
    signal: "opt-in"
  }
];

export const architecturePrinciples = [
  "Multiempresa nativo en toda entidad.",
  "Configuracion sobre codigo fijo.",
  "Soft delete para preservar historia.",
  "Auditoria completa por actor, entidad y cambio.",
  "Modulos activables sin perdida de datos.",
  "Migraciones versionadas y compatibles.",
  "Backups diarios y previos a despliegue."
];
