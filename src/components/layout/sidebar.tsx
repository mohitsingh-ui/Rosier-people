"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ICONS } from "./icons";
import { Logo, LogoMark } from "./logo";
import type { NavItem } from "./nav";

export function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("rp.sidebar") === "1"); } catch {}
  }, []);
  const toggle = () => { setCollapsed((c) => { try { localStorage.setItem("rp.sidebar", c ? "0" : "1"); } catch {} return !c; }); };
  const groups = [["main", null], ["work", "Workspace"], ["admin", "Admin"]] as const;
  return (
    <aside className={cn("hidden lg:flex flex-col shrink-0 border-r border-line bg-white/70 backdrop-blur sticky top-0 h-dvh transition-[width] duration-200", collapsed ? "w-[72px]" : "w-[248px]")}>
      <div className={cn("h-16 flex items-center border-b border-line", collapsed ? "justify-center" : "px-5")}>
        <Link href="/dashboard" aria-label="Rosier People home">{collapsed ? <LogoMark /> : <Logo />}</Link>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-3" aria-label="Main">
        {groups.map(([g, title]) => {
          const list = items.filter((i) => i.group === g);
          if (!list.length) return null;
          return (
            <div key={g} className="mb-3">
              {title && !collapsed && <div className="eyebrow px-3 pt-2 pb-1.5 text-faint">{title}</div>}
              {title && collapsed && <div className="mx-3 my-2 border-t border-line" />}
              <ul className="space-y-0.5">
                {list.map((it) => {
                  const Icon = NAV_ICONS[it.icon];
                  const on = isActive(pathname, it.href);
                  return (
                    <li key={it.href}>
                      <Link href={it.href} title={collapsed ? it.label : undefined} aria-current={on ? "page" : undefined}
                        className={cn("flex items-center gap-3 rounded-ctl h-9 text-[13.5px] transition-colors", collapsed ? "justify-center" : "px-3",
                          on ? "bg-brand-50 text-brand font-medium" : "text-ink-2 hover:bg-soft hover:text-ink")}>
                        <Icon className={cn("size-[18px] shrink-0", on ? "text-brand" : "text-muted")} strokeWidth={on ? 2.1 : 1.8} />
                        {!collapsed && <span className="truncate">{it.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <button onClick={toggle} className="h-11 border-t border-line flex items-center justify-center gap-2 text-[12.5px] text-muted hover:text-ink" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" /> Collapse</>}
      </button>
    </aside>
  );
}
