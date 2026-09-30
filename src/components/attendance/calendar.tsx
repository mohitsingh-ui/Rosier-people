import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { fmtTime, isoOf, minutesToHM, monthRange, today, fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

const CELL: Record<string, { label: string; cls: string; short: string }> = {
  PRESENT: { label: "Present", short: "P", cls: "bg-ok-bg text-ok" },
  LATE: { label: "Late", short: "L", cls: "bg-warn-bg text-warn" },
  HALF_DAY: { label: "Half day", short: "½", cls: "bg-warn-bg text-warn" },
  WFH: { label: "WFH", short: "W", cls: "bg-info-bg text-info" },
  LEAVE: { label: "Leave", short: "Lv", cls: "bg-plum-bg text-plum" },
  HOLIDAY: { label: "Holiday", short: "H", cls: "bg-brand-50 text-brand" },
  WEEKEND: { label: "Weekly off", short: "—", cls: "bg-soft text-faint" },
  ABSENT: { label: "Absent", short: "A", cls: "bg-bad-bg text-bad" },
  PENDING_CORRECTION: { label: "Correction pending", short: "?", cls: "bg-warn-bg text-warn ring-1 ring-warn/40" },
};

export async function monthAttendance(employeeId: string, ym: string) {
  const { start, end } = monthRange(ym);
  const [rows, holidays, emp] = await Promise.all([
    db.attendance.findMany({ where: { employeeId, date: { gte: start, lte: end } }, orderBy: { date: "asc" } }),
    db.holiday.findMany({ where: { date: { gte: start, lte: end }, type: { not: "OPTIONAL" } } }),
    db.employee.findUnique({ where: { id: employeeId }, include: { shift: true } }),
  ]);
  const byDate = new Map(rows.map((r) => [isoOf(r.date), r]));
  const hol = new Map(holidays.map((h) => [isoOf(h.date), h.name]));
  const offs = emp?.shift?.weeklyOffs ?? [0];
  const t = today();
  const days: { iso: string; date: Date; status: string | null; rec?: (typeof rows)[number]; holiday?: string; future: boolean }[] = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
    const iso = isoOf(d);
    const rec = byDate.get(iso);
    const future = d > t;
    let status = rec?.status ?? null;
    if (!status && hol.has(iso)) status = "HOLIDAY";
    if (!status && offs.includes(d.getUTCDay())) status = "WEEKEND";
    if (!status && !future && d < t && emp && d >= emp.joiningDate) status = "ABSENT";
    days.push({ iso, date: new Date(d), status, rec, holiday: hol.get(iso), future });
  }
  const worked = rows.filter((r) => r.workMinutes > 0);
  const summary = {
    present: rows.filter((r) => ["PRESENT", "LATE", "WFH", "HALF_DAY"].includes(r.status)).length,
    late: rows.filter((r) => r.isLate).length,
    early: rows.filter((r) => r.isEarlyExit).length,
    wfh: rows.filter((r) => r.status === "WFH").length,
    leave: rows.filter((r) => r.status === "LEAVE").length + rows.filter((r) => r.status === "HALF_DAY").length * 0.5,
    absent: days.filter((d) => d.status === "ABSENT").length,
    overtime: rows.reduce((a, r) => a + r.overtimeMinutes, 0),
    avgMinutes: worked.length ? Math.round(worked.reduce((a, r) => a + r.workMinutes, 0) / worked.length) : 0,
    totalMinutes: rows.reduce((a, r) => a + r.workMinutes, 0),
  };
  return { days, summary };
}

/** AttendanceCalendar: month grid; hover/tap a day for times. */
export async function AttendanceCalendar({ employeeId, month, baseHref }: { employeeId: string; month: string; baseHref: string }) {
  const { days, summary } = await monthAttendance(employeeId, month);
  const [y, m] = month.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const lead = (days[0].date.getUTCDay() + 6) % 7; // Monday-first
  const sep = baseHref.includes("?") ? "&" : "?";
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
        {[["Days present", summary.present], ["Late arrivals", summary.late], ["Early exits", summary.early], ["WFH", summary.wfh], ["Leave", summary.leave], ["Avg. hours / day", minutesToHM(summary.avgMinutes)], ["Overtime", minutesToHM(summary.overtime)]].map(([l, val]) => (
          <div key={l as string} className="rounded-ctl border border-line bg-white px-3.5 py-2.5"><div className="text-[12px] text-muted">{l}</div><div className="text-[18px] font-semibold tabular-nums">{val}</div></div>
        ))}
      </div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[15px] font-semibold">{fmtDate(days[0].date, "MMMM yyyy")}</h3>
        <div className="flex gap-1">
          <Link href={`${baseHref}${sep}month=${prev}`} scroll={false} className="size-8 grid place-items-center rounded-lg border border-line-2 bg-white hover:bg-soft" aria-label="Previous month"><ChevronLeft className="size-4" /></Link>
          <Link href={`${baseHref}${sep}month=${next}`} scroll={false} className="size-8 grid place-items-center rounded-lg border border-line-2 bg-white hover:bg-soft" aria-label="Next month"><ChevronRight className="size-4" /></Link>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="text-[11px] font-semibold text-muted uppercase tracking-wide pb-1">{d}</div>)}
        {Array.from({ length: lead }).map((_, i) => <div key={`l${i}`} />)}
        {days.map((d) => {
          const c = d.status ? CELL[d.status] : null;
          const tip = [fmtDate(d.date, "EEE d MMM"), c?.label, d.holiday, d.rec?.checkIn ? `In ${fmtTime(d.rec.checkIn)}` : null, d.rec?.checkOut ? `Out ${fmtTime(d.rec.checkOut)}` : null, d.rec?.workMinutes ? minutesToHM(d.rec.workMinutes) : null].filter(Boolean).join(" · ");
          return (
            <div key={d.iso} title={tip} className={cn("rounded-lg min-h-14 sm:min-h-16 p-1.5 flex flex-col items-center justify-between text-[11px]", c ? c.cls : "bg-white border border-dashed border-line", d.iso === isoOf(today()) && "ring-2 ring-brand-2")}>
              <span className="text-[12.5px] font-semibold text-ink/80">{d.date.getUTCDate()}</span>
              <span className="font-medium">{c?.short ?? ""}</span>
              {d.rec?.workMinutes ? <span className="hidden sm:block text-[10px] opacity-80">{Math.floor(d.rec.workMinutes / 60)}h{String(d.rec.workMinutes % 60).padStart(2, "0")}</span> : <span className="hidden sm:block text-[10px]">&nbsp;</span>}
            </div>
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 text-[12px] text-muted">
        {Object.entries(CELL).map(([k, c]) => <li key={k} className="flex items-center gap-1.5"><span className={cn("size-3 rounded", c.cls)} />{c.label}</li>)}
      </ul>
    </div>
  );
}
