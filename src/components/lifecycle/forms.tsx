"use client";
import { ActionForm, Input, Select, Textarea, Submit, FormActions, Grid, Checkbox } from "@/components/ui/form";
import { FileUploader } from "@/components/ui/file-uploader";
import { updateOnboardingTask, addOnboardingTask, reassignOnboardingTask, submitResignation, reviewExit, initiateExit, updateOffboardingTask, advanceExit, saveExitInterview } from "@/server/lifecycle";

type Opt = { value: string; label: string };
const ST: Opt[] = [{ value: "PENDING", label: "To do" }, { value: "IN_PROGRESS", label: "In progress" }, { value: "DONE", label: "Done" }, { value: "BLOCKED", label: "Blocked" }];

export function TaskUpdateForm({ id, status, comments, hr }: { id: string; status: string; comments: string | null; hr: boolean }) {
  return (
    <ActionForm action={updateOnboardingTask} success="Task updated">
      <input type="hidden" name="id" value={id} />
      <Select label="Status" name="status" defaultValue={status} options={hr ? [...ST, { value: "SKIPPED", label: "Skip (not needed)" }] : ST} />
      <Textarea label="Comments" name="comments" defaultValue={comments ?? ""} />
      <FileUploader name="attachment" label="Attachment (optional)" />
      <FormActions><Submit>Update</Submit></FormActions>
    </ActionForm>
  );
}

export function AddTaskForm({ onboardingId, people }: { onboardingId: string; people: Opt[] }) {
  return (
    <ActionForm action={addOnboardingTask} success="Task added">
      <input type="hidden" name="onboardingId" value={onboardingId} />
      <Input label="Task" name="title" required />
      <Grid>
        <Select label="Owner team" name="category" options={["HR", "IT", "MANAGER", "EMPLOYEE", "ADMIN"].map((c) => ({ value: c, label: c === "IT" || c === "HR" ? c : c[0] + c.slice(1).toLowerCase() }))} />
        <Select label="Assign to" name="assigneeId" options={people} placeholder="Unassigned" />
        <Input label="Due" name="dueDate" type="date" />
      </Grid>
      <Checkbox label="HR must validate" name="requiresValidation" />
      <FormActions><Submit>Add task</Submit></FormActions>
    </ActionForm>
  );
}

export function ReassignForm({ id, people, current }: { id: string; people: Opt[]; current: string | null }) {
  return (
    <ActionForm action={reassignOnboardingTask} success="Reassigned">
      <input type="hidden" name="id" value={id} />
      <Select label="Assign to" name="assigneeId" options={people} defaultValue={current ?? ""} required />
      <Input label="New due date" name="dueDate" type="date" />
      <FormActions><Submit>Save</Submit></FormActions>
    </ActionForm>
  );
}

export function ResignForm({ minDate }: { minDate: string }) {
  return (
    <ActionForm action={submitResignation} success="Resignation submitted">
      <p className="text-[13.5px] text-muted">We&apos;re sorry to see you go. Your manager reviews this first, then HR confirms your last working day. You can withdraw it until clearance starts.</p>
      <Input label="Requested last working day" name="requestedLastDay" type="date" min={minDate} required hint="Your notice period is usually 30 days (15 on probation)." />
      <Textarea label="Reason" name="reason" required rows={4} />
      <FormActions><Submit variant="dangerSolid">Submit resignation</Submit></FormActions>
    </ActionForm>
  );
}

export function ExitReviewForm({ id, hr, suggested }: { id: string; hr: boolean; suggested: string }) {
  return (
    <ActionForm action={reviewExit} success="Saved">
      <input type="hidden" name="id" value={id} />
      <Select label="Decision" name="decision" options={[{ value: "ACCEPT", label: hr ? "Accept and start notice period" : "Accept (send to HR)" }, { value: "REJECT", label: "Don't accept — discuss first" }]} />
      <Input label="Last working day" name="lastWorkingDay" type="date" defaultValue={suggested} />
      <Textarea label="Note" name="note" placeholder="Handover plan, retention conversation, etc." />
      <FormActions><Submit>Submit review</Submit></FormActions>
    </ActionForm>
  );
}

export function InitiateExitForm({ people }: { people: Opt[] }) {
  return (
    <ActionForm action={initiateExit} success="Exit started">
      <Select label="Employee" name="employeeId" options={people} required placeholder="Choose" />
      <Grid>
        <Select label="Exit type" name="exitType" options={[{ value: "RESIGNATION", label: "Resignation (on behalf)" }, { value: "TERMINATION", label: "Termination" }, { value: "CONTRACT_END", label: "Contract end" }, { value: "RETIREMENT", label: "Retirement" }]} />
        <Input label="Last working day" name="lastWorkingDay" type="date" required />
      </Grid>
      <Textarea label="Reason" name="reason" required />
      <FormActions><Submit>Start exit</Submit></FormActions>
    </ActionForm>
  );
}

export function ExitTaskForm({ id, status, note }: { id: string; status: string; note: string | null }) {
  return (
    <ActionForm action={updateOffboardingTask} success="Updated">
      <input type="hidden" name="id" value={id} />
      <Select label="Status" name="status" defaultValue={status} options={[...ST, { value: "SKIPPED", label: "Not needed" }]} />
      <Textarea label="Note" name="note" defaultValue={note ?? ""} />
      <FormActions><Submit>Save</Submit></FormActions>
    </ActionForm>
  );
}

export function SettlementForm({ id }: { id: string }) {
  return (
    <ActionForm action={advanceExit} success="Settlement recorded">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="stage" value="FINAL_SETTLEMENT" />
      <Input label="Full & final amount (₹)" name="settlementAmount" type="number" min={0} step="0.01" required hint="Pending salary + leave encashment − recoveries" />
      <FormActions><Submit>Record settlement</Submit></FormActions>
    </ActionForm>
  );
}

export function InterviewForm({ id, existing }: { id: string; existing: string | null }) {
  return (
    <ActionForm action={saveExitInterview} success="Saved" reset={false}>
      <input type="hidden" name="id" value={id} />
      <Textarea label="What went well, what could be better, would you come back?" name="exitInterview" defaultValue={existing ?? ""} rows={6} required />
      <FormActions><Submit>Save</Submit></FormActions>
    </ActionForm>
  );
}
