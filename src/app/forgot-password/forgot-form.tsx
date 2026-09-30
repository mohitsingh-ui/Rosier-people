"use client";
import { useActionState } from "react";
import { requestPasswordReset } from "@/server/auth";
import { Button } from "@/components/ui/button";

export function ForgotForm() {
  const [state, act, pending] = useActionState(requestPasswordReset, null);
  if (state?.ok) return <p className="rounded-ctl bg-ok-bg text-ok px-4 py-3 text-[13.5px]">{state.message}</p>;
  return (
    <form action={act} className="space-y-4">
      <div>
        <label htmlFor="identifier" className="label">Employee ID or email</label>
        <input id="identifier" name="identifier" required className="ctl h-11" autoFocus />
      </div>
      {state && !state.ok && <p className="text-bad text-[13px]">{state.error}</p>}
      <Button type="submit" className="w-full h-11" disabled={pending}>Send reset link</Button>
    </form>
  );
}
