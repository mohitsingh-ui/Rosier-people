"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type ReactElement, cloneElement, isValidElement } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const CloseCtx = createContext<(() => void) | null>(null);
/** Lets forms inside a Modal/Drawer close it on success. */
export const useCloseOverlay = () => useContext(CloseCtx);

type Props = {
  trigger: ReactElement<{ onClick?: () => void }>;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "modal" | "drawer";
};

/** Modal and Drawer share one implementation on top of the native <dialog> (focus trap + Esc for free). */
export function Modal({ trigger, title, description, children, size = "md", variant = "modal" }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const widths = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  const t = isValidElement(trigger) ? cloneElement(trigger, { onClick: () => setOpen(true) }) : trigger;
  return (
    <>
      {t}
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => { if (e.target === ref.current) setOpen(false); }}
        className={cn(
          "backdrop:bg-ink/35 backdrop:backdrop-blur-[1px] bg-transparent p-0 m-0 max-w-none max-h-none",
          variant === "modal" ? "w-full h-full" : "w-full h-full",
        )}
      >
        {open && (
          <div className={cn("flex h-full w-full pointer-events-none", variant === "modal" ? "items-end sm:items-center justify-center sm:p-4" : "justify-end")}>
            <div
              className={cn(
                "pointer-events-auto bg-white shadow-pop flex flex-col w-full",
                variant === "modal" ? cn("rounded-t-card sm:rounded-card max-h-[92dvh]", widths[size]) : "h-full max-w-xl sm:border-l border-line",
              )}
            >
              <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
                <div>
                  <h2 className="text-[17px] font-semibold">{title}</h2>
                  {description && <p className="text-[13px] text-muted mt-0.5">{description}</p>}
                </div>
                <button type="button" onClick={() => setOpen(false)} className="p-1.5 -m-1 rounded-lg text-muted hover:bg-soft" aria-label="Close">
                  <X className="size-4.5" />
                </button>
              </div>
              <div className="px-5 pb-5 overflow-y-auto">
                <CloseCtx.Provider value={() => setOpen(false)}>{children}</CloseCtx.Provider>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

export function Drawer(props: Omit<Props, "variant">) {
  return <Modal {...props} variant="drawer" />;
}
