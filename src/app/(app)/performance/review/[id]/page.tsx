import Link from "next/link";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/auth/viewer";
import { fmtDate } from "@/lib/dates";
import { PageHeader, Section } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { Progress, PermissionNotice } from "@/components/ui/misc";
import { SelfReviewForm, ManagerReviewForm } from "@/components/performance/forms";

const Stars = ({ n }: { n: number | null }) => n ? <span className="inline-flex items-center gap-0.5">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`size-4 ${i <= n ? "fill-brand-2 text-brand-2" : "text-line-2"}`} />)}<span className="ml-1.5 text-[13px] font-medium">{n}/5</span></span> : <span className="text-muted">—</span>;

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await requireViewer();
  const { id } = await params;
  const r = await db.performanceReview.findUnique({ where: { id }, include: { cycle: true, employee: { include: { designation: true } }, reviewer: true } });
  if (!r) notFound();
  const self = r.employeeId === v.employeeId;
  const mgr = !self && (r.reviewerId === v.employeeId || v.teamIds.has(r.employeeId));
  const hr = can(v, "performance.manage");
  if (!self && !mgr && !hr) notFound();
  const goals = await db.goal.findMany({ where: { ownerId: r.employeeId, OR: [{ cycleId: r.cycleId }, { endDate: { gte: r.cycle.startDate, lte: r.cycle.endDate } }] } });
  const showManager = !self || r.status === "COMPLETED";
  return (
    <div className="max-w-4xl">
      <PageHeader eyebrow={<Link href="/performance" className="hover:text-brand">Performance</Link>} title={r.cycle.name} description={<span className="inline-flex items-center gap-2"><StatusBadge status={r.status} />{fmtDate(r.cycle.startDate)} – {fmtDate(r.cycle.endDate)}</span>} />
      <div className="card p-5 mb-6 flex items-center gap-3"><EmployeeAvatar employee={r.employee} size={44} /><div className="flex-1"><div className="font-semibold">{r.employee.firstName} {r.employee.lastName}</div><div className="text-[13px] text-muted">{r.employee.designation?.name}</div></div><div className="text-right text-[12.5px] text-muted">Reviewer<div className="text-ink font-medium text-[13.5px]">{r.reviewer ? `${r.reviewer.firstName} ${r.reviewer.lastName}` : "—"}</div></div></div>
      <div className="space-y-6">
        <Section title={`Goals this period (${goals.length})`}>
          {goals.length ? <ul className="space-y-3">{goals.map((g) => <li key={g.id}><div className="flex justify-between gap-3 text-[13.5px]"><Link href={`/goals/${g.id}`} className="hover:text-brand">{g.title}</Link><StatusBadge status={g.status} /></div><Progress value={g.progress} tone={g.status === "COMPLETED" ? "ok" : g.status === "AT_RISK" ? "bad" : "brand"} className="mt-1.5" /></li>)}</ul> : <p className="text-[13px] text-muted">No goals linked to this period.</p>}
        </Section>
        <Section title="Self review">
          {r.status === "PENDING_SELF" ? (self ? <SelfReviewForm id={r.id} /> : <p className="text-[13px] text-muted">Waiting for {r.employee.firstName} to submit.</p>) : (
            <div className="space-y-3 text-[13.5px]"><Stars n={r.selfRating} /><p className="whitespace-pre-line">{r.selfComments}</p>{r.achievements && <div><div className="eyebrow mb-1">Achievements</div><p className="whitespace-pre-line text-ink-2">{r.achievements}</p></div>}<p className="text-[12px] text-muted">Submitted {fmtDate(r.submittedAt)}</p></div>
          )}
        </Section>
        <Section title="Manager review">
          {!showManager ? <PermissionNotice>You&apos;ll see your manager&apos;s review here once it&apos;s complete.</PermissionNotice>
            : r.status === "COMPLETED" && !(hr && !self) ? (
              <div className="space-y-3 text-[13.5px]"><div className="flex flex-wrap gap-6"><div><div className="kv-k">Manager rating</div><Stars n={r.managerRating} /></div><div><div className="kv-k">Final rating</div><Stars n={r.finalRating} /></div></div><p className="whitespace-pre-line">{r.managerComments}</p>{r.developmentAreas && <div><div className="eyebrow mb-1">Development areas</div><p className="whitespace-pre-line text-ink-2">{r.developmentAreas}</p></div>}<p className="text-[12px] text-muted">Completed {fmtDate(r.completedAt)}</p></div>
            ) : (mgr || hr) ? <ManagerReviewForm id={r.id} defaults={r} /> : <p className="text-[13px] text-muted">In progress.</p>}
        </Section>
      </div>
    </div>
  );
}
