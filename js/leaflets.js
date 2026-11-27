// Feuillets : transition verticale en feuilles de papier, animée pose par pose comme un stop motion.
// Les feuilles montent l'une après l'autre et couvrent la page (cover), puis s'effeuillent (reveal).
//   const feuillets = Feuillets({ fps: 8 });
//   await feuillets.cover('Projets');   // la page est couverte
//   await feuillets.reveal();           // la page est découverte
window.Leaflets = (options = {}) => {
    const settings = {
        count: 5,        // nombre de feuilles
        fps: 8,          // poses par seconde : plus c'est bas, plus ça « fige »
        duration: 420,   // trajet d'une feuille, en ms
        stagger: 110,    // retard entre deux feuilles, en ms
        tear: 14,        // profondeur de la déchirure, en px (0 = bord droit)
        wobble: 1,       // tremblé d'une pose à l'autre (0 = aucun)
        boil: true,      // la déchirure est redécoupée à chaque pose
        direction: 'up', // 'up' : les feuilles montent · 'down' : elles descendent
        ...options
    };

    const root = document.createElement('div');
    root.className = 'leaves';
    root.setAttribute('aria-hidden', 'true');
    document.body.appendChild(root);

    let leaves = [];
    let label = null;
    let phase = 'idle'; // idle · cover · held · reveal
    let startedAt = 0;
    let lastPose = -1;
    let frame = 0;
    let done = null;

    // hasard reproductible : une même graine redonne la même déchirure
    const rng = (seed) => {
        let a = (seed * 2654435761) >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    const clamp = (value) => Math.min(1, Math.max(0, value));
    const pad = () => Math.ceil(settings.tear * 2.6) + 12;

    // Bord déchiré : une ligne qui flâne, du grain, et de temps en temps une barbe plus profonde
    const SEGMENTS = 36;
    const tornEdge = (seed) => {
        const random = rng(seed);
        const edge = () => {
            let drift = random();
            const points = [];
            for (let k = 0; k <= SEGMENTS; k++) {
                drift = clamp(drift + (random() - .5) * .45);
                const barb = random() < .1 ? random() * 1.3 : 0;
                points.push((drift * .55 + random() * .45 + barb) * settings.tear);
            }
            return points;
        };
        const top = edge().map((y, k) => `${(k / SEGMENTS * 100).toFixed(2)}% ${y.toFixed(1)}px`);
        const bottom = edge().map((y, k) => `${(k / SEGMENTS * 100).toFixed(2)}% calc(100% - ${y.toFixed(1)}px)`).reverse();
        return `polygon(${top.concat(bottom).join(',')})`;
    };

    const build = () => {
        root.textContent = '';
        leaves = Array.from({ length: settings.count }, (_, i) => {
            const leaf = document.createElement('div');
            leaf.className = 'leaf';
            const paper = document.createElement('div');
            paper.className = 'leaf-paper';
            // chaque feuille a son quadrillage décalé : cinq feuilles, pas cinq copies
            const random = rng(i + 77);
            paper.style.setProperty('--leaf-ox', `${Math.round(random() * 40)}px`);
            paper.style.setProperty('--leaf-oy', `${Math.round(random() * 40)}px`);
            leaf.appendChild(paper);
            root.appendChild(leaf);
            return { leaf, paper };
        });
        label = document.createElement('span');
        label.className = 'leaf-label';
        leaves[leaves.length - 1].leaf.appendChild(label);
        layout();
    };

    const layout = () => {
        leaves.forEach(({ leaf, paper }, i) => {
            leaf.style.top = `${-pad()}px`;
            leaf.style.height = `${window.innerHeight + pad() * 2}px`;
            paper.style.clipPath = tornEdge(i + 1);
        });
    };

    // Les feuilles prennent les cinq teintes du chapitre en cours (--aura-1 … --aura-5)
    const tint = () => {
        const style = getComputedStyle(document.body);
        leaves.forEach(({ paper }, i) => {
            const color = style.getPropertyValue(`--aura-${(i % 5) + 1}`).trim();
            paper.style.setProperty('--leaf-color', color || style.getPropertyValue('--paper'));
        });
    };

    // Une pose : où est chaque feuille à cet instant, arrondi à la cadence
    const draw = (elapsed, pose) => {
        const travel = window.innerHeight + pad() * 2;
        const sign = settings.direction === 'down' ? -1 : 1;
        const last = settings.count - 1;
        leaves.forEach(({ leaf, paper }, i) => {
            let y = 0;
            let moving = false;
            if (phase === 'cover') {
                const local = clamp((elapsed - i * settings.stagger) / settings.duration);
                y = Math.pow(1 - local, 4) * travel * sign; // arrivée freinée
                moving = local > 0 && local < 1;
            } else if (phase === 'reveal') {
                const local = clamp((elapsed - (last - i) * settings.stagger) / settings.duration);
                y = -Math.pow(local, 3) * travel * sign; // départ lent, sortie franche
                moving = local > 0 && local < 1;
            }
            const random = rng(pose * 31 + i * 7 + 1);
            const x = (random() - .5) * 8 * settings.wobble;
            const turn = (random() - .5) * .7 * settings.wobble;
            leaf.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${turn.toFixed(3)}deg)`;
            leaf.style.visibility = Math.abs(y) >= travel ? 'hidden' : '';
            if (settings.boil && moving) paper.style.clipPath = tornEdge(pose * 13 + i + 1);
        });
    };

    const total = () => settings.duration + (settings.count - 1) * settings.stagger;

    const tick = (now) => {
        const elapsed = now - startedAt;
        const pose = Math.floor(elapsed * settings.fps / 1000);
        if (pose !== lastPose) {
            lastPose = pose;
            // on dessine l'instant de la pose, pas l'instant réel : c'est ce qui donne l'à-coup
            draw(pose * 1000 / settings.fps, pose);
        }
        if (phase !== 'held' && elapsed >= total() + 1000 / settings.fps) finish();
        if (phase !== 'idle') frame = requestAnimationFrame(tick);
    };

    const finish = () => {
        const resolve = done;
        done = null;
        if (phase === 'cover') {
            phase = 'held'; // la page est couverte : les feuilles continuent de trembler
            root.classList.add('is-held');
            startedAt = performance.now();
            lastPose = -1;
        } else {
            phase = 'idle';
            root.classList.remove('is-on', 'is-held');
        }
        if (resolve) resolve();
    };

    const run = (next) => new Promise((resolve) => {
        cancelAnimationFrame(frame);
        if (done) done();
        done = resolve;
        phase = next;
        startedAt = performance.now();
        lastPose = -1;
        root.classList.add('is-on');
        root.classList.toggle('is-held', false);
        frame = requestAnimationFrame(tick);
    });

    window.addEventListener('resize', layout);
    build();

    return {
        settings,
        root,
        cover(text = '') {
            tint();
            label.textContent = text;
            return run('cover');
        },
        reveal() {
            return run('reveal');
        },
        // change un réglage à chaud ; le nombre de feuilles et la déchirure demandent de reconstruire
        set(changes) {
            Object.assign(settings, changes);
            if ('count' in changes) build();
            else if ('tear' in changes) layout();
        },
        // fige une pose précise, pour régler ou capturer : still('cover', 300)
        still(which, elapsed, text = '') {
            cancelAnimationFrame(frame);
            tint();
            label.textContent = text;
            phase = which;
            root.classList.add('is-on');
            root.classList.toggle('is-held', which === 'held');
            draw(elapsed, Math.floor(elapsed * settings.fps / 1000));
        }
    };
};
