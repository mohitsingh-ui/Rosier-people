import "server-only";
import { db } from "@/lib/db";
import type { Viewer } from "@/lib/auth/viewer";

export type MyTask = { id: string; title: string; hint?: string; href: string; kind: "document" | "policy" | "onboarding" | "task" | "review" | "helpdesk" | "leave" | "exit"; due?: Date | null };

/** "What does HR need from me?" — gathered from every module for the signed-in employee. */
export async function myTasks(v: Viewer): Promise<MyTask[]> {
  const id = v.employeeId;
  if (!id) return [];
  const [mandatory, docs, policies, acks, onb, offb, tasks, reviews, tickets, clar] = await Promise.all([
    db.documentType.findMany({ where: { isMandatory: true, employeeUpload: true } }),
    db.employeeDocument.findMany({ where: { employeeId: id, archivedAt: null }, select: { typeId: true, status: true, name: true, id: true } }),
    db.policy.findMany({ where: { requiresAck: true } }),
    db.documentAcknowledgement.findMany({ where: { employeeId: id } }),
    db.onboardingTask.findMany({ where: { assigneeId: id, status: { in: ["PENDING", "IN_PROGRESS"] } }, include: { onboarding: { include: { employee: { select: { firstName: true, id: true } } } } }, orderBy: { dueDate: "asc" }, take: 8 }),
    db.offboardingTask.findMany({ where: { assigneeId: id, status: { in: ["PENDING", "IN_PROGRESS"] } }, include: { offboarding: { include: { employee: { select: { firstName: true } } } } }, take: 5 }),
    db.task.findMany({ where: { assigneeId: id, status: { in: ["PENDING", "IN_PROGRESS"] } }, include: { createdBy: { select: { firstName: true } } }, orderBy: { dueDate: "asc" } }),
    db.performanceReview.findMany({ where: { employeeId: id, status: "PENDING_SELF", cycle: { status: { in: ["ACTIVE", "REVIEW"] } } }, include: { cycle: true } }),
    db.helpdeskTicket.findMany({ where: { createdById: id, status: "WAITING_FOR_EMPLOYEE" } }),
    db.leaveRequest.findMany({ where: { employeeId: id, status: "CLARIFICATION" }, include: { leaveType: true } }),
  ]);
  const out: MyTask[] = [];
  const hasType = new Set(docs.filter((d) => d.status !== "REJECTED").map((d) => d.typeId));
  for (const t of mandatory) if (!hasType.has(t.id)) out.push({ id: `doc-${t.id}`, title: `Upload your ${t.name}`, hint: "Required by HR", href: `/documents?upload=${t.id}`, kind: "document" });
  for (const d of docs.filter((d) => d.status === "REJECTED")) out.push({ id: `rej-${d.id}`, title: `Re-upload ${d.name}`, hint: "HR couldn't verify the last upload", href: "/documents", kind: "document" });
  const acked = new Set(acks.map((a) => `${a.policyId}:${a.policyVersion}`));
  for (const p of policies) if (!acked.has(`${p.id}:${p.version}`)) out.push({ id: `pol-${p.id}`, title: `Read and accept the ${p.title}`, href: `/me/policies#${p.id}`, kind: "policy" });
  for (const r of reviews) out.push({ id: `rev-${r.id}`, title: `Submit your self review`, hint: r.cycle.name, href: `/performance/review/${r.id}`, kind: "review", due: r.cycle.selfReviewDue });
  for (const l of clar) out.push({ id: `clar-${l.id}`, title: `Your manager has a question on your ${l.leaveType.name.toLowerCase()}`, href: "/leave", kind: "leave" });
  for (const t of tickets) out.push({ id: `tk-${t.id}`, title: `HR replied on ${t.number}`, hint: t.subject, href: `/helpdesk/${t.id}`, kind: "helpdesk" });
  for (const t of tasks) out.push({ id: `task-${t.id}`, title: t.title, hint: `From ${t.createdBy.firstName}`, href: "/me#tasks", kind: "task", due: t.dueDate });
  for (const t of onb) out.push({ id: `onb-${t.id}`, title: t.title, hint: t.onboarding.employee.id === id ? "Your onboarding" : `Onboarding: ${t.onboarding.employee.firstName}`, href: `/onboarding/${t.onboarding.employee.id}`, kind: "onboarding", due: t.dueDate });
  for (const t of offb) out.push({ id: `off-${t.id}`, title: t.title, hint: `Exit: ${t.offboarding.employee.firstName}`, href: `/onboarding/exit/${t.offboardingId}`, kind: "exit", due: t.dueDate });
  return out;
}
