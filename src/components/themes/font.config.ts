import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import { cn } from '@/lib/utils';

// Primary / body — Inter. Strong Vietnamese diacritics, high x-height, UI-optimized.
const fontSans = Inter({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  variable: '--font-sans',
  display: 'swap'
});

// Secondary / display — Plus Jakarta Sans. Geometric character for headings.
const fontDisplay = Plus_Jakarta_Sans({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  variable: '--font-display',
  display: 'swap'
});

// Mono — JetBrains Mono. Clear glyph distinction for formulas, CAS numbers, code.
const fontMono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  variable: '--font-mono',
  display: 'swap'
});

export const fontVariables = cn(fontSans.variable, fontDisplay.variable, fontMono.variable);
