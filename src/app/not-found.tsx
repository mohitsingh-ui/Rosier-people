import { ButtonLink } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="min-h-[70dvh] grid place-items-center px-6">
      <div className="text-center">
        <p className="accent text-[40px] text-brand-2">404</p>
        <h1 className="text-[20px] mt-2">We couldn&apos;t find that</h1>
        <p className="text-muted mt-1.5">It may have moved, or you may not have access to it.</p>
        <ButtonLink href="/dashboard" variant="secondary" className="mt-6">Back to dashboard</ButtonLink>
      </div>
    </main>
  );
}
