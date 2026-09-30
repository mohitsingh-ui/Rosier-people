import { CheckCircle2 } from "lucide-react";
import { requireViewer } from "@/lib/auth/viewer";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/dates";
import { PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/action-button";
import { acknowledgePolicy } from "@/server/people";

export const metadata = { title: "Policies" };

export default async function Policies() {
  const v = await requireViewer();
  const [policies, acks] = await Promise.all([db.policy.findMany({ orderBy: { title: "asc" } }), v.employeeId ? db.documentAcknowledgement.findMany({ where: { employeeId: v.employeeId } }) : []]);
  const done = new Map(acks.map((a) => [`${a.policyId}:${a.policyVersion}`, a.acknowledgedAt]));
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="My Space" title="Company policies" description="The rules we work by. Read each one and confirm you've understood it." />
      <div className="space-y-4">
        {policies.map((p) => {
          const ack = done.get(`${p.id}:${p.version}`);
          return (
            <section key={p.id} id={p.id} className="card p-5 scroll-mt-24">
              <div className="flex flex-wrap items-center gap-2 mb-2"><h2 className="text-[16px]">{p.title}</h2><Badge>{p.category}</Badge><span className="text-[12px] text-muted">v{p.version} · {fmtDate(p.publishedAt)}</span></div>
              <div className="text-[13.5px] text-ink-2 whitespace-pre-line leading-relaxed">{p.body}</div>
              <div className="mt-4">
                {ack ? <span className="inline-flex items-center gap-1.5 text-[13px] text-ok"><CheckCircle2 className="size-4" />You accepted this on {fmtDate(ack)}</span>
                  : p.requiresAck && v.employeeId ? <ActionButton action={acknowledgePolicy} payload={{ policyId: p.id }} variant="primary" size="md" success="Acknowledged">I&apos;ve read and accept this policy</ActionButton> : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
