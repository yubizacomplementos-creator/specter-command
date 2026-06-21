import crypto from "node:crypto";

export const integrationProviders = ["wompi", "openai", "r2", "resend", "sentry", "shopify", "bot"] as const;
export type IntegrationProvider = (typeof integrationProviders)[number];

function encryptionKey() {
  const source = process.env.INTEGRATION_SECRET_KEY || process.env.JWT_SECRET;

  if (!source || source.length < 32) {
    throw new Error("INTEGRATION_SECRET_KEY o JWT_SECRET debe tener al menos 32 caracteres.");
  }

  return crypto.createHash("sha256").update(source).digest();
}

export function encryptSecrets(secrets: Record<string, string>) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const plaintext = JSON.stringify(secrets);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    secretCiphertext: ciphertext.toString("base64"),
    secretIv: iv.toString("base64"),
    secretTag: tag.toString("base64")
  };
}

export function decryptSecrets(input: {
  secretCiphertext?: string | null;
  secretIv?: string | null;
  secretTag?: string | null;
}) {
  if (!input.secretCiphertext || !input.secretIv || !input.secretTag) {
    return {};
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(input.secretIv, "base64")
  );
  decipher.setAuthTag(Buffer.from(input.secretTag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(input.secretCiphertext, "base64")),
    decipher.final()
  ]).toString("utf8");

  return JSON.parse(plaintext) as Record<string, string>;
}

export function configuredSecretKeys(secrets: Record<string, string>) {
  return Object.entries(secrets)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);
}
