import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`.trim();
export const initials = (e: { firstName: string; lastName: string }) =>
  `${e.firstName[0] ?? ""}${e.lastName[0] ?? ""}`.toUpperCase();

export function humanize(v: string | null | undefined) {
  if (!v) return "—";
  return v.toLowerCase().split("_").map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

export const inr = (v: number | string | { toString(): string } | null | undefined, decimals = 0) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(Number(v.toString()));

export const num = (v: { toString(): string } | number | null | undefined) => (v == null ? 0 : Number(v.toString()));
export const mask = (last4: string | null | undefined, len = 8) => (last4 ? `${"•".repeat(len)}${last4}` : "—");
