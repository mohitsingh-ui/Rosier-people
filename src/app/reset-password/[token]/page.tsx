import { AuthShell } from "../../login/auth-shell";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Set a new password" };
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthShell>
      <h1 className="text-[24px]">Set a new password</h1>
      <p className="text-muted mt-1.5 mb-8">At least 10 characters, with letters and numbers.</p>
      <ResetForm token={token} />
    </AuthShell>
  );
}
