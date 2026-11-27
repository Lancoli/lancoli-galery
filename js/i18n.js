// Translation: the HTML carries the French (readable without script, indexable), the i18n/*.js dictionaries
// carry each sentence under a key. This script replaces the text of the marked elements:
//   data-i18n="key"                  → element text
//   data-i18n-html="key"             → content with tags (trusted dictionaries only)
//   data-i18n-attr="attribute:key; …" → attributes (aria-label, alt, title…)
// Load after the dictionaries and before lancoli.js, which reads some texts on start.
(() => {
    const dictionaries = window.LANCOLI_I18N || {};
    const SUPPORTED = ['fr', 'en'];
    const FALLBACK = 'fr';
    const STORE = 'lancoli-lang';

    // language: ?lang=en in the address, else the last choice, else French
    const pick = () => {
        const asked = new URLSearchParams(location.search).get('lang');
        if (SUPPORTED.includes(asked)) return asked;
        try {
            const saved = localStorage.getItem(STORE);
            if (SUPPORTED.includes(saved)) return saved;
        } catch (error) { /* storage unavailable */ }
        return FALLBACK;
    };
    const lang = pick();

    // a missing key falls back to French, then to the key itself (visible: the gap shows)
    const t = (key) => {
        const own = dictionaries[lang] || {};
        if (key in own) return own[key];
        const base = dictionaries[FALLBACK] || {};
        if (key in base) return base[key];
        console.warn(`[i18n] clé inconnue : ${key}`);
        return key;
    };
    window.lancoliT = t;
    window.lancoliLang = lang;

    document.documentElement.lang = lang;
    // in French the HTML is already right: the text is only touched for another language
    if (lang !== FALLBACK) {
        document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n); });
        document.querySelectorAll('[data-i18n-html]').forEach((node) => { node.innerHTML = t(node.dataset.i18nHtml); });
        document.querySelectorAll('[data-i18n-attr]').forEach((node) => {
            node.dataset.i18nAttr.split(';').forEach((pair) => {
                const [attribute, key] = pair.split(':').map((part) => part.trim());
                if (attribute && key) node.setAttribute(attribute, t(key));
            });
        });
    }

    // switch: save the choice and reload, so that script-built texts follow too
    document.querySelectorAll('[data-lang]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
        button.addEventListener('click', () => {
            if (button.dataset.lang === lang) return;
            try { localStorage.setItem(STORE, button.dataset.lang); } catch (error) { /* storage unavailable */ }
            const url = new URL(location.href);
            url.searchParams.delete('lang');
            location.replace(url);
        });
    });
})();
