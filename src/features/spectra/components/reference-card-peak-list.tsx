/**
 * ReferenceCardPeakList — peak table that branches by spectrumType.
 *
 * Fixes R163-4c-4 (UI branch per type, previously deferred): the detail page
 * only rendered XRD peak columns via `xrdCard?.peaks.map`, so FTIR / Raman /
 * UV-Vis cards (which DO carry peaks, with different units) showed an empty
 * table. This component renders the correct columns per discriminant.
 *
 * Server component (no hooks / no client state). Peak arrays are guarded with
 * `?? []` to tolerate legacy / partial Firestore docs (logic-bug-audit C1).
 *
 * @phase R239-c1-peak-branch
 */

import { getTranslations } from 'next-intl/server';
import type { ReferenceCard } from '@/types/spectra';

interface ReferenceCardPeakListProps {
  card: ReferenceCard;
  locale: string;
}

function fmt(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}

export async function ReferenceCardPeakList({ card, locale }: ReferenceCardPeakListProps) {
  const t = await getTranslations({ locale, namespace: 'referenceCards' });

  // Column headers per spectrum type. `value` column reuses col.intensity.
  const positionLabel =
    card.spectrumType === 'xrd'
      ? t('col.twoTheta')
      : card.spectrumType === 'ftir'
        ? t('col.wavenumber')
        : card.spectrumType === 'raman'
          ? t('col.shift')
          : t('col.wavelength');

  return (
    <table className='w-full text-sm'>
      <thead className='bg-muted/50 text-xs'>
        <tr>
          <th className='p-2 text-left'>{positionLabel}</th>
          {card.spectrumType === 'xrd' && <th className='p-2 text-right'>{t('col.dSpacing')}</th>}
          <th className='p-2 text-right'>{t('col.intensity')}</th>
          <th className='p-2 text-left'>
            {card.spectrumType === 'xrd' ? t('col.hkl') : t('col.assignment')}
          </th>
        </tr>
      </thead>
      <tbody className='divide-y'>
        {card.spectrumType === 'xrd' &&
          (card.peaks ?? []).map((p, i) => (
            <tr key={`${fmt(p.twoTheta, 4)}-${i}`}>
              <td className='p-2 font-mono'>{fmt(p.twoTheta, 3)}</td>
              <td className='p-2 text-right font-mono'>{fmt(p.dSpacing, 4)}</td>
              <td className='p-2 text-right font-mono'>{fmt(p.intensity, 1)}</td>
              <td className='p-2 font-mono'>{p.hkl ?? '—'}</td>
            </tr>
          ))}
        {card.spectrumType === 'ftir' &&
          (card.peaks ?? []).map((p, i) => (
            <tr key={`${fmt(p.wavenumber, 1)}-${i}`}>
              <td className='p-2 font-mono'>{fmt(p.wavenumber, 1)}</td>
              <td className='p-2 text-right font-mono'>{fmt(p.intensity, 1)}</td>
              <td className='p-2'>{p.assignment ?? '—'}</td>
            </tr>
          ))}
        {card.spectrumType === 'raman' &&
          (card.peaks ?? []).map((p, i) => (
            <tr key={`${fmt(p.shift, 1)}-${i}`}>
              <td className='p-2 font-mono'>{fmt(p.shift, 1)}</td>
              <td className='p-2 text-right font-mono'>{fmt(p.intensity, 1)}</td>
              <td className='p-2'>{p.assignment ?? '—'}</td>
            </tr>
          ))}
        {card.spectrumType === 'uvvis' &&
          (card.peaks ?? []).map((p, i) => (
            <tr key={`${fmt(p.wavelength, 1)}-${i}`}>
              <td className='p-2 font-mono'>{fmt(p.wavelength, 1)}</td>
              <td className='p-2 text-right font-mono'>{fmt(p.intensity, 1)}</td>
              <td className='p-2'>{p.assignment ?? '—'}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}
