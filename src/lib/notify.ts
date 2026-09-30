import "server-only";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";

export type NotificationType =
  | "leave.requested" | "leave.approved" | "leave.rejected" | "leave.clarification"
  | "attendance.correction" | "attendance.decided" | "wfh.requested" | "wfh.decided"
  | "document.expiry" | "document.requested" | "document.verified" | "document.rejected" | "document.generated"
  | "announcement.new" | "helpdesk.new" | "helpdesk.update"
  | "onboarding.task" | "offboarding.update" | "performance.review" | "goal.update" | "feedback.new"
  | "asset.assigned" | "asset.returned" | "payroll.processed"
  | "expense.submitted" | "expense.decided" | "task.assigned"
  | "birthday" | "anniversary" | "system";

type Payload = { type: NotificationType; title: string; body?: string; link?: string; email?: boolean };

/** In-app notification + optional email. Push can hook in here (see pushedAt). */
export async function notifyUsers(userIds: (string | null | undefined)[], p: Payload) {
  const ids = [...new Set(userIds.filter(Boolean) as string[])];
  if (!ids.length) return;
  await db.notification.createMany({ data: ids.map((userId) => ({ userId, type: p.type, title: p.title, body: p.body, link: p.link })) });
  if (p.email) {
    const users = await db.user.findMany({ where: { id: { in: ids } }, select: { email: true } });
    const base = process.env.APP_URL ?? "";
    await Promise.allSettled(
      users.map((u) => sendEmail({ to: u.email, subject: p.title, text: `${p.body ?? ""}\n\n${p.link ? base + p.link : ""}`.trim() })),
    );
  }
}

/** Notify by employee id (resolves linked user accounts). */
export async function notifyEmployees(employeeIds: (string | null | undefined)[], p: Payload) {
  const ids = employeeIds.filter(Boolean) as string[];
  if (!ids.length) return;
  const users = await db.user.findMany({ where: { employeeId: { in: ids }, isActive: true }, select: { id: true } });
  await notifyUsers(users.map((u) => u.id), p);
}

/** Notify everyone holding a permission (e.g. all HR for a new ticket). */
export async function notifyPermission(permission: string, p: Payload) {
  const users = await db.user.findMany({
    where: { isActive: true, role: { permissions: { some: { permission: { key: permission } } } } },
    select: { id: true },
  });
  await notifyUsers(users.map((u) => u.id), p);
}
