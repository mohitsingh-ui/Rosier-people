import Link from "next/link";
import { Plus, LifeBuoy } from "lucide-react";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/auth/viewer";
import { fmtDateTime } from "@/lib/dates";
import { humanize } from "@/lib/utils";
import { PageHeader, MetricCard } from "@/components/ui/card";
import { Tabs, EmptyState, TableWrap } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { FilterDropdown } from "@/components/ui/filters";
import { TicketForm } from "@/components/helpdesk/forms";
import { AutoOpen } from "@/components/leave/forms";

export const metadata = { title: "Helpdesk" };

export default async function Helpdesk({ searchParams }: { searchParams: Promise<{ tab?: string; new?: string; status?: string; category?: string }> }) {
  const v = await requireViewer();
  const sp = await searchParams;
  const agent = can(v, "helpdesk.manage");
  const tabs = [{ key: "mine", label: "My requests" }, ...(agent ? [{ key: "queue", label: "HR queue" }, { key: "assigned", label: "Assigned to me" }] : [])];
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : agent ? "queue" : "mine";
  const where = tab === "mine" ? { createdById: v.employeeId ?? "__none__" } : tab === "assigned" ? { assigneeId: v.employeeId ?? "__none__" } : {};
  const statusWhere = sp.status ? { status: sp.status as never } : tab === "mine" ? {} : { status: { notIn: ["CLOSED"] as never[] } };
  const tickets = await db.helpdeskTicket.findMany({ where: { ...where, ...statusWhere, ...(sp.category ? { category: sp.category } : {}) }, include: { createdBy: true, assignee: true, _count: { select: { comments: { where: tab === "mine" ? { isInternal: false } : {} } } } }, orderBy: [{ updatedAt: "desc" }] });
  const stats = agent ? await db.helpdeskTicket.groupBy({ by: ["status"], _count: true }) : [];
  const n = (s: string) => stats.find((x) => x.status === s)?._count ?? 0;
  return (
    <>
      <PageHeader title="Helpdesk" description="Ask HR anything — payroll, leave, documents, IT or workplace. Track every reply here."
        actions={v.employeeId ? <Modal size="lg" title="Raise a request" trigger={<Button data-autoopen={sp.new ? "" : undefined}><Plus className="size-4" />New request</Button>}><TicketForm /></Modal> : null} />
      {sp.new && <AutoOpen />}
      {agent && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5"><MetricCard label="Open" value={n("OPEN")} tone={n("OPEN") ? "warn" : undefined} href="/helpdesk?tab=queue&status=OPEN" /><MetricCard label="In progress" value={n("ASSIGNED") + n("IN_PROGRESS")} /><MetricCard label="Waiting for employee" value={n("WAITING_FOR_EMPLOYEE")} /><MetricCard label="Resolved" value={n("RESOLVED") + n("CLOSED")} /></div>}
      <Tabs tabs={tabs} active={tab} base="/helpdesk" />
      <div className="flex flex-wrap gap-2 my-4">
        <FilterDropdown param="status" label="Status" options={["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_EMPLOYEE", "RESOLVED", "CLOSED"].map((s) => ({ value: s, label: humanize(s) }))} />
        <FilterDropdown param="category" label="Topic" options={["PAYROLL", "LEAVE", "ATTENDANCE", "DOCUMENTS", "IT", "BENEFITS", "POLICY", "WORKPLACE", "OTHER"].map((s) => ({ value: s, label: humanize(s) }))} />
      </div>
      {tickets.length === 0 ? <div className="card"><EmptyState icon={LifeBuoy} title={tab === "mine" ? "You haven't raised any requests" : "Nothing in the queue"} /></div> : (
        <TableWrap><table className="tbl"><thead><tr><th>Ticket</th>{tab !== "mine" && <th>Raised by</th>}<th>Topic</th><th>Priority</th><th>Assigned</th><th>Status</th><th>Updated</th></tr></thead><tbody>
          {tickets.map((t) => (
            <tr key={t.id}><td><Link href={`/helpdesk/${t.id}`} className="hover:text-brand"><span className="block font-medium">{t.subject}</span><span className="block text-[12px] text-muted">{t.number} · {t._count.comments} repl{t._count.comments === 1 ? "y" : "ies"}</span></Link></td>
              {tab !== "mine" && <td><span className="flex items-center gap-2 whitespace-nowrap"><EmployeeAvatar employee={t.createdBy} size={24} />{t.createdBy.firstName} {t.createdBy.lastName}</span></td>}
              <td>{humanize(t.category)}</td><td><StatusBadge status={t.priority} /></td><td>{t.assignee ? t.assignee.firstName : <span className="text-faint">—</span>}</td><td><StatusBadge status={t.status} /></td><td className="text-muted text-[12.5px] whitespace-nowrap">{fmtDateTime(t.updatedAt)}</td></tr>
          ))}
        </tbody></table></TableWrap>
      )}
    </>
  );
}
