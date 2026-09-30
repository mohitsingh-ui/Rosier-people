"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, User, FileText, Building2, Megaphone, LifeBuoy, Laptop, BookOpen, Target, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav";

type Result = { group: string; title: string; subtitle?: string; href: string };
const GROUP_ICONS: Record<string, typeof User> = { People: User, Documents: FileText, Departments: Building2, Announcements: Megaphone, Helpdesk: LifeBuoy, Assets: Laptop, Policies: BookOpen, Goals: Target, "Go to": ArrowRight };

export function openSearch() { window.dispatchEvent(new Event("rp:search")); }

/** Global search (Cmd/Ctrl + K). Results come from /api/search, which applies the caller's permissions. */
export function CommandPalette({ nav }: { nav: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("rp:search", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("rp:search", onOpen); };
  }, []);
  useEffect(() => { if (open) { setTimeout(() => input.current?.focus(), 10); } else { setQ(""); setResults([]); } }, [open]);
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const ctl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        .then((r) => r.json()).then((d) => { setResults(d.results ?? []); setIdx(0); })
        .catch(() => {}).finally(() => setLoading(false));
    }, 180);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  const list: Result[] = useMemo(() => {
    if (q.trim().length >= 2) return results;
    return nav.map((n) => ({ group: "Go to", title: n.label, href: n.href }));
  }, [q, results, nav]);

  const go = (r: Result) => { setOpen(false); router.push(r.href); };
  if (!open) return null;

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-3 sm:pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search">
      <div className="absolute inset-0 bg-ink/35" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-xl card shadow-pop overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-line">
          <Search className="size-4.5 text-muted" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, documents, tickets, assets, policies…"
            className="flex-1 h-13 py-4 bg-transparent outline-none text-[15px] placeholder:text-faint"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, list.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              if (e.key === "Enter" && list[idx]) go(list[idx]);
            }} aria-controls="search-results" aria-activedescendant={list[idx] ? `sr-${idx}` : undefined} />
          {loading && <span className="size-3.5 rounded-full border-2 border-faint border-r-transparent animate-spin" />}
          <kbd className="hidden sm:inline text-[11px] text-muted border border-line rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <ul id="search-results" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
          {list.length === 0 && q.trim().length >= 2 && !loading && <li className="px-3 py-8 text-center text-muted text-[13.5px]">No results for “{q}”</li>}
          {list.map((r, i) => {
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            const Icon = GROUP_ICONS[r.group] ?? ArrowRight;
            return (
              <li key={`${r.href}-${i}`}>
                {header && <div className="eyebrow px-3 pt-3 pb-1.5">{header}</div>}
                <button id={`sr-${i}`} role="option" aria-selected={i === idx} onMouseEnter={() => setIdx(i)} onClick={() => go(r)}
                  className={cn("w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left", i === idx ? "bg-brand-50" : "")}>
                  <Icon className="size-4 text-muted shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] text-ink truncate">{r.title}</span>
                    {r.subtitle && <span className="block text-[12px] text-muted truncate">{r.subtitle}</span>}
                  </span>
                  {i === idx && <CornerDownLeft className="size-3.5 text-muted" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
