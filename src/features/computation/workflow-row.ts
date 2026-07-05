/**
 * Computation list view-model — derives a flat, serializable row from a
 * DftWorkflow for the table/list UI. Pure (no React, no `server-only`) so it
 * runs in the Server Component page and is unit-testable.
 *
 * Honesty contract (Trust > Coverage): every field maps to data the worker
 * actually persists. The doc has no `resource`, run duration, live SCF-iteration
 * count, or `createdAt`, so the row deliberately omits a Resource column, an
 * ETA, and a recency sort — rendering those would mean fabricating numbers.
 * Add them only after the worker writes them to the document.
 *
 * @phase R301-computation-list
 */
import type {
  DftUnit,
  DftUnitSnapshot,
  DftUnitStatus,
  DftWorkflow,
  DftWorkflowGlobal,
  HubbardParam
} from '@/types/dft';

export type StatusKind = 'completed' | 'running' | 'failed' | 'queued' | 'pending';

export interface StepDot {
  id: string;
  /** Short calc label, e.g. 'vc-relax' | 'scf' | 'bands'. */
  label: string;
  status: DftUnitStatus | undefined;
  /** Wall-clock seconds for this step (finishedAt − startedAt); null if unknown. */
  durationSec: number | null;
}

export type ResultCell =
  | { kind: 'done'; gapEv: number | null; direct: boolean | null; energyRy: number | null }
  | { kind: 'failed'; reason: string | null }
  | { kind: 'running'; unit: string | null }
  | { kind: 'pending' };

export interface WorkflowRow {
  id: string;
  name: string;
  method: string;
  /** Hubbard U per manifold — distinguishes runs in a U sweep. */
  hubbard: HubbardParam[];
  status: StatusKind;
  steps: StepDot[];
  result: ResultCell;
  /** Submit time (epoch ms) and who launched it. */
  createdAt: number | null;
  createdBy: string | null;
  /** Sum of known per-step durations (s); null if none are known yet. */
  totalDurationSec: number | null;
}

/** "PBE+U" when a Hubbard manifold is set, else the bare functional. */
export function methodLabel(g: DftWorkflowGlobal | undefined): string {
  const func = (g?.functional ?? 'pbe').toUpperCase();
  const hasU = (g?.hubbard?.length ?? 0) > 0;
  return hasU ? `${func}+U` : func;
}

/** Per-step wall-clock seconds from the snapshot timestamps; null if unknown.
 * startedAt is often absent (the worker only sets it on a RUNNING event, which
 * Batch doesn't always deliver), so fall back to queuedAt as the start marker. */
function stepDuration(s: DftUnitSnapshot | undefined): number | null {
  if (!s || s.finishedAt == null) return null;
  const start = s.startedAt ?? s.queuedAt;
  if (start == null) return null;
  const d = s.finishedAt - start;
  return d >= 0 ? d : null;
}

/** Total wall-clock for the whole workflow = last unit's finish minus the first
 * unit's start (or queue), which reflects real elapsed time better than summing
 * per-unit durations (units run sequentially on separate VMs). */
function workflowWallSeconds(snaps: (DftUnitSnapshot | undefined)[]): number | null {
  const starts = snaps
    .map((s) => s?.startedAt ?? s?.queuedAt)
    .filter((v): v is number => v != null);
  const ends = snaps.map((s) => s?.finishedAt).filter((v): v is number => v != null);
  if (starts.length === 0 || ends.length === 0) return null;
  const d = Math.max(...ends) - Math.min(...starts);
  return d >= 0 ? d : null;
}

/** Compact duration: "45s", "2m13s", "1h04m". null/negative → null. */
export function formatDuration(sec: number | null | undefined): string | null {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return null;
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs ? `${m}m${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h${String(rm).padStart(2, '0')}m` : `${h}h`;
}

function orderedUnits(units: DftUnit[]): DftUnit[] {
  // Topological order over dependsOn edges so the pipeline always reads in DAG
  // sequence (vc-relax → scf → nscf → bands/dos → …), tie-broken by an explicit
  // `order` field (else composition index). Falls back to the tie-break key alone
  // if a cycle or dangling dependency would otherwise stall the sort.
  const key = new Map(units.map((u, i) => [u.id, u.order ?? i + 1]));
  const byId = new Map(units.map((u) => [u.id, u]));
  const placed = new Set<string>();
  const out: DftUnit[] = [];
  const remaining = [...units];
  while (remaining.length > 0) {
    const ready = remaining.filter((u) =>
      (u.dependsOn ?? []).every((d) => !byId.has(d) || placed.has(d))
    );
    const batch = (ready.length > 0 ? ready : remaining).toSorted(
      (a, b) => (key.get(a.id) ?? 0) - (key.get(b.id) ?? 0)
    );
    const next = batch[0];
    out.push(next);
    placed.add(next.id);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return out;
}

/** Roll the units' snapshot statuses into a single workflow status. */
function deriveStatus(wf: DftWorkflow): StatusKind {
  if (wf.overallStatus) return wf.overallStatus;
  const statuses = (wf.units ?? []).map((u) => wf.snapshot?.[u.id]?.status);
  if (statuses.some((s) => s === 'failed')) return 'failed';
  if (statuses.some((s) => s === 'running')) return 'running';
  if (statuses.some((s) => s === 'queued')) return 'queued';
  if (statuses.length > 0 && statuses.every((s) => s === 'completed')) return 'completed';
  return 'pending';
}

function deriveResult(wf: DftWorkflow, status: StatusKind): ResultCell {
  const r = wf.results;
  if (status === 'failed') {
    const failed = (wf.units ?? []).find((u) => wf.snapshot?.[u.id]?.status === 'failed');
    const snap = failed ? wf.snapshot?.[failed.id] : undefined;
    return { kind: 'failed', reason: snap?.errorMessage ?? snap?.error ?? null };
  }
  if (status === 'running' || status === 'queued') {
    const active = (wf.units ?? []).find((u) => wf.snapshot?.[u.id]?.status === 'running');
    return { kind: 'running', unit: active?.calcType ?? null };
  }
  if (status === 'completed') {
    // Completed but the worker may not have parsed results yet → null metrics,
    // rendered as a muted note (never "Results pending", which is the wrong state).
    return {
      kind: 'done',
      gapEv: r?.bandGap?.band_gap_ev ?? r?.scfGap?.gapEv ?? null,
      direct: r?.bandGap?.direct ?? null,
      energyRy: typeof r?.totalEnergyRy === 'number' ? r.totalEnergyRy : null
    };
  }
  return { kind: 'pending' };
}

export function toWorkflowRow(wf: DftWorkflow): WorkflowRow {
  const status = deriveStatus(wf);
  const steps: StepDot[] = orderedUnits(wf.units ?? []).map((u) => {
    const snap = wf.snapshot?.[u.id];
    return {
      id: u.id,
      label: u.calcType,
      status: snap?.status,
      durationSec: stepDuration(snap)
    };
  });
  const totalDurationSec = workflowWallSeconds((wf.units ?? []).map((u) => wf.snapshot?.[u.id]));
  return {
    id: wf.id,
    name: wf.global?.prefix ?? wf.id,
    method: methodLabel(wf.global),
    hubbard: wf.global?.hubbard ?? [],
    status,
    steps,
    result: deriveResult(wf, status),
    createdAt: wf.createdAt ?? null,
    createdBy: wf.createdBy ?? null,
    totalDurationSec
  };
}
