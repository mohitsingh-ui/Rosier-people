"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, Input, Submit, FormActions } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { submitExpense } from "@/server/expenses";
import { inr } from "@/lib/utils";

type Row = { key: number; categoryId: string; date: string; description: string; amount: string };

export function ExpenseForm({ categories, today }: { categories: { value: string; label: string; limit: number | null }[]; today: string }) {
  const [rows, setRows] = useState<Row[]>([{ key: 1, categoryId: categories[0]?.value ?? "", date: today, description: "", amount: "" }]);
  const set = (k: number, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.key === k ? { ...x, ...patch } : x)));
  const total = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  return (
    <ActionForm action={submitExpense} success="Claim submitted">
      <Input label="Claim title" name="title" required placeholder="e.g. Farm shoot travel" />
      <input type="hidden" name="items" value={JSON.stringify(rows.map(({ categoryId, date, description, amount }) => ({ categoryId, date, description, amount: Number(amount) })))} />
      <div className="space-y-3">
        {rows.map((r, idx) => {
          const cat = categories.find((c) => c.value === r.categoryId);
          const over = cat?.limit && Number(r.amount) > cat.limit;
          return (
            <fieldset key={r.key} className="rounded-ctl border border-line p-3.5 space-y-3">
              <div className="flex items-center justify-between"><legend className="text-[12.5px] font-semibold text-muted">Item {idx + 1}</legend>{rows.length > 1 && <button type="button" onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))} className="p-1 text-muted hover:text-bad" aria-label="Remove item"><Trash2 className="size-4" /></button>}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div><label className="label">Category</label><select className="ctl" value={r.categoryId} onChange={(e) => set(r.key, { categoryId: e.target.value })}>{categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                <div><label className="label">Date</label><input type="date" className="ctl" max={today} value={r.date} onChange={(e) => set(r.key, { date: e.target.value })} required /></div>
                <div className="col-span-2 sm:col-span-1"><label className="label">Amount (₹)</label><input type="number" min="1" step="0.01" className="ctl" value={r.amount} onChange={(e) => set(r.key, { amount: e.target.value })} required aria-invalid={!!over} />{over ? <p className="text-[11.5px] text-warn mt-1">Over the {inr(cat!.limit)} policy limit</p> : null}</div>
              </div>
              <div><label className="label">Description</label><input className="ctl" value={r.description} onChange={(e) => set(r.key, { description: e.target.value })} required placeholder="What was it for?" /></div>
              <div><label className="label">Receipt</label><input type="file" name={`receipt_${idx}`} accept=".pdf,.png,.jpg,.jpeg,.webp" className="block w-full text-[13px] file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-brand file:font-medium" /></div>
            </fieldset>
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <Button variant="secondary" size="sm" onClick={() => setRows((r) => [...r, { key: Date.now(), categoryId: categories[0]?.value ?? "", date: today, description: "", amount: "" }])}><Plus className="size-3.5" />Add item</Button>
        <span className="text-[14px]">Total <strong className="tabular-nums">{inr(total, 2)}</strong></span>
      </div>
      <FormActions><Submit>Submit claim</Submit></FormActions>
    </ActionForm>
  );
}
