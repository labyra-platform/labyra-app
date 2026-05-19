/**
 * MaterialProfile — root collection /materialProfiles/{formula}.
 * Global scientific reference data seeded in R183-2.
 *
 * @phase R183-2-material-knowledge-card
 */

export interface VerifiedCitation {
  doi: string;
  title?: string;
  journal?: string;
  year?: number;
  verified: boolean;
}

export interface SpectralPeak {
  shift?: number; // cm-1 (Raman/FTIR)
  twotheta?: number; // degrees (XRD)
  wavelength?: number; // nm (UV-Vis/PL)
  energy?: number; // eV (PL)
  intensity: number; // 0-100
  assignment?: string;
  citation?: VerifiedCitation;
}

export interface SpectralSignature {
  peaks: SpectralPeak[];
  laserWavelength?: 532 | 785 | 1064;
  notes?: string;
  citation?: VerifiedCitation;
}

export interface ElectronicProps {
  bandgapEv?: number;
  bandgapType?: 'direct' | 'indirect';
  bandgapNotes?: string;
  conductivityType?: 'metal' | 'semiconductor' | 'insulator' | 'semimetal';
  citation?: VerifiedCitation;
}

export interface MaterialProfile {
  id: string;
  formula: string;
  commonNames: string[];
  casNumber?: string;
  dimensionality?: '0D' | '1D' | '2D' | '3D';
  materialClass?: string;
  crystalSystem?: string;
  spaceGroup?: string;
  spaceGroupNumber?: number;
  latticeParams?: {
    a?: number;
    b?: number;
    c?: number;
    alpha?: number;
    beta?: number;
    gamma?: number;
  };
  electronicProps?: ElectronicProps;
  spectralSignatures?: {
    raman?: SpectralSignature;
    ftir?: SpectralSignature;
    xrd?: SpectralSignature;
    pl?: SpectralSignature;
    uvvis?: SpectralSignature;
  };
  physicalProps?: Record<string, unknown>;
  source: 'manual' | 'materials_project' | 'literature';
  mpId?: string;
  version: number;
  updatedAt?: string;
}
