import { ShieldAlert } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export default function NoAccess() {
  return (
    <main className="min-h-dvh grid place-items-center px-6">
      <div className="text-center max-w-sm">
        <div className="size-12 rounded-full bg-brand-50 text-brand grid place-items-center mx-auto mb-4"><ShieldAlert className="size-5" /></div>
        <h1 className="text-[20px]">You don&apos;t have access to this page</h1>
        <p className="text-muted mt-2">It&apos;s limited to specific roles. If you need it for your work, raise a request with HR.</p>
        <div className="flex justify-center gap-2 mt-6">
          <ButtonLink href="/dashboard" variant="secondary">Go to dashboard</ButtonLink>
          <ButtonLink href="/helpdesk?new=1">Raise a request</ButtonLink>
        </div>
      </div>
    </main>
  );
}
