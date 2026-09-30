"use client";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonStyle } from "./button";
import { useToast } from "./toast";
import type { ActionResult } from "@/lib/action";

type Props = {
  action: (input: Record<string, unknown>) => Promise<ActionResult<unknown>>;
  payload: Record<string, unknown>;
  children: ReactNode;
  success?: string;
  confirm?: { title: string; body?: string; confirmLabel?: string; danger?: boolean; note?: { label: string; required?: boolean; name?: string } };
  className?: string;
  redirectTo?: string;
} & ButtonStyle;

/** One-click workflow button (approve, reject, archive…). Optional ConfirmationDialog with a note. */
export function ActionButton({ action, payload, children, success = "Done", confirm, variant = "secondary", size = "sm", className, redirectTo }: Props) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const dlg = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState("");

  const run = (extra: Record<string, unknown> = {}) =>
    start(async () => {
      const r = await action({ ...payload, ...extra });
      if (r.ok) {
        toast("success", r.message ?? success);
        dlg.current?.close();
        if (redirectTo) router.push(redirectTo); else router.refresh();
      } else toast("error", r.error);
    });

  return (
    <>
      <Button variant={variant} size={size} className={className} disabled={pending} onClick={() => (confirm ? dlg.current?.showModal() : run())}>
        {pending && !confirm && <span className="size-3 rounded-full border-2 border-current border-r-transparent animate-spin" />}
        {children}
      </Button>
      {confirm && (
        <dialog ref={dlg} className="m-auto w-[calc(100%-32px)] max-w-md rounded-card p-0 shadow-pop backdrop:bg-ink/35" onClick={(e) => e.target === dlg.current && dlg.current?.close()}>
          <form
            className="p-5"
            onSubmit={(e) => {
              e.preventDefault();
              run(confirm.note ? { [confirm.note.name ?? "note"]: note } : {});
            }}
          >
            <h2 className="text-[16px] font-semibold">{confirm.title}</h2>
            {confirm.body && <p className="text-muted text-[13.5px] mt-1.5">{confirm.body}</p>}
            {confirm.note && (
              <div className="mt-4">
                <label className="label" htmlFor="confirm-note">{confirm.note.label}</label>
                <textarea id="confirm-note" className="ctl" rows={3} required={confirm.note.required} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="secondary" onClick={() => dlg.current?.close()}>Cancel</Button>
              <Button type="submit" variant={confirm.danger ? "dangerSolid" : "primary"} disabled={pending}>
                {pending && <span className="size-3.5 rounded-full border-2 border-current border-r-transparent animate-spin" />}
                {confirm.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
