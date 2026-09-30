import Link from "next/link";
import { Bell } from "lucide-react";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/auth/viewer";
import { fmtDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { MarkAllRead } from "./mark-all";

export const metadata = { title: "Notifications" };

export default async function Notifications() {
  const v = await requireViewer();
  const items = await db.notification.findMany({ where: { userId: v.userId }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div className="max-w-3xl">
      <PageHeader title="Notifications" actions={items.some((n) => !n.readAt) ? <MarkAllRead /> : null} />
      {items.length === 0 ? <div className="card"><EmptyState icon={Bell} title="Nothing here yet" /></div> : (
        <ul className="card divide-y divide-line">{items.map((n) => (
          <li key={n.id}><Link href={n.link ?? "#"} className={cn("flex gap-3 px-5 py-3.5 hover:bg-soft/50", !n.readAt && "bg-brand-50/40")}>
            <span className={cn("mt-2 size-2 rounded-full shrink-0", n.readAt ? "bg-transparent" : "bg-brand-2")} />
            <span className="min-w-0 flex-1"><span className="block text-[14px]">{n.title}</span>{n.body && <span className="block text-[13px] text-muted">{n.body}</span>}<span className="block text-[12px] text-faint mt-0.5">{fmtDateTime(n.createdAt)}</span></span>
          </Link></li>
        ))}</ul>
      )}
    </div>
  );
}
