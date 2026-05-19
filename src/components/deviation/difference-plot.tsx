/**
 * DifferencePlot — Rietveld observed/calculated/diff overlay.
 *
 * Plotly chart with:
 *   - Observed pattern (markers)
 *   - Calculated total (line)
 *   - Per-phase contributions (faded lines, optional)
 *   - Difference (y_obs - y_calc) below, separate y-axis
 *
 * @phase R185-10d-1
 */
'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { formatFormula } from '@/lib/utils/format-formula';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

interface DifferencePlotProps {
  data: {
    x: number[];
    y_obs: number[];
    y_calc: number[];
    diff: number[];
  };
  phaseContributions: Record<string, number[]> | null;
}

export function DifferencePlot({ data, phaseContributions }: DifferencePlotProps) {
  const traces = useMemo(() => {
    const t: Array<Record<string, unknown>> = [
      {
        x: data.x,
        y: data.y_obs,
        type: 'scatter',
        mode: 'markers',
        name: 'Observed',
        marker: { size: 3, color: 'rgba(99, 102, 241, 0.6)' }, // indigo
        xaxis: 'x',
        yaxis: 'y'
      },
      {
        x: data.x,
        y: data.y_calc,
        type: 'scatter',
        mode: 'lines',
        name: 'Calculated',
        line: { width: 1.5, color: 'rgba(239, 68, 68, 0.9)' }, // red
        xaxis: 'x',
        yaxis: 'y'
      },
      {
        x: data.x,
        y: data.diff,
        type: 'scatter',
        mode: 'lines',
        name: 'Difference',
        line: { width: 1, color: 'rgba(107, 114, 128, 0.8)' }, // gray
        xaxis: 'x',
        yaxis: 'y2'
      }
    ];

    if (phaseContributions) {
      const phaseColors = ['#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
      Object.entries(phaseContributions).forEach(([formula, y], i) => {
        t.push({
          x: data.x,
          y,
          type: 'scatter',
          mode: 'lines',
          name: formatFormula(formula),
          line: { width: 1, color: phaseColors[i % phaseColors.length], dash: 'dot' },
          opacity: 0.6,
          xaxis: 'x',
          yaxis: 'y'
        });
      });
    }

    return t;
  }, [data, phaseContributions]);

  return (
    <div className='border border-border rounded-md bg-card p-2'>
      <Plot
        data={traces}
        layout={{
          autosize: true,
          height: 380,
          margin: { l: 50, r: 20, t: 30, b: 40 },
          showlegend: true,
          legend: { orientation: 'h', y: -0.2 },
          xaxis: {
            title: { text: '2θ (degrees)' },
            domain: [0, 1]
          },
          yaxis: {
            title: { text: 'Intensity' },
            domain: [0.32, 1]
          },
          yaxis2: {
            title: { text: 'Δ', font: { size: 11 } },
            domain: [0, 0.28],
            zeroline: true,
            zerolinecolor: 'rgba(107, 114, 128, 0.5)'
          },
          grid: { rows: 2, columns: 1, pattern: 'independent' },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent'
        }}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: '100%' }}
        useResizeHandler
      />
    </div>
  );
}
