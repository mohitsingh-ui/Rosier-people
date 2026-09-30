import Link from "next/link";
import { AuthShell } from "../login/auth-shell";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Forgot password" };
export default function Page() {
  return (
    <AuthShell>
      <h1 className="text-[24px]">Reset your password</h1>
      <p className="text-muted mt-1.5 mb-8">Enter your employee ID or work email. We&apos;ll email you a link.</p>
      <ForgotForm />
      <Link href="/login" className="block mt-6 text-[13px] text-brand hover:underline">← Back to sign in</Link>
    </AuthShell>
  );
}
