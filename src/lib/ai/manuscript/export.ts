/**
 * Manuscript export builders (N4 — close the loop).
 *
 * Pure string assembly (no I/O): turn a manuscript + its cited papers into a
 * downloadable document. Three targets:
 *   - Markdown (.md)  — universal, human-readable.
 *   - LaTeX (.tex)    — \section bodies + thebibliography; many materials journals.
 *   - BibTeX (.bib)   — @article entries for the cited papers.
 *
 * Sections are emitted in pipeline order (full IMRaD or the curated subset),
 * skipping empty ones. References resolve `WriterCitation.paperId` → paper
 * metadata (passed in by the caller, who has the papers loaded). Publisher CSL
 * styles + figure/table formatting are out of scope here (later polish).
 *
 * @phase R-aiscience-N4
 * @see labyra-ai-science-manuscript-strategy.md §4 (END node)
 */
import type {
  Manuscript,
  ManuscriptSection,
  ManuscriptSectionType
} from '@/features/manuscript/types';
import { IMRAD_ORDER } from '@/lib/ai/manuscript/section-order';

const SECTION_TITLE: Record<ManuscriptSectionType, string> = {
  abstract: 'Abstract',
  introduction: 'Introduction',
  materials: 'Materials',
  methods: 'Methods',
  results_discussion: 'Results and Discussion',
  conclusion: 'Conclusion'
};

/** Minimal paper metadata needed for a reference entry. */
export interface ExportPaperMeta {
  title: string;
  authors: string[];
  year: number;
  journal?: string;
  doi?: string;
}

/** A cited paper resolved to its bibliographic fields. */
export interface CitedPaper {
  citationKey: string;
  title: string;
  authors: string[];
  year: number;
  journal: string;
  doi: string;
}

/** Drafted sections in pipeline order (full IMRaD or the curated subset). */
function orderedSections(m: Manuscript): ManuscriptSection[] {
  const order =
    m.pipelineSections && m.pipelineSections.length > 0 ? m.pipelineSections : [...IMRAD_ORDER];
  const out: ManuscriptSection[] = [];
  for (const type of order) {
    const section = m.sections.find((s) => s.type === type);
    if (section && section.content.trim()) out.push(section);
  }
  return out;
}

/** Unique cited papers across all sections, resolved + key-sorted. */
export function collectCitations(
  m: Manuscript,
  paperById: Map<string, ExportPaperMeta>
): CitedPaper[] {
  const seen = new Map<string, CitedPaper>();
  for (const section of m.sections) {
    for (const c of section.citations) {
      if (seen.has(c.citationKey)) continue;
      const p = paperById.get(c.paperId);
      seen.set(c.citationKey, {
        citationKey: c.citationKey,
        title: p?.title ?? c.citationKey,
        authors: p?.authors ?? [],
        year: p?.year ?? 0,
        journal: p?.journal ?? '',
        doi: p?.doi ?? ''
      });
    }
  }
  return [...seen.values()].toSorted((a, b) => a.citationKey.localeCompare(b.citationKey));
}

export function buildMarkdown(m: Manuscript, cited: CitedPaper[]): string {
  const parts: string[] = [`# ${m.title}`, ''];
  for (const s of orderedSections(m)) {
    parts.push(`## ${SECTION_TITLE[s.type]}`, '', s.content.trim(), '');
  }
  if (cited.length > 0) {
    parts.push('## References', '');
    cited.forEach((c, i) => {
      const authors = c.authors.length > 0 ? c.authors.join(', ') : '—';
      const journal = c.journal ? `*${c.journal}*. ` : '';
      const doi = c.doi ? `https://doi.org/${c.doi}` : '';
      parts.push(
        `${i + 1}. [${c.citationKey}] ${authors} (${c.year || 'n.d.'}). ${c.title}. ${journal}${doi}`.trim()
      );
    });
  }
  return parts.join('\n');
}

function escapeLatex(text: string): string {
  return text.replace(/([&%$#_{}])/g, '\\$1');
}

export function buildLatex(m: Manuscript, cited: CitedPaper[]): string {
  const parts: string[] = [
    '\\documentclass[11pt]{article}',
    '\\usepackage[utf8]{inputenc}',
    `\\title{${escapeLatex(m.title)}}`,
    '\\date{}',
    '\\begin{document}',
    '\\maketitle',
    ''
  ];
  for (const s of orderedSections(m)) {
    parts.push(
      `\\section{${escapeLatex(SECTION_TITLE[s.type])}}`,
      escapeLatex(s.content.trim()),
      ''
    );
  }
  if (cited.length > 0) {
    parts.push(`\\begin{thebibliography}{${cited.length}}`);
    for (const c of cited) {
      const authors = c.authors.length > 0 ? escapeLatex(c.authors.join(', ')) : '';
      const journal = c.journal ? `${escapeLatex(c.journal)}. ` : '';
      parts.push(
        `\\bibitem{${c.citationKey}} ${authors} (${c.year || 'n.d.'}). ${escapeLatex(c.title)}. ${journal}`.trim()
      );
    }
    parts.push('\\end{thebibliography}');
  }
  parts.push('\\end{document}');
  return parts.join('\n');
}

export function buildBibtex(cited: CitedPaper[]): string {
  return cited
    .map((c) => {
      const fields = [
        `  title = {${c.title}}`,
        c.authors.length > 0 ? `  author = {${c.authors.join(' and ')}}` : '',
        c.year ? `  year = {${c.year}}` : '',
        c.journal ? `  journal = {${c.journal}}` : '',
        c.doi ? `  doi = {${c.doi}}` : ''
      ]
        .filter(Boolean)
        .join(',\n');
      return `@article{${c.citationKey},\n${fields}\n}`;
    })
    .join('\n\n');
}
