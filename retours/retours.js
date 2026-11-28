// Feedback widget: a "Tell Claude" button on the site, to note what needs fixing while using it,
// like a visitor. Each note becomes a ticket (Supabase, lancoli-retours project), that Claude handles
// (tools/retours.mjs, tools/RETOURS.md): takes it, fixes, commits, answers here; we validate or send back.
//
// Who sees it: only an activated browser. Activate once via https://<site>/?retours=<token>
// (the token from .env, RETOURS_JETON); it stays in that browser (localStorage) and vanishes from the address.
// ?retours=off deactivates it. Without token, nothing loads: a visitor never sees this button.
// Dictation: browser microphone (Chrome, Edge; requires https or localhost). On phone, keyboard mic
// works fine too. Each ticket carries its context: page, mode, screen, theme, version, what's playing,
// selected text, and pointed element ("Point" then click on page).
// Shared module: source is Portfolio/retours/widget/; `node retours/installer.mjs` copies it into each app
// (don't modify the copy). Config: window.RETOURS = { app, url, cle, theme } (retours-config.js, written by
// installer), otherwise window.STUDIO.retours (Lancoli Studio, from .env). theme = CSS variables (--retours-…).
(() => {
    const ICI = (document.currentScript && document.currentScript.src) || '';
    const S = window.STUDIO || { version: '', env: '' };
    const R = window.RETOURS || (window.STUDIO && window.STUDIO.retours && { app: 'lancoli-studio', ...window.STUDIO.retours });
    if (!R || R.on === false || !R.url || !R.cle) return;
    // targeted app: the page's one; dashboard changes it (window.Retours.ouvrir('jondi'))
    let app = R.app || 'lancoli-studio';

    const CLE = 'lancoli:retours-jeton';
    const DRAFT = 'lancoli:retours-brouillon';
    const store = {
        get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
        set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private browsing */ } },
        drop: (k) => { try { localStorage.removeItem(k); } catch { /* same */ } }
    };

    // activation via URL: token is kept, then removed from address bar
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

    // ---------- API: PostgREST, token in header (RLS rules check it) ----------
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

    // ---------- Context: what Claude needs to know to find the issue ----------
    let pointed = null;
    const describe = (n) => {
        if (!n || n.nodeType !== 1) return null;
        const path = [];
        for (let x = n; x && x !== document.body && path.length < 5; x = x.parentElement) {
            path.unshift(x.tagName.toLowerCase() + (x.id ? `#${x.id}` : '') + [...x.classList].slice(0, 3).map((c) => `.${c}`).join(''));
        }
        const r = n.getBoundingClientRect();
        return {
            chemin: path.join(' > '),
            texte: (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
            boite: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`
        };
    };
    const context = () => {
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
            element: pointed || undefined
        };
    };

    // ---------- Button and panel ----------
    const root = el('div', 'retours');
    root.setAttribute('data-retours', '');
    Object.entries(R.theme || {}).forEach(([k, v]) => root.style.setProperty(k, v));
    const openBtn = bouton('retours-ouvrir', 'Tell Claude', 'Note a fix for Claude');
    const panel = el('section', 'retours-panneau');
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Note a fix');

    const head = el('div', 'retours-tete');
    const title = el('strong', 'retours-titre', 'Tell Claude');
    const tabs = el('div', 'retours-onglets');
    const tabNote = bouton('retours-onglet is-actif', 'Note');
    const tabTrack = bouton('retours-onglet', 'Track');
    const closeBtn = bouton('retours-fermer', '×', 'Close');
    tabs.append(tabNote, tabTrack);
    head.append(title, tabs, closeBtn);

    // -- note --
    const viewNote = el('div', 'retours-vue');
    const zone = el('textarea', 'retours-texte');
    zone.rows = 6;
    zone.placeholder = 'What's wrong, what needs changing… (or dictate with the mic)';
    zone.value = store.get(DRAFT) || '';
    zone.addEventListener('input', () => store.set(DRAFT, zone.value));
    const tools = el('div', 'retours-outils');
    const micBtn = bouton('retours-micro', 'Dictate', 'Dictate to microphone');
    const pointBtn = bouton('retours-pointer', 'Point', 'Point to a page element');
    const urgentLbl = el('label', 'retours-urgent');
    const urgentChk = el('input');
    urgentChk.type = 'checkbox';
    urgentLbl.append(urgentChk, document.createTextNode(' Urgent'));
    tools.append(micBtn, pointBtn, urgentLbl);
    const aimed = el('p', 'retours-vise');
    aimed.hidden = true;
    const footer = el('div', 'retours-pied');
    const sendBtn = bouton('retours-envoyer', 'Send');
    const statusEl = el('p', 'retours-etat');
    statusEl.setAttribute('role', 'status');
    footer.append(sendBtn, statusEl);
    viewNote.append(zone, tools, aimed, footer);

    // -- track --
    const viewTrack = el('div', 'retours-vue');
    viewTrack.hidden = true;
    const toolsTrack = el('div', 'retours-outils');
    const refreshBtn = bouton('retours-petit', 'Refresh');
    const copyAllBtn = bouton('retours-petit', 'Copy open');
    toolsTrack.append(refreshBtn, copyAllBtn);
    const list = el('ol', 'retours-liste');
    viewTrack.append(toolsTrack, list);

    panel.append(head, viewNote, viewTrack);
    root.append(panel, openBtn);
    document.body.append(root);

    const show = (view) => {
        viewNote.hidden = view !== 'note';
        viewTrack.hidden = view !== 'track';
        tabNote.classList.toggle('is-actif', view === 'note');
        tabTrack.classList.toggle('is-actif', view === 'track');
        if (view === 'track') load();
    };
    tabNote.addEventListener('click', () => show('note'));
    tabTrack.addEventListener('click', () => show('track'));
    openBtn.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        openBtn.setAttribute('aria-expanded', String(!panel.hidden));
        if (!panel.hidden && !viewNote.hidden) zone.focus();
    });
    closeBtn.addEventListener('click', () => { panel.hidden = true; stopMic(); });

    const say = (text, cls = '') => { statusEl.textContent = text; statusEl.className = `retours-etat ${cls}`; };

    // ---------- Dictation (Web Speech API) ----------
    const Reco = window.SpeechRecognition || window.webkitSpeechRecognition;
    let reco = null;
    let base = '';
    const stopMic = () => { if (reco) { reco.stop(); } };
    if (!Reco || !isSecureContext) {
        micBtn.disabled = true;
        micBtn.title = 'Dictation unavailable here (requires Chrome or Edge, on https or localhost). Your keyboard mic also works.';
    } else {
        micBtn.addEventListener('click', () => {
            if (reco) { stopMic(); return; }
            reco = new Reco();
            reco.lang = 'fr-FR';
            reco.continuous = true;
            reco.interimResults = true;
            base = zone.value ? zone.value.replace(/\s*$/, ' ') : '';
            let fixed = '';
            reco.onresult = (e) => {
                let interim = '';
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    const t = e.results[i][0].transcript;
                    if (e.results[i].isFinal) fixed += t; else interim += t;
                }
                zone.value = base + fixed + interim;
                store.set(DRAFT, zone.value);
            };
            reco.onend = () => { reco = null; micBtn.classList.remove('is-actif'); micBtn.textContent = 'Dictate'; };
            reco.onerror = (e) => say(e.error === 'not-allowed' ? 'Mic denied by browser.' : `Dictation: ${e.error}`, 'is-erreur');
            reco.start();
            micBtn.classList.add('is-actif');
            micBtn.textContent = 'Stop';
        });
    }

    // ---------- Point element: next click on page designates it ----------
    let mark = null;
    pointBtn.addEventListener('click', () => {
        say('Click on the element…');
        document.documentElement.classList.add('retours-visee');
        const aim = (e) => {
            if (e.target.closest('[data-retours]')) return;
            e.preventDefault();
            e.stopPropagation();
            document.removeEventListener('click', aim, true);
            document.documentElement.classList.remove('retours-visee');
            pointed = describe(e.target);
            if (mark) mark.classList.remove('retours-marque');
            mark = e.target;
            mark.classList.add('retours-marque');
            aimed.hidden = false;
            aimed.textContent = `Element: ${pointed.chemin}${pointed.texte ? ` « ${pointed.texte.slice(0, 60)} »` : ''}`;
            say('');
            zone.focus();
        };
        document.addEventListener('click', aim, true);
    });

    // ---------- Send ----------
    const page = () => location.pathname.split('/').pop() || 'index.html';
    sendBtn.addEventListener('click', async () => {
        const text = zone.value.trim();
        if (!text) { say('Write (or dictate) what needs fixing first.', 'is-erreur'); return; }
        stopMic();
        sendBtn.disabled = true;
        say('Sending…');
        // follow-up ("Not good", "Reply"): new ticket refers to old one, which becomes refused
        const followUp = Number(zone.dataset.suite) || null;
        try {
            const [t] = await api('tickets', {
                method: 'POST',
                prefer: 'return=representation',
                body: { texte: text, page: page() + location.hash, url: location.href.slice(0, 1000), app, contexte: context(), priorite: urgentChk.checked ? 'urgente' : 'normale', suite_de: followUp }
            });
            if (followUp) { delete zone.dataset.suite; await update(followUp, { statut: 'refuse' }); }
            zone.value = '';
            store.drop(DRAFT);
            urgentChk.checked = false;
            pointed = null;
            aimed.hidden = true;
            if (mark) { mark.classList.remove('retours-marque'); mark = null; }
            say(`Ticket #${t.id} sent.`, 'is-ok');
        } catch (err) {
            say(`Not sent: ${err.message}. Text kept.`, 'is-erreur');
        } finally {
            sendBtn.disabled = false;
        }
    });

    // ---------- Track: tickets, their status, Claude's reply ----------
    const STATUTS = { nouveau: 'To do', en_cours: 'In progress', a_verifier: 'To verify', question: 'Question', fait: 'Done', refuse: 'Refused' };
    const asText = (t) => `#${t.id} [${STATUTS[t.statut] || t.statut}${t.priorite === 'urgente' ? ', urgent' : ''}] ${t.page || ''}\n${t.texte}`
        + `\nContext: ${JSON.stringify(t.contexte)}${t.reponse ? `\nReply: ${t.reponse}` : ''}`;
    const copy = async (text, n) => {
        try { await navigator.clipboard.writeText(text); say(`${n} copied.`, 'is-ok'); } catch { say('Copy denied by browser.', 'is-erreur'); }
    };
    let tickets = [];
    async function load() {
        list.replaceChildren(el('li', 'retours-vide', 'Loading…'));
        try {
            tickets = await api(`tickets?select=*&app=eq.${app}&order=cree_le.desc&limit=40`);
        } catch (err) {
            list.replaceChildren(el('li', 'retours-vide', `Cannot load: ${err.message}`));
            return;
        }
        list.replaceChildren();
        if (!tickets.length) list.append(el('li', 'retours-vide', 'No tickets yet.'));
        tickets.forEach((t) => {
            const li = el('li', `retours-ticket is-${t.statut}`);
            const top = el('div', 'retours-ticket-haut');
            top.append(el('span', 'retours-statut', STATUTS[t.statut] || t.statut), el('span', 'retours-meta',
                `#${t.id} · ${new Date(t.cree_le).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${t.page || ''}${t.priorite === 'urgente' ? ' · urgent' : ''}`));
            li.append(top, el('p', 'retours-ticket-texte', t.texte));
            if (t.reponse) {
                const reply = el('p', 'retours-reponse');
                reply.append(el('strong', null, 'Claude: '), document.createTextNode(t.reponse));
                li.append(reply);
            }
            const actions = el('div', 'retours-actions');
            const cpBtn = bouton('retours-petit', 'Copy');
            cpBtn.addEventListener('click', () => copy(asText(t), 1));
            actions.append(cpBtn);
            if (t.statut === 'a_verifier' || t.statut === 'question') {
                const okBtn = bouton('retours-petit is-ok', 'Good');
                okBtn.addEventListener('click', async () => { await update(t.id, { statut: 'fait' }); load(); });
                const notGoodBtn = bouton('retours-petit', t.statut === 'question' ? 'Reply' : 'Not good');
                notGoodBtn.addEventListener('click', () => {
                    show('note');
                    zone.value = `Follow-up to ticket #${t.id}: `;
                    zone.dataset.suite = String(t.id);
                    zone.focus();
                });
                actions.append(okBtn, notGoodBtn);
            }
            li.append(actions);
            list.append(li);
        });
    }
    const update = async (id, fields) => {
        try { await api(`tickets?id=eq.${id}`, { method: 'PATCH', body: fields }); } catch (err) { say(err.message, 'is-erreur'); }
    };
    refreshBtn.addEventListener('click', load);
    // for dashboard: open panel on a given app
    window.Retours = {
        ouvrir(target, view = 'note') {
            if (target) app = target;
            title.textContent = target && target !== R.app ? `Tell Claude · ${target}` : 'Tell Claude';
            panel.hidden = false;
            show(view);
            if (view === 'note') zone.focus();
        }
    };
    copyAllBtn.addEventListener('click', () => {
        const open = tickets.filter((t) => !['fait', 'refuse'].includes(t.statut));
        copy(open.map(asText).join('\n\n---\n\n'), open.length);
    });
})();
