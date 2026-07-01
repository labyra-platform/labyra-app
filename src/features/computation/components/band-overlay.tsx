/**
 * Band-overlay — overlays several runs' band structures on a shared k-path,
 * each aligned to its own VBM (= 0 eV) so dispersion and gap changes with
 * Hubbard U are directly comparable. Custom SVG (one polyline per band) — far
 * lighter than hundreds of chart series, and each run is drawn independently on
 * the shared scale (no index merge), so it is robust even if the k-sampling
 * differs. Assumes the runs share a k-path (same structure), which holds for a
 * U sweep; the k-tick labels are taken from the first run.
 *
 * @phase R311-band-overlay
 */
import type { BandsData } from './band-structure-plot';

export interface OverlayRun {
  id: string;
  name: string;
  color: string;
  bands: BandsData;
}

const W = 760;
const H = 440;
const M = { top: 16, right: 132, bottom: 40, left: 48 };

/** Energy reference per run: VBM (insulator) → Fermi → 0. */
function shiftOf(b: BandsData): number {
  return b.gap?.vbm_ev ?? b.fermiEv ?? 0;
}

export function BandOverlay({ runs, windowEv = 6 }: { runs: OverlayRun[]; windowEv?: number }) {
  const base = runs[0]?.bands;
  if (!base || base.kdist.length === 0) return null;

  const kMax = Math.max(...runs.map((r) => r.bands.kdist.at(-1) ?? 0));
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const sx = (k: number) => M.left + (kMax > 0 ? (k / kMax) * plotW : 0);
  const yLo = -windowEv;
  const yHi = windowEv;
  const sy = (e: number) => M.top + (1 - (e - yLo) / (yHi - yLo)) * plotH;

  const yTicks: number[] = [];
  for (let e = Math.ceil(yLo / 2) * 2; e <= yHi; e += 2) yTicks.push(e);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className='h-full w-full' xmlns='http://www.w3.org/2000/svg'>
      <defs>
        <clipPath id='band-overlay-clip'>
          <rect x={M.left} y={M.top} width={plotW} height={plotH} />
        </clipPath>
      </defs>

      {yTicks.map((e) => (
        <g key={`y${e}`}>
          <line
            x1={M.left}
            y1={sy(e)}
            x2={M.left + plotW}
            y2={sy(e)}
            className='stroke-border'
            strokeWidth={e === 0 ? 1.2 : 0.5}
            strokeDasharray={e === 0 ? undefined : '2 2'}
          />
          <text
            x={M.left - 6}
            y={sy(e) + 3}
            textAnchor='end'
            className='fill-muted-foreground'
            fontSize={10}
          >
            {e}
          </text>
        </g>
      ))}

      {base.ticks.map((tk, i) => (
        <g key={`k${i}`}>
          <line
            x1={sx(tk.dist)}
            y1={M.top}
            x2={sx(tk.dist)}
            y2={M.top + plotH}
            className='stroke-border'
            strokeWidth={0.5}
          />
          <text
            x={sx(tk.dist)}
            y={H - M.bottom + 16}
            textAnchor='middle'
            className='fill-muted-foreground'
            fontSize={10}
          >
            {tk.label}
          </text>
        </g>
      ))}

      <g clipPath='url(#band-overlay-clip)'>
        {runs.flatMap((run) => {
          const shift = shiftOf(run.bands);
          const kd = run.bands.kdist;
          return run.bands.bands
            .map((band, bi) => {
              let anyIn = false;
              const pts = band.map((e, i) => {
                const ev = e - shift;
                if (ev >= yLo && ev <= yHi) anyIn = true;
                return `${sx(kd[i] ?? 0).toFixed(1)},${sy(ev).toFixed(1)}`;
              });
              if (!anyIn) return null;
              return (
                <polyline
                  key={`${run.id}-${bi}`}
                  points={pts.join(' ')}
                  fill='none'
                  stroke={run.color}
                  strokeWidth={0.9}
                  strokeOpacity={0.75}
                />
              );
            })
            .filter((el): el is React.JSX.Element => el != null);
        })}
      </g>

      <text
        transform={`translate(14 ${M.top + plotH / 2}) rotate(-90)`}
        textAnchor='middle'
        className='fill-muted-foreground'
        fontSize={10}
      >
        E − E_VBM (eV)
      </text>

      {runs.map((run, i) => (
        <g key={`lg${run.id}`} transform={`translate(${W - M.right + 12} ${M.top + 10 + i * 18})`}>
          <line x1={0} y1={0} x2={16} y2={0} stroke={run.color} strokeWidth={2} />
          <text x={22} y={3} className='fill-foreground' fontSize={10}>
            {run.name}
          </text>
        </g>
      ))}
    </svg>
  );
}
