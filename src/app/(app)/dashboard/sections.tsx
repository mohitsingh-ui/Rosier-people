import Link from "next/link";
import { CalendarPlus, Clock3, Upload, FileText, LifeBuoy, Cake, Award, PartyPopper, ChevronRight, CheckCircle2, UserCheck, Home, Plane, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import type { Viewer } from "@/lib/auth/viewer";
import { fmtDate, today, greeting } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { DashboardCard } from "@/components/ui/card";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState, Progress } from "@/components/ui/misc";
import { AttendanceWidget } from "@/components/attendance-widget";
import { leaveBalances, todaysAttendance, upcomingHolidays, upcomingCelebrations, visibleAnnouncements, pendingApprovals, teamToday } from "@/server/queries";
import { myTasks } from "@/server/my-tasks";

export async function Greeting({ v, right }: { v: Viewer; right?: React.ReactNode }) {
  const e = v.employee;
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
      <div className="flex items-center gap-4">
        {e && <EmployeeAvatar employee={e} size={52} />}
        <div>
          <p className="text-[12.5px] text-muted">{fmtDate(today(), "EEEE, d MMMM")}</p>
          <h1 className="text-[22px] sm:text-[24px] leading-tight">{greeting()}, {e?.firstName ?? "there"}</h1>
          {e && <p className="text-[13px] text-muted">{e.designation} · {e.department}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function QuickActions({ v }: { v: Viewer }) {
  const items = [
    { href: "/leave?apply=1", label: "Apply leave", Icon: CalendarPlus },
    { href: "/attendance", label: "Attendance", Icon: Clock3 },
    { href: "/documents?upload=1", label: "Upload document", Icon: Upload },
    { href: "/payroll", label: "View payslip", Icon: FileText },
    { href: "/helpdesk?new=1", label: "Raise request", Icon: LifeBuoy },
  ];
  if (!v.employeeId) return null;
  return (
    <div className="grid grid-cols-5 gap-2 sm:gap-3">
      {items.map(({ href, label, Icon }) => (
        <Link key={href} href={href} className="card flex flex-col items-center justify-center gap-2 py-3.5 px-1 text-center hover:border-line-2 hover:bg-brand-50/40 transition-colors">
          <span className="size-9 rounded-full bg-brand-50 text-brand grid place-items-center"><Icon className="size-4" /></span>
          <span className="text-[11.5px] sm:text-[12.5px] text-ink-2 leading-tight">{label}</span>
        </Link>
      ))}
    </div>
  );
}

export async function MyAttendance({ v }: { v: Viewer }) {
  if (!v.employeeId) return null;
  const [rec, emp, leave] = await Promise.all([
    todaysAttendance(v.employeeId),
    db.employee.findUnique({ where: { id: v.employeeId }, include: { shift: true } }),
    db.leaveRequest.findFirst({ where: { employeeId: v.employeeId, status: "APPROVED", halfDay: "NONE", startDate: { lte: today() }, endDate: { gte: today() } }, include: { leaveType: true } }),
  ]);
  const shift = emp?.shift ?? { name: "General", startTime: "09:30", endTime: "18:30" };
  return (
    <AttendanceWidget
      record={rec ? { checkIn: rec.checkIn?.toISOString() ?? null, checkOut: rec.checkOut?.toISOString() ?? null, status: rec.status, workMinutes: rec.workMinutes } : null}
      shift={{ name: shift.name, startTime: shift.startTime, endTime: shift.endTime }}
      onLeave={leave?.leaveType.name ?? null}
    />
  );
}

export async function LeaveBalanceCard({ v }: { v: Viewer }) {
  if (!v.employeeId) return null;
  const bal = (await leaveBalances(v.employeeId)).filter((b) => b.allocated + b.carriedForward > 0 || b.used > 0);
  return (
    <DashboardCard title="Leave balance" subtitle={`${today().getUTCFullYear()}`} action={<Link href="/leave?apply=1" className="text-[13px] text-brand hover:underline">Apply</Link>}>
      <ul className="grid grid-cols-2 gap-3">
        {bal.slice(0, 4).map((b) => (
          <li key={b.id} className="rounded-ctl bg-soft/70 px-3.5 py-3">
            <div className="text-[12px] text-muted truncate">{b.leaveType.name}</div>
            <div className="flex items-baseline gap-1 mt-0.5"><span className="text-[22px] font-semibold tabular-nums">{b.available}</span><span className="text-[12px] text-muted">/ {b.allocated + b.carriedForward}</span></div>
            {b.pending > 0 && <div className="text-[11.5px] text-warn">{b.pending} pending</div>}
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}

const TASK_ICON = { document: Upload, policy: FileText, onboarding: CheckCircle2, task: CheckCircle2, review: Award, helpdesk: LifeBuoy, leave: Plane, exit: CheckCircle2 };

export async function MyTasksCard({ v }: { v: Viewer }) {
  const tasks = await myTasks(v);
  return (
    <DashboardCard title="What HR needs from you" subtitle={tasks.length ? `${tasks.length} open` : undefined}>
      {tasks.length === 0 ? (
        <EmptyState compact icon={CheckCircle2} title="You're all set" body="No pending documents, forms or tasks." />
      ) : (
        <ul className="divide-y divide-line -my-1">
          {tasks.slice(0, 6).map((t) => {
            const Icon = TASK_ICON[t.kind];
            const overdue = t.due && t.due < today();
            return (
              <li key={t.id}>
                <Link href={t.href} className="flex items-center gap-3 py-2.5 group">
                  <span className="size-8 rounded-full bg-brand-50 text-brand grid place-items-center shrink-0"><Icon className="size-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] text-ink truncate group-hover:text-brand">{t.title}</span>
                    {(t.hint || t.due) && <span className={cn("block text-[12px] truncate", overdue ? "text-bad" : "text-muted")}>{t.hint}{t.hint && t.due ? " · " : ""}{t.due ? `${overdue ? "Overdue since" : "Due"} ${fmtDate(t.due, "d MMM")}` : ""}</span>}
                  </span>
                  <ChevronRight className="size-4 text-faint" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}

export async function UpcomingCard({ scopeIds }: { scopeIds?: string[] }) {
  const [holidays, celebrations] = await Promise.all([upcomingHolidays(3), upcomingCelebrations(21, scopeIds)]);
  return (
    <DashboardCard title="Coming up" action={<Link href="/leave?tab=holidays" className="text-[13px] text-brand hover:underline">Holiday calendar</Link>}>
      <ul className="space-y-3">
        {holidays.map((h) => (
          <li key={h.id} className="flex items-center gap-3">
            <span className="w-11 text-center rounded-lg bg-brand-50 py-1 shrink-0">
              <span className="block text-[10px] uppercase text-brand font-semibold">{fmtDate(h.date, "MMM")}</span>
              <span className="block text-[16px] font-semibold leading-tight">{fmtDate(h.date, "d")}</span>
            </span>
            <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-medium truncate">{h.name}</span><span className="text-[12px] text-muted">{fmtDate(h.date, "EEEE")}</span></span>
            {h.type !== "PUBLIC" && <Badge tone={h.type === "OPTIONAL" ? "neutral" : "brand"}>{h.type === "OPTIONAL" ? "Optional" : "Company"}</Badge>}
          </li>
        ))}
        {celebrations.slice(0, 5).map((c) => (
          <li key={c.id} className="flex items-center gap-3">
            <span className="relative shrink-0"><EmployeeAvatar employee={c.person} size={44} /><span className="absolute -bottom-1 -right-1 size-5 rounded-full bg-white grid place-items-center shadow-card">{c.kind === "birthday" ? <Cake className="size-3 text-brand-2" /> : <PartyPopper className="size-3 text-brand-2" />}</span></span>
            <span className="min-w-0 flex-1">
              <Link href={`/people/${c.person.id}`} className="block text-[13.5px] font-medium truncate hover:text-brand">{c.person.firstName} {c.person.lastName}</Link>
              <span className="text-[12px] text-muted">{c.kind === "birthday" ? "Birthday" : `${c.years} year${c.years === 1 ? "" : "s"} at Rosier`} · {c.days === 0 ? "Today 🎉" : c.days === 1 ? "Tomorrow" : fmtDate(c.date, "d MMM")}</span>
            </span>
          </li>
        ))}
        {!holidays.length && !celebrations.length && <li className="text-muted text-[13px]">Nothing in the next three weeks.</li>}
      </ul>
    </DashboardCard>
  );
}

export async function AnnouncementsCard({ v }: { v: Viewer }) {
  const items = await visibleAnnouncements(v, 4);
  return (
    <DashboardCard title="What's happening at Rosier" action={<Link href="/announcements" className="text-[13px] text-brand hover:underline">All</Link>}>
      {items.length === 0 ? <EmptyState compact title="No announcements yet" /> : (
        <ul className="divide-y divide-line -my-2">
          {items.map((a) => (
            <li key={a.id} className="py-3">
              <div className="flex items-center gap-2 mb-1">
                <Badge tone={a.category === "POLICY" ? "info" : a.category === "EVENT" ? "plum" : a.category === "ACHIEVEMENT" ? "ok" : "brand"}>{a.category === "NEWS" ? "Company news" : a.category[0] + a.category.slice(1).toLowerCase()}</Badge>
                {a.pinned && <Badge>Pinned</Badge>}
                <span className="text-[11.5px] text-faint ml-auto">{fmtDate(a.publishAt, "d MMM")}</span>
              </div>
              <Link href={`/announcements#${a.id}`} className="block text-[14px] font-medium hover:text-brand">{a.title}</Link>
              <p className="text-[13px] text-muted line-clamp-2 mt-0.5">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

/** Manager: "How is my team doing? Who is absent? Who needs approval?" */
export async function TeamTodayCard({ v }: { v: Viewer }) {
  const ids = [...v.directReportIds];
  if (!ids.length) return null;
  const [rows, approvals, goals, reviews] = await Promise.all([
    teamToday([...v.teamIds]),
    pendingApprovals(v),
    db.goal.findMany({ where: { ownerId: { in: [...v.teamIds] }, status: { in: ["AT_RISK"] } }, include: { owner: true }, take: 4 }),
    db.performanceReview.count({ where: { reviewerId: v.employeeId!, status: "PENDING_MANAGER" } }),
  ]);
  const count = (s: string[]) => rows.filter((r) => s.includes(r.state)).length;
  const stats = [
    { label: "Present", value: count(["PRESENT", "LATE"]), Icon: UserCheck },
    { label: "WFH", value: count(["WFH", "WFH_NOT_IN"]), Icon: Home },
    { label: "On leave", value: count(["LEAVE"]), Icon: Plane },
    { label: "Not in yet", value: count(["NOT_IN"]), Icon: AlertTriangle },
  ];
  const notIn = rows.filter((r) => r.state === "NOT_IN" || r.state === "LEAVE");
  return (
    <DashboardCard title="My team today" subtitle={`${rows.length} people in your reporting line`} action={<Link href="/my-team" className="text-[13px] text-brand hover:underline">Open My Team</Link>}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(({ label, value, Icon }) => (
          <div key={label} className="rounded-ctl border border-line px-3.5 py-3">
            <div className="flex items-center gap-1.5 text-[12px] text-muted"><Icon className="size-3.5" />{label}</div>
            <div className="text-[22px] font-semibold tabular-nums mt-0.5">{value}</div>
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-3 gap-4 mt-5">
        <div>
          <div className="eyebrow mb-2">Away or not checked in</div>
          {notIn.length ? (
            <ul className="space-y-2">{notIn.slice(0, 5).map((r) => (
              <li key={r.id} className="flex items-center gap-2.5 text-[13px]"><EmployeeAvatar employee={r} size={26} /><span className="flex-1 truncate">{r.firstName} {r.lastName}</span>{r.state === "LEAVE" ? <StatusBadge status="LEAVE" label="Leave" /> : <Badge tone="warn">Not in</Badge>}</li>
            ))}</ul>
          ) : <p className="text-[13px] text-muted">Everyone&apos;s in.</p>}
        </div>
        <div>
          <div className="eyebrow mb-2">Needs your approval</div>
          <ul className="space-y-1.5 text-[13px]">
            {[["Leave requests", approvals.leave, "/leave?tab=approvals"], ["WFH requests", approvals.wfh, "/attendance?tab=approvals"], ["Attendance corrections", approvals.corrections, "/attendance?tab=approvals"], ["Expense claims", approvals.expenses, "/expenses?tab=approvals"], ["Reviews to write", reviews, "/performance?tab=team"]].map(([l, n, href]) => (
              <li key={l as string}><Link href={href as string} className="flex items-center justify-between rounded-lg px-2 py-1 -mx-2 hover:bg-soft"><span className="text-ink-2">{l}</span><span className={cn("tabular-nums font-semibold", (n as number) > 0 ? "text-brand" : "text-faint")}>{n}</span></Link></li>
            ))}
          </ul>
        </div>
        <div>
          <div className="eyebrow mb-2">Goals at risk</div>
          {goals.length ? <ul className="space-y-2.5">{goals.map((g) => (
            <li key={g.id}><Link href={`/goals/${g.id}`} className="block text-[13px] hover:text-brand truncate">{g.title}</Link><div className="flex items-center gap-2 mt-1"><Progress value={g.progress} tone="bad" /><span className="text-[11.5px] text-muted shrink-0">{g.owner.firstName}</span></div></li>
          ))}</ul> : <p className="text-[13px] text-muted">No goals at risk.</p>}
        </div>
      </div>
    </DashboardCard>
  );
}

export async function MyGoalsCard({ v }: { v: Viewer }) {
  if (!v.employeeId) return null;
  const goals = await db.goal.findMany({ where: { ownerId: v.employeeId, status: { notIn: ["CANCELLED"] } }, orderBy: [{ status: "asc" }, { endDate: "asc" }], take: 4 });
  if (!goals.length) return null;
  const done = goals.filter((g) => g.status === "COMPLETED").length;
  return (
    <DashboardCard title="How am I doing?" subtitle={`${done} of ${goals.length} goals complete`} action={<Link href="/goals" className="text-[13px] text-brand hover:underline">Goals</Link>}>
      <ul className="space-y-3.5">
        {goals.map((g) => (
          <li key={g.id}>
            <div className="flex items-center justify-between gap-3"><Link href={`/goals/${g.id}`} className="text-[13.5px] truncate hover:text-brand">{g.title}</Link><span className="text-[12px] text-muted tabular-nums">{g.progress}%</span></div>
            <Progress value={g.progress} tone={g.status === "AT_RISK" ? "bad" : g.status === "COMPLETED" ? "ok" : "brand"} className="mt-1.5" />
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}

