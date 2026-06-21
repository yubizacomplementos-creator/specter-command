CREATE TABLE "IntegrationSetting" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "publicConfig" JSONB NOT NULL DEFAULT '{}',
  "secretCiphertext" TEXT,
  "secretIv" TEXT,
  "secretTag" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "IntegrationSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationSetting_companyId_provider_key" ON "IntegrationSetting"("companyId", "provider");
CREATE INDEX "IntegrationSetting_companyId_active_idx" ON "IntegrationSetting"("companyId", "active");

ALTER TABLE "IntegrationSetting"
  ADD CONSTRAINT "IntegrationSetting_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
