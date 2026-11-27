// Leaflets: vertical transition in paper leaves, animated pose by pose like stop motion.
// The leaves rise one after another and cover the page (cover), then peel away (reveal).
//   const leaflets = Leaflets({ fps: 8 });
//   await leaflets.cover('Projets');   // the page is covered
//   await leaflets.reveal();           // the page is uncovered
window.Leaflets = (options = {}) => {
    const settings = {
        count: 5,        // number of leaves
        fps: 8,          // poses per second: the lower, the more it "freezes"
        duration: 420,   // travel of one leaf, in ms
        stagger: 110,    // delay between two leaves, in ms
        tear: 14,        // depth of the tear, in px (0 = straight edge)
        wobble: 1,       // jitter from one pose to the next (0 = none)
        boil: true,      // the tear is recut at every pose
        direction: 'up', // 'up': the leaves rise · 'down': they fall
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

    // reproducible randomness: the same seed gives the same tear
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

    // Torn edge: a wandering line, some grain, and now and then a deeper barb
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
            // each leaf has its grid offset: five leaves, not five copies
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

    // The leaves take the five hues of the current chapter (--aura-1 … --aura-5)
    const tint = () => {
        const style = getComputedStyle(document.body);
        leaves.forEach(({ paper }, i) => {
            const color = style.getPropertyValue(`--aura-${(i % 5) + 1}`).trim();
            paper.style.setProperty('--leaf-color', color || style.getPropertyValue('--paper'));
        });
    };

    // A pose: where each leaf is at that instant, rounded to the frame rate
    const draw = (elapsed, pose) => {
        const travel = window.innerHeight + pad() * 2;
        const sign = settings.direction === 'down' ? -1 : 1;
        const last = settings.count - 1;
        leaves.forEach(({ leaf, paper }, i) => {
            let y = 0;
            let moving = false;
            if (phase === 'cover') {
                const local = clamp((elapsed - i * settings.stagger) / settings.duration);
                y = Math.pow(1 - local, 4) * travel * sign; // braked arrival
                moving = local > 0 && local < 1;
            } else if (phase === 'reveal') {
                const local = clamp((elapsed - (last - i) * settings.stagger) / settings.duration);
                y = -Math.pow(local, 3) * travel * sign; // slow start, sharp exit
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
            // draw the pose's instant, not the real instant: that is what gives the jerk
            draw(pose * 1000 / settings.fps, pose);
        }
        if (phase !== 'held' && elapsed >= total() + 1000 / settings.fps) finish();
        if (phase !== 'idle') frame = requestAnimationFrame(tick);
    };

    const finish = () => {
        const resolve = done;
        done = null;
        if (phase === 'cover') {
            phase = 'held'; // the page is covered: the leaves keep trembling
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
        // changes a setting live; the number of leaves and the tear require a rebuild
        set(changes) {
            Object.assign(settings, changes);
            if ('count' in changes) build();
            else if ('tear' in changes) layout();
        },
        // freezes a precise pose, to tune or capture: still('cover', 300)
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
