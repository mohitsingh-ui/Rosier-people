"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession, requestMeta, revokeAllSessions } from "@/lib/auth/session";
import { hashPassword, passwordProblems, verifyDummy, verifyPassword } from "@/lib/auth/password";
import { rateLimit } from "@/lib/rate-limit";
import { randomToken, sha256 } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { action, UserError } from "@/lib/action";
import type { ActionResult } from "@/lib/action";

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;
const GENERIC = "That ID or password doesn't match our records.";

export async function login(_: unknown, fd: FormData): Promise<ActionResult & { next?: string }> {
  const parsed = z.object({ identifier: z.string().trim().min(1).max(200), password: z.string().min(1).max(200), remember: z.string().optional(), next: z.string().optional() }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: "Enter your employee ID or email and password." };
  const { identifier, password, remember, next } = parsed.data;
  const { ip } = await requestMeta();

  const rl = rateLimit(`login:${ip}`, 20, 15 * 60 * 1000);
  const rl2 = rateLimit(`login:${identifier.toLowerCase()}`, 10, 15 * 60 * 1000);
  if (!rl.ok || !rl2.ok) return { ok: false, error: `Too many attempts. Try again in ${Math.ceil(Math.max(rl.retryAfter, rl2.retryAfter) / 60)} minutes.` };

  const isCode = /^[A-Za-z]{2,5}-\d+$/.test(identifier);
  const user = isCode
    ? await db.user.findFirst({ where: { employee: { code: identifier.toUpperCase() } }, include: { role: true } })
    : await db.user.findUnique({ where: { email: identifier.toLowerCase() }, include: { role: true } });

  if (!user || !user.isActive) {
    await verifyDummy(password);
    return { ok: false, error: GENERIC };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) return { ok: false, error: `Account locked after too many attempts. Try again after ${LOCK_MINUTES} minutes or ask HR to reset your password.` };

  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLoginCount + 1;
    await db.user.update({ where: { id: user.id }, data: { failedLoginCount: failed, lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60000) : null } });
    if (failed >= LOCK_AFTER) await audit({ userId: user.id }, { action: "auth.lockout", entity: "User", entityId: user.id, summary: `Account ${user.email} locked after ${failed} failed sign-ins.` });
    return { ok: false, error: GENERIC };
  }

  // 2FA-ready: when enabled, create a pending challenge instead of a session.
  if (user.twoFactorEnabled) return { ok: false, error: "Two-factor sign-in is enabled for this account but not configured on this server yet." };

  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await createSession(user.id, remember === "on");
  await audit({ userId: user.id }, { action: "auth.login", entity: "User", entityId: user.id, summary: `${user.email} signed in.` });

  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  redirect(user.mustChangePassword ? "/me/security?first=1" : safeNext);
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function requestPasswordReset(_: unknown, fd: FormData): Promise<ActionResult> {
  const identifier = String(fd.get("identifier") ?? "").trim().toLowerCase();
  const { ip } = await requestMeta();
  if (!rateLimit(`reset:${ip}`, 5, 15 * 60 * 1000).ok) return { ok: false, error: "Too many requests. Try again later." };
  const user = identifier.includes("@")
    ? await db.user.findUnique({ where: { email: identifier } })
    : await db.user.findFirst({ where: { employee: { code: identifier.toUpperCase() } } });
  if (user?.isActive) {
    const token = randomToken();
    await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60000) } });
    await sendEmail({ to: user.email, subject: "Reset your Rosier People password", text: `Use this link within 30 minutes to set a new password:\n\n${process.env.APP_URL}/reset-password/${token}\n\nIf you didn't ask for this, ignore this email.` });
    if (process.env.NODE_ENV !== "production") console.info(`[dev] reset link: /reset-password/${token}`);
  }
  // Same answer either way so IDs can't be enumerated
  return { ok: true, message: "If that account exists, we've emailed a reset link. It works for 30 minutes." };
}

export async function resetPassword(_: unknown, fd: FormData): Promise<ActionResult> {
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  if (password !== fd.get("confirm")) return { ok: false, error: "Passwords don't match." };
  const problem = passwordProblems(password);
  if (problem) return { ok: false, error: problem };
  const rec = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!rec || rec.usedAt || rec.expiresAt < new Date()) return { ok: false, error: "This link has expired. Request a new one." };
  await db.$transaction([
    db.user.update({ where: { id: rec.userId }, data: { passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null, mustChangePassword: false } }),
    db.passwordResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
  ]);
  await revokeAllSessions(rec.userId);
  await audit({ userId: rec.userId }, { action: "auth.password_reset", entity: "User", entityId: rec.userId, summary: "Password reset via email link." });
  redirect("/login?reset=1");
}

export const changePassword = action(
  z.object({ current: z.string().min(1), password: z.string().min(1), confirm: z.string().min(1) }),
  async (input, v) => {
    if (input.password !== input.confirm) throw new UserError("New passwords don't match.");
    const problem = passwordProblems(input.password);
    if (problem) throw new UserError(problem);
    const user = await db.user.findUniqueOrThrow({ where: { id: v.userId } });
    if (!(await verifyPassword(input.current, user.passwordHash))) throw new UserError("Your current password is wrong.");
    await db.user.update({ where: { id: v.userId }, data: { passwordHash: await hashPassword(input.password), mustChangePassword: false } });
    await audit(v, { action: "auth.password_change", entity: "User", entityId: v.userId, summary: `${v.email} changed their password.` });
    return { ok: true as const, message: "Password updated." };
  },
);

export const signOutEverywhere = action(z.object({}), async (_i, v) => {
  await revokeAllSessions(v.userId);
  await destroySession();
  redirect("/login");
});
