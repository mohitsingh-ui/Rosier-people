import Link from "next/link";
import { Plus, Pencil, Trash2, Building2, MapPin, BadgeCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/auth/viewer";
import { PageHeader } from "@/components/ui/card";
import { Tabs, TableWrap } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ActionButton } from "@/components/ui/action-button";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { OrgChart } from "@/components/org/org-chart";
import { DepartmentForm, DesignationForm, LocationForm } from "@/components/org/forms";
import { deleteDepartment, deleteDesignation, deleteLocation } from "@/server/org";

export const metadata = { title: "Organization" };

export default async function Organization({ searchParams }: { searchParams: Promise<{ tab?: string; focus?: string }> }) {
  const v = await requireViewer();
  const sp = await searchParams;
  const tab = sp.tab ?? "chart";
  const manage = can(v, "org.manage");
  const [people, depts, desigs, locs] = await Promise.all([
    db.employee.findMany({ where: { status: { in: manage ? ["ACTIVE", "PROBATION", "NOTICE_PERIOD", "PREBOARDING"] : ["ACTIVE", "PROBATION", "NOTICE_PERIOD"] } }, include: { designation: true, department: true, manager: true } }),
    db.department.findMany({ include: { head: true, _count: { select: { employees: { where: { status: { notIn: ["EXITED", "INACTIVE"] } } }, openings: { where: { status: "OPEN" } } } } }, orderBy: { name: "asc" } }),
    db.designation.findMany({ include: { department: true, _count: { select: { employees: true } } }, orderBy: [{ level: "desc" }, { name: "asc" }] }),
    db.location.findMany({ include: { _count: { select: { employees: { where: { status: { notIn: ["EXITED", "INACTIVE"] } } } } } }, orderBy: { name: "asc" } }),
  ]);
  const personOpts = people.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }));
  const deptOpts = depts.map((d) => ({ value: d.id, label: d.name }));
  const tabs = [{ key: "chart", label: "Org chart" }, { key: "departments", label: "Departments", count: depts.length }, ...(manage ? [{ key: "designations", label: "Designations", count: desigs.length }, { key: "locations", label: "Locations", count: locs.length }] : [])];

  return (
    <>
      <PageHeader title="Organization" description={`${people.length} people · ${depts.length} departments · ${locs.length} locations`}
        actions={manage && tab === "departments" ? <Modal title="New department" trigger={<Button><Plus className="size-4" />Department</Button>}><DepartmentForm people={personOpts} /></Modal>
          : manage && tab === "designations" ? <Modal title="New designation" trigger={<Button><Plus className="size-4" />Designation</Button>}><DesignationForm departments={deptOpts} /></Modal>
          : manage && tab === "locations" ? <Modal title="New location" trigger={<Button><Plus className="size-4" />Location</Button>}><LocationForm /></Modal> : null} />
      <Tabs tabs={tabs} active={tab} base="/organization" />
      <div className="pt-5">
        {tab === "chart" && (
          <OrgChart canEdit={manage} focusId={sp.focus ?? v.employeeId ?? undefined}
            people={people.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, photoUrl: p.photoUrl, designation: p.designation?.name ?? null, department: p.department?.name ?? null, managerId: p.managerId, managerName: p.manager ? `${p.manager.firstName} ${p.manager.lastName}` : null, status: p.status }))} />
        )}
        {tab === "departments" && (
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {depts.map((d) => (
              <li key={d.id} className="card p-5 flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/organization/departments/${d.id}`} className="group"><div className="flex items-center gap-2"><span className="size-9 rounded-lg bg-brand-50 text-brand grid place-items-center"><Building2 className="size-4" /></span><span><span className="block font-semibold group-hover:text-brand">{d.name}</span><span className="text-[12px] text-muted">{d.code}</span></span></div></Link>
                  {manage && <div className="flex -mr-2">
                    <Modal title={`Edit ${d.name}`} trigger={<Button variant="ghost" size="iconSm" aria-label="Edit"><Pencil className="size-3.5" /></Button>}><DepartmentForm d={d} people={personOpts} /></Modal>
                    <ActionButton action={deleteDepartment} payload={{ id: d.id }} variant="ghost" size="iconSm" confirm={{ title: `Delete ${d.name}?`, danger: true, confirmLabel: "Delete" }}><Trash2 className="size-3.5" /></ActionButton>
                  </div>}
                </div>
                <p className="text-[13px] text-muted mt-3 flex-1">{d.description}</p>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-line">
                  {d.head ? <span className="flex items-center gap-2 text-[13px]"><EmployeeAvatar employee={d.head} size={26} />{d.head.firstName} {d.head.lastName}</span> : <span className="text-[13px] text-faint">No head</span>}
                  <span className="text-[12.5px] text-muted">{d._count.employees} people{d._count.openings ? ` · ${d._count.openings} open` : ""}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {tab === "designations" && manage && (
          <TableWrap><table className="tbl"><thead><tr><th>Designation</th><th>Level</th><th>Department</th><th>People</th><th /></tr></thead><tbody>
            {desigs.map((d) => <tr key={d.id}><td className="font-medium"><BadgeCheck className="size-3.5 inline mr-1.5 text-brand-2" />{d.name}</td><td>{d.level}</td><td>{d.department?.name ?? "Any"}</td><td>{d._count.employees}</td><td className="text-right whitespace-nowrap">
              <Modal title="Edit designation" trigger={<Button variant="ghost" size="iconSm" aria-label="Edit"><Pencil className="size-3.5" /></Button>}><DesignationForm d={d} departments={deptOpts} /></Modal>
              <ActionButton action={deleteDesignation} payload={{ id: d.id }} variant="ghost" size="iconSm" confirm={{ title: `Delete ${d.name}?`, danger: true, confirmLabel: "Delete" }}><Trash2 className="size-3.5" /></ActionButton>
            </td></tr>)}
          </tbody></table></TableWrap>
        )}
        {tab === "locations" && manage && (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{locs.map((l) => (
            <li key={l.id} className="card p-5"><div className="flex justify-between"><div className="flex items-center gap-2"><MapPin className="size-4 text-brand-2" /><span className="font-semibold">{l.name}</span></div>
              <div className="flex -mr-2"><Modal title="Edit location" trigger={<Button variant="ghost" size="iconSm" aria-label="Edit"><Pencil className="size-3.5" /></Button>}><LocationForm l={l} /></Modal><ActionButton action={deleteLocation} payload={{ id: l.id }} variant="ghost" size="iconSm" confirm={{ title: `Delete ${l.name}?`, danger: true, confirmLabel: "Delete" }}><Trash2 className="size-3.5" /></ActionButton></div></div>
              <p className="text-[13px] text-muted mt-2">{l.address}<br />{l.city}, {l.state}</p><p className="text-[12.5px] mt-3">{l._count.employees} people</p></li>
          ))}</ul>
        )}
      </div>
    </>
  );
}
