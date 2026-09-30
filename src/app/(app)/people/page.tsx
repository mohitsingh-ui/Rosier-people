import Link from "next/link";
import { Plus, Upload, Download, LayoutGrid, List, Mail, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, can } from "@/lib/auth/viewer";
import { fmtDate } from "@/lib/dates";
import { humanize } from "@/lib/utils";
import { PageHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { EmptyState, TableWrap } from "@/components/ui/misc";
import { SearchBar, FilterDropdown, DateFilter, ClearFilters, ViewToggle } from "@/components/ui/filters";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "People" };
const PAGE = 25;

type SP = { q?: string; department?: string; location?: string; designation?: string; type?: string; manager?: string; status?: string; joinedFrom?: string; joinedTo?: string; view?: string; page?: string };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<SP> }) {
  const v = await requirePermission("people.view_directory");
  const sp = await searchParams;
  const hr = can(v, "people.edit");
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();

  // Directory search covers work fields only — never personal, identity or payroll data.
  const where: Prisma.EmployeeWhereInput = {
    status: sp.status ? (sp.status as never) : hr ? { not: "EXITED" } : { in: ["ACTIVE", "PROBATION", "NOTICE_PERIOD"] },
    ...(sp.department ? { departmentId: sp.department } : {}),
    ...(sp.location ? { locationId: sp.location } : {}),
    ...(sp.designation ? { designationId: sp.designation } : {}),
    ...(sp.type ? { employmentType: sp.type as never } : {}),
    ...(sp.manager ? { managerId: sp.manager } : {}),
    ...(sp.joinedFrom || sp.joinedTo ? { joiningDate: { ...(sp.joinedFrom ? { gte: new Date(sp.joinedFrom) } : {}), ...(sp.joinedTo ? { lte: new Date(sp.joinedTo) } : {}) } } : {}),
    ...(q ? { OR: [
      { firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } },
      { workEmail: { contains: q, mode: "insensitive" } }, { department: { name: { contains: q, mode: "insensitive" } } }, { designation: { name: { contains: q, mode: "insensitive" } } },
      { skills: { has: q } },
      ...(q.includes(" ") ? [{ AND: [{ firstName: { contains: q.split(" ")[0], mode: "insensitive" as const } }, { lastName: { contains: q.split(" ").slice(1).join(" "), mode: "insensitive" as const } }] }] : []),
    ] } : {}),
  };
  if (!hr && sp.status && !["ACTIVE", "PROBATION", "NOTICE_PERIOD"].includes(sp.status)) where.status = "ACTIVE";

  const [people, total, depts, locs, desigs, managers] = await Promise.all([
    db.employee.findMany({
      where, orderBy: [{ firstName: "asc" }], skip: (page - 1) * PAGE, take: PAGE,
      select: { id: true, code: true, firstName: true, lastName: true, photoUrl: true, workEmail: true, status: true, joiningDate: true, employmentType: true,
        designation: { select: { name: true } }, department: { select: { name: true } }, location: { select: { name: true } }, manager: { select: { id: true, firstName: true, lastName: true } } },
    }),
    db.employee.count({ where }),
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.location.findMany({ orderBy: { name: "asc" } }),
    db.designation.findMany({ orderBy: { name: "asc" } }),
    db.employee.findMany({ where: { reports: { some: {} } }, orderBy: { firstName: "asc" }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  const grid = sp.view === "grid";
  const pages = Math.ceil(total / PAGE);
  const qs = (p: number) => { const u = new URLSearchParams(Object.entries(sp).filter(([, x]) => x) as [string, string][]); u.set("page", String(p)); return `?${u}`; };

  return (
    <>
      <PageHeader title="People" description={`${total} ${total === 1 ? "person" : "people"}${sp.status || sp.department || q ? " match your filters" : " at Rosier Foods"}`}
        actions={<>
          {can(v, "people.export") && <ButtonLink variant="secondary" href={`/api/export/people?format=xlsx&${new URLSearchParams(Object.entries(sp).filter(([k, x]) => x && k !== "page" && k !== "view") as [string, string][])}`} prefetch={false}><Download className="size-4" />Export</ButtonLink>}
          {can(v, "people.import") && <ButtonLink variant="secondary" href="/people/import"><Upload className="size-4" />Import</ButtonLink>}
          {can(v, "people.create") && <ButtonLink href="/people/new"><Plus className="size-4" />Add employee</ButtonLink>}
        </>} />

      <div className="flex flex-col gap-3 mb-5">
        <div className="flex gap-3">
          <SearchBar placeholder="Search by name, ID, email, department, designation or skill" className="flex-1" />
          <ViewToggle options={[{ value: "table", label: "Table view", icon: <List className="size-4" /> }, { value: "grid", label: "Card view", icon: <LayoutGrid className="size-4" /> }]} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown param="department" label="Department" options={depts.map((d) => ({ value: d.id, label: d.name }))} />
          <FilterDropdown param="location" label="Location" options={locs.map((l) => ({ value: l.id, label: l.name }))} />
          <FilterDropdown param="designation" label="Designation" options={desigs.map((d) => ({ value: d.id, label: d.name }))} />
          <FilterDropdown param="type" label="Employment type" options={["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "CONSULTANT"].map((t) => ({ value: t, label: humanize(t) }))} />
          <FilterDropdown param="manager" label="Reporting manager" options={managers.map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` }))} />
          <FilterDropdown param="status" label="Status" options={(hr ? ["PREBOARDING", "PROBATION", "ACTIVE", "NOTICE_PERIOD", "INACTIVE", "EXITED"] : ["ACTIVE", "PROBATION", "NOTICE_PERIOD"]).map((s) => ({ value: s, label: humanize(s) }))} />
          <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">Joined <DateFilter param="joinedFrom" label="Joined from" /> – <DateFilter param="joinedTo" label="Joined to" /></span>
          <ClearFilters keys={["department", "location", "designation", "type", "manager", "status", "joinedFrom", "joinedTo", "q"]} />
        </div>
      </div>

      {people.length === 0 ? (
        <div className="card"><EmptyState icon={Users} title="No one matches that" body="Try a different name or clear some filters." /></div>
      ) : grid ? (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {people.map((p) => (
            <li key={p.id}>
              <Link href={`/people/${p.id}`} className="card block p-5 text-center hover:border-line-2 transition-colors h-full">
                <EmployeeAvatar employee={p} size={64} className="mx-auto" />
                <div className="mt-3 font-semibold">{p.firstName} {p.lastName}</div>
                <div className="text-[13px] text-muted">{p.designation?.name}</div>
                <div className="text-[12px] text-faint mt-0.5">{p.department?.name} · {p.location?.name}</div>
                <div className="mt-3 flex justify-center gap-2"><StatusBadge status={p.status} /><span className="text-[11.5px] text-muted self-center">{p.code}</span></div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <ul className="md:hidden space-y-2">
            {people.map((p) => (
              <li key={p.id}><Link href={`/people/${p.id}`} className="card flex items-center gap-3 p-3.5">
                <EmployeeAvatar employee={p} size={42} />
                <span className="min-w-0 flex-1"><span className="block font-medium truncate">{p.firstName} {p.lastName}</span><span className="block text-[12.5px] text-muted truncate">{p.designation?.name} · {p.department?.name}</span></span>
                <StatusBadge status={p.status} />
              </Link></li>
            ))}
          </ul>
          <TableWrap className="hidden md:block">
            <table className="tbl">
              <thead><tr><th>Employee</th><th>Designation</th><th>Department</th><th>Location</th><th>Reporting manager</th><th>Status</th><th>Joined</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id}>
                    <td><Link href={`/people/${p.id}`} className="flex items-center gap-3 group"><EmployeeAvatar employee={p} size={34} /><span><span className="block font-medium group-hover:text-brand">{p.firstName} {p.lastName}</span><span className="block text-[12px] text-muted">{p.code} · {humanize(p.employmentType)}</span></span></Link></td>
                    <td>{p.designation?.name ?? "—"}</td>
                    <td>{p.department?.name ?? "—"}</td>
                    <td className="whitespace-nowrap">{p.location?.name ?? "—"}</td>
                    <td>{p.manager ? <Link href={`/people/${p.manager.id}`} className="hover:text-brand">{p.manager.firstName} {p.manager.lastName}</Link> : <span className="text-faint">—</span>}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="whitespace-nowrap text-muted">{fmtDate(p.joiningDate)}</td>
                    <td className="text-right whitespace-nowrap">
                      <a href={`mailto:${p.workEmail}`} className="inline-grid place-items-center size-8 rounded-lg text-muted hover:bg-soft hover:text-ink" aria-label={`Email ${p.firstName}`}><Mail className="size-4" /></a>
                      <Link href={`/people/${p.id}`} className="text-[13px] text-brand hover:underline ml-2">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </>
      )}
      {pages > 1 && (
        <nav className="flex items-center justify-between mt-4 text-[13px]" aria-label="Pagination">
          <span className="text-muted">Page {page} of {pages}</span>
          <span className="flex gap-2">
            {page > 1 && <ButtonLink variant="secondary" size="sm" href={qs(page - 1)}>Previous</ButtonLink>}
            {page < pages && <ButtonLink variant="secondary" size="sm" href={qs(page + 1)}>Next</ButtonLink>}
          </span>
        </nav>
      )}
    </>
  );
}
