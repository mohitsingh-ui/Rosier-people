import { Plus, Pin, Pencil, Trash2, Paperclip, Megaphone } from "lucide-react";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/auth/viewer";
import { fmtDate, todayISO } from "@/lib/dates";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/action-button";
import { FilterDropdown } from "@/components/ui/filters";
import { AnnouncementForm } from "@/components/helpdesk/forms";
import { deleteAnnouncement, togglePin } from "@/server/announcements";

export const metadata = { title: "Announcements" };
const LABEL: Record<string, [string, "brand" | "info" | "plum" | "ok" | "warn" | "neutral"]> = { NEWS: ["Company news", "brand"], POLICY: ["Policy update", "info"], EVENT: ["Event", "plum"], HOLIDAY: ["Holiday", "brand"], NOTICE: ["Important", "warn"], CELEBRATION: ["Celebration", "ok"], ACHIEVEMENT: ["Achievement", "ok"] };

export default async function Announcements({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const v = await requireViewer();
  const sp = await searchParams;
  const manage = can(v, "announcements.manage");
  const now = new Date();
  const [items, depts] = await Promise.all([
    db.announcement.findMany({
      where: { ...(manage ? {} : { publishAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], AND: [{ OR: [{ audience: "ALL" }, { departmentId: v.employee?.departmentId ?? "__none__" }] }] }), ...(sp.category ? { category: sp.category } : {}) },
      include: { author: true, department: true }, orderBy: [{ pinned: "desc" }, { publishAt: "desc" }],
    }),
    manage ? db.department.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const deptOpts = depts.map((d) => ({ value: d.id, label: d.name }));
  return (
    <div className="max-w-3xl">
      <PageHeader title="Announcements" description="What's happening at Rosier." actions={manage ? <Modal size="lg" title="New announcement" trigger={<Button><Plus className="size-4" />New announcement</Button>}><AnnouncementForm departments={deptOpts} /></Modal> : null} />
      <div className="mb-4"><FilterDropdown param="category" label="All types" options={Object.entries(LABEL).map(([value, [label]]) => ({ value, label }))} /></div>
      {items.length === 0 ? <div className="card"><EmptyState icon={Megaphone} title="No announcements" /></div> : (
        <ul className="space-y-4">{items.map((a) => {
          const scheduled = a.publishAt > now, expired = a.expiresAt && a.expiresAt < now;
          return (
            <li key={a.id} id={a.id} className="card overflow-hidden scroll-mt-24">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {a.imageUrl && <img src={`/api/attachments/announcement-image/${a.id}`} alt="" className="w-full max-h-72 object-cover" />}
              <div className="p-5">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge tone={LABEL[a.category]?.[1] ?? "neutral"}>{LABEL[a.category]?.[0] ?? a.category}</Badge>
                  {a.pinned && <Badge><Pin className="size-3" />Pinned</Badge>}
                  {a.audience === "DEPARTMENT" && <Badge tone="info">{a.department?.name} only</Badge>}
                  {scheduled && <Badge tone="warn">Scheduled {fmtDate(a.publishAt)}</Badge>}
                  {expired && <Badge>Expired</Badge>}
                  <span className="text-[12px] text-muted ml-auto">{fmtDate(a.publishAt, "d MMM yyyy")}</span>
                </div>
                <h2 className="text-[18px]">{a.title}</h2>
                <p className="text-[14px] text-ink-2 mt-2 whitespace-pre-line leading-relaxed">{a.body}</p>
                {a.attachmentKey && <a href={`/api/attachments/announcement/${a.id}`} className="inline-flex items-center gap-1 text-[13px] text-brand mt-3 hover:underline"><Paperclip className="size-3.5" />Attachment</a>}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-line">
                  {a.author ? <span className="flex items-center gap-2 text-[12.5px] text-muted"><EmployeeAvatar employee={a.author} size={22} />{a.author.firstName} {a.author.lastName}</span> : <span />}
                  {manage && <span className="flex gap-1">
                    <ActionButton action={togglePin} payload={{ id: a.id }} variant="ghost" size="iconSm"><Pin className="size-3.5" /></ActionButton>
                    <Modal size="lg" title="Edit announcement" trigger={<Button variant="ghost" size="iconSm" aria-label="Edit"><Pencil className="size-3.5" /></Button>}><AnnouncementForm departments={deptOpts} a={{ ...a, publishAt: todayISO(a.publishAt), expiresAt: a.expiresAt ? todayISO(a.expiresAt) : null }} /></Modal>
                    <ActionButton action={deleteAnnouncement} payload={{ id: a.id }} variant="ghost" size="iconSm" confirm={{ title: "Delete this announcement?", danger: true, confirmLabel: "Delete" }}><Trash2 className="size-3.5" /></ActionButton>
                  </span>}
                </div>
              </div>
            </li>
          );
        })}</ul>
      )}
    </div>
  );
}
