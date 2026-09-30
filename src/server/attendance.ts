"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { action, UserError, zDate, zId, zOptText, zText, zFile, zBool } from "@/lib/action";
import { assertCan, can, AuthzError, type Viewer } from "@/lib/auth/viewer";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/workflow";
import { notifyEmployees } from "@/lib/notify";
import { storeUpload } from "@/lib/storage";
import { dateOnly, hmToMinutes, istMinutes, today, countWorkingDays, isoOf } from "@/lib/dates";
import "./workflows";

const name = (v: Viewer) => (v.employee ? `${v.employee.firstName} ${v.employee.lastName}` : v.email);

function me(v: Viewer) {
  if (!v.employeeId) throw new UserError("Your login isn't linked to an employee record.");
  return v.employeeId;
}

async function shiftFor(employeeId: string) {
  const e = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, include: { shift: true } });
  return e.shift ?? (await db.shift.findFirst({ where: { isDefault: true } })) ?? { startTime: "09:30", endTime: "18:30", graceMinutes: 15, fullDayMinutes: 480, halfDayMinutes: 240, overtimeAfterMin: 540, breakMinutes: 60, weeklyOffs: [0] };
}

/** Checks the viewer may act on another employee's attendance (their manager or HR). */
function assertCanApprove(v: Viewer, employeeId: string) {
  if (employeeId === v.employeeId) throw new AuthzError("You can't approve your own request.");
  if (can(v, "attendance.manage")) return;
  if (can(v, "attendance.approve_team") && v.teamIds.has(employeeId)) return;
  throw new AuthzError();
}

export const checkIn = action(
  z.object({ source: z.enum(["WEB", "MOBILE", "GPS", "SELFIE"]).default("WEB"), latitude: z.coerce.number().min(-90).max(90).optional(), longitude: z.coerce.number().min(-180).max(180).optional() }),
  async (input, v) => {
    const employeeId = me(v);
    const date = today();
    const existing = await db.attendance.findUnique({ where: { employeeId_date: { employeeId, date } } });
    if (existing?.checkIn) throw new UserError("You've already checked in today.");
    if (existing?.status === "LEAVE") throw new UserError("You're on approved leave today. Cancel the leave first if you're working.");
    const now = new Date();
    const shift = await shiftFor(employeeId);
    const late = istMinutes(now) > hmToMinutes(shift.startTime) + shift.graceMinutes;
    const wfh = await db.wfhRequest.findFirst({ where: { employeeId, status: "APPROVED", startDate: { lte: date }, endDate: { gte: date } } });
    const holiday = await db.holiday.findFirst({ where: { date, type: { not: "OPTIONAL" } } });
    const offDay = shift.weeklyOffs.includes(date.getUTCDay()) || !!holiday;
    const status = wfh ? "WFH" : late && !offDay ? "LATE" : "PRESENT";
    await db.attendance.upsert({
      where: { employeeId_date: { employeeId, date } },
      create: { employeeId, date, checkIn: now, status, isLate: late && !offDay, source: input.source, latitude: input.latitude, longitude: input.longitude, note: offDay ? "Worked on an off day" : null },
      update: { checkIn: now, status, isLate: late && !offDay, source: input.source, latitude: input.latitude, longitude: input.longitude },
    });
    revalidatePath("/", "layout");
    return { ok: true as const, message: late && !offDay ? "Checked in — marked late today." : "Checked in. Have a good day!" };
  },
);

export const checkOut = action(z.object({}), async (_i, v) => {
  const employeeId = me(v);
  const date = today();
  const a = await db.attendance.findUnique({ where: { employeeId_date: { employeeId, date } } });
  if (!a?.checkIn) throw new UserError("Check in first.");
  if (a.checkOut) throw new UserError("You've already checked out today.");
  const now = new Date();
  const shift = await shiftFor(employeeId);
  const gross = Math.round((now.getTime() - a.checkIn.getTime()) / 60000);
  const brk = gross > 5 * 60 ? shift.breakMinutes : 0;
  const work = Math.max(0, gross - brk);
  const early = istMinutes(now) < hmToMinutes(shift.endTime) - 10;
  await db.attendance.update({
    where: { id: a.id },
    data: {
      checkOut: now, breakMinutes: brk, workMinutes: work, overtimeMinutes: Math.max(0, work - (shift.overtimeAfterMin - shift.breakMinutes)), isEarlyExit: early,
      status: a.status === "WFH" ? "WFH" : work < shift.halfDayMinutes ? "HALF_DAY" : a.status,
    },
  });
  revalidatePath("/", "layout");
  return { ok: true as const, message: `Checked out. You worked ${Math.floor(work / 60)}h ${work % 60}m today.` };
});

export const requestCorrection = action(
  z.object({ date: zDate, checkIn: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")), checkOut: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")), reason: zText(500, 5) }),
  async (input, v) => {
    const employeeId = me(v);
    const date = dateOnly(input.date);
    if (date > today()) throw new UserError("You can only correct past or today's attendance.");
    if (!input.checkIn && !input.checkOut) throw new UserError("Enter a check-in or check-out time.");
    const toInstant = (hm: string) => new Date(`${input.date}T${hm}:00+05:30`);
    const emp = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
    const att = await db.attendance.findUnique({ where: { employeeId_date: { employeeId, date } } });
    if (await db.attendanceCorrection.findFirst({ where: { employeeId, date, status: "PENDING" } })) throw new UserError("You already have a pending correction for that day.");
    const c = await db.attendanceCorrection.create({
      data: { employeeId, date, attendanceId: att?.id, requestedCheckIn: input.checkIn ? toInstant(input.checkIn) : null, requestedCheckOut: input.checkOut ? toInstant(input.checkOut) : null, reason: input.reason, approverId: emp.managerId },
    });
    if (att) await db.attendance.update({ where: { id: att.id }, data: { status: "PENDING_CORRECTION" } });
    await notifyEmployees([emp.managerId], { type: "attendance.correction", title: `Attendance correction from ${emp.firstName}`, body: `${input.date}: ${input.reason}`, link: "/attendance?tab=approvals" });
    await audit(v, { action: "attendance.correction.request", entity: "AttendanceCorrection", entityId: c.id, summary: `${name(v)} requested an attendance correction for ${input.date}.` });
    revalidatePath("/attendance");
    return { ok: true as const, message: "Correction sent to your manager." };
  },
);

export const decideCorrection = action(
  z.object({ id: zId, decision: z.enum(["APPROVED", "REJECTED"]), note: zOptText(500) }),
  async (input, v) => {
    const c = await db.attendanceCorrection.findUniqueOrThrow({ where: { id: input.id }, include: { employee: true } });
    assertCanApprove(v, c.employeeId);
    if (c.status !== "PENDING") throw new UserError("This request was already decided.");
    await db.attendanceCorrection.update({ where: { id: c.id }, data: { status: input.decision, decisionNote: input.note, decidedAt: new Date(), approverId: v.employeeId } });
    if (input.decision === "REJECTED" && c.attendanceId) {
      const a = await db.attendance.findUnique({ where: { id: c.attendanceId } });
      if (a?.status === "PENDING_CORRECTION") await db.attendance.update({ where: { id: a.id }, data: { status: a.checkIn ? (a.isLate ? "LATE" : "PRESENT") : "ABSENT" } });
    }
    await emit("attendance.correction.decided", { correctionId: c.id, status: input.decision, actorName: name(v) });
    await audit(v, { action: `attendance.correction.${input.decision.toLowerCase()}`, entity: "AttendanceCorrection", entityId: c.id, summary: `${name(v)} ${input.decision === "APPROVED" ? "approved" : "rejected"} ${c.employee.firstName} ${c.employee.lastName}'s attendance correction for ${isoOf(c.date)}.` });
    revalidatePath("/attendance");
    return { ok: true as const, message: input.decision === "APPROVED" ? "Correction approved and applied." : "Correction declined." };
  },
);

export const requestWfh = action(
  z.object({ startDate: zDate, endDate: zDate, reason: zText(300, 3), comment: zOptText(500), attachment: zFile }),
  async (input, v) => {
    const employeeId = me(v);
    const start = dateOnly(input.startDate), end = dateOnly(input.endDate);
    if (end < start) throw new UserError("End date is before start date.");
    if (start < today()) throw new UserError("WFH can't start in the past. Use an attendance correction instead.");
    const overlap = await db.wfhRequest.findFirst({ where: { employeeId, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: end }, endDate: { gte: start } } });
    if (overlap) throw new UserError("You already have a WFH request covering those dates.");
    const shift = await shiftFor(employeeId);
    const holidays = new Set((await db.holiday.findMany({ where: { date: { gte: start, lte: end }, type: { not: "OPTIONAL" } } })).map((h) => isoOf(h.date)));
    const days = countWorkingDays(start, end, shift.weeklyOffs, holidays);
    if (!days) throw new UserError("Those dates are all holidays or weekly offs.");
    const emp = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
    const file = input.attachment ? await storeUpload(input.attachment, `requests/${employeeId}`) : null;
    const w = await db.wfhRequest.create({ data: { employeeId, startDate: start, endDate: end, days, reason: input.reason, comment: input.comment, attachmentKey: file?.storageKey, approverId: emp.managerId } });
    await notifyEmployees([emp.managerId], { type: "wfh.requested", title: `${emp.firstName} requested WFH for ${days} day${days > 1 ? "s" : ""}`, body: input.reason, link: "/attendance?tab=approvals" });
    await audit(v, { action: "wfh.request", entity: "WfhRequest", entityId: w.id, summary: `${name(v)} requested WFH from ${input.startDate} to ${input.endDate}.` });
    revalidatePath("/attendance");
    return { ok: true as const, message: "WFH request sent to your manager." };
  },
);

export const decideWfh = action(
  z.object({ id: zId, decision: z.enum(["APPROVED", "REJECTED"]), note: zOptText(500) }),
  async (input, v) => {
    const w = await db.wfhRequest.findUniqueOrThrow({ where: { id: input.id }, include: { employee: true } });
    assertCanApprove(v, w.employeeId);
    if (w.status !== "PENDING") throw new UserError("This request was already decided.");
    await db.wfhRequest.update({ where: { id: w.id }, data: { status: input.decision, decisionNote: input.note, decidedAt: new Date(), approverId: v.employeeId } });
    await emit("wfh.decided", { wfhId: w.id, status: input.decision, actorName: name(v) });
    await audit(v, { action: `wfh.${input.decision.toLowerCase()}`, entity: "WfhRequest", entityId: w.id, summary: `${name(v)} ${input.decision === "APPROVED" ? "approved" : "rejected"} ${w.employee.firstName} ${w.employee.lastName}'s WFH request.` });
    revalidatePath("/attendance");
    return { ok: true as const, message: input.decision === "APPROVED" ? "WFH approved." : "WFH declined." };
  },
);

export const cancelWfh = action(z.object({ id: zId }), async (input, v) => {
  const w = await db.wfhRequest.findUniqueOrThrow({ where: { id: input.id } });
  if (w.employeeId !== v.employeeId) throw new AuthzError();
  if (w.status !== "PENDING" && !(w.status === "APPROVED" && w.startDate > today())) throw new UserError("Only pending or upcoming requests can be cancelled.");
  await db.wfhRequest.update({ where: { id: w.id }, data: { status: "CANCELLED" } });
  revalidatePath("/attendance");
  return { ok: true as const, message: "WFH request cancelled." };
});

/** HR: directly set a day's status (e.g. mark absent, fix a biometric miss). */
export const hrSetAttendance = action(
  z.object({ employeeId: zId, date: zDate, status: z.enum(["PRESENT", "ABSENT", "LATE", "HALF_DAY", "WFH", "HOLIDAY", "LEAVE", "WEEKEND"]), checkIn: z.string().optional(), checkOut: z.string().optional(), note: zOptText(300) }),
  async (input, v) => {
    assertCan(v, "attendance.manage");
    const date = dateOnly(input.date);
    const ci = input.checkIn ? new Date(`${input.date}T${input.checkIn}:00+05:30`) : null;
    const co = input.checkOut ? new Date(`${input.date}T${input.checkOut}:00+05:30`) : null;
    const work = ci && co ? Math.max(0, Math.round((co.getTime() - ci.getTime()) / 60000) - 60) : 0;
    const before = await db.attendance.findUnique({ where: { employeeId_date: { employeeId: input.employeeId, date } } });
    await db.attendance.upsert({
      where: { employeeId_date: { employeeId: input.employeeId, date } },
      create: { employeeId: input.employeeId, date, status: input.status, checkIn: ci, checkOut: co, workMinutes: work, source: "CORRECTION", note: input.note },
      update: { status: input.status, ...(ci ? { checkIn: ci } : {}), ...(co ? { checkOut: co, workMinutes: work } : {}), source: "CORRECTION", note: input.note },
    });
    const e = await db.employee.findUniqueOrThrow({ where: { id: input.employeeId } });
    await audit(v, { action: "attendance.override", entity: "Attendance", entityId: before?.id, summary: `${name(v)} set ${e.firstName} ${e.lastName}'s attendance on ${input.date} to ${input.status}.`, before: before ? { status: before.status } : null, after: { status: input.status } });
    revalidatePath("/attendance");
    return { ok: true as const, message: "Attendance updated." };
  },
);

export const saveShift = action(
  z.object({ id: z.string().optional(), name: zText(60), startTime: z.string().regex(/^\d{2}:\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/), graceMinutes: z.coerce.number().int().min(0).max(120), halfDayMinutes: z.coerce.number().int().min(60).max(600), fullDayMinutes: z.coerce.number().int().min(120).max(720), overtimeAfterMin: z.coerce.number().int().min(240).max(900), breakMinutes: z.coerce.number().int().min(0).max(180), weeklyOffs: z.array(z.coerce.number().int().min(0).max(6)).default([]), isDefault: zBool }),
  async (input, v) => {
    assertCan(v, "settings.manage");
    const { id, ...data } = input;
    if (data.isDefault) await db.shift.updateMany({ data: { isDefault: false } });
    const s = id ? await db.shift.update({ where: { id }, data }) : await db.shift.create({ data });
    await audit(v, { action: id ? "shift.update" : "shift.create", entity: "Shift", entityId: s.id, summary: `${name(v)} ${id ? "updated" : "created"} the ${s.name} shift.`, after: data });
    revalidatePath("/settings");
    return { ok: true as const, message: "Shift saved." };
  },
);
