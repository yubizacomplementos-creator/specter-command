# Despliegue y Operacion

## Desarrollo local

```bash
npm install
cp .env.example .env
docker compose up -d
npm run prisma:migrate
npm run dev
```

## Produccion en VPS Linux

1. Configurar PostgreSQL administrado o local con backups externos.
2. Definir `DATABASE_URL`, `JWT_SECRET` y `BACKUP_DIR`.
3. Ejecutar `npm ci`.
4. Ejecutar `npm run prisma:deploy`.
5. Construir con `npm run build`.
6. Servir con `npm run start` detras de Nginx o Caddy con HTTPS.

## Backups

- Diario: ejecutar `pg_dump` desde cron.
- Antes de actualizar: ejecutar backup y verificar checksum.
- Restauracion: mantener procedimiento probado con `pg_restore`.

El script `npm run backup:db` deja un manifiesto local. En produccion debe reemplazarse o envolverse con `pg_dump`, almacenamiento externo y retencion definida por politica.

## Migraciones

No eliminar tablas ni columnas productivas. Para retirar una funcionalidad:

1. Agregar columnas nuevas de forma compatible.
2. Migrar datos en segundo plano si aplica.
3. Cambiar lectura/escritura de la aplicacion.
4. Mantener campos historicos hasta que una politica formal permita archivarlos.
