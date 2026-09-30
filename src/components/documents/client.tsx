"use client";
import { useState, useTransition } from "react";
import { Eye, Download, ExternalLink } from "lucide-react";
import { documentLink, uploadDocument, replaceDocument, updateDocumentMeta, generateLetter, previewLetter } from "@/server/documents";
import { ActionForm, Input, Select, Submit, FormActions, Grid, Textarea, Checkbox } from "@/components/ui/form";
import { FileUploader } from "@/components/ui/file-uploader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type Opt = { value: string; label: string };

/** DocumentViewer: fetches a short-lived signed URL and previews PDFs/images inline. */
export function DocumentViewerButton({ documentId, version, label }: { documentId: string; version?: number; label?: string }) {
  const [pending, start] = useTransition();
  const [file, setFile] = useState<{ url: string; mimeType: string; fileName: string } | null>(null);
  const toast = useToast();
  const open = (download = false) =>
    start(async () => {
      const r = await documentLink({ documentId, version, download });
      if (!r.ok) return toast("error", r.error);
      const d = r.data as { url: string; mimeType: string; fileName: string };
      if (download) window.location.href = d.url;
      else if (d.mimeType === "application/pdf" || d.mimeType.startsWith("image/")) setFile(d);
      else window.open(d.url, "_blank", "noopener");
    });
  return (
    <>
      <span className="inline-flex gap-1">
        <Button variant="ghost" size="iconSm" onClick={() => open(false)} disabled={pending} aria-label={`Preview ${label ?? "document"}`} title="Preview"><Eye className="size-4" /></Button>
        <Button variant="ghost" size="iconSm" onClick={() => open(true)} disabled={pending} aria-label={`Download ${label ?? "document"}`} title="Download"><Download className="size-4" /></Button>
      </span>
      {file && (
        <div className="fixed inset-0 z-[75] flex flex-col bg-ink/80" role="dialog" aria-modal="true" aria-label={file.fileName}>
          <div className="flex items-center justify-between gap-3 px-4 h-14 text-white">
            <span className="truncate text-[14px]">{file.fileName}</span>
            <span className="flex gap-2">
              <a href={file.url} target="_blank" rel="noopener" className="h-9 px-3 rounded-ctl bg-white/10 hover:bg-white/20 inline-flex items-center gap-1.5 text-[13px]"><ExternalLink className="size-4" />Open</a>
              <button onClick={() => setFile(null)} className="h-9 px-3 rounded-ctl bg-white text-ink text-[13px] font-medium">Close</button>
            </span>
          </div>
          <div className="flex-1 min-h-0 px-2 pb-2 sm:px-8 sm:pb-8" onClick={() => setFile(null)}>
            {file.mimeType === "application/pdf" ? (
              <iframe src={file.url} title={file.fileName} className="w-full h-full rounded-card bg-white" onClick={(e) => e.stopPropagation()} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={file.url} alt={file.fileName} className="max-w-full max-h-full mx-auto object-contain rounded-card bg-white" onClick={(e) => e.stopPropagation()} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** DocumentUploader form. */
export function UploadForm({ employeeId, types, hr, defaultTypeId }: { employeeId: string; types: (Opt & { hasExpiry: boolean })[]; hr: boolean; defaultTypeId?: string }) {
  const [typeId, setTypeId] = useState(defaultTypeId ?? types[0]?.value ?? "");
  const t = types.find((x) => x.value === typeId);
  return (
    <ActionForm action={uploadDocument} success="Uploaded">
      <input type="hidden" name="employeeId" value={employeeId} />
      <Select label="Document type" name="typeId" options={types} value={typeId} onChange={(e) => setTypeId(e.target.value)} required />
      <Input label="Name" name="name" placeholder={t?.label ?? "e.g. PAN Card"} hint="Optional — defaults to the document type" />
      {t?.hasExpiry && <Input label="Expiry date" name="expiryDate" type="date" required hint="We'll remind you 30, 15 and 7 days before it expires" />}
      {hr && <Select label="Who can see it" name="visibility" options={[{ value: "EMPLOYEE", label: "Employee and HR" }, { value: "MANAGER", label: "Employee, manager and HR" }, { value: "HR_ONLY", label: "HR only" }]} placeholder="Use the type's default" />}
      <FileUploader required />
      <FormActions><Submit>Upload</Submit></FormActions>
    </ActionForm>
  );
}

export function ReplaceForm({ documentId, hasExpiry }: { documentId: string; hasExpiry: boolean }) {
  return (
    <ActionForm action={replaceDocument} success="New version uploaded">
      <input type="hidden" name="documentId" value={documentId} />
      <p className="text-[13px] text-muted">The old file stays in version history.</p>
      {hasExpiry && <Input label="New expiry date" name="expiryDate" type="date" />}
      <FileUploader required />
      <FormActions><Submit>Upload new version</Submit></FormActions>
    </ActionForm>
  );
}

export function MetaForm({ d }: { d: { id: string; name: string; visibility: string; expiryDate: string | null } }) {
  return (
    <ActionForm action={updateDocumentMeta} success="Document updated" reset={false}>
      <input type="hidden" name="documentId" value={d.id} />
      <Input label="Name" name="name" defaultValue={d.name} required />
      <Select label="Who can see it" name="visibility" defaultValue={d.visibility} options={[{ value: "EMPLOYEE", label: "Employee and HR" }, { value: "MANAGER", label: "Employee, manager and HR" }, { value: "HR_ONLY", label: "HR only" }]} />
      <Input label="Expiry date" name="expiryDate" type="date" defaultValue={d.expiryDate ?? ""} />
      <FormActions><Submit>Save</Submit></FormActions>
    </ActionForm>
  );
}

const EXTRA_FIELDS: Record<string, [string, string, string][]> = {
  PROMOTION_LETTER: [["new_designation", "New designation", "text"], ["effective_date", "Effective date", "text"]],
  TRANSFER_LETTER: [["new_location", "New location", "text"], ["new_department", "New department", "text"], ["effective_date", "Effective date", "text"]],
  SALARY_REVISION_LETTER: [["effective_date", "Effective date", "text"]], INCREMENT_LETTER: [["effective_date", "Effective date", "text"]], APPRAISAL_LETTER: [["effective_date", "Effective date", "text"]],
  WARNING_LETTER: [["reason", "Reason", "textarea"]], EXPERIENCE_LETTER: [["exit_date", "Last working day", "text"]], RELIEVING_LETTER: [["exit_date", "Last working day", "text"]], INTERNSHIP_CERTIFICATE: [["exit_date", "Internship end date", "text"]],
};

/** Letter generation with a live, editable preview. */
export function GenerateLetterForm({ employeeId, templates }: { employeeId: string; templates: (Opt & { kind: string })[] }) {
  const [tpl, setTpl] = useState(templates[0]?.value ?? "");
  const [body, setBody] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const kind = templates.find((t) => t.value === tpl)?.kind ?? "";
  const loadPreview = (id: string) => start(async () => {
    const r = await previewLetter({ employeeId, templateId: id });
    if (r.ok) setBody((r.data as { body: string }).body); else toast("error", r.error);
  });
  return (
    <ActionForm action={generateLetter} success="Letter generated">
      <input type="hidden" name="employeeId" value={employeeId} />
      <Select label="Template" name="templateId" options={templates} value={tpl} onChange={(e) => { setTpl(e.target.value); setBody(null); }} />
      {(EXTRA_FIELDS[kind] ?? []).length > 0 && (
        <Grid>{(EXTRA_FIELDS[kind] ?? []).map(([n, l, t]) => t === "textarea" ? <Textarea key={n} label={l} name={n} wrapClass="sm:col-span-2" /> : <Input key={n} label={l} name={n} placeholder={n.includes("date") ? "e.g. 1 November 2026" : undefined} />)}</Grid>
      )}
      {body === null ? (
        <Button variant="secondary" onClick={() => loadPreview(tpl)} disabled={pending}>Preview and edit text</Button>
      ) : (
        <Textarea label="Letter text" name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={12} hint="Edit freely. Any {{variables}} left are filled from the fields above." />
      )}
      <Checkbox label="Notify the employee" name="notify" defaultChecked />
      <FormActions><Submit>Generate PDF</Submit></FormActions>
    </ActionForm>
  );
}
