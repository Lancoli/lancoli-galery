// Audience measurement: no cookie, no banner, and nothing is sent while ANALYTICS.id is empty.
// To turn it on: create the site at Umami or Plausible, then fill in provider and id below.
(() => {
    const ANALYTICS = {
        provider: '',   // 'umami' or 'plausible'
        id: '',         // umami: the website id · plausible: the domain, e.g. 'lancoli.fr'
        src: ''         // optional: script address if it differs from the default (self-hosting, proxy)
    };

    const SOURCES = {
        umami: 'https://cloud.umami.is/script.js',
        plausible: 'https://plausible.io/js/script.js'
    };

    const local = location.protocol === 'file:' || ['localhost', '127.0.0.1', ''].includes(location.hostname);
    const refused = navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
    const src = ANALYTICS.src || SOURCES[ANALYTICS.provider];
    const live = Boolean(ANALYTICS.id && src && !local && !refused);

    if (live) {
        const script = document.createElement('script');
        script.defer = true;
        script.src = src;
        if (ANALYTICS.provider === 'umami') script.dataset.websiteId = ANALYTICS.id;
        else script.dataset.domain = ANALYTICS.id;
        document.head.appendChild(script);
    }

    // A single entry point for every event: lancoliTrack('Name', { detail })
    const page = location.pathname.split('/').pop().replace('.html', '') || 'accueil';
    const track = (name, data = {}) => {
        const props = { page, ...data };
        if (!live) {
            if (local) console.debug('[mesure]', name, props); // locally: show what would be sent
            return;
        }
        if (window.umami) window.umami.track(name, props);
        else if (window.plausible) window.plausible(name, { props });
    };
    window.lancoliTrack = track;

    const label = (node) => (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);

    document.addEventListener('click', (event) => {
        const link = event.target.closest('a[href]');
        if (link) {
            const href = link.getAttribute('href');
            if (href.startsWith('mailto:')) track('Contact email');
            else if (/^https?:/.test(href) && link.hostname !== location.hostname) track('Lien sortant', { vers: link.hostname });
            else if (href.split('#')[0] === 'contact.html') track('Vers contact', { texte: label(link) });
            return;
        }

        // Horlando Blast: the cassette, then the files
        if (event.target.closest('.horla-start')) track('Cassette inseree');
        const file = event.target.closest('[data-file]');
        if (file) track('Dossier ouvert', { dossier: file.dataset.file });

        const view = event.target.closest('.view-switch [data-view]');
        if (view) track('Vue pochettes', { vue: view.dataset.view });
    });

    // Plays: once per medium and per page visit
    const played = new WeakSet();
    const mediaName = (media) => {
        const figure = media.closest('figure');
        const title = figure && figure.querySelector('figcaption strong');
        if (title) return label(title);
        const file = decodeURIComponent((media.currentSrc || media.src || '').split('/').pop().split('#')[0]);
        return file.replace(/\.[a-z0-9]+$/i, '');
    };
    document.addEventListener('play', (event) => {
        const media = event.target;
        if (!(media instanceof HTMLMediaElement) || played.has(media)) return;
        played.add(media);
        track(media.tagName === 'VIDEO' ? 'Lecture video' : 'Lecture audio', { media: mediaName(media) });
    }, true);
    document.addEventListener('ended', (event) => {
        const media = event.target;
        if (media instanceof HTMLMediaElement && !media.loop) track('Ecoute complete', { media: mediaName(media) });
    }, true);

    // Read to the end of the page: the "next chapter" link comes on screen
    const end = document.querySelector('a.next');
    if (end && 'IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer.disconnect();
            track('Page lue');
        });
        observer.observe(end);
    }
})();
