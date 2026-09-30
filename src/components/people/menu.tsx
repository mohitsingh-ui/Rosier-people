"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Simple overflow menu; children are buttons/links/ActionButtons. */
export function OverflowMenu({ children, label = "More actions" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest("dialog")) setOpen(false); };
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" size="icon" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}><MoreHorizontal className="size-4" /></Button>
      <div hidden={!open} className="absolute right-0 top-11 z-40 w-60 card shadow-pop p-1.5 [&>*]:w-full [&_button]:w-full [&_button]:justify-start [&_button]:border-0 [&_button]:bg-transparent [&_button]:shadow-none [&_button:hover]:bg-soft [&_a]:w-full [&_a]:justify-start">
        {children}
      </div>
    </div>
  );
}
