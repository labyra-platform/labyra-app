/**
 * Zod schema for tenant AI context (ADR-035 M1, L4).
 * @phase R192-mem-m1b
 */
import { z } from 'zod';

export const tenantAiContextSchema = z.object({
  labName: z.string().max(200).default(''),
  labDescription: z.string().max(2000).default(''),
  commonMaterials: z.array(z.string().max(100)).max(50).default([]),
  commonTechniques: z.array(z.string().max(100)).max(50).default([]),
  commonEquipment: z.array(z.string().max(100)).max(50).default([]),
  houseStyle: z.string().max(2000).default(''),
  glossary: z.record(z.string().max(100), z.string().max(500)).default({}),
  // R273: tenant translation glossary (en → preferred rendering), merged OVER the
  // built-in domain glossary in the translate prompt. Distinct from `glossary`
  // above, which is term→definition for the Q&A/memory context — do not conflate.
  translationGlossary: z.record(z.string().max(100), z.string().max(200)).default({}),
  // R267: tenant default target language for pre-translation (worker reads this).
  defaultLanguage: z.enum(['en', 'vi', 'zh', 'ja', 'ko', 'fr', 'de']).default('en')
});

export type TenantAiContextInput = z.infer<typeof tenantAiContextSchema>;
