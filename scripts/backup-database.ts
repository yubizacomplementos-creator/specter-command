import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

const backupDir = process.env.BACKUP_DIR ?? "./backups";

async function main() {
  await mkdir(backupDir, { recursive: true });

  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = join(backupDir, `specter-command-${now}.backup-manifest.json`);
  const payload = {
    createdAt: new Date().toISOString(),
    reason: process.env.BACKUP_REASON ?? "manual",
    databaseUrlPresent: Boolean(process.env.DATABASE_URL),
    note: "En produccion, ejecutar pg_dump antes de despliegues y en agenda diaria."
  };
  const raw = JSON.stringify(payload, null, 2);
  const checksum = createHash("sha256").update(raw).digest("hex");

  await writeFile(filePath, JSON.stringify({ ...payload, checksum }, null, 2));
  console.log(`Backup manifest creado: ${filePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
