# Specter Command

Plataforma SaaS empresarial multiempresa, modular, configurable y escalable.

> En Dios confiamos. Lo demas lo monitoreamos.

## Stack

- Next.js
- TypeScript
- Tailwind
- Node.js
- PostgreSQL
- Prisma
- JWT con `jose`

## Inicio rapido

```bash
npm install
cp .env.example .env
docker compose up -d
npm run prisma:migrate
npm run dev
```

Abre `http://localhost:3000`.

## Estructura

- `src/app`: interfaz y rutas API.
- `src/server`: servicios de servidor, autenticacion, auditoria y tenant guard.
- `src/lib`: definiciones compartidas de UI.
- `prisma/schema.prisma`: modelo multiempresa, modular y auditable.
- `docs`: decisiones de arquitectura y operacion.

## Estado actual

Esta base inicial incluye:

- Dashboard tipo centro de comando.
- API `/api/health`.
- Esquema Prisma multiempresa.
- Modulos activables por empresa.
- Configuracion dinamica de entidades y atributos.
- Productos e inventario flexibles.
- Soft delete y auditoria.
- Automatizaciones como reglas configurables.
- Documentacion de migraciones, backups y despliegue.

## Produccion

El dominio objetivo es `spectercommand.com`.

Revisa [docs/PRODUCTION_SETUP.md](docs/PRODUCTION_SETUP.md) para configurar Cloudflare, Hostinger VPS, GitHub, Resend, Sentry, OpenAI, Cloudflare R2 y Wompi.
