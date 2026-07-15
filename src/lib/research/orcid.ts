/**
 * ORCID iDs — structure and checksum.
 *
 * An ORCID is 16 digits, and the last one is a check digit under ISO 7064
 * MOD 11-2. That means a single mistyped digit, or two digits swapped, is
 * detectable locally: no network, no waiting, no rate limit. Which is why the
 * checksum runs before the API call and not after — an identifier that cannot
 * exist should never cost a round trip, and "not found" is a much worse error
 * message than "that digit is wrong".
 *
 * It matters more here than in most places an ID gets typed. An ORCID goes on
 * an author list and into a citation; a wrong one silently credits someone
 * else's work to this lab, or this lab's work to a stranger. Nobody notices
 * until a reviewer does.
 *
 * @phase R525 — research profile
 */

const ORCID_RE = /^(\d{4})-(\d{4})-(\d{4})-(\d{3}[\dX])$/;

/** 0000000218250097 -> 0000-0002-1825-0097. Accepts a bare URL too. */
export function normaliseOrcid(input: string): string | null {
  const bare = input
    .trim()
    .replace(/^https?:\/\/(www\.)?orcid\.org\//i, '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
  if (!/^\d{15}[\dX]$/.test(bare)) return null;
  return `${bare.slice(0, 4)}-${bare.slice(4, 8)}-${bare.slice(8, 12)}-${bare.slice(12)}`;
}

/**
 * ISO 7064 MOD 11-2: run a doubling accumulator over the first fifteen digits,
 * then the check digit is whatever makes the total ≡ 1 (mod 11). Remainder 10
 * is written X, which is why an ORCID can end in a letter.
 */
export function orcidCheckDigit(first15: string): string {
  let total = 0;
  for (const ch of first15) {
    total = (total + Number(ch)) * 2;
  }
  const result = (12 - (total % 11)) % 11;
  return result === 10 ? 'X' : String(result);
}

export type OrcidCheck = { ok: true; orcid: string } | { ok: false; reason: 'format' | 'checksum' };

export function checkOrcid(input: string): OrcidCheck {
  const orcid = normaliseOrcid(input);
  if (!orcid || !ORCID_RE.test(orcid)) return { ok: false, reason: 'format' };
  const digits = orcid.replace(/-/g, '');
  if (orcidCheckDigit(digits.slice(0, 15)) !== digits[15]) {
    return { ok: false, reason: 'checksum' };
  }
  return { ok: true, orcid };
}
