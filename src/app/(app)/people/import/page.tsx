import { Download } from "lucide-react";
import { requirePermission } from "@/lib/auth/viewer";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/dates";
import { PageHeader, Section } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { ImportWizard } from "./wizard";

export const metadata = { title: "Import employees" };

export default async function ImportPage() {
  await requirePermission("people.import");
  const jobs = await db.importJob.findMany({ orderBy: { createdAt: "desc" }, take: 5 });
  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow="People" title="Bulk import employees" description="Upload a CSV or Excel file. We check every row before anything is created."
        actions={<><ButtonLink variant="secondary" href="/api/import/template?format=xlsx" prefetch={false}><Download className="size-4" />Excel template</ButtonLink><ButtonLink variant="secondary" href="/api/import/template?format=csv" prefetch={false}><Download className="size-4" />CSV template</ButtonLink></>} />
      <ImportWizard />
      {jobs.length > 0 && (
        <div className="mt-6"><Section title="Recent imports">
          <ul className="divide-y divide-line -my-2 text-[13.5px]">{jobs.map((j) => <li key={j.id} className="py-2.5 flex justify-between gap-3"><span>{j.fileName}</span><span className="text-muted">{j.createdRows} of {j.totalRows} created · {fmtDateTime(j.createdAt)}</span></li>)}</ul>
        </Section></div>
      )}
    </div>
  );
}
