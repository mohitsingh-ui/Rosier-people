"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { login } from "@/server/auth";
import { Button } from "@/components/ui/button";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(login, null);
  const [show, setShow] = useState(false);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label htmlFor="identifier" className="label">Employee ID or email</label>
        <input id="identifier" name="identifier" required autoComplete="username" autoFocus placeholder="ROS-013 or you@rosierfoods.com" className="ctl h-11" />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="label">Password</label>
          <Link href="/forgot-password" className="text-[12.5px] text-brand hover:underline mb-1.5">Forgot password?</Link>
        </div>
        <div className="relative">
          <input id="password" name="password" type={show ? "text" : "password"} required autoComplete="current-password" className="ctl h-11 pr-10" />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-faint hover:text-ink">
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      <label className="flex items-center gap-2 text-[13.5px] text-ink-2 select-none cursor-pointer">
        <input type="checkbox" name="remember" className="size-4 accent-[#784900]" /> Remember me for 30 days
      </label>
      {state && !state.ok && <p role="alert" className="rounded-ctl bg-bad-bg text-bad px-3.5 py-2.5 text-[13px]">{state.error}</p>}
      <Button type="submit" className="w-full h-11" disabled={pending}>
        {pending && <span className="size-3.5 rounded-full border-2 border-white border-r-transparent animate-spin" />}
        Sign in
      </Button>
      <div className="pt-4 border-t border-line">
        <p className="text-[12px] text-muted text-center mb-2.5">Single sign-on</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled title="Available once Google Workspace is connected in Settings → Integrations">Google</Button>
          <Button variant="secondary" disabled title="Available once Microsoft is connected in Settings → Integrations">Microsoft</Button>
        </div>
      </div>
    </form>
  );
}
