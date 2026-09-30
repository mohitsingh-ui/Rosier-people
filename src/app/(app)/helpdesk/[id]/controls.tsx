"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTicket } from "@/server/helpdesk";
import { useToast } from "@/components/ui/toast";

export function TicketControls({ id, status, priority, assigneeId, agents }: { id: string; status: string; priority: string; assigneeId: string | null; agents: { value: string; label: string }[] }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const set = (patch: Record<string, string>) => start(async () => { const r = await updateTicket({ id, ...patch }); if (r.ok) { toast("success", r.message ?? "Updated"); router.refresh(); } else toast("error", r.error); });
  return (
    <div className="space-y-3" aria-busy={pending}>
      <div><label className="label">Status</label><select className="ctl" value={status} onChange={(e) => set({ status: e.target.value })} disabled={pending}>{["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_EMPLOYEE", "RESOLVED", "CLOSED"].map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase().replace(/_/g, " ")}</option>)}</select></div>
      <div><label className="label">Assigned to</label><select className="ctl" value={assigneeId ?? ""} onChange={(e) => set({ assigneeId: e.target.value })} disabled={pending}><option value="">Unassigned</option>{agents.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select></div>
      <div><label className="label">Priority</label><select className="ctl" value={priority} onChange={(e) => set({ priority: e.target.value })} disabled={pending}>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>)}</select></div>
    </div>
  );
}
