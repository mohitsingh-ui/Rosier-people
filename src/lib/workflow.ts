import "server-only";
import { db } from "@/lib/db";

// Minimal workflow engine. Each business event runs an ordered list of named steps.
// Steps can be switched off from Settings → Workflows (stored in settings table)
// so flows become configurable without code changes.

export type WorkflowStep<P> = { id: string; label: string; run: (payload: P) => Promise<void> };
type Registry = Map<string, { label: string; steps: WorkflowStep<never>[] }>;

const g = globalThis as unknown as { __workflows?: Registry };
const registry: Registry = (g.__workflows ??= new Map());

export function defineWorkflow<P>(event: string, label: string, steps: WorkflowStep<P>[]) {
  registry.set(event, { label, steps: steps as WorkflowStep<never>[] });
}

export async function disabledSteps(): Promise<Set<string>> {
  const s = await db.setting.findUnique({ where: { key: "workflow.disabledSteps" } });
  return new Set((s?.value as string[] | undefined) ?? []);
}

export async function emit<P>(event: string, payload: P) {
  const wf = registry.get(event);
  if (!wf) return;
  const disabled = await disabledSteps();
  for (const step of wf.steps) {
    if (disabled.has(`${event}:${step.id}`)) continue;
    try {
      await (step as WorkflowStep<P>).run(payload);
    } catch (e) {
      console.error(`[workflow] ${event}:${step.id} failed`, e);
    }
  }
}

export function listWorkflows() {
  return [...registry.entries()].map(([event, wf]) => ({ event, label: wf.label, steps: wf.steps.map((s) => ({ id: s.id, label: s.label })) }));
}
