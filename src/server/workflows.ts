import "server-only";
import { db } from "@/lib/db";
import { defineWorkflow } from "@/lib/workflow";
import { notifyEmployees, notifyPermission, notifyUsers } from "@/lib/notify";
import { addDays, dateOnly, eachDay, isoOf, today } from "@/lib/dates";

// Business workflows. Each step is named so HR can switch it off in
// Settings → Workflows; core data changes (balances, status) stay in the
// actions themselves so they're always transactional.

export type LeaveEvent = { requestId: string; actorName: string };
export type EmployeeEvent = { employeeId: string; actorUserId: string };

const ONBOARDING_TASKS: [string, string, number, boolean][] = [
  ["Collect signed offer letter", "HR", -5, false], ["Document collection (ID, address, education)", "EMPLOYEE", 0, true], ["KYC verification", "HR", 1, true],
  ["Bank details for payroll", "EMPLOYEE", 1, true], ["Create email and Slack", "IT", -1, false], ["Laptop assignment", "IT", 0, false], ["ID card", "ADMIN", 3, false],
  ["Workspace setup", "ADMIN", 0, false], ["IT setup and security training", "IT", 1, false], ["HR orientation", "HR", 1, false], ["Policy acknowledgement", "EMPLOYEE", 3, false],
  ["Manager introduction and 30-day plan", "MANAGER", 1, false], ["Team introduction", "MANAGER", 2, false], ["Role training", "MANAGER", 14, false],
];

const OFFBOARDING_TASKS: [string, string][] = [
  ["Knowledge transfer and handover note", "KNOWLEDGE"], ["Return company assets", "ASSETS"], ["Revoke system access", "CLEARANCE"],
  ["Finance clearance (advances, reimbursements)", "FINANCE"], ["Exit interview", "INTERVIEW"], ["Full and final settlement", "FINANCE"], ["Issue experience and relieving letters", "DOCUMENTS"],
];

defineWorkflow<LeaveEvent>("leave.requested", "Leave applied", [
  {
    id: "notify-approver", label: "Notify the reporting manager",
    run: async ({ requestId }) => {
      const r = await db.leaveRequest.findUniqueOrThrow({ where: { id: requestId }, include: { employee: true, leaveType: true } });
      await notifyEmployees([r.approverId], { type: "leave.requested", title: `${r.employee.firstName} applied for ${r.days} day${r.days === 1 ? "" : "s"} of ${r.leaveType.name.toLowerCase()}`, body: r.reason, link: "/leave?tab=approvals", email: true });
    },
  },
]);

defineWorkflow<LeaveEvent & { status: string }>("leave.decided", "Leave approved / rejected", [
  {
    id: "sync-attendance", label: "Mark approved days as leave on the attendance calendar",
    run: async ({ requestId, status }) => {
      if (status !== "APPROVED") return;
      const r = await db.leaveRequest.findUniqueOrThrow({ where: { id: requestId }, include: { leaveType: true } });
      for (const d of eachDay(r.startDate, r.endDate)) {
        if (d.getUTCDay() === 0) continue;
        const half = r.halfDay !== "NONE";
        await db.attendance.upsert({
          where: { employeeId_date: { employeeId: r.employeeId, date: d } },
          create: { employeeId: r.employeeId, date: d, status: half ? "HALF_DAY" : "LEAVE", source: "SYSTEM", note: r.leaveType.code },
          update: half ? { status: "HALF_DAY", note: r.leaveType.code } : { status: "LEAVE", source: "SYSTEM", note: r.leaveType.code },
        });
      }
    },
  },
  {
    id: "notify-employee", label: "Tell the employee",
    run: async ({ requestId, status, actorName }) => {
      const r = await db.leaveRequest.findUniqueOrThrow({ where: { id: requestId }, include: { leaveType: true } });
      const verb = status === "APPROVED" ? "approved" : status === "REJECTED" ? "declined" : "needs more detail on";
      await notifyEmployees([r.employeeId], {
        type: status === "APPROVED" ? "leave.approved" : status === "REJECTED" ? "leave.rejected" : "leave.clarification",
        title: `${actorName} ${verb} your ${r.leaveType.name.toLowerCase()}`, body: r.decisionNote ?? undefined, link: "/leave", email: true,
      });
    },
  },
]);

defineWorkflow<EmployeeEvent>("employee.created", "New employee added", [
  {
    id: "create-balances", label: "Allocate this year's leave balances (pro-rated)",
    run: async ({ employeeId }) => {
      const e = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
      const year = today().getUTCFullYear();
      const monthsLeft = e.joiningDate.getUTCFullYear() < year ? 12 : 12 - e.joiningDate.getUTCMonth();
      const types = await db.leaveType.findMany({ where: { isActive: true } });
      for (const t of types) {
        await db.leaveBalance.upsert({
          where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: t.id, year } },
          create: { employeeId, leaveTypeId: t.id, year, allocated: Math.round(((t.annualQuota * monthsLeft) / 12) * 2) / 2 },
          update: {},
        });
      }
    },
  },
  {
    id: "create-onboarding", label: "Create the onboarding checklist",
    run: async ({ employeeId }) => {
      const e = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
      if (e.status !== "PREBOARDING" && e.status !== "PROBATION") return;
      const hr = await db.user.findFirst({ where: { role: { key: "HR_ADMIN" }, isActive: true, employeeId: { not: null } }, orderBy: { createdAt: "asc" } });
      const it = await db.employee.findFirst({ where: { department: { name: "Technology" }, status: "ACTIVE" }, orderBy: { joiningDate: "asc" } });
      await db.onboarding.upsert({
        where: { employeeId },
        update: {},
        create: {
          employeeId, startDate: e.joiningDate, targetDate: addDays(e.joiningDate, 30),
          tasks: {
            create: ONBOARDING_TASKS.map(([title, category, offset, validate], order) => ({
              title, category, order, requiresValidation: validate, dueDate: addDays(e.joiningDate, offset),
              assigneeId: category === "EMPLOYEE" ? e.id : category === "MANAGER" ? e.managerId : category === "IT" ? it?.id ?? null : hr?.employeeId ?? null,
            })),
          },
        },
      });
    },
  },
  {
    id: "request-documents", label: "Ask the new joiner for mandatory documents",
    run: async ({ employeeId }) => {
      const types = await db.documentType.findMany({ where: { isMandatory: true } });
      await notifyEmployees([employeeId], { type: "document.requested", title: "Welcome to Rosier! Upload your documents", body: `We need: ${types.map((t) => t.name).join(", ")}.`, link: "/documents", email: true });
    },
  },
  {
    id: "notify-manager", label: "Tell the reporting manager",
    run: async ({ employeeId }) => {
      const e = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
      await notifyEmployees([e.managerId], { type: "onboarding.task", title: `${e.firstName} ${e.lastName} joins your team`, body: `Joining on ${isoOf(e.joiningDate)}. Your onboarding tasks are ready.`, link: `/onboarding/${e.id}` });
    },
  },
]);

defineWorkflow<EmployeeEvent>("onboarding.completed", "Onboarding completed", [
  {
    id: "activate", label: "Move the employee to Probation / Active",
    run: async ({ employeeId }) => {
      const e = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
      if (e.status === "PREBOARDING") await db.employee.update({ where: { id: employeeId }, data: { status: e.employmentType === "INTERN" ? "ACTIVE" : "PROBATION" } });
    },
  },
  {
    id: "notify", label: "Tell the employee and manager",
    run: async ({ employeeId }) => {
      const e = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
      await notifyEmployees([employeeId, e.managerId], { type: "onboarding.task", title: `Onboarding complete for ${e.firstName}`, link: `/people/${employeeId}` });
    },
  },
]);

defineWorkflow<{ offboardingId: string }>("offboarding.started", "Resignation submitted", [
  {
    id: "checklist", label: "Create the exit checklist",
    run: async ({ offboardingId }) => {
      const o = await db.offboarding.findUniqueOrThrow({ where: { id: offboardingId }, include: { employee: true } });
      if (await db.offboardingTask.count({ where: { offboardingId } })) return;
      const hr = await db.user.findFirst({ where: { role: { key: "HR_ADMIN" }, isActive: true, employeeId: { not: null } }, orderBy: { createdAt: "asc" } });
      await db.offboardingTask.createMany({
        data: OFFBOARDING_TASKS.map(([title, category], order) => ({
          offboardingId, title, category, order, dueDate: o.requestedLastDay,
          assigneeId: category === "KNOWLEDGE" || category === "ASSETS" ? o.employeeId : category === "INTERVIEW" || category === "DOCUMENTS" ? hr?.employeeId ?? null : null,
        })),
      });
    },
  },
  {
    id: "notify", label: "Notify manager and HR",
    run: async ({ offboardingId }) => {
      const o = await db.offboarding.findUniqueOrThrow({ where: { id: offboardingId }, include: { employee: true } });
      await notifyEmployees([o.employee.managerId], { type: "offboarding.update", title: `${o.employee.firstName} ${o.employee.lastName} has resigned`, body: "Please review the resignation.", link: `/onboarding/exit/${o.id}`, email: true });
      await notifyPermission("offboarding.manage", { type: "offboarding.update", title: `Resignation: ${o.employee.firstName} ${o.employee.lastName}`, link: `/onboarding/exit/${o.id}` });
    },
  },
]);

defineWorkflow<{ offboardingId: string }>("offboarding.completed", "Employee exited", [
  {
    id: "deactivate", label: "Deactivate login and end sessions",
    run: async ({ offboardingId }) => {
      const o = await db.offboarding.findUniqueOrThrow({ where: { id: offboardingId } });
      const u = await db.user.findUnique({ where: { employeeId: o.employeeId } });
      if (u) {
        await db.user.update({ where: { id: u.id }, data: { isActive: false } });
        await db.session.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
    },
  },
  {
    id: "reassign-reports", label: "Move direct reports to the exiting employee's manager",
    run: async ({ offboardingId }) => {
      const o = await db.offboarding.findUniqueOrThrow({ where: { id: offboardingId }, include: { employee: true } });
      const reports = await db.employee.findMany({ where: { managerId: o.employeeId } });
      for (const r of reports) {
        await db.employee.update({ where: { id: r.id }, data: { managerId: o.employee.managerId } });
        await db.reportingRelationship.updateMany({ where: { employeeId: r.id, endDate: null }, data: { endDate: today() } });
        if (o.employee.managerId) await db.reportingRelationship.create({ data: { employeeId: r.id, managerId: o.employee.managerId, startDate: today() } });
      }
    },
  },
]);

defineWorkflow<{ correctionId: string; status: string; actorName: string }>("attendance.correction.decided", "Attendance correction decided", [
  {
    id: "apply", label: "Apply approved times to attendance",
    run: async ({ correctionId, status }) => {
      if (status !== "APPROVED") return;
      const c = await db.attendanceCorrection.findUniqueOrThrow({ where: { id: correctionId }, include: { employee: { include: { shift: true } } } });
      const existing = await db.attendance.findUnique({ where: { employeeId_date: { employeeId: c.employeeId, date: c.date } } });
      const checkIn = c.requestedCheckIn ?? existing?.checkIn ?? null;
      const checkOut = c.requestedCheckOut ?? existing?.checkOut ?? null;
      const brk = c.employee.shift?.breakMinutes ?? 60;
      const work = checkIn && checkOut ? Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 60000) - brk) : 0;
      await db.attendance.upsert({
        where: { employeeId_date: { employeeId: c.employeeId, date: c.date } },
        create: { employeeId: c.employeeId, date: c.date, checkIn, checkOut, workMinutes: work, breakMinutes: brk, status: "PRESENT", source: "CORRECTION" },
        update: { checkIn, checkOut, workMinutes: work, status: existing?.status === "WFH" ? "WFH" : "PRESENT", isLate: false, source: "CORRECTION" },
      });
    },
  },
  {
    id: "notify", label: "Tell the employee",
    run: async ({ correctionId, status, actorName }) => {
      const c = await db.attendanceCorrection.findUniqueOrThrow({ where: { id: correctionId } });
      await notifyEmployees([c.employeeId], { type: "attendance.decided", title: `${actorName} ${status === "APPROVED" ? "approved" : "declined"} your attendance correction for ${isoOf(c.date)}`, link: "/attendance" });
    },
  },
]);

defineWorkflow<{ wfhId: string; status: string; actorName: string }>("wfh.decided", "WFH decided", [
  {
    id: "sync-attendance", label: "Mark approved WFH days on the attendance calendar",
    run: async ({ wfhId, status }) => {
      if (status !== "APPROVED") return;
      const w = await db.wfhRequest.findUniqueOrThrow({ where: { id: wfhId } });
      for (const d of eachDay(w.startDate, w.endDate)) {
        if (d > today()) continue; // future days get marked when the employee checks in
        await db.attendance.updateMany({ where: { employeeId: w.employeeId, date: d, status: { in: ["PRESENT", "LATE", "ABSENT"] } }, data: { status: "WFH" } });
      }
    },
  },
  {
    id: "notify", label: "Tell the employee",
    run: async ({ wfhId, status, actorName }) => {
      const w = await db.wfhRequest.findUniqueOrThrow({ where: { id: wfhId } });
      await notifyEmployees([w.employeeId], { type: "wfh.decided", title: `${actorName} ${status === "APPROVED" ? "approved" : "declined"} your WFH request`, link: "/attendance?tab=wfh" });
    },
  },
]);

defineWorkflow<{ payslipEmployeeIds: string[]; month: string }>("payroll.processed", "Payroll processed", [
  {
    id: "notify", label: "Tell employees their payslip is ready",
    run: async ({ payslipEmployeeIds, month }) => {
      await notifyEmployees(payslipEmployeeIds, { type: "payroll.processed", title: `Your payslip for ${month} is ready`, link: "/payroll", email: true });
    },
  },
]);

defineWorkflow<{ documentId: string }>("document.uploaded", "Document uploaded", [
  {
    id: "notify-hr", label: "Ask HR to verify employee uploads",
    run: async ({ documentId }) => {
      const d = await db.employeeDocument.findUniqueOrThrow({ where: { id: documentId }, include: { employee: true, type: true } });
      if (d.status !== "PENDING") return;
      await notifyPermission("documents.manage", { type: "document.requested", title: `${d.employee.firstName} ${d.employee.lastName} uploaded ${d.type.name}`, body: "Waiting for verification", link: "/documents?tab=attention" });
    },
  },
]);

defineWorkflow<{ assetId: string; employeeId: string }>("asset.assigned", "Asset assigned", [
  {
    id: "notify", label: "Tell the employee",
    run: async ({ assetId, employeeId }) => {
      const a = await db.asset.findUniqueOrThrow({ where: { id: assetId } });
      await notifyEmployees([employeeId], { type: "asset.assigned", title: `${a.brand} ${a.model} assigned to you`, body: `Asset ID ${a.tag}`, link: "/assets" });
    },
  },
]);

defineWorkflow<{ ticketId: string }>("helpdesk.created", "Helpdesk ticket raised", [
  {
    id: "notify-hr", label: "Notify the helpdesk team",
    run: async ({ ticketId }) => {
      const t = await db.helpdeskTicket.findUniqueOrThrow({ where: { id: ticketId }, include: { createdBy: true } });
      await notifyPermission("helpdesk.manage", { type: "helpdesk.new", title: `New ticket ${t.number}: ${t.subject}`, body: `${t.createdBy.firstName} ${t.createdBy.lastName} · ${t.category}`, link: `/helpdesk/${t.id}` });
    },
  },
]);

defineWorkflow<{ announcementId: string }>("announcement.published", "Announcement published", [
  {
    id: "notify", label: "Notify the audience in-app",
    run: async ({ announcementId }) => {
      const a = await db.announcement.findUniqueOrThrow({ where: { id: announcementId } });
      const users = await db.user.findMany({ where: { isActive: true, ...(a.audience === "DEPARTMENT" && a.departmentId ? { employee: { departmentId: a.departmentId } } : {}) }, select: { id: true } });
      await notifyUsers(users.map((u) => u.id), { type: "announcement.new", title: a.title, body: a.body.slice(0, 140), link: "/announcements" });
    },
  },
]);

