import "server-only";
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getViewer, type Viewer } from "@/lib/auth/viewer";
import { rateLimit } from "@/lib/rate-limit";
import { tablePdf } from "@/lib/pdf";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** Route-handler guard: session + per-user rate limit. Authorization stays inside each handler. */
export async function apiViewer(limit = 120): Promise<Viewer | NextResponse> {
  const v = await getViewer();
  if (!v) return json({ error: "Unauthenticated" }, 401);
  const rl = rateLimit(`api:${v.userId}`, limit, 60_000);
  if (!rl.ok) return json({ error: "Too many requests" }, 429);
  return v;
}

const csvCell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // block CSV formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function tableFile(format: string, title: string, columns: string[], rows: (string | number)[][], company: { name: string; address: string; email: string }) {
  const safe = title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    const body = "﻿" + [columns, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${safe}-${stamp}.csv"`, "Cache-Control": "no-store" } });
  }
  if (format === "pdf") {
    const pdf = await tablePdf(title, columns, rows, company);
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${safe}-${stamp}.pdf"`, "Cache-Control": "no-store" } });
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rosier People";
  const ws = wb.addWorksheet(title.slice(0, 31));
  ws.addRow(columns);
  rows.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF784900" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.columns.forEach((c, i) => { c.width = Math.min(40, Math.max(10, ...[columns[i], ...rows.map((r) => r[i])].map((x) => String(x ?? "").length + 2))); });
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${safe}-${stamp}.xlsx"`, "Cache-Control": "no-store" } });
}
