"use client";
import { ActionForm, Input, Select, Textarea, Submit, FormActions, Grid } from "@/components/ui/form";
import { saveDepartment, saveDesignation, saveLocation, saveOpening } from "@/server/org";
type Opt = { value: string; label: string };

export function DepartmentForm({ d, people }: { d?: { id: string; name: string; code: string; description: string | null; headId: string | null }; people: Opt[] }) {
  return (
    <ActionForm action={saveDepartment} success="Department saved">
      {d && <input type="hidden" name="id" value={d.id} />}
      <Grid><Input label="Name" name="name" defaultValue={d?.name} required /><Input label="Code" name="code" defaultValue={d?.code} required maxLength={6} hint="2–6 letters, e.g. MKT" /></Grid>
      <Select label="Department head" name="headId" defaultValue={d?.headId ?? ""} options={people} placeholder="None" />
      <Textarea label="What this team does" name="description" defaultValue={d?.description ?? ""} />
      <FormActions><Submit>Save department</Submit></FormActions>
    </ActionForm>
  );
}

export function DesignationForm({ d, departments }: { d?: { id: string; name: string; level: number; departmentId: string | null }; departments: Opt[] }) {
  return (
    <ActionForm action={saveDesignation} success="Designation saved">
      {d && <input type="hidden" name="id" value={d.id} />}
      <Input label="Title" name="name" defaultValue={d?.name} required />
      <Grid>
        <Input label="Level" name="level" type="number" min={1} max={12} defaultValue={d?.level ?? 3} hint="Higher = more senior. Used to detect promotions." />
        <Select label="Department" name="departmentId" defaultValue={d?.departmentId ?? ""} options={departments} placeholder="Any department" />
      </Grid>
      <FormActions><Submit>Save</Submit></FormActions>
    </ActionForm>
  );
}

export function LocationForm({ l }: { l?: { id: string; name: string; city: string; state: string; address: string | null } }) {
  return (
    <ActionForm action={saveLocation} success="Location saved">
      {l && <input type="hidden" name="id" value={l.id} />}
      <Input label="Name" name="name" defaultValue={l?.name} required placeholder="e.g. Ghaziabad HQ" />
      <Grid><Input label="City" name="city" defaultValue={l?.city} required /><Input label="State" name="state" defaultValue={l?.state} required /></Grid>
      <Input label="Address" name="address" defaultValue={l?.address ?? ""} />
      <FormActions><Submit>Save</Submit></FormActions>
    </ActionForm>
  );
}

export function OpeningForm({ departmentId, o }: { departmentId: string; o?: { id: string; title: string; positions: number; status: string } }) {
  return (
    <ActionForm action={saveOpening} success="Opening saved">
      <input type="hidden" name="departmentId" value={departmentId} />
      {o && <input type="hidden" name="id" value={o.id} />}
      <Input label="Role" name="title" defaultValue={o?.title} required />
      <Grid><Input label="Positions" name="positions" type="number" min={1} defaultValue={o?.positions ?? 1} /><Select label="Status" name="status" defaultValue={o?.status ?? "OPEN"} options={[{ value: "OPEN", label: "Open" }, { value: "ON_HOLD", label: "On hold" }, { value: "CLOSED", label: "Closed" }]} /></Grid>
      <FormActions><Submit>Save</Submit></FormActions>
    </ActionForm>
  );
}
