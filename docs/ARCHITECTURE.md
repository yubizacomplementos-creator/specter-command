# Specter Command - Arquitectura

Specter Command es una plataforma SaaS empresarial multiempresa. La regla principal es que la operacion del negocio vive en datos configurables, no en valores quemados en codigo.

## Principios

1. Toda entidad operativa pertenece a una empresa mediante `companyId`.
2. Ningun modulo se elimina al apagarse; solo cambia su estado.
3. La informacion historica usa soft delete con `active`, `deletedAt` y `deletedById`.
4. Los cambios relevantes se registran en `AuditLog`.
5. Las diferencias entre negocios se modelan con `ConfigEntity`, `ConfigAttribute`, `ConfigOption` y `BusinessRecord`.
6. Las migraciones deben ser versionadas, acumulativas y no destructivas.
7. Backups diarios y backups previos a actualizaciones son obligatorios.

## Modulos iniciales

- Ventas
- Inventario
- Produccion
- CRM
- Fidelizacion
- Marketing
- Influencers
- Cartera
- Finanzas
- Logistica
- IA opcional
- Shopify
- WhatsApp

## Configuracion dinamica

Las categorias, estados, medios de pago, roles, etiquetas, reglas, promociones y automatizaciones deben crearse desde tablas de configuracion. Si una necesidad futura puede resolverse con configuracion, no debe implementarse como logica fija.

## Productos flexibles

`Product.attributes` guarda atributos definidos por categoria. La categoria se representa con `categoryKey` y sus campos se definen en `ConfigEntity`/`ConfigAttribute`, permitiendo camisetas, aretes, celulares o cualquier otro producto sin reconstruir tablas.

## Automatizaciones

`AutomationRule` modela reglas tipo:

SI ocurre un evento, ENTONCES ejecutar acciones.

Los disparadores, condiciones y acciones son JSON para poder ampliar capacidades sin romper reglas existentes.
