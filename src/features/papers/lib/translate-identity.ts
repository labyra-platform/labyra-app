/**
 * Identity short-circuit helpers for translation (§3 strategy).
 *
 * When a selection is already in the target language there is nothing to
 * translate — the route returns it verbatim with 0 tokens and no model call.
 * franc-min (already a dependency) detects the language locally in ~ms.
 *
 * Isomorphic (no `server-only`): the client may reuse these later.
 *
 * @phase R266
 */
import { franc } from 'franc-min';

/** franc-min returns ISO 639-3; map to the 2-letter target codes we offer. */
export const FRANC_TO_LANG: Record<string, string> = {
  eng: 'en',
  vie: 'vi',
  cmn: 'zh',
  jpn: 'ja',
  kor: 'ko',
  fra: 'fr',
  deu: 'de'
};

/** Below this length detection is unreliable; franc itself returns 'und' for
 *  very short input and we guard explicitly to mirror that. */
const MIN_DETECT_LEN = 10;

/**
 * Best-effort 2-letter language of `text`, or null when franc can't decide
 * (too short, or a language we don't map). Null means "fall back to another
 * signal (e.g. paper metadata) or just translate" — never a forced guess.
 */
export function detectLang(text: string): string | null {
  if (text.length <= MIN_DETECT_LEN) return null;
  return FRANC_TO_LANG[franc(text)] ?? null;
}

/**
 * True iff `text` is confidently already in `targetLang`. Used to skip the
 * model. Returns false on any uncertainty so we never return wrong-language
 * text unchanged.
 */
export function isSameLanguage(text: string, targetLang: string): boolean {
  return detectLang(text) === targetLang;
}
