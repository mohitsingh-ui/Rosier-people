import { cn, humanize } from "@/lib/utils";

const tones = {
  neutral: "bg-soft text-ink-2 ring-line-2",
  brand: "bg-brand-50 text-brand ring-brand/15",
  ok: "bg-ok-bg text-ok ring-ok/15",
  warn: "bg-warn-bg text-warn ring-warn/20",
  bad: "bg-bad-bg text-bad ring-bad/15",
  info: "bg-info-bg text-info ring-info/15",
  plum: "bg-plum-bg text-plum ring-plum/15",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset whitespace-nowrap", tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  ACTIVE: "ok", PROBATION: "info", PREBOARDING: "plum", NOTICE_PERIOD: "warn", EXITED: "neutral", INACTIVE: "neutral",
  PENDING: "warn", APPROVED: "ok", REJECTED: "bad", CANCELLED: "neutral", CLARIFICATION: "info",
  MANAGER_APPROVED: "info", PAID: "ok",
  PRESENT: "ok", ABSENT: "bad", LATE: "warn", HALF_DAY: "warn", WFH: "info", HOLIDAY: "brand", LEAVE: "plum", WEEKEND: "neutral", PENDING_CORRECTION: "warn",
  VERIFIED: "ok", ARCHIVED: "neutral", EXPIRED: "bad", EXPIRING: "warn",
  NOT_STARTED: "neutral", IN_PROGRESS: "info", AT_RISK: "bad", COMPLETED: "ok", DONE: "ok", BLOCKED: "bad", SKIPPED: "neutral",
  OPEN: "warn", ASSIGNED: "info", WAITING_FOR_EMPLOYEE: "plum", RESOLVED: "ok", CLOSED: "neutral",
  IN_STOCK: "ok", IN_REPAIR: "warn", DAMAGED: "bad", RETIRED: "neutral", LOST: "bad",
  DRAFT: "neutral", PROCESSED: "info", REVIEW: "warn",
  PENDING_SELF: "warn", PENDING_MANAGER: "info",
  RESIGNATION_SUBMITTED: "warn", MANAGER_REVIEW: "info", HR_REVIEW: "info", CLEARANCE: "plum", FINAL_SETTLEMENT: "plum", WITHDRAWN: "neutral",
  HIGH: "bad", URGENT: "bad", MEDIUM: "warn", LOW: "neutral",
  SUBMITTED: "warn",
};

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "neutral"} dot className={className}>{label ?? humanize(status)}</Badge>;
}
