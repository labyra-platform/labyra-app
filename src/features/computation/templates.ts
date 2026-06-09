/**
 * DFT workflow templates — verified presets the user can launch.
 *
 * These mirror the validated workflow JSONs run end-to-end on the compute
 * backend (h-WO3 PBE+U; 2H-WS2 vdW-D3). Pure data — the Submit tab will
 * prefill from these.
 *
 * @phase R239-computation-tabs
 */

export interface DftTemplate {
  id: string;
  name: string;
  material: string;
  /** e.g. 'PBE+U' */
  method: string;
  hubbard: string;
  /** null when no dispersion correction. */
  vdw: string | null;
  /** 'ecutwfc / ecutrho (Ry)' */
  cutoff: string;
  kGrid: string;
  unitCount: number;
}

export const DFT_TEMPLATES: readonly DftTemplate[] = [
  {
    id: 'h-wo3-bulk-pbeu',
    name: 'h-WO₃ bulk',
    material: 'WO₃ · P6/mmm',
    method: 'PBE+U',
    hubbard: 'U(W-5d)=6.2, U(O-2p)=9.0',
    vdw: null,
    cutoff: '60 / 720',
    kGrid: '6×6×12',
    unitCount: 7
  },
  {
    id: '2h-ws2-bulk-vdw',
    name: '2H-WS₂ bulk',
    material: 'WS₂ · P6₃/mmc',
    method: 'PBE+U',
    hubbard: 'U(W-5d)=6.2',
    vdw: 'Grimme-D3',
    cutoff: '60 / 720',
    kGrid: '15×15×4',
    unitCount: 7
  }
] as const;
