import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { readSession } from "./session";
import type { PermissionKey } from "@/lib/permissions";
import type { RoleKey } from "@/generated/prisma/enums";

export type Viewer = {
  userId: string;
  email: string;
  role: RoleKey;
  permissions: ReadonlySet<string>;
  employeeId: string | null;
  employee: {
    id: string;
    code: string;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    designation: string | null;
    department: string | null;
    departmentId: string | null;
    managerId: string | null;
    status: string;
  } | null;
  /** Every employee below this viewer in the reporting tree (recursive) */
  teamIds: ReadonlySet<string>;
  directReportIds: ReadonlySet<string>;
};

export class AuthzError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "AuthzError";
  }
}

/** Resolved once per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await readSession();
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      employee: { include: { designation: true, department: true } },
    },
  });
  if (!user || !user.isActive) return null;

  const { teamIds, directIds } = user.employeeId ? await reportingTree(user.employeeId) : { teamIds: new Set<string>(), directIds: new Set<string>() };
  const e = user.employee;
  return {
    userId: user.id,
    email: user.email,
    role: user.role.key,
    permissions: new Set(user.role.permissions.map((rp) => rp.permission.key)),
    employeeId: user.employeeId,
    employee: e
      ? {
          id: e.id,
          code: e.code,
          firstName: e.firstName,
          lastName: e.lastName,
          photoUrl: e.photoUrl,
          designation: e.designation?.name ?? null,
          department: e.department?.name ?? null,
          departmentId: e.departmentId,
          managerId: e.managerId,
          status: e.status,
        }
      : null,
    teamIds,
    directReportIds: directIds,
  };
});

/** Walks the reporting tree breadth-first. Cycles are impossible (guarded on write) but we still track visited. */
export async function reportingTree(rootId: string) {
  const edges = await db.employee.findMany({
    where: { managerId: { not: null }, status: { not: "EXITED" } },
    select: { id: true, managerId: true },
  });
  const children = new Map<string, string[]>();
  for (const e of edges) {
    const list = children.get(e.managerId!) ?? [];
    list.push(e.id);
    children.set(e.managerId!, list);
  }
  const directIds = new Set(children.get(rootId) ?? []);
  const teamIds = new Set<string>();
  const queue = [...directIds];
  while (queue.length) {
    const id = queue.shift()!;
    if (teamIds.has(id) || id === rootId) continue;
    teamIds.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return { teamIds, directIds };
}

export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/login");
  return v;
}

export const can = (v: Viewer | null, p: PermissionKey) => !!v && v.permissions.has(p);
export const canAny = (v: Viewer | null, ps: PermissionKey[]) => ps.some((p) => can(v, p));

export function assertCan(v: Viewer, p: PermissionKey | PermissionKey[]) {
  const list = Array.isArray(p) ? p : [p];
  if (!canAny(v, list)) throw new AuthzError();
}

/** For pages: renders the "no access" state instead of throwing. */
export async function requirePermission(p: PermissionKey | PermissionKey[]) {
  const v = await requireViewer();
  const list = Array.isArray(p) ? p : [p];
  if (!canAny(v, list)) redirect("/no-access");
  return v;
}

export type Relationship = "self" | "hr" | "manager" | "peer";

/** How the viewer relates to a target employee. HR wins over manager. */
export function relationTo(v: Viewer, employeeId: string): Relationship {
  if (v.employeeId === employeeId) return "self";
  if (can(v, "people.edit")) return "hr";
  if (can(v, "team.view") && v.teamIds.has(employeeId)) return "manager";
  return "peer";
}

/**
 * Field-level access for one employee record. Every page, API route and the
 * assistant goes through this — nothing sensitive is fetched unless allowed.
 */
export function accessFor(v: Viewer, employeeId: string) {
  const rel = relationTo(v, employeeId);
  const self = rel === "self", hr = rel === "hr", mgr = rel === "manager";
  return {
    relationship: rel,
    job: true,
    jobHistory: self || hr || mgr,
    personal: self || (hr && can(v, "people.view_personal")) || (mgr && can(v, "team.view_personal")),
    identity: self || (hr && can(v, "people.view_identity")),
    revealIdentity: self || can(v, "people.view_identity"),
    family: self || (hr && can(v, "people.view_personal")) || (mgr && can(v, "team.view_personal")),
    documents: self || can(v, "documents.manage") || (mgr && can(v, "documents.team_view")),
    payroll: self || can(v, "payroll.view_all") || (mgr && can(v, "team.view_payroll")),
    attendance: self || mgr || can(v, "attendance.manage"),
    leave: self || mgr || can(v, "leave.manage"),
    performance: self || mgr || can(v, "performance.manage"),
    assets: self || mgr || can(v, "assets.manage"),
    timeline: self || hr || mgr,
    edit: can(v, "people.edit"),
    editSelf: self,
  };
}
export type Access = ReturnType<typeof accessFor>;

/** Prisma `where` restricting employee lists to what the viewer may see beyond the basic directory. */
export function managedEmployeesWhere(v: Viewer, hrPermission: PermissionKey) {
  if (can(v, hrPermission)) return {};
  const ids = [...v.teamIds];
  if (v.employeeId) ids.push(v.employeeId);
  return { id: { in: ids } };
}

/** Fields an employee may change on their own profile (HR controls this via settings). */
export const DEFAULT_SELF_EDITABLE = ["personalEmail", "personalPhone", "addressLine1", "addressLine2", "city", "state", "pin", "bloodGroup", "maritalStatus", "bio", "skills", "emergencyContacts", "family"] as const;
