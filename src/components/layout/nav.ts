import type { Viewer } from "@/lib/auth/viewer";
import { can, canAny } from "@/lib/auth/viewer";

export type NavItem = { href: string; label: string; icon: string; group: "main" | "work" | "admin" };

/** Sidebar entries; anything the role can't reach is removed server-side. */
export function navFor(v: Viewer, extras: { hasOwnLifecycle: boolean; hasTeam: boolean }): NavItem[] {
  const items: (NavItem | false)[] = [
    { href: "/dashboard", label: "Dashboard", icon: "home", group: "main" },
    { href: "/me", label: "My Space", icon: "user", group: "main" },
    can(v, "people.view_directory") && { href: "/people", label: "People", icon: "users", group: "main" },
    (extras.hasTeam || can(v, "people.edit")) && can(v, "team.view") && { href: "/my-team", label: "My Team", icon: "team", group: "main" },
    { href: "/organization", label: "Organization", icon: "org", group: "main" },
    { href: "/attendance", label: "Attendance", icon: "clock", group: "work" },
    { href: "/leave", label: "Leave", icon: "leave", group: "work" },
    { href: "/payroll", label: "Payroll", icon: "wallet", group: "work" },
    { href: "/documents", label: "Documents", icon: "file", group: "work" },
    (canAny(v, ["onboarding.manage", "offboarding.manage"]) || extras.hasOwnLifecycle) && { href: "/onboarding", label: "Onboarding", icon: "flag", group: "work" },
    { href: "/performance", label: "Performance", icon: "star", group: "work" },
    { href: "/goals", label: "Goals", icon: "target", group: "work" },
    { href: "/assets", label: "Assets", icon: "laptop", group: "work" },
    { href: "/expenses", label: "Expenses", icon: "receipt", group: "work" },
    { href: "/helpdesk", label: "Helpdesk", icon: "help", group: "work" },
    { href: "/announcements", label: "Announcements", icon: "megaphone", group: "work" },
    can(v, "reports.view") && { href: "/reports", label: "Reports", icon: "chart", group: "admin" },
    canAny(v, ["settings.manage", "settings.security", "audit.view"]) && { href: "/settings", label: "Settings", icon: "settings", group: "admin" },
  ];
  return items.filter(Boolean) as NavItem[];
}
