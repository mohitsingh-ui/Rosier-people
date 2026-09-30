import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/auth/viewer";
import { fmtDate, isoOf } from "@/lib/dates";
import { humanize, inr, num } from "@/lib/utils";
import { PageHeader, Section, KV } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/action-button";
import { AssetForm, AssignForm, ReturnForm, DamageForm } from "@/components/assets/forms";
import { setAssetStatus } from "@/server/assets";

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await requireViewer();
  const { id } = await params;
  const a = await db.asset.findUnique({ where: { id }, include: { category: true, holder: true, assignments: { include: { employee: true }, orderBy: { assignedAt: "desc" } } } });
  const manage = can(v, "assets.manage");
  if (!a || (!manage && a.holderId !== v.employeeId)) notFound();
  const [cats, people] = manage ? await Promise.all([db.assetCategory.findMany(), db.employee.findMany({ where: { status: { notIn: ["EXITED", "INACTIVE"] } }, orderBy: { firstName: "asc" } })]) : [[], []];
  const peopleOpts = people.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }));
  return (
    <>
      <PageHeader eyebrow={<Link href="/assets" className="hover:text-brand">Assets / {a.category.name}</Link>} title={`${a.brand} ${a.model}`} description={<span className="inline-flex items-center gap-2">{a.tag} <StatusBadge status={a.status} /></span>}
        actions={manage ? <>
          <Modal size="lg" title="Edit asset" trigger={<Button variant="secondary"><Pencil className="size-4" />Edit</Button>}><AssetForm categories={cats.map((c) => ({ value: c.id, label: c.name }))} a={{ ...a, purchaseDate: a.purchaseDate ? isoOf(a.purchaseDate) : null, warrantyUntil: a.warrantyUntil ? isoOf(a.warrantyUntil) : null, purchasePrice: a.purchasePrice ? num(a.purchasePrice) : null }} /></Modal>
          {a.holderId ? <>
            <Modal title="Transfer asset" trigger={<Button variant="secondary">Transfer</Button>}><AssignForm assetId={a.id} people={peopleOpts} transfer /></Modal>
            <Modal title="Record return" trigger={<Button>Return</Button>}><ReturnForm assetId={a.id} /></Modal>
          </> : ["IN_STOCK"].includes(a.status) ? <Modal title="Assign asset" trigger={<Button>Assign</Button>}><AssignForm assetId={a.id} people={peopleOpts} /></Modal> : null}
          {["IN_REPAIR", "DAMAGED"].includes(a.status) && !a.holderId && <ActionButton action={setAssetStatus} payload={{ assetId: a.id, status: "IN_STOCK" }} size="md">Back in stock</ActionButton>}
          {!a.holderId && a.status !== "RETIRED" && <ActionButton action={setAssetStatus} payload={{ assetId: a.id, status: "RETIRED" }} size="md" variant="ghost" confirm={{ title: "Retire this asset?", confirmLabel: "Retire" }}>Retire</ActionButton>}
        </> : a.status === "ASSIGNED" ? <Modal title="Report damage" trigger={<Button variant="danger">Report damage</Button>}><DamageForm assetId={a.id} /></Modal> : null} />
      <div className="grid lg:grid-cols-3 gap-6">
        <Section title="Details">
          <dl className="grid grid-cols-2 gap-4">
            <KV label="Asset ID" value={a.tag} /><KV label="Type" value={a.category.name} /><KV label="Serial" value={a.serialNumber} /><KV label="Condition" value={humanize(a.condition)} />
            <KV label="Purchased" value={a.purchaseDate ? fmtDate(a.purchaseDate) : "—"} />{manage && <KV label="Price" value={inr(a.purchasePrice)} />}
            <KV label="Warranty until" value={a.warrantyUntil ? fmtDate(a.warrantyUntil) : "—"} />
            <KV label="Assigned to" value={a.holder ? <Link href={`/people/${a.holder.id}`} className="hover:text-brand">{a.holder.firstName} {a.holder.lastName}</Link> : "In stock"} />
          </dl>
          {a.notes && <p className="text-[13px] text-muted mt-4 whitespace-pre-line border-t border-line pt-3">{a.notes}</p>}
        </Section>
        <div className="lg:col-span-2"><Section title="Assignment & return history">
          {a.assignments.length === 0 ? <p className="text-[13px] text-muted">Never assigned.</p> : (
            <ul className="divide-y divide-line -my-2">{a.assignments.map((h) => (
              <li key={h.id} className="py-3 flex items-center gap-3"><EmployeeAvatar employee={h.employee} size={32} /><span className="flex-1 min-w-0"><span className="block text-[13.5px] font-medium">{h.employee.firstName} {h.employee.lastName}</span><span className="block text-[12px] text-muted">{fmtDate(h.assignedAt)} → {h.returnedAt ? fmtDate(h.returnedAt) : "now"} · out {humanize(h.conditionOut)}{h.conditionIn ? `, back ${humanize(h.conditionIn)}` : ""}{h.note ? ` · ${h.note}` : ""}</span></span>{!h.returnedAt && <StatusBadge status="ASSIGNED" label="Current" />}</li>
            ))}</ul>
          )}
        </Section></div>
      </div>
    </>
  );
}
