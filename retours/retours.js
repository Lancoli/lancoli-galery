// Les retours : un bouton « Dire à Claude » posé sur le site, pour noter ce qu'il faut corriger pendant qu'on s'en sert,
// comme un visiteur. Chaque note devient un ticket (Supabase, projet lancoli-retours), que Claude traite
// (tools/retours.mjs, tools/RETOURS.md) : il le prend, corrige, commite, répond ici ; on valide ou on renvoie.
//
// Qui le voit : seulement un navigateur activé. On l'active une fois par https://<site>/?retours=<jeton>
// (le jeton du .env, RETOURS_JETON) ; il reste dans ce navigateur (localStorage) et disparaît de l'adresse.
// ?retours=off le désactive. Sans jeton, rien ne se charge : un visiteur ne voit jamais ce bouton.
// La dictée : le micro du navigateur (Chrome, Edge ; il faut https ou localhost). Sur téléphone, le micro du clavier
// fait aussi bien. Chaque ticket emporte son contexte : la page, le mode, l'écran, le thème, la version, ce qui joue,
// le texte sélectionné, et l'élément pointé (« Pointer » puis un clic sur la page).
// Module partagé : la source est Portfolio/retours/widget/ ; `node retours/installer.mjs` la recopie dans chaque app
// (ne pas modifier la copie). La config : window.RETOURS = { app, url, cle, theme } (retours-config.js, écrit par
// l'installeur), sinon window.STUDIO.retours (Lancoli Studio, par le .env). theme = des variables CSS (--retours-…).
(() => {
    const ICI = (document.currentScript && document.currentScript.src) || '';
    const S = window.STUDIO || { version: '', env: '' };
    const R = window.RETOURS || (window.STUDIO && window.STUDIO.retours && { app: 'lancoli-studio', ...window.STUDIO.retours });
    if (!R || R.on === false || !R.url || !R.cle) return;
    // l'app visée : celle de la page ; le tableau de bord la change (window.Retours.ouvrir('jondi'))
    let app = R.app || 'lancoli-studio';

    const CLE = 'lancoli:retours-jeton';
    const BROUILLON = 'lancoli:retours-brouillon';
    const store = {
        get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
        set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } },
        drop: (k) => { try { localStorage.removeItem(k); } catch { /* idem */ } }
    };

    // l'activation par l'adresse : le jeton est gardé, puis retiré de la barre d'adresse
    const params = new URLSearchParams(location.search);
    if (params.has('retours')) {
        const v = params.get('retours');
        if (v === 'off') store.drop(CLE);
        else if (v) store.set(CLE, v);
        params.delete('retours');
        const reste = params.toString();
        history.replaceState(history.state, '', location.pathname + (reste ? `?${reste}` : '') + location.hash);
    }
    const jeton = store.get(CLE);
    if (!jeton) return;
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = ICI ? new URL('retours.css', ICI).href : `${R.base || ''}retours.css`;
    document.head.append(css);

    // ---------- L'API : PostgREST, le jeton en en-tête (les règles RLS le vérifient) ----------
    const api = async (chemin, { method = 'GET', body, prefer } = {}) => {
        const res = await fetch(`${R.url}/rest/v1/${chemin}`, {
            method,
            headers: {
                apikey: R.cle,
                'x-retours-jeton': jeton,
                'Content-Type': 'application/json',
                ...(prefer ? { Prefer: prefer } : {})
            },
            body: body ? JSON.stringify(body) : undefined
        });
        if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
        return res.status === 204 ? null : res.json();
    };

    const el = (tag, className, text) => {
        const n = document.createElement(tag);
        if (className) n.className = className;
        if (text != null) n.textContent = text;
        return n;
    };
    const bouton = (className, text, label) => {
        const b = el('button', className, text);
        b.type = 'button';
        if (label) b.setAttribute('aria-label', label);
        return b;
    };

    // ---------- Le contexte : ce que Claude doit savoir pour retrouver le problème ----------
    let pointe = null;
    const decrire = (n) => {
        if (!n || n.nodeType !== 1) return null;
        const chemin = [];
        for (let x = n; x && x !== document.body && chemin.length < 5; x = x.parentElement) {
            chemin.unshift(x.tagName.toLowerCase() + (x.id ? `#${x.id}` : '') + [...x.classList].slice(0, 3).map((c) => `.${c}`).join(''));
        }
        const r = n.getBoundingClientRect();
        return {
            chemin: chemin.join(' > '),
            texte: (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
            boite: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`
        };
    };
    const contexte = () => {
        const L = window.Lecteur;
        const st = L && L.state;
        const piste = st && st.file ? ((st.file.tracks[st.index] || {}).title || st.file.title) : '';
        const sel = (getSelection && String(getSelection())).trim().slice(0, 400);
        return {
            version: S.version,
            env: S.env,
            mode: document.body.dataset.mode || '',
            theme: document.documentElement.classList.contains('nuit') ? 'nuit' : 'jour',
            ecran: `${innerWidth}×${innerHeight} @${devicePixelRatio || 1}`,
            defilement: Math.round(scrollY),
            appareil: /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'téléphone' : 'ordinateur',
            navigateur: (navigator.userAgent.match(/(Firefox|Edg|OPR|Chrome|Safari)\/[\d.]+/) || [''])[0],
            lecture: piste ? `${piste}${st.playing ? ' (en lecture)' : ''}` : '',
            selection: sel || undefined,
            element: pointe || undefined
        };
    };

    // ---------- Le bouton et le panneau ----------
    const racine = el('div', 'retours');
    racine.setAttribute('data-retours', '');
    Object.entries(R.theme || {}).forEach(([k, v]) => racine.style.setProperty(k, v));
    const ouvrir = bouton('retours-ouvrir', 'Dire à Claude', 'Noter une correction pour Claude');
    const panneau = el('section', 'retours-panneau');
    panneau.hidden = true;
    panneau.setAttribute('aria-label', 'Noter une correction');

    const tete = el('div', 'retours-tete');
    const titre = el('strong', 'retours-titre', 'Dire à Claude');
    const onglets = el('div', 'retours-onglets');
    const ongletNoter = bouton('retours-onglet is-actif', 'Noter');
    const ongletSuivi = bouton('retours-onglet', 'Suivi');
    const fermer = bouton('retours-fermer', '×', 'Fermer');
    onglets.append(ongletNoter, ongletSuivi);
    tete.append(titre, onglets, fermer);

    // -- noter --
    const vueNoter = el('div', 'retours-vue');
    const zone = el('textarea', 'retours-texte');
    zone.rows = 6;
    zone.placeholder = 'Ce qui ne va pas, ce qu’il faut changer… (ou dicte avec le micro)';
    zone.value = store.get(BROUILLON) || '';
    zone.addEventListener('input', () => store.set(BROUILLON, zone.value));
    const outils = el('div', 'retours-outils');
    const micro = bouton('retours-micro', 'Dicter', 'Dicter au micro');
    const pointer = bouton('retours-pointer', 'Pointer', 'Pointer un élément de la page');
    const urgent = el('label', 'retours-urgent');
    const caseUrgent = el('input');
    caseUrgent.type = 'checkbox';
    urgent.append(caseUrgent, document.createTextNode(' Urgent'));
    outils.append(micro, pointer, urgent);
    const vise = el('p', 'retours-vise');
    vise.hidden = true;
    const pied = el('div', 'retours-pied');
    const envoyer = bouton('retours-envoyer', 'Envoyer');
    const etat = el('p', 'retours-etat');
    etat.setAttribute('role', 'status');
    pied.append(envoyer, etat);
    vueNoter.append(zone, outils, vise, pied);

    // -- suivi --
    const vueSuivi = el('div', 'retours-vue');
    vueSuivi.hidden = true;
    const outilsSuivi = el('div', 'retours-outils');
    const rafraichir = bouton('retours-petit', 'Rafraîchir');
    const toutCopier = bouton('retours-petit', 'Copier les ouverts');
    outilsSuivi.append(rafraichir, toutCopier);
    const liste = el('ol', 'retours-liste');
    vueSuivi.append(outilsSuivi, liste);

    panneau.append(tete, vueNoter, vueSuivi);
    racine.append(panneau, ouvrir);
    document.body.append(racine);

    const montrer = (vue) => {
        vueNoter.hidden = vue !== 'noter';
        vueSuivi.hidden = vue !== 'suivi';
        ongletNoter.classList.toggle('is-actif', vue === 'noter');
        ongletSuivi.classList.toggle('is-actif', vue === 'suivi');
        if (vue === 'suivi') charger();
    };
    ongletNoter.addEventListener('click', () => montrer('noter'));
    ongletSuivi.addEventListener('click', () => montrer('suivi'));
    ouvrir.addEventListener('click', () => {
        panneau.hidden = !panneau.hidden;
        ouvrir.setAttribute('aria-expanded', String(!panneau.hidden));
        if (!panneau.hidden && !vueNoter.hidden) zone.focus();
    });
    fermer.addEventListener('click', () => { panneau.hidden = true; arreterMicro(); });

    const dire = (texte, classe = '') => { etat.textContent = texte; etat.className = `retours-etat ${classe}`; };

    // ---------- La dictée (Web Speech API) ----------
    const Reco = window.SpeechRecognition || window.webkitSpeechRecognition;
    let reco = null;
    let base = '';
    const arreterMicro = () => { if (reco) { reco.stop(); } };
    if (!Reco || !isSecureContext) {
        micro.disabled = true;
        micro.title = 'Dictée indisponible ici (il faut Chrome ou Edge, en https ou localhost). Le micro du clavier marche aussi.';
    } else {
        micro.addEventListener('click', () => {
            if (reco) { arreterMicro(); return; }
            reco = new Reco();
            reco.lang = 'fr-FR';
            reco.continuous = true;
            reco.interimResults = true;
            base = zone.value ? zone.value.replace(/\s*$/, ' ') : '';
            let fixe = '';
            reco.onresult = (e) => {
                let provisoire = '';
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    const t = e.results[i][0].transcript;
                    if (e.results[i].isFinal) fixe += t; else provisoire += t;
                }
                zone.value = base + fixe + provisoire;
                store.set(BROUILLON, zone.value);
            };
            reco.onend = () => { reco = null; micro.classList.remove('is-actif'); micro.textContent = 'Dicter'; };
            reco.onerror = (e) => dire(e.error === 'not-allowed' ? 'Micro refusé par le navigateur.' : `Dictée : ${e.error}`, 'is-erreur');
            reco.start();
            micro.classList.add('is-actif');
            micro.textContent = 'Stop';
        });
    }

    // ---------- Pointer un élément : le prochain clic sur la page le désigne ----------
    let marque = null;
    pointer.addEventListener('click', () => {
        dire('Clique sur l’élément concerné…');
        document.documentElement.classList.add('retours-visee');
        const viser = (e) => {
            if (e.target.closest('[data-retours]')) return;
            e.preventDefault();
            e.stopPropagation();
            document.removeEventListener('click', viser, true);
            document.documentElement.classList.remove('retours-visee');
            pointe = decrire(e.target);
            if (marque) marque.classList.remove('retours-marque');
            marque = e.target;
            marque.classList.add('retours-marque');
            vise.hidden = false;
            vise.textContent = `Élément : ${pointe.chemin}${pointe.texte ? ` « ${pointe.texte.slice(0, 60)} »` : ''}`;
            dire('');
            zone.focus();
        };
        document.addEventListener('click', viser, true);
    });

    // ---------- Envoyer ----------
    const page = () => location.pathname.split('/').pop() || 'index.html';
    envoyer.addEventListener('click', async () => {
        const texte = zone.value.trim();
        if (!texte) { dire('Écris (ou dicte) d’abord ce qu’il faut corriger.', 'is-erreur'); return; }
        arreterMicro();
        envoyer.disabled = true;
        dire('Envoi…');
        // une suite (« Pas bon », « Répondre ») : le nouveau ticket renvoie à l'ancien, qui passe en refusé
        const suite = Number(zone.dataset.suite) || null;
        try {
            const [t] = await api('tickets', {
                method: 'POST',
                prefer: 'return=representation',
                body: { texte, page: page() + location.hash, url: location.href.slice(0, 1000), app, contexte: contexte(), priorite: caseUrgent.checked ? 'urgente' : 'normale', suite_de: suite }
            });
            if (suite) { delete zone.dataset.suite; await maj(suite, { statut: 'refuse' }); }
            zone.value = '';
            store.drop(BROUILLON);
            caseUrgent.checked = false;
            pointe = null;
            vise.hidden = true;
            if (marque) { marque.classList.remove('retours-marque'); marque = null; }
            dire(`Ticket #${t.id} envoyé.`, 'is-ok');
        } catch (err) {
            dire(`Pas envoyé : ${err.message}. Le texte est gardé.`, 'is-erreur');
        } finally {
            envoyer.disabled = false;
        }
    });

    // ---------- Le suivi : les tickets, leur statut, la réponse de Claude ----------
    const STATUTS = { nouveau: 'À faire', en_cours: 'En cours', a_verifier: 'À vérifier', question: 'Question', fait: 'Fait', refuse: 'Refusé' };
    const enTexte = (t) => `#${t.id} [${STATUTS[t.statut] || t.statut}${t.priorite === 'urgente' ? ', urgent' : ''}] ${t.page || ''}\n${t.texte}`
        + `\nContexte : ${JSON.stringify(t.contexte)}${t.reponse ? `\nRéponse : ${t.reponse}` : ''}`;
    const copier = async (texte, n) => {
        try { await navigator.clipboard.writeText(texte); dire(`${n} copié${n > 1 ? 's' : ''}.`, 'is-ok'); } catch { dire('Copie refusée par le navigateur.', 'is-erreur'); }
    };
    let tickets = [];
    async function charger() {
        liste.replaceChildren(el('li', 'retours-vide', 'Chargement…'));
        try {
            tickets = await api(`tickets?select=*&app=eq.${app}&order=cree_le.desc&limit=40`);
        } catch (err) {
            liste.replaceChildren(el('li', 'retours-vide', `Impossible de charger : ${err.message}`));
            return;
        }
        liste.replaceChildren();
        if (!tickets.length) liste.append(el('li', 'retours-vide', 'Aucun ticket pour l’instant.'));
        tickets.forEach((t) => {
            const li = el('li', `retours-ticket is-${t.statut}`);
            const haut = el('div', 'retours-ticket-haut');
            haut.append(el('span', 'retours-statut', STATUTS[t.statut] || t.statut), el('span', 'retours-meta',
                `#${t.id} · ${new Date(t.cree_le).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${t.page || ''}${t.priorite === 'urgente' ? ' · urgent' : ''}`));
            li.append(haut, el('p', 'retours-ticket-texte', t.texte));
            if (t.reponse) {
                const rep = el('p', 'retours-reponse');
                rep.append(el('strong', null, 'Claude : '), document.createTextNode(t.reponse));
                li.append(rep);
            }
            const actions = el('div', 'retours-actions');
            const cp = bouton('retours-petit', 'Copier');
            cp.addEventListener('click', () => copier(enTexte(t), 1));
            actions.append(cp);
            if (t.statut === 'a_verifier' || t.statut === 'question') {
                const ok = bouton('retours-petit is-ok', 'C’est bon');
                ok.addEventListener('click', async () => { await maj(t.id, { statut: 'fait' }); charger(); });
                const pasBon = bouton('retours-petit', t.statut === 'question' ? 'Répondre' : 'Pas bon');
                pasBon.addEventListener('click', () => {
                    montrer('noter');
                    zone.value = `Suite du ticket #${t.id} : `;
                    zone.dataset.suite = String(t.id);
                    zone.focus();
                });
                actions.append(ok, pasBon);
            }
            li.append(actions);
            liste.append(li);
        });
    }
    const maj = async (id, champs) => {
        try { await api(`tickets?id=eq.${id}`, { method: 'PATCH', body: champs }); } catch (err) { dire(err.message, 'is-erreur'); }
    };
    rafraichir.addEventListener('click', charger);
    // pour le tableau de bord : ouvrir le panneau sur une app donnée
    window.Retours = {
        ouvrir(cible, vue = 'noter') {
            if (cible) app = cible;
            titre.textContent = cible && cible !== R.app ? `Dire à Claude · ${cible}` : 'Dire à Claude';
            panneau.hidden = false;
            montrer(vue);
            if (vue === 'noter') zone.focus();
        }
    };
    toutCopier.addEventListener('click', () => {
        const ouverts = tickets.filter((t) => !['fait', 'refuse'].includes(t.statut));
        copier(ouverts.map(enTexte).join('\n\n---\n\n'), ouverts.length);
    });
})();
