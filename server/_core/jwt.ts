import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./env";

const secret = new TextEncoder().encode(ENV.cookieSecret || "vnc-icu-portal-secret-key-2026");

export async function signJwt(payload: Record<string, unknown>, expiresIn = "8h"): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifyJwt(token: string): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}
