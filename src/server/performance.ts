"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { action, UserError, zBool, zDate, zId, zOptDate, zOptText, zText } from "@/lib/action";
import { assertCan, AuthzError, can, type Viewer } from "@/lib/auth/viewer";
import { audit } from "@/lib/audit";
import { notifyEmployees } from "@/lib/notify";
import { dateOnly } from "@/lib/dates";

const who = (v: Viewer) => (v.employee ? `${v.employee.firstName} ${v.employee.lastName}` : v.email);
const touch = () => revalidatePath("/", "layout");
const GOAL_STATUS = ["NOT_STARTED", "IN_PROGRESS", "AT_RISK", "COMPLETED", "CANCELLED"] as const;

/** Who may edit a goal: its owner, anyone above them in the reporting line, or HR. */
function canEditGoal(v: Viewer, ownerId: string) {
  return ownerId === v.employeeId || v.teamIds.has(ownerId) || can(v, "goals.view_all");
}

export const saveCycle = action(z.object({ id: z.string().optional(), name: zText(80), startDate: zDate, endDate: zDate, selfReviewDue: zOptDate, managerReviewDue: zOptDate }), async (i, v) => {
  assertCan(v, "performance.manage");
  const data = { name: i.name, startDate: dateOnly(i.startDate), endDate: dateOnly(i.endDate), selfReviewDue: i.selfReviewDue ? dateOnly(i.selfReviewDue) : null, managerReviewDue: i.managerReviewDue ? dateOnly(i.managerReviewDue) : null };
  if (data.endDate <= data.startDate) throw new UserError("The cycle must end after it starts.");
  const c = i.id ? await db.performanceCycle.update({ where: { id: i.id }, data }) : await db.performanceCycle.create({ data });
  await audit(v, { action: "performance.cycle", entity: "PerformanceCycle", entityId: c.id, summary: `${who(v)} saved performance cycle ${c.name}.` });
  touch();
  return { ok: true as const, message: "Cycle saved." };
});

/** Opens reviews: one per active employee with a manager. */
export const setCycleStatus = action(z.object({ id: zId, status: z.enum(["DRAFT", "ACTIVE", "REVIEW", "CLOSED"]) }), async (i, v) => {
  assertCan(v, "performance.manage");
  const c = await db.performanceCycle.update({ where: { id: i.id }, data: { status: i.status } });
  let created = 0;
  if (i.status === "REVIEW") {
    const emps = await db.employee.findMany({ where: { status: { in: ["ACTIVE", "PROBATION", "NOTICE_PERIOD"] }, managerId: { not: null }, joiningDate: { lte: c.endDate } } });
    for (const e of emps) {
      const r = await db.performanceReview.upsert({ where: { cycleId_employeeId: { cycleId: c.id, employeeId: e.id } }, create: { cycleId: c.id, employeeId: e.id, reviewerId: e.managerId }, update: {} });
      if (r.createdAt > new Date(Date.now() - 5000)) created++;
    }
    await notifyEmployees(emps.map((e) => e.id), { type: "performance.review", title: `${c.name}: your self review is open`, body: c.selfReviewDue ? `Due by ${c.selfReviewDue.toISOString().slice(0, 10)}` : undefined, link: "/performance", email: true });
  }
  await audit(v, { action: "performance.cycle_status", entity: "PerformanceCycle", entityId: c.id, summary: `${who(v)} set ${c.name} to ${i.status.toLowerCase()}${created ? ` (${created} reviews opened)` : ""}.` });
  touch();
  return { ok: true as const, message: i.status === "REVIEW" ? `Review phase open — ${created} new reviews.` : "Cycle updated." };
});

export const submitSelfReview = action(z.object({ id: zId, selfRating: z.coerce.number().int().min(1).max(5), selfComments: zText(4000, 10), achievements: zOptText(4000) }), async (i, v) => {
  const r = await db.performanceReview.findUniqueOrThrow({ where: { id: i.id }, include: { cycle: true } });
  if (r.employeeId !== v.employeeId) throw new AuthzError();
  if (r.status !== "PENDING_SELF") throw new UserError("Your self review is already submitted.");
  if (r.cycle.status === "CLOSED") throw new UserError("This cycle is closed.");
  await db.performanceReview.update({ where: { id: r.id }, data: { selfRating: i.selfRating, selfComments: i.selfComments, achievements: i.achievements, status: "PENDING_MANAGER", submittedAt: new Date() } });
  await notifyEmployees([r.reviewerId], { type: "performance.review", title: `${v.employee?.firstName} submitted their self review`, link: `/performance/review/${r.id}` });
  await audit(v, { action: "performance.self_review", entity: "PerformanceReview", entityId: r.id, summary: `${who(v)} submitted a self review for ${r.cycle.name}.` });
  touch();
  return { ok: true as const, message: "Submitted to your manager." };
});

export const submitManagerReview = action(z.object({ id: zId, managerRating: z.coerce.number().int().min(1).max(5), managerComments: zText(4000, 10), developmentAreas: zOptText(4000), finalRating: z.coerce.number().int().min(1).max(5) }), async (i, v) => {
  const r = await db.performanceReview.findUniqueOrThrow({ where: { id: i.id }, include: { employee: true, cycle: true } });
  const isReviewer = r.reviewerId === v.employeeId || v.teamIds.has(r.employeeId);
  if (r.employeeId === v.employeeId || (!isReviewer && !can(v, "performance.manage"))) throw new AuthzError();
  if (r.status === "PENDING_SELF" && !can(v, "performance.manage")) throw new UserError(`Wait for ${r.employee.firstName}'s self review.`);
  await db.performanceReview.update({ where: { id: r.id }, data: { managerRating: i.managerRating, managerComments: i.managerComments, developmentAreas: i.developmentAreas, finalRating: i.finalRating, status: "COMPLETED", completedAt: new Date(), reviewerId: r.reviewerId ?? v.employeeId } });
  await notifyEmployees([r.employeeId], { type: "performance.review", title: `Your ${r.cycle.name} review is ready`, link: `/performance/review/${r.id}`, email: true });
  await audit(v, { action: "performance.manager_review", entity: "PerformanceReview", entityId: r.id, summary: `${who(v)} completed ${r.employee.firstName} ${r.employee.lastName}'s review for ${r.cycle.name}.` });
  touch();
  return { ok: true as const, message: "Review completed and shared." };
});

export const giveFeedback = action(z.object({ toId: zId, kind: z.enum(["PRAISE", "CONSTRUCTIVE", "MANAGER"]), body: zText(1500, 5), isPrivate: zBool }), async (i, v) => {
  if (!v.employeeId) throw new UserError("No employee record.");
  if (i.toId === v.employeeId) throw new UserError("Feedback is for someone else!");
  if (i.kind === "MANAGER" && !v.teamIds.has(i.toId)) throw new AuthzError("Manager feedback is for your team.");
  const to = await db.employee.findUniqueOrThrow({ where: { id: i.toId } });
  await db.feedback.create({ data: { fromId: v.employeeId, toId: i.toId, kind: i.kind, body: i.body, isPrivate: i.isPrivate || i.kind !== "PRAISE" } });
  await notifyEmployees([i.toId], { type: "feedback.new", title: `${v.employee?.firstName} ${i.kind === "PRAISE" ? "gave you a shout-out 🎉" : "shared feedback"}`, body: i.body.slice(0, 120), link: "/performance?tab=feedback" });
  await audit(v, { action: "feedback.give", entity: "Feedback", summary: `${who(v)} gave ${i.kind.toLowerCase()} feedback to ${to.firstName} ${to.lastName}.` });
  touch();
  return { ok: true as const, message: "Feedback sent." };
});

export const saveGoal = action(
  z.object({ id: z.string().optional(), ownerId: zId, title: zText(160), description: zOptText(2000), kind: z.enum(["INDIVIDUAL", "TEAM", "COMPANY", "KPI"]), period: z.enum(["QUARTERLY", "ANNUAL"]), priority: z.enum(["LOW", "MEDIUM", "HIGH"]), startDate: zDate, endDate: zDate, cycleId: z.string().optional().transform((x) => x || null), milestones: zOptText(2000) }),
  async (i, v) => {
    if (!canEditGoal(v, i.ownerId)) throw new AuthzError();
    const owner = await db.employee.findUniqueOrThrow({ where: { id: i.ownerId } });
    const data = { ownerId: owner.id, managerId: owner.managerId, departmentId: owner.departmentId, title: i.title, description: i.description, kind: i.kind, period: i.period, priority: i.priority, startDate: dateOnly(i.startDate), endDate: dateOnly(i.endDate), cycleId: i.cycleId };
    if (data.endDate < data.startDate) throw new UserError("End date is before start date.");
    let goalId = i.id;
    if (i.id) {
      const g = await db.goal.findUniqueOrThrow({ where: { id: i.id } });
      if (!canEditGoal(v, g.ownerId)) throw new AuthzError();
      await db.goal.update({ where: { id: i.id }, data });
    } else {
      const g = await db.goal.create({ data: { ...data, milestones: { create: (i.milestones ?? "").split("\n").map((m) => m.trim()).filter(Boolean).slice(0, 12).map((title) => ({ title })) } } });
      goalId = g.id;
      if (owner.id !== v.employeeId) await notifyEmployees([owner.id], { type: "goal.update", title: `${v.employee?.firstName} set a goal for you`, body: i.title, link: `/goals/${g.id}` });
    }
    await audit(v, { action: i.id ? "goal.update" : "goal.create", entity: "Goal", entityId: goalId, summary: `${who(v)} ${i.id ? "updated" : "created"} the goal "${i.title}" for ${owner.firstName}.` });
    touch();
    return { ok: true as const, message: "Goal saved.", data: { id: goalId } };
  },
);

export const updateGoalProgress = action(z.object({ id: zId, progress: z.coerce.number().int().min(0).max(100).optional(), status: z.enum(GOAL_STATUS).optional(), comment: zOptText(1500) }), async (i, v) => {
  const g = await db.goal.findUniqueOrThrow({ where: { id: i.id } });
  if (!canEditGoal(v, g.ownerId)) throw new AuthzError();
  if (!v.employeeId) throw new UserError("No employee record.");
  if (i.progress == null && !i.status && !i.comment) throw new UserError("Nothing to update.");
  const status = i.status ?? (i.progress === 100 ? "COMPLETED" : i.progress != null && g.status === "NOT_STARTED" && i.progress > 0 ? "IN_PROGRESS" : g.status);
  await db.goal.update({ where: { id: g.id }, data: { ...(i.progress != null ? { progress: i.progress } : {}), status } });
  await db.goalUpdate.create({ data: { goalId: g.id, authorId: v.employeeId, progress: i.progress, status: i.status ?? (status !== g.status ? status : null), comment: i.comment } });
  const notify = g.ownerId === v.employeeId ? g.managerId : g.ownerId;
  await notifyEmployees([notify], { type: "goal.update", title: `${v.employee?.firstName} updated "${g.title}"`, body: i.comment ?? (i.progress != null ? `Progress ${i.progress}%` : undefined), link: `/goals/${g.id}` });
  touch();
  return { ok: true as const, message: "Goal updated." };
});

export const toggleMilestone = action(z.object({ id: zId }), async (i, v) => {
  const m = await db.goalMilestone.findUniqueOrThrow({ where: { id: i.id }, include: { goal: true } });
  if (!canEditGoal(v, m.goal.ownerId)) throw new AuthzError();
  await db.goalMilestone.update({ where: { id: m.id }, data: { done: !m.done } });
  touch();
  return { ok: true as const, message: m.done ? "Milestone reopened." : "Milestone done." };
});

export const addMilestone = action(z.object({ goalId: zId, title: zText(160), dueDate: zOptDate }), async (i, v) => {
  const g = await db.goal.findUniqueOrThrow({ where: { id: i.goalId } });
  if (!canEditGoal(v, g.ownerId)) throw new AuthzError();
  await db.goalMilestone.create({ data: { goalId: g.id, title: i.title, dueDate: i.dueDate ? dateOnly(i.dueDate) : null } });
  touch();
  return { ok: true as const, message: "Milestone added." };
});

export const deleteGoal = action(z.object({ id: zId }), async (i, v) => {
  const g = await db.goal.findUniqueOrThrow({ where: { id: i.id } });
  if (!(v.teamIds.has(g.ownerId) || can(v, "goals.view_all") || (g.ownerId === v.employeeId && g.status === "NOT_STARTED"))) throw new AuthzError("Ask your manager to remove goals you've started.");
  await db.goal.delete({ where: { id: g.id } });
  await audit(v, { action: "goal.delete", entity: "Goal", entityId: g.id, summary: `${who(v)} deleted the goal "${g.title}".` });
  touch();
  return { ok: true as const, message: "Goal deleted." };
});
