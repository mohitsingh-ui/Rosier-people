"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, MapPin, Clock3 } from "lucide-react";
import { checkIn, checkOut } from "@/server/attendance";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

type Props = {
  record: { checkIn: string | null; checkOut: string | null; status: string; workMinutes: number } | null;
  shift: { name: string; startTime: string; endTime: string };
  onLeave?: string | null;
  compact?: boolean;
};

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : "—");
const hm = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;

export function AttendanceWidget({ record, shift, onLeave, compact }: Props) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const inAt = record?.checkIn ? new Date(record.checkIn).getTime() : null;
  const worked = record?.checkOut ? record.workMinutes : inAt ? Math.max(0, Math.round((now - inAt) / 60000)) : 0;

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) { toast("success", r.message ?? "Done"); router.refresh(); } else toast("error", r.error ?? "Couldn't do that");
    });

  const doCheckIn = () => {
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
    if (navigator.geolocation && isMobile) {
      navigator.geolocation.getCurrentPosition(
        (p) => run(() => checkIn({ source: "GPS", latitude: p.coords.latitude, longitude: p.coords.longitude })),
        () => run(() => checkIn({ source: "MOBILE" })),
        { timeout: 5000, maximumAge: 60000 },
      );
    } else run(() => checkIn({ source: "WEB" }));
  };

  const status = onLeave ? "LEAVE" : record?.checkOut ? "Checked out" : record?.checkIn ? "Checked in" : "Not checked in";
  return (
    <div className={compact ? "" : "card p-5"}>
      {!compact && (
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">Today&apos;s attendance</h3>
          {record?.status && record.checkIn ? <StatusBadge status={record.status} /> : onLeave ? <StatusBadge status="LEAVE" /> : <span className="text-[12px] text-muted">{status}</span>}
        </div>
      )}
      <div className="mt-4 flex items-end gap-4">
        <div className="flex-1">
          <div className="text-[12px] text-muted flex items-center gap-1.5"><Clock3 className="size-3.5" />Working hours</div>
          <div className="text-[30px] leading-none font-semibold tracking-tight tabular-nums mt-1.5">{hm(worked)}</div>
        </div>
        <div className="text-right text-[12.5px] leading-6">
          <div><span className="text-muted">In </span><span className="font-medium tabular-nums">{time(record?.checkIn ?? null)}</span></div>
          <div><span className="text-muted">Out </span><span className="font-medium tabular-nums">{time(record?.checkOut ?? null)}</span></div>
        </div>
      </div>
      <div className="mt-4">
        {onLeave ? (
          <p className="text-[13px] text-muted rounded-ctl bg-soft px-3 py-2.5">You&apos;re on {onLeave.toLowerCase()} today. Enjoy the break.</p>
        ) : !record?.checkIn ? (
          <Button onClick={doCheckIn} disabled={pending} className="w-full h-11"><LogIn className="size-4" />Check in</Button>
        ) : !record.checkOut ? (
          <Button onClick={() => run(() => checkOut({}))} disabled={pending} variant="secondary" className="w-full h-11"><LogOut className="size-4" />Check out</Button>
        ) : (
          <p className="text-[13px] text-muted rounded-ctl bg-soft px-3 py-2.5">Done for today. See you tomorrow!</p>
        )}
      </div>
      <p className="text-[11.5px] text-faint mt-2.5 flex items-center gap-1"><MapPin className="size-3" />{shift.name} · {shift.startTime}–{shift.endTime}</p>
    </div>
  );
}
