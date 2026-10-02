// All the 3D lives here. Every <Scene3D> on the page is picked up by initScenes().
//
// How it works, in plain words:
//  - Each scene waits until it scrolls into view, then creates a Three.js "renderer" in its <canvas>.
//  - Objects are drawn with a "dither" shader: instead of smooth shading you get
//    a halftone/stipple pattern, like the reference site.
//  - If public/models/<name>.glb exists it is used; otherwise a simple placeholder shape is built.
//  - Drag to spin, the object leans toward the cursor, and it floats gently.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import gsap from 'gsap';

type Kind = 'engine' | 'airfoil' | 'console' | 'pass';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => matchMedia('(pointer: coarse)').matches || innerWidth < 700;

// Cursor position, -1..1 across the window (objects lean toward it)
const pointer = { x: 0, y: 0 };
addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = (e.clientY / innerHeight) * 2 - 1;
});

/* ---------- Dither shader ---------- */
const VERT = /* glsl */ `
  varying vec3 vN;
  void main() {
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

// Brightness is compared against a 4x4 Bayer pattern: bright areas keep most dots, dark areas few.
const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uCell;
  uniform float uBright; // 1 = normal, lower = darker (fewer dots)
  varying vec3 vN;
  float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    float l = clamp(dot(n, normalize(vec3(-0.5, 0.8, 0.5))) * 0.6 + 0.42, 0.0, 1.0);
    l = pow(l, 1.5) * uBright;
    if (l < bayer4(gl_FragCoord.xy / uCell)) discard;
    gl_FragColor = vec4(uColor, 1.0);
  }`;

const materials = new Set<THREE.ShaderMaterial>();
const readColor = () => getComputedStyle(document.documentElement).getPropertyValue('--dots').trim() || '#e6e9ee';

function ditherMaterial(cell: number, bright = 1) {
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uColor: { value: new THREE.Color(readColor()) }, uCell: { value: cell }, uBright: { value: bright } },
    side: THREE.DoubleSide,
  });
  materials.add(m);
  return m;
}

// Re-colour the 3D objects when the night/day toggle changes
new MutationObserver(() => {
  const c = new THREE.Color(readColor());
  materials.forEach((m) => m.uniforms.uColor.value.copy(c));
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

/* ---------- Placeholder shapes ---------- */
interface Built {
  group: THREE.Group;
  /** called every frame. `speed` is 1 normally, higher while hovered */
  update?: (t: number, dt: number, hover: boolean) => void;
  dispose?: () => void;
  /** where the camera sits */
  cameraZ: number;
  /** resting rotation */
  base: { x: number; y: number };
}

// Turbofan engine pod, like the Rolls-Royce Trent on an A380 / 747: rounded intake lip, spinning fan
// with spinner cone, tapered nacelle and core exhaust with plug cone.
// Smoke streams out of the exhaust as if it is flying through the air.
function buildEngine(mat: THREE.Material, cell: number): Built {
  const group = new THREE.Group();
  const inner = new THREE.Group(); // scaled down and shifted so engine + trail sit centred
  inner.scale.setScalar(0.85);
  inner.position.z = 2.5;
  group.add(inner);

  // Lathe = spin a 2D outline (radius, position along the engine) around the engine axis.
  // rotateX turns that axis to point along z (front of the engine is +z).
  const lathe = (pts: [number, number][], seg = 56) =>
    new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), seg).rotateX(Math.PI / 2), mat);

  // Fan cowl: from the intake lip, bulging out, tapering toward the back
  inner.add(lathe([[1.06, 0.62], [1.17, 0.68], [1.27, 0.55], [1.32, 0.2], [1.3, -0.7], [1.18, -1.5], [1.0, -2.1], [0.86, -2.35]]));
  // Intake duct (inside wall) and a dark backing disc behind the fan, so the blades stand out
  const dark = ditherMaterial(cell, 0.22);
  const duct = lathe([[1.06, 0.62], [1.03, 0.3], [1.0, -0.3], [0.95, -0.5]]);
  duct.material = dark;
  const backing = new THREE.Mesh(new THREE.CircleGeometry(1.02, 48), dark);
  backing.position.z = -0.15;
  inner.add(duct, backing);
  // Core cowl and exhaust plug at the back
  inner.add(lathe([[0.7, -1.7], [0.62, -2.6], [0.55, -3.0]]));
  const plug = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.1, 28).rotateX(-Math.PI / 2), mat);
  plug.position.z = -3.4;
  inner.add(plug);
  // Spinning fan: spinner cone + 22 blades
  const spin = new THREE.Group();
  spin.position.z = 0.2;
  inner.add(spin);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.85, 28).rotateX(Math.PI / 2), mat);
  spinner.position.z = 0.4;
  spin.add(spinner, new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.3, 24).rotateX(Math.PI / 2), mat));
  for (let i = 0; i < 22; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.z = (i / 22) * Math.PI * 2;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.24, 0.04), mat);
    blade.position.x = 0.34 + 0.37;
    blade.rotation.x = 0.75; // blade twist
    pivot.add(blade);
    spin.add(pivot);
  }

  // --- smoke: dots that leave the back of the engine, drift outward, rise and fade ---
  const N = 520;
  const pos = new Float32Array(N * 3);
  const age = new Float32Array(N);
  const phase = Float32Array.from({ length: N }, () => Math.random());
  const ang = Float32Array.from({ length: N }, () => Math.random() * Math.PI * 2);
  const rad = Float32Array.from({ length: N }, () => 0.05 + Math.random() * 0.75);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('age', new THREE.BufferAttribute(age, 1));
  const smokeMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(readColor()) }, uCell: { value: cell }, uSize: { value: cell * 2.2 } },
    vertexShader: /* glsl */ `
      attribute float age; uniform float uSize; varying float vAge;
      void main() {
        vAge = age;
        gl_PointSize = uSize * (1.0 - age * 0.5);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    // fades out by dropping dots (same dither pattern as the objects)
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uCell; varying float vAge;
      float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
      float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
      void main() {
        float a = pow(1.0 - vAge, 1.1);
        if (a < bayer4(gl_FragCoord.xy / uCell)) discard;
        gl_FragColor = vec4(uColor, 1.0);
      }`,
  });
  materials.add(smokeMat);
  const smoke = new THREE.Points(geo, smokeMat);
  smoke.frustumCulled = false;
  inner.add(smoke);

  let speed = 3;
  return {
    group, cameraZ: 11, base: { x: 0.2, y: -0.65 },
    update(t, dt, hover) {
      speed += ((hover ? 12 : 5) - speed) * Math.min(1, dt * 3); // spins faster on hover
      if (!reduceMotion) spin.rotation.z -= speed * dt;
      const flow = reduceMotion ? 0 : t * 0.25;
      for (let i = 0; i < N; i++) {
        const life = reduceMotion ? phase[i] : (flow + phase[i]) % 1; // 0 = leaving the engine, 1 = gone
        const r = rad[i] * (1 + life * 1.1);
        const a = ang[i] + life * 1.6; // slow swirl
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = Math.sin(a) * r + life * 0.6; // drifts upward
        pos[i * 3 + 2] = -3.2 - life * 3.6; // streams backward from the exhaust
        age[i] = life;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.age.needsUpdate = true;
    },
  };
}

// NACA 2412 aerofoil profile (the standard formula) extruded into a wing section,
// plus streaming dots that bend around it. The slider sets the angle of attack.
function buildAirfoil(mat: THREE.Material, aoaInput: HTMLInputElement | null): Built {
  const group = new THREE.Group();
  const m = 0.02, p = 0.4, t = 0.12; // "2412": 2% camber at 40% chord, 12% thick
  const up: [number, number][] = [], lo: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const x = (1 - Math.cos((i / 40) * Math.PI)) / 2;
    const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const yc = x < p ? (m / p ** 2) * (2 * p * x - x ** 2) : (m / (1 - p) ** 2) * (1 - 2 * p + 2 * p * x - x ** 2);
    const dyc = x < p ? ((2 * m) / p ** 2) * (p - x) : ((2 * m) / (1 - p) ** 2) * (p - x);
    const th = Math.atan(dyc);
    up.push([x - yt * Math.sin(th), yc + yt * Math.cos(th)]);
    lo.push([x + yt * Math.sin(th), yc - yt * Math.cos(th)]);
  }
  const chord = 3.4;
  const shape = new THREE.Shape();
  shape.moveTo(up[0][0] * chord, up[0][1] * chord);
  up.forEach(([x, y]) => shape.lineTo(x * chord, y * chord));
  lo.reverse().forEach(([x, y]) => shape.lineTo(x * chord, y * chord));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: false, steps: 1 });
  geo.translate(-chord / 2, 0, -0.6);
  const wing = new THREE.Mesh(geo, mat);
  group.add(wing);

  // Flow dots: LINES x DOTS points, each streamline nudged around the wing
  const LINES = 12, DOTS = 46, SPAN = 8;
  const pos = new Float32Array(LINES * DOTS * 3);
  const flow = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
    new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, color: readColor() }),
  );
  group.add(flow);
  const flowMat = flow.material as THREE.PointsMaterial;
  new MutationObserver(() => flowMat.color.set(readColor())).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  let aoa = 4; // degrees
  const readAoa = () => { aoa = aoaInput ? Number(aoaInput.value) : 4; };
  aoaInput?.addEventListener('input', readAoa);
  readAoa();
  let shown = aoa;

  return {
    group, cameraZ: 8.5, base: { x: 0.15, y: -0.35 },
    update(t, dt) {
      shown += (aoa - shown) * Math.min(1, dt * 6);
      wing.rotation.z = -THREE.MathUtils.degToRad(shown); // nose up = clockwise
      const k = 0.35 + shown * 0.05; // bigger angle = more bend
      let n = 0;
      for (let l = 0; l < LINES; l++) {
        const y0 = (l / (LINES - 1) - 0.5) * 3.2;
        for (let d = 0; d < DOTS; d++) {
          const x = (((d / DOTS) * SPAN + t * (reduceMotion ? 0 : 1.1)) % SPAN) - SPAN / 2;
          // simple "air goes around the wing" bump: above-wing lines rise, below-wing lines dip
          const bump = Math.exp(-(x * x) / 1.6) / (1 + (y0 * 1.4) ** 2);
          const y = y0 + (y0 >= 0 ? 1 : -1) * bump * k + Math.exp(-((x + 1.6) ** 2) / 1.2) * shown * 0.03;
          pos[n++] = x; pos[n++] = y; pos[n++] = 0.75;
        }
      }
      flow.geometry.attributes.position.needsUpdate = true;
    },
  };
}

// Handheld "cockpit" console: rounded body, screen (shows the current project), d-pad, buttons
function buildConsole(mat: THREE.Material, covers: string[]): Built & { setScreen(i: number): void } {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new RoundedBoxGeometry(2.7, 2.2, 0.7, 4, 0.14), mat));

  const bezel = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.5), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  bezel.position.set(0, 0.25, 0.356);
  group.add(bezel);
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.3), screenMat);
  screen.name = 'screen';
  screen.position.set(0, 0.25, 0.362);
  group.add(screen);

  // d-pad
  const bar = (w: number, h: number) => new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), mat);
  const dpad = new THREE.Group();
  dpad.add(bar(0.5, 0.17), bar(0.17, 0.5));
  dpad.position.set(-0.85, -0.78, 0.4);
  group.add(dpad);
  // A / B buttons
  [[0.8, -0.7], [0.55, -0.9]].forEach(([x, y]) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 16).rotateX(Math.PI / 2), mat);
    b.position.set(x, y, 0.4);
    group.add(b);
  });

  const loader = new THREE.TextureLoader();
  const cache = new Map<number, THREE.Texture>();
  const setScreen = (i: number) => {
    const src = covers[i];
    if (!src) return;
    const apply = (tex: THREE.Texture) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      screenMat.map = tex; screenMat.color.set(0xffffff); screenMat.needsUpdate = true;
      // little "channel change" flick
      gsap.fromTo(screen.scale, { y: 0.05 }, { y: 1, duration: 0.25, ease: 'power2.out' });
    };
    if (cache.has(i)) apply(cache.get(i)!);
    else loader.load(src, (tex) => { cache.set(i, tex); apply(tex); });
  };
  setScreen(0);

  return { group, cameraZ: 7, base: { x: 0.1, y: -0.3 }, setScreen };
}

// Crumpled boarding pass: a flat sheet pushed around by noise. Hover = smooths out a little.
function buildPass(mat: THREE.Material): Built {
  const geo = new THREE.PlaneGeometry(1.8, 2.8, 40, 60);
  const orig = geo.attributes.position.array.slice() as Float32Array;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const apply = (c: number) => {
    for (let i = 0; i < pos.count; i++) {
      const x = orig[i * 3], y = orig[i * 3 + 1];
      const n = Math.sin(x * 3.1 + y * 2.3) * 0.5 + Math.sin(x * 5.7 - y * 4.1 + 1.3) * 0.3 + Math.sin(x * 9.3 + y * 7.7) * 0.2;
      const crease = Math.abs(Math.sin(x * 3.6 + y * 2.9 + 0.7)) * 0.35;
      pos.setXYZ(i, x + Math.cos(y * 4) * 0.09 * c, y + Math.sin(x * 5) * 0.09 * c, (n * 0.3 + crease) * c);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  };
  let cur = 1, target = 1;
  apply(cur);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, mat));
  return {
    group, cameraZ: 7, base: { x: 0.1, y: 0.2 },
    update(_t, dt, hover) {
      target = hover ? 0.6 : 1;
      if (Math.abs(target - cur) > 0.002) { cur += (target - cur) * Math.min(1, dt * 4); apply(cur); }
    },
  };
}

/* ---------- Scene runner ---------- */
interface Active { render(t: number, dt: number): void }
const active = new Set<Active>();
let raf = 0, last = 0;
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  active.forEach((s) => s.render(now / 1000, dt));
  raf = active.size ? requestAnimationFrame(loop) : 0;
}
const wake = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } };

async function setup(el: HTMLElement) {
  const canvas = el.querySelector('canvas')!;
  const kind = el.dataset.scene as Kind;
  const mobile = isMobile();

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
  } catch {
    el.classList.add('nogl'); // no WebGL: the label/corners still show
    return;
  }
  const pr = Math.min(devicePixelRatio, mobile ? 1 : 2);
  renderer.setPixelRatio(pr);
  const mat = ditherMaterial(3 * pr);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);

  // Build the placeholder, or a real model if public/models/<file>.glb exists
  const aoaInput = el.dataset.aoa ? (document.querySelector(el.dataset.aoa) as HTMLInputElement | null) : null;
  const covers: string[] = JSON.parse(el.dataset.covers || '[]');
  let built: Built =
    kind === 'engine' ? buildEngine(mat, 3 * pr) :
    kind === 'airfoil' ? buildAirfoil(mat, aoaInput) :
    kind === 'console' ? buildConsole(mat, covers) : buildPass(mat);
  scene.add(built.group);
  camera.position.z = built.cameraZ;

  if (kind === 'console') {
    addEventListener('console:screen', ((e: CustomEvent) => (built as ReturnType<typeof buildConsole>).setScreen(e.detail.index)) as EventListener);
  }

  if (el.dataset.model) {
    try {
      const head = await fetch(el.dataset.model, { method: 'HEAD' });
      if (head.ok && !(head.headers.get('content-type') || '').includes('text/html')) {
        const gltf = await new GLTFLoader().loadAsync(el.dataset.model);
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3()).length();
        model.scale.setScalar(3.2 / size);
        model.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(3.2 / size));
        model.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          if (kind === 'console' && mesh.name === 'screen') return; // keep the screen's own material
          mesh.material = mat;
        });
        scene.remove(built.group);
        built = { ...built, group: new THREE.Group().add(model), update: undefined };
        scene.add(built.group);
      }
    } catch { /* keep the placeholder */ }
  }

  // Sizing
  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  // Drag to rotate, with a little inertia
  const drag = { x: 0, y: 0, vx: 0, vy: 0, down: false, px: 0, py: 0 };
  canvas.addEventListener('pointerdown', (e) => { drag.down = true; drag.px = e.clientX; drag.py = e.clientY; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag.down) return;
    drag.vy = (e.clientX - drag.px) * 0.008; drag.vx = (e.clientY - drag.py) * 0.008;
    drag.px = e.clientX; drag.py = e.clientY;
    drag.y += drag.vy; drag.x += drag.vx;
  });
  const up = () => { drag.down = false; canvas.style.cursor = ''; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  let hover = false;
  canvas.addEventListener('pointerenter', () => (hover = true));
  canvas.addEventListener('pointerleave', () => (hover = false));

  const tilt = { x: 0, y: 0 };
  const runner: Active = {
    render(t, dt) {
      if (!drag.down) { // inertia, then ease pitch back to rest
        drag.y += drag.vy; drag.x += drag.vx;
        drag.vx *= 0.94; drag.vy *= 0.94;
        drag.x *= 0.985;
      }
      drag.x = THREE.MathUtils.clamp(drag.x, -1.1, 1.1);
      // lean toward the cursor (not on phones / reduce motion)
      const lean = !mobile && !reduceMotion;
      tilt.x += ((lean ? pointer.y * 0.25 : 0) - tilt.x) * Math.min(1, dt * 3);
      tilt.y += ((lean ? pointer.x * 0.35 : 0) - tilt.y) * Math.min(1, dt * 3);
      const g = built.group;
      g.rotation.x = built.base.x + drag.x + tilt.x;
      g.rotation.y = built.base.y + drag.y + tilt.y;
      g.position.y = reduceMotion ? 0 : Math.sin(t * 0.8) * 0.08; // gentle float
      built.update?.(t, dt, hover);
      renderer.render(scene, camera);
    },
  };

  // Only render while on screen
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) { active.add(runner); wake(); } else active.delete(runner);
  }, { rootMargin: '100px' }).observe(el);
}

export function initScenes() {
  const els = document.querySelectorAll<HTMLElement>('[data-scene]');
  // Load 3D only when a scene is about to scroll into view
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      setup(e.target as HTMLElement);
    });
  }, { rootMargin: '300px' });
  els.forEach((el) => io.observe(el));
}
