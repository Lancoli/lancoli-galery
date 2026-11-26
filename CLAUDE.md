# Lancoli — règles de l'app

Le site de l'artiste (voir [README.md](README.md)). Règles communes : [../CLAUDE.md](../CLAUDE.md).

## Règles propres

- **Positionnement** : un artiste engagé, quatre terrains d'action, un merch fait main. **Ne rien inventer** : pas de date,
  de collaboration, de chiffre ou de citation qui ne viennent pas de David.
- **Le son n'est plus ici** : tout ce qui est musique vit dans LancoliStudio.
- **Couleur couchant** : `--hit #f58a2e` (pochette Full Circle Revolution), dégradé vers `#7f2215`. Plus jamais de vert fluo.
- **Au survol, rien ne bouge** : ni translate, ni rotate, ni tilt sur les cartes ni leurs enfants (18 cas à corriger,
  voir `docs/design-baseline.json`).

## Vérifier

`node tools/jalons.mjs Lancoli` · `node tools/design-lint.mjs Lancoli` · `lancer liens Lancoli` (depuis la racine).
