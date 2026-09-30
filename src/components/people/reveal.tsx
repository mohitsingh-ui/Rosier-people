"use client";
import { useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { revealIdentifier } from "@/server/people";
import { useToast } from "@/components/ui/toast";

/** Shows a masked value; clicking fetches the real one from the server (permission-checked and audit-logged). */
export function Reveal({ employeeId, field, masked, allowed }: { employeeId: string; field: "pan" | "aadhaar" | "passport" | "account"; masked: string; allowed: boolean }) {
  const [value, setValue] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  if (masked === "—") return <span className="text-faint">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular-nums tracking-wide">{value ?? masked}</span>
      {allowed && (
        <button type="button" disabled={pending} aria-label={value ? "Hide" : "Reveal"} title={value ? "Hide" : "Reveal (this is logged)"} className="p-1 rounded text-muted hover:text-ink hover:bg-soft"
          onClick={() => {
            if (value) { setValue(null); return; }
            start(async () => {
              const r = await revealIdentifier({ employeeId, field });
              if (r.ok) { setValue(String(r.data ?? "")); setTimeout(() => setValue(null), 20000); } else toast("error", r.error);
            });
          }}>
          {value ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      )}
    </span>
  );
}

