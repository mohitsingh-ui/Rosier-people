"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type N = { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string; type: string };

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function NotificationPanel({ initialUnread }: { initialUnread: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<N[] | null>(null);
  const [unread, setUnread] = useState(initialUnread);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setUnread(initialUnread); }, [initialUnread]);
  useEffect(() => {
    if (!open) return;
    fetch("/api/notifications").then((r) => r.json()).then((d) => { setItems(d.notifications); setUnread(d.unread); });
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const markAll = async () => {
    await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
    setItems((s) => s?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null);
    setUnread(0);
  };
  const markOne = (id: string) => fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative size-9 grid place-items-center rounded-ctl text-ink-2 hover:bg-soft" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open}>
        <Bell className="size-[18px]" />
        {unread > 0 && <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-bad text-white text-[10px] font-semibold grid place-items-center">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="fixed sm:absolute inset-x-3 sm:inset-x-auto top-16 sm:top-11 sm:right-0 sm:w-[380px] card shadow-pop z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <h2 className="text-[14.5px] font-semibold">Notifications</h2>
            {unread > 0 && <button onClick={markAll} className="text-[12.5px] text-brand inline-flex items-center gap-1 hover:underline"><CheckCheck className="size-3.5" />Mark all read</button>}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto divide-y divide-line">
            {items === null && Array.from({ length: 3 }).map((_, i) => <li key={i} className="p-4"><div className="skeleton h-3 w-2/3" /><div className="skeleton h-3 w-1/2 mt-2" /></li>)}
            {items?.length === 0 && <li className="px-4 py-10 text-center text-muted text-[13.5px]">You&apos;re all caught up.</li>}
            {items?.map((n) => (
              <li key={n.id}>
                <Link href={n.link ?? "#"} onClick={() => { if (!n.readAt) markOne(n.id); setOpen(false); }} className={cn("flex gap-3 px-4 py-3 hover:bg-soft/60", !n.readAt && "bg-brand-50/50")}>
                  <span className={cn("mt-1.5 size-2 rounded-full shrink-0", n.readAt ? "bg-transparent" : "bg-brand-2")} />
                  <span className="min-w-0">
                    <span className="block text-[13.5px] text-ink">{n.title}</span>
                    {n.body && <span className="block text-[12.5px] text-muted truncate">{n.body}</span>}
                    <span className="block text-[11.5px] text-faint mt-0.5">{ago(n.createdAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block text-center text-[13px] text-brand py-2.5 border-t border-line hover:bg-soft/60">View all</Link>
        </div>
      )}
    </div>
  );
}
