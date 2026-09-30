import { db } from "@/lib/db";
import { apiViewer, json } from "@/lib/api";
import { can } from "@/lib/auth/viewer";
import { createEmployee } from "@/server/people";

/** REST: directory listing (work fields only). Same rules as the People page. */
export async function GET(req: Request) {
  const v = await apiViewer();
  if (v instanceof Response) return v;
  if (!can(v, "people.view_directory")) return json({ error: "Forbidden" }, 403);
  const u = new URL(req.url);
  const take = Math.min(100, Number(u.searchParams.get("limit")) || 50);
  const rows = await db.employee.findMany({
    where: { status: can(v, "people.edit") ? { not: "EXITED" } : { in: ["ACTIVE", "PROBATION", "NOTICE_PERIOD"] }, ...(u.searchParams.get("department") ? { departmentId: u.searchParams.get("department")! } : {}) },
    select: { id: true, code: true, firstName: true, lastName: true, workEmail: true, workPhone: true, status: true, joiningDate: true, employmentType: true, managerId: true, department: { select: { id: true, name: true } }, designation: { select: { id: true, name: true } }, location: { select: { id: true, name: true } } },
    orderBy: { code: "asc" }, take, skip: Number(u.searchParams.get("offset")) || 0,
  });
  return json({ data: rows });
}

export async function POST(req: Request) {
  const v = await apiViewer(30);
  if (v instanceof Response) return v;
  if (!can(v, "people.create")) return json({ error: "Forbidden" }, 403);
  const r = await createEmployee(await req.json().catch(() => ({})));
  return json(r, r.ok ? 201 : r.error.includes("permission") ? 403 : 400);
}
