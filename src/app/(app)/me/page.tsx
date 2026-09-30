import Link from "next/link";
import { User, FileText, Clock3, Plane, Wallet, Receipt, Laptop, Star, Target, LifeBuoy, Megaphone, BookOpen, ListChecks, KeyRound } from "lucide-react";
import { requireViewer } from "@/lib/auth/viewer";
import { db } from "@/lib/db";
import { fmtDate, today } from "@/lib/dates";
import { EmployeeProfile } from "@/components/people/profile";
import { Section } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/action-button";
import { EmptyState } from "@/components/ui/misc";
import { updateTask } from "@/server/people";

export const metadata = { title: "My Space" };

const TILES = [
  { href: "/me?tab=overview", label: "Profile", Icon: User }, { href: "/documents", label: "Documents", Icon: FileText }, { href: "/attendance", label: "Attendance", Icon: Clock3 },
  { href: "/leave", label: "Leave", Icon: Plane }, { href: "/payroll", label: "Payroll", Icon: Wallet }, { href: "/expenses", label: "Expenses", Icon: Receipt },
  { href: "/assets", label: "Assets", Icon: Laptop }, { href: "/performance", label: "Performance", Icon: Star }, { href: "/goals", label: "Goals", Icon: Target },
  { href: "/helpdesk", label: "Requests & helpdesk", Icon: LifeBuoy }, { href: "/announcements", label: "Announcements", Icon: Megaphone }, { href: "/me/policies", label: "Policies", Icon: BookOpen },
  { href: "/me/security", label: "Password & sessions", Icon: KeyRound },
];

export default async function MySpace({ searchParams }: { searchParams: Promise<{ tab?: string; month?: string }> }) {
  const v = await requireViewer();
  const sp = await searchParams;
  if (!v.employeeId) return <EmptyState icon={User} title="Your login isn't linked to an employee profile" body="Ask HR to link your account." />;
  const tasks = await db.task.findMany({ where: { assigneeId: v.employeeId, status: { not: "DONE" } }, include: { createdBy: true }, orderBy: { dueDate: "asc" } });
  return (
    <div className="space-y-6">
      {!sp.tab && (
        <>
          <div>
            <p className="eyebrow mb-1">My Space</p>
            <h1 className="text-[22px]">Everything about you at Rosier</h1>
          </div>
          <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {TILES.map(({ href, label, Icon }) => (
              <li key={href}><Link href={href} className="card flex flex-col items-center gap-2 py-4 px-2 text-center hover:border-line-2 hover:bg-brand-50/40 h-full">
                <span className="size-10 rounded-full bg-brand-50 text-brand grid place-items-center"><Icon className="size-[18px]" /></span>
                <span className="text-[12.5px] text-ink-2 leading-tight">{label}</span>
              </Link></li>
            ))}
          </ul>
          <div id="tasks">
            <Section title="My tasks" action={<ListChecks className="size-4 text-muted" />}>
              {tasks.length === 0 ? <p className="text-[13px] text-muted">No open tasks from your manager.</p> : (
                <ul className="divide-y divide-line -my-2">{tasks.map((t) => (
                  <li key={t.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <div className="flex-1 min-w-0"><div className="font-medium text-[13.5px]">{t.title}</div><div className="text-[12px] text-muted">From {t.createdBy.firstName} {t.dueDate && <span className={t.dueDate < today() ? "text-bad" : ""}>· Due {fmtDate(t.dueDate, "d MMM")}</span>}</div></div>
                    <StatusBadge status={t.status} />
                    <div className="flex gap-2">
                      {t.status === "PENDING" && <ActionButton action={updateTask} payload={{ id: t.id, status: "IN_PROGRESS" }} success="Started">Start</ActionButton>}
                      <ActionButton action={updateTask} payload={{ id: t.id, status: "DONE" }} variant="subtle" success="Done">Mark done</ActionButton>
                    </div>
                  </li>
                ))}</ul>
              )}
            </Section>
          </div>
        </>
      )}
      <EmployeeProfile v={v} id={v.employeeId} tab={sp.tab ?? "overview"} month={sp.month} base="/me" />
    </div>
  );
}
