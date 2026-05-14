/**
 * Zod schemas for reference card validation (server + client).
 *
 * Security:
 * - Length limits prevent DoS
 * - Numeric ranges prevent invalid scientific data
 * - String regex prevent injection
 *
 * @phase R160-spectra-4a-pdf
 */
import { z } from 'zod';

// Card number: PDF-2 33-1387, JCPDS 04-0784, Custom-XYZ
export const CardNumberSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[A-Za-z0-9\s\-#.+]+$/, 'card_number: only alphanumeric, spaces, hyphens allowed');

export const PhaseNameSchema = z.string().min(1).max(200);

export const FormulaSchema = z
  .string()
  .max(50)
  .regex(/^[A-Z][A-Za-z0-9().·]*$/, 'formula: must start with capital letter')
  .optional();

export const SpaceGroupSchema = z.string().max(50).optional();

export const AnodeSchema = z.enum(['Cu', 'Mo', 'Co', 'Cr', 'Fe', 'Ag']).optional();

export const ReferenceCardPeakSchema = z.object({
  twoTheta: z.number().gt(2).lt(180),
  dSpacing: z.number().gt(0.1).lt(50).optional(),
  intensity: z.number().gt(0).lte(100),
  hkl: z
    .string()
    .max(20)
    .regex(/^[-\d\s()]+$/, 'hkl: only digits, spaces, parens, minus')
    .optional()
});

export const CreateReferenceCardSchema = z.object({
  cardNumber: CardNumberSchema,
  phaseName: PhaseNameSchema,
  formula: FormulaSchema,
  spaceGroup: SpaceGroupSchema,
  anode: AnodeSchema,
  peaks: z.array(ReferenceCardPeakSchema).min(3).max(200),
  notes: z.string().max(1000).optional()
});

export type CreateReferenceCardInput = z.infer<typeof CreateReferenceCardSchema>;

// Raw text input (paste) — limit 50KB
export const ParseTextSchema = z
  .string()
  .min(10, 'Text too short')
  .max(50_000, 'Text too long (max 50KB)');

// ============================================================
// R163-spectra-4c-1 — discriminated union schemas for multi-spectrum refcards
// ============================================================

// XRD peak schema (existing, kept for reference + reused below)
export const XRDPeakSchema = z.object({
  twoTheta: z.number().gt(2).lt(180),
  dSpacing: z.number().gt(0.1).lt(50).optional(),
  intensity: z.number().gt(0).lte(100),
  hkl: z
    .string()
    .max(20)
    .regex(/^[-\d\s()]+$/, 'hkl: only digits, spaces, parens, minus')
    .optional()
});

export const FTIRPeakSchema = z.object({
  wavenumber: z.number().gte(100).lte(8000),
  intensity: z.number().gt(0).lte(100),
  assignment: z.string().max(100).optional()
});

export const RamanPeakSchema = z.object({
  shift: z.number().gte(50).lte(5000),
  intensity: z.number().gt(0).lte(100),
  assignment: z.string().max(100).optional()
});

export const UVVisPeakSchema = z.object({
  wavelength: z.number().gte(150).lte(2000),
  intensity: z.number().gt(0).lte(100),
  assignment: z.string().max(100).optional()
});

const RefCardBaseInput = {
  cardNumber: CardNumberSchema,
  phaseName: PhaseNameSchema,
  formula: FormulaSchema,
  notes: z.string().max(1000).optional()
};

export const CreateXRDRefCardSchema = z.object({
  ...RefCardBaseInput,
  spectrumType: z.literal('xrd'),
  spaceGroup: SpaceGroupSchema,
  anode: AnodeSchema,
  peaks: z.array(XRDPeakSchema).min(3).max(200)
});

export const CreateFTIRRefCardSchema = z.object({
  ...RefCardBaseInput,
  spectrumType: z.literal('ftir'),
  mode: z.enum(['transmittance', 'absorbance']).optional(),
  peaks: z.array(FTIRPeakSchema).min(2).max(200)
});

export const CreateRamanRefCardSchema = z.object({
  ...RefCardBaseInput,
  spectrumType: z.literal('raman'),
  laserWavelength: z.number().gte(200).lte(2000).optional(),
  peaks: z.array(RamanPeakSchema).min(2).max(200)
});

export const CreateUVVisRefCardSchema = z.object({
  ...RefCardBaseInput,
  spectrumType: z.literal('uvvis'),
  solvent: z.string().max(50).optional(),
  peaks: z.array(UVVisPeakSchema).min(1).max(100)
});

// Discriminated union for any spectrum type
export const CreateAnyRefCardSchema = z.discriminatedUnion('spectrumType', [
  CreateXRDRefCardSchema,
  CreateFTIRRefCardSchema,
  CreateRamanRefCardSchema,
  CreateUVVisRefCardSchema
]);

export type CreateAnyRefCardInput = z.infer<typeof CreateAnyRefCardSchema>;
