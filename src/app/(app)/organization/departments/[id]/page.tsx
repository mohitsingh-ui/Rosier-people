import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus, Briefcase } from "lucide-react";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/auth/viewer";
import { addDays, fmtDate, today } from "@/lib/dates";
import { PageHeader, DashboardCard, MetricCard } from "@/components/ui/card";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState, Progress } from "@/components/ui/misc";
import { StatusBreakdown } from "@/components/charts/static";
import { DepartmentForm, OpeningForm } from "@/components/org/forms";
import { teamToday } from "@/server/queries";

export default async function DepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await requireViewer();
  const { id } = await params;
  const d = await db.department.findUnique({ where: { id }, include: { head: { include: { designation: true } }, openings: { orderBy: { createdAt: "desc" } } } });
  if (!d) notFound();
  const manage = can(v, "org.manage");
  // Aggregates are visible to everyone; individual attendance/leave/performance only to HR or the people's managers.
  const people = await db.employee.findMany({ where: { departmentId: id, status: { notIn: ["EXITED", "INACTIVE"] } }, include: { designation: true, _count: { select: { reports: true } } }, orderBy: [{ designation: { level: "desc" } }, { firstName: "asc" }] });
  const ids = people.map((p) => p.id);
  const seeDetail = can(v, "people.edit") || ids.every((x) => v.teamIds.has(x) || x === v.employeeId);
  const monthStart = new Date(Date.UTC(today().getUTCFullYear(), today().getUTCMonth(), 1));
  const [todayRows, leaveMonth, pendingLeave, goals, reviews, allPeople] = await Promise.all([
    teamToday(ids),
    db.leaveRequest.findMany({ where: { employeeId: { in: ids }, status: "APPROVED", startDate: { lte: addDays(monthStart, 31) }, endDate: { gte: monthStart } }, include: { employee: true, leaveType: true } }),
    db.leaveRequest.count({ where: { employeeId: { in: ids }, status: "PENDING" } }),
    db.goal.groupBy({ by: ["status"], where: { ownerId: { in: ids } }, _count: true }),
    db.performanceReview.findMany({ where: { employeeId: { in: ids }, finalRating: { not: null } }, select: { finalRating: true } }),
    manage ? db.employee.findMany({ where: { status: { notIn: ["EXITED", "INACTIVE"] } }, orderBy: { firstName: "asc" } }) : Promise.resolve([]),
  ]);
  const managers = people.filter((p) => p._count.reports > 0);
  const g = (s: string) => goals.find((x) => x.status === s)?._count ?? 0;
  const totalGoals = goals.reduce((a, x) => a + x._count, 0);
  const avg = reviews.length ? (reviews.reduce((a, r) => a + (r.finalRating ?? 0), 0) / reviews.length).toFixed(1) : "—";

  return (
    <>
      <PageHeader eyebrow={<Link href="/organization?tab=departments" className="hover:text-brand">Organization / Departments</Link>} title={d.name} description={d.description ?? undefined}
        actions={manage ? <Modal title={`Edit ${d.name}`} trigger={<Button variant="secondary"><Pencil className="size-4" />Edit</Button>}><DepartmentForm d={d} people={allPeople.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))} /></Modal> : null} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <div className="card px-4 py-3.5 col-span-2 lg:col-span-1 flex items-center gap-3">
          {d.head ? <><EmployeeAvatar employee={d.head} size={40} /><div className="min-w-0"><div className="text-[12px] text-muted">Department head</div><Link href={`/people/${d.head.id}`} className="font-medium hover:text-brand truncate block">{d.head.firstName} {d.head.lastName}</Link></div></> : <span className="text-muted text-[13px]">No head assigned</span>}
        </div>
        <MetricCard label="Employees" value={people.length} />
        <MetricCard label="Managers" value={managers.length} />
        <MetricCard label="Open positions" value={d.openings.filter((o) => o.status === "OPEN").reduce((a, o) => a + o.positions, 0)} />
        <MetricCard label="Avg. rating" value={avg} hint={`${reviews.length} completed reviews`} />
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <DashboardCard title="People" subtitle={`${people.length} in ${d.name}`} className="lg:col-span-2">
          <ul className="grid sm:grid-cols-2 gap-3">
            {people.map((p) => (
              <li key={p.id}><Link href={`/people/${p.id}`} className="flex items-center gap-3 rounded-ctl border border-line p-3 hover:border-line-2 group">
                <EmployeeAvatar employee={p} size={38} />
                <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-medium truncate group-hover:text-brand">{p.firstName} {p.lastName}</span><span className="block text-[12px] text-muted truncate">{p.designation?.name}</span></span>
                {p._count.reports > 0 && <Badge tone="brand">Manager</Badge>}
                {p.status !== "ACTIVE" && <StatusBadge status={p.status} />}
              </Link></li>
            ))}
          </ul>
        </DashboardCard>
        <div className="space-y-6">
          <DashboardCard title="Attendance today">
            <StatusBreakdown items={[
              { label: "Present", value: todayRows.filter((r) => r.state === "PRESENT").length, tone: "ok" }, { label: "Late", value: todayRows.filter((r) => r.state === "LATE").length, tone: "warn" },
              { label: "WFH", value: todayRows.filter((r) => r.state.startsWith("WFH")).length, tone: "info" }, { label: "On leave", value: todayRows.filter((r) => r.state === "LEAVE").length, tone: "plum" },
              { label: "Not in yet", value: todayRows.filter((r) => r.state === "NOT_IN").length, tone: "bad" },
            ]} />
          </DashboardCard>
          <DashboardCard title="Leave this month" subtitle={`${pendingLeave} request${pendingLeave === 1 ? "" : "s"} pending`}>
            {leaveMonth.length === 0 ? <p className="text-[13px] text-muted">No approved leave this month.</p> : seeDetail ? (
              <ul className="space-y-2 text-[13px]">{leaveMonth.map((l) => <li key={l.id} className="flex justify-between gap-2"><span>{l.employee.firstName} · {l.leaveType.code}</span><span className="text-muted">{fmtDate(l.startDate, "d MMM")}{l.endDate > l.startDate ? `–${fmtDate(l.endDate, "d MMM")}` : ""}</span></li>)}</ul>
            ) : <p className="text-[13px]">{leaveMonth.length} approved leave{leaveMonth.length > 1 ? "s" : ""}, {leaveMonth.reduce((a, l) => a + l.days, 0)} days in total.</p>}
          </DashboardCard>
          <DashboardCard title="Performance overview" subtitle={`${totalGoals} goals`}>
            {totalGoals ? <div className="space-y-2.5 text-[13px]">
              {[["Completed", g("COMPLETED"), "ok"], ["In progress", g("IN_PROGRESS"), "brand"], ["At risk", g("AT_RISK"), "bad"], ["Not started", g("NOT_STARTED"), "brand"]].map(([l, n, t]) => (
                <div key={l as string}><div className="flex justify-between"><span className="text-ink-2">{l}</span><span className="tabular-nums font-medium">{n}</span></div><Progress value={((n as number) / totalGoals) * 100} tone={t as "ok"} className="mt-1" /></div>
              ))}
            </div> : <p className="text-[13px] text-muted">No goals yet.</p>}
          </DashboardCard>
          <DashboardCard title="Open positions" action={manage ? <Modal title="New opening" trigger={<Button variant="ghost" size="sm"><Plus className="size-3.5" />Add</Button>}><OpeningForm departmentId={d.id} /></Modal> : null}>
            {d.openings.length === 0 ? <EmptyState compact icon={Briefcase} title="No open roles" /> : (
              <ul className="space-y-2.5">{d.openings.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 text-[13.5px]"><span>{o.title} <span className="text-muted">× {o.positions}</span></span>
                  <span className="flex items-center gap-1">{manage ? <Modal title="Edit opening" trigger={<button className="text-left"><Badge tone={o.status === "OPEN" ? "ok" : "neutral"}>{o.status.replace("_", " ").toLowerCase()}</Badge></button>}><OpeningForm departmentId={d.id} o={o} /></Modal> : <Badge tone={o.status === "OPEN" ? "ok" : "neutral"}>{o.status.toLowerCase()}</Badge>}</span></li>
              ))}</ul>
            )}
          </DashboardCard>
        </div>
      </div>
    </>
  );
}
