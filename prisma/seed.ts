import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

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
  const moduleDefinitions = [];

  for (const [key, name] of modules) {
    const module = await prisma.moduleDefinition.upsert({
      where: { key },
      update: { name, active: true },
      create: {
        key,
        name,
        description: `Modulo configurable de ${name}.`,
        capabilities: { configurable: true, tenantScoped: true }
      }
    });
    moduleDefinitions.push(module);
  }

  const adminEmail = process.env.SPECTER_ADMIN_EMAIL?.toLowerCase();
  const adminPassword = process.env.SPECTER_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.log("Seed base completado. Define SPECTER_ADMIN_EMAIL y SPECTER_ADMIN_PASSWORD para crear admin.");
    return;
  }

  if (adminPassword.length < 12) {
    throw new Error("SPECTER_ADMIN_PASSWORD debe tener al menos 12 caracteres.");
  }

  const company = await prisma.company.upsert({
    where: { slug: "specter-command" },
    update: {
      name: "Specter Command",
      domain: "spectercommand.com",
      active: true
    },
    create: {
      name: "Specter Command",
      legalName: "Specter Command",
      slug: "specter-command",
      domain: "spectercommand.com",
      slogan: "En Dios confiamos. Lo demas lo monitoreamos.",
      brand: {
        primaryColor: "#22d3ee",
        commandMode: true
      }
    }
  });

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: "Administrador Specter",
      passwordHash,
      active: true,
      deletedAt: null
    },
    create: {
      email: adminEmail,
      name: "Administrador Specter",
      passwordHash
    }
  });

  await prisma.membership.upsert({
    where: {
      companyId_userId: {
        companyId: company.id,
        userId: user.id
      }
    },
    update: {
      role: "OWNER",
      active: true,
      deletedAt: null,
      permissions: { all: true }
    },
    create: {
      companyId: company.id,
      userId: user.id,
      role: "OWNER",
      permissions: { all: true }
    }
  });

  for (const module of moduleDefinitions) {
    await prisma.companyModule.upsert({
      where: {
        companyId_moduleId: {
          companyId: company.id,
          moduleId: module.id
        }
      },
      update: {
        enabled: true,
        enabledAt: new Date()
      },
      create: {
        companyId: company.id,
        moduleId: module.id,
        enabled: true,
        enabledAt: new Date(),
        settings: { configurable: true }
      }
    });
  }

  console.log(`Admin creado/actualizado: ${adminEmail}`);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
