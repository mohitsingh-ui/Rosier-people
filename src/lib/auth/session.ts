import "server-only";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";

export const SESSION_COOKIE = "rp_session";
const SHORT = 1000 * 60 * 60 * 12; // 12h
const LONG = 1000 * 60 * 60 * 24 * 30; // 30d with "remember me"

export async function requestMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local",
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  };
}

/** Opaque random token in an httpOnly cookie; only its SHA-256 is stored. */
export async function createSession(userId: string, remember: boolean) {
  const token = randomToken();
  const ttl = remember ? LONG : SHORT;
  const meta = await requestMeta();
  await db.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttl), ip: meta.ip, userAgent: meta.userAgent },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ttl / 1000,
  });
}

export async function readSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  // Touch at most once every 5 minutes
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return session;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.updateMany({ where: { tokenHash: sha256(token) }, data: { revokedAt: new Date() } });
  jar.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: string) {
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
