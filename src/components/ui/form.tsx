"use client";
import { createContext, useContext, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./toast";
import { useCloseOverlay } from "./modal";
import { Button, type ButtonStyle } from "./button";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/action";

type ServerAction = (fd: FormData) => Promise<ActionResult<unknown>>;
const ErrCtx = createContext<{ errors: Record<string, string[]>; pending: boolean }>({ errors: {}, pending: false });
export const useFormState = () => useContext(ErrCtx);

/**
 * Posts to a server action, shows field errors and a toast, closes the
 * surrounding modal and refreshes server data on success.
 */
export function ActionForm({ action, children, className, success = "Saved", reset = true, redirectTo, onDone }: {
  action: ServerAction; children: ReactNode; className?: string; success?: string | false; reset?: boolean; redirectTo?: string; onDone?: (r: ActionResult<unknown>) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const toast = useToast();
  const close = useCloseOverlay();
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  return (
    <ErrCtx.Provider value={{ errors, pending }}>
      <form
        ref={ref}
        className={cn("space-y-4", className)}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(async () => {
            const r = await action(fd);
            if (r.ok) {
              setErrors({});
              if (success !== false) toast("success", r.message ?? success);
              if (reset) ref.current?.reset();
              close?.();
              onDone?.(r);
              if (redirectTo) router.push(redirectTo);
              else router.refresh();
            } else {
              setErrors(r.fieldErrors ?? {});
              toast("error", r.error);
            }
          });
        }}
      >
        {children}
      </form>
    </ErrCtx.Provider>
  );
}

export function Field({ label, name, hint, children, className, required }: { label: string; name: string; hint?: ReactNode; children: ReactNode; className?: string; required?: boolean }) {
  const { errors } = useFormState();
  const err = errors[name]?.[0];
  return (
    <div className={className}>
      <label htmlFor={name} className="label">{label}{required && <span className="text-bad"> *</span>}</label>
      {children}
      {err ? <p className="text-[12px] text-bad mt-1">{err}</p> : hint ? <p className="text-[12px] text-muted mt-1">{hint}</p> : null}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: ReactNode; wrapClass?: string };
export function Input({ label, name, hint, wrapClass, className, required, ...rest }: InputProps) {
  const { errors } = useFormState();
  return (
    <Field label={label} name={name} hint={hint} className={wrapClass} required={required}>
      <input id={name} name={name} required={required} aria-invalid={!!errors[name]} className={cn("ctl", className)} {...rest} />
    </Field>
  );
}

export function Textarea({ label, name, hint, wrapClass, required, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; name: string; hint?: ReactNode; wrapClass?: string }) {
  const { errors } = useFormState();
  return (
    <Field label={label} name={name} hint={hint} className={wrapClass} required={required}>
      <textarea id={name} name={name} required={required} aria-invalid={!!errors[name]} className="ctl" rows={3} {...rest} />
    </Field>
  );
}

export function Select({ label, name, hint, wrapClass, options, placeholder, required, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; name: string; hint?: ReactNode; wrapClass?: string; options: { value: string; label: string }[]; placeholder?: string }) {
  const { errors } = useFormState();
  return (
    <Field label={label} name={name} hint={hint} className={wrapClass} required={required}>
      <select id={name} name={name} required={required} aria-invalid={!!errors[name]} className="ctl" {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function Checkbox({ label, name, defaultChecked, hint }: { label: string; name: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer select-none">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 rounded border-line-2 accent-[#784900]" />
      <span>
        <span className="text-[13.5px] text-ink">{label}</span>
        {hint && <span className="block text-[12px] text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function Submit({ children = "Save", variant, size, className }: { children?: ReactNode; className?: string } & ButtonStyle) {
  const { pending } = useFormState();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending} className={className}>
      {pending && <span className="size-3.5 rounded-full border-2 border-current border-r-transparent animate-spin" />}
      {children}
    </Button>
  );
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">{children}</div>;
}

export function Grid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  return <div className={cn("grid gap-4", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-3")}>{children}</div>;
}

/** DateRangePicker: two linked date inputs submitted as `${name}Start` / `${name}End`. */
export function DateRangePicker({ label, name = "", defaultStart, defaultEnd, required, startLabel = "From", endLabel = "To" }: { label?: string; name?: string; defaultStart?: string; defaultEnd?: string; required?: boolean; startLabel?: string; endLabel?: string }) {
  const [start, setStart] = useState(defaultStart ?? "");
  const s = name ? `${name}Start` : "startDate", e = name ? `${name}End` : "endDate";
  return (
    <fieldset>
      {label && <legend className="label">{label}</legend>}
      <div className="grid grid-cols-2 gap-3">
        <Input label={startLabel} name={s} type="date" required={required} defaultValue={defaultStart} onChange={(ev) => setStart(ev.target.value)} />
        <Input label={endLabel} name={e} type="date" required={required} defaultValue={defaultEnd} min={start || undefined} />
      </div>
    </fieldset>
  );
}
