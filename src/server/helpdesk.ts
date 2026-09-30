"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { action, UserError, zBool, zFile, zId, zText } from "@/lib/action";
import { assertCan, AuthzError, can, type Viewer } from "@/lib/auth/viewer";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/workflow";
import { notifyEmployees } from "@/lib/notify";
import { storeUpload } from "@/lib/storage";
import { nextNumber } from "@/lib/db-helpers";
import "./workflows";

const who = (v: Viewer) => (v.employee ? `${v.employee.firstName} ${v.employee.lastName}` : v.email);
export type TicketCategory = "PAYROLL" | "LEAVE" | "ATTENDANCE" | "DOCUMENTS" | "IT" | "BENEFITS" | "POLICY" | "WORKPLACE" | "OTHER";
const CATS = ["PAYROLL", "LEAVE", "ATTENDANCE", "DOCUMENTS", "IT", "BENEFITS", "POLICY", "WORKPLACE", "OTHER"] as const;

export const createTicket = action(z.object({ subject: zText(150, 4), category: z.enum(CATS), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"), description: zText(5000, 10), attachment: zFile }), async (i, v) => {
  if (!v.employeeId) throw new UserError("No employee record.");
  const file = i.attachment ? await storeUpload(i.attachment, `helpdesk/${v.employeeId}`) : null;
  const t = await db.helpdeskTicket.create({ data: { number: await nextNumber("helpdesk_tickets", "HD", 1001), subject: i.subject, category: i.category, priority: i.priority, description: i.description, attachmentKey: file?.storageKey, createdById: v.employeeId } });
  await emit("helpdesk.created", { ticketId: t.id });
  await audit(v, { action: "helpdesk.create", entity: "HelpdeskTicket", entityId: t.id, summary: `${who(v)} raised ${t.number}: ${t.subject}.` });
  revalidatePath("/helpdesk");
  return { ok: true as const, message: `Ticket ${t.number} raised. HR usually replies within a working day.`, data: { id: t.id } };
});

export const commentTicket = action(z.object({ ticketId: zId, body: zText(5000, 2), isInternal: zBool, attachment: zFile }), async (i, v) => {
  const t = await db.helpdeskTicket.findUniqueOrThrow({ where: { id: i.ticketId } });
  const agent = can(v, "helpdesk.manage");
  if (t.createdById !== v.employeeId && !agent) throw new AuthzError();
  if (!v.employeeId) throw new UserError("No employee record.");
  const internal = agent && i.isInternal;
  const file = i.attachment ? await storeUpload(i.attachment, `helpdesk/${t.createdById}`) : null;
  await db.ticketComment.create({ data: { ticketId: t.id, authorId: v.employeeId, body: i.body, isInternal: internal, attachmentKey: file?.storageKey } });
  if (!internal) {
    const byOwner = t.createdById === v.employeeId;
    await db.helpdeskTicket.update({ where: { id: t.id }, data: byOwner ? { status: ["WAITING_FOR_EMPLOYEE", "RESOLVED"].includes(t.status) ? "IN_PROGRESS" : t.status } : { status: t.status === "OPEN" ? "IN_PROGRESS" : t.status, assigneeId: t.assigneeId ?? v.employeeId } });
    await notifyEmployees([byOwner ? t.assigneeId : t.createdById], { type: "helpdesk.update", title: `New reply on ${t.number}`, body: i.body.slice(0, 120), link: `/helpdesk/${t.id}` });
  }
  revalidatePath(`/helpdesk/${t.id}`);
  revalidatePath("/helpdesk");
  return { ok: true as const, message: internal ? "Internal note added." : "Reply sent." };
});

export const updateTicket = action(z.object({ id: zId, status: z.enum(["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_EMPLOYEE", "RESOLVED", "CLOSED"]).optional(), assigneeId: z.string().optional(), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional() }), async (i, v) => {
  const t = await db.helpdeskTicket.findUniqueOrThrow({ where: { id: i.id } });
  const agent = can(v, "helpdesk.manage");
  const owner = t.createdById === v.employeeId;
  // Employees may only close their own ticket or reopen a resolved one
  if (!agent && !(owner && (i.status === "CLOSED" || (i.status === "OPEN" && ["RESOLVED", "CLOSED"].includes(t.status))) && !i.assigneeId && !i.priority)) throw new AuthzError();
  const data: Record<string, unknown> = {};
  if (i.status) Object.assign(data, { status: i.status, resolvedAt: ["RESOLVED", "CLOSED"].includes(i.status) ? new Date() : null });
  if (i.assigneeId !== undefined) Object.assign(data, { assigneeId: i.assigneeId || null, ...(t.status === "OPEN" && i.assigneeId ? { status: "ASSIGNED" } : {}) });
  if (i.priority) data.priority = i.priority;
  await db.helpdeskTicket.update({ where: { id: t.id }, data });
  if (i.status && !owner) await notifyEmployees([t.createdById], { type: "helpdesk.update", title: `${t.number} is now ${i.status.toLowerCase().replace(/_/g, " ")}`, link: `/helpdesk/${t.id}` });
  if (i.assigneeId && i.assigneeId !== v.employeeId) await notifyEmployees([i.assigneeId], { type: "helpdesk.update", title: `${t.number} assigned to you`, body: t.subject, link: `/helpdesk/${t.id}` });
  await audit(v, { action: "helpdesk.update", entity: "HelpdeskTicket", entityId: t.id, summary: `${who(v)} updated ${t.number}${i.status ? ` → ${i.status.toLowerCase()}` : ""}.` });
  revalidatePath(`/helpdesk/${t.id}`);
  revalidatePath("/helpdesk");
  return { ok: true as const, message: "Ticket updated." };
});
