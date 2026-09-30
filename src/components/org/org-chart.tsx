"use client";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Minus, Plus, Network, List, GripVertical, Search } from "lucide-react";
import { changeManager } from "@/server/people";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type OrgNode = { id: string; firstName: string; lastName: string; photoUrl: string | null; designation: string | null; department: string | null; managerId: string | null; managerName: string | null; status: string };

/** Interactive OrgChart. HR can drag a person onto their new manager (or use the keyboard-friendly selector). */
export function OrgChart({ people, canEdit, focusId }: { people: OrgNode[]; canEdit: boolean; focusId?: string }) {
  const [mode, setMode] = useState<"tree" | "list">("tree");
  const [zoom, setZoom] = useState(0.9);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const children = useMemo(() => {
    const m = new Map<string | null, OrgNode[]>();
    for (const p of people) {
      const key = p.managerId && people.some((x) => x.id === p.managerId) ? p.managerId : null;
      m.set(key, [...(m.get(key) ?? []), p]);
    }
    for (const list of m.values()) list.sort((a, b) => (m.get(b.id)?.length ?? 0) - (m.get(a.id)?.length ?? 0) || a.firstName.localeCompare(b.firstName));
    return m;
  }, [people]);
  const roots = children.get(null) ?? [];
  const scroller = useRef<HTMLDivElement>(null);
  // Start with leaders and their direct teams open; deeper branches collapsed.
  useEffect(() => {
    const deep = new Set<string>();
    const walk = (id: string, depth: number) => { const k = children.get(id) ?? []; if (depth >= 2 && k.length && !(focusId && isDescendant(id, focusId))) deep.add(id); k.forEach((c) => walk(c.id, depth + 1)); };
    roots.forEach((r) => walk(r.id, 0));
    setCollapsed(deep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const el = scroller.current;
    if (el && mode === "tree") el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [mode, collapsed, zoom]);
  const isDescendant = (a: string, b: string): boolean => (children.get(a) ?? []).some((c) => c.id === b || isDescendant(c.id, b));
  const match = q.trim().toLowerCase();

  const move = (id: string, managerId: string | null) => {
    const p = people.find((x) => x.id === id)!;
    const m = people.find((x) => x.id === managerId);
    if (p.managerId === managerId) return;
    if (managerId && (managerId === id || isDescendant(id, managerId))) return toast("error", "That would create a reporting loop.");
    if (!confirm(`Move ${p.firstName} ${p.lastName} to report to ${m ? `${m.firstName} ${m.lastName}` : "no one"}?`)) return;
    start(async () => {
      const r = await changeManager({ employeeId: id, managerId });
      if (r.ok) { toast("success", r.message ?? "Updated"); router.refresh(); } else toast("error", r.error);
    });
  };

  const card = (p: OrgNode) => {
    const kids = children.get(p.id) ?? [];
    const hit = match && `${p.firstName} ${p.lastName} ${p.designation} ${p.department}`.toLowerCase().includes(match);
    return (
      <div
        draggable={canEdit}
        onDragStart={(e) => { setDragId(p.id); e.dataTransfer.effectAllowed = "move"; }}
        onDragEnd={() => { setDragId(null); setOverId(null); }}
        onDragOver={(e) => { if (canEdit && dragId && dragId !== p.id) { e.preventDefault(); setOverId(p.id); } }}
        onDragLeave={() => setOverId((o) => (o === p.id ? null : o))}
        onDrop={(e) => { e.preventDefault(); if (dragId) move(dragId, p.id); setOverId(null); }}
        className={cn("relative w-[210px] rounded-card border bg-white p-3 shadow-card text-left transition-all",
          overId === p.id ? "border-brand-2 ring-2 ring-brand-2/30 scale-[1.02]" : "border-line", dragId === p.id && "opacity-40",
          (focusId === p.id || hit) && "ring-2 ring-brand-2", p.status === "PREBOARDING" && "border-dashed")}
      >
        {canEdit && <GripVertical className="absolute right-1.5 top-1.5 size-3.5 text-faint cursor-grab" aria-hidden />}
        <Link href={`/people/${p.id}`} className="flex items-center gap-2.5 group">
          <EmployeeAvatar employee={p} size={40} />
          <span className="min-w-0">
            <span className="block text-[13.5px] font-semibold truncate group-hover:text-brand">{p.firstName} {p.lastName}</span>
            <span className="block text-[11.5px] text-muted truncate">{p.designation}</span>
          </span>
        </Link>
        <div className="flex items-center justify-between mt-2.5 text-[11px]">
          <span className="rounded-full bg-soft px-2 py-0.5 text-ink-2 truncate max-w-[120px]">{p.department}</span>
          {kids.length > 0 && (
            <button type="button" onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} className="inline-flex items-center gap-0.5 text-muted hover:text-ink" aria-expanded={!collapsed.has(p.id)} aria-label={`${collapsed.has(p.id) ? "Show" : "Hide"} ${kids.length} direct reports`}>
              {kids.length} report{kids.length > 1 ? "s" : ""}{collapsed.has(p.id) ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
            </button>
          )}
        </div>
        {p.managerName && <div className="text-[10.5px] text-faint mt-1 truncate">Reports to {p.managerName}</div>}
        {canEdit && (
          <select aria-label={`Change ${p.firstName}'s manager`} className="sr-only focus:not-sr-only focus:mt-2 focus:w-full focus:ctl focus:h-8 focus:text-[12px]" value={p.managerId ?? ""} onChange={(e) => move(p.id, e.target.value || null)}>
            <option value="">No manager</option>
            {people.filter((x) => x.id !== p.id && !isDescendant(p.id, x.id)).map((x) => <option key={x.id} value={x.id}>{x.firstName} {x.lastName}</option>)}
          </select>
        )}
      </div>
    );
  };

  const tree = (p: OrgNode): React.ReactNode => {
    const kids = children.get(p.id) ?? [];
    return (
      <li key={p.id}>
        {card(p)}
        {kids.length > 0 && !collapsed.has(p.id) && <ul>{kids.map((k) => tree(k))}</ul>}
      </li>
    );
  };

  const listRow = (p: OrgNode, depth: number): React.ReactNode => {
    const kids = children.get(p.id) ?? [];
    const open = !collapsed.has(p.id);
    return (
      <Fragment key={p.id}>
        <li className="flex items-center gap-2 py-2 border-b border-line" style={{ paddingLeft: depth * 20 }}>
          {kids.length ? <button type="button" onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} aria-label="Toggle" className="p-0.5 text-muted">{open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</button> : <span className="w-5" />}
          <EmployeeAvatar employee={p} size={30} />
          <Link href={`/people/${p.id}`} className="min-w-0 flex-1"><span className="block text-[13.5px] font-medium truncate">{p.firstName} {p.lastName}</span><span className="block text-[12px] text-muted truncate">{p.designation} · {p.department}</span></Link>
          {kids.length > 0 && <span className="text-[11.5px] text-muted shrink-0">{kids.length}</span>}
        </li>
        {open && kids.map((k) => listRow(k, depth + 1))}
      </Fragment>
    );
  };

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line">
        <div className="relative flex-1 min-w-48 max-w-xs"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Highlight a person or team" className="ctl h-9 pl-9 text-[13px]" /></div>
        <div className="inline-flex rounded-ctl border border-line-2 p-0.5">
          <button type="button" onClick={() => setMode("tree")} aria-pressed={mode === "tree"} className={cn("h-8 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-[12.5px]", mode === "tree" ? "bg-brand-50 text-brand" : "text-muted")}><Network className="size-4" />Chart</button>
          <button type="button" onClick={() => setMode("list")} aria-pressed={mode === "list"} className={cn("h-8 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-[12.5px]", mode === "list" ? "bg-brand-50 text-brand" : "text-muted")}><List className="size-4" />List</button>
        </div>
        {mode === "tree" && (
          <div className="inline-flex items-center rounded-ctl border border-line-2">
            <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))} className="h-9 w-9 grid place-items-center text-muted hover:text-ink" aria-label="Zoom out"><Minus className="size-4" /></button>
            <span className="text-[12px] w-11 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(1.4, z + 0.1))} className="h-9 w-9 grid place-items-center text-muted hover:text-ink" aria-label="Zoom in"><Plus className="size-4" /></button>
          </div>
        )}
        <button type="button" onClick={() => setCollapsed(new Set())} className="text-[12.5px] text-brand hover:underline">Expand all</button>
        <button type="button" onClick={() => setCollapsed(new Set(people.filter((p) => (children.get(p.id)?.length ?? 0) > 0 && !roots.some((r) => r.id === p.id)).map((p) => p.id)))} className="text-[12.5px] text-brand hover:underline">Collapse to leaders</button>
        {canEdit && <span className="text-[12px] text-muted ml-auto">{pending ? "Saving…" : "Drag a card onto someone to change who they report to"}</span>}
      </div>
      {mode === "tree" ? (
        <div ref={scroller} className="overflow-auto p-6 min-h-[60vh] max-h-[78vh] bg-[radial-gradient(circle,var(--color-line)_1px,transparent_1px)] [background-size:18px_18px]">
          <div className="w-max min-w-full text-center">
            <div className="org-tree inline-block text-left origin-top" style={{ zoom }}>
              <ul>{roots.map((r) => tree(r))}</ul>
            </div>
          </div>
        </div>
      ) : (
        <ul className="px-4 pb-2">{roots.map((r) => listRow(r, 0))}</ul>
      )}
    </div>
  );
}
