(() => {
    const root = document.documentElement;
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const curtainLabel = document.querySelector('.curtain-label');

    // Entrée dans le chapitre : le rideau se lève
    const ready = () => root.classList.add('is-ready');
    requestAnimationFrame(() => requestAnimationFrame(ready));
    setTimeout(ready, 120); // filet de sécurité si rAF est suspendu (onglet en arrière-plan)

    // Texte circulaire du CTA : une lettre par rotation pour boucler exactement le cercle
    document.querySelectorAll('.cta-ring textPath').forEach((textPath) => {
        const svg = textPath.ownerSVGElement;
        const radius = parseFloat(textPath.dataset.radius);
        const chars = [...textPath.textContent];
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        chars.forEach((char, i) => {
            const letter = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            letter.setAttribute('x', 100);
            letter.setAttribute('y', 100 - radius);
            letter.setAttribute('text-anchor', 'middle');
            letter.setAttribute('transform', `rotate(${(i * 360) / chars.length} 100 100)`);
            letter.textContent = char;
            group.appendChild(letter);
        });
        textPath.parentNode.replaceWith(group);
        svg.appendChild(group);
    });

    // Barre de navigation : elle se resserre dès qu'on défile
    const bar = document.querySelector('header');
    if (bar) {
        // deux seuils écartés : se resserrer décale la page de quelques pixels,
        // avec un seul seuil la barre repasserait dessous et oscillerait
        const stick = () => {
            if (window.scrollY > 90) bar.classList.add('is-stuck');
            else if (window.scrollY < 4) bar.classList.remove('is-stuck');
        };
        window.addEventListener('scroll', stick, { passive: true });
        stick();
    }

    // Retour arrière (bfcache) : on remet la page dans son état visible
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            root.classList.remove('is-leaving');
            root.classList.add('is-ready');
        }
    });

    // Sortie du chapitre : le rideau tombe, puis on navigue
    document.addEventListener('click', (event) => {
        const link = event.target.closest('a[data-transition]');
        if (!link || event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        event.preventDefault();
        const url = link.getAttribute('href');
        if (reduceMotion) {
            location.href = url;
            return;
        }
        // le rideau porte toujours le même mot : la marque, pas le nom du lien cliqué
        if (curtainLabel) curtainLabel.textContent = 'Lancoli®';
        root.classList.add('is-leaving');
        setTimeout(() => { location.href = url; }, 900);
    });

    // CTA magnétique : suit doucement le curseur dans sa zone
    document.querySelectorAll('[data-magnetic]').forEach((zone) => {
        const target = zone.firstElementChild;
        if (!target || reduceMotion || matchMedia('(hover: none)').matches) return;

        zone.addEventListener('pointermove', (event) => {
            const rect = zone.getBoundingClientRect();
            const x = event.clientX - rect.left - rect.width / 2;
            const y = event.clientY - rect.top - rect.height / 2;
            target.style.transform = `translate(${x * .28}px, ${y * .28}px)`;
        });
        zone.addEventListener('pointerleave', () => {
            target.style.transform = '';
        });
    });

    // Écoute : un seul AudioContext pour tout le site ; chaque vidéo ou piste lue s'y branche d'elle-même.
    // Trois niveaux (0 → 1) lus par qui veut : kick (coups sous ~200 Hz, pour les cadres), houle (mid-bass
    // ~100–350 Hz, lente et progressive) et grain (aigus ~4–12 kHz, nerveux, sautille à chaque transitoire).
    // Pas en file:// : le navigateur y coupe le son d'un média branché sur Web Audio.
    const ear = (() => {
        const AC = window.AudioContext || window.webkitAudioContext;
        const level = { kick: 0, swell: 0, grain: 0, on: 0 };
        const enabled = Boolean(!reduceMotion && location.protocol !== 'file:' && AC);
        if (!enabled) return { enabled, level, listen: () => {} };

        let context = null;
        let analyser = null;
        let bins = null;
        let kickFloor = 0;
        let prevHigh = 0;
        let frame = 0;
        const wired = new WeakSet();
        const playing = new Set();
        // moyenne des cases a à b ; fftSize 1024 : ~47 Hz par case à 48 kHz
        const band = (a, b) => {
            let sum = 0;
            for (let i = a; i <= b; i++) sum += bins[i];
            return sum / ((b - a + 1) * 255);
        };

        const tick = () => {
            if (playing.size) {
                analyser.getByteFrequencyData(bins);
                // plancher glissant : on ne garde que ce qui dépasse le niveau moyen, donc les coups
                const low = band(1, 4);
                kickFloor += (low - kickFloor) * .04;
                const hit = Math.min(1, Math.max(0, low - kickFloor * .8) * 3);
                level.kick = hit > level.kick ? hit : level.kick * .86;
                // la houle monte et retombe lentement, sans à-coups
                const mid = band(2, 7);
                level.swell += (mid - level.swell) * (mid > level.swell ? .05 : .02);
                // le grain : le niveau des aigus plus leurs sauts d'une image à l'autre, relâché vite
                const high = band(85, 255);
                const grain = Math.min(1, high * 2.4 + Math.max(0, high - prevHigh) * 16);
                prevHigh = high;
                level.grain = grain > level.grain ? grain : level.grain * .72;
            } else {
                level.kick *= .86;
                level.swell *= .97;
                level.grain *= .72;
            }
            level.on += ((playing.size ? 1 : 0) - level.on) * .03;
            frame = playing.size || level.on > .002 || level.swell > .002 ? requestAnimationFrame(tick) : 0;
        };

        const listen = (media) => {
            if (!(media instanceof HTMLMediaElement)) return;
            if (!wired.has(media)) {
                // sans geste de l'utilisateur, le contexte resterait suspendu et le média muet : on attend
                if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
                if (!context) {
                    context = new AC();
                    analyser = context.createAnalyser();
                    analyser.fftSize = 1024;
                    analyser.smoothingTimeConstant = .4;
                    bins = new Uint8Array(analyser.frequencyBinCount);
                    analyser.connect(context.destination);
                }
                try {
                    context.createMediaElementSource(media).connect(analyser);
                } catch (error) {
                    return; // déjà branché ailleurs : on le laisse tel quel
                }
                wired.add(media);
                const stop = () => playing.delete(media);
                media.addEventListener('pause', stop);
                media.addEventListener('ended', stop);
            }
            if (context.state === 'suspended') context.resume();
            playing.add(media);
            if (!frame) frame = requestAnimationFrame(tick);
        };
        document.addEventListener('play', (event) => listen(event.target), true);
        return { enabled, level, listen };
    })();

    // Champ en vagues : de longues lignes serrées traversent la page comme des tracés de signal — une houle
    // lente qui s'additionne et se propage, et par-dessus des paquets d'oscillation plus fins. Quand un son
    // joue, le champ l'écoute à deux niveaux : la mid-bass gonfle la houle, doucement ; les aigus font
    // frissonner le tracé, comme le grain de la texture. Le curseur ne fait qu'effleurer. Nuances de noir.
    (() => {
        const aura = document.querySelector('.aura');
        if (!aura || reduceMotion) return;

        const canvas = document.createElement('canvas');
        canvas.className = 'flock';
        canvas.setAttribute('aria-hidden', 'true');
        aura.after(canvas);
        const ctx = canvas.getContext('2d');

        const GAP = 19;             // écart moyen entre deux lignes (px)
        const STEP = 7;             // pas horizontal du tracé (px)
        const CHUNK = 5;            // points par morceau dessiné (l'encre varie d'un morceau à l'autre)
        const SIGMA = 80;           // étendue de l'influence du curseur (gaussienne, px)
        const PUSH = 11;            // écartement maximal des lignes autour du curseur (px)
        // les houles : amplitude (px), nombre d'onde, vitesse, déphasage par ligne
        const SWELLS = [
            { a: 30, k: .0019, w: .22, d: .16 },
            { a: 14, k: .0047, w: -.48, d: .31 },
            { a: 6, k: .011, w: .9, d: .55 }
        ];
        // le signal : deux porteuses fines, portées par une enveloppe qui voyage (des paquets, comme une onde sonore)
        const CARRIERS = [
            { a: 4.5, k: .043, w: 2.6, d: .9 },
            { a: 2.5, k: .071, w: -3.4, d: 1.7 }
        ];
        const sound = ear.level;
        // sx, sy : la position lissée du curseur, pour que la déformation le suive sans à-coups
        const mouse = { x: -1e4, y: -1e4, sx: -1e4, sy: -1e4, active: false, pull: 0 };
        let width = 0;
        let height = 0;
        let lines = [];
        let frame = 0;
        let last = performance.now();

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = innerWidth;
            height = innerHeight;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            // des lignes jusqu'au-delà des bords, pour que la houle n'y laisse pas de vide
            const n = Math.ceil((height + 160) / GAP);
            lines = Array.from({ length: n }, (_, i) => ({
                y: -80 + i * GAP,
                shade: 23 + ((i * 41) % 92),            // de l'encre (#171717) au gris fumée
                phase: (i * 2.39) % (Math.PI * 2)
            }));
        };

        const step = (now) => {
            const dt = Math.min(2.5, (now - last) / 16.67);
            last = now;
            const t = now * .001;
            mouse.pull += ((mouse.active ? 1 : 0) - mouse.pull) * .06 * dt;
            const ease = Math.min(1, .18 * dt);
            mouse.sx += (mouse.x - mouse.sx) * ease;
            mouse.sy += (mouse.y - mouse.sy) * ease;

            ctx.clearRect(0, 0, width, height);
            ctx.lineCap = 'butt';     // bouts nets : pas de point plus foncé aux raccords entre morceaux
            ctx.lineJoin = 'round';
            const cols = Math.ceil(width / STEP) + 1;
            const pts = new Float32Array(cols * 2);
            const near = new Float32Array(cols);
            const pack = new Float32Array(cols);
            const swell = 1 + sound.swell * 1.5;          // la mid-bass gonfle la houle
            const grain = sound.grain;

            lines.forEach((line, i) => {
                for (let c = 0; c < cols; c++) {
                    const x = c * STEP;
                    let y = line.y;
                    for (const s of SWELLS) y += s.a * swell * Math.sin(x * s.k + t * s.w + i * s.d + line.phase * .2);
                    // l'enveloppe des paquets : nulle par endroits, pleine ailleurs, elle glisse le long de la ligne
                    const e = .5 + .5 * Math.sin(x * .0034 - t * .55 + i * .43 + line.phase);
                    const env = e * e;
                    for (const s of CARRIERS) y += s.a * env * (1 + sound.swell * .9) * Math.sin(x * s.k + t * s.w + i * s.d);
                    // les aigus : un frisson erratique, plus fort là où le signal est dense
                    if (grain > .01) y += (Math.random() - .5) * grain * (2 + env * 6);
                    // le curseur : les lignes s'écartent de part et d'autre, en cloche (gaussienne) — nul au centre
                    // et au loin, maximal à une distance SIGMA, sans cassure ni changement de signe brutal
                    let n = 0;
                    if (mouse.pull > .01) {
                        const dx = x - mouse.sx, dy = y - mouse.sy;
                        const g = Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA));
                        n = g * mouse.pull;
                        y += PUSH * 1.65 * (dy / SIGMA) * g * mouse.pull;
                    }
                    pts[c * 2] = x;
                    pts[c * 2 + 1] = y;
                    near[c] = n;
                    pack[c] = env;
                }
                for (let k = 0; k < cols - 1; k += CHUNK) {
                    const end = Math.min(cols - 1, k + CHUNK);
                    const x = pts[k * 2];
                    // fondu sur les bords de l'écran, et une pulsation qui voyage avec la houle
                    const edge = Math.min(1, x / 120, (width - x) / 120 + .2);
                    const pulse = .5 + .5 * Math.sin(x * .006 - t * .8 + i * .7);
                    const flicker = grain > .01 ? grain * .12 * Math.random() : 0;
                    const alpha = Math.max(0, (.05 + .1 * pulse + pack[k] * .05 + flicker + near[k] * .2) * edge);
                    const grey = Math.round(line.shade * (1 - near[k] * .5));
                    ctx.strokeStyle = `rgba(${grey}, ${grey}, ${grey}, ${alpha})`;
                    ctx.lineWidth = .6 + near[k] * .3;
                    // courbe lisse : des quadratiques passant par les milieux, raccordées d'un morceau à l'autre
                    const mid = (j) => [(pts[j * 2] + pts[j * 2 + 2]) / 2, (pts[j * 2 + 1] + pts[j * 2 + 3]) / 2];
                    ctx.beginPath();
                    if (k === 0) ctx.moveTo(pts[0], pts[1]); else ctx.moveTo(...mid(k - 1));
                    for (let j = k; j < end; j++) ctx.quadraticCurveTo(pts[j * 2], pts[j * 2 + 1], ...mid(j));
                    if (end === cols - 1) ctx.lineTo(pts[end * 2], pts[end * 2 + 1]);
                    ctx.stroke();
                }
            });

            frame = requestAnimationFrame(step);
        };

        window.addEventListener('resize', resize);
        window.addEventListener('pointermove', (event) => {
            // le curseur arrive : la position lissée part de lui, pas du coin de l'écran
            if (mouse.pull < .01) { mouse.sx = event.clientX; mouse.sy = event.clientY; }
            mouse.x = event.clientX;
            mouse.y = event.clientY;
            mouse.active = true;
        }, { passive: true });
        document.addEventListener('pointerleave', () => { mouse.active = false; });
        window.addEventListener('blur', () => { mouse.active = false; });
        document.addEventListener('visibilitychange', () => {
            cancelAnimationFrame(frame);
            if (!document.hidden) {
                last = performance.now();
                frame = requestAnimationFrame(step);
            }
        });

        resize();
        frame = requestAnimationFrame(step);
    })();

    // Pages longues : les sections apparaissent à mesure qu'on descend
    const revealed = document.querySelectorAll('.scroll-reveal');
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-in');
                observer.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -8% 0px' });
        revealed.forEach((el) => observer.observe(el));
    } else {
        revealed.forEach((el) => el.classList.add('is-in'));
    }

    // Itinéraire : un seul tracé relie les étapes, le voyageur le descend au rythme du défilement
    const journey = document.querySelector('.journey');
    if (journey) {
        const stops = [...journey.querySelectorAll('[data-stop]')];
        // détours de chaque trajet, en fraction de la largeur libre à droite du tracé
        const BENDS = [[.85], [.5, .95], [.95, .6]];
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'journey-map');
        svg.setAttribute('aria-hidden', 'true');
        svg.innerHTML = '<clipPath id="journey-clip"><rect x="-50" y="-50"/></clipPath>'
            + '<path class="journey-track"/><path class="journey-done" clip-path="url(#journey-clip)"/>'
            + `<g class="journey-pins">${stops.map(() => '<circle r="5"/>').join('')}</g>`
            + '<circle class="journey-halo" r="11"/><circle class="journey-walker" r="4"/>';
        journey.append(svg);
        const [track, done] = svg.querySelectorAll('path');
        const clip = svg.querySelector('rect');
        const pins = [...svg.querySelectorAll('.journey-pins circle')];
        const marks = svg.querySelectorAll('.journey-halo, .journey-walker');
        let tops = [];
        let total = 0;

        const place = () => {
            // le voyageur reste à mi-hauteur de l'écran ; le tracé ne remonte jamais,
            // donc une recherche par dichotomie retrouve le point à cette hauteur
            const y = Math.min(tops[tops.length - 1], Math.max(tops[0], window.innerHeight * .5 - journey.getBoundingClientRect().top));
            let low = 0;
            let high = total;
            for (let i = 0; i < 18; i += 1) {
                const mid = (low + high) / 2;
                if (track.getPointAtLength(mid).y < y) low = mid;
                else high = mid;
            }
            const point = track.getPointAtLength(low);
            marks.forEach((mark) => {
                mark.setAttribute('cx', point.x);
                mark.setAttribute('cy', point.y);
            });
            clip.setAttribute('height', y + 50);
            pins.forEach((pin, i) => pin.classList.toggle('is-passed', tops[i] <= y + 1));
        };

        const draw = () => {
            const width = journey.clientWidth;
            const x = parseFloat(getComputedStyle(journey).getPropertyValue('--route-x')) || 0;
            tops = stops.map((stop) => stop.offsetTop);
            let d = `M${x},${tops[0]}`;
            stops.slice(0, -1).forEach((stop, i) => {
                // le long de l'étape : tout droit ; entre deux étapes : des lacets
                let fromX = x;
                let fromY = tops[i] + stop.offsetHeight;
                d += `V${fromY}`;
                const bends = [...BENDS[i % BENDS.length].map((f) => x + (width - x) * f), x];
                const drop = (tops[i + 1] - fromY) / bends.length;
                bends.forEach((toX) => {
                    const toY = fromY + drop;
                    const midY = (fromY + toY) / 2;
                    d += `C${fromX},${midY} ${toX},${midY} ${toX},${toY}`;
                    fromX = toX;
                    fromY = toY;
                });
            });
            track.setAttribute('d', d);
            done.setAttribute('d', d);
            clip.setAttribute('width', width + 100);
            pins.forEach((pin, i) => {
                pin.setAttribute('cx', x);
                pin.setAttribute('cy', tops[i]);
            });
            total = track.getTotalLength();
            place();
        };

        let queued = false;
        window.addEventListener('scroll', () => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(() => {
                queued = false;
                place();
            });
        }, { passive: true });
        if ('ResizeObserver' in window) new ResizeObserver(draw).observe(journey);
        else window.addEventListener('resize', draw);
        draw();
    }

    // Avant / après : le curseur déplace la ligne de coupe
    document.querySelectorAll('.compare input').forEach((input) => {
        input.addEventListener('input', () => {
            input.parentNode.style.setProperty('--pos', `${input.value}%`);
        });
    });

    // Visionneuse : les plans s'ouvrent en grand, flèches pour passer de l'un à l'autre
    const zooms = [...document.querySelectorAll('a[data-zoom]')];
    if (zooms.length && window.HTMLDialogElement) {
        const box = document.createElement('dialog');
        box.className = 'lightbox';
        box.innerHTML = '<img alt=""><div class="slate" aria-live="polite"></div>'
            + '<button type="button" class="lightbox-close" aria-label="Fermer">✕</button>'
            + '<button type="button" class="lightbox-prev" aria-label="Plan précédent">←</button>'
            + '<button type="button" class="lightbox-next" aria-label="Plan suivant">→</button>';
        document.body.appendChild(box);
        const image = box.querySelector('img');
        const caption = box.querySelector('.slate');
        let current = 0;

        const show = (index) => {
            current = (index + zooms.length) % zooms.length;
            const link = zooms[current];
            image.src = link.href;
            image.alt = link.querySelector('img').alt;
            caption.textContent = `${link.dataset.caption || ''} · ${current + 1}/${zooms.length}`;
        };

        zooms.forEach((link, index) => {
            link.addEventListener('click', (event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                show(index);
                box.showModal();
            });
        });
        box.querySelector('.lightbox-close').addEventListener('click', () => box.close());
        box.querySelector('.lightbox-prev').addEventListener('click', () => show(current - 1));
        box.querySelector('.lightbox-next').addEventListener('click', () => show(current + 1));
        // clic hors de l'image : on referme
        box.addEventListener('click', (event) => {
            if (event.target === box) box.close();
        });
        box.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowLeft') show(current - 1);
            if (event.key === 'ArrowRight') show(current + 1);
        });
    }

    // Cassettes : lecteur maison à la place des contrôles natifs, une seule piste à la fois
    const tapes = [...document.querySelectorAll('.tape')];
    const clock = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '–:––');
    tapes.forEach((tape) => {
        const audio = tape.querySelector('audio');
        const ui = tape.querySelector('.tape-ui');
        const button = tape.querySelector('.tape-play');
        const seek = tape.querySelector('.tape-seek');
        const time = tape.querySelector('.tape-time');
        const label = button.getAttribute('aria-label');

        audio.removeAttribute('controls');
        ui.hidden = false;

        const paint = () => {
            time.textContent = `${clock(audio.currentTime)} / ${clock(audio.duration)}`;
            if (audio.duration) seek.value = (audio.currentTime / audio.duration) * 1000;
        };
        const setPlaying = (playing) => {
            tape.classList.toggle('is-playing', playing);
            button.setAttribute('aria-label', playing ? 'Pause' : label);
        };

        button.addEventListener('click', () => {
            if (!audio.paused) {
                audio.pause();
                return;
            }
            tapes.forEach((other) => {
                if (other !== tape) other.querySelector('audio').pause();
            });
            audio.play();
        });
        seek.addEventListener('input', () => {
            if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration;
        });
        audio.addEventListener('play', () => setPlaying(true));
        audio.addEventListener('pause', () => setPlaying(false));
        audio.addEventListener('ended', () => setPlaying(false));
        audio.addEventListener('timeupdate', paint);
        audio.addEventListener('loadedmetadata', paint);
        paint();
    });

    // Dossiers : chaque arrêt de la carte ouvre son tiroir
    document.querySelectorAll('[data-file]').forEach((trigger) => {
        const file = document.getElementById(`file-${trigger.dataset.file}`);
        if (file && file.showModal) trigger.addEventListener('click', () => file.showModal());
    });
    document.querySelectorAll('dialog.file').forEach((file) => {
        // clic sur le fond ou sur « Fermer » : on referme
        file.addEventListener('click', (event) => {
            if (event.target === file || event.target.closest('[data-close]')) file.close();
        });
    });

    // Intros : lecteur vidéo maison, avec liste de lecture
    document.querySelectorAll('[data-reel]').forEach((reel) => {
        const screen = reel.querySelector('.reel-screen');
        const video = reel.querySelector('video');
        const ui = reel.querySelector('.reel-ui');
        const big = reel.querySelector('.reel-big');
        const play = reel.querySelector('.reel-play');
        const seek = reel.querySelector('.reel-seek');
        const time = reel.querySelector('.reel-time');
        const mute = reel.querySelector('.reel-mute');
        const full = reel.querySelector('.reel-full');
        const items = [...reel.querySelectorAll('.reel-list button')];
        let current = Math.max(0, items.findIndex((item) => item.hasAttribute('aria-current')));

        video.removeAttribute('controls');
        ui.hidden = false;
        big.hidden = false;
        reel.querySelector('.reel-nav').hidden = items.length < 2;

        const toggle = () => {
            if (video.paused) video.play().catch(() => { /* lecture refusée par le navigateur */ });
            else video.pause();
        };
        const paint = () => {
            time.textContent = `${clock(video.currentTime)} / ${clock(video.duration)}`;
            const done = video.duration ? video.currentTime / video.duration : 0;
            seek.value = done * 1000;
            seek.style.setProperty('--done', `${done * 100}%`);
        };
        const setPlaying = (playing) => {
            reel.classList.toggle('is-playing', playing);
            play.setAttribute('aria-label', playing ? 'Pause' : 'Lire');
            big.setAttribute('aria-label', playing ? 'Pause' : 'Lire');
        };
        const load = (index, autoplay) => {
            current = (index + items.length) % items.length;
            const item = items[current];
            items.forEach((other) => other.removeAttribute('aria-current'));
            item.setAttribute('aria-current', 'true');
            reel.querySelector('.reel-index').textContent = `Intro ${String(current + 1).padStart(2, '0')}`;
            reel.querySelector('.reel-title').textContent = item.querySelector('strong').textContent;
            // #t=0.5 : affiche une image de la vidéo plutôt qu'un écran noir avant la lecture
            video.src = autoplay ? item.dataset.src : `${item.dataset.src}#t=0.5`;
            if (autoplay) video.play().catch(() => { /* lecture refusée par le navigateur */ });
        };

        video.addEventListener('click', toggle);
        big.addEventListener('click', toggle);
        play.addEventListener('click', toggle);
        seek.addEventListener('input', () => {
            if (video.duration) video.currentTime = (seek.value / 1000) * video.duration;
        });
        mute.addEventListener('click', () => {
            video.muted = !video.muted;
            mute.setAttribute('aria-pressed', String(video.muted));
            mute.textContent = video.muted ? 'Muet' : 'Son';
        });
        full.addEventListener('click', () => {
            if (document.fullscreenElement) document.exitFullscreen();
            else if (screen.requestFullscreen) screen.requestFullscreen();
            else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); // iPhone
        });
        items.forEach((item, index) => {
            item.addEventListener('click', () => {
                if (index === current) toggle();
                else load(index, true);
            });
        });
        reel.querySelector('.reel-prev').addEventListener('click', () => load(current - 1, true));
        reel.querySelector('.reel-next').addEventListener('click', () => load(current + 1, true));

        screen.addEventListener('keydown', (event) => {
            if (event.target !== screen) return;
            const keys = {
                ' ': toggle,
                k: toggle,
                m: () => mute.click(),
                f: () => full.click(),
                ArrowLeft: () => { video.currentTime -= 5; },
                ArrowRight: () => { video.currentTime += 5; }
            };
            if (!keys[event.key]) return;
            event.preventDefault();
            keys[event.key]();
        });

        video.addEventListener('play', () => setPlaying(true));
        video.addEventListener('pause', () => setPlaying(false));
        video.addEventListener('timeupdate', paint);
        video.addEventListener('loadedmetadata', () => {
            items[current].querySelector('.reel-dur').textContent = clock(video.duration);
            paint();
        });
        // fin d'une intro : on enchaîne sur la suivante, ou on s'arrête s'il n'y en a qu'une
        video.addEventListener('ended', () => {
            if (items.length > 1) load(current + 1, true);
            else setPlaying(false);
        });
        paint();
    });

    // Micro edits et intros : diapositives vidéo, lecture au clic, inclinaison 3D sous le curseur
    const micros = [...document.querySelectorAll('[data-micro]')];
    const canTilt = !reduceMotion && !matchMedia('(hover: none)').matches;
    let ambient = null;
    micros.forEach((micro) => {
        const mount = micro.querySelector('.micro-mount');
        const video = micro.querySelector('video');
        const button = micro.querySelector('.micro-play');
        const label = button.getAttribute('aria-label');

        video.removeAttribute('controls');
        button.hidden = false;

        const toggle = () => {
            if (video.paused) video.play().catch(() => { /* lecture refusée par le navigateur */ });
            else video.pause();
        };
        const setPlaying = (playing) => {
            micro.classList.toggle('is-playing', playing);
            button.setAttribute('aria-label', playing ? 'Pause' : label);
        };
        video.addEventListener('click', toggle);
        button.addEventListener('click', toggle);
        // double-clic : plein écran
        video.addEventListener('dblclick', () => {
            if (document.fullscreenElement) document.exitFullscreen();
            else if (video.requestFullscreen) video.requestFullscreen();
            else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); // iPhone
        });
        video.addEventListener('play', () => setPlaying(true));
        video.addEventListener('pause', () => setPlaying(false));
        video.addEventListener('loadedmetadata', () => {
            micro.querySelector('.micro-dur').textContent = clock(video.duration);
        });

        // Intros : à la lecture, la page passe dans le noir et un voile flou reprend les couleurs de la vidéo
        if (micro.classList.contains('micro--wide')) {
            const section = micro.closest('section');
            const paintAmbient = () => {
                if (video.paused) return;
                // 32 × 18 pixels suffisent : le flou CSS fait le reste
                ambient.ctx.drawImage(video, 0, 0, 32, 18);
                requestAnimationFrame(paintAmbient);
            };
            video.addEventListener('play', () => {
                if (!ambient) {
                    const veil = document.createElement('div');
                    veil.className = 'ambient';
                    veil.setAttribute('aria-hidden', 'true');
                    const canvas = document.createElement('canvas');
                    canvas.width = 32;
                    canvas.height = 18;
                    veil.appendChild(canvas);
                    document.body.appendChild(veil);
                    // clic dans le noir : on met en pause, donc on rallume
                    veil.addEventListener('click', () => ambient.video && ambient.video.pause());
                    ambient = { ctx: canvas.getContext('2d'), video: null, timer: 0 };
                    veil.offsetWidth; // force un premier rendu, sinon le fondu d'entrée saute
                }
                clearTimeout(ambient.timer);
                ambient.video = video;
                section.classList.add('is-ambient-stage');
                root.classList.add('is-ambient');
                requestAnimationFrame(paintAmbient);
            });
            video.addEventListener('pause', () => {
                if (!ambient || ambient.video !== video) return; // une autre intro a déjà pris le relais
                root.classList.remove('is-ambient');
                // la section reste au-dessus du voile le temps qu'il s'efface
                ambient.timer = setTimeout(() => section.classList.remove('is-ambient-stage'), 900);
            });
        }

        // Le cadre bat sur les basses : --bass (0 → 1) suit les coups sous ~200 Hz, lus par le moteur d'écoute
        if (ear.enabled) {
            const beat = () => {
                const bass = video.paused ? 0 : ear.level.kick.toFixed(3);
                mount.style.setProperty('--bass', bass);
                // le bandeau de fond de la rangée respire avec la carte en cours
                micro.parentElement.style.setProperty('--beat', bass);
                if (!video.paused) requestAnimationFrame(beat);
            };
            video.addEventListener('play', () => requestAnimationFrame(beat));
        }

        if (!canTilt) return;
        micro.addEventListener('pointermove', (event) => {
            const rect = micro.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width;
            const y = (event.clientY - rect.top) / rect.height;
            // is-live, --mx, --my : la feuille holo et le reflet .shiny-*
            micro.classList.add('is-tilting', 'is-live');
            mount.style.setProperty('--ry', `${(x - .5) * 18}deg`);
            mount.style.setProperty('--rx', `${(.5 - y) * 18}deg`);
            mount.style.setProperty('--gx', `${x * 100}%`);
            mount.style.setProperty('--gy', `${y * 100}%`);
            mount.style.setProperty('--mx', `${x * 100}%`);
            mount.style.setProperty('--my', `${y * 100}%`);
        });
        micro.addEventListener('pointerleave', () => {
            micro.classList.remove('is-tilting', 'is-live');
            mount.style.setProperty('--rx', '0deg');
            mount.style.setProperty('--ry', '0deg');
            mount.style.removeProperty('--mx');
            mount.style.removeProperty('--my');
        });
    });
    // une seule vidéo à la fois sur la page (micro edits et intros confondus)
    if (micros.length) {
        document.addEventListener('play', (event) => {
            document.querySelectorAll('video').forEach((other) => {
                if (other !== event.target) other.pause();
            });
        }, true);
    }

    // Objets brillants (carte d'abonné) : le reflet suit le pointeur (pas d'inclinaison : rien ne bouge au survol)
    document.querySelectorAll('[data-shiny]').forEach((zone) => {
        if (reduceMotion) return;
        zone.addEventListener('pointermove', (event) => {
            const rect = zone.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width;
            const y = (event.clientY - rect.top) / rect.height;
            zone.classList.add('is-live');
            zone.style.setProperty('--mx', `${x * 100}%`);
            zone.style.setProperty('--my', `${y * 100}%`);
        });
        zone.addEventListener('pointerleave', () => {
            zone.classList.remove('is-live');
            ['--rx', '--ry', '--mx', '--my'].forEach((name) => zone.style.removeProperty(name));
        });
    });

    // Projets : bandeaux défilants ou grille 3×3
    const stage = document.querySelector('.works-stage');
    if (!stage) return;

    const grid = stage.querySelector('.works-grid');
    const switcher = document.querySelector('.view-switch');
    const buttons = switcher.querySelectorAll('button');
    const works = [...grid.querySelectorAll('.work:not([data-soon])')];

    // Deux bandeaux en sens inverse ; chaque piste est dupliquée pour boucler sans couture
    const bands = document.createElement('div');
    bands.className = 'bands';
    const rows = [works, [...works].reverse()];
    rows.forEach((row, r) => {
        const band = document.createElement('div');
        band.className = 'band';
        const track = document.createElement('div');
        track.className = 'band-track';
        track.style.setProperty('--dur', `${row.length * (r ? 9 : 7)}s`);
        [0, 1].forEach((copy) => {
            row.forEach((work) => {
                const card = work.cloneNode(true);
                card.style.removeProperty('--i');
                if (copy || r) card.setAttribute('aria-hidden', 'true');
                track.appendChild(card);
            });
        });
        // sur une pochette, le bandeau ralentit sans s'arrêter
        const pace = (rate) => track.getAnimations().forEach((animation) => animation.updatePlaybackRate(rate));
        band.addEventListener('pointerover', (event) => pace(event.target.closest('.work') ? .25 : 1));
        band.addEventListener('pointerleave', () => pace(1));
        band.addEventListener('focusin', () => pace(.25));
        band.addEventListener('focusout', () => pace(1));
        band.appendChild(track);
        bands.appendChild(band);
    });
    stage.appendChild(bands);

    // Pastille d'encre placée sous le bouton actif
    const placePill = () => {
        const active = switcher.querySelector('[aria-pressed="true"]');
        if (!active) return;
        switcher.style.setProperty('--pill-x', `${active.offsetLeft}px`);
        switcher.style.setProperty('--pill-w', `${active.offsetWidth}px`);
    };

    const setView = (view, animate) => {
        buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
        placePill();
        try { localStorage.setItem('lancoli-works-view', view); } catch (e) { /* stockage indisponible */ }
        if (!animate || reduceMotion) {
            stage.dataset.view = view;
            return;
        }
        stage.classList.add('is-switching');
        setTimeout(() => {
            stage.dataset.view = view;
            stage.classList.remove('is-switching');
        }, 450);
    };

    let saved = null;
    try { saved = localStorage.getItem('lancoli-works-view'); } catch (e) { /* stockage indisponible */ }
    if (saved && !switcher.querySelector(`[data-view="${saved}"]`)) saved = null; // vue retirée depuis
    // Bandeaux par défaut, sauf si le mouvement est réduit (ils resteraient figés)
    switcher.classList.add('is-instant');
    setView(saved || (reduceMotion ? 'grid' : 'bands'), false);
    requestAnimationFrame(() => requestAnimationFrame(() => switcher.classList.remove('is-instant')));

    buttons.forEach((button) => {
        button.addEventListener('click', () => {
            if (stage.dataset.view !== button.dataset.view) setView(button.dataset.view, true);
        });
    });
    window.addEventListener('resize', placePill);
})();
