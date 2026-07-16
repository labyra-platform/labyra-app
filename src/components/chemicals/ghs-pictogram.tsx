'use client';

/**
 * GHS hazard pictogram — official UN/CLP SVG (public domain, from PubChem).
 *
 * SVGs live in /public/ghs/GHS0X.svg (red diamond, black symbol, white bg —
 * the international standard). Rendered via <img> with accessible alt/title.
 *
 * @phase CHEM-3a / CHEM-3a-svg
 */
import { useTranslations } from 'next-intl';
import { type GHSPictogram } from '@/types/chemical';

export function GhsPictogram({
  code,
  size = 'sm'
}: {
  code: GHSPictogram;
  size?: 'sm' | 'md' | 'lg';
}) {
  const t = useTranslations('common.ghs');
  const label = t(code);
  // R543: 'lg' for the dashboard. A hazard diamond is a shape you are meant to
  // recognise across a room, not read; at 24px the symbol inside the diamond is
  // about six pixels and every one of the nine looks like a red outline.
  const px = size === 'lg' ? 48 : size === 'md' ? 36 : 24;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG vector icon; next/image gives no benefit for inline SVG
    <img
      src={`/ghs/${code}.svg`}
      alt={label}
      title={label}
      width={px}
      height={px}
      className='inline-block shrink-0'
      loading='lazy'
    />
  );
}

export function GhsPictogramRow({ codes }: { codes: GHSPictogram[] }) {
  if (!codes || codes.length === 0) {
    return <span className='text-muted-foreground text-xs'>—</span>;
  }
  return (
    <span className='inline-flex items-center gap-1'>
      {codes.map((c) => (
        <GhsPictogram key={c} code={c} />
      ))}
    </span>
  );
}
