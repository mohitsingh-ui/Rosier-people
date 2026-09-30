# Rosier People

**People. Culture. Growth.** — the HRMS for Rosier Foods.

A full-stack people platform: employee records, org chart, private document vault, attendance, WFH, leave, holidays, payroll and payslips, expenses, assets, onboarding and exits, performance and goals, helpdesk, announcements, reports, audit logs and the Rosier Assist helper — with role-based access enforced on the server for every page, action and API route.

Built with Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL · Prisma 7 · Recharts · React Hook Form + Zod · pdf-lib · ExcelJS.

---

## Run it locally

**Needs:** Node.js 20.19 or newer, and either Docker or a local PostgreSQL 14+.

```bash
# 1. Database
docker compose up -d                      # or use your own Postgres

# 2. Config
cp .env.example .env
#   ENCRYPTION_KEY:       node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
#   FILE_SIGNING_SECRET:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Install, create tables, load demo data
npm install
npm run setup            # prisma migrate deploy + seed

# 4. Start
npm run dev              # http://localhost:3000
```

### Demo logins

Password for every account: **`Rosier@2026`**. You can sign in with the email or the employee ID.

| Role | Login | What to try |
|---|---|---|
| Super Admin | `aarav.mehra@rosier.test` (ROS-001) | Payroll runs, roles & permissions, company settings |
| HR Admin | `nandini.rao@rosier.test` (ROS-002) | Organization dashboard, add/import employees, verify documents, generate letters, exits |
| Manager | `ishita.kapoor@rosier.test` (ROS-004) | My Team, approve Yash's pending leave/WFH/correction/expense, write reviews |
| Employee | `yash.gupta@rosier.test` (ROS-013) | Check in, apply leave, upload documents, download payslip, self review |

All 26 seeded people, IDs, PAN/Aadhaar/bank numbers, phones and emails are **fictional**. Sample document files are generated PDFs marked "sample".

---

## What's inside

| Module | Highlights |
|---|---|
| **Dashboards** | Separate employee, manager and HR/admin views. HR: headcount, joiners, leave today, approvals, expiring documents, workforce growth, department split, attendance today, lifecycle, onboarding and exits in flight. |
| **People** | Directory (table/cards) with search and 7 filters; add employee (RHF + Zod); bulk CSV/XLSX import with row-level validation and preview; Excel export. |
| **Employee profile** | Header + 11 tabs (Overview, Job, Personal, Family, Documents, Payroll, Attendance, Leave, Performance, Assets, Timeline). Each tab checks access on the server. |
| **Organization** | Interactive org chart (drag a card onto a new manager, or use the keyboard selector), departments with head/people/attendance/leave/goals/openings, designations, locations. |
| **Documents** | Private vault per employee, 8 categories, versions, preview/download via 5-minute signed links, verify/reject, archive, expiry alerts at 30/15/7 days, "needs attention" dashboard, request documents. |
| **Letters** | 12 templates with `{{variables}}`, editable preview, PDF on Rosier letterhead, saved to the employee's vault. |
| **Attendance & WFH** | Check in/out (GPS on mobile), shifts with grace/half-day/overtime rules, monthly calendar, corrections with manager approval, WFH requests, team/org view with HR override. |
| **Leave** | 6 leave types, pro-rated balances, half days, attachments, approve/reject/ask-a-question, team calendar, holiday calendar, HR balance adjustments, comp-off, yearly carry-forward. |
| **Payroll** | Salary structures (encrypted bank numbers), monthly runs with LOP from unpaid leave and absences, PF/ESI/PT/TDS, payslip PDFs, tax declarations/proofs, Form 16. |
| **Expenses** | Multi-item claims with receipts, manager → finance → paid. |
| **Assets** | Register, assign/transfer/return with condition, damage reports, warranty tracking, full history. |
| **Onboarding & exits** | Auto-created 14-step onboarding checklist with validation; resignation → manager → HR → notice → clearance → settlement → exited, with checklist, asset checks and exit interview. |
| **Performance & goals** | Cycles, self and manager reviews with ratings, feedback and shout-outs, goals with milestones, progress updates and comments. |
| **Helpdesk** | Tickets with categories, priorities, attachments, internal notes, assignment and status flow. |
| **Announcements** | Company or department audience, pin, schedule, expiry, cover image, attachment. |
| **Reports** | 16 reports (headcount, gender, joiners, turnover, tenure, attendance, leave, WFH, payroll register, salaries, document compliance, assets, performance, onboarding) with date/department filters and CSV / Excel / PDF export. |
| **Settings** | Company, self-editable fields, leave policies, shifts, document types, templates, payroll rules, expense/asset categories, roles & permissions matrix, workflows, notifications, integrations, security, audit logs. |
| **Rosier Assist** | Answers "How many leaves do I have?", "Who's on leave today?", "Which documents expire this month?" and HR policy questions — using only data the signed-in user may see. Set `ANTHROPIC_API_KEY` to let Claude phrase policy answers (only policy text is sent). |
| **Everywhere** | Cmd/Ctrl+K global search, notifications, mobile bottom navigation, skeleton loaders, empty/error/no-access states. |

---

## Security model

- **Sessions:** random token in an `httpOnly`, `SameSite=Lax` cookie; only its SHA-256 is stored. 12 hours, or 30 days with "remember me". Sign out everywhere from *Password & sessions*.
- **Passwords:** bcrypt (cost 12). 10+ characters. Lockout after 5 failed attempts for 15 minutes. Timing-safe for unknown accounts. Reset links expire in 30 minutes.
- **Rate limits:** sign-in, password reset and every API route.
- **RBAC:** `roles` / `permissions` / `role_permissions` tables, editable in *Settings → Roles & permissions*. Defaults live in `src/lib/permissions.ts`.
- **Record-level access:** `accessFor(viewer, employeeId)` in `src/lib/auth/viewer.ts` is the single source of truth for who can see what. Managers see only their recursive reporting line and, by default, never salary, bank or personal details (toggle `team.view_payroll` / `team.view_personal` to change that).
- **Server-side only:** every Server Action goes through `action()` (session → Zod validation → handler with its own authorization). Sensitive data is only queried when allowed, so it never reaches the browser. Hiding a sidebar item is cosmetic; the server enforces the rule.
- **Encryption:** PAN, Aadhaar, passport and bank account numbers use AES-256-GCM (`ENCRYPTION_KEY`). Only the last 4 digits are shown; revealing a full number is audit-logged.
- **Files:** stored outside `public/`, served only through short-lived HMAC-signed URLs (local driver) or S3 pre-signed URLs, after a permission check. Upload type and size are validated.
- **Audit log:** every important change records who, what, before/after (sensitive values redacted), IP and device.
- **Headers:** `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; CSV exports are protected against formula injection.

**Tested against bypasses:** a signed-in employee requesting another employee's payslip, profile fields, exports, or replaying Server Actions (e.g. reveal PAN, open document) with another employee's ID is refused.

---

## How it's organised

```
prisma/
  schema.prisma          59 tables — Employee is the central entity
  migrations/            SQL migrations
  seed.ts                26 fictional Rosier employees with full history
src/
  proxy.ts               Redirects signed-out visitors (auth is re-checked everywhere)
  lib/
    auth/                sessions, passwords, viewer + accessFor() permission model
    permissions.ts       permission catalogue and default role grants
    action.ts            Server Action wrapper (auth + Zod + errors)
    workflow.ts          configurable workflow engine (named, switchable steps)
    storage.ts           private storage: local or S3-compatible, signed URLs
    crypto.ts            AES-256-GCM, hashing, HMAC
    pdf.ts               letters, payslips and report PDFs
    payroll-calc.ts      PF / ESI / PT / TDS maths
    email.ts, notify.ts  email provider abstraction + in-app notifications
    audit.ts             audit logging
  server/                Server Actions per module + queries, reports, assist, workflows
  app/(app)/             all signed-in pages
  app/api/               REST + file, export, search, notifications, assist endpoints
  components/            UI kit and module components
scripts/daily-jobs.ts    expiry reminders, birthdays/anniversaries, absence marking
```

**Reusable components:** `EmployeeAvatar`, `StatusBadge`, `MetricCard`, `DashboardCard`, `Section`, `Modal`, `Drawer`, `ActionButton` (with confirmation dialog), `ActionForm`, `FileUploader`, `DocumentVault`, `DocumentViewerButton`, `ApprovalCard`, `AttendanceCalendar`, `OrgChart`, `Timeline`, `ActivityFeed`, `SearchBar`, `FilterDropdown`, `DateRangePicker`, `Toast`, `NotificationPanel`, `CommandPalette`, charts (`AreaTrend`, `Bars`, `BarList`, `StatusBreakdown`).

### Workflows

Business events run named steps from `src/server/workflows.ts` — e.g. *leave approved* → mark attendance → notify employee. HR can switch individual steps off in *Settings → Workflows*. Core changes (balances, statuses) always happen inside the action's transaction. Events wired up: leave requested/decided, employee created (balances, onboarding checklist, document request, manager notice), onboarding completed, resignation started/completed, attendance correction and WFH decided, payroll processed, document uploaded, asset assigned, helpdesk ticket, announcement.

### REST API

All routes need a session cookie and apply the same permissions as the UI.

| Route | Purpose |
|---|---|
| `GET /api/employees` · `POST` | Directory listing (work fields only) · create |
| `GET /api/employees/:id` · `PATCH` | One employee, field groups filtered by access · update job |
| `GET /api/search?q=` | Global search |
| `GET /api/export/:report?format=csv\|xlsx\|pdf` | Report exports |
| `GET /api/payslips/:id` | Payslip PDF |
| `GET /api/attachments/:kind/:id` | Request attachments (redirects to a signed URL) |
| `GET/POST /api/notifications` | Read / mark read |
| `POST /api/assist` | Rosier Assist |
| `GET /api/health` | Health check |

---

## Going to production

1. Run Postgres (Neon, RDS, Supabase or your own), set `DATABASE_URL`, then `npx prisma migrate deploy`.
2. Generate fresh `ENCRYPTION_KEY` and `FILE_SIGNING_SECRET`. **Back up the encryption key** — encrypted numbers can't be read without it.
3. Set `STORAGE_DRIVER=s3` with an S3-compatible private bucket (AWS S3, Cloudflare R2, DigitalOcean Spaces…).
4. Set `EMAIL_PROVIDER` to `resend` or `sendgrid` (or finish the SMTP stub in `src/lib/email.ts`) and `APP_URL`.
5. Schedule `npm run jobs:daily` once a day (early morning IST).
6. Instead of the demo seed, create your first Super Admin: seed, then change names/emails — or import your team with *People → Import*.
7. Review `src/lib/payroll-calc.ts` with your CA before the first live payroll (PT by state, TDS regime, rounding).

### Ready to plug in

- **2FA / OTP:** `users.twoFactorEnabled` and the sign-in check are in place; add a TOTP library and challenge page.
- **Google / Microsoft sign-in:** buttons are on the login page; wire up Auth.js providers and match users by email.
- **Biometric / selfie attendance:** `attendance.source`, `latitude`, `longitude` and `selfieKey` exist; post punches to a new route using the same check-in logic.
- **Rate limiter:** in-memory per instance — swap for Redis if you run several servers.
