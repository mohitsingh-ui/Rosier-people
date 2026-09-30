import { Plus, Receipt, Paperclip } from "lucide-react";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/auth/viewer";
import { fmtDate, todayISO } from "@/lib/dates";
import { inr, num } from "@/lib/utils";
import { PageHeader, MetricCard } from "@/components/ui/card";
import { Tabs, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/action-button";
import { ApprovalCard } from "@/components/approvals/approval-card";
import { ExpenseForm } from "@/components/expenses/form";
import { decideExpense, markExpensePaid, withdrawExpense } from "@/server/expenses";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Expenses" };
type Exp = Prisma.ExpenseGetPayload<{ include: { items: { include: { category: true } }; employee: { include: { designation: true } } } }>;

function Items({ e }: { e: Exp }) {
  return (
    <ul className="mt-2 space-y-1 text-[12.5px]">{e.items.map((i) => (
      <li key={i.id} className="flex gap-2"><span className="text-muted w-16 shrink-0">{fmtDate(i.date, "d MMM")}</span><span className="flex-1 truncate">{i.category.name} · {i.description}</span><span className="tabular-nums">{inr(i.amount)}</span>{i.receiptKey ? <a href={`/api/attachments/receipt/${i.id}`} className="text-brand" aria-label="Receipt"><Paperclip className="size-3.5" /></a> : <span className="w-3.5" />}</li>
    ))}</ul>
  );
}

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ tab?: string; new?: string }> }) {
  const v = await requireViewer();
  const sp = await searchParams;
  const mgr = can(v, "expenses.approve_team") && v.teamIds.size > 0;
  const fin = can(v, "expenses.finance");
  const include = { items: { include: { category: true } }, employee: { include: { designation: true } } } as const;
  const [mine, teamPending, finPending, toPay, cats] = await Promise.all([
    v.employeeId ? db.expense.findMany({ where: { employeeId: v.employeeId }, include, orderBy: { createdAt: "desc" } }) : [],
    mgr ? db.expense.findMany({ where: { status: "PENDING", employeeId: { in: [...v.teamIds] } }, include, orderBy: { createdAt: "asc" } }) : [],
    fin ? db.expense.findMany({ where: { status: "MANAGER_APPROVED", NOT: { employeeId: v.employeeId ?? "" } }, include, orderBy: { createdAt: "asc" } }) : [],
    fin ? db.expense.findMany({ where: { status: "APPROVED" }, include, orderBy: { financeDecidedAt: "asc" } }) : [],
    db.expenseCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const tabs = [
    ...(v.employeeId ? [{ key: "mine", label: "My claims" }] : []),
    ...(mgr ? [{ key: "approvals", label: "Team approvals", count: teamPending.length }] : []),
    ...(fin ? [{ key: "finance", label: "Finance", count: finPending.length + toPay.length }] : []),
  ];
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : tabs[0]?.key ?? "mine";
  const sum = (s: string[]) => mine.filter((e) => s.includes(e.status)).reduce((a, e) => a + num(e.total), 0);

  return (
    <>
      <PageHeader title="Expenses" description="Claim back what you spend for work. Your manager approves, then finance pays out."
        actions={v.employeeId ? <Modal size="lg" title="New expense claim" trigger={<Button data-autoopen={sp.new ? "" : undefined}><Plus className="size-4" />New claim</Button>}><ExpenseForm today={todayISO()} categories={cats.map((c) => ({ value: c.id, label: c.name, limit: c.limit ? num(c.limit) : null }))} /></Modal> : null} />
      <Tabs tabs={tabs} active={tab} base="/expenses" />
      <div className="pt-5 space-y-5">
        {tab === "mine" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard label="Pending" value={inr(sum(["PENDING", "MANAGER_APPROVED"]))} />
              <MetricCard label="Approved, to be paid" value={inr(sum(["APPROVED"]))} />
              <MetricCard label="Paid" value={inr(sum(["PAID"]))} />
              <MetricCard label="Rejected" value={mine.filter((e) => e.status === "REJECTED").length} />
            </div>
            {mine.length === 0 ? <div className="card"><EmptyState icon={Receipt} title="No claims yet" body="Travel, food on shoots, office purchases — add receipts and submit in a minute." /></div> : (
              <ul className="space-y-3">{mine.map((e) => (
                <li key={e.id} className="card p-4 sm:p-5">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="font-semibold">{e.title}</span><StatusBadge status={e.status} label={e.status === "MANAGER_APPROVED" ? "With finance" : undefined} /></div><div className="text-[12.5px] text-muted">{e.number} · submitted {fmtDate(e.createdAt)}{e.paidAt ? ` · paid ${fmtDate(e.paidAt)}` : ""}</div></div>
                    <span className="text-[18px] font-semibold tabular-nums">{inr(e.total, 2)}</span>
                    {e.status === "PENDING" && <ActionButton action={withdrawExpense} payload={{ id: e.id }} variant="ghost" confirm={{ title: "Withdraw this claim?", confirmLabel: "Withdraw" }}>Withdraw</ActionButton>}
                  </div>
                  <Items e={e} />
                  {e.decisionNote && <p className="text-[12.5px] text-bad mt-2">{e.decisionNote}</p>}
                </li>
              ))}</ul>
            )}
          </>
        )}
        {tab === "approvals" && (teamPending.length === 0 ? <div className="card"><EmptyState icon={Receipt} title="No claims waiting for you" /></div> : (
          <ul className="space-y-3">{teamPending.map((e) => <ApprovalCard key={e.id} id={e.id} act={decideExpense} person={e.employee} title={<><span className="font-medium">{e.title}</span> · {inr(e.total, 2)}</>} meta={`${e.number} · ${e.items.length} item${e.items.length > 1 ? "s" : ""} · ${fmtDate(e.createdAt)}`} extra={<Items e={e} />} />)}</ul>
        ))}
        {tab === "finance" && (
          <>
            <h2 className="text-[15px]">Awaiting finance approval ({finPending.length})</h2>
            {finPending.length === 0 ? <p className="text-[13px] text-muted">Nothing waiting.</p> : <ul className="space-y-3">{finPending.map((e) => <ApprovalCard key={e.id} id={e.id} act={decideExpense} person={e.employee} title={<><span className="font-medium">{e.title}</span> · {inr(e.total, 2)}</>} meta={`${e.number} · manager approved ${fmtDate(e.managerDecidedAt)}`} extra={<Items e={e} />} />)}</ul>}
            <h2 className="text-[15px] pt-2">Approved — to be paid ({toPay.length})</h2>
            {toPay.length === 0 ? <p className="text-[13px] text-muted">All paid.</p> : (
              <div className="card divide-y divide-line">{toPay.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-5 py-3"><span className="flex-1"><span className="font-medium">{e.employee.firstName} {e.employee.lastName}</span> <span className="text-muted text-[13px]">· {e.number} · {e.title}</span></span><span className="tabular-nums font-semibold">{inr(e.total, 2)}</span><ActionButton action={markExpensePaid} payload={{ id: e.id }} variant="subtle" confirm={{ title: `Mark ${e.number} as paid?`, confirmLabel: "Mark paid" }}>Mark paid</ActionButton></div>
              ))}</div>
            )}
          </>
        )}
      </div>
    </>
  );
}
