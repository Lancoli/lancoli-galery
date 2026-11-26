// Vérifie la traduction du site. À lancer depuis le dossier Lancoli : node tools/i18n-check.js
//   1. fr.js et en.js portent exactement les mêmes clés ;
//   2. chaque clé utilisée dans une page existe dans les dictionnaires ;
//   3. le texte français écrit dans le HTML est bien celui du dictionnaire ;
//   4. aucune clé ne traîne sans être utilisée.
// Sort avec le code 1 s'il y a une erreur (pratique en intégration continue).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = { window: {} };
for (const file of ['js/i18n/fr.js', 'js/i18n/en.js']) vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox);
const { fr, en } = sandbox.window.LANCOLI_I18N;

const errors = [];
const warnings = [];
const flat = (text) => text.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// 1. mêmes clés des deux côtés
for (const key of Object.keys(fr)) if (!(key in en)) errors.push(`en.js : clé manquante « ${key} »`);
for (const key of Object.keys(en)) if (!(key in fr)) errors.push(`fr.js : clé manquante « ${key} »`);

// 2 et 3. les pages
const used = new Set();
const pages = fs.readdirSync(root).filter((name) => name.endsWith('.html'));
for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const need = (key, where) => {
        used.add(key);
        if (!(key in fr)) errors.push(`${page} : clé inconnue « ${key} » (${where})`);
    };
    // texte ou contenu : <balise … data-i18n="clé" …>texte</balise>
    for (const match of html.matchAll(/<(\w+)\b[^>]*\bdata-i18n(-html)?="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)) {
        const [, , isHtml, key, inner] = match;
        need(key, isHtml ? 'data-i18n-html' : 'data-i18n');
        if (key in fr && flat(inner) !== flat(fr[key])) {
            errors.push(`${page} : le texte de « ${key} » diffère du dictionnaire\n      page : ${flat(inner)}\n      fr.js : ${flat(fr[key])}`);
        }
    }
    // attributs : data-i18n-attr="aria-label:clé; title:clé"
    for (const match of html.matchAll(/<[^>]*\bdata-i18n-attr="([^"]+)"[^>]*>/g)) {
        for (const pair of match[1].split(';')) {
            const [attribute, key] = pair.split(':').map((part) => part.trim());
            if (!attribute || !key) continue;
            need(key, `attribut ${attribute}`);
            const value = new RegExp(`\\s${attribute}="([^"]*)"`).exec(match[0]);
            if (key in fr && value && flat(value[1]) !== flat(fr[key])) {
                errors.push(`${page} : l'attribut ${attribute} de « ${key} » diffère du dictionnaire`);
            }
        }
    }
}

// 4. clés orphelines
for (const key of Object.keys(fr)) if (!used.has(key)) warnings.push(`clé jamais utilisée : « ${key} »`);

warnings.forEach((line) => console.log('  ! ' + line));
errors.forEach((line) => console.log('  ✗ ' + line));
console.log(`${Object.keys(fr).length} clés, ${pages.length} pages, ${errors.length} erreur(s), ${warnings.length} avertissement(s).`);
process.exit(errors.length ? 1 : 0);
