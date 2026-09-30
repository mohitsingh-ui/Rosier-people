import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiViewer, json } from "@/lib/api";
import { can, type Viewer } from "@/lib/auth/viewer";
import { fileUrl } from "@/lib/storage";

// Attachments on requests (leave, WFH, tickets, expenses, onboarding tasks, tax proofs).
// Owner, their approvers and the relevant HR role only.
const mineOrTeam = (v: Viewer, employeeId: string, hrPerm: Parameters<typeof can>[1]) => employeeId === v.employeeId || v.teamIds.has(employeeId) || can(v, hrPerm);

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const v = await apiViewer();
  if (v instanceof Response) return v;
  const { kind, id } = await params;
  let key: string | null | undefined = null, owner = "", perm: Parameters<typeof can>[1] = "people.edit";
  if (kind === "leave") { const r = await db.leaveRequest.findUnique({ where: { id } }); key = r?.attachmentKey; owner = r?.employeeId ?? ""; perm = "leave.manage"; }
  else if (kind === "wfh") { const r = await db.wfhRequest.findUnique({ where: { id } }); key = r?.attachmentKey; owner = r?.employeeId ?? ""; perm = "attendance.manage"; }
  else if (kind === "ticket") { const r = await db.helpdeskTicket.findUnique({ where: { id } }); key = r?.attachmentKey; owner = r?.createdById ?? ""; perm = "helpdesk.manage"; }
  else if (kind === "comment") { const r = await db.ticketComment.findUnique({ where: { id }, include: { ticket: true } }); key = r?.isInternal && !can(v, "helpdesk.manage") ? null : r?.attachmentKey; owner = r?.ticket.createdById ?? ""; perm = "helpdesk.manage"; }
  else if (kind === "receipt") { const r = await db.expenseItem.findUnique({ where: { id }, include: { expense: true } }); key = r?.receiptKey; owner = r?.expense.employeeId ?? ""; perm = "expenses.finance"; }
  else if (kind === "onboarding") { const r = await db.onboardingTask.findUnique({ where: { id }, include: { onboarding: true } }); key = r?.attachmentKey; owner = r?.onboarding.employeeId ?? ""; perm = "onboarding.manage"; }
  else if (kind === "tax") { const r = await db.taxDocument.findUnique({ where: { id } }); key = r?.storageKey; owner = r?.employeeId ?? ""; perm = "payroll.view_all"; if (owner !== v.employeeId && !can(v, perm)) key = null; }
  else if (kind === "announcement-image" || kind === "announcement") {
    const r = await db.announcement.findUnique({ where: { id } });
    const visible = r && (r.audience === "ALL" || r.departmentId === v.employee?.departmentId || can(v, "announcements.manage"));
    const k = kind === "announcement" ? r?.attachmentKey : r?.imageUrl;
    if (!visible || !k) return json({ error: "Not found" }, 404);
    const ext = k.split(".").pop() ?? "";
    const type = ext === "pdf" ? "application/pdf" : ["png", "jpg", "jpeg", "webp"].includes(ext) ? `image/${ext === "jpg" ? "jpeg" : ext}` : "application/octet-stream";
    return NextResponse.redirect(new URL(await fileUrl(k, `announcement.${ext}`, type), _req.url));
  }
  else if (kind === "__legacy") { const r = await db.announcement.findUnique({ where: { id } }); if (r?.attachmentKey) return NextResponse.redirect(new URL(await fileUrl(r.attachmentKey, "attachment", "application/octet-stream"), _req.url)); return json({ error: "Not found" }, 404); }
  if (!key || !owner || !mineOrTeam(v, owner, perm)) return json({ error: "Not found" }, 404);
  const ext = key.split(".").pop() ?? "";
  const type = ext === "pdf" ? "application/pdf" : ["png", "jpg", "jpeg", "webp"].includes(ext) ? `image/${ext === "jpg" ? "jpeg" : ext}` : "application/octet-stream";
  return NextResponse.redirect(new URL(await fileUrl(key, `attachment.${ext}`, type), _req.url));
}
