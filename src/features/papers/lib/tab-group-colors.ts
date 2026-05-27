/**
 * R230/R232b: tab-group color tokens → inline HSL styles.
 *
 * Why inline styles instead of Tailwind classes — earlier this file used raw
 * Tailwind colors (`bg-blue-100`...), which produced a flat, off-brand look
 * that didn't sit well next to the shadcn token system. Inline HSL gives:
 *   - one hue per color, low-opacity background + mid-opacity border + saturated
 *     text — a consistent recipe that matches shadcn badge styling,
 *   - dark mode "for free" via the same opacities (theme-agnostic),
 *   - no JIT friction (raw HSL never gets purged).
 *
 * Each color exposes a `bg/border/fg` triple for the chip and a `band` for the
 * subtle tab-container tint behind the group's tabs.
 */
import type { TabGroupColor } from '@/features/papers/stores/paper-tabs-store';
import type { CSSProperties } from 'react';

export interface TabGroupChipStyle {
  chip: CSSProperties;
  band: CSSProperties;
  dot: CSSProperties;
}

function chipFor(h: number, s = 75, l = 50): TabGroupChipStyle {
  return {
    chip: {
      backgroundColor: `hsl(${h} ${s}% ${l}% / 0.12)`,
      borderColor: `hsl(${h} ${s}% ${l}% / 0.35)`,
      color: `hsl(${h} ${s}% ${Math.max(l - 5, 35)}%)`
    },
    band: { backgroundColor: `hsl(${h} ${s}% ${l}% / 0.06)` },
    dot: { backgroundColor: `hsl(${h} ${s}% ${l}%)` }
  };
}

/** Hue map — picked to be visually distinct + harmonious with the shadcn neutrals. */
export const TAB_GROUP_COLOR_STYLES: Record<TabGroupColor, TabGroupChipStyle> = {
  blue: chipFor(217),
  green: chipFor(160),
  amber: chipFor(38),
  red: chipFor(0),
  purple: chipFor(270),
  gray: {
    chip: {
      backgroundColor: 'hsl(var(--muted))',
      borderColor: 'hsl(var(--border))',
      color: 'hsl(var(--muted-foreground))'
    },
    band: { backgroundColor: 'hsl(var(--muted) / 0.5)' },
    dot: { backgroundColor: 'hsl(var(--muted-foreground))' }
  }
};
