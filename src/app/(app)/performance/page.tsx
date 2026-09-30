import Link from "next/link";
import { Plus, Star, MessageSquareHeart, Pencil } from "lucide-react";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/auth/viewer";
import { fmtDate, isoOf } from "@/lib/dates";
import { humanize } from "@/lib/utils";
import { PageHeader, Section, MetricCard } from "@/components/ui/card";
import { Tabs, EmptyState, TableWrap, Progress } from "@/components/ui/misc";
import { Button, ButtonLink } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/action-button";
import { FeedbackForm, CycleForm } from "@/components/performance/forms";
import { setCycleStatus } from "@/server/performance";

export const metadata = { title: "Performance" };

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const v = await requireViewer();
  const sp = await searchParams;
  const manage = can(v, "performance.manage");
  const team = can(v, "performance.review_team") && v.teamIds.size > 0;
  const tabs = [...(v.employeeId ? [{ key: "mine", label: "My reviews" }] : []), ...(team ? [{ key: "team", label: "My team" }] : []), { key: "feedback", label: "Feedback" }, ...(manage ? [{ key: "cycles", label: "Cycles" }] : [])];
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : tabs[0].key;
  const people = await db.employee.findMany({ where: { status: { in: ["ACTIVE", "PROBATION", "NOTICE_PERIOD"] }, NOT: { id: v.employeeId ?? "" } }, orderBy: { firstName: "asc" } });
  return (
    <>
      <PageHeader title="Performance" description="Reviews, ratings and feedback — so everyone knows how they're doing."
        actions={v.employeeId ? <Modal title="Give feedback" trigger={<Button variant="secondary"><MessageSquareHeart className="size-4" />Give feedback</Button>}><FeedbackForm people={people.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))} isManagerOf={[...v.teamIds]} /></Modal> : null} />
      <Tabs tabs={tabs} active={tab} base="/performance" />
      <div className="pt-5">{tab === "mine" ? <Mine /> : tab === "team" ? <Team /> : tab === "feedback" ? <Feedback /> : <Cycles />}</div>
    </>
  );

  async function Mine() {
    const [reviews, goals] = await Promise.all([
      db.performanceReview.findMany({ where: { employeeId: v.employeeId! }, include: { cycle: true, reviewer: true }, orderBy: { cycle: { startDate: "desc" } } }),
      db.goal.findMany({ where: { ownerId: v.employeeId!, status: { not: "CANCELLED" } } }),
    ]);
    const open = reviews.find((r) => r.status === "PENDING_SELF");
    return (
      <div className="space-y-6">
        {open && <div className="card p-5 flex flex-col sm:flex-row sm:items-center gap-3 border-brand-2/40 bg-brand-50/40"><Star className="size-5 text-brand-2" /><div className="flex-1"><div className="font-semibold">Your self review for {open.cycle.name} is open</div><div className="text-[13px] text-muted">{open.cycle.selfReviewDue ? `Due by ${fmtDate(open.cycle.selfReviewDue)}` : "Take 15 minutes to reflect on the period."}</div></div><ButtonLink href={`/performance/review/${open.id}`}>Start self review</ButtonLink></div>}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Goals" value={goals.length} href="/goals" />
          <MetricCard label="Completed" value={goals.filter((g) => g.status === "COMPLETED").length} />
          <MetricCard label="At risk" value={goals.filter((g) => g.status === "AT_RISK").length} tone={goals.some((g) => g.status === "AT_RISK") ? "bad" : undefined} />
          <MetricCard label="Last rating" value={reviews.find((r) => r.status === "COMPLETED")?.finalRating ? `${reviews.find((r) => r.status === "COMPLETED")!.finalRating}/5` : "—"} />
        </div>
        <Section title="Review history">
          {reviews.length === 0 ? <EmptyState compact title="No reviews yet" /> : <ul className="divide-y divide-line -my-2">{reviews.map((r) => (
            <li key={r.id}><Link href={`/performance/review/${r.id}`} className="py-3 flex items-center gap-3 hover:text-brand"><span className="flex-1"><span className="block font-medium">{r.cycle.name}</span><span className="text-[12.5px] text-muted">Reviewer: {r.reviewer ? `${r.reviewer.firstName} ${r.reviewer.lastName}` : "—"}</span></span>{r.status === "COMPLETED" && r.finalRating && <span className="text-[13px] font-semibold">{r.finalRating}/5</span>}<StatusBadge status={r.status} /></Link></li>
          ))}</ul>}
        </Section>
      </div>
    );
  }

  async function Team() {
    const reviews = await db.performanceReview.findMany({ where: { employeeId: { in: [...v.teamIds] }, cycle: { status: { in: ["ACTIVE", "REVIEW"] } } }, include: { employee: { include: { designation: true } }, cycle: true }, orderBy: { employee: { firstName: "asc" } } });
    const goals = await db.goal.groupBy({ by: ["ownerId", "status"], where: { ownerId: { in: [...v.teamIds] } }, _count: true });
    return reviews.length === 0 ? <div className="card"><EmptyState title="No open reviews for your team" /></div> : (
      <TableWrap><table className="tbl"><thead><tr><th>Person</th><th>Cycle</th><th>Goals</th><th>Self</th><th>Status</th><th /></tr></thead><tbody>
        {reviews.map((r) => {
          const g = goals.filter((x) => x.ownerId === r.employeeId);
          const total = g.reduce((a, x) => a + x._count, 0), done = g.find((x) => x.status === "COMPLETED")?._count ?? 0, risk = g.find((x) => x.status === "AT_RISK")?._count ?? 0;
          return (
            <tr key={r.id}><td><span className="flex items-center gap-2.5"><EmployeeAvatar employee={r.employee} size={30} /><span><span className="block font-medium">{r.employee.firstName} {r.employee.lastName}</span><span className="block text-[12px] text-muted">{r.employee.designation?.name}</span></span></span></td>
              <td className="text-[13px]">{r.cycle.name}</td><td className="w-40"><div className="flex items-center gap-2"><Progress value={total ? (done / total) * 100 : 0} /><span className="text-[12px] text-muted shrink-0">{done}/{total}</span></div>{risk > 0 && <Badge tone="bad" className="mt-1">{risk} at risk</Badge>}</td>
              <td>{r.selfRating ? `${r.selfRating}/5` : "—"}</td><td><StatusBadge status={r.status} /></td>
              <td className="text-right"><ButtonLink href={`/performance/review/${r.id}`} size="sm" variant={r.status === "PENDING_MANAGER" ? "primary" : "secondary"}>{r.status === "PENDING_MANAGER" ? "Write review" : "Open"}</ButtonLink></td></tr>
          );
        })}
      </tbody></table></TableWrap>
    );
  }

  async function Feedback() {
    const [received, given] = await Promise.all([
      v.employeeId ? db.feedback.findMany({ where: { toId: v.employeeId }, include: { from: true }, orderBy: { createdAt: "desc" } }) : [],
      v.employeeId ? db.feedback.findMany({ where: { fromId: v.employeeId }, include: { to: true }, orderBy: { createdAt: "desc" } }) : [],
    ]);
    const wall = await db.feedback.findMany({ where: { kind: "PRAISE", isPrivate: false }, include: { from: true, to: true }, orderBy: { createdAt: "desc" }, take: 12 });
    const card = (f: { id: string; body: string; kind: string; isPrivate: boolean; createdAt: Date }, p: { firstName: string; lastName: string; photoUrl: string | null; id: string }, prefix: string) => (
      <li key={f.id} className="flex gap-3"><EmployeeAvatar employee={p} size={32} /><div><div className="text-[12.5px]"><span className="text-muted">{prefix}</span> <span className="font-medium">{p.firstName} {p.lastName}</span> · <span className="text-muted">{fmtDate(f.createdAt)}</span> {f.kind === "PRAISE" ? <Badge tone="ok">Praise</Badge> : <Badge tone="info">{humanize(f.kind)}</Badge>}</div><p className="text-[13.5px] mt-0.5">{f.body}</p></div></li>
    );
    return (
      <div className="grid lg:grid-cols-3 gap-6">
        <Section title="Received">{received.length ? <ul className="space-y-4">{received.map((f) => card(f, f.from, "From"))}</ul> : <p className="text-[13px] text-muted">Nothing yet.</p>}</Section>
        <Section title="Given">{given.length ? <ul className="space-y-4">{given.map((f) => card(f, f.to, "To"))}</ul> : <p className="text-[13px] text-muted">Recognise someone today!</p>}</Section>
        <Section title="Shout-outs across Rosier">{wall.length ? <ul className="space-y-4">{wall.map((f) => <li key={f.id} className="text-[13px]"><span className="font-medium">{f.from.firstName}</span> <span className="text-muted">→</span> <span className="font-medium">{f.to.firstName}</span><p className="text-ink-2 mt-0.5">{f.body}</p></li>)}</ul> : <p className="text-[13px] text-muted">No public praise yet.</p>}</Section>
      </div>
    );
  }

  async function Cycles() {
    const cycles = await db.performanceCycle.findMany({ include: { reviews: { select: { status: true } } }, orderBy: { startDate: "desc" } });
    const next: Record<string, { to: "ACTIVE" | "REVIEW" | "CLOSED"; label: string }> = { DRAFT: { to: "ACTIVE", label: "Activate (goal setting)" }, ACTIVE: { to: "REVIEW", label: "Open reviews" }, REVIEW: { to: "CLOSED", label: "Close cycle" } };
    return (
      <div className="space-y-4">
        <div className="flex justify-end"><Modal title="New performance cycle" trigger={<Button><Plus className="size-4" />New cycle</Button>}><CycleForm /></Modal></div>
        <ul className="grid md:grid-cols-2 gap-4">{cycles.map((c) => {
          const n = c.reviews.length, done = c.reviews.filter((r) => r.status === "COMPLETED").length, self = c.reviews.filter((r) => r.status !== "PENDING_SELF").length;
          return (
            <li key={c.id} className="card p-5">
              <div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{c.name}</div><div className="text-[12.5px] text-muted">{fmtDate(c.startDate)} – {fmtDate(c.endDate)}</div></div><StatusBadge status={c.status} /></div>
              {n > 0 && <div className="mt-4 space-y-2 text-[12.5px]"><div className="flex justify-between"><span className="text-muted">Self reviews</span><span>{self}/{n}</span></div><Progress value={(self / n) * 100} /><div className="flex justify-between"><span className="text-muted">Completed</span><span>{done}/{n}</span></div><Progress value={(done / n) * 100} tone="ok" /></div>}
              <div className="flex gap-2 mt-4">
                {next[c.status] && <ActionButton action={setCycleStatus} payload={{ id: c.id, status: next[c.status].to }} variant="subtle" confirm={{ title: `${next[c.status].label}?`, body: next[c.status].to === "REVIEW" ? "Creates a review for every active employee with a manager and notifies them." : undefined, confirmLabel: next[c.status].label }}>{next[c.status].label}</ActionButton>}
                <Modal title="Edit cycle" trigger={<Button variant="ghost" size="sm"><Pencil className="size-3.5" />Edit</Button>}><CycleForm c={{ id: c.id, name: c.name, startDate: isoOf(c.startDate), endDate: isoOf(c.endDate), selfReviewDue: c.selfReviewDue ? isoOf(c.selfReviewDue) : null, managerReviewDue: c.managerReviewDue ? isoOf(c.managerReviewDue) : null }} /></Modal>
              </div>
            </li>
          );
        })}</ul>
      </div>
    );
  }
}
