# Lancoli — app rules

The artist's website (see [README.md](README.md)). Shared rules: [../CLAUDE.md](../CLAUDE.md).

## Own rules

- **Positioning**: a committed artist, four grounds of action, handmade merch. **Invent nothing**: no date,
  collaboration, figure or quote that does not come from David.
- **Sound no longer lives here**: everything music lives in LancoliStudio.
- **Sunset colour**: `--hit #f58a2e` (Full Circle Revolution cover), gradient towards `#7f2215`. Never fluorescent green again.
- **On hover, nothing moves**: no translate, rotate or tilt on cards or their children (18 cases to fix,
  see `docs/design-baseline.json`).
- **Languages**: code, comments and docs in English. Every visitor sentence goes into both `js/i18n/fr.js` and
  `js/i18n/en.js` (same key); `node tools/i18n-check.js` must stay at 0 errors. View ids and DOM ids that are still
  French (`atelier`, `mur`, `brique`) wait for the next i18n pass.

## Check

`node tools/i18n-check.js` · `node tools/jalons.mjs Lancoli` · `node tools/design-lint.mjs Lancoli` · `lancer liens Lancoli` (from the root).
