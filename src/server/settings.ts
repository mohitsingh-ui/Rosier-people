"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { action, UserError, zText, zOptText } from "@/lib/action";
import { assertCan, type Viewer } from "@/lib/auth/viewer";
import { audit } from "@/lib/audit";

const who = (v: Viewer) => (v.employee ? `${v.employee.firstName} ${v.employee.lastName}` : v.email);

export const saveCompany = action(z.object({ name: zText(120), shortName: zText(60), address: zText(200), email: z.string().email(), phone: zOptText(30), cin: zOptText(30), website: zOptText(80) }), async (i, v) => {
  assertCan(v, "settings.security");
  const before = await db.setting.findUnique({ where: { key: "company" } });
  await db.setting.upsert({ where: { key: "company" }, create: { key: "company", value: i }, update: { value: { ...(before?.value as object), ...i } } });
  await audit(v, { action: "settings.company", entity: "Setting", entityId: "company", summary: `${who(v)} updated company details.`, before: before?.value, after: i });
  revalidatePath("/settings");
  return { ok: true as const, message: "Company details saved." };
});

const JSON_KEYS = { selfEditableFields: "settings.manage", notifications: "settings.manage", integrations: "settings.security", security: "settings.security" } as const;

export const saveSettingJson = action(z.object({ key: z.enum(Object.keys(JSON_KEYS) as [keyof typeof JSON_KEYS, ...(keyof typeof JSON_KEYS)[]]), value: z.string().max(10000) }), async (i, v) => {
  assertCan(v, JSON_KEYS[i.key]);
  let value: unknown;
  try { value = JSON.parse(i.value); } catch { throw new UserError("Invalid settings payload."); }
  const before = await db.setting.findUnique({ where: { key: i.key } });
  await db.setting.upsert({ where: { key: i.key }, create: { key: i.key, value: value as never }, update: { value: value as never } });
  await audit(v, { action: `settings.${i.key}`, entity: "Setting", entityId: i.key, summary: `${who(v)} changed ${i.key} settings.`, before: before?.value, after: value });
  revalidatePath("/settings");
  return { ok: true as const, message: "Saved." };
});

export const togglePermission = action(z.object({ role: z.enum(["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"]), permission: z.string().min(3).max(60) }), async (i, v) => {
  assertCan(v, "settings.security");
  if (i.role === "SUPER_ADMIN" && ["settings.security", "people.edit"].includes(i.permission)) throw new UserError("Super Admins always keep security and people access.");
  const [role, perm] = await Promise.all([db.role.findUniqueOrThrow({ where: { key: i.role } }), db.permission.findUniqueOrThrow({ where: { key: i.permission } })]);
  const existing = await db.rolePermission.findUnique({ where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } } });
  if (existing) await db.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } } });
  else await db.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
  await audit(v, { action: existing ? "permission.revoke" : "permission.grant", entity: "Role", entityId: role.id, summary: `${who(v)} ${existing ? "removed" : "granted"} "${perm.description}" ${existing ? "from" : "to"} ${role.name}.` });
  revalidatePath("/", "layout");
  return { ok: true as const, message: existing ? `Removed from ${role.name}.` : `Granted to ${role.name}.` };
});

export const toggleWorkflowStep = action(z.object({ step: z.string().regex(/^[a-z.]+:[a-z-]+$/) }), async (i, v) => {
  assertCan(v, "settings.manage");
  const s = await db.setting.findUnique({ where: { key: "workflow.disabledSteps" } });
  const list = new Set((s?.value as string[] | undefined) ?? []);
  const off = list.has(i.step);
  if (off) list.delete(i.step); else list.add(i.step);
  await db.setting.upsert({ where: { key: "workflow.disabledSteps" }, create: { key: "workflow.disabledSteps", value: [...list] }, update: { value: [...list] } });
  await audit(v, { action: "workflow.toggle", entity: "Setting", entityId: "workflow", summary: `${who(v)} turned ${off ? "on" : "off"} workflow step ${i.step}.` });
  revalidatePath("/settings");
  return { ok: true as const, message: off ? "Step turned on." : "Step turned off." };
});
