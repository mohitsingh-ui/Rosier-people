import Link from "next/link";
import { Plus, Pencil, ExternalLink, ShieldCheck, Lock } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, can } from "@/lib/auth/viewer";
import { fmtDateTime, today } from "@/lib/dates";
import { cn, humanize, inr, num } from "@/lib/utils";
import { PERMISSIONS, ROLE_LABELS } from "@/lib/permissions";
import { PF_RATE, PF_WAGE_CEILING, ESI_RATE, ESI_GROSS_LIMIT } from "@/lib/payroll-calc";
import { listWorkflows, disabledSteps } from "@/lib/workflow";
import { PageHeader, Section } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { EmptyState, TableWrap } from "@/components/ui/misc";
import { ActionButton } from "@/components/ui/action-button";
import { SearchBar, FilterDropdown } from "@/components/ui/filters";
import { CompanyForm, LeaveTypeForm, AllocationForm, ShiftForm, DocTypeForm, TemplateForm, ExpenseCategoryForm, AssetCategoryForm, ToggleSettings, SelfEditable, PermissionCell } from "@/components/settings/forms";
import { toggleWorkflowStep } from "@/server/settings";
import { setting } from "@/server/queries";
import "@/server/workflows";

export const metadata = { title: "Settings" };

const SECTIONS: { key: string; label: string; perm: "settings.manage" | "settings.security" | "audit.view"; group: string }[] = [
  { key: "company", label: "Company", perm: "settings.security", group: "Organisation" },
  { key: "org", label: "Departments, designations & locations", perm: "settings.manage", group: "Organisation" },
  { key: "employment", label: "Employment types & self-service", perm: "settings.manage", group: "Organisation" },
  { key: "leave", label: "Leave policies", perm: "settings.manage", group: "Time" },
  { key: "attendance", label: "Attendance policies & shifts", perm: "settings.manage", group: "Time" },
  { key: "holidays", label: "Holiday calendar", perm: "settings.manage", group: "Time" },
  { key: "doctypes", label: "Document types", perm: "settings.manage", group: "Documents" },
  { key: "templates", label: "Document templates", perm: "settings.manage", group: "Documents" },
  { key: "payroll", label: "Payroll settings", perm: "settings.manage", group: "Money" },
  { key: "expenses", label: "Expense categories", perm: "settings.manage", group: "Money" },
  { key: "assets", label: "Asset categories", perm: "settings.manage", group: "Money" },
  { key: "performance", label: "Performance cycles", perm: "settings.manage", group: "People" },
  { key: "roles", label: "Roles & permissions", perm: "settings.security", group: "Security" },
  { key: "security", label: "Security", perm: "settings.security", group: "Security" },
  { key: "notifications", label: "Notifications", perm: "settings.manage", group: "System" },
  { key: "workflows", label: "Workflows", perm: "settings.manage", group: "System" },
  { key: "integrations", label: "Integrations", perm: "settings.security", group: "System" },
  { key: "audit", label: "Audit logs", perm: "audit.view", group: "System" },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ s?: string; q?: string; entity?: string; actor?: string }> }) {
  const v = await requirePermission(["settings.manage", "settings.security", "audit.view"]);
  const sp = await searchParams;
  const visible = SECTIONS.filter((x) => can(v, x.perm));
  const s = visible.some((x) => x.key === sp.s) ? sp.s! : visible[0].key;
  const groups = [...new Set(visible.map((x) => x.group))];
  return (
    <>
      <PageHeader title="Settings" description="Policies, calendars, templates, permissions and system configuration." />
      <div className="grid lg:grid-cols-[250px_1fr] gap-6">
        <nav className="card p-3 h-fit lg:sticky lg:top-20" aria-label="Settings sections">
          {groups.map((g) => (
            <div key={g} className="mb-2.5 last:mb-0"><div className="eyebrow px-2 py-1.5">{g}</div>
              <ul>{visible.filter((x) => x.group === g).map((x) => <li key={x.key}><Link href={`/settings?s=${x.key}`} className={cn("block rounded-lg px-2 py-1.5 text-[13.5px]", x.key === s ? "bg-brand-50 text-brand font-medium" : "text-ink-2 hover:bg-soft")}>{x.label}</Link></li>)}</ul>
            </div>
          ))}
        </nav>
        <div className="min-w-0 space-y-5">{await render(s)}</div>
      </div>
    </>
  );

  async function render(key: string) {
    switch (key) {
      case "company": {
        const c = await setting<Record<string, string>>("company", {});
        return <Section title="Company"><CompanyForm c={c} /></Section>;
      }
      case "org": {
        const [d, g, l] = await Promise.all([db.department.count(), db.designation.count(), db.location.count()]);
        return <Section title="Departments, designations & locations">
          <p className="text-[13.5px] text-muted mb-4">These are managed from the Organization page so changes show up in the org chart straight away.</p>
          <div className="grid sm:grid-cols-3 gap-3">{[["Departments", d, "departments"], ["Designations", g, "designations"], ["Locations", l, "locations"]].map(([n, c, t]) => <Link key={n as string} href={`/organization?tab=${t}`} className="rounded-ctl border border-line p-4 hover:border-line-2"><div className="text-[12.5px] text-muted">{n}</div><div className="text-[22px] font-semibold">{c}</div><div className="text-[12.5px] text-brand mt-1 inline-flex items-center gap-1">Manage <ExternalLink className="size-3" /></div></Link>)}</div>
        </Section>;
      }
      case "employment": {
        const fields = [["personalEmail", "Personal email"], ["personalPhone", "Personal phone"], ["addressLine1", "Address line 1"], ["addressLine2", "Address line 2"], ["city", "City"], ["state", "State"], ["pin", "PIN code"], ["bloodGroup", "Blood group"], ["maritalStatus", "Marital status"], ["bio", "About / bio"], ["skills", "Skills"], ["emergencyContacts", "Emergency contacts"], ["family", "Family details"]].map(([k, label]) => ({ key: k, label }));
        const counts = await db.employee.groupBy({ by: ["employmentType"], where: { status: { notIn: ["EXITED"] } }, _count: true });
        return <>
          <Section title="Employment types"><ul className="grid sm:grid-cols-5 gap-3">{["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "CONSULTANT"].map((t) => <li key={t} className="rounded-ctl border border-line px-3 py-2.5"><div className="text-[13px] font-medium">{humanize(t)}</div><div className="text-[12px] text-muted">{counts.find((c) => c.employmentType === t)?._count ?? 0} people</div></li>)}</ul></Section>
          <Section title="What employees can edit themselves"><p className="text-[13px] text-muted mb-4">Everything else can only be changed by HR. Identity numbers and bank details are always HR/payroll only.</p><SelfEditable fields={fields} initial={await setting<string[]>("selfEditableFields", [])} /></Section>
        </>;
      }
      case "leave": {
        const types = await db.leaveType.findMany({ orderBy: { name: "asc" } });
        return <Section title="Leave policies" action={<div className="flex gap-2"><Modal title="Yearly allocation" trigger={<Button variant="secondary" size="sm">Run yearly allocation</Button>}><AllocationForm year={today().getUTCFullYear() + (today().getUTCMonth() === 11 ? 1 : 0)} /></Modal><Modal size="lg" title="New leave type" trigger={<Button size="sm"><Plus className="size-3.5" />Leave type</Button>}><LeaveTypeForm /></Modal></div>}>
          <div className="overflow-x-auto -mx-5"><table className="tbl"><thead><tr><th>Leave type</th><th>Days / year</th><th>Carry forward</th><th>Half days</th><th>Paid</th><th>Document after</th><th /></tr></thead><tbody>
            {types.map((t) => <tr key={t.id} className={!t.isActive ? "opacity-50" : ""}><td><span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: t.color }} /><span className="font-medium">{t.name}</span><span className="text-muted text-[12px]">{t.code}</span></span></td><td>{t.allowNegative ? "No limit" : t.annualQuota}</td><td>{t.carryForward ? `Up to ${t.maxCarryForward}` : "—"}</td><td>{t.allowHalfDay ? "Yes" : "No"}</td><td>{t.isPaid ? "Paid" : <Badge>Unpaid</Badge>}</td><td>{t.docRequiredAfterDays ? `${t.docRequiredAfterDays} days` : "—"}</td>
              <td className="text-right"><Modal size="lg" title={`Edit ${t.name}`} trigger={<Button variant="ghost" size="iconSm" aria-label="Edit"><Pencil className="size-3.5" /></Button>}><LeaveTypeForm t={t} /></Modal></td></tr>)}
          </tbody></table></div>
        </Section>;
      }
      case "attendance": {
        const shifts = await db.shift.findMany({ include: { _count: { select: { employees: true } } } });
        return <Section title="Attendance policies & shifts" action={<Modal size="lg" title="New shift" trigger={<Button size="sm"><Plus className="size-3.5" />Shift</Button>}><ShiftForm /></Modal>}>
          <p className="text-[13px] text-muted mb-4">Late marking, half days and overtime are worked out from each person&apos;s shift. Biometric, GPS and selfie check-ins plug in through Integrations.</p>
          <ul className="grid md:grid-cols-2 gap-4">{shifts.map((x) => (
            <li key={x.id} className="rounded-ctl border border-line p-4"><div className="flex justify-between"><div><div className="font-semibold">{x.name} {x.isDefault && <Badge tone="brand" className="ml-1">Default</Badge>}</div><div className="text-[13px] text-muted">{x.startTime} – {x.endTime} · {x._count.employees} people</div></div><Modal size="lg" title={`Edit ${x.name}`} trigger={<Button variant="ghost" size="iconSm" aria-label="Edit"><Pencil className="size-3.5" /></Button>}><ShiftForm s={x} /></Modal></div>
              <dl className="grid grid-cols-2 gap-2 text-[12.5px] mt-3"><div><dt className="text-muted inline">Grace </dt><dd className="inline">{x.graceMinutes} min</dd></div><div><dt className="text-muted inline">Break </dt><dd className="inline">{x.breakMinutes} min</dd></div><div><dt className="text-muted inline">Half day under </dt><dd className="inline">{x.halfDayMinutes / 60}h</dd></div><div><dt className="text-muted inline">Overtime after </dt><dd className="inline">{x.overtimeAfterMin / 60}h</dd></div><div className="col-span-2"><dt className="text-muted inline">Weekly off </dt><dd className="inline">{x.weeklyOffs.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ") || "None"}</dd></div></dl></li>
          ))}</ul>
        </Section>;
      }
      case "holidays": {
        const n = await db.holiday.count({ where: { date: { gte: new Date(Date.UTC(today().getUTCFullYear(), 0, 1)) } } });
        return <Section title="Holiday calendar"><p className="text-[13.5px] text-muted mb-3">{n} holidays set for this year and later. Add, edit or remove them on the holiday calendar.</p><Link href="/leave?tab=holidays" className="text-brand text-[13.5px] hover:underline inline-flex items-center gap-1">Open holiday calendar <ExternalLink className="size-3.5" /></Link></Section>;
      }
      case "doctypes": {
        const [types, cats] = await Promise.all([db.documentType.findMany({ include: { category: true, _count: { select: { documents: true } } }, orderBy: [{ category: { order: "asc" } }, { name: "asc" }] }), db.documentCategory.findMany({ orderBy: { order: "asc" } })]);
        const catOpts = cats.map((c) => ({ value: c.id, label: c.name }));
        return <Section title="Document types" action={<Modal title="New document type" trigger={<Button size="sm"><Plus className="size-3.5" />Type</Button>}><DocTypeForm categories={catOpts} /></Modal>}>
          <div className="overflow-x-auto -mx-5"><table className="tbl"><thead><tr><th>Type</th><th>Category</th><th>Rules</th><th>Visibility</th><th>Files</th><th /></tr></thead><tbody>
            {types.map((t) => <tr key={t.id}><td className="font-medium">{t.name}</td><td>{t.category.name}</td><td className="space-x-1">{t.isMandatory && <Badge tone="bad">Mandatory</Badge>}{t.hasExpiry && <Badge tone="warn">Expiry</Badge>}{t.isSensitive && <Badge tone="plum">Sensitive</Badge>}{!t.employeeUpload && <Badge>HR uploads</Badge>}</td><td className="text-[12.5px]">{humanize(t.defaultVisibility)}</td><td>{t._count.documents}</td><td className="text-right"><Modal title={`Edit ${t.name}`} trigger={<Button variant="ghost" size="iconSm" aria-label="Edit"><Pencil className="size-3.5" /></Button>}><DocTypeForm categories={catOpts} t={t} /></Modal></td></tr>)}
          </tbody></table></div>
        </Section>;
      }
      case "templates": {
        const tpls = await db.documentTemplate.findMany({ orderBy: { name: "asc" } });
        return <Section title="Document templates" action={<Modal size="xl" title="New template" trigger={<Button size="sm"><Plus className="size-3.5" />Template</Button>}><TemplateForm /></Modal>}>
          <p className="text-[13px] text-muted mb-4">Letters are generated as PDFs on Rosier letterhead from an employee&apos;s Documents tab and saved to their vault.</p>
          <ul className="grid sm:grid-cols-2 gap-3">{tpls.map((t) => <li key={t.id} className="rounded-ctl border border-line p-4 flex justify-between gap-3"><div className="min-w-0"><div className="font-medium">{t.name} {!t.isActive && <Badge>Hidden</Badge>}</div><div className="text-[12px] text-muted font-mono">{t.kind}</div><p className="text-[12.5px] text-muted mt-2 line-clamp-2">{t.body}</p></div><Modal size="xl" title={`Edit ${t.name}`} trigger={<Button variant="ghost" size="iconSm" aria-label="Edit"><Pencil className="size-3.5" /></Button>}><TemplateForm t={t} /></Modal></li>)}</ul>
        </Section>;
      }
      case "payroll": return <Section title="Payroll settings">
        <dl className="grid sm:grid-cols-2 gap-4 text-[13.5px]">
          <div className="rounded-ctl border border-line p-4"><dt className="text-muted text-[12.5px]">Provident fund</dt><dd className="font-medium">{PF_RATE * 100}% of basic, wage ceiling {inr(PF_WAGE_CEILING)}</dd></div>
          <div className="rounded-ctl border border-line p-4"><dt className="text-muted text-[12.5px]">ESI</dt><dd className="font-medium">{ESI_RATE * 100}% of gross up to {inr(ESI_GROSS_LIMIT)}/month</dd></div>
          <div className="rounded-ctl border border-line p-4"><dt className="text-muted text-[12.5px]">Professional tax</dt><dd className="font-medium">By work-location state (UP and Delhi: none)</dd></div>
          <div className="rounded-ctl border border-line p-4"><dt className="text-muted text-[12.5px]">TDS</dt><dd className="font-medium">New regime slabs, ₹75,000 standard deduction, 87A rebate</dd></div>
          <div className="rounded-ctl border border-line p-4"><dt className="text-muted text-[12.5px]">Default structure</dt><dd className="font-medium">Basic 50% of CTC · HRA 40% of basic · rest special allowance</dd></div>
          <div className="rounded-ctl border border-line p-4"><dt className="text-muted text-[12.5px]">Loss of pay</dt><dd className="font-medium">Approved unpaid leave + unexplained absences</dd></div>
        </dl>
        <p className="text-[12px] text-muted mt-4">Rates live in <code className="font-mono">src/lib/payroll-calc.ts</code>. Confirm them with your CA before your first live run.</p>
      </Section>;
      case "expenses": {
        const cats = await db.expenseCategory.findMany({ orderBy: { name: "asc" } });
        return <Section title="Expense categories" action={<Modal title="New category" trigger={<Button size="sm"><Plus className="size-3.5" />Category</Button>}><ExpenseCategoryForm /></Modal>}>
          <ul className="divide-y divide-line -my-2">{cats.map((c) => <li key={c.id} className="py-2.5 flex items-center justify-between"><span className={cn("text-[13.5px]", !c.isActive && "text-muted line-through")}>{c.name}</span><span className="flex items-center gap-3 text-[12.5px] text-muted">{c.limit ? `Limit ${inr(c.limit)}` : "No limit"}<Modal title={`Edit ${c.name}`} trigger={<Button variant="ghost" size="iconSm" aria-label="Edit"><Pencil className="size-3.5" /></Button>}><ExpenseCategoryForm c={{ ...c, limit: c.limit ? num(c.limit) : null }} /></Modal></span></li>)}</ul>
        </Section>;
      }
      case "assets": {
        const cats = await db.assetCategory.findMany({ include: { _count: { select: { assets: true } } }, orderBy: { name: "asc" } });
        return <Section title="Asset categories" action={<Modal title="New category" trigger={<Button size="sm"><Plus className="size-3.5" />Category</Button>}><AssetCategoryForm /></Modal>}>
          <ul className="grid sm:grid-cols-3 gap-3">{cats.map((c) => <li key={c.id} className="rounded-ctl border border-line px-4 py-3 flex items-center justify-between"><span><span className="block text-[13.5px] font-medium">{c.name}</span><span className="text-[12px] text-muted font-mono">RF-{c.prefix}-···· · {c._count.assets}</span></span><Modal title={`Edit ${c.name}`} trigger={<Button variant="ghost" size="iconSm" aria-label="Edit"><Pencil className="size-3.5" /></Button>}><AssetCategoryForm c={c} /></Modal></li>)}</ul>
        </Section>;
      }
      case "performance": return <Section title="Performance cycles"><p className="text-[13.5px] text-muted mb-3">Create cycles, open goal setting and launch reviews from the Performance page.</p><Link href="/performance?tab=cycles" className="text-brand text-[13.5px] hover:underline inline-flex items-center gap-1">Manage cycles <ExternalLink className="size-3.5" /></Link></Section>;
      case "roles": {
        const roles = await db.role.findMany({ include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } } });
        const order = ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"] as const;
        const byKey = Object.fromEntries(roles.map((r) => [r.key, new Set(r.permissions.map((p) => p.permission.key))]));
        const modules = [...new Set(Object.values(PERMISSIONS).map((p) => p.module))];
        return <Section title="Roles & permissions">
          <p className="text-[13px] text-muted mb-4">Changes apply on the next page load. Every permission is enforced on the server — the sidebar only hides what a role can&apos;t open. Managers always see only their own reporting line.</p>
          <div className="overflow-x-auto -mx-5"><table className="tbl"><thead><tr><th>Permission</th>{order.map((r) => <th key={r} className="text-center">{ROLE_LABELS[r]}<div className="font-normal normal-case text-faint">{roles.find((x) => x.key === r)?._count.users ?? 0} users</div></th>)}</tr></thead><tbody>
            {modules.map((m) => [
              <tr key={m}><td colSpan={5} className="!bg-soft/50 !py-1.5 eyebrow">{m}</td></tr>,
              ...Object.entries(PERMISSIONS).filter(([, p]) => p.module === m).map(([k, p]) => (
                <tr key={k}><td><span className="text-[13px]">{p.description}</span>{"sensitive" in p && p.sensitive && <Lock className="size-3 inline ml-1.5 text-plum" aria-label="Sensitive" />}<div className="text-[11px] text-faint font-mono">{k}</div></td>
                  {order.map((r) => <td key={r} className="text-center"><PermissionCell role={r} permission={k} on={byKey[r]?.has(k) ?? false} locked={r === "SUPER_ADMIN" && ["settings.security", "people.edit"].includes(k)} /></td>)}</tr>
              )),
            ])}
          </tbody></table></div>
        </Section>;
      }
      case "security": {
        const [sec, sessions] = await Promise.all([setting<Record<string, unknown>>("security", {}), db.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } })]);
        return <>
          <Section title="Sign-in protection">
            <ul className="grid sm:grid-cols-2 gap-3 text-[13.5px]">
              {[["Password hashing", "bcrypt, cost 12"], ["Sessions", `Opaque httpOnly cookie, ${sec.sessionHours ?? 12}h (30 days with “remember me”) · ${sessions} active`], ["Lockout", `${sec.lockoutAttempts ?? 5} failed attempts → ${sec.lockoutMinutes ?? 15} min lock`], ["Rate limiting", "Sign-in, password reset and every API route"], ["Sensitive data", "PAN, Aadhaar, passport and bank numbers encrypted with AES-256-GCM"], ["Files", "Private storage; 5-minute signed links issued after a permission check"]].map(([k, v2]) => <li key={k} className="rounded-ctl border border-line p-4"><div className="flex items-center gap-1.5 text-[12.5px] text-muted"><ShieldCheck className="size-3.5 text-ok" />{k}</div><div className="font-medium mt-0.5">{v2}</div></li>)}
            </ul>
          </Section>
          <Section title="Policies"><ToggleSettings settingKey="security" initial={Object.fromEntries(Object.entries(sec).filter(([, x]) => typeof x === "boolean")) as Record<string, boolean>} items={[{ key: "require2faForAdmins", label: "Require two-factor sign-in for admins", hint: "Needs an authenticator/OTP provider configured (2FA-ready)" }]} /></Section>
        </>;
      }
      case "notifications": {
        const n = await setting<Record<string, boolean>>("notifications", {});
        return <Section title="Email notifications"><p className="text-[13px] text-muted mb-2">In-app notifications are always on. Email goes through the provider set in <code className="font-mono">EMAIL_PROVIDER</code>; push notifications plug into the same pipeline.</p>
          <ToggleSettings settingKey="notifications" initial={n} items={[{ key: "emailOnLeave", label: "Leave requests and decisions" }, { key: "emailOnPayroll", label: "Payslips ready" }, { key: "emailOnDocumentExpiry", label: "Document expiry reminders (30 / 15 / 7 days)" }, { key: "emailOnHelpdesk", label: "Helpdesk replies" }, { key: "birthdayWishes", label: "Birthday and work-anniversary wishes" }]} /></Section>;
      }
      case "workflows": {
        const [wfs, off] = [listWorkflows(), await disabledSteps()];
        return <Section title="Workflows"><p className="text-[13px] text-muted mb-4">Each business event runs these steps in order. Core data changes (balances, statuses) always happen; follow-on steps can be switched off.</p>
          <ul className="space-y-4">{wfs.map((w) => <li key={w.event} className="rounded-ctl border border-line p-4"><div className="flex items-center justify-between"><span className="font-medium">{w.label}</span><code className="text-[11.5px] text-faint">{w.event}</code></div>
            <ol className="mt-3 space-y-2">{w.steps.map((st, i) => { const id = `${w.event}:${st.id}`; const disabled = off.has(id); return (
              <li key={st.id} className="flex items-center gap-3 text-[13px]"><span className="size-5 rounded-full bg-soft text-[11px] grid place-items-center">{i + 1}</span><span className={cn("flex-1", disabled && "text-muted line-through")}>{st.label}</span><ActionButton action={toggleWorkflowStep} payload={{ step: id }} variant="ghost" success={disabled ? "On" : "Off"}>{disabled ? "Turn on" : "Turn off"}</ActionButton></li>
            ); })}</ol></li>)}</ul></Section>;
      }
      case "integrations": {
        const i = await setting<Record<string, boolean>>("integrations", {});
        return <Section title="Integrations"><p className="text-[13px] text-muted mb-2">Connection points are built in; each needs credentials in the environment before switching on.</p>
          <ToggleSettings settingKey="integrations" initial={i} items={[{ key: "googleWorkspace", label: "Google Workspace sign-in", hint: "OAuth client ID/secret" }, { key: "microsoft", label: "Microsoft 365 sign-in", hint: "Entra app registration" }, { key: "biometric", label: "Biometric attendance devices", hint: "Devices push punches to the attendance API" }, { key: "gpsCheckIn", label: "GPS check-in on mobile", hint: "Already captured when available" }, { key: "selfieCheckIn", label: "Selfie check-in" }, { key: "slack", label: "Slack notifications" }]} /></Section>;
      }
      case "audit": {
        const q = sp.q?.trim();
        const logs = await db.auditLog.findMany({ where: { ...(sp.entity ? { entity: sp.entity } : {}), ...(q ? { OR: [{ summary: { contains: q, mode: "insensitive" } }, { action: { contains: q, mode: "insensitive" } }] } : {}) }, include: { actor: { include: { employee: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
        const entities = await db.auditLog.findMany({ distinct: ["entity"], select: { entity: true } });
        return <Section title="Audit logs">
          <div className="flex flex-wrap gap-2 mb-4"><SearchBar placeholder="Search what happened" className="flex-1 min-w-56" /><FilterDropdown param="entity" label="All records" options={entities.map((e) => ({ value: e.entity, label: e.entity }))} /></div>
          {logs.length === 0 ? <EmptyState compact title="No matching events" /> : (
            <TableWrap className="-mx-5 border-x-0 rounded-none shadow-none"><table className="tbl"><thead><tr><th>When</th><th>Who</th><th>What happened</th><th>Change</th><th>From</th></tr></thead><tbody>
              {logs.map((l) => <tr key={l.id}>
                <td className="whitespace-nowrap text-[12.5px] text-muted">{fmtDateTime(l.createdAt)}</td>
                <td className="whitespace-nowrap text-[13px]">{l.actor?.employee ? `${l.actor.employee.firstName} ${l.actor.employee.lastName}` : l.actor?.email ?? "System"}</td>
                <td className="text-[13px] min-w-72">{l.summary}<div className="text-[11px] text-faint font-mono">{l.action} · {l.entity}</div></td>
                <td className="text-[11.5px] font-mono text-muted max-w-60">{l.before || l.after ? <details><summary className="cursor-pointer text-brand">view</summary><div className="mt-1 whitespace-pre-wrap break-all">{l.before ? `before: ${JSON.stringify(l.before)}\n` : ""}{l.after ? `after: ${JSON.stringify(l.after)}` : ""}</div></details> : "—"}</td>
                <td className="text-[11.5px] text-muted whitespace-nowrap">{l.ip}<div className="truncate max-w-40">{l.userAgent?.replace(/\(.*?\)/g, "").slice(0, 40)}</div></td>
              </tr>)}
            </tbody></table></TableWrap>
          )}
        </Section>;
      }
    }
    return null;
  }
}
