"use client";
import { useMemo, useState } from "react";
import { ActionForm, Input, Select, Textarea, Submit, FormActions, Grid } from "@/components/ui/form";
import { FileUploader } from "@/components/ui/file-uploader";
import { applyLeave } from "@/server/leave";

type LT = { id: string; name: string; available: number; allowHalfDay: boolean; allowNegative: boolean; docAfter: number | null; code: string };

export function ApplyLeaveForm({ types, holidays, weeklyOffs, employeeId, today }: { types: LT[]; holidays: string[]; weeklyOffs: number[]; employeeId?: string; today: string }) {
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [half, setHalf] = useState("NONE");
  const t = types.find((x) => x.id === typeId);
  const single = start && (!end || end === start);
  const days = useMemo(() => {
    if (!start) return 0;
    if (half !== "NONE" && single) return 0.5;
    const s = new Date(`${start}T00:00:00Z`), e = new Date(`${end || start}T00:00:00Z`);
    let n = 0;
    for (let d = s; d <= e; d = new Date(d.getTime() + 86400000)) if (!weeklyOffs.includes(d.getUTCDay()) && !holidays.includes(d.toISOString().slice(0, 10))) n++;
    return n;
  }, [start, end, half, single, holidays, weeklyOffs]);
  const over = t && !t.allowNegative && days > t.available;
  return (
    <ActionForm action={applyLeave} success="Leave applied">
      {employeeId && <input type="hidden" name="employeeId" value={employeeId} />}
      <Select label="Leave type" name="leaveTypeId" value={typeId} onChange={(e) => setTypeId(e.target.value)} options={types.map((x) => ({ value: x.id, label: `${x.name} — ${x.allowNegative ? "no limit" : `${x.available} left`}` }))} />
      <Grid>
        <Input label="From" name="startDate" type="date" required min={today} value={start} onChange={(e) => { setStart(e.target.value); if (!end || end < e.target.value) setEnd(e.target.value); }} />
        <Input label="To" name="endDate" type="date" required min={start || today} value={end} onChange={(e) => setEnd(e.target.value)} />
      </Grid>
      {t?.allowHalfDay && single && (
        <fieldset><legend className="label">Duration</legend>
          <div className="flex flex-wrap gap-2">
            {[["NONE", "Full day"], ["FIRST_HALF", "First half"], ["SECOND_HALF", "Second half"]].map(([v, l]) => (
              <label key={v} className={`cursor-pointer rounded-ctl border px-3 py-2 text-[13px] ${half === v ? "border-brand-2 bg-brand-50 text-brand" : "border-line-2"}`}><input type="radio" name="halfDay" value={v} checked={half === v} onChange={() => setHalf(v)} className="sr-only" />{l}</label>
            ))}
          </div>
        </fieldset>
      )}
      {!(t?.allowHalfDay && single) && <input type="hidden" name="halfDay" value="NONE" />}
      {start && (
        <div className={`rounded-ctl px-3.5 py-2.5 text-[13px] ${over ? "bg-bad-bg text-bad" : "bg-soft text-ink-2"}`}>
          {days === 0 ? "These dates are holidays or weekly offs." : <>That&apos;s <strong>{days} working day{days === 1 ? "" : "s"}</strong>{t && !t.allowNegative ? ` · ${Math.max(0, t.available - days)} left after this` : ""}{over ? " — not enough balance" : ""}.</>}
        </div>
      )}
      <Textarea label="Reason" name="reason" required placeholder="A line is enough — e.g. family wedding in Jaipur" />
      {t?.docAfter != null && days > (t.docAfter ?? 0) ? <FileUploader name="attachment" label="Supporting document" required hint={`Needed for more than ${t.docAfter} days`} /> : <FileUploader name="attachment" label="Attachment (optional)" />}
      <FormActions><Submit>Apply for leave</Submit></FormActions>
    </ActionForm>
  );
}
