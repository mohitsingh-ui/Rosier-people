import Link from "next/link";
import { UserPlus, UserMinus, Plus, LogOut } from "lucide-react";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/auth/viewer";
import { addDays, fmtDate, isoOf, today } from "@/lib/dates";
import { PageHeader, Section } from "@/components/ui/card";
import { Tabs, EmptyState, Progress } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/action-button";
import { InitiateExitForm, ResignForm } from "@/components/lifecycle/forms";
import { startOnboarding, withdrawResignation } from "@/server/lifecycle";

export const metadata = { title: "Onboarding & exits" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const v = await requireViewer();
  const sp = await searchParams;
  const onb = can(v, "onboarding.manage"), off = can(v, "offboarding.manage");
  const tabs = [...(onb ? [{ key: "onboarding", label: "Onboarding" }] : []), ...(off ? [{ key: "exits", label: "Exits" }] : []), { key: "me", label: "My journey" }];
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : tabs[0].key;
  return (
    <>
      <PageHeader title="Onboarding & exits" description="Every joiner gets a checklist; every exit gets a clean handover." />
      <Tabs tabs={tabs} active={tab} base="/onboarding" />
      <div className="pt-5">{tab === "onboarding" ? <Onboardings /> : tab === "exits" ? <Exits /> : <Mine />}</div>
    </>
  );

  async function Onboardings() {
    const [list, waiting] = await Promise.all([
      db.onboarding.findMany({ include: { employee: { include: { designation: true, department: true, manager: true } }, tasks: { select: { status: true, dueDate: true, requiresValidation: true, validatedAt: true } } }, orderBy: [{ status: "asc" }, { startDate: "desc" }] }),
      db.employee.findMany({ where: { status: { in: ["PREBOARDING", "PROBATION"] }, onboarding: null } }),
    ]);
    return (
      <div className="space-y-5">
        {waiting.length > 0 && (
          <div className="card p-4 flex flex-wrap items-center gap-3"><span className="text-[13.5px] flex-1">{waiting.length} new joiner{waiting.length > 1 ? "s" : ""} without a checklist:</span>
            {waiting.map((e) => <ActionButton key={e.id} action={startOnboarding} payload={{ employeeId: e.id }} variant="subtle">Start for {e.firstName}</ActionButton>)}</div>
        )}
        {list.length === 0 ? <div className="card"><EmptyState icon={UserPlus} title="No onboarding yet" body="Add an employee with status Preboarding and their checklist is created automatically." /></div> : (
          <ul className="grid md:grid-cols-2 gap-4">{list.map((o) => {
            const done = o.tasks.filter((t) => t.status === "DONE" || t.status === "SKIPPED").length;
            const overdue = o.tasks.filter((t) => t.status !== "DONE" && t.status !== "SKIPPED" && t.dueDate && t.dueDate < today()).length;
            const toValidate = o.tasks.filter((t) => t.requiresValidation && t.status === "DONE" && !t.validatedAt).length;
            return (
              <li key={o.id}><Link href={`/onboarding/${o.employeeId}`} className="card block p-5 hover:border-line-2">
                <div className="flex items-center gap-3"><EmployeeAvatar employee={o.employee} size={42} /><div className="flex-1 min-w-0"><div className="font-semibold">{o.employee.firstName} {o.employee.lastName}</div><div className="text-[12.5px] text-muted truncate">{o.employee.designation?.name} · {o.employee.department?.name}</div></div><StatusBadge status={o.status === "COMPLETED" ? "COMPLETED" : o.employee.status} /></div>
                <div className="flex items-center gap-3 mt-4"><Progress value={(done / Math.max(1, o.tasks.length)) * 100} tone={o.status === "COMPLETED" ? "ok" : "brand"} /><span className="text-[12px] text-muted shrink-0 tabular-nums">{done}/{o.tasks.length}</span></div>
                <div className="flex flex-wrap gap-2 mt-3 text-[12px] text-muted"><span>Joins {fmtDate(o.employee.joiningDate)}</span>{o.employee.manager && <span>· Manager {o.employee.manager.firstName}</span>}{overdue > 0 && <Badge tone="bad">{overdue} overdue</Badge>}{toValidate > 0 && <Badge tone="warn">{toValidate} to validate</Badge>}</div>
              </Link></li>
            );
          })}</ul>
        )}
      </div>
    );
  }

  async function Exits() {
    const [list, people] = await Promise.all([
      db.offboarding.findMany({ include: { employee: { include: { designation: true, department: true } }, tasks: { select: { status: true } } }, orderBy: { resignationDate: "desc" } }),
      db.employee.findMany({ where: { status: { in: ["ACTIVE", "PROBATION"] } }, orderBy: { firstName: "asc" } }),
    ]);
    const active = list.filter((o) => !["EXITED", "WITHDRAWN", "REJECTED"].includes(o.stage));
    const closed = list.filter((o) => ["EXITED", "WITHDRAWN", "REJECTED"].includes(o.stage));
    const row = (o: (typeof list)[number]) => {
      const done = o.tasks.filter((t) => ["DONE", "SKIPPED"].includes(t.status)).length;
      return (
        <li key={o.id}><Link href={`/onboarding/exit/${o.id}`} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3.5 hover:bg-soft/50">
          <span className="flex items-center gap-3 flex-1 min-w-0"><EmployeeAvatar employee={o.employee} size={36} /><span className="min-w-0"><span className="block font-medium">{o.employee.firstName} {o.employee.lastName}</span><span className="block text-[12px] text-muted truncate">{o.employee.designation?.name} · {o.exitType.toLowerCase().replace("_", " ")} · resigned {fmtDate(o.resignationDate)}</span></span></span>
          <span className="text-[12.5px] text-muted">Last day {fmtDate(o.lastWorkingDay ?? o.requestedLastDay)}</span>
          <span className="text-[12.5px] text-muted tabular-nums w-20">{done}/{o.tasks.length} tasks</span>
          <StatusBadge status={o.stage} />
        </Link></li>
      );
    };
    return (
      <div className="space-y-5">
        <div className="flex justify-end"><Modal title="Start an exit" trigger={<Button variant="secondary"><Plus className="size-4" />Start an exit</Button>}><InitiateExitForm people={people.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))} /></Modal></div>
        <section className="card"><h2 className="px-5 py-3 border-b border-line text-[14.5px] font-semibold">In progress ({active.length})</h2>{active.length ? <ul className="divide-y divide-line">{active.map(row)}</ul> : <EmptyState compact icon={UserMinus} title="No exits in progress" />}</section>
        {closed.length > 0 && <section className="card"><h2 className="px-5 py-3 border-b border-line text-[14.5px] font-semibold">Closed</h2><ul className="divide-y divide-line">{closed.map(row)}</ul></section>}
      </div>
    );
  }

  async function Mine() {
    if (!v.employeeId) return <EmptyState title="No employee record" />;
    const [myOnb, myTasks, exit] = await Promise.all([
      db.onboarding.findUnique({ where: { employeeId: v.employeeId }, include: { tasks: { orderBy: { order: "asc" } } } }),
      db.onboardingTask.findMany({ where: { assigneeId: v.employeeId, status: { notIn: ["DONE", "SKIPPED"] }, onboarding: { employeeId: { not: v.employeeId } } }, include: { onboarding: { include: { employee: true } } } }),
      db.offboarding.findUnique({ where: { employeeId: v.employeeId } }),
    ]);
    const activeExit = exit && !["WITHDRAWN", "REJECTED"].includes(exit.stage);
    return (
      <div className="grid lg:grid-cols-2 gap-6">
        {myOnb && (
          <Section title="Your onboarding" action={<Link href={`/onboarding/${v.employeeId}`} className="text-[13px] text-brand hover:underline">Open checklist</Link>}>
            <Progress value={(myOnb.tasks.filter((t) => t.status === "DONE").length / Math.max(1, myOnb.tasks.length)) * 100} />
            <ul className="mt-4 space-y-2 text-[13.5px]">{myOnb.tasks.filter((t) => t.assigneeId === v.employeeId).map((t) => <li key={t.id} className="flex justify-between gap-3"><span>{t.title}</span><StatusBadge status={t.status} /></li>)}</ul>
          </Section>
        )}
        {myTasks.length > 0 && (
          <Section title="Tasks for other people's onboarding">
            <ul className="space-y-2.5 text-[13.5px]">{myTasks.map((t) => <li key={t.id}><Link href={`/onboarding/${t.onboarding.employeeId}`} className="flex justify-between gap-3 hover:text-brand"><span>{t.title} <span className="text-muted">· {t.onboarding.employee.firstName}</span></span><span className="text-muted text-[12.5px]">{t.dueDate ? fmtDate(t.dueDate, "d MMM") : ""}</span></Link></li>)}</ul>
          </Section>
        )}
        <Section title="Leaving Rosier">
          {activeExit ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2"><StatusBadge status={exit!.stage} /><span className="text-[13px] text-muted">Last day {fmtDate(exit!.lastWorkingDay ?? exit!.requestedLastDay)}</span></div>
              <div className="flex gap-2"><Link href={`/onboarding/exit/${exit!.id}`} className="text-[13.5px] text-brand hover:underline">View your exit checklist</Link></div>
              {["RESIGNATION_SUBMITTED", "MANAGER_REVIEW", "HR_REVIEW", "NOTICE_PERIOD"].includes(exit!.stage) && <ActionButton action={withdrawResignation} payload={{ id: exit!.id }} variant="ghost" confirm={{ title: "Withdraw your resignation?", confirmLabel: "Withdraw" }}>Withdraw resignation</ActionButton>}
            </div>
          ) : (
            <div><p className="text-[13.5px] text-muted mb-4">Thinking of moving on? It&apos;s always worth talking to your manager or HR first. If you&apos;ve decided, submit it here.</p>
              <Modal title="Submit resignation" trigger={<Button variant="danger"><LogOut className="size-4" />Submit resignation</Button>}><ResignForm minDate={isoOf(addDays(today(), 1))} /></Modal></div>
          )}
        </Section>
      </div>
    );
  }
}
