---
name: ui-ux-standards
description: International UI/UX standards for Labyra. This skill should be used when designing, building, or reviewing user interface components, forms, color schemes, typography, accessibility, motion, mobile patterns, or data visualizations. Triggers on tasks involving WCAG, ISO 9241, Nielsen heuristics, Gestalt principles, color contrast, accessibility audits, design tokens, responsive layouts, form design, data viz (Tufte principles, chart selection), motion (reduced-motion, easing), or Vietnamese typography. Read `reference.md` for the full 800-line standards document; this SKILL.md provides the quick-reference checklist applied to every UI patch.
license: MIT
metadata:
  author: labyra-platform
  version: '1.0.0'
  source: docs/uiux-international-standards.md
---

# UI/UX International Standards — Labyra

Compliance target for every component and page in labyra-app.

## When to Apply

Reference these standards when:
- Designing or building any UI component (forms, tables, navigation, charts, dialogs)
- Reviewing code for accessibility compliance
- Choosing colors, typography, spacing, motion durations
- Implementing forms (label placement, error messages, validation timing)
- Designing data visualizations (chart selection, color schemes)
- Adapting layouts for mobile / responsive breakpoints
- Supporting Vietnamese typography and diacritics

## Priority Matrix (from full doc Section 14)

| Standard | Priority for Labyra | Why |
|---|---|---|
| WCAG 2.2 AA | CRITICAL | Enterprise + university requirement |
| Nielsen 10 Heuristics | CRITICAL | Core UX quality |
| ISO 9241-11 (Usability) | CRITICAL | SaaS quality metric |
| 8-Point Grid | CRITICAL | Design consistency |
| Color Contrast 4.5:1 | CRITICAL | Accessibility gate |
| Data Viz Standards | CRITICAL | Spectrum plots are core feature |
| Form Standards | HIGH | Experiment data entry |
| Motion Standards | HIGH | Lab dashboard UX |
| Reduced Motion | HIGH | Researchers work long hours |
| Touch Targets 44px | MEDIUM | Mobile/tablet in lab |
| Design Tokens | MEDIUM | When building design system |

## Quick-Reference Checklist

### Color (WCAG 2.2 §1.4.3)
- Normal text contrast: ≥ 4.5:1
- Large text (≥ 18pt or 14pt bold): ≥ 3:1
- UI components / borders: ≥ 3:1
- Never use color as the ONLY signal — combine with icon/text/pattern
- Avoid red+green pairs (8% of men colorblind)

### Typography
- Body text minimum 16px (1rem)
- Line height: body 1.5+, headings 1.1–1.2
- Optimal line length: 50–75 chars (max-width: 65ch)
- Vietnamese diacritics: Be Vietnam Pro, Noto Sans Vietnamese, Source Sans 3

### Spacing — 8-Point Grid
Multiples of 8: 8, 16, 24, 32, 40, 48, 64, 80. Exception: 4px for internal component padding.

### Forms (full doc Section 11)
- Label ABOVE input — never placeholder-as-label
- Inline error message below field, with icon (not color-only)
- Single column preferred; multi-column only for related fields
- Validation: on submit (simple) or on blur (complex) — never on keypress
- Primary CTA: 1 per form, bottom-right
- Use HTML5 input types: `type="email"`, `type="tel"`, `type="number"`, `type="date"`, `type="search"`

### Motion (WCAG 2.3.3 + Disney 12 Principles)
- Micro (button, toggle): 100–150ms ease-out
- Simple (fade, slide): 150–250ms ease-in-out
- Complex (modal, page): 250–400ms ease-in-out
- > 400ms feels slow; < 100ms unnoticed
- ALWAYS respect `prefers-reduced-motion` media query

### Accessibility (WCAG 2.2 Level AA)
- Touch targets ≥ 24×24 CSS px (recommended 44×44)
- Visible focus indicator: area ≥ perimeter × 2px, contrast ≥ 3:1
- Keyboard accessible (no traps, logical Tab order)
- Error message: identify the problem AND suggest a fix
- ARIA live regions for status (toasts, loading)

### Data Visualization (Tufte principles)
- Data-ink ratio: maximize data, minimize chart junk
- Remove gridlines or make very light
- No 3D effects, gradients on data, drop shadows
- Sequential data: single hue varying lightness
- Diverging data: two hues from center (blue–white–red)
- Categorical: max 7–8 distinct hues (use ColorBrewer)
- Axis labels MUST have units: "Wavenumber (cm⁻¹)", "Intensity (a.u.)"

### Scientific UI (Labyra-specific)
- Chemical formulas: Unicode subscript (H₂O not H2O, WO₃ not WO3)
- Units: μm, nm, eV, mA/cm² with proper symbols
- Scientific notation: 1.23 × 10⁻⁶ (display) vs 1.23e-6 (code only)
- Date format: DD/MM/YYYY (VN locale), ISO 8601 (scientific data)

## Tools

- **axe DevTools** — automated WCAG audit
- **Lighthouse** — accessibility + performance score
- **Contrast Checker** — whocanuse.com
- **NVDA / VoiceOver** — screen reader testing
- **ColorBrewer** — data viz palettes

## Full Reference

See `reference.md` in this skill folder for the complete 800-line standards document covering:
- All 14 sections (ISO, W3C/WCAG, Nielsen, Gestalt, Typography, Color, Layout, Motion, Mobile, Data Viz, Forms, Design Systems, Performance, Labyra-specific)
- Detailed criteria with examples
- Tool recommendations
- Book references
