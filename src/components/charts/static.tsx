import { cn } from "@/lib/utils";

const BRAND = "#A56312";

/** Horizontal labelled bars in plain HTML — readable on phones, works without hover. */
export function BarList({ data, unit = "", hrefPrefix }: { data: { label: string; value: number; key?: string }[]; unit?: string; hrefPrefix?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2.5">
      {data.map((d) => {
        const row = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-ink-2 truncate">{d.label}</span>
              <span className="font-medium tabular-nums text-ink">{d.value}{unit}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-soft overflow-hidden">
              <div className="h-full rounded-full bg-brand-2" style={{ width: `${(d.value / max) * 100}%` }} title={`${d.label}: ${d.value}{unit}`} />
            </div>
          </>
        );
        return <li key={d.label}>{hrefPrefix && d.key ? <a href={hrefPrefix + d.key} className="block hover:opacity-80">{row}</a> : row}</li>;
      })}
    </ul>
  );
}

const STATUS_COLORS: Record<string, string> = { ok: "#3E7A52", info: "#3D6A8C", warn: "#A86B12", bad: "#B0452F", plum: "#6F4A7E", neutral: "#BDB2A2", brand: "#A56312" };

/** Status breakdown: segmented bar + labelled legend with counts (identity never colour-only). */
export function StatusBreakdown({ items, total }: { items: { label: string; value: number; tone: keyof typeof STATUS_COLORS }[]; total?: number }) {
  const sum = total ?? items.reduce((a, b) => a + b.value, 0);
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-soft gap-[2px]" role="img" aria-label={items.map((i) => `${i.label} ${i.value}`).join(", ")}>
        {items.filter((i) => i.value > 0).map((i) => (
          <div key={i.label} style={{ width: `${(i.value / Math.max(sum, 1)) * 100}%`, background: STATUS_COLORS[i.tone] }} title={`${i.label}: ${i.value}`} className="first:rounded-l-full last:rounded-r-full" />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 mt-4">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-2 text-[13px]">
            <span className="size-2.5 rounded-sm shrink-0" style={{ background: STATUS_COLORS[i.tone] }} />
            <span className="text-ink-2">{i.label}</span>
            <span className={cn("ml-auto font-semibold tabular-nums")}>{i.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Small radial ring for a single percentage. */
export function Ring({ value, size = 64, label }: { value: number; size?: number; label?: string }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} role="img" aria-label={`${label ?? "Progress"} ${Math.round(value)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3EEE4" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={BRAND} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${(value / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size * 0.24} fontWeight={600} fill="#241A12">{Math.round(value)}%</text>
    </svg>
  );
}
