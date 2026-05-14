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
    .regex(/^[\-\d\s()]+$/, 'hkl: only digits, spaces, parens, minus')
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
