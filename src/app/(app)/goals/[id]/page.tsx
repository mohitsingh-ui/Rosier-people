import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Check, Circle, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/auth/viewer";
import { fmtDate, fmtDateTime, isoOf, todayISO } from "@/lib/dates";
import { cn, humanize } from "@/lib/utils";
import { PageHeader, Section, KV } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/misc";
import { ActionButton } from "@/components/ui/action-button";
import { GoalForm, ProgressForm, CommentForm, MilestoneForm } from "@/components/performance/forms";
import { toggleMilestone, deleteGoal } from "@/server/performance";

export default async function GoalPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await requireViewer();
  const { id } = await params;
  const g = await db.goal.findUnique({ where: { id }, include: { owner: { include: { designation: true } }, manager: true, department: true, cycle: true, milestones: { orderBy: [{ dueDate: "asc" }, { title: "asc" }] }, updates: { include: { author: true }, orderBy: { createdAt: "desc" } } } });
  if (!g) notFound();
  const edit = g.ownerId === v.employeeId || v.teamIds.has(g.ownerId) || can(v, "goals.view_all");
  if (!edit) notFound();
  const cycles = await db.performanceCycle.findMany({ where: { status: { not: "CLOSED" } } });
  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow={<Link href="/goals" className="hover:text-brand">Goals</Link>} title={g.title}
        description={<span className="inline-flex flex-wrap items-center gap-2"><StatusBadge status={g.status} /><Badge>{humanize(g.kind)}</Badge><Badge tone={g.priority === "HIGH" ? "bad" : "neutral"}>{humanize(g.priority)} priority</Badge></span>}
        actions={<>
          <Modal size="lg" title="Edit goal" trigger={<Button variant="secondary"><Pencil className="size-4" />Edit</Button>}><GoalForm owners={[{ value: g.ownerId, label: `${g.owner.firstName} ${g.owner.lastName}` }]} cycles={cycles.map((c) => ({ value: c.id, label: c.name }))} today={todayISO()} g={{ ...g, startDate: isoOf(g.startDate), endDate: isoOf(g.endDate) }} /></Modal>
          <ActionButton action={deleteGoal} payload={{ id: g.id }} size="md" variant="ghost" redirectTo="/goals" confirm={{ title: "Delete this goal?", danger: true, confirmLabel: "Delete" }}><Trash2 className="size-4" /></ActionButton>
        </>} />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Section title="Progress">
            <div className="flex items-center gap-4 mb-5"><span className="text-[32px] font-semibold tabular-nums">{g.progress}%</span><Progress value={g.progress} tone={g.status === "AT_RISK" ? "bad" : g.status === "COMPLETED" ? "ok" : "brand"} className="h-2.5" /></div>
            {g.description && <p className="text-[13.5px] text-ink-2 whitespace-pre-line mb-5">{g.description}</p>}
            <ProgressForm id={g.id} progress={g.progress} status={g.status} />
          </Section>
          <Section title="Updates & comments">
            <div className="mb-5"><CommentForm id={g.id} /></div>
            {g.updates.length === 0 ? <p className="text-[13px] text-muted">No updates yet.</p> : <ul className="space-y-4">{g.updates.map((u) => (
              <li key={u.id} className="flex gap-3"><EmployeeAvatar employee={u.author} size={30} /><div className="min-w-0"><div className="text-[12.5px]"><span className="font-medium">{u.author.firstName} {u.author.lastName}</span> <span className="text-muted">· {fmtDateTime(u.createdAt)}</span></div>
                {(u.progress != null || u.status) && <div className="text-[12.5px] text-muted mt-0.5">{u.progress != null && <>Progress → <span className="text-ink font-medium">{u.progress}%</span></>}{u.status && <> · <StatusBadge status={u.status} /></>}</div>}
                {u.comment && <p className="text-[13.5px] mt-1 whitespace-pre-line">{u.comment}</p>}</div></li>
            ))}</ul>}
          </Section>
        </div>
        <div className="space-y-6">
          <Section title="Details">
            <dl className="space-y-3">
              <KV label="Owner" value={<Link href={`/people/${g.owner.id}`} className="inline-flex items-center gap-2 hover:text-brand"><EmployeeAvatar employee={g.owner} size={22} />{g.owner.firstName} {g.owner.lastName}</Link>} />
              <KV label="Manager" value={g.manager ? `${g.manager.firstName} ${g.manager.lastName}` : "—"} />
              <KV label="Department" value={g.department?.name} />
              <KV label="Timeline" value={`${fmtDate(g.startDate)} – ${fmtDate(g.endDate)}`} />
              <KV label="Period" value={humanize(g.period)} />
              <KV label="Performance cycle" value={g.cycle?.name ?? "—"} />
            </dl>
          </Section>
          <Section title={`Milestones (${g.milestones.filter((m) => m.done).length}/${g.milestones.length})`}>
            <ul className="space-y-1 mb-4">{g.milestones.map((m) => (
              <li key={m.id}><ActionButton action={toggleMilestone} payload={{ id: m.id }} variant="ghost" className="w-full justify-start h-auto py-1.5 px-2" success={m.done ? "Reopened" : "Done"}>
                <span className={cn("size-5 rounded-full grid place-items-center shrink-0", m.done ? "bg-ok text-white" : "border border-line-2 text-transparent")}>{m.done ? <Check className="size-3" /> : <Circle className="size-3" />}</span>
                <span className={cn("text-left text-[13.5px] flex-1 whitespace-normal", m.done && "line-through text-muted")}>{m.title}</span>{m.dueDate && <span className="text-[11.5px] text-muted">{fmtDate(m.dueDate, "d MMM")}</span>}
              </ActionButton></li>
            ))}</ul>
            <MilestoneForm goalId={g.id} />
          </Section>
        </div>
      </div>
    </div>
  );
}
