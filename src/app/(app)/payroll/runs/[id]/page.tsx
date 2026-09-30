import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, can } from "@/lib/auth/viewer";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { inr, num } from "@/lib/utils";
import { PageHeader, MetricCard } from "@/components/ui/card";
import { EmptyState, TableWrap } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/action-button";
import { processRun, markRunPaid } from "@/server/payroll";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await requirePermission("payroll.view_all");
  const { id } = await params;
  const run = await db.payrollRun.findUnique({ where: { id }, include: { payslips: { include: { employee: { include: { department: true } } }, orderBy: { employee: { firstName: "asc" } } } } });
  if (!run) notFound();
  const s = (k: "gross" | "totalDeductions" | "net" | "pf" | "tds" | "esi" | "professionalTax") => run.payslips.reduce((a, p) => a + num(p[k]), 0);
  const process = can(v, "payroll.process");
  const label = fmtDate(new Date(`${run.month}-01T00:00:00Z`), "MMMM yyyy");
  return (
    <>
      <PageHeader eyebrow={<Link href="/payroll?tab=runs" className="hover:text-brand">Payroll</Link>} title={`Payroll · ${label}`}
        description={<span className="inline-flex items-center gap-2"><StatusBadge status={run.status} />{run.workingDays} working days{run.processedAt ? ` · processed ${fmtDateTime(run.processedAt)}` : ""}{run.paidAt ? ` · paid ${fmtDate(run.paidAt)}` : ""}</span>}
        actions={<>
          <ButtonLink variant="secondary" href={`/api/export/payroll?format=xlsx`} prefetch={false}><Download className="size-4" />Register</ButtonLink>
          {process && run.status !== "PAID" && <ActionButton action={processRun} payload={{ id: run.id }} variant={run.status === "DRAFT" ? "primary" : "secondary"} size="md" confirm={{ title: run.status === "DRAFT" ? `Process ${label}?` : `Re-process ${label}?`, body: "Payslips are calculated from salary structures, unpaid leave and absences. Employees are notified.", confirmLabel: run.status === "DRAFT" ? "Process payroll" : "Re-process" }}>{run.status === "DRAFT" ? "Process payroll" : "Re-process"}</ActionButton>}
          {process && run.status === "PROCESSED" && <ActionButton action={markRunPaid} payload={{ id: run.id }} variant="primary" size="md" confirm={{ title: "Mark as paid?", body: "This locks the month. Payslips can no longer be changed.", confirmLabel: "Mark paid" }}>Mark as paid</ActionButton>}
        </>} />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <MetricCard label="Payslips" value={run.payslips.length} />
        <MetricCard label="Gross" value={inr(s("gross"))} />
        <MetricCard label="PF" value={inr(s("pf"))} />
        <MetricCard label="TDS" value={inr(s("tds"))} />
        <MetricCard label="Total deductions" value={inr(s("totalDeductions"))} />
        <MetricCard label="Net payroll" value={inr(s("net"))} />
      </div>
      {run.payslips.length === 0 ? <div className="card"><EmptyState title="Not processed yet" body={process ? "Process payroll to generate payslips for everyone with a salary structure." : "Payroll hasn't been processed for this month."} /></div> : (
        <TableWrap><table className="tbl"><thead><tr><th>Employee</th><th>Department</th><th>Paid days</th><th className="text-right">Gross</th><th className="text-right">PF</th><th className="text-right">ESI</th><th className="text-right">PT</th><th className="text-right">TDS</th><th className="text-right">Net</th><th /></tr></thead><tbody>
          {run.payslips.map((p) => (
            <tr key={p.id}><td className="whitespace-nowrap"><Link href={`/people/${p.employeeId}?tab=payroll`} className="hover:text-brand font-medium">{p.employee.firstName} {p.employee.lastName}</Link><span className="block text-[12px] text-muted">{p.employee.code}</span></td><td>{p.employee.department?.name}</td>
              <td>{p.paidDays}{p.lopDays ? <span className="text-bad text-[12px]"> ({p.lopDays} LOP)</span> : ""}</td>
              {[p.gross, p.pf, p.esi, p.professionalTax, p.tds].map((x, i) => <td key={i} className="text-right tabular-nums">{inr(x)}</td>)}
              <td className="text-right tabular-nums font-semibold">{inr(p.net)}</td><td className="text-right"><a href={`/api/payslips/${p.id}`} className="text-[13px] text-brand hover:underline">PDF</a></td></tr>
          ))}
        </tbody></table></TableWrap>
      )}
    </>
  );
}
