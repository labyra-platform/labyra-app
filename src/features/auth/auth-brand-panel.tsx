/**
 * AuthBrandPanel — the left half of the auth split-screen. A fixed-dark canvas
 * (both themes) carrying Labyra's identity: a hexagonal "unit cell" mark + the
 * wordmark, an ambient 2D crystal-lattice motif (the signature — nodes + bonds,
 * echoing a WS₂ monolayer), and a tagline. Server component: the lattice is
 * generated deterministically, so it costs no client JS.
 *
 * @phase R346-auth-redesign
 */
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { HexMark } from './hex-mark';

const DISPLAY = { fontFamily: 'var(--font-display)' } as const;

/** Deterministic triangular (close-packed) lattice: atoms + nearest-neighbour bonds. */
function latticeGeometry(width: number, height: number, a: number) {
  const dy = (a * Math.sqrt(3)) / 2;
  const atoms: Array<[number, number]> = [];
  for (let row = 0; row * dy <= height + a; row++) {
    const y = row * dy;
    const xOff = row % 2 ? a / 2 : 0;
    for (let col = -1; col * a + xOff <= width + a; col++) atoms.push([col * a + xOff, y]);
  }
  const bonds: Array<[number, number, number, number]> = [];
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      const dx = atoms[i][0] - atoms[j][0];
      const dyy = atoms[i][1] - atoms[j][1];
      if (dx * dx + dyy * dyy < (a * 1.05) ** 2) {
        bonds.push([atoms[i][0], atoms[i][1], atoms[j][0], atoms[j][1]]);
      }
    }
  }
  return { atoms, bonds };
}

function LatticeField() {
  const W = 520;
  const H = 860;
  const { atoms, bonds } = latticeGeometry(W, H, 84);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio='xMidYMid slice'
      className='pointer-events-none absolute inset-0 size-full'
      aria-hidden='true'
    >
      <g stroke='white' strokeWidth={1} opacity={0.09}>
        {bonds.map((b, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <line key={i} x1={b[0]} y1={b[1]} x2={b[2]} y2={b[3]} />
        ))}
      </g>
      <g fill='white' opacity={0.16}>
        {atoms.map((p, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <circle key={i} cx={p[0]} cy={p[1]} r={2.3} />
        ))}
      </g>
    </svg>
  );
}

export async function AuthBrandPanel({ className }: { className?: string }) {
  const t = await getTranslations('auth');
  return (
    <aside
      className={cn(
        'relative flex-col justify-between overflow-hidden bg-neutral-950 bg-gradient-to-b from-neutral-950 to-neutral-900 p-10 text-neutral-50',
        className
      )}
    >
      <LatticeField />
      <div className='relative z-10 flex items-center gap-2.5'>
        <HexMark className='size-7 text-neutral-50' />
        <span className='text-xl font-semibold tracking-tight' style={DISPLAY}>
          Labyra
        </span>
      </div>
      <div className='relative z-10 space-y-4'>
        <p className='max-w-sm text-2xl font-medium leading-snug tracking-tight' style={DISPLAY}>
          {t('brandTagline')}
        </p>
        <p className='font-mono text-[0.7rem] uppercase tracking-[0.2em] text-neutral-500'>
          {t('brandEyebrow')}
        </p>
      </div>
    </aside>
  );
}
