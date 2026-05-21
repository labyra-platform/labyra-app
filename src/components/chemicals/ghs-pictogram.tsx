'use client';

/**
 * GHS hazard pictogram — official UN/CLP SVG (public domain, from PubChem).
 *
 * SVGs live in /public/ghs/GHS0X.svg (red diamond, black symbol, white bg —
 * the international standard). Rendered via <img> with accessible alt/title.
 *
 * @phase CHEM-3a / CHEM-3a-svg
 */
import { GHS_LABELS, type GHSPictogram } from '@/types/chemical';

export function GhsPictogram({ code, size = 'sm' }: { code: GHSPictogram; size?: 'sm' | 'md' }) {
  const label = GHS_LABELS[code];
  const px = size === 'sm' ? 24 : 36;
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
