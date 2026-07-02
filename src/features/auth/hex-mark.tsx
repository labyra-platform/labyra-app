/**
 * HexMark — Labyra's glyph: a hexagonal 2D unit cell / Brillouin-zone outline
 * with a centred lattice point. Pure SVG (currentColor), safe in server or
 * client components.
 *
 * @phase R346-auth-redesign
 */
const HEX_POINTS = Array.from({ length: 6 }, (_, i) => {
  const ang = (Math.PI / 3) * i - Math.PI / 6;
  return `${(12 + 11 * Math.cos(ang)).toFixed(2)},${(12 + 11 * Math.sin(ang)).toFixed(2)}`;
}).join(' ');

export function HexMark({ className }: { className?: string }) {
  return (
    <svg viewBox='0 0 24 24' className={className} aria-hidden='true'>
      <polygon points={HEX_POINTS} fill='none' stroke='currentColor' strokeWidth={1.4} />
      <circle cx={12} cy={12} r={1.7} fill='currentColor' />
    </svg>
  );
}
