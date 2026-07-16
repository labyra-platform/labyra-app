'use client';

/**
 * Dashboard-specific query helpers.
 *
 * Each hook returns aggregated data shaped for a specific UI element on
 * the overview dashboard. Built on useTenantCollection.
 */

import { useMemo } from 'react';
import { useTenantCollection } from '../use-tenant-collection';

/**
 * R506: normalise every timestamp shape this app stores into epoch ms.
 *
 * Collections disagree, and the disagreement is load-bearing: the Python
 * worker writes dftWorkflows.createdAt as a Firestore SERVER_TIMESTAMP (or an
 * ISO string from the driver path), while the TS app writes plain epoch-ms
 * numbers elsewhere. The worker's own `createdAtEpoch` is derived in memory
 * when IT reads a doc — it is never persisted, so a client reading Firestore
 * directly never sees it. R493 assumed epoch-ms everywhere and subtracted a
 * Timestamp object from Date.now(), which is what produced "19909 ngày trước".
 *
 * Accepts: Timestamp | {seconds,nanoseconds} | ISO string | epoch s | epoch ms.
 */
export function toMillis(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v <= 0) return null;
    // Seconds vs milliseconds: 1e12 ms is 2001, so anything smaller is seconds.
    return v < 1e12 ? v * 1000 : v;
  }
  if (typeof v === 'string') {
    const parsed = Date.parse(v);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof v === 'object') {
    const o = v as { toMillis?: () => number; seconds?: number; _seconds?: number };
    if (typeof o.toMillis === 'function') return o.toMillis();
    const secs = o.seconds ?? o._seconds;
    if (typeof secs === 'number') return secs * 1000;
  }
  return null;
}

// ─── KPI types ──────────────────────────────────────────────────────
export interface KpiSummary {
  totalExperiments: number;
  activeSamples: number;
  equipmentInUse: number;
  experimentsThisWeek: number;
  /** Papers between upload and indexed — see PAPER_IN_FLIGHT. */
  papersProcessing: number;
  isLoading: boolean;
}

// ─── Domain types (rough — refined in Phase 4 per-domain) ───────────
interface ExperimentDoc {
  title: string;
  workflowStatus: 'planned' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt?: number;
  startedAt?: { seconds: number; nanoseconds: number };
  completedAt?: { seconds: number; nanoseconds: number } | null;
  temperature_C?: number;
}

interface SampleDoc {
  code: string;
  materialId: string;
}

interface EquipmentDoc {
  name: string;
  type: 'microscopy' | 'spectroscopy' | 'analysis';
  status: 'available' | 'in-use' | 'maintenance';
}

/**
 * R533: the states a paper passes through between upload and usable.
 * `indexed` / `failed` / `cancelled` / `duplicate` are終 states — a paper there
 * is not being worked on. Everything else is in flight, which is what the strip
 * reports: "how many are still becoming answerable".
 */
const PAPER_IN_FLIGHT = new Set([
  'queued',
  'ocr',
  'chunking',
  'enriching',
  'embedding',
  'indexing',
  'extracting_citations',
  'cancelling'
]);

interface PaperStatusDoc {
  status?: string;
}

interface ChemicalDoc {
  name: string;
  ghsHazards?: string[]; // GHS pictogram codes
}

// ─── KPI hook — single query per collection, in-memory aggregation ──
export function useKpiSummary(): KpiSummary {
  const experiments = useTenantCollection<ExperimentDoc>({
    collection: 'experiments'
  });
  const samples = useTenantCollection<SampleDoc>({ collection: 'samples' });
  const equipment = useTenantCollection<EquipmentDoc>({
    collection: 'equipment'
  });
  const papers = useTenantCollection<PaperStatusDoc>({ collection: 'papers' });

  return useMemo(() => {
    const expData = experiments.data ?? [];
    const sampleData = samples.data ?? [];
    const eqData = equipment.data ?? [];
    const paperData = papers.data ?? [];

    // "This week" = startedAt within last 7 days
    const weekAgoSec = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

    return {
      totalExperiments: expData.length,
      activeSamples: sampleData.length,
      equipmentInUse: eqData.filter((d) => d.data.status === 'in-use').length,
      experimentsThisWeek: expData.filter(
        (d) => d.data.startedAt && d.data.startedAt.seconds >= weekAgoSec
      ).length,
      papersProcessing: paperData.filter((d) => PAPER_IN_FLIGHT.has(d.data.status ?? '')).length,
      isLoading:
        experiments.isLoading || samples.isLoading || equipment.isLoading || papers.isLoading
    };
  }, [
    experiments.data,
    experiments.isLoading,
    samples.data,
    samples.isLoading,
    equipment.data,
    equipment.isLoading,
    papers.data,
    papers.isLoading
  ]);
}

// ─── Bar chart: experiments by status ───────────────────────────────
// ─── R493: computation-first dashboard ───────────────────────────────

/** Mirrors what the Python worker actually writes (src/dft/io.py). */
interface DftWorkflowDoc {
  name?: string;
  overallStatus?: 'pending' | 'queued' | 'running' | 'completed' | 'failed';
  createdAt?: unknown; // SERVER_TIMESTAMP | ISO string — never plain epoch ms
  updatedAt?: unknown;
  createdByUid?: string;
  machinePreset?: string;
  structure?: { spaceGroup?: string };
  /** Scientific summary written on completion; scfGap lives HERE, not per-unit. */
  results?: { scfGap?: { gapEv?: number } };
  units?: { status?: string; calcType?: string }[];
}

export interface DftJobSummaryItem {
  id: string;
  name: string;
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed';
  /** Calculation type of the first unit (scf / vc-relax / …). */
  calc: string | null;
  /** Band gap (eV) from the workflow's results summary, when completed. */
  gapEv: number | null;
  /** Space group of the input structure (e.g. P6_3/mmc), when known. */
  spaceGroup: string | null;
  ownerUid: string | null;
  /** Compute preset the worker recorded (no invented "Lucia HPC" label). */
  machine: string | null;
  /** Epoch ms, normalised — null when the doc carries no usable timestamp. */
  updatedAt: number | null;
}

export interface DftSummary {
  counts: Record<'running' | 'queued' | 'completed' | 'failed', number>;
  completedThisWeek: number;
  latest: DftJobSummaryItem[];
  total: number;
  isLoading: boolean;
}

/** dftWorkflows roll-up (TanStack, 30s stale + refetch-on-focus): status counts + recent jobs. */
export function useDftSummary(latestCount = 3): DftSummary {
  const { data, isLoading } = useTenantCollection<DftWorkflowDoc>({
    collection: 'dftWorkflows'
  });

  return useMemo(() => {
    const rows = (data ?? []).map((d) => {
      const ts = toMillis(d.data.updatedAt) ?? toMillis(d.data.createdAt);
      return { id: d.id, ts, ...d.data };
    });
    const counts = { running: 0, queued: 0, completed: 0, failed: 0 };
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let completedThisWeek = 0;
    for (const r of rows) {
      const s = r.overallStatus ?? 'pending';
      if (s === 'pending' || s === 'queued') counts.queued += 1;
      else if (s in counts) counts[s as keyof typeof counts] += 1;
      if (s === 'completed' && r.ts !== null && r.ts >= weekAgo) completedThisWeek += 1;
    }
    const latest: DftJobSummaryItem[] = rows
      .toSorted((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
      .slice(0, latestCount)
      .map((r) => ({
        id: r.id,
        name: r.name ?? r.id,
        status: (r.overallStatus ?? 'pending') as DftJobSummaryItem['status'],
        // calcType is the worker's source of truth for the unit's calculation.
        calc: r.units?.[0]?.calcType ?? null,
        gapEv: r.results?.scfGap?.gapEv ?? null,
        spaceGroup: r.structure?.spaceGroup ?? null,
        ownerUid: r.createdByUid ?? null,
        machine: r.machinePreset ?? null,
        updatedAt: r.ts
      }));
    return { counts, completedThisWeek, latest, total: rows.length, isLoading };
  }, [data, isLoading, latestCount]);
}

interface BookingDoc {
  equipmentName?: string;
  title?: string;
  purpose?: string;
  userId?: string;
  startAt?: number;
  endAt?: number;
  status?: string;
}

// ─── R506: attention feed ───────────────────────────────────────────

interface AttentionChemicalDoc {
  name: string;
  quantity?: number;
  unit?: string;
  reorderThreshold?: number;
  expiryAt?: number;
  lotNumber?: string;
}

export type AttentionKind = 'dft_failed' | 'chemical_low' | 'chemical_expiring';

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  /** Headline — already carries the subject, no prefix needed. */
  title: string;
  /** Supporting facts (timestamp, lot, remaining amount). */
  detail: string;
  href: string;
  at: number | null;
  severity: 'danger' | 'warning';
}

const EXPIRY_WINDOW_DAYS = 30;

/**
 * The one card that earns its place at the top: things that are already wrong
 * or about to be. Everything here is derived from data the lab already stores —
 * a failed run, stock under its own reorder threshold, a lot approaching its
 * expiry date. Sorted by severity, then recency.
 */
export function useAttentionItems(locale: string): { items: AttentionItem[]; isLoading: boolean } {
  const dft = useDftSummary(50);
  const { data: chemicals, isLoading: chemLoading } = useTenantCollection<AttentionChemicalDoc>({
    collection: 'chemicals'
  });

  return useMemo(() => {
    const items: AttentionItem[] = [];
    const now = Date.now();

    for (const job of dft.latest) {
      if (job.status !== 'failed') continue;
      items.push({
        id: `dft:${job.id}`,
        kind: 'dft_failed',
        title: job.name,
        detail: [job.calc, job.machine].filter(Boolean).join(' · '),
        href: `/${locale}/dashboard/computation?id=${job.id}`,
        at: job.updatedAt,
        severity: 'danger'
      });
    }

    for (const c of chemicals ?? []) {
      const d = c.data;
      const threshold = d.reorderThreshold;
      if (threshold != null && (d.quantity ?? 0) <= threshold) {
        items.push({
          id: `low:${c.id}`,
          kind: 'chemical_low',
          title: d.name,
          detail: `${d.quantity ?? 0} ${d.unit ?? ''} / ${threshold} ${d.unit ?? ''}`.trim(),
          href: `/${locale}/dashboard/chemicals/${c.id}`,
          at: null,
          severity: 'warning'
        });
      }
      const expiry = toMillis(d.expiryAt);
      if (expiry != null && expiry - now <= EXPIRY_WINDOW_DAYS * 86_400_000) {
        items.push({
          id: `exp:${c.id}`,
          kind: 'chemical_expiring',
          title: d.name,
          detail: [
            new Date(expiry).toLocaleDateString(locale),
            d.lotNumber ? `#${d.lotNumber}` : null
          ]
            .filter(Boolean)
            .join(' · '),
          href: `/${locale}/dashboard/chemicals/${c.id}`,
          at: expiry,
          severity: expiry <= now ? 'danger' : 'warning'
        });
      }
    }

    const rank = { danger: 0, warning: 1 };
    items.sort((a, b) =>
      rank[a.severity] !== rank[b.severity]
        ? rank[a.severity] - rank[b.severity]
        : (b.at ?? 0) - (a.at ?? 0)
    );
    return { items, isLoading: dft.isLoading || chemLoading };
  }, [dft.latest, dft.isLoading, chemicals, chemLoading, locale]);
}

// ─── R507: today's equipment schedule ───────────────────────────────

/** Who owns a booking, relative to the person looking at the board. */
export type BookingOwner = 'self' | 'group' | 'other';

export interface ScheduledBooking {
  id: string;
  equipmentName: string;
  purpose: string;
  startAt: number;
  endAt: number;
  owner: BookingOwner;
  /** True when the booking runs past midnight — the bar is clipped, not short. */
  continuesTomorrow: boolean;
}

export interface DaySchedule {
  /** Equipment that has at least one booking today, in name order. */
  rows: { equipmentName: string; bookings: ScheduledBooking[] }[];
  totalEquipment: number;
  isLoading: boolean;
}

/**
 * Bookings overlapping today, grouped per instrument.
 *
 * Ownership is resolved against the viewer: their own booking, someone in
 * their group, or another group. Equipment is a shared lab resource, so the
 * board deliberately shows every group's bookings — but "who do I ask to swap
 * a slot" is a different question from "is this mine", and the three-way split
 * is what answers it.
 */
export function useTodaySchedule(
  myUid: string | null | undefined,
  groupUids: ReadonlySet<string>
): DaySchedule {
  const { data, isLoading } = useTenantCollection<BookingDoc>({ collection: 'bookings' });
  const { data: equipment } = useTenantCollection<EquipmentDoc>({ collection: 'equipment' });

  return useMemo(() => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const start = dayStart.getTime();
    const end = start + 86_400_000;

    const byEquipment = new Map<string, ScheduledBooking[]>();
    for (const d of data ?? []) {
      const b = d.data;
      const s = toMillis(b.startAt);
      const e = toMillis(b.endAt);
      if (s === null || e === null) continue;
      if (b.status === 'cancelled' || s >= end || e <= start) continue;

      const owner: BookingOwner =
        b.userId && b.userId === myUid
          ? 'self'
          : b.userId && groupUids.has(b.userId)
            ? 'group'
            : 'other';
      const name = b.equipmentName || b.title || '—';
      const list = byEquipment.get(name) ?? [];
      list.push({
        id: d.id,
        equipmentName: name,
        purpose: b.purpose ?? '',
        startAt: s,
        endAt: e,
        owner,
        continuesTomorrow: e > end
      });
      byEquipment.set(name, list);
    }

    const rows = [...byEquipment.entries()]
      .map(([equipmentName, bookings]) => ({
        equipmentName,
        bookings: bookings.toSorted((a, b) => a.startAt - b.startAt)
      }))
      .toSorted((a, b) => a.equipmentName.localeCompare(b.equipmentName));

    return { rows, totalEquipment: (equipment ?? []).length, isLoading };
  }, [data, equipment, isLoading, myUid, groupUids]);
}

// ─── R507: 30-day activity ──────────────────────────────────────────

export interface ActivityDay {
  day: string; // 'DD/MM'
  /** R535: the real day, as yyyy-mm-dd. A heatmap has to know which weekday a
   *  cell is and which week it belongs to, and 'DD/MM' cannot answer either
   *  without being parsed back into the thing it was formatted from. */
  iso: string;
  experiments: number;
  dft: number;
  samples: number;
}

/**
 * Per-day counts of the three things a lab produces.
 *
 * R546: `endMs` moves the window. It used to end today, always, which is fine
 * for a card that only ever shows "recently" and useless for one you can pan.
 * Passing the end as a timestamp rather than a Date keeps the memo honest — a
 * fresh Date object every render is a new dependency every render.
 */
export function useActivityDaily(
  days = 30,
  endMs?: number
): { data: ActivityDay[]; isLoading: boolean } {
  const experiments = useTenantCollection<ExperimentDoc>({ collection: 'experiments' });
  const samples = useTenantCollection<{ createdAt?: unknown }>({ collection: 'samples' });
  const dft = useTenantCollection<DftWorkflowDoc>({ collection: 'dftWorkflows' });

  return useMemo(() => {
    const dayStart = endMs === undefined ? new Date() : new Date(endMs);
    dayStart.setHours(0, 0, 0, 0);
    const buckets = new Map<string, ActivityDay>();
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(dayStart);
      d.setDate(d.getDate() - i);
      buckets.set(d.toDateString(), {
        day: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        // Local calendar date, not toISOString(): that converts to UTC first,
        // and GMT+7 is ahead of UTC, so anything logged before 07:00 local
        // resolves to the previous UTC day and would be painted on yesterday's
        // cell. Verified in TZ=Asia/Ho_Chi_Minh — 06:00 on the 16th comes back
        // as the 15th; 08:00 does not.
        iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        experiments: 0,
        dft: 0,
        samples: 0
      });
    }
    const cutoff = dayStart.getTime() - (days - 1) * 86_400_000;

    // 'day' and 'iso' are labels, not tallies — Omit both, or `field` admits a
    // string into `+= 1`. tsc caught this the moment `iso` was added.
    const tally = (ms: number | null, field: keyof Omit<ActivityDay, 'day' | 'iso'>) => {
      if (ms === null || ms < cutoff) return;
      const bucket = buckets.get(new Date(ms).toDateString());
      if (bucket) bucket[field] += 1;
    };

    for (const e of experiments.data ?? []) {
      tally(toMillis(e.data.startedAt) ?? toMillis(e.data.createdAt), 'experiments');
    }
    for (const s of samples.data ?? []) tally(toMillis(s.data.createdAt), 'samples');
    for (const w of dft.data ?? []) tally(toMillis(w.data.createdAt), 'dft');

    return {
      data: [...buckets.values()],
      isLoading: experiments.isLoading || samples.isLoading || dft.isLoading
    };
  }, [
    experiments.data,
    experiments.isLoading,
    samples.data,
    samples.isLoading,
    dft.data,
    dft.isLoading,
    days,
    endMs
  ]);
}

// ─── R507: GHS exposure ─────────────────────────────────────────────

export interface GhsBucket {
  code: string;
  count: number;
}

/** How many chemicals in the lab carry each GHS pictogram. */
export function useGhsSummary(): {
  buckets: GhsBucket[];
  totalHazardous: number;
  isLoading: boolean;
} {
  const { data, isLoading } = useTenantCollection<ChemicalDoc>({ collection: 'chemicals' });
  return useMemo(() => {
    const counts = new Map<string, number>();
    let totalHazardous = 0;
    for (const c of data ?? []) {
      const codes = c.data.ghsHazards ?? [];
      if (codes.length > 0) totalHazardous += 1;
      for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return {
      buckets: [...counts.entries()].map(([code, count]) => ({ code, count })),
      totalHazardous,
      isLoading
    };
  }, [data, isLoading]);
}
