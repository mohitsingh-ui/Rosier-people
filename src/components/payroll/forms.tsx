"use client";
import { useState } from "react";
import { ActionForm, Input, Select, Submit, FormActions, Grid, Checkbox } from "@/components/ui/form";
import { FileUploader } from "@/components/ui/file-uploader";
import { saveSalary, createRun, submitTaxDocument } from "@/server/payroll";

export function SalaryForm({ employeeId, p, today }: { employeeId: string; today: string; p?: { annualCtc: number; monthlyBasic: number; monthlyHra: number; monthlySpecial: number; monthlyOther: number; bankName: string | null; ifsc: string | null; uan: string | null; esicNumber: string | null; pfEnabled: boolean; esiEnabled: boolean; taxRegime: string; accountLast4: string | null } }) {
  const [auto, setAuto] = useState(!p);
  return (
    <ActionForm action={saveSalary} success="Salary saved">
      <input type="hidden" name="employeeId" value={employeeId} />
      <Grid><Input label="Annual CTC (₹)" name="annualCtc" type="number" min={0} step="1000" defaultValue={p?.annualCtc} required /><Input label="Effective from" name="effectiveFrom" type="date" defaultValue={today} required /></Grid>
      <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="autoStructure" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-[#784900]" />Split automatically (Basic 50%, HRA 40% of basic, rest special)</label>
      {!auto && <Grid><Input label="Basic / month" name="monthlyBasic" type="number" defaultValue={p?.monthlyBasic} /><Input label="HRA / month" name="monthlyHra" type="number" defaultValue={p?.monthlyHra} /><Input label="Special / month" name="monthlySpecial" type="number" defaultValue={p?.monthlySpecial} /><Input label="Other / month" name="monthlyOther" type="number" defaultValue={p?.monthlyOther ?? 0} /></Grid>}
      <div className="border-t border-line pt-4"><h3 className="text-[13.5px] font-semibold mb-3">Bank & statutory</h3>
        <Grid>
          <Input label="Bank" name="bankName" defaultValue={p?.bankName ?? ""} />
          <Input label="Account number" name="accountNumber" autoComplete="off" inputMode="numeric" placeholder={p?.accountLast4 ? `Ends ${p.accountLast4} — leave blank to keep` : ""} />
          <Input label="IFSC" name="ifsc" defaultValue={p?.ifsc ?? ""} />
          <Input label="UAN" name="uan" defaultValue={p?.uan ?? ""} />
          <Input label="ESIC number" name="esicNumber" defaultValue={p?.esicNumber ?? ""} />
          <Select label="Tax regime" name="taxRegime" defaultValue={p?.taxRegime ?? "NEW"} options={[{ value: "NEW", label: "New regime" }, { value: "OLD", label: "Old regime" }]} />
        </Grid>
        <div className="flex gap-6 mt-4"><Checkbox label="PF applies" name="pfEnabled" defaultChecked={p?.pfEnabled ?? true} /><Checkbox label="ESI applies" name="esiEnabled" defaultChecked={p?.esiEnabled ?? false} /></div>
      </div>
      <FormActions><Submit>Save salary</Submit></FormActions>
    </ActionForm>
  );
}

export function NewRunForm({ month }: { month: string }) {
  return (
    <ActionForm action={createRun} success="Payroll month opened">
      <Input label="Month" name="month" type="month" defaultValue={month} required />
      <p className="text-[12.5px] text-muted">Working days are calculated from the holiday calendar. You can process and re-process until you mark it paid.</p>
      <FormActions><Submit>Open payroll</Submit></FormActions>
    </ActionForm>
  );
}

export function TaxForm({ fy, employees }: { fy: string; employees?: { value: string; label: string }[] }) {
  const [kind, setKind] = useState(employees ? "FORM_16" : "DECLARATION");
  return (
    <ActionForm action={submitTaxDocument} success="Submitted">
      {employees ? <><Select label="Employee" name="employeeId" options={employees} required /><input type="hidden" name="kind" value="FORM_16" /></> : (
        <Select label="What are you submitting?" name="kind" value={kind} onChange={(e) => setKind(e.target.value)} options={[{ value: "DECLARATION", label: "Investment declaration" }, { value: "INVESTMENT_PROOF", label: "Investment proof" }]} />
      )}
      <Grid>
        <Input label="Financial year" name="financialYear" defaultValue={fy} required pattern="\d{4}-\d{2}" />
        {!employees && <Select label="Section" name="section" options={["80C", "80D", "80CCD(1B)", "80E", "80G", "HRA", "24(b)"].map((x) => ({ value: x, label: x }))} />}
      </Grid>
      <Input label={employees ? "Title" : "Description"} name="title" required defaultValue={employees ? `Form 16 FY ${fy}` : ""} placeholder="e.g. PPF + ELSS" />
      {!employees && <Input label="Amount (₹)" name="amount" type="number" min={0} />}
      <FileUploader name="file" label={kind === "DECLARATION" && !employees ? "Attachment (optional)" : "File"} required={kind !== "DECLARATION" || !!employees} />
      <FormActions><Submit>Submit</Submit></FormActions>
    </ActionForm>
  );
}
