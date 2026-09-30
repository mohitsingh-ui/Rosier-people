export const TEMPLATE_VARIABLES = [
  "employee_name", "first_name", "employee_id", "designation", "department", "location", "joining_date",
  "confirmation_date", "exit_date", "manager_name", "salary", "annual_ctc", "monthly_gross", "effective_date",
  "company_name", "today", "hr_name", "new_designation", "new_department", "new_location", "reason",
] as const;

/** Replaces {{variable}} tokens. Unknown tokens are left visible so HR can spot them. */
export function renderTemplate(body: string, vars: Record<string, string | undefined>) {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) => vars[k] ?? m);
}
