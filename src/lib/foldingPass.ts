// A boarding pass that folds itself into a paper airplane, built from flat panels hinged at fold lines
// (no cloth simulation). Scrolling scrubs the folding, so scrolling back up unfolds it.
//
// HOW IT WORKS
//  - The flat pass is cut into 8 flat panels ("cells"). Each panel (except the first) is hinged to a
//    parent panel along a fold line, and the hinge rotates by an angle that scroll controls.
//  - The paper is 3.2 wide x 2 tall (x = length, nose end at +x, y = width).
//  - Folds, in order (each one is a step on the scroll timeline):
//      1  top-right corner folds in        2  bottom-right corner folds in
//      3  the sheet folds in half          4  top wing folds out      5  bottom wing folds out
//  - Once folded it bobs, banks toward the cursor, and the email link launches it off screen.
//
// To change the look, edit the colours/shader below. To change the folds, edit `cells`.
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

type V2 = [number, number];

interface Cell {
  id: string;
  poly: V2[];            // the panel's outline, in flat-paper coordinates
  parent?: string;       // which panel it is hinged to (none = the fixed root)
  hinge?: [V2, V2];      // the two end points of the fold line (flat coordinates)
  side?: V2;             // direction from the fold line toward this panel (flat coordinates)
  step?: number;         // which fold step moves it (1 to 5)
  angle?: number;        // fold angle in radians: positive = fold toward the viewer, negative = away
  offset: number;        // tiny height shift so stacked layers never flicker against each other
}

const WING = 1.35;       // how far the wings swing out (radians, ~77 deg: slightly up, like a real dart)
const W = 0.3;           // distance of the wing fold line from the centre crease
const X = 1.6 - W;       // where the wing fold line meets the slanted nose edge

const cells: Cell[] = [
  // upper half, near the centre crease: stays put (root)
  { id: 'bU', poly: [[-1.6, 0], [1.6, 0], [X, W], [-1.6, W]], offset: 0 },
  // top wing + the corner flaps that fold onto the top half
  { id: 'wU', parent: 'bU', poly: [[-1.6, W], [X, W], [0.6, 1], [-1.6, 1]], hinge: [[-1.6, W], [X, W]], side: [0, 1], step: 4, angle: -WING, offset: 0 },
  { id: 'cbU', parent: 'wU', poly: [[X, W], [X, 1], [0.6, 1]], hinge: [[X, W], [0.6, 1]], side: [1, 1], step: 1, angle: Math.PI, offset: -0.004 },
  { id: 'caU', parent: 'bU', poly: [[1.6, 0], [1.6, 1], [X, 1], [X, W]], hinge: [[1.6, 0], [X, W]], side: [1, 1], step: 1, angle: Math.PI, offset: -0.004 },
  // lower half: folds over the upper half (step 3)
  { id: 'bL', parent: 'bU', poly: [[-1.6, -W], [X, -W], [1.6, 0], [-1.6, 0]], hinge: [[-1.6, 0], [1.6, 0]], side: [0, -1], step: 3, angle: Math.PI, offset: -0.016 },
  // bottom wing + the corner flaps that fold onto the lower half
  { id: 'wL', parent: 'bL', poly: [[-1.6, -1], [0.6, -1], [X, -W], [-1.6, -W]], hinge: [[-1.6, -W], [X, -W]], side: [0, -1], step: 5, angle: -WING, offset: -0.016 },
  { id: 'cbL', parent: 'wL', poly: [[X, -W], [0.6, -1], [X, -1]], hinge: [[X, -W], [0.6, -1]], side: [1, -1], step: 2, angle: Math.PI, offset: 0.01 },
  { id: 'caL', parent: 'bL', poly: [[1.6, 0], [X, -W], [X, -1], [1.6, -1]], hinge: [[1.6, 0], [X, -W]], side: [1, -1], step: 2, angle: Math.PI, offset: 0.01 },
];

// where each fold step happens on the 0..1 scroll progress (the last 20% is the final settle)
const STEP_RANGE: Record<number, [number, number]> = {
  1: [0.0, 0.15], 2: [0.15, 0.3], 3: [0.3, 0.48], 4: [0.48, 0.64], 5: [0.64, 0.8],
};
const ease = (t: number) => t * t * (3 - 2 * t);
const seg = (p: number, a: number, b: number) => ease(THREE.MathUtils.clamp((p - a) / (b - a), 0, 1));

/* ---------- paper textures (drawn with canvas, so they stay crisp and editable) ---------- */
function makeTexture(draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = 1280; c.height = 800;
  const g = c.getContext('2d')!;
  draw(g);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // fonts load a moment later: redraw once they are ready
  document.fonts?.load('34px Silkscreen').then(() => { draw(g); tex.needsUpdate = true; }).catch(() => {});
  return tex;
}

function frontFace(g: CanvasRenderingContext2D) {
  const px = '"Silkscreen", "JetBrains Mono Variable", monospace';
  const mono = '"JetBrains Mono Variable", ui-monospace, monospace';
  g.fillStyle = '#eef1f5'; g.fillRect(0, 0, 1280, 800);
  // amber header band
  g.fillStyle = '#ffb000'; g.fillRect(0, 0, 1280, 100);
  g.fillStyle = '#0a0d12'; g.textBaseline = 'middle';
  g.font = `38px ${px}`; g.textAlign = 'left'; g.fillText('BOARDING PASS', 44, 52);
  g.textAlign = 'right'; g.fillText('OV 001', 1236, 52);
  // passenger
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillStyle = '#6b7482'; g.font = `24px ${mono}`; g.fillText('PASSENGER', 44, 178);
  g.fillStyle = '#0a0d12'; g.font = `bold 92px ${mono}`; g.fillText('OM VITANKAR', 44, 262);
  // destination
  g.fillStyle = '#6b7482'; g.font = `24px ${mono}`; g.fillText('FROM  GROUND', 44, 340);
  g.fillStyle = '#b36a00'; g.font = `bold 50px ${mono}`; g.fillText('DESTINATION: AEROSPACE', 44, 410);
  // small details
  g.fillStyle = '#6b7482'; g.font = `24px ${mono}`;
  g.fillText('FLIGHT', 44, 490); g.fillText('GATE', 330, 490); g.fillText('SEAT', 560, 490); g.fillText('BOARDING', 790, 490);
  g.fillStyle = '#0a0d12'; g.font = `bold 44px ${mono}`;
  g.fillText('OV-001', 44, 540); g.fillText('A1', 330, 540); g.fillText('1A', 560, 540); g.fillText('NOW', 790, 540);
  // dashed tear line above the barcode
  g.strokeStyle = '#aeb6c3'; g.lineWidth = 3; g.setLineDash([14, 12]);
  g.beginPath(); g.moveTo(44, 590); g.lineTo(1236, 590); g.stroke(); g.setLineDash([]);
  // barcode strip (a fixed pattern, so it looks the same every time)
  let x = 60, seed = 7;
  g.fillStyle = '#0a0d12';
  while (x < 1220) {
    seed = (seed * 16807) % 2147483647;
    const w = 2 + (seed % 5);
    if ((seed >> 3) % 3 !== 0) g.fillRect(x, 616, w, 112);
    x += w + 2 + (seed % 3);
  }
  g.fillStyle = '#6b7482'; g.font = `22px ${mono}`; g.textAlign = 'center';
  g.fillText('0 0 1 4 7 2 5 9 3 8 1 0 6 4 4 2 7', 640, 770);
  // paper edge, so the pass stays visible on light backgrounds too
  g.strokeStyle = '#b9c0cc'; g.lineWidth = 8; g.strokeRect(4, 4, 1272, 792);
}

function backFace(g: CanvasRenderingContext2D) {
  g.fillStyle = '#dfe4ec'; g.fillRect(0, 0, 1280, 800);
  // faint amber stripes along the long edges
  g.fillStyle = 'rgba(255,176,0,0.55)'; g.fillRect(0, 0, 1280, 26); g.fillRect(0, 774, 1280, 26);
  g.strokeStyle = '#b9c0cc'; g.lineWidth = 8; g.strokeRect(4, 4, 1272, 792);
}

/* ---------- the paper material: light shading + a faint halftone only in the shadows ---------- */
function paperMaterial(front: THREE.Texture, back: THREE.Texture, cell: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uFront: { value: front }, uBack: { value: back }, uCell: { value: cell } },
    vertexShader: `varying vec2 vUv; varying vec3 vN;
      void main(){ vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D uFront; uniform sampler2D uBack; uniform float uCell; varying vec2 vUv; varying vec3 vN;
      void main(){
        vec3 n = normalize(vN);
        bool front = gl_FrontFacing;
        if (!front) n = -n;
        vec3 base = front ? texture2D(uFront, vUv).rgb : texture2D(uBack, vUv).rgb;
        float l = dot(n, normalize(vec3(-0.35, 0.75, 0.6))) * 0.5 + 0.5;   // 0 dark .. 1 bright
        float shade = 0.5 + 0.5 * l;                                       // light overall, so creases read clearly
        // soft halftone dots, only where the paper is in shadow
        vec2 f = fract(gl_FragCoord.xy / uCell) - 0.5;
        float shadow = smoothstep(0.7, 0.3, l);
        float dots = step(length(f), 0.1 + 0.32 * shadow) * shadow * 0.32;
        vec3 col = base * shade;
        col = mix(col, col * 0.4, dots);
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, // lets the crease lines draw cleanly on top
  });
}

/* ---------- build ---------- */
export interface FoldingOptions {
  el: HTMLElement;                 // the .scene box
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  cameraZ: number;
  reduce: boolean;                 // reduce motion: just show the finished plane
  mobile: boolean;
  pointer: { x: number; y: number };
  cell: number;
}

export function buildFoldingPass(o: FoldingOptions) {
  const { el, canvas, camera, cameraZ, reduce, mobile, pointer } = o;
  const mat = paperMaterial(makeTexture(frontFace), makeTexture(backFace), o.cell * 1.3);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x7d8696, transparent: true, opacity: 0 });

  // outer = overall pose (tilts to show the plane), bank = leans toward the cursor, shift = re-centres
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  group.scale.setScalar(1.3); // a bit bigger, so the printed pass is easy to read
  const bank = new THREE.Group();
  const shift = new THREE.Group();
  group.add(bank); bank.add(shift);

  // one pivot per cell; the pivot sits on the fold line and rotates
  const pivot = new Map<string, THREE.Group>();
  const origin = new Map<string, V2>();
  const axis = new Map<string, { d: THREE.Vector3; sigma: number }>();
  const creases = new Map<string, THREE.LineSegments>();

  cells.forEach((c) => {
    const org: V2 = c.hinge ? c.hinge[0] : [0, 0];
    origin.set(c.id, org);
    const g = new THREE.Group();
    pivot.set(c.id, g);

    // the panel itself, with UVs taken from the flat paper so the printed side lines up
    const shape = new THREE.Shape(c.poly.map(([x, y]) => new THREE.Vector2(x - org[0], y - org[1])));
    const geo = new THREE.ShapeGeometry(shape);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (pos.getX(i) + org[0] + 1.6) / 3.2, (pos.getY(i) + org[1] + 1) / 2);
      pos.setZ(i, c.offset);
    }
    g.add(new THREE.Mesh(geo, mat));

    if (c.parent && c.hinge && c.side) {
      const par = origin.get(c.parent)!;
      g.position.set(org[0] - par[0], org[1] - par[1], 0);
      const [A, B] = c.hinge;
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const d = new THREE.Vector3((B[0] - A[0]) / len, (B[1] - A[1]) / len, 0);
      const sl = Math.hypot(c.side[0], c.side[1]);
      const n = [c.side[0] / sl, c.side[1] / sl];
      // which way to turn so that a positive angle lifts the panel toward the viewer
      axis.set(c.id, { d, sigma: Math.sign(d.x * n[1] - d.y * n[0]) });
      // a thin line along the crease that fades in as the fold happens
      const line = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(B[0] - A[0], B[1] - A[1], 0)]),
        lineMat.clone(),
      );
      g.add(line);
      creases.set(c.id, line);
      pivot.get(c.parent)!.add(g);
    } else {
      shift.add(g);
    }
  });

  /* ---- scroll-driven progress ---- */
  const prog = { p: reduce ? 1 : 0 };
  if (!reduce) {
    gsap.to(prog, {
      p: 1, ease: 'none',
      // starts folding as the pass scrolls into view, finishes when it is near the middle of the screen
      scrollTrigger: { trigger: el, start: 'top 88%', end: 'center 50%', scrub: 0.6 },
    });
  }

  /* ---- sizing: the canvas is bigger than the box, so the plane can fly off the whole screen ---- */
  const anchor = new THREE.Vector3();
  let ppu = 100;        // pixels per world unit at the plane's distance
  let canvasW = 1000, canvasH = 800;
  const layout = () => {
    const r = el.getBoundingClientRect();
    const H = Math.round(Math.min(innerHeight * 1.25, 1400));
    canvas.style.cssText = `position:absolute;left:${-r.left}px;top:${-(H - r.height) / 2}px;width:${innerWidth}px;height:${H}px;pointer-events:none;cursor:auto;touch-action:auto`;
  };
  layout();
  new ResizeObserver(layout).observe(el);
  addEventListener('resize', layout);

  const onResize = (w: number, h: number) => {
    const r = el.getBoundingClientRect();
    canvasW = w; canvasH = h;
    ppu = r.height / (2 * cameraZ * Math.tan(THREE.MathUtils.degToRad(35 / 2)));
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(h / ppu / (2 * cameraZ)));
    // keep the plane at the middle of the scene box, even though the canvas is wider
    anchor.set((r.left + r.width / 2 - w / 2) / ppu, 0, 0);
  };

  /* ---- launch: clicking the email link sends it off screen; it glides back a few seconds later ---- */
  const launch = { x: 0, y: 0, roll: 0, busy: false };
  const flyOff = () => {
    if (reduce || launch.busy || prog.p < 0.8) return; // only when it is folded
    launch.busy = true;
    const offX = (canvasW - (el.getBoundingClientRect().left + el.offsetWidth / 2)) / ppu + 5;
    const backX = -((el.getBoundingClientRect().left + el.offsetWidth / 2) / ppu) - 5;
    gsap.timeline({ onComplete: () => (launch.busy = false) })
      .to(launch, { x: offX, y: 3.2, roll: 0.5, duration: 1.1, ease: 'power2.in' })
      .set(launch, { x: backX, y: -1.4, roll: -0.25 }, '+=3')          // a few seconds later, reappear on the left...
      .to(launch, { x: 0, y: 0, roll: 0, duration: 2.2, ease: 'power2.out' }); // ...and glide back in
  };
  document.querySelectorAll<HTMLAnchorElement>('#contact a[href^="mailto:"]').forEach((a) => a.addEventListener('click', flyOff));

  /* ---- every frame ---- */
  const ptr = { x: 0, y: 0 };
  const q = new THREE.Quaternion();
  function update(t: number, dt: number) {
    const p = prog.p;
    // hinge angles
    cells.forEach((c) => {
      if (!c.step) return;
      const [a, b] = STEP_RANGE[c.step];
      const s = seg(p, a, b);
      const ax = axis.get(c.id)!;
      q.setFromAxisAngle(ax.d, ax.sigma * c.angle! * s);
      pivot.get(c.id)!.quaternion.copy(q);
      (creases.get(c.id)!.material as THREE.LineBasicMaterial).opacity = Math.min(1, s * 3) * 0.9;
    });

    // overall pose: starts face-on and flat, turns to show the finished plane from above and the side
    const s3 = seg(p, 0.3, 0.48);
    shift.position.y = -0.5 * s3; // the folded plane sits above the fold line: re-centre it
    const fw = seg(p, 0.88, 1);   // 0 while folding, 1 once finished
    ptr.x += (pointer.x - ptr.x) * Math.min(1, dt * 3);
    ptr.y += (pointer.y - ptr.y) * Math.min(1, dt * 3);
    const lean = !mobile && !reduce ? fw : 0;
    group.rotation.set(
      0.9 * seg(p, 0.48, 1) + ptr.y * 0.12 * lean,
      -0.6 * seg(p, 0.3, 1) + ptr.x * 0.2 * lean,
      launch.roll,
    );
    bank.rotation.x = -ptr.x * 0.35 * lean; // roll about the nose axis, toward the cursor
    const bob = reduce ? 0 : Math.sin(t * 1.3) * 0.07 * fw;
    group.position.set(anchor.x + launch.x, anchor.y + launch.y + bob, 0);
  }

  return {
    group, update, onResize,
    cameraZ,
    base: { x: 0, y: 0 },
    custom: true as const,
    dispose() { removeEventListener('resize', layout); },
  };
}
