import Link from "next/link";
import { requireViewer, can, canAny } from "@/lib/auth/viewer";
import { cn } from "@/lib/utils";
import { Greeting, QuickActions, MyAttendance, LeaveBalanceCard, MyTasksCard, UpcomingCard, AnnouncementsCard, TeamTodayCard, MyGoalsCard } from "./sections";
import { HrOverview } from "./hr";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const v = await requireViewer();
  const { view } = await searchParams;
  const isHr = canAny(v, ["reports.view", "people.edit"]);
  const showOrg = isHr && view !== "me";

  const toggle = isHr ? (
    <div className="inline-flex rounded-ctl border border-line-2 bg-white p-0.5 text-[13px]" role="tablist">
      {[["org", "Organization", "/dashboard"], ["me", "My dashboard", "/dashboard?view=me"]].map(([k, l, href]) => (
        <Link key={k} href={href} role="tab" aria-selected={(k === "org") === showOrg} className={cn("px-3.5 h-8 grid place-items-center rounded-lg", (k === "org") === showOrg ? "bg-brand text-white" : "text-ink-2 hover:bg-soft")}>{l}</Link>
      ))}
    </div>
  ) : null;

  if (showOrg) {
    return (
      <>
        <Greeting v={v} right={toggle} />
        <HrOverview v={v} />
      </>
    );
  }

  return (
    <>
      <Greeting v={v} right={toggle} />
      <div className="space-y-6">
        <QuickActions v={v} />
        {can(v, "team.view") && v.directReportIds.size > 0 && <TeamTodayCard v={v} />}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="space-y-6">
            <MyAttendance v={v} />
            <LeaveBalanceCard v={v} />
          </div>
          <div className="space-y-6">
            <MyTasksCard v={v} />
            <MyGoalsCard v={v} />
          </div>
          <div className="space-y-6">
            <UpcomingCard />
            <AnnouncementsCard v={v} />
          </div>
        </div>
      </div>
    </>
  );
}
