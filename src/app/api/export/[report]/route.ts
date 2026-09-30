import { apiViewer, json, tableFile } from "@/lib/api";
import { runReport } from "@/server/reports";
import { companySettings } from "@/server/queries";
import { audit } from "@/lib/audit";

export async function GET(req: Request, { params }: { params: Promise<{ report: string }> }) {
  const v = await apiViewer(30);
  if (v instanceof Response) return v;
  const { report } = await params;
  const u = new URL(req.url);
  const format = ["csv", "xlsx", "pdf"].includes(u.searchParams.get("format") ?? "") ? u.searchParams.get("format")! : "xlsx";
  const r = await runReport(v, report, { from: u.searchParams.get("from") ?? undefined, to: u.searchParams.get("to") ?? undefined, department: u.searchParams.get("department") ?? undefined });
  if (!r) return json({ error: "Not allowed" }, 403);
  await audit(v, { action: "report.export", entity: "Report", entityId: report, summary: `${v.employee?.firstName ?? v.email} exported "${r.title}" as ${format.toUpperCase()} (${r.rows.length} rows).` });
  return tableFile(format, r.title, r.columns, r.rows, await companySettings());
}
