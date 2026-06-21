import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

const sessionSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  companyId: z.string(),
  role: z.string()
});

export type SessionClaims = z.infer<typeof sessionSchema>;

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET debe tener al menos 32 caracteres.");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(claims: SessionClaims) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSecret());
}

export async function verifySession(token: string) {
  const { payload } = await jwtVerify(token, getSecret());
  return sessionSchema.parse(payload);
}
