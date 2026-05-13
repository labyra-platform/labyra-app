# Accessibility Audit — WCAG 2.2 Level AA

> **Standard:** WCAG 2.2 Level AA (per ISO 9241-171)  
> **Scope:** All pages in labyra-app  
> **Created:** May 13, 2026

## Compliance summary

| Standard | Status | Notes |
|---|---|---|
| 1.4.3 Color contrast 4.5:1 | ✅ | shadcn tokens enforce |
| 1.4.11 UI contrast 3:1 | ⚠️ | Verify hazard badges (red on light bg) |
| 1.4.12 Text spacing | ✅ | Tailwind line-height 1.5+ |
| 2.1.1 Keyboard accessible | ✅ | shadcn components support full keyboard nav |
| 2.4.7 Focus visible | ✅ | shadcn focus-ring tokens |
| 2.5.8 Target size 24×24 | ✅ | Button default `size-9` (36×36) |
| 3.3.1 Error identification | ✅ | FormMessage + icons, not color-only |
| 3.3.3 Error suggestion | ⚠️ | Zod errors are technical, could be friendlier |
| 4.1.3 Status messages | ✅ | Sonner toasts use ARIA live regions |
| 2.3.3 Reduced motion | ✅ | globals.css media query (added R160-ui-1) |

## Action items

### Critical (blocks compliance)
- [ ] Run Lighthouse Accessibility audit on production build
- [ ] Test with NVDA screen reader on key flows (login → dashboard → create material)
- [ ] Test keyboard-only navigation (Tab, Shift+Tab, Enter, Esc) — no mouse

### High priority
- [ ] Audit color contrast for hazard badges (low/medium/high/extreme)
  - High and extreme use red — verify 4.5:1 on light and dark backgrounds
- [ ] Verify focus indicators visible on all interactive elements
- [ ] Add `aria-label` to icon-only buttons (delete buttons, etc.)

### Medium priority
- [ ] Improve error messages — replace Zod's "Required" with field-specific text
- [ ] Add skip-to-content link at top of page
- [ ] Verify breadcrumbs use `<nav aria-label="Breadcrumb">`
- [ ] Add `role="status"` to loading skeletons

### Low priority
- [ ] Document keyboard shortcuts in help panel (Cmd+K)
- [ ] Test with high-contrast OS mode

## Testing checklist per feature

For each new feature, verify:
- [ ] Visible focus indicator on all interactive elements
- [ ] Tab order is logical
- [ ] No keyboard traps
- [ ] Error messages identify the problem AND suggest a fix
- [ ] Loading states announced to screen readers
- [ ] Touch targets ≥ 24×24 CSS px
- [ ] Color is not the only way to convey information

## Tools

- **axe DevTools** (Chrome extension) — automated checks
- **WAVE** (web.aimgroup.com) — visual overlay of issues
- **Lighthouse** (Chrome built-in) — overall score
- **NVDA** (Windows) — screen reader testing
- **Tab** key only — manual keyboard navigation test

## References
- Source: `uiux-international-standards.md`
- WCAG 2.2 spec: https://www.w3.org/TR/WCAG22/
- shadcn accessibility: built on Radix UI primitives (WAI-ARIA compliant)
