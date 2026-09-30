/* eslint-disable no-console */
// Seeds a realistic Rosier Foods workspace. All people, IDs, numbers and
// contact details are fictional.
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PERMISSIONS } from "../src/lib/permissions";
import { encrypt, last4 } from "../src/lib/crypto";
import { computePayslip, structureFromCtc } from "../src/lib/payroll-calc";
import { LETTER_TEMPLATES } from "./letter-templates";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const PASSWORD = "Rosier@2026";
const DOMAIN = "rosier.test";

// ── deterministic randomness so every seed looks the same
let s = 42;
const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const digits = (n: number) => Array.from({ length: n }, () => int(0, 9)).join("");
const letters = (n: number) => Array.from({ length: n }, () => "ABCDEFGHJKLMNPRSTUVWXYZ"[int(0, 22)]).join("");

const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TODAY_ISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const TODAY = D(TODAY_ISO);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** IST wall-clock time on a date → UTC instant */
const at = (d: Date, hh: number, mm: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh, mm) - 330 * 60000);
const YEAR = TODAY.getUTCFullYear();

async function samplePdf(title: string, subtitle: string) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const f = await doc.embedFont(StandardFonts.HelveticaBold);
  const r = await doc.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 0, y: 836, width: 595, height: 6, color: rgb(0.47, 0.29, 0) });
  page.drawText("SAMPLE DOCUMENT - FICTIONAL DATA", { x: 56, y: 780, size: 10, font: f, color: rgb(0.65, 0.39, 0.07) });
  page.drawText(title, { x: 56, y: 750, size: 20, font: f, color: rgb(0.14, 0.1, 0.07) });
  page.drawText(subtitle, { x: 56, y: 726, size: 11, font: r, color: rgb(0.45, 0.4, 0.35) });
  page.drawText("Seeded by Rosier People for development and demos.", { x: 56, y: 700, size: 10, font: r, color: rgb(0.45, 0.4, 0.35) });
  return Buffer.from(await doc.save());
}
async function storeSample(key: string, body: Buffer) {
  const p = path.resolve(process.cwd(), "storage", key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, body);
  return { storageKey: key, size: body.length, checksum: createHash("sha256").update(body).digest("hex") };
}

async function wipe() {
  // Order matters for FK constraints; TRUNCATE CASCADE keeps it simple.
  const tables = await db.$queryRawUnsafe<{ tablename: string }[]>(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`);
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

type Person = {
  code: string; first: string; last: string; gender: "MALE" | "FEMALE"; dept: string; desig: string; mgr?: string; loc: string;
  role: "SUPER_ADMIN" | "HR_ADMIN" | "MANAGER" | "EMPLOYEE"; joined: string; ctc: number; status?: "ACTIVE" | "PROBATION" | "PREBOARDING" | "NOTICE_PERIOD";
  type?: "FULL_TIME" | "INTERN" | "CONTRACT"; skills: string[]; dob: string; shift?: "GEN" | "WH";
};

const PEOPLE: Person[] = [
  { code: "ROS-001", first: "Aarav", last: "Mehra", gender: "MALE", dept: "Management", desig: "Founder & CEO", loc: "Ghaziabad HQ", role: "SUPER_ADMIN", joined: "2019-04-01", ctc: 4800000, skills: ["Strategy", "D2C", "Fundraising"], dob: "1986-02-14" },
  { code: "ROS-002", first: "Nandini", last: "Rao", gender: "FEMALE", dept: "HR", desig: "Head of People", mgr: "ROS-001", loc: "Ghaziabad HQ", role: "HR_ADMIN", joined: "2021-06-14", ctc: 2400000, skills: ["HR Operations", "Labour Law", "Culture"], dob: "1989-10-03" },
  { code: "ROS-003", first: "Kabir", last: "Sethi", gender: "MALE", dept: "Marketing", desig: "Head of Marketing", mgr: "ROS-001", loc: "Noida Studio", role: "MANAGER", joined: "2021-01-11", ctc: 3000000, skills: ["Brand", "Performance Marketing", "Meta Ads"], dob: "1988-07-22" },
  { code: "ROS-004", first: "Ishita", last: "Kapoor", gender: "FEMALE", dept: "Creative", desig: "Creative Director", mgr: "ROS-003", loc: "Noida Studio", role: "MANAGER", joined: "2022-03-07", ctc: 2200000, skills: ["Art Direction", "Brand Films", "Photography"], dob: "1991-10-09" },
  { code: "ROS-005", first: "Rohan", last: "Verma", gender: "MALE", dept: "Technology", desig: "Head of Technology", mgr: "ROS-001", loc: "Noida Studio", role: "MANAGER", joined: "2022-08-01", ctc: 3200000, skills: ["Shopify", "Node.js", "Data"], dob: "1990-05-30" },
  { code: "ROS-006", first: "Meera", last: "Iyer", gender: "FEMALE", dept: "Sales", desig: "Head of Sales", mgr: "ROS-001", loc: "Ghaziabad HQ", role: "MANAGER", joined: "2020-11-02", ctc: 2800000, skills: ["Quick Commerce", "Marketplaces", "Negotiation"], dob: "1987-12-19" },
  { code: "ROS-007", first: "Vikram", last: "Chauhan", gender: "MALE", dept: "Operations", desig: "Head of Operations", mgr: "ROS-001", loc: "Ghaziabad HQ", role: "MANAGER", joined: "2020-02-17", ctc: 2600000, skills: ["Supply Chain", "3PL", "Planning"], dob: "1985-10-01" },
  { code: "ROS-008", first: "Priya", last: "Malhotra", gender: "FEMALE", dept: "Finance", desig: "Finance Controller", mgr: "ROS-001", loc: "Ghaziabad HQ", role: "MANAGER", joined: "2021-09-20", ctc: 2300000, skills: ["GST", "P&L", "Audit"], dob: "1990-03-11" },
  { code: "ROS-009", first: "Arjun", last: "Bhatia", gender: "MALE", dept: "HR", desig: "HR Executive", mgr: "ROS-002", loc: "Ghaziabad HQ", role: "HR_ADMIN", joined: "2023-07-03", ctc: 720000, skills: ["Onboarding", "Payroll Inputs"], dob: "1996-10-05" },
  { code: "ROS-010", first: "Sneha", last: "Kulkarni", gender: "FEMALE", dept: "Marketing", desig: "Performance Marketing Manager", mgr: "ROS-003", loc: "Noida Studio", role: "MANAGER", joined: "2022-10-10", ctc: 1600000, skills: ["Meta Ads", "Google Ads", "Attribution"], dob: "1993-01-27" },
  { code: "ROS-011", first: "Dev", last: "Arora", gender: "MALE", dept: "Marketing", desig: "Performance Marketing Executive", mgr: "ROS-010", loc: "Noida Studio", role: "EMPLOYEE", joined: "2024-05-06", ctc: 650000, skills: ["Meta Ads", "Excel"], dob: "1999-08-14" },
  { code: "ROS-012", first: "Tanvi", last: "Joshi", gender: "FEMALE", dept: "Marketing", desig: "Content Strategist", mgr: "ROS-003", loc: "Noida Studio", role: "EMPLOYEE", joined: "2023-02-13", ctc: 900000, skills: ["Copywriting", "Hinglish Content", "Scripts"], dob: "1997-10-12" },
  { code: "ROS-013", first: "Yash", last: "Gupta", gender: "MALE", dept: "Creative", desig: "Graphic Designer", mgr: "ROS-004", loc: "Noida Studio", role: "EMPLOYEE", joined: "2023-12-21", ctc: 780000, skills: ["Figma", "Illustrator", "Packaging"], dob: "1998-04-02" },
  { code: "ROS-014", first: "Ananya", last: "Singh", gender: "FEMALE", dept: "Creative", desig: "Video Editor", mgr: "ROS-004", loc: "Noida Studio", role: "EMPLOYEE", joined: "2024-01-15", ctc: 840000, skills: ["Premiere Pro", "After Effects", "Reels"], dob: "1998-11-23" },
  { code: "ROS-015", first: "Karan", last: "Mathur", gender: "MALE", dept: "Technology", desig: "Full-Stack Developer", mgr: "ROS-005", loc: "Noida Studio", role: "EMPLOYEE", joined: "2023-04-17", ctc: 1400000, skills: ["TypeScript", "Next.js", "PostgreSQL"], dob: "1995-06-08" },
  { code: "ROS-016", first: "Riya", last: "Desai", gender: "FEMALE", dept: "Technology", desig: "Product Manager", mgr: "ROS-005", loc: "Noida Studio", role: "EMPLOYEE", joined: "2026-06-22", ctc: 1800000, status: "PROBATION", skills: ["Product", "Analytics", "UX"], dob: "1994-09-17" },
  { code: "ROS-017", first: "Aditya", last: "Nair", gender: "MALE", dept: "Sales", desig: "Key Account Manager - Quick Commerce", mgr: "ROS-006", loc: "Ghaziabad HQ", role: "MANAGER", joined: "2022-05-09", ctc: 1300000, skills: ["Blinkit", "Zepto", "Instamart"], dob: "1994-10-02" },
  { code: "ROS-018", first: "Pooja", last: "Saxena", gender: "FEMALE", dept: "Sales", desig: "Marketplace Executive", mgr: "ROS-006", loc: "Ghaziabad HQ", role: "EMPLOYEE", joined: "2024-08-19", ctc: 560000, skills: ["Amazon Seller Central", "Flipkart"], dob: "2000-02-29" },
  { code: "ROS-019", first: "Manish", last: "Yadav", gender: "MALE", dept: "Supply Chain", desig: "Warehouse Supervisor", mgr: "ROS-007", loc: "Gurugram Warehouse", role: "MANAGER", joined: "2021-03-22", ctc: 620000, skills: ["WMS", "Dispatch", "FEFO"], dob: "1990-12-12", shift: "WH" },
  { code: "ROS-020", first: "Sunil", last: "Pal", gender: "MALE", dept: "Supply Chain", desig: "Inventory Associate", mgr: "ROS-019", loc: "Gurugram Warehouse", role: "EMPLOYEE", joined: "2024-10-07", ctc: 320000, skills: ["Cycle Counts", "Picking"], dob: "2001-07-04", shift: "WH" },
  { code: "ROS-021", first: "Neha", last: "Agarwal", gender: "FEMALE", dept: "Operations", desig: "Operations Executive", mgr: "ROS-007", loc: "Ghaziabad HQ", role: "EMPLOYEE", joined: "2023-09-11", ctc: 600000, skills: ["PO Tracking", "Vendor Follow-ups"], dob: "1997-03-25" },
  { code: "ROS-022", first: "Rahul", last: "Tiwari", gender: "MALE", dept: "Finance", desig: "Accounts Executive", mgr: "ROS-008", loc: "Ghaziabad HQ", role: "EMPLOYEE", joined: "2022-12-05", ctc: 540000, status: "NOTICE_PERIOD", skills: ["Tally", "Reconciliation"], dob: "1996-06-30" },
  { code: "ROS-023", first: "Simran", last: "Kaur", gender: "FEMALE", dept: "Customer Support", desig: "Customer Support Lead", mgr: "ROS-007", loc: "Ghaziabad HQ", role: "MANAGER", joined: "2022-07-18", ctc: 700000, skills: ["Freshdesk", "Escalations", "CSAT"], dob: "1995-10-06" },
  { code: "ROS-024", first: "Aman", last: "Khanna", gender: "MALE", dept: "Customer Support", desig: "Customer Support Associate", mgr: "ROS-023", loc: "Ghaziabad HQ", role: "EMPLOYEE", joined: "2025-01-06", ctc: 380000, skills: ["Chat Support", "Returns"], dob: "2000-09-21" },
  { code: "ROS-025", first: "Zoya", last: "Qureshi", gender: "FEMALE", dept: "Creative", desig: "Brand Design Intern", mgr: "ROS-004", loc: "Noida Studio", role: "EMPLOYEE", joined: iso(addDays(TODAY, 13)), ctc: 240000, status: "PREBOARDING", type: "INTERN", skills: ["Illustration"], dob: "2003-05-19" },
  { code: "ROS-026", first: "Harsh", last: "Vardhan", gender: "MALE", dept: "Sales", desig: "Sales Executive - General Trade", mgr: "ROS-017", loc: "Ghaziabad HQ", role: "EMPLOYEE", joined: iso(addDays(TODAY, -14)), ctc: 480000, status: "PROBATION", skills: ["Distributor Management"], dob: "1999-01-08" },
];

async function main() {
  console.time("seed");
  await wipe();

  // ── RBAC
  const roles = Object.fromEntries(
    await Promise.all(
      (["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"] as const).map(async (key) => [
        key,
        await db.role.create({ data: { key, name: { SUPER_ADMIN: "Super Admin", HR_ADMIN: "HR Admin", MANAGER: "Manager", EMPLOYEE: "Employee" }[key], description: { SUPER_ADMIN: "Full control of Rosier People", HR_ADMIN: "Runs people operations; no security settings", MANAGER: "Leads a team; sees only their reporting line", EMPLOYEE: "Self-service" }[key] } }),
      ]),
    ),
  );
  for (const [key, p] of Object.entries(PERMISSIONS)) {
    const perm = await db.permission.create({ data: { key, module: p.module, description: p.description, sensitive: "sensitive" in p ? p.sensitive : false } });
    await db.rolePermission.createMany({ data: p.roles.map((r) => ({ roleId: roles[r].id, permissionId: perm.id })) });
  }

  // ── Settings
  await db.setting.createMany({
    data: [
      { key: "company", value: { name: "Rosier Foods Private Limited", shortName: "Rosier Foods", address: "Ghaziabad, Uttar Pradesh 201010", email: "people@rosier.test", phone: "+91 00000 00000", cin: "U15400UP2019PTC000000", website: "rosierfoods.com", financialYearStart: 4 } },
      { key: "selfEditableFields", value: ["personalEmail", "personalPhone", "addressLine1", "addressLine2", "city", "state", "pin", "bloodGroup", "maritalStatus", "bio", "skills", "emergencyContacts", "family"] },
      { key: "employmentTypes", value: ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "CONSULTANT"] },
      { key: "notifications", value: { emailOnLeave: true, emailOnPayroll: true, emailOnDocumentExpiry: true, digest: "DAILY" } },
      { key: "security", value: { sessionHours: 12, rememberDays: 30, lockoutAttempts: 5, lockoutMinutes: 15, require2faForAdmins: false } },
      { key: "integrations", value: { googleWorkspace: false, microsoft: false, biometric: false, slack: false } },
      { key: "workflow.disabledSteps", value: [] },
    ],
  });

  // ── Organisation
  const locs = Object.fromEntries(await Promise.all([
    { name: "Ghaziabad HQ", city: "Ghaziabad", state: "Uttar Pradesh", address: "Industrial Area, Ghaziabad" },
    { name: "Noida Studio", city: "Noida", state: "Uttar Pradesh", address: "Sector 63, Noida" },
    { name: "Gurugram Warehouse", city: "Gurugram", state: "Haryana", address: "Bilaspur Road, Gurugram" },
  ].map(async (l) => [l.name, await db.location.create({ data: l })])));

  const DEPTS: [string, string, string][] = [
    ["Management", "MGT", "Leadership and company direction"], ["HR", "HR", "People operations and culture"], ["Marketing", "MKT", "Brand, performance and content"],
    ["Creative", "CRE", "Design, photo and video"], ["Technology", "TEC", "Website, apps and data"], ["Sales", "SAL", "Quick commerce, marketplaces, B2B and GT"],
    ["Operations", "OPS", "Planning, POs and vendor operations"], ["Finance", "FIN", "Accounts, tax and reporting"], ["Supply Chain", "SCM", "Warehousing and fulfilment"], ["Customer Support", "CS", "Customer care and CRM"],
  ];
  const depts = Object.fromEntries(await Promise.all(DEPTS.map(async ([name, code, description]) => [name, await db.department.create({ data: { name, code, description } })])));

  const shifts = {
    GEN: await db.shift.create({ data: { name: "General (9:30–6:30)", startTime: "09:30", endTime: "18:30", graceMinutes: 15, weeklyOffs: [0], isDefault: true } }),
    WH: await db.shift.create({ data: { name: "Warehouse (8:00–5:00)", startTime: "08:00", endTime: "17:00", graceMinutes: 10, weeklyOffs: [0], breakMinutes: 45 } }),
  };

  const desigLevels: Record<string, number> = {};
  for (const p of PEOPLE) desigLevels[p.desig] = /Founder/.test(p.desig) ? 10 : /Head|Director|Controller/.test(p.desig) ? 8 : /Manager|Lead|Supervisor/.test(p.desig) ? 6 : /Intern/.test(p.desig) ? 1 : 3;
  const desigs: Record<string, { id: string }> = {};
  for (const p of PEOPLE) if (!desigs[p.desig]) desigs[p.desig] = await db.designation.create({ data: { name: p.desig, level: desigLevels[p.desig], departmentId: depts[p.dept].id } });
  for (const [name, dept, level] of [["Graphic Designer (Senior)", "Creative", 4], ["Senior Video Editor", "Creative", 5], ["Business Analyst", "Technology", 4], ["HR Business Partner", "HR", 6]] as const)
    if (!desigs[name]) desigs[name] = await db.designation.create({ data: { name, level, departmentId: depts[dept].id } });

  // ── Employees + users
  const pwHash = await bcrypt.hash(PASSWORD, 10);
  const emp: Record<string, { id: string; userId: string; p: Person }> = {};
  for (const p of PEOPLE) {
    const email = `${p.first}.${p.last}`.toLowerCase() + `@${DOMAIN}`;
    const e = await db.employee.create({
      data: {
        code: p.code, firstName: p.first, lastName: p.last, workEmail: email, workPhone: `+91 90000 ${p.code.slice(-3)}${digits(2)}`,
        gender: p.gender, dateOfBirth: D(p.dob), departmentId: depts[p.dept].id, designationId: desigs[p.desig].id, locationId: locs[p.loc].id,
        shiftId: shifts[p.shift ?? "GEN"].id, employmentType: p.type ?? "FULL_TIME", status: p.status ?? "ACTIVE", joiningDate: D(p.joined),
        confirmationDate: p.status === "PROBATION" || p.status === "PREBOARDING" ? null : addDays(D(p.joined), 180), skills: p.skills,
        bio: p.code === "ROS-013" ? "Designs packaging and social creatives for Rosier's ghee, honey and oats range." : null,
      },
    });
    const u = await db.user.create({ data: { email, passwordHash: pwHash, roleId: roles[p.role].id, employeeId: e.id, lastLoginAt: p.status === "PREBOARDING" ? null : addDays(new Date(), -int(0, 3)) } });
    emp[p.code] = { id: e.id, userId: u.id, p };
  }
  for (const p of PEOPLE) if (p.mgr) {
    await db.employee.update({ where: { id: emp[p.code].id }, data: { managerId: emp[p.mgr].id } });
    await db.reportingRelationship.create({ data: { employeeId: emp[p.code].id, managerId: emp[p.mgr].id, startDate: D(p.joined) } });
  }
  const heads: Record<string, string> = { Management: "ROS-001", HR: "ROS-002", Marketing: "ROS-003", Creative: "ROS-004", Technology: "ROS-005", Sales: "ROS-006", Operations: "ROS-007", Finance: "ROS-008", "Supply Chain": "ROS-019", "Customer Support": "ROS-023" };
  for (const [d, c] of Object.entries(heads)) await db.department.update({ where: { id: depts[d].id }, data: { headId: emp[c].id } });

  await db.jobOpening.createMany({ data: [
    { title: "Senior Video Editor", departmentId: depts.Creative.id, positions: 1 },
    { title: "Area Sales Manager - North", departmentId: depts.Sales.id, positions: 2 },
    { title: "Warehouse Associate", departmentId: depts["Supply Chain"].id, positions: 3 },
    { title: "CRM Executive", departmentId: depts.Marketing.id, positions: 1 },
  ] });

  // ── Personal, family, emergency, job history
  const cities: [string, string, string][] = [["Ghaziabad", "Uttar Pradesh", "2010"], ["Noida", "Uttar Pradesh", "2013"], ["New Delhi", "Delhi", "1100"], ["Gurugram", "Haryana", "1220"]];
  for (const p of PEOPLE) {
    const id = emp[p.code].id;
    const [city, state, pinPrefix] = pick(cities);
    const pan = `${letters(3)}P${p.last[0]}${digits(4)}${letters(1)}`;
    const aadhaar = `9${digits(11)}`;
    const passport = rnd() > 0.4 ? `Z${digits(7)}` : null;
    await db.employeePersonal.create({ data: {
      employeeId: id, personalEmail: `${p.first.toLowerCase()}.${p.last[0].toLowerCase()}${int(10, 99)}@example.com`, personalPhone: `+91 98000 ${digits(5)}`,
      addressLine1: `${int(1, 400)}, ${pick(["Shanti Nagar", "Raj Nagar Extension", "Indirapuram", "Vasundhara", "Sector 50", "Kavi Nagar"])}`, city, state, pin: pinPrefix + digits(2),
      maritalStatus: pick(["Single", "Married"]), bloodGroup: pick(["A+", "B+", "O+", "AB+", "B-", "O-"]),
      panEnc: encrypt(pan), panLast4: last4(pan), aadhaarEnc: encrypt(aadhaar), aadhaarLast4: last4(aadhaar),
      passportEnc: encrypt(passport), passportLast4: last4(passport), passportExpiry: passport ? addDays(TODAY, int(20, 1500)) : null,
    } });
    const surname = p.last;
    await db.familyMember.createMany({ data: [
      { employeeId: id, relation: "FATHER", name: `${pick(["Rajesh", "Suresh", "Anil", "Ramesh", "Vinod"])} ${surname}`, isDependent: false },
      { employeeId: id, relation: "MOTHER", name: `${pick(["Sunita", "Kavita", "Anita", "Rekha", "Seema"])} ${surname}`, isDependent: rnd() > 0.6 },
      ...(rnd() > 0.55 ? [{ employeeId: id, relation: "SPOUSE", name: `${p.gender === "MALE" ? pick(["Divya", "Shruti", "Aditi"]) : pick(["Rahul", "Nikhil", "Sameer"])} ${surname}`, isDependent: true }] : []),
      ...(rnd() > 0.75 ? [{ employeeId: id, relation: "CHILD", name: `${pick(["Aadya", "Vihaan", "Kiara", "Reyansh"])} ${surname}`, dateOfBirth: D(`${int(2016, 2023)}-0${int(1, 9)}-1${int(0, 9)}`), isDependent: true }] : []),
    ] });
    await db.emergencyContact.create({ data: { employeeId: id, name: `${pick(["Sunita", "Rajesh", "Divya", "Nikhil"])} ${surname}`, relation: pick(["Parent", "Spouse", "Sibling"]), phone: `+91 97000 ${digits(5)}`, isPrimary: true } });
    await db.jobHistory.create({ data: { employeeId: id, type: "JOINED", toValue: `${p.desig}, ${p.dept}`, effectiveDate: D(p.joined), note: "Joined Rosier Foods" } });
  }
  const promos: [string, string, string, string][] = [
    ["ROS-004", "Senior Graphic Designer", "Creative Director", "2024-04-01"], ["ROS-010", "Performance Marketing Executive", "Performance Marketing Manager", "2024-10-01"],
    ["ROS-017", "Sales Executive", "Key Account Manager - Quick Commerce", "2024-04-01"], ["ROS-023", "Customer Support Associate", "Customer Support Lead", "2025-04-01"],
    ["ROS-013", "Junior Graphic Designer", "Graphic Designer", "2025-04-01"],
  ];
  for (const [c, from, to, date] of promos) await db.jobHistory.create({ data: { employeeId: emp[c].id, type: "PROMOTION", fromValue: from, toValue: to, effectiveDate: D(date) } });
  await db.jobHistory.create({ data: { employeeId: emp["ROS-021"].id, type: "DEPARTMENT_CHANGE", fromValue: "Supply Chain", toValue: "Operations", effectiveDate: D("2025-07-01") } });
  await db.jobHistory.create({ data: { employeeId: emp["ROS-019"].id, type: "TRANSFER", fromValue: "Ghaziabad HQ", toValue: "Gurugram Warehouse", effectiveDate: D("2024-02-01") } });
  for (const c of ["ROS-013", "ROS-015", "ROS-012"]) await db.jobHistory.create({ data: { employeeId: emp[c].id, type: "SALARY_REVISION", fromValue: "Annual revision", toValue: "Revised CTC effective April", effectiveDate: D(`${YEAR}-04-01`) } });

  // ── Documents
  const CATS: [string, string][] = [["Identity", "identity"], ["Education", "education"], ["Employment", "employment"], ["Payroll", "payroll"], ["Compliance", "compliance"], ["Performance", "performance"], ["Company Letters", "company-letters"], ["Other", "other"]];
  const cats = Object.fromEntries(await Promise.all(CATS.map(async ([name, slug], i) => [name, await db.documentCategory.create({ data: { name, slug, order: i } })])));
  const TYPES: { name: string; cat: string; expiry?: boolean; mandatory?: boolean; sensitive?: boolean; vis?: "EMPLOYEE" | "MANAGER" | "HR_ONLY"; upload?: boolean }[] = [
    { name: "Aadhaar Card", cat: "Identity", mandatory: true, sensitive: true }, { name: "PAN Card", cat: "Identity", mandatory: true, sensitive: true },
    { name: "Passport", cat: "Identity", expiry: true, sensitive: true }, { name: "Driving Licence", cat: "Identity", expiry: true }, { name: "Address Proof", cat: "Identity", mandatory: true },
    { name: "Education Certificate", cat: "Education", mandatory: true, vis: "MANAGER" }, { name: "Previous Employment Documents", cat: "Employment" },
    { name: "Offer Letter", cat: "Employment", upload: false, vis: "EMPLOYEE" }, { name: "Appointment Letter", cat: "Employment", upload: false }, { name: "Employment Contract", cat: "Employment", expiry: true, upload: false },
    { name: "Experience Letter", cat: "Employment", upload: false }, { name: "Relieving Letter", cat: "Employment", upload: false },
    { name: "Salary Revision Letter", cat: "Payroll", upload: false }, { name: "Bank Proof / Cancelled Cheque", cat: "Payroll", mandatory: true, sensitive: true }, { name: "Form 16", cat: "Payroll", upload: false },
    { name: "Work Permit", cat: "Compliance", expiry: true }, { name: "Food Safety Training Certificate", cat: "Compliance", expiry: true, vis: "MANAGER" }, { name: "Non-Disclosure Agreement", cat: "Compliance", upload: false },
    { name: "Background Verification Report", cat: "Compliance", vis: "HR_ONLY", upload: false },
    { name: "Appraisal Letter", cat: "Performance", upload: false }, { name: "Promotion Letter", cat: "Performance", upload: false }, { name: "Warning Letter", cat: "Performance", vis: "HR_ONLY", upload: false },
    { name: "Transfer Letter", cat: "Company Letters", upload: false }, { name: "Increment Letter", cat: "Company Letters", upload: false }, { name: "Internship Certificate", cat: "Company Letters", upload: false }, { name: "Employment Verification Letter", cat: "Company Letters", upload: false },
    { name: "Other Document", cat: "Other" },
  ];
  const dtypes: Record<string, { id: string }> = {};
  for (const t of TYPES) dtypes[t.name] = await db.documentType.create({ data: { name: t.name, categoryId: cats[t.cat].id, hasExpiry: !!t.expiry, isMandatory: !!t.mandatory, isSensitive: !!t.sensitive, defaultVisibility: t.vis ?? "EMPLOYEE", employeeUpload: t.upload !== false } });

  const hrUser = emp["ROS-002"].userId;
  async function addDoc(code: string, type: string, name: string, o: { status?: "PENDING" | "VERIFIED" | "REJECTED"; expiry?: Date | null; vis?: "EMPLOYEE" | "MANAGER" | "HR_ONLY"; byHr?: boolean; generated?: boolean; created?: Date } = {}) {
    const e = emp[code];
    const file = await storeSample(`employees/${e.id}/seed-${type.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${int(1000, 9999)}.pdf`, await samplePdf(name, `${e.p.first} ${e.p.last} · ${e.p.code}`));
    await db.employeeDocument.create({ data: {
      employeeId: e.id, typeId: dtypes[type].id, name, status: o.status ?? "VERIFIED", visibility: o.vis ?? TYPES.find((t) => t.name === type)!.vis ?? "EMPLOYEE",
      expiryDate: o.expiry ?? null, uploadedById: o.byHr ? hrUser : e.userId, verifiedById: (o.status ?? "VERIFIED") === "VERIFIED" ? hrUser : null,
      verifiedAt: (o.status ?? "VERIFIED") === "VERIFIED" ? addDays(new Date(), -int(5, 200)) : null, isGenerated: !!o.generated, createdAt: o.created ?? addDays(new Date(), -int(10, 300)),
      rejectionNote: o.status === "REJECTED" ? "Image is blurred. Please upload a clear scan of both sides." : null,
      versions: { create: { version: 1, ...file, fileName: `${name}.pdf`, mimeType: "application/pdf", uploadedById: o.byHr ? hrUser : e.userId } },
    } });
  }
  for (const p of PEOPLE) {
    if (p.status === "PREBOARDING") { await addDoc(p.code, "Offer Letter", "Offer Letter", { byHr: true, generated: true }); continue; }
    await addDoc(p.code, "PAN Card", "PAN Card");
    if (p.code !== "ROS-026") await addDoc(p.code, "Aadhaar Card", "Aadhaar Card");
    await addDoc(p.code, "Offer Letter", "Offer Letter", { byHr: true, generated: true });
    await addDoc(p.code, "Appointment Letter", "Appointment Letter", { byHr: true, generated: true });
    if (rnd() > 0.4) await addDoc(p.code, "Education Certificate", pick(["B.Com Degree", "B.Tech Degree", "BBA Degree", "MBA Degree", "B.Des Degree"]));
    if (rnd() > 0.5) await addDoc(p.code, "Bank Proof / Cancelled Cheque", "Cancelled Cheque");
  }
  // Expiring / expired / pending / rejected — to populate "Documents requiring attention"
  await addDoc("ROS-019", "Driving Licence", "Driving Licence", { expiry: addDays(TODAY, 6) });
  await addDoc("ROS-017", "Passport", "Passport", { expiry: addDays(TODAY, 24) });
  await addDoc("ROS-020", "Food Safety Training Certificate", "FoSTaC Basic Certificate", { expiry: addDays(TODAY, 12) });
  await addDoc("ROS-019", "Food Safety Training Certificate", "FoSTaC Supervisor Certificate", { expiry: addDays(TODAY, -9) });
  await addDoc("ROS-005", "Employment Contract", "Consultant Agreement (pre-conversion)", { expiry: addDays(TODAY, 28), byHr: true });
  await addDoc("ROS-003", "Passport", "Passport", { expiry: addDays(TODAY, 410) });
  await addDoc("ROS-026", "Aadhaar Card", "Aadhaar Card", { status: "PENDING", created: addDays(new Date(), -2) });
  await addDoc("ROS-026", "Address Proof", "Electricity Bill", { status: "REJECTED", created: addDays(new Date(), -3) });
  await addDoc("ROS-016", "Previous Employment Documents", "Relieving Letter - Previous Employer", { status: "PENDING", created: addDays(new Date(), -1) });
  await addDoc("ROS-013", "Driving Licence", "Driving Licence", { status: "PENDING", expiry: addDays(TODAY, 2200), created: addDays(new Date(), -1) });
  await addDoc("ROS-022", "Background Verification Report", "Background Verification - Clear", { byHr: true });
  await addDoc("ROS-013", "Salary Revision Letter", `Salary Revision Letter ${YEAR}`, { byHr: true, generated: true, created: D(`${YEAR}-04-02`) });
  await addDoc("ROS-013", "Appraisal Letter", `Appraisal Letter FY${String(YEAR - 1).slice(2)}-${String(YEAR).slice(2)}`, { byHr: true, generated: true, created: D(`${YEAR}-04-02`) });

  for (const t of LETTER_TEMPLATES) await db.documentTemplate.create({ data: t });

  // ── Policies
  const policies = await Promise.all([
    { title: "Leave Policy", category: "Leave", body: "Casual leave: 12 days a year, credited on 1 January.\nSick leave: 12 days a year. A medical note is needed for more than 2 consecutive days.\nEarned leave: 18 days a year. Up to 30 days carry forward.\nApply in Rosier People. Your manager approves; HR is informed automatically." },
    { title: "Work From Home Policy", category: "Attendance", body: "WFH is available for roles that don't need to be at the farm, studio or warehouse.\nRequest at least one day in advance. Your manager approves.\nBe reachable on Slack and phone during core hours (10:30–5:30)." },
    { title: "Code of Conduct", category: "Conduct", body: "Treat colleagues, farmers, partners and customers with respect.\nNo harassment or discrimination of any kind.\nConflicts of interest must be declared to HR." },
    { title: "IT & Data Security Policy", category: "IT", body: "Company laptops must have disk encryption and a screen lock.\nNever share passwords. Report lost devices to IT within 2 hours.\nCustomer data stays inside approved tools." },
    { title: "Food Safety & Hygiene Policy", category: "Operations", body: "Everyone entering production or warehouse areas follows FSSAI hygiene rules.\nFoSTaC certification is mandatory for warehouse and QA roles and must be renewed before expiry." },
  ].map((p) => db.policy.create({ data: p })));
  for (const p of PEOPLE) if (p.status !== "PREBOARDING") for (const pol of policies.slice(0, rnd() > 0.2 ? 4 : 2))
    await db.documentAcknowledgement.create({ data: { employeeId: emp[p.code].id, policyId: pol.id, policyVersion: 1, acknowledgedAt: addDays(D(p.joined), 2) } });

  // ── Holidays
  const HOL: [string, string, "PUBLIC" | "OPTIONAL" | "COMPANY"][] = [
    ["New Year's Day", `${YEAR}-01-01`, "OPTIONAL"], ["Republic Day", `${YEAR}-01-26`, "PUBLIC"], ["Holi", `${YEAR}-03-04`, "PUBLIC"], ["Eid al-Fitr", `${YEAR}-03-21`, "OPTIONAL"],
    ["Good Friday", `${YEAR}-04-03`, "OPTIONAL"], ["Rosier Foundation Day", `${YEAR}-07-01`, "COMPANY"], ["Raksha Bandhan", `${YEAR}-08-28`, "OPTIONAL"], ["Independence Day", `${YEAR}-08-15`, "PUBLIC"],
    ["Janmashtami", `${YEAR}-09-04`, "OPTIONAL"], ["Gandhi Jayanti", `${YEAR}-10-02`, "PUBLIC"], ["Dussehra", `${YEAR}-10-20`, "PUBLIC"], ["Diwali", `${YEAR}-11-08`, "PUBLIC"],
    ["Govardhan Puja", `${YEAR}-11-09`, "COMPANY"], ["Bhai Dooj", `${YEAR}-11-11`, "OPTIONAL"], ["Guru Nanak Jayanti", `${YEAR}-11-24`, "OPTIONAL"], ["Christmas", `${YEAR}-12-25`, "PUBLIC"],
  ];
  await db.holiday.createMany({ data: HOL.map(([name, date, type]) => ({ name, date: D(date), type })) });
  const holidaySet = new Set(HOL.filter((h) => h[2] !== "OPTIONAL").map((h) => h[1]));

  // ── Leave
  const LT = [
    { name: "Casual Leave", code: "CL", annualQuota: 12, color: "#A56312" }, { name: "Sick Leave", code: "SL", annualQuota: 12, docRequiredAfterDays: 2, color: "#6F4A7E" },
    { name: "Earned Leave", code: "EL", annualQuota: 18, carryForward: true, maxCarryForward: 30, allowHalfDay: false, color: "#3D6A8C" },
    { name: "Optional Holiday", code: "OH", annualQuota: 2, allowHalfDay: false, color: "#784900" }, { name: "Compensatory Off", code: "CO", annualQuota: 0, color: "#3E7A52" },
    { name: "Unpaid Leave", code: "LOP", annualQuota: 0, isPaid: false, allowNegative: true, color: "#7A6E62" },
  ];
  const ltypes = Object.fromEntries(await Promise.all(LT.map(async (l) => [l.code, await db.leaveType.create({ data: l })])));

  const leaveDays = new Map<string, Map<string, string>>(); // empId → date → code
  const balances = new Map<string, Record<string, { used: number; pending: number }>>();
  const bal = (id: string, code: string) => ((balances.get(id) ?? balances.set(id, {}).get(id)!)[code] ??= { used: 0, pending: 0 });
  async function leave(code: string, lt: string, start: Date, days: number, status: "APPROVED" | "PENDING" | "REJECTED" | "CLARIFICATION", reason: string, halfDay: "NONE" | "FIRST_HALF" = "NONE") {
    const e = emp[code];
    let end = start, count = 0, cur = start;
    const dates: string[] = [];
    while (count < days) {
      if (cur.getUTCDay() !== 0 && !holidaySet.has(iso(cur))) { count++; dates.push(iso(cur)); end = cur; }
      cur = addDays(cur, 1);
    }
    const n = halfDay !== "NONE" ? 0.5 : days;
    await db.leaveRequest.create({ data: {
      employeeId: e.id, leaveTypeId: ltypes[lt].id, startDate: start, endDate: end, days: n, halfDay, reason, status,
      approverId: e.p.mgr ? emp[e.p.mgr].id : null, decidedAt: status === "PENDING" ? null : addDays(start, -2),
      decisionNote: status === "REJECTED" ? "Quarter-end close that week — can we move this by a few days?" : status === "CLARIFICATION" ? "Can you share who covers the Blinkit PO follow-ups while you're away?" : null,
      createdAt: addDays(start, -int(3, 10)),
    } });
    if (status === "APPROVED") { bal(e.id, lt).used += n; const m = leaveDays.get(e.id) ?? new Map(); dates.forEach((d) => m.set(d, halfDay !== "NONE" ? "HALF" : lt)); leaveDays.set(e.id, m); }
    if (status === "PENDING" || status === "CLARIFICATION") bal(e.id, lt).pending += n;
  }
  const past = (n: number) => { let d = addDays(TODAY, -n); while (d.getUTCDay() === 0) d = addDays(d, -1); return d; };
  const fut = (n: number) => { let d = addDays(TODAY, n); while (d.getUTCDay() === 0) d = addDays(d, 1); return d; };
  await leave("ROS-013", "CL", past(40), 2, "APPROVED", "Cousin's wedding in Jaipur");
  await leave("ROS-013", "SL", past(18), 1, "APPROVED", "Down with fever");
  await leave("ROS-013", "EL", fut(24), 3, "PENDING", "Diwali at home in Lucknow");
  await leave("ROS-014", "EL", past(0), 2, "APPROVED", "Family function");
  await leave("ROS-011", "CL", fut(3), 1, "PENDING", "Bank and passport appointment");
  await leave("ROS-012", "SL", past(0), 1, "APPROVED", "Migraine", "FIRST_HALF");
  await leave("ROS-015", "EL", past(55), 5, "APPROVED", "Trek in Himachal");
  await leave("ROS-015", "CL", fut(8), 1, "PENDING", "Moving house");
  await leave("ROS-018", "CL", past(1), 1, "APPROVED", "Personal work");
  await leave("ROS-020", "SL", past(0), 1, "APPROVED", "Unwell");
  await leave("ROS-021", "CL", fut(10), 2, "CLARIFICATION", "Navratri at home");
  await leave("ROS-024", "EL", fut(5), 2, "PENDING", "Sister's engagement");
  await leave("ROS-022", "CL", past(30), 1, "REJECTED", "Personal");
  await leave("ROS-010", "EL", past(70), 4, "APPROVED", "Vacation");
  await leave("ROS-003", "CL", past(12), 1, "APPROVED", "Personal work");
  await leave("ROS-006", "EL", fut(15), 4, "APPROVED", "Family trip to Kerala");
  await leave("ROS-009", "SL", past(25), 2, "APPROVED", "Viral fever");
  await leave("ROS-017", "OH", D(`${YEAR}-09-04`), 1, "APPROVED", "Janmashtami");

  for (const p of PEOPLE) {
    const id = emp[p.code].id;
    const joined = D(p.joined);
    const months = joined.getUTCFullYear() < YEAR ? 12 : 12 - joined.getUTCMonth();
    for (const l of LT) {
      const b = balances.get(id)?.[l.code] ?? { used: 0, pending: 0 };
      await db.leaveBalance.create({ data: {
        employeeId: id, leaveTypeId: ltypes[l.code].id, year: YEAR,
        allocated: l.code === "CO" ? (["ROS-019", "ROS-020", "ROS-014"].includes(p.code) ? 2 : 0) : Math.round((l.annualQuota * months) / 12 * 2) / 2,
        carriedForward: l.code === "EL" && joined.getUTCFullYear() < YEAR ? int(2, 12) : 0, used: b.used, pending: b.pending,
      } });
    }
  }

  // ── WFH
  const wfhDays = new Map<string, Set<string>>();
  async function wfh(code: string, start: Date, days: number, status: "APPROVED" | "PENDING" | "REJECTED", reason: string) {
    const e = emp[code];
    const end = addDays(start, days - 1);
    await db.wfhRequest.create({ data: { employeeId: e.id, startDate: start, endDate: end, days, reason, comment: status === "PENDING" ? "Will be online on Slack all day." : null, status, approverId: e.p.mgr ? emp[e.p.mgr].id : null, decidedAt: status === "PENDING" ? null : addDays(start, -1) } });
    if (status === "APPROVED") { const set = wfhDays.get(e.id) ?? new Set(); for (let i = 0; i < days; i++) set.add(iso(addDays(start, i))); wfhDays.set(e.id, set); }
  }
  await wfh("ROS-015", past(0), 1, "APPROVED", "Deploying the membership rebuild — need quiet focus time");
  await wfh("ROS-016", past(0), 1, "APPROVED", "Internet technician visit at home");
  await wfh("ROS-012", past(7), 2, "APPROVED", "Script writing sprint");
  await wfh("ROS-013", fut(2), 1, "PENDING", "Plumber visit at home");
  await wfh("ROS-011", fut(1), 1, "PENDING", "Car in service");
  await wfh("ROS-018", past(9), 1, "REJECTED", "Personal work");
  await wfh("ROS-010", past(4), 1, "APPROVED", "Campaign launch late night");

  // ── Attendance: last 75 days
  const attendanceRows: import("../src/generated/prisma/client").Prisma.AttendanceCreateManyInput[] = [];
  for (const p of PEOPLE) {
    if (p.status === "PREBOARDING") continue;
    const e = emp[p.code];
    const wh = p.shift === "WH";
    for (let i = 75; i >= 0; i--) {
      const d = addDays(TODAY, -i);
      if (d < D(p.joined)) continue;
      const dISO = iso(d);
      const dow = d.getUTCDay();
      const base = { employeeId: e.id, date: d };
      if (dow === 0) { attendanceRows.push({ ...base, status: "WEEKEND", source: "SYSTEM" }); continue; }
      if (holidaySet.has(dISO)) { attendanceRows.push({ ...base, status: "HOLIDAY", source: "SYSTEM" }); continue; }
      const lv = leaveDays.get(e.id)?.get(dISO);
      if (lv && lv !== "HALF") { attendanceRows.push({ ...base, status: "LEAVE", source: "SYSTEM", note: lv }); continue; }
      if (i === 0) {
        // Today: most people are in, a few haven't checked in yet
        if (["ROS-006", "ROS-024", "ROS-008"].includes(p.code)) continue;
        const isWfh = wfhDays.get(e.id)?.has(dISO);
        const late = ["ROS-011", "ROS-018"].includes(p.code);
        const inM = wh ? 7 * 60 + 55 : late ? 9 * 60 + 58 : 9 * 60 + int(10, 40);
        attendanceRows.push({ ...base, checkIn: at(d, Math.floor(inM / 60), inM % 60), status: isWfh ? "WFH" : late ? "LATE" : "PRESENT", isLate: late, source: isWfh ? "WEB" : pick(["WEB", "MOBILE", "BIOMETRIC"] as const) });
        continue;
      }
      if (rnd() < 0.004) { attendanceRows.push({ ...base, status: "ABSENT", source: "SYSTEM" }); continue; }
      const isWfh = wfhDays.get(e.id)?.has(dISO) || (dow === 6 && rnd() < 0.3 && !wh);
      const late = rnd() < 0.09;
      const half = lv === "HALF";
      const inM = (wh ? 7 * 60 + 50 : 9 * 60 + 5) + (late ? int(31, 55) : int(0, 30)) + (half ? 240 : 0);
      const outM = (wh ? 17 * 60 : 18 * 60 + 30) + int(-20, 75);
      const work = outM - inM - (wh ? 45 : 60);
      attendanceRows.push({
        ...base, checkIn: at(d, Math.floor(inM / 60), inM % 60), checkOut: at(d, Math.floor(outM / 60), outM % 60), breakMinutes: wh ? 45 : 60, workMinutes: work,
        overtimeMinutes: Math.max(0, work - 540), isLate: late && !half, isEarlyExit: outM < (wh ? 17 * 60 : 18 * 60 + 30) - 10,
        status: half ? "HALF_DAY" : isWfh ? "WFH" : late ? "LATE" : "PRESENT", source: isWfh ? "WEB" : wh ? "BIOMETRIC" : pick(["WEB", "MOBILE", "BIOMETRIC"] as const),
      });
    }
  }
  await db.attendance.createMany({ data: attendanceRows });
  const corrAtt = await db.attendance.findFirst({ where: { employeeId: emp["ROS-013"].id, date: past(3) } });
  await db.attendanceCorrection.create({ data: { employeeId: emp["ROS-013"].id, attendanceId: corrAtt?.id, date: past(3), requestedCheckIn: at(past(3), 9, 20), requestedCheckOut: at(past(3), 18, 45), reason: "Forgot to check out — was at the product shoot till 6:45.", approverId: emp["ROS-004"].id } });
  await db.attendanceCorrection.create({ data: { employeeId: emp["ROS-020"].id, date: past(2), requestedCheckIn: at(past(2), 7, 58), reason: "Biometric device was offline in the morning.", approverId: emp["ROS-019"].id } });
  await db.attendanceCorrection.create({ data: { employeeId: emp["ROS-015"].id, date: past(20), requestedCheckIn: at(past(20), 9, 30), requestedCheckOut: at(past(20), 19, 0), reason: "Mobile app didn't register check-in.", status: "APPROVED", approverId: emp["ROS-005"].id, decidedAt: past(19) } });

  // ── Payroll
  for (const p of PEOPLE) {
    const st = structureFromCtc(p.ctc);
    const acc = digits(12);
    await db.payrollProfile.create({ data: {
      employeeId: emp[p.code].id, bankName: pick(["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank", "Kotak Mahindra Bank"]),
      accountNumberEnc: encrypt(acc), accountLast4: last4(acc), ifsc: `${pick(["HDFC", "ICIC", "SBIN", "UTIB", "KKBK"])}0${digits(6)}`,
      uan: `10${digits(10)}`, esicNumber: p.ctc <= 300000 ? `31${digits(15)}` : null, esiEnabled: p.ctc <= 300000, pfEnabled: p.type !== "INTERN",
      annualCtc: p.ctc, ...st, effectiveFrom: D(`${YEAR}-04-01`) > D(p.joined) ? D(`${YEAR}-04-01`) : D(p.joined),
    } });
  }
  for (const [month, status] of [[`${YEAR}-06`, "PAID"], [`${YEAR}-07`, "PAID"], [`${YEAR}-08`, "PAID"]] as const) {
    const [y, m] = month.split("-").map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    let wd = 0; for (let d = 1; d <= days; d++) if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 0) wd++;
    const run = await db.payrollRun.create({ data: { month, status, workingDays: wd, processedAt: D(`${month}-28`), processedById: emp["ROS-001"].userId, paidAt: addDays(D(`${month}-28`), 3) } });
    for (const p of PEOPLE) {
      if (D(p.joined) > D(`${month}-01`) || p.status === "PREBOARDING") continue;
      const prof = await db.payrollProfile.findUniqueOrThrow({ where: { employeeId: emp[p.code].id } });
      const lop = p.code === "ROS-022" && month.endsWith("07") ? 1 : 0;
      const r = computePayslip({ monthlyBasic: Number(prof.monthlyBasic), monthlyHra: Number(prof.monthlyHra), monthlySpecial: Number(prof.monthlySpecial), monthlyOther: Number(prof.monthlyOther), pfEnabled: prof.pfEnabled, esiEnabled: prof.esiEnabled, annualCtc: Number(prof.annualCtc), taxRegime: prof.taxRegime }, { workingDays: wd, lopDays: lop, bonus: month.endsWith("08") && p.dept === "Sales" ? 5000 : 0, state: p.loc === "Gurugram Warehouse" ? "Haryana" : "Uttar Pradesh" });
      await db.payslip.create({ data: { runId: run.id, employeeId: emp[p.code].id, ...r } });
    }
  }
  await db.payrollRun.create({ data: { month: `${YEAR}-09`, status: "DRAFT", workingDays: 25 } });
  for (const c of ["ROS-013", "ROS-015", "ROS-012", "ROS-003"]) {
    await db.taxDocument.create({ data: { employeeId: emp[c].id, financialYear: `${YEAR}-${String(YEAR + 1).slice(2)}`, kind: "DECLARATION", section: "80C", title: "PPF and ELSS investments", amount: int(50, 150) * 1000, status: "SUBMITTED" } });
    await db.taxDocument.create({ data: { employeeId: emp[c].id, financialYear: `${YEAR - 1}-${String(YEAR).slice(2)}`, kind: "FORM_16", title: `Form 16 FY ${YEAR - 1}-${String(YEAR).slice(2)}`, status: "VERIFIED" } });
  }

  // ── Expenses
  const ECAT = ["Travel", "Food", "Transport", "Accommodation", "Office Purchase", "Other"];
  const ecats = Object.fromEntries(await Promise.all(ECAT.map(async (n) => [n, await db.expenseCategory.create({ data: { name: n, limit: n === "Food" ? 1500 : n === "Accommodation" ? 6000 : null } })])));
  let expN = 1041;
  async function expense(code: string, title: string, items: [string, number, string, number][], status: "PENDING" | "MANAGER_APPROVED" | "APPROVED" | "REJECTED" | "PAID") {
    const e = emp[code];
    const total = items.reduce((a, i) => a + i[3], 0);
    await db.expense.create({ data: {
      number: `EXP-${expN++}`, employeeId: e.id, title, total, status, managerId: e.p.mgr ? emp[e.p.mgr].id : null,
      managerDecidedAt: status !== "PENDING" ? past(3) : null, financeDecidedById: ["APPROVED", "PAID"].includes(status) ? emp["ROS-001"].userId : null,
      financeDecidedAt: ["APPROVED", "PAID"].includes(status) ? past(2) : null, paidAt: status === "PAID" ? past(1) : null,
      decisionNote: status === "REJECTED" ? "Please attach the original tax invoice." : null, createdAt: past(int(4, 20)),
      items: { create: items.map(([cat, ago, description, amount]) => ({ categoryId: ecats[cat].id, date: past(ago), description, amount })) },
    } });
  }
  await expense("ROS-017", "Blinkit category review — Gurugram", [["Travel", 6, "Cab to Blinkit office and back", 1240], ["Food", 6, "Lunch with category manager", 1180]], "PENDING");
  await expense("ROS-013", "Product shoot props", [["Office Purchase", 5, "Brass kalash, jute cloth and diyas for ghee shoot", 2860]], "PENDING");
  await expense("ROS-014", "Farm shoot travel", [["Transport", 15, "Tempo for camera gear to the farm", 2400], ["Food", 15, "Crew lunch", 1450]], "MANAGER_APPROVED");
  await expense("ROS-006", "Distributor meet — Lucknow", [["Travel", 22, "Train tickets", 3120], ["Accommodation", 21, "Hotel, 1 night", 4800], ["Food", 21, "Dinner", 950]], "PAID");
  await expense("ROS-019", "Warehouse supplies", [["Office Purchase", 9, "Label printer rolls", 1890]], "APPROVED");
  await expense("ROS-011", "Team lunch", [["Food", 12, "Lunch", 2100]], "REJECTED");
  await expense("ROS-026", "Market visit — Ghaziabad GT outlets", [["Transport", 2, "Auto and metro", 460]], "PENDING");

  // ── Assets
  const ACAT: [string, string][] = [["Laptop", "LAP"], ["Desktop", "DSK"], ["Monitor", "MON"], ["Keyboard", "KBD"], ["Mouse", "MSE"], ["Phone", "PHN"], ["SIM", "SIM"], ["Headphones", "HPH"], ["Camera", "CAM"], ["Tablet", "TAB"], ["Vehicle", "VEH"], ["Other", "OTH"]];
  const acats = Object.fromEntries(await Promise.all(ACAT.map(async ([name, prefix]) => [name, await db.assetCategory.create({ data: { name, prefix } })])));
  const counters: Record<string, number> = {};
  async function asset(cat: string, brand: string, model: string, price: number, holder?: string, o: { status?: "IN_STOCK" | "IN_REPAIR" | "DAMAGED" | "RETIRED"; condition?: "NEW" | "GOOD" | "FAIR" | "POOR" | "DAMAGED"; bought?: string } = {}) {
    const prefix = ACAT.find((a) => a[0] === cat)![1];
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    const bought = D(o.bought ?? `${pick([2023, 2024, 2025])}-0${int(1, 9)}-1${int(0, 9)}`);
    const a = await db.asset.create({ data: {
      tag: `RF-${prefix}-${String(counters[prefix]).padStart(4, "0")}`, categoryId: acats[cat].id, serialNumber: cat === "SIM" ? `8991${digits(15)}` : `${letters(2)}${digits(8)}`,
      brand, model, purchaseDate: bought, purchasePrice: price, warrantyUntil: ["Laptop", "Desktop", "Monitor", "Camera", "Phone", "Tablet"].includes(cat) ? addDays(bought, 365 * (cat === "Laptop" ? 3 : 1)) : null,
      condition: o.condition ?? "GOOD", status: holder ? "ASSIGNED" : o.status ?? "IN_STOCK", holderId: holder ? emp[holder].id : null,
    } });
    if (holder) await db.assetAssignment.create({ data: { assetId: a.id, employeeId: emp[holder].id, assignedAt: addDays(D(emp[holder].p.joined) > bought ? D(emp[holder].p.joined) : bought, 1), conditionOut: o.condition ?? "GOOD", assignedById: emp["ROS-009"].userId } });
    return a;
  }
  const laptops: [string, string, string, number][] = [["ROS-001", "Apple", "MacBook Pro 14 M3", 199000], ["ROS-002", "Apple", "MacBook Air 13 M2", 99000], ["ROS-003", "Apple", "MacBook Air 15 M3", 134000], ["ROS-004", "Apple", "MacBook Pro 16 M3 Pro", 249000], ["ROS-005", "Apple", "MacBook Pro 14 M3", 199000], ["ROS-006", "Lenovo", "ThinkPad E14 Gen 5", 72000], ["ROS-007", "Lenovo", "ThinkPad E14 Gen 5", 72000], ["ROS-008", "Dell", "Latitude 5440", 81000], ["ROS-009", "HP", "ProBook 440 G10", 64000], ["ROS-010", "Apple", "MacBook Air 13 M2", 99000], ["ROS-011", "HP", "Pavilion 15", 61000], ["ROS-012", "Apple", "MacBook Air 13 M1", 79000], ["ROS-013", "Apple", "MacBook Pro 14 M2 Pro", 189000], ["ROS-014", "Apple", "MacBook Pro 16 M3 Pro", 249000], ["ROS-015", "Apple", "MacBook Pro 14 M3", 199000], ["ROS-016", "Apple", "MacBook Air 13 M3", 114000], ["ROS-017", "Lenovo", "IdeaPad Slim 5", 64000], ["ROS-018", "HP", "Pavilion 15", 61000], ["ROS-021", "Dell", "Inspiron 15", 58000], ["ROS-022", "Dell", "Inspiron 15", 58000], ["ROS-023", "Lenovo", "IdeaPad Slim 5", 64000], ["ROS-024", "Lenovo", "IdeaPad 3", 45000], ["ROS-026", "Lenovo", "IdeaPad 3", 45000]];
  for (const [c, b, m, pr] of laptops) await asset("Laptop", b, m, pr, c);
  await asset("Laptop", "Apple", "MacBook Air 13 M3", 114000, undefined, { condition: "NEW", bought: iso(addDays(TODAY, -8)) });
  await asset("Laptop", "Lenovo", "ThinkPad E14 Gen 5", 72000, undefined, { status: "IN_REPAIR", condition: "POOR" });
  for (const c of ["ROS-004", "ROS-013", "ROS-014", "ROS-015"]) await asset("Monitor", "LG", "27UP850 27\" 4K", 38000, c);
  await asset("Monitor", "Dell", "P2422H 24\"", 17500);
  for (const c of ["ROS-006", "ROS-017", "ROS-019", "ROS-023"]) { await asset("Phone", "Samsung", "Galaxy A35", 30999, c); await asset("SIM", "Jio", "Postpaid corporate", 0, c); }
  await asset("Camera", "Sony", "FX30 Cinema Line", 179990, "ROS-014"); await asset("Camera", "Sony", "A7 IV", 214990, "ROS-004");
  await asset("Headphones", "Sony", "WH-1000XM5", 29990, "ROS-014"); await asset("Headphones", "Jabra", "Evolve2 40", 9500, "ROS-024");
  await asset("Tablet", "Apple", "iPad Air 11 M2", 59900, "ROS-013"); await asset("Tablet", "Samsung", "Galaxy Tab A9+", 19999, "ROS-019");
  await asset("Keyboard", "Logitech", "MX Keys S", 12995, "ROS-015"); await asset("Mouse", "Logitech", "MX Master 3S", 9995, "ROS-015");
  await asset("Desktop", "Lenovo", "ThinkCentre M70q", 52000, "ROS-020");
  await asset("Vehicle", "Mahindra", "Supro Mini Truck", 640000, "ROS-019", { bought: "2023-06-12" });
  await asset("Camera", "Canon", "EOS R50", 72000, undefined, { status: "DAMAGED", condition: "DAMAGED" });

  // ── Performance
  const cycle = await db.performanceCycle.create({ data: { name: `H1 FY${String(YEAR).slice(2)}-${String(YEAR + 1).slice(2)} (Apr–Sep)`, startDate: D(`${YEAR}-04-01`), endDate: D(`${YEAR}-09-30`), selfReviewDue: D(`${YEAR}-10-10`), managerReviewDue: D(`${YEAR}-10-20`), status: "REVIEW" } });
  await db.performanceCycle.create({ data: { name: `H2 FY${String(YEAR).slice(2)}-${String(YEAR + 1).slice(2)} (Oct–Mar)`, startDate: D(`${YEAR}-10-01`), endDate: D(`${YEAR + 1}-03-31`), status: "DRAFT" } });
  const prev = await db.performanceCycle.create({ data: { name: `H2 FY${String(YEAR - 1).slice(2)}-${String(YEAR).slice(2)} (Oct–Mar)`, startDate: D(`${YEAR - 1}-10-01`), endDate: D(`${YEAR}-03-31`), status: "CLOSED" } });
  for (const p of PEOPLE) {
    if (!p.mgr || p.status === "PREBOARDING" || D(p.joined) > D(`${YEAR}-06-01`)) continue;
    const st = pick(["PENDING_SELF", "PENDING_SELF", "PENDING_MANAGER", "COMPLETED"] as const);
    await db.performanceReview.create({ data: {
      cycleId: cycle.id, employeeId: emp[p.code].id, reviewerId: emp[p.mgr].id, status: p.code === "ROS-013" ? "PENDING_SELF" : p.code === "ROS-014" ? "PENDING_MANAGER" : st,
      ...(st !== "PENDING_SELF" || p.code === "ROS-014" ? { selfRating: int(3, 5), selfComments: "Delivered the planned work; took on extra festive-season projects.", achievements: "Shipped all planned campaigns on time.", submittedAt: past(5) } : {}),
      ...(st === "COMPLETED" && p.code !== "ROS-014" && p.code !== "ROS-013" ? { managerRating: int(3, 5), managerComments: "Strong half. Keep building ownership of cross-team work.", developmentAreas: "Planning ahead for peak season.", finalRating: int(3, 5), completedAt: past(2) } : {}),
    } });
    if (D(p.joined) < D(`${YEAR - 1}-10-01`)) await db.performanceReview.create({ data: { cycleId: prev.id, employeeId: emp[p.code].id, reviewerId: emp[p.mgr].id, status: "COMPLETED", selfRating: int(3, 5), managerRating: int(3, 5), finalRating: int(3, 5), selfComments: "Good half overall.", managerComments: "Reliable and improving.", achievements: "Owned key launches.", developmentAreas: "Stakeholder communication.", completedAt: D(`${YEAR}-04-20`) } });
  }
  const GOALS: [string, string, string, number, "NOT_STARTED" | "IN_PROGRESS" | "AT_RISK" | "COMPLETED", string, string][] = [
    ["ROS-013", "Redesign ghee and honey pack labels to FSSAI 2026 format", "Update all SKUs' artwork with the new nutrition panel and allergen line.", 70, "IN_PROGRESS", "HIGH", "QUARTERLY"],
    ["ROS-013", "Build a reusable Diwali creative kit", "Templates for statics, reels covers and hamper cards.", 40, "IN_PROGRESS", "MEDIUM", "QUARTERLY"],
    ["ROS-013", "Cut creative turnaround to 48 hours", "", 20, "AT_RISK", "MEDIUM", "ANNUAL"],
    ["ROS-014", "Deliver 40 performance-ad edits for festive season", "", 55, "IN_PROGRESS", "HIGH", "QUARTERLY"],
    ["ROS-004", "Launch the Parampara hamper brand film", "", 85, "IN_PROGRESS", "HIGH", "QUARTERLY"],
    ["ROS-010", "Bring blended Meta ROAS to 3.2x", "", 60, "IN_PROGRESS", "HIGH", "QUARTERLY"],
    ["ROS-011", "Launch 3 new Advantage+ campaign structures", "", 100, "COMPLETED", "MEDIUM", "QUARTERLY"],
    ["ROS-012", "Publish 12 episodes of the festive recipes series", "", 45, "IN_PROGRESS", "MEDIUM", "QUARTERLY"],
    ["ROS-015", "Ship Rosier Coins loyalty in the app", "", 65, "IN_PROGRESS", "HIGH", "QUARTERLY"],
    ["ROS-015", "Move Shopify theme deploys to CI", "", 100, "COMPLETED", "LOW", "QUARTERLY"],
    ["ROS-016", "Define app roadmap for H2", "", 30, "IN_PROGRESS", "HIGH", "QUARTERLY"],
    ["ROS-017", "Grow Blinkit + Zepto GMV 25% QoQ", "", 35, "AT_RISK", "HIGH", "QUARTERLY"],
    ["ROS-018", "Keep Amazon account health above 95%", "", 90, "IN_PROGRESS", "MEDIUM", "ANNUAL"],
    ["ROS-019", "Zero FEFO violations in dispatch", "", 100, "COMPLETED", "HIGH", "QUARTERLY"],
    ["ROS-021", "Automate PO status tracking for quick commerce", "", 80, "IN_PROGRESS", "MEDIUM", "QUARTERLY"],
    ["ROS-023", "Hold CSAT at 4.6+", "", 50, "IN_PROGRESS", "MEDIUM", "ANNUAL"],
    ["ROS-024", "First-response time under 2 hours", "", 0, "NOT_STARTED", "MEDIUM", "QUARTERLY"],
    ["ROS-003", "Festive season: ₹3 Cr D2C revenue", "", 40, "IN_PROGRESS", "HIGH", "QUARTERLY"],
    ["ROS-002", "Roll out Rosier People to the whole company", "", 75, "IN_PROGRESS", "HIGH", "QUARTERLY"],
  ];
  for (const [c, title, description, progress, status, priority, period] of GOALS) {
    const e = emp[c];
    const g = await db.goal.create({ data: {
      title, description: description || null, ownerId: e.id, managerId: e.p.mgr ? emp[e.p.mgr].id : null, departmentId: depts[e.p.dept].id, cycleId: cycle.id,
      startDate: D(`${YEAR}-07-01`), endDate: period === "ANNUAL" ? D(`${YEAR + 1}-03-31`) : c === "ROS-024" ? addDays(TODAY, -3) : D(`${YEAR}-09-30`), progress, status, priority, period,
      milestones: { create: [{ title: "Plan and brief agreed", done: progress > 10 }, { title: "First version shipped", done: progress > 50 }, { title: "Final review", done: progress === 100 }] },
    } });
    if (progress > 0) await db.goalUpdate.create({ data: { goalId: g.id, authorId: e.id, progress, status, comment: status === "AT_RISK" ? "Blocked on dependencies from another team — flagged to my manager." : "On track.", createdAt: past(int(1, 10)) } });
    if (e.p.mgr && rnd() > 0.5) await db.goalUpdate.create({ data: { goalId: g.id, authorId: emp[e.p.mgr].id, comment: "Nice progress. Let's review this in our next 1:1." } });
  }
  await db.feedback.createMany({ data: [
    { fromId: emp["ROS-004"].id, toId: emp["ROS-013"].id, kind: "PRAISE", body: "The new honey label system is clean and scales across every SKU. Great work." },
    { fromId: emp["ROS-012"].id, toId: emp["ROS-013"].id, kind: "PRAISE", body: "Thanks for turning around the Navratri statics in a day." },
    { fromId: emp["ROS-004"].id, toId: emp["ROS-014"].id, kind: "MANAGER", body: "Hooks in the first 2 seconds are much stronger this month. Keep testing captions.", isPrivate: true },
    { fromId: emp["ROS-005"].id, toId: emp["ROS-015"].id, kind: "PRAISE", body: "Membership rebuild shipped with zero downtime." },
    { fromId: emp["ROS-006"].id, toId: emp["ROS-017"].id, kind: "CONSTRUCTIVE", body: "Share weekly Zepto fill-rate numbers before the Monday call.", isPrivate: true },
  ] });

  // ── Tasks
  await db.task.createMany({ data: [
    { title: "Send final Diwali hamper box dieline to printer", assigneeId: emp["ROS-013"].id, createdById: emp["ROS-004"].id, dueDate: fut(2) },
    { title: "Cut 3 hook variants for ghee Meta ad", assigneeId: emp["ROS-014"].id, createdById: emp["ROS-004"].id, dueDate: fut(1), status: "IN_PROGRESS" },
    { title: "Update Zepto PO tracker", assigneeId: emp["ROS-021"].id, createdById: emp["ROS-007"].id, dueDate: past(1) },
    { title: "Share Q2 marketplace P&L", assigneeId: emp["ROS-018"].id, createdById: emp["ROS-006"].id, dueDate: fut(4) },
  ] });

  // ── Helpdesk
  let tn = 1001;
  async function ticket(code: string, subject: string, category: string, priority: string, status: "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "WAITING_FOR_EMPLOYEE" | "RESOLVED" | "CLOSED", description: string, comments: [string, string, boolean?][] = []) {
    const t = await db.helpdeskTicket.create({ data: { number: `HD-${tn++}`, subject, category, priority, description, status, createdById: emp[code].id, assigneeId: status === "OPEN" ? null : emp["ROS-009"].id, resolvedAt: ["RESOLVED", "CLOSED"].includes(status) ? past(1) : null, createdAt: past(int(1, 12)) } });
    for (const [a, body, internal] of comments) await db.ticketComment.create({ data: { ticketId: t.id, authorId: emp[a].id, body, isInternal: !!internal } });
  }
  await ticket("ROS-013", "HRA not reflecting in August payslip", "PAYROLL", "HIGH", "IN_PROGRESS", "My rent receipts were submitted in July but August TDS still looks high.", [["ROS-009", "Checking with payroll. Will update by tomorrow."], ["ROS-009", "Declaration was approved after the cutoff — will adjust in September run.", true]]);
  await ticket("ROS-024", "Laptop battery drains in 2 hours", "IT", "MEDIUM", "ASSIGNED", "IdeaPad battery health seems poor. Need a replacement or charger at desk.");
  await ticket("ROS-020", "Need warehouse safety shoes (size 9)", "WORKPLACE", "LOW", "OPEN", "Current pair is torn.");
  await ticket("ROS-016", "Earned leave balance for mid-year joiner", "LEAVE", "LOW", "WAITING_FOR_EMPLOYEE", "How is EL prorated for someone who joined in June?", [["ROS-009", "It's prorated monthly — you have 9 EL for this year. Does that answer it?"]]);
  await ticket("ROS-011", "Address change for records", "DOCUMENTS", "LOW", "RESOLVED", "Moved to Noida Sector 62. Uploaded new rent agreement.", [["ROS-009", "Updated. Thanks!"]]);
  await ticket("ROS-026", "Access to Zoho for distributor orders", "IT", "MEDIUM", "OPEN", "Joined last week, need Zoho Inventory access.");

  // ── Announcements
  await db.announcement.createMany({ data: [
    { title: "Rosier People is live 🎉", body: "Leave, attendance, documents, payslips and requests now live in one place. Check in from your phone, apply for leave in two taps, and find every letter HR has ever sent you under Documents.", category: "NEWS", pinned: true, authorId: emp["ROS-002"].id, publishAt: past(6) },
    { title: "Diwali gifting: Parampara hampers for every team member", body: "Every Rosierian gets a Parampara hamper this Diwali. Collect yours from the HQ front desk from 2 November. Warehouse team — Manish will distribute at Gurugram.", category: "EVENT", authorId: emp["ROS-002"].id, publishAt: past(2) },
    { title: "Updated WFH policy", body: "From 1 October, WFH requests need one day's notice and manager approval in Rosier People. Studio shoot days are always on-site.", category: "POLICY", authorId: emp["ROS-002"].id, publishAt: past(4) },
    { title: "Navratri dandiya night — 16 October", body: "Dress up and bring your best moves. Terrace at HQ, 6:30 pm onwards. Food by the Rosier kitchen.", category: "EVENT", authorId: emp["ROS-009"].id, publishAt: past(1) },
    { title: "Q2 wins: quick commerce up 38%", body: "Blinkit and Zepto together grew 38% over Q1. Huge thanks to the sales and ops teams for the PO turnaround.", category: "ACHIEVEMENT", authorId: emp["ROS-001"].id, publishAt: past(9) },
    { title: "Creative team: shoot calendar for October", body: "Farm shoot on 7 Oct, studio days 9–11 Oct. Block your calendars.", category: "NOTICE", audience: "DEPARTMENT", departmentId: depts.Creative.id, authorId: emp["ROS-004"].id, publishAt: past(3) },
    { title: "Welcome Harsh and Riya!", body: "Harsh joins Sales (General Trade) and Riya joins Technology as Product Manager. Say hello!", category: "CELEBRATION", authorId: emp["ROS-002"].id, publishAt: past(10) },
  ] });

  // ── Onboarding / offboarding
  const ONB: [string, string, number][] = [["Collect signed offer letter", "HR", -7], ["Document collection (ID, address, education)", "EMPLOYEE", -3], ["KYC verification", "HR", 0], ["Bank details for payroll", "EMPLOYEE", 0], ["Create email and Slack", "IT", -1], ["Laptop assignment", "IT", 0], ["ID card", "ADMIN", 2], ["Workspace setup", "ADMIN", 0], ["IT setup and security training", "IT", 1], ["HR orientation", "HR", 1], ["Policy acknowledgement", "EMPLOYEE", 2], ["Manager introduction and 30-day plan", "MANAGER", 1], ["Team introduction", "MANAGER", 2], ["Role training", "MANAGER", 14]];
  for (const [code, doneUpTo] of [["ROS-025", 3], ["ROS-026", 10]] as const) {
    const e = emp[code];
    const start = D(e.p.joined);
    await db.onboarding.create({ data: {
      employeeId: e.id, startDate: start, targetDate: addDays(start, 30), status: "IN_PROGRESS",
      tasks: { create: ONB.map(([title, category, offset], i) => ({
        title, category, order: i, dueDate: addDays(start, offset), status: i < doneUpTo ? "DONE" : i === doneUpTo ? "IN_PROGRESS" : "PENDING", completedAt: i < doneUpTo ? addDays(start, offset) : null,
        requiresValidation: ["KYC verification", "Bank details for payroll", "Document collection (ID, address, education)"].includes(title),
        assigneeId: category === "EMPLOYEE" ? e.id : category === "MANAGER" ? emp[e.p.mgr!].id : category === "IT" ? emp["ROS-015"].id : emp["ROS-009"].id,
      })) },
    } });
  }
  const rahul = emp["ROS-022"];
  await db.offboarding.create({ data: {
    employeeId: rahul.id, stage: "NOTICE_PERIOD", reason: "Moving to Pune for family reasons.", resignationDate: past(18), requestedLastDay: addDays(past(18), 30), lastWorkingDay: addDays(past(18), 30), noticeDays: 30,
    managerNote: "Accepted. Handover to Priya's team by the 20th.", hrNote: "Notice period as per policy.",
    tasks: { create: [
      { title: "Knowledge transfer: vendor reconciliations", category: "KNOWLEDGE", order: 0, assigneeId: rahul.id, status: "IN_PROGRESS", dueDate: addDays(TODAY, 5) },
      { title: "Return laptop and charger", category: "ASSETS", order: 1, assigneeId: rahul.id, dueDate: addDays(past(18), 30) },
      { title: "Revoke Tally, email and bank portal access", category: "CLEARANCE", order: 2, assigneeId: emp["ROS-015"].id, dueDate: addDays(past(18), 30) },
      { title: "Finance clearance (advances, reimbursements)", category: "FINANCE", order: 3, assigneeId: emp["ROS-008"].id },
      { title: "Exit interview", category: "INTERVIEW", order: 4, assigneeId: emp["ROS-002"].id },
      { title: "Full and final settlement", category: "FINANCE", order: 5, assigneeId: emp["ROS-008"].id },
      { title: "Issue experience and relieving letters", category: "DOCUMENTS", order: 6, assigneeId: emp["ROS-009"].id },
    ] },
  } });
  await db.jobHistory.create({ data: { employeeId: rahul.id, type: "STATUS_CHANGE", fromValue: "ACTIVE", toValue: "NOTICE_PERIOD", effectiveDate: past(18), note: "Resignation accepted" } });

  // ── Notifications & audit
  const n = (code: string, type: string, title: string, body: string, link: string, readAgo?: number) => ({ userId: emp[code].userId, type, title, body, link, readAt: readAgo != null ? past(readAgo) : null, createdAt: past(int(0, 4)) });
  await db.notification.createMany({ data: [
    n("ROS-013", "leave.approved", "Sick leave approved", "Ishita approved your leave.", "/leave", 10),
    n("ROS-013", "announcement.new", "Diwali gifting: Parampara hampers", "New announcement from HR", "/announcements"),
    n("ROS-013", "performance.review", "Self review is open", "H1 self review is due soon.", "/performance"),
    n("ROS-013", "task.assigned", "New task from Ishita", "Send final Diwali hamper box dieline to printer", "/my-team"),
    n("ROS-004", "leave.requested", "Yash applied for 3 days of earned leave", "Diwali at home in Lucknow", "/leave?tab=approvals"),
    n("ROS-004", "attendance.correction", "Attendance correction from Yash", "Forgot to check out", "/attendance?tab=approvals"),
    n("ROS-004", "expense.submitted", "Expense claim from Yash", "Product shoot props — ₹2,860", "/expenses?tab=approvals"),
    n("ROS-002", "document.expiry", "5 documents need attention", "Driving licence, passport and FoSTaC certificates are expiring.", "/documents?tab=attention"),
    n("ROS-002", "helpdesk.new", "New ticket HD-1006", "Access to Zoho for distributor orders", "/helpdesk"),
    n("ROS-001", "expense.submitted", "Claim EXP-1043 awaits finance approval", "Farm shoot travel — ₹3,850", "/expenses?tab=finance"),
  ] });
  await db.auditLog.createMany({ data: [
    { actorId: emp["ROS-002"].userId, action: "employee.update", entity: "Employee", entityId: emp["ROS-013"].id, summary: "Nandini Rao changed Yash Gupta's designation from Junior Graphic Designer to Graphic Designer.", before: { designation: "Junior Graphic Designer" }, after: { designation: "Graphic Designer" }, ip: "10.0.0.12", userAgent: "Mozilla/5.0 (Macintosh)", createdAt: D(`${YEAR}-04-01`) },
    { actorId: emp["ROS-009"].userId, action: "document.verify", entity: "EmployeeDocument", summary: "Arjun Bhatia verified Riya Desai's PAN Card.", ip: "10.0.0.18", userAgent: "Mozilla/5.0 (Windows)", createdAt: past(20) },
    { actorId: emp["ROS-002"].userId, action: "employee.create", entity: "Employee", entityId: emp["ROS-026"].id, summary: "Nandini Rao added Harsh Vardhan (ROS-026) to Sales.", ip: "10.0.0.12", userAgent: "Mozilla/5.0 (Macintosh)", createdAt: past(20) },
    { actorId: emp["ROS-001"].userId, action: "payroll.process", entity: "PayrollRun", summary: `Aarav Mehra processed payroll for ${YEAR}-08.`, ip: "10.0.0.2", userAgent: "Mozilla/5.0 (Macintosh)", createdAt: D(`${YEAR}-08-28`) },
    { actorId: emp["ROS-022"].userId, action: "offboarding.resign", entity: "Offboarding", summary: "Rahul Tiwari submitted resignation.", ip: "10.0.0.33", userAgent: "Mozilla/5.0 (Android)", createdAt: past(18) },
  ] });

  console.timeEnd("seed");
  console.log(`\nSeeded ${PEOPLE.length} employees. Password for every account: ${PASSWORD}`);
  console.log(`  Super Admin  aarav.mehra@${DOMAIN}\n  HR Admin     nandini.rao@${DOMAIN}\n  Manager      ishita.kapoor@${DOMAIN}\n  Employee     yash.gupta@${DOMAIN}  (or ROS-013)`);
}

main().then(() => db.$disconnect()).catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
