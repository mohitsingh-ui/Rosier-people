import { db } from "@/lib/db";
import { apiViewer, json } from "@/lib/api";
import { can } from "@/lib/auth/viewer";
import type { Prisma } from "@/generated/prisma/client";

// Global search. Every group is scoped to what the caller may see; no sensitive
// field (PAN, Aadhaar, bank, salary, personal address) is ever searched.
export async function GET(req: Request) {
  const v = await apiViewer(90);
  if (v instanceof Response) return v;
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return json({ results: [] });
  const c = { contains: q, mode: "insensitive" as const };
  const hr = can(v, "people.edit");
  const me = v.employeeId ?? "__none__";
  const team = [...v.teamIds];

  const docWhere: Prisma.EmployeeDocumentWhereInput = can(v, "documents.manage")
    ? {}
    : { OR: [{ employeeId: me, visibility: { not: "HR_ONLY" } }, ...(can(v, "documents.team_view") ? [{ employeeId: { in: team }, visibility: "MANAGER" as const }] : [])] };

  const [people, docs, depts, anns, tickets, assets, policies, goals] = await Promise.all([
    can(v, "people.view_directory") ? db.employee.findMany({
      where: {
        status: hr ? { not: "EXITED" } : { in: ["ACTIVE", "PROBATION", "NOTICE_PERIOD"] },
        OR: [{ firstName: c }, { lastName: c }, { code: c }, { workEmail: c }, { workPhone: c }, { department: { name: c } }, { designation: { name: c } }, { location: { name: c } }, { manager: { OR: [{ firstName: c }, { lastName: c }] } }, { skills: { has: q } }],
      },
      select: { id: true, firstName: true, lastName: true, code: true, designation: { select: { name: true } }, department: { select: { name: true } } }, take: 8,
    }) : [],
    db.employeeDocument.findMany({ where: { ...docWhere, archivedAt: null, OR: [{ name: c }, { type: { name: c } }] }, select: { id: true, name: true, employeeId: true, employee: { select: { firstName: true, lastName: true } } }, take: 5 }),
    db.department.findMany({ where: { name: c }, take: 4 }),
    db.announcement.findMany({ where: { publishAt: { lte: new Date() }, OR: [{ title: c }, { body: c }], AND: [{ OR: [{ audience: "ALL" }, { departmentId: v.employee?.departmentId ?? "__none__" }] }] }, take: 4 }),
    db.helpdeskTicket.findMany({ where: { ...(can(v, "helpdesk.manage") ? {} : { createdById: me }), OR: [{ subject: c }, { number: c }] }, take: 4 }),
    db.asset.findMany({ where: { ...(can(v, "assets.manage") ? {} : { holderId: me }), OR: [{ tag: c }, { brand: c }, { model: c }, { serialNumber: c }] }, take: 4 }),
    db.policy.findMany({ where: { OR: [{ title: c }, { body: c }] }, take: 3 }),
    db.goal.findMany({ where: { ...(can(v, "goals.view_all") ? {} : { ownerId: { in: [me, ...team] } }), title: c }, include: { owner: { select: { firstName: true } } }, take: 4 }),
  ]);

  const results = [
    ...people.map((p) => ({ group: "People", title: `${p.firstName} ${p.lastName}`, subtitle: `${p.code} · ${p.designation?.name ?? ""} · ${p.department?.name ?? ""}`, href: `/people/${p.id}` })),
    ...docs.map((d) => ({ group: "Documents", title: d.name, subtitle: d.employeeId === v.employeeId ? "Your documents" : `${d.employee.firstName} ${d.employee.lastName}`, href: d.employeeId === v.employeeId ? "/documents" : `/people/${d.employeeId}?tab=documents` })),
    ...depts.map((d) => ({ group: "Departments", title: d.name, subtitle: d.description ?? undefined, href: `/organization/departments/${d.id}` })),
    ...anns.map((a) => ({ group: "Announcements", title: a.title, href: `/announcements#${a.id}` })),
    ...tickets.map((t) => ({ group: "Helpdesk", title: `${t.number} · ${t.subject}`, subtitle: t.status.replace(/_/g, " ").toLowerCase(), href: `/helpdesk/${t.id}` })),
    ...assets.map((a) => ({ group: "Assets", title: `${a.brand} ${a.model}`, subtitle: a.tag, href: `/assets/${a.id}` })),
    ...policies.map((p) => ({ group: "Policies", title: p.title, href: `/me/policies#${p.id}` })),
    ...goals.map((g) => ({ group: "Goals", title: g.title, subtitle: g.owner.firstName, href: `/goals/${g.id}` })),
  ];
  return json({ results });
}
