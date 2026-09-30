"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { action, UserError, zDate, zFile, zId, zOptDate, zOptText, zText } from "@/lib/action";
import { assertCan, AuthzError, can, type Viewer } from "@/lib/auth/viewer";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/workflow";
import { notifyEmployees } from "@/lib/notify";
import { fileUrl, storage, storeBuffer, storeUpload } from "@/lib/storage";
import { letterPdf } from "@/lib/pdf";
import { renderTemplate } from "@/lib/templates";
import { dateOnly, fmtDate, today } from "@/lib/dates";
import { companySettings } from "./queries";
import { canSeeDocument, letterVariables } from "./documents-lib";
import "./workflows";

const actorName = (v: Viewer) => (v.employee ? `${v.employee.firstName} ${v.employee.lastName}` : v.email);

export const uploadDocument = action(
  z.object({ employeeId: zId, typeId: zId, name: zOptText(150), expiryDate: zOptDate, visibility: z.enum(["EMPLOYEE", "MANAGER", "HR_ONLY"]).optional(), file: zFile }),
  async (input, v) => {
    const type = await db.documentType.findUniqueOrThrow({ where: { id: input.typeId } });
    const hr = can(v, "documents.manage");
    const self = input.employeeId === v.employeeId;
    if (!hr && !(self && type.employeeUpload)) throw new AuthzError(self ? "HR uploads this document type for you." : undefined);
    if (!input.file) throw new UserError("Choose a file to upload.");
    if (type.hasExpiry && !input.expiryDate) throw new UserError(`${type.name} needs an expiry date.`);
    const stored = await storeUpload(input.file, `employees/${input.employeeId}`);
    const doc = await db.employeeDocument.create({
      data: {
        employeeId: input.employeeId, typeId: type.id, name: input.name || type.name, visibility: hr && input.visibility ? input.visibility : type.defaultVisibility,
        expiryDate: input.expiryDate ? dateOnly(input.expiryDate) : null, status: hr ? "VERIFIED" : "PENDING", uploadedById: v.userId,
        verifiedById: hr ? v.userId : null, verifiedAt: hr ? new Date() : null,
        versions: { create: { version: 1, ...stored, uploadedById: v.userId } },
      },
      include: { employee: true },
    });
    await emit("document.uploaded", { documentId: doc.id });
    if (!self) await notifyEmployees([input.employeeId], { type: "document.verified", title: `HR added ${doc.name} to your documents`, link: "/documents" });
    await audit(v, { action: "document.upload", entity: "EmployeeDocument", entityId: doc.id, summary: `${actorName(v)} uploaded ${doc.name} for ${self ? "themselves" : `${doc.employee.firstName} ${doc.employee.lastName}`}.` });
    revalidatePath("/documents");
    revalidatePath(`/people/${input.employeeId}`);
    return { ok: true as const, message: hr ? "Uploaded and verified." : "Uploaded. HR will verify it shortly." };
  },
);

export const replaceDocument = action(z.object({ documentId: zId, expiryDate: zOptDate, file: zFile }), async (input, v) => {
  const doc = await db.employeeDocument.findUniqueOrThrow({ where: { id: input.documentId }, include: { type: true } });
  const hr = can(v, "documents.manage");
  if (!hr && !(doc.employeeId === v.employeeId && doc.type.employeeUpload && !doc.isGenerated)) throw new AuthzError();
  if (!input.file) throw new UserError("Choose a file.");
  const stored = await storeUpload(input.file, `employees/${doc.employeeId}`);
  const version = doc.currentVersion + 1;
  await db.employeeDocument.update({
    where: { id: doc.id },
    data: {
      currentVersion: version, status: hr ? "VERIFIED" : "PENDING", rejectionNote: null, verifiedById: hr ? v.userId : null, verifiedAt: hr ? new Date() : null,
      ...(input.expiryDate ? { expiryDate: dateOnly(input.expiryDate) } : {}), versions: { create: { version, ...stored, uploadedById: v.userId } },
    },
  });
  await emit("document.uploaded", { documentId: doc.id });
  await audit(v, { action: "document.replace", entity: "EmployeeDocument", entityId: doc.id, summary: `${actorName(v)} uploaded version ${version} of ${doc.name}.` });
  revalidatePath("/documents");
  revalidatePath(`/people/${doc.employeeId}`);
  return { ok: true as const, message: `Version ${version} uploaded.` };
});

export const reviewDocument = action(z.object({ documentId: zId, decision: z.enum(["VERIFIED", "REJECTED"]), note: zOptText(400) }), async (input, v) => {
  assertCan(v, "documents.manage");
  const doc = await db.employeeDocument.findUniqueOrThrow({ where: { id: input.documentId }, include: { employee: true } });
  if (input.decision === "REJECTED" && !input.note) throw new UserError("Tell the employee what to fix.");
  await db.employeeDocument.update({ where: { id: doc.id }, data: { status: input.decision, verifiedById: input.decision === "VERIFIED" ? v.userId : null, verifiedAt: input.decision === "VERIFIED" ? new Date() : null, rejectionNote: input.decision === "REJECTED" ? input.note : null } });
  await notifyEmployees([doc.employeeId], { type: input.decision === "VERIFIED" ? "document.verified" : "document.rejected", title: input.decision === "VERIFIED" ? `${doc.name} verified` : `${doc.name} needs a re-upload`, body: input.note, link: "/documents", email: input.decision === "REJECTED" });
  await audit(v, { action: `document.${input.decision.toLowerCase()}`, entity: "EmployeeDocument", entityId: doc.id, summary: `${actorName(v)} ${input.decision === "VERIFIED" ? "verified" : "rejected"} ${doc.employee.firstName} ${doc.employee.lastName}'s ${doc.name}.` });
  revalidatePath("/documents");
  revalidatePath(`/people/${doc.employeeId}`);
  return { ok: true as const, message: input.decision === "VERIFIED" ? "Verified." : "Sent back for re-upload." };
});

export const updateDocumentMeta = action(z.object({ documentId: zId, name: zText(150), visibility: z.enum(["EMPLOYEE", "MANAGER", "HR_ONLY"]), expiryDate: zOptDate }), async (input, v) => {
  assertCan(v, "documents.manage");
  const doc = await db.employeeDocument.findUniqueOrThrow({ where: { id: input.documentId } });
  await db.employeeDocument.update({ where: { id: doc.id }, data: { name: input.name, visibility: input.visibility, expiryDate: input.expiryDate ? dateOnly(input.expiryDate) : null } });
  await audit(v, { action: "document.update", entity: "EmployeeDocument", entityId: doc.id, summary: `${actorName(v)} updated ${doc.name} (visibility ${input.visibility}).`, before: { visibility: doc.visibility, expiry: doc.expiryDate }, after: { visibility: input.visibility, expiry: input.expiryDate } });
  revalidatePath("/documents");
  revalidatePath(`/people/${doc.employeeId}`);
  return { ok: true as const, message: "Document updated." };
});

export const archiveDocument = action(z.object({ documentId: zId }), async (input, v) => {
  const doc = await db.employeeDocument.findUniqueOrThrow({ where: { id: input.documentId } });
  const own = doc.employeeId === v.employeeId && !doc.isGenerated && doc.status !== "VERIFIED";
  if (!can(v, "documents.manage") && !own) throw new AuthzError("Verified documents can only be archived by HR.");
  await db.employeeDocument.update({ where: { id: doc.id }, data: { archivedAt: doc.archivedAt ? null : new Date(), status: doc.archivedAt ? "VERIFIED" : "ARCHIVED" } });
  await audit(v, { action: doc.archivedAt ? "document.restore" : "document.archive", entity: "EmployeeDocument", entityId: doc.id, summary: `${actorName(v)} ${doc.archivedAt ? "restored" : "archived"} ${doc.name}.` });
  revalidatePath("/documents");
  revalidatePath(`/people/${doc.employeeId}`);
  return { ok: true as const, message: doc.archivedAt ? "Restored." : "Archived." };
});

export const deleteDocument = action(z.object({ documentId: zId }), async (input, v) => {
  assertCan(v, "documents.manage");
  const doc = await db.employeeDocument.findUniqueOrThrow({ where: { id: input.documentId }, include: { versions: true, employee: true } });
  const store = await storage();
  await Promise.all(doc.versions.map((ver) => store.remove(ver.storageKey)));
  await db.employeeDocument.delete({ where: { id: doc.id } });
  await audit(v, { action: "document.delete", entity: "EmployeeDocument", entityId: doc.id, summary: `${actorName(v)} permanently deleted ${doc.employee.firstName} ${doc.employee.lastName}'s ${doc.name}.` });
  revalidatePath("/documents");
  revalidatePath(`/people/${doc.employeeId}`);
  return { ok: true as const, message: "Deleted." };
});

/** Issues a 5-minute signed URL after checking access. */
export const documentLink = action(z.object({ documentId: zId, version: z.coerce.number().int().optional(), download: z.boolean().optional() }), async (input, v) => {
  const doc = await db.employeeDocument.findUniqueOrThrow({ where: { id: input.documentId }, include: { versions: true, type: true, employee: true } });
  if (!canSeeDocument(v, doc)) throw new AuthzError();
  const ver = doc.versions.find((x) => x.version === (input.version ?? doc.currentVersion)) ?? doc.versions[0];
  if (!ver) throw new UserError("No file found for this document.");
  if (doc.employeeId !== v.employeeId && doc.type.isSensitive)
    await audit(v, { action: "document.view", entity: "EmployeeDocument", entityId: doc.id, summary: `${actorName(v)} opened ${doc.employee.firstName} ${doc.employee.lastName}'s ${doc.name}.` });
  const url = await fileUrl(ver.storageKey, ver.fileName, ver.mimeType, input.download ? "attachment" : "inline");
  return { ok: true as const, data: { url, mimeType: ver.mimeType, fileName: ver.fileName } };
});

const TEMPLATE_TO_TYPE: Record<string, string> = {
  OFFER_LETTER: "Offer Letter", APPOINTMENT_LETTER: "Appointment Letter", SALARY_REVISION_LETTER: "Salary Revision Letter", PROMOTION_LETTER: "Promotion Letter",
  TRANSFER_LETTER: "Transfer Letter", EXPERIENCE_LETTER: "Experience Letter", RELIEVING_LETTER: "Relieving Letter", WARNING_LETTER: "Warning Letter",
  INCREMENT_LETTER: "Increment Letter", APPRAISAL_LETTER: "Appraisal Letter", INTERNSHIP_CERTIFICATE: "Internship Certificate", EMPLOYMENT_VERIFICATION_LETTER: "Employment Verification Letter",
};

export const generateLetter = action(
  z.object({ employeeId: zId, templateId: zId, effective_date: zOptText(40), new_designation: zOptText(80), new_department: zOptText(80), new_location: zOptText(80), reason: zOptText(500), exit_date: zOptText(40), body: zOptText(20000), notify: z.string().optional() }),
  async (input, v) => {
    assertCan(v, "documents.generate");
    const tpl = await db.documentTemplate.findUniqueOrThrow({ where: { id: input.templateId } });
    const vars = await letterVariables(v, input.employeeId, { effective_date: input.effective_date, new_designation: input.new_designation, new_department: input.new_department, new_location: input.new_location, reason: input.reason, exit_date: input.exit_date });
    const body = renderTemplate(input.body || tpl.body, vars);
    const leftover = body.match(/\{\{\s*[a-z_]+\s*\}\}/g);
    if (leftover) throw new UserError(`Fill in: ${[...new Set(leftover)].join(", ")}`);
    const company = await companySettings();
    const e = await db.employee.findUniqueOrThrow({ where: { id: input.employeeId } });
    const ref = `RF/HR/${tpl.kind.split("_")[0].slice(0, 3)}/${e.code}/${Date.now().toString(36).toUpperCase()}`;
    const pdf = await letterPdf({ title: tpl.subject, body, date: fmtDate(today()), reference: ref, company, signatory: { name: vars.hr_name ?? "HR", title: "People Team, " + company.shortName } });
    const stored = await storeBuffer(pdf, `employees/${e.id}`, `${tpl.name.replace(/\s+/g, "-")}-${e.code}.pdf`, "application/pdf");
    const typeName = TEMPLATE_TO_TYPE[tpl.kind] ?? "Other Document";
    const type = (await db.documentType.findUnique({ where: { name: typeName } })) ?? (await db.documentType.findFirstOrThrow({ where: { name: "Other Document" } }));
    const doc = await db.employeeDocument.create({
      data: { employeeId: e.id, typeId: type.id, name: `${tpl.name} — ${fmtDate(today(), "MMM yyyy")}`, status: "VERIFIED", visibility: type.defaultVisibility, isGenerated: true, uploadedById: v.userId, verifiedById: v.userId, verifiedAt: new Date(), versions: { create: { version: 1, ...stored, uploadedById: v.userId } } },
    });
    if (input.notify === "on" && type.defaultVisibility !== "HR_ONLY") await notifyEmployees([e.id], { type: "document.generated", title: `Your ${tpl.name.toLowerCase()} is ready`, link: "/documents", email: true });
    await audit(v, { action: "document.generate", entity: "EmployeeDocument", entityId: doc.id, summary: `${actorName(v)} generated a ${tpl.name} for ${e.firstName} ${e.lastName}.` });
    revalidatePath(`/people/${e.id}`);
    revalidatePath("/documents");
    return { ok: true as const, message: `${tpl.name} generated and saved to ${e.firstName}'s documents.` };
  },
);

/** Preview text for the letter drawer (no PDF, nothing stored). */
export const previewLetter = action(z.object({ employeeId: zId, templateId: zId }), async (input, v) => {
  assertCan(v, "documents.generate");
  const tpl = await db.documentTemplate.findUniqueOrThrow({ where: { id: input.templateId } });
  const vars = await letterVariables(v, input.employeeId);
  return { ok: true as const, data: { body: renderTemplate(tpl.body, vars), subject: tpl.subject } };
});

export const saveTemplate = action(z.object({ id: z.string().optional(), name: zText(80), kind: zText(60), subject: zText(120), body: zText(20000, 20), isActive: z.string().optional() }), async (input, v) => {
  assertCan(v, "settings.manage");
  const data = { name: input.name, kind: input.kind.toUpperCase().replace(/\s+/g, "_"), subject: input.subject, body: input.body, isActive: input.isActive !== "off" };
  const t = input.id ? await db.documentTemplate.update({ where: { id: input.id }, data }) : await db.documentTemplate.create({ data });
  await audit(v, { action: input.id ? "template.update" : "template.create", entity: "DocumentTemplate", entityId: t.id, summary: `${actorName(v)} ${input.id ? "edited" : "created"} the ${t.name} template.` });
  revalidatePath("/settings");
  return { ok: true as const, message: "Template saved." };
});

export const saveDocumentType = action(
  z.object({ id: z.string().optional(), name: zText(80), categoryId: zId, hasExpiry: z.string().optional(), isMandatory: z.string().optional(), isSensitive: z.string().optional(), employeeUpload: z.string().optional(), defaultVisibility: z.enum(["EMPLOYEE", "MANAGER", "HR_ONLY"]) }),
  async (input, v) => {
    assertCan(v, "settings.manage");
    const data = { name: input.name, categoryId: input.categoryId, hasExpiry: input.hasExpiry === "on", isMandatory: input.isMandatory === "on", isSensitive: input.isSensitive === "on", employeeUpload: input.employeeUpload === "on", defaultVisibility: input.defaultVisibility };
    const t = input.id ? await db.documentType.update({ where: { id: input.id }, data }) : await db.documentType.create({ data });
    await audit(v, { action: "document_type.save", entity: "DocumentType", entityId: t.id, summary: `${actorName(v)} saved document type ${t.name}.` });
    revalidatePath("/settings");
    return { ok: true as const, message: "Document type saved." };
  },
);

export const requestDocuments = action(z.object({ employeeIds: z.array(zId).min(1), typeId: zId, dueDate: zDate }), async (input, v) => {
  assertCan(v, "documents.manage");
  const t = await db.documentType.findUniqueOrThrow({ where: { id: input.typeId } });
  await notifyEmployees(input.employeeIds, { type: "document.requested", title: `HR needs your ${t.name}`, body: `Please upload it by ${input.dueDate}.`, link: `/documents?upload=${t.id}`, email: true });
  await audit(v, { action: "document.request", entity: "DocumentType", entityId: t.id, summary: `${actorName(v)} requested ${t.name} from ${input.employeeIds.length} employee(s).` });
  return { ok: true as const, message: `Request sent to ${input.employeeIds.length} ${input.employeeIds.length === 1 ? "person" : "people"}.` };
});

