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
import { loadLabDataContext } from './lab-data';
import { loadMethodsContext } from './methods-data';
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
  instruction?: string,
  measurementSummaries?: string[],
  characterization?: string[]
): string {
  const lines = [`Draft the ${sectionLabel(type)} section of the manuscript titled "${title}".`];
  if (type === 'results_discussion') {
    lines.push(
      'Present the key results first (with figures/quantities), then interpret them — mechanisms, comparison to the cited literature, and limitations.'
    );
  }
  if (measurementSummaries && measurementSummaries.length > 0) {
    lines.push(
      "\nThe lab's own measurements for this manuscript (use these as the measured results; do not invent or alter numbers):"
    );
    measurementSummaries.forEach((sum, i) => lines.push(`${i + 1}. ${sum}`));
  }
  if (type === 'methods' && characterization && characterization.length > 0) {
    lines.push(
      '\nCharacterization instruments and acquisition parameters for this manuscript (describe these in the Characterization subsection; use only the instruments/parameters listed — do not invent equipment, models, or settings that are not provided, and omit any detail recorded as missing):'
    );
    characterization.forEach((c, i) => lines.push(`${i + 1}. ${c}`));
  }
  if (instruction?.trim()) lines.push(instruction.trim());
  return lines.join('\n');
}

/**
 * Topic-driven RAG query — decoupled from the generation instruction. The
 * Introduction must retrieve FIELD literature (background, prior approaches,
 * gaps), so we query the topic (title + seed idea), not the literal "Draft the
 * introduction…" instruction. Other sections retrieve fine from their
 * instruction (which already carries the lab's measurement summaries), so they
 * are left unchanged.
 */
function buildRetrievalQuery(
  type: ManuscriptSectionType,
  title: string,
  instruction?: string
): string | undefined {
  if (type !== 'introduction') return undefined;
  return [
    title.trim(),
    instruction?.trim(),
    'background, prior approaches, limitations, motivation'
  ]
    .filter(Boolean)
    .join('. ');
}

export async function generateManuscriptSection(
  input: GenerateSectionInput
): Promise<WriterResult> {
  const { tenantId, manuscript, sectionType, instruction, labNumberWhitelist, onTextDelta } = input;

  // Prior sections = every section except the one being (re)generated.
  const prior = manuscript.sections.filter((s) => s.type !== sectionType);
  const priorContext = buildRunningContext(prior, manuscript.glossary);

  // Lab data the manuscript curated: feeds the Writer's context (so Results &
  // Discussion cites the lab's own findings) and un-flags genuine measured numbers.
  const labData =
    manuscript.selectedMeasurementIds.length > 0
      ? await loadLabDataContext(tenantId, manuscript.selectedMeasurementIds)
      : { summaries: [], whitelist: new Set<string>() };

  // Methods only: real characterization instruments + acquisition parameters,
  // so the Characterization subsection names the lab's actual setup (not invented
  // equipment). The procedure half is owned by protocol instances (future).
  const methodsData =
    sectionType === 'methods' && manuscript.selectedMeasurementIds.length > 0
      ? await loadMethodsContext(tenantId, manuscript.selectedMeasurementIds)
      : { characterization: [], whitelist: new Set<string>() };

  const result = await runWriter({
    tenantId,
    userMessage: buildSectionInstruction(
      sectionType,
      manuscript.title,
      instruction,
      labData.summaries,
      methodsData.characterization
    ),
    sectionType: manuscriptToWriterSection(sectionType),
    collectionId: manuscript.collectionId || undefined,
    retrievalQuery: buildRetrievalQuery(sectionType, manuscript.title, instruction),
    priorContext: priorContext || undefined,
    onTextDelta
  });

  // Gap1: numbers backed by the lab's own measurements are real data, not
  // fabrications — drop them from the unverified-number warnings. Whitelist =
  // caller-provided ∪ lab-derived (this manuscript's selected measurements).
  const whitelist = new Set<string>(labNumberWhitelist ?? []);
  for (const n of labData.whitelist) whitelist.add(n);
  for (const n of methodsData.whitelist) whitelist.add(n);
  if (whitelist.size === 0) return result;
  const unverifiedNumbers = dropLabVerified(result.grounding.unverifiedNumbers, whitelist);
  return {
    ...result,
    grounding: {
      ...result.grounding,
      unverifiedNumbers,
      totalWarnings: result.grounding.invalidCitations.length + unverifiedNumbers.length
    }
  };
}
