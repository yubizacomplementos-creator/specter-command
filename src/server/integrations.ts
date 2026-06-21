import crypto from "node:crypto";

export const integrationProviders = ["wompi", "openai", "r2", "resend", "sentry"] as const;
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

export function configuredSecretKeys(secrets: Record<string, string>) {
  return Object.entries(secrets)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);
}
