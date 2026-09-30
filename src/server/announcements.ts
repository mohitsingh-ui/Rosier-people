"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { action, UserError, zBool, zFile, zId, zOptText, zText } from "@/lib/action";
import { assertCan, type Viewer } from "@/lib/auth/viewer";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/workflow";
import { storeUpload } from "@/lib/storage";
import "./workflows";

const who = (v: Viewer) => (v.employee ? `${v.employee.firstName} ${v.employee.lastName}` : v.email);

export const saveAnnouncement = action(
  z.object({
    id: z.string().optional(), title: zText(150), body: zText(10000, 5), category: z.enum(["NEWS", "POLICY", "EVENT", "HOLIDAY", "NOTICE", "CELEBRATION", "ACHIEVEMENT"]),
    audience: z.enum(["ALL", "DEPARTMENT"]), departmentId: z.string().optional().transform((x) => x || null), pinned: zBool,
    publishAt: zOptText(20), expiresAt: zOptText(20), image: zFile, attachment: zFile,
  }),
  async (i, v) => {
    assertCan(v, "announcements.manage");
    if (i.audience === "DEPARTMENT" && !i.departmentId) throw new UserError("Pick a department.");
    if (i.image && !i.image.type.startsWith("image/")) throw new UserError("The cover must be an image.");
    const [img, att] = await Promise.all([i.image ? storeUpload(i.image, "announcements") : null, i.attachment ? storeUpload(i.attachment, "announcements") : null]);
    const publishAt = i.publishAt ? new Date(`${i.publishAt}T00:00:00+05:30`) : new Date();
    const data = { title: i.title, body: i.body, category: i.category, audience: i.audience, departmentId: i.audience === "DEPARTMENT" ? i.departmentId : null, pinned: i.pinned, publishAt, expiresAt: i.expiresAt ? new Date(`${i.expiresAt}T23:59:59+05:30`) : null, ...(img ? { imageUrl: img.storageKey } : {}), ...(att ? { attachmentKey: att.storageKey } : {}) };
    const a = i.id ? await db.announcement.update({ where: { id: i.id }, data }) : await db.announcement.create({ data: { ...data, authorId: v.employeeId } });
    if (!i.id && publishAt <= new Date()) await emit("announcement.published", { announcementId: a.id });
    await audit(v, { action: i.id ? "announcement.update" : "announcement.publish", entity: "Announcement", entityId: a.id, summary: `${who(v)} ${i.id ? "edited" : "published"} the announcement "${a.title}".` });
    revalidatePath("/", "layout");
    return { ok: true as const, message: i.id ? "Announcement updated." : publishAt > new Date() ? "Scheduled." : "Published — everyone's been notified." };
  },
);

export const deleteAnnouncement = action(z.object({ id: zId }), async (i, v) => {
  assertCan(v, "announcements.manage");
  const a = await db.announcement.delete({ where: { id: i.id } });
  await audit(v, { action: "announcement.delete", entity: "Announcement", entityId: a.id, summary: `${who(v)} deleted the announcement "${a.title}".` });
  revalidatePath("/", "layout");
  return { ok: true as const, message: "Deleted." };
});

export const togglePin = action(z.object({ id: zId }), async (i, v) => {
  assertCan(v, "announcements.manage");
  const a = await db.announcement.findUniqueOrThrow({ where: { id: i.id } });
  await db.announcement.update({ where: { id: a.id }, data: { pinned: !a.pinned } });
  revalidatePath("/", "layout");
  return { ok: true as const, message: a.pinned ? "Unpinned." : "Pinned to the top." };
});
