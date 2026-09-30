import Link from "next/link";
import { Download, BarChart3 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/viewer";
import { cn } from "@/lib/utils";
import { PageHeader, DashboardCard } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, TableWrap } from "@/components/ui/misc";
import { FilterDropdown, DateFilter } from "@/components/ui/filters";
import { Bars } from "@/components/charts/charts";
import { BarList } from "@/components/charts/static";
import { reportsFor, runReport } from "@/server/reports";

export const metadata = { title: "Reports" };

export default async function Reports({ searchParams }: { searchParams: Promise<{ r?: string; from?: string; to?: string; department?: string }> }) {
  const v = await requirePermission(["reports.view", "people.export"]);
  const sp = await searchParams;
  const list = reportsFor(v);
  const key = list.some((r) => r.key === sp.r) ? sp.r! : "headcount";
  const [result, depts] = await Promise.all([runReport(v, key, sp), db.department.findMany({ orderBy: { name: "asc" } })]);
  const groups = [...new Set(list.map((r) => r.group))];
  const qs = new URLSearchParams(Object.entries({ from: sp.from, to: sp.to, department: sp.department }).filter(([, x]) => x) as [string, string][]).toString();
  const exp = (f: string) => `/api/export/${key}?format=${f}${qs ? `&${qs}` : ""}`;
  const current = list.find((r) => r.key === key);
  return (
    <>
      <PageHeader title="Reports & analytics" description="Workforce, time, pay and compliance — filter, then export to CSV, Excel or PDF." />
      <div className="grid lg:grid-cols-[240px_1fr] gap-6">
        <nav className="card p-3 h-fit lg:sticky lg:top-20" aria-label="Reports">
          {groups.map((g) => (
            <div key={g} className="mb-3 last:mb-0">
              <div className="eyebrow px-2 py-1.5">{g}</div>
              <ul>{list.filter((r) => r.group === g).map((r) => (
                <li key={r.key}><Link href={`/reports?r=${r.key}${qs ? `&${qs}` : ""}`} className={cn("block rounded-lg px-2 py-1.5 text-[13.5px]", r.key === key ? "bg-brand-50 text-brand font-medium" : "text-ink-2 hover:bg-soft")}>{r.title}</Link></li>
              ))}</ul>
            </div>
          ))}
        </nav>
        <div className="space-y-5 min-w-0">
          <div className="card p-4 flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-48"><div className="font-semibold">{current?.title}</div><div className="text-[12.5px] text-muted">{current?.description}</div></div>
            <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">From <DateFilter param="from" label="From" /> to <DateFilter param="to" label="To" /></span>
            <FilterDropdown param="department" label="All departments" options={depts.map((d) => ({ value: d.id, label: d.name }))} />
            <div className="flex gap-1.5 w-full sm:w-auto">
              {["csv", "xlsx", "pdf"].map((f) => <ButtonLink key={f} href={exp(f)} prefetch={false} variant="secondary" size="sm"><Download className="size-3.5" />{f === "xlsx" ? "Excel" : f.toUpperCase()}</ButtonLink>)}
            </div>
          </div>
          {!result ? <div className="card"><EmptyState icon={BarChart3} title="No access to this report" /></div> : (
            <>
              {result.chart && result.chart.length > 0 && (
                <DashboardCard title={result.title} subtitle={result.summary}>
                  {result.chart.length > 8 ? <BarList data={result.chart} /> : <Bars data={result.chart} height={240} />}
                </DashboardCard>
              )}
              {!result.chart && result.summary && <p className="text-[13.5px] text-muted">{result.summary}</p>}
              {result.rows.length === 0 ? <div className="card"><EmptyState title="No data for these filters" /></div> : (
                <TableWrap>
                  <div className="px-4 py-2.5 border-b border-line text-[12.5px] text-muted">{result.rows.length} row{result.rows.length === 1 ? "" : "s"}{result.rows.length > 100 ? " · showing the first 100 — export for everything" : ""}</div>
                  <table className="tbl"><thead><tr>{result.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>
                    {result.rows.slice(0, 100).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={cn("whitespace-nowrap", typeof c === "number" && "tabular-nums text-right")}>{typeof c === "number" && c > 999 ? c.toLocaleString("en-IN") : c}</td>)}</tr>)}
                  </tbody></table>
                </TableWrap>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
