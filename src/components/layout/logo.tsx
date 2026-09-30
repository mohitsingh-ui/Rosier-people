import { cn } from "@/lib/utils";

export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden>
      <rect width="40" height="40" rx="11" fill="#784900" />
      <path d="M13 29V11h8.2c3.9 0 6.3 2.2 6.3 5.5 0 2.6-1.5 4.4-3.9 5.1L28 29h-4.4l-3.3-6.9H17V29h-4Zm4-10.2h3.9c1.8 0 2.8-.9 2.8-2.3s-1-2.3-2.8-2.3H17v4.6Z" fill="#F7F4ED" />
      <circle cx="30" cy="11" r="2.6" fill="#E7E0CE" />
    </svg>
  );
}

export function Logo({ className, subtitle = true }: { className?: string; subtitle?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <div className="leading-tight">
        <div className="text-[15px] font-semibold text-ink tracking-tight">Rosier People</div>
        {subtitle && <div className="text-[11px] text-muted">Rosier Foods</div>}
      </div>
    </div>
  );
}
