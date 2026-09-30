import Link from "next/link";
import { Plus, Wallet, Download, Pencil, FileText } from "lucide-react";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/auth/viewer";
import { currentMonth, fmtDate, isoOf, today } from "@/lib/dates";
import { humanize, inr, num } from "@/lib/utils";
import { PageHeader, Section, MetricCard, DashboardCard } from "@/components/ui/card";
import { Tabs, EmptyState, TableWrap } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/action-button";
import { AreaTrend } from "@/components/charts/charts";
import { SalaryForm, NewRunForm, TaxForm } from "@/components/payroll/forms";
import { SearchBar } from "@/components/ui/filters";
import { reviewTaxDocument } from "@/server/payroll";

export const metadata = { title: "Payroll" };
const fyNow = () => { const t = today(); const y = t.getUTCMonth() >= 3 ? t.getUTCFullYear() : t.getUTCFullYear() - 1; return `${y}-${String(y + 1).slice(2)}`; };
const monthLabel = (m: string) => fmtDate(new Date(`${m}-01T00:00:00Z`), "MMMM yyyy");

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const v = await requireViewer();
  const sp = await searchParams;
  const all = can(v, "payroll.view_all");
  const tabs = [
    ...(v.employeeId ? [{ key: "mine", label: "My pay" }, { key: "tax", label: "Tax documents" }] : []),
    ...(all ? [{ key: "runs", label: "Payroll runs" }, { key: "salaries", label: "Salaries" }, { key: "declarations", label: "Declarations" }] : []),
  ];
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : all ? "runs" : tabs[0].key;
  return (
    <>
      <PageHeader title="Payroll" description={all ? "Salary structures, monthly runs, payslips and tax documents. Everything here is confidential." : "Your salary, payslips and tax documents. Only you and payroll can see these."} />
      <Tabs tabs={tabs} active={tab} base="/payroll" />
      <div className="pt-5">
        {tab === "mine" && <Mine />}
        {tab === "tax" && <Tax />}
        {tab === "runs" && <Runs />}
        {tab === "salaries" && <Salaries />}
        {tab === "declarations" && <Declarations />}
      </div>
    </>
  );

  async function Mine() {
    const [p, slips] = await Promise.all([
      db.payrollProfile.findUnique({ where: { employeeId: v.employeeId! } }),
      db.payslip.findMany({ where: { employeeId: v.employeeId!, run: { status: { not: "DRAFT" } } }, include: { run: true }, orderBy: { run: { month: "desc" } } }),
    ]);
    if (!p) return <div className="card"><EmptyState icon={Wallet} title="Your salary isn't set up yet" body="Payroll adds this before your first pay run." /></div>;
    const last = slips[0];
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Annual CTC" value={inr(p.annualCtc)} />
          <MetricCard label="Monthly gross" value={inr(num(p.monthlyBasic) + num(p.monthlyHra) + num(p.monthlySpecial) + num(p.monthlyOther))} />
          <MetricCard label={`Net pay${last ? ` · ${fmtDate(new Date(`${last.run.month}-01T00:00:00Z`), "MMM")}` : ""}`} value={last ? inr(last.net) : "—"} />
          <MetricCard label="Bank" value={<span className="text-[18px]">{p.bankName} ••{p.accountLast4}</span>} />
        </div>
        {last && (
          <div className="grid lg:grid-cols-3 gap-6">
            <DashboardCard title={`Payslip · ${monthLabel(last.run.month)}`} className="lg:col-span-2" action={<a href={`/api/payslips/${last.id}`} className="text-[13px] text-brand hover:underline inline-flex items-center gap-1"><Download className="size-3.5" />PDF</a>}>
              <div className="grid sm:grid-cols-2 gap-6 text-[13.5px]">
                <table className="w-full"><tbody className="divide-y divide-line">
                  <tr><td colSpan={2} className="eyebrow pb-2">Earnings</td></tr>
                  {[["Basic", last.basic], ["HRA", last.hra], ["Special allowance", last.special], ["Other allowances", last.other], ["Bonus", last.bonus]].filter(([, x]) => num(x as never)).map(([l, x]) => <tr key={l as string}><td className="py-1.5 text-ink-2">{l as string}</td><td className="py-1.5 text-right tabular-nums">{inr(x as never, 2)}</td></tr>)}
                  <tr><td className="py-2 font-semibold">Gross</td><td className="py-2 text-right font-semibold tabular-nums">{inr(last.gross, 2)}</td></tr>
                </tbody></table>
                <table className="w-full"><tbody className="divide-y divide-line">
                  <tr><td colSpan={2} className="eyebrow pb-2">Deductions</td></tr>
                  {[["PF", last.pf], ["ESI", last.esi], ["Professional tax", last.professionalTax], ["TDS", last.tds]].map(([l, x]) => <tr key={l as string}><td className="py-1.5 text-ink-2">{l as string}</td><td className="py-1.5 text-right tabular-nums">{inr(x as never, 2)}</td></tr>)}
                  <tr><td className="py-2 font-semibold">Total</td><td className="py-2 text-right font-semibold tabular-nums">{inr(last.totalDeductions, 2)}</td></tr>
                </tbody></table>
              </div>
              <div className="mt-5 rounded-ctl bg-brand text-white px-4 py-3 flex justify-between items-center"><span>Net pay · {last.paidDays} paid days{last.lopDays ? ` (${last.lopDays} LOP)` : ""}</span><span className="text-[20px] font-semibold tabular-nums">{inr(last.net, 2)}</span></div>
            </DashboardCard>
            <DashboardCard title="Net pay trend"><AreaTrend data={[...slips].reverse().map((s) => ({ label: fmtDate(new Date(`${s.run.month}-01T00:00:00Z`), "MMM"), value: Math.round(num(s.net)) }))} unit="₹" height={200} /></DashboardCard>
          </div>
        )}
        <Section title="All payslips">
          {slips.length ? <ul className="divide-y divide-line -my-2">{slips.map((s) => (
            <li key={s.id} className="py-2.5 flex items-center gap-3 text-[13.5px]"><FileText className="size-4 text-brand" /><span className="flex-1 font-medium">{monthLabel(s.run.month)}</span><span className="tabular-nums text-muted hidden sm:block">Gross {inr(s.gross)}</span><span className="tabular-nums font-semibold">{inr(s.net)}</span><a href={`/api/payslips/${s.id}`} className="text-brand hover:underline text-[13px]">Download</a></li>
          ))}</ul> : <p className="text-[13px] text-muted">No payslips yet.</p>}
        </Section>
      </div>
    );
  }

  async function Tax() {
    const docs = await db.taxDocument.findMany({ where: { employeeId: v.employeeId! }, orderBy: { createdAt: "desc" } });
    const fy = fyNow();
    const declared = docs.filter((d) => d.financialYear === fy && d.kind !== "FORM_16").reduce((a, d) => a + num(d.amount), 0);
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13.5px] text-muted">FY {fy}: <span className="text-ink font-medium">{inr(declared)}</span> declared so far.</p>
          <Modal title="Submit a declaration or proof" trigger={<Button><Plus className="size-4" />Declare / upload proof</Button>}><TaxForm fy={fy} /></Modal>
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Section title="Form 16">{docs.filter((d) => d.kind === "FORM_16").length ? <ul className="space-y-2">{docs.filter((d) => d.kind === "FORM_16").map((d) => <li key={d.id} className="flex justify-between text-[13.5px]"><span>{d.title}</span>{d.storageKey ? <a href={`/api/attachments/tax/${d.id}`} className="text-brand hover:underline">Download</a> : <span className="text-muted">Issued</span>}</li>)}</ul> : <p className="text-[13px] text-muted">Issued by payroll after the financial year closes.</p>}</Section>
          <Section title="Declarations & proofs">{docs.filter((d) => d.kind !== "FORM_16").length ? <ul className="divide-y divide-line -my-2">{docs.filter((d) => d.kind !== "FORM_16").map((d) => <li key={d.id} className="py-2.5 flex items-center gap-3 text-[13.5px]"><span className="flex-1">{d.title}<span className="block text-[12px] text-muted">{humanize(d.kind)} · {d.section} · FY {d.financialYear}</span></span><span className="tabular-nums">{inr(d.amount)}</span><StatusBadge status={d.status} /></li>)}</ul> : <p className="text-[13px] text-muted">Nothing submitted yet.</p>}</Section>
        </div>
      </div>
    );
  }

  async function Runs() {
    const runs = await db.payrollRun.findMany({ include: { payslips: { select: { gross: true, totalDeductions: true, net: true } } }, orderBy: { month: "desc" } });
    const active = await db.employee.count({ where: { status: { in: ["ACTIVE", "PROBATION", "NOTICE_PERIOD"] } } });
    const sum = (r: (typeof runs)[number], k: "gross" | "totalDeductions" | "net") => r.payslips.reduce((a, p) => a + num(p[k]), 0);
    const cur = runs[0];
    const process = can(v, "payroll.process");
    return (
      <div className="space-y-6">
        {cur && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <MetricCard label="Payroll month" value={<span className="text-[20px]">{monthLabel(cur.month)}</span>} hint={<StatusBadge status={cur.status} />} href={`/payroll/runs/${cur.id}`} />
            <MetricCard label="Employees" value={cur.payslips.length || active} hint={cur.payslips.length ? "payslips" : "active, to be processed"} />
            <MetricCard label="Gross payroll" value={inr(sum(cur, "gross"))} />
            <MetricCard label="Deductions" value={inr(sum(cur, "totalDeductions"))} />
            <MetricCard label="Net payroll" value={inr(sum(cur, "net"))} />
            <MetricCard label="Pending processing" value={runs.filter((r) => r.status === "DRAFT").length} hint={`${runs.filter((r) => r.status !== "DRAFT").length} processed`} />
          </div>
        )}
        <div className="grid lg:grid-cols-3 gap-6">
          <DashboardCard title="Gross payroll by month" className="lg:col-span-2"><AreaTrend data={[...runs].reverse().filter((r) => r.payslips.length).map((r) => ({ label: fmtDate(new Date(`${r.month}-01T00:00:00Z`), "MMM yy"), value: Math.round(sum(r, "gross")) }))} unit="₹" /></DashboardCard>
          <DashboardCard title="Runs" action={process ? <Modal title="Open a payroll month" trigger={<Button size="sm"><Plus className="size-3.5" />New run</Button>}><NewRunForm month={currentMonth()} /></Modal> : null}>
            <ul className="divide-y divide-line -my-2">{runs.map((r) => (
              <li key={r.id}><Link href={`/payroll/runs/${r.id}`} className="py-2.5 flex items-center justify-between gap-2 hover:text-brand"><span className="text-[13.5px] font-medium">{monthLabel(r.month)}</span><span className="flex items-center gap-2"><span className="text-[12.5px] text-muted tabular-nums">{r.payslips.length ? inr(sum(r, "net")) : ""}</span><StatusBadge status={r.status} /></span></Link></li>
            ))}</ul>
          </DashboardCard>
        </div>
      </div>
    );
  }

  async function Salaries() {
    const q = sp.q?.trim();
    const emps = await db.employee.findMany({ where: { status: { notIn: ["EXITED"] }, ...(q ? { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}) }, include: { payrollProfile: true, department: true, designation: true }, orderBy: { firstName: "asc" } });
    const process = can(v, "payroll.process");
    return (
      <div className="space-y-4">
        <SearchBar placeholder="Search employee" className="max-w-md" />
        <TableWrap><table className="tbl"><thead><tr><th>Employee</th><th>Department</th><th className="text-right">Annual CTC</th><th className="text-right">Monthly gross</th><th>Bank</th><th>PF / ESI</th><th>Effective</th>{process && <th />}</tr></thead><tbody>
          {emps.map((e) => { const p = e.payrollProfile; return (
            <tr key={e.id}>
              <td><Link href={`/people/${e.id}?tab=payroll`} className="flex items-center gap-2.5 group"><EmployeeAvatar employee={e} size={30} /><span><span className="block font-medium group-hover:text-brand">{e.firstName} {e.lastName}</span><span className="block text-[12px] text-muted">{e.designation?.name}</span></span></Link></td>
              <td>{e.department?.name}</td>
              <td className="text-right tabular-nums">{p ? inr(p.annualCtc) : <span className="text-bad text-[12.5px]">Not set</span>}</td>
              <td className="text-right tabular-nums">{p ? inr(num(p.monthlyBasic) + num(p.monthlyHra) + num(p.monthlySpecial) + num(p.monthlyOther)) : "—"}</td>
              <td className="text-[12.5px]">{p?.bankName ? `${p.bankName} ••${p.accountLast4}` : "—"}</td>
              <td className="text-[12.5px]">{p ? `${p.pfEnabled ? "PF" : "—"} / ${p.esiEnabled ? "ESI" : "—"}` : "—"}</td>
              <td className="text-[12.5px] text-muted">{p ? fmtDate(p.effectiveFrom) : "—"}</td>
              {process && <td className="text-right"><Modal size="lg" title={`Salary — ${e.firstName} ${e.lastName}`} trigger={<Button variant="ghost" size="iconSm" aria-label="Edit salary"><Pencil className="size-3.5" /></Button>}>
                <SalaryForm employeeId={e.id} today={isoOf(today())} p={p ? { annualCtc: num(p.annualCtc), monthlyBasic: num(p.monthlyBasic), monthlyHra: num(p.monthlyHra), monthlySpecial: num(p.monthlySpecial), monthlyOther: num(p.monthlyOther), bankName: p.bankName, ifsc: p.ifsc, uan: p.uan, esicNumber: p.esicNumber, pfEnabled: p.pfEnabled, esiEnabled: p.esiEnabled, taxRegime: p.taxRegime, accountLast4: p.accountLast4 } : undefined} />
              </Modal></td>}
            </tr>
          ); })}
        </tbody></table></TableWrap>
      </div>
    );
  }

  async function Declarations() {
    const [docs, emps] = await Promise.all([db.taxDocument.findMany({ include: { employee: true }, orderBy: { createdAt: "desc" }, take: 100 }), db.employee.findMany({ where: { status: { notIn: ["PREBOARDING"] } }, orderBy: { firstName: "asc" } })]);
    return (
      <div className="space-y-4">
        {can(v, "payroll.process") && <div className="flex justify-end"><Modal title="Issue Form 16" trigger={<Button variant="secondary"><Plus className="size-4" />Issue Form 16</Button>}><TaxForm fy={`${Number(fyNow().slice(0, 4)) - 1}-${fyNow().slice(2, 4)}`} employees={emps.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` }))} /></Modal></div>}
        {docs.length === 0 ? <div className="card"><EmptyState title="No declarations yet" /></div> : (
          <TableWrap><table className="tbl"><thead><tr><th>Employee</th><th>Type</th><th>Section</th><th>Description</th><th className="text-right">Amount</th><th>FY</th><th>Status</th><th /></tr></thead><tbody>
            {docs.map((d) => <tr key={d.id}><td>{d.employee.firstName} {d.employee.lastName}</td><td>{humanize(d.kind)}</td><td>{d.section ?? "—"}</td><td>{d.title}</td><td className="text-right tabular-nums">{inr(d.amount)}</td><td>{d.financialYear}</td><td><StatusBadge status={d.status} /></td>
              <td className="text-right whitespace-nowrap">{d.storageKey && <a href={`/api/attachments/tax/${d.id}`} className="text-[13px] text-brand hover:underline mr-2">File</a>}{d.status === "SUBMITTED" && <><ActionButton action={reviewTaxDocument} payload={{ id: d.id, decision: "APPROVED" }} variant="subtle">Verify</ActionButton> <ActionButton action={reviewTaxDocument} payload={{ id: d.id, decision: "REJECTED" }} variant="ghost" confirm={{ title: "Reject this?", confirmLabel: "Reject", danger: true, note: { label: "Reason", required: true } }}>Reject</ActionButton></>}</td></tr>)}
          </tbody></table></TableWrap>
        )}
      </div>
    );
  }
}
