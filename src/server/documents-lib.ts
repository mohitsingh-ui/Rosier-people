import "server-only";
import { db } from "@/lib/db";
import { can, type Viewer } from "@/lib/auth/viewer";
import { fmtDate, today } from "@/lib/dates";
import { inr } from "@/lib/utils";
import { companySettings } from "./queries";
import type { DocumentVisibility } from "@/generated/prisma/enums";

// Not a "use server" module on purpose: nothing here is callable from the browser.

/** The single rule for who may see a document. */
export function canSeeDocument(v: Viewer, doc: { employeeId: string; visibility: DocumentVisibility }) {
  if (can(v, "documents.manage")) return true;
  if (doc.employeeId === v.employeeId) return doc.visibility !== "HR_ONLY";
  if (can(v, "documents.team_view") && v.teamIds.has(doc.employeeId)) return doc.visibility === "MANAGER";
  return false;
}

/** Builds the variable map for a letter. Salary only resolves for people allowed to see payroll. */
export async function letterVariables(v: Viewer, employeeId: string, extra: Record<string, string | undefined> = {}) {
  const e = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, include: { designation: true, department: true, location: true, manager: true, payrollProfile: can(v, "payroll.view_all") } });
  const company = await companySettings();
  const ctc = e.payrollProfile ? Number(e.payrollProfile.annualCtc) : null;
  return {
    employee_name: `${e.firstName} ${e.lastName}`, first_name: e.firstName, employee_id: e.code, designation: e.designation?.name, department: e.department?.name, location: e.location?.name,
    joining_date: fmtDate(e.joiningDate), confirmation_date: e.confirmationDate ? fmtDate(e.confirmationDate) : undefined, exit_date: e.exitDate ? fmtDate(e.exitDate) : undefined,
    manager_name: e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : undefined, annual_ctc: ctc ? inr(ctc) : undefined, salary: ctc ? inr(ctc) : undefined,
    monthly_gross: ctc ? inr(ctc / 12) : undefined, company_name: company.name, today: fmtDate(today()), effective_date: fmtDate(today()), hr_name: v.employee ? `${v.employee.firstName} ${v.employee.lastName}` : "HR",
    ...Object.fromEntries(Object.entries(extra).filter(([, x]) => x)),
  } as Record<string, string | undefined>;
}

