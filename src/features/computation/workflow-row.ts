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
  DftWorkflowGlobal
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
  status: StatusKind;
  steps: StepDot[];
  result: ResultCell;
}

/** "PBE+U" when a Hubbard manifold is set, else the bare functional. */
export function methodLabel(g: DftWorkflowGlobal | undefined): string {
  const func = (g?.functional ?? 'pbe').toUpperCase();
  const hasU = (g?.hubbard?.length ?? 0) > 0;
  return hasU ? `${func}+U` : func;
}

/** Per-step wall-clock seconds from the snapshot timestamps; null if unknown. */
function stepDuration(s: DftUnitSnapshot | undefined): number | null {
  if (!s || s.startedAt == null || s.finishedAt == null) return null;
  const d = s.finishedAt - s.startedAt;
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
  return units
    .map((u, i) => ({ u, key: u.order ?? i + 1 }))
    .toSorted((a, b) => a.key - b.key)
    .map((x) => x.u);
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
  return {
    id: wf.id,
    name: wf.global?.prefix ?? wf.id,
    method: methodLabel(wf.global),
    status,
    steps,
    result: deriveResult(wf, status)
  };
}
