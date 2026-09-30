import { db } from "@/lib/db";
import { requirePermission, can } from "@/lib/auth/viewer";
import { PageHeader } from "@/components/ui/card";
import { EmployeeForm } from "@/components/people/employee-form";

export const metadata = { title: "Add employee" };

export default async function NewEmployee() {
  const v = await requirePermission("people.create");
  const [departments, designations, locations, managers, codes] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.designation.findMany({ orderBy: { name: "asc" } }),
    db.location.findMany({ orderBy: { name: "asc" } }),
    db.employee.findMany({ where: { status: { in: ["ACTIVE", "PROBATION", "NOTICE_PERIOD"] } }, orderBy: { firstName: "asc" }, include: { designation: true } }),
    db.employee.findMany({ select: { code: true } }),
  ]);
  const next = `ROS-${String(Math.max(0, ...codes.map((c) => Number(c.code.replace(/\D/g, "")) || 0)) + 1).padStart(3, "0")}`;
  const roles = [{ value: "EMPLOYEE", label: "Employee" }, { value: "MANAGER", label: "Manager" }, ...(can(v, "settings.security") ? [{ value: "HR_ADMIN", label: "HR Admin" }, { value: "SUPER_ADMIN", label: "Super Admin" }] : [])];
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="People" title="Add an employee" description="Creates their profile, login, leave balances and onboarding checklist in one go." />
      <EmployeeForm
        departments={departments.map((d) => ({ value: d.id, label: d.name }))}
        designations={designations.map((d) => ({ value: d.id, label: d.name, departmentId: d.departmentId }))}
        locations={locations.map((l) => ({ value: l.id, label: l.name }))}
        managers={managers.map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName} · ${m.designation?.name ?? ""}` }))}
        roles={roles} nextCode={next}
      />
    </div>
  );
}
