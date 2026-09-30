import Link from "next/link";
import { FileWarning, Search } from "lucide-react";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/auth/viewer";
import { addDays, fmtDate, today } from "@/lib/dates";
import { PageHeader, Section } from "@/components/ui/card";
import { Tabs, EmptyState, TableWrap } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/action-button";
import { SearchBar, FilterDropdown } from "@/components/ui/filters";
import { DocumentVault } from "@/components/documents/vault";
import { DocumentViewerButton } from "@/components/documents/client";
import { reviewDocument } from "@/server/documents";
import { expiryState } from "@/server/queries";
import { RequestDocsForm } from "./request-form";

export const metadata = { title: "Documents" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ tab?: string; upload?: string; q?: string; category?: string; status?: string }> }) {
  const v = await requireViewer();
  const sp = await searchParams;
  const hr = can(v, "documents.manage");
  const mgr = can(v, "documents.team_view") && v.teamIds.size > 0;
  const tabs = [
    ...(v.employeeId ? [{ key: "mine", label: "My documents" }] : []),
    ...(mgr && !hr ? [{ key: "team", label: "My team" }] : []),
    ...(hr ? [{ key: "attention", label: "Needs attention" }, { key: "all", label: "All documents" }] : []),
  ];
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : tabs[0]?.key ?? "mine";

  return (
    <>
      <PageHeader title="Documents" description={tab === "mine" ? "Your private vault. Only you and HR can open these — managers see only what's marked as shared." : hr ? "Every employee document, with verification and expiry tracking." : undefined} />
      {tabs.length > 1 && <Tabs tabs={tabs} active={tab} base="/documents" />}
      <div className={tabs.length > 1 ? "pt-5" : ""}>
        {tab === "mine" && v.employeeId && <DocumentVault v={v} employeeId={v.employeeId} defaultUploadType={sp.upload && sp.upload !== "1" ? sp.upload : undefined} />}
        {tab === "team" && <TeamDocs v={v} />}
        {tab === "attention" && <Attention />}
        {tab === "all" && <AllDocs q={sp.q} category={sp.category} status={sp.status} />}
      </div>
    </>
  );

  async function TeamDocs({ v: viewer }: { v: typeof v }) {
    const docs = await db.employeeDocument.findMany({ where: { employeeId: { in: [...viewer.teamIds] }, visibility: "MANAGER", archivedAt: null }, include: { employee: true, type: true }, orderBy: { createdAt: "desc" } });
    if (!docs.length) return <div className="card"><EmptyState title="Nothing shared with you yet" body="Documents your team marks as 'shared with manager' (e.g. certifications) show up here." /></div>;
    return (
      <TableWrap><table className="tbl"><thead><tr><th>Employee</th><th>Document</th><th>Type</th><th>Status</th><th>Expiry</th><th /></tr></thead><tbody>
        {docs.map((d) => { const e = expiryState(d.expiryDate); return <tr key={d.id}><td><span className="flex items-center gap-2"><EmployeeAvatar employee={d.employee} size={26} />{d.employee.firstName} {d.employee.lastName}</span></td><td className="font-medium">{d.name}</td><td>{d.type.name}</td><td><StatusBadge status={d.status} /></td><td>{e ? <Badge tone={e.tone}>{d.expiryDate ? fmtDate(d.expiryDate) : ""}</Badge> : "—"}</td><td className="text-right"><DocumentViewerButton documentId={d.id} label={d.name} /></td></tr>; })}
      </tbody></table></TableWrap>
    );
  }
}

async function Attention() {
  const [pending, rejected, expiring, emps, mandatory, allDocs, types] = await Promise.all([
    db.employeeDocument.findMany({ where: { status: "PENDING", archivedAt: null }, include: { employee: true, type: true }, orderBy: { createdAt: "asc" } }),
    db.employeeDocument.findMany({ where: { status: "REJECTED", archivedAt: null }, include: { employee: true, type: true } }),
    db.employeeDocument.findMany({ where: { archivedAt: null, expiryDate: { not: null, lte: addDays(today(), 30) }, employee: { status: { not: "EXITED" } } }, include: { employee: true, type: true }, orderBy: { expiryDate: "asc" } }),
    db.employee.findMany({ where: { status: { notIn: ["EXITED", "INACTIVE"] } }, orderBy: { firstName: "asc" } }),
    db.documentType.findMany({ where: { isMandatory: true } }),
    db.employeeDocument.findMany({ where: { archivedAt: null, status: { not: "REJECTED" } }, select: { employeeId: true, typeId: true } }),
    db.documentType.findMany({ orderBy: { name: "asc" } }),
  ]);
  const have = new Set(allDocs.map((d) => `${d.employeeId}:${d.typeId}`));
  const missing = emps.flatMap((e) => mandatory.filter((t) => !have.has(`${e.id}:${t.id}`)).map((t) => ({ e, t })));
  const bucket = (d: Date) => { const n = Math.round((d.getTime() - today().getTime()) / 86400000); return n < 0 ? "Expired" : n <= 7 ? "Within 7 days" : n <= 15 ? "Within 15 days" : "Within 30 days"; };
  const buckets = ["Expired", "Within 7 days", "Within 15 days", "Within 30 days"];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[["Awaiting verification", pending.length, "warn"], ["Expiring or expired", expiring.length, expiring.some((d) => d.expiryDate! < today()) ? "bad" : "warn"], ["Rejected — re-upload due", rejected.length, "bad"], ["Mandatory documents missing", missing.length, "bad"]].map(([l, n, t]) => (
          <div key={l as string} className="card px-4 py-3.5"><div className="text-[12.5px] text-muted">{l}</div><div className={`text-[26px] font-semibold ${n ? (t === "bad" ? "text-bad" : "text-warn") : ""}`}>{n}</div></div>
        ))}
      </div>
      <Section title="Awaiting verification">
        {pending.length === 0 ? <EmptyState compact title="Nothing to verify" /> : (
          <ul className="divide-y divide-line -my-2">{pending.map((d) => (
            <li key={d.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <span className="flex items-center gap-3 flex-1 min-w-0"><EmployeeAvatar employee={d.employee} size={34} /><span className="min-w-0"><span className="block text-[13.5px] font-medium">{d.name} <span className="text-muted font-normal">· {d.type.name}</span></span><span className="block text-[12px] text-muted"><Link href={`/people/${d.employee.id}?tab=documents`} className="hover:text-brand">{d.employee.firstName} {d.employee.lastName}</Link> · uploaded {fmtDate(d.createdAt)}{d.expiryDate ? ` · expires ${fmtDate(d.expiryDate)}` : ""}</span></span></span>
              <span className="flex items-center gap-1.5">
                <DocumentViewerButton documentId={d.id} label={d.name} />
                <ActionButton action={reviewDocument} payload={{ documentId: d.id, decision: "VERIFIED" }} variant="subtle" success="Verified">Verify</ActionButton>
                <ActionButton action={reviewDocument} payload={{ documentId: d.id, decision: "REJECTED" }} variant="danger" confirm={{ title: `Reject ${d.name}?`, confirmLabel: "Reject", danger: true, note: { label: "What needs fixing?", required: true } }}>Reject</ActionButton>
              </span>
            </li>
          ))}</ul>
        )}
      </Section>
      <Section title="Expiry alerts" action={<span className="text-[12px] text-muted">Reminders go out at 30, 15 and 7 days</span>}>
        {expiring.length === 0 ? <EmptyState compact icon={FileWarning} title="Nothing expiring in the next 30 days" /> : (
          <div className="space-y-4">{buckets.map((b) => {
            const list = expiring.filter((d) => bucket(d.expiryDate!) === b);
            if (!list.length) return null;
            return (
              <div key={b}><div className="eyebrow mb-2">{b}</div>
                <ul className="grid sm:grid-cols-2 gap-2">{list.map((d) => { const s = expiryState(d.expiryDate)!; return (
                  <li key={d.id} className="flex items-center gap-3 rounded-ctl border border-line p-3"><EmployeeAvatar employee={d.employee} size={30} /><span className="min-w-0 flex-1"><span className="block text-[13.5px] font-medium truncate">{d.name}</span><Link href={`/people/${d.employee.id}?tab=documents`} className="block text-[12px] text-muted hover:text-brand">{d.employee.firstName} {d.employee.lastName} · {fmtDate(d.expiryDate)}</Link></span><Badge tone={s.tone}>{s.label}</Badge></li>
                ); })}</ul>
              </div>
            );
          })}</div>
        )}
      </Section>
      <div className="grid lg:grid-cols-2 gap-5">
        <Section title="Missing mandatory documents" action={missing.length ? <RequestDocsForm employees={[...new Map(missing.map((m) => [m.e.id, { value: m.e.id, label: `${m.e.firstName} ${m.e.lastName}` }])).values()]} types={types.map((t) => ({ value: t.id, label: t.name }))} /> : null}>
          {missing.length === 0 ? <p className="text-[13px] text-muted">Everyone has their mandatory documents.</p> : (
            <ul className="space-y-2 text-[13px] max-h-80 overflow-y-auto">{missing.map((m) => <li key={`${m.e.id}${m.t.id}`} className="flex justify-between gap-3"><Link href={`/people/${m.e.id}?tab=documents`} className="hover:text-brand">{m.e.firstName} {m.e.lastName}</Link><span className="text-muted">{m.t.name}</span></li>)}</ul>
          )}
        </Section>
        <Section title="Rejected — waiting for re-upload">
          {rejected.length === 0 ? <p className="text-[13px] text-muted">None.</p> : <ul className="space-y-2.5 text-[13px]">{rejected.map((d) => <li key={d.id}><span className="font-medium">{d.employee.firstName} {d.employee.lastName}</span> · {d.name}<div className="text-muted text-[12.5px]">{d.rejectionNote}</div></li>)}</ul>}
        </Section>
      </div>
    </div>
  );
}

async function AllDocs({ q, category, status }: { q?: string; category?: string; status?: string }) {
  const [cats, docs] = await Promise.all([
    db.documentCategory.findMany({ orderBy: { order: "asc" } }),
    db.employeeDocument.findMany({
      where: {
        ...(status === "ARCHIVED" ? { archivedAt: { not: null } } : { archivedAt: null, ...(status ? { status: status as never } : {}) }),
        ...(category ? { type: { categoryId: category } } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { employee: { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } }] } : {}),
      },
      include: { employee: true, type: { include: { category: true } } }, orderBy: { createdAt: "desc" }, take: 200,
    }),
  ]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <SearchBar placeholder="Search by document or employee" className="flex-1 min-w-60" />
        <FilterDropdown param="category" label="Category" options={cats.map((c) => ({ value: c.id, label: c.name }))} />
        <FilterDropdown param="status" label="Status" options={["PENDING", "VERIFIED", "REJECTED", "ARCHIVED"].map((s) => ({ value: s, label: s[0] + s.slice(1).toLowerCase() }))} />
      </div>
      {docs.length === 0 ? <div className="card"><EmptyState icon={Search} title="No documents found" /></div> : (
        <TableWrap><table className="tbl"><thead><tr><th>Document</th><th>Employee</th><th>Category</th><th>Status</th><th>Version</th><th>Expiry</th><th>Uploaded</th><th /></tr></thead><tbody>
          {docs.map((d) => { const e = expiryState(d.expiryDate); return (
            <tr key={d.id}><td className="font-medium">{d.name}{d.visibility === "HR_ONLY" && <Badge className="ml-2">HR only</Badge>}</td><td><Link href={`/people/${d.employee.id}?tab=documents`} className="hover:text-brand whitespace-nowrap">{d.employee.firstName} {d.employee.lastName}</Link></td><td>{d.type.category.name}</td><td><StatusBadge status={d.status} /></td><td>v{d.currentVersion}</td><td>{d.expiryDate ? <Badge tone={e!.tone}>{fmtDate(d.expiryDate)}</Badge> : "—"}</td><td className="text-muted whitespace-nowrap">{fmtDate(d.createdAt)}</td><td className="text-right"><DocumentViewerButton documentId={d.id} label={d.name} /></td></tr>
          ); })}
        </tbody></table></TableWrap>
      )}
    </div>
  );
}
