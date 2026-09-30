"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function MarkAllRead() {
  const router = useRouter();
  return <Button variant="secondary" onClick={async () => { await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }); router.refresh(); }}>Mark all as read</Button>;
}
