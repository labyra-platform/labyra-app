/**
 * Citation types — represents one citation edge in the paper graph.
 *
 * Each Citation is an EDGE: `sourcePaper` cites `target` (DOI or internal paper).
 * Stored under tenants/{tid}/citations/{id} for multi-tenant isolation.
 *
 * Citation IS a scientific fact (author wrote it in references section),
 * therefore it inherits ProvBase for full audit + lifecycle tracking.
 *
 * @phase R166-ai6a-1
 * @see docs/adr/ADR-017-citation-network.md
 */
import type { ProvBase } from './prov-base';

/**
 * Confidence level for extracted citation.
 *
 *   - 'doi-exact': DOI regex matched verbatim in PDF references section
 *   - 'title-fuzzy': No DOI extractable; matched target by title + Crossref/OpenAlex
 *   - 'manual': User manually entered (override) — highest trust
 */
export type CitationConfidence = 'doi-exact' | 'title-fuzzy' | 'unverified' | 'manual'; // R168-3.3a

export interface Citation extends ProvBase {
  /** schemaVersion bumped from initial to allow future migrations. */
  schemaVersion: 1;

  /** Internal paper ID (mat_xxx slug) that cites the target. */
  sourcePaperId: string;

  /** DOI of cited paper (preferred — ground truth). E.g. "10.1038/s41586-022-04532-4". */
  targetDoi?: string;

  /** Cited paper title (fallback when DOI not extractable). */
  targetTitle?: string;

  /** Cited paper authors (from Crossref/OpenAlex lookup). */
  targetAuthors?: string[];

  /** Cited paper publication year. */
  targetYear?: number;

  /** Cited paper journal. */
  targetJournal?: string;

  /**
   * Resolved internal paperId if target paper is ALSO in our DB.
   * Populated by separate cross-reference step (runs after extraction).
   * Null until matched.
   */
  targetPaperId?: string | null;

  /** Source of metadata: 'crossref' | 'openalex' | 'pdf-only' | 'manual'. */
  metadataSource?: 'crossref' | 'openalex' | 'pdf-only' | 'manual';

  /** Extraction confidence — see CitationConfidence. */
  confidence: CitationConfidence;

  /**
   * Surrounding text in references section (50 chars context).
   * Useful for audit + debugging when extraction is unclear.
   */
  context?: string;

  /** Citation type (heuristic from context): primary research, review, methods, etc. */
  citationType?: 'primary' | 'review' | 'methods' | 'background' | 'unknown';
}

/**
 * Aggregate stats per paper — denormalized for fast UI queries.
 * Stored at tenants/{tid}/papers/{paperId}/_stats document.
 */
export interface PaperCitationStats {
  schemaVersion: 1;
  paperId: string;
  /** Number of citations OUT (this paper cites others). */
  citationsOutCount: number;
  /** Number of citations IN (other papers in DB cite this one). */
  citationsInCount: number;
  /** Last time stats recomputed. */
  updatedAt: number;
}
