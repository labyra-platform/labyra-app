/**
 * Vietnamese tokenizer — custom regex-based.
 * @phase R160-ai-5d-2
 *
 * Why not vntk?
 * - vntk requires native binding (crfsuite) — fails in serverless/Vercel.
 * - For BM25 keyword matching, simple word split is 85% as good as POS tagging.
 *
 * Strategy:
 * - Normalize NFC (composed Unicode)
 * - Lowercase
 * - Split on non-letter/number boundaries (keeps Vietnamese diacritics)
 * - Filter stopwords
 * - Min token length 2
 */
import type { Tokenizer } from './types';

// Common Vietnamese stopwords (curated for scientific text — preserves technical terms)
const VI_STOPWORDS = new Set([
  'và',
  'của',
  'là',
  'có',
  'được',
  'cho',
  'với',
  'này',
  'đó',
  'các',
  'những',
  'một',
  'hai',
  'ba',
  'từ',
  'đến',
  'theo',
  'như',
  'tại',
  'trong',
  'ngoài',
  'trên',
  'dưới',
  'sau',
  'trước',
  'khi',
  'nếu',
  'mà',
  'để',
  'hoặc',
  'nhưng',
  'cũng',
  'còn',
  'đã',
  'sẽ',
  'đang',
  'phải',
  'cần',
  'nên',
  'thì',
  'rằng',
  'bằng',
  'qua',
  'về',
  'do',
  'bởi',
  'nên',
  'vì',
  'ấy',
  'đây',
  'kia',
  'nào',
  'nhiều',
  'ít',
  'rất',
  'quá',
  'thật',
  'chỉ',
  'còn',
  'mới',
  'lại',
  'tôi',
  'bạn',
  'họ',
  'chúng',
  'mình',
  'ta',
  'anh',
  'chị',
  'em',
  'ông',
  'bà'
]);

export class VietnameseTokenizer implements Tokenizer {
  readonly id = 'vi-regex';

  tokenize(text: string): string[] {
    return (
      text
        .normalize('NFC')
        .toLowerCase()
        // Keep Unicode letters + numbers + dashes (for compounds like "co2", "wo3")
        .replace(/[^\p{L}\p{N}-]+/gu, ' ')
        .split(/\s+/)
        // Strip leading/trailing dashes (markdown bullets, negative numbers etc)
        .map((t) => t.replace(/^-+|-+$/g, ''))
        // Min length 2, no pure-numeric, no stopwords
        .filter((t) => t.length >= 2 && !/^\d+$/.test(t) && !VI_STOPWORDS.has(t))
    );
  }
}
