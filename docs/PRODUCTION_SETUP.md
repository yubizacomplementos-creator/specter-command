# Puesta en produccion para spectercommand.com

## Servicios contratados

- GoDaddy: compra del dominio.
- Cloudflare: DNS, SSL, CDN y seguridad.
- Hostinger: VPS Linux.
- GitHub: repositorio y CI.
- Cloudflare R2: archivos y backups externos.
- Resend: correos transaccionales.
- Sentry: errores y monitoreo.
- OpenAI: IA opcional.
- Wompi: pagos.

## VPS

- IP publica Hostinger: `2.25.64.250`

La IP responde a ping desde esta maquina.

## DNS requerido en Cloudflare

| Tipo | Nombre | Valor |
| --- | --- | --- |
| A | `@` | `2.25.64.250` |
| CNAME | `www` | `spectercommand.com` |
| CNAME | `files` | dominio publico de R2, si se usara publico |
| TXT | `@` | SPF indicado por Resend |
| TXT | claves DKIM | valores indicados por Resend |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:admin@spectercommand.com` |

En Cloudflare usa SSL/TLS en modo `Full (strict)` cuando el servidor tenga certificado valido.

Si Cloudflare esta en modo proxied, el registro `A @` puede quedar con nube naranja. Para probar el primer despliegue, tambien se puede dejar temporalmente en DNS only.

## Variables de produccion

Copia `.env.production.example` a `.env.production` en el VPS y reemplaza todos los valores.
Nunca subas `.env.production` a GitHub.

## Despliegue VPS

En el VPS:

```bash
sudo bash scripts/setup-vps.sh
cd /var/www/specter-command
npm install
npm run prisma:deploy
npm run build
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save
```

## Nginx

Puedes copiar `infra/nginx.spectercommand.com.conf` a:

```bash
/etc/nginx/sites-available/spectercommand.com
```

Luego:

```bash
sudo ln -s /etc/nginx/sites-available/spectercommand.com /etc/nginx/sites-enabled/spectercommand.com
sudo nginx -t
sudo systemctl reload nginx
```

Para SSL con Nginx instala Certbot o usa Cloudflare Origin Certificate. Con Caddy puedes usar `infra/Caddyfile`.

## GitHub

Crear un repositorio llamado `specter-command`, subir este proyecto y dejar CI activo.

## Backups

Configura cron:

```bash
bash scripts/install-backup-cron.sh
```

El script crea un dump diario a las 03:00 UTC en `/var/backups/specter-command`, genera checksum y conserva 14 dias por defecto.

Cuando Cloudflare R2 este configurado con `rclone` bajo el remoto `specter-r2`, el mismo script subira automaticamente los `.dump` y `.sha256` al bucket definido en `R2_BUCKET`.
