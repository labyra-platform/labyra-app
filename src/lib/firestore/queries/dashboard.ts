'use client';

/**
 * Dashboard-specific query helpers.
 *
 * Each hook returns aggregated data shaped for a specific UI element on
 * the overview dashboard. Built on useTenantCollection.
 */

import { limit as fsLimit, orderBy } from 'firebase/firestore';
import { useMemo } from 'react';
import { useTenantCollection } from '../use-tenant-collection';

// ─── KPI types ──────────────────────────────────────────────────────
export interface KpiSummary {
  totalExperiments: number;
  activeSamples: number;
  equipmentInUse: number;
  experimentsThisWeek: number;
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

  return useMemo(() => {
    const expData = experiments.data ?? [];
    const sampleData = samples.data ?? [];
    const eqData = equipment.data ?? [];

    // "This week" = startedAt within last 7 days
    const weekAgoSec = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

    return {
      totalExperiments: expData.length,
      activeSamples: sampleData.length,
      equipmentInUse: eqData.filter((d) => d.data.status === 'in-use').length,
      experimentsThisWeek: expData.filter(
        (d) => d.data.startedAt && d.data.startedAt.seconds >= weekAgoSec
      ).length,
      isLoading: experiments.isLoading || samples.isLoading || equipment.isLoading
    };
  }, [
    experiments.data,
    experiments.isLoading,
    samples.data,
    samples.isLoading,
    equipment.data,
    equipment.isLoading
  ]);
}

// ─── Bar chart: experiments by status ───────────────────────────────
export interface ExperimentStatusBucket {
  status: string;
  count: number;
}

export function useExperimentsByStatus(): {
  data: ExperimentStatusBucket[];
  isLoading: boolean;
} {
  const { data, isLoading } = useTenantCollection<ExperimentDoc>({
    collection: 'experiments'
  });

  const buckets = useMemo<ExperimentStatusBucket[]>(() => {
    if (!data) return [];
    const counts: Record<string, number> = {
      planned: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    };
    for (const doc of data) {
      const status = doc.data.workflowStatus;
      if (status && status in counts) counts[status]++;
    }
    return [
      { status: 'Planned', count: counts.planned },
      { status: 'Running', count: counts.running },
      { status: 'Completed', count: counts.completed },
      { status: 'Failed', count: counts.failed },
      { status: 'Cancelled', count: counts.cancelled }
    ];
  }, [data]);

  return { data: buckets, isLoading };
}

// ─── Area chart: chemicals by hazard ────────────────────────────────
export interface ChemicalHazardBucket {
  hazard: string;
  count: number;
}

const GHS_SHORT: Record<string, string> = {
  GHS01: 'Explosive',
  GHS02: 'Flammable',
  GHS03: 'Oxidizing',
  GHS04: 'Gas',
  GHS05: 'Corrosive',
  GHS06: 'Toxic',
  GHS07: 'Irritant',
  GHS08: 'Health',
  GHS09: 'Environ.'
};

export function useChemicalsByHazard(): {
  data: ChemicalHazardBucket[];
  isLoading: boolean;
} {
  const { data, isLoading } = useTenantCollection<ChemicalDoc>({
    collection: 'chemicals'
  });

  const buckets = useMemo<ChemicalHazardBucket[]>(() => {
    if (!data) return [];
    const counts: Record<string, number> = {};
    for (const doc of data) {
      for (const code of doc.data.ghsHazards ?? []) {
        counts[code] = (counts[code] ?? 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([code, count]) => ({ hazard: GHS_SHORT[code] ?? code, count }))
      .toSorted((a, b) => b.count - a.count);
  }, [data]);

  return { data: buckets, isLoading };
}

// ─── Pie chart: equipment by type ───────────────────────────────────
export interface EquipmentTypeBucket {
  type: string;
  count: number;
  fill: string;
}

export function useEquipmentByType(): {
  data: EquipmentTypeBucket[];
  isLoading: boolean;
} {
  const { data, isLoading } = useTenantCollection<EquipmentDoc>({
    collection: 'equipment'
  });

  const buckets = useMemo<EquipmentTypeBucket[]>(() => {
    if (!data) return [];
    const counts: Record<string, number> = {
      microscopy: 0,
      spectroscopy: 0,
      analysis: 0
    };
    for (const doc of data) {
      const t = doc.data.type;
      if (t in counts) counts[t]++;
    }
    return [
      {
        type: 'Microscopy',
        count: counts.microscopy,
        fill: 'var(--color-microscopy)'
      },
      {
        type: 'Spectroscopy',
        count: counts.spectroscopy,
        fill: 'var(--color-spectroscopy)'
      },
      {
        type: 'Analysis',
        count: counts.analysis,
        fill: 'var(--color-analysis)'
      }
    ];
  }, [data]);

  return { data: buckets, isLoading };
}

// ─── Recent experiments list ────────────────────────────────────────
export interface RecentExperiment {
  id: string;
  title: string;
  status: string;
  temperature_C?: number;
}

export function useRecentExperiments(count = 5): {
  data: RecentExperiment[];
  isLoading: boolean;
} {
  const { data, isLoading } = useTenantCollection<ExperimentDoc>({
    collection: 'experiments',
    constraints: [orderBy('createdAt', 'desc'), fsLimit(count)],
    cacheKey: ['recent', count]
  });

  const items = useMemo<RecentExperiment[]>(() => {
    if (!data) return [];
    return data.map((doc) => ({
      id: doc.id,
      title: doc.data.title,
      status: doc.data.workflowStatus,
      temperature_C: doc.data.temperature_C
    }));
  }, [data]);

  return { data: items, isLoading };
}

// ─── R493: computation-first dashboard ───────────────────────────────

interface DftWorkflowDoc {
  data: {
    name?: string;
    overallStatus?: 'pending' | 'queued' | 'running' | 'completed' | 'failed';
    createdAt?: number;
    updatedAt?: number;
    units?: { status?: string; calculation?: string; scfGap?: { gapEv?: number } }[];
  };
}

export interface DftJobSummaryItem {
  id: string;
  name: string;
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed';
  /** First unit's calculation label (scf / vc-relax / …). */
  calc: string | null;
  /** Band gap (eV) from the last unit exposing scfGap, when completed. */
  gapEv: number | null;
  updatedAt: number;
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
  const { data, isLoading } = useTenantCollection<DftWorkflowDoc['data']>({
    collection: 'dftWorkflows'
  });

  return useMemo(() => {
    const rows = (data ?? []).map((d) => ({ id: d.id, ...d.data }));
    const counts = { running: 0, queued: 0, completed: 0, failed: 0 };
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let completedThisWeek = 0;
    for (const r of rows) {
      const s = r.overallStatus ?? 'pending';
      if (s === 'pending' || s === 'queued') counts.queued += 1;
      else if (s in counts) counts[s as keyof typeof counts] += 1;
      if (s === 'completed' && (r.updatedAt ?? r.createdAt ?? 0) >= weekAgo) {
        completedThisWeek += 1;
      }
    }
    const latest: DftJobSummaryItem[] = rows
      .toSorted((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0))
      .slice(0, latestCount)
      .map((r) => {
        const units = r.units ?? [];
        const gapUnit = units.findLast((u) => u.scfGap?.gapEv != null);
        return {
          id: r.id,
          name: r.name ?? r.id,
          status: (r.overallStatus ?? 'pending') as DftJobSummaryItem['status'],
          calc: units[0]?.calculation ?? null,
          gapEv: gapUnit?.scfGap?.gapEv ?? null,
          updatedAt: r.updatedAt ?? r.createdAt ?? 0
        };
      });
    return { counts, completedThisWeek, latest, total: rows.length, isLoading };
  }, [data, isLoading, latestCount]);
}

interface BookingDoc {
  equipmentName?: string;
  title?: string;
  userId?: string;
  startAt?: number;
  endAt?: number;
  status?: string;
}

export interface TodayBooking {
  id: string;
  label: string;
  startAt: number;
  endAt: number;
}

/** The signed-in user's bookings that overlap today (local time). */
export function useMyBookingsToday(uid: string | null | undefined): {
  items: TodayBooking[];
  isLoading: boolean;
} {
  const { data, isLoading } = useTenantCollection<BookingDoc>({ collection: 'bookings' });
  return useMemo(() => {
    if (!uid) return { items: [], isLoading };
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const items = (data ?? [])
      .map((d) => ({ id: d.id, ...d.data }))
      .filter(
        (b) =>
          b.userId === uid &&
          b.status !== 'cancelled' &&
          (b.startAt ?? 0) < end.getTime() &&
          (b.endAt ?? 0) > start.getTime()
      )
      .toSorted((a, b) => (a.startAt ?? 0) - (b.startAt ?? 0))
      .map((b) => ({
        id: b.id,
        label: b.equipmentName || b.title || b.id,
        startAt: b.startAt ?? 0,
        endAt: b.endAt ?? 0
      }));
    return { items, isLoading };
  }, [data, isLoading, uid]);
}

export interface DailyCount {
  day: string; // 'MM-DD'
  count: number;
}

/** Experiments started per day for the trailing N days (default 30). */
export function useExperimentsDaily(days = 30): { data: DailyCount[]; isLoading: boolean } {
  const { data, isLoading } = useTenantCollection<ExperimentDoc>({ collection: 'experiments' });
  return useMemo(() => {
    const buckets = new Map<string, number>();
    const now = new Date();
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      buckets.set(
        `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        0
      );
    }
    const cutoffSec = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
    for (const e of data ?? []) {
      const sec = e.data.startedAt?.seconds;
      if (!sec || sec < cutoffSec) continue;
      const d = new Date(sec * 1000);
      const key = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return {
      data: [...buckets.entries()].map(([day, count]) => ({ day, count })),
      isLoading
    };
  }, [data, isLoading, days]);
}
