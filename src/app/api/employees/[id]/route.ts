import { db } from "@/lib/db";
import { apiViewer, json } from "@/lib/api";
import { accessFor, can } from "@/lib/auth/viewer";
import { updateJob } from "@/server/people";

/**
 * REST: one employee. The response is assembled field-group by field-group from
 * accessFor(), so changing the id in the URL can never return more than the
 * caller is allowed to see.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await apiViewer();
  if (v instanceof Response) return v;
  const { id } = await params;
  const acc = accessFor(v, id);
  const e = await db.employee.findUnique({ where: { id }, include: { department: true, designation: true, location: true, manager: { select: { id: true, firstName: true, lastName: true } } } });
  if (!e || (acc.relationship === "peer" && !["ACTIVE", "PROBATION", "NOTICE_PERIOD"].includes(e.status))) return json({ error: "Not found" }, 404);
  const out: Record<string, unknown> = {
    id: e.id, code: e.code, firstName: e.firstName, lastName: e.lastName, workEmail: e.workEmail, workPhone: e.workPhone, status: e.status, employmentType: e.employmentType,
    joiningDate: e.joiningDate, department: e.department?.name, designation: e.designation?.name, location: e.location?.name, manager: e.manager, skills: e.skills,
  };
  if (acc.personal) {
    const p = await db.employeePersonal.findUnique({ where: { employeeId: id } });
    out.personal = p && { personalEmail: p.personalEmail, personalPhone: p.personalPhone, address: [p.addressLine1, p.addressLine2, p.city, p.state, p.pin].filter(Boolean).join(", "), dateOfBirth: e.dateOfBirth, bloodGroup: p.bloodGroup };
    if (acc.identity) out.identity = p && { panLast4: p.panLast4, aadhaarLast4: p.aadhaarLast4, passportLast4: p.passportLast4 };
  }
  if (acc.payroll) {
    const pay = await db.payrollProfile.findUnique({ where: { employeeId: id } });
    out.payroll = pay && { bankName: pay.bankName, accountLast4: pay.accountLast4, ifsc: pay.ifsc, annualCtc: Number(pay.annualCtc) };
  }
  return json({ data: out, access: acc.relationship });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await apiViewer(30);
  if (v instanceof Response) return v;
  const { id } = await params;
  if (!can(v, "people.edit")) return json({ error: "Forbidden" }, 403);
  const r = await updateJob({ ...(await req.json().catch(() => ({}))), employeeId: id });
  return json(r, r.ok ? 200 : 400);
}
