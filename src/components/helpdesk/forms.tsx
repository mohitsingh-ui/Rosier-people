"use client";
import { ActionForm, Input, Select, Textarea, Submit, FormActions, Grid, Checkbox } from "@/components/ui/form";
import { FileUploader } from "@/components/ui/file-uploader";
import { createTicket, commentTicket } from "@/server/helpdesk";
import { saveAnnouncement } from "@/server/announcements";

const CATS = [["PAYROLL", "Payroll & salary"], ["LEAVE", "Leave"], ["ATTENDANCE", "Attendance"], ["DOCUMENTS", "Documents & letters"], ["IT", "IT & equipment"], ["BENEFITS", "Benefits & insurance"], ["POLICY", "Policy question"], ["WORKPLACE", "Workplace & facilities"], ["OTHER", "Something else"]];

export function TicketForm() {
  return (
    <ActionForm action={createTicket} success="Ticket raised" redirectTo="/helpdesk">
      <Grid>
        <Select label="Topic" name="category" options={CATS.map(([value, label]) => ({ value, label }))} />
        <Select label="Priority" name="priority" defaultValue="MEDIUM" options={[{ value: "LOW", label: "Low" }, { value: "MEDIUM", label: "Normal" }, { value: "HIGH", label: "High" }, { value: "URGENT", label: "Urgent" }]} />
      </Grid>
      <Input label="Subject" name="subject" required placeholder="e.g. HRA not reflecting in my payslip" />
      <Textarea label="Describe the issue" name="description" required rows={5} />
      <FileUploader name="attachment" label="Attachment (optional)" />
      <FormActions><Submit>Raise ticket</Submit></FormActions>
    </ActionForm>
  );
}

export function ReplyForm({ ticketId, agent }: { ticketId: string; agent: boolean }) {
  return (
    <ActionForm action={commentTicket} success="Sent">
      <input type="hidden" name="ticketId" value={ticketId} />
      <Textarea label="Reply" name="body" required rows={3} />
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-52"><input type="file" name="attachment" className="block w-full text-[13px] file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-brand file:font-medium" /></div>
        {agent && <Checkbox label="Internal note (HR only)" name="isInternal" />}
        <Submit>Send</Submit>
      </div>
    </ActionForm>
  );
}

export function AnnouncementForm({ departments, a }: { departments: { value: string; label: string }[]; a?: { id: string; title: string; body: string; category: string; audience: string; departmentId: string | null; pinned: boolean; publishAt: string; expiresAt: string | null } }) {
  return (
    <ActionForm action={saveAnnouncement} success={a ? "Updated" : "Published"}>
      {a && <input type="hidden" name="id" value={a.id} />}
      <Input label="Title" name="title" defaultValue={a?.title} required />
      <Textarea label="Message" name="body" defaultValue={a?.body} required rows={6} />
      <Grid>
        <Select label="Type" name="category" defaultValue={a?.category ?? "NEWS"} options={[["NEWS", "Company news"], ["POLICY", "Policy update"], ["EVENT", "Event"], ["HOLIDAY", "Holiday"], ["NOTICE", "Important notice"], ["CELEBRATION", "Celebration / birthdays"], ["ACHIEVEMENT", "Team achievement"]].map(([value, label]) => ({ value, label }))} />
        <Select label="Audience" name="audience" defaultValue={a?.audience ?? "ALL"} options={[{ value: "ALL", label: "Everyone" }, { value: "DEPARTMENT", label: "One department" }]} />
        <Select label="Department" name="departmentId" defaultValue={a?.departmentId ?? ""} options={departments} placeholder="—" hint="Only for department announcements" />
        <div />
        <Input label="Publish on" name="publishAt" type="date" defaultValue={a?.publishAt} hint="Leave blank to publish now" />
        <Input label="Expires on" name="expiresAt" type="date" defaultValue={a?.expiresAt ?? ""} />
      </Grid>
      <Grid>
        <FileUploader name="image" label="Cover image (optional)" accept=".png,.jpg,.jpeg,.webp" hint="PNG, JPG or WebP" />
        <FileUploader name="attachment" label="Attachment (optional)" />
      </Grid>
      <Checkbox label="Pin to the top" name="pinned" defaultChecked={a?.pinned} />
      <FormActions><Submit>{a ? "Save" : "Publish"}</Submit></FormActions>
    </ActionForm>
  );
}
