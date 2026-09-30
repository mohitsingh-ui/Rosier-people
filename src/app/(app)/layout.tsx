import { requireViewer, can } from "@/lib/auth/viewer";
import { db } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/permissions";
import { navFor } from "@/components/layout/nav";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { CommandPalette } from "@/components/layout/command-palette";
import { Assist } from "@/components/layout/assist";
import "@/server/workflows"; // registers workflow definitions

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const v = await requireViewer();
  const [unread, lifecycle] = await Promise.all([
    db.notification.count({ where: { userId: v.userId, readAt: null } }),
    v.employeeId ? db.employee.findUnique({ where: { id: v.employeeId }, select: { onboarding: { select: { id: true } }, offboarding: { select: { id: true } } } }) : null,
  ]);
  const nav = navFor(v, { hasOwnLifecycle: !!(lifecycle?.onboarding || lifecycle?.offboarding), hasTeam: v.teamIds.size > 0 });
  const e = v.employee;
  const me = { name: e ? `${e.firstName} ${e.lastName}` : v.email, firstName: e?.firstName ?? "R", lastName: e?.lastName ?? "P", photoUrl: e?.photoUrl ?? null, id: e?.id, designation: e?.designation ?? null, role: ROLE_LABELS[v.role], email: v.email };

  const suggestions = ["How many leaves do I have?", "Who is my reporting manager?", "When is my next holiday?", "Show my payslip"];
  if (v.teamIds.size) suggestions.push("Who is on leave today?", "Who hasn't checked in?", "Show my team's pending approvals");
  if (can(v, "reports.view")) suggestions.push("How many employees are in Marketing?", "Which documents are expiring this month?", "Show new joiners this month");

  return (
    <div className="flex min-h-dvh">
      <Sidebar items={nav} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar me={me} unread={unread} />
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 pb-28 lg:pb-10 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
      <MobileNav items={nav} />
      <CommandPalette nav={nav} />
      <Assist suggestions={suggestions.slice(0, 7)} firstName={me.firstName} />
    </div>
  );
}
