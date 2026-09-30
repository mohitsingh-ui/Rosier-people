"use client";
import { useEffect } from "react";
import { ActionForm, Input, Select, Textarea, Submit, FormActions, Grid } from "@/components/ui/form";
import { saveHoliday, adjustBalance, respondClarification } from "@/server/leave";

/** Opens the first [data-autoopen] trigger on the page (used by ?apply=1, ?new=1 deep links). */
export function AutoOpen() {
  useEffect(() => { const t = setTimeout(() => (document.querySelector("[data-autoopen]") as HTMLButtonElement | null)?.click(), 50); return () => clearTimeout(t); }, []);
  return null;
}

export function HolidayForm({ locations, h }: { locations: { value: string; label: string }[]; h?: { id: string; name: string; date: string; type: string; locationId: string | null; note: string | null } }) {
  return (
    <ActionForm action={saveHoliday} success="Holiday saved">
      {h && <input type="hidden" name="id" value={h.id} />}
      <Input label="Name" name="name" defaultValue={h?.name} required placeholder="e.g. Diwali" />
      <Grid>
        <Input label="Date" name="date" type="date" defaultValue={h?.date} required />
        <Select label="Type" name="type" defaultValue={h?.type ?? "PUBLIC"} options={[{ value: "PUBLIC", label: "Public holiday" }, { value: "COMPANY", label: "Company holiday" }, { value: "OPTIONAL", label: "Optional holiday" }]} />
      </Grid>
      <Select label="Applies to" name="locationId" defaultValue={h?.locationId ?? ""} options={locations} placeholder="All locations" />
      <Input label="Note" name="note" defaultValue={h?.note ?? ""} />
      <FormActions><Submit>Save holiday</Submit></FormActions>
    </ActionForm>
  );
}

export function BalanceForm({ employeeId, leaveTypeId, year, allocated, carried }: { employeeId: string; leaveTypeId: string; year: number; allocated: number; carried: number }) {
  return (
    <ActionForm action={adjustBalance} success="Balance updated">
      <input type="hidden" name="employeeId" value={employeeId} /><input type="hidden" name="leaveTypeId" value={leaveTypeId} /><input type="hidden" name="year" value={year} />
      <Grid><Input label="Allocated" name="allocated" type="number" step="0.5" min={0} defaultValue={allocated} /><Input label="Carried forward" name="carriedForward" type="number" step="0.5" min={0} defaultValue={carried} /></Grid>
      <Textarea label="Reason for the change" name="note" required hint="Saved in the audit log" />
      <FormActions><Submit>Save</Submit></FormActions>
    </ActionForm>
  );
}

export function ClarifyForm({ id }: { id: string }) {
  return (
    <ActionForm action={respondClarification} success="Reply sent">
      <input type="hidden" name="id" value={id} />
      <Textarea label="Your reply" name="reason" required />
      <FormActions><Submit>Send reply</Submit></FormActions>
    </ActionForm>
  );
}
