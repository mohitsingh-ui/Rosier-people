import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone, MapPin, CalendarDays, Upload, History, Pencil, UserCog, KeyRound, UserX, Trash2, Laptop, FileSignature, ListChecks } from "lucide-react";
import { db } from "@/lib/db";
import { accessFor, can, type Viewer } from "@/lib/auth/viewer";
import { fmtDate, isoOf, today } from "@/lib/dates";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/misc";
import { ActionButton } from "@/components/ui/action-button";
import { OverflowMenu } from "./menu";
import { RoleForm, DeactivateForm, DeleteForm, JobForm, TaskForm } from "./forms";
import { UploadForm } from "@/components/documents/client";
import { resetEmployeePassword } from "@/server/people";
import { ROLE_LABELS } from "@/lib/permissions";
import { loadEmployee, OverviewTab, JobTab, PersonalTab, FamilyTab, DocumentsTab, PayrollTab, AttendanceTab, LeaveTab, PerformanceTab, AssetsTab, TimelineTab } from "./tabs";

/** EmployeeProfile: same component for /people/[id] and /me — every tab checks access itself. */
export async function EmployeeProfile({ v, id, tab = "overview", base, month }: { v: Viewer; id: string; tab?: string; base: string; month?: string }) {
  const e = await loadEmployee(id);
  if (!e) notFound();
  const acc = accessFor(v, id);
  // Peers can see the directory card but not exited / preboarding people's pages
  if (acc.relationship === "peer" && !["ACTIVE", "PROBATION", "NOTICE_PERIOD"].includes(e.status)) notFound();

  const tabs = [
    { key: "overview", label: "Overview", show: true },
    { key: "job", label: "Job", show: true },
    { key: "personal", label: "Personal", show: acc.personal },
    { key: "family", label: "Family", show: acc.family },
    { key: "documents", label: "Documents", show: acc.documents },
    { key: "payroll", label: "Payroll", show: acc.payroll },
    { key: "attendance", label: "Attendance", show: acc.attendance },
    { key: "leave", label: "Leave", show: acc.leave },
    { key: "performance", label: "Performance", show: acc.performance },
    { key: "assets", label: "Assets", show: acc.assets },
    { key: "timeline", label: "Timeline", show: acc.timeline },
  ].filter((t) => t.show);
  const active = tabs.some((t) => t.key === tab) ? tab : "overview";
  const hr = can(v, "people.edit");
  const self = acc.relationship === "self";

  const [types, opts] = await Promise.all([
    acc.documents && (self || can(v, "documents.manage")) ? db.documentType.findMany({ where: can(v, "documents.manage") ? {} : { employeeUpload: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    hr ? Promise.all([db.department.findMany({ orderBy: { name: "asc" } }), db.designation.findMany({ orderBy: { name: "asc" } }), db.location.findMany({ orderBy: { name: "asc" } }), db.employee.findMany({ where: { status: { notIn: ["EXITED", "INACTIVE"] } }, orderBy: { firstName: "asc" } }), db.shift.findMany()]) : Promise.resolve(null),
  ]);
  const roleOptions = (Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).filter((r) => can(v, "settings.security") || (r !== "SUPER_ADMIN" && r !== "HR_ADMIN")).map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  const tabBase = base;

  return (
    <div>
      <div className="card overflow-hidden mb-5">
        <div className="h-20 sm:h-24 bg-gradient-to-r from-brand-100 via-brand-50 to-canvas" aria-hidden />
        <div className="px-5 sm:px-6 pb-5 -mt-10 sm:-mt-12">
          <div className="flex flex-col lg:flex-row lg:items-end gap-4">
            <EmployeeAvatar employee={e} size={92} className="ring-4" />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[22px] sm:text-[24px] leading-tight">{e.firstName} {e.lastName}</h1>
                <StatusBadge status={e.status} />
                {(hr || self) && e.user && <Badge tone="brand">{e.user.role.name}</Badge>}
              </div>
              <p className="text-ink-2 mt-0.5">{e.designation?.name} <span className="text-muted">· {e.department?.name}</span></p>
            </div>
            <div className="flex flex-wrap gap-2">
              {hr && opts ? (
                <Modal size="lg" title={`Edit ${e.firstName}'s job`} trigger={<Button variant="secondary"><Pencil className="size-4" />Edit profile</Button>}>
                  <JobForm canManageOrg={can(v, "org.manage")} today={isoOf(today())}
                    e={{ id: e.id, departmentId: e.departmentId, designationId: e.designationId, locationId: e.locationId, managerId: e.managerId, employmentType: e.employmentType, status: e.status, shiftId: e.shiftId, confirmationDate: e.confirmationDate ? isoOf(e.confirmationDate) : null, workPhone: e.workPhone }}
                    options={{ departments: opts[0].map((d) => ({ value: d.id, label: d.name })), designations: opts[1].map((d) => ({ value: d.id, label: d.name })), locations: opts[2].map((d) => ({ value: d.id, label: d.name })), managers: opts[3].map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` })), shifts: opts[4].map((s) => ({ value: s.id, label: s.name })) }} />
                </Modal>
              ) : self ? <ButtonLink href={`${tabBase}?tab=personal`} variant="secondary"><Pencil className="size-4" />Edit profile</ButtonLink> : null}
              {types.length > 0 && (
                <Modal title="Upload a document" trigger={<Button variant="secondary"><Upload className="size-4" />Upload document</Button>}>
                  <UploadForm employeeId={e.id} hr={can(v, "documents.manage")} types={types.map((t) => ({ value: t.id, label: t.name, hasExpiry: t.hasExpiry }))} />
                </Modal>
              )}
              {acc.timeline && <ButtonLink href={`${tabBase}?tab=timeline`} variant="secondary" scroll={false}><History className="size-4" />View timeline</ButtonLink>}
              {acc.relationship === "manager" && v.directReportIds.has(e.id) && (
                <Modal title={`Assign a task to ${e.firstName}`} trigger={<Button variant="secondary"><ListChecks className="size-4" />Assign task</Button>}><TaskForm people={[]} assigneeId={e.id} /></Modal>
              )}
              {hr && !self && (
                <OverflowMenu>
                  {e.user && <Modal title="Change access role" trigger={<Button variant="ghost" size="sm"><UserCog className="size-4" />Change role</Button>}><RoleForm employeeId={e.id} current={e.user.role.key} roles={roleOptions} /></Modal>}
                  {can(v, "documents.generate") && <ButtonLink href={`${tabBase}?tab=documents`} variant="ghost" size="sm"><FileSignature className="size-4" />Generate letter</ButtonLink>}
                  {can(v, "assets.manage") && <ButtonLink href={`/assets?assignTo=${e.id}`} variant="ghost" size="sm"><Laptop className="size-4" />Assign asset</ButtonLink>}
                  {can(v, "people.reset_password") && e.user && <ActionButton action={resetEmployeePassword} payload={{ employeeId: e.id }} variant="ghost" confirm={{ title: `Reset ${e.firstName}'s password?`, body: "They'll be signed out everywhere and emailed a link to set a new password.", confirmLabel: "Send reset link" }}><KeyRound className="size-4" />Reset password</ActionButton>}
                  <Modal title={e.status === "INACTIVE" ? "Reactivate employee" : "Deactivate employee"} trigger={<Button variant="ghost" size="sm"><UserX className="size-4" />{e.status === "INACTIVE" ? "Reactivate" : "Deactivate"}</Button>}><DeactivateForm employeeId={e.id} active={e.status !== "INACTIVE"} /></Modal>
                  {can(v, "people.delete") && <Modal title="Delete employee" trigger={<Button variant="ghost" size="sm" className="text-bad"><Trash2 className="size-4" />Delete</Button>}><DeleteForm employeeId={e.id} code={e.code} /></Modal>}
                </OverflowMenu>
              )}
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-x-6 gap-y-3 text-[13px]">
            <div><dt className="text-muted text-[12px]">Employee ID</dt><dd className="font-medium">{e.code}</dd></div>
            <div><dt className="text-muted text-[12px] flex items-center gap-1"><MapPin className="size-3" />Location</dt><dd className="font-medium">{e.location?.name ?? "—"}</dd></div>
            <div><dt className="text-muted text-[12px] flex items-center gap-1"><CalendarDays className="size-3" />Joined</dt><dd className="font-medium">{fmtDate(e.joiningDate)}</dd></div>
            <div><dt className="text-muted text-[12px]">Reporting manager</dt><dd className="font-medium">{e.manager ? <Link href={`/people/${e.manager.id}`} className="hover:text-brand">{e.manager.firstName} {e.manager.lastName}</Link> : "—"}</dd></div>
            <div className="min-w-0"><dt className="text-muted text-[12px] flex items-center gap-1"><Mail className="size-3" />Email</dt><dd className="font-medium truncate"><a href={`mailto:${e.workEmail}`} className="hover:text-brand">{e.workEmail}</a></dd></div>
            <div><dt className="text-muted text-[12px] flex items-center gap-1"><Phone className="size-3" />Work phone</dt><dd className="font-medium">{e.workPhone ?? "—"}</dd></div>
          </dl>
        </div>
      </div>

      <Tabs tabs={tabs} active={active} base={tabBase} />
      <div className="pt-5">
        {active === "overview" && <OverviewTab e={e} acc={acc} />}
        {active === "job" && <JobTab e={e} acc={acc} v={v} />}
        {active === "personal" && <PersonalTab e={e} acc={acc} v={v} />}
        {active === "family" && <FamilyTab e={e} acc={acc} v={v} />}
        {active === "documents" && <DocumentsTab e={e} acc={acc} v={v} />}
        {active === "payroll" && <PayrollTab e={e} acc={acc} />}
        {active === "attendance" && <AttendanceTab e={e} acc={acc} month={month} base={`${tabBase}?tab=attendance`} />}
        {active === "leave" && <LeaveTab e={e} acc={acc} />}
        {active === "performance" && <PerformanceTab e={e} acc={acc} v={v} />}
        {active === "assets" && <AssetsTab e={e} acc={acc} />}
        {active === "timeline" && <TimelineTab e={e} acc={acc} v={v} />}
      </div>
    </div>
  );
}
