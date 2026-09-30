"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { action, UserError, zBool, zId, zOptText, zText } from "@/lib/action";
import { assertCan, AuthzError, can, type Viewer } from "@/lib/auth/viewer";
import { audit } from "@/lib/audit";
import { storeUpload } from "@/lib/storage";
import { notifyEmployees, notifyPermission } from "@/lib/notify";
import { dateOnly, today } from "@/lib/dates";
import { inr } from "@/lib/utils";
import { nextNumber } from "@/lib/db-helpers";

const who = (v: Viewer) => (v.employee ? `${v.employee.firstName} ${v.employee.lastName}` : v.email);
const Item = z.object({ categoryId: zId, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"), description: z.string().trim().min(2, "Describe the expense").max(200), amount: z.coerce.number().positive("Amount must be more than 0").max(1e7) });

export const submitExpense = action(
  z.object({ title: zText(120), items: z.string().transform((s, ctx) => { try { return JSON.parse(s); } catch { ctx.addIssue({ code: "custom", message: "Bad items" }); return z.NEVER; } }).pipe(z.array(Item).min(1, "Add at least one item").max(30)) }).catchall(z.unknown()),
  async (input, v) => {
    if (!v.employeeId) throw new UserError("No employee record.");
    for (const it of input.items) if (dateOnly(it.date) > today()) throw new UserError("Expense dates can't be in the future.");
    const cats = await db.expenseCategory.findMany({ where: { id: { in: input.items.map((i) => i.categoryId) } } });
    const warnings = input.items.filter((i) => { const c = cats.find((x) => x.id === i.categoryId); return c?.limit && i.amount > Number(c.limit); }).map((i) => cats.find((c) => c.id === i.categoryId)!.name);
    const receipts = await Promise.all(input.items.map((_, idx) => { const f = input[`receipt_${idx}`]; return f instanceof File && f.size ? storeUpload(f, `expenses/${v.employeeId}`) : null; }));
    const me = await db.employee.findUniqueOrThrow({ where: { id: v.employeeId } });
    const total = input.items.reduce((a, i) => a + i.amount, 0);
    const e = await db.expense.create({
      data: {
        number: await nextNumber("expenses", "EXP", 1041), employeeId: me.id, title: input.title, total, managerId: me.managerId, status: me.managerId ? "PENDING" : "MANAGER_APPROVED", managerDecidedAt: me.managerId ? null : new Date(),
        items: { create: input.items.map((i, idx) => ({ categoryId: i.categoryId, date: dateOnly(i.date), description: i.description, amount: i.amount, receiptKey: receipts[idx]?.storageKey })) },
      },
    });
    if (me.managerId) await notifyEmployees([me.managerId], { type: "expense.submitted", title: `Expense claim from ${me.firstName}`, body: `${input.title} — ${inr(total)}`, link: "/expenses?tab=approvals" });
    else await notifyPermission("expenses.finance", { type: "expense.submitted", title: `Claim ${e.number} awaits finance approval`, link: "/expenses?tab=finance" });
    await audit(v, { action: "expense.submit", entity: "Expense", entityId: e.id, summary: `${who(v)} submitted ${e.number} (${inr(total)}).` });
    revalidatePath("/expenses");
    return { ok: true as const, message: `Claim ${e.number} submitted${warnings.length ? `. Note: over the policy limit for ${warnings.join(", ")}` : ""}.` };
  },
);

export const decideExpense = action(z.object({ id: zId, decision: z.enum(["APPROVED", "REJECTED"]), note: zOptText(400) }), async (i, v) => {
  const e = await db.expense.findUniqueOrThrow({ where: { id: i.id }, include: { employee: true } });
  if (e.employeeId === v.employeeId) throw new AuthzError("You can't approve your own claim.");
  let next: "MANAGER_APPROVED" | "APPROVED" | "REJECTED";
  if (e.status === "PENDING") {
    if (!(can(v, "expenses.approve_team") && v.teamIds.has(e.employeeId)) && !can(v, "expenses.finance")) throw new AuthzError();
    next = i.decision === "REJECTED" ? "REJECTED" : "MANAGER_APPROVED";
  } else if (e.status === "MANAGER_APPROVED") {
    assertCan(v, "expenses.finance");
    next = i.decision === "REJECTED" ? "REJECTED" : "APPROVED";
  } else throw new UserError("This claim was already decided.");
  await db.expense.update({ where: { id: e.id }, data: { status: next, decisionNote: i.note ?? e.decisionNote, ...(e.status === "PENDING" ? { managerDecidedAt: new Date() } : { financeDecidedAt: new Date(), financeDecidedById: v.userId }) } });
  await notifyEmployees([e.employeeId], { type: "expense.decided", title: `${e.number} ${next === "REJECTED" ? "was declined" : next === "APPROVED" ? "approved by finance — payout next" : "approved by your manager"}`, body: i.note, link: "/expenses" });
  if (next === "MANAGER_APPROVED") await notifyPermission("expenses.finance", { type: "expense.submitted", title: `Claim ${e.number} awaits finance approval`, body: `${e.employee.firstName} ${e.employee.lastName} — ${inr(e.total)}`, link: "/expenses?tab=finance" });
  await audit(v, { action: `expense.${next.toLowerCase()}`, entity: "Expense", entityId: e.id, summary: `${who(v)} ${next === "REJECTED" ? "rejected" : "approved"} ${e.employee.firstName}'s claim ${e.number} (${inr(e.total)}).` });
  revalidatePath("/expenses");
  return { ok: true as const, message: next === "REJECTED" ? "Declined." : "Approved." };
});

export const markExpensePaid = action(z.object({ id: zId }), async (i, v) => {
  assertCan(v, "expenses.finance");
  const e = await db.expense.findUniqueOrThrow({ where: { id: i.id } });
  if (e.status !== "APPROVED") throw new UserError("Only approved claims can be paid.");
  await db.expense.update({ where: { id: e.id }, data: { status: "PAID", paidAt: new Date() } });
  await notifyEmployees([e.employeeId], { type: "expense.decided", title: `${e.number} has been paid`, body: inr(e.total), link: "/expenses" });
  await audit(v, { action: "expense.paid", entity: "Expense", entityId: e.id, summary: `${who(v)} marked ${e.number} as paid.` });
  revalidatePath("/expenses");
  return { ok: true as const, message: "Marked paid." };
});

export const withdrawExpense = action(z.object({ id: zId }), async (i, v) => {
  const e = await db.expense.findUniqueOrThrow({ where: { id: i.id } });
  if (e.employeeId !== v.employeeId) throw new AuthzError();
  if (e.status !== "PENDING") throw new UserError("Only pending claims can be withdrawn.");
  await db.expense.delete({ where: { id: e.id } });
  revalidatePath("/expenses");
  return { ok: true as const, message: "Claim withdrawn." };
});

export const saveExpenseCategory = action(z.object({ id: z.string().optional(), name: zText(60), limit: z.coerce.number().min(0).optional(), isActive: zBool }), async (i, v) => {
  assertCan(v, "settings.manage");
  const data = { name: i.name, limit: i.limit || null, isActive: i.isActive };
  if (i.id) await db.expenseCategory.update({ where: { id: i.id }, data }); else await db.expenseCategory.create({ data });
  await audit(v, { action: "expense_category.save", entity: "ExpenseCategory", summary: `${who(v)} saved expense category ${i.name}.` });
  revalidatePath("/settings");
  return { ok: true as const, message: "Category saved." };
});
