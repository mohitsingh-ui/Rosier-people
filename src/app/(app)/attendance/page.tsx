import Link from "next/link";
import { Home, Inbox, Pencil } from "lucide-react";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/auth/viewer";
import { addDays, currentMonth, dateOnly, fmtDate, fmtTime, isoOf, minutesToHM, today, todayISO } from "@/lib/dates";
import { PageHeader, Section, MetricCard } from "@/components/ui/card";
import { Tabs, EmptyState, TableWrap } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/action-button";
import { AttendanceWidget } from "@/components/attendance-widget";
import { AttendanceCalendar } from "@/components/attendance/calendar";
import { ApprovalCard } from "@/components/approvals/approval-card";
import { CorrectionForm, WfhForm, OverrideForm } from "@/components/attendance/forms";
import { AutoOpen } from "@/components/leave/forms";
import { FilterDropdown, DateFilter } from "@/components/ui/filters";
import { decideCorrection, decideWfh, cancelWfh } from "@/server/attendance";
import { teamToday } from "@/server/queries";

export const metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ tab?: string; month?: string; date?: string; department?: string; wfh?: string }> }) {
  const v = await requireViewer();
  const sp = await searchParams;
  const hr = can(v, "attendance.manage");
  const approver = hr || (can(v, "attendance.approve_team") && v.teamIds.size > 0);
  const scopeIds = hr ? null : [...v.teamIds];
  const pendingCount = approver ? (await db.attendanceCorrection.count({ where: { status: "PENDING", ...(scopeIds ? { employeeId: { in: scopeIds } } : {}), NOT: { employeeId: v.employeeId ?? "" } } })) + (await db.wfhRequest.count({ where: { status: "PENDING", ...(scopeIds ? { employeeId: { in: scopeIds } } : {}), NOT: { employeeId: v.employeeId ?? "" } } })) : 0;
  const tabs = [
    ...(v.employeeId ? [{ key: "mine", label: "My attendance" }] : []),
    { key: "wfh", label: "Work from home" },
    ...(approver ? [{ key: "approvals", label: "Approvals", count: pendingCount }, { key: "team", label: hr ? "Everyone" : "My team" }] : []),
  ];
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : tabs[0].key;

  return (
    <>
      <PageHeader title="Attendance" description="Check in, see your month, and request corrections or work from home."
        actions={v.employeeId ? <>
          <Modal title="Request a correction" description="For a missed or wrong check-in/out." trigger={<Button variant="secondary"><Pencil className="size-4" />Correction</Button>}><CorrectionForm today={todayISO()} /></Modal>
          <Modal title="Request work from home" trigger={<Button data-autoopen={sp.wfh ? "" : undefined}><Home className="size-4" />Request WFH</Button>}><WfhForm today={todayISO()} /></Modal>
        </> : null} />
      {sp.wfh && <AutoOpen />}
      <Tabs tabs={tabs} active={tab} base="/attendance" />
      <div className="pt-5">
        {tab === "mine" && <Mine />}
        {tab === "wfh" && <Wfh />}
        {tab === "approvals" && <Approvals />}
        {tab === "team" && <Team />}
      </div>
    </>
  );

  async function Mine() {
    const id = v.employeeId!;
    const [rec, emp, leave, corrections] = await Promise.all([
      db.attendance.findUnique({ where: { employeeId_date: { employeeId: id, date: today() } } }),
      db.employee.findUniqueOrThrow({ where: { id }, include: { shift: true } }),
      db.leaveRequest.findFirst({ where: { employeeId: id, status: "APPROVED", halfDay: "NONE", startDate: { lte: today() }, endDate: { gte: today() } }, include: { leaveType: true } }),
      db.attendanceCorrection.findMany({ where: { employeeId: id }, orderBy: { createdAt: "desc" }, take: 5 }),
    ]);
    const shift = emp.shift ?? { name: "General", startTime: "09:30", endTime: "18:30" };
    return (
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <AttendanceWidget record={rec ? { checkIn: rec.checkIn?.toISOString() ?? null, checkOut: rec.checkOut?.toISOString() ?? null, status: rec.status, workMinutes: rec.workMinutes } : null} shift={shift} onLeave={leave?.leaveType.name ?? null} />
          <Section title="My corrections">
            {corrections.length === 0 ? <p className="text-[13px] text-muted">None requested.</p> : <ul className="space-y-2.5">{corrections.map((c) => <li key={c.id} className="flex justify-between gap-3 text-[13px]"><span>{fmtDate(c.date, "EEE d MMM")}<span className="block text-[12px] text-muted truncate max-w-48">{c.reason}</span></span><StatusBadge status={c.status} /></li>)}</ul>}
          </Section>
          <p className="text-[12px] text-muted px-1">Check-ins work from web and phone (with location on mobile). Biometric and selfie check-ins sync in automatically once connected in Settings → Integrations.</p>
        </div>
        <div className="lg:col-span-2 card p-5"><AttendanceCalendar employeeId={id} month={sp.month ?? currentMonth()} baseHref="/attendance?tab=mine" /></div>
      </div>
    );
  }

  async function Wfh() {
    const t = today();
    const scope = hr ? {} : { employeeId: { in: [...v.teamIds, v.employeeId ?? ""] } };
    const [mine, todayList, upcoming, history] = await Promise.all([
      v.employeeId ? db.wfhRequest.findMany({ where: { employeeId: v.employeeId }, orderBy: { startDate: "desc" }, take: 10 }) : [],
      db.wfhRequest.findMany({ where: { ...scope, status: "APPROVED", startDate: { lte: t }, endDate: { gte: t } }, include: { employee: true } }),
      db.wfhRequest.findMany({ where: { ...scope, status: { in: ["APPROVED", "PENDING"] }, startDate: { gt: t } }, include: { employee: true }, orderBy: { startDate: "asc" }, take: 10 }),
      approver ? db.wfhRequest.findMany({ where: { ...scope, startDate: { lt: t } }, include: { employee: true, approver: true }, orderBy: { startDate: "desc" }, take: 20 }) : [],
    ]);
    return (
      <div className="space-y-6">
        {approver && (
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="WFH today" value={todayList.length} />
            <MetricCard label="Upcoming" value={upcoming.length} />
            <MetricCard label="Pending approval" value={upcoming.filter((u) => u.status === "PENDING").length} href="/attendance?tab=approvals" />
          </div>
        )}
        <div className="grid lg:grid-cols-2 gap-6">
          {approver && <Section title="Working from home today">{todayList.length ? <ul className="flex flex-wrap gap-3">{todayList.map((w) => <li key={w.id} className="flex items-center gap-2 text-[13px]"><EmployeeAvatar employee={w.employee} size={28} />{w.employee.firstName} {w.employee.lastName}</li>)}</ul> : <p className="text-[13px] text-muted">No one today.</p>}</Section>}
          {approver && <Section title="Upcoming">{upcoming.length ? <ul className="space-y-2 text-[13px]">{upcoming.map((w) => <li key={w.id} className="flex justify-between gap-2"><span>{w.employee.firstName} {w.employee.lastName}</span><span className="flex items-center gap-2 text-muted">{fmtDate(w.startDate, "d MMM")}{w.days > 1 ? ` +${w.days - 1}` : ""}<StatusBadge status={w.status} /></span></li>)}</ul> : <p className="text-[13px] text-muted">Nothing scheduled.</p>}</Section>}
        </div>
        {v.employeeId && (
          <Section title="My WFH requests">
            {mine.length === 0 ? <EmptyState compact icon={Home} title="No WFH requests yet" /> : (
              <ul className="divide-y divide-line -my-2">{mine.map((w) => (
                <li key={w.id} className="py-2.5 flex items-center gap-3 text-[13.5px]"><span className="flex-1">{fmtDate(w.startDate, "EEE d MMM")}{w.endDate > w.startDate ? ` – ${fmtDate(w.endDate, "d MMM")}` : ""} · {w.days}d<span className="block text-[12px] text-muted">{w.reason}{w.decisionNote ? ` · ${w.decisionNote}` : ""}</span></span><StatusBadge status={w.status} />
                  {(w.status === "PENDING" || (w.status === "APPROVED" && w.startDate > today())) && <ActionButton action={cancelWfh} payload={{ id: w.id }} variant="ghost" success="Cancelled">Cancel</ActionButton>}</li>
              ))}</ul>
            )}
          </Section>
        )}
        {history.length > 0 && (
          <Section title="WFH history">
            <div className="overflow-x-auto -mx-5"><table className="tbl"><thead><tr><th>Person</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th>Decided by</th></tr></thead><tbody>
              {history.map((w) => <tr key={w.id}><td>{w.employee.firstName} {w.employee.lastName}</td><td className="whitespace-nowrap">{fmtDate(w.startDate, "d MMM")}{w.endDate > w.startDate ? ` – ${fmtDate(w.endDate, "d MMM")}` : ""}</td><td>{w.days}</td><td className="text-muted max-w-60 truncate">{w.reason}</td><td><StatusBadge status={w.status} /></td><td>{w.approver?.firstName ?? "—"}</td></tr>)}
            </tbody></table></div>
          </Section>
        )}
      </div>
    );
  }

  async function Approvals() {
    const scope = scopeIds ? { employeeId: { in: scopeIds } } : {};
    const [corr, wfh] = await Promise.all([
      db.attendanceCorrection.findMany({ where: { status: "PENDING", ...scope, NOT: { employeeId: v.employeeId ?? "" } }, include: { employee: { include: { designation: true } }, attendance: true }, orderBy: { date: "asc" } }),
      db.wfhRequest.findMany({ where: { status: "PENDING", ...scope, NOT: { employeeId: v.employeeId ?? "" } }, include: { employee: { include: { designation: true } } }, orderBy: { startDate: "asc" } }),
    ]);
    if (!corr.length && !wfh.length) return <div className="card"><EmptyState icon={Inbox} title="Nothing waiting for you" /></div>;
    return (
      <div className="space-y-6">
        {wfh.length > 0 && <div><h2 className="text-[15px] mb-3">Work from home ({wfh.length})</h2><ul className="space-y-3">{wfh.map((w) => (
          <ApprovalCard key={w.id} id={w.id} act={decideWfh} person={w.employee} title={<>WFH · {w.days} day{w.days > 1 ? "s" : ""}</>} meta={<>{fmtDate(w.startDate, "EEE d MMM")}{w.endDate > w.startDate ? ` – ${fmtDate(w.endDate, "EEE d MMM")}` : ""}</>} reason={[w.reason, w.comment].filter(Boolean).join("\n")} attachmentHref={w.attachmentKey ? `/api/attachments/wfh/${w.id}` : null} />
        ))}</ul></div>}
        {corr.length > 0 && <div><h2 className="text-[15px] mb-3">Attendance corrections ({corr.length})</h2><ul className="space-y-3">{corr.map((c) => (
          <ApprovalCard key={c.id} id={c.id} act={decideCorrection} person={c.employee} title={<>Correction for {fmtDate(c.date, "EEE d MMM")}</>}
            meta={<>Recorded: {fmtTime(c.attendance?.checkIn)} – {fmtTime(c.attendance?.checkOut)} → Requested: <span className="text-ink font-medium">{fmtTime(c.requestedCheckIn)} – {fmtTime(c.requestedCheckOut)}</span></>} reason={c.reason} />
        ))}</ul></div>}
      </div>
    );
  }

  async function Team() {
    const date = sp.date ? dateOnly(sp.date) : today();
    const ids = (await db.employee.findMany({ where: { status: { in: ["ACTIVE", "PROBATION", "NOTICE_PERIOD"] }, ...(scopeIds ? { id: { in: scopeIds } } : {}), ...(sp.department ? { departmentId: sp.department } : {}) }, select: { id: true } })).map((e) => e.id);
    const isToday = isoOf(date) === isoOf(today());
    const [rows, att, depts, week] = await Promise.all([
      isToday ? teamToday(ids) : Promise.resolve(null),
      db.attendance.findMany({ where: { employeeId: { in: ids }, date }, include: { employee: { include: { designation: true } } } }),
      db.department.findMany({ orderBy: { name: "asc" } }),
      db.attendance.groupBy({ by: ["status"], where: { employeeId: { in: ids }, date: { gte: addDays(date, -6), lte: date } }, _count: true }),
    ]);
    const people = await db.employee.findMany({ where: { id: { in: ids } }, include: { designation: true }, orderBy: { firstName: "asc" } });
    const byId = new Map(att.map((a) => [a.employeeId, a]));
    const stateOf = (id: string) => rows?.find((r) => r.id === id)?.state;
    const count = (s: string) => week.find((w) => w.status === s)?._count ?? 0;
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <DateFilter param="date" label="Date" />
          {hr && <FilterDropdown param="department" label="Department" options={depts.map((d) => ({ value: d.id, label: d.name }))} />}
          <span className="text-[12.5px] text-muted ml-auto">Last 7 days: {count("PRESENT")} present · {count("LATE")} late · {count("WFH")} WFH · {count("LEAVE")} leave · {count("ABSENT")} absent</span>
        </div>
        <TableWrap><table className="tbl"><thead><tr><th>Person</th><th>Status</th><th>In</th><th>Out</th><th>Worked</th><th>Source</th>{hr && <th />}</tr></thead><tbody>
          {people.map((p) => {
            const a = byId.get(p.id);
            const st = a?.status ?? (stateOf(p.id) === "LEAVE" ? "LEAVE" : isToday ? null : date.getUTCDay() === 0 ? "WEEKEND" : "ABSENT");
            return (
              <tr key={p.id}>
                <td><Link href={`/people/${p.id}?tab=attendance`} className="flex items-center gap-2.5 group"><EmployeeAvatar employee={p} size={30} /><span><span className="block font-medium group-hover:text-brand">{p.firstName} {p.lastName}</span><span className="block text-[12px] text-muted">{p.designation?.name}</span></span></Link></td>
                <td>{st ? <StatusBadge status={st} /> : <Badge tone="bad" dot>Not checked in</Badge>}{a?.isLate && a.status !== "LATE" && <Badge tone="warn" className="ml-1">Late</Badge>}</td>
                <td className="tabular-nums">{fmtTime(a?.checkIn)}</td><td className="tabular-nums">{fmtTime(a?.checkOut)}</td>
                <td className="tabular-nums">{a?.workMinutes ? minutesToHM(a.workMinutes) : "—"}</td>
                <td className="text-muted text-[12.5px]">{a?.source ? a.source.toLowerCase() : "—"}</td>
                {hr && <td className="text-right"><Modal title={`Set attendance — ${p.firstName}`} description={fmtDate(date, "EEEE d MMMM")} trigger={<Button variant="ghost" size="sm">Edit</Button>}><OverrideForm employeeId={p.id} date={isoOf(date)} status={a?.status ?? "PRESENT"} /></Modal></td>}
              </tr>
            );
          })}
        </tbody></table></TableWrap>
      </div>
    );
  }
}
