"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search, Sparkles, LogOut, KeyRound, User } from "lucide-react";
import { logout } from "@/server/auth";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { LogoMark } from "./logo";
import { NotificationPanel } from "./notification-panel";
import { openSearch } from "./command-palette";
import { openAssist } from "./assist";

type Me = { name: string; firstName: string; lastName: string; photoUrl: string | null; id?: string; designation: string | null; role: string; email: string };

export function Topbar({ me, unread }: { me: Me; unread: number }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, []);
  const [mac, setMac] = useState(true);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  return (
    <header className="sticky top-0 z-30 h-16 bg-canvas/85 backdrop-blur border-b border-line">
      <div className="h-full flex items-center gap-2 sm:gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="lg:hidden" aria-label="Home"><LogoMark size={30} /></Link>
        <button onClick={openSearch} className="flex-1 min-w-0 max-w-md flex items-center gap-2.5 h-9 rounded-ctl border border-line-2 bg-white px-3 text-[13.5px] text-faint hover:border-faint transition-colors" aria-label="Search">
          <Search className="size-4" />
          <span className="flex-1 text-left truncate">Search people, documents…</span>
          <kbd className="hidden sm:inline text-[11px] text-muted border border-line rounded px-1.5">{mac ? "⌘" : "Ctrl"} K</kbd>
        </button>
        <div className="flex-1 hidden md:block" />
        <button onClick={openAssist} className="h-9 px-3 rounded-ctl inline-flex items-center gap-2 text-[13px] font-medium text-brand bg-brand-50 hover:bg-brand-100" aria-label="Open Rosier Assist">
          <Sparkles className="size-4" /><span className="hidden sm:inline">Rosier Assist</span>
        </button>
        <NotificationPanel initialUnread={unread} />
        <div className="relative" ref={ref}>
          <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-2.5 rounded-ctl p-1 pr-2 hover:bg-soft" aria-expanded={menu} aria-label="Account menu">
            <EmployeeAvatar employee={me} size={32} />
            <span className="hidden xl:block text-left leading-tight">
              <span className="block text-[13px] font-medium">{me.name}</span>
              <span className="block text-[11.5px] text-muted">{me.role}</span>
            </span>
          </button>
          {menu && (
            <div className="absolute right-0 top-12 w-64 card shadow-pop p-1.5 z-50">
              <div className="px-3 py-2.5 border-b border-line mb-1">
                <div className="font-medium text-[13.5px]">{me.name}</div>
                <div className="text-[12px] text-muted truncate">{me.email}</div>
                <div className="text-[11.5px] text-brand mt-1">{me.role}</div>
              </div>
              <Link href="/me" onClick={() => setMenu(false)} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] hover:bg-soft"><User className="size-4 text-muted" />My profile</Link>
              <Link href="/me/security" onClick={() => setMenu(false)} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] hover:bg-soft"><KeyRound className="size-4 text-muted" />Password &amp; sessions</Link>
              <form action={logout}><button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] hover:bg-soft text-bad"><LogOut className="size-4" />Sign out</button></form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
