'use client';

/**
 * Units of measure — the caller's preferred unit per dimension.
 *
 * The two sentences the mockup puts under this panel are not decoration; they
 * are the contract. A unit picker that quietly rewrote stored values would be
 * a data-integrity bug wearing a settings UI, so the panel says out loud that
 * it changes the view and nothing else — and the code means it: preferences
 * live under users/{uid}, records keep the unit their source reported, and the
 * conversion happens on the way to the screen (R522).
 *
 * The preview exists because a unit list is abstract. "eV → Ry" tells you
 * nothing; a real band gap re-rendering as you pick tells you everything, and
 * it also exposes what R522 does with precision — 2.7183 eV is 0.19979 Ry,
 * five decimals rather than four, because the same physical precision needs
 * one more digit in the smaller unit.
 *
 * @phase R523 — units of measure
 */
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Panel } from '@/components/ui-extra/panel';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { authedFetch } from '@/lib/api/authed-fetch';
import { DISPLAY_UNITS_DEFAULTS, type DisplayUnitsInput } from '@/lib/schemas/display-units-schema';
import {
  type Dimension,
  formatQuantity,
  type Quantity,
  UNIT_OPTIONS,
  type Unit
} from '@/types/units';

/**
 * Real values from this lab, not lorem ipsum: the Na₂WO₄·2H₂O weighing, the DI
 * volume and the hydrothermal hold from the h-WO₃ synthesis; the band gap from
 * the hwo3-pbeu-9 run; the a-lattice of 2H-WS₂ (mp-224). A preview built from
 * 1.0 of everything would hide the rounding behaviour it exists to show.
 *
 * The first draft used 2.7183 eV as a "band gap". oxlint pointed out that this
 * is Euler's number — a value that looks measured and isn't, invented without
 * noticing. Which is the whole reason this file exists.
 */
const SAMPLES: { [D in Dimension]: Quantity<D> } = {
  mass: { dimension: 'mass', value: 1.32, unit: 'g', decimals: 2, source: 'balance' },
  volume: { dimension: 'volume', value: 80, unit: 'mL', decimals: 0, source: 'manual' },
  temperature: {
    dimension: 'temperature',
    value: 160,
    unit: '°C',
    decimals: 0,
    source: 'instrument',
    kind: 'point'
  },
  energy: { dimension: 'energy', value: 2.72, unit: 'eV', decimals: 2, source: 'dft' },
  length: { dimension: 'length', value: 3.153, unit: 'Å', decimals: 3, source: 'dft' }
};

/**
 * One field, one dimension, generic over it — so the sample quantity, the unit
 * list and the picked unit are all the same D and the preview cannot be handed
 * a mass in millilitres.
 *
 * The five fields below are written out rather than mapped. Mapping over the
 * dimension union collapses `unit` to never: TypeScript cannot see that
 * SAMPLES[d] and units[d] share a d. Casting past that would throw away the
 * exact guarantee R522 exists for, so the verbosity is the price of the
 * guarantee, and it is cheap at five lines.
 */
function DimensionField<D extends Dimension>({
  dimension,
  label,
  sample,
  value,
  onPick
}: {
  dimension: D;
  label: string;
  sample: Quantity<D>;
  value: Unit<D>;
  onPick: (unit: Unit<D>) => void;
}) {
  const id = `unit-${dimension}`;
  return (
    <div className='space-y-1.5'>
      <label htmlFor={id} className='text-muted-foreground text-caption block'>
        {label}
      </label>
      <Select value={value} onValueChange={(v) => onPick(v as Unit<D>)}>
        <SelectTrigger id={id} className='text-body w-full rounded-lg'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className='min-w-(--radix-select-trigger-width)'>
          {UNIT_OPTIONS[dimension].map((u) => (
            <SelectItem key={u} value={u} className='text-body'>
              {u}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className='text-muted-foreground text-meta truncate tabular-nums'>
        {formatQuantity(sample, value)}
      </p>
    </div>
  );
}

export function DisplayUnitsForm() {
  const t = useTranslations('settings.units');
  const [units, setUnits] = useState<DisplayUnitsInput>(DISPLAY_UNITS_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<DisplayUnitsInput>(DISPLAY_UNITS_DEFAULTS);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await authedFetch('/api/me/display-units');
        if (!res.ok) return;
        const body = (await res.json()) as { units: DisplayUnitsInput };
        if (!alive) return;
        setUnits(body.units);
        setSaved(body.units);
      } catch (err) {
        console.warn('display units load failed', err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const pick = useCallback(<D extends Dimension>(dimension: D, unit: Unit<D>) => {
    setUnits((prev) => ({ ...prev, [dimension]: unit }));
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await authedFetch('/api/me/display-units', {
        method: 'PUT',
        body: JSON.stringify(units)
      });
      if (res.ok) {
        setSaved(units);
        setDirty(false);
      }
    } catch (err) {
      console.warn('display units save failed', err);
    } finally {
      setSaving(false);
    }
  }, [units]);

  const revert = useCallback(() => {
    setUnits(saved);
    setDirty(false);
  }, [saved]);

  return (
    <Panel title={t('title')} description={t('subtitle')}>
      {loading ? (
        <div className='grid grid-cols-2 gap-4 sm:grid-cols-3'>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className='space-y-1.5'>
              <Skeleton className='h-3 w-16' />
              <Skeleton className='h-9 w-full' />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className='grid grid-cols-2 gap-4 sm:grid-cols-3'>
            <DimensionField
              dimension='mass'
              label={t('dimension.mass')}
              sample={SAMPLES.mass}
              value={units.mass as Unit<'mass'>}
              onPick={(u) => pick('mass', u)}
            />
            <DimensionField
              dimension='volume'
              label={t('dimension.volume')}
              sample={SAMPLES.volume}
              value={units.volume as Unit<'volume'>}
              onPick={(u) => pick('volume', u)}
            />
            <DimensionField
              dimension='temperature'
              label={t('dimension.temperature')}
              sample={SAMPLES.temperature}
              value={units.temperature as Unit<'temperature'>}
              onPick={(u) => pick('temperature', u)}
            />
            <DimensionField
              dimension='energy'
              label={t('dimension.energy')}
              sample={SAMPLES.energy}
              value={units.energy as Unit<'energy'>}
              onPick={(u) => pick('energy', u)}
            />
            <DimensionField
              dimension='length'
              label={t('dimension.length')}
              sample={SAMPLES.length}
              value={units.length as Unit<'length'>}
              onPick={(u) => pick('length', u)}
            />
          </div>

          <p className='text-muted-foreground text-meta'>{t('sourceNote')}</p>

          {dirty && (
            <div className='flex items-center justify-end gap-2'>
              <span className='text-muted-foreground text-caption mr-auto'>{t('unsaved')}</span>
              <Button variant='ghost' size='sm' onClick={revert} disabled={saving}>
                {t('revert')}
              </Button>
              <Button size='sm' onClick={() => void save()} disabled={saving}>
                {saving ? t('saving') : t('save')}
              </Button>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
