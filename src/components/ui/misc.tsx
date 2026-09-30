import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function Tabs({ tabs, active, base, param = "tab" }: { tabs: { key: string; label: string; count?: number }[]; active: string; base: string; param?: string }) {
  return (
    <nav className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto border-b border-line" aria-label="Tabs">
      <ul className="flex gap-1 min-w-max">
        {tabs.map((t) => {
          const on = t.key === active;
          const href = `${base}${base.includes("?") ? "&" : "?"}${param}=${t.key}`;
          return (
            <li key={t.key}>
              <Link href={href} scroll={false} aria-current={on ? "page" : undefined}
                className={cn("inline-flex items-center gap-1.5 px-3 py-2.5 text-[13.5px] border-b-2 -mb-px transition-colors", on ? "border-brand text-brand font-medium" : "border-transparent text-muted hover:text-ink")}>
                {t.label}
                {t.count != null && <span className={cn("rounded-full px-1.5 text-[11px]", on ? "bg-brand-50" : "bg-soft")}>{t.count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function EmptyState({ icon: Icon, title, body, action, compact }: { icon?: LucideIcon; title: string; body?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "py-6" : "py-12 px-4")}>
      {Icon && <div className="size-11 rounded-full bg-brand-50 text-brand grid place-items-center mb-3"><Icon className="size-5" /></div>}
      <p className="font-medium text-ink">{title}</p>
      {body && <p className="text-[13px] text-muted mt-1 max-w-sm">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-64" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-card" />)}</div>
      <Skeleton className="h-72 rounded-card" />
    </div>
  );
}

export type TimelineItem = { id: string; date: string; title: ReactNode; body?: ReactNode; icon?: LucideIcon; tone?: "brand" | "ok" | "warn" | "bad" | "muted" };
export function Timeline({ items }: { items: TimelineItem[] }) {
  const tones = { brand: "bg-brand-50 text-brand", ok: "bg-ok-bg text-ok", warn: "bg-warn-bg text-warn", bad: "bg-bad-bg text-bad", muted: "bg-soft text-muted" };
  return (
    <ol className="relative">
      {items.map((it, i) => {
        const Icon = it.icon;
        return (
          <li key={it.id} className="relative flex gap-4 pb-6 last:pb-0">
            {i < items.length - 1 && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-line" aria-hidden />}
            <span className={cn("size-8 shrink-0 rounded-full grid place-items-center", tones[it.tone ?? "brand"])}>{Icon ? <Icon className="size-4" /> : <span className="size-1.5 rounded-full bg-current" />}</span>
            <div className="min-w-0 pt-1">
              <div className="text-[13.5px] font-medium text-ink">{it.title}</div>
              {it.body && <div className="text-[13px] text-muted mt-0.5">{it.body}</div>}
              <div className="text-[12px] text-faint mt-1">{it.date}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** ActivityFeed: compact list of events with an avatar/leading slot. */
export function ActivityFeed({ items }: { items: { id: string; lead?: ReactNode; text: ReactNode; meta?: ReactNode; href?: string }[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((it) => {
        const inner = (
          <div className="flex items-start gap-3 py-2.5">
            {it.lead}
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] text-ink">{it.text}</div>
              {it.meta && <div className="text-[12px] text-muted mt-0.5">{it.meta}</div>}
            </div>
          </div>
        );
        return <li key={it.id}>{it.href ? <Link href={it.href} className="block hover:bg-soft/50 -mx-2 px-2 rounded-lg">{inner}</Link> : inner}</li>;
      })}
    </ul>
  );
}

export function Progress({ value, tone = "brand", className }: { value: number; tone?: "brand" | "ok" | "warn" | "bad"; className?: string }) {
  const c = { brand: "bg-brand-2", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" }[tone];
  return (
    <div className={cn("h-1.5 w-full rounded-full bg-soft overflow-hidden", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full", c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function PermissionNotice({ children = "You don't have access to this information." }: { children?: ReactNode }) {
  return <div className="rounded-ctl border border-dashed border-line-2 bg-soft/50 px-4 py-6 text-center text-[13px] text-muted">{children}</div>;
}

export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("card overflow-hidden", className)}><div className="overflow-x-auto">{children}</div></div>;
}
