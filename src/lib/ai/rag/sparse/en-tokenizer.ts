/**
 * English tokenizer using wink-nlp.
 * @phase R160-ai-5d-2
 */
import 'server-only';
import type { Tokenizer } from './types';

// Lazy load to avoid import overhead when only Vietnamese
let _nlp: unknown | null = null;
let _its: unknown | null = null;

async function loadWinkNlp() {
  if (_nlp && _its) return { nlp: _nlp, its: _its };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const winkModule = (await import('wink-nlp' as any)).default as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelModule = (await import('wink-eng-lite-web-model' as any)).default as any;
  _nlp = winkModule(modelModule);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _its = (_nlp as any).its;
  return { nlp: _nlp, its: _its };
}

export class EnglishTokenizer implements Tokenizer {
  readonly id = 'en-wink';

  // Synchronous tokenize via wink-nlp (uses pre-loaded model)
  tokenize(text: string): string[] {
    // For sync API, we use the loaded nlp instance.
    // If not loaded yet, this falls back to simple regex.
    if (!_nlp || !_its) {
      return this.fallbackTokenize(text);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nlp = _nlp as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const its = _its as any;
    return nlp
      .readDoc(text)
      .tokens()
      .filter((t: { out: (i: unknown) => unknown }) => (t.out(its.type) as string) === 'word')
      .out(its.normal) as string[];
  }

  private fallbackTokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]+/g, ' ')
      .split(/\s+/)
      .map((t) => t.replace(/^-+|-+$/g, ''))
      .filter((t) => t.length >= 2 && !/^\d+$/.test(t));
  }

  /** Call once at startup to preload model */
  async warmup(): Promise<void> {
    await loadWinkNlp();
  }
}
