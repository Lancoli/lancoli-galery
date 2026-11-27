// Le Horla: a cassette at the entrance, then a relief map led by the sound.
// Classic script (not a module) so it also works when the file is opened directly;
// three.js is imported on the fly from the importmap of horla.html.
(async () => {
    // Chapters of the audio storyboard. PROVISIONAL timecodes, set on the dips of the sound:
    // to replace with the real cut. `at` = position of the place in the town (x, z).
    const CHAPTERS = [
        { id: 'barres', title: 'Les barres', start: 0, color: '#f2c14e', at: [-52, -10] },
        { id: 'lotissement', title: 'Le lotissement', start: 58.6, color: '#c79bf2', at: [-25, 3] },
        { id: 'chambre', title: 'La chambre', start: 115.3, color: '#58c7e0', at: [1, -15] },
        { id: 'terminus', title: 'Le terminus', start: 155, color: '#ff4d3d', at: [28, 1] },
        { id: 'poste', title: 'Le poste', start: 213.8, color: '#ff8a2a', at: [54, -12] }
    ];
    // Models supplied later: a .glb path replaces the mock-up (local server required).
    const MODELS = { boombox: null, cassette: null };

    const root = document.documentElement;
    const stage = document.querySelector('.world-stage');
    const audio = document.getElementById('horla-audio');
    const envelope = window.HORLA_ENVELOPE;
    if (!stage || !audio || !envelope) return;

    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const startButton = document.querySelector('.horla-start');
    const cue = document.querySelector('.tape-cue');
    const stops = CHAPTERS.map((c) => document.querySelector(`.stop[data-file="${c.id}"]`));
    const timeline = document.querySelector('.timeline');
    const wave = timeline.querySelector('canvas');
    const waveCtx = wave.getContext('2d');
    const seek = timeline.querySelector('.timeline-seek');
    const playButton = timeline.querySelector('.timeline-play');
    const timeLabel = timeline.querySelector('.timeline-time');
    const numLabel = timeline.querySelector('.timeline-num');
    const titleLabel = timeline.querySelector('.timeline-title');
    const chapterRow = timeline.querySelector('.timeline-chapters');

    // ---------- The sound: precomputed envelope (horla-envelope.js), 20 values per second ----------
    const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const levels = Float32Array.from(envelope.data, (char) => ABC.indexOf(char) / 63);
    const total = () => audio.duration || envelope.duration;
    const levelAt = (t) => {
        const i = Math.max(0, Math.min(levels.length - 1, t * envelope.rate));
        const a = levels[Math.floor(i)];
        const b = levels[Math.ceil(i)];
        return a + (b - a) * (i % 1);
    };
    const chapterAt = (t) => CHAPTERS.reduce((found, c, i) => (t >= c.start ? i : found), 0);
    const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

    // direct link: horla.html#t=70 opens the town at 70 s, skipping the entrance
    const deepLink = /[#&]t=([\d.]+)/.exec(location.hash);
    let pendingTime = deepLink ? parseFloat(deepLink[1]) : 0;
    const now = () => (audio.readyState ? audio.currentTime : pendingTime);

    let live = false;
    let enteredAt = 0;
    let active = -1;

    const setActive = (index) => {
        if (index === active) return;
        active = index;
        const chapter = CHAPTERS[index];
        timeline.style.setProperty('--accent', chapter.color);
        numLabel.textContent = `Lieu 0${index + 1} / 0${CHAPTERS.length}`;
        titleLabel.textContent = chapter.title;
        stops.forEach((stop, i) => stop.classList.toggle('is-active', i === index));
        CHAPTERS.forEach((c, i) => c.button.classList.toggle('is-active', i === index));
    };

    const enter = (autoplay = true, instant = false) => {
        if (live) return;
        live = true;
        enteredAt = instant ? -1e7 : performance.now();
        root.classList.add('horla-live');
        if (autoplay) audio.play().catch(() => { /* playback refused: the timeline button takes over */ });
    };

    CHAPTERS.forEach((chapter, i) => {
        const end = CHAPTERS[i + 1] ? CHAPTERS[i + 1].start : envelope.duration;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'timeline-chapter slate';
        button.style.setProperty('--accent', chapter.color);
        button.style.left = `${(chapter.start / envelope.duration) * 100}%`;
        button.style.width = `${((end - chapter.start) / envelope.duration) * 100}%`;
        button.innerHTML = `<i>0${i + 1}</i><span>${chapter.title}</span>`;
        button.setAttribute('aria-label', `Aller à : ${chapter.title}`);
        button.addEventListener('click', () => {
            audio.currentTime = chapter.start;
            pendingTime = chapter.start;
            if (audio.paused) audio.play().catch(() => {});
        });
        chapterRow.appendChild(button);
        chapter.button = button;
    });

    startButton.addEventListener('click', () => enter());
    playButton.addEventListener('click', () => (audio.paused ? audio.play() : audio.pause()));
    seek.addEventListener('input', () => {
        pendingTime = (seek.value / 1000) * total();
        audio.currentTime = pendingTime;
    });
    timeline.querySelector('.timeline-open').addEventListener('click', () => {
        const file = document.getElementById(`file-${CHAPTERS[active].id}`);
        if (file && file.showModal) file.showModal();
    });
    audio.addEventListener('play', () => timeline.classList.add('is-playing'));
    audio.addEventListener('pause', () => timeline.classList.remove('is-playing'));
    audio.addEventListener('loadedmetadata', () => {
        if (pendingTime) audio.currentTime = pendingTime;
    });
    // a single sound source at a time (the B-side lives in the Behind-the-scenes file)
    document.addEventListener('play', (event) => {
        if (event.target === audio) {
            document.querySelectorAll('.tape audio').forEach((other) => other.pause());
        } else if (event.target.tagName === 'AUDIO') {
            audio.pause();
        }
    }, true);

    // Waveform: one bar every 3 px, coloured per place once played
    let drawnAt = -1;
    let drawnWidth = 0;
    const drawWave = (t) => {
        const width = wave.clientWidth;
        const height = wave.clientHeight;
        if (!width || (Math.abs(t - drawnAt) < .04 && width === drawnWidth)) return;
        const dpr = Math.min(devicePixelRatio || 1, 2);
        if (width !== drawnWidth) {
            wave.width = width * dpr;
            wave.height = height * dpr;
        }
        drawnAt = t;
        drawnWidth = width;
        const duration = total();
        waveCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        waveCtx.clearRect(0, 0, width, height);
        for (let x = 0; x < width; x += 3) {
            const from = (x / width) * duration;
            const to = ((x + 3) / width) * duration;
            let level = 0;
            for (let s = from; s < to; s += 1 / envelope.rate) level = Math.max(level, levelAt(s));
            const bar = Math.max(2, level * height);
            waveCtx.fillStyle = from <= t ? CHAPTERS[chapterAt(from)].color : 'rgba(236, 231, 223, .2)';
            waveCtx.fillRect(x, (height - bar) / 2, 2, bar);
        }
        waveCtx.fillStyle = '#ece7df';
        waveCtx.fillRect((t / duration) * width, 0, 1, height);
    };

    const updateUi = () => {
        const t = now();
        setActive(chapterAt(t));
        seek.value = (t / total()) * 1000;
        timeLabel.textContent = `${clock(t)} / ${clock(total())}`;
        if (live) drawWave(t);
    };

    // ---------- The three.js stage ----------
    let world = null;
    try {
        world = await buildWorld();
    } catch (error) {
        root.classList.add('no-gl'); // no WebGL or no network: the timeline and the files remain
    }

    if (deepLink) enter(false, true);
    const loop = (time) => {
        updateUi();
        if (world) world.render(time);
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    async function buildWorld() {
        const THREE = await import('three');
        const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
        stage.appendChild(renderer.domElement);
        const canvas = renderer.domElement;

        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0x121314, 110, 330);
        scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
        scene.environmentIntensity = .22;
        const rigEnvironment = 1 / .22 * .9; // the radio set keeps its reflections despite the night
        scene.add(new THREE.HemisphereLight(0x93a6cc, 0x1c1714, .55));
        const moon = new THREE.DirectionalLight(0x9db4ff, .9);
        moon.position.set(-40, 70, 30);
        scene.add(moon);

        const camera = new THREE.PerspectiveCamera(32, 1, .1, 600);

        const box = (w, h, d, material, x = 0, y = 0, z = 0) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
            mesh.position.set(x, y, z);
            return mesh;
        };
        // cylinder lying down, facing the camera
        const disc = (radius, depth, material, x = 0, y = 0, z = 0) => {
            const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 40), material);
            mesh.rotation.x = Math.PI / 2;
            mesh.position.set(x, y, z);
            return mesh;
        };

        // ===== Stage 1: the radio set and the cassette, hanging high above the town =====
        const SKY = 240;
        const rig = new THREE.Group();
        scene.add(rig);
        const sodium = new THREE.PointLight(0xff8a2a, 70, 30);
        sodium.position.set(-5, 4, 6);
        const brake = new THREE.PointLight(0xff3a2a, 16, 14);
        brake.position.set(3, -2.5, 3);
        rig.add(sodium, brake);

        const shell = new THREE.MeshStandardMaterial({ color: 0x6a6f77, metalness: .7, roughness: .34, envMapIntensity: rigEnvironment });
        const dark = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, metalness: .2, roughness: .85 });
        const chrome = new THREE.MeshStandardMaterial({ color: 0xc4c8cf, metalness: 1, roughness: .2, envMapIntensity: rigEnvironment });
        const dial = new THREE.MeshStandardMaterial({ color: 0x1a0d04, emissive: 0xff8a2a, emissiveIntensity: .5 });

        const boombox = new THREE.Group();
        boombox.position.x = -1.3;
        rig.add(boombox);
        boombox.add(box(4.4, 2.3, 1.1, shell));
        boombox.add(box(4.2, .5, .04, dark, 0, .72, .56));          // tuner strip
        boombox.add(box(2.2, .1, .03, dial, -.7, .78, .59));        // lit dial
        boombox.add(box(1.2, .78, .06, dark, 0, -.32, .56));        // cassette door
        boombox.add(box(3.5, .1, .1, chrome, 0, 1.72, 0));          // handle
        boombox.add(box(.1, .6, .1, chrome, -1.75, 1.42, 0), box(.1, .6, .1, chrome, 1.75, 1.42, 0));
        for (let i = 0; i < 6; i++) boombox.add(box(.22, .08, .3, chrome, -.7 + i * .28, 1.19, .2));
        for (let i = 0; i < 3; i++) boombox.add(disc(.11, .1, chrome, 1 + i * .36, .72, .6));
        const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, 1.3, 8), chrome);
        antenna.position.set(1.75, 1.65, -.35);
        antenna.rotation.z = -.55;
        boombox.add(antenna);
        const domes = [-1.45, 1.45].map((x) => {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(.76, .06, 16, 56), chrome);
            ring.position.set(x, -.3, .56);
            const dome = new THREE.Mesh(new THREE.SphereGeometry(.24, 28, 14), shell);
            dome.position.set(x, -.3, .56);
            dome.scale.z = .45;
            boombox.add(ring, disc(.7, .08, dark, x, -.3, .54), dome);
            return dome;
        });
        const reels = [-.27, .27].map((x) => {
            const reel = new THREE.Group();
            reel.position.set(x, -.32, .6);
            reel.add(disc(.13, .03, chrome));
            for (let i = 0; i < 3; i++) {
                const spoke = box(.2, .035, .04, dark);
                spoke.rotation.z = (i * Math.PI) / 3;
                reel.add(spoke);
            }
            boombox.add(reel);
            return reel;
        });

        const label = document.createElement('canvas');
        label.width = 512;
        label.height = 256;
        const pen = label.getContext('2d');
        pen.fillStyle = '#ff8a2a';
        pen.fillRect(0, 0, 512, 256);
        pen.fillStyle = '#121314';
        pen.font = '700 150px Georgia, serif';
        pen.fillText('A', 28, 150);
        pen.font = '26px Consolas, monospace';
        pen.fillText('STORYBOARD AUDIO', 150, 70);
        pen.fillRect(150, 92, 330, 3);
        pen.fillRect(150, 122, 330, 3);
        const labelTexture = new THREE.CanvasTexture(label);
        labelTexture.colorSpace = THREE.SRGBColorSpace;

        const cassette = new THREE.Group();
        cassette.add(
            box(1.5, .95, .16, new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: .3, roughness: .5 })),
            box(1.32, .56, .012, new THREE.MeshStandardMaterial({ map: labelTexture, roughness: .7 }), 0, .12, .082),
            box(.56, .2, .014, dark, 0, .06, .09),
            disc(.075, .02, chrome, -.17, .06, .1),
            disc(.075, .02, chrome, .17, .06, .1),
            box(.9, .16, .012, dark, 0, -.36, .082)
        );
        const cassetteHome = new THREE.Vector3(2.5, .3, .6);
        const slot = new THREE.Vector3(boombox.position.x, -.32, .78);
        cassette.position.copy(cassetteHome);
        cassette.scale.setScalar(1.5);
        rig.add(cassette);

        if (MODELS.boombox || MODELS.cassette) {
            import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
                const loader = new GLTFLoader();
                // replaces a group's volumes with the model, scaled to the same width
                const swap = (group, url, width) => loader.load(url, (gltf) => {
                    const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
                    gltf.scene.scale.setScalar(width / size.x);
                    group.clear();
                    group.add(gltf.scene);
                });
                if (MODELS.boombox) swap(boombox, MODELS.boombox, 4.4);
                if (MODELS.cassette) swap(cassette, MODELS.cassette, 1.5);
            });
        }

        // ===== Stage 2: the relief map, five places linked by the bus line =====
        const city = new THREE.Group();
        scene.add(city);
        let seed = 7;
        const rand = () => {
            seed = (seed + 0x6d2b79f5) | 0;
            let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
            return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
        };

        // relief: three-octave value noise, plain in the foreground, ridges at the back
        const mix = (a, b, k) => a + (b - a) * k;
        const smooth = (from, to, v) => {
            const k = Math.max(0, Math.min(1, (v - from) / (to - from)));
            return k * k * (3 - 2 * k);
        };
        const hash = (x, z) => {
            const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
            return s - Math.floor(s);
        };
        const noise = (x, z) => {
            const xi = Math.floor(x);
            const zi = Math.floor(z);
            const u = smooth(0, 1, x - xi);
            const v = smooth(0, 1, z - zi);
            return mix(mix(hash(xi, zi), hash(xi + 1, zi), u), mix(hash(xi, zi + 1), hash(xi + 1, zi + 1), u), v);
        };
        const fbm = (x, z) => noise(x, z) * .55 + noise(x * 2.1 + 9, z * 2.1) * .28 + noise(x * 4.3, z * 4.3 + 4) * .17;
        const rawHeight = (x, z) => fbm(x * .02 + 3, z * .02) ** 1.7 * 42 * mix(.22, 1, smooth(45, -40, z)) + Math.max(0, -z - 60) * .16;
        const stopsAt = CHAPTERS.map((c) => new THREE.Vector3(c.at[0], rawHeight(c.at[0], c.at[1]), c.at[1]));
        // each place rests on a shelf cut into the slope
        const heightAt = (x, z) => {
            let h = rawHeight(x, z);
            stopsAt.forEach((s) => { h = mix(s.y, h, smooth(10, 24, Math.hypot(x - s.x, z - s.z))); });
            return h;
        };

        const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ color: 0x0f1011, roughness: 1 }));
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -1;
        scene.add(ground);

        const land = new THREE.PlaneGeometry(680, 500, 170, 125);
        land.rotateX(-Math.PI / 2);
        land.translate(0, 0, -160);
        const spots = land.attributes.position;
        const shades = new Float32Array(spots.count * 3);
        for (let i = 0; i < spots.count; i++) {
            const h = heightAt(spots.getX(i), spots.getZ(i));
            spots.setY(i, h);
            const tone = .06 + Math.min(1, h / 36) * .2;                    // lighter at altitude
            shades.set([tone, tone * 1.03, tone * 1.1], i * 3);
        }
        land.setAttribute('color', new THREE.BufferAttribute(shades, 3));
        land.computeVertexNormals();
        city.add(new THREE.Mesh(land, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .95, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })));
        // visible mesh, like a topographic survey
        city.add(new THREE.Mesh(land, new THREE.MeshBasicMaterial({ color: 0xece7df, wireframe: true, transparent: true, opacity: .05 })));

        // ribbon laid on the relief along a series of points (bus line)
        const ribbon = (points, width, lift, material) => {
            const positions = [];
            const index = [];
            points.forEach((p, i) => {
                const a = points[Math.max(0, i - 1)];
                const b = points[Math.min(points.length - 1, i + 1)];
                const dx = b.x - a.x;
                const dz = b.z - a.z;
                const len = Math.hypot(dx, dz) || 1;
                const nx = (-dz / len) * width * .5;
                const nz = (dx / len) * width * .5;
                positions.push(p.x + nx, p.y + lift, p.z + nz, p.x - nx, p.y + lift, p.z - nz);
                if (i) index.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2, i * 2 - 1, i * 2 + 1);
            });
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setIndex(index);
            geometry.computeVertexNormals();
            const mesh = new THREE.Mesh(geometry, material);
            city.add(mesh);
            return mesh;
        };
        // cuts a path into small steps so it hugs the slopes
        const drape = (points, step) => {
            const out = [];
            for (let i = 0; i < points.length - 1; i++) {
                const n = Math.ceil(points[i].distanceTo(points[i + 1]) / step);
                for (let j = 0; j < n; j++) {
                    const x = mix(points[i].x, points[i + 1].x, j / n);
                    const z = mix(points[i].z, points[i + 1].z, j / n);
                    out.push(new THREE.Vector3(x, heightAt(x, z), z));
                }
            }
            out.push(points[points.length - 1].clone());
            return out;
        };
        ribbon(drape(stopsAt, 1.5), 1.1, .6, new THREE.MeshBasicMaterial({ color: 0xff4d3d, side: THREE.DoubleSide }));

        // only a few hamlets: buildings cluster, the rest is left to the relief
        const unit = new THREE.BoxGeometry(1, 1, 1);
        unit.translate(0, .5, 0);
        const concrete = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: .88, metalness: .05 });
        const STEP = 4.4;
        const blocks = new THREE.InstancedMesh(unit, concrete, 1800);
        const matrix = new THREE.Matrix4();
        const tint = new THREE.Color();
        let count = 0;
        for (let ix = -44; ix <= 44; ix++) {
            for (let iz = -46; iz <= 14; iz++) {
                const x = ix * STEP + (rand() - .5) * 1.2;
                const z = iz * STEP + (rand() - .5) * 1.2;
                if (stopsAt.some((s) => Math.hypot(s.x - x, s.z - z) < 15)) continue;
                const cluster = fbm(x * .03 + 20, z * .03 + 7);
                if (count >= 1800 || rand() > Math.max(0, cluster - .52) * 2.2) continue;
                const height = 1 + rand() ** 2 * 7;
                matrix.makeScale(2.5 + rand() * 1.3, height + 1.5, 2.5 + rand() * 1.3);
                matrix.setPosition(x, heightAt(x, z) - 1.5, z);              // sunk into the slope
                blocks.setMatrixAt(count, matrix);
                const grey = .12 + rand() * .09;
                blocks.setColorAt(count, tint.setRGB(grey, grey * 1.03, grey * 1.08));
                count++;
            }
        }
        blocks.count = count;
        city.add(blocks);

        // the five places: a few recognisable volumes, one glowing material per place
        const slab = new THREE.MeshStandardMaterial({ color: 0x3d4046, flatShading: true, roughness: .85 });
        const districts = CHAPTERS.map((chapter, i) => {
            const group = new THREE.Group();
            group.position.copy(stopsAt[i]);
            city.add(group);
            const glow = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, emissive: chapter.color, emissiveIntensity: .4 });
            // volume set on the ground (y = base)
            const put = (w, h, d, x, y, z, material = slab) => group.add(box(w, h, d, material, x, y + h / 2, z));

            if (chapter.id === 'chambre') {
                put(5, 15, 5, -4, 0, -5);
                put(4, 9, 4, 2.5, 0, -6);
                put(3.5, 6, 3.5, -5, 0, 2);
                put(1.2, 1.5, .2, -4, 11, -2.45, glow);                     // the blue window
            } else if (chapter.id === 'poste') {
                put(7, 6, 5, 0, 0, -5);
                put(3, 3.5, 3, 5.5, 0, -1);
                put(2.4, 1.3, .2, 0, 3.4, -2.45, glow);                     // the orange room
                put(.12, 3, .12, 2.6, 6, -5);                               // antenna
            } else if (chapter.id === 'barres') {
                for (let b = 0; b < 5; b++) {
                    const x = (b - 2) * 3.8;
                    const h = 13 + (b % 2) * 3;
                    put(2.3, h, 7, x, 0, -6);
                    for (let row = 0; row < 3; row++) put(1.5, .35, .15, x, 3.5 + row * 3.4, -2.48, glow);
                }
            } else if (chapter.id === 'lotissement') {
                for (let h = 0; h < 6; h++) {
                    const x = ((h % 3) - 1) * 5.4;
                    const z = h < 3 ? -6.5 : 4.5;
                    put(3.4, .2, 3.4, x, 0, z);
                    [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]].forEach(([cx, cz]) => put(.22, 2.6 + (h % 2) * 1.2, .22, x + cx, .2, z + cz));
                    if (h % 3 !== 1) put(3.6, .2, 3.6, x, 2.8, z);          // one house in three without a roof
                    if (h % 2 === 0) put(.4, .4, .4, x, 1, z, glow);
                }
            } else {
                put(15, .2, 6, 1, 0, -4);                                   // the platform
                put(12, .3, 3.6, 1, 3.2, -4.6);                             // the canopy
                [-4, 1, 6].forEach((x) => put(.3, 3.2, .3, x, 0, -4.6));
                put(5.2, 1.8, 1.6, 1.5, .35, 2.2, new THREE.MeshStandardMaterial({ color: 0xb9bdc4, flatShading: true, roughness: .6 }));
                put(.12, .34, .34, -1.16, 1.1, 1.7, glow);                  // tail lights
                put(.12, .34, .34, -1.16, 1.1, 2.7, glow);
                put(10, .1, .12, 1, 3.05, -2.85, glow);
            }

            // ground beacon + beam, driven by the amplitude
            const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.9, 48), new THREE.MeshBasicMaterial({ color: chapter.color, transparent: true, opacity: .5, side: THREE.DoubleSide }));
            ring.rotation.x = -Math.PI / 2;
            ring.position.copy(stopsAt[i]);
            ring.position.y += .25;
            const beamGeometry = new THREE.CylinderGeometry(.16, .16, 1, 10);
            beamGeometry.translate(0, .5, 0);
            const beam = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({ color: chapter.color, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
            beam.position.copy(stopsAt[i]);
            beam.scale.y = .001;
            city.add(ring, beam);
            return { group, glow, ring, beam };
        });

        // a single lamp moves from place to place and beats with the sound
        const pulse = new THREE.PointLight(0xffffff, 0, 60, 1.5);
        scene.add(pulse);

        // ---------- Camera: from the entrance (in the sky) to the town ----------
        const introPos = new THREE.Vector3();
        const introLook = new THREE.Vector3();
        const worldOffset = new THREE.Vector3(0, 27, 84);
        const focus = new THREE.Vector3(-20, 0, 2);
        const focusTarget = new THREE.Vector3();
        const look = new THREE.Vector3();
        const scratch = new THREE.Vector3();
        const pointer = new THREE.Vector2(0, 0);
        const raycaster = new THREE.Raycaster();
        let hovering = false;
        let width = 0;
        let height = 0;

        const resize = () => {
            width = stage.clientWidth;
            height = stage.clientHeight;
            if (!width || !height) return;
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            const wide = camera.aspect > 1.15;
            // large screen: the radio set fills the right half; small screen: it moves below the text
            const distance = wide ? Math.min(21, Math.max(12, 28 / camera.aspect)) : Math.max(13, 13.6 / camera.aspect);
            const visible = 2 * Math.tan(THREE.MathUtils.degToRad(16)) * distance;
            rig.position.set(wide ? visible * camera.aspect * .225 : -.1, SKY, 0);
            introPos.set(0, SKY + .5 + (wide ? 0 : visible * .24), distance);
            introLook.set(0, SKY + (wide ? .2 : visible * .24), 0);
            worldOffset.set(0, 27, 84).multiplyScalar(wide ? 1 : Math.min(2.2, 1.25 / camera.aspect));
            // the fog recedes with the camera so the town stays readable on a narrow screen
            scene.fog.near = worldOffset.length() * .75;
            scene.fog.far = worldOffset.length() * 3.6;
        };
        new ResizeObserver(resize).observe(stage);
        resize();

        addEventListener('pointermove', (event) => {
            pointer.set((event.clientX / width) * 2 - 1, -(event.clientY / height) * 2 + 1);
            if (live) return;
            raycaster.setFromCamera(pointer, camera);
            hovering = event.target === canvas && raycaster.intersectObject(rig, true).length > 0;
            canvas.style.cursor = hovering ? 'pointer' : '';
        }, { passive: true });
        canvas.addEventListener('click', () => {
            if (!live && hovering) enter();
        });

        const ease = (k) => (k < .5 ? 4 * k * k * k : 1 - ((-2 * k + 2) ** 3) / 2);
        let amp = 0;
        let cueOn = false;
        let focusSet = false;

        const render = (time) => {
            const t = time * .001;
            // k: 0 at the entrance, 1 once in the town (the cassette goes in first)
            const k = !live ? 0 : reduceMotion ? 1 : Math.min(1, Math.max(0, (time - enteredAt - 700) / 3000));
            const e = ease(k);

            // --- entrance ---
            rig.visible = k < 1;
            if (rig.visible) {
                if (live) scratch.copy(slot);
                else scratch.set(cassetteHome.x, cassetteHome.y + (reduceMotion ? 0 : Math.sin(t * 1.4) * .09) + (hovering ? .12 : 0), cassetteHome.z + (hovering ? .4 : 0));
                cassette.position.lerp(scratch, .1);
                const size = live ? .66 : hovering ? 1.62 : 1.5;
                cassette.scale.lerp(scratch.set(size, size, size), .1);
                cassette.rotation.z += ((live ? 0 : -.16) - cassette.rotation.z) * .1;
                cassette.rotation.y += ((live ? 0 : hovering ? -.3 : Math.sin(t * .9) * .18) - cassette.rotation.y) * .08;
                if (live) reels.forEach((reel) => { reel.rotation.z -= .09; });
                dial.emissiveIntensity += ((live ? 2.6 : .5 + Math.sin(t * 2) * .2) - dial.emissiveIntensity) * .08;
                if (!reduceMotion) {
                    rig.rotation.y += (pointer.x * .2 - .16 - rig.rotation.y) * .05;
                    rig.rotation.x += (-pointer.y * .08 + .03 - rig.rotation.x) * .05;
                }
            }

            // --- town ---
            const playhead = now();
            amp += (levelAt(playhead) - amp) * .3;
            const current = Math.max(0, active);
            focusTarget.set(stopsAt[current].x * .62, stopsAt[current].y, stopsAt[current].z * .5 + 17);
            focus.lerp(focusTarget, focusSet ? .025 : 1); // first frame: no camera move
            focusSet = true;
            city.scale.y = .001 + (1 - (1 - Math.min(1, Math.max(0, (k - .35) / .65))) ** 3);

            districts.forEach((district, i) => {
                const on = live && i === current;
                const beat = on ? amp : 0;
                district.group.scale.y += (1 + beat * .4 - district.group.scale.y) * .3;
                district.glow.emissiveIntensity += ((on ? .9 + beat * 5 : .35) - district.glow.emissiveIntensity) * .25;
                const spread = 1 + beat * 2.4;
                district.ring.scale.set(spread, spread, 1);
                district.ring.material.opacity = on ? .95 - beat * .45 : .45;
                district.beam.scale.y += ((on ? 3 + beat * 42 : .001) - district.beam.scale.y) * .25;
            });
            pulse.position.copy(stopsAt[current]);
            pulse.position.y += 7;
            pulse.color.set(CHAPTERS[current].color);
            pulse.intensity = live ? 40 + amp * amp * 700 : 0;

            // --- camera ---
            camera.position.lerpVectors(introPos, scratch.copy(focus).add(worldOffset), e);
            if (k === 1 && !reduceMotion) {
                camera.position.x += pointer.x * 9;
                camera.position.y += pointer.y * 3;
            }
            scratch.copy(focus);
            scratch.y += 5;
            camera.lookAt(look.lerpVectors(introLook, scratch, e));

            // --- HTML labels: the cassette marker, then the stops set on the town ---
            if (!live) {
                cassette.getWorldPosition(scratch).project(camera);
                cue.style.translate = `${(scratch.x * .5 + .5) * width - 60}px ${(-scratch.y * .5 + .5) * height + height * .12}px`;
                if (!cueOn) {
                    cueOn = true;
                    cue.classList.add('is-on');
                }
            } else if (k > .5) {
                stops.forEach((stop, i) => {
                    scratch.copy(stopsAt[i]);
                    scratch.y += 1;
                    scratch.project(camera);
                    stop.style.translate = `${(scratch.x * .5 + .5) * width}px ${(-scratch.y * .5 + .5) * height}px`;
                    stop.style.visibility = scratch.z < 1 ? '' : 'hidden';
                });
            }

            renderer.render(scene, camera);
        };

        return { render };
    }
})();
