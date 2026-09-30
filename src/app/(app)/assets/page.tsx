import Link from "next/link";
import { Plus, Laptop, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/auth/viewer";
import { addDays, fmtDate, today } from "@/lib/dates";
import { humanize, inr, num } from "@/lib/utils";
import { PageHeader, MetricCard } from "@/components/ui/card";
import { EmptyState, TableWrap } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { SearchBar, FilterDropdown } from "@/components/ui/filters";
import { AssetForm, AssignForm, DamageForm } from "@/components/assets/forms";
import { AutoOpen } from "@/components/leave/forms";

export const metadata = { title: "Assets" };

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; status?: string; assignTo?: string }> }) {
  const v = await requireViewer();
  const sp = await searchParams;
  const manage = can(v, "assets.manage");
  if (!manage) {
    const mine = await db.asset.findMany({ where: { holderId: v.employeeId ?? "__none__" }, include: { category: true, assignments: { where: { employeeId: v.employeeId ?? "" }, orderBy: { assignedAt: "desc" }, take: 1 } } });
    return (
      <>
        <PageHeader title="My assets" description="Company equipment assigned to you. Report damage here so IT can help." />
        {mine.length === 0 ? <div className="card"><EmptyState icon={Laptop} title="No assets assigned to you" /></div> : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{mine.map((a) => (
            <li key={a.id} className="card p-5">
              <div className="flex items-center gap-2 text-[12px] text-muted"><Laptop className="size-3.5" />{a.category.name} · {a.tag}</div>
              <div className="font-semibold mt-1">{a.brand} {a.model}</div>
              <div className="text-[12.5px] text-muted mt-1">Serial {a.serialNumber ?? "—"}<br />With you since {fmtDate(a.assignments[0]?.assignedAt)}{a.warrantyUntil ? <><br />Warranty till {fmtDate(a.warrantyUntil)}</> : null}</div>
              <div className="flex items-center justify-between mt-4"><StatusBadge status={a.status} />{a.status === "ASSIGNED" && <Modal title={`Report damage — ${a.tag}`} trigger={<Button variant="ghost" size="sm"><AlertTriangle className="size-3.5" />Report damage</Button>}><DamageForm assetId={a.id} /></Modal>}</div>
            </li>
          ))}</ul>
        )}
      </>
    );
  }
  const q = sp.q?.trim();
  const [assets, cats, people] = await Promise.all([
    db.asset.findMany({ where: { ...(sp.category ? { categoryId: sp.category } : {}), ...(sp.status ? { status: sp.status as never } : {}), ...(q ? { OR: [{ tag: { contains: q, mode: "insensitive" } }, { brand: { contains: q, mode: "insensitive" } }, { model: { contains: q, mode: "insensitive" } }, { serialNumber: { contains: q, mode: "insensitive" } }, { holder: { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }] } }] } : {}) }, include: { category: true, holder: true }, orderBy: { tag: "asc" } }),
    db.assetCategory.findMany({ orderBy: { name: "asc" } }),
    db.employee.findMany({ where: { status: { notIn: ["EXITED", "INACTIVE"] } }, orderBy: { firstName: "asc" } }),
  ]);
  const all = await db.asset.findMany({ select: { status: true, purchasePrice: true, warrantyUntil: true } });
  const peopleOpts = people.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }));
  const stock = assets.filter((a) => a.status === "IN_STOCK");
  const target = sp.assignTo ? people.find((p) => p.id === sp.assignTo) : null;
  return (
    <>
      <PageHeader title="Assets" description="Every laptop, phone, camera and vehicle — who has it and its condition."
        actions={<Modal size="lg" title="Add an asset" trigger={<Button><Plus className="size-4" />Add asset</Button>}><AssetForm categories={cats.map((c) => ({ value: c.id, label: c.name }))} /></Modal>} />
      {target && (
        <div className="card p-4 mb-5 flex flex-wrap items-center gap-3">
          <EmployeeAvatar employee={target} size={32} /><span className="flex-1 text-[13.5px]">Assign an in-stock asset to <strong>{target.firstName} {target.lastName}</strong></span>
          <Modal title={`Assign to ${target.firstName}`} trigger={<Button data-autoopen>Choose asset</Button>}>
            {stock.length ? <ul className="divide-y divide-line">{stock.map((a) => <li key={a.id} className="py-2.5 flex items-center justify-between gap-3"><span className="text-[13.5px]">{a.brand} {a.model} <span className="text-muted">· {a.tag}</span></span><Modal title={`Assign ${a.tag}`} trigger={<Button size="sm" variant="subtle">Assign</Button>}><AssignForm assetId={a.id} people={peopleOpts} defaultEmployee={target.id} /></Modal></li>)}</ul> : <p className="text-muted text-[13.5px]">Nothing in stock right now.</p>}
          </Modal>
          <AutoOpen />
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <MetricCard label="Total assets" value={all.length} />
        <MetricCard label="Assigned" value={all.filter((a) => a.status === "ASSIGNED").length} />
        <MetricCard label="In stock" value={all.filter((a) => a.status === "IN_STOCK").length} href="/assets?status=IN_STOCK" />
        <MetricCard label="Repair / damaged" value={all.filter((a) => ["IN_REPAIR", "DAMAGED"].includes(a.status)).length} tone="warn" href="/assets?status=IN_REPAIR" />
        <MetricCard label="Asset value" value={inr(all.reduce((s, a) => s + num(a.purchasePrice), 0))} hint={`${all.filter((a) => a.warrantyUntil && a.warrantyUntil < addDays(today(), 60) && a.warrantyUntil > today()).length} warranties end in 60 days`} />
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <SearchBar placeholder="Search by asset ID, model, serial or person" className="flex-1 min-w-60" />
        <FilterDropdown param="category" label="Type" options={cats.map((c) => ({ value: c.id, label: c.name }))} />
        <FilterDropdown param="status" label="Status" options={["ASSIGNED", "IN_STOCK", "IN_REPAIR", "DAMAGED", "RETIRED", "LOST"].map((s) => ({ value: s, label: humanize(s) }))} />
      </div>
      {assets.length === 0 ? <div className="card"><EmptyState icon={Laptop} title="No assets match" /></div> : (
        <TableWrap><table className="tbl"><thead><tr><th>Asset</th><th>Type</th><th>Serial</th><th>Assigned to</th><th>Condition</th><th>Status</th><th>Warranty</th><th /></tr></thead><tbody>
          {assets.map((a) => (
            <tr key={a.id}>
              <td><Link href={`/assets/${a.id}`} className="hover:text-brand"><span className="block font-medium">{a.brand} {a.model}</span><span className="block text-[12px] text-muted">{a.tag}</span></Link></td>
              <td>{a.category.name}</td><td className="text-muted text-[12.5px]">{a.serialNumber ?? "—"}</td>
              <td>{a.holder ? <Link href={`/people/${a.holder.id}?tab=assets`} className="flex items-center gap-2 hover:text-brand"><EmployeeAvatar employee={a.holder} size={24} />{a.holder.firstName} {a.holder.lastName}</Link> : <span className="text-faint">—</span>}</td>
              <td>{humanize(a.condition)}</td><td><StatusBadge status={a.status} /></td>
              <td className="text-[12.5px]">{a.warrantyUntil ? <Badge tone={a.warrantyUntil < today() ? "neutral" : a.warrantyUntil < addDays(today(), 60) ? "warn" : "ok"}>{fmtDate(a.warrantyUntil, "MMM yyyy")}</Badge> : "—"}</td>
              <td className="text-right">{a.status === "IN_STOCK" ? <Modal title={`Assign ${a.tag}`} trigger={<Button size="sm" variant="subtle">Assign</Button>}><AssignForm assetId={a.id} people={peopleOpts} /></Modal> : <Link href={`/assets/${a.id}`} className="text-[13px] text-brand hover:underline">Manage</Link>}</td>
            </tr>
          ))}
        </tbody></table></TableWrap>
      )}
    </>
  );
}
