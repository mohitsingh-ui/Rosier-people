import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

const base = "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none select-none";
const variants = {
  primary: "bg-brand text-white hover:bg-[#653d00] shadow-sm",
  secondary: "bg-white text-ink border border-line-2 hover:bg-soft",
  subtle: "bg-brand-50 text-brand hover:bg-brand-100",
  ghost: "text-ink-2 hover:bg-soft",
  danger: "bg-white text-bad border border-bad/30 hover:bg-bad-bg",
  dangerSolid: "bg-bad text-white hover:bg-[#963a27]",
} as const;
const sizes = { sm: "h-8 px-3 text-[13px] rounded-lg", md: "h-10 px-4 text-[14px] rounded-ctl", icon: "h-9 w-9 rounded-ctl", iconSm: "h-8 w-8 rounded-lg" } as const;

export type ButtonStyle = { variant?: keyof typeof variants; size?: keyof typeof sizes };
export const buttonClass = ({ variant = "primary", size = "md" }: ButtonStyle = {}, extra?: string) => cn(base, variants[variant], sizes[size], extra);

export function Button({ variant, size, className, type = "button", ...props }: ComponentProps<"button"> & ButtonStyle) {
  return <button type={type} className={buttonClass({ variant, size }, className)} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & ButtonStyle) {
  return <Link className={buttonClass({ variant, size }, className)} {...props} />;
}
