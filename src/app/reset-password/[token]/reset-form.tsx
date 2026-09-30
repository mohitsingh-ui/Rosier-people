"use client";
import { useActionState } from "react";
import { resetPassword } from "@/server/auth";
import { Button } from "@/components/ui/button";

export function ResetForm({ token }: { token: string }) {
  const [state, act, pending] = useActionState(resetPassword, null);
  return (
    <form action={act} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div><label className="label" htmlFor="password">New password</label><input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" className="ctl h-11" /></div>
      <div><label className="label" htmlFor="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" required autoComplete="new-password" className="ctl h-11" /></div>
      {state && !state.ok && <p className="text-bad text-[13px]">{state.error}</p>}
      <Button type="submit" className="w-full h-11" disabled={pending}>Update password</Button>
    </form>
  );
}
