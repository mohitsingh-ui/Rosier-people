import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/viewer";
import { fmtDate, fmtTime, today } from "@/lib/dates";
import { PageHeader, Section } from "@/components/ui/card";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState, Progress, TableWrap, Tabs } from "@/components/ui/misc";
import { ActionButton } from "@/components/ui/action-button";
import { TaskForm } from "@/components/people/forms";
import { pendingApprovals, teamToday, upcomingCelebrations } from "@/server/queries";
import { updateTask } from "@/server/people";

export const metadata = { title: "My Team" };

const STATE: Record<string, { label: string; tone: "ok" | "warn" | "info" | "plum" | "bad" | "neutral" }> = {
  PRESENT: { label: "In", tone: "ok" }, LATE: { label: "In · late", tone: "warn" }, WFH: { label: "WFH", tone: "info" }, WFH_NOT_IN: { label: "WFH · not in", tone: "info" },
  LEAVE: { label: "On leave", tone: "plum" }, NOT_IN: { label: "Not checked in", tone: "bad" }, WEEKEND: { label: "Weekly off", tone: "neutral" },
};

export default async function MyTeam({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const v = await requirePermission("team.view");
  const sp = await searchParams;
  const all = sp.scope === "all";
  const ids = all ? [...v.teamIds] : [...v.directReportIds];
  if (!v.teamIds.size) return (<><PageHeader title="My Team" /><div className="card"><EmptyState icon={Users} title="No one reports to you yet" body="When people are assigned to you as their manager they'll appear here." action={<Link href="/people" className="text-brand hover:underline text-[13.5px]">Browse the directory</Link>} /></div></>);

  const [rows, approvals, tasks, goals, reviews, birthdays, people] = await Promise.all([
    teamToday(ids), pendingApprovals(v),
    db.task.findMany({ where: { createdById: v.employeeId ?? "", status: { not: "DONE" } }, include: { assignee: true }, orderBy: { dueDate: "asc" } }),
    db.goal.findMany({ where: { ownerId: { in: [...v.teamIds] }, status: { notIn: ["CANCELLED", "COMPLETED"] } }, include: { owner: true }, orderBy: [{ status: "asc" }, { endDate: "asc" }], take: 8 }),
    db.performanceReview.findMany({ where: { reviewerId: v.employeeId ?? "", status: { not: "COMPLETED" } }, include: { employee: true, cycle: true } }),
    upcomingCelebrations(30, [...v.teamIds]),
    db.employee.findMany({ where: { id: { in: [...v.teamIds] } }, include: { designation: true, location: true }, orderBy: { firstName: "asc" } }),
  ]);
  const info = new Map(people.map((p) => [p.id, p]));
  const opts = people.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }));

  return (
    <>
      <PageHeader title="My Team" description={`${v.directReportIds.size} direct reports${v.teamIds.size > v.directReportIds.size ? ` · ${v.teamIds.size} in your full reporting line` : ""}`}
        actions={<Modal title="Assign a task" trigger={<Button><Plus className="size-4" />Assign task</Button>}><TaskForm people={opts} /></Modal>} />
      {v.teamIds.size > v.directReportIds.size && <Tabs tabs={[{ key: "direct", label: "Direct reports", count: v.directReportIds.size }, { key: "all", label: "Everyone below me", count: v.teamIds.size }]} active={all ? "all" : "direct"} base="/my-team" param="scope" />}
      <div className="grid lg:grid-cols-3 gap-6 pt-5">
        <div className="lg:col-span-2 space-y-6">
          <TableWrap>
            <table className="tbl"><thead><tr><th>Person</th><th>Today</th><th>Check-in</th><th>Location</th><th /></tr></thead><tbody>
              {rows.sort((a, b) => a.firstName.localeCompare(b.firstName)).map((r) => {
                const s = STATE[r.state] ?? STATE.NOT_IN;
                const p = info.get(r.id);
                return (
                  <tr key={r.id}>
                    <td><Link href={`/people/${r.id}`} className="flex items-center gap-3 group"><EmployeeAvatar employee={r} size={34} /><span><span className="block font-medium group-hover:text-brand">{r.firstName} {r.lastName}</span><span className="block text-[12px] text-muted">{r.designation?.name}</span></span></Link></td>
                    <td><Badge tone={s.tone} dot>{s.label}</Badge>{r.leave && <span className="block text-[11.5px] text-muted mt-0.5">{r.leave.leaveType.name}</span>}</td>
                    <td className="tabular-nums text-muted">{r.attendance?.checkIn ? fmtTime(r.attendance.checkIn) : "—"}</td>
                    <td className="text-muted">{p?.location?.name}</td>
                    <td className="text-right whitespace-nowrap"><Link href={`/people/${r.id}?tab=attendance`} className="text-[13px] text-brand hover:underline">Attendance</Link><Link href={`/people/${r.id}?tab=performance`} className="text-[13px] text-brand hover:underline ml-3">Performance</Link></td>
                  </tr>
                );
              })}
            </tbody></table>
          </TableWrap>
          <Section title="Tasks you've assigned">
            {tasks.length === 0 ? <p className="text-[13px] text-muted">No open tasks.</p> : (
              <ul className="divide-y divide-line -my-2">{tasks.map((t) => (
                <li key={t.id} className="py-2.5 flex items-center gap-3">
                  <EmployeeAvatar employee={t.assignee} size={28} />
                  <span className="flex-1 min-w-0"><span className="block text-[13.5px] truncate">{t.title}</span><span className={`text-[12px] ${t.dueDate && t.dueDate < today() ? "text-bad" : "text-muted"}`}>{t.assignee.firstName}{t.dueDate ? ` · due ${fmtDate(t.dueDate, "d MMM")}` : ""}</span></span>
                  <StatusBadge status={t.status} />
                  <ActionButton action={updateTask} payload={{ id: t.id, status: "DONE" }} variant="ghost" success="Closed">Close</ActionButton>
                </li>
              ))}</ul>
            )}
          </Section>
        </div>
        <div className="space-y-6">
          <Section title="Needs your approval">
            <ul className="space-y-1 text-[13.5px]">
              {[["Leave", approvals.leave, "/leave?tab=approvals"], ["WFH", approvals.wfh, "/attendance?tab=approvals"], ["Attendance corrections", approvals.corrections, "/attendance?tab=approvals"], ["Expense claims", approvals.expenses, "/expenses?tab=approvals"], ["Reviews to write", reviews.filter((r) => r.status === "PENDING_MANAGER").length, "/performance?tab=team"]].map(([l, n, h]) => (
                <li key={l as string}><Link href={h as string} className="flex justify-between rounded-lg px-2 py-1.5 -mx-2 hover:bg-soft"><span>{l}</span><span className={(n as number) ? "font-semibold text-brand" : "text-faint"}>{n}</span></Link></li>
              ))}
            </ul>
          </Section>
          <Section title="Team goals">
            {goals.length === 0 ? <p className="text-[13px] text-muted">No active goals.</p> : <ul className="space-y-3">{goals.map((g) => (
              <li key={g.id}><div className="flex justify-between gap-2 text-[13px]"><Link href={`/goals/${g.id}`} className="truncate hover:text-brand">{g.title}</Link><span className="text-muted shrink-0">{g.owner.firstName}</span></div><Progress value={g.progress} tone={g.status === "AT_RISK" ? "bad" : "brand"} className="mt-1.5" /></li>
            ))}</ul>}
          </Section>
          <Section title="Birthdays & anniversaries">
            {birthdays.length === 0 ? <p className="text-[13px] text-muted">Nothing in the next 30 days.</p> : <ul className="space-y-2 text-[13px]">{birthdays.map((b) => <li key={b.id} className="flex justify-between"><span>{b.person.firstName} {b.person.lastName}</span><span className="text-muted">{b.kind === "birthday" ? "🎂" : `${b.years}y`} {fmtDate(b.date, "d MMM")}</span></li>)}</ul>}
          </Section>
        </div>
      </div>
    </>
  );
}
