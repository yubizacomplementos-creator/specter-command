import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const modules = [
  ["sales", "Ventas"],
  ["inventory", "Inventario"],
  ["production", "Produccion"],
  ["crm", "CRM"],
  ["loyalty", "Fidelizacion"],
  ["marketing", "Marketing"],
  ["influencers", "Influencers"],
  ["receivables", "Cartera"],
  ["finance", "Finanzas"],
  ["logistics", "Logistica"],
  ["ai", "IA"],
  ["shopify", "Shopify"],
  ["whatsapp", "WhatsApp"]
] as const;

async function main() {
  for (const [key, name] of modules) {
    await prisma.moduleDefinition.upsert({
      where: { key },
      update: { name, active: true },
      create: {
        key,
        name,
        description: `Modulo configurable de ${name}.`,
        capabilities: { configurable: true, tenantScoped: true }
      }
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
