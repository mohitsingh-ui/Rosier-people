"use client";
import { Send } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ActionForm, Select, Input, Submit, FormActions } from "@/components/ui/form";
import { requestDocuments } from "@/server/documents";

export function RequestDocsForm({ employees, types }: { employees: { value: string; label: string }[]; types: { value: string; label: string }[] }) {
  return (
    <Modal title="Request documents" description="Employees get an in-app notification and an email with an upload link." trigger={<Button variant="secondary" size="sm"><Send className="size-3.5" />Request</Button>}>
      <ActionForm action={requestDocuments} success="Request sent">
        <Select label="Document" name="typeId" options={types} required />
        <Input label="Upload by" name="dueDate" type="date" required />
        <fieldset>
          <legend className="label">Send to</legend>
          <div className="max-h-56 overflow-y-auto rounded-ctl border border-line p-2 space-y-1">
            {employees.map((e) => <label key={e.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-soft text-[13.5px]"><input type="checkbox" name="employeeIds[]" value={e.value} defaultChecked className="accent-[#784900]" />{e.label}</label>)}
          </div>
        </fieldset>
        <FormActions><Submit>Send request</Submit></FormActions>
      </ActionForm>
    </Modal>
  );
}
