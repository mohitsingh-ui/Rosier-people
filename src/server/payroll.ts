"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { action, UserError, zBool, zDate, zFile, zId, zOptText, zText } from "@/lib/action";
import { assertCan, AuthzError, can, type Viewer } from "@/lib/auth/viewer";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/workflow";
import { encrypt, last4 } from "@/lib/crypto";
import { storeUpload } from "@/lib/storage";
import { notifyEmployees } from "@/lib/notify";
import { computePayslip, structureFromCtc } from "@/lib/payroll-calc";
import { dateOnly, isoOf, monthRange } from "@/lib/dates";
import { num } from "@/lib/utils";
import "./workflows";

const who = (v: Viewer) => (v.employee ? `${v.employee.firstName} ${v.employee.lastName}` : v.email);

export const saveSalary = action(
  z.object({
    employeeId: zId, annualCtc: z.coerce.number().min(0).max(1e9), autoStructure: zBool,
    monthlyBasic: z.coerce.number().min(0).optional(), monthlyHra: z.coerce.number().min(0).optional(), monthlySpecial: z.coerce.number().min(0).optional(), monthlyOther: z.coerce.number().min(0).optional(),
    bankName: zOptText(80), accountNumber: z.string().trim().regex(/^\d{9,18}$/, "Account numbers are 9–18 digits").optional().or(z.literal("")),
    ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC looks like HDFC0001234").optional().or(z.literal("")),
    uan: zOptText(20), esicNumber: zOptText(20), pfEnabled: zBool, esiEnabled: zBool, taxRegime: z.enum(["NEW", "OLD"]).default("NEW"), effectiveFrom: zDate,
  }),
  async (i, v) => {
    assertCan(v, "payroll.process");
    const before = await db.payrollProfile.findUnique({ where: { employeeId: i.employeeId } });
    const st = i.autoStructure || i.monthlyBasic == null ? structureFromCtc(i.annualCtc) : { monthlyBasic: i.monthlyBasic ?? 0, monthlyHra: i.monthlyHra ?? 0, monthlySpecial: i.monthlySpecial ?? 0, monthlyOther: i.monthlyOther ?? 0 };
    const data = {
      annualCtc: i.annualCtc, ...st, bankName: i.bankName ?? before?.bankName, ifsc: i.ifsc || before?.ifsc, uan: i.uan ?? before?.uan, esicNumber: i.esicNumber ?? before?.esicNumber,
      pfEnabled: i.pfEnabled, esiEnabled: i.esiEnabled, taxRegime: i.taxRegime, effectiveFrom: dateOnly(i.effectiveFrom),
      ...(i.accountNumber ? { accountNumberEnc: encrypt(i.accountNumber), accountLast4: last4(i.accountNumber) } : {}),
    };
    await db.payrollProfile.upsert({ where: { employeeId: i.employeeId }, create: { employeeId: i.employeeId, ...data }, update: data });
    const e = await db.employee.findUniqueOrThrow({ where: { id: i.employeeId } });
    if (before && num(before.annualCtc) !== i.annualCtc) {
      await db.jobHistory.create({ data: { employeeId: e.id, type: "SALARY_REVISION", fromValue: "Previous CTC", toValue: "Revised CTC", effectiveDate: dateOnly(i.effectiveFrom), createdById: v.userId } });
      await notifyEmployees([e.id], { type: "system", title: "Your salary structure has been updated", link: "/payroll" });
    }
    await audit(v, { action: "payroll.salary", entity: "PayrollProfile", entityId: e.id, summary: `${who(v)} updated ${e.firstName} ${e.lastName}'s salary structure${i.accountNumber ? " and bank account" : ""}.`, before: before ? { annualCtc: num(before.annualCtc) } : null, after: { annualCtc: i.annualCtc } });
    revalidatePath("/payroll");
    return { ok: true as const, message: "Salary saved." };
  },
);

export const createRun = action(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }), async (i, v) => {
  assertCan(v, "payroll.process");
  if (await db.payrollRun.findUnique({ where: { month: i.month } })) throw new UserError("A run for that month already exists.");
  const { start, end } = monthRange(i.month);
  const hol = new Set((await db.holiday.findMany({ where: { date: { gte: start, lte: end }, type: { not: "OPTIONAL" } } })).map((h) => isoOf(h.date)));
  let wd = 0;
  for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) if (d.getUTCDay() !== 0 && !hol.has(isoOf(d))) wd++;
  const r = await db.payrollRun.create({ data: { month: i.month, workingDays: wd } });
  await audit(v, { action: "payroll.create_run", entity: "PayrollRun", entityId: r.id, summary: `${who(v)} opened payroll for ${i.month}.` });
  revalidatePath("/payroll");
  return { ok: true as const, message: `Payroll for ${i.month} created.`, data: { id: r.id } };
});

/** Computes every payslip for the month. Loss of pay = unpaid leave + unexplained absences. */
export const processRun = action(z.object({ id: zId, bonuses: z.string().optional() }), async (i, v) => {
  assertCan(v, "payroll.process");
  const run = await db.payrollRun.findUniqueOrThrow({ where: { id: i.id } });
  if (run.status === "PAID") throw new UserError("This month is already paid and locked.");
  const { start, end } = monthRange(run.month);
  const emps = await db.employee.findMany({ where: { joiningDate: { lte: end }, status: { notIn: ["PREBOARDING"] }, OR: [{ exitDate: null }, { exitDate: { gte: start } }], payrollProfile: { isNot: null } }, include: { payrollProfile: true, location: true } });
  const lop = await db.leaveRequest.findMany({ where: { status: "APPROVED", leaveType: { isPaid: false }, startDate: { lte: end }, endDate: { gte: start } } });
  const absences = await db.attendance.groupBy({ by: ["employeeId"], where: { date: { gte: start, lte: end }, status: "ABSENT" }, _count: true });
  const bonusMap: Record<string, number> = i.bonuses ? JSON.parse(i.bonuses) : {};
  const hol = new Set((await db.holiday.findMany({ where: { date: { gte: start, lte: end }, type: { not: "OPTIONAL" } } })).map((h) => isoOf(h.date)));
  await db.payslip.deleteMany({ where: { runId: run.id } });
  for (const e of emps) {
    const p = e.payrollProfile!;
    // Pro-rate joiners/leavers by counting only their days in the month
    let days = run.workingDays;
    if (e.joiningDate > start || (e.exitDate && e.exitDate < end)) {
      const s = e.joiningDate > start ? e.joiningDate : start, en = e.exitDate && e.exitDate < end ? e.exitDate : end;
      days = 0; for (let d = s; d <= en; d = new Date(d.getTime() + 86400000)) if (d.getUTCDay() !== 0 && !hol.has(isoOf(d))) days++;
    }
    const lopDays = Math.min(days, lop.filter((l) => l.employeeId === e.id).reduce((a, l) => a + l.days, 0) + (absences.find((x) => x.employeeId === e.id)?._count ?? 0) + (run.workingDays - days));
    const r = computePayslip({ monthlyBasic: num(p.monthlyBasic), monthlyHra: num(p.monthlyHra), monthlySpecial: num(p.monthlySpecial), monthlyOther: num(p.monthlyOther), pfEnabled: p.pfEnabled, esiEnabled: p.esiEnabled, annualCtc: num(p.annualCtc), taxRegime: p.taxRegime }, { workingDays: run.workingDays, lopDays, bonus: bonusMap[e.id] ?? 0, state: e.location?.state });
    await db.payslip.create({ data: { runId: run.id, employeeId: e.id, ...r } });
  }
  await db.payrollRun.update({ where: { id: run.id }, data: { status: "PROCESSED", processedAt: new Date(), processedById: v.userId } });
  await emit("payroll.processed", { payslipEmployeeIds: emps.map((e) => e.id), month: run.month });
  await audit(v, { action: "payroll.process", entity: "PayrollRun", entityId: run.id, summary: `${who(v)} processed payroll for ${run.month} (${emps.length} payslips).` });
  revalidatePath("/payroll");
  return { ok: true as const, message: `${emps.length} payslips generated.` };
});

export const markRunPaid = action(z.object({ id: zId }), async (i, v) => {
  assertCan(v, "payroll.process");
  const run = await db.payrollRun.findUniqueOrThrow({ where: { id: i.id } });
  if (run.status !== "PROCESSED") throw new UserError("Process the run first.");
  await db.payrollRun.update({ where: { id: run.id }, data: { status: "PAID", paidAt: new Date() } });
  await audit(v, { action: "payroll.paid", entity: "PayrollRun", entityId: run.id, summary: `${who(v)} marked ${run.month} payroll as paid.` });
  revalidatePath("/payroll");
  return { ok: true as const, message: "Marked as paid and locked." };
});

export const submitTaxDocument = action(
  z.object({ kind: z.enum(["DECLARATION", "INVESTMENT_PROOF", "FORM_16"]), financialYear: z.string().regex(/^\d{4}-\d{2}$/), section: zOptText(20), title: zText(120), amount: z.coerce.number().min(0).max(1e8).optional(), file: zFile, employeeId: z.string().optional() }),
  async (i, v) => {
    const employeeId = i.employeeId && i.employeeId !== v.employeeId ? (assertCan(v, "payroll.process"), i.employeeId) : v.employeeId;
    if (!employeeId) throw new UserError("No employee record.");
    if (i.kind === "FORM_16" && !can(v, "payroll.process")) throw new AuthzError("Form 16 is issued by payroll.");
    if (i.kind === "INVESTMENT_PROOF" && !i.file) throw new UserError("Attach the proof.");
    const file = i.file ? await storeUpload(i.file, `tax/${employeeId}`) : null;
    const t = await db.taxDocument.create({ data: { employeeId, kind: i.kind, financialYear: i.financialYear, section: i.section, title: i.title, amount: i.amount, storageKey: file?.storageKey, status: i.kind === "FORM_16" ? "VERIFIED" : "SUBMITTED" } });
    if (i.kind === "FORM_16") await notifyEmployees([employeeId], { type: "payroll.processed", title: `Your Form 16 for FY ${i.financialYear} is ready`, link: "/payroll?tab=tax", email: true });
    await audit(v, { action: "tax.submit", entity: "TaxDocument", entityId: t.id, summary: `${who(v)} added a ${i.kind.replace("_", " ").toLowerCase()} (${i.title}).` });
    revalidatePath("/payroll");
    return { ok: true as const, message: "Saved." };
  },
);

export const reviewTaxDocument = action(z.object({ id: zId, decision: z.enum(["APPROVED", "REJECTED"]), note: zOptText(300) }), async (i, v) => {
  assertCan(v, "payroll.view_all");
  const t = await db.taxDocument.update({ where: { id: i.id }, data: { status: i.decision === "APPROVED" ? "VERIFIED" : "REJECTED" } });
  await notifyEmployees([t.employeeId], { type: "system", title: `Tax ${t.kind === "DECLARATION" ? "declaration" : "proof"} ${i.decision === "APPROVED" ? "verified" : "needs another look"}`, body: i.note, link: "/payroll?tab=tax" });
  await audit(v, { action: "tax.review", entity: "TaxDocument", entityId: t.id, summary: `${who(v)} ${i.decision === "APPROVED" ? "verified" : "rejected"} tax document "${t.title}".` });
  revalidatePath("/payroll");
  return { ok: true as const, message: "Updated." };
});
