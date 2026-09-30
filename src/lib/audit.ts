import "server-only";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/auth/session";
import type { Viewer } from "@/lib/auth/viewer";

type AuditInput = {
  action: string; // "employee.update", "leave.approve" …
  entity: string;
  entityId?: string | null;
  summary: string; // human sentence: "Rajnish Kumar changed Mohit's designation from X to Y."
  before?: unknown;
  after?: unknown;
};

const REDACT = /(pan|aadhaar|passport|account|password|secret|token)/i;

/** Strip sensitive values from audit payloads — the log records that they changed, not what to. */
function redact(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, REDACT.test(k) ? (v == null ? null : "••••") : redact(v)]),
  );
}

export async function audit(actor: Viewer | { userId: string } | null, input: AuditInput) {
  let meta: { ip: string | null; userAgent: string | null } = { ip: null, userAgent: null };
  try { meta = await requestMeta(); } catch { /* outside a request (scripts) */ }
  await db.auditLog.create({
    data: {
      actorId: actor?.userId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      summary: input.summary,
      before: (redact(input.before) ?? undefined) as never,
      after: (redact(input.after) ?? undefined) as never,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
}

/** Compare two flat objects and return only changed keys. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {}, a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    const x = before[k], y = after[k];
    const same = x instanceof Date || y instanceof Date ? String(x?.valueOf()) === String((y as Date | undefined)?.valueOf()) : JSON.stringify(x) === JSON.stringify(y);
    if (!same && y !== undefined) { b[k] = x; a[k] = y; }
  }
  return { before: b, after: a, changed: Object.keys(a) };
}
