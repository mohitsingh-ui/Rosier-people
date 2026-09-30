"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { action, UserError, zId, zOptDate, zOptText, zText } from "@/lib/action";
import { assertCan, AuthzError, can, type Viewer } from "@/lib/auth/viewer";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/workflow";
import { notifyEmployees, notifyPermission } from "@/lib/notify";
import { dateOnly } from "@/lib/dates";
import "./workflows";

const who = (v: Viewer) => (v.employee ? `${v.employee.firstName} ${v.employee.lastName}` : v.email);
const CONDITIONS = ["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"] as const;

export const saveAsset = action(
  z.object({ id: z.string().optional(), categoryId: zId, brand: zText(60), model: zText(80), serialNumber: zOptText(60), purchaseDate: zOptDate, purchasePrice: z.coerce.number().min(0).optional(), warrantyUntil: zOptDate, condition: z.enum(CONDITIONS), notes: zOptText(500) }),
  async (i, v) => {
    assertCan(v, "assets.manage");
    const data = { categoryId: i.categoryId, brand: i.brand, model: i.model, serialNumber: i.serialNumber, purchaseDate: i.purchaseDate ? dateOnly(i.purchaseDate) : null, purchasePrice: i.purchasePrice ?? null, warrantyUntil: i.warrantyUntil ? dateOnly(i.warrantyUntil) : null, condition: i.condition, notes: i.notes };
    let a;
    if (i.id) a = await db.asset.update({ where: { id: i.id }, data });
    else {
      const cat = await db.assetCategory.findUniqueOrThrow({ where: { id: i.categoryId } });
      const n = await db.asset.count({ where: { categoryId: cat.id } });
      a = await db.asset.create({ data: { ...data, tag: `RF-${cat.prefix}-${String(n + 1).padStart(4, "0")}` } });
    }
    await audit(v, { action: i.id ? "asset.update" : "asset.create", entity: "Asset", entityId: a.id, summary: `${who(v)} ${i.id ? "updated" : "added"} asset ${a.tag} (${a.brand} ${a.model}).` });
    revalidatePath("/assets");
    return { ok: true as const, message: i.id ? "Asset updated." : `Asset ${a.tag} added.`, data: { id: a.id } };
  },
);

/** Assign or transfer. Closes any open assignment first so history stays accurate. */
export const assignAsset = action(z.object({ assetId: zId, employeeId: zId, condition: z.enum(CONDITIONS), note: zOptText(300) }), async (i, v) => {
  assertCan(v, "assets.manage");
  const a = await db.asset.findUniqueOrThrow({ where: { id: i.assetId }, include: { holder: true } });
  if (["RETIRED", "LOST"].includes(a.status)) throw new UserError("This asset is retired or lost.");
  if (a.holderId === i.employeeId) throw new UserError("Already assigned to this person.");
  const e = await db.employee.findUniqueOrThrow({ where: { id: i.employeeId } });
  await db.$transaction([
    db.assetAssignment.updateMany({ where: { assetId: a.id, returnedAt: null }, data: { returnedAt: new Date(), conditionIn: i.condition, note: a.holderId ? `Transferred to ${e.firstName} ${e.lastName}` : undefined } }),
    db.assetAssignment.create({ data: { assetId: a.id, employeeId: e.id, conditionOut: i.condition, assignedById: v.userId, note: i.note } }),
    db.asset.update({ where: { id: a.id }, data: { holderId: e.id, status: "ASSIGNED", condition: i.condition } }),
  ]);
  await emit("asset.assigned", { assetId: a.id, employeeId: e.id });
  await audit(v, { action: a.holderId ? "asset.transfer" : "asset.assign", entity: "Asset", entityId: a.id, summary: `${who(v)} ${a.holderId ? `transferred ${a.tag} from ${a.holder?.firstName} to` : `assigned ${a.tag} to`} ${e.firstName} ${e.lastName}.` });
  revalidatePath("/assets");
  revalidatePath(`/people/${e.id}`);
  return { ok: true as const, message: `${a.tag} assigned to ${e.firstName}.` };
});

export const returnAsset = action(z.object({ assetId: zId, condition: z.enum(CONDITIONS), note: zOptText(300) }), async (i, v) => {
  assertCan(v, "assets.manage");
  const a = await db.asset.findUniqueOrThrow({ where: { id: i.assetId }, include: { holder: true } });
  if (!a.holderId) throw new UserError("This asset isn't assigned.");
  await db.$transaction([
    db.assetAssignment.updateMany({ where: { assetId: a.id, returnedAt: null }, data: { returnedAt: new Date(), conditionIn: i.condition, note: i.note } }),
    db.asset.update({ where: { id: a.id }, data: { holderId: null, status: i.condition === "DAMAGED" ? "DAMAGED" : "IN_STOCK", condition: i.condition } }),
  ]);
  await notifyEmployees([a.holderId], { type: "asset.returned", title: `Return of ${a.brand} ${a.model} recorded`, link: "/assets" });
  // Close the matching exit-checklist task if this person is leaving
  const off = await db.offboarding.findUnique({ where: { employeeId: a.holderId } });
  if (off && !(await db.asset.count({ where: { holderId: a.holderId } }))) await db.offboardingTask.updateMany({ where: { offboardingId: off.id, category: "ASSETS", status: { not: "DONE" } }, data: { status: "DONE", completedAt: new Date() } });
  await audit(v, { action: "asset.return", entity: "Asset", entityId: a.id, summary: `${who(v)} recorded ${a.holder?.firstName}'s return of ${a.tag} (${i.condition.toLowerCase()}).` });
  revalidatePath("/assets");
  return { ok: true as const, message: "Return recorded." };
});

export const reportDamage = action(z.object({ assetId: zId, note: zText(500, 5) }), async (i, v) => {
  const a = await db.asset.findUniqueOrThrow({ where: { id: i.assetId } });
  if (a.holderId !== v.employeeId && !can(v, "assets.manage")) throw new AuthzError();
  await db.asset.update({ where: { id: a.id }, data: { status: "IN_REPAIR", condition: "DAMAGED", notes: `${a.notes ? a.notes + "\n" : ""}Damage reported by ${who(v)}: ${i.note}` } });
  await notifyPermission("assets.manage", { type: "asset.returned", title: `Damage reported on ${a.tag}`, body: i.note, link: `/assets/${a.id}` });
  await audit(v, { action: "asset.damage", entity: "Asset", entityId: a.id, summary: `${who(v)} reported damage on ${a.tag}: ${i.note}` });
  revalidatePath("/assets");
  return { ok: true as const, message: "Reported. IT/HR will follow up." };
});

export const setAssetStatus = action(z.object({ assetId: zId, status: z.enum(["IN_STOCK", "IN_REPAIR", "RETIRED", "LOST"]) }), async (i, v) => {
  assertCan(v, "assets.manage");
  const a = await db.asset.findUniqueOrThrow({ where: { id: i.assetId } });
  if (a.holderId && i.status !== "IN_REPAIR") throw new UserError("Record the return first.");
  await db.asset.update({ where: { id: a.id }, data: { status: i.status, ...(i.status === "IN_STOCK" && a.condition === "DAMAGED" ? { condition: "GOOD" } : {}) } });
  await audit(v, { action: "asset.status", entity: "Asset", entityId: a.id, summary: `${who(v)} marked ${a.tag} as ${i.status.toLowerCase().replace("_", " ")}.` });
  revalidatePath("/assets");
  return { ok: true as const, message: "Status updated." };
});

export const saveAssetCategory = action(z.object({ id: z.string().optional(), name: zText(40), prefix: z.string().trim().toUpperCase().regex(/^[A-Z]{2,4}$/, "2–4 letters") }), async (i, v) => {
  assertCan(v, "settings.manage");
  if (i.id) await db.assetCategory.update({ where: { id: i.id }, data: { name: i.name, prefix: i.prefix } }); else await db.assetCategory.create({ data: { name: i.name, prefix: i.prefix } });
  revalidatePath("/settings");
  return { ok: true as const, message: "Category saved." };
});
