import Link from "next/link";
import { CalendarPlus, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Inbox } from "lucide-react";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/auth/viewer";
import { currentMonth, fmtDate, isoOf, monthRange, today, todayISO } from "@/lib/dates";
import { cn, humanize } from "@/lib/utils";
import { PageHeader, Section } from "@/components/ui/card";
import { Tabs, EmptyState, TableWrap } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/action-button";
import { ApprovalCard } from "@/components/approvals/approval-card";
import { ApplyLeaveForm } from "@/components/leave/apply-form";
import { HolidayForm, BalanceForm, ClarifyForm, AutoOpen } from "@/components/leave/forms";
import { SearchBar, FilterDropdown } from "@/components/ui/filters";
import { leaveBalances } from "@/server/queries";
import { cancelLeave, decideLeave, deleteHoliday } from "@/server/leave";

export const metadata = { title: "Leave" };

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ tab?: string; apply?: string; month?: string; q?: string; department?: string; year?: string }> }) {
  const v = await requireViewer();
  const sp = await searchParams;
  const approver = can(v, "leave.manage") || (can(v, "leave.approve_team") && v.teamIds.size > 0);
  const hr = can(v, "leave.manage");
  const tabs = [
    ...(v.employeeId ? [{ key: "mine", label: "My leave" }] : []),
    ...(approver ? [{ key: "approvals", label: "Approvals", count: await db.leaveRequest.count({ where: { status: "PENDING", ...(hr ? {} : { employeeId: { in: [...v.teamIds] } }), NOT: { employeeId: v.employeeId ?? "" } } }) }] : []),
    { key: "calendar", label: "Leave calendar" },
    { key: "holidays", label: "Holidays" },
    ...(hr ? [{ key: "balances", label: "Balances" }] : []),
  ];
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : tabs[0].key;

  let applyForm: React.ReactNode = null;
  if (v.employeeId) {
    const [bal, hol, emp] = await Promise.all([leaveBalances(v.employeeId), db.holiday.findMany({ where: { date: { gte: today() }, type: { not: "OPTIONAL" } } }), db.employee.findUnique({ where: { id: v.employeeId }, include: { shift: true } })]);
    applyForm = (
      <Modal title="Apply for leave" trigger={<Button data-autoopen><CalendarPlus className="size-4" />Apply leave</Button>}>
        <ApplyLeaveForm today={todayISO()} holidays={hol.map((h) => isoOf(h.date))} weeklyOffs={emp?.shift?.weeklyOffs ?? [0]}
          types={bal.map((b) => ({ id: b.leaveTypeId, name: b.leaveType.name, available: b.available, allowHalfDay: b.leaveType.allowHalfDay, allowNegative: b.leaveType.allowNegative, docAfter: b.leaveType.docRequiredAfterDays, code: b.leaveType.code })).filter((t) => t.available > 0 || t.allowNegative || t.code === "OH")} />
      </Modal>
    );
  }

  return (
    <>
      <PageHeader title="Leave" description="Balances, requests, the team calendar and holidays." actions={applyForm} />
      {sp.apply && <AutoOpen />}
      <Tabs tabs={tabs} active={tab} base="/leave" />
      <div className="pt-5">
        {tab === "mine" && <MyLeave />}
        {tab === "approvals" && <Approvals />}
        {tab === "calendar" && <LeaveCalendar month={sp.month ?? currentMonth()} />}
        {tab === "holidays" && <Holidays year={Number(sp.year) || today().getUTCFullYear()} />}
        {tab === "balances" && <Balances q={sp.q} department={sp.department} />}
      </div>
    </>
  );

  async function MyLeave() {
    const id = v.employeeId!;
    const [bal, reqs] = await Promise.all([leaveBalances(id), db.leaveRequest.findMany({ where: { employeeId: id }, include: { leaveType: true, approver: true }, orderBy: { startDate: "desc" } })]);
    const count = (s: string[]) => reqs.filter((r) => s.includes(r.status)).length;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {bal.map((b) => (
            <div key={b.id} className="card px-4 py-3.5">
              <div className="flex items-center gap-2 text-[12.5px] text-muted"><span className="size-2 rounded-full" style={{ background: b.leaveType.color }} />{b.leaveType.name}</div>
              <div className="flex items-baseline gap-1 mt-1"><span className="text-[26px] font-semibold tabular-nums">{b.leaveType.allowNegative ? b.used : b.available}</span><span className="text-[12px] text-muted">{b.leaveType.allowNegative ? "taken" : `of ${b.allocated + b.carriedForward}`}</span></div>
              <div className="text-[11.5px] text-muted">{b.used} used{b.pending ? ` · ${b.pending} pending` : ""}{b.carriedForward ? ` · ${b.carriedForward} carried` : ""}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[["Pending", count(["PENDING", "CLARIFICATION"])], ["Approved", count(["APPROVED"])], ["Rejected", count(["REJECTED"])], ["Cancelled", count(["CANCELLED"])]].map(([l, n]) => <div key={l as string} className="rounded-ctl border border-line bg-white px-4 py-2.5 flex justify-between text-[13px]"><span className="text-muted">{l}</span><span className="font-semibold">{n}</span></div>)}
        </div>
        <Section title="My requests">
          {reqs.length === 0 ? <EmptyState compact icon={Inbox} title="No leave requests yet" /> : (
            <ul className="divide-y divide-line -my-2">{reqs.map((r) => (
              <li key={r.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{r.leaveType.name}</span><StatusBadge status={r.status} /></div>
                  <div className="text-[12.5px] text-muted mt-0.5">{fmtDate(r.startDate, "EEE d MMM")}{r.endDate > r.startDate ? ` – ${fmtDate(r.endDate, "EEE d MMM yyyy")}` : fmtDate(r.startDate, " yyyy")} · {r.days} day{r.days === 1 ? "" : "s"}{r.halfDay !== "NONE" ? ` (${humanize(r.halfDay)})` : ""}{r.approver ? ` · ${r.approver.firstName}` : ""}</div>
                  <div className="text-[13px] text-ink-2 mt-1 line-clamp-2">{r.reason}</div>
                  {r.decisionNote && <div className={cn("text-[12.5px] mt-1", r.status === "REJECTED" ? "text-bad" : "text-info")}>{r.approver?.firstName ?? "Manager"}: {r.decisionNote}</div>}
                </div>
                <div className="flex gap-2">
                  {r.status === "CLARIFICATION" && <Modal title="Reply to your manager" trigger={<Button size="sm">Reply</Button>}><ClarifyForm id={r.id} /></Modal>}
                  {(["PENDING", "CLARIFICATION"].includes(r.status) || (r.status === "APPROVED" && r.startDate > today())) && <ActionButton action={cancelLeave} payload={{ id: r.id }} variant="ghost" confirm={{ title: "Cancel this leave?", body: "Your balance will be restored.", confirmLabel: "Cancel leave" }}>Cancel</ActionButton>}
                </div>
              </li>
            ))}</ul>
          )}
        </Section>
      </div>
    );
  }

  async function Approvals() {
    const reqs = await db.leaveRequest.findMany({
      where: { status: { in: ["PENDING", "CLARIFICATION"] }, ...(hr ? {} : { employeeId: { in: [...v.teamIds] } }), NOT: { employeeId: v.employeeId ?? "" } },
      include: { employee: { include: { designation: true } }, leaveType: true }, orderBy: { startDate: "asc" },
    });
    if (!reqs.length) return <div className="card"><EmptyState icon={Inbox} title="No leave waiting for you" body="New requests from your team show up here and in your notifications." /></div>;
    const bal = await db.leaveBalance.findMany({ where: { employeeId: { in: reqs.map((r) => r.employeeId) }, year: today().getUTCFullYear() } });
    // Overlap hint: who else on the same team is off on those dates
    const overlaps = await db.leaveRequest.findMany({ where: { status: "APPROVED", employeeId: { in: [...v.teamIds] }, startDate: { lte: reqs[reqs.length - 1].endDate }, endDate: { gte: reqs[0].startDate } }, include: { employee: true } });
    return (
      <ul className="space-y-3">{reqs.map((r) => {
        const b = bal.find((x) => x.employeeId === r.employeeId && x.leaveTypeId === r.leaveTypeId);
        const others = overlaps.filter((o) => o.employeeId !== r.employeeId && o.startDate <= r.endDate && o.endDate >= r.startDate);
        return (
          <ApprovalCard key={r.id} id={r.id} act={decideLeave} clarify person={r.employee} status={r.status}
            title={<><span className="font-medium">{r.leaveType.name}</span> · {r.days} day{r.days === 1 ? "" : "s"}{r.halfDay !== "NONE" ? ` (${humanize(r.halfDay)})` : ""}</>}
            meta={<>{fmtDate(r.startDate, "EEE d MMM")}{r.endDate > r.startDate ? ` – ${fmtDate(r.endDate, "EEE d MMM")}` : ""} · applied {fmtDate(r.createdAt, "d MMM")}{b ? ` · ${b.allocated + b.carriedForward - b.used - b.pending + r.days} available before this` : ""}</>}
            reason={r.reason} attachmentHref={r.attachmentKey ? `/api/attachments/leave/${r.id}` : null}
            extra={others.length ? <p className="text-[12px] text-warn mt-2">Also off then: {others.map((o) => o.employee.firstName).join(", ")}</p> : null} />
        );
      })}</ul>
    );
  }

  async function LeaveCalendar({ month }: { month: string }) {
    const { start, end } = monthRange(month);
    // Scope: HR everyone; managers their line; employees their own department. Peers see "On leave" only, not the type or reason.
    const scope = hr ? {} : v.teamIds.size ? { employeeId: { in: [...v.teamIds, v.employeeId ?? ""] } } : { employee: { departmentId: v.employee?.departmentId ?? "__none__" } };
    const [reqs, hols] = await Promise.all([
      db.leaveRequest.findMany({ where: { status: { in: ["APPROVED", "PENDING"] }, startDate: { lte: end }, endDate: { gte: start }, ...scope }, include: { employee: true, leaveType: true } }),
      db.holiday.findMany({ where: { date: { gte: start, lte: end } } }),
    ]);
    const showType = hr || v.teamIds.size > 0;
    const days: Date[] = [];
    for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) days.push(d);
    const lead = (start.getUTCDay() + 6) % 7;
    const [y, m] = month.split("-").map(Number);
    const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7), next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
    return (
      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px]">{fmtDate(start, "MMMM yyyy")}</h2>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-muted hidden sm:inline">{hr ? "Everyone" : v.teamIds.size ? "Your team" : "Your department"} · dashed = pending</span>
            <Link href={`/leave?tab=calendar&month=${prev}`} className="size-8 grid place-items-center rounded-lg border border-line-2 hover:bg-soft" aria-label="Previous month"><ChevronLeft className="size-4" /></Link>
            <Link href={`/leave?tab=calendar&month=${next}`} className="size-8 grid place-items-center rounded-lg border border-line-2 hover:bg-soft" aria-label="Next month"><ChevronRight className="size-4" /></Link>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="text-center text-[11px] font-semibold text-muted uppercase pb-1">{d}</div>)}
          {Array.from({ length: lead }).map((_, i) => <div key={i} />)}
          {days.map((d) => {
            const iso = isoOf(d);
            const hol = hols.find((h) => isoOf(h.date) === iso);
            const off = reqs.filter((r) => r.startDate <= d && r.endDate >= d && d.getUTCDay() !== 0);
            return (
              <div key={iso} className={cn("min-h-20 sm:min-h-24 rounded-lg border p-1.5 text-left", iso === todayISO() ? "border-brand-2" : "border-line", d.getUTCDay() === 0 ? "bg-soft/60" : "bg-white")}>
                <div className="text-[12px] font-semibold text-ink-2">{d.getUTCDate()}</div>
                {hol && <div className="text-[10.5px] rounded bg-brand-50 text-brand px-1 py-0.5 mt-0.5 truncate" title={hol.name}>{hol.name}</div>}
                <div className="space-y-0.5 mt-0.5">
                  {off.slice(0, 3).map((r) => <div key={r.id} title={`${r.employee.firstName} ${r.employee.lastName}${showType ? ` · ${r.leaveType.name}` : ""}`} className={cn("text-[10.5px] rounded px-1 py-0.5 truncate", r.status === "PENDING" ? "border border-dashed" : "text-white")} style={r.status === "PENDING" ? { borderColor: showType ? r.leaveType.color : "#A56312", color: showType ? r.leaveType.color : "#A56312" } : { background: showType ? r.leaveType.color : "#A56312" }}>{r.employee.firstName}</div>)}
                  {off.length > 3 && <div className="text-[10.5px] text-muted">+{off.length - 3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  async function Holidays({ year }: { year: number }) {
    const [hols, locs] = await Promise.all([db.holiday.findMany({ where: { date: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) } }, include: { location: true }, orderBy: { date: "asc" } }), db.location.findMany()]);
    const manage = can(v, "settings.manage");
    const locOpts = locs.map((l) => ({ value: l.id, label: l.name }));
    const months = Array.from({ length: 12 }, (_, i) => i);
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link href={`/leave?tab=holidays&year=${year - 1}`} className="size-8 grid place-items-center rounded-lg border border-line-2 bg-white hover:bg-soft" aria-label="Previous year"><ChevronLeft className="size-4" /></Link>
            <h2 className="text-[18px] w-16 text-center">{year}</h2>
            <Link href={`/leave?tab=holidays&year=${year + 1}`} className="size-8 grid place-items-center rounded-lg border border-line-2 bg-white hover:bg-soft" aria-label="Next year"><ChevronRight className="size-4" /></Link>
          </div>
          <div className="flex items-center gap-3 text-[12.5px] text-muted">
            <span className="flex items-center gap-1.5"><Badge tone="brand">Public</Badge></span><span><Badge tone="plum">Company</Badge></span><span><Badge>Optional</Badge> — use your Optional Holiday leave</span>
            {manage && <Modal title="Add holiday" trigger={<Button size="sm"><Plus className="size-3.5" />Holiday</Button>}><HolidayForm locations={locOpts} /></Modal>}
          </div>
        </div>
        {hols.length === 0 ? <div className="card"><EmptyState title={`No holidays set for ${year}`} /></div> : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {months.map((mi) => {
              const list = hols.filter((h) => h.date.getUTCMonth() === mi);
              if (!list.length) return null;
              return (
                <section key={mi} className="card p-4">
                  <h3 className="eyebrow mb-3">{fmtDate(new Date(Date.UTC(year, mi, 1)), "MMMM")}</h3>
                  <ul className="space-y-2.5">{list.map((h) => (
                    <li key={h.id} className={cn("flex items-center gap-3", h.date < today() && "opacity-55")}>
                      <span className="w-10 text-center shrink-0"><span className="block text-[18px] font-semibold leading-none">{h.date.getUTCDate()}</span><span className="block text-[10.5px] text-muted uppercase">{fmtDate(h.date, "EEE")}</span></span>
                      <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-medium truncate">{h.name}</span>{h.location && <span className="text-[11.5px] text-muted">{h.location.name} only</span>}</span>
                      <Badge tone={h.type === "PUBLIC" ? "brand" : h.type === "COMPANY" ? "plum" : "neutral"}>{humanize(h.type)}</Badge>
                      {manage && <span className="flex -mr-1.5">
                        <Modal title="Edit holiday" trigger={<Button variant="ghost" size="iconSm" aria-label="Edit"><Pencil className="size-3.5" /></Button>}><HolidayForm locations={locOpts} h={{ id: h.id, name: h.name, date: isoOf(h.date), type: h.type, locationId: h.locationId, note: h.note }} /></Modal>
                        <ActionButton action={deleteHoliday} payload={{ id: h.id }} variant="ghost" size="iconSm" confirm={{ title: `Remove ${h.name}?`, danger: true, confirmLabel: "Remove" }}><Trash2 className="size-3.5" /></ActionButton>
                      </span>}
                    </li>
                  ))}</ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  async function Balances({ q, department }: { q?: string; department?: string }) {
    const year = today().getUTCFullYear();
    const [types, emps, depts] = await Promise.all([
      db.leaveType.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      db.employee.findMany({ where: { status: { notIn: ["EXITED", "INACTIVE"] }, ...(department ? { departmentId: department } : {}), ...(q ? { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}) }, include: { leaveBalances: { where: { year } } }, orderBy: { firstName: "asc" } }),
      db.department.findMany({ orderBy: { name: "asc" } }),
    ]);
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2"><SearchBar placeholder="Search employee" className="flex-1 min-w-56" /><FilterDropdown param="department" label="Department" options={depts.map((d) => ({ value: d.id, label: d.name }))} /></div>
        <TableWrap><table className="tbl"><thead><tr><th>Employee</th>{types.map((t) => <th key={t.id} className="text-center">{t.code}</th>)}</tr></thead><tbody>
          {emps.map((e) => (
            <tr key={e.id}><td className="whitespace-nowrap"><span className="flex items-center gap-2"><EmployeeAvatar employee={e} size={26} /><span>{e.firstName} {e.lastName}</span></span></td>
              {types.map((t) => { const b = e.leaveBalances.find((x) => x.leaveTypeId === t.id); const left = b ? b.allocated + b.carriedForward - b.used - b.pending : 0; return (
                <td key={t.id} className="text-center">
                  <Modal title={`${t.name} — ${e.firstName} ${e.lastName}`} description={`Used ${b?.used ?? 0} · pending ${b?.pending ?? 0}`} trigger={<button className="tabular-nums rounded-md px-2 py-1 hover:bg-brand-50" title="Adjust">{t.allowNegative ? b?.used ?? 0 : left}<span className="text-faint text-[11px]">/{(b?.allocated ?? 0) + (b?.carriedForward ?? 0)}</span></button>}>
                    <BalanceForm employeeId={e.id} leaveTypeId={t.id} year={year} allocated={b?.allocated ?? 0} carried={b?.carriedForward ?? 0} />
                  </Modal>
                </td>
              ); })}
            </tr>
          ))}
        </tbody></table></TableWrap>
      </div>
    );
  }
}
