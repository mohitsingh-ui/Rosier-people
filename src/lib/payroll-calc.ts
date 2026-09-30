// Pure payroll maths (India). Simplified but structurally correct; statutory
// rates live here so Settings → Payroll can override them later.

export type SalaryInput = { monthlyBasic: number; monthlyHra: number; monthlySpecial: number; monthlyOther: number; pfEnabled: boolean; esiEnabled: boolean; annualCtc: number; taxRegime: string };

export const PF_RATE = 0.12;
export const PF_WAGE_CEILING = 15000;
export const ESI_RATE = 0.0075;
export const ESI_GROSS_LIMIT = 21000;

/** Maharashtra-style slab used as the default; Uttar Pradesh has no PT. Config per state later. */
export function professionalTax(gross: number, state = "Uttar Pradesh") {
  if (state === "Uttar Pradesh" || state === "Delhi") return 0;
  if (gross <= 7500) return 0;
  if (gross <= 10000) return 175;
  return 200;
}

/** New-regime annual tax (FY 2025-26 slabs, 87A rebate to ₹12L, 75k std deduction), 4% cess. */
export function annualTaxNewRegime(annualTaxable: number) {
  const income = Math.max(0, annualTaxable - 75000);
  if (income <= 1200000) return 0;
  const slabs: [number, number][] = [[400000, 0], [800000, 0.05], [1200000, 0.1], [1600000, 0.15], [2000000, 0.2], [2400000, 0.25], [Infinity, 0.3]];
  let tax = 0, prev = 0;
  for (const [cap, rate] of slabs) {
    if (income > prev) tax += (Math.min(income, cap) - prev) * rate;
    prev = cap;
  }
  return Math.round(tax * 1.04);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computePayslip(s: SalaryInput, opts: { workingDays: number; lopDays: number; bonus?: number; reimbursements?: number; state?: string }) {
  const factor = opts.workingDays > 0 ? Math.max(0, (opts.workingDays - opts.lopDays) / opts.workingDays) : 1;
  const basic = r2(s.monthlyBasic * factor);
  const hra = r2(s.monthlyHra * factor);
  const special = r2(s.monthlySpecial * factor);
  const other = r2(s.monthlyOther * factor);
  const bonus = r2(opts.bonus ?? 0);
  const reimbursements = r2(opts.reimbursements ?? 0);
  const gross = r2(basic + hra + special + other + bonus);
  const pf = s.pfEnabled ? r2(Math.min(basic, PF_WAGE_CEILING) * PF_RATE) : 0;
  const esi = s.esiEnabled && gross <= ESI_GROSS_LIMIT ? r2(gross * ESI_RATE) : 0;
  const pt = professionalTax(gross, opts.state);
  const tds = r2(annualTaxNewRegime(s.annualCtc) / 12);
  const totalDeductions = r2(pf + esi + pt + tds);
  const net = r2(gross - totalDeductions + reimbursements);
  return { paidDays: opts.workingDays - opts.lopDays, lopDays: opts.lopDays, basic, hra, special, other, bonus, reimbursements, gross, pf, esi, professionalTax: pt, tds, otherDeductions: 0, totalDeductions, net };
}

/** Splits an annual CTC into a standard Indian structure. */
export function structureFromCtc(annualCtc: number) {
  const monthly = annualCtc / 12;
  const monthlyBasic = r2(monthly * 0.5);
  const monthlyHra = r2(monthlyBasic * 0.4);
  const employerPf = r2(Math.min(monthlyBasic, PF_WAGE_CEILING) * PF_RATE);
  const monthlySpecial = r2(Math.max(0, monthly - monthlyBasic - monthlyHra - employerPf));
  return { monthlyBasic, monthlyHra, monthlySpecial, monthlyOther: 0 };
}
