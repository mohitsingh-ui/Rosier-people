import { Paperclip } from "lucide-react";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/action-button";
import type { ActionResult } from "@/lib/action";

type Act = (input: Record<string, unknown>) => Promise<ActionResult<unknown>>;

/** ApprovalCard: one pending request with approve / reject (and optional ask-for-clarification). */
export function ApprovalCard({ person, title, meta, reason, status, id, act, clarify, attachmentHref, extra }: {
  person: { id: string; firstName: string; lastName: string; photoUrl: string | null; designation?: { name: string } | null };
  title: React.ReactNode; meta?: React.ReactNode; reason?: string | null; status?: string; id: string; act: Act; clarify?: boolean; attachmentHref?: string | null; extra?: React.ReactNode;
}) {
  return (
    <li className="card p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <EmployeeAvatar employee={person} size={40} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{person.firstName} {person.lastName}</span>{person.designation && <span className="text-[12.5px] text-muted">{person.designation.name}</span>}{status && status !== "PENDING" && <StatusBadge status={status} />}</div>
            <div className="text-[14px] mt-0.5">{title}</div>
            {meta && <div className="text-[12.5px] text-muted mt-0.5">{meta}</div>}
            {reason && <p className="text-[13px] text-ink-2 mt-2 rounded-lg bg-soft/70 px-3 py-2 whitespace-pre-line">{reason}</p>}
            {attachmentHref && <a href={attachmentHref} className="inline-flex items-center gap-1 text-[12.5px] text-brand mt-2 hover:underline"><Paperclip className="size-3.5" />Attachment</a>}
            {extra}
          </div>
        </div>
        <div className="flex sm:flex-col gap-2 sm:w-36 shrink-0">
          <ActionButton action={act} payload={{ id, decision: "APPROVED" }} variant="primary" size="md" className="flex-1 sm:flex-none" success="Approved">Approve</ActionButton>
          <ActionButton action={act} payload={{ id, decision: "REJECTED" }} variant="danger" size="md" className="flex-1 sm:flex-none" confirm={{ title: "Decline this request?", confirmLabel: "Decline", danger: true, note: { label: "Reason (shared with them)", required: true } }}>Decline</ActionButton>
          {clarify && <ActionButton action={act} payload={{ id, decision: "CLARIFICATION" }} variant="ghost" size="md" className="flex-1 sm:flex-none" confirm={{ title: "Ask for more detail", confirmLabel: "Send question", note: { label: "Your question", required: true } }}>Ask a question</ActionButton>}
        </div>
      </div>
    </li>
  );
}
