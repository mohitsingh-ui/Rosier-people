import { format } from "date-fns";

export const DAY = 86400000;
/** UTC-safe date arithmetic for @db.Date values */
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
export const differenceInCalendarDays = (a: Date, b: Date) => Math.round((Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()) - Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())) / DAY);

// All business dates are Indian Standard Time.
export const TZ = "Asia/Kolkata";

/** YYYY-MM-DD for "today" in IST */
export function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
/** A @db.Date value (UTC midnight) for an ISO date */
export const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
export const today = () => dateOnly(todayISO());
export const isoOf = (d: Date) => d.toISOString().slice(0, 10);

export const fmtDate = (d: Date | string | null | undefined, f = "d MMM yyyy") =>
  d ? format(typeof d === "string" ? new Date(d) : utcAsLocal(d), f) : "—";

/** Render a @db.Date (UTC midnight) without shifting a day in other timezones */
export function utcAsLocal(d: Date) {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
}

export function fmtTime(d: Date | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(d);
}
export function fmtDateTime(d: Date | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(d);
}
export function minutesToHM(m: number) {
  if (!m) return "0h 0m";
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
/** Minutes since midnight IST for a timestamp */
export function istMinutes(d: Date) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  return Number(p.find((x) => x.type === "hour")!.value) * 60 + Number(p.find((x) => x.type === "minute")!.value);
}
export const hmToMinutes = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };

export function greeting(now = new Date()) {
  const m = istMinutes(now);
  return m < 12 * 60 ? "Good morning" : m < 17 * 60 ? "Good afternoon" : "Good evening";
}

/** Working days between two dates, excluding weekly offs and holidays */
export function countWorkingDays(start: Date, end: Date, weeklyOffs: number[], holidays: Set<string>) {
  let n = 0;
  const days = differenceInCalendarDays(end, start);
  for (let i = 0; i <= days; i++) {
    const d = addDays(start, i);
    if (weeklyOffs.includes(d.getUTCDay())) continue;
    if (holidays.has(isoOf(d))) continue;
    n++;
  }
  return n;
}

export function eachDay(start: Date, end: Date) {
  const out: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export const monthRange = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 0)) };
};
export const currentMonth = () => todayISO().slice(0, 7);

export function daysUntilNextOccurrence(d: Date, from = today()) {
  const next = new Date(Date.UTC(from.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (next < from) next.setUTCFullYear(from.getUTCFullYear() + 1);
  return { date: next, days: differenceInCalendarDays(next, from) };
}
