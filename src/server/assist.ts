import "server-only";
import { db } from "@/lib/db";
import { can, type Viewer } from "@/lib/auth/viewer";
import { addDays, fmtDate, fmtTime, today } from "@/lib/dates";
import { inr } from "@/lib/utils";
import { leaveBalances, teamToday, pendingApprovals, expiringDocuments } from "./queries";

// Rosier Assist. Answers come ONLY from queries scoped to the signed-in user —
// the same helpers and permission checks the pages use. If a question needs data
// the user can't see, the assistant says so instead of answering.

export type AssistAnswer = { answer: string; rows?: string[]; links?: { label: string; href: string }[] };
type Intent = { match: RegExp; run: (v: Viewer, q: string) => Promise<AssistAnswer> };

const noEmployee: AssistAnswer = { answer: "Your login isn't linked to an employee profile, so I can't look that up. Ask HR to link it." };
const denied = (what: string): AssistAnswer => ({ answer: `I can't share ${what} — it's outside what your role can see. HR can help if you need it.` });

async function orgScope(v: Viewer) {
  if (can(v, "people.edit")) return (await db.employee.findMany({ where: { status: { in: ["ACTIVE", "PROBATION", "NOTICE_PERIOD"] } }, select: { id: true } })).map((e) => e.id);
  return [...v.teamIds];
}

const INTENTS: Intent[] = [
  {
    match: /(how many|balance|left).*(leave|leaves|holidays? left)|leave balance|leaves? do i have/i,
    run: async (v) => {
      if (!v.employeeId) return noEmployee;
      const b = await leaveBalances(v.employeeId);
      return { answer: "Here's your leave balance for this year:", rows: b.filter((x) => x.allocated + x.carriedForward > 0 || x.used).map((x) => `${x.leaveType.name}: ${x.available} left of ${x.allocated + x.carriedForward}${x.pending ? ` (${x.pending} pending)` : ""}`), links: [{ label: "Apply for leave", href: "/leave?apply=1" }] };
    },
  },
  {
    match: /pay ?slip|salary slip|my salary|net pay/i,
    run: async (v) => {
      if (!v.employeeId) return noEmployee;
      const s = await db.payslip.findFirst({ where: { employeeId: v.employeeId, run: { status: { not: "DRAFT" } } }, include: { run: true }, orderBy: { run: { month: "desc" } } });
      if (!s) return { answer: "You don't have a payslip yet. It appears here once payroll is processed." };
      return { answer: `Your latest payslip is for ${fmtDate(new Date(`${s.run.month}-01T00:00:00Z`), "MMMM yyyy")}. Net pay: ${inr(s.net, 2)} (${s.paidDays} paid days).`, links: [{ label: "Download PDF", href: `/api/payslips/${s.id}` }, { label: "All payslips", href: "/payroll" }] };
    },
  },
  {
    match: /(apply|request|how).*(wfh|work from home|remote)/i,
    run: async () => ({ answer: "Go to Attendance → Request WFH, pick the dates and a reason, and submit. Your manager gets a notification and approves it. Give at least a day's notice — studio shoot days are always on-site.", links: [{ label: "Request WFH", href: "/attendance?wfh=1" }] }),
  },
  {
    match: /(apply|how).*(leave)|take (a )?(day|leave) off/i,
    run: async () => ({ answer: "Open Leave → Apply leave, choose the type and dates (half days work for single dates), add a reason and submit. Your manager is notified straight away.", links: [{ label: "Apply for leave", href: "/leave?apply=1" }] }),
  },
  {
    match: /(where|find|download|get).*(letter|document|certificate|form 16|pan|aadhaar|contract)/i,
    run: async (v, q) => {
      if (!v.employeeId) return noEmployee;
      const words = q.toLowerCase().match(/appointment|offer|experience|relieving|salary revision|appraisal|promotion|increment|form 16|pan|aadhaar|passport|contract|certificate|letter/g) ?? [];
      const docs = await db.employeeDocument.findMany({ where: { employeeId: v.employeeId, archivedAt: null, visibility: { not: "HR_ONLY" }, ...(words.length ? { OR: words.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) } : {}) }, orderBy: { createdAt: "desc" }, take: 5 });
      if (!docs.length) return { answer: "I couldn't find that in your documents. HR can generate it for you — raise a quick request.", links: [{ label: "My documents", href: "/documents" }, { label: "Ask HR", href: "/helpdesk?new=1" }] };
      return { answer: "Found in your document vault:", rows: docs.map((d) => `${d.name} — uploaded ${fmtDate(d.createdAt)}`), links: [{ label: "Open my documents", href: "/documents" }] };
    },
  },
  {
    match: /next holiday|upcoming holiday|holidays? (this|next) (month|week)|when is .*holiday/i,
    run: async () => {
      const h = await db.holiday.findMany({ where: { date: { gte: today() } }, orderBy: { date: "asc" }, take: 3 });
      if (!h.length) return { answer: "No more holidays on the calendar this year." };
      return { answer: `Your next holiday is ${h[0].name} on ${fmtDate(h[0].date, "EEEE, d MMMM")}.`, rows: h.slice(1).map((x) => `${x.name} — ${fmtDate(x.date, "EEE d MMM")}${x.type === "OPTIONAL" ? " (optional)" : ""}`), links: [{ label: "Holiday calendar", href: "/leave?tab=holidays" }] };
    },
  },
  {
    match: /(who is|who's) my (reporting )?manager|report(ing)? to|my manager/i,
    run: async (v) => {
      if (!v.employeeId) return noEmployee;
      const e = await db.employee.findUniqueOrThrow({ where: { id: v.employeeId }, include: { manager: { include: { designation: true } } } });
      return e.manager ? { answer: `You report to ${e.manager.firstName} ${e.manager.lastName}, ${e.manager.designation?.name ?? ""}.`, links: [{ label: "View profile", href: `/people/${e.manager.id}` }, { label: "Org chart", href: "/organization" }] } : { answer: "You don't have a reporting manager set. HR can update this." };
    },
  },
  {
    match: /my attendance|did i check in|hours (today|this month)|how many hours/i,
    run: async (v) => {
      if (!v.employeeId) return noEmployee;
      const a = await db.attendance.findUnique({ where: { employeeId_date: { employeeId: v.employeeId, date: today() } } });
      return { answer: a?.checkIn ? `You checked in at ${fmtTime(a.checkIn)}${a.checkOut ? ` and out at ${fmtTime(a.checkOut)}` : ""} today.${a.isLate ? " It was marked late." : ""}` : "You haven't checked in today.", links: [{ label: "Attendance", href: "/attendance" }] };
    },
  },
  {
    match: /(who is|who's|who all).*(on leave|off|absent).*(today)?|on leave today/i,
    run: async (v) => {
      const ids = await orgScope(v);
      if (!ids.length) return denied("other people's leave");
      const rows = (await teamToday(ids)).filter((r) => r.state === "LEAVE");
      return { answer: rows.length ? `${rows.length} ${rows.length === 1 ? "person is" : "people are"} on leave today${can(v, "people.edit") ? "" : " in your team"}:` : "No one is on leave today.", rows: rows.map((r) => `${r.firstName} ${r.lastName} — ${r.leave?.leaveType.name ?? "Leave"}`), links: [{ label: "Leave calendar", href: "/leave?tab=calendar" }] };
    },
  },
  {
    match: /(hasn'?t|not|didn'?t|haven'?t).*(check(ed)? in|punch)|who.*(late|not in)/i,
    run: async (v) => {
      const ids = await orgScope(v);
      if (!ids.length) return denied("other people's attendance");
      const rows = await teamToday(ids);
      const notIn = rows.filter((r) => r.state === "NOT_IN" || r.state === "WFH_NOT_IN");
      const late = rows.filter((r) => r.state === "LATE");
      return { answer: notIn.length ? `${notIn.length} ${notIn.length === 1 ? "person hasn't" : "people haven't"} checked in yet${late.length ? ` and ${late.length} came in late` : ""}.` : "Everyone expected today has checked in.", rows: [...notIn.map((r) => `${r.firstName} ${r.lastName} — not checked in`), ...late.map((r) => `${r.firstName} ${r.lastName} — late (${fmtTime(r.attendance?.checkIn)})`)], links: [{ label: "Team attendance", href: "/attendance?tab=team" }] };
    },
  },
  {
    match: /pending approvals?|what.*(approve|waiting)|approvals/i,
    run: async (v) => {
      const p = await pendingApprovals(v);
      if (!p.total) return { answer: "Nothing is waiting for your approval. 🎉" };
      return { answer: `You have ${p.total} item${p.total === 1 ? "" : "s"} to review:`, rows: [[p.leave, "leave requests"], [p.wfh, "WFH requests"], [p.corrections, "attendance corrections"], [p.expenses, "expense claims"], [p.finance, "claims for finance approval"], [p.documents, "documents to verify"]].filter(([n]) => n).map(([n, l]) => `${n} ${l}`), links: [{ label: "Leave approvals", href: "/leave?tab=approvals" }, { label: "Attendance approvals", href: "/attendance?tab=approvals" }] };
    },
  },
  {
    match: /how many (employees|people)( are)?( in)?|headcount/i,
    run: async (v, q) => {
      if (!can(v, "reports.view")) return denied("headcount analytics");
      const depts = await db.department.findMany({ include: { _count: { select: { employees: { where: { status: { in: ["ACTIVE", "PROBATION", "NOTICE_PERIOD"] } } } } } } });
      const d = depts.find((x) => q.toLowerCase().includes(x.name.toLowerCase()));
      if (d) return { answer: `${d.name} has ${d._count.employees} ${d._count.employees === 1 ? "person" : "people"}.`, links: [{ label: `Open ${d.name}`, href: `/organization/departments/${d.id}` }] };
      const total = depts.reduce((a, x) => a + x._count.employees, 0);
      return { answer: `Rosier has ${total} active people across ${depts.length} departments:`, rows: depts.sort((a, b) => b._count.employees - a._count.employees).map((x) => `${x.name}: ${x._count.employees}`), links: [{ label: "Headcount report", href: "/reports?r=headcount" }] };
    },
  },
  {
    match: /document.*(expir|renew)|expir.*document|what.*expiring/i,
    run: async (v) => {
      if (!can(v, "documents.manage")) {
        if (!v.employeeId) return noEmployee;
        const mine = await db.employeeDocument.findMany({ where: { employeeId: v.employeeId, expiryDate: { lte: addDays(today(), 60) }, archivedAt: null } });
        return { answer: mine.length ? "These documents of yours expire soon:" : "None of your documents expire in the next 60 days.", rows: mine.map((d) => `${d.name} — ${fmtDate(d.expiryDate)}`), links: [{ label: "My documents", href: "/documents" }] };
      }
      const docs = await expiringDocuments(31);
      return { answer: docs.length ? `${docs.length} document${docs.length === 1 ? "" : "s"} expire${docs.length === 1 ? "s" : ""} within a month (or already have):` : "No documents expire in the next month.", rows: docs.map((d) => `${d.employee.firstName} ${d.employee.lastName} — ${d.name}, ${fmtDate(d.expiryDate)}`), links: [{ label: "Documents needing attention", href: "/documents?tab=attention" }] };
    },
  },
  {
    match: /new joiners?|who joined|joining (this|next) month/i,
    run: async (v) => {
      if (!can(v, "reports.view") && !can(v, "onboarding.manage")) return denied("joiner reports");
      const t = today();
      const start = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)), end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0));
      const e = await db.employee.findMany({ where: { joiningDate: { gte: start, lte: end } }, include: { designation: true, department: true } });
      return { answer: e.length ? `${e.length} new joiner${e.length === 1 ? "" : "s"} this month:` : "No new joiners this month.", rows: e.map((x) => `${x.firstName} ${x.lastName} — ${x.designation?.name}, ${x.department?.name} (${fmtDate(x.joiningDate, "d MMM")})`), links: [{ label: "Onboarding", href: "/onboarding" }] };
    },
  },
  {
    match: /birthday|anniversar/i,
    run: async (v) => {
      const e = await db.employee.findMany({ where: { status: { in: ["ACTIVE", "PROBATION", "NOTICE_PERIOD"] } }, select: { firstName: true, lastName: true, dateOfBirth: true } });
      const t = today();
      const soon = e.filter((x) => x.dateOfBirth).map((x) => { const d = new Date(Date.UTC(t.getUTCFullYear(), x.dateOfBirth!.getUTCMonth(), x.dateOfBirth!.getUTCDate())); if (d < t) d.setUTCFullYear(t.getUTCFullYear() + 1); return { x, d }; }).filter(({ d }) => d <= addDays(t, 7)).sort((a, b) => +a.d - +b.d);
      return { answer: soon.length ? "Birthdays in the next week:" : "No birthdays in the next week.", rows: soon.map(({ x, d }) => `${x.firstName} ${x.lastName} — ${fmtDate(d, "EEE d MMM")}`) };
    },
  },
];

async function policyAnswer(q: string): Promise<AssistAnswer | null> {
  const words = q.toLowerCase().replace(/\bwfh\b/g, "wfh work home").replace(/notice/g, "advance").split(/\W+/).filter((w) => w.length > 2 && !["what", "does", "have", "with", "when", "where", "policy", "rosier", "the", "how", "can", "for", "and", "our", "are", "you", "period"].includes(w));
  if (!words.length) return null;
  const policies = await db.policy.findMany();
  const scored = policies.map((p) => ({ p, s: words.reduce((a, w) => a + (p.body.toLowerCase().includes(w) ? 2 : 0) + (p.title.toLowerCase().includes(w) ? 3 : 0), 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  if (!scored.length) return null;
  const top = scored[0].p;
  // Optional: let Claude phrase the answer. Only company-wide policy text is sent — never employee data.
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 300, system: "You are Rosier Assist, an HR helper for Rosier Foods. Answer only from the policy text provided, in two or three friendly sentences. If the policy doesn't cover it, say so and suggest raising a helpdesk request.", messages: [{ role: "user", content: `Policies:\n${scored.slice(0, 2).map((x) => `## ${x.p.title}\n${x.p.body}`).join("\n\n")}\n\nQuestion: ${q}` }] }),
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) { const d = await r.json(); const text = d.content?.[0]?.text; if (text) return { answer: text, links: [{ label: top.title, href: `/me/policies#${top.id}` }] }; }
    } catch { /* fall back to the plain excerpt */ }
  }
  return { answer: `From the ${top.title}:`, rows: top.body.split("\n").filter(Boolean).slice(0, 4), links: [{ label: "Read the full policy", href: `/me/policies#${top.id}` }] };
}

export async function assist(v: Viewer, message: string): Promise<AssistAnswer> {
  const q = message.trim().slice(0, 400);
  for (const i of INTENTS) if (i.match.test(q)) return i.run(v, q);
  const p = await policyAnswer(q);
  if (p) return p;
  return {
    answer: "I'm not sure about that one yet. I can help with leave balances, payslips, holidays, your documents, your manager, attendance, team approvals and HR policies. For anything else, HR is a message away.",
    links: [{ label: "Raise a request", href: "/helpdesk?new=1" }],
  };
}
