# Lancoli — Design System Guide

> **Status: DRAFT (27/11/2026)** – The reference for Lancoli's visual identity, component catalogue, and layout rules.
> This guide follows the portfolio method ([../../docs/DESIGN-SYSTEM.md](../../docs/DESIGN-SYSTEM.md)) and UX principles
> ([../../docs/UX-PRINCIPLES.md](../../docs/UX-PRINCIPLES.md)). Check compliance: `node ../tools/design-lint.mjs Lancoli`
> from the portfolio root.

---

## 1. Current state (audit of CSS files, 26/11/2026)

| Measure | Current | Target |
|---|---|---|
| CSS files | 4 | 5 (tokens, base, components, layout, theme) |
| Total lines | 5,156 | ≤ 2,500 |
| Distinct hex colours | 81 | 0 outside `:root` |
| Hardcoded `rgba(...)` | 86 | 0 (all via `color-mix` on tokens) |
| Font sizes | 35 | ≤ 5 (scale: xs, s, m, l, xl) |
| Letter-spacing values | 18 | ≤ 3 |
| Clip-path polygons | 2 | 2 (kept: specific to Lancoli's identity) |
| Box-shadows | 24 | ≤ 4 levels |
| Transitions | 63 | ≤ 3 durations |
| Z-index values | 13 | ≤ 6 named layers |
| Border-radius values | 64 | 1 scale (0 / 4 / 8 / 12 / 16 px) |
| Hover with movement | 0 | 0 (rule: nothing moves on hover) |
| `!important` | 1 | 0 (exception: `prefers-reduced-motion`) |

**Current drift:** values scattered across files, duplicate colour definitions, no token system, overlapping styles.
The baseline (`design-baseline.json`) tracks these measures; the target is to match HAL's cleanliness level.

---

## 2. Portfolio UX rules (L1–L4, N1)

Lancoli follows the portfolio UX principles ([../../docs/UX-PRINCIPLES.md](../../docs/UX-PRINCIPLES.md)):

| Id | Rule | Application in Lancoli |
|---|---|---|
| **L1 · No overlap** | Two blocks never cover each other. Modal layers (lightbox, menu) dim or hide what is below. | Lightbox for project images; navigation menu (mobile) overlays with backdrop; no floating elements compete with open modals. Check: `audit-layout --strict` when implemented. |
| **L2 · One layer at a time** | Layer order is fixed (content < navigation < modal < overlay). When a layer opens, everything below yields (hidden or dimmed). | Layer stack: page content (z-index: 10) < navigation/cards (20) < lightbox/menu (30) < tooltips (40). Lightbox dims the page; mobile menu hides main content. |
| **L3 · Reserved zones** | Each element has a fixed zone by its expansion axis (DESIGN-SYSTEM rules 11–13). No user dragging to fix layout bugs. | Header at top, navigation bar below header, project cards in grid (flow downward), footer at bottom. Sidebars (if any) reserved for secondary navigation. No free placement. |
| **L4 · Harmony** | Spacing is balanced: top = bottom, left = right (± 2 px), from the spacing scale (4 · 8 · 12 · 16 · 24 · 32 px). Equal-rank elements get equal sizes and gaps. | Cards: 16 px padding all around; header: 12 px top/bottom; buttons: 8 px vertical, 16 px horizontal. All siblings in a grid get equal size unless one is marked as featured. Check: measure padding/margin in browser. |
| **N1 · Deterministic navigation** | Every screen state (view, open project, language, filters) is in the URL and replayed by it. Same URL ⇒ same screen. | Current: view ids (`#atelier`, `#mur`) in hash; language in `?lang=`. To add: open project id, active filters. Tests navigate by URL when implemented. |

---

## 3. Visual identity

### 3.1 Colour palette

The committed artist's signature: sunset colours (Full Circle Revolution cover), warm and grounded.

```css
:root {
  /* Brand: sunset gradient */
  --hit:        #f58a2e;  /* primary brand colour (Full Circle Revolution cover) */
  --sunset-end: #7f2215;  /* gradient endpoint (deep red-brown) */

  /* Base */
  --bg:         #1a1410;  /* page background (warm dark) */
  --bg-light:   #2a241f;  /* card/panel background */
  --ink:        #e8e3dc;  /* main text */
  --ink-dim:    #9a948c;  /* secondary text, metadata */
  --ink-faint:  #5a544c;  /* disabled, dividers */

  /* Accents */
  --accent:     var(--hit);     /* links, highlights, active states */
  --danger:     #c41e1e;        /* errors, destructive actions */
  --success:    #4a7c59;        /* confirmations */
}
```

**Derived colours** (via `color-mix`, no hardcoded `rgba`):

| Usage | Formula |
|---|---|
| Tinted background | `color-mix(in srgb, var(--accent) 8%, var(--bg-light))` |
| Border at rest | `color-mix(in srgb, var(--accent) 30%, transparent)` |
| Border active | `color-mix(in srgb, var(--accent) 70%, transparent)` |
| Accent text | `color-mix(in srgb, var(--accent) 80%, var(--ink))` |
| Overlay backdrop | `color-mix(in srgb, var(--bg) 80%, transparent)` |

**Rule:** No `#` colours or `rgba(...)` outside `tokens.css`. Fluorescent green is **banned** (old identity; replaced by sunset).

### 3.2 Typography

| Token | Value | Usage |
|---|---|---|
| `--font-body` | system-ui, -apple-system, 'Segoe UI', sans-serif | body text, UI |
| `--font-display` | Georgia, 'Times New Roman', serif | titles, quotes, artist statement |
| `--fs-xs` | 12 px | metadata, captions |
| `--fs-s` | 14 px | UI labels, secondary text |
| `--fs-m` | 16 px | body text (readable without zoom) |
| `--fs-l` | 24 px | section titles |
| `--fs-xl` | 36 px | page titles, featured quotes |

### 3.3 Spacing scale

`--sp-1: 4px` · `--sp-2: 8px` · `--sp-3: 12px` · `--sp-4: 16px` · `--sp-6: 24px` · `--sp-8: 32px`

**Gaps between cards:** `--sp-4` (16 px) on mobile, `--sp-6` (24 px) on desktop. **Padding inside cards:** `--sp-4`.

### 3.4 Layers (z-index)

| Token | Value | Usage |
|---|---|---|
| `--z-content` | 10 | page content, cards |
| `--z-nav` | 20 | header, navigation bar |
| `--z-modal` | 30 | lightbox, mobile menu |
| `--z-tooltip` | 40 | tooltips, notifications |

### 3.5 Transitions

`--t-fast: .2s` (hover, focus) · `--t-medium: .35s` (expand, slide) · `--t-slow: .5s` (page transition, fade-in)

One easing curve: `--ease: cubic-bezier(.25, .1, .25, 1)` (standard ease-in-out).

---

## 4. Component catalogue (closed)

A new component is added only after modifying this guide. A new need is first a **variant** of an existing component.

| Component | Class | Variants | Usage |
|---|---|---|
| **Card** | `.card` | `.card--featured` (larger, highlighted project) | project cards, approach sections |
| **Button** | `.btn` | `.btn--primary` (accent fill) · `.btn--ghost` (transparent) | CTA, navigation, actions |
| **Link** | `.link` | — | inline links in text, breadcrumb |
| **Tag** | `.tag` | — | project categories, keywords (not clickable) |
| **Lightbox** | `.lightbox` | — | full-screen image viewer |
| **Menu** | `.menu` | `.menu--mobile` (slide-in panel) | navigation on small screens |
| **Grid** | `.grid` | `.grid--auto` (auto-fit columns) | project gallery, merch |

**Rule:** A tag is **not** clickable; a button **always** is. Links are underlined in body text; plain in navigation.

---

## 5. Layout zones (L3)

Each element expands along one axis and stays in its zone.

| Zone | Expansion | Elements |
|---|---|---|
| **Header** | horizontal, fixed height | logo, site title, language toggle |
| **Navigation** | horizontal (desktop) / vertical (mobile) | main menu, breadcrumb |
| **Main** | vertical (downward) | page content, cards grid |
| **Aside** | vertical (desktop) / hidden (mobile) | secondary navigation, filters |
| **Footer** | horizontal, fixed height | credits, links, newsletter |

**On mobile (< 768 px):** navigation becomes a slide-in panel (`.menu--mobile`); aside is hidden or moved to footer.

---

## 6. Rules (checked by `design-lint`)

1. **One token, one source.** Colours, sizes, spacing, shadows, transitions, and layers come from `:root` (file `css/tokens.css`). No hardcoded values in components.
2. **Closed catalogue.** The components in section 4 are the only ones. A new need is first a variant (modifier class).
3. **Modify, never override.** Forbidden: a rule later in the file that cancels an earlier rule. Fix at the source.
4. **Context places, component styles.** `.card-grid .btn { … }` may set button position and width, not its appearance.
5. **Nothing moves on hover.** No `transform: translate/rotate/scale` in `:hover`. Change border, background, or shadow instead.
6. **Spacing harmony (L4).** Top space = bottom space, left = right (± 2 px), from the spacing scale only.
7. **Deterministic states.** Use attributes, not invented classes: `[aria-current]`, `[aria-expanded]`, `[disabled]`, `[data-state]`.

**Forbidden** (detected by `design-lint`):
- Colour `#…` or `rgba(…)` outside `css/tokens.css`
- `font-size`, `letter-spacing`, `z-index`, `transition` outside tokens
- `transform` in `:hover`
- `!important` (exception: `prefers-reduced-motion`)
- Pure white `#fff` for text (use `--ink`)

---

## 7. Files structure

```
css/
  tokens.css       colour palette, type scale, spacing, z-index, transitions (tokens only)
  base.css         reset, body, typography, focus, reduced-motion
  components.css   the catalogue (section 4), in alphabetical order
  layout.css       zones (header, nav, main, aside, footer): position and size only
  theme.css        Lancoli-specific theming (gradients, decorative elements)
```

Old scattered styles (`css/*.css`) will be consolidated into these five files.

---

## 8. Migration plan (staged)

| Step | Content | Check |
|---|---|---|
| 1 | Extract all colours, sizes, spacing to `tokens.css` | captures before/after are visually identical |
| 2 | Replace all hex/rgba with tokens or `color-mix` | `design-lint`: 0 hardcoded colours |
| 3 | Consolidate buttons and links | reference pages (home, projets, contact) match captures |
| 4 | Build component catalogue (cards, tags, lightbox, menu) | all pages use catalogue classes |
| 5 | Layers and z-index from tokens | `design-lint`: 0 hardcoded z-index |
| 6 | Delete old CSS files, split into 5 new files | total ≤ 2,500 lines, `design-lint` green |

**Reference pages** (captured at each step): home (`index.html`), projects (`projets.html`), graffiti (`graffiti.html`), contact (`contact.html`).

**Concurrency:** another session may edit pages or CSS. Each step commits alone, touching only the files modified.

---

## 9. Decisions (27/11/2026)

1. **Sunset colour as primary brand.** `--hit: #f58a2e` (Full Circle Revolution cover), gradient to `#7f2215`. Fluorescent green removed.
2. **Nothing moves on hover.** The 18 cases in `design-baseline.json` (`survolQuiBouge: 0`) must stay at 0. Use border, shadow, or background colour change instead.
3. **Handmade merch identity.** Cards for merch items carry warmth (rounded corners allowed for product photos, unlike the angular cards for graffiti projects).
4. **Language toggle.** French is default (`i18n/fr.js`); English via `?lang=en` or saved preference. The toggle is a button in the header, not a dropdown.
5. **Page names stay French.** Public HTML pages keep their French names (`projets.html`, `soutien.html`) because their URLs are live. All code, comments, and new files are English.

---

## 10. Notes for interface changes

Before any UI change:
1. Read this guide (all sections).
2. Read [../../docs/DESIGN-SYSTEM.md](../../docs/DESIGN-SYSTEM.md) (the common method).
3. Read [../../docs/UX-PRINCIPLES.md](../../docs/UX-PRINCIPLES.md) (L1–L4, H1–H10, accessibility).
4. After the change: take captures (1920 / 1440 / 1280 px wide, same routes as reference pages), review rule by rule.
5. Run `node ../tools/design-lint.mjs Lancoli` from the portfolio root. Must not increase the baseline.
6. Any defect seen but not fixed (out of scope, too large) becomes a ticket in the registre, not a lost sentence.

**Skill to use after a visual change:** `verifier-design` (runs lint, compares baseline, generates report).
