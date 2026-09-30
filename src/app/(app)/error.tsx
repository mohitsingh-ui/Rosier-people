"use client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card max-w-lg mx-auto mt-10 p-8 text-center">
      <div className="size-11 rounded-full bg-bad-bg text-bad grid place-items-center mx-auto mb-3"><AlertTriangle className="size-5" /></div>
      <h1 className="text-[18px]">Something went wrong</h1>
      <p className="text-muted mt-1.5 text-[13.5px]">This page hit an error. Try again — if it keeps happening, raise a helpdesk ticket{error.digest ? ` and mention code ${error.digest}` : ""}.</p>
      <Button onClick={reset} className="mt-5">Try again</Button>
    </div>
  );
}
