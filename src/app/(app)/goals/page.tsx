import Link from "next/link";
import { Plus, Target } from "lucide-react";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/auth/viewer";
import { fmtDate, today, todayISO } from "@/lib/dates";
import { cn, humanize } from "@/lib/utils";
import { PageHeader, MetricCard } from "@/components/ui/card";
import { Tabs, EmptyState, Progress } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { FilterDropdown } from "@/components/ui/filters";
import { GoalForm } from "@/components/performance/forms";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Goals" };

export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ scope?: string; status?: string; owner?: string; department?: string }> }) {
  const v = await requireViewer();
  const sp = await searchParams;
  const all = can(v, "goals.view_all");
  const scopes = [...(v.employeeId ? [{ key: "mine", label: "My goals" }] : []), ...(v.teamIds.size ? [{ key: "team", label: "My team" }] : []), ...(all ? [{ key: "all", label: "Company" }] : [])];
  const scope = sp.owner ? "owner" : scopes.some((s) => s.key === sp.scope) ? sp.scope! : scopes[0]?.key ?? "mine";
  // An owner filter is honoured only if the viewer may see that person's goals
  const ownerAllowed = sp.owner && (sp.owner === v.employeeId || v.teamIds.has(sp.owner) || all);
  const ownerWhere: Prisma.GoalWhereInput = scope === "owner" ? { ownerId: ownerAllowed ? sp.owner : "__none__" } : scope === "team" ? { ownerId: { in: [...v.teamIds] } } : scope === "all" ? {} : { ownerId: v.employeeId ?? "__none__" };
  const where: Prisma.GoalWhereInput = { ...ownerWhere, ...(sp.status === "OVERDUE" ? { endDate: { lt: today() }, status: { notIn: ["COMPLETED", "CANCELLED"] } } : sp.status ? { status: sp.status as never } : { status: { not: "CANCELLED" } }), ...(sp.department ? { departmentId: sp.department } : {}) };
  const [goals, base, owners, cycles, depts] = await Promise.all([
    db.goal.findMany({ where, include: { owner: true, milestones: true, _count: { select: { updates: true } } }, orderBy: [{ endDate: "asc" }] }),
    db.goal.findMany({ where: { ...ownerWhere }, select: { status: true, endDate: true } }),
    db.employee.findMany({ where: { id: { in: [v.employeeId ?? "", ...(all ? [] : [...v.teamIds])] }, ...(all ? {} : {}) }, orderBy: { firstName: "asc" } }),
    db.performanceCycle.findMany({ where: { status: { not: "CLOSED" } } }),
    all ? db.department.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const ownerOpts = all ? (await db.employee.findMany({ where: { status: { in: ["ACTIVE", "PROBATION", "NOTICE_PERIOD"] } }, orderBy: { firstName: "asc" } })).map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName}` })) : owners.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }));
  const overdue = base.filter((g) => g.endDate < today() && !["COMPLETED", "CANCELLED"].includes(g.status)).length;
  const c = (s: string) => base.filter((g) => g.status === s).length;
  return (
    <>
      <PageHeader title="Goals" description="What we're each working towards, with progress everyone can follow."
        actions={ownerOpts.length ? <Modal size="lg" title="New goal" trigger={<Button><Plus className="size-4" />New goal</Button>}><GoalForm owners={ownerOpts} defaultOwner={v.employeeId ?? undefined} cycles={cycles.map((x) => ({ value: x.id, label: x.name }))} today={todayISO()} /></Modal> : null} />
      {scopes.length > 1 && scope !== "owner" && <Tabs tabs={scopes} active={scope} base="/goals" param="scope" />}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 my-5">
        <MetricCard label="Completed" value={c("COMPLETED")} href={`/goals?scope=${scope}&status=COMPLETED`} />
        <MetricCard label="In progress" value={c("IN_PROGRESS") + c("NOT_STARTED")} href={`/goals?scope=${scope}&status=IN_PROGRESS`} />
        <MetricCard label="At risk" value={c("AT_RISK")} tone={c("AT_RISK") ? "bad" : undefined} href={`/goals?scope=${scope}&status=AT_RISK`} />
        <MetricCard label="Overdue" value={overdue} tone={overdue ? "warn" : undefined} href={`/goals?scope=${scope}&status=OVERDUE`} />
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <FilterDropdown param="status" label="Status" options={[...["NOT_STARTED", "IN_PROGRESS", "AT_RISK", "COMPLETED", "CANCELLED"].map((s) => ({ value: s, label: humanize(s) })), { value: "OVERDUE", label: "Overdue" }]} />
        {all && <FilterDropdown param="department" label="Department" options={depts.map((d) => ({ value: d.id, label: d.name }))} />}
      </div>
      {goals.length === 0 ? <div className="card"><EmptyState icon={Target} title="No goals here yet" body="Good goals are specific and measurable. Start with one." /></div> : (
        <ul className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{goals.map((g) => {
          const late = g.endDate < today() && !["COMPLETED", "CANCELLED"].includes(g.status);
          return (
            <li key={g.id}><Link href={`/goals/${g.id}`} className="card block p-5 h-full hover:border-line-2">
              <div className="flex items-center gap-2 mb-2"><StatusBadge status={g.status} /><Badge tone={g.priority === "HIGH" ? "bad" : g.priority === "MEDIUM" ? "warn" : "neutral"}>{humanize(g.priority)}</Badge><span className="text-[11.5px] text-muted ml-auto">{humanize(g.period)}</span></div>
              <div className="font-semibold leading-snug">{g.title}</div>
              <div className="flex items-center gap-2 mt-4"><Progress value={g.progress} tone={g.status === "AT_RISK" ? "bad" : g.status === "COMPLETED" ? "ok" : "brand"} /><span className="text-[12px] font-medium tabular-nums w-9 text-right">{g.progress}%</span></div>
              <div className="flex items-center justify-between mt-4 text-[12px] text-muted">
                <span className="flex items-center gap-1.5"><EmployeeAvatar employee={g.owner} size={20} />{g.owner.firstName}</span>
                <span className={cn(late && "text-bad")}>{late ? "Overdue · " : "Due "}{fmtDate(g.endDate, "d MMM")} · {g.milestones.filter((m) => m.done).length}/{g.milestones.length} milestones</span>
              </div>
            </Link></li>
          );
        })}</ul>
      )}
    </>
  );
}
