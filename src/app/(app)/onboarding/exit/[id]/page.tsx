import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, FileSignature } from "lucide-react";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/auth/viewer";
import { fmtDate, isoOf } from "@/lib/dates";
import { cn, humanize, inr } from "@/lib/utils";
import { PageHeader, Section, KV } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/action-button";
import { ExitReviewForm, ExitTaskForm, SettlementForm, InterviewForm } from "@/components/lifecycle/forms";
import { advanceExit } from "@/server/lifecycle";

const FLOW = [
  ["RESIGNATION_SUBMITTED", "Submitted"], ["MANAGER_REVIEW", "Manager review"], ["HR_REVIEW", "HR review"], ["NOTICE_PERIOD", "Notice period"],
  ["CLEARANCE", "Clearance"], ["FINAL_SETTLEMENT", "Final settlement"], ["EXITED", "Exited"],
] as const;

export default async function ExitPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await requireViewer();
  const { id } = await params;
  const o = await db.offboarding.findUnique({ where: { id }, include: { employee: { include: { designation: true, department: true, manager: true } }, tasks: { include: { assignee: true }, orderBy: { order: "asc" } } } });
  if (!o) notFound();
  const hr = can(v, "offboarding.manage");
  const self = o.employeeId === v.employeeId;
  const mgr = v.teamIds.has(o.employeeId);
  if (!hr && !self && !mgr && !o.tasks.some((t) => t.assigneeId === v.employeeId)) notFound();
  const idx = FLOW.findIndex(([k]) => k === o.stage);
  const e = o.employee;
  const assets = await db.asset.findMany({ where: { holderId: e.id } });
  const canReview = (mgr && o.stage === "MANAGER_REVIEW") || (hr && ["MANAGER_REVIEW", "HR_REVIEW", "RESIGNATION_SUBMITTED"].includes(o.stage));

  return (
    <>
      <PageHeader eyebrow={<Link href="/onboarding?tab=exits" className="hover:text-brand">Exits</Link>} title={self ? "Your exit" : `${e.firstName} ${e.lastName}'s exit`}
        actions={<>
          {canReview && <Modal title="Review resignation" trigger={<Button>Review</Button>}><ExitReviewForm id={o.id} hr={hr} suggested={isoOf(o.lastWorkingDay ?? o.requestedLastDay)} /></Modal>}
          {hr && o.stage === "NOTICE_PERIOD" && <ActionButton action={advanceExit} payload={{ id: o.id, stage: "CLEARANCE" }} size="md" variant="primary">Start clearance</ActionButton>}
          {hr && o.stage === "CLEARANCE" && <Modal title="Full & final settlement" trigger={<Button>Record settlement</Button>}><SettlementForm id={o.id} /></Modal>}
          {hr && o.stage === "FINAL_SETTLEMENT" && <ActionButton action={advanceExit} payload={{ id: o.id, stage: "EXITED" }} size="md" variant="primary" confirm={{ title: `Mark ${e.firstName} as exited?`, body: "Their login is disabled, direct reports move to their manager, and they leave the active directory.", confirmLabel: "Mark exited" }}>Mark exited</ActionButton>}
          {hr && ["CLEARANCE", "FINAL_SETTLEMENT", "EXITED"].includes(o.stage) && <ButtonLink href={`/people/${e.id}?tab=documents`} variant="secondary"><FileSignature className="size-4" />Experience & relieving letters</ButtonLink>}
        </>} />
      {!["WITHDRAWN", "REJECTED"].includes(o.stage) ? (
        <ol className="card p-4 mb-6 flex overflow-x-auto gap-1">
          {FLOW.map(([k, label], i) => (
            <li key={k} className="flex items-center gap-2 shrink-0">
              <span className={cn("size-6 rounded-full grid place-items-center text-[11px] font-semibold", i < idx ? "bg-brand text-white" : i === idx ? "ring-2 ring-brand-2 text-brand bg-brand-50" : "bg-soft text-faint")}>{i < idx ? <Check className="size-3.5" /> : i + 1}</span>
              <span className={cn("text-[12.5px] whitespace-nowrap", i === idx ? "font-semibold text-ink" : i < idx ? "text-ink-2" : "text-faint")}>{label}</span>
              {i < FLOW.length - 1 && <span className={cn("w-6 h-px mx-1", i < idx ? "bg-brand-2" : "bg-line-2")} />}
            </li>
          ))}
        </ol>
      ) : <div className="card p-4 mb-6 text-[13.5px]"><StatusBadge status={o.stage} /> <span className="ml-2 text-muted">This exit is closed.</span></div>}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <Section title="Details">
            <div className="flex items-center gap-3 mb-4"><EmployeeAvatar employee={e} size={40} /><div><Link href={`/people/${e.id}`} className="font-medium hover:text-brand">{e.firstName} {e.lastName}</Link><div className="text-[12.5px] text-muted">{e.designation?.name} · {e.department?.name}</div></div></div>
            <dl className="grid grid-cols-2 gap-4">
              <KV label="Exit type" value={humanize(o.exitType)} /><KV label="Resigned on" value={fmtDate(o.resignationDate)} />
              <KV label="Requested last day" value={fmtDate(o.requestedLastDay)} /><KV label="Agreed last day" value={o.lastWorkingDay ? fmtDate(o.lastWorkingDay) : "—"} />
              <KV label="Notice" value={`${o.noticeDays} days`} />{(hr || self) && <KV label="Settlement" value={o.settlementAmount ? inr(o.settlementAmount) : "—"} />}
            </dl>
            <div className="mt-4 pt-4 border-t border-line space-y-2 text-[13px]">
              <p><span className="text-muted">Reason:</span> {o.reason}</p>
              {o.managerNote && <p><span className="text-muted">Manager:</span> {o.managerNote}</p>}
              {o.hrNote && (hr || self) && <p><span className="text-muted">HR:</span> {o.hrNote}</p>}
            </div>
          </Section>
          <Section title="Assets to return">
            {assets.length ? <ul className="space-y-2 text-[13.5px]">{assets.map((a) => <li key={a.id} className="flex justify-between"><span>{a.brand} {a.model}</span>{hr ? <Link href={`/assets/${a.id}`} className="text-brand text-[13px] hover:underline">Record return</Link> : <span className="text-muted text-[12.5px]">{a.tag}</span>}</li>)}</ul> : <p className="text-[13px] text-muted">Nothing outstanding.</p>}
          </Section>
        </div>
        <div className="lg:col-span-2 space-y-6">
          <section className="card">
            <h2 className="px-5 py-3 border-b border-line text-[14.5px] font-semibold">Exit checklist</h2>
            <ul className="divide-y divide-line">{o.tasks.map((t) => (
              <li key={t.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0"><div className="font-medium text-[14px]">{t.title}</div><div className="text-[12.5px] text-muted">{humanize(t.category)} · {t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : "HR"}{t.dueDate ? ` · due ${fmtDate(t.dueDate, "d MMM")}` : ""}</div>{t.note && <p className="text-[12.5px] text-ink-2 mt-1">{t.note}</p>}</div>
                <StatusBadge status={t.status} />
                {(hr || t.assigneeId === v.employeeId) && <Modal title={t.title} trigger={<Button variant="secondary" size="sm">Update</Button>}><ExitTaskForm id={t.id} status={t.status} note={t.note} /></Modal>}
              </li>
            ))}</ul>
          </section>
          {(self || hr) && <Section title="Exit interview">
            {self || hr ? <InterviewForm id={o.id} existing={o.exitInterview} /> : null}
            <p className="text-[12px] text-muted mt-2">Shared only with HR. Honest answers help us get better.</p>
          </Section>}
        </div>
      </div>
    </>
  );
}
