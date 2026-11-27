// Mur libre's walls, fully generated: brick, concrete, render.
// Each wall gives three images with the same proportion as the paint (2 × 1):
//   albedo  : the wall colour
//   normal  : its relief, so the 3D light catches the joints and grains
//   preview : the colour slightly lit by that relief, for the flat view and flat export

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[(Math.random() * list.length) | 0];

function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
}

// Soft noise: a small random image enlarged with smoothing. Several layers make clouds.
function clouds(ctx, w, h, cells, alpha, light, dark) {
    const sw = Math.max(2, cells), sh = Math.max(2, Math.round(cells * h / w));
    const small = makeCanvas(sw, sh);
    const sc = small.getContext('2d');
    const img = sc.createImageData(sw, sh);
    for (let i = 0; i < sw * sh; i++) {
        const v = Math.random();
        const [r, g, b] = v > 0.5 ? light : dark;
        img.data.set([r, g, b, Math.abs(v - 0.5) * 2 * 255], i * 4);
    }
    sc.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = alpha;
    ctx.drawImage(small, 0, 0, w, h);
    ctx.restore();
}

// Fine grain, pixel by pixel.
function grain(ctx, w, h, amount) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * amount;
        d[i] += n;
        d[i + 1] += n;
        d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
}

// Water streaks and grime at the foot of the wall: what makes a wall believable.
function weather(ctx, w, h, strength) {
    ctx.save();
    for (let k = 0; k < 26; k++) {
        const x = rand(0, w), sw = rand(w * 0.004, w * 0.03), len = rand(h * 0.15, h * 0.7);
        const g = ctx.createLinearGradient(0, 0, 0, len);
        g.addColorStop(0, `rgba(40,34,28,${0.18 * strength})`);
        g.addColorStop(1, 'rgba(40,34,28,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, 0, sw, len);
    }
    const foot = ctx.createLinearGradient(0, h, 0, h * 0.78);
    foot.addColorStop(0, `rgba(30,26,20,${0.42 * strength})`);
    foot.addColorStop(1, 'rgba(30,26,20,0)');
    ctx.fillStyle = foot;
    ctx.fillRect(0, h * 0.78, w, h * 0.22);
    ctx.restore();
}

function brick(w, h) {
    const albedo = makeCanvas(w, h), height = makeCanvas(w / 2, h / 2);
    const a = albedo.getContext('2d'), z = height.getContext('2d');
    const rows = 53;                     // 4 m high, 7.5 cm courses
    const rowH = h / rows, brickW = rowH * 3, mortar = rowH * 0.14;
    a.fillStyle = '#9a9184';
    a.fillRect(0, 0, w, h);
    clouds(a, w, h, 90, 0.35, [180, 172, 160], [110, 102, 92]);
    z.fillStyle = '#4a4a4a';
    z.fillRect(0, 0, w / 2, h / 2);
    const reds = ['#8e3b2a', '#9c4430', '#7e3324', '#a5523a', '#86402f', '#6f2f22', '#9a4a36', '#b0603f'];
    for (let j = 0; j < rows; j++) {
        const offset = (j % 2) * brickW / 2;
        for (let x = -offset; x < w; x += brickW) {
            const bx = x + mortar / 2, by = j * rowH + mortar / 2, bw = brickW - mortar, bh = rowH - mortar;
            a.fillStyle = pick(reds);
            a.globalAlpha = 1;
            a.fillRect(bx, by, bw, bh);
            // each brick has its own firing: a lighter or darker veil
            a.globalAlpha = rand(0, 0.25);
            a.fillStyle = Math.random() < 0.5 ? '#2a120c' : '#e8b190';
            a.fillRect(bx, by, bw, bh);
            a.globalAlpha = 1;
            const shade = (190 + rand(-25, 25)) | 0;
            z.fillStyle = `rgb(${shade},${shade},${shade})`;
            z.fillRect(bx / 2 + 0.5, by / 2 + 0.5, bw / 2 - 1, bh / 2 - 1);
            // chipped corners
            if (Math.random() < 0.18) {
                const cx = Math.random() < 0.5 ? bx : bx + bw, cy = Math.random() < 0.5 ? by : by + bh, s = rowH * rand(0.2, 0.5);
                a.fillStyle = '#8f877a';
                z.fillStyle = '#5a5a5a';
                for (const [ctx, k] of [[a, 1], [z, 0.5]]) {
                    ctx.beginPath();
                    ctx.moveTo(cx * k, cy * k);
                    ctx.lineTo((cx + (cx === bx ? s : -s)) * k, cy * k);
                    ctx.lineTo(cx * k, (cy + (cy === by ? s : -s)) * k);
                    ctx.fill();
                }
            }
        }
    }
    clouds(a, w, h, 40, 0.22, [210, 170, 140], [40, 25, 20]);
    weather(a, w, h, 0.8);
    grain(a, w, h, 26);
    clouds(z, w / 2, h / 2, 300, 0.25, [255, 255, 255], [0, 0, 0]);
    grain(z, w / 2, h / 2, 40);
    return { albedo, height, strength: 4, edge: 0x7e3a2a };
}

function concrete(w, h) {
    const albedo = makeCanvas(w, h), height = makeCanvas(w / 2, h / 2);
    const a = albedo.getContext('2d'), z = height.getContext('2d');
    a.fillStyle = '#8d8a84';
    a.fillRect(0, 0, w, h);
    clouds(a, w, h, 24, 0.5, [175, 172, 165], [90, 88, 84]);
    clouds(a, w, h, 120, 0.3, [185, 182, 176], [100, 98, 94]);
    z.fillStyle = '#808080';
    z.fillRect(0, 0, w / 2, h / 2);
    clouds(z, w / 2, h / 2, 200, 0.35, [255, 255, 255], [0, 0, 0]);
    // formwork: joints between the shuttering panels, and tie-rod holes
    const cols = 4, rowsN = 3, pw = w / cols, ph = h / rowsN;
    a.strokeStyle = 'rgba(50,48,44,.55)';
    a.lineWidth = Math.max(2, w / 900);
    z.strokeStyle = '#3a3a3a';
    z.lineWidth = Math.max(1.5, w / 1400);
    for (let i = 1; i < cols; i++) {
        for (const [ctx, k] of [[a, 1], [z, 0.5]]) { ctx.beginPath(); ctx.moveTo(i * pw * k, 0); ctx.lineTo(i * pw * k, h * k); ctx.stroke(); }
    }
    for (let j = 1; j < rowsN; j++) {
        for (const [ctx, k] of [[a, 1], [z, 0.5]]) { ctx.beginPath(); ctx.moveTo(0, j * ph * k); ctx.lineTo(w * k, j * ph * k); ctx.stroke(); }
    }
    const hole = w / 260;
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rowsN; j++) {
            for (const [fx, fy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
                const x = (i + fx) * pw, y = (j + fy) * ph;
                a.fillStyle = 'rgba(40,38,35,.75)';
                a.beginPath(); a.arc(x, y, hole, 0, Math.PI * 2); a.fill();
                z.fillStyle = '#202020';
                z.beginPath(); z.arc(x / 2, y / 2, hole / 2, 0, Math.PI * 2); z.fill();
            }
        }
    }
    // air bubbles in the concrete
    for (let k = 0; k < 2200; k++) {
        const x = rand(0, w), y = rand(0, h), r = rand(0.6, 2.4) * w / 2560;
        a.fillStyle = 'rgba(55,52,48,.55)';
        a.beginPath(); a.arc(x, y, r, 0, Math.PI * 2); a.fill();
        z.fillStyle = '#404040';
        z.beginPath(); z.arc(x / 2, y / 2, r / 2 + 0.3, 0, Math.PI * 2); z.fill();
    }
    weather(a, w, h, 1);
    grain(a, w, h, 18);
    return { albedo, height, strength: 2.2, edge: 0x8a877f };
}

function plaster(w, h) {
    const albedo = makeCanvas(w, h), height = makeCanvas(w / 2, h / 2);
    const a = albedo.getContext('2d'), z = height.getContext('2d');
    a.fillStyle = '#d8d0c1';
    a.fillRect(0, 0, w, h);
    clouds(a, w, h, 30, 0.35, [236, 230, 218], [170, 160, 145]);
    z.fillStyle = '#808080';
    z.fillRect(0, 0, w / 2, h / 2);
    // the sprayed render: thousands of small lumps
    for (let k = 0; k < 60000; k++) {
        const x = rand(0, w / 2), y = rand(0, h / 2), r = rand(0.4, 1.8) * w / 2560;
        const v = (rand(90, 230)) | 0;
        z.fillStyle = `rgb(${v},${v},${v})`;
        z.beginPath(); z.arc(x, y, r, 0, Math.PI * 2); z.fill();
    }
    // a few cracks
    for (let k = 0; k < 5; k++) {
        let x = rand(0, w), y = rand(0, h * 0.6);
        a.strokeStyle = 'rgba(70,62,52,.6)';
        a.lineWidth = Math.max(1, w / 2000);
        z.strokeStyle = '#303030';
        z.lineWidth = 1;
        a.beginPath(); a.moveTo(x, y);
        z.beginPath(); z.moveTo(x / 2, y / 2);
        for (let s = 0; s < 40; s++) {
            x += rand(-1, 1) * w / 300;
            y += rand(0.2, 1) * h / 120;
            a.lineTo(x, y);
            z.lineTo(x / 2, y / 2);
        }
        a.stroke();
        z.stroke();
    }
    weather(a, w, h, 0.9);
    grain(a, w, h, 14);
    return { albedo, height, strength: 3, edge: 0xcfc6b6 };
}

// Relief → normals (Sobel filter), then a baked lighting for the flat preview.
function finish({ albedo, height, strength, edge }) {
    const w = height.width, h = height.height;
    const src = height.getContext('2d').getImageData(0, 0, w, h).data;
    const normal = makeCanvas(w, h), shading = makeCanvas(w, h);
    const nImg = normal.getContext('2d').createImageData(w, h);
    const sImg = shading.getContext('2d').createImageData(w, h);
    const hgt = (x, y) => src[((Math.min(h - 1, Math.max(0, y)) * w) + Math.min(w - 1, Math.max(0, x))) * 4] / 255;
    const L = [-0.5, 0.62, 0.6]; // grazing light from the top left
    const lLen = Math.hypot(...L);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const dx = (hgt(x + 1, y - 1) + 2 * hgt(x + 1, y) + hgt(x + 1, y + 1)) - (hgt(x - 1, y - 1) + 2 * hgt(x - 1, y) + hgt(x - 1, y + 1));
            const dy = (hgt(x - 1, y + 1) + 2 * hgt(x, y + 1) + hgt(x + 1, y + 1)) - (hgt(x - 1, y - 1) + 2 * hgt(x, y - 1) + hgt(x + 1, y - 1));
            let nx = -dx * strength, ny = dy * strength, nz = 1;
            const len = Math.hypot(nx, ny, nz);
            nx /= len; ny /= len; nz /= len;
            const i = (y * w + x) * 4;
            nImg.data[i] = (nx * 0.5 + 0.5) * 255;
            nImg.data[i + 1] = (ny * 0.5 + 0.5) * 255;
            nImg.data[i + 2] = (nz * 0.5 + 0.5) * 255;
            nImg.data[i + 3] = 255;
            const lit = (nx * L[0] + ny * L[1] + nz * L[2]) / lLen;
            const s = Math.max(0, Math.min(255, (0.55 + 0.5 * lit) * 255));
            sImg.data[i] = sImg.data[i + 1] = sImg.data[i + 2] = s;
            sImg.data[i + 3] = 255;
        }
    }
    normal.getContext('2d').putImageData(nImg, 0, 0);
    shading.getContext('2d').putImageData(sImg, 0, 0);
    const preview = makeCanvas(albedo.width, albedo.height);
    const p = preview.getContext('2d');
    p.drawImage(albedo, 0, 0);
    p.globalCompositeOperation = 'multiply';
    p.imageSmoothingQuality = 'high';
    p.drawImage(shading, 0, 0, preview.width, preview.height);
    p.globalCompositeOperation = 'source-over';
    return { albedo, normal, preview, edge };
}

export const WALLS = { brique: brick, beton: concrete, crepi: plaster };

const cache = new Map();
export function makeWall(kind, width, height) {
    const key = `${kind}:${width}`;
    if (!cache.has(key)) cache.set(key, finish((WALLS[kind] || brick)(width, height)));
    return cache.get(key);
}
