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
  hazard: 'low' | 'medium' | 'high';
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

export function useChemicalsByHazard(): {
  data: ChemicalHazardBucket[];
  isLoading: boolean;
} {
  const { data, isLoading } = useTenantCollection<ChemicalDoc>({
    collection: 'chemicals'
  });

  const buckets = useMemo<ChemicalHazardBucket[]>(() => {
    if (!data) return [];
    const counts: Record<string, number> = { low: 0, medium: 0, high: 0 };
    for (const doc of data) {
      const hazard = doc.data.hazard;
      if (hazard in counts) counts[hazard]++;
    }
    return [
      { hazard: 'Low', count: counts.low },
      { hazard: 'Medium', count: counts.medium },
      { hazard: 'High', count: counts.high }
    ];
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
