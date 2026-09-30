"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

function useParamSetter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    next.delete("page");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  return { set, params, pending };
}

/** SearchBar bound to ?q= with debounce. */
export function SearchBar({ placeholder = "Search", param = "q", className }: { placeholder?: string; param?: string; className?: string }) {
  const { set, params, pending } = useParamSetter();
  const [v, setV] = useState(params.get(param) ?? "");
  useEffect(() => {
    const t = setTimeout(() => { if ((params.get(param) ?? "") !== v) set({ [param]: v || null }); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return (
    <div className={cn("relative", className)}>
      <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="ctl pl-9 pr-8" />
      {pending ? <span className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 rounded-full border-2 border-faint border-r-transparent animate-spin" />
        : v && <button type="button" aria-label="Clear" onClick={() => setV("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-faint hover:text-ink"><X className="size-3.5" /></button>}
    </div>
  );
}

/** FilterDropdown bound to a query param. */
export function FilterDropdown({ param, label, options, className }: { param: string; label: string; options: { value: string; label: string }[]; className?: string }) {
  const { set, params } = useParamSetter();
  const v = params.get(param) ?? "";
  return (
    <select aria-label={label} value={v} onChange={(e) => set({ [param]: e.target.value || null })} className={cn("ctl h-9 w-auto min-w-36 text-[13px]", v && "border-brand-2 bg-brand-50/40", className)}>
      <option value="">{label}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function DateFilter({ param, label }: { param: string; label: string }) {
  const { set, params } = useParamSetter();
  return <input type="date" aria-label={label} title={label} value={params.get(param) ?? ""} onChange={(e) => set({ [param]: e.target.value || null })} className="ctl h-9 w-auto text-[13px]" />;
}

export function MonthPicker({ param = "month", defaultValue }: { param?: string; defaultValue: string }) {
  const { set, params } = useParamSetter();
  return <input type="month" aria-label="Month" value={params.get(param) ?? defaultValue} onChange={(e) => set({ [param]: e.target.value || null })} className="ctl h-9 w-auto text-[13px]" />;
}

export function ClearFilters({ keys }: { keys: string[] }) {
  const { set, params } = useParamSetter();
  if (!keys.some((k) => params.get(k))) return null;
  return <button type="button" onClick={() => set(Object.fromEntries(keys.map((k) => [k, null])))} className="text-[13px] text-brand hover:underline px-1">Clear filters</button>;
}

export function ViewToggle({ options, param = "view" }: { options: { value: string; label: string; icon: React.ReactNode }[]; param?: string }) {
  const { set, params } = useParamSetter();
  const v = params.get(param) ?? options[0].value;
  return (
    <div className="inline-flex rounded-ctl border border-line-2 bg-white p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" aria-label={o.label} aria-pressed={v === o.value} onClick={() => set({ [param]: o.value === options[0].value ? null : o.value })}
          className={cn("h-8 w-8 grid place-items-center rounded-lg", v === o.value ? "bg-brand-50 text-brand" : "text-muted hover:text-ink")}>{o.icon}</button>
      ))}
    </div>
  );
}
