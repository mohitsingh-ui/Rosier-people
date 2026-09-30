import Link from "next/link";
import { FileWarning, UserPlus, UserMinus } from "lucide-react";
import { db } from "@/lib/db";
import type { Viewer } from "@/lib/auth/viewer";
import { addDays, fmtDate, today } from "@/lib/dates";
import { DashboardCard, MetricCard } from "@/components/ui/card";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState, Progress } from "@/components/ui/misc";
import { AreaTrend } from "@/components/charts/charts";
import { BarList, StatusBreakdown } from "@/components/charts/static";
import { expiringDocuments, expiryState, pendingApprovals, teamToday } from "@/server/queries";

/** HR / Admin: "What's happening across the organization?" */
export async function HrOverview({ v }: { v: Viewer }) {
  const t = today();
  const monthStart = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
  const [all, approvals, expiring, openTickets, onboardings, exits, depts, pendingDocs] = await Promise.all([
    db.employee.findMany({ select: { id: true, status: true, joiningDate: true, exitDate: true, departmentId: true } }),
    pendingApprovals(v),
    expiringDocuments(30),
    db.helpdeskTicket.count({ where: { status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] } } }),
    db.onboarding.findMany({ where: { status: "IN_PROGRESS" }, include: { employee: { include: { designation: true } }, tasks: { select: { status: true } } } }),
    db.offboarding.findMany({ where: { stage: { notIn: ["EXITED", "WITHDRAWN", "REJECTED"] } }, include: { employee: { include: { designation: true } } } }),
    db.department.findMany({ include: { _count: { select: { employees: { where: { status: { notIn: ["EXITED"] } } } } } }, orderBy: { name: "asc" } }),
    db.employeeDocument.findMany({ where: { status: "PENDING", archivedAt: null }, include: { employee: true, type: true }, take: 5, orderBy: { createdAt: "asc" } }),
  ]);
  const current = all.filter((e) => e.status !== "EXITED");
  const active = all.filter((e) => ["ACTIVE", "PROBATION", "NOTICE_PERIOD"].includes(e.status));
  const newJoiners = all.filter((e) => e.joiningDate >= monthStart && e.joiningDate <= addDays(t, 30));
  const today_ = await teamToday(active.map((e) => e.id));
  const onLeave = today_.filter((r) => r.state === "LEAVE").length;

  // Workforce growth: headcount at the end of each of the last 12 months
  const growth = Array.from({ length: 12 }, (_, i) => {
    const end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 11 + i + 1, 0));
    const n = all.filter((e) => e.joiningDate <= end && (!e.exitDate || e.exitDate > end) && e.status !== "PREBOARDING").length;
    return { label: fmtDate(end, "MMM"), value: n };
  });
  const lifecycle = [
    { label: "Preboarding", value: all.filter((e) => e.status === "PREBOARDING").length, tone: "plum" as const },
    { label: "Probation", value: all.filter((e) => e.status === "PROBATION").length, tone: "info" as const },
    { label: "Active", value: all.filter((e) => e.status === "ACTIVE").length, tone: "ok" as const },
    { label: "Notice period", value: all.filter((e) => e.status === "NOTICE_PERIOD").length, tone: "warn" as const },
    { label: "Exited", value: all.filter((e) => e.status === "EXITED").length, tone: "neutral" as const },
  ];
  const attendance = [
    { label: "Present", value: today_.filter((r) => r.state === "PRESENT").length, tone: "ok" as const },
    { label: "Late", value: today_.filter((r) => r.state === "LATE").length, tone: "warn" as const },
    { label: "WFH", value: today_.filter((r) => r.state === "WFH" || r.state === "WFH_NOT_IN").length, tone: "info" as const },
    { label: "On leave", value: onLeave, tone: "plum" as const },
    { label: "Not checked in", value: today_.filter((r) => r.state === "NOT_IN").length, tone: "bad" as const },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <MetricCard label="Total employees" value={current.length} href="/people" />
        <MetricCard label="Active" value={active.length} hint={`${all.filter((e) => e.status === "PROBATION").length} on probation`} href="/people?status=ACTIVE" />
        <MetricCard label="New joiners" value={newJoiners.length} hint="This month & next 30 days" href="/onboarding" />
        <MetricCard label="On leave today" value={onLeave} href="/leave?tab=calendar" />
        <MetricCard label="Pending approvals" value={approvals.total} tone={approvals.total ? "warn" : undefined} href="/leave?tab=approvals" />
        <MetricCard label="Documents expiring" value={expiring.length} hint="Next 30 days" tone={expiring.some((d) => (expiryState(d.expiryDate)?.days ?? 99) < 0) ? "bad" : expiring.length ? "warn" : undefined} href="/documents?tab=attention" />
        <MetricCard label="Open HR requests" value={openTickets} href="/helpdesk" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <DashboardCard title="Workforce growth" subtitle="Headcount at month end, last 12 months" className="lg:col-span-2">
          <AreaTrend data={growth} unit="people" />
        </DashboardCard>
        <DashboardCard title="Attendance today" subtitle={`${active.length} people expected`} action={<Link href="/attendance?tab=team" className="text-[13px] text-brand hover:underline">Details</Link>}>
          <StatusBreakdown items={attendance} />
        </DashboardCard>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <DashboardCard title="Department distribution" subtitle="Current headcount">
          <BarList data={depts.filter((d) => d._count.employees).sort((a, b) => b._count.employees - a._count.employees).map((d) => ({ label: d.name, value: d._count.employees, key: d.id }))} hrefPrefix="/organization/departments/" />
        </DashboardCard>
        <DashboardCard title="Employee lifecycle">
          <StatusBreakdown items={lifecycle} />
          <div className="grid grid-cols-2 gap-3 mt-5">
            <Link href="/onboarding" className="rounded-ctl border border-line p-3 hover:bg-soft/60"><div className="flex items-center gap-1.5 text-[12px] text-muted"><UserPlus className="size-3.5" />Onboarding</div><div className="text-[20px] font-semibold">{onboardings.length}</div></Link>
            <Link href="/onboarding?tab=exits" className="rounded-ctl border border-line p-3 hover:bg-soft/60"><div className="flex items-center gap-1.5 text-[12px] text-muted"><UserMinus className="size-3.5" />Exits in progress</div><div className="text-[20px] font-semibold">{exits.length}</div></Link>
          </div>
        </DashboardCard>
        <DashboardCard title="Documents requiring attention" action={<Link href="/documents?tab=attention" className="text-[13px] text-brand hover:underline">Review</Link>}>
          {expiring.length + pendingDocs.length === 0 ? <EmptyState compact icon={FileWarning} title="Nothing needs attention" /> : (
            <ul className="space-y-2.5">
              {pendingDocs.map((d) => (
                <li key={d.id} className="flex items-center gap-2.5 text-[13px]"><EmployeeAvatar employee={d.employee} size={26} /><span className="min-w-0 flex-1 truncate"><span className="font-medium">{d.type.name}</span> <span className="text-muted">· {d.employee.firstName}</span></span><Badge tone="warn">To verify</Badge></li>
              ))}
              {expiring.slice(0, 6 - Math.min(pendingDocs.length, 3)).map((d) => {
                const s = expiryState(d.expiryDate)!;
                return <li key={d.id} className="flex items-center gap-2.5 text-[13px]"><EmployeeAvatar employee={d.employee} size={26} /><span className="min-w-0 flex-1 truncate"><span className="font-medium">{d.name}</span> <span className="text-muted">· {d.employee.firstName}</span></span><Badge tone={s.tone}>{s.label}</Badge></li>;
              })}
            </ul>
          )}
        </DashboardCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <DashboardCard title="Onboarding in progress" action={<Link href="/onboarding" className="text-[13px] text-brand hover:underline">All</Link>}>
          {onboardings.length === 0 ? <EmptyState compact title="No one is onboarding right now" /> : (
            <ul className="space-y-3.5">{onboardings.map((o) => {
              const done = o.tasks.filter((x) => x.status === "DONE").length;
              return (
                <li key={o.id}><Link href={`/onboarding/${o.employeeId}`} className="flex items-center gap-3 group">
                  <EmployeeAvatar employee={o.employee} size={36} />
                  <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="text-[13.5px] font-medium group-hover:text-brand truncate">{o.employee.firstName} {o.employee.lastName}</span><StatusBadge status={o.employee.status} /></span>
                    <span className="flex items-center gap-2 mt-1"><Progress value={(done / Math.max(1, o.tasks.length)) * 100} /><span className="text-[11.5px] text-muted shrink-0">{done}/{o.tasks.length}</span></span></span>
                  <span className="text-[12px] text-muted shrink-0">Joins {fmtDate(o.employee.joiningDate, "d MMM")}</span>
                </Link></li>
              );
            })}</ul>
          )}
        </DashboardCard>
        <DashboardCard title="Exits in progress" action={<Link href="/onboarding?tab=exits" className="text-[13px] text-brand hover:underline">All</Link>}>
          {exits.length === 0 ? <EmptyState compact title="No exits in progress" /> : (
            <ul className="space-y-3">{exits.map((o) => (
              <li key={o.id}><Link href={`/onboarding/exit/${o.id}`} className="flex items-center gap-3 group">
                <EmployeeAvatar employee={o.employee} size={36} />
                <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-medium group-hover:text-brand">{o.employee.firstName} {o.employee.lastName}</span><span className="text-[12px] text-muted">{o.employee.designation?.name}</span></span>
                <span className="text-right"><StatusBadge status={o.stage} /><span className="block text-[11.5px] text-muted mt-1">Last day {fmtDate(o.lastWorkingDay ?? o.requestedLastDay, "d MMM")}</span></span>
              </Link></li>
            ))}</ul>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
