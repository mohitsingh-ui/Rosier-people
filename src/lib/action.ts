import "server-only";
import { z } from "zod";
import { getViewer, AuthzError, type Viewer } from "@/lib/auth/viewer";

export type ActionResult<T = unknown> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** An error whose message is safe to show the user. */
export class UserError extends Error {}

export function formToObject(fd: FormData) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    const val = v instanceof File ? (v.size ? v : undefined) : v;
    if (val === undefined) continue;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      ((out[key] as unknown[]) ??= []).push(val);
    } else out[k] = val;
  }
  return out;
}

/**
 * Wraps every mutation: session check → Zod validation → handler (which does
 * its own record-level authorization) → uniform result. Never trust the client.
 */
export function action<S extends z.ZodType, R>(schema: S, handler: (input: z.infer<S>, viewer: Viewer) => Promise<R | ActionResult<R>>) {
  return async (raw: FormData | unknown): Promise<ActionResult<R>> => {
    const viewer = await getViewer();
    if (!viewer) return { ok: false, error: "Your session has expired. Sign in again." };
    const input = raw instanceof FormData ? formToObject(raw) : raw;
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) (fieldErrors[issue.path.join(".") || "_"] ??= []).push(issue.message);
      return { ok: false, error: "Check the highlighted fields.", fieldErrors };
    }
    try {
      const r = await handler(parsed.data, viewer);
      if (r && typeof r === "object" && "ok" in r) return r as ActionResult<R>;
      return { ok: true, data: r as R };
    } catch (e) {
      if (e instanceof AuthzError || e instanceof UserError) return { ok: false, error: e.message };
      // Let Next's redirect/notFound bubble
      if (e && typeof e === "object" && "digest" in e && String((e as { digest: string }).digest).startsWith("NEXT_")) throw e;
      console.error("[action]", e);
      return { ok: false, error: "Something went wrong. Please try again." };
    }
  };
}

// Common field helpers (FormData sends strings)
export const zId = z.string().min(1).max(40);
export const zOptText = (max = 2000) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
export const zText = (max = 2000, min = 1) => z.string().trim().min(min, "Required").max(max);
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
export const zOptDate = z.string().optional().transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined));
export const zMoney = z.coerce.number().min(0, "Must be 0 or more").max(1e9);
export const zBool = z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "on" || v === "true");
export const zFile = z.instanceof(File).optional();
