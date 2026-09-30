import { z } from "zod";
import { db } from "@/lib/db";
import { apiViewer, json } from "@/lib/api";

export async function GET() {
  const v = await apiViewer();
  if (v instanceof Response) return v;
  const [notifications, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: v.userId }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.notification.count({ where: { userId: v.userId, readAt: null } }),
  ]);
  return json({ notifications, unread });
}

export async function POST(req: Request) {
  const v = await apiViewer();
  if (v instanceof Response) return v;
  const body = z.object({ id: z.string().optional(), all: z.boolean().optional() }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) return json({ error: "Bad request" }, 400);
  // Scoped to the caller's own notifications — ids from other users simply don't match
  await db.notification.updateMany({ where: { userId: v.userId, readAt: null, ...(body.data.all ? {} : { id: body.data.id ?? "__none__" }) }, data: { readAt: new Date() } });
  return json({ ok: true });
}
