// Traduction : le HTML porte le français (lisible sans script, indexable), les dictionnaires i18n/*.js
// portent chaque phrase sous une clé. Ce script remplace le texte des éléments marqués :
//   data-i18n="clé"                  → texte de l'élément
//   data-i18n-html="clé"             → contenu avec balises (dictionnaires de confiance uniquement)
//   data-i18n-attr="attribut:clé; …" → attributs (aria-label, alt, title…)
// À charger après les dictionnaires et avant lancoli.js, qui lit certains textes au démarrage.
(() => {
    const dictionaries = window.LANCOLI_I18N || {};
    const SUPPORTED = ['fr', 'en'];
    const FALLBACK = 'fr';
    const STORE = 'lancoli-lang';

    // langue : ?lang=en dans l'adresse, sinon le dernier choix, sinon le français
    const pick = () => {
        const asked = new URLSearchParams(location.search).get('lang');
        if (SUPPORTED.includes(asked)) return asked;
        try {
            const saved = localStorage.getItem(STORE);
            if (SUPPORTED.includes(saved)) return saved;
        } catch (error) { /* stockage indisponible */ }
        return FALLBACK;
    };
    const lang = pick();

    // une clé absente retombe sur le français, puis sur la clé elle-même (visible : l'oubli se voit)
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
    // en français le HTML est déjà juste : on ne touche au texte que pour une autre langue
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

    // sélecteur : on enregistre le choix et on recharge, pour que les textes construits par script suivent aussi
    document.querySelectorAll('[data-lang]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
        button.addEventListener('click', () => {
            if (button.dataset.lang === lang) return;
            try { localStorage.setItem(STORE, button.dataset.lang); } catch (error) { /* stockage indisponible */ }
            const url = new URL(location.href);
            url.searchParams.delete('lang');
            location.replace(url);
        });
    });
})();
