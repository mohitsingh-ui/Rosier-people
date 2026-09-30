"use client";
import { useRef, useState } from "react";
import { UploadCloud, FileText, X } from "lucide-react";
import { useFormState } from "./form";

/** FileUploader / DocumentUploader: drag-and-drop that feeds a normal <input type=file>. */
export function FileUploader({ name = "file", label = "File", required, accept = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv", hint = "PDF, image, Word or Excel · up to 10 MB" }: { name?: string; label?: string; required?: boolean; accept?: string; hint?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const { errors } = useFormState();
  const err = errors[name]?.[0];
  return (
    <div>
      <span className="label">{label}{required && <span className="text-bad"> *</span>}</span>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f && input.current) { const dt = new DataTransfer(); dt.items.add(f); input.current.files = dt.files; setFile(f); }
        }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        className={`rounded-ctl border border-dashed px-4 py-5 text-center cursor-pointer transition-colors ${over ? "border-brand-2 bg-brand-50" : err ? "border-bad" : "border-line-2 hover:bg-soft/60"}`}
      >
        {file ? (
          <div className="flex items-center justify-center gap-2 text-[13.5px]">
            <FileText className="size-4 text-brand" />
            <span className="font-medium truncate max-w-[16rem]">{file.name}</span>
            <span className="text-muted">{(file.size / 1024).toFixed(0)} KB</span>
            <button type="button" aria-label="Remove file" className="p-1 rounded hover:bg-soft" onClick={(e) => { e.stopPropagation(); setFile(null); if (input.current) input.current.value = ""; }}>
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <>
            <UploadCloud className="size-5 mx-auto text-brand-2" />
            <p className="text-[13.5px] mt-1.5"><span className="font-medium text-brand">Choose a file</span> or drag it here</p>
            <p className="text-[12px] text-muted mt-0.5">{hint}</p>
          </>
        )}
        <input ref={input} type="file" name={name} accept={accept} required={required} className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      {err && <p className="text-[12px] text-bad mt-1">{err}</p>}
    </div>
  );
}
