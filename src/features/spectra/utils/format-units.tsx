/**
 * formatSciText: convert plain ASCII scientific notation to pretty Unicode + JSX.
 * Worker outputs "cm-1", "sp2", "h2o" → render as cm⁻¹, sp², H₂O.
 * @phase R160-spectra-3c-hotfix
 */

import * as React from 'react';

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '-': '⁻',
  '+': '⁺'
};

const SUBSCRIPT_MAP: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉'
};

function toSuperscript(s: string): string {
  return s
    .split('')
    .map((c) => SUPERSCRIPT_MAP[c] ?? c)
    .join('');
}

function toSubscript(s: string): string {
  return s
    .split('')
    .map((c) => SUBSCRIPT_MAP[c] ?? c)
    .join('');
}

/**
 * Format scientific text. Examples:
 * - "cm-1" → "cm⁻¹"
 * - "sp2 carbon" → "sp² carbon"
 * - "I_D/I_G" → "I_D/I_G" (kept literal, common in lab notation)
 * - "h2o" → "H₂O" only if explicitly a chemical formula context (skipped here)
 */
export function formatSciText(text: string): string {
  if (!text) return text;
  let out = text;
  // Pattern: unit-N or unit+N (e.g. cm-1, m-2, s-1) → superscript exponent
  out = out.replace(
    /(\bcm|nm|um|mm|km|s|m|Hz|kg|g|mg|J|eV|K|mol|L|N)([+-]?\d+)/g,
    (_m, unit, exp) => {
      return `${unit}${toSuperscript(exp)}`;
    }
  );
  // sp2, sp3 → sp², sp³ (only when followed by space or word boundary)
  out = out.replace(/\bsp([23])\b/g, (_m, n) => `sp${toSuperscript(n)}`);
  // Common scientific notation: ×10-3, x10-3 → ×10⁻³
  out = out.replace(/(?:×|x)10([+-]?\d+)/g, (_m, exp) => `×10${toSuperscript(exp)}`);
  // Lambda symbol normalization
  out = out.replace(/\blambda\b/gi, 'λ');
  out = out.replace(/\b2theta\b/gi, '2θ');
  out = out.replace(/\btheta\b/gi, 'θ');
  out = out.replace(/\bnu\b/g, 'ν');
  out = out.replace(/\balpha\b/gi, 'α');
  out = out.replace(/\bbeta\b/gi, 'β');
  return out;
}

/**
 * React component wrapper. Use as <SciText>cm-1</SciText> → cm⁻¹.
 */
export function SciText({ children }: { children: string }) {
  return <>{formatSciText(children)}</>;
}
