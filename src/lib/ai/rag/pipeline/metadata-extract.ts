/**
 * Extract paper metadata (title, authors, year, DOI) from OCR'd first page.
 * Uses Haiku (cheap) tier — ~$0.001/paper.
 * @phase R160-ai-5d-4
 */
import 'server-only';
import { selectProvider } from '@/lib/ai/providers';

export interface ExtractedMetadata {
  title: string;
  authors: string[];
  year: number;
  doi: string;
}

const EXTRACT_PROMPT = `Extract bibliographic metadata from this scientific paper's first page.

Return ONLY valid JSON with this exact shape, no markdown fences, no commentary:
{
  "title": "<full paper title, NO filename slugs>",
  "authors": ["<First Last>", "..."],
  "year": <4-digit year as number, 0 if unknown>,
  "doi": "<DOI like 10.1021/acsami.xxxx, empty string if not found>"
}

Rules:
- title: Full proper title from the article header, NOT the filename. Capitalize properly.
- authors: list of "First Last" strings. Use et al. only if >5 authors and shorten.
- year: publication year as integer, e.g. 2024. Use 0 if not visible.
- doi: standardize as "10.xxxx/yyyy" without https:// prefix.
- If any field truly cannot be extracted, use defaults: title="Untitled", authors=[], year=0, doi="".`;

export async function extractMetadata(firstPageText: string): Promise<ExtractedMetadata> {
  const defaultMeta: ExtractedMetadata = {
    title: 'Untitled',
    authors: [],
    year: 0,
    doi: ''
  };

  if (!firstPageText || firstPageText.length < 50) {
    return defaultMeta;
  }

  try {
    // Use T2 tier (Anthropic Haiku/Sonnet) - reliable for structured output
    const { provider } = selectProvider(2);
    const result = await provider.complete({
      model: 'claude-haiku-4-5-20251001', // cheap haiku for extraction
      maxTokens: 500,
      system: [{ text: EXTRACT_PROMPT }],
      messages: [
        {
          role: 'user',
          content: firstPageText.slice(0, 4000) // limit to first 4K chars
        }
      ]
    });

    // Strip markdown fences if model wrapped output
    let jsonText = result.text.trim();
    jsonText = jsonText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const parsed = JSON.parse(jsonText) as Partial<ExtractedMetadata>;
    return {
      title:
        typeof parsed.title === 'string' && parsed.title.length > 0 ? parsed.title : 'Untitled',
      authors: Array.isArray(parsed.authors)
        ? parsed.authors.filter((a) => typeof a === 'string')
        : [],
      year: typeof parsed.year === 'number' ? parsed.year : 0,
      doi: typeof parsed.doi === 'string' ? parsed.doi : ''
    };
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'warn',
        event: 'metadata_extract_failed',
        error: err instanceof Error ? err.message : String(err)
      })
    );
    return defaultMeta;
  }
}
