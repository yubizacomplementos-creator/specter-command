import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WAMessage,
  useMultiFileAuthState,
  type WASocket
} from "@whiskeysockets/baileys";
import { PrismaClient } from "@prisma/client";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import P from "pino";

function loadEnvFile(filePath: string) {
  if (!fsSync.existsSync(filePath)) {
    return;
  }

  const lines = fsSync.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

loadEnvFile(path.join(process.cwd(), ".env.production"));
loadEnvFile(path.join(process.cwd(), ".env"));

const prisma = new PrismaClient();
const logger = P({ level: process.env.BAILEYS_LOG_LEVEL ?? "silent" });
const authRoot = process.env.BAILEYS_AUTH_DIR ?? path.join(process.cwd(), ".data", "baileys");
const managedSockets = new Map<string, WASocket>();
let stopping = false;

type DisconnectError = Error & {
  output?: {
    statusCode?: number;
  };
};

function sessionPath(companyId: string) {
  return path.join(authRoot, companyId);
}

function cleanJid(jid?: string | null) {
  return jid?.split("@")[0]?.split(":")[0] ?? null;
}

function extractText(item: WAMessage) {
  const message = item?.message;

  if (!message) {
    return null;
  }

  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    null
  );
}

async function rememberInboundMessage(companyId: string, remoteJid: string, text: string) {
  const phone = cleanJid(remoteJid);
  const customer = phone
    ? await prisma.customer.findFirst({
        where: {
          companyId,
          phone: { contains: phone },
          active: true,
          deletedAt: null
        },
        select: { id: true, name: true }
      })
    : null;

  const conversation =
    (await prisma.botConversation.findFirst({
      where: {
        companyId,
        channel: "whatsapp-baileys",
        title: remoteJid,
        active: true,
        deletedAt: null
      }
    })) ??
    (await prisma.botConversation.create({
      data: {
        companyId,
        customerId: customer?.id,
        channel: "whatsapp-baileys",
        title: remoteJid,
        status: "OPEN"
      }
    }));

  await prisma.$transaction([
    prisma.botMessage.create({
      data: {
        conversationId: conversation.id,
        companyId,
        role: "user",
        content: text,
        metadata: {
          remoteJid,
          phone,
          source: "baileys"
        }
      }
    }),
    prisma.botConversation.update({
      where: { id: conversation.id },
      data: {
        customerId: conversation.customerId ?? customer?.id,
        status: "OPEN"
      }
    })
  ]);
}

async function startSession(companyId: string) {
  if (managedSockets.has(companyId)) {
    return;
  }

  const authPath = sessionPath(companyId);
  await fs.mkdir(authPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    auth: state,
    version,
    logger,
    browser: ["Specter Command", "Chrome", "1.0.0"],
    markOnlineOnConnect: false,
    syncFullHistory: false
  });

  managedSockets.set(companyId, sock);

  await prisma.botChannelSession.updateMany({
    where: { companyId, provider: "baileys", channel: "whatsapp" },
    data: {
      status: "CONNECTING",
      sessionPath: authPath,
      lastError: null
    }
  });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      await prisma.botChannelSession.updateMany({
        where: { companyId, provider: "baileys", channel: "whatsapp" },
        data: {
          status: "QR_READY",
          qrCode: qr,
          sessionPath: authPath,
          lastError: null
        }
      });
    }

    if (connection === "open") {
      await prisma.botChannelSession.updateMany({
        where: { companyId, provider: "baileys", channel: "whatsapp" },
        data: {
          status: "CONNECTED",
          qrCode: null,
          phoneNumber: cleanJid(sock.user?.id),
          displayName: sock.user?.name,
          sessionPath: authPath,
          lastSeenAt: new Date(),
          lastError: null,
          active: true
        }
      });
    }

    if (connection === "close") {
      managedSockets.delete(companyId);
      const statusCode = (lastDisconnect?.error as DisconnectError | undefined)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const record = await prisma.botChannelSession.findUnique({
        where: {
          companyId_provider_channel: {
            companyId,
            provider: "baileys",
            channel: "whatsapp"
          }
        },
        select: { active: true }
      });

      await prisma.botChannelSession.updateMany({
        where: { companyId, provider: "baileys", channel: "whatsapp" },
        data: {
          status: loggedOut || !record?.active ? "DISCONNECTED" : "CONNECTING",
          qrCode: null,
          lastError: lastDisconnect?.error instanceof Error ? lastDisconnect.error.message : null,
          active: loggedOut ? false : record?.active ?? true
        }
      });
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") {
      return;
    }

    for (const item of messages) {
      if (item.key.fromMe || !item.key.remoteJid) {
        continue;
      }

      const text = extractText(item);
      if (!text?.trim()) {
        continue;
      }

      await rememberInboundMessage(companyId, item.key.remoteJid, text.trim());
    }
  });
}

async function closeStoppedSessions(activeCompanyIds: Set<string>) {
  for (const [companyId, sock] of managedSockets.entries()) {
    if (activeCompanyIds.has(companyId)) {
      continue;
    }

    try {
      sock.end(new Error("Session disabled from Specter Command"));
    } catch {
      // Socket may already be closed.
    }
    managedSockets.delete(companyId);
  }
}

async function tick() {
  const sessions = await prisma.botChannelSession.findMany({
    where: {
      provider: "baileys",
      channel: "whatsapp",
      active: true,
      status: { in: ["CONNECTING", "QR_READY", "CONNECTED"] },
      company: {
        active: true,
        deletedAt: null
      }
    },
    select: { companyId: true }
  });
  const activeCompanyIds = new Set(sessions.map((item) => item.companyId));

  await closeStoppedSessions(activeCompanyIds);

  for (const session of sessions) {
    await startSession(session.companyId);
  }
}

async function run() {
  await fs.mkdir(authRoot, { recursive: true });
  console.log(`Specter Baileys worker started. Auth root: ${authRoot}`);

  while (!stopping) {
    try {
      await tick();
    } catch (error) {
      console.error("Baileys worker tick failed", error);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

async function shutdown() {
  stopping = true;
  for (const sock of managedSockets.values()) {
    try {
      sock.end(new Error("Worker shutdown"));
    } catch {
      // Socket may already be closed.
    }
  }
  managedSockets.clear();
  await prisma.$disconnect();
}

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

void run();
