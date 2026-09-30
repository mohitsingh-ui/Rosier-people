"use client";
import { ActionForm, Input, Select, Textarea, Submit, FormActions, Grid, DateRangePicker } from "@/components/ui/form";
import { FileUploader } from "@/components/ui/file-uploader";
import { requestCorrection, requestWfh, hrSetAttendance } from "@/server/attendance";

export function CorrectionForm({ today }: { today: string }) {
  return (
    <ActionForm action={requestCorrection} success="Correction requested">
      <Input label="Date" name="date" type="date" max={today} required />
      <Grid><Input label="Actual check-in" name="checkIn" type="time" /><Input label="Actual check-out" name="checkOut" type="time" /></Grid>
      <Textarea label="What happened?" name="reason" required placeholder="e.g. Forgot to check out after the farm shoot" />
      <FormActions><Submit>Send to manager</Submit></FormActions>
    </ActionForm>
  );
}

const REASONS = ["Personal work at home", "Unwell but able to work", "Travel / commute issue", "Focus work", "Family reason", "Other"];
export function WfhForm({ today }: { today: string }) {
  return (
    <ActionForm action={requestWfh} success="WFH requested">
      <DateRangePicker required defaultStart={today} />
      <Select label="Reason" name="reason" options={REASONS.map((r) => ({ value: r, label: r }))} />
      <Textarea label="Comment" name="comment" placeholder="Anything your manager should know" />
      <FileUploader name="attachment" label="Attachment (optional)" />
      <FormActions><Submit>Request WFH</Submit></FormActions>
    </ActionForm>
  );
}

export function OverrideForm({ employeeId, date, status }: { employeeId: string; date: string; status: string }) {
  return (
    <ActionForm action={hrSetAttendance} success="Attendance updated">
      <input type="hidden" name="employeeId" value={employeeId} /><input type="hidden" name="date" value={date} />
      <Select label="Status" name="status" defaultValue={status === "PENDING_CORRECTION" ? "PRESENT" : status} options={["PRESENT", "LATE", "HALF_DAY", "WFH", "ABSENT", "LEAVE", "HOLIDAY", "WEEKEND"].map((s) => ({ value: s, label: s[0] + s.slice(1).toLowerCase().replace("_", " ") }))} />
      <Grid><Input label="Check-in" name="checkIn" type="time" /><Input label="Check-out" name="checkOut" type="time" /></Grid>
      <Textarea label="Note" name="note" hint="Recorded in the audit log" />
      <FormActions><Submit>Save</Submit></FormActions>
    </ActionForm>
  );
}
