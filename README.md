# Lancoli

Le site de Lancoli, artiste engagé : sa démarche, ses quatre terrains d'action, ses projets (graffiti, feuillets, Horla, Lyon, Leaving Home…) et son merch fait main.

Pages : accueil, démarche, projets, feuillets, graffiti, Horla, Leaving Home, Lyon, contact.

## Lancer

Site statique, sans étape de construction.

- **Avec tout le portfolio** : `lancer.cmd` à la racine du portfolio, puis http://localhost:4101/Lancoli/
- **Dans Docker** (comme en ligne) : `lancer docker`, puis http://localhost:8080/Lancoli/
- **Seul** : n'importe quel serveur statique ouvert dans ce dossier (les chemins sont relatifs).

## Qualité

Ce projet suit les jalons du portfolio (`docs/JALONS.md` à la racine) : ses objectifs et son état sont dans `jalons.json`.
Vérification : `node tools/jalons.mjs Lancoli` depuis la racine du portfolio.
