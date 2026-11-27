// Checks the site's translation. Run from the Lancoli folder: node tools/i18n-check.js
//   1. fr.js and en.js carry exactly the same keys;
//   2. every key used in a page exists in the dictionaries;
//   3. the French text written in the HTML is the dictionary's;
//   4. no key lingers unused.
// Exits with code 1 on any error (handy in continuous integration).
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

// 1. same keys on both sides
for (const key of Object.keys(fr)) if (!(key in en)) errors.push(`en.js: missing key "${key}"`);
for (const key of Object.keys(en)) if (!(key in fr)) errors.push(`fr.js: missing key "${key}"`);

// 2 and 3. the pages
const used = new Set();
const pages = fs.readdirSync(root).filter((name) => name.endsWith('.html'));
for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const need = (key, where) => {
        used.add(key);
        if (!(key in fr)) errors.push(`${page}: unknown key "${key}" (${where})`);
    };
    // text or content: <tag … data-i18n="key" …>text</tag>
    for (const match of html.matchAll(/<(\w+)\b[^>]*\bdata-i18n(-html)?="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)) {
        const [, , isHtml, key, inner] = match;
        need(key, isHtml ? 'data-i18n-html' : 'data-i18n');
        if (key in fr && flat(inner) !== flat(fr[key])) {
            errors.push(`${page}: the text of "${key}" differs from the dictionary\n      page : ${flat(inner)}\n      fr.js: ${flat(fr[key])}`);
        }
    }
    // attributes: data-i18n-attr="aria-label:key; title:key"
    for (const match of html.matchAll(/<[^>]*\bdata-i18n-attr="([^"]+)"[^>]*>/g)) {
        for (const pair of match[1].split(';')) {
            const [attribute, key] = pair.split(':').map((part) => part.trim());
            if (!attribute || !key) continue;
            need(key, `attribut ${attribute}`);
            const value = new RegExp(`\\s${attribute}="([^"]*)"`).exec(match[0]);
            if (key in fr && value && flat(value[1]) !== flat(fr[key])) {
                errors.push(`${page}: attribute ${attribute} of "${key}" differs from the dictionary`);
            }
        }
    }
}

// 4. orphan keys
for (const key of Object.keys(fr)) if (!used.has(key)) warnings.push(`key never used: "${key}"`);

warnings.forEach((line) => console.log('  ! ' + line));
errors.forEach((line) => console.log('  ✗ ' + line));
console.log(`${Object.keys(fr).length} keys, ${pages.length} pages, ${errors.length} error(s), ${warnings.length} warning(s).`);
process.exit(errors.length ? 1 : 0);
