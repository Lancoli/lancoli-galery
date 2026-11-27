// The book of tales: the project cards of projets.html become the spreads of a three.js book.
// On the left the tale's image, on the right its text. Three layers, to dive into and back out of:
//   0 · the book on the table      1 · a page seen up close      2 · the dolly-in, then the tale
// In the page, the book is leafed through (arrows, drag). A click opens it full screen: no more scrolling,
// the wheel moves in and out of the layers, and the raised elements (the photo, the button) lead to the tale.
// The cards stay the source: to add a tale, add a card in projets.html, the book follows.
// three.js is imported on the fly from the importmap of projets.html.
(() => {
    const section = document.querySelector('.worlds');
    const list = section && section.querySelector('.projects');
    if (!list || !window.WebGLRenderingContext) return;
    const cards = [...list.querySelectorAll('.project-card')];
    if (cards.length < 2) return;

    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const narrow = matchMedia('(max-width: 760px)');
    const text = (node) => (node ? node.textContent.replace(/\s+/g, ' ').trim() : '');
    const two = (n) => String(n).padStart(2, '0');

    // ---------- What each card tells ----------
    const tales = cards.map((card) => {
        const soon = card.classList.contains('project-card--soon');
        const slates = card.querySelectorAll(':scope > .slate');
        const cover = card.querySelector('.project-cover img');
        return {
            card,
            soon,
            href: card.getAttribute('href'),
            label: soon ? text(slates[0]) : text(card.querySelector('.project-body > .slate')),
            title: soon ? text(slates[1]) : text(card.querySelector('h3')),
            pitch: text(card.querySelector('.project-body p')),
            meta: [...card.querySelectorAll('.project-meta div')].map((row) => [text(row.querySelector('dt')), text(row.querySelector('dd'))]),
            more: text(card.querySelector('.project-more span')),
            status: text(card.querySelector('.project-status')),
            cover: cover ? cover.getAttribute('src') : '',
            strip: [...card.querySelectorAll('.project-strip img')].map((img) => img.getAttribute('src')),
            world: getComputedStyle(card).getPropertyValue('--world').trim() || '#e8a25a'
        };
    });

    // ---------- The lectern: the stage, the bar, and a way out of full screen ----------
    const book = document.createElement('div');
    book.className = 'book';
    book.innerHTML = '<div class="book-stage"><canvas class="book-canvas" tabindex="0" role="img"></canvas></div>'
        + '<button type="button" class="book-close slate" aria-label="Refermer le livre">Refermer ✕</button>'
        + '<div class="book-bar slate">'
        + '<button type="button" class="book-prev" aria-label="Page précédente">←</button>'
        + '<span class="book-count"></span>'
        + '<button type="button" class="book-enter"></button>'
        + '<button type="button" class="book-next" aria-label="Page suivante">→</button>'
        + '</div>'
        + '<p class="book-hint slate"></p>';
    const canvas = book.querySelector('canvas');
    const stage = book.querySelector('.book-stage');
    const prev = book.querySelector('.book-prev');
    const next = book.querySelector('.book-next');
    const count = book.querySelector('.book-count');
    const enter = book.querySelector('.book-enter');
    const close = book.querySelector('.book-close');
    const hint = book.querySelector('.book-hint');
    // the veil closing at the end of the dolly shot: dark, like the tale pages
    const veil = document.createElement('div');
    veil.className = 'book-veil';

    // book / cards toggle, placed in the room header
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'book-toggle slate';
    const head = section.querySelector('.head');
    const setView = (view) => {
        section.dataset.view = view;
        toggle.textContent = view === 'book' ? 'Voir en cartes' : 'Voir en livre';
    };
    toggle.addEventListener('click', () => setView(section.dataset.view === 'book' ? 'cards' : 'book'));

    // ---------- State: where we are in the book, and how deep ----------
    let current = 0;        // open spread
    let level = 0;          // 0: the book · 1: a page up close
    let side = 1;           // page looked at up close: -1 left, 1 right
    let immersive = false;  // full screen, scrolling locked
    let travelling = false; // dolly-in to the tale in progress

    const paint = () => {
        const tale = tales[current];
        count.textContent = `${two(current + 1)} / ${two(tales.length)}`;
        prev.disabled = current === 0;
        next.disabled = current === tales.length - 1;
        canvas.setAttribute('aria-label', `Livre des contes, page ${current + 1} sur ${tales.length} : ${tale.title}`);
        enter.style.setProperty('--world', tale.world);
        if (!immersive) enter.textContent = 'Ouvrir le livre ↗';
        else enter.textContent = tale.soon ? `${tale.title}` : `Entrer dans ${tale.title} →`;
        enter.disabled = immersive && tale.soon;
        hint.textContent = !immersive ? 'Glisser pour tourner · Cliquer pour ouvrir le livre'
            : level === 0 ? 'Molette ou clic : s’approcher · Glisser : tourner · Échap : refermer'
                : 'Cliquer la photo ou le bouton : entrer dans le conte · Molette arrière : reculer';
    };
    const turn = (step) => {
        const target = Math.min(tales.length - 1, Math.max(0, current + step));
        if (target === current || travelling) return;
        current = target;
        paint();
        if (window.lancoliTrack) window.lancoliTrack('Page tournee', { conte: tales[current].title });
    };
    const setLevel = (value, toSide) => {
        level = value;
        if (toSide) side = toSide;
        paint();
    };
    // Full screen: the book leaves the page (otherwise an animated parent would reframe it) and scrolling stops
    const setImmersive = (value) => {
        if (immersive === value) return;
        immersive = value;
        level = 0;
        book.classList.toggle('is-immersive', value);
        document.documentElement.classList.toggle('is-booked', value);
        if (value) document.body.append(book);
        else list.before(book);
        paint();
        if (value) canvas.focus({ preventScroll: true });
        if (value && window.lancoliTrack) window.lancoliTrack('Livre ouvert');
    };
    // go back one layer: page → book → exit
    const back = () => {
        if (travelling) return;
        if (level === 1) setLevel(0);
        else setImmersive(false);
    };

    // ---------- The pages, drawn on canvas then applied as textures ----------
    const PAGE_W = 820;
    const PAGE_H = 1066;
    const SHARP = 1.5; // texture resolution: enough to read a page up close
    const INK = '#171717';
    const MUTED = '#6f6a63';
    const MONO = 'ui-monospace, Consolas, "Courier New", monospace';
    let safeImages = true; // false over file://: a local image "taints" the canvas, WebGL refuses it

    const load = (src) => new Promise((resolve) => {
        if (!src) return resolve(null);
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
    });
    const board = (width, height, scale = SHARP) => {
        const page = document.createElement('canvas');
        page.width = Math.round(width * scale);
        page.height = Math.round(height * scale);
        const ctx = page.getContext('2d');
        ctx.scale(scale, scale);
        return { page, ctx };
    };
    const spaced = (ctx, value) => { if ('letterSpacing' in ctx) ctx.letterSpacing = value; };
    const wrap = (ctx, words, width) => {
        const lines = [];
        let line = '';
        words.split(' ').forEach((word) => {
            const attempt = line ? `${line} ${word}` : word;
            if (line && ctx.measureText(attempt).width > width) {
                lines.push(line);
                line = word;
            } else line = attempt;
        });
        if (line) lines.push(line);
        return lines;
    };
    // zoom > 1 tightens the framing (1.35 removes the black bars of composite images, as on the cards)
    const coverFit = (ctx, image, x, y, w, h, zoom = 1) => {
        const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight) * zoom;
        const sw = w / scale;
        const sh = h / scale;
        ctx.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
    };
    // shared background: crumpled paper blended into the white, and the binding shadow on the spine side
    const sheet = (paper, spineOnLeft) => {
        const { page, ctx } = board(PAGE_W, PAGE_H);
        ctx.fillStyle = '#fffdf9';
        ctx.fillRect(0, 0, PAGE_W, PAGE_H);
        if (paper && safeImages) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = .6; // strength of the paper creases
            coverFit(ctx, paper, 0, 0, PAGE_W, PAGE_H);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        }
        const gutter = ctx.createLinearGradient(spineOnLeft ? 0 : PAGE_W, 0, spineOnLeft ? 90 : PAGE_W - 90, 0);
        gutter.addColorStop(0, 'rgba(23, 23, 23, .28)');
        gutter.addColorStop(1, 'rgba(23, 23, 23, 0)');
        ctx.fillStyle = gutter;
        ctx.fillRect(0, 0, PAGE_W, PAGE_H);
        return { page, ctx };
    };
    const slate = (ctx, value, x, y, color, align = 'left') => {
        ctx.font = `19px ${MONO}`;
        spaced(ctx, '2px');
        ctx.fillStyle = color;
        ctx.textAlign = align;
        ctx.fillText(value.toUpperCase(), x, y);
        ctx.textAlign = 'left';
        spaced(ctx, '0px');
    };

    // The two raised elements of a spread, in page pixels: the photo (left), the button (right)
    const PHOTO = { x: 64, y: 84, w: PAGE_W - 64 - 84 };
    const KNOB = { x: 84, y: PAGE_H - 84 - 78, w: PAGE_W - 84 - 64, h: 78 };
    const photoHeight = (tale) => PAGE_H - PHOTO.y - (safeImages && tale.strip.length ? 250 : 150);

    // the tale's photo: printed flat on the page, and repeated on the raised plate
    const drawPhoto = (ctx, tale, index, cover, x, y, w, h) => {
        if (cover && safeImages) return coverFit(ctx, cover, x, y, w, h, 1.35);
        // no usable image: a flat fill in the world's colour and the tale number
        const wash = ctx.createLinearGradient(x, y, x + w, y + h);
        wash.addColorStop(0, tale.world);
        wash.addColorStop(1, INK);
        ctx.fillStyle = tale.soon ? '#e9e5dc' : wash;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = tale.soon ? MUTED : '#fbfaf7';
        ctx.font = `900 ${w * .38}px Arial, sans-serif`;
        spaced(ctx, `${-w * .03}px`);
        ctx.fillText(two(index + 1), x + w * .05, y + h - w * .07);
        spaced(ctx, '0px');
    };
    const drawKnob = (ctx, tale, x, y, w, h) => {
        ctx.fillStyle = INK;
        ctx.fillRect(x, y, w, h);
        slate(ctx, tale.more, x + 26, y + h - 31, '#fbfaf7');
        slate(ctx, '→', x + w - 26, y + h - 31, '#fbfaf7', 'right');
    };

    // right page: the tale's text and its entry button
    const textPage = (tale, index, paper) => {
        const { page, ctx } = sheet(paper, true);
        const left = KNOB.x;
        const width = KNOB.w;
        let y = 128;
        slate(ctx, tale.label, left, y, MUTED);
        slate(ctx, two(index + 1), left + width, y, tale.world, 'right');

        ctx.fillStyle = INK;
        ctx.font = '900 104px Arial, sans-serif';
        spaced(ctx, '-9px');
        y += 40;
        wrap(ctx, tale.title, width).forEach((line) => {
            y += 92;
            ctx.fillText(line, left - 4, y);
        });
        spaced(ctx, '0px');

        if (tale.pitch) {
            ctx.font = '27px Arial, sans-serif';
            ctx.fillStyle = '#444';
            y += 30;
            wrap(ctx, tale.pitch, width).forEach((line) => {
                y += 40;
                ctx.fillText(line, left, y);
            });
        }

        y += 50;
        ctx.strokeStyle = 'rgba(23, 23, 23, .16)';
        ctx.lineWidth = 2;
        const rule = () => {
            ctx.beginPath();
            ctx.moveTo(left, y);
            ctx.lineTo(left + width, y);
            ctx.stroke();
        };
        tale.meta.forEach(([name, value]) => {
            rule();
            slate(ctx, name, left, y + 36, MUTED);
            slate(ctx, value, left + width, y + 36, INK, 'right');
            y += 58;
        });
        if (tale.meta.length) rule();
        if (tale.more) drawKnob(ctx, tale, KNOB.x, KNOB.y, KNOB.w, KNOB.h);
        return page;
    };

    // left page: the tale's image glued on the sheet, then its contact sheet
    const imagePage = (tale, index, paper, cover, strip) => {
        const { page, ctx } = sheet(paper, false);
        const { x, y, w } = PHOTO;
        const h = photoHeight(tale);
        drawPhoto(ctx, tale, index, cover, x, y, w, h);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        let below = y + h + 16;
        if (safeImages && strip.some(Boolean)) {
            const gap = 10;
            const tw = (w - gap * (strip.length - 1)) / strip.length;
            strip.forEach((thumb, k) => { if (thumb) coverFit(ctx, thumb, x + k * (tw + gap), below, tw, 96); });
            below += 96 + 16;
        }
        slate(ctx, tale.label, x, below + 30, MUTED);
        if (tale.status) {
            ctx.fillStyle = '#e5412d';
            ctx.beginPath();
            ctx.arc(x + 6, below + 62, 5, 0, Math.PI * 2);
            ctx.fill();
            slate(ctx, tale.status, x + 22, below + 69, INK);
        }
        return page;
    };

    // ---------- The stage ----------
    const start = async () => {
        const paper = await load('assets/textures/paper-white.jpg');
        if (paper) {
            // probe: if reading a pixel fails, local images are refused (page opened over file://)
            const probe = document.createElement('canvas').getContext('2d');
            probe.drawImage(paper, 0, 0, 1, 1);
            try { probe.getImageData(0, 0, 1, 1); } catch { safeImages = false; }
        }
        const covers = await Promise.all(tales.map((tale) => load(tale.cover)));
        const strips = await Promise.all(tales.map((tale) => Promise.all(tale.strip.map(load))));
        const THREE = await import('three');

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(30, 16 / 9, .05, 50);

        // a desk lamp at the top left: it casts the shadow of the turning page
        scene.add(new THREE.AmbientLight(0xffffff, 2));
        const lamp = new THREE.DirectionalLight(0xfff4e6, 1.25);
        lamp.position.set(-1.6, 2.2, 4);
        lamp.castShadow = true;
        lamp.shadow.mapSize.set(2048, 2048);
        Object.assign(lamp.shadow.camera, { left: -2.2, right: 2.2, top: 1.8, bottom: -1.8, near: .5, far: 12 });
        lamp.shadow.bias = -.0004;
        lamp.shadow.normalBias = .012;
        lamp.shadow.radius = 5;
        scene.add(lamp);

        const W = 1;        // page width
        const H = 1.3;      // height
        const SEG = 28;     // slices of a sheet: the more there are, the smoother the curve
        const EPS = .004;   // thickness of a sheet in the stack
        const TOP = (tales.length + 1) * EPS; // just above the top sheet
        const tome = new THREE.Group();
        scene.add(tome);

        const anisotropy = renderer.capabilities.getMaxAnisotropy();
        const texture = (page, mirrored) => {
            const map = new THREE.CanvasTexture(page);
            map.colorSpace = THREE.SRGBColorSpace;
            map.anisotropy = anisotropy;
            if (mirrored) {
                // the back reads reversed on the sheet: flip the texture
                map.wrapS = THREE.RepeatWrapping;
                map.repeat.x = -1;
                map.offset.x = 1;
            }
            return map;
        };
        const paperLike = (options) => new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, ...options });
        const solid = (mesh, cast = true) => {
            mesh.castShadow = cast;
            mesh.receiveShadow = true;
            return mesh;
        };
        const texts = tales.map((tale, i) => textPage(tale, i, paper));
        const images = tales.map((tale, i) => imagePage(tale, i, paper, covers[i], strips[i]));

        // the book body: the hardcover, wider than the pages, and the two blocks of sheets
        const cover = solid(new THREE.Mesh(new THREE.BoxGeometry(W * 2 + .09, H + .09, .03), paperLike({ color: 0x1c1a18, roughness: .8 })));
        cover.position.z = -.033;
        tome.add(cover);
        [-1, 1].forEach((sign) => {
            const block = solid(new THREE.Mesh(new THREE.BoxGeometry(W - .004, H - .004, .016), paperLike({ color: 0xe9e3d6 })));
            block.position.set(sign * W / 2, 0, -.009);
            tome.add(block);
        });
        // the table: invisible, it only keeps the shadow
        const table = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), new THREE.ShadowMaterial({ opacity: .2 }));
        table.position.z = -.05;
        table.receiveShadow = true;
        tome.add(table);

        // the two fixed pages: the first image on the left, the last text on the right
        const flat = (page, x) => {
            const mesh = solid(new THREE.Mesh(new THREE.PlaneGeometry(W, H), paperLike({ map: texture(page) })), false);
            mesh.position.x = x;
            tome.add(mesh);
        };
        flat(images[0], -W / 2);
        flat(texts[tales.length - 1], W / 2);

        // the turning sheets: the tale's text on the front, the next one's image on the back
        const leaves = [];
        for (let j = 0; j < tales.length - 1; j++) {
            const geometry = new THREE.BufferGeometry();
            const uv = [];
            const index = [];
            for (let row = 0; row < 2; row++) for (let s = 0; s <= SEG; s++) uv.push(s / SEG, row);
            for (let s = 0; s < SEG; s++) index.push(s, s + 1, s + SEG + 2, s, s + SEG + 2, s + SEG + 1);
            geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 6), 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
            geometry.setIndex(index);
            const group = new THREE.Group();
            group.add(solid(new THREE.Mesh(geometry, paperLike({ map: texture(texts[j]), side: THREE.FrontSide, shadowSide: THREE.DoubleSide }))));
            group.add(solid(new THREE.Mesh(geometry, paperLike({ map: texture(images[j + 1], true), side: THREE.BackSide })), false));
            tome.add(group);
            leaves.push({ geometry, group, p: -1, zRight: (tales.length - j) * EPS, zLeft: (j + 1) * EPS });
        }

        // p = 0: flat on the right · p = 1: flat on the left. In between the sheet arches:
        // the free edge leads, the binding side lags.
        const bend = (leaf, p) => {
            leaf.p = p;
            const position = leaf.geometry.attributes.position;
            const theta = p * Math.PI;
            const curl = Math.sin(p * Math.PI) * 1.15;
            let x = 0;
            let z = 0;
            for (let s = 0; s <= SEG; s++) {
                if (s > 0) {
                    const angle = Math.min(Math.PI, Math.max(0, theta + curl * ((s - .5) / SEG - .5)));
                    x += (W / SEG) * Math.cos(angle);
                    z += (W / SEG) * Math.sin(angle);
                }
                position.setXYZ(s, x, -H / 2, z);
                position.setXYZ(s + SEG + 1, x, H / 2, z);
            }
            position.needsUpdate = true;
            leaf.geometry.computeVertexNormals();
            leaf.geometry.computeBoundingSphere();
            leaf.group.position.z = leaf.zRight + (leaf.zLeft - leaf.zRight) * p;
        };
        leaves.forEach((leaf) => bend(leaf, 0));

        // ---------- The raised elements of the open spread: the photo and the button ----------
        // They lift off the sheet once the page has landed, rise further under the pointer, and lead to the tale.
        const toWorld = (rect, onLeft) => ({
            x: (onLeft ? -W : 0) + ((rect.x + rect.w / 2) / PAGE_W) * W,
            y: H / 2 - ((rect.y + rect.h / 2) / PAGE_H) * H,
            w: (rect.w / PAGE_W) * W,
            h: (rect.h / PAGE_H) * H
        });
        const photos = tales.map((tale, i) => {
            const h = photoHeight(tale);
            const { page, ctx } = board(PHOTO.w, h, 2);
            drawPhoto(ctx, tale, i, covers[i], 0, 0, PHOTO.w, h);
            return { map: texture(page), place: toWorld({ ...PHOTO, h }, true) };
        });
        const knobs = tales.map((tale) => {
            const { page, ctx } = board(KNOB.w, KNOB.h, 2);
            drawKnob(ctx, tale, 0, 0, KNOB.w, KNOB.h);
            return { map: texture(page), place: toWorld(KNOB, false) };
        });
        const edge = paperLike({ color: 0x171717 });
        const plateFace = paperLike({ roughness: .55 });
        const knobFace = paperLike({ roughness: .7 });
        const plate = solid(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [edge, edge, edge, edge, plateFace, edge]));
        const knob = solid(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [edge, edge, edge, edge, knobFace, edge]));
        plate.visible = knob.visible = false;
        tome.add(plate, knob);
        let dressed = -1; // the spread the photo and the button are dressed for
        let pop = 0;      // 0: flat in the sheet · 1: out
        const lift = { plate: 0, knob: 0 };
        let hovered = null;
        const dress = (index) => {
            dressed = index;
            plateFace.map = photos[index].map;
            knobFace.map = knobs[index].map;
            plateFace.needsUpdate = knobFace.needsUpdate = true;
        };

        // ---------- Framing: three camera distances, one per layer ----------
        const TILT = -.36; // the book lies on the table, seen from slightly above
        let half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const fit = (height, width) => Math.max(height / (2 * half), width / (2 * half * camera.aspect));
        const frame = () => {
            const width = stage.clientWidth;
            const height = stage.clientHeight;
            if (!width || !height) return;
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        };
        const view = { x: 0, y: 0, z: 4, tilt: TILT };
        const goal = () => {
            if (travelling) {
                // dive into the photo until it overflows the screen
                const place = photos[current].place;
                return { x: place.x, y: place.y, z: fit(place.h * .42, place.w * .42), tilt: 0 };
            }
            if (level === 1) return { x: side * W / 2, y: 0, z: fit(H * 1.06, W * 1.08), tilt: -.05 };
            return { x: 0, y: 0, z: fit(H * 1.22, W * 2.7), tilt: immersive ? TILT * .8 : TILT };
        };

        // ---------- The dolly-in: the camera enters the photo, the veil closes, the page changes ----------
        const dive = () => {
            const tale = tales[current];
            if (travelling || tale.soon || !tale.href) return;
            if (window.lancoliTrack) window.lancoliTrack('Entree conte', { conte: tale.title });
            if (reduceMotion) { location.href = tale.href; return; }
            travelling = true;
            book.classList.add('is-diving');
            document.body.append(veil);
            setTimeout(() => veil.classList.add('is-on'), 520);
            setTimeout(() => { location.href = tale.href; }, 1150);
        };
        // browser back: the book is found as it was left, veil lifted
        window.addEventListener('pageshow', (event) => {
            if (!event.persisted) return;
            travelling = false;
            book.classList.remove('is-diving');
            veil.classList.remove('is-on');
            veil.remove();
        });

        // ---------- Pointer ----------
        const pointer = { x: 0, y: 0, downX: null };
        const ray = new THREE.Raycaster();
        const cursorOn = (event) => {
            const rect = canvas.getBoundingClientRect();
            ray.setFromCamera(new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1), camera);
        };
        const spread = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, H), new THREE.MeshBasicMaterial({ visible: false }));
        tome.add(spread);
        // what is under the pointer: 'plate', 'knob', -1 (left page), 1 (right page) or 0 (nothing)
        const pick = (event) => {
            cursorOn(event);
            if (plate.visible) {
                const [relief] = ray.intersectObjects([plate, knob]);
                if (relief) return relief.object === plate ? 'plate' : 'knob';
            }
            const [page] = ray.intersectObject(spread);
            return page ? (page.uv.x < .5 ? -1 : 1) : 0;
        };
        canvas.addEventListener('pointerdown', (event) => { pointer.downX = event.clientX; });
        canvas.addEventListener('pointermove', (event) => {
            const rect = canvas.getBoundingClientRect();
            pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
            const under = pick(event);
            hovered = immersive && typeof under === 'string' ? under : null;
            canvas.classList.toggle('is-over', !immersive ? under !== 0 : Boolean(hovered) || (level === 0 && under !== 0));
        });
        canvas.addEventListener('pointerleave', () => {
            pointer.x = pointer.y = 0;
            pointer.downX = null;
            hovered = null;
            canvas.classList.remove('is-over');
        });
        canvas.addEventListener('pointerup', (event) => {
            if (pointer.downX === null || travelling) return;
            const moved = event.clientX - pointer.downX;
            pointer.downX = null;
            if (Math.abs(moved) > 40) return turn(moved < 0 ? 1 : -1); // drag to the left: next page
            const under = pick(event);
            if (!immersive) { if (under !== 0) setImmersive(true); return; }
            if (typeof under === 'string') dive();           // a raised element: enter the tale
            else if (under === 0) back();                    // next to the book: go back one layer
            else setLevel(1, under);                         // a page: move closer to it
        });
        // Wheel, in full screen only: forward dives in, backward moves out.
        // In the page, the wheel scrolls normally: nobody is held back.
        let wheeled = 0;
        canvas.addEventListener('wheel', (event) => {
            if (!immersive) return;
            event.preventDefault();
            const now = performance.now();
            if (travelling || now - wheeled < 420 || Math.abs(event.deltaY) < 4) return;
            wheeled = now;
            if (event.deltaY < 0) {
                const under = pick(event);
                if (level === 0) setLevel(1, typeof under === 'number' && under !== 0 ? under : side);
            } else back();
        }, { passive: false });

        prev.addEventListener('click', () => turn(-1));
        next.addEventListener('click', () => turn(1));
        close.addEventListener('click', () => setImmersive(false));
        enter.addEventListener('click', () => (immersive ? dive() : setImmersive(true)));
        book.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowLeft') turn(-1);
            else if (event.key === 'ArrowRight') turn(1);
            else if (event.key === 'Escape' && immersive) back();
            else if (event.key === 'Enter' && event.target === canvas) (immersive ? dive() : setImmersive(true));
            else return;
            event.preventDefault();
        });

        // ---------- Loop: only runs while the book is on screen ----------
        let visible = false;
        let last = performance.now();
        const loop = (now) => {
            if (!visible) return;
            const dt = Math.min(.05, (now - last) / 1000);
            last = now;
            const glide = (rate) => (reduceMotion ? 1 : 1 - Math.exp(-dt * rate));

            let settled = true;
            leaves.forEach((leaf, j) => {
                const target = j < current ? 1 : 0;
                if (leaf.p === target) return;
                const p = leaf.p + (target - leaf.p) * glide(5.5);
                bend(leaf, Math.abs(target - p) < .002 ? target : p);
                if (leaf.p !== target) settled = false;
            });

            // photo and button: tucked in while turning, re-dressed once the page lands, then out again
            const tale = tales[current];
            if (dressed !== current) {
                pop += (0 - pop) * glide(14);
                if (pop < .03 && settled) dress(current);
            } else pop += ((tale.soon ? 0 : 1) - pop) * glide(6);
            plate.visible = pop > .02 && dressed >= 0;
            knob.visible = plate.visible && Boolean(tales[Math.max(0, dressed)].more);
            if (plate.visible) {
                lift.plate += ((hovered === 'plate' || travelling ? 1 : 0) - lift.plate) * glide(8);
                lift.knob += ((hovered === 'knob' ? 1 : 0) - lift.knob) * glide(8);
                const photo = photos[dressed].place;
                const thick = .012 * pop + .001;
                plate.scale.set(photo.w, photo.h, thick);
                plate.position.set(photo.x, photo.y, TOP + thick / 2 + pop * .012 + lift.plate * .035);
                const button = knobs[dressed].place;
                const deep = .02 * pop + .001;
                knob.scale.set(button.w, button.h, deep);
                knob.position.set(button.x, button.y, TOP + deep / 2 + pop * .004 + lift.knob * .02);
            }

            // the camera glides to the requested layer; the book tilts a little towards the pointer
            const to = goal();
            const rate = travelling ? 2.6 : 3.4;
            view.x += (to.x - view.x) * glide(rate);
            view.y += (to.y - view.y) * glide(rate);
            view.z += (to.z - view.z) * glide(rate);
            view.tilt += (to.tilt - view.tilt) * glide(rate);
            camera.position.set(view.x, view.y, view.z);
            const sway = level === 0 && !travelling ? 1 : .15;
            tome.rotation.x = view.tilt + pointer.y * .05 * sway;
            tome.rotation.y += (pointer.x * .1 * sway - tome.rotation.y) * glide(4);
            renderer.render(scene, camera);
            requestAnimationFrame(loop);
        };

        // ---------- Setup ----------
        list.before(book);
        if (head) head.append(toggle);
        new ResizeObserver(frame).observe(stage);
        new IntersectionObserver(([entry]) => {
            const was = visible;
            visible = entry.isIntersecting;
            if (visible && !was) {
                last = performance.now();
                requestAnimationFrame(loop);
            }
        }).observe(stage);
        paint();
        setView(narrow.matches ? 'cards' : 'book');
        frame();
        Object.assign(view, goal());

        // frozen pose from the address, for tuning: projets.html#livre:2 opens the third spread,
        // #livre:2:app opens it full screen, #livre:2:page up close
        const asked = /^#livre:(\d+)(?::(app|page))?$/.exec(location.hash);
        if (asked) {
            current = Math.min(tales.length - 1, Number(asked[1]));
            leaves.forEach((leaf, j) => bend(leaf, j < current ? 1 : 0));
            if (asked[2]) setImmersive(true);
            if (asked[2] === 'page') setLevel(1, -1);
            paint();
        }
    };

    // without three.js (offline, WebGL refused): the cards stay in place, nothing breaks
    start().catch((error) => {
        console.warn('Livre des contes indisponible, affichage en cartes.', error);
        book.remove();
        toggle.remove();
        delete section.dataset.view;
    });
})();
