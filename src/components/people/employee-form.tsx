"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createEmployee } from "@/server/people";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";

// Client-side schema mirrors the server one for instant feedback; the server re-validates everything.
const schema = z.object({
  firstName: z.string().trim().min(1, "Required").max(60),
  lastName: z.string().trim().min(1, "Required").max(60),
  workEmail: z.string().trim().email("Enter a valid work email"),
  workPhone: z.string().max(20).optional(),
  code: z.string().regex(/^([A-Za-z]{2,5}-\d{1,6})?$/, "Use a format like ROS-027").optional(),
  gender: z.string(),
  dateOfBirth: z.string().optional(),
  departmentId: z.string().min(1, "Pick a department"),
  designationId: z.string().min(1, "Pick a designation"),
  locationId: z.string().min(1, "Pick a location"),
  managerId: z.string().optional(),
  employmentType: z.string(),
  status: z.string(),
  joiningDate: z.string().min(1, "Pick the joining date"),
  role: z.string(),
  sendInvite: z.boolean(),
});
type Values = z.infer<typeof schema>;
type Opt = { value: string; label: string };

function F({ k, label, children, req, error }: { k: string; label: string; children: React.ReactNode; req?: boolean; error?: string }) {
  return <div><label htmlFor={k} className="label">{label}{req && <span className="text-bad"> *</span>}</label>{children}{error && <p className="text-[12px] text-bad mt-1">{error}</p>}</div>;
}

export function EmployeeForm({ departments, designations, locations, managers, roles, nextCode }: { departments: Opt[]; designations: (Opt & { departmentId: string | null })[]; locations: Opt[]; managers: Opt[]; roles: Opt[]; nextCode: string }) {
  const { register, handleSubmit, watch, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { gender: "UNDISCLOSED", employmentType: "FULL_TIME", status: "PREBOARDING", role: "EMPLOYEE", sendInvite: true, code: "" },
  });
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const dept = watch("departmentId");
  const filteredDesigs = designations.filter((d) => !dept || !d.departmentId || d.departmentId === dept);

  const onSubmit = (values: Values) =>
    start(async () => {
      const r = await createEmployee({ ...values, sendInvite: values.sendInvite ? "on" : "" });
      if (r.ok) {
        toast("success", r.message ?? "Employee added");
        router.push(`/people/${(r.data as { id: string }).id}`);
      } else {
        for (const [k, msgs] of Object.entries(r.fieldErrors ?? {})) setError(k as keyof Values, { message: msgs[0] });
        toast("error", r.error);
      }
    });

  const sel = (k: keyof Values, opts: Opt[], placeholder?: string) => (
    <select id={k} {...register(k)} aria-invalid={!!errors[k]} className="ctl">{placeholder !== undefined && <option value="">{placeholder}</option>}{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <section className="card p-5 sm:p-6">
        <h2 className="text-[15px] font-semibold mb-4">Basic details</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <F k="firstName" error={errors.firstName?.message} label="First name" req><input id="firstName" {...register("firstName")} aria-invalid={!!errors.firstName} className="ctl" autoFocus /></F>
          <F k="lastName" error={errors.lastName?.message} label="Last name" req><input id="lastName" {...register("lastName")} aria-invalid={!!errors.lastName} className="ctl" /></F>
          <F k="workEmail" error={errors.workEmail?.message} label="Work email" req><input id="workEmail" type="email" {...register("workEmail")} aria-invalid={!!errors.workEmail} className="ctl" placeholder="name@rosierfoods.com" /></F>
          <F k="workPhone" error={errors.workPhone?.message} label="Work phone"><input id="workPhone" {...register("workPhone")} className="ctl" placeholder="+91" /></F>
          <F k="code" error={errors.code?.message} label="Employee ID"><input id="code" {...register("code")} className="ctl" placeholder={`Leave blank for ${nextCode}`} /></F>
          <F k="gender" error={errors.gender?.message} label="Gender">{sel("gender", [{ value: "UNDISCLOSED", label: "Prefer not to say" }, { value: "FEMALE", label: "Female" }, { value: "MALE", label: "Male" }, { value: "NON_BINARY", label: "Non-binary" }])}</F>
          <F k="dateOfBirth" error={errors.dateOfBirth?.message} label="Date of birth"><input id="dateOfBirth" type="date" {...register("dateOfBirth")} className="ctl" /></F>
        </div>
      </section>
      <section className="card p-5 sm:p-6">
        <h2 className="text-[15px] font-semibold mb-4">Job</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <F k="departmentId" error={errors.departmentId?.message} label="Department" req>{sel("departmentId", departments, "Select")}</F>
          <F k="designationId" error={errors.designationId?.message} label="Designation" req>{sel("designationId", filteredDesigs, "Select")}</F>
          <F k="locationId" error={errors.locationId?.message} label="Work location" req>{sel("locationId", locations, "Select")}</F>
          <F k="managerId" error={errors.managerId?.message} label="Reporting manager">{sel("managerId", managers, "No manager")}</F>
          <F k="employmentType" error={errors.employmentType?.message} label="Employment type">{sel("employmentType", [{ value: "FULL_TIME", label: "Full-time" }, { value: "PART_TIME", label: "Part-time" }, { value: "CONTRACT", label: "Contract" }, { value: "INTERN", label: "Intern" }, { value: "CONSULTANT", label: "Consultant" }])}</F>
          <F k="joiningDate" error={errors.joiningDate?.message} label="Joining date" req><input id="joiningDate" type="date" {...register("joiningDate")} aria-invalid={!!errors.joiningDate} className="ctl" /></F>
          <F k="status" error={errors.status?.message} label="Status">{sel("status", [{ value: "PREBOARDING", label: "Preboarding (not joined yet)" }, { value: "PROBATION", label: "Probation" }, { value: "ACTIVE", label: "Active / confirmed" }])}</F>
          <F k="role" error={errors.role?.message} label="Access role">{sel("role", roles)}</F>
        </div>
        <label className="flex items-start gap-2.5 mt-5 cursor-pointer">
          <input type="checkbox" {...register("sendInvite")} className="mt-0.5 size-4 accent-[#784900]" />
          <span><span className="text-[13.5px]">Email a Rosier People invite</span><span className="block text-[12px] text-muted">They&apos;ll set their own password. An onboarding checklist and leave balances are created automatically.</span></span>
        </label>
      </section>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending && <span className="size-3.5 rounded-full border-2 border-white border-r-transparent animate-spin" />}Add employee</Button>
      </div>
    </form>
  );
}
