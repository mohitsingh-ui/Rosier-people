import { requireViewer } from "@/lib/auth/viewer";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/dates";
import { PageHeader, Section } from "@/components/ui/card";
import { ActionButton } from "@/components/ui/action-button";
import { signOutEverywhere } from "@/server/auth";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Password & sessions" };

export default async function Security({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const v = await requireViewer();
  const sp = await searchParams;
  const [sessions, user] = await Promise.all([
    db.session.findMany({ where: { userId: v.userId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } }),
    db.user.findUniqueOrThrow({ where: { id: v.userId } }),
  ]);
  return (
    <div className="max-w-2xl">
      <PageHeader eyebrow="My Space" title="Password & sessions" />
      {sp.first && <p className="mb-5 rounded-ctl bg-warn-bg text-warn px-4 py-3 text-[13.5px]">Welcome! Please set your own password before you continue.</p>}
      <div className="space-y-5">
        <Section title="Change password"><PasswordForm /></Section>
        <Section title="Two-factor authentication">
          <p className="text-[13.5px] text-muted">{user.twoFactorEnabled ? "Two-factor authentication is on." : "Two-factor sign-in (authenticator app or OTP) is ready to be switched on by your admin in Settings → Security."}</p>
        </Section>
        <Section title="Where you're signed in" action={<ActionButton action={signOutEverywhere} payload={{}} variant="danger" confirm={{ title: "Sign out everywhere?", body: "Every browser and phone, including this one, will be signed out.", confirmLabel: "Sign out everywhere", danger: true }}>Sign out everywhere</ActionButton>}>
          <ul className="divide-y divide-line -my-2">{sessions.map((s) => (
            <li key={s.id} className="py-2.5 text-[13px]"><div className="font-medium truncate">{s.userAgent?.replace(/\(.*?\)/g, "").slice(0, 80) ?? "Unknown device"}</div><div className="text-muted">IP {s.ip} · Last active {fmtDateTime(s.lastSeenAt)}</div></li>
          ))}</ul>
        </Section>
      </div>
    </div>
  );
}
