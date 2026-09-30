"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Charts use one hue (Rosier brown) for magnitude; states use the reserved
// status colors with a text label beside them, never colour alone.

const BRAND = "#A56312";
const AXIS = { fontSize: 11.5, fill: "#7A6E62" };

function TipBox({ label, value, unit }: { label: string; value: number | string; unit?: string }) {
  return (
    <div className="rounded-lg bg-ink text-white px-3 py-2 text-[12px] shadow-pop">
      <div className="text-white/70">{label}</div>
      <div className="font-semibold text-[13px] tabular-nums">{value}{unit ? ` ${unit}` : ""}</div>
    </div>
  );
}

/** Single-series trend (e.g. headcount by month). */
export function AreaTrend({ data, unit, height = 220 }: { data: { label: string; value: number }[]; unit?: string; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label={`Trend: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="rp-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={BRAND} stopOpacity={0.22} />
              <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#EFE9DD" />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
          <Tooltip cursor={{ stroke: "#D9D0BE" }} content={({ active, payload, label }) => (active && payload?.length ? <TipBox label={String(label)} value={payload[0].value as number} unit={unit} /> : null)} />
          <Area isAnimationActive={false} type="monotone" dataKey="value" stroke={BRAND} strokeWidth={2} fill="url(#rp-area)" dot={false} activeDot={{ r: 4.5, stroke: "#fff", strokeWidth: 2, fill: BRAND }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Vertical bars, one hue. */
export function Bars({ data, unit, height = 220 }: { data: { label: string; value: number }[]; unit?: string; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="#EFE9DD" />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval={0} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
          <Tooltip cursor={{ fill: "#F3EEE4" }} content={({ active, payload, label }) => (active && payload?.length ? <TipBox label={String(label)} value={payload[0].value as number} unit={unit} /> : null)} />
          <Bar isAnimationActive={false} dataKey="value" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

