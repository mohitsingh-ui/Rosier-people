"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { action, UserError, zBool, zDate, zId, zOptDate, zOptText, zText } from "@/lib/action";
import { accessFor, assertCan, AuthzError, can, type Viewer } from "@/lib/auth/viewer";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/workflow";
import { decrypt, encrypt, last4, randomToken, sha256 } from "@/lib/crypto";
import { hashPassword } from "@/lib/auth/password";
import { revokeAllSessions } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email";
import { notifyEmployees } from "@/lib/notify";
import { dateOnly, today } from "@/lib/dates";
import { setting } from "./queries";
import "./workflows";

const actorName = (v: Viewer) => (v.employee ? `${v.employee.firstName} ${v.employee.lastName}` : v.email);
const EMP_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "CONSULTANT"] as const;
const STATUSES = ["PREBOARDING", "PROBATION", "ACTIVE", "NOTICE_PERIOD", "EXITED", "INACTIVE"] as const;
const ROLE_KEYS = ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"] as const;

async function nextEmployeeCode() {
  const last = await db.employee.findMany({ select: { code: true } });
  const n = Math.max(0, ...last.map((e) => Number(e.code.replace(/\D/g, "")) || 0)) + 1;
  return `ROS-${String(n).padStart(3, "0")}`;
}

/** Refuses a manager change that would create a reporting loop. */
async function assertNoCycle(employeeId: string, managerId: string | null | undefined) {
  if (!managerId) return;
  if (managerId === employeeId) throw new UserError("Someone can't report to themselves.");
  let cur: string | null = managerId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === employeeId) throw new UserError("That would create a reporting loop.");
    if (seen.has(cur)) break;
    seen.add(cur);
    cur = (await db.employee.findUnique({ where: { id: cur }, select: { managerId: true } }))?.managerId ?? null;
  }
}

async function assertRoleAssignable(v: Viewer, role: (typeof ROLE_KEYS)[number]) {
  if ((role === "SUPER_ADMIN" || role === "HR_ADMIN") && !can(v, "settings.security")) throw new AuthzError("Only a Super Admin can grant admin roles.");
}

async function sendInvite(userId: string, email: string, firstName: string) {
  const token = randomToken();
  await db.passwordResetToken.create({ data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 7 * 86400000) } });
  const link = `${process.env.APP_URL ?? ""}/reset-password/${token}`;
  await sendEmail({ to: email, subject: "Welcome to Rosier People — set your password", text: `Hi ${firstName},\n\nYour Rosier People account is ready. Set your password here (valid for 7 days):\n\n${link}\n\nSee you inside!\nRosier HR` });
  if (process.env.NODE_ENV !== "production") console.info(`[dev] invite link for ${email}: /reset-password/${token}`);
  return link;
}

const employeeCore = z.object({
  firstName: zText(60), lastName: zText(60),
  workEmail: z.string().trim().toLowerCase().email("Enter a valid email").max(120),
  workPhone: zOptText(20),
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{2,5}-\d{1,6}$/, "Use a format like ROS-027").optional().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE", "NON_BINARY", "UNDISCLOSED"]).default("UNDISCLOSED"),
  dateOfBirth: zOptDate,
  departmentId: zId, designationId: zId, locationId: zId,
  managerId: z.string().optional().transform((v) => v || null),
  employmentType: z.enum(EMP_TYPES), status: z.enum(["PREBOARDING", "PROBATION", "ACTIVE"]),
  joiningDate: zDate,
  role: z.enum(ROLE_KEYS).default("EMPLOYEE"),
  sendInvite: zBool,
});

export const createEmployee = action(employeeCore, async (input, v) => {
  assertCan(v, "people.create");
  await assertRoleAssignable(v, input.role);
  if (await db.user.findUnique({ where: { email: input.workEmail } })) throw new UserError("That work email is already in use.");
  const code = input.code || (await nextEmployeeCode());
  if (await db.employee.findUnique({ where: { code } })) throw new UserError(`Employee ID ${code} is taken.`);
  const role = await db.role.findUniqueOrThrow({ where: { key: input.role } });
  const shift = await db.shift.findFirst({ where: { isDefault: true } });
  const e = await db.employee.create({
    data: {
      code, firstName: input.firstName, lastName: input.lastName, workEmail: input.workEmail, workPhone: input.workPhone, gender: input.gender,
      dateOfBirth: input.dateOfBirth ? dateOnly(input.dateOfBirth) : null, departmentId: input.departmentId, designationId: input.designationId, locationId: input.locationId,
      managerId: input.managerId, employmentType: input.employmentType, status: input.status, joiningDate: dateOnly(input.joiningDate), shiftId: shift?.id,
      personal: { create: {} },
      jobHistory: { create: { type: "JOINED", toValue: "Joined Rosier Foods", effectiveDate: dateOnly(input.joiningDate), createdById: v.userId } },
      ...(input.managerId ? { reportingHistory: { create: { managerId: input.managerId, startDate: dateOnly(input.joiningDate) } } } : {}),
    },
  });
  const user = await db.user.create({ data: { email: input.workEmail, passwordHash: await hashPassword(randomToken()), roleId: role.id, employeeId: e.id, mustChangePassword: true } });
  if (input.sendInvite) await sendInvite(user.id, user.email, e.firstName);
  await emit("employee.created", { employeeId: e.id, actorUserId: v.userId });
  const dept = await db.department.findUnique({ where: { id: input.departmentId } });
  await audit(v, { action: "employee.create", entity: "Employee", entityId: e.id, summary: `${actorName(v)} added ${e.firstName} ${e.lastName} (${code}) to ${dept?.name ?? "the company"}.`, after: { ...input, code } });
  revalidatePath("/people");
  return { ok: true as const, message: `${e.firstName} added as ${code}.${input.sendInvite ? " Invite emailed." : ""}`, data: { id: e.id } };
});

export const updateJob = action(
  z.object({
    employeeId: zId, departmentId: zId, designationId: zId, locationId: zId, managerId: z.string().optional().transform((v) => v || null),
    employmentType: z.enum(EMP_TYPES), status: z.enum(STATUSES), shiftId: z.string().optional().transform((v) => v || null),
    confirmationDate: zOptDate, workPhone: zOptText(20), effectiveDate: zDate, note: zOptText(300), changeType: z.enum(["AUTO", "PROMOTION", "TRANSFER"]).default("AUTO"),
  }),
  async (input, v) => {
    assertCan(v, "people.edit");
    const before = await db.employee.findUniqueOrThrow({ where: { id: input.employeeId }, include: { department: true, designation: true, location: true, manager: true } });
    if (input.managerId !== before.managerId) {
      assertCan(v, "org.manage");
      await assertNoCycle(input.employeeId, input.managerId);
    }
    const [dept, desig, loc, mgr] = await Promise.all([
      db.department.findUniqueOrThrow({ where: { id: input.departmentId } }), db.designation.findUniqueOrThrow({ where: { id: input.designationId } }),
      db.location.findUniqueOrThrow({ where: { id: input.locationId } }), input.managerId ? db.employee.findUniqueOrThrow({ where: { id: input.managerId } }) : null,
    ]);
    const eff = dateOnly(input.effectiveDate);
    const who = `${before.firstName}'s`;
    const changes: { type: "PROMOTION" | "DESIGNATION_CHANGE" | "DEPARTMENT_CHANGE" | "TRANSFER" | "MANAGER_CHANGE" | "STATUS_CHANGE" | "CONFIRMATION"; from: string | null; to: string | null; sentence: string }[] = [];
    if (before.designationId !== desig.id) changes.push({ type: input.changeType === "PROMOTION" || desig.level > (before.designation?.level ?? 0) ? "PROMOTION" : "DESIGNATION_CHANGE", from: before.designation?.name ?? null, to: desig.name, sentence: `designation from ${before.designation?.name ?? "—"} to ${desig.name}` });
    if (before.departmentId !== dept.id) changes.push({ type: "DEPARTMENT_CHANGE", from: before.department?.name ?? null, to: dept.name, sentence: `department from ${before.department?.name ?? "—"} to ${dept.name}` });
    if (before.locationId !== loc.id) changes.push({ type: "TRANSFER", from: before.location?.name ?? null, to: loc.name, sentence: `location from ${before.location?.name ?? "—"} to ${loc.name}` });
    if (before.managerId !== input.managerId) changes.push({ type: "MANAGER_CHANGE", from: before.manager ? `${before.manager.firstName} ${before.manager.lastName}` : null, to: mgr ? `${mgr.firstName} ${mgr.lastName}` : null, sentence: `reporting manager from ${before.manager ? `${before.manager.firstName} ${before.manager.lastName}` : "none"} to ${mgr ? `${mgr.firstName} ${mgr.lastName}` : "none"}` });
    if (before.status !== input.status) changes.push({ type: input.status === "ACTIVE" && before.status === "PROBATION" ? "CONFIRMATION" : "STATUS_CHANGE", from: before.status, to: input.status, sentence: `status from ${before.status} to ${input.status}` });

    await db.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: input.employeeId },
        data: {
          departmentId: dept.id, designationId: desig.id, locationId: loc.id, managerId: input.managerId, employmentType: input.employmentType, status: input.status, shiftId: input.shiftId,
          workPhone: input.workPhone, confirmationDate: input.confirmationDate ? dateOnly(input.confirmationDate) : input.status === "ACTIVE" && before.status === "PROBATION" ? eff : before.confirmationDate,
          exitDate: input.status === "EXITED" ? before.exitDate ?? eff : before.exitDate,
        },
      });
      for (const c of changes) await tx.jobHistory.create({ data: { employeeId: input.employeeId, type: c.type, fromValue: c.from, toValue: c.to, effectiveDate: eff, note: input.note, createdById: v.userId } });
      if (before.managerId !== input.managerId) {
        await tx.reportingRelationship.updateMany({ where: { employeeId: input.employeeId, endDate: null }, data: { endDate: eff } });
        if (input.managerId) await tx.reportingRelationship.create({ data: { employeeId: input.employeeId, managerId: input.managerId, startDate: eff } });
      }
      if (input.status === "INACTIVE" || input.status === "EXITED") await tx.user.updateMany({ where: { employeeId: input.employeeId }, data: { isActive: false } });
      if (["ACTIVE", "PROBATION", "NOTICE_PERIOD", "PREBOARDING"].includes(input.status) && ["INACTIVE", "EXITED"].includes(before.status)) await tx.user.updateMany({ where: { employeeId: input.employeeId }, data: { isActive: true } });
    });
    if (changes.length) {
      await audit(v, { action: "employee.update_job", entity: "Employee", entityId: input.employeeId, summary: `${actorName(v)} changed ${who} ${changes.map((c) => c.sentence).join("; ")}.`, before: Object.fromEntries(changes.map((c) => [c.type, c.from])), after: Object.fromEntries(changes.map((c) => [c.type, c.to])) });
      await notifyEmployees([input.employeeId], { type: "system", title: "Your job details were updated", body: changes.map((c) => c.sentence).join("; "), link: "/me?tab=job" });
    }
    revalidatePath("/", "layout");
    return { ok: true as const, message: changes.length ? "Job details updated everywhere." : "Saved." };
  },
);

/** Drag-and-drop from the org chart. */
export const changeManager = action(z.object({ employeeId: zId, managerId: z.string().nullable() }), async (input, v) => {
  assertCan(v, "org.manage");
  await assertNoCycle(input.employeeId, input.managerId);
  const [e, m] = await Promise.all([db.employee.findUniqueOrThrow({ where: { id: input.employeeId }, include: { manager: true } }), input.managerId ? db.employee.findUniqueOrThrow({ where: { id: input.managerId } }) : null]);
  if (e.managerId === input.managerId) return { ok: true as const, message: "No change." };
  const t = today();
  await db.$transaction([
    db.employee.update({ where: { id: e.id }, data: { managerId: input.managerId } }),
    db.reportingRelationship.updateMany({ where: { employeeId: e.id, endDate: null }, data: { endDate: t } }),
    ...(input.managerId ? [db.reportingRelationship.create({ data: { employeeId: e.id, managerId: input.managerId, startDate: t } })] : []),
    db.jobHistory.create({ data: { employeeId: e.id, type: "MANAGER_CHANGE", fromValue: e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : null, toValue: m ? `${m.firstName} ${m.lastName}` : null, effectiveDate: t, createdById: v.userId } }),
  ]);
  await audit(v, { action: "employee.change_manager", entity: "Employee", entityId: e.id, summary: `${actorName(v)} changed ${e.firstName}'s reporting manager from ${e.manager ? e.manager.firstName + " " + e.manager.lastName : "none"} to ${m ? m.firstName + " " + m.lastName : "none"}.` });
  await notifyEmployees([e.id, input.managerId, e.managerId], { type: "system", title: `${e.firstName} ${e.lastName} now reports to ${m ? m.firstName + " " + m.lastName : "no one"}`, link: "/organization" });
  revalidatePath("/", "layout");
  return { ok: true as const, message: `${e.firstName} now reports to ${m ? m.firstName : "no one"}.` };
});

const personalSchema = z.object({
  employeeId: zId,
  personalEmail: z.string().trim().email("Enter a valid email").max(120).optional().or(z.literal("")),
  personalPhone: zOptText(20), addressLine1: zOptText(200), addressLine2: zOptText(200), city: zOptText(80), state: zOptText(80),
  pin: z.string().trim().regex(/^\d{6}$/, "PIN is 6 digits").optional().or(z.literal("")),
  maritalStatus: zOptText(20), bloodGroup: zOptText(5), bio: zOptText(500), skills: zOptText(400),
  dateOfBirth: zOptDate, gender: z.enum(["MALE", "FEMALE", "NON_BINARY", "UNDISCLOSED"]).optional(),
  firstName: zOptText(60), lastName: zOptText(60),
});

export const updatePersonal = action(personalSchema, async (input, v) => {
  const acc = accessFor(v, input.employeeId);
  const isSelf = acc.relationship === "self";
  if (!isSelf && !(can(v, "people.edit") && can(v, "people.view_personal"))) throw new AuthzError();
  const editable = new Set(isSelf && !can(v, "people.edit") ? await setting<string[]>("selfEditableFields", []) : Object.keys(input));
  const pick = <K extends keyof typeof input>(k: K) => (editable.has(k as string) ? input[k] : undefined);
  const before = await db.employeePersonal.findUnique({ where: { employeeId: input.employeeId } });
  const data = {
    personalEmail: pick("personalEmail") || null, personalPhone: pick("personalPhone") ?? null, addressLine1: pick("addressLine1") ?? null, addressLine2: pick("addressLine2") ?? null,
    city: pick("city") ?? null, state: pick("state") ?? null, pin: pick("pin") || null, maritalStatus: pick("maritalStatus") ?? null, bloodGroup: pick("bloodGroup") ?? null,
  };
  const filtered = Object.fromEntries(Object.entries(data).filter(([k]) => editable.has(k)));
  await db.employeePersonal.upsert({ where: { employeeId: input.employeeId }, create: { employeeId: input.employeeId, ...filtered }, update: filtered });
  const empData: Record<string, unknown> = {};
  if (editable.has("bio")) empData.bio = input.bio ?? null;
  if (editable.has("skills")) empData.skills = (input.skills ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);
  if (can(v, "people.edit")) {
    if (input.dateOfBirth) empData.dateOfBirth = dateOnly(input.dateOfBirth);
    if (input.gender) empData.gender = input.gender;
    if (input.firstName) empData.firstName = input.firstName;
    if (input.lastName) empData.lastName = input.lastName;
  }
  if (Object.keys(empData).length) await db.employee.update({ where: { id: input.employeeId }, data: empData });
  const e = await db.employee.findUniqueOrThrow({ where: { id: input.employeeId } });
  await audit(v, { action: "employee.update_personal", entity: "Employee", entityId: e.id, summary: `${actorName(v)} updated ${isSelf ? "their own" : `${e.firstName} ${e.lastName}'s`} personal details.`, before: before ? Object.fromEntries(Object.keys(filtered).map((k) => [k, (before as Record<string, unknown>)[k]])) : null, after: filtered });
  revalidatePath(`/people/${input.employeeId}`);
  revalidatePath("/me");
  return { ok: true as const, message: "Personal details saved." };
});

export const updateIdentity = action(
  z.object({
    employeeId: zId,
    pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "PAN looks like ABCDE1234F").optional().or(z.literal("")),
    aadhaar: z.string().transform((s) => s.replace(/\s/g, "")).pipe(z.union([z.literal(""), z.string().regex(/^\d{12}$/, "Aadhaar is 12 digits")])).optional(),
    passport: z.string().trim().toUpperCase().regex(/^[A-Z]\d{7}$/, "Passport looks like Z1234567").optional().or(z.literal("")),
    passportExpiry: zOptDate,
  }),
  async (input, v) => {
    assertCan(v, ["people.view_identity"]);
    assertCan(v, "people.edit");
    const data: Record<string, unknown> = {};
    if (input.pan) Object.assign(data, { panEnc: encrypt(input.pan), panLast4: last4(input.pan) });
    if (input.aadhaar) Object.assign(data, { aadhaarEnc: encrypt(input.aadhaar), aadhaarLast4: last4(input.aadhaar) });
    if (input.passport) Object.assign(data, { passportEnc: encrypt(input.passport), passportLast4: last4(input.passport) });
    if (input.passportExpiry) data.passportExpiry = dateOnly(input.passportExpiry);
    await db.employeePersonal.upsert({ where: { employeeId: input.employeeId }, create: { employeeId: input.employeeId, ...data }, update: data });
    const e = await db.employee.findUniqueOrThrow({ where: { id: input.employeeId } });
    await audit(v, { action: "employee.update_identity", entity: "Employee", entityId: e.id, summary: `${actorName(v)} updated ${e.firstName} ${e.lastName}'s identity numbers (${Object.keys(data).filter((k) => k.endsWith("Enc")).map((k) => k.replace("Enc", "").toUpperCase()).join(", ") || "expiry"}).` });
    revalidatePath(`/people/${input.employeeId}`);
    return { ok: true as const, message: "Identity details saved." };
  },
);

/** Returns one decrypted identifier. Always audit-logged. */
export const revealIdentifier = action(z.object({ employeeId: zId, field: z.enum(["pan", "aadhaar", "passport", "account"]) }), async (input, v) => {
  const acc = accessFor(v, input.employeeId);
  if (input.field === "account") { if (!acc.payroll) throw new AuthzError(); }
  else if (!acc.revealIdentity) throw new AuthzError();
  let value: string | null = null;
  if (input.field === "account") value = decrypt((await db.payrollProfile.findUnique({ where: { employeeId: input.employeeId } }))?.accountNumberEnc);
  else {
    const p = await db.employeePersonal.findUnique({ where: { employeeId: input.employeeId } });
    value = decrypt(input.field === "pan" ? p?.panEnc : input.field === "aadhaar" ? p?.aadhaarEnc : p?.passportEnc);
  }
  if (acc.relationship !== "self") {
    const e = await db.employee.findUniqueOrThrow({ where: { id: input.employeeId } });
    await audit(v, { action: "employee.reveal_identifier", entity: "Employee", entityId: e.id, summary: `${actorName(v)} viewed ${e.firstName} ${e.lastName}'s full ${input.field === "account" ? "bank account number" : input.field.toUpperCase()}.` });
  }
  return { ok: true as const, data: value ?? "" };
});

export const saveFamilyMember = action(
  z.object({ employeeId: zId, id: z.string().optional(), relation: z.enum(["FATHER", "MOTHER", "SPOUSE", "CHILD", "SIBLING", "OTHER"]), name: zText(100), dateOfBirth: zOptDate, phone: zOptText(20), isDependent: zBool }),
  async (input, v) => {
    const acc = accessFor(v, input.employeeId);
    if (!(acc.relationship === "self" || (can(v, "people.edit") && acc.family))) throw new AuthzError();
    const data = { relation: input.relation, name: input.name, dateOfBirth: input.dateOfBirth ? dateOnly(input.dateOfBirth) : null, phone: input.phone, isDependent: input.isDependent };
    if (input.id) {
      const m = await db.familyMember.findUniqueOrThrow({ where: { id: input.id } });
      if (m.employeeId !== input.employeeId) throw new AuthzError();
      await db.familyMember.update({ where: { id: input.id }, data });
    } else await db.familyMember.create({ data: { ...data, employeeId: input.employeeId } });
    await audit(v, { action: "employee.family", entity: "Employee", entityId: input.employeeId, summary: `${actorName(v)} ${input.id ? "updated" : "added"} a family member (${input.relation.toLowerCase()}).` });
    revalidatePath(`/people/${input.employeeId}`);
    return { ok: true as const, message: "Family details saved." };
  },
);

export const removeFamilyMember = action(z.object({ id: zId }), async (input, v) => {
  const m = await db.familyMember.findUniqueOrThrow({ where: { id: input.id } });
  const acc = accessFor(v, m.employeeId);
  if (!(acc.relationship === "self" || (can(v, "people.edit") && acc.family))) throw new AuthzError();
  await db.familyMember.delete({ where: { id: m.id } });
  revalidatePath(`/people/${m.employeeId}`);
  return { ok: true as const, message: "Removed." };
});

export const saveEmergencyContact = action(
  z.object({ employeeId: zId, id: z.string().optional(), name: zText(100), relation: zText(40), phone: z.string().trim().min(6, "Enter a phone number").max(20), isPrimary: zBool }),
  async (input, v) => {
    const acc = accessFor(v, input.employeeId);
    if (!(acc.relationship === "self" || (can(v, "people.edit") && acc.personal))) throw new AuthzError();
    const data = { name: input.name, relation: input.relation, phone: input.phone, isPrimary: input.isPrimary };
    if (input.isPrimary) await db.emergencyContact.updateMany({ where: { employeeId: input.employeeId }, data: { isPrimary: false } });
    if (input.id) {
      const c = await db.emergencyContact.findUniqueOrThrow({ where: { id: input.id } });
      if (c.employeeId !== input.employeeId) throw new AuthzError();
      await db.emergencyContact.update({ where: { id: input.id }, data });
    } else await db.emergencyContact.create({ data: { ...data, employeeId: input.employeeId } });
    revalidatePath(`/people/${input.employeeId}`);
    return { ok: true as const, message: "Emergency contact saved." };
  },
);

export const removeEmergencyContact = action(z.object({ id: zId }), async (input, v) => {
  const c = await db.emergencyContact.findUniqueOrThrow({ where: { id: input.id } });
  const acc = accessFor(v, c.employeeId);
  if (!(acc.relationship === "self" || (can(v, "people.edit") && acc.personal))) throw new AuthzError();
  await db.emergencyContact.delete({ where: { id: c.id } });
  revalidatePath(`/people/${c.employeeId}`);
  return { ok: true as const, message: "Removed." };
});

export const setRole = action(z.object({ employeeId: zId, role: z.enum(ROLE_KEYS) }), async (input, v) => {
  assertCan(v, "people.edit");
  await assertRoleAssignable(v, input.role);
  const u = await db.user.findUniqueOrThrow({ where: { employeeId: input.employeeId }, include: { role: true, employee: true } });
  if ((u.role.key === "SUPER_ADMIN" || u.role.key === "HR_ADMIN") && !can(v, "settings.security")) throw new AuthzError("Only a Super Admin can change an admin's role.");
  if (u.id === v.userId) throw new UserError("You can't change your own role.");
  const role = await db.role.findUniqueOrThrow({ where: { key: input.role } });
  await db.user.update({ where: { id: u.id }, data: { roleId: role.id } });
  await audit(v, { action: "user.role", entity: "User", entityId: u.id, summary: `${actorName(v)} changed ${u.employee?.firstName}'s role from ${u.role.name} to ${role.name}.`, before: { role: u.role.key }, after: { role: input.role } });
  revalidatePath(`/people/${input.employeeId}`);
  return { ok: true as const, message: `Role set to ${role.name}.` };
});

export const resetEmployeePassword = action(z.object({ employeeId: zId }), async (input, v) => {
  assertCan(v, "people.reset_password");
  const u = await db.user.findUniqueOrThrow({ where: { employeeId: input.employeeId }, include: { employee: true, role: true } });
  if (u.role.key === "SUPER_ADMIN" && !can(v, "settings.security")) throw new AuthzError();
  await db.user.update({ where: { id: u.id }, data: { lockedUntil: null, failedLoginCount: 0 } });
  await revokeAllSessions(u.id);
  await sendInvite(u.id, u.email, u.employee?.firstName ?? "");
  await audit(v, { action: "user.reset_password", entity: "User", entityId: u.id, summary: `${actorName(v)} sent a password reset to ${u.email} and signed them out everywhere.` });
  return { ok: true as const, message: `Reset link emailed to ${u.email}.` };
});

export const deactivateEmployee = action(z.object({ employeeId: zId, note: zOptText(300) }), async (input, v) => {
  assertCan(v, "people.edit");
  const e = await db.employee.findUniqueOrThrow({ where: { id: input.employeeId } });
  if (e.id === v.employeeId) throw new UserError("You can't deactivate yourself.");
  const active = e.status !== "INACTIVE";
  await db.employee.update({ where: { id: e.id }, data: { status: active ? "INACTIVE" : "ACTIVE" } });
  await db.user.updateMany({ where: { employeeId: e.id }, data: { isActive: !active } });
  if (active) { const u = await db.user.findUnique({ where: { employeeId: e.id } }); if (u) await revokeAllSessions(u.id); }
  await db.jobHistory.create({ data: { employeeId: e.id, type: "STATUS_CHANGE", fromValue: e.status, toValue: active ? "INACTIVE" : "ACTIVE", effectiveDate: today(), note: input.note, createdById: v.userId } });
  await audit(v, { action: active ? "employee.deactivate" : "employee.reactivate", entity: "Employee", entityId: e.id, summary: `${actorName(v)} ${active ? "deactivated" : "reactivated"} ${e.firstName} ${e.lastName}.` });
  revalidatePath("/people");
  revalidatePath(`/people/${e.id}`);
  return { ok: true as const, message: active ? "Employee deactivated and signed out." : "Employee reactivated." };
});

export const deleteEmployee = action(z.object({ employeeId: zId, confirm: z.string() }), async (input, v) => {
  assertCan(v, "people.delete");
  const e = await db.employee.findUniqueOrThrow({ where: { id: input.employeeId } });
  if (input.confirm.trim().toUpperCase() !== e.code) throw new UserError(`Type ${e.code} to confirm.`);
  if (e.id === v.employeeId) throw new UserError("You can't delete yourself.");
  await db.employee.updateMany({ where: { managerId: e.id }, data: { managerId: e.managerId } });
  await db.user.deleteMany({ where: { employeeId: e.id } });
  await db.employee.delete({ where: { id: e.id } });
  await audit(v, { action: "employee.delete", entity: "Employee", entityId: e.id, summary: `${actorName(v)} permanently deleted ${e.firstName} ${e.lastName} (${e.code}).`, before: { code: e.code, name: `${e.firstName} ${e.lastName}` } });
  revalidatePath("/people");
  return { ok: true as const, message: "Employee deleted." };
});

export const assignTask = action(z.object({ assigneeId: zId, title: zText(200), description: zOptText(1000), dueDate: zOptDate }), async (input, v) => {
  assertCan(v, "tasks.assign");
  if (!v.employeeId) throw new UserError("Your login isn't linked to an employee.");
  if (!v.teamIds.has(input.assigneeId) && !can(v, "people.edit")) throw new AuthzError("You can only assign tasks to your team.");
  await db.task.create({ data: { assigneeId: input.assigneeId, createdById: v.employeeId, title: input.title, description: input.description, dueDate: input.dueDate ? dateOnly(input.dueDate) : null } });
  await notifyEmployees([input.assigneeId], { type: "task.assigned", title: `New task from ${v.employee?.firstName}`, body: input.title, link: "/me#tasks" });
  revalidatePath("/my-team");
  return { ok: true as const, message: "Task assigned." };
});

export const updateTask = action(z.object({ id: zId, status: z.enum(["PENDING", "IN_PROGRESS", "DONE", "BLOCKED"]) }), async (input, v) => {
  const t = await db.task.findUniqueOrThrow({ where: { id: input.id } });
  if (t.assigneeId !== v.employeeId && t.createdById !== v.employeeId) throw new AuthzError();
  await db.task.update({ where: { id: t.id }, data: { status: input.status, completedAt: input.status === "DONE" ? new Date() : null } });
  if (input.status === "DONE" && t.assigneeId === v.employeeId) await notifyEmployees([t.createdById], { type: "task.assigned", title: `${v.employee?.firstName} completed: ${t.title}`, link: "/my-team" });
  revalidatePath("/", "layout");
  return { ok: true as const, message: input.status === "DONE" ? "Nice — task done." : "Task updated." };
});

export const acknowledgePolicy = action(z.object({ policyId: zId }), async (input, v) => {
  if (!v.employeeId) throw new UserError("No employee record.");
  const p = await db.policy.findUniqueOrThrow({ where: { id: input.policyId } });
  await db.documentAcknowledgement.upsert({ where: { employeeId_policyId_policyVersion: { employeeId: v.employeeId, policyId: p.id, policyVersion: p.version } }, create: { employeeId: v.employeeId, policyId: p.id, policyVersion: p.version }, update: {} });
  await audit(v, { action: "policy.acknowledge", entity: "Policy", entityId: p.id, summary: `${actorName(v)} acknowledged the ${p.title} (v${p.version}).` });
  revalidatePath("/", "layout");
  return { ok: true as const, message: "Thanks — acknowledged." };
});

