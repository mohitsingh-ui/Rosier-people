import Link from "next/link";
import { Pencil, Plus, Trash2, Briefcase, ArrowUpRight, MoveRight, UserPlus, FileText, Plane, Laptop, Star, Wallet, Flag, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { can, type Access, type Viewer } from "@/lib/auth/viewer";
import { fmtDate, fmtDateTime, isoOf, today, currentMonth } from "@/lib/dates";
import { humanize, inr, num } from "@/lib/utils";
import { KV, Section } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState, PermissionNotice, Progress, Timeline, type TimelineItem } from "@/components/ui/misc";
import { ActionButton } from "@/components/ui/action-button";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { AttendanceCalendar } from "@/components/attendance/calendar";
import { DocumentVault } from "@/components/documents/vault";
import { Reveal } from "./reveal";
import { mask } from "@/lib/utils";
import { PersonalForm, IdentityForm, FamilyForm, EmergencyForm, JobForm } from "./forms";
import { removeFamilyMember, removeEmergencyContact } from "@/server/people";
import { leaveBalances, setting } from "@/server/queries";

type Emp = NonNullable<Awaited<ReturnType<typeof loadEmployee>>>;

export async function loadEmployee(id: string) {
  return db.employee.findUnique({
    where: { id },
    include: { department: true, designation: true, location: true, shift: true, manager: { include: { designation: true } }, user: { include: { role: true } }, _count: { select: { reports: true } } },
  });
}

export async function OverviewTab({ e, acc }: { e: Emp; acc: Access }) {
  const [personal, emergency, reports] = await Promise.all([
    acc.personal ? db.employeePersonal.findUnique({ where: { employeeId: e.id } }) : null,
    acc.personal ? db.emergencyContact.findMany({ where: { employeeId: e.id }, orderBy: { isPrimary: "desc" } }) : [],
    db.employee.findMany({ where: { managerId: e.id, status: { notIn: ["EXITED"] } }, include: { designation: true }, orderBy: { firstName: "asc" } }),
  ]);
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Section title="Professional">
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
          <KV label="Designation" value={e.designation?.name} />
          <KV label="Department" value={e.department ? <Link href={`/organization/departments/${e.department.id}`} className="hover:text-brand">{e.department.name}</Link> : "—"} />
          <KV label="Reporting manager" value={e.manager ? <Link href={`/people/${e.manager.id}`} className="hover:text-brand">{e.manager.firstName} {e.manager.lastName}</Link> : "—"} />
          <KV label="Work location" value={e.location?.name} />
          <KV label="Employment type" value={humanize(e.employmentType)} />
          <KV label="Date of joining" value={fmtDate(e.joiningDate)} />
          <KV label="Employee ID" value={e.code} />
          <KV label="Shift" value={e.shift?.name ?? "Default"} />
        </dl>
      </Section>
      <Section title="Contact">
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
          <KV label="Work email" value={<a href={`mailto:${e.workEmail}`} className="hover:text-brand break-all">{e.workEmail}</a>} />
          <KV label="Work phone" value={e.workPhone} />
          {acc.personal ? (
            <>
              <KV label="Personal email" value={personal?.personalEmail} />
              <KV label="Personal phone" value={personal?.personalPhone} />
              <KV className="sm:col-span-2" label="Address" value={personal?.addressLine1 ? [personal.addressLine1, personal.addressLine2, personal.city, personal.state, personal.pin].filter(Boolean).join(", ") : "—"} />
            </>
          ) : null}
        </dl>
        {!acc.personal && <p className="text-[12px] text-muted mt-4">Personal contact details are private to {e.firstName} and HR.</p>}
      </Section>
      {acc.personal && (
        <Section title="Personal information">
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
            <KV label="Date of birth" value={e.dateOfBirth ? fmtDate(e.dateOfBirth) : "—"} />
            <KV label="Gender" value={humanize(e.gender === "UNDISCLOSED" ? "Prefer not to say" : e.gender)} />
            <KV label="Blood group" value={personal?.bloodGroup} />
            <KV label="Marital status" value={personal?.maritalStatus} />
          </dl>
        </Section>
      )}
      {acc.personal && (
        <Section title="Emergency contact">
          {emergency.length ? (
            <ul className="space-y-3">{emergency.map((c) => <li key={c.id} className="text-[13.5px]"><span className="font-medium">{c.name}</span> <span className="text-muted">· {c.relation}</span>{c.isPrimary && <Badge className="ml-2" tone="brand">Primary</Badge>}<div className="text-muted">{c.phone}</div></li>)}</ul>
          ) : <p className="text-[13px] text-muted">No emergency contact added.</p>}
        </Section>
      )}
      <Section title="About">
        <p className="text-[13.5px] text-ink-2 whitespace-pre-line">{e.bio || <span className="text-muted">No bio yet.</span>}</p>
        {e.skills.length > 0 && <div className="flex flex-wrap gap-1.5 mt-3">{e.skills.map((s) => <Link key={s} href={`/people?q=${encodeURIComponent(s)}`}><Badge>{s}</Badge></Link>)}</div>}
      </Section>
      <Section title={`Direct reports (${reports.length})`}>
        {reports.length ? (
          <ul className="grid sm:grid-cols-2 gap-3">{reports.map((r) => <li key={r.id}><Link href={`/people/${r.id}`} className="flex items-center gap-2.5 group"><EmployeeAvatar employee={r} size={32} /><span className="min-w-0"><span className="block text-[13.5px] font-medium truncate group-hover:text-brand">{r.firstName} {r.lastName}</span><span className="block text-[12px] text-muted truncate">{r.designation?.name}</span></span></Link></li>)}</ul>
        ) : <p className="text-[13px] text-muted">No direct reports.</p>}
      </Section>
    </div>
  );
}

const HISTORY_ICON = { JOINED: UserPlus, PROMOTION: ArrowUpRight, DESIGNATION_CHANGE: Briefcase, DEPARTMENT_CHANGE: MoveRight, TRANSFER: MoveRight, MANAGER_CHANGE: MoveRight, STATUS_CHANGE: Flag, SALARY_REVISION: Wallet, CONFIRMATION: ShieldCheck };

export async function JobTab({ e, acc, v }: { e: Emp; acc: Access; v: Viewer }) {
  const [history, reporting, opts] = await Promise.all([
    acc.jobHistory ? db.jobHistory.findMany({ where: { employeeId: e.id }, orderBy: { effectiveDate: "desc" } }) : [],
    acc.jobHistory ? db.reportingRelationship.findMany({ where: { employeeId: e.id }, include: { manager: true }, orderBy: { startDate: "desc" } }) : [],
    acc.edit ? Promise.all([db.department.findMany({ orderBy: { name: "asc" } }), db.designation.findMany({ orderBy: { name: "asc" } }), db.location.findMany({ orderBy: { name: "asc" } }), db.employee.findMany({ where: { status: { notIn: ["EXITED", "INACTIVE"] } }, orderBy: { firstName: "asc" } }), db.shift.findMany()]) : null,
  ]);
  const visibleHistory = history.filter((h) => h.type !== "SALARY_REVISION" || acc.payroll);
  const group = (types: string[]) => visibleHistory.filter((h) => types.includes(h.type));
  return (
    <div className="space-y-5">
      <Section title="Current job" action={acc.edit && opts ? (
        <Modal size="lg" title={`Edit ${e.firstName}'s job`} description="Promotions, transfers, manager and status changes are recorded in their history." trigger={<Button variant="secondary" size="sm"><Pencil className="size-3.5" />Edit</Button>}>
          <JobForm canManageOrg={can(v, "org.manage")} today={isoOf(today())}
            e={{ id: e.id, departmentId: e.departmentId, designationId: e.designationId, locationId: e.locationId, managerId: e.managerId, employmentType: e.employmentType, status: e.status, shiftId: e.shiftId, confirmationDate: e.confirmationDate ? isoOf(e.confirmationDate) : null, workPhone: e.workPhone }}
            options={{ departments: opts[0].map((d) => ({ value: d.id, label: d.name })), designations: opts[1].map((d) => ({ value: d.id, label: d.name })), locations: opts[2].map((d) => ({ value: d.id, label: d.name })), managers: opts[3].map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` })), shifts: opts[4].map((s) => ({ value: s.id, label: s.name })) }} />
        </Modal>
      ) : null}>
        <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
          <KV label="Designation" value={e.designation?.name} />
          <KV label="Department" value={e.department?.name} />
          <KV label="Reporting manager" value={e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : "—"} />
          <KV label="Employment type" value={humanize(e.employmentType)} />
          <KV label="Joining date" value={fmtDate(e.joiningDate)} />
          <KV label="Confirmation date" value={e.confirmationDate ? fmtDate(e.confirmationDate) : e.status === "PROBATION" ? "On probation" : "—"} />
          <KV label="Work location" value={e.location?.name} />
          <KV label="Employee status" value={<StatusBadge status={e.status} />} />
        </dl>
      </Section>
      {acc.jobHistory ? (
        <div className="grid lg:grid-cols-3 gap-5">
          {([["Career history", ["JOINED", "PROMOTION", "DESIGNATION_CHANGE", "DEPARTMENT_CHANGE", "STATUS_CHANGE", "CONFIRMATION", "SALARY_REVISION"]], ["Promotion history", ["PROMOTION"]], ["Transfer history", ["TRANSFER", "DEPARTMENT_CHANGE"]]] as const).map(([title, types]) => {
            const list = group([...types]);
            return (
              <Section key={title} title={title}>
                {list.length ? (
                  <Timeline items={list.map((h) => ({ id: h.id, date: fmtDate(h.effectiveDate), icon: HISTORY_ICON[h.type], tone: h.type === "PROMOTION" ? "ok" : "brand", title: h.type === "JOINED" ? `Joined Rosier — ${h.toValue}` : `${humanize(h.type)}${h.toValue ? `: ${h.toValue}` : ""}`, body: [h.fromValue ? `from ${h.fromValue}` : null, h.note].filter(Boolean).join(" · ") || undefined }))} />
                ) : <p className="text-[13px] text-muted">Nothing yet.</p>}
              </Section>
            );
          })}
          <Section title="Reporting history">
            <ul className="space-y-2.5 text-[13.5px]">{reporting.map((r) => <li key={r.id} className="flex justify-between gap-3"><span>{r.manager.firstName} {r.manager.lastName}</span><span className="text-muted text-[12.5px]">{fmtDate(r.startDate, "MMM yyyy")} – {r.endDate ? fmtDate(r.endDate, "MMM yyyy") : "now"}</span></li>)}</ul>
          </Section>
        </div>
      ) : <PermissionNotice>Job history is visible to {e.firstName}, their manager and HR.</PermissionNotice>}
    </div>
  );
}

export async function PersonalTab({ e, acc, v }: { e: Emp; acc: Access; v: Viewer }) {
  if (!acc.personal) return <PermissionNotice>Personal details are private to {e.firstName} and HR.</PermissionNotice>;
  const [p, emergency, editable] = await Promise.all([
    db.employeePersonal.findUnique({ where: { employeeId: e.id } }),
    db.emergencyContact.findMany({ where: { employeeId: e.id }, orderBy: { isPrimary: "desc" } }),
    setting<string[]>("selfEditableFields", []),
  ]);
  const hr = can(v, "people.edit") && can(v, "people.view_personal");
  const canEdit = acc.relationship === "self" || hr;
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Section title="Personal details" action={canEdit ? (
        <Modal size="lg" title="Edit personal details" trigger={<Button variant="secondary" size="sm"><Pencil className="size-3.5" />Edit</Button>}>
          <PersonalForm employeeId={e.id} p={p} bio={e.bio} skills={e.skills} editable={editable} hr={hr} core={{ firstName: e.firstName, lastName: e.lastName, dateOfBirth: e.dateOfBirth ? isoOf(e.dateOfBirth) : null, gender: e.gender }} />
        </Modal>
      ) : null}>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
          <KV label="Full name" value={`${e.firstName} ${e.lastName}`} />
          <KV label="Date of birth" value={e.dateOfBirth ? fmtDate(e.dateOfBirth) : "—"} />
          <KV label="Gender" value={e.gender === "UNDISCLOSED" ? "Prefer not to say" : humanize(e.gender)} />
          <KV label="Nationality" value={p?.nationality} />
          <KV label="Personal email" value={p?.personalEmail} />
          <KV label="Phone" value={p?.personalPhone} />
          <KV className="sm:col-span-2" label="Address" value={p?.addressLine1 ? [p.addressLine1, p.addressLine2].filter(Boolean).join(", ") : "—"} />
          <KV label="City" value={p?.city} />
          <KV label="State" value={p?.state} />
          <KV label="PIN" value={p?.pin} />
          <KV label="Blood group" value={p?.bloodGroup} />
        </dl>
      </Section>
      <div className="space-y-5">
        <Section title="Identity" action={hr && can(v, "people.view_identity") ? (
          <Modal title="Update identity numbers" trigger={<Button variant="secondary" size="sm"><Pencil className="size-3.5" />Update</Button>}><IdentityForm employeeId={e.id} /></Modal>
        ) : null}>
          {acc.identity ? (
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
              <KV label="PAN" value={<Reveal employeeId={e.id} field="pan" masked={mask(p?.panLast4, 6)} allowed={acc.revealIdentity} />} />
              <KV label="Aadhaar" value={<Reveal employeeId={e.id} field="aadhaar" masked={mask(p?.aadhaarLast4, 8)} allowed={acc.revealIdentity} />} />
              <KV label="Passport" value={<Reveal employeeId={e.id} field="passport" masked={mask(p?.passportLast4, 4)} allowed={acc.revealIdentity} />} />
              <KV label="Passport expiry" value={p?.passportExpiry ? fmtDate(p.passportExpiry) : "—"} />
            </dl>
          ) : <PermissionNotice />}
          <p className="text-[11.5px] text-faint mt-4 flex items-center gap-1.5"><ShieldCheck className="size-3.5" />Encrypted at rest. Revealing a full number by anyone other than {acc.relationship === "self" ? "you" : e.firstName} is audit-logged.</p>
        </Section>
        <Section title="Emergency contacts" action={canEdit ? <Modal title="Add emergency contact" trigger={<Button variant="secondary" size="sm"><Plus className="size-3.5" />Add</Button>}><EmergencyForm employeeId={e.id} /></Modal> : null}>
          {emergency.length ? (
            <ul className="divide-y divide-line -my-2">{emergency.map((c) => (
              <li key={c.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="text-[13.5px]"><span className="font-medium">{c.name}</span> <span className="text-muted">· {c.relation}</span>{c.isPrimary && <Badge className="ml-2" tone="brand">Primary</Badge>}<div className="text-muted text-[13px]">{c.phone}</div></div>
                {canEdit && <div className="flex gap-1">
                  <Modal title="Edit emergency contact" trigger={<Button variant="ghost" size="iconSm" aria-label="Edit"><Pencil className="size-3.5" /></Button>}><EmergencyForm employeeId={e.id} c={c} /></Modal>
                  <ActionButton action={removeEmergencyContact} payload={{ id: c.id }} variant="ghost" size="iconSm" success="Removed" confirm={{ title: "Remove this contact?", danger: true, confirmLabel: "Remove" }}><Trash2 className="size-3.5" /></ActionButton>
                </div>}
              </li>
            ))}</ul>
          ) : <p className="text-[13px] text-muted">None added.</p>}
        </Section>
      </div>
    </div>
  );
}

export async function FamilyTab({ e, acc, v }: { e: Emp; acc: Access; v: Viewer }) {
  if (!acc.family) return <PermissionNotice>Family details are private to {e.firstName} and HR.</PermissionNotice>;
  const members = await db.familyMember.findMany({ where: { employeeId: e.id }, orderBy: { createdAt: "asc" } });
  const canEdit = acc.relationship === "self" || can(v, "people.edit");
  const order = ["FATHER", "MOTHER", "SPOUSE", "CHILD", "SIBLING", "OTHER"];
  return (
    <Section title="Family & dependents" action={canEdit ? <Modal title="Add family member" trigger={<Button variant="secondary" size="sm"><Plus className="size-3.5" />Add</Button>}><FamilyForm employeeId={e.id} /></Modal> : null}>
      {members.length === 0 ? <EmptyState compact title="No family members added" /> : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {members.sort((a, b) => order.indexOf(a.relation) - order.indexOf(b.relation)).map((m) => (
            <li key={m.id} className="rounded-ctl border border-line p-4">
              <div className="flex items-start justify-between gap-2">
                <div><div className="eyebrow">{humanize(m.relation)}</div><div className="font-medium mt-1">{m.name}</div></div>
                {canEdit && <div className="flex -mr-1.5 -mt-1.5">
                  <Modal title="Edit family member" trigger={<Button variant="ghost" size="iconSm" aria-label="Edit"><Pencil className="size-3.5" /></Button>}><FamilyForm employeeId={e.id} m={{ ...m, dateOfBirth: m.dateOfBirth ? isoOf(m.dateOfBirth) : null }} /></Modal>
                  <ActionButton action={removeFamilyMember} payload={{ id: m.id }} variant="ghost" size="iconSm" success="Removed" confirm={{ title: `Remove ${m.name}?`, danger: true, confirmLabel: "Remove" }}><Trash2 className="size-3.5" /></ActionButton>
                </div>}
              </div>
              <div className="text-[12.5px] text-muted mt-2 space-y-0.5">
                {m.dateOfBirth && <div>Born {fmtDate(m.dateOfBirth)}</div>}
                {m.phone && <div>{m.phone}</div>}
                {m.isDependent && <Badge tone="info" className="mt-1">Dependent</Badge>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export async function DocumentsTab({ e, acc, v }: { e: Emp; acc: Access; v: Viewer }) {
  if (!acc.documents) return <PermissionNotice>Documents are private to {e.firstName} and HR.</PermissionNotice>;
  return <DocumentVault v={v} employeeId={e.id} />;
}

export async function PayrollTab({ e, acc }: { e: Emp; acc: Access }) {
  if (!acc.payroll) return <PermissionNotice>Salary and bank details are visible only to {e.firstName} and authorised payroll staff.</PermissionNotice>;
  const [p, personal, slips] = await Promise.all([
    db.payrollProfile.findUnique({ where: { employeeId: e.id } }),
    db.employeePersonal.findUnique({ where: { employeeId: e.id }, select: { panLast4: true } }),
    db.payslip.findMany({ where: { employeeId: e.id, run: { status: { not: "DRAFT" } } }, include: { run: true }, orderBy: { run: { month: "desc" } }, take: 12 }),
  ]);
  if (!p) return <EmptyState icon={Wallet} title="No salary structure yet" body="Payroll sets this up before the first pay run." />;
  const monthly = num(p.monthlyBasic) + num(p.monthlyHra) + num(p.monthlySpecial) + num(p.monthlyOther);
  return (
    <div className="space-y-5">
      <div className="grid lg:grid-cols-2 gap-5">
        <Section title="Bank & statutory">
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
            <KV label="Bank" value={p.bankName} />
            <KV label="Account number" value={<Reveal employeeId={e.id} field="account" masked={mask(p.accountLast4, 8)} allowed />} />
            <KV label="IFSC" value={p.ifsc} />
            <KV label="PAN" value={<Reveal employeeId={e.id} field="pan" masked={mask(personal?.panLast4, 6)} allowed={acc.revealIdentity} />} />
            <KV label="UAN" value={p.uan} />
            <KV label="ESIC" value={p.esicNumber ?? "Not applicable"} />
            <KV label="Tax regime" value={humanize(p.taxRegime)} />
          </dl>
        </Section>
        <Section title="Salary structure" action={<span className="text-[12px] text-muted">Effective {fmtDate(p.effectiveFrom)}</span>}>
          <div className="flex items-baseline gap-2 mb-4"><span className="text-[26px] font-semibold tabular-nums">{inr(p.annualCtc)}</span><span className="text-muted text-[13px]">CTC / year</span></div>
          <table className="w-full text-[13.5px]"><tbody className="divide-y divide-line">
            {[["Basic", p.monthlyBasic], ["HRA", p.monthlyHra], ["Special allowance", p.monthlySpecial], ["Other allowances", p.monthlyOther]].map(([l, val]) => <tr key={l as string}><td className="py-2 text-ink-2">{l as string}</td><td className="py-2 text-right tabular-nums">{inr(val as never)}<span className="text-muted text-[12px]"> /mo</span></td></tr>)}
            <tr><td className="py-2 font-medium">Monthly gross</td><td className="py-2 text-right font-semibold tabular-nums">{inr(monthly)}</td></tr>
            <tr><td className="py-2 text-ink-2">Deductions</td><td className="py-2 text-right text-muted text-[12.5px]">PF {p.pfEnabled ? "12% of basic (capped)" : "not applicable"} · ESI {p.esiEnabled ? "0.75%" : "n/a"} · PT · TDS</td></tr>
          </tbody></table>
        </Section>
      </div>
      <Section title="Payslips" action={<ButtonLink href="/payroll" variant="ghost" size="sm">All payroll</ButtonLink>}>
        {slips.length ? (
          <div className="overflow-x-auto -mx-5"><table className="tbl"><thead><tr><th>Month</th><th className="text-right">Gross</th><th className="text-right">Deductions</th><th className="text-right">Net pay</th><th>Paid days</th><th /></tr></thead><tbody>
            {slips.map((s) => <tr key={s.id}><td className="font-medium">{fmtDate(new Date(`${s.run.month}-01`), "MMMM yyyy")}</td><td className="text-right tabular-nums">{inr(s.gross)}</td><td className="text-right tabular-nums">{inr(s.totalDeductions)}</td><td className="text-right font-semibold tabular-nums">{inr(s.net)}</td><td>{s.paidDays}</td><td className="text-right"><a href={`/api/payslips/${s.id}`} className="text-brand text-[13px] hover:underline">Download PDF</a></td></tr>)}
          </tbody></table></div>
        ) : <p className="text-[13px] text-muted">No payslips yet.</p>}
      </Section>
    </div>
  );
}

export async function AttendanceTab({ e, acc, month, base }: { e: Emp; acc: Access; month?: string; base: string }) {
  if (!acc.attendance) return <PermissionNotice>Attendance is visible to {e.firstName}, their manager and HR.</PermissionNotice>;
  return <div className="card p-5"><AttendanceCalendar employeeId={e.id} month={month ?? currentMonth()} baseHref={base} /></div>;
}

export async function LeaveTab({ e, acc }: { e: Emp; acc: Access }) {
  if (!acc.leave) return <PermissionNotice>Leave is visible to {e.firstName}, their manager and HR.</PermissionNotice>;
  const [bal, requests] = await Promise.all([leaveBalances(e.id), db.leaveRequest.findMany({ where: { employeeId: e.id }, include: { leaveType: true, approver: true }, orderBy: { startDate: "desc" }, take: 30 })]);
  const pending = requests.filter((r) => r.status === "PENDING" || r.status === "CLARIFICATION");
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {bal.map((b) => (
          <div key={b.id} className="card px-4 py-3.5">
            <div className="flex items-center gap-2 text-[12px] text-muted"><span className="size-2 rounded-full" style={{ background: b.leaveType.color }} />{b.leaveType.name}</div>
            <div className="text-[24px] font-semibold tabular-nums mt-1">{b.available}</div>
            <div className="text-[11.5px] text-muted">{b.used} used · {b.pending} pending · {b.allocated + b.carriedForward} total</div>
          </div>
        ))}
      </div>
      {pending.length > 0 && (
        <Section title="Pending requests">
          <ul className="divide-y divide-line -my-2">{pending.map((r) => <li key={r.id} className="py-2.5 flex items-center justify-between gap-3 text-[13.5px]"><span><span className="font-medium">{r.leaveType.name}</span> · {fmtDate(r.startDate, "d MMM")}{r.endDate > r.startDate ? ` – ${fmtDate(r.endDate, "d MMM")}` : ""} · {r.days}d</span><StatusBadge status={r.status} /></li>)}</ul>
        </Section>
      )}
      <Section title="Leave history">
        {requests.length ? (
          <div className="overflow-x-auto -mx-5"><table className="tbl"><thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Approver</th><th>Status</th></tr></thead><tbody>
            {requests.map((r) => <tr key={r.id}><td>{r.leaveType.name}</td><td className="whitespace-nowrap">{fmtDate(r.startDate, "d MMM")}{r.endDate > r.startDate ? ` – ${fmtDate(r.endDate, "d MMM yyyy")}` : fmtDate(r.startDate, " yyyy")}{r.halfDay !== "NONE" && <span className="text-muted"> · {humanize(r.halfDay)}</span>}</td><td>{r.days}</td><td className="max-w-xs truncate text-muted">{r.reason}</td><td>{r.approver ? `${r.approver.firstName}` : "—"}</td><td><StatusBadge status={r.status} /></td></tr>)}
          </tbody></table></div>
        ) : <p className="text-[13px] text-muted">No leave taken yet.</p>}
      </Section>
    </div>
  );
}

export async function PerformanceTab({ e, acc, v }: { e: Emp; acc: Access; v: Viewer }) {
  if (!acc.performance) return <PermissionNotice>Performance is visible to {e.firstName}, their manager and HR.</PermissionNotice>;
  const self = acc.relationship === "self";
  const [goals, reviews, feedback] = await Promise.all([
    db.goal.findMany({ where: { ownerId: e.id }, orderBy: { endDate: "desc" } }),
    db.performanceReview.findMany({ where: { employeeId: e.id }, include: { cycle: true, reviewer: true }, orderBy: { cycle: { startDate: "desc" } } }),
    db.feedback.findMany({ where: { toId: e.id, ...(self || can(v, "performance.manage") || acc.relationship === "manager" ? {} : { isPrivate: false }) }, include: { from: true }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Section title="Goals" action={<ButtonLink href={`/goals?owner=${e.id}`} variant="ghost" size="sm">Open goals</ButtonLink>}>
        {goals.length ? <ul className="space-y-3.5">{goals.map((g) => (
          <li key={g.id}><div className="flex justify-between gap-3 text-[13.5px]"><Link href={`/goals/${g.id}`} className="hover:text-brand truncate">{g.title}</Link><StatusBadge status={g.status} /></div><div className="flex items-center gap-2 mt-1.5"><Progress value={g.progress} tone={g.status === "AT_RISK" ? "bad" : g.status === "COMPLETED" ? "ok" : "brand"} /><span className="text-[11.5px] text-muted w-9 text-right">{g.progress}%</span></div></li>
        ))}</ul> : <p className="text-[13px] text-muted">No goals set.</p>}
      </Section>
      <Section title="Reviews & ratings">
        {reviews.length ? <ul className="divide-y divide-line -my-2">{reviews.map((r) => {
          const showManager = r.status === "COMPLETED" || !self;
          return (
            <li key={r.id} className="py-3">
              <div className="flex items-center justify-between gap-3"><span className="font-medium text-[13.5px]">{r.cycle.name}</span><StatusBadge status={r.status} /></div>
              <div className="text-[12.5px] text-muted mt-1 flex flex-wrap gap-x-4">
                <span>Self: {r.selfRating ? `${r.selfRating}/5` : "—"}</span>
                {showManager && <span>Manager: {r.managerRating ? `${r.managerRating}/5` : "—"}</span>}
                {r.finalRating && showManager && <span className="text-ink font-medium">Final: {r.finalRating}/5</span>}
              </div>
              {showManager && r.managerComments && <p className="text-[13px] text-ink-2 mt-1.5">“{r.managerComments}”</p>}
              {r.achievements && <p className="text-[12.5px] text-muted mt-1"><span className="text-ink-2">Achievements:</span> {r.achievements}</p>}
              {showManager && r.developmentAreas && <p className="text-[12.5px] text-muted mt-0.5"><span className="text-ink-2">Development:</span> {r.developmentAreas}</p>}
              <Link href={`/performance/review/${r.id}`} className="text-[12.5px] text-brand hover:underline mt-1 inline-block">Open review</Link>
            </li>
          );
        })}</ul> : <p className="text-[13px] text-muted">No reviews yet.</p>}
      </Section>
      <Section title="Feedback">
        {feedback.length ? <ul className="space-y-3">{feedback.map((f) => (
          <li key={f.id} className="flex gap-3"><EmployeeAvatar employee={f.from} size={30} /><div><div className="text-[12.5px]"><span className="font-medium">{f.from.firstName} {f.from.lastName}</span> <span className="text-muted">· {fmtDate(f.createdAt)}</span> {f.kind === "PRAISE" ? <Badge tone="ok">Praise</Badge> : <Badge tone="info">{humanize(f.kind)}</Badge>}{f.isPrivate && <Badge className="ml-1">Private</Badge>}</div><p className="text-[13.5px] mt-0.5">{f.body}</p></div></li>
        ))}</ul> : <p className="text-[13px] text-muted">No feedback yet.</p>}
      </Section>
    </div>
  );
}

export async function AssetsTab({ e, acc }: { e: Emp; acc: Access }) {
  if (!acc.assets) return <PermissionNotice />;
  const history = await db.assetAssignment.findMany({ where: { employeeId: e.id }, include: { asset: { include: { category: true } } }, orderBy: { assignedAt: "desc" } });
  const current = history.filter((h) => !h.returnedAt);
  const past = history.filter((h) => h.returnedAt);
  return (
    <div className="space-y-5">
      <Section title={`Assigned now (${current.length})`}>
        {current.length ? <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{current.map((h) => (
          <li key={h.id}><Link href={`/assets/${h.asset.id}`} className="block rounded-ctl border border-line p-4 hover:border-line-2">
            <div className="flex items-center gap-2 text-[12px] text-muted"><Laptop className="size-3.5" />{h.asset.category.name} · {h.asset.tag}</div>
            <div className="font-medium mt-1">{h.asset.brand} {h.asset.model}</div>
            <div className="text-[12.5px] text-muted mt-1">Since {fmtDate(h.assignedAt)} · {humanize(h.asset.condition)}</div>
          </Link></li>
        ))}</ul> : <EmptyState compact icon={Laptop} title="No assets assigned" />}
      </Section>
      {past.length > 0 && <Section title="Returned">
        <ul className="divide-y divide-line -my-2">{past.map((h) => <li key={h.id} className="py-2.5 text-[13.5px] flex justify-between gap-3"><span>{h.asset.brand} {h.asset.model} <span className="text-muted">· {h.asset.tag}</span></span><span className="text-muted text-[12.5px]">{fmtDate(h.assignedAt)} – {fmtDate(h.returnedAt)}</span></li>)}</ul>
      </Section>}
    </div>
  );
}

/** Chronological story of an employee, built from every module. */
export async function TimelineTab({ e, acc, v }: { e: Emp; acc: Access; v: Viewer }) {
  if (!acc.timeline) return <PermissionNotice />;
  const [jobs, docs, leaves, assets, reviews] = await Promise.all([
    db.jobHistory.findMany({ where: { employeeId: e.id } }),
    acc.documents ? db.employeeDocument.findMany({ where: { employeeId: e.id, ...(can(v, "documents.manage") ? {} : acc.relationship === "self" ? { visibility: { not: "HR_ONLY" } } : { visibility: "MANAGER" }) }, select: { id: true, name: true, createdAt: true, isGenerated: true } }) : [],
    db.leaveRequest.findMany({ where: { employeeId: e.id, status: "APPROVED" }, include: { leaveType: true } }),
    db.assetAssignment.findMany({ where: { employeeId: e.id }, include: { asset: true } }),
    db.performanceReview.findMany({ where: { employeeId: e.id, status: "COMPLETED" }, include: { cycle: true } }),
  ]);
  const items: (TimelineItem & { at: number })[] = [
    ...jobs.filter((j) => j.type !== "SALARY_REVISION" || acc.payroll).map((j) => ({ id: j.id, at: j.effectiveDate.getTime(), date: fmtDate(j.effectiveDate), icon: HISTORY_ICON[j.type], tone: (j.type === "PROMOTION" ? "ok" : "brand") as TimelineItem["tone"], title: j.type === "JOINED" ? "Joined Rosier Foods" : `${humanize(j.type)}${j.toValue ? ` → ${j.toValue}` : ""}`, body: j.fromValue ? `Previously ${j.fromValue}` : j.note ?? undefined })),
    ...docs.map((d) => ({ id: d.id, at: d.createdAt.getTime(), date: fmtDateTime(d.createdAt), icon: FileText, tone: "muted" as const, title: `${d.isGenerated ? "Letter issued" : "Document uploaded"}: ${d.name}` })),
    ...leaves.map((l) => ({ id: l.id, at: l.startDate.getTime(), date: fmtDate(l.startDate), icon: Plane, tone: "muted" as const, title: `${l.leaveType.name} approved (${l.days}d)` })),
    ...assets.flatMap((a) => [{ id: a.id, at: a.assignedAt.getTime(), date: fmtDate(a.assignedAt), icon: Laptop, tone: "muted" as const, title: `Asset assigned: ${a.asset.brand} ${a.asset.model}` }, ...(a.returnedAt ? [{ id: a.id + "r", at: a.returnedAt.getTime(), date: fmtDate(a.returnedAt), icon: Laptop, tone: "muted" as const, title: `Asset returned: ${a.asset.brand} ${a.asset.model}` }] : [])]),
    ...(acc.performance ? reviews.map((r) => ({ id: r.id, at: (r.completedAt ?? r.createdAt).getTime(), date: fmtDate(r.completedAt ?? r.createdAt), icon: Star, tone: "ok" as const, title: `Performance review completed — ${r.cycle.name}`, body: r.finalRating && (acc.relationship !== "peer") ? `Rating ${r.finalRating}/5` : undefined })) : []),
  ].sort((a, b) => b.at - a.at);
  return <div className="card p-5 sm:p-6"><Timeline items={items.slice(0, 60)} /></div>;
}
