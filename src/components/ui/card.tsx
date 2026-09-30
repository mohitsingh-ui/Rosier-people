import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...rest}>{children}</div>;
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {subtitle && <p className="text-[12.5px] text-muted mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** DashboardCard: a titled section on dashboards. */
export function DashboardCard({ title, subtitle, action, children, className, bodyClass }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader title={title} subtitle={subtitle} action={action} />
      <div className={cn("px-5 pb-5 flex-1", bodyClass)}>{children}</div>
    </Card>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="text-[22px] sm:text-[24px] leading-tight">{title}</h1>
        {description && <p className="text-muted mt-1 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function MetricCard({ label, value, hint, href, tone }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: "warn" | "bad" | "ok" }) {
  const body = (
    <>
      <div className="text-[12.5px] text-muted">{label}</div>
      <div className={cn("mt-1 text-[26px] font-semibold tracking-tight tabular-nums", tone === "bad" && "text-bad", tone === "warn" && "text-warn")}>{value}</div>
      {hint && <div className="text-[12px] text-muted mt-0.5">{hint}</div>}
    </>
  );
  return href ? (
    <a href={href} className="card block px-4 py-3.5 hover:border-line-2 transition-colors">{body}</a>
  ) : (
    <div className="card px-4 py-3.5">{body}</div>
  );
}

export function KV({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="kv-k">{label}</dt>
      <dd className="kv-v mt-0.5 break-words">{value ?? "—"}</dd>
    </div>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="card">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
        <h3 className="text-[14.5px] font-semibold">{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
