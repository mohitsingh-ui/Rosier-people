"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, Clock3, Plane, FileText, User, LayoutGrid, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ICONS } from "./icons";
import { isActive } from "./sidebar";
import type { NavItem } from "./nav";

const PRIMARY = [
  { href: "/dashboard", label: "Home", Icon: Home },
  { href: "/attendance", label: "Attendance", Icon: Clock3 },
  { href: "/leave", label: "Leave", Icon: Plane },
  { href: "/documents", label: "Documents", Icon: FileText },
  { href: "/me", label: "Profile", Icon: User },
];

/** Bottom tab bar + "More" sheet: the phone experience for employees. */
export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [pathname]);
  return (
    <>
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]" aria-label="Primary">
        <ul className="grid grid-cols-6">
          {PRIMARY.map(({ href, label, Icon }) => {
            const on = isActive(pathname, href);
            return (
              <li key={href}>
                <Link href={href} className={cn("flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10.5px]", on ? "text-brand font-medium" : "text-muted")}>
                  <Icon className="size-5" strokeWidth={on ? 2.2 : 1.8} />{label}
                </Link>
              </li>
            );
          })}
          <li>
            <button onClick={() => setMore(true)} className={cn("w-full flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10.5px]", more ? "text-brand" : "text-muted")}>
              <LayoutGrid className="size-5" strokeWidth={1.8} />More
            </button>
          </li>
        </ul>
      </nav>
      {more && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="All modules">
          <div className="absolute inset-0 bg-ink/35" onClick={() => setMore(false)} />
          <div className="absolute bottom-0 inset-x-0 rounded-t-[20px] bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] max-h-[80dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-semibold">All modules</h2>
              <button onClick={() => setMore(false)} aria-label="Close" className="p-1.5 rounded-lg hover:bg-soft"><X className="size-5" /></button>
            </div>
            <ul className="grid grid-cols-4 gap-y-5 gap-x-2">
              {items.map((it) => {
                const Icon = NAV_ICONS[it.icon];
                return (
                  <li key={it.href}>
                    <Link href={it.href} className="flex flex-col items-center gap-1.5 text-center text-[11.5px] text-ink-2">
                      <span className={cn("size-12 rounded-[14px] grid place-items-center", isActive(pathname, it.href) ? "bg-brand text-white" : "bg-brand-50 text-brand")}><Icon className="size-5" /></span>
                      {it.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
