/**
 * Generate ONE manuscript section (HITL — user-gated, one section at a time).
 *
 * Composes existing pieces rather than adding new ones: builds the prior-section
 * running context (coherence), then calls the T4 Writer with the manuscript's
 * collection (collection-scoped RAG) and the mapped section type. The returned
 * WriterResult already carries deterministic grounding (R276 — fabricated
 * citations + unverified numbers), which the caller surfaces to the user.
 *
 * @phase R-aiscience-2
 * @see labyra-ai-science-manuscript-strategy.md §4
 */
import 'server-only';
import type { Manuscript, ManuscriptSectionType } from '@/features/manuscript/types';
import { runWriter } from '@/lib/ai/tier4-writer/orchestrator';
import type { WriterResult } from '@/lib/ai/tier4-writer/types';
import { dropLabVerified } from './number-registry';
import { buildRunningContext } from './running-memory';
import { manuscriptToWriterSection } from './section-order';

export interface GenerateSectionInput {
  tenantId: string;
  manuscript: Manuscript;
  sectionType: ManuscriptSectionType;
  /** Extra user steer — e.g. the seed idea/abstract that frames the paper. */
  instruction?: string;
  /** Normalized lab-measurement numbers — un-flags measured values (Gap1). */
  labNumberWhitelist?: Set<string>;
  onTextDelta?: (delta: string) => void;
}

/** Human-readable section label for the instruction. */
function sectionLabel(type: ManuscriptSectionType): string {
  return type === 'results_discussion' ? 'Results & Discussion' : type;
}

function buildSectionInstruction(
  type: ManuscriptSectionType,
  title: string,
  instruction?: string
): string {
  const lines = [`Draft the ${sectionLabel(type)} section of the manuscript titled "${title}".`];
  if (type === 'results_discussion') {
    lines.push(
      'Present the key results first (with figures/quantities), then interpret them — mechanisms, comparison to the cited literature, and limitations.'
    );
  }
  if (instruction?.trim()) lines.push(instruction.trim());
  return lines.join('\n');
}

export async function generateManuscriptSection(
  input: GenerateSectionInput
): Promise<WriterResult> {
  const { tenantId, manuscript, sectionType, instruction, labNumberWhitelist, onTextDelta } = input;

  // Prior sections = every section except the one being (re)generated.
  const prior = manuscript.sections.filter((s) => s.type !== sectionType);
  const priorContext = buildRunningContext(prior, manuscript.glossary);

  const result = await runWriter({
    tenantId,
    userMessage: buildSectionInstruction(sectionType, manuscript.title, instruction),
    sectionType: manuscriptToWriterSection(sectionType),
    collectionId: manuscript.collectionId || undefined,
    priorContext: priorContext || undefined,
    onTextDelta
  });

  // Gap1: numbers backed by the lab's own measurements are real data, not
  // fabrications — drop them from the unverified-number warnings.
  if (!labNumberWhitelist?.size) return result;
  const unverifiedNumbers = dropLabVerified(result.grounding.unverifiedNumbers, labNumberWhitelist);
  return {
    ...result,
    grounding: {
      ...result.grounding,
      unverifiedNumbers,
      totalWarnings: result.grounding.invalidCitations.length + unverifiedNumbers.length
    }
  };
}
