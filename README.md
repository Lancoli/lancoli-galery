# Lancoli

The website of Lancoli, a committed artist: his approach, his four grounds of action, his projects (graffiti, leaflets,
Horla, Lyon, Leaving Home…) and his handmade merch.

Pages: home, approach (`demarche.html`), projects, leaflets (`feuillets.html`), graffiti, Horla, Leaving Home, Lyon,
contact. Public page names stay French: their addresses are live.

## Run

Static site, no build step.

- **With the whole portfolio**: `lancer.cmd` at the portfolio root, then http://localhost:4101/Lancoli/
- **In Docker** (as online): `lancer docker`, then http://localhost:8080/Lancoli/
- **Alone**: any static server opened in this folder (paths are relative).

## Languages

The HTML carries the French (readable without script, indexable); `js/i18n/fr.js` and `js/i18n/en.js` carry every
visitor sentence under the same key, applied by `js/i18n.js` (`?lang=en`, or the visitor's saved choice).
Check: `node tools/i18n-check.js` (same keys on both sides, every key used exists, the HTML French matches the dictionary).

## Quality

This project follows the portfolio milestones (`docs/JALONS.md` at the root): its goals and state are in `jalons.json`.
Check: `node tools/jalons.mjs Lancoli` from the portfolio root.
