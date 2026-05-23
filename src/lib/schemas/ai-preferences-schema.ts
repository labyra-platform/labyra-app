/**
 * Zod schemas for AI memory settings (ADR-035 M1).
 * @phase R192-mem-m1b
 */
import { z } from 'zod';

export const aiPreferencesSchema = z.object({
  language: z.enum(['vi', 'en', 'auto']),
  mathNotation: z.enum(['latex', 'unicode', 'plaintext']),
  verbosity: z.enum(['concise', 'normal', 'detailed']),
  preferredTier: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  tone: z.enum(['formal', 'casual']),
  includeReferences: z.boolean(),
  enableMemory: z.boolean()
});

export type AiPreferencesInput = z.infer<typeof aiPreferencesSchema>;

/** Defaults (ADR-035: memory OPT-IN, enableMemory=false). */
export const AI_PREFERENCES_DEFAULTS: AiPreferencesInput = {
  language: 'auto',
  mathNotation: 'latex',
  verbosity: 'normal',
  preferredTier: null,
  tone: 'formal',
  includeReferences: true,
  enableMemory: false
};
