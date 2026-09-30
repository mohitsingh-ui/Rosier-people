"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { action, UserError, zId, zOptText, zText } from "@/lib/action";
import { assertCan, type Viewer } from "@/lib/auth/viewer";
import { audit } from "@/lib/audit";

const who = (v: Viewer) => (v.employee ? `${v.employee.firstName} ${v.employee.lastName}` : v.email);
const done = (message: string) => { revalidatePath("/", "layout"); return { ok: true as const, message }; };

export const saveDepartment = action(z.object({ id: z.string().optional(), name: zText(60), code: z.string().trim().toUpperCase().min(2).max(6), description: zOptText(300), headId: z.string().optional().transform((v) => v || null) }), async (i, v) => {
  assertCan(v, "org.manage");
  const clash = await db.department.findFirst({ where: { OR: [{ name: i.name }, { code: i.code }], NOT: { id: i.id ?? "" } } });
  if (clash) throw new UserError("A department with that name or code exists.");
  const before = i.id ? await db.department.findUnique({ where: { id: i.id }, include: { head: true } }) : null;
  const d = i.id ? await db.department.update({ where: { id: i.id }, data: { name: i.name, code: i.code, description: i.description, headId: i.headId } }) : await db.department.create({ data: { name: i.name, code: i.code, description: i.description, headId: i.headId } });
  await audit(v, { action: i.id ? "department.update" : "department.create", entity: "Department", entityId: d.id, summary: `${who(v)} ${i.id ? "updated" : "created"} the ${d.name} department.`, before: before ? { name: before.name, head: before.head?.firstName } : null, after: { name: d.name, headId: d.headId } });
  return done("Department saved.");
});

export const deleteDepartment = action(z.object({ id: zId }), async (i, v) => {
  assertCan(v, "org.manage");
  const d = await db.department.findUniqueOrThrow({ where: { id: i.id }, include: { _count: { select: { employees: true } } } });
  if (d._count.employees) throw new UserError(`Move the ${d._count.employees} people in ${d.name} first.`);
  await db.department.delete({ where: { id: d.id } });
  await audit(v, { action: "department.delete", entity: "Department", entityId: d.id, summary: `${who(v)} deleted the ${d.name} department.` });
  return done("Department deleted.");
});

export const saveDesignation = action(z.object({ id: z.string().optional(), name: zText(80), level: z.coerce.number().int().min(1).max(12), departmentId: z.string().optional().transform((v) => v || null) }), async (i, v) => {
  assertCan(v, "org.manage");
  const d = i.id ? await db.designation.update({ where: { id: i.id }, data: { name: i.name, level: i.level, departmentId: i.departmentId } }) : await db.designation.create({ data: { name: i.name, level: i.level, departmentId: i.departmentId } });
  await audit(v, { action: "designation.save", entity: "Designation", entityId: d.id, summary: `${who(v)} saved the designation ${d.name}.` });
  return done("Designation saved.");
});

export const deleteDesignation = action(z.object({ id: zId }), async (i, v) => {
  assertCan(v, "org.manage");
  const d = await db.designation.findUniqueOrThrow({ where: { id: i.id }, include: { _count: { select: { employees: true } } } });
  if (d._count.employees) throw new UserError(`${d._count.employees} people have this designation.`);
  await db.designation.delete({ where: { id: d.id } });
  return done("Designation deleted.");
});

export const saveLocation = action(z.object({ id: z.string().optional(), name: zText(60), city: zText(60), state: zText(60), address: zOptText(200) }), async (i, v) => {
  assertCan(v, "org.manage");
  const { id, ...data } = i;
  const l = id ? await db.location.update({ where: { id }, data }) : await db.location.create({ data });
  await audit(v, { action: "location.save", entity: "Location", entityId: l.id, summary: `${who(v)} saved the ${l.name} location.` });
  return done("Location saved.");
});

export const deleteLocation = action(z.object({ id: zId }), async (i, v) => {
  assertCan(v, "org.manage");
  const l = await db.location.findUniqueOrThrow({ where: { id: i.id }, include: { _count: { select: { employees: true } } } });
  if (l._count.employees) throw new UserError(`${l._count.employees} people work from here.`);
  await db.location.delete({ where: { id: l.id } });
  return done("Location deleted.");
});

export const saveOpening = action(z.object({ id: z.string().optional(), departmentId: zId, title: zText(100), positions: z.coerce.number().int().min(1).max(50), status: z.enum(["OPEN", "ON_HOLD", "CLOSED"]).default("OPEN") }), async (i, v) => {
  assertCan(v, "org.manage");
  const { id, ...data } = i;
  if (id) await db.jobOpening.update({ where: { id }, data }); else await db.jobOpening.create({ data });
  await audit(v, { action: "opening.save", entity: "JobOpening", summary: `${who(v)} saved the opening "${i.title}".` });
  return done("Opening saved.");
});
