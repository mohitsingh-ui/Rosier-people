import { FileText, FileImage, Lock, Users, History, Plus, FileSignature } from "lucide-react";
import { db } from "@/lib/db";
import { can, type Viewer } from "@/lib/auth/viewer";
import { fmtDate, isoOf } from "@/lib/dates";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal, Drawer } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/misc";
import { ActionButton } from "@/components/ui/action-button";
import { OverflowMenu } from "@/components/people/menu";
import { expiryState } from "@/server/queries";
import { reviewDocument, archiveDocument, deleteDocument } from "@/server/documents";
import { DocumentViewerButton, UploadForm, ReplaceForm, MetaForm, GenerateLetterForm } from "./client";
import type { Prisma } from "@/generated/prisma/client";

const VIS = { EMPLOYEE: { label: "Employee + HR", Icon: FileText }, MANAGER: { label: "Shared with manager", Icon: Users }, HR_ONLY: { label: "HR only", Icon: Lock } } as const;

/** Visibility filter applied in the query itself, so hidden documents are never loaded. */
export function documentWhere(v: Viewer, employeeId: string): Prisma.EmployeeDocumentWhereInput {
  if (can(v, "documents.manage")) return { employeeId };
  if (employeeId === v.employeeId) return { employeeId, visibility: { not: "HR_ONLY" } };
  if (can(v, "documents.team_view") && v.teamIds.has(employeeId)) return { employeeId, visibility: "MANAGER" };
  return { id: "__none__" };
}

export async function DocumentVault({ v, employeeId, showArchived = false, defaultUploadType }: { v: Viewer; employeeId: string; showArchived?: boolean; defaultUploadType?: string }) {
  const hr = can(v, "documents.manage");
  const self = employeeId === v.employeeId;
  const [docs, categories, types, templates] = await Promise.all([
    db.employeeDocument.findMany({ where: { ...documentWhere(v, employeeId), ...(showArchived ? {} : { archivedAt: null }) }, include: { type: { include: { category: true } }, versions: { orderBy: { version: "desc" } } }, orderBy: { createdAt: "desc" } }),
    db.documentCategory.findMany({ orderBy: { order: "asc" } }),
    db.documentType.findMany({ where: hr ? {} : { employeeUpload: true }, orderBy: { name: "asc" } }),
    can(v, "documents.generate") ? db.documentTemplate.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const uploaders = await db.user.findMany({ where: { id: { in: [...new Set(docs.map((d) => d.uploadedById).filter(Boolean) as string[])] } }, select: { id: true, employee: { select: { firstName: true, lastName: true } } } });
  const who = new Map(uploaders.map((u) => [u.id, u.employee ? `${u.employee.firstName} ${u.employee.lastName}` : "System"]));
  const canUpload = hr || self;
  const mandatory = self || hr ? await db.documentType.findMany({ where: { isMandatory: true } }) : [];
  const missing = mandatory.filter((t) => !docs.some((d) => d.typeId === t.id && d.status !== "REJECTED" && !d.archivedAt));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">{docs.length} document{docs.length === 1 ? "" : "s"} · Files are private and open through links that expire after five minutes.</p>
        <div className="flex gap-2">
          {templates.length > 0 && (
            <Drawer title="Generate a letter" description="Fills the template with this employee's details and saves the PDF to their documents." trigger={<Button variant="secondary"><FileSignature className="size-4" />Generate letter</Button>}>
              <GenerateLetterForm employeeId={employeeId} templates={templates.map((t) => ({ value: t.id, label: t.name, kind: t.kind }))} />
            </Drawer>
          )}
          {canUpload && (
            <Modal title="Upload a document" trigger={<Button><Plus className="size-4" />Upload</Button>}>
              <UploadForm employeeId={employeeId} hr={hr} defaultTypeId={defaultUploadType} types={types.map((t) => ({ value: t.id, label: t.name, hasExpiry: t.hasExpiry }))} />
            </Modal>
          )}
        </div>
      </div>

      {missing.length > 0 && (
        <div className="rounded-ctl border border-warn/25 bg-warn-bg/60 px-4 py-3 text-[13px]">
          <span className="font-medium text-warn">Still needed: </span>
          <span className="text-ink-2">{missing.map((m) => m.name).join(", ")}</span>
        </div>
      )}

      {docs.length === 0 ? (
        <div className="card"><EmptyState icon={FileText} title="No documents yet" body={canUpload ? "Upload ID proofs, certificates and letters here. Only you and HR can see them." : undefined} /></div>
      ) : (
        categories.map((c) => {
          const list = docs.filter((d) => d.type.categoryId === c.id);
          if (!list.length) return null;
          return (
            <section key={c.id} className="card">
              <h3 className="px-5 py-3 border-b border-line text-[14px] font-semibold flex items-center gap-2">{c.name}<span className="text-muted font-normal text-[12.5px]">{list.length}</span></h3>
              <ul className="divide-y divide-line">
                {list.map((d) => {
                  const exp = expiryState(d.expiryDate);
                  const vis = VIS[d.visibility];
                  const cur = d.versions[0];
                  const isImg = cur?.mimeType.startsWith("image/");
                  return (
                    <li key={d.id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <span className="size-9 rounded-lg bg-brand-50 text-brand grid place-items-center shrink-0">{isImg ? <FileImage className="size-4" /> : <FileText className="size-4" />}</span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-[14px]">{d.name}</span>
                            <StatusBadge status={d.status} />
                            {exp && exp.tone !== "ok" && <Badge tone={exp.tone}>{exp.label}</Badge>}
                            {d.isGenerated && <Badge tone="brand">Generated</Badge>}
                          </div>
                          <div className="text-[12px] text-muted mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                            <span>{d.type.name}</span>
                            <span>v{d.currentVersion}</span>
                            <span>Uploaded {fmtDate(d.createdAt)} by {who.get(d.uploadedById ?? "") ?? "—"}</span>
                            {d.expiryDate && <span>Expires {fmtDate(d.expiryDate)}</span>}
                            <span className="inline-flex items-center gap-1"><vis.Icon className="size-3" />{vis.label}</span>
                          </div>
                          {d.status === "REJECTED" && d.rejectionNote && <p className="text-[12.5px] text-bad mt-1">HR: {d.rejectionNote}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 sm:justify-end">
                        {cur && <DocumentViewerButton documentId={d.id} label={d.name} />}
                        {hr && d.status === "PENDING" && (
                          <>
                            <ActionButton action={reviewDocument} payload={{ documentId: d.id, decision: "VERIFIED" }} success="Verified" variant="subtle">Verify</ActionButton>
                            <ActionButton action={reviewDocument} payload={{ documentId: d.id, decision: "REJECTED" }} success="Sent back" variant="danger" confirm={{ title: `Reject ${d.name}?`, body: "The employee will be asked to upload it again.", confirmLabel: "Reject", danger: true, note: { label: "What needs fixing?", required: true } }}>Reject</ActionButton>
                          </>
                        )}
                        {(hr || (self && d.type.employeeUpload && !d.isGenerated)) && (
                          <OverflowMenu>
                            <Modal title={`Upload a new version of ${d.name}`} trigger={<Button variant="ghost" size="sm">Replace file</Button>}><ReplaceForm documentId={d.id} hasExpiry={d.type.hasExpiry} /></Modal>
                            {d.versions.length > 1 && (
                              <Modal title="Version history" trigger={<Button variant="ghost" size="sm"><History className="size-4" />Version history</Button>}>
                                <ul className="divide-y divide-line">{d.versions.map((ver) => (
                                  <li key={ver.id} className="flex items-center justify-between py-2.5 text-[13px]"><span><span className="font-medium">v{ver.version}</span> · {ver.fileName} <span className="text-muted">· {fmtDate(ver.createdAt)}</span></span><DocumentViewerButton documentId={d.id} version={ver.version} /></li>
                                ))}</ul>
                              </Modal>
                            )}
                            {hr && <Modal title="Edit details" trigger={<Button variant="ghost" size="sm">Edit details</Button>}><MetaForm d={{ id: d.id, name: d.name, visibility: d.visibility, expiryDate: d.expiryDate ? isoOf(d.expiryDate) : null }} /></Modal>}
                            {(hr || d.status !== "VERIFIED") && <ActionButton action={archiveDocument} payload={{ documentId: d.id }} variant="ghost" success={d.archivedAt ? "Restored" : "Archived"}>{d.archivedAt ? "Restore" : "Archive"}</ActionButton>}
                            {hr && <ActionButton action={deleteDocument} payload={{ documentId: d.id }} variant="ghost" className="text-bad" confirm={{ title: `Delete ${d.name}?`, body: "All versions are permanently removed. Archive instead if you may need it later.", confirmLabel: "Delete", danger: true }}>Delete permanently</ActionButton>}
                          </OverflowMenu>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
