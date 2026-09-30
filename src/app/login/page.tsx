import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { LoginForm } from "./login-form";
import { AuthShell } from "./auth-shell";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  if (await getViewer()) redirect("/dashboard");
  const sp = await searchParams;
  return (
    <AuthShell>
      <h1 className="text-[26px] leading-tight">Welcome to Rosier People</h1>
      <p className="text-muted mt-1.5 mb-8">Sign in with your employee ID or work email.</p>
      {sp.reset && <p className="mb-5 rounded-ctl bg-ok-bg text-ok px-3.5 py-2.5 text-[13px]">Password updated. Sign in with your new password.</p>}
      <LoginForm next={sp.next} />
    </AuthShell>
  );
}
