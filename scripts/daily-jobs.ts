/* eslint-disable no-console */
// Run once a day (cron / Vercel Cron / systemd timer):  npm run jobs:daily
// 1. Document expiry reminders at 30, 15, 7 and 0 days
// 2. Birthday and work-anniversary wishes
// 3. Marks yesterday's no-shows as ABSENT (not on leave, holiday or weekly off)
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const TODAY = D(todayISO);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

async function notifyEmployees(ids: string[], type: string, title: string, body: string | null, link: string) {
  const users = await db.user.findMany({ where: { employeeId: { in: ids }, isActive: true }, select: { id: true } });
  if (users.length) await db.notification.createMany({ data: users.map((u) => ({ userId: u.id, type, title, body, link })) });
}

async function expiryReminders() {
  let n = 0;
  for (const days of [30, 15, 7, 0]) {
    const docs = await db.employeeDocument.findMany({ where: { archivedAt: null, expiryDate: addDays(TODAY, days) }, include: { employee: true } });
    for (const d of docs) {
      const title = days ? `${d.name} expires in ${days} days` : `${d.name} expires today`;
      await notifyEmployees([d.employeeId], "document.expiry", title, "Upload the renewed document in Rosier People.", "/documents");
      const hr = await db.user.findMany({ where: { isActive: true, role: { permissions: { some: { permission: { key: "documents.manage" } } } } }, select: { id: true } });
      await db.notification.createMany({ data: hr.map((u) => ({ userId: u.id, type: "document.expiry", title: `${d.employee.firstName} ${d.employee.lastName}: ${title}`, link: "/documents?tab=attention" })) });
      n++;
    }
  }
  return n;
}

async function celebrations() {
  const people = await db.employee.findMany({ where: { status: { in: ["ACTIVE", "PROBATION", "NOTICE_PERIOD"] } } });
  const md = (d: Date) => `${d.getUTCMonth()}-${d.getUTCDate()}`;
  let n = 0;
  for (const p of people) {
    if (p.dateOfBirth && md(p.dateOfBirth) === md(TODAY)) { await notifyEmployees([p.id], "birthday", `Happy birthday, ${p.firstName}! 🎂`, "Wishing you a wonderful year from everyone at Rosier.", "/dashboard"); n++; }
    const years = TODAY.getUTCFullYear() - p.joiningDate.getUTCFullYear();
    if (years > 0 && md(p.joiningDate) === md(TODAY)) { await notifyEmployees([p.id, ...(p.managerId ? [p.managerId] : [])], "anniversary", `${p.firstName} completes ${years} year${years > 1 ? "s" : ""} at Rosier today 🎉`, null, `/people/${p.id}`); n++; }
  }
  return n;
}

async function markAbsences() {
  const y = addDays(TODAY, -1);
  const holiday = await db.holiday.findFirst({ where: { date: y, type: { not: "OPTIONAL" } } });
  if (holiday) return 0;
  const people = await db.employee.findMany({ where: { status: { in: ["ACTIVE", "PROBATION", "NOTICE_PERIOD"] }, joiningDate: { lte: y } }, include: { shift: true } });
  let n = 0;
  for (const p of people) {
    if ((p.shift?.weeklyOffs ?? [0]).includes(y.getUTCDay())) continue;
    const has = await db.attendance.findUnique({ where: { employeeId_date: { employeeId: p.id, date: y } } });
    if (has) continue;
    const leave = await db.leaveRequest.findFirst({ where: { employeeId: p.id, status: "APPROVED", startDate: { lte: y }, endDate: { gte: y } } });
    await db.attendance.create({ data: { employeeId: p.id, date: y, status: leave ? "LEAVE" : "ABSENT", source: "SYSTEM" } });
    n++;
  }
  return n;
}

(async () => {
  console.log(`[jobs] ${todayISO}`);
  console.log(`  expiry reminders: ${await expiryReminders()}`);
  console.log(`  celebrations:     ${await celebrations()}`);
  console.log(`  absences marked:  ${await markAbsences()}`);
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
