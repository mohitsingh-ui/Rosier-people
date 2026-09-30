"use client";
import { useState } from "react";
import { Star } from "lucide-react";
import { ActionForm, Input, Select, Textarea, Submit, FormActions, Grid, Checkbox } from "@/components/ui/form";
import { saveCycle, submitSelfReview, submitManagerReview, giveFeedback, saveGoal, updateGoalProgress, addMilestone } from "@/server/performance";
import { cn } from "@/lib/utils";

type Opt = { value: string; label: string };

function RatingInput({ name, label, defaultValue }: { name: string; label: string; defaultValue?: number | null }) {
  const [v, setV] = useState(defaultValue ?? 0);
  const words = ["", "Needs improvement", "Below expectations", "Meets expectations", "Exceeds expectations", "Outstanding"];
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <input type="hidden" name={name} value={v || ""} />
      <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={v === n} aria-label={`${n} — ${words[n]}`} onClick={() => setV(n)} className="p-1 rounded hover:bg-brand-50">
            <Star className={cn("size-6", n <= v ? "fill-brand-2 text-brand-2" : "text-line-2")} />
          </button>
        ))}
        <span className="ml-2 text-[13px] text-muted">{words[v]}</span>
      </div>
    </fieldset>
  );
}

export function SelfReviewForm({ id }: { id: string }) {
  return (
    <ActionForm action={submitSelfReview} success="Self review submitted">
      <input type="hidden" name="id" value={id} />
      <RatingInput name="selfRating" label="How would you rate this period?" />
      <Textarea label="How did it go?" name="selfComments" required rows={5} placeholder="What you owned, what moved, what you'd do differently" />
      <Textarea label="Key achievements" name="achievements" rows={4} placeholder="Launches, numbers, things you're proud of" />
      <FormActions><Submit>Submit to manager</Submit></FormActions>
    </ActionForm>
  );
}

export function ManagerReviewForm({ id, defaults }: { id: string; defaults?: { managerRating: number | null; managerComments: string | null; developmentAreas: string | null; finalRating: number | null } }) {
  return (
    <ActionForm action={submitManagerReview} success="Review completed">
      <input type="hidden" name="id" value={id} />
      <RatingInput name="managerRating" label="Your rating" defaultValue={defaults?.managerRating} />
      <Textarea label="Feedback" name="managerComments" defaultValue={defaults?.managerComments ?? ""} required rows={5} placeholder="Be specific — what worked, with examples" />
      <Textarea label="Development areas" name="developmentAreas" defaultValue={defaults?.developmentAreas ?? ""} rows={3} />
      <RatingInput name="finalRating" label="Final rating (after calibration)" defaultValue={defaults?.finalRating} />
      <FormActions><Submit>Complete review</Submit></FormActions>
    </ActionForm>
  );
}

export function FeedbackForm({ people, isManagerOf }: { people: Opt[]; isManagerOf: string[] }) {
  const [to, setTo] = useState("");
  return (
    <ActionForm action={giveFeedback} success="Feedback sent">
      <Select label="To" name="toId" options={people} value={to} onChange={(e) => setTo(e.target.value)} required placeholder="Choose a colleague" />
      <Select label="Type" name="kind" options={[{ value: "PRAISE", label: "Praise — shown on their profile" }, { value: "CONSTRUCTIVE", label: "Constructive — private" }, ...(isManagerOf.includes(to) ? [{ value: "MANAGER", label: "Manager feedback — private" }] : [])]} />
      <Textarea label="Message" name="body" required rows={4} />
      <Checkbox label="Keep private (only them, their manager and HR)" name="isPrivate" />
      <FormActions><Submit>Send feedback</Submit></FormActions>
    </ActionForm>
  );
}

export function CycleForm({ c }: { c?: { id: string; name: string; startDate: string; endDate: string; selfReviewDue: string | null; managerReviewDue: string | null } }) {
  return (
    <ActionForm action={saveCycle} success="Cycle saved">
      {c && <input type="hidden" name="id" value={c.id} />}
      <Input label="Name" name="name" defaultValue={c?.name} required placeholder="e.g. H2 FY26-27 (Oct–Mar)" />
      <Grid>
        <Input label="Starts" name="startDate" type="date" defaultValue={c?.startDate} required /><Input label="Ends" name="endDate" type="date" defaultValue={c?.endDate} required />
        <Input label="Self review due" name="selfReviewDue" type="date" defaultValue={c?.selfReviewDue ?? ""} /><Input label="Manager review due" name="managerReviewDue" type="date" defaultValue={c?.managerReviewDue ?? ""} />
      </Grid>
      <FormActions><Submit>Save cycle</Submit></FormActions>
    </ActionForm>
  );
}

export function GoalForm({ owners, cycles, g, defaultOwner, today }: { owners: Opt[]; cycles: Opt[]; defaultOwner?: string; today: string; g?: { id: string; ownerId: string; title: string; description: string | null; kind: string; period: string; priority: string; startDate: string; endDate: string; cycleId: string | null } }) {
  return (
    <ActionForm action={saveGoal} success="Goal saved">
      {g && <input type="hidden" name="id" value={g.id} />}
      {owners.length > 1 ? <Select label="Owner" name="ownerId" options={owners} defaultValue={g?.ownerId ?? defaultOwner} required /> : <input type="hidden" name="ownerId" value={g?.ownerId ?? defaultOwner ?? owners[0]?.value} />}
      <Input label="Goal" name="title" defaultValue={g?.title} required placeholder="Make it measurable — e.g. Grow Zepto GMV 25% QoQ" />
      <Textarea label="Details" name="description" defaultValue={g?.description ?? ""} />
      <Grid cols={3}>
        <Select label="Type" name="kind" defaultValue={g?.kind ?? "INDIVIDUAL"} options={[{ value: "INDIVIDUAL", label: "Individual" }, { value: "TEAM", label: "Team" }, { value: "KPI", label: "KPI" }, { value: "COMPANY", label: "Company" }]} />
        <Select label="Period" name="period" defaultValue={g?.period ?? "QUARTERLY"} options={[{ value: "QUARTERLY", label: "Quarterly" }, { value: "ANNUAL", label: "Annual" }]} />
        <Select label="Priority" name="priority" defaultValue={g?.priority ?? "MEDIUM"} options={[{ value: "HIGH", label: "High" }, { value: "MEDIUM", label: "Medium" }, { value: "LOW", label: "Low" }]} />
      </Grid>
      <Grid cols={3}>
        <Input label="Start" name="startDate" type="date" defaultValue={g?.startDate ?? today} required />
        <Input label="End" name="endDate" type="date" defaultValue={g?.endDate} required />
        <Select label="Performance cycle" name="cycleId" defaultValue={g?.cycleId ?? ""} options={cycles} placeholder="None" />
      </Grid>
      {!g && <Textarea label="Milestones" name="milestones" placeholder={"One per line\nBrief agreed\nFirst version live\nReview results"} rows={4} />}
      <FormActions><Submit>Save goal</Submit></FormActions>
    </ActionForm>
  );
}

export function ProgressForm({ id, progress, status }: { id: string; progress: number; status: string }) {
  const [p, setP] = useState(progress);
  return (
    <ActionForm action={updateGoalProgress} success="Progress updated" reset={false}>
      <input type="hidden" name="id" value={id} />
      <div><label className="label" htmlFor="progress">Progress — {p}%</label><input id="progress" name="progress" type="range" min={0} max={100} step={5} value={p} onChange={(e) => setP(Number(e.target.value))} className="w-full accent-[#A56312]" /></div>
      <Select label="Status" name="status" defaultValue={status} options={["NOT_STARTED", "IN_PROGRESS", "AT_RISK", "COMPLETED", "CANCELLED"].map((s) => ({ value: s, label: s[0] + s.slice(1).toLowerCase().replace("_", " ") }))} />
      <Textarea label="Update or comment" name="comment" placeholder="What changed since last time?" />
      <FormActions><Submit>Post update</Submit></FormActions>
    </ActionForm>
  );
}

export function CommentForm({ id }: { id: string }) {
  return (
    <ActionForm action={updateGoalProgress} success="Comment added">
      <input type="hidden" name="id" value={id} />
      <Textarea label="Comment" name="comment" required rows={2} placeholder="Add a note or feedback" />
      <FormActions><Submit size="sm">Comment</Submit></FormActions>
    </ActionForm>
  );
}

export function MilestoneForm({ goalId }: { goalId: string }) {
  return (
    <ActionForm action={addMilestone} success="Milestone added" className="flex gap-2 items-end space-y-0">
      <input type="hidden" name="goalId" value={goalId} />
      <Input label="New milestone" name="title" required wrapClass="flex-1" />
      <Input label="Due" name="dueDate" type="date" wrapClass="w-40" />
      <Submit size="md" variant="secondary">Add</Submit>
    </ActionForm>
  );
}
