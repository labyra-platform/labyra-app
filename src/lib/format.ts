/**
 * Shared date formatting.
 *
 * R579 (datepicker-grid.md §9): one date format across the app. The old
 * formatDate hard-coded en-US with month:'long' — "September 10, 2026" — which
 * clashes with the dd/MM/yyyy the rest of the UI (and Vietnamese convention)
 * uses. Two components reading MM/dd while a third reads dd/MM is how 09/10 gets
 * read as the wrong day. formatDateVN is the single canonical display format;
 * formatDate stays for callers that pass explicit Intl options.
 */

/** Canonical display date: dd/MM/yyyy. Storage stays ISO/epoch; this is display
 *  only. Accepts a Date, ISO string, or epoch ms. Empty string for nullish. */
export function formatDateVN(date: Date | string | number | null | undefined): string {
  if (date === null || date === undefined || date === '') return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/** dd/MM/yyyy HH:mm for timestamps that need a time component. */
export function formatDateTimeVN(date: Date | string | number | null | undefined): string {
  if (date === null || date === undefined || date === '') return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatDateVN(d)} ${hh}:${mm}`;
}

/**
 * Flexible formatter for callers passing explicit Intl options. Defaults now
 * produce dd/MM/yyyy via en-GB rather than the old en-US long form, so an
 * option-less call matches formatDateVN instead of contradicting it.
 */
export function formatDate(
  date: Date | string | number | undefined,
  opts: Intl.DateTimeFormatOptions = {}
) {
  if (!date) return '';

  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: opts.day ?? '2-digit',
      month: opts.month ?? '2-digit',
      year: opts.year ?? 'numeric',
      ...opts
    }).format(new Date(date));
  } catch {
    return '';
  }
}
