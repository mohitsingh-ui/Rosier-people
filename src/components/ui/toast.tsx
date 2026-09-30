"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

type Toast = { id: number; kind: "success" | "error"; message: string };
const Ctx = createContext<(kind: Toast["kind"], message: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], message: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, message }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed z-[80] bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 lg:left-auto lg:right-6 lg:translate-x-0 flex flex-col gap-2 w-[calc(100%-32px)] max-w-sm">
        {items.map((t) => (
          <div key={t.id} role="status" className="flex items-start gap-3 rounded-ctl bg-ink text-white px-4 py-3 shadow-pop text-[13.5px]">
            {t.kind === "success" ? <CheckCircle2 className="size-4.5 mt-0.5 text-[#B9D9C1] shrink-0" /> : <AlertCircle className="size-4.5 mt-0.5 text-[#F0B4A6] shrink-0" />}
            <span className="flex-1">{t.message}</span>
            <button aria-label="Dismiss" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} className="opacity-60 hover:opacity-100"><X className="size-4" /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
