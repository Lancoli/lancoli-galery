// Mur libre: connects the paint engine (engine.js), the generated walls (walls.js) and the 3D view (scene.js).
// The paint lives in a single flat canvas; the workshop shows it laid on the wall, the 3D view uses it as a texture.
import { PaintEngine } from './engine.js';
import { makeWall } from './walls.js';

const $ = (s) => document.querySelector(s);
const app = $('#app');
const msg = (key) => (document.querySelector(`[data-msg="${key}"]`) || {}).textContent || key;
const track = (name, detail) => { if (window.lancoliTrack) window.lancoliTrack(name, detail); };

// Resolution: more modest on a phone, for memory and smoothness.
const small = Math.min(screen.width, screen.height) < 820 || (navigator.deviceMemory && navigator.deviceMemory <= 4);
const W = small ? 2048 : 2560, H = W / 2;
const engine = new PaintEngine({ width: W, height: H, undoDepth: small ? 8 : 12 });

// Spray colours: blacks and whites, the wall classics, and a few fluorescents.
const COLORS = [
    '#111111', '#3b3b3b', '#8a8a8a', '#f4f1ea', '#e8302a', '#b3161b', '#ff6a1f', '#ffb000',
    '#ffe23a', '#c8e43c', '#39b54a', '#0f6b46', '#22c1c3', '#1f6fd1', '#1b2a8f', '#6a2fb5',
    '#c13ec6', '#ff4fa3', '#ffb3c7', '#8b4a2b', '#d6a25e', '#ff2bd6', '#39ff14', '#00e5ff',
];

const state = {
    tool: 'spray', color: COLORS[4], size: 40, flow: 0.7, drips: 0.5,
    view: 'atelier', wall: 'brique', picking: false, edited: false,
};

// ───────── the workshop: the paint laid flat on the wall ─────────

const workshopEl = $('#atelier');
const stage = $('#stage');
const ring = $('#ring');
const wallCanvas = document.createElement('canvas');
wallCanvas.width = W;
wallCanvas.height = H;
stage.style.width = W + 'px';
stage.style.height = H + 'px';
stage.append(wallCanvas, engine.canvas);

const view = { scale: 1, x: 0, y: 0, fit: 1 };
function applyView() {
    stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    sizeRing();
}
function fit() {
    const r = workshopEl.getBoundingClientRect();
    const pad = r.width < 600 ? 8 : 28;
    view.fit = view.scale = Math.min((r.width - pad * 2) / W, (r.height - pad * 2) / H);
    view.x = (r.width - W * view.scale) / 2;
    view.y = (r.height - H * view.scale) / 2;
    applyView();
}
function zoomAt(clientX, clientY, factor) {
    const r = workshopEl.getBoundingClientRect();
    const next = Math.min(8, Math.max(view.fit * 0.6, view.scale * factor));
    const px = clientX - r.left, py = clientY - r.top;
    view.x = px - (px - view.x) * (next / view.scale);
    view.y = py - (py - view.y) * (next / view.scale);
    view.scale = next;
    applyView();
}
const toCanvas = (e) => {
    const r = workshopEl.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.scale, y: (e.clientY - r.top - view.y) / view.scale };
};

function sizeRing() {
    const d = Math.max(4, state.size * view.scale);
    ring.style.width = ring.style.height = d + 'px';
    ring.style.marginLeft = ring.style.marginTop = -d / 2 + 'px';
}
function moveRing(e) {
    const r = workshopEl.getBoundingClientRect();
    ring.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px)`;
}

// Pointers: one = paint; two fingers = pan and zoom; right click, middle or Space = pan.
const pointers = new Map();
let painting = null, panning = null, pinch = null, spaceHeld = false;

workshopEl.addEventListener('pointerdown', (e) => {
    workshopEl.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
        if (painting !== null) { stroke('cancel'); painting = null; }
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        return;
    }
    if (e.button === 1 || e.button === 2 || spaceHeld) {
        panning = { id: e.pointerId, x: e.clientX, y: e.clientY };
        workshopEl.classList.add('panning');
        return;
    }
    if (e.button !== 0) return;
    painting = e.pointerId;
    stroke('begin', toCanvas(e), e);
});
workshopEl.addEventListener('pointermove', (e) => {
    moveRing(e);
    ring.classList.add('on');
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        view.x += cx - pinch.cx;
        view.y += cy - pinch.cy;
        zoomAt(cx, cy, d / pinch.d);
        pinch = { d, cx, cy };
        return;
    }
    if (panning && panning.id === e.pointerId) {
        view.x += e.clientX - panning.x;
        view.y += e.clientY - panning.y;
        panning.x = e.clientX;
        panning.y = e.clientY;
        applyView();
        return;
    }
    if (painting === e.pointerId) {
        for (const ev of e.getCoalescedEvents ? e.getCoalescedEvents() : [e]) stroke('move', toCanvas(ev), ev);
    }
});
function release(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (panning && panning.id === e.pointerId) { panning = null; workshopEl.classList.remove('panning'); }
    if (painting === e.pointerId) { painting = null; stroke('end'); }
}
workshopEl.addEventListener('pointerup', release);
workshopEl.addEventListener('pointercancel', release);
workshopEl.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') ring.classList.remove('on'); });
workshopEl.addEventListener('contextmenu', (e) => e.preventDefault());
workshopEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });
new ResizeObserver(() => { if (state.view === 'atelier') fit(); }).observe(workshopEl);

// ───────── a gesture, wherever it comes from (workshop or 3D wall) ─────────

function stroke(kind, p, e) {
    if (kind === 'begin' && (state.picking || (e && e.altKey))) {
        const c = engine.pick(p.x, p.y);
        if (c) setColor(c);
        setPicking(false);
        return;
    }
    const pressure = e && e.pointerType === 'pen' ? Math.max(0.05, e.pressure) : 1;
    if (kind === 'begin') {
        engine.begin(p.x, p.y, pressure);
        state.edited = true;
        refreshHistory();
    } else if (kind === 'move') engine.move(p.x, p.y, pressure);
    else if (kind === 'end') engine.end();
    else if (kind === 'cancel') { engine.cancel(); refreshHistory(); }
}

// ───────── the 3D wall, loaded only when asked for ─────────

let scene = null;
let sceneLoading = null;
let textureStale = true;
function ensureScene() {
    if (scene) return Promise.resolve(scene);
    if (!sceneLoading) {
        sceneLoading = import('./scene.js').then(({ createWallScene }) => {
            scene = createWallScene({ container: $('#wall3d'), paintCanvas: engine.canvas, onStroke: stroke });
            scene.setWall(makeWall(state.wall, W, H));
            return scene;
        }).catch((err) => {
            sceneLoading = null;
            console.error(err);
            throw err;
        });
    }
    return sceneLoading;
}

async function setView(name) {
    if (name === 'mur') {
        try { await ensureScene(); } catch { toast(msg('no3d')); name = 'atelier'; }
    }
    state.view = name;
    app.dataset.view = name;
    $('#atelier').hidden = name !== 'atelier';
    $('#wall3d').hidden = name !== 'mur';
    document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
    if (name === 'mur') { scene.resize(); textureStale = true; } else fit();
}

// ───────── loop ─────────

let last = performance.now();
function frame(now) {
    requestAnimationFrame(frame);
    const dt = (now - last) / 1000;
    last = now;
    engine.tick(dt);
    if (engine.consumeDirty()) textureStale = true;
    if (state.view === 'mur' && scene) {
        scene.render(textureStale);
        textureStale = false;
    }
}

// ───────── tools and settings ─────────

function setTool(tool) {
    state.tool = tool;
    engine.set({ tool });
    app.dataset.tool = tool;
    document.querySelectorAll('.tools button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
}
function setColor(color) {
    state.color = color.toLowerCase();
    engine.set({ color: state.color });
    $('#customColor').value = state.color;
    document.querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-checked', String(s.dataset.color === state.color)));
}
function setPicking(on) {
    state.picking = on;
    $('#picker').setAttribute('aria-pressed', String(on));
    if (on) app.dataset.picking = ''; else delete app.dataset.picking;
}
function setSize(size) {
    state.size = Math.round(Math.min(180, Math.max(4, size)));
    engine.set({ size: state.size });
    $('#size').value = state.size;
    sizeRing();
}

const palette = $('#palette');
for (const color of COLORS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', color);
    b.title = color;
    b.dataset.color = color;
    b.style.setProperty('--c', color);
    b.addEventListener('click', () => setColor(color));
    palette.append(b);
}
$('#customColor').addEventListener('input', (e) => setColor(e.target.value));
$('#picker').addEventListener('click', () => setPicking(!state.picking));
$('#size').addEventListener('input', (e) => setSize(+e.target.value));
$('#flow').addEventListener('input', (e) => engine.set({ flow: e.target.value / 100 }));
$('#drips').addEventListener('input', (e) => engine.set({ drips: e.target.value / 100 }));
// the lettering: the word and its typeface; the typeface loads before the first click
// (every typeface of assets/fonts/catalogue.js; the spray by default)
const FONTS = window.LancoliFonts;
FONTS.fill($('#letterFont'), 'bombe');
function setLetters() {
    const font = FONTS.get($('#letterFont').value) || FONTS.get('bombe');
    Object.assign($('#letterText').style, { fontFamily: font.family, fontWeight: font.weight, fontStyle: font.style, fontStretch: '' });
    engine.set({ text: $('#letterText').value, font });
    FONTS.load(font).catch(() => {});
}
$('#letterText').addEventListener('input', setLetters);
$('#letterFont').addEventListener('change', setLetters);
setLetters();
document.querySelectorAll('.tools button').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

function refreshHistory() {
    $('#undo').disabled = !engine.canUndo;
    $('#redo').disabled = !engine.canRedo;
}
$('#undo').addEventListener('click', () => { engine.undo(); refreshHistory(); });
$('#redo').addEventListener('click', () => { engine.redo(); refreshHistory(); });
$('#clear').addEventListener('click', () => {
    if (!engine.painted || !confirm(msg('confirmClear'))) return;
    engine.clear();
    refreshHistory();
});

// ───────── walls ─────────

function applyWall() {
    const wall = makeWall(state.wall, W, H);
    wallCanvas.getContext('2d').drawImage(wall.preview, 0, 0, W, H);
    if (scene) scene.setWall(wall);
}
$('#wallKind').addEventListener('change', (e) => {
    state.wall = e.target.value;
    $('#loading').hidden = false;
    // let the message show before the calculation, which blocks for a moment
    requestAnimationFrame(() => setTimeout(() => { applyWall(); $('#loading').hidden = true; }, 30));
});

// ───────── export ─────────

const exportBtn = $('#exportBtn');
const exportMenu = $('#exportMenu');
const items = () => [...exportMenu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
function openMenu(open) {
    exportMenu.hidden = !open;
    exportBtn.setAttribute('aria-expanded', String(open));
    if (open) items()[0]?.focus();
}
exportBtn.addEventListener('click', () => openMenu(exportMenu.hidden));
exportMenu.addEventListener('keydown', (e) => {
    const list = items(), i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    else if (e.key === 'Escape') { openMenu(false); exportBtn.focus(); }
});
document.addEventListener('pointerdown', (e) => {
    if (!exportMenu.hidden && !e.target.closest('.export')) openMenu(false);
});
if (!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem)) {
    exportMenu.querySelector('[data-export="copy"]').disabled = true;
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
function flatten(maxWidth) {
    const scale = maxWidth ? Math.min(1, maxWidth / W) : 1;
    const c = document.createElement('canvas');
    c.width = Math.round(W * scale);
    c.height = Math.round(H * scale);
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(wallCanvas, 0, 0, c.width, c.height);
    g.drawImage(engine.canvas, 0, 0, c.width, c.height);
    return c;
}
function download(blob, ext) {
    const d = new Date(), pad = (n) => String(n).padStart(2, '0');
    const name = `lancoli-mur-libre-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function exportAs(kind) {
    openMenu(false);
    if (kind === 'paint-png') download(await toBlob(engine.canvas, 'image/png'), 'png');
    else if (kind === 'wall-png') download(await toBlob(flatten(), 'image/png'), 'png');
    else if (kind === 'wall-jpg') download(await toBlob(flatten(1600), 'image/jpeg', 0.88), 'jpg');
    else if (kind === 'view-png') {
        if (state.view !== 'mur') {
            await setView('mur');
            if (state.view !== 'mur') return;
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        }
        download(await scene.capture(), 'png');
    } else if (kind === 'copy') {
        try {
            const blob = toBlob(flatten(), 'image/png'); // a promise: Safari requires writing within the gesture
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            toast(msg('copied'));
        } catch { toast(msg('copyFail')); }
        track('Mur libre : export', { format: kind });
        return;
    }
    state.edited = false;
    toast(msg('exported'));
    track('Mur libre : export', { format: kind });
}
exportMenu.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => exportAs(b.dataset.export)));

let toastTimer = null;
function toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
}

// ───────── keyboard ─────────

const KEYS = { b: 'spray', m: 'marker', p: 'brush', t: 'splash', l: 'letters', e: 'eraser' };
document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); (e.shiftKey ? engine.redo() : engine.undo()); refreshHistory(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); engine.redo(); refreshHistory(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space') { e.preventDefault(); spaceHeld = true; workshopEl.classList.add('panning'); return; }
    if (KEYS[k]) setTool(KEYS[k]);
    else if (k === '[') setSize(state.size / 1.15);
    else if (k === ']') setSize(state.size * 1.15);
    else if (k === 'f' && state.view === 'atelier') fit();
    else if (k === 'v') setView(state.view === 'atelier' ? 'mur' : 'atelier');
    else if (k === 'i') setPicking(!state.picking);
    else if (k === 'escape') setPicking(false);
});
document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { spaceHeld = false; if (!panning) workshopEl.classList.remove('panning'); }
});

// An unexported painting is not lost without a warning.
addEventListener('beforeunload', (e) => {
    if (!state.edited) return;
    e.preventDefault();
    e.returnValue = '';
});

// ───────── start ─────────

setTool(state.tool);
setColor(state.color);
setSize(state.size);
engine.set({ flow: state.flow, drips: state.drips });
refreshHistory();
requestAnimationFrame(() => setTimeout(() => {
    applyWall();
    $('#loading').hidden = true;
    fit();
    requestAnimationFrame(frame);
}, 30));

// To try the engine from the browser console.
window.murLibre = { engine, setTool, setColor, setSize, setView };
