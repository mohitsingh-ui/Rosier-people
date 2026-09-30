"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { action, UserError, zBool, zDate, zFile, zId, zOptText, zText } from "@/lib/action";
import { assertCan, AuthzError, can, type Viewer } from "@/lib/auth/viewer";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/workflow";
import { notifyEmployees } from "@/lib/notify";
import { storeUpload } from "@/lib/storage";
import { countWorkingDays, dateOnly, eachDay, isoOf, today } from "@/lib/dates";
import "./workflows";

const who = (v: Viewer) => (v.employee ? `${v.employee.firstName} ${v.employee.lastName}` : v.email);

async function workingDays(employeeId: string, start: Date, end: Date) {
  const e = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, include: { shift: true } });
  const offs = e.shift?.weeklyOffs ?? [0];
  const hol = new Set((await db.holiday.findMany({ where: { date: { gte: start, lte: end }, type: { not: "OPTIONAL" } } })).map((h) => isoOf(h.date)));
  return countWorkingDays(start, end, offs, hol);
}

export const applyLeave = action(
  z.object({ leaveTypeId: zId, startDate: zDate, endDate: zDate, halfDay: z.enum(["NONE", "FIRST_HALF", "SECOND_HALF"]).default("NONE"), reason: zText(500, 3), attachment: zFile, employeeId: z.string().optional() }),
  async (input, v) => {
    // HR can apply on someone's behalf
    const employeeId = input.employeeId && input.employeeId !== v.employeeId ? (assertCan(v, "leave.manage"), input.employeeId) : v.employeeId;
    if (!employeeId) throw new UserError("Your login isn't linked to an employee.");
    const start = dateOnly(input.startDate), end = dateOnly(input.endDate);
    if (end < start) throw new UserError("End date is before the start date.");
    const type = await db.leaveType.findUniqueOrThrow({ where: { id: input.leaveTypeId } });
    if (!type.isActive) throw new UserError("That leave type is no longer available.");
    const half = input.halfDay !== "NONE";
    if (half && (!type.allowHalfDay || isoOf(start) !== isoOf(end))) throw new UserError(type.allowHalfDay ? "Half days must be a single date." : `${type.name} can't be taken as a half day.`);
    let days = half ? 0.5 : await workingDays(employeeId, start, end);
    if (type.code === "OH") {
      const oh = await db.holiday.findMany({ where: { date: { gte: start, lte: end }, type: "OPTIONAL" } });
      if (!oh.length) throw new UserError("Optional holiday leave can only be used on an optional holiday from the calendar.");
      days = oh.length;
    }
    if (days <= 0) throw new UserError("Those dates fall on holidays or weekly offs — no leave needed.");
    const overlap = await db.leaveRequest.findFirst({ where: { employeeId, status: { in: ["PENDING", "APPROVED", "CLARIFICATION"] }, startDate: { lte: end }, endDate: { gte: start } } });
    if (overlap) throw new UserError("You already have leave on some of these dates.");
    if (type.docRequiredAfterDays && days > type.docRequiredAfterDays && !input.attachment) throw new UserError(`Attach a supporting document for more than ${type.docRequiredAfterDays} days of ${type.name.toLowerCase()}.`);
    const year = start.getUTCFullYear();
    const bal = await db.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: type.id, year } } });
    const available = bal ? bal.allocated + bal.carriedForward - bal.used - bal.pending : 0;
    if (!type.allowNegative && days > available) throw new UserError(`Only ${available} day${available === 1 ? "" : "s"} of ${type.name.toLowerCase()} left. Try another leave type or unpaid leave.`);
    const emp = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
    const file = input.attachment ? await storeUpload(input.attachment, `requests/${employeeId}`) : null;
    const req = await db.$transaction(async (tx) => {
      await tx.leaveBalance.upsert({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: type.id, year } }, create: { employeeId, leaveTypeId: type.id, year, allocated: 0, pending: days }, update: { pending: { increment: days } } });
      return tx.leaveRequest.create({ data: { employeeId, leaveTypeId: type.id, startDate: start, endDate: end, halfDay: input.halfDay, days, reason: input.reason, attachmentKey: file?.storageKey, approverId: emp.managerId } });
    });
    await emit("leave.requested", { requestId: req.id, actorName: who(v) });
    await audit(v, { action: "leave.apply", entity: "LeaveRequest", entityId: req.id, summary: `${who(v)} applied for ${days} day(s) of ${type.name} for ${emp.firstName} ${emp.lastName} (${input.startDate} to ${input.endDate}).` });
    revalidatePath("/", "layout");
    return { ok: true as const, message: emp.managerId ? `Applied for ${days} day${days === 1 ? "" : "s"}. Your manager has been notified.` : "Applied." };
  },
);

export const decideLeave = action(z.object({ id: zId, decision: z.enum(["APPROVED", "REJECTED", "CLARIFICATION"]), note: zOptText(500) }), async (input, v) => {
  const r = await db.leaveRequest.findUniqueOrThrow({ where: { id: input.id }, include: { employee: true, leaveType: true } });
  if (r.employeeId === v.employeeId) throw new AuthzError("You can't approve your own leave.");
  if (!can(v, "leave.manage") && !(can(v, "leave.approve_team") && v.teamIds.has(r.employeeId))) throw new AuthzError();
  if (!["PENDING", "CLARIFICATION"].includes(r.status)) throw new UserError("This request was already decided.");
  if (input.decision !== "APPROVED" && !input.note) throw new UserError(input.decision === "REJECTED" ? "Add a short reason." : "What do you need to know?");
  const year = r.startDate.getUTCFullYear();
  await db.$transaction(async (tx) => {
    await tx.leaveRequest.update({ where: { id: r.id }, data: { status: input.decision, decisionNote: input.note, decidedAt: input.decision === "CLARIFICATION" ? null : new Date(), approverId: v.employeeId ?? r.approverId } });
    const key = { employeeId_leaveTypeId_year: { employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, year } };
    if (input.decision === "APPROVED") await tx.leaveBalance.update({ where: key, data: { pending: { decrement: r.days }, used: { increment: r.days } } });
    if (input.decision === "REJECTED") await tx.leaveBalance.update({ where: key, data: { pending: { decrement: r.days } } });
  });
  await emit("leave.decided", { requestId: r.id, status: input.decision, actorName: who(v) });
  await audit(v, { action: `leave.${input.decision.toLowerCase()}`, entity: "LeaveRequest", entityId: r.id, summary: `${who(v)} ${input.decision === "APPROVED" ? "approved" : input.decision === "REJECTED" ? "rejected" : "asked for clarification on"} ${r.employee.firstName} ${r.employee.lastName}'s ${r.leaveType.name} (${r.days}d).` });
  revalidatePath("/", "layout");
  return { ok: true as const, message: input.decision === "APPROVED" ? "Approved — balance and calendar updated." : input.decision === "REJECTED" ? "Declined." : "Question sent." };
});

export const respondClarification = action(z.object({ id: zId, reason: zText(500, 3) }), async (input, v) => {
  const r = await db.leaveRequest.findUniqueOrThrow({ where: { id: input.id } });
  if (r.employeeId !== v.employeeId) throw new AuthzError();
  if (r.status !== "CLARIFICATION") throw new UserError("Nothing to respond to.");
  await db.leaveRequest.update({ where: { id: r.id }, data: { status: "PENDING", reason: `${r.reason}\n\nReply: ${input.reason}` } });
  await notifyEmployees([r.approverId], { type: "leave.requested", title: `${v.employee?.firstName} replied on their leave request`, body: input.reason, link: "/leave?tab=approvals" });
  revalidatePath("/leave");
  return { ok: true as const, message: "Reply sent." };
});

export const cancelLeave = action(z.object({ id: zId }), async (input, v) => {
  const r = await db.leaveRequest.findUniqueOrThrow({ where: { id: input.id }, include: { leaveType: true, employee: true } });
  if (r.employeeId !== v.employeeId && !can(v, "leave.manage")) throw new AuthzError();
  if (r.status === "APPROVED" && r.startDate <= today() && !can(v, "leave.manage")) throw new UserError("Leave that has started can only be cancelled by HR.");
  if (!["PENDING", "APPROVED", "CLARIFICATION"].includes(r.status)) throw new UserError("This request can't be cancelled.");
  const key = { employeeId_leaveTypeId_year: { employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, year: r.startDate.getUTCFullYear() } };
  await db.$transaction(async (tx) => {
    await tx.leaveRequest.update({ where: { id: r.id }, data: { status: "CANCELLED" } });
    await tx.leaveBalance.update({ where: key, data: r.status === "APPROVED" ? { used: { decrement: r.days } } : { pending: { decrement: r.days } } });
    if (r.status === "APPROVED") for (const d of eachDay(r.startDate, r.endDate)) await tx.attendance.deleteMany({ where: { employeeId: r.employeeId, date: d, status: { in: ["LEAVE", "HALF_DAY"] }, checkIn: null } });
  });
  if (r.status === "APPROVED") await notifyEmployees([r.approverId], { type: "leave.requested", title: `${r.employee.firstName} cancelled approved ${r.leaveType.name.toLowerCase()}`, link: "/leave?tab=calendar" });
  await audit(v, { action: "leave.cancel", entity: "LeaveRequest", entityId: r.id, summary: `${who(v)} cancelled ${r.employee.firstName}'s ${r.leaveType.name} (${isoOf(r.startDate)}).` });
  revalidatePath("/", "layout");
  return { ok: true as const, message: "Leave cancelled and balance restored." };
});

export const adjustBalance = action(z.object({ employeeId: zId, leaveTypeId: zId, year: z.coerce.number().int(), allocated: z.coerce.number().min(0).max(365), carriedForward: z.coerce.number().min(0).max(365), note: zText(300, 3) }), async (input, v) => {
  assertCan(v, "leave.manage");
  const key = { employeeId_leaveTypeId_year: { employeeId: input.employeeId, leaveTypeId: input.leaveTypeId, year: input.year } };
  const before = await db.leaveBalance.findUnique({ where: key });
  await db.leaveBalance.upsert({ where: key, create: { employeeId: input.employeeId, leaveTypeId: input.leaveTypeId, year: input.year, allocated: input.allocated, carriedForward: input.carriedForward }, update: { allocated: input.allocated, carriedForward: input.carriedForward } });
  const [e, t] = await Promise.all([db.employee.findUniqueOrThrow({ where: { id: input.employeeId } }), db.leaveType.findUniqueOrThrow({ where: { id: input.leaveTypeId } })]);
  await audit(v, { action: "leave.adjust_balance", entity: "LeaveBalance", entityId: before?.id, summary: `${who(v)} adjusted ${e.firstName} ${e.lastName}'s ${t.name} balance to ${input.allocated} + ${input.carriedForward} carried (${input.note}).`, before: before ? { allocated: before.allocated, carried: before.carriedForward } : null, after: { allocated: input.allocated, carried: input.carriedForward } });
  revalidatePath("/leave");
  return { ok: true as const, message: "Balance updated." };
});

export const grantCompOff = action(z.object({ employeeId: zId, days: z.coerce.number().min(0.5).max(5), reason: zText(300, 3) }), async (input, v) => {
  if (!can(v, "leave.manage") && !(can(v, "leave.approve_team") && v.teamIds.has(input.employeeId))) throw new AuthzError();
  const co = await db.leaveType.findUniqueOrThrow({ where: { code: "CO" } });
  const year = today().getUTCFullYear();
  await db.leaveBalance.upsert({ where: { employeeId_leaveTypeId_year: { employeeId: input.employeeId, leaveTypeId: co.id, year } }, create: { employeeId: input.employeeId, leaveTypeId: co.id, year, allocated: input.days }, update: { allocated: { increment: input.days } } });
  await notifyEmployees([input.employeeId], { type: "leave.approved", title: `${input.days} day(s) of comp-off credited`, body: input.reason, link: "/leave" });
  await audit(v, { action: "leave.comp_off", entity: "LeaveBalance", summary: `${who(v)} credited ${input.days} comp-off day(s): ${input.reason}.` });
  revalidatePath("/leave");
  return { ok: true as const, message: "Comp-off credited." };
});

export const saveLeaveType = action(
  z.object({ id: z.string().optional(), name: zText(60), code: z.string().trim().toUpperCase().min(2).max(6), annualQuota: z.coerce.number().min(0).max(365), carryForward: zBool, maxCarryForward: z.coerce.number().min(0).max(365), isPaid: zBool, allowHalfDay: zBool, allowNegative: zBool, docRequiredAfterDays: z.coerce.number().int().min(0).max(60).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#A56312"), isActive: zBool }),
  async (input, v) => {
    assertCan(v, "settings.manage");
    const { id, ...data } = input;
    const t = id ? await db.leaveType.update({ where: { id }, data: { ...data, docRequiredAfterDays: data.docRequiredAfterDays || null } }) : await db.leaveType.create({ data: { ...data, docRequiredAfterDays: data.docRequiredAfterDays || null } });
    await audit(v, { action: "leave_type.save", entity: "LeaveType", entityId: t.id, summary: `${who(v)} saved the ${t.name} policy (${t.annualQuota} days/year).`, after: data });
    revalidatePath("/settings");
    return { ok: true as const, message: "Leave policy saved." };
  },
);

/** Year-start job: allocate new balances with carry-forward caps. Safe to run twice. */
export const runYearlyAllocation = action(z.object({ year: z.coerce.number().int().min(2020).max(2100) }), async (input, v) => {
  assertCan(v, "leave.manage");
  const [types, emps] = await Promise.all([db.leaveType.findMany({ where: { isActive: true } }), db.employee.findMany({ where: { status: { in: ["ACTIVE", "PROBATION", "NOTICE_PERIOD"] } } })]);
  let n = 0;
  for (const e of emps) for (const t of types) {
    const prev = await db.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId: e.id, leaveTypeId: t.id, year: input.year - 1 } } });
    const left = prev ? prev.allocated + prev.carriedForward - prev.used - prev.pending : 0;
    const carried = t.carryForward ? Math.min(Math.max(0, left), t.maxCarryForward) : 0;
    const r = await db.leaveBalance.upsert({ where: { employeeId_leaveTypeId_year: { employeeId: e.id, leaveTypeId: t.id, year: input.year } }, create: { employeeId: e.id, leaveTypeId: t.id, year: input.year, allocated: t.annualQuota, carriedForward: carried }, update: {} });
    if (r) n++;
  }
  await audit(v, { action: "leave.yearly_allocation", entity: "LeaveBalance", summary: `${who(v)} ran leave allocation for ${input.year} (${n} balances).` });
  return { ok: true as const, message: `Allocated ${n} balances for ${input.year}.` };
});

export const saveHoliday = action(z.object({ id: z.string().optional(), name: zText(80), date: zDate, type: z.enum(["PUBLIC", "OPTIONAL", "COMPANY"]), locationId: z.string().optional().transform((x) => x || null), note: zOptText(200) }), async (input, v) => {
  assertCan(v, "settings.manage");
  const data = { name: input.name, date: dateOnly(input.date), type: input.type, locationId: input.locationId, note: input.note };
  const h = input.id ? await db.holiday.update({ where: { id: input.id }, data }) : await db.holiday.create({ data });
  await audit(v, { action: "holiday.save", entity: "Holiday", entityId: h.id, summary: `${who(v)} saved holiday ${h.name} on ${input.date}.` });
  revalidatePath("/", "layout");
  return { ok: true as const, message: "Holiday saved." };
});

export const deleteHoliday = action(z.object({ id: zId }), async (input, v) => {
  assertCan(v, "settings.manage");
  const h = await db.holiday.delete({ where: { id: input.id } });
  await audit(v, { action: "holiday.delete", entity: "Holiday", entityId: h.id, summary: `${who(v)} removed holiday ${h.name}.` });
  revalidatePath("/", "layout");
  return { ok: true as const, message: "Holiday removed." };
});
