"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, X, Send, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function openAssist() { window.dispatchEvent(new Event("rp:assist")); }

type Msg = { role: "user" | "assistant"; text: string; links?: { label: string; href: string }[]; rows?: string[] };

/** Rosier Assist: answers come from /api/assist, which only reads data the signed-in user may see. */
export function Assist({ suggestions, firstName }: { suggestions: string[]; firstName: string }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener("rp:assist", on);
    return () => window.removeEventListener("rp:assist", on);
  }, []);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs, busy]);
  const ask = async (text: string) => {
    if (!text.trim() || busy) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setQ("");
    setBusy(true);
    try {
      const r = await fetch("/api/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text }) });
      const d = await r.json();
      setMsgs((m) => [...m, { role: "assistant", text: d.answer ?? d.error ?? "Sorry, something went wrong.", links: d.links, rows: d.rows }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "I couldn't reach the server. Try again in a moment." }]);
    } finally { setBusy(false); }
  };
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Rosier Assist">
      <div className="absolute inset-0 bg-ink/25" onClick={() => setOpen(false)} />
      <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[420px] bg-white shadow-pop flex flex-col">
        <div className="flex items-center justify-between px-5 h-16 border-b border-line shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="size-8 rounded-full bg-brand text-white grid place-items-center"><Sparkles className="size-4" /></span>
            <div className="leading-tight"><div className="font-semibold text-[14.5px]">Rosier Assist</div><div className="text-[11.5px] text-muted flex items-center gap-1"><ShieldCheck className="size-3" />Sees only what you can see</div></div>
          </div>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-soft" aria-label="Close"><X className="size-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {msgs.length === 0 && (
            <div>
              <p className="text-[15px] font-medium">Hi {firstName}, what do you need?</p>
              <p className="text-muted text-[13px] mt-1">Ask about your leave, attendance, payslips, documents, team or HR policies.</p>
              <div className="flex flex-wrap gap-2 mt-4">
                {suggestions.map((s) => <button key={s} onClick={() => ask(s)} className="text-[12.5px] rounded-full border border-line-2 px-3 py-1.5 text-ink-2 hover:bg-brand-50 hover:border-brand-2/40">{s}</button>)}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[88%] rounded-[14px] px-3.5 py-2.5 text-[13.5px] whitespace-pre-line", m.role === "user" ? "bg-brand text-white rounded-br-md" : "bg-soft text-ink rounded-bl-md")}>
                {m.text}
                {m.rows && m.rows.length > 0 && <ul className="mt-2 space-y-1">{m.rows.map((r, j) => <li key={j} className="text-[13px]">• {r}</li>)}</ul>}
                {m.links && m.links.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {m.links.map((l) => <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-[12px] rounded-full bg-white border border-line px-2.5 py-1 text-brand hover:border-brand-2/50">{l.label} →</Link>)}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="flex"><div className="bg-soft rounded-[14px] px-4 py-3 flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 rounded-full bg-muted animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />)}</div></div>}
          <div ref={end} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="p-3 border-t border-line flex gap-2 shrink-0 pb-[calc(12px+env(safe-area-inset-bottom))]">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask Rosier Assist…" className="ctl" aria-label="Message" maxLength={400} />
          <button type="submit" disabled={busy || !q.trim()} className="size-10 shrink-0 rounded-ctl bg-brand text-white grid place-items-center disabled:opacity-40" aria-label="Send"><Send className="size-4" /></button>
        </form>
      </div>
    </div>
  );
}
