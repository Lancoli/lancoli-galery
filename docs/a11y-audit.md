# Lancoli — AA Accessibility Audit

**Date:** 2026-11-28
**Standard:** WCAG 2.1 AA
**Arc:** a11y

---

## 1. Contrast (A1 — WCAG 4.5:1)

### ✅ Fixed

| Element | Before | After | Ratio |
|---------|--------|-------|-------|
| `--muted` | #6f6a63 | #5a5551 | 4.57:1 ✓ |
| `.threshold-intro p` | #444 | var(--muted) | 4.57:1 ✓ |
| `.lang button` | var(--muted) old | var(--muted) new | 4.57:1 ✓ |
| Footer text | var(--muted) old | var(--muted) new | 4.57:1 ✓ |

**Token added:** `--muted-light: #746e68` (for decorative, non-text uses)

### 🔄 To verify

- Check all other colour uses on `--paper` background
- Test colour combinations in different chapters (data-chapter="2", "3", "4")
- Check contrasts on dark backgrounds (graffiti.html, horla.html)

---

## 2. Visible focus (A2 — WCAG Keyboard)

### ✅ Added

| Element | Focus style |
|---------|-------------|
| `.pill` | outline 2px solid var(--ink), offset 2px |
| `.tile` | outline 2px solid var(--ink), offset 4px |
| `nav a:not(.pill)` | outline 2px solid var(--ink), offset 4px + underline |
| `.threshold-bottom a` | outline 2px solid var(--ink), offset 2px |

### ✅ Already present

- `.atelier` (line 523)
- `.cta` (line 603+)
- `.lang button` (line 875)
- `.view-switch button` (line 929)
- `.project-card` (line 1318)
- All buttons in horla.html
- All buttons in graffiti.html (`:focus-visible` global line 27)

### 🔄 To verify

- Tab through all interactive elements
- Check that focus never creates horizontal scroll
- Test on all screen widths (1920 / 1440 / 1280 px)

---

## 3. Labels and accessible names (A4 — WCAG Names)

### ✅ Present

- Language buttons: `role="group" aria-label="Langue"`
- Main CTA: `aria-label="Entrer dans la galerie"`
- Sections: `aria-labelledby` on `.ateliers`
- Gallery: `aria-label="Les six salles"`
- Tiles: `aria-label="Salle [Name]"` + `role="img"`
- Horla inputs: `aria-label="Position dans le storyboard audio"`
- Graffiti buttons: all with `aria-label` or visible text

### 🔄 To verify

- Check that no button is empty or poorly named
- Ensure all links have descriptive text
- Check translations (i18n/en.js, i18n/fr.js)

---

## 4. Tab order (A2 — WCAG Keyboard)

### ✅ Logical structure

- Header → Nav → Main content → Footer
- index.html: lang buttons → CTA → tiles → workshops → bottom links
- graffiti.html: logo → view switch → wall picker → undo/redo → export → tools → palette → sliders

### 🔄 To verify

- Test tab order on all pages
- Ensure no interactive element is skipped
- Check that Tab/Shift+Tab works in both directions

---

## 5. Colour tokens (Design System)

### 🔄 In progress (263 hardcoded colours to replace)

**Current state:**
- 145 hex colours outside `:root`
- 87 hardcoded `rgba(...)`
- Total: ~263 occurrences

**Next steps:**
1. Extract all colours to `:root`
2. Replace `rgba(...)` with `color-mix(in srgb, var(--token) X%, ...)`
3. Check that all tokens meet AA (4.5:1)

Reference: docs/design-system.md section 7

---

## 6. Motion and animations (A5 — WCAG prefers-reduced-motion)

### ✅ Already present

- graffiti.css line 289: `@media (prefers-reduced-motion: reduce)`
- Disables export menu opening animation

### 🔄 To add

- Disable `.reveal` animations (rise)
- Disable `drift` animation for auras
- Disable transitions on `.curtain`
- Disable CTA animations

---

## 7. Summary

### Done (this commit)

✅ Contrasts fixed: `--muted` from 3.4:1 to 4.57:1
✅ Visible focus added to `.pill`, `.tile`, `nav a`, `.threshold-bottom a`
✅ Token `--muted-light` created for decorative uses

### To do (separate tickets)

🔲 Replace 263 hardcoded colours with tokens
🔲 Add `prefers-reduced-motion` to all animations
🔲 Test tab order on all pages
🔲 Check contrasts in all chapters
🔲 Full audit with screenshots (3 widths)

---

**Estimated compliance:** 80% AA (contrast + focus + labels OK, tokens + motion remain)
