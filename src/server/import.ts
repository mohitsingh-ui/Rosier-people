"use server";
import { z } from "zod";
import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { action, UserError } from "@/lib/action";
import { assertCan, type Viewer } from "@/lib/auth/viewer";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/workflow";
import { hashPassword } from "@/lib/auth/password";
import { randomToken } from "@/lib/crypto";
import { dateOnly } from "@/lib/dates";
import "./workflows";

export type ImportRow = { row: number; code: string; firstName: string; lastName: string; email: string; phone: string; department: string; designation: string; manager: string; location: string; joiningDate: string; employmentType: string; status: string; errors: string[] };

const HEADERS = ["Employee ID", "First Name", "Last Name", "Email", "Phone", "Department", "Designation", "Manager", "Location", "Joining Date", "Employment Type", "Status"];
const TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "CONSULTANT"];
const STATUSES = ["PREBOARDING", "PROBATION", "ACTIVE"];

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "text" in v) return String(v.text);
  if (typeof v === "object" && "result" in v) return String(v.result ?? "");
  return String(v).trim();
}

function normDate(s: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // DD/MM/YYYY (Indian format)
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return s;
}

async function parse(file: File): Promise<string[][]> {
  const buf = Buffer.from(await file.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  if (file.name.toLowerCase().endsWith(".csv")) {
    const { Readable } = await import("node:stream");
    await wb.csv.read(Readable.from(buf));
  } else await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new UserError("The file has no sheets.");
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (r) => rows.push(Array.from({ length: HEADERS.length }, (_, i) => cellText(r.getCell(i + 1).value))));
  return rows;
}

/** Validates every row against the database without writing anything. */
async function validate(raw: string[][]): Promise<ImportRow[]> {
  const header = raw[0]?.map((h) => h.toLowerCase().trim());
  if (!header || header[1] !== "first name" || header[3] !== "email") throw new UserError("Use the template — the columns don't match.");
  const [depts, desigs, locs, emps, users] = await Promise.all([db.department.findMany(), db.designation.findMany(), db.location.findMany(), db.employee.findMany({ select: { id: true, code: true, workEmail: true } }), db.user.findMany({ select: { email: true } })]);
  const lc = (s: string) => s.toLowerCase().trim();
  const seenEmail = new Set<string>(), seenCode = new Set<string>();
  const fileCodes = new Set(raw.slice(1).map((r) => r[0].toUpperCase()).filter(Boolean));
  return raw.slice(1).filter((r) => r.some((c) => c)).slice(0, 1000).map((r, i) => {
    const [code, firstName, lastName, email, phone, department, designation, manager, location, joining, type, status] = r;
    const row: ImportRow = { row: i + 2, code: code.toUpperCase(), firstName, lastName, email: lc(email), phone, department, designation, manager, location, joiningDate: normDate(joining), employmentType: (type || "FULL_TIME").toUpperCase().replace(/[\s-]/g, "_"), status: (status || "PREBOARDING").toUpperCase().replace(/\s/g, "_"), errors: [] };
    if (!firstName) row.errors.push("First name is missing");
    if (!lastName) row.errors.push("Last name is missing");
    if (!/^\S+@\S+\.\S+$/.test(row.email)) row.errors.push("Email is invalid");
    else if (users.some((u) => u.email === row.email) || seenEmail.has(row.email)) row.errors.push("Email already exists");
    seenEmail.add(row.email);
    if (row.code) {
      if (!/^[A-Z]{2,5}-\d{1,6}$/.test(row.code)) row.errors.push("Employee ID should look like ROS-027");
      else if (emps.some((e) => e.code === row.code) || seenCode.has(row.code)) row.errors.push("Employee ID already exists");
      seenCode.add(row.code);
    }
    if (!depts.some((d) => lc(d.name) === lc(department))) row.errors.push(`Unknown department "${department}"`);
    if (!desigs.some((d) => lc(d.name) === lc(designation))) row.errors.push(`Unknown designation "${designation}"`);
    if (!locs.some((l) => lc(l.name) === lc(location))) row.errors.push(`Unknown location "${location}"`);
    if (manager && !emps.some((e) => e.code === manager.toUpperCase() || lc(e.workEmail) === lc(manager)) && !fileCodes.has(manager.toUpperCase())) row.errors.push(`Manager "${manager}" not found (use their Employee ID or email)`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.joiningDate) || isNaN(Date.parse(row.joiningDate))) row.errors.push("Joining date should be YYYY-MM-DD or DD/MM/YYYY");
    if (!TYPES.includes(row.employmentType)) row.errors.push(`Employment type must be one of ${TYPES.join(", ")}`);
    if (!STATUSES.includes(row.status)) row.errors.push(`Status must be one of ${STATUSES.join(", ")}`);
    return row;
  });
}

export const previewImport = action(z.object({ file: z.instanceof(File) }), async (input, v) => {
  assertCan(v, "people.import");
  if (input.file.size > 5 * 1024 * 1024) throw new UserError("Keep the file under 5 MB.");
  if (!/\.(csv|xlsx)$/i.test(input.file.name)) throw new UserError("Upload a .csv or .xlsx file.");
  const rows = await validate(await parse(input.file));
  if (!rows.length) throw new UserError("No employee rows found.");
  return { ok: true as const, data: { rows, fileName: input.file.name } };
});

/** Re-validates on the server (never trusts the preview) then creates everyone. */
export const confirmImport = action(z.object({ file: z.instanceof(File), sendInvites: z.string().optional() }), async (input, v: Viewer) => {
  assertCan(v, "people.import");
  const rows = await validate(await parse(input.file));
  const bad = rows.filter((r) => r.errors.length);
  if (bad.length) throw new UserError(`${bad.length} row(s) still have errors. Fix them and upload again.`);
  const [depts, desigs, locs, role, shift] = await Promise.all([db.department.findMany(), db.designation.findMany(), db.location.findMany(), db.role.findUniqueOrThrow({ where: { key: "EMPLOYEE" } }), db.shift.findFirst({ where: { isDefault: true } })]);
  const lc = (s: string) => s.toLowerCase().trim();
  let n = Math.max(0, ...(await db.employee.findMany({ select: { code: true } })).map((e) => Number(e.code.replace(/\D/g, "")) || 0));
  const created: { id: string; row: ImportRow }[] = [];
  for (const r of rows) {
    const code = r.code || `ROS-${String(++n).padStart(3, "0")}`;
    const e = await db.employee.create({
      data: {
        code, firstName: r.firstName, lastName: r.lastName, workEmail: r.email, workPhone: r.phone || null, departmentId: depts.find((d) => lc(d.name) === lc(r.department))!.id,
        designationId: desigs.find((d) => lc(d.name) === lc(r.designation))!.id, locationId: locs.find((l) => lc(l.name) === lc(r.location))!.id, joiningDate: dateOnly(r.joiningDate),
        employmentType: r.employmentType as never, status: r.status as never, shiftId: shift?.id, personal: { create: {} },
        jobHistory: { create: { type: "JOINED", toValue: "Joined Rosier Foods (bulk import)", effectiveDate: dateOnly(r.joiningDate), createdById: v.userId } },
      },
    });
    await db.user.create({ data: { email: r.email, passwordHash: await hashPassword(randomToken()), roleId: role.id, employeeId: e.id, mustChangePassword: true } });
    created.push({ id: e.id, row: r });
  }
  // Second pass so managers can reference people in the same file
  for (const c of created) {
    if (!c.row.manager) continue;
    const m = await db.employee.findFirst({ where: { OR: [{ code: c.row.manager.toUpperCase() }, { workEmail: lc(c.row.manager) }] } });
    if (m) {
      await db.employee.update({ where: { id: c.id }, data: { managerId: m.id } });
      await db.reportingRelationship.create({ data: { employeeId: c.id, managerId: m.id, startDate: dateOnly(c.row.joiningDate) } });
    }
  }
  for (const c of created) await emit("employee.created", { employeeId: c.id, actorUserId: v.userId });
  await db.importJob.create({ data: { fileName: input.file.name, totalRows: rows.length, createdRows: created.length, createdById: v.userId } });
  await audit(v, { action: "employee.import", entity: "ImportJob", summary: `${v.employee?.firstName ?? v.email} imported ${created.length} employees from ${input.file.name}.` });
  revalidatePath("/people");
  return { ok: true as const, message: `${created.length} employees imported. Onboarding checklists and leave balances were created.` };
});
