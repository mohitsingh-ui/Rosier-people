// Permission catalog. The database (roles / permissions / role_permissions) is the
// source of truth at runtime; this file seeds defaults and gives type-safe keys.
// Super Admins can change role grants from Settings → Roles & permissions.

export const PERMISSIONS = {
  "people.view_directory": { module: "People", description: "See the company directory (work details only)", roles: ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"] },
  "people.create": { module: "People", description: "Add employees", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  "people.edit": { module: "People", description: "Edit any employee's job and profile data", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  "people.delete": { module: "People", description: "Delete employee records permanently", roles: ["SUPER_ADMIN"] },
  "people.import": { module: "People", description: "Bulk import employees", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  "people.export": { module: "People", description: "Export employee data", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  "people.view_personal": { module: "People", description: "See personal details, family and emergency contacts of any employee", roles: ["SUPER_ADMIN", "HR_ADMIN"], sensitive: true },
  "people.view_identity": { module: "People", description: "Reveal PAN, Aadhaar and passport numbers", roles: ["SUPER_ADMIN", "HR_ADMIN"], sensitive: true },
  "people.reset_password": { module: "People", description: "Reset employee passwords", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  "org.manage": { module: "Organization", description: "Manage departments, designations, locations and reporting lines", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  "team.view": { module: "My Team", description: "See your reporting hierarchy", roles: ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"] },
  "team.view_personal": { module: "My Team", description: "Managers: see personal details of reports", roles: [], sensitive: true },
  "team.view_payroll": { module: "My Team", description: "Managers: see salary and bank details of reports", roles: [], sensitive: true },
  "tasks.assign": { module: "My Team", description: "Assign tasks to reports", roles: ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"] },
  "documents.manage": { module: "Documents", description: "Manage every employee's documents", roles: ["SUPER_ADMIN", "HR_ADMIN"], sensitive: true },
  "documents.team_view": { module: "Documents", description: "Managers: see team documents shared with managers", roles: ["MANAGER"] },
  "documents.generate": { module: "Documents", description: "Generate letters from templates", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  "attendance.manage": { module: "Attendance", description: "Manage all attendance and attendance policies", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  "attendance.approve_team": { module: "Attendance", description: "Approve team corrections and WFH", roles: ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"] },
  "leave.manage": { module: "Leave", description: "Manage all leave, balances and policies", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  "leave.approve_team": { module: "Leave", description: "Approve team leave", roles: ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"] },
  "payroll.view_all": { module: "Payroll", description: "See everyone's salary, bank and payslips", roles: ["SUPER_ADMIN", "HR_ADMIN"], sensitive: true },
  "payroll.process": { module: "Payroll", description: "Run payroll and edit salary structures", roles: ["SUPER_ADMIN"], sensitive: true },
  "expenses.approve_team": { module: "Expenses", description: "Approve team expense claims", roles: ["SUPER_ADMIN", "MANAGER"] },
  "expenses.finance": { module: "Expenses", description: "Finance approval and payout of claims", roles: ["SUPER_ADMIN"] },
  "assets.manage": { module: "Assets", description: "Manage company assets", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  "onboarding.manage": { module: "Onboarding", description: "Run onboarding", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  "offboarding.manage": { module: "Onboarding", description: "Run exits and final settlement", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  "performance.manage": { module: "Performance", description: "Run performance cycles and see all reviews", roles: ["SUPER_ADMIN", "HR_ADMIN"], sensitive: true },
  "performance.review_team": { module: "Performance", description: "Review your team", roles: ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"] },
  "goals.view_all": { module: "Goals", description: "See every goal in the company", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  "helpdesk.manage": { module: "Helpdesk", description: "Handle helpdesk tickets", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  "announcements.manage": { module: "Announcements", description: "Publish announcements", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  "reports.view": { module: "Reports", description: "See HR analytics and exports", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  "audit.view": { module: "Settings", description: "See audit logs", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  "settings.manage": { module: "Settings", description: "Configure policies, calendars, templates and categories", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  "settings.security": { module: "Settings", description: "Roles, permissions, company and security settings", roles: ["SUPER_ADMIN"] },
} as const satisfies Record<string, { module: string; description: string; roles: readonly string[]; sensitive?: boolean }>;

export type PermissionKey = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export const ROLE_LABELS = {
  SUPER_ADMIN: "Super Admin",
  HR_ADMIN: "HR Admin",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
} as const;
