CREATE TABLE "BotConversation" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT,
  "channel" TEXT NOT NULL DEFAULT 'internal',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "title" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "deletedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BotConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BotMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BotMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BotConversation_companyId_status_active_deletedAt_idx" ON "BotConversation"("companyId", "status", "active", "deletedAt");
CREATE INDEX "BotConversation_companyId_customerId_idx" ON "BotConversation"("companyId", "customerId");
CREATE INDEX "BotMessage_companyId_conversationId_createdAt_idx" ON "BotMessage"("companyId", "conversationId", "createdAt");

ALTER TABLE "BotConversation"
  ADD CONSTRAINT "BotConversation_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BotConversation"
  ADD CONSTRAINT "BotConversation_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BotMessage"
  ADD CONSTRAINT "BotMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "BotConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
