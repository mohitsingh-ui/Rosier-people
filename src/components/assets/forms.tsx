"use client";
import { ActionForm, Input, Select, Textarea, Submit, FormActions, Grid } from "@/components/ui/form";
import { saveAsset, assignAsset, returnAsset, reportDamage } from "@/server/assets";

type Opt = { value: string; label: string };
const COND: Opt[] = ["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"].map((c) => ({ value: c, label: c[0] + c.slice(1).toLowerCase() }));

export function AssetForm({ categories, a }: { categories: Opt[]; a?: { id: string; categoryId: string; brand: string; model: string; serialNumber: string | null; purchaseDate: string | null; purchasePrice: number | null; warrantyUntil: string | null; condition: string; notes: string | null } }) {
  return (
    <ActionForm action={saveAsset} success="Asset saved">
      {a && <input type="hidden" name="id" value={a.id} />}
      <Grid>
        <Select label="Type" name="categoryId" options={categories} defaultValue={a?.categoryId} required />
        <Select label="Condition" name="condition" options={COND} defaultValue={a?.condition ?? "NEW"} />
        <Input label="Brand" name="brand" defaultValue={a?.brand} required />
        <Input label="Model" name="model" defaultValue={a?.model} required />
        <Input label="Serial number" name="serialNumber" defaultValue={a?.serialNumber ?? ""} />
        <Input label="Purchase price (₹)" name="purchasePrice" type="number" min={0} defaultValue={a?.purchasePrice ?? ""} />
        <Input label="Purchase date" name="purchaseDate" type="date" defaultValue={a?.purchaseDate ?? ""} />
        <Input label="Warranty until" name="warrantyUntil" type="date" defaultValue={a?.warrantyUntil ?? ""} />
      </Grid>
      <Textarea label="Notes" name="notes" defaultValue={a?.notes ?? ""} />
      <FormActions><Submit>{a ? "Save" : "Add asset"}</Submit></FormActions>
    </ActionForm>
  );
}

export function AssignForm({ assetId, people, defaultEmployee, transfer }: { assetId: string; people: Opt[]; defaultEmployee?: string; transfer?: boolean }) {
  return (
    <ActionForm action={assignAsset} success={transfer ? "Transferred" : "Assigned"}>
      <input type="hidden" name="assetId" value={assetId} />
      <Select label={transfer ? "Transfer to" : "Assign to"} name="employeeId" options={people} defaultValue={defaultEmployee} placeholder="Choose someone" required />
      <Select label="Condition when handed over" name="condition" options={COND} defaultValue="GOOD" />
      <Textarea label="Note" name="note" placeholder="Charger, bag, accessories included…" />
      <FormActions><Submit>{transfer ? "Transfer" : "Assign"}</Submit></FormActions>
    </ActionForm>
  );
}

export function ReturnForm({ assetId }: { assetId: string }) {
  return (
    <ActionForm action={returnAsset} success="Return recorded">
      <input type="hidden" name="assetId" value={assetId} />
      <Select label="Condition on return" name="condition" options={COND} defaultValue="GOOD" />
      <Textarea label="Note" name="note" />
      <FormActions><Submit>Record return</Submit></FormActions>
    </ActionForm>
  );
}

export function DamageForm({ assetId }: { assetId: string }) {
  return (
    <ActionForm action={reportDamage} success="Damage reported">
      <input type="hidden" name="assetId" value={assetId} />
      <Textarea label="What happened?" name="note" required placeholder="e.g. Screen cracked after a fall; still turns on" />
      <FormActions><Submit variant="dangerSolid">Report damage</Submit></FormActions>
    </ActionForm>
  );
}
