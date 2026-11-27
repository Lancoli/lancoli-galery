// Mur libre's flat paint engine: spray, marker, brush, splats, eraser, and the drips.
// It knows neither the wall nor three.js: it paints pixels into a transparent canvas, which
// the app then lays wherever it wants (flat view, texture on a 3D wall, export).
//
//   const engine = new PaintEngine({ width: 2560, height: 1280 });
//   engine.set({ tool: 'spray', color: '#e8302a', size: 40, flow: .7, drips: .5 });
//   engine.begin(x, y, pressure); engine.move(x, y, pressure); engine.end();
//   engine.set({ tool: 'letters', text: 'LANCOLI', font: { family, weight, style, stretch, spacing } }): a click lays
//   the word in spray (font: a typeface of assets/fonts/catalogue.js, or any object of that shape).
//   and on each frame: engine.tick(dt), because the spray keeps spitting while pressed
//   and the drips keep running down once the gesture is over.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function gauss() {
    let u = 0;
    while (!u) u = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * Math.random());
}
function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}

const LETTERS_FONT = { family: '"Rubik Spray Paint", sans-serif', weight: 400, style: 'normal', stretch: 'normal', spacing: -.02 };

export const TOOLS = ['spray', 'marker', 'brush', 'splash', 'letters', 'eraser'];

// Amount of paint. A quick spray pass (20 px radius, 4000 px/s) already covers clearly:
// the opacity laid per second is SPRAY_K / r², like a can whose flow does not depend on the gesture.
const SPRAY_K = 26000;
const DOTS_PER_SEC = 3600; // mist droplets, for a 20 px radius
const DRY_TIME = 1.8;      // seconds: fresh paint dries and can no longer drip
const MARKER_LEAK = 40;    // a marker held still leaks (thickness per second)

export class PaintEngine {
    constructor({ width = 2560, height = 1280, cell = 8, undoDepth = 12 } = {}) {
        this.width = width;
        this.height = height;
        this.unit = width / 2560; // fixed details (droplets, drips) follow the resolution
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext('2d');

        // Fresh paint, on a coarse grid: it decides where things drip.
        this.cell = cell;
        this.gw = Math.ceil(width / cell);
        this.gh = Math.ceil(height / cell);
        this.wet = new Float32Array(this.gw * this.gh);
        this.wetColor = new Array(this.gw * this.gh);
        this.wetAny = false;
        this.drips = [];

        this.stroke = null;
        this.undoStack = [];
        this.redoStack = [];
        this.undoDepth = undoDepth;
        this.dirty = true;
        this.painted = false;
        this.stamps = new Map();
        this.opts = { tool: 'spray', color: '#e8302a', size: 40, flow: 0.7, drips: 0.5, text: 'LANCOLI', font: LETTERS_FONT };
    }

    set(opts) { Object.assign(this.opts, opts); }

    // Fresh paint thickness beyond which a drip forms.
    get threshold() { return 30 - 25 * this.opts.drips; }

    // ───────── gestures ─────────

    begin(x, y, pressure = 1) {
        this.pushUndo();
        this.painted = true;
        const o = this.opts;
        const s = this.stroke = { x, y, tx: x, ty: y, lastX: x, lastY: y, pressure, load: 1, bristles: null };
        if (o.tool === 'marker') this.markerLine(x, y, x, y);
        else if (o.tool === 'brush') {
            s.bristles = Array.from({ length: clamp(Math.round(o.size * 0.7), 8, 48) },
                () => ({ off: rand(-1, 1), load: rand(0.65, 1), w: rand(0.6, 1.5) }));
        } else if (o.tool === 'splash') this.splash(x, y, o.size * (0.6 + 0.6 * pressure));
        else if (o.tool === 'letters') this.letters(x, y);
        this.dirty = true;
    }

    move(x, y, pressure = 1) {
        const s = this.stroke;
        if (!s) return;
        s.pressure = pressure;
        const tool = this.opts.tool;
        if (tool === 'marker') { this.markerLine(s.x, s.y, x, y); s.x = x; s.y = y; }
        else if (tool === 'brush') { this.brushLine(s.x, s.y, x, y); s.x = x; s.y = y; }
        else if (tool === 'splash') { this.flick(s.x, s.y, x, y); s.x = x; s.y = y; }
        // spray and eraser: the nozzle catches up with the pointer on the next tick
        s.tx = x;
        s.ty = y;
    }

    end() { this.stroke = null; }

    // Interrupted gesture (a second finger to zoom): erase what it had started.
    cancel() {
        if (!this.stroke) return;
        this.stroke = null;
        const before = this.undoStack.pop();
        if (before) this.restore(before);
    }

    tick(dt) {
        dt = Math.min(dt, 0.05);
        const s = this.stroke;
        const o = this.opts;
        if (s) {
            if (o.tool === 'spray' || o.tool === 'eraser') this.spray(dt);
            else if (o.tool === 'marker') {
                if (s.tx === s.lastX && s.ty === s.lastY) {
                    const r = o.size * (0.5 + 0.5 * s.pressure) / 2;
                    this.addWet(s.x, s.y, r * 0.8, dt * MARKER_LEAK * o.flow, o.color);
                }
                s.lastX = s.tx;
                s.lastY = s.ty;
            }
        }
        if (this.wetAny) this.dry(dt);
        if (this.drips.length) this.runDrips(dt);
    }

    // ───────── tools ─────────

    spray(dt) {
        const s = this.stroke, o = this.opts, ctx = this.ctx;
        const erase = o.tool === 'eraser';
        const r = Math.max(1.5, o.size * (0.55 + 0.45 * s.pressure) / 2);
        const flow = o.flow * (0.4 + 0.6 * s.pressure);
        const x0 = s.x, y0 = s.y, x1 = s.tx, y1 = s.ty;
        s.x = x1;
        s.y = y1;
        const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (r * 0.3)));
        const share = dt / steps;
        // a fat cap spits more paint than a thin one: the flow grows with the radius
        const rate = SPRAY_K / (r * r) * Math.pow(r / 20, 0.8) * flow * (erase ? 2 : 1);
        const alpha = clamp(rate * share, 0, 0.5);
        const wetAdd = rate * share * Math.pow(r / 20, 0.4);
        const stamp = this.softStamp(erase ? '#000000' : o.color);
        const d = r * 2.6;
        const dots = erase ? 0 : DOTS_PER_SEC * flow * (r / 20) * share;
        const dotSize = Math.max(1, r / 30) * this.unit;

        ctx.save();
        if (erase) ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = o.color;
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
            // the core of the jet: a soft deposit
            ctx.globalAlpha = alpha;
            ctx.drawImage(stamp, cx - d / 2, cy - d / 2, d, d);
            // the mist: droplets, dense at the centre, sparse at the edge
            let n = Math.floor(dots);
            if (Math.random() < dots - n) n++;
            for (let k = 0; k < n; k++) {
                const dist = Math.abs(gauss()) * r * 0.55, a = Math.random() * TAU;
                const px = cx + Math.cos(a) * dist, py = cy + Math.sin(a) * dist;
                const pr = rand(0.35, 1.1) * dotSize;
                ctx.globalAlpha = rand(0.15, 0.6);
                if (pr < 0.9) ctx.fillRect(px, py, pr * 1.6, pr * 1.6);
                else { ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill(); }
            }
            if (erase) this.dryAt(cx, cy, r);
            else this.addWet(cx, cy, r, wetAdd, o.color);
        }
        // now and then the nozzle spits a big drop
        if (!erase && Math.random() < dt * 1.5 * flow) {
            const a = Math.random() * TAU, dist = Math.abs(gauss()) * r * 0.4;
            ctx.globalAlpha = 0.85;
            ctx.beginPath();
            ctx.arc(x1 + Math.cos(a) * dist, y1 + Math.sin(a) * dist, rand(1.5, 3.5) * dotSize, 0, TAU);
            ctx.fill();
        }
        ctx.restore();
        this.dirty = true;
    }

    markerLine(x0, y0, x1, y1) {
        const o = this.opts, s = this.stroke, ctx = this.ctx;
        const r = Math.max(1, o.size * (0.5 + 0.5 * s.pressure) / 2);
        const step = Math.max(0.6, r * 0.12);
        const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
        const variants = this.markerStamps(o.color);
        const d = r * 2;
        ctx.save();
        ctx.globalAlpha = 0.9;
        for (let i = 1; i <= n; i++) {
            const t = i / n;
            const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
            ctx.drawImage(variants[(Math.random() * variants.length) | 0], cx - r, cy - r, d, d);
        }
        ctx.restore();
        this.addWet(x1, y1, r * 0.8, 0.9 * o.flow * (step / r) * n, o.color);
        this.dirty = true;
    }

    brushLine(x0, y0, x1, y1) {
        const o = this.opts, s = this.stroke, ctx = this.ctx;
        const dist = Math.hypot(x1 - x0, y1 - y0);
        if (dist < 0.5) return;
        const r = Math.max(2, o.size * (0.5 + 0.5 * s.pressure) / 2);
        const nx = -(y1 - y0) / dist, ny = (x1 - x0) / dist;
        // the brush runs dry: the lower the flow, the sooner it turns into a dry brush
        s.load = Math.max(0, s.load - dist / (2600 * this.unit) * (1.3 - o.flow));
        const width = (2 * r / s.bristles.length) * 1.4;
        ctx.save();
        ctx.strokeStyle = o.color;
        ctx.lineCap = 'butt';
        for (const b of s.bristles) {
            const load = b.load * s.load;
            if (load < 0.08 || Math.random() > load + 0.15) continue; // the bristles give out one by one
            const ox = nx * b.off * r, oy = ny * b.off * r;
            ctx.globalAlpha = clamp(load * 0.9, 0, 0.9);
            ctx.lineWidth = b.w * width;
            ctx.beginPath();
            ctx.moveTo(x0 + ox, y0 + oy);
            ctx.lineTo(x1 + ox, y1 + oy);
            ctx.stroke();
        }
        ctx.restore();
        this.addWet(x1, y1, r, 0.8 * o.flow * s.load * dist / r, o.color);
        this.dirty = true;
    }

    splash(x, y, R) {
        const o = this.opts, ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = o.color;
        ctx.strokeStyle = o.color;
        ctx.globalAlpha = 0.96;

        // the puddle: an irregular, smoothed outline
        const pts = 36, base = R * rand(0.55, 0.75);
        let radii = Array.from({ length: pts }, () => base * rand(0.72, 1.25));
        for (let pass = 0; pass < 2; pass++) {
            radii = radii.map((v, i) => (radii[(i + pts - 1) % pts] + v * 2 + radii[(i + 1) % pts]) / 4);
        }
        const at = (i) => {
            const a = (i % pts) / pts * TAU;
            return [x + Math.cos(a) * radii[i % pts], y + Math.sin(a) * radii[i % pts]];
        };
        ctx.beginPath();
        let [px, py] = at(0), [qx, qy] = at(1);
        ctx.moveTo((px + qx) / 2, (py + qy) / 2);
        for (let i = 1; i <= pts; i++) {
            [px, py] = at(i);
            [qx, qy] = at(i + 1);
            ctx.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2);
        }
        ctx.fill();

        // the splashes: finer and more stretched away from the centre
        const n = Math.round(rand(14, 26) * Math.sqrt(R / 40));
        for (let k = 0; k < n; k++) {
            const a = Math.random() * TAU;
            const far = rand(1.05, 2.8);
            const dist = base * far;
            const dr = Math.max(0.8 * this.unit, R * rand(0.025, 0.13) * (1.7 - far / 2.8));
            const dx = Math.cos(a), dy = Math.sin(a);
            if (Math.random() < 0.3) {
                ctx.lineWidth = dr * 0.6;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(x + dx * base * 0.9, y + dy * base * 0.9);
                ctx.lineTo(x + dx * dist, y + dy * dist);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.ellipse(x + dx * dist, y + dy * dist, dr * rand(1, 1 + far * 0.6), dr, a, 0, TAU);
            ctx.fill();
        }
        ctx.restore();
        // a puddle drips
        this.addWet(x, y, base, this.threshold * 1.15, o.color);
        this.dirty = true;
    }

    // Dragging with the splat tool: drops are thrown in the direction of the gesture.
    flick(x0, y0, x1, y1) {
        const o = this.opts, ctx = this.ctx;
        const dist = Math.hypot(x1 - x0, y1 - y0);
        if (dist < 3) return;
        const dx = (x1 - x0) / dist, dy = (y1 - y0) / dist;
        let n = dist * 0.08 * (0.5 + o.flow);
        n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
        ctx.save();
        ctx.fillStyle = o.color;
        ctx.globalAlpha = 0.95;
        const angle = Math.atan2(dy, dx);
        for (let k = 0; k < n; k++) {
            const t = Math.random(), ahead = rand(0, dist * 1.5), side = gauss() * o.size * 0.25;
            const px = x0 + (x1 - x0) * t + dx * ahead - dy * side;
            const py = y0 + (y1 - y0) * t + dy * ahead + dx * side;
            const dr = Math.max(0.8 * this.unit, o.size * rand(0.02, 0.09));
            ctx.beginPath();
            ctx.ellipse(px, py, dr * rand(1.5, 3.5), dr, angle, 0, TAU);
            ctx.fill();
        }
        ctx.restore();
        this.dirty = true;
    }

    // Lettering: the word, centred on the click, laid in spray. A blurred mist around the letters, droplets
    // spilling over, and fresh paint over the whole surface: with enough flow, the letters drip.
    letters(x, y) {
        const o = this.opts, text = (o.text || '').trim();
        if (!text) return;
        const px = Math.max(12, o.size * 2.4);
        const f = { ...LETTERS_FONT, ...o.font };
        const font = `${f.style === 'italic' ? 'italic ' : ''}${f.weight} ${px}px ${f.family}`;
        const m = document.createElement('canvas');
        let g = m.getContext('2d');
        // the font, its width and its tracking; to set again when the canvas changes size
        const setup = () => {
            g.font = font;
            if ('fontStretch' in g) g.fontStretch = f.stretch;
            if ('letterSpacing' in g) g.letterSpacing = `${(px * f.spacing).toFixed(1)}px`;
        };
        setup();
        const pad = Math.ceil(px * 0.3);
        m.width = Math.ceil(g.measureText(text).width) + pad * 2;
        m.height = Math.ceil(px * 1.25) + pad * 2;
        g = m.getContext('2d', { willReadFrequently: true });
        setup();
        g.textBaseline = 'middle';
        g.fillStyle = o.color;
        g.fillText(text, pad, m.height / 2);
        const ox = Math.round(x - m.width / 2), oy = Math.round(y - m.height / 2);
        const alpha = g.getImageData(0, 0, m.width, m.height).data;
        const at = (i, j) => alpha[(j * m.width + i) * 4 + 3];

        const ctx = this.ctx;
        ctx.save();
        if ('filter' in ctx) {
            ctx.filter = `blur(${(px * 0.05).toFixed(1)}px)`;
            ctx.globalAlpha = 0.3 * o.flow;
            ctx.drawImage(m, ox, oy);
            ctx.filter = 'none';
        }
        ctx.globalAlpha = 0.6 + 0.35 * o.flow;
        ctx.drawImage(m, ox, oy);
        // the droplets start from the letters and spill a little
        ctx.fillStyle = o.color;
        const dots = Math.round(m.width * m.height / 700 * o.flow);
        const dotSize = Math.max(1, px / 120) * this.unit;
        for (let k = 0, tries = 0; k < dots && tries < dots * 6; tries++) {
            const i = (Math.random() * m.width) | 0, j = (Math.random() * m.height) | 0;
            if (at(i, j) < 128) continue;
            k++;
            const a = Math.random() * TAU, dist = Math.abs(gauss()) * px * 0.06;
            ctx.globalAlpha = rand(0.2, 0.7);
            ctx.beginPath();
            ctx.arc(ox + i + Math.cos(a) * dist, oy + j + Math.sin(a) * dist, rand(0.4, 1.2) * dotSize, 0, TAU);
            ctx.fill();
        }
        ctx.restore();

        // fresh paint, cell by cell, by the share covered by the letters
        const c = this.cell, T = this.threshold, amount = T * (0.5 + 0.8 * o.flow);
        const i0 = Math.max(0, Math.floor(ox / c)), i1 = Math.min(this.gw - 1, Math.floor((ox + m.width) / c));
        const j0 = Math.max(0, Math.floor(oy / c)), j1 = Math.min(this.gh - 1, Math.floor((oy + m.height) / c));
        for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
                let cover = 0;
                for (const [fx, fy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
                    const mx = Math.floor((i + fx) * c - ox), my = Math.floor((j + fy) * c - oy);
                    if (mx >= 0 && my >= 0 && mx < m.width && my < m.height) cover += at(mx, my) / 255 / 4;
                }
                if (cover < 0.1) continue;
                const idx = j * this.gw + i;
                this.wet[idx] += amount * cover;
                this.wetColor[idx] = o.color;
            }
        }
        this.wetAny = true;
        this.dirty = true;
    }

    // ───────── fresh paint and drips ─────────

    addWet(x, y, r, amount, color) {
        const c = this.cell, gw = this.gw, gh = this.gh;
        const rc = Math.max(1, r / c), gx = x / c, gy = y / c;
        const i0 = Math.max(0, Math.floor(gx - rc)), i1 = Math.min(gw - 1, Math.ceil(gx + rc));
        const j0 = Math.max(0, Math.floor(gy - rc)), j1 = Math.min(gh - 1, Math.ceil(gy + rc));
        const k = rc * rc * 0.35;
        for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
                const dx = i + 0.5 - gx, dy = j + 0.5 - gy;
                // the cell under the nozzle gets everything, even for a very thin line
                const w = i === Math.floor(gx) && j === Math.floor(gy) ? 1 : Math.exp(-(dx * dx + dy * dy) / k);
                if (w < 0.05) continue;
                const idx = j * gw + i;
                this.wet[idx] += amount * w;
                this.wetColor[idx] = color;
            }
        }
        this.wetAny = true;
    }

    dryAt(x, y, r) {
        const c = this.cell, gw = this.gw;
        const i0 = Math.max(0, Math.floor((x - r) / c)), i1 = Math.min(gw - 1, Math.floor((x + r) / c));
        const j0 = Math.max(0, Math.floor((y - r) / c)), j1 = Math.min(this.gh - 1, Math.floor((y + r) / c));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.wet[j * gw + i] = 0;
    }

    dry(dt) {
        const wet = this.wet, decay = Math.exp(-dt / DRY_TIME), T = this.threshold;
        const canDrip = this.opts.drips > 0.01;
        let any = false;
        for (let idx = 0; idx < wet.length; idx++) {
            let v = wet[idx];
            if (v === 0) continue;
            v *= decay;
            if (v < 0.02) { wet[idx] = 0; continue; }
            // too much paint in one spot: it runs down (not every cell at once, for an uneven curtain)
            if (canDrip && v > T && this.drips.length < 160 && Math.random() < 0.35) {
                const i = idx % this.gw, j = (idx / this.gw) | 0;
                this.drips.push({
                    x: (i + Math.random()) * this.cell, y: (j + 0.8) * this.cell,
                    vol: v - T * 0.6, color: this.wetColor[idx], age: 0, seed: rand(0, 100),
                });
                v = T * 0.6;
            }
            wet[idx] = v;
            any = true;
        }
        this.wetAny = any;
    }

    runDrips(dt) {
        const ctx = this.ctx, u = this.unit, wet = this.wet;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.93;
        for (let k = this.drips.length - 1; k >= 0; k--) {
            const d = this.drips[k];
            d.age += dt;
            const w = clamp(1.2 + Math.sqrt(d.vol) * 0.75, 1.2, 7) * u;
            const speed = (30 + 150 * Math.min(1, d.vol / 14)) * u; // a big drip runs, a small one lingers
            const nx = d.x + Math.sin(d.age * 2.3 + d.seed) * 0.12 * u;
            const ny = d.y + speed * dt;
            ctx.strokeStyle = d.color;
            ctx.lineWidth = w;
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(nx, ny);
            ctx.stroke();
            // it leaves paint behind, and feeds on the fresh paint it crosses
            d.vol -= ((ny - d.y) / u) * (w / u) * 0.023;
            const ci = Math.floor(nx / this.cell), cj = Math.floor(ny / this.cell);
            if (ci >= 0 && ci < this.gw && cj >= 0 && cj < this.gh) {
                const idx = cj * this.gw + ci;
                if (wet[idx] > 0.4) { const take = wet[idx] * 0.5; wet[idx] -= take; d.vol += take * 0.8; }
            }
            d.x = nx;
            d.y = ny;
            if (d.vol < 0.25 || ny >= this.height) {
                // the drop that stops forms a bead at the end
                ctx.fillStyle = d.color;
                ctx.beginPath();
                ctx.arc(nx, Math.min(ny, this.height), w * 0.75, 0, TAU);
                ctx.fill();
                this.drips.splice(k, 1);
            }
        }
        ctx.restore();
        this.dirty = true;
    }

    // ───────── stamps ─────────

    softStamp(color) {
        const key = 'soft' + color;
        let c = this.stamps.get(key);
        if (c) return c;
        c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, rgba(color, 1));
        grad.addColorStop(0.25, rgba(color, 0.62));
        grad.addColorStop(0.55, rgba(color, 0.2));
        grad.addColorStop(0.8, rgba(color, 0.05));
        grad.addColorStop(1, rgba(color, 0));
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        this.stamps.set(key, c);
        return c;
    }

    // Four disc variants with an irregular edge: the marker line is never quite clean.
    markerStamps(color) {
        const key = 'marker' + color;
        let list = this.stamps.get(key);
        if (list) return list;
        list = [];
        for (let v = 0; v < 4; v++) {
            const c = document.createElement('canvas');
            c.width = c.height = 128;
            const g = c.getContext('2d');
            g.fillStyle = color;
            g.beginPath();
            for (let i = 0; i <= 64; i++) {
                const a = i / 64 * TAU, rr = 60 * rand(0.94, 1.0);
                if (i) g.lineTo(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr);
                else g.moveTo(64 + rr, 64);
            }
            g.fill();
            list.push(c);
        }
        this.stamps.set(key, list);
        return list;
    }

    // ───────── history and reading ─────────

    snapshot() {
        const c = document.createElement('canvas');
        c.width = this.width;
        c.height = this.height;
        c.getContext('2d').drawImage(this.canvas, 0, 0);
        return c;
    }
    pushUndo() {
        this.undoStack.push(this.snapshot());
        if (this.undoStack.length > this.undoDepth) this.undoStack.shift();
        this.redoStack.length = 0;
    }
    restore(c) {
        this.stroke = null;
        this.drips.length = 0;
        this.wet.fill(0);
        this.wetAny = false;
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.drawImage(c, 0, 0);
        this.dirty = true;
    }
    undo() {
        if (!this.undoStack.length) return false;
        this.redoStack.push(this.snapshot());
        this.restore(this.undoStack.pop());
        return true;
    }
    redo() {
        if (!this.redoStack.length) return false;
        this.undoStack.push(this.snapshot());
        this.restore(this.redoStack.pop());
        return true;
    }
    clear() {
        this.pushUndo();
        const empty = document.createElement('canvas');
        empty.width = this.width;
        empty.height = this.height;
        this.restore(empty);
    }
    get canUndo() { return this.undoStack.length > 0; }
    get canRedo() { return this.redoStack.length > 0; }

    // The colour under the pointer, or null when there is no paint.
    pick(x, y) {
        const [r, g, b, a] = this.ctx.getImageData(clamp(Math.round(x), 0, this.width - 1), clamp(Math.round(y), 0, this.height - 1), 1, 1).data;
        if (a < 12) return null;
        return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
    }

    consumeDirty() {
        const d = this.dirty;
        this.dirty = false;
        return d;
    }
}
