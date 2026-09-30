import Link from "next/link";
import { notFound } from "next/navigation";
import { Paperclip, Lock } from "lucide-react";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/auth/viewer";
import { fmtDateTime } from "@/lib/dates";
import { cn, humanize } from "@/lib/utils";
import { PageHeader, Section, KV } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/action-button";
import { ReplyForm } from "@/components/helpdesk/forms";
import { TicketControls } from "./controls";
import { updateTicket } from "@/server/helpdesk";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await requireViewer();
  const { id } = await params;
  const agent = can(v, "helpdesk.manage");
  const t = await db.helpdeskTicket.findUnique({ where: { id }, include: { createdBy: { include: { designation: true, department: true } }, assignee: true, comments: { where: agent ? {} : { isInternal: false }, include: { author: true }, orderBy: { createdAt: "asc" } } } });
  if (!t || (!agent && t.createdById !== v.employeeId)) notFound();
  const agents = agent ? await db.employee.findMany({ where: { user: { role: { permissions: { some: { permission: { key: "helpdesk.manage" } } } } } }, orderBy: { firstName: "asc" } }) : [];
  const owner = t.createdById === v.employeeId;
  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow={<Link href="/helpdesk" className="hover:text-brand">Helpdesk / {t.number}</Link>} title={t.subject} description={<span className="inline-flex items-center gap-2"><StatusBadge status={t.status} /><StatusBadge status={t.priority} /> {humanize(t.category)}</span>}
        actions={owner && !agent ? (["RESOLVED", "CLOSED"].includes(t.status) ? <ActionButton action={updateTicket} payload={{ id: t.id, status: "OPEN" }} size="md">Reopen</ActionButton> : <ActionButton action={updateTicket} payload={{ id: t.id, status: "CLOSED" }} size="md" variant="secondary" confirm={{ title: "Close this request?", confirmLabel: "Close" }}>Close request</ActionButton>) : null} />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-2.5 mb-3"><EmployeeAvatar employee={t.createdBy} size={30} /><span className="text-[13px]"><span className="font-medium">{t.createdBy.firstName} {t.createdBy.lastName}</span> <span className="text-muted">· {fmtDateTime(t.createdAt)}</span></span></div>
            <p className="text-[14px] whitespace-pre-line">{t.description}</p>
            {t.attachmentKey && <a href={`/api/attachments/ticket/${t.id}`} className="inline-flex items-center gap-1 text-[13px] text-brand mt-3 hover:underline"><Paperclip className="size-3.5" />Attachment</a>}
          </div>
          {t.comments.map((c) => (
            <div key={c.id} className={cn("card p-4", c.isInternal && "bg-warn-bg/40 border-warn/20", c.authorId !== t.createdById && !c.isInternal && "ml-0 sm:ml-8")}>
              <div className="flex items-center gap-2.5 mb-2"><EmployeeAvatar employee={c.author} size={26} /><span className="text-[12.5px]"><span className="font-medium">{c.author.firstName} {c.author.lastName}</span>{c.authorId !== t.createdById && <span className="text-brand"> · HR</span>} <span className="text-muted">· {fmtDateTime(c.createdAt)}</span></span>{c.isInternal && <span className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-warn"><Lock className="size-3" />Internal</span>}</div>
              <p className="text-[13.5px] whitespace-pre-line">{c.body}</p>
              {c.attachmentKey && <a href={`/api/attachments/comment/${c.id}`} className="inline-flex items-center gap-1 text-[12.5px] text-brand mt-2 hover:underline"><Paperclip className="size-3.5" />Attachment</a>}
            </div>
          ))}
          {t.status !== "CLOSED" && <div className="card p-5"><ReplyForm ticketId={t.id} agent={agent} /></div>}
        </div>
        <div className="space-y-5">
          {agent && <Section title="Manage"><TicketControls id={t.id} status={t.status} priority={t.priority} assigneeId={t.assigneeId} agents={agents.map((a) => ({ value: a.id, label: `${a.firstName} ${a.lastName}` }))} /></Section>}
          <Section title="Details">
            <dl className="space-y-3"><KV label="Ticket" value={t.number} /><KV label="Raised by" value={`${t.createdBy.firstName} ${t.createdBy.lastName}`} /><KV label="Department" value={t.createdBy.department?.name} /><KV label="Assigned to" value={t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : "Not yet"} /><KV label="Last update" value={fmtDateTime(t.updatedAt)} />{t.resolvedAt && <KV label="Resolved" value={fmtDateTime(t.resolvedAt)} />}</dl>
          </Section>
        </div>
      </div>
    </div>
  );
}
