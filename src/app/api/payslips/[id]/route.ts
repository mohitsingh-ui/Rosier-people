import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiViewer, json } from "@/lib/api";
import { accessFor } from "@/lib/auth/viewer";
import { payslipPdf } from "@/lib/pdf";
import { fmtDate } from "@/lib/dates";
import { num } from "@/lib/utils";
import { companySettings } from "@/server/queries";
import { audit } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await apiViewer(60);
  if (v instanceof Response) return v;
  const { id } = await params;
  const s = await db.payslip.findUnique({ where: { id }, include: { run: true, employee: { include: { designation: true, department: true, location: true, payrollProfile: true, personal: true } } } });
  // Same answer for "doesn't exist" and "not yours" so ids can't be probed
  if (!s || !accessFor(v, s.employeeId).payroll || s.run.status === "DRAFT") return json({ error: "Not found" }, 404);
  const e = s.employee;
  const pdf = await payslipPdf({
    company: await companySettings(), month: fmtDate(new Date(`${s.run.month}-01T00:00:00Z`), "MMMM yyyy"),
    employee: { name: `${e.firstName} ${e.lastName}`, code: e.code, designation: e.designation?.name ?? "", department: e.department?.name ?? "", location: e.location?.name ?? "", joiningDate: fmtDate(e.joiningDate), pan: e.personal?.panLast4 ? `XXXXXX${e.personal.panLast4}` : "-", uan: e.payrollProfile?.uan ?? "-", bank: e.payrollProfile?.bankName ?? "-", account: e.payrollProfile?.accountLast4 ? `XXXXXXXX${e.payrollProfile.accountLast4}` : "-" },
    paidDays: s.paidDays, lopDays: s.lopDays, workingDays: s.run.workingDays,
    earnings: [["Basic", num(s.basic)], ["House rent allowance", num(s.hra)], ["Special allowance", num(s.special)], ["Other allowances", num(s.other)], ...(num(s.bonus) ? [["Bonus", num(s.bonus)] as [string, number]] : [])],
    deductions: [["Provident fund", num(s.pf)], ["ESI", num(s.esi)], ["Professional tax", num(s.professionalTax)], ["Income tax (TDS)", num(s.tds)], ...(num(s.otherDeductions) ? [["Other", num(s.otherDeductions)] as [string, number]] : [])],
    gross: num(s.gross), totalDeductions: num(s.totalDeductions), net: num(s.net),
  });
  if (s.employeeId !== v.employeeId) await audit(v, { action: "payslip.download", entity: "Payslip", entityId: s.id, summary: `${v.employee?.firstName ?? v.email} downloaded ${e.firstName} ${e.lastName}'s payslip for ${s.run.month}.` });
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="payslip-${e.code}-${s.run.month}.pdf"`, "Cache-Control": "private, no-store" } });
}
