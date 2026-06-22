CREATE TABLE "BotSetting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "botName" TEXT NOT NULL DEFAULT 'Specter Bot',
    "businessName" TEXT,
    "tone" TEXT NOT NULL DEFAULT 'amable',
    "welcomeMessage" TEXT,
    "fallbackMessage" TEXT,
    "businessHours" JSONB NOT NULL DEFAULT '{}',
    "humanHandoffText" TEXT,
    "autoReplyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "collectLeadData" BOOLEAN NOT NULL DEFAULT true,
    "instructions" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BotChannelSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'baileys',
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "phoneNumber" TEXT,
    "displayName" TEXT,
    "qrCode" TEXT,
    "sessionPath" TEXT,
    "lastError" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotChannelSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BotSetting_companyId_key" ON "BotSetting"("companyId");
CREATE UNIQUE INDEX "BotChannelSession_companyId_provider_channel_key" ON "BotChannelSession"("companyId", "provider", "channel");
CREATE INDEX "BotChannelSession_companyId_active_status_idx" ON "BotChannelSession"("companyId", "active", "status");
CREATE INDEX "BotChannelSession_provider_channel_status_idx" ON "BotChannelSession"("provider", "channel", "status");

ALTER TABLE "BotSetting" ADD CONSTRAINT "BotSetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BotChannelSession" ADD CONSTRAINT "BotChannelSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
