import "server-only";
import { db } from "@/lib/db";
import { can, type Viewer } from "@/lib/auth/viewer";
import { dateOnly, fmtDate, isoOf, today, addDays, minutesToHM } from "@/lib/dates";
import { humanize, num } from "@/lib/utils";
import type { PermissionKey } from "@/lib/permissions";

export type ReportFilters = { from?: string; to?: string; department?: string };
export type ReportResult = { title: string; columns: string[]; rows: (string | number)[][]; chart?: { label: string; value: number }[]; summary?: string };
type ReportDef = { key: string; title: string; group: string; description: string; permission: PermissionKey; run: (f: ReportFilters, v: Viewer) => Promise<ReportResult> };

const range = (f: ReportFilters) => {
  const to = f.to ? dateOnly(f.to) : today();
  const from = f.from ? dateOnly(f.from) : addDays(to, -365);
  return { from, to };
};
const deptWhere = (f: ReportFilters) => (f.department ? { departmentId: f.department } : {});
const countBy = <T,>(items: T[], key: (t: T) => string) => {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const empName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;
const tenureYears = (d: Date, end = today()) => Math.round(((end.getTime() - d.getTime()) / (365.25 * 86400000)) * 10) / 10;

export const REPORTS: ReportDef[] = [
  {
    key: "people", title: "Employee directory", group: "Workforce", description: "Everyone with job details", permission: "people.export",
    run: async (f) => {
      const rows = await db.employee.findMany({ where: { status: { not: "EXITED" }, ...deptWhere(f) }, include: { department: true, designation: true, location: true, manager: true }, orderBy: { code: "asc" } });
      return { title: "Employee directory", columns: ["Employee ID", "Name", "Email", "Phone", "Department", "Designation", "Manager", "Location", "Type", "Status", "Joining date"], rows: rows.map((e) => [e.code, empName(e), e.workEmail, e.workPhone ?? "", e.department?.name ?? "", e.designation?.name ?? "", e.manager ? empName(e.manager) : "", e.location?.name ?? "", humanize(e.employmentType), humanize(e.status), isoOf(e.joiningDate)]) };
    },
  },
  {
    key: "headcount", title: "Headcount by department", group: "Workforce", description: "Current headcount and share", permission: "reports.view",
    run: async () => {
      const d = await db.department.findMany({ include: { _count: { select: { employees: { where: { status: { notIn: ["EXITED", "INACTIVE"] } } } } }, head: true } });
      const total = d.reduce((a, x) => a + x._count.employees, 0);
      const sorted = d.sort((a, b) => b._count.employees - a._count.employees);
      return { title: "Headcount by department", columns: ["Department", "Head", "Headcount", "Share"], rows: sorted.map((x) => [x.name, x.head ? empName(x.head) : "", x._count.employees, `${Math.round((x._count.employees / Math.max(total, 1)) * 100)}%`]), chart: sorted.map((x) => ({ label: x.name, value: x._count.employees })), summary: `${total} people across ${d.length} departments` };
    },
  },
  {
    key: "gender", title: "Gender distribution", group: "Workforce", description: "By department", permission: "reports.view",
    run: async (f) => {
      const e = await db.employee.findMany({ where: { status: { notIn: ["EXITED", "INACTIVE"] }, ...deptWhere(f) }, include: { department: true } });
      const depts = [...new Set(e.map((x) => x.department?.name ?? "—"))].sort();
      const g = (d: string, s: string) => e.filter((x) => (x.department?.name ?? "—") === d && x.gender === s).length;
      return { title: "Gender distribution", columns: ["Department", "Women", "Men", "Non-binary", "Undisclosed", "Total"], rows: depts.map((d) => [d, g(d, "FEMALE"), g(d, "MALE"), g(d, "NON_BINARY"), g(d, "UNDISCLOSED"), e.filter((x) => (x.department?.name ?? "—") === d).length]), chart: countBy(e, (x) => humanize(x.gender === "UNDISCLOSED" ? "Undisclosed" : x.gender)).map(([label, value]) => ({ label, value })) };
    },
  },
  {
    key: "joiners", title: "New joiners", group: "Lifecycle", description: "Joined in the date range", permission: "reports.view",
    run: async (f) => {
      const { from, to } = range(f);
      const e = await db.employee.findMany({ where: { joiningDate: { gte: from, lte: to }, ...deptWhere(f) }, include: { department: true, designation: true, manager: true }, orderBy: { joiningDate: "desc" } });
      return { title: "New joiners", columns: ["Employee ID", "Name", "Department", "Designation", "Manager", "Joined", "Status"], rows: e.map((x) => [x.code, empName(x), x.department?.name ?? "", x.designation?.name ?? "", x.manager ? empName(x.manager) : "", isoOf(x.joiningDate), humanize(x.status)]), summary: `${e.length} joined between ${fmtDate(from)} and ${fmtDate(to)}` };
    },
  },
  {
    key: "exits", title: "Exits & turnover", group: "Lifecycle", description: "Resignations and exits with turnover rate", permission: "reports.view",
    run: async (f) => {
      const { from, to } = range(f);
      const [ex, all] = await Promise.all([
        db.offboarding.findMany({ where: { resignationDate: { gte: from, lte: to }, employee: deptWhere(f) }, include: { employee: { include: { department: true, designation: true } } }, orderBy: { resignationDate: "desc" } }),
        db.employee.count({ where: { joiningDate: { lte: to }, OR: [{ exitDate: null }, { exitDate: { gte: from } }], ...deptWhere(f) } }),
      ]);
      const rate = all ? Math.round((ex.filter((x) => x.stage !== "WITHDRAWN" && x.stage !== "REJECTED").length / all) * 1000) / 10 : 0;
      return { title: "Exits & turnover", columns: ["Name", "Department", "Designation", "Type", "Resigned", "Last day", "Stage", "Tenure (yrs)", "Reason"], rows: ex.map((x) => [empName(x.employee), x.employee.department?.name ?? "", x.employee.designation?.name ?? "", humanize(x.exitType), isoOf(x.resignationDate), isoOf(x.lastWorkingDay ?? x.requestedLastDay), humanize(x.stage), tenureYears(x.employee.joiningDate, x.resignationDate), x.reason]), summary: `Turnover ${rate}% over the period (${ex.length} exits, average headcount ~${all})` };
    },
  },
  {
    key: "tenure", title: "Employee tenure", group: "Workforce", description: "How long people have been at Rosier", permission: "reports.view",
    run: async (f) => {
      const e = await db.employee.findMany({ where: { status: { in: ["ACTIVE", "PROBATION", "NOTICE_PERIOD"] }, ...deptWhere(f) }, include: { department: true }, orderBy: { joiningDate: "asc" } });
      const band = (y: number) => (y < 1 ? "< 1 year" : y < 2 ? "1–2 years" : y < 3 ? "2–3 years" : y < 5 ? "3–5 years" : "5+ years");
      const order = ["< 1 year", "1–2 years", "2–3 years", "3–5 years", "5+ years"];
      return { title: "Employee tenure", columns: ["Name", "Department", "Joined", "Tenure (yrs)", "Band"], rows: e.map((x) => [empName(x), x.department?.name ?? "", isoOf(x.joiningDate), tenureYears(x.joiningDate), band(tenureYears(x.joiningDate))]), chart: order.map((b) => ({ label: b, value: e.filter((x) => band(tenureYears(x.joiningDate)) === b).length })) };
    },
  },
  {
    key: "location", title: "By location & employment type", group: "Workforce", description: "Where people work and how they're employed", permission: "reports.view",
    run: async (f) => {
      const e = await db.employee.findMany({ where: { status: { notIn: ["EXITED", "INACTIVE"] }, ...deptWhere(f) }, include: { location: true } });
      const locs = [...new Set(e.map((x) => x.location?.name ?? "—"))];
      const types = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "CONSULTANT"];
      return { title: "By location & employment type", columns: ["Location", ...types.map(humanize), "Total"], rows: locs.map((l) => [l, ...types.map((t) => e.filter((x) => (x.location?.name ?? "—") === l && x.employmentType === t).length), e.filter((x) => (x.location?.name ?? "—") === l).length]), chart: countBy(e, (x) => x.location?.name ?? "—").map(([label, value]) => ({ label, value })) };
    },
  },
  {
    key: "attendance", title: "Attendance summary", group: "Time", description: "Per-person present, late, WFH, absent and hours", permission: "attendance.manage",
    run: async (f) => {
      const to = f.to ? dateOnly(f.to) : today();
      const from = f.from ? dateOnly(f.from) : addDays(to, -30);
      const [emps, rows] = await Promise.all([db.employee.findMany({ where: { status: { in: ["ACTIVE", "PROBATION", "NOTICE_PERIOD"] }, ...deptWhere(f) }, include: { department: true }, orderBy: { firstName: "asc" } }), db.attendance.findMany({ where: { date: { gte: from, lte: to } } })]);
      return {
        title: "Attendance summary", columns: ["Name", "Department", "Present", "Late", "WFH", "Half day", "Leave", "Absent", "Avg hours", "Overtime"],
        rows: emps.map((e) => { const r = rows.filter((x) => x.employeeId === e.id); const w = r.filter((x) => x.workMinutes > 0); return [empName(e), e.department?.name ?? "", r.filter((x) => ["PRESENT", "LATE"].includes(x.status)).length, r.filter((x) => x.isLate).length, r.filter((x) => x.status === "WFH").length, r.filter((x) => x.status === "HALF_DAY").length, r.filter((x) => x.status === "LEAVE").length, r.filter((x) => x.status === "ABSENT").length, minutesToHM(w.length ? Math.round(w.reduce((a, x) => a + x.workMinutes, 0) / w.length) : 0), minutesToHM(r.reduce((a, x) => a + x.overtimeMinutes, 0))]; }),
        summary: `${fmtDate(from)} – ${fmtDate(to)}`,
      };
    },
  },
  {
    key: "leave", title: "Leave report", group: "Time", description: "Balances and usage by leave type", permission: "leave.manage",
    run: async (f) => {
      const year = f.to ? Number(f.to.slice(0, 4)) : today().getUTCFullYear();
      const [types, bal] = await Promise.all([db.leaveType.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }), db.leaveBalance.findMany({ where: { year, employee: { status: { notIn: ["EXITED"] }, ...deptWhere(f) } }, include: { employee: { include: { department: true } } } })]);
      const people = [...new Map(bal.map((b) => [b.employeeId, b.employee])).values()].sort((a, b) => a.firstName.localeCompare(b.firstName));
      return { title: `Leave report ${year}`, columns: ["Name", "Department", ...types.flatMap((t) => [`${t.code} used`, `${t.code} left`])], rows: people.map((p) => [empName(p), p.department?.name ?? "", ...types.flatMap((t) => { const b = bal.find((x) => x.employeeId === p.id && x.leaveTypeId === t.id); return b ? [b.used, b.allocated + b.carriedForward - b.used - b.pending] : [0, 0]; })]), chart: types.map((t) => ({ label: t.name, value: bal.filter((b) => b.leaveTypeId === t.id).reduce((a, b) => a + b.used, 0) })) };
    },
  },
  {
    key: "wfh", title: "Work from home", group: "Time", description: "WFH requests in the range", permission: "attendance.manage",
    run: async (f) => {
      const { from, to } = range(f);
      const w = await db.wfhRequest.findMany({ where: { startDate: { gte: from, lte: to }, employee: deptWhere(f) }, include: { employee: { include: { department: true } }, approver: true }, orderBy: { startDate: "desc" } });
      return { title: "Work from home", columns: ["Name", "Department", "From", "To", "Days", "Reason", "Status", "Approver"], rows: w.map((x) => [empName(x.employee), x.employee.department?.name ?? "", isoOf(x.startDate), isoOf(x.endDate), x.days, x.reason, humanize(x.status), x.approver ? empName(x.approver) : ""]), chart: countBy(w.filter((x) => x.status === "APPROVED"), (x) => x.employee.department?.name ?? "—").map(([label, value]) => ({ label, value })) };
    },
  },
  {
    key: "payroll", title: "Payroll register", group: "Pay", description: "Month-wise gross, deductions and net", permission: "payroll.view_all",
    run: async () => {
      const runs = await db.payrollRun.findMany({ include: { payslips: true }, orderBy: { month: "desc" } });
      const s = (r: (typeof runs)[number], k: "gross" | "totalDeductions" | "net" | "pf" | "tds") => Math.round(r.payslips.reduce((a, p) => a + num(p[k]), 0));
      return { title: "Payroll register", columns: ["Month", "Status", "Employees", "Gross", "PF", "TDS", "Total deductions", "Net pay"], rows: runs.map((r) => [r.month, humanize(r.status), r.payslips.length, s(r, "gross"), s(r, "pf"), s(r, "tds"), s(r, "totalDeductions"), s(r, "net")]), chart: [...runs].reverse().filter((r) => r.payslips.length).map((r) => ({ label: r.month, value: s(r, "gross") })) };
    },
  },
  {
    key: "salary", title: "Salary by employee", group: "Pay", description: "CTC and monthly structure (confidential)", permission: "payroll.view_all",
    run: async (f) => {
      const p = await db.payrollProfile.findMany({ where: { employee: { status: { notIn: ["EXITED"] }, ...deptWhere(f) } }, include: { employee: { include: { department: true, designation: true } } }, orderBy: { annualCtc: "desc" } });
      return { title: "Salary by employee", columns: ["Employee ID", "Name", "Department", "Designation", "Annual CTC", "Basic / mo", "HRA / mo", "Special / mo", "PF", "ESI"], rows: p.map((x) => [x.employee.code, empName(x.employee), x.employee.department?.name ?? "", x.employee.designation?.name ?? "", num(x.annualCtc), num(x.monthlyBasic), num(x.monthlyHra), num(x.monthlySpecial), x.pfEnabled ? "Yes" : "No", x.esiEnabled ? "Yes" : "No"]) };
    },
  },
  {
    key: "documents", title: "Document compliance", group: "Compliance", description: "Missing, pending and expiring documents", permission: "documents.manage",
    run: async (f) => {
      const [emps, mandatory, docs] = await Promise.all([db.employee.findMany({ where: { status: { notIn: ["EXITED", "INACTIVE"] }, ...deptWhere(f) }, orderBy: { firstName: "asc" } }), db.documentType.findMany({ where: { isMandatory: true } }), db.employeeDocument.findMany({ where: { archivedAt: null }, include: { type: true } })]);
      const rows: (string | number)[][] = [];
      for (const e of emps) {
        const mine = docs.filter((d) => d.employeeId === e.id);
        for (const t of mandatory) if (!mine.some((d) => d.typeId === t.id && d.status !== "REJECTED")) rows.push([empName(e), e.code, t.name, "Missing", ""]);
        for (const d of mine) {
          if (d.status === "PENDING") rows.push([empName(e), e.code, d.name, "Awaiting verification", ""]);
          if (d.status === "REJECTED") rows.push([empName(e), e.code, d.name, "Rejected — re-upload needed", ""]);
          if (d.expiryDate && d.expiryDate <= addDays(today(), 30)) rows.push([empName(e), e.code, d.name, d.expiryDate < today() ? "Expired" : "Expiring", isoOf(d.expiryDate)]);
        }
      }
      return { title: "Document compliance", columns: ["Name", "Employee ID", "Document", "Issue", "Expiry"], rows, chart: countBy(rows, (r) => String(r[3])).map(([label, value]) => ({ label, value })), summary: `${rows.length} items need attention` };
    },
  },
  {
    key: "assets", title: "Asset register", group: "Compliance", description: "All assets with holder and warranty", permission: "assets.manage",
    run: async () => {
      const a = await db.asset.findMany({ include: { category: true, holder: true }, orderBy: { tag: "asc" } });
      return { title: "Asset register", columns: ["Asset ID", "Category", "Brand", "Model", "Serial", "Status", "Condition", "Holder", "Purchased", "Price", "Warranty until"], rows: a.map((x) => [x.tag, x.category.name, x.brand, x.model, x.serialNumber ?? "", humanize(x.status), humanize(x.condition), x.holder ? empName(x.holder) : "", x.purchaseDate ? isoOf(x.purchaseDate) : "", num(x.purchasePrice), x.warrantyUntil ? isoOf(x.warrantyUntil) : ""]), chart: countBy(a, (x) => x.category.name).map(([label, value]) => ({ label, value })) };
    },
  },
  {
    key: "performance", title: "Performance ratings", group: "Performance", description: "Review status and ratings per cycle", permission: "performance.manage",
    run: async (f) => {
      const r = await db.performanceReview.findMany({ where: { employee: deptWhere(f) }, include: { cycle: true, employee: { include: { department: true } }, reviewer: true }, orderBy: [{ cycle: { startDate: "desc" } }] });
      return { title: "Performance ratings", columns: ["Cycle", "Name", "Department", "Reviewer", "Status", "Self", "Manager", "Final"], rows: r.map((x) => [x.cycle.name, empName(x.employee), x.employee.department?.name ?? "", x.reviewer ? empName(x.reviewer) : "", humanize(x.status), x.selfRating ?? "", x.managerRating ?? "", x.finalRating ?? ""]), chart: [1, 2, 3, 4, 5].map((n) => ({ label: `${n}★`, value: r.filter((x) => x.finalRating === n).length })) };
    },
  },
  {
    key: "onboarding", title: "Onboarding progress", group: "Lifecycle", description: "Checklist completion for new joiners", permission: "onboarding.manage",
    run: async () => {
      const o = await db.onboarding.findMany({ include: { employee: { include: { department: true } }, tasks: true }, orderBy: { startDate: "desc" } });
      return { title: "Onboarding progress", columns: ["Name", "Department", "Joining", "Status", "Tasks done", "Overdue tasks"], rows: o.map((x) => [empName(x.employee), x.employee.department?.name ?? "", isoOf(x.startDate), humanize(x.status), `${x.tasks.filter((t) => t.status === "DONE").length}/${x.tasks.length}`, x.tasks.filter((t) => t.status !== "DONE" && t.dueDate && t.dueDate < today()).length]) };
    },
  },
];

export function reportsFor(v: Viewer) {
  return REPORTS.filter((r) => can(v, r.permission));
}

export async function runReport(v: Viewer, key: string, f: ReportFilters) {
  const r = REPORTS.find((x) => x.key === key);
  if (!r || !can(v, r.permission)) return null;
  return r.run(f, v);
}
