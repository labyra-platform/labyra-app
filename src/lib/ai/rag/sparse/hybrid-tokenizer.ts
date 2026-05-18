/**
 * Hybrid tokenizer — detects language and routes to specialized tokenizer.
 * @phase R160-ai-5d-2
 */
import 'server-only';
import { franc } from 'franc-min';
import { EnglishTokenizer } from './en-tokenizer';
import type { Tokenizer } from './types';
import { VietnameseTokenizer } from './vi-tokenizer';

const viTokenizer = new VietnameseTokenizer();
const enTokenizer = new EnglishTokenizer();

export class HybridTokenizer implements Tokenizer {
  readonly id = 'hybrid';

  tokenize(text: string): string[] {
    if (text.length < 10) {
      // Too short to reliably detect, use English by default
      return enTokenizer.tokenize(text);
    }
    const lang = franc(text);
    // 'vie' = Vietnamese, 'cmn' = Chinese, 'eng' = English, etc.
    if (lang === 'vie') {
      return viTokenizer.tokenize(text);
    }
    return enTokenizer.tokenize(text);
  }

  async warmup(): Promise<void> {
    await enTokenizer.warmup();
  }
}

// Singleton
let _hybrid: HybridTokenizer | null = null;

export function getHybridTokenizer(): HybridTokenizer {
  if (_hybrid) return _hybrid;
  _hybrid = new HybridTokenizer();
  return _hybrid;
}
