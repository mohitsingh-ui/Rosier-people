"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertCircle, UploadCloud } from "lucide-react";
import { previewImport, confirmImport, type ImportRow } from "@/server/import";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function ImportWizard() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [invites, setInvites] = useState(true);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const bad = rows?.filter((r) => r.errors.length) ?? [];

  const check = (f: File) => {
    setFile(f);
    start(async () => {
      const fd = new FormData(); fd.set("file", f);
      const r = await previewImport(fd);
      if (r.ok) setRows((r.data as { rows: ImportRow[] }).rows); else { setRows(null); toast("error", r.error); }
    });
  };
  const confirm = () => start(async () => {
    if (!file) return;
    const fd = new FormData(); fd.set("file", file); if (invites) fd.set("sendInvites", "on");
    const r = await confirmImport(fd);
    if (r.ok) { toast("success", r.message ?? "Imported"); router.push("/people"); } else toast("error", r.error);
  });

  return (
    <div className="space-y-5">
      <ol className="flex gap-2 text-[12.5px]">
        {["Upload", "Check", "Import"].map((s, i) => {
          const step = !rows ? 0 : bad.length ? 1 : 2;
          return <li key={s} className={cn("flex items-center gap-2 rounded-full px-3 py-1", i <= step ? "bg-brand text-white" : "bg-soft text-muted")}><span className="font-semibold">{i + 1}</span>{s}</li>;
        })}
      </ol>
      <label className="card flex flex-col items-center justify-center text-center p-8 border-dashed cursor-pointer hover:bg-brand-50/40">
        <UploadCloud className="size-6 text-brand-2" />
        <span className="mt-2 font-medium">{file ? file.name : "Choose a CSV or Excel file"}</span>
        <span className="text-[12.5px] text-muted mt-1">Columns: Employee ID, First Name, Last Name, Email, Phone, Department, Designation, Manager, Location, Joining Date, Employment Type, Status</span>
        <input type="file" accept=".csv,.xlsx" className="sr-only" onChange={(e) => e.target.files?.[0] && check(e.target.files[0])} />
        {pending && <span className="mt-3 size-4 rounded-full border-2 border-brand border-r-transparent animate-spin" />}
      </label>
      {rows && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-line">
            <div className="flex items-center gap-2 text-[14px]">
              {bad.length ? <><AlertCircle className="size-4 text-bad" /><span><strong>{bad.length}</strong> of {rows.length} rows need fixing</span></> : <><CheckCircle2 className="size-4 text-ok" /><span>All {rows.length} rows look good</span></>}
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={invites} onChange={(e) => setInvites(e.target.checked)} className="accent-[#784900]" />Email invites</label>
              <Button onClick={confirm} disabled={pending || bad.length > 0}>Import {rows.length} employees</Button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="tbl"><thead><tr><th>Row</th><th>Name</th><th>Email</th><th>Department</th><th>Designation</th><th>Manager</th><th>Joining</th><th>Issues</th></tr></thead><tbody>
              {rows.map((r) => (
                <tr key={r.row} className={r.errors.length ? "bg-bad-bg/40" : ""}>
                  <td className="text-muted">{r.row}</td><td className="whitespace-nowrap">{r.firstName} {r.lastName}<div className="text-[11.5px] text-muted">{r.code || "auto ID"}</div></td><td>{r.email}</td><td>{r.department}</td><td>{r.designation}</td><td>{r.manager || "—"}</td><td className="whitespace-nowrap">{r.joiningDate}</td>
                  <td className="text-[12.5px]">{r.errors.length ? <ul className="text-bad space-y-0.5">{r.errors.map((e) => <li key={e}>• {e}</li>)}</ul> : <span className="text-ok">Ready</span>}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </div>
      )}
    </div>
  );
}
