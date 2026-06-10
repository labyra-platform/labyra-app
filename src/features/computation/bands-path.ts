/**
 * Default hexagonal band-structure k-path (Γ-M-K-Γ-A-L-H-A-M), matching the
 * verified h-WO3 / 2H-WS2 workflows. Used when serializing a `bands` unit
 * (the editor does not yet expose visual k-path editing).
 *
 * @phase R245-dag-editor-b4-serialize
 */
export interface BandsPathPoint {
  coords: [number, number, number];
  label: string;
  npoints: number;
}

const T = 1 / 3;

export const HEX_BANDS_PATH: BandsPathPoint[] = [
  { coords: [0, 0, 0], label: 'GAMMA', npoints: 60 },
  { coords: [0.5, 0, 0], label: 'M', npoints: 60 },
  { coords: [T, T, 0], label: 'K', npoints: 60 },
  { coords: [0, 0, 0], label: 'GAMMA', npoints: 60 },
  { coords: [0, 0, 0.5], label: 'A', npoints: 60 },
  { coords: [0.5, 0, 0.5], label: 'L', npoints: 60 },
  { coords: [T, T, 0.5], label: 'H', npoints: 60 },
  { coords: [0, 0, 0.5], label: 'A', npoints: 1 },
  { coords: [0.5, 0, 0], label: 'M', npoints: 1 }
];
