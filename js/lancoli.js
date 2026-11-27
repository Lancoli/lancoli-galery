(() => {
    const root = document.documentElement;
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const curtainLabel = document.querySelector('.curtain-label');

    // Entering the chapter: the curtain rises
    const ready = () => root.classList.add('is-ready');
    requestAnimationFrame(() => requestAnimationFrame(ready));
    setTimeout(ready, 120); // safety net if rAF is suspended (background tab)

    // Circular CTA text: one letter per rotation to close the circle exactly
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

    // Navigation bar: it tightens as soon as the page scrolls
    const bar = document.querySelector('header');
    if (bar) {
        // two thresholds apart: tightening shifts the page by a few pixels,
        // with a single threshold the bar would drop back below and oscillate
        const stick = () => {
            if (window.scrollY > 90) bar.classList.add('is-stuck');
            else if (window.scrollY < 4) bar.classList.remove('is-stuck');
        };
        window.addEventListener('scroll', stick, { passive: true });
        stick();
    }

    // Back navigation (bfcache): restore the page to its visible state
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            root.classList.remove('is-leaving');
            root.classList.add('is-ready');
        }
    });

    // Leaving the chapter: the curtain falls, then navigate
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
        // the curtain always carries the same word: the brand, not the name of the clicked link
        if (curtainLabel) curtainLabel.textContent = 'Lancoli®';
        root.classList.add('is-leaving');
        setTimeout(() => { location.href = url; }, 900);
    });

    // Magnetic CTA: gently follows the cursor within its area
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

    // Listening: a single AudioContext for the whole site; each video or track played plugs into it by itself.
    // Three levels (0 → 1) for whoever wants them: kick (hits under ~200 Hz, for the frames), swell (mid-bass
    // ~100–350 Hz, slow and gradual) and grain (highs ~4–12 kHz, nervous, jumping at each transient).
    // Not over file://: the browser mutes a medium plugged into Web Audio there.
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
        // average of bins a to b; fftSize 1024: ~47 Hz per bin at 48 kHz
        const band = (a, b) => {
            let sum = 0;
            for (let i = a; i <= b; i++) sum += bins[i];
            return sum / ((b - a + 1) * 255);
        };

        const tick = () => {
            if (playing.size) {
                analyser.getByteFrequencyData(bins);
                // sliding floor: keep only what exceeds the average level, i.e. the hits
                const low = band(1, 4);
                kickFloor += (low - kickFloor) * .04;
                const hit = Math.min(1, Math.max(0, low - kickFloor * .8) * 3);
                level.kick = hit > level.kick ? hit : level.kick * .86;
                // the swell rises and falls slowly, without jolts
                const mid = band(2, 7);
                level.swell += (mid - level.swell) * (mid > level.swell ? .05 : .02);
                // the grain: the level of the highs plus their jumps from frame to frame, released fast
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
                // without a user gesture, the context would stay suspended and the medium muted: wait
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
                    return; // already plugged elsewhere: leave it as is
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

    // Wave field: long tight lines cross the page like signal traces — a slow
    // swell that adds up and spreads, and on top finer packets of oscillation. When a sound
    // plays, the field listens at two levels: the mid-bass gently swells the waves; the highs make
    // the trace shiver, like the texture's grain. The cursor only brushes it. Shades of black.
    (() => {
        const aura = document.querySelector('.aura');
        if (!aura || reduceMotion) return;

        const canvas = document.createElement('canvas');
        canvas.className = 'flock';
        canvas.setAttribute('aria-hidden', 'true');
        aura.after(canvas);
        const ctx = canvas.getContext('2d');

        const GAP = 19;             // average gap between two lines (px)
        const STEP = 7;             // horizontal step of the trace (px)
        const CHUNK = 5;            // points per drawn piece (the ink varies from piece to piece)
        const SIGMA = 80;           // reach of the cursor's influence (Gaussian, px)
        const PUSH = 11;            // maximum spread of the lines around the cursor (px)
        // the swells: amplitude (px), wave number, speed, phase shift per line
        const SWELLS = [
            { a: 30, k: .0019, w: .22, d: .16 },
            { a: 14, k: .0047, w: -.48, d: .31 },
            { a: 6, k: .011, w: .9, d: .55 }
        ];
        // the signal: two thin carriers, borne by a travelling envelope (packets, like a sound wave)
        const CARRIERS = [
            { a: 4.5, k: .043, w: 2.6, d: .9 },
            { a: 2.5, k: .071, w: -3.4, d: 1.7 }
        ];
        const sound = ear.level;
        // sx, sy: the smoothed cursor position, so the distortion follows it without jolts
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
            // lines beyond the edges, so the swell leaves no gap there
            const n = Math.ceil((height + 160) / GAP);
            lines = Array.from({ length: n }, (_, i) => ({
                y: -80 + i * GAP,
                shade: 23 + ((i * 41) % 92),            // from ink (#171717) to smoke grey
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
            ctx.lineCap = 'butt';     // clean ends: no darker dot at the joins between pieces
            ctx.lineJoin = 'round';
            const cols = Math.ceil(width / STEP) + 1;
            const pts = new Float32Array(cols * 2);
            const near = new Float32Array(cols);
            const pack = new Float32Array(cols);
            const swell = 1 + sound.swell * 1.5;          // the mid-bass swells the waves
            const grain = sound.grain;

            lines.forEach((line, i) => {
                for (let c = 0; c < cols; c++) {
                    const x = c * STEP;
                    let y = line.y;
                    for (const s of SWELLS) y += s.a * swell * Math.sin(x * s.k + t * s.w + i * s.d + line.phase * .2);
                    // the packet envelope: zero in places, full elsewhere, it slides along the line
                    const e = .5 + .5 * Math.sin(x * .0034 - t * .55 + i * .43 + line.phase);
                    const env = e * e;
                    for (const s of CARRIERS) y += s.a * env * (1 + sound.swell * .9) * Math.sin(x * s.k + t * s.w + i * s.d);
                    // the highs: an erratic shiver, stronger where the signal is dense
                    if (grain > .01) y += (Math.random() - .5) * grain * (2 + env * 6);
                    // the cursor: the lines move apart on either side, bell-shaped (Gaussian) — zero at the centre
                    // and far away, maximum at a distance SIGMA, with no break or sudden sign change
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
                    // fade at the screen edges, and a pulse travelling with the swell
                    const edge = Math.min(1, x / 120, (width - x) / 120 + .2);
                    const pulse = .5 + .5 * Math.sin(x * .006 - t * .8 + i * .7);
                    const flicker = grain > .01 ? grain * .12 * Math.random() : 0;
                    const alpha = Math.max(0, (.05 + .1 * pulse + pack[k] * .05 + flicker + near[k] * .2) * edge);
                    const grey = Math.round(line.shade * (1 - near[k] * .5));
                    ctx.strokeStyle = `rgba(${grey}, ${grey}, ${grey}, ${alpha})`;
                    ctx.lineWidth = .6 + near[k] * .3;
                    // smooth curve: quadratics through the midpoints, joined from piece to piece
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
            // the cursor arrives: the smoothed position starts from it, not from the screen corner
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

    // Long pages: sections appear as the page scrolls down
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

    // Route: a single line links the stages, the traveller goes down it as the page scrolls
    const journey = document.querySelector('.journey');
    if (journey) {
        const stops = [...journey.querySelectorAll('[data-stop]')];
        // detours of each leg, as a fraction of the free width to the right of the line
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
            // the traveller stays at mid-screen height; the line never goes back up,
            // so a binary search finds the point at that height
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
                // along the stage: straight; between two stages: hairpins
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

    // Before / after: the slider moves the cut line
    document.querySelectorAll('.compare input').forEach((input) => {
        input.addEventListener('input', () => {
            input.parentNode.style.setProperty('--pos', `${input.value}%`);
        });
    });

    // Viewer: the shots open large, arrows to move from one to the next
    const zooms = [...document.querySelectorAll('a[data-zoom]')];
    if (zooms.length && window.HTMLDialogElement) {
        const t = window.lancoliT || ((k) => k);
        const box = document.createElement('dialog');
        box.className = 'lightbox';
        box.innerHTML = '<img alt=""><div class="slate" aria-live="polite"></div>'
            + `<button type="button" class="lightbox-close" aria-label="${t('ui.close')}">✕</button>`
            + `<button type="button" class="lightbox-prev" aria-label="${t('ui.previous')}">←</button>`
            + `<button type="button" class="lightbox-next" aria-label="${t('ui.next')}">→</button>`;
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
        // click outside the image: close
        box.addEventListener('click', (event) => {
            if (event.target === box) box.close();
        });
        box.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowLeft') show(current - 1);
            if (event.key === 'ArrowRight') show(current + 1);
        });
    }

    // Cassettes: a home-made player instead of the native controls, one track at a time
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
        const t = window.lancoliT || ((k) => k);
        const setPlaying = (playing) => {
            tape.classList.toggle('is-playing', playing);
            button.setAttribute('aria-label', playing ? t('ui.pause') : label);
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

    // Files: each stop on the map opens its drawer
    document.querySelectorAll('[data-file]').forEach((trigger) => {
        const file = document.getElementById(`file-${trigger.dataset.file}`);
        if (file && file.showModal) trigger.addEventListener('click', () => file.showModal());
    });
    document.querySelectorAll('dialog.file').forEach((file) => {
        // click on the backdrop or the close button: dismiss
        file.addEventListener('click', (event) => {
            if (event.target === file || event.target.closest('[data-close]')) file.close();
        });
    });

    // Intros: home-made video player, with a playlist
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
            if (video.paused) video.play().catch(() => { /* playback refused by the browser */ });
            else video.pause();
        };
        const paint = () => {
            time.textContent = `${clock(video.currentTime)} / ${clock(video.duration)}`;
            const done = video.duration ? video.currentTime / video.duration : 0;
            seek.value = done * 1000;
            seek.style.setProperty('--done', `${done * 100}%`);
        };
        const t = window.lancoliT || ((k) => k);
        const setPlaying = (playing) => {
            reel.classList.toggle('is-playing', playing);
            play.setAttribute('aria-label', playing ? t('ui.pause') : t('ui.play'));
            big.setAttribute('aria-label', playing ? t('ui.pause') : t('ui.play'));
        };
        const load = (index, autoplay) => {
            current = (index + items.length) % items.length;
            const item = items[current];
            items.forEach((other) => other.removeAttribute('aria-current'));
            item.setAttribute('aria-current', 'true');
            reel.querySelector('.reel-index').textContent = `Intro ${String(current + 1).padStart(2, '0')}`;
            reel.querySelector('.reel-title').textContent = item.querySelector('strong').textContent;
            // #t=0.5: shows a frame of the video rather than a black screen before playing
            video.src = autoplay ? item.dataset.src : `${item.dataset.src}#t=0.5`;
            if (autoplay) video.play().catch(() => { /* playback refused by the browser */ });
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
            mute.textContent = video.muted ? t('ui.mute') : t('ui.sound');
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
        // end of an intro: move on to the next one, or stop if there is only one
        video.addEventListener('ended', () => {
            if (items.length > 1) load(current + 1, true);
            else setPlaying(false);
        });
        paint();
    });

    // Micro edits and intros: video slides, play on click, 3D tilt under the cursor
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

        const t = window.lancoliT || ((k) => k);
        const toggle = () => {
            if (video.paused) video.play().catch(() => { /* playback refused by the browser */ });
            else video.pause();
        };
        const setPlaying = (playing) => {
            micro.classList.toggle('is-playing', playing);
            button.setAttribute('aria-label', playing ? t('ui.pause') : label);
        };
        video.addEventListener('click', toggle);
        button.addEventListener('click', toggle);
        // double-click: full screen
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

        // Intros: when playing, the page goes dark and a blurred veil takes the video's colours
        if (micro.classList.contains('micro--wide')) {
            const section = micro.closest('section');
            const paintAmbient = () => {
                if (video.paused) return;
                // 32 × 18 pixels are enough: the CSS blur does the rest
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
                    // click in the dark: pause, so the lights come back on
                    veil.addEventListener('click', () => ambient.video && ambient.video.pause());
                    ambient = { ctx: canvas.getContext('2d'), video: null, timer: 0 };
                    veil.offsetWidth; // forces a first render, otherwise the entry fade is skipped
                }
                clearTimeout(ambient.timer);
                ambient.video = video;
                section.classList.add('is-ambient-stage');
                root.classList.add('is-ambient');
                requestAnimationFrame(paintAmbient);
            });
            video.addEventListener('pause', () => {
                if (!ambient || ambient.video !== video) return; // another intro has already taken over
                root.classList.remove('is-ambient');
                // the section stays above the veil while it fades
                ambient.timer = setTimeout(() => section.classList.remove('is-ambient-stage'), 900);
            });
        }

        // The frame beats on the bass: --bass (0 → 1) follows the hits under ~200 Hz, read by the listening engine
        if (ear.enabled) {
            const beat = () => {
                const bass = video.paused ? 0 : ear.level.kick.toFixed(3);
                mount.style.setProperty('--bass', bass);
                // the row's background strip breathes with the current card
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
            // is-live, --mx, --my: the holo foil and the .shiny-* glare
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
    // a single video at a time on the page (micro edits and intros together)
    if (micros.length) {
        document.addEventListener('play', (event) => {
            document.querySelectorAll('video').forEach((other) => {
                if (other !== event.target) other.pause();
            });
        }, true);
    }

    // Shiny objects (member card): the glare follows the pointer (no tilt: nothing moves on hover)
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

    // Projects: scrolling strips or 3×3 grid
    const stage = document.querySelector('.works-stage');
    if (!stage) return;

    const grid = stage.querySelector('.works-grid');
    const switcher = document.querySelector('.view-switch');
    const buttons = switcher.querySelectorAll('button');
    const works = [...grid.querySelectorAll('.work:not([data-soon])')];

    // Two strips in opposite directions; each track is duplicated to loop seamlessly
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
        // over a cover, the strip slows down without stopping
        const pace = (rate) => track.getAnimations().forEach((animation) => animation.updatePlaybackRate(rate));
        band.addEventListener('pointerover', (event) => pace(event.target.closest('.work') ? .25 : 1));
        band.addEventListener('pointerleave', () => pace(1));
        band.addEventListener('focusin', () => pace(.25));
        band.addEventListener('focusout', () => pace(1));
        band.appendChild(track);
        bands.appendChild(band);
    });
    stage.appendChild(bands);

    // Ink chip placed under the active button
    const placePill = () => {
        const active = switcher.querySelector('[aria-pressed="true"]');
        if (!active) return;
        switcher.style.setProperty('--pill-x', `${active.offsetLeft}px`);
        switcher.style.setProperty('--pill-w', `${active.offsetWidth}px`);
    };

    const setView = (view, animate) => {
        buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
        placePill();
        try { localStorage.setItem('lancoli-works-view', view); } catch (e) { /* storage unavailable */ }
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
    try { saved = localStorage.getItem('lancoli-works-view'); } catch (e) { /* storage unavailable */ }
    if (saved && !switcher.querySelector(`[data-view="${saved}"]`)) saved = null; // view removed since
    // Strips by default, unless motion is reduced (they would stay frozen)
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
