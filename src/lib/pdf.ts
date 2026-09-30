import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const BROWN = rgb(0x78 / 255, 0x49 / 255, 0);
const INK = rgb(0x24 / 255, 0x1a / 255, 0x12 / 255);
const MUTED = rgb(0.45, 0.4, 0.35);
const LINE = rgb(0.9, 0.87, 0.8);
const CREAM = rgb(0xf7 / 255, 0xf4 / 255, 0xed / 255);

// Standard PDF fonts use WinAnsi; replace anything they can't encode.
const WINANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
export const pdfSafe = (s: string) =>
  s.replace(/₹/g, "Rs. ").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, (c) => (WINANSI_EXTRA.includes(c) ? c : "-"));

export const money = (v: number) => `Rs. ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const para of pdfSafe(text).split("\n")) {
    if (!para.trim()) { lines.push(""); continue; }
    let line = "";
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > width && line) { lines.push(line); line = word; }
      else line = test;
    }
    lines.push(line);
  }
  return lines;
}

type Company = { name: string; address: string; email: string; cin?: string };

function letterhead(page: PDFPage, bold: PDFFont, reg: PDFFont, company: Company) {
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: height - 6, width, height: 6, color: BROWN });
  page.drawText(pdfSafe(company.name), { x: 56, y: height - 58, size: 18, font: bold, color: BROWN });
  page.drawText("People. Culture. Growth.", { x: 56, y: height - 74, size: 8.5, font: reg, color: MUTED });
  const addr = pdfSafe(company.address);
  page.drawText(addr, { x: width - 56 - reg.widthOfTextAtSize(addr, 8.5), y: height - 58, size: 8.5, font: reg, color: MUTED });
  const em = pdfSafe(company.email);
  page.drawText(em, { x: width - 56 - reg.widthOfTextAtSize(em, 8.5), y: height - 71, size: 8.5, font: reg, color: MUTED });
  page.drawLine({ start: { x: 56, y: height - 90 }, end: { x: width - 56, y: height - 90 }, thickness: 0.8, color: LINE });
  const foot = pdfSafe(`${company.name}${company.cin ? " · CIN " + company.cin : ""} · This is a system-generated document from Rosier People.`);
  page.drawText(foot, { x: 56, y: 32, size: 7.5, font: reg, color: MUTED });
}

export async function letterPdf(opts: { title: string; body: string; date: string; reference: string; company: Company; signatory: { name: string; title: string } }) {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(opts.title));
  doc.setProducer("Rosier People");
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595.28, 841.89]);
  letterhead(page, bold, reg, opts.company);
  const { width, height } = page.getSize();
  let y = height - 124;
  page.drawText(pdfSafe(`Ref: ${opts.reference}`), { x: 56, y, size: 9.5, font: reg, color: MUTED });
  const d = pdfSafe(opts.date);
  page.drawText(d, { x: width - 56 - reg.widthOfTextAtSize(d, 9.5), y, size: 9.5, font: reg, color: MUTED });
  y -= 36;
  page.drawText(pdfSafe(opts.title), { x: 56, y, size: 14, font: bold, color: INK });
  y -= 28;
  for (const line of wrap(opts.body, reg, 10.5, width - 112)) {
    if (y < 110) { page = doc.addPage([595.28, 841.89]); letterhead(page, bold, reg, opts.company); y = height - 124; }
    if (line) page.drawText(line, { x: 56, y, size: 10.5, font: reg, color: INK });
    y -= line ? 16 : 10;
  }
  y = Math.max(y - 40, 90);
  page.drawText("For " + pdfSafe(opts.company.name), { x: 56, y, size: 10.5, font: reg, color: INK });
  page.drawText(pdfSafe(opts.signatory.name), { x: 56, y: y - 42, size: 10.5, font: bold, color: INK });
  page.drawText(pdfSafe(opts.signatory.title), { x: 56, y: y - 56, size: 9.5, font: reg, color: MUTED });
  return Buffer.from(await doc.save());
}

export type PayslipData = {
  company: Company;
  month: string;
  employee: { name: string; code: string; designation: string; department: string; location: string; joiningDate: string; pan: string; uan: string; bank: string; account: string };
  paidDays: number; lopDays: number; workingDays: number;
  earnings: [string, number][];
  deductions: [string, number][];
  gross: number; totalDeductions: number; net: number;
};

export async function payslipPdf(p: PayslipData) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Payslip ${p.month} ${p.employee.code}`);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  letterhead(page, bold, reg, p.company);
  const { width, height } = page.getSize();
  let y = height - 126;
  page.drawText(pdfSafe(`Payslip for ${p.month}`), { x: 56, y, size: 14, font: bold, color: INK });
  y -= 26;
  const info: [string, string][] = [
    ["Employee", p.employee.name], ["Employee ID", p.employee.code],
    ["Designation", p.employee.designation], ["Department", p.employee.department],
    ["Location", p.employee.location], ["Date of joining", p.employee.joiningDate],
    ["PAN", p.employee.pan], ["UAN", p.employee.uan],
    ["Bank", p.employee.bank], ["Account", p.employee.account],
    ["Working days", String(p.workingDays)], ["Paid days", `${p.paidDays}${p.lopDays ? `  (LOP ${p.lopDays})` : ""}`],
  ];
  page.drawRectangle({ x: 56, y: y - 6 * 18 - 8, width: width - 112, height: 6 * 18 + 18, color: CREAM });
  info.forEach(([k, v], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 68 + col * ((width - 112) / 2);
    const yy = y - row * 18;
    page.drawText(pdfSafe(k), { x, y: yy, size: 8.5, font: reg, color: MUTED });
    page.drawText(pdfSafe(v), { x: x + 88, y: yy, size: 9, font: bold, color: INK });
  });
  y -= 6 * 18 + 36;
  const colW = (width - 112 - 16) / 2;
  const table = (x: number, title: string, rows: [string, number][], total: [string, number]) => {
    let yy = y;
    page.drawText(title, { x, y: yy, size: 10, font: bold, color: BROWN });
    yy -= 8;
    page.drawLine({ start: { x, y: yy }, end: { x: x + colW, y: yy }, thickness: 0.8, color: LINE });
    yy -= 16;
    for (const [k, v] of rows) {
      page.drawText(pdfSafe(k), { x, y: yy, size: 9.5, font: reg, color: INK });
      const m = money(v);
      page.drawText(m, { x: x + colW - reg.widthOfTextAtSize(m, 9.5), y: yy, size: 9.5, font: reg, color: INK });
      yy -= 17;
    }
    page.drawLine({ start: { x, y: yy + 8 }, end: { x: x + colW, y: yy + 8 }, thickness: 0.8, color: LINE });
    yy -= 8;
    page.drawText(total[0], { x, y: yy, size: 10, font: bold, color: INK });
    const m = money(total[1]);
    page.drawText(m, { x: x + colW - bold.widthOfTextAtSize(m, 10), y: yy, size: 10, font: bold, color: INK });
    return yy;
  };
  const a = table(56, "Earnings", p.earnings, ["Gross earnings", p.gross]);
  const b = table(56 + colW + 16, "Deductions", p.deductions, ["Total deductions", p.totalDeductions]);
  y = Math.min(a, b) - 40;
  page.drawRectangle({ x: 56, y: y - 14, width: width - 112, height: 40, color: BROWN });
  page.drawText("Net pay", { x: 72, y: y, size: 12, font: bold, color: rgb(1, 1, 1) });
  const net = money(p.net);
  page.drawText(net, { x: width - 72 - bold.widthOfTextAtSize(net, 14), y: y - 1, size: 14, font: bold, color: rgb(1, 1, 1) });
  return Buffer.from(await doc.save());
}

/** Landscape table export for reports. */
export async function tablePdf(title: string, columns: string[], rows: (string | number)[][], company: Company) {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(title));
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 841.89, H = 595.28, M = 40;
  const colW = (W - 2 * M) / columns.length;
  const fit = (s: string, f: PDFFont, size: number) => {
    let t = pdfSafe(s);
    while (t.length > 1 && f.widthOfTextAtSize(t, size) > colW - 8) t = t.slice(0, -2) + "…".replace("…", ".");
    return t;
  };
  let page = doc.addPage([W, H]);
  let y = H - M;
  const header = () => {
    page.drawText(pdfSafe(company.name), { x: M, y, size: 9, font: bold, color: BROWN });
    y -= 20;
    page.drawText(pdfSafe(title), { x: M, y, size: 14, font: bold, color: INK });
    y -= 24;
    page.drawRectangle({ x: M, y: y - 5, width: W - 2 * M, height: 18, color: CREAM });
    columns.forEach((c, i) => page.drawText(fit(c, bold, 8.5), { x: M + 4 + i * colW, y, size: 8.5, font: bold, color: INK }));
    y -= 20;
  };
  header();
  for (const r of rows) {
    if (y < M + 20) { page = doc.addPage([W, H]); y = H - M; header(); }
    r.forEach((c, i) => page.drawText(fit(String(c ?? ""), reg, 8.5), { x: M + 4 + i * colW, y, size: 8.5, font: reg, color: INK }));
    page.drawLine({ start: { x: M, y: y - 5 }, end: { x: W - M, y: y - 5 }, thickness: 0.4, color: LINE });
    y -= 16;
  }
  doc.getPages().forEach((p, i, all) => p.drawText(`Page ${i + 1} of ${all.length}`, { x: W - M - 60, y: 20, size: 8, font: reg, color: MUTED }));
  return Buffer.from(await doc.save());
}
