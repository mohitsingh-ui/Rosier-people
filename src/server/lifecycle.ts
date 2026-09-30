"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { action, UserError, zBool, zDate, zFile, zId, zOptDate, zOptText, zText } from "@/lib/action";
import { assertCan, AuthzError, can, type Viewer } from "@/lib/auth/viewer";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/workflow";
import { notifyEmployees, notifyPermission } from "@/lib/notify";
import { storeUpload } from "@/lib/storage";
import { dateOnly, isoOf, today } from "@/lib/dates";
import "./workflows";

const who = (v: Viewer) => (v.employee ? `${v.employee.firstName} ${v.employee.lastName}` : v.email);
const touch = () => { revalidatePath("/", "layout"); };

async function maybeCompleteOnboarding(onboardingId: string, v: Viewer) {
  const o = await db.onboarding.findUniqueOrThrow({ where: { id: onboardingId }, include: { tasks: true, employee: true } });
  const open = o.tasks.filter((t) => !["DONE", "SKIPPED"].includes(t.status) || (t.requiresValidation && t.status === "DONE" && !t.validatedAt));
  if (open.length || o.status === "COMPLETED") return false;
  await db.onboarding.update({ where: { id: o.id }, data: { status: "COMPLETED", completedAt: new Date() } });
  await emit("onboarding.completed", { employeeId: o.employeeId, actorUserId: v.userId });
  await audit(v, { action: "onboarding.complete", entity: "Onboarding", entityId: o.id, summary: `Onboarding completed for ${o.employee.firstName} ${o.employee.lastName}.` });
  return true;
}

export const updateOnboardingTask = action(z.object({ id: zId, status: z.enum(["PENDING", "IN_PROGRESS", "DONE", "BLOCKED", "SKIPPED"]), comments: zOptText(1000), attachment: zFile }), async (i, v) => {
  const t = await db.onboardingTask.findUniqueOrThrow({ where: { id: i.id }, include: { onboarding: { include: { employee: true } } } });
  const hr = can(v, "onboarding.manage");
  if (!hr && t.assigneeId !== v.employeeId) throw new AuthzError("Only the assignee or HR can update this task.");
  if (i.status === "SKIPPED" && !hr) throw new AuthzError("Only HR can skip tasks.");
  const file = i.attachment ? await storeUpload(i.attachment, `onboarding/${t.onboarding.employeeId}`) : null;
  await db.onboardingTask.update({
    where: { id: t.id },
    data: { status: i.status, comments: i.comments ?? t.comments, attachmentKey: file?.storageKey ?? t.attachmentKey, completedAt: i.status === "DONE" ? new Date() : null, ...(t.requiresValidation && i.status === "DONE" && hr ? { validatedById: v.userId, validatedAt: new Date() } : {}) },
  });
  if (t.requiresValidation && i.status === "DONE" && !hr) await notifyPermission("onboarding.manage", { type: "onboarding.task", title: `Validate: ${t.title}`, body: `${t.onboarding.employee.firstName} ${t.onboarding.employee.lastName}`, link: `/onboarding/${t.onboarding.employeeId}` });
  await audit(v, { action: "onboarding.task", entity: "OnboardingTask", entityId: t.id, summary: `${who(v)} set "${t.title}" to ${i.status.toLowerCase()} for ${t.onboarding.employee.firstName}.` });
  const done = await maybeCompleteOnboarding(t.onboardingId, v);
  touch();
  return { ok: true as const, message: done ? "All tasks done — onboarding complete!" : "Task updated." };
});

export const validateOnboardingTask = action(z.object({ id: zId, decision: z.enum(["APPROVED", "REJECTED"]), note: zOptText(400) }), async (i, v) => {
  assertCan(v, "onboarding.manage");
  const t = await db.onboardingTask.findUniqueOrThrow({ where: { id: i.id } });
  await db.onboardingTask.update({ where: { id: t.id }, data: i.decision === "APPROVED" ? { validatedById: v.userId, validatedAt: new Date(), status: "DONE" } : { status: "IN_PROGRESS", validatedAt: null, comments: `${t.comments ?? ""}\nHR: ${i.note ?? "Please redo"}`.trim() } });
  if (i.decision === "REJECTED") await notifyEmployees([t.assigneeId], { type: "onboarding.task", title: `Please revisit: ${t.title}`, body: i.note, link: "/onboarding" });
  const done = i.decision === "APPROVED" && (await maybeCompleteOnboarding(t.onboardingId, v));
  touch();
  return { ok: true as const, message: done ? "Validated — onboarding complete!" : i.decision === "APPROVED" ? "Validated." : "Sent back." };
});

export const addOnboardingTask = action(z.object({ onboardingId: zId, title: zText(150), category: z.enum(["HR", "IT", "MANAGER", "EMPLOYEE", "ADMIN"]), assigneeId: z.string().optional().transform((x) => x || null), dueDate: zOptDate, requiresValidation: zBool }), async (i, v) => {
  assertCan(v, "onboarding.manage");
  const n = await db.onboardingTask.count({ where: { onboardingId: i.onboardingId } });
  await db.onboardingTask.create({ data: { onboardingId: i.onboardingId, title: i.title, category: i.category, assigneeId: i.assigneeId, dueDate: i.dueDate ? dateOnly(i.dueDate) : null, requiresValidation: i.requiresValidation, order: n } });
  await db.onboarding.update({ where: { id: i.onboardingId }, data: { status: "IN_PROGRESS", completedAt: null } });
  await notifyEmployees([i.assigneeId], { type: "onboarding.task", title: `New onboarding task: ${i.title}`, link: "/onboarding" });
  touch();
  return { ok: true as const, message: "Task added." };
});

export const reassignOnboardingTask = action(z.object({ id: zId, assigneeId: zId, dueDate: zOptDate }), async (i, v) => {
  assertCan(v, "onboarding.manage");
  const t = await db.onboardingTask.update({ where: { id: i.id }, data: { assigneeId: i.assigneeId, ...(i.dueDate ? { dueDate: dateOnly(i.dueDate) } : {}) } });
  await notifyEmployees([i.assigneeId], { type: "onboarding.task", title: `Onboarding task assigned to you: ${t.title}`, link: "/onboarding" });
  touch();
  return { ok: true as const, message: "Reassigned." };
});

export const startOnboarding = action(z.object({ employeeId: zId }), async (i, v) => {
  assertCan(v, "onboarding.manage");
  if (await db.onboarding.findUnique({ where: { employeeId: i.employeeId } })) throw new UserError("Onboarding already exists.");
  const e = await db.employee.findUniqueOrThrow({ where: { id: i.employeeId } });
  if (!["PREBOARDING", "PROBATION"].includes(e.status)) await db.employee.update({ where: { id: e.id }, data: { status: "PROBATION" } });
  await emit("employee.created", { employeeId: e.id, actorUserId: v.userId });
  touch();
  return { ok: true as const, message: "Onboarding checklist created." };
});

// ──────────────────────────────────────── Exits

export const submitResignation = action(z.object({ reason: zText(1000, 5), requestedLastDay: zDate }), async (i, v) => {
  if (!v.employeeId) throw new UserError("No employee record.");
  const e = await db.employee.findUniqueOrThrow({ where: { id: v.employeeId } });
  const existing = await db.offboarding.findUnique({ where: { employeeId: e.id } });
  if (existing && !["WITHDRAWN", "REJECTED"].includes(existing.stage)) throw new UserError("You already have a resignation in progress.");
  if (dateOnly(i.requestedLastDay) < today()) throw new UserError("Pick a last day in the future.");
  if (existing) await db.offboarding.delete({ where: { id: existing.id } });
  const o = await db.offboarding.create({ data: { employeeId: e.id, reason: i.reason, resignationDate: today(), requestedLastDay: dateOnly(i.requestedLastDay), stage: e.managerId ? "MANAGER_REVIEW" : "HR_REVIEW", noticeDays: e.status === "PROBATION" ? 15 : 30 } });
  await emit("offboarding.started", { offboardingId: o.id });
  await audit(v, { action: "offboarding.resign", entity: "Offboarding", entityId: o.id, summary: `${who(v)} submitted resignation (requested last day ${i.requestedLastDay}).` });
  touch();
  return { ok: true as const, message: "Resignation submitted. Your manager and HR have been notified." };
});

export const withdrawResignation = action(z.object({ id: zId }), async (i, v) => {
  const o = await db.offboarding.findUniqueOrThrow({ where: { id: i.id }, include: { employee: true } });
  if (o.employeeId !== v.employeeId && !can(v, "offboarding.manage")) throw new AuthzError();
  if (["CLEARANCE", "FINAL_SETTLEMENT", "EXITED"].includes(o.stage)) throw new UserError("It's too late to withdraw — talk to HR.");
  await db.offboarding.update({ where: { id: o.id }, data: { stage: "WITHDRAWN" } });
  if (o.employee.status === "NOTICE_PERIOD") await db.employee.update({ where: { id: o.employeeId }, data: { status: "ACTIVE", exitDate: null } });
  await notifyEmployees([o.employee.managerId], { type: "offboarding.update", title: `${o.employee.firstName} withdrew their resignation`, link: `/onboarding/exit/${o.id}` });
  await audit(v, { action: "offboarding.withdraw", entity: "Offboarding", entityId: o.id, summary: `${who(v)} withdrew ${o.employee.firstName}'s resignation.` });
  touch();
  return { ok: true as const, message: "Resignation withdrawn." };
});

/** Manager and HR each review; HR's acceptance starts the notice period. */
export const reviewExit = action(z.object({ id: zId, decision: z.enum(["ACCEPT", "REJECT"]), note: zOptText(1000), lastWorkingDay: zOptDate }), async (i, v) => {
  const o = await db.offboarding.findUniqueOrThrow({ where: { id: i.id }, include: { employee: true } });
  const isMgr = v.teamIds.has(o.employeeId) && o.stage === "MANAGER_REVIEW";
  const isHr = can(v, "offboarding.manage") && ["MANAGER_REVIEW", "HR_REVIEW", "RESIGNATION_SUBMITTED"].includes(o.stage);
  if (!isMgr && !isHr) throw new AuthzError();
  if (i.decision === "REJECT") {
    await db.offboarding.update({ where: { id: o.id }, data: { stage: "REJECTED", ...(isHr && !isMgr ? { hrNote: i.note } : { managerNote: i.note }) } });
  } else if (isMgr && !can(v, "offboarding.manage")) {
    await db.offboarding.update({ where: { id: o.id }, data: { stage: "HR_REVIEW", managerNote: i.note, lastWorkingDay: i.lastWorkingDay ? dateOnly(i.lastWorkingDay) : o.requestedLastDay } });
    await notifyPermission("offboarding.manage", { type: "offboarding.update", title: `${who(v)} accepted ${o.employee.firstName}'s resignation`, body: "Ready for HR review", link: `/onboarding/exit/${o.id}` });
  } else {
    const lwd = i.lastWorkingDay ? dateOnly(i.lastWorkingDay) : o.lastWorkingDay ?? o.requestedLastDay;
    await db.offboarding.update({ where: { id: o.id }, data: { stage: "NOTICE_PERIOD", hrNote: i.note, lastWorkingDay: lwd } });
    await db.employee.update({ where: { id: o.employeeId }, data: { status: "NOTICE_PERIOD", exitDate: lwd } });
    await db.jobHistory.create({ data: { employeeId: o.employeeId, type: "STATUS_CHANGE", fromValue: o.employee.status, toValue: "NOTICE_PERIOD", effectiveDate: today(), note: `Last working day ${isoOf(lwd)}`, createdById: v.userId } });
  }
  await notifyEmployees([o.employeeId], { type: "offboarding.update", title: i.decision === "REJECT" ? "Your resignation needs a conversation" : "Your resignation has been accepted", body: i.note, link: "/onboarding" });
  await audit(v, { action: `offboarding.${i.decision.toLowerCase()}`, entity: "Offboarding", entityId: o.id, summary: `${who(v)} ${i.decision === "ACCEPT" ? "accepted" : "declined"} ${o.employee.firstName} ${o.employee.lastName}'s resignation.` });
  touch();
  return { ok: true as const, message: i.decision === "ACCEPT" ? "Accepted." : "Declined." };
});

export const initiateExit = action(z.object({ employeeId: zId, exitType: z.enum(["TERMINATION", "RETIREMENT", "CONTRACT_END", "RESIGNATION"]), reason: zText(1000, 3), lastWorkingDay: zDate }), async (i, v) => {
  assertCan(v, "offboarding.manage");
  const e = await db.employee.findUniqueOrThrow({ where: { id: i.employeeId } });
  const existing = await db.offboarding.findUnique({ where: { employeeId: e.id } });
  if (existing && !["WITHDRAWN", "REJECTED"].includes(existing.stage)) throw new UserError("An exit is already in progress.");
  if (existing) await db.offboarding.delete({ where: { id: existing.id } });
  const lwd = dateOnly(i.lastWorkingDay);
  const o = await db.offboarding.create({ data: { employeeId: e.id, exitType: i.exitType, reason: i.reason, resignationDate: today(), requestedLastDay: lwd, lastWorkingDay: lwd, stage: "NOTICE_PERIOD" } });
  await db.employee.update({ where: { id: e.id }, data: { status: "NOTICE_PERIOD", exitDate: lwd } });
  await emit("offboarding.started", { offboardingId: o.id });
  await audit(v, { action: "offboarding.initiate", entity: "Offboarding", entityId: o.id, summary: `${who(v)} started a ${i.exitType.toLowerCase().replace("_", " ")} exit for ${e.firstName} ${e.lastName} (last day ${i.lastWorkingDay}).` });
  touch();
  return { ok: true as const, message: "Exit started with a checklist." };
});

export const updateOffboardingTask = action(z.object({ id: zId, status: z.enum(["PENDING", "IN_PROGRESS", "DONE", "BLOCKED", "SKIPPED"]), note: zOptText(600) }), async (i, v) => {
  const t = await db.offboardingTask.findUniqueOrThrow({ where: { id: i.id }, include: { offboarding: { include: { employee: true } } } });
  if (!can(v, "offboarding.manage") && t.assigneeId !== v.employeeId) throw new AuthzError();
  await db.offboardingTask.update({ where: { id: t.id }, data: { status: i.status, note: i.note ?? t.note, completedAt: i.status === "DONE" ? new Date() : null } });
  await audit(v, { action: "offboarding.task", entity: "OffboardingTask", entityId: t.id, summary: `${who(v)} set exit task "${t.title}" to ${i.status.toLowerCase()} for ${t.offboarding.employee.firstName}.` });
  touch();
  return { ok: true as const, message: "Updated." };
});

export const advanceExit = action(z.object({ id: zId, stage: z.enum(["CLEARANCE", "FINAL_SETTLEMENT", "EXITED"]), settlementAmount: z.coerce.number().min(0).optional(), exitInterview: zOptText(4000) }), async (i, v) => {
  assertCan(v, "offboarding.manage");
  const o = await db.offboarding.findUniqueOrThrow({ where: { id: i.id }, include: { employee: true, tasks: true } });
  if (i.stage === "EXITED") {
    const open = o.tasks.filter((t) => !["DONE", "SKIPPED"].includes(t.status));
    if (open.length) throw new UserError(`Finish the checklist first: ${open.map((t) => t.title).join(", ")}.`);
    const assets = await db.asset.count({ where: { holderId: o.employeeId } });
    if (assets) throw new UserError(`${assets} asset(s) are still with ${o.employee.firstName}. Record the returns first.`);
  }
  await db.offboarding.update({ where: { id: o.id }, data: { stage: i.stage, ...(i.settlementAmount != null ? { settlementAmount: i.settlementAmount, settledAt: new Date() } : {}), ...(i.exitInterview ? { exitInterview: i.exitInterview } : {}) } });
  if (i.stage === "EXITED") {
    const lwd = o.lastWorkingDay ?? today();
    await db.employee.update({ where: { id: o.employeeId }, data: { status: "EXITED", exitDate: lwd } });
    await db.jobHistory.create({ data: { employeeId: o.employeeId, type: "STATUS_CHANGE", fromValue: "NOTICE_PERIOD", toValue: "EXITED", effectiveDate: lwd, note: `Exit: ${o.exitType.toLowerCase()}`, createdById: v.userId } });
    await emit("offboarding.completed", { offboardingId: o.id });
  }
  await audit(v, { action: `offboarding.${i.stage.toLowerCase()}`, entity: "Offboarding", entityId: o.id, summary: `${who(v)} moved ${o.employee.firstName} ${o.employee.lastName}'s exit to ${i.stage.toLowerCase().replace("_", " ")}.` });
  touch();
  return { ok: true as const, message: i.stage === "EXITED" ? "Marked as exited. Login disabled and reports moved." : "Stage updated." };
});

export const saveExitInterview = action(z.object({ id: zId, exitInterview: zText(4000, 5) }), async (i, v) => {
  const o = await db.offboarding.findUniqueOrThrow({ where: { id: i.id } });
  if (o.employeeId !== v.employeeId && !can(v, "offboarding.manage")) throw new AuthzError();
  await db.offboarding.update({ where: { id: o.id }, data: { exitInterview: i.exitInterview } });
  await db.offboardingTask.updateMany({ where: { offboardingId: o.id, category: "INTERVIEW" }, data: { status: "DONE", completedAt: new Date() } });
  touch();
  return { ok: true as const, message: "Thank you — saved." };
});

