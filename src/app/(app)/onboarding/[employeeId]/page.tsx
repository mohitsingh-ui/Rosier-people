import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Paperclip, ShieldCheck, UserCog } from "lucide-react";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/auth/viewer";
import { fmtDate, today } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/action-button";
import { TaskUpdateForm, AddTaskForm, ReassignForm } from "@/components/lifecycle/forms";
import { validateOnboardingTask } from "@/server/lifecycle";

const CAT_LABEL: Record<string, string> = { HR: "HR", IT: "IT", MANAGER: "Manager", EMPLOYEE: "New joiner", ADMIN: "Admin" };

export default async function OnboardingDetail({ params }: { params: Promise<{ employeeId: string }> }) {
  const v = await requireViewer();
  const { employeeId } = await params;
  const o = await db.onboarding.findUnique({ where: { employeeId }, include: { employee: { include: { designation: true, department: true, manager: true, location: true } }, tasks: { include: { assignee: true }, orderBy: [{ order: "asc" }] } } });
  if (!o) notFound();
  const hr = can(v, "onboarding.manage");
  const involved = hr || o.employeeId === v.employeeId || v.teamIds.has(o.employeeId) || o.tasks.some((t) => t.assigneeId === v.employeeId);
  if (!involved) notFound();
  const people = hr ? await db.employee.findMany({ where: { status: { in: ["ACTIVE", "PROBATION", "PREBOARDING"] } }, orderBy: { firstName: "asc" } }) : [];
  const opts = people.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }));
  const done = o.tasks.filter((t) => t.status === "DONE" || t.status === "SKIPPED").length;
  const groups = ["HR", "IT", "MANAGER", "ADMIN", "EMPLOYEE"].filter((g) => o.tasks.some((t) => t.category === g));
  const e = o.employee;
  return (
    <>
      <PageHeader eyebrow={<Link href="/onboarding" className="hover:text-brand">Onboarding</Link>} title={`${e.firstName}'s onboarding`}
        actions={hr ? <Modal title="Add a task" trigger={<Button variant="secondary"><Plus className="size-4" />Add task</Button>}><AddTaskForm onboardingId={o.id} people={opts} /></Modal> : null} />
      <div className="card p-5 mb-6 flex flex-col md:flex-row md:items-center gap-5">
        <div className="flex items-center gap-3 flex-1"><EmployeeAvatar employee={e} size={52} /><div><Link href={`/people/${e.id}`} className="font-semibold text-[16px] hover:text-brand">{e.firstName} {e.lastName}</Link><div className="text-[13px] text-muted">{e.designation?.name} · {e.department?.name} · {e.location?.name}</div><div className="text-[12.5px] text-muted mt-0.5">Joins {fmtDate(e.joiningDate)}{e.manager ? ` · reports to ${e.manager.firstName} ${e.manager.lastName}` : ""}</div></div></div>
        <div className="md:w-72"><div className="flex justify-between text-[13px] mb-1.5"><span className="text-muted">{done} of {o.tasks.length} done</span><StatusBadge status={o.status === "COMPLETED" ? "COMPLETED" : e.status} /></div><Progress value={(done / Math.max(1, o.tasks.length)) * 100} tone={o.status === "COMPLETED" ? "ok" : "brand"} /><div className="text-[12px] text-muted mt-1.5">Target {fmtDate(o.targetDate)}</div></div>
      </div>
      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g} className="card">
            <h2 className="px-5 py-3 border-b border-line text-[14px] font-semibold">{CAT_LABEL[g]}</h2>
            <ul className="divide-y divide-line">{o.tasks.filter((t) => t.category === g).map((t) => {
              const mine = t.assigneeId === v.employeeId;
              const overdue = t.dueDate && t.dueDate < today() && !["DONE", "SKIPPED"].includes(t.status);
              const needsValidation = t.requiresValidation && t.status === "DONE" && !t.validatedAt;
              return (
                <li key={t.id} className={cn("px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3", t.status === "DONE" && "bg-soft/30")}>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className={cn("font-medium text-[14px]", t.status === "DONE" && "text-muted line-through decoration-line-2")}>{t.title}</span>{t.requiresValidation && <Badge tone={t.validatedAt ? "ok" : "neutral"}><ShieldCheck className="size-3" />{t.validatedAt ? "Validated" : "Needs HR check"}</Badge>}{mine && <Badge tone="brand">You</Badge>}</div>
                    <div className="text-[12.5px] text-muted mt-0.5 flex flex-wrap gap-x-3">{t.assignee ? <span className="inline-flex items-center gap-1.5"><EmployeeAvatar employee={t.assignee} size={16} />{t.assignee.firstName} {t.assignee.lastName}</span> : <span>Unassigned</span>}{t.dueDate && <span className={overdue ? "text-bad" : ""}>{overdue ? "Overdue · " : "Due "}{fmtDate(t.dueDate, "d MMM")}</span>}{t.completedAt && <span>Done {fmtDate(t.completedAt, "d MMM")}</span>}</div>
                    {t.comments && <p className="text-[12.5px] text-ink-2 mt-1 whitespace-pre-line">{t.comments}</p>}
                    {t.attachmentKey && <a href={`/api/attachments/onboarding/${t.id}`} className="inline-flex items-center gap-1 text-[12.5px] text-brand mt-1 hover:underline"><Paperclip className="size-3" />Attachment</a>}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={t.status} />
                    {hr && needsValidation && <><ActionButton action={validateOnboardingTask} payload={{ id: t.id, decision: "APPROVED" }} variant="subtle">Validate</ActionButton><ActionButton action={validateOnboardingTask} payload={{ id: t.id, decision: "REJECTED" }} variant="ghost" confirm={{ title: "Send back?", confirmLabel: "Send back", note: { label: "What's missing?", required: true } }}>Send back</ActionButton></>}
                    {(hr || mine) && <Modal title={t.title} trigger={<Button variant="secondary" size="sm">Update</Button>}><TaskUpdateForm id={t.id} status={t.status} comments={t.comments} hr={hr} /></Modal>}
                    {hr && <Modal title="Reassign task" trigger={<Button variant="ghost" size="iconSm" aria-label="Reassign"><UserCog className="size-4" /></Button>}><ReassignForm id={t.id} people={opts} current={t.assigneeId} /></Modal>}
                  </div>
                </li>
              );
            })}</ul>
          </section>
        ))}
      </div>
    </>
  );
}
