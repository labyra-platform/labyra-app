import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge has to be told that the §2 type scale is a type scale.
 *
 * The tokens are declared in @theme, which Tailwind understands and
 * tailwind-merge never sees. Left to guess, it reads `text-meta` as a member of
 * the text-COLOUR group — `text-red-500`, `text-foreground`, `text-meta`, all
 * the same shape — and drops it the moment a colour follows:
 *
 *   twMerge('text-meta', 'text-foreground')  ->  'text-foreground'   ← size gone
 *   twMerge('text-sm',   'text-foreground')  ->  'text-sm text-foreground'
 *
 * The second line works only because tailwind-merge ships knowing `text-sm`.
 * So every `cn('text-meta …', 'text-foreground …')` in this codebase was
 * silently rendering at the inherited size — which is how a role label
 * specified at 11px reached the screen at 16. Nothing catches this: the class
 * is valid, tsc and oxlint see strings, and the build compiles. Only a person
 * looking at it does.
 *
 * Registering them closes the hole for every call site at once, including the
 * ones nobody has written yet.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['meta', 'caption', 'body', 'heading', 'stat', 'title', 'display'] }]
    }
  }
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(
  bytes: number,
  opts: {
    decimals?: number;
    sizeType?: 'accurate' | 'normal';
  } = {}
) {
  const { decimals = 0, sizeType = 'normal' } = opts;

  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const accurateSizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB'];
  if (bytes === 0) return '0 Byte';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(decimals)} ${
    sizeType === 'accurate' ? (accurateSizes[i] ?? 'Bytest') : (sizes[i] ?? 'Bytes')
  }`;
}
