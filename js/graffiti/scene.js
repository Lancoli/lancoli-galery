// La projection : la peinture à plat devient la texture d'un mur dans une rue, au soleil couchant.
// Le mur et la peinture sont deux couches distinctes qui partagent le même relief :
// la peinture suit les joints des briques, sans que le moteur de peinture le sache.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const WALL = { w: 8, h: 4 }; // mètres, même proportion que la peinture

function gradientTexture(stops) {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    for (const [at, color] of stops) grad.addColorStop(at, color);
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

function asphalt() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#3b3936';
    g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 9000; k++) {
        const v = 40 + Math.random() * 60;
        g.fillStyle = `rgba(${v},${v},${v * 0.96},${Math.random() * 0.8})`;
        g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(18, 12);
    return t;
}

// onStroke(kind, point, event) : kind = 'begin' | 'move' | 'end' | 'cancel', point en pixels de la peinture.
export function createWallScene({ container, paintCanvas, onStroke }) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const dom = renderer.domElement;
    dom.setAttribute('aria-hidden', 'true');
    container.appendChild(dom);

    const scene = new THREE.Scene();
    scene.background = gradientTexture([[0, '#28304f'], [0.55, '#8d7fa4'], [0.8, '#e7a98a'], [1, '#f3c79b']]);
    scene.fog = new THREE.Fog(0xd9ab92, 22, 70);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
    camera.position.set(0.8, 1.8, 7.4);
    const controls = new OrbitControls(camera, dom);
    controls.target.set(0, WALL.h / 2, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1;
    controls.maxDistance = 16;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.62;
    controls.minAzimuthAngle = -1.25;
    controls.maxAzimuthAngle = 1.25;
    // Clic gauche et un doigt : on peint. Clic droit et deux doigts : on tourne autour du mur.
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
    controls.update();

    scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x5a4636, 0.9));
    const sun = new THREE.DirectionalLight(0xffd2a1, 2.6);
    sun.position.set(-7, 6, 5); // lumière rasante : elle révèle le relief sous la peinture
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x9fb6ff, 0.35);
    fill.position.set(6, 3, 6);
    scene.add(fill);

    const anisotropy = renderer.capabilities.getMaxAnisotropy();
    const texture = (canvas, color) => {
        const t = new THREE.CanvasTexture(canvas);
        if (color) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = anisotropy;
        return t;
    };

    const plane = new THREE.PlaneGeometry(WALL.w, WALL.h);
    const wallMat = new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0 });
    const wallMesh = new THREE.Mesh(plane, wallMat);
    wallMesh.position.set(0, WALL.h / 2, 0);

    const paintTex = texture(paintCanvas, true);
    const paintMat = new THREE.MeshStandardMaterial({
        map: paintTex, transparent: true, depthWrite: false, roughness: 0.5, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    });
    const paintMesh = new THREE.Mesh(plane, paintMat);
    paintMesh.position.set(0, WALL.h / 2, 0.002);
    scene.add(wallMesh, paintMesh);

    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.95 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(WALL.w, WALL.h, 0.35), edgeMat);
    body.position.set(0, WALL.h / 2, -0.176);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(WALL.w + 0.16, 0.1, 0.5), edgeMat);
    cap.position.set(0, WALL.h + 0.05, -0.15);
    scene.add(body, cap);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 46),
        new THREE.MeshStandardMaterial({ map: asphalt(), roughness: 0.97 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = 12;
    const curb = new THREE.Mesh(new THREE.BoxGeometry(70, 0.12, 1.6),
        new THREE.MeshStandardMaterial({ color: 0x9b968c, roughness: 0.9 }));
    curb.position.set(0, 0.06, 0.8);
    scene.add(ground, curb);

    function setWall(wall) {
        const old = [wallMat.map, wallMat.normalMap];
        wallMat.map = texture(wall.albedo, true);
        wallMat.normalMap = texture(wall.normal, false);
        paintMat.normalMap = wallMat.normalMap; // même relief pour la peinture
        paintMat.normalScale.set(0.7, 0.7);
        edgeMat.color.set(wall.edge);
        wallMat.needsUpdate = paintMat.needsUpdate = true;
        old.forEach((t) => t && t.dispose());
    }

    // ── peindre directement sur le mur 3D ──
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = (e) => {
        const r = dom.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const h = ray.intersectObject(wallMesh)[0];
        return h && h.uv ? { x: h.uv.x * paintCanvas.width, y: (1 - h.uv.y) * paintCanvas.height } : null;
    };
    const pointers = new Set();
    let painting = null;
    dom.addEventListener('pointerdown', (e) => {
        pointers.add(e.pointerId);
        if (pointers.size > 1 && painting !== null) { onStroke('cancel'); painting = null; return; }
        if (e.button !== 0 || pointers.size > 1) return;
        const p = hit(e);
        if (!p) return;
        painting = e.pointerId;
        onStroke('begin', p, e);
    });
    dom.addEventListener('pointermove', (e) => {
        if (painting !== e.pointerId) return;
        for (const ev of e.getCoalescedEvents ? e.getCoalescedEvents() : [e]) {
            const p = hit(ev);
            if (p) onStroke('move', p, ev);
        }
    });
    const up = (e) => {
        pointers.delete(e.pointerId);
        if (painting === e.pointerId) { painting = null; onStroke('end'); }
    };
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    function resize() {
        const w = container.clientWidth, h = container.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        dom.style.width = w + 'px';
        dom.style.height = h + 'px';
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(container);
    resize();

    function render(paintChanged) {
        if (paintChanged) paintTex.needsUpdate = true;
        controls.update();
        renderer.render(scene, camera);
    }

    function capture() {
        render(true);
        return new Promise((resolve) => dom.toBlob(resolve, 'image/png'));
    }

    return { setWall, render, resize, capture };
}
