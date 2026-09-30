"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, Input, Select, Textarea, Submit, FormActions, Grid, Checkbox } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { saveLeaveType, runYearlyAllocation } from "@/server/leave";
import { saveShift } from "@/server/attendance";
import { saveTemplate, saveDocumentType } from "@/server/documents";
import { saveExpenseCategory } from "@/server/expenses";
import { saveAssetCategory } from "@/server/assets";
import { saveCompany, saveSettingJson, togglePermission } from "@/server/settings";
import { TEMPLATE_VARIABLES } from "@/lib/templates";
import { cn } from "@/lib/utils";

type Opt = { value: string; label: string };

export function CompanyForm({ c }: { c: Record<string, string | undefined> }) {
  return (
    <ActionForm action={saveCompany} success="Saved" reset={false}>
      <Grid><Input label="Legal name" name="name" defaultValue={c.name} required /><Input label="Short name" name="shortName" defaultValue={c.shortName} required /></Grid>
      <Input label="Registered address" name="address" defaultValue={c.address} required />
      <Grid><Input label="HR email" name="email" type="email" defaultValue={c.email} required /><Input label="Phone" name="phone" defaultValue={c.phone} /><Input label="CIN" name="cin" defaultValue={c.cin} /><Input label="Website" name="website" defaultValue={c.website} /></Grid>
      <p className="text-[12px] text-muted">Used on letters, payslips and report exports.</p>
      <FormActions><Submit>Save company</Submit></FormActions>
    </ActionForm>
  );
}

export function LeaveTypeForm({ t }: { t?: { id: string; name: string; code: string; annualQuota: number; carryForward: boolean; maxCarryForward: number; isPaid: boolean; allowHalfDay: boolean; allowNegative: boolean; docRequiredAfterDays: number | null; color: string; isActive: boolean } }) {
  return (
    <ActionForm action={saveLeaveType} success="Policy saved">
      {t && <input type="hidden" name="id" value={t.id} />}
      <Grid cols={3}><Input label="Name" name="name" defaultValue={t?.name} required wrapClass="sm:col-span-2" /><Input label="Code" name="code" defaultValue={t?.code} required maxLength={6} /></Grid>
      <Grid cols={3}>
        <Input label="Days per year" name="annualQuota" type="number" step="0.5" min={0} defaultValue={t?.annualQuota ?? 12} />
        <Input label="Max carry forward" name="maxCarryForward" type="number" step="0.5" min={0} defaultValue={t?.maxCarryForward ?? 0} />
        <Input label="Document needed after (days)" name="docRequiredAfterDays" type="number" min={0} defaultValue={t?.docRequiredAfterDays ?? ""} />
      </Grid>
      <Input label="Calendar colour" name="color" type="color" defaultValue={t?.color ?? "#A56312"} className="h-10 w-20 p-1" />
      <div className="grid sm:grid-cols-2 gap-3">
        <Checkbox label="Paid leave" name="isPaid" defaultChecked={t?.isPaid ?? true} />
        <Checkbox label="Carry forward unused days" name="carryForward" defaultChecked={t?.carryForward} />
        <Checkbox label="Allow half days" name="allowHalfDay" defaultChecked={t?.allowHalfDay ?? true} />
        <Checkbox label="Allow without balance (e.g. unpaid)" name="allowNegative" defaultChecked={t?.allowNegative} />
        <Checkbox label="Active" name="isActive" defaultChecked={t?.isActive ?? true} />
      </div>
      <FormActions><Submit>Save policy</Submit></FormActions>
    </ActionForm>
  );
}

export function AllocationForm({ year }: { year: number }) {
  return (
    <ActionForm action={runYearlyAllocation} success="Allocated">
      <p className="text-[13px] text-muted">Credits each active employee with the yearly quota and carries forward unused days (within each policy&apos;s cap). Safe to run more than once.</p>
      <Input label="Year" name="year" type="number" defaultValue={year} />
      <FormActions><Submit>Run allocation</Submit></FormActions>
    </ActionForm>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function ShiftForm({ s }: { s?: { id: string; name: string; startTime: string; endTime: string; graceMinutes: number; halfDayMinutes: number; fullDayMinutes: number; overtimeAfterMin: number; breakMinutes: number; weeklyOffs: number[]; isDefault: boolean } }) {
  return (
    <ActionForm action={saveShift} success="Shift saved">
      {s && <input type="hidden" name="id" value={s.id} />}
      <Input label="Name" name="name" defaultValue={s?.name} required />
      <Grid cols={3}>
        <Input label="Starts" name="startTime" type="time" defaultValue={s?.startTime ?? "09:30"} required />
        <Input label="Ends" name="endTime" type="time" defaultValue={s?.endTime ?? "18:30"} required />
        <Input label="Grace (min)" name="graceMinutes" type="number" min={0} defaultValue={s?.graceMinutes ?? 15} hint="Late after this" />
        <Input label="Break (min)" name="breakMinutes" type="number" min={0} defaultValue={s?.breakMinutes ?? 60} />
        <Input label="Half day below (min)" name="halfDayMinutes" type="number" defaultValue={s?.halfDayMinutes ?? 240} />
        <Input label="Full day (min)" name="fullDayMinutes" type="number" defaultValue={s?.fullDayMinutes ?? 480} />
        <Input label="Overtime after (min)" name="overtimeAfterMin" type="number" defaultValue={s?.overtimeAfterMin ?? 540} hint="Including break" />
      </Grid>
      <fieldset><legend className="label">Weekly offs</legend><div className="flex flex-wrap gap-2">{DAYS.map((d, i) => (
        <label key={d} className="cursor-pointer"><input type="checkbox" name="weeklyOffs[]" value={i} defaultChecked={(s?.weeklyOffs ?? [0]).includes(i)} className="peer sr-only" /><span className="inline-block rounded-ctl border border-line-2 px-3 py-1.5 text-[13px] peer-checked:border-brand-2 peer-checked:bg-brand-50 peer-checked:text-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand-2">{d}</span></label>
      ))}</div></fieldset>
      <Checkbox label="Default shift for new joiners" name="isDefault" defaultChecked={s?.isDefault} />
      <FormActions><Submit>Save shift</Submit></FormActions>
    </ActionForm>
  );
}

export function DocTypeForm({ categories, t }: { categories: Opt[]; t?: { id: string; name: string; categoryId: string; hasExpiry: boolean; isMandatory: boolean; isSensitive: boolean; employeeUpload: boolean; defaultVisibility: string } }) {
  return (
    <ActionForm action={saveDocumentType} success="Saved">
      {t && <input type="hidden" name="id" value={t.id} />}
      <Grid><Input label="Name" name="name" defaultValue={t?.name} required /><Select label="Category" name="categoryId" defaultValue={t?.categoryId} options={categories} /></Grid>
      <Select label="Default visibility" name="defaultVisibility" defaultValue={t?.defaultVisibility ?? "EMPLOYEE"} options={[{ value: "EMPLOYEE", label: "Employee and HR" }, { value: "MANAGER", label: "Employee, manager and HR" }, { value: "HR_ONLY", label: "HR only" }]} />
      <div className="grid sm:grid-cols-2 gap-3">
        <Checkbox label="Has an expiry date" name="hasExpiry" defaultChecked={t?.hasExpiry} />
        <Checkbox label="Mandatory for everyone" name="isMandatory" defaultChecked={t?.isMandatory} />
        <Checkbox label="Sensitive (views are audit-logged)" name="isSensitive" defaultChecked={t?.isSensitive} />
        <Checkbox label="Employees can upload" name="employeeUpload" defaultChecked={t?.employeeUpload ?? true} />
      </div>
      <FormActions><Submit>Save</Submit></FormActions>
    </ActionForm>
  );
}

export function TemplateForm({ t }: { t?: { id: string; name: string; kind: string; subject: string; body: string; isActive: boolean } }) {
  const [body, setBody] = useState(t?.body ?? "Dear {{employee_name}},\n\n");
  return (
    <ActionForm action={saveTemplate} success="Template saved">
      {t && <input type="hidden" name="id" value={t.id} />}
      <Grid><Input label="Template name" name="name" defaultValue={t?.name} required /><Input label="Kind" name="kind" defaultValue={t?.kind ?? "OTHER_LETTER"} required hint="e.g. OFFER_LETTER" /></Grid>
      <Input label="Letter heading" name="subject" defaultValue={t?.subject} required />
      <Textarea label="Body" name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={12} required />
      <div><div className="label">Insert a variable</div><div className="flex flex-wrap gap-1.5">{TEMPLATE_VARIABLES.map((x) => <button key={x} type="button" onClick={() => setBody((b) => `${b}{{${x}}}`)} className="rounded-full bg-soft px-2.5 py-1 text-[11.5px] font-mono text-ink-2 hover:bg-brand-50 hover:text-brand">{`{{${x}}}`}</button>)}</div></div>
      <Select label="Status" name="isActive" defaultValue={t && !t.isActive ? "off" : "on"} options={[{ value: "on", label: "Active" }, { value: "off", label: "Hidden" }]} />
      <FormActions><Submit>Save template</Submit></FormActions>
    </ActionForm>
  );
}

export function ExpenseCategoryForm({ c }: { c?: { id: string; name: string; limit: number | null; isActive: boolean } }) {
  return (
    <ActionForm action={saveExpenseCategory} success="Saved">
      {c && <input type="hidden" name="id" value={c.id} />}
      <Grid><Input label="Name" name="name" defaultValue={c?.name} required /><Input label="Per-item limit (₹)" name="limit" type="number" min={0} defaultValue={c?.limit ?? ""} hint="Blank = no limit" /></Grid>
      <Checkbox label="Active" name="isActive" defaultChecked={c?.isActive ?? true} />
      <FormActions><Submit>Save</Submit></FormActions>
    </ActionForm>
  );
}

export function AssetCategoryForm({ c }: { c?: { id: string; name: string; prefix: string } }) {
  return (
    <ActionForm action={saveAssetCategory} success="Saved">
      {c && <input type="hidden" name="id" value={c.id} />}
      <Grid><Input label="Name" name="name" defaultValue={c?.name} required /><Input label="ID prefix" name="prefix" defaultValue={c?.prefix} required maxLength={4} hint="Asset IDs look like RF-LAP-0012" /></Grid>
      <FormActions><Submit>Save</Submit></FormActions>
    </ActionForm>
  );
}

/** Generic key → boolean toggles saved as one JSON setting. */
export function ToggleSettings({ settingKey, items, initial }: { settingKey: string; items: { key: string; label: string; hint?: string }[]; initial: Record<string, boolean> }) {
  const [state, setState] = useState(initial);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const save = (next: Record<string, boolean>) => { setState(next); start(async () => { const r = await saveSettingJson({ key: settingKey, value: JSON.stringify(next) }); if (!r.ok) toast("error", r.error); else router.refresh(); }); };
  return (
    <ul className="divide-y divide-line" aria-busy={pending}>
      {items.map((it) => (
        <li key={it.key} className="flex items-center justify-between gap-4 py-3">
          <span><span className="block text-[13.5px]">{it.label}</span>{it.hint && <span className="block text-[12px] text-muted">{it.hint}</span>}</span>
          <button type="button" role="switch" aria-checked={!!state[it.key]} aria-label={it.label} onClick={() => save({ ...state, [it.key]: !state[it.key] })}
            className={cn("relative h-6 w-11 rounded-full transition-colors shrink-0", state[it.key] ? "bg-brand" : "bg-line-2")}>
            <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", state[it.key] ? "left-[22px]" : "left-0.5")} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Which profile fields employees may edit themselves (saved as an array). */
export function SelfEditable({ fields, initial }: { fields: { key: string; label: string }[]; initial: string[] }) {
  const [set, setSet] = useState(new Set(initial));
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-2.5">{fields.map((f) => (
        <label key={f.key} className="flex items-center gap-2.5 text-[13.5px] cursor-pointer"><input type="checkbox" className="size-4 accent-[#784900]" checked={set.has(f.key)} onChange={() => setSet((s) => { const n = new Set(s); if (n.has(f.key)) n.delete(f.key); else n.add(f.key); return n; })} />{f.label}</label>
      ))}</div>
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await saveSettingJson({ key: "selfEditableFields", value: JSON.stringify([...set]) }); toast(r.ok ? "success" : "error", r.ok ? "Saved" : r.error); })} className="mt-4 h-9 px-4 rounded-ctl bg-brand text-white text-[13.5px] font-medium disabled:opacity-50">Save</button>
    </div>
  );
}

export function PermissionCell({ role, permission, on, locked }: { role: string; permission: string; on: boolean; locked?: boolean }) {
  const [v, setV] = useState(on);
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <input type="checkbox" checked={v} disabled={pending || locked} aria-label={`${permission} for ${role}`} className="size-4 accent-[#784900] cursor-pointer disabled:cursor-not-allowed"
      onChange={() => start(async () => { const r = await togglePermission({ role, permission }); if (r.ok) { setV(!v); toast("success", r.message ?? "Saved"); } else toast("error", r.error); })} />
  );
}
