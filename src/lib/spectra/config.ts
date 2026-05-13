/**
 * Per-spectrum-type config: groups, file constraints, labels.
 * @phase R160-spectra-1
 */
import type { SpectrumGroup, SpectrumType } from '@/types/spectra';

interface SpectrumTypeConfig {
  type: SpectrumType;
  group: SpectrumGroup;
  acceptedExtensions: string[]; // ['.xy', '.csv']
  maxSizeBytes: number;
  defaultUnits?: { x?: string; y?: string };
  isImage: boolean; // SEM/TEM/AFM/optical → needs thumbnail
}

const MB = 1024 * 1024;

export const SPECTRA_CONFIG: Record<SpectrumType, SpectrumTypeConfig> = {
  // Structural
  xrd: {
    type: 'xrd',
    group: 'structural',
    acceptedExtensions: ['.xy', '.csv', '.raw', '.txt'],
    maxSizeBytes: 10 * MB,
    defaultUnits: { x: '2θ (°)', y: 'Intensity (counts)' },
    isImage: false
  },
  saed: {
    type: 'saed',
    group: 'structural',
    acceptedExtensions: ['.tif', '.tiff', '.dm3'],
    maxSizeBytes: 50 * MB,
    isImage: true
  },
  hrtem: {
    type: 'hrtem',
    group: 'structural',
    acceptedExtensions: ['.tif', '.tiff', '.dm3'],
    maxSizeBytes: 100 * MB,
    isImage: true
  },
  // Optical
  uvvis: {
    type: 'uvvis',
    group: 'optical',
    acceptedExtensions: ['.csv', '.txt', '.dpt'],
    maxSizeBytes: 5 * MB,
    defaultUnits: { x: 'Wavelength (nm)', y: 'Absorbance' },
    isImage: false
  },
  uvvis_drs: {
    type: 'uvvis_drs',
    group: 'optical',
    acceptedExtensions: ['.csv', '.txt', '.dpt'],
    maxSizeBytes: 5 * MB,
    defaultUnits: { x: 'Wavelength (nm)', y: 'Reflectance (%)' },
    isImage: false
  },
  pl: {
    type: 'pl',
    group: 'optical',
    acceptedExtensions: ['.csv', '.txt'],
    maxSizeBytes: 5 * MB,
    defaultUnits: { x: 'Wavelength (nm)', y: 'Intensity' },
    isImage: false
  },
  raman: {
    type: 'raman',
    group: 'optical',
    acceptedExtensions: ['.txt', '.spe', '.wdf', '.csv'],
    maxSizeBytes: 10 * MB,
    defaultUnits: { x: 'Wavenumber (cm⁻¹)', y: 'Intensity (a.u.)' },
    isImage: false
  },
  ftir: {
    type: 'ftir',
    group: 'optical',
    acceptedExtensions: ['.csv', '.dpt', '.spa'],
    maxSizeBytes: 10 * MB,
    defaultUnits: { x: 'Wavenumber (cm⁻¹)', y: '%T or Absorbance' },
    isImage: false
  },
  // Thermal
  tga: {
    type: 'tga',
    group: 'thermal',
    acceptedExtensions: ['.csv', '.txt', '.tga'],
    maxSizeBytes: 5 * MB,
    defaultUnits: { x: 'Temperature (°C)', y: 'Mass (%)' },
    isImage: false
  },
  dsc: {
    type: 'dsc',
    group: 'thermal',
    acceptedExtensions: ['.csv', '.txt', '.dsc'],
    maxSizeBytes: 5 * MB,
    defaultUnits: { x: 'Temperature (°C)', y: 'Heat flow (mW)' },
    isImage: false
  },
  // Electrochemistry
  ocp: {
    type: 'ocp',
    group: 'electrochemistry',
    acceptedExtensions: ['.csv', '.txt', '.dat'],
    maxSizeBytes: 5 * MB,
    defaultUnits: { x: 'Time (s)', y: 'Potential (V)' },
    isImage: false
  },
  cv: {
    type: 'cv',
    group: 'electrochemistry',
    acceptedExtensions: ['.txt', '.csv'],
    maxSizeBytes: 10 * MB,
    defaultUnits: { x: 'Voltage (V)', y: 'Current (A)' },
    isImage: false
  },
  eis: {
    type: 'eis',
    group: 'electrochemistry',
    acceptedExtensions: ['.txt', '.csv', '.z'],
    maxSizeBytes: 5 * MB,
    defaultUnits: { x: "Z' (Ω)", y: "-Z'' (Ω)" },
    isImage: false
  },
  gcd: {
    type: 'gcd',
    group: 'electrochemistry',
    acceptedExtensions: ['.txt', '.csv'],
    maxSizeBytes: 50 * MB, // can be very large (100K-1M rows)
    defaultUnits: { x: 'Time (s)', y: 'Voltage (V)' },
    isImage: false
  },
  lsv: {
    type: 'lsv',
    group: 'electrochemistry',
    acceptedExtensions: ['.txt', '.csv'],
    maxSizeBytes: 5 * MB,
    defaultUnits: { x: 'Voltage (V)', y: 'Current (A)' },
    isImage: false
  },
  ca: {
    type: 'ca',
    group: 'electrochemistry',
    acceptedExtensions: ['.txt', '.csv'],
    maxSizeBytes: 50 * MB, // 10K-100K rows
    defaultUnits: { x: 'Time (s)', y: 'Current (A)' },
    isImage: false
  },
  // Photoelectrochemistry
  pec_jv: {
    type: 'pec_jv',
    group: 'photoelectrochemistry',
    acceptedExtensions: ['.txt', '.csv'],
    maxSizeBytes: 5 * MB,
    defaultUnits: { x: 'Voltage (V vs RHE)', y: 'J (mA/cm²)' },
    isImage: false
  },
  ipce: {
    type: 'ipce',
    group: 'photoelectrochemistry',
    acceptedExtensions: ['.txt', '.csv'],
    maxSizeBytes: 5 * MB,
    defaultUnits: { x: 'Wavelength (nm)', y: 'IPCE (%)' },
    isImage: false
  },
  eis_light: {
    type: 'eis_light',
    group: 'photoelectrochemistry',
    acceptedExtensions: ['.txt', '.csv'],
    maxSizeBytes: 5 * MB,
    defaultUnits: { x: "Z' (Ω)", y: "-Z'' (Ω)" },
    isImage: false
  },
  // Surface
  xps: {
    type: 'xps',
    group: 'surface',
    acceptedExtensions: ['.vms', '.txt', '.csv'],
    maxSizeBytes: 20 * MB,
    defaultUnits: { x: 'Binding Energy (eV)', y: 'Intensity' },
    isImage: false
  },
  eds: {
    type: 'eds',
    group: 'surface',
    acceptedExtensions: ['.csv', '.emsa'],
    maxSizeBytes: 10 * MB,
    defaultUnits: { x: 'Energy (keV)', y: 'Counts' },
    isImage: false
  },
  bet: {
    type: 'bet',
    group: 'surface',
    acceptedExtensions: ['.csv', '.txt'],
    maxSizeBytes: 2 * MB,
    defaultUnits: { x: 'P/P₀', y: 'Volume adsorbed (cm³/g)' },
    isImage: false
  },
  contact_angle: {
    type: 'contact_angle',
    group: 'surface',
    acceptedExtensions: ['.jpg', '.jpeg', '.png'],
    maxSizeBytes: 5 * MB,
    isImage: true
  },
  // Microscopy
  sem: {
    type: 'sem',
    group: 'microscopy',
    acceptedExtensions: ['.tif', '.tiff', '.jpg', '.jpeg', '.png'],
    maxSizeBytes: 50 * MB,
    isImage: true
  },
  tem: {
    type: 'tem',
    group: 'microscopy',
    acceptedExtensions: ['.tif', '.tiff', '.dm3'],
    maxSizeBytes: 100 * MB,
    isImage: true
  },
  afm: {
    type: 'afm',
    group: 'microscopy',
    acceptedExtensions: ['.spm', '.ibw', '.txt'],
    maxSizeBytes: 20 * MB,
    isImage: true
  },
  optical_microscopy: {
    type: 'optical_microscopy',
    group: 'microscopy',
    acceptedExtensions: ['.jpg', '.jpeg', '.tif', '.tiff', '.png'],
    maxSizeBytes: 20 * MB,
    isImage: true
  }
};

/** All accepted file extensions across all spectrum types (for generic dropzone) */
export const ALL_ACCEPTED_EXTENSIONS = Array.from(
  new Set(Object.values(SPECTRA_CONFIG).flatMap((c) => c.acceptedExtensions))
);

/** Get config for a spectrum type, fallback to xrd if unknown */
export function getSpectrumConfig(type: SpectrumType): SpectrumTypeConfig {
  return SPECTRA_CONFIG[type] ?? SPECTRA_CONFIG.xrd;
}

/** Heuristic: detect spectrum type from filename (basic — user should confirm) */
export function detectSpectrumType(filename: string): SpectrumType | null {
  const lower = filename.toLowerCase();
  if (/\.dm3$/.test(lower)) return 'hrtem';
  if (/\.spm$|\.ibw$/.test(lower)) return 'afm';
  if (/\.vms$/.test(lower)) return 'xps';
  if (/\.spe$|\.wdf$/.test(lower)) return 'raman';
  if (/xrd/.test(lower)) return 'xrd';
  if (/raman/.test(lower)) return 'raman';
  if (/uvvis|uv-vis|uvv/.test(lower)) return 'uvvis';
  if (/ftir/.test(lower)) return 'ftir';
  if (/(^|[_-])pl([_-]|\.)/.test(lower)) return 'pl';
  if (/(^|[_-])cv([_-]|\.)/.test(lower)) return 'cv';
  if (/eis/.test(lower)) return 'eis';
  if (/gcd/.test(lower)) return 'gcd';
  if (/lsv/.test(lower)) return 'lsv';
  if (/(^|[_-])ca([_-]|\.)/.test(lower)) return 'ca';
  if (/(pec|jv)/.test(lower)) return 'pec_jv';
  if (/ipce/.test(lower)) return 'ipce';
  if (/xps/.test(lower)) return 'xps';
  if (/eds/.test(lower)) return 'eds';
  if (/bet/.test(lower)) return 'bet';
  if (/sem/.test(lower)) return 'sem';
  if (/tem/.test(lower)) return 'tem';
  if (/contact|angle/.test(lower)) return 'contact_angle';
  return null;
}
