import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { can, type Viewer } from "@/lib/auth/viewer";
import { addDays, daysUntilNextOccurrence, today, todayISO } from "@/lib/dates";

export const companySettings = cache(async () => {
  const s = await db.setting.findUnique({ where: { key: "company" } });
  return (s?.value ?? { name: "Rosier Foods Private Limited", shortName: "Rosier Foods", address: "Ghaziabad, Uttar Pradesh", email: "people@rosierfoods.com" }) as { name: string; shortName: string; address: string; email: string; phone?: string; cin?: string; website?: string };
});

export async function setting<T>(key: string, fallback: T): Promise<T> {
  const s = await db.setting.findUnique({ where: { key } });
  return (s?.value as T) ?? fallback;
}

export async function leaveBalances(employeeId: string, year = today().getUTCFullYear()) {
  const rows = await db.leaveBalance.findMany({ where: { employeeId, year, leaveType: { isActive: true } }, include: { leaveType: true }, orderBy: { leaveType: { name: "asc" } } });
  const order = ["CL", "SL", "EL", "OH", "CO", "LOP"];
  return rows
    .map((b) => ({ ...b, available: b.allocated + b.carriedForward - b.used - b.pending }))
    .sort((a, b) => (order.indexOf(a.leaveType.code) + 99 * +(order.indexOf(a.leaveType.code) < 0)) - (order.indexOf(b.leaveType.code) + 99 * +(order.indexOf(b.leaveType.code) < 0)));
}

export async function todaysAttendance(employeeId: string) {
  return db.attendance.findUnique({ where: { employeeId_date: { employeeId, date: today() } } });
}

export async function upcomingHolidays(limit = 4) {
  return db.holiday.findMany({ where: { date: { gte: today() } }, orderBy: { date: "asc" }, take: limit });
}

/** Birthdays show day and month only; the year of birth is never exposed here. */
export async function upcomingCelebrations(days = 30, scopeIds?: string[]) {
  const people = await db.employee.findMany({
    where: { status: { in: ["ACTIVE", "PROBATION", "NOTICE_PERIOD"] }, ...(scopeIds ? { id: { in: scopeIds } } : {}) },
    select: { id: true, firstName: true, lastName: true, photoUrl: true, dateOfBirth: true, joiningDate: true, designation: { select: { name: true } } },
  });
  const t = today();
  const out: { id: string; kind: "birthday" | "anniversary"; date: Date; days: number; years?: number; person: (typeof people)[number] }[] = [];
  for (const p of people) {
    if (p.dateOfBirth) {
      const n = daysUntilNextOccurrence(p.dateOfBirth, t);
      if (n.days <= days) out.push({ id: `b-${p.id}`, kind: "birthday", date: n.date, days: n.days, person: p });
    }
    const a = daysUntilNextOccurrence(p.joiningDate, t);
    const years = a.date.getUTCFullYear() - p.joiningDate.getUTCFullYear();
    if (a.days <= days && years >= 1) out.push({ id: `a-${p.id}`, kind: "anniversary", date: a.date, days: a.days, years, person: p });
  }
  return out.sort((a, b) => a.days - b.days);
}

export async function visibleAnnouncements(v: Viewer, take = 5) {
  const now = new Date();
  return db.announcement.findMany({
    where: {
      publishAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      AND: [{ OR: [{ audience: "ALL" }, { departmentId: v.employee?.departmentId ?? "__none__" }, ...(can(v, "announcements.manage") ? [{ audience: "DEPARTMENT" }] : [])] }],
    },
    include: { author: { select: { firstName: true, lastName: true, photoUrl: true, id: true } }, department: { select: { name: true } } },
    orderBy: [{ pinned: "desc" }, { publishAt: "desc" }],
    take,
  });
}

/** Everything waiting on this viewer's decision. Each list is scoped server-side. */
export async function pendingApprovals(v: Viewer) {
  const team = [...v.teamIds];
  const leaveWhere = can(v, "leave.manage") ? {} : { employeeId: { in: team } };
  const attWhere = can(v, "attendance.manage") ? {} : { employeeId: { in: team } };
  const [leave, corrections, wfh, expenses, finance, documents] = await Promise.all([
    can(v, "leave.approve_team") || can(v, "leave.manage") ? db.leaveRequest.count({ where: { status: "PENDING", ...leaveWhere, NOT: { employeeId: v.employeeId ?? "" } } }) : 0,
    can(v, "attendance.approve_team") ? db.attendanceCorrection.count({ where: { status: "PENDING", ...attWhere, NOT: { employeeId: v.employeeId ?? "" } } }) : 0,
    can(v, "attendance.approve_team") ? db.wfhRequest.count({ where: { status: "PENDING", ...attWhere, NOT: { employeeId: v.employeeId ?? "" } } }) : 0,
    can(v, "expenses.approve_team") ? db.expense.count({ where: { status: "PENDING", employeeId: { in: team } } }) : 0,
    can(v, "expenses.finance") ? db.expense.count({ where: { status: "MANAGER_APPROVED" } }) : 0,
    can(v, "documents.manage") ? db.employeeDocument.count({ where: { status: "PENDING", archivedAt: null } }) : 0,
  ]);
  return { leave, corrections, wfh, expenses, finance, documents, total: leave + corrections + wfh + expenses + finance + documents };
}

export async function expiringDocuments(withinDays = 30) {
  return db.employeeDocument.findMany({
    where: { archivedAt: null, expiryDate: { not: null, lte: addDays(today(), withinDays) }, employee: { status: { not: "EXITED" } } },
    include: { employee: { select: { id: true, firstName: true, lastName: true, code: true, photoUrl: true } }, type: true },
    orderBy: { expiryDate: "asc" },
  });
}

export function expiryState(d: Date | null) {
  if (!d) return null;
  const days = Math.round((d.getTime() - today().getTime()) / 86400000);
  if (days < 0) return { label: "Expired", tone: "bad" as const, days };
  if (days <= 7) return { label: `Expires in ${days}d`, tone: "bad" as const, days };
  if (days <= 15) return { label: `Expires in ${days}d`, tone: "warn" as const, days };
  if (days <= 30) return { label: `Expires in ${days}d`, tone: "warn" as const, days };
  return { label: "Valid", tone: "ok" as const, days };
}

export async function teamToday(ids: string[]) {
  const t = today();
  const [people, att, leave, wfh] = await Promise.all([
    db.employee.findMany({ where: { id: { in: ids }, status: { notIn: ["EXITED", "PREBOARDING"] } }, select: { id: true, firstName: true, lastName: true, photoUrl: true, designation: { select: { name: true } } } }),
    db.attendance.findMany({ where: { employeeId: { in: ids }, date: t } }),
    db.leaveRequest.findMany({ where: { employeeId: { in: ids }, status: "APPROVED", startDate: { lte: t }, endDate: { gte: t } }, include: { leaveType: true } }),
    db.wfhRequest.findMany({ where: { employeeId: { in: ids }, status: "APPROVED", startDate: { lte: t }, endDate: { gte: t } } }),
  ]);
  const attBy = new Map(att.map((a) => [a.employeeId, a]));
  const leaveBy = new Map(leave.map((l) => [l.employeeId, l]));
  const wfhBy = new Set(wfh.map((w) => w.employeeId));
  const isOff = t.getUTCDay() === 0;
  return people.map((p) => {
    const a = attBy.get(p.id);
    const l = leaveBy.get(p.id);
    const state = l && l.halfDay === "NONE" ? "LEAVE" : a?.checkIn ? (wfhBy.has(p.id) || a.status === "WFH" ? "WFH" : a.isLate ? "LATE" : "PRESENT") : wfhBy.has(p.id) ? "WFH_NOT_IN" : isOff ? "WEEKEND" : "NOT_IN";
    return { ...p, state, attendance: a, leave: l };
  });
}

export const monthKey = () => todayISO().slice(0, 7);
