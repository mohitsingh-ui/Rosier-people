"use client";
import { ActionForm, Input, Select, Textarea, Submit, FormActions, Grid, Checkbox } from "@/components/ui/form";
import { updateJob, updatePersonal, updateIdentity, saveFamilyMember, saveEmergencyContact, setRole, deleteEmployee, assignTask, deactivateEmployee } from "@/server/people";

type Opt = { value: string; label: string };
const EMP_TYPES: Opt[] = [{ value: "FULL_TIME", label: "Full-time" }, { value: "PART_TIME", label: "Part-time" }, { value: "CONTRACT", label: "Contract" }, { value: "INTERN", label: "Intern" }, { value: "CONSULTANT", label: "Consultant" }];
const STATUSES: Opt[] = ["PREBOARDING", "PROBATION", "ACTIVE", "NOTICE_PERIOD", "INACTIVE", "EXITED"].map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase().replace("_", " ") }));

export function JobForm({ e, options, canManageOrg, today }: {
  e: { id: string; departmentId: string | null; designationId: string | null; locationId: string | null; managerId: string | null; employmentType: string; status: string; shiftId: string | null; confirmationDate: string | null; workPhone: string | null };
  options: { departments: Opt[]; designations: Opt[]; locations: Opt[]; managers: Opt[]; shifts: Opt[] }; canManageOrg: boolean; today: string;
}) {
  return (
    <ActionForm action={updateJob} success="Job details updated">
      <input type="hidden" name="employeeId" value={e.id} />
      {!canManageOrg && <input type="hidden" name="managerId" value={e.managerId ?? ""} />}
      <Grid>
        <Select label="Designation" name="designationId" options={options.designations} defaultValue={e.designationId ?? ""} required />
        <Select label="Department" name="departmentId" options={options.departments} defaultValue={e.departmentId ?? ""} required />
        <Select label="Work location" name="locationId" options={options.locations} defaultValue={e.locationId ?? ""} required />
        {canManageOrg && <Select label="Reporting manager" name="managerId" options={options.managers.filter((m) => m.value !== e.id)} defaultValue={e.managerId ?? ""} placeholder="No manager" />}
        <Select label="Employment type" name="employmentType" options={EMP_TYPES} defaultValue={e.employmentType} />
        <Select label="Status" name="status" options={STATUSES} defaultValue={e.status} />
        <Select label="Shift" name="shiftId" options={options.shifts} defaultValue={e.shiftId ?? ""} placeholder="Default shift" />
        <Input label="Work phone" name="workPhone" defaultValue={e.workPhone ?? ""} />
        <Input label="Confirmation date" name="confirmationDate" type="date" defaultValue={e.confirmationDate ?? ""} />
        <Input label="Effective from" name="effectiveDate" type="date" defaultValue={today} required />
      </Grid>
      <Select label="Record this as" name="changeType" options={[{ value: "AUTO", label: "Detect automatically" }, { value: "PROMOTION", label: "Promotion" }, { value: "TRANSFER", label: "Transfer" }]} />
      <Textarea label="Note for the record" name="note" placeholder="e.g. Promoted after H1 review" />
      <p className="text-[12px] text-muted">Changes show up in the org chart, team views, approvals and the employee&apos;s timeline straight away.</p>
      <FormActions><Submit>Save job details</Submit></FormActions>
    </ActionForm>
  );
}

type Personal = { personalEmail: string | null; personalPhone: string | null; addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null; pin: string | null; maritalStatus: string | null; bloodGroup: string | null };
export function PersonalForm({ employeeId, p, bio, skills, editable, hr, core }: { employeeId: string; p: Personal | null; bio: string | null; skills: string[]; editable: string[]; hr: boolean; core: { firstName: string; lastName: string; dateOfBirth: string | null; gender: string } }) {
  const can = (k: string) => hr || editable.includes(k);
  return (
    <ActionForm action={updatePersonal} success="Personal details saved" reset={false}>
      <input type="hidden" name="employeeId" value={employeeId} />
      {hr && (
        <Grid>
          <Input label="First name" name="firstName" defaultValue={core.firstName} />
          <Input label="Last name" name="lastName" defaultValue={core.lastName} />
          <Input label="Date of birth" name="dateOfBirth" type="date" defaultValue={core.dateOfBirth ?? ""} />
          <Select label="Gender" name="gender" defaultValue={core.gender} options={[{ value: "UNDISCLOSED", label: "Prefer not to say" }, { value: "FEMALE", label: "Female" }, { value: "MALE", label: "Male" }, { value: "NON_BINARY", label: "Non-binary" }]} />
        </Grid>
      )}
      <Grid>
        <Input label="Personal email" name="personalEmail" type="email" defaultValue={p?.personalEmail ?? ""} disabled={!can("personalEmail")} />
        <Input label="Personal phone" name="personalPhone" defaultValue={p?.personalPhone ?? ""} disabled={!can("personalPhone")} />
      </Grid>
      <Input label="Address line 1" name="addressLine1" defaultValue={p?.addressLine1 ?? ""} disabled={!can("addressLine1")} />
      <Input label="Address line 2" name="addressLine2" defaultValue={p?.addressLine2 ?? ""} disabled={!can("addressLine2")} />
      <Grid cols={3}>
        <Input label="City" name="city" defaultValue={p?.city ?? ""} disabled={!can("city")} />
        <Input label="State" name="state" defaultValue={p?.state ?? ""} disabled={!can("state")} />
        <Input label="PIN" name="pin" inputMode="numeric" maxLength={6} defaultValue={p?.pin ?? ""} disabled={!can("pin")} />
      </Grid>
      <Grid>
        <Select label="Marital status" name="maritalStatus" defaultValue={p?.maritalStatus ?? ""} placeholder="—" options={["Single", "Married", "Divorced", "Widowed"].map((x) => ({ value: x, label: x }))} disabled={!can("maritalStatus")} />
        <Select label="Blood group" name="bloodGroup" defaultValue={p?.bloodGroup ?? ""} placeholder="—" options={["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((x) => ({ value: x, label: x }))} disabled={!can("bloodGroup")} />
      </Grid>
      <Textarea label="About" name="bio" defaultValue={bio ?? ""} disabled={!can("bio")} />
      <Input label="Skills" name="skills" defaultValue={skills.join(", ")} hint="Comma separated — helps people find you in search" disabled={!can("skills")} />
      {!hr && <p className="text-[12px] text-muted">Greyed-out fields can only be changed by HR. Raise a helpdesk request if something&apos;s wrong.</p>}
      <FormActions><Submit>Save</Submit></FormActions>
    </ActionForm>
  );
}

export function IdentityForm({ employeeId }: { employeeId: string }) {
  return (
    <ActionForm action={updateIdentity} success="Identity details saved">
      <input type="hidden" name="employeeId" value={employeeId} />
      <p className="text-[12.5px] text-muted">Leave a field blank to keep what&apos;s stored. Values are encrypted at rest and only the last four digits are shown by default.</p>
      <Grid>
        <Input label="PAN" name="pan" placeholder="ABCDE1234F" autoComplete="off" />
        <Input label="Aadhaar" name="aadhaar" placeholder="12 digits" autoComplete="off" inputMode="numeric" />
        <Input label="Passport number" name="passport" placeholder="Z1234567" autoComplete="off" />
        <Input label="Passport expiry" name="passportExpiry" type="date" />
      </Grid>
      <FormActions><Submit>Save identity details</Submit></FormActions>
    </ActionForm>
  );
}

export function FamilyForm({ employeeId, m }: { employeeId: string; m?: { id: string; relation: string; name: string; dateOfBirth: string | null; phone: string | null; isDependent: boolean } }) {
  return (
    <ActionForm action={saveFamilyMember} success="Family details saved">
      <input type="hidden" name="employeeId" value={employeeId} />
      {m && <input type="hidden" name="id" value={m.id} />}
      <Grid>
        <Select label="Relation" name="relation" defaultValue={m?.relation ?? "SPOUSE"} options={["FATHER", "MOTHER", "SPOUSE", "CHILD", "SIBLING", "OTHER"].map((r) => ({ value: r, label: r[0] + r.slice(1).toLowerCase() }))} />
        <Input label="Full name" name="name" defaultValue={m?.name} required />
        <Input label="Date of birth" name="dateOfBirth" type="date" defaultValue={m?.dateOfBirth ?? ""} />
        <Input label="Phone" name="phone" defaultValue={m?.phone ?? ""} />
      </Grid>
      <Checkbox label="Dependent" name="isDependent" defaultChecked={m?.isDependent} hint="Used for insurance and benefits" />
      <FormActions><Submit>Save</Submit></FormActions>
    </ActionForm>
  );
}

export function EmergencyForm({ employeeId, c }: { employeeId: string; c?: { id: string; name: string; relation: string; phone: string; isPrimary: boolean } }) {
  return (
    <ActionForm action={saveEmergencyContact} success="Emergency contact saved">
      <input type="hidden" name="employeeId" value={employeeId} />
      {c && <input type="hidden" name="id" value={c.id} />}
      <Grid>
        <Input label="Name" name="name" defaultValue={c?.name} required />
        <Input label="Relation" name="relation" defaultValue={c?.relation} required />
        <Input label="Phone" name="phone" defaultValue={c?.phone} required />
      </Grid>
      <Checkbox label="Primary contact" name="isPrimary" defaultChecked={c?.isPrimary ?? true} />
      <FormActions><Submit>Save</Submit></FormActions>
    </ActionForm>
  );
}

export function RoleForm({ employeeId, current, roles }: { employeeId: string; current: string; roles: Opt[] }) {
  return (
    <ActionForm action={setRole} success="Role updated">
      <input type="hidden" name="employeeId" value={employeeId} />
      <Select label="Access role" name="role" defaultValue={current} options={roles} />
      <p className="text-[12.5px] text-muted">Roles decide which modules and data someone can see. Managers automatically see only their reporting line.</p>
      <FormActions><Submit>Update role</Submit></FormActions>
    </ActionForm>
  );
}

export function DeleteForm({ employeeId, code }: { employeeId: string; code: string }) {
  return (
    <ActionForm action={deleteEmployee} success="Employee deleted" redirectTo="/people">
      <input type="hidden" name="employeeId" value={employeeId} />
      <p className="text-[13.5px]">This permanently removes the employee, their login, documents, attendance, leave and payroll history. <strong>It can&apos;t be undone.</strong> For people who have left, use the exit process or deactivate instead.</p>
      <Input label={`Type ${code} to confirm`} name="confirm" required autoComplete="off" />
      <FormActions><Submit variant="dangerSolid">Delete permanently</Submit></FormActions>
    </ActionForm>
  );
}

export function DeactivateForm({ employeeId, active }: { employeeId: string; active: boolean }) {
  return (
    <ActionForm action={deactivateEmployee} success={active ? "Deactivated" : "Reactivated"}>
      <input type="hidden" name="employeeId" value={employeeId} />
      <p className="text-[13.5px]">{active ? "They'll be signed out and won't be able to log in. Their records stay intact." : "They'll be able to sign in again."}</p>
      <Textarea label="Reason" name="note" />
      <FormActions><Submit variant={active ? "dangerSolid" : "primary"}>{active ? "Deactivate" : "Reactivate"}</Submit></FormActions>
    </ActionForm>
  );
}

export function TaskForm({ people, assigneeId }: { people: Opt[]; assigneeId?: string }) {
  return (
    <ActionForm action={assignTask} success="Task assigned">
      {assigneeId ? <input type="hidden" name="assigneeId" value={assigneeId} /> : <Select label="Assign to" name="assigneeId" options={people} required placeholder="Choose someone" />}
      <Input label="Task" name="title" required placeholder="e.g. Share the Q3 plan by Friday" />
      <Textarea label="Details" name="description" />
      <Input label="Due date" name="dueDate" type="date" />
      <FormActions><Submit>Assign task</Submit></FormActions>
    </ActionForm>
  );
}
