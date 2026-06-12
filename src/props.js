// props.js — procedural meshes and canvas textures for hospital furniture,
// signage, and the strange objects. Clean, stylized, slightly wrong.
import * as THREE from 'three';

// ---------------------------------------------------------------- materials
const M = {};
function lam(color, opts = {}) {
  const key = 'l' + color + JSON.stringify(opts);
  if (!M[key]) M[key] = new THREE.MeshLambertMaterial({ color, ...opts });
  return M[key];
}
export const MAT = {
  steel: () => lam(0x9aa4a8),
  darkSteel: () => lam(0x5a6468),
  white: () => lam(0xf2f4f4),
  cream: () => lam(0xe6e2d8),
  teal: () => lam(0x4d8a8a),
  tealDark: () => lam(0x3a6b6b),
  sheet: () => lam(0xdfe6e6),
  blanket: () => lam(0x9fb8b4),
  wood: () => lam(0xb89a78),
  plant: () => lam(0x4a7a52),
  pot: () => lam(0xc7c2b8),
  paper: () => lam(0xfafaf6),
  black: () => lam(0x16191a),
  curtain: () => lam(0xcfe0dd, { side: THREE.DoubleSide }),
  glassDoor: () => {
    if (!M.gd) M.gd = new THREE.MeshLambertMaterial({ color: 0xaccdd8, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
    return M.gd;
  },
  relic: () => {
    if (!M.rel) M.rel = new THREE.MeshLambertMaterial({ color: 0x14161a, emissive: 0x1a0b22, emissiveIntensity: 0.7 });
    return M.rel;
  },
};

const _box = new THREE.BoxGeometry(1, 1, 1);
const _cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
const _sph = new THREE.SphereGeometry(1, 12, 9);

export function box(g, mat, w, h, d, x, y, z, ry = 0) {
  const m = new THREE.Mesh(_box, mat);
  m.scale.set(w, h, d); m.position.set(x, y, z); m.rotation.y = ry;
  g.add(m); return m;
}
function cyl(g, mat, r, h, x, y, z) {
  const m = new THREE.Mesh(_cyl, mat);
  m.scale.set(r, h, r); m.position.set(x, y, z);
  g.add(m); return m;
}
function sph(g, mat, r, x, y, z) {
  const m = new THREE.Mesh(_sph, mat);
  m.scale.set(r, r, r); m.position.set(x, y, z);
  g.add(m); return m;
}

// ---------------------------------------------------------------- furniture
// Each factory returns { group, collider } — collider is a half-extent box
// in local space (or null), world.js translates it.

export function chair(facing = 0) {
  const g = new THREE.Group();
  const seat = MAT.teal(), leg = MAT.steel();
  box(g, seat, 0.46, 0.05, 0.44, 0, 0.45, 0);
  box(g, seat, 0.46, 0.5, 0.05, 0, 0.72, -0.21);
  box(g, leg, 0.04, 0.45, 0.04, -0.19, 0.22, -0.18);
  box(g, leg, 0.04, 0.45, 0.04, 0.19, 0.22, -0.18);
  box(g, leg, 0.04, 0.45, 0.04, -0.19, 0.22, 0.18);
  box(g, leg, 0.04, 0.45, 0.04, 0.19, 0.22, 0.18);
  g.rotation.y = facing;
  return { group: g, collider: null };
}

export function bed(rumpled = false) {
  const g = new THREE.Group();
  box(g, MAT.steel(), 0.95, 0.08, 2.1, 0, 0.45, 0);
  box(g, MAT.sheet(), 0.92, 0.16, 2.05, 0, 0.55, 0);
  const bl = box(g, MAT.blanket(), 0.94, 0.08, 1.3, 0, 0.64, 0.3);
  if (rumpled) { bl.rotation.y = 0.12; bl.rotation.x = 0.05; bl.position.x = 0.08; }
  box(g, MAT.steel(), 0.95, 0.5, 0.05, 0, 0.75, -1.05); // headboard
  box(g, MAT.steel(), 0.95, 0.35, 0.05, 0, 0.65, 1.05);
  cyl(g, MAT.darkSteel(), 0.05, 0.45, -0.42, 0.22, -0.95);
  cyl(g, MAT.darkSteel(), 0.05, 0.45, 0.42, 0.22, -0.95);
  cyl(g, MAT.darkSteel(), 0.05, 0.45, -0.42, 0.22, 0.95);
  cyl(g, MAT.darkSteel(), 0.05, 0.45, 0.42, 0.22, 0.95);
  return { group: g, collider: { hx: 0.55, hz: 1.15 } };
}

export function gurney() {
  const b = bed(false);
  b.group.scale.set(0.85, 1, 0.85);
  return { group: b.group, collider: { hx: 0.5, hz: 1.0 } };
}

export function ivStand() {
  const g = new THREE.Group();
  cyl(g, MAT.steel(), 0.02, 1.9, 0, 0.95, 0);
  cyl(g, MAT.steel(), 0.22, 0.03, 0, 0.02, 0);
  box(g, MAT.steel(), 0.5, 0.02, 0.02, 0, 1.85, 0);
  const bag = box(g, MAT.glassDoor(), 0.14, 0.24, 0.05, 0.2, 1.68, 0);
  bag.material = new THREE.MeshLambertMaterial({ color: 0xd8e8e4, transparent: true, opacity: 0.7 });
  return { group: g, collider: null };
}

export function wheelchair() {
  const g = new THREE.Group();
  box(g, MAT.darkSteel(), 0.45, 0.04, 0.42, 0, 0.5, 0);
  box(g, MAT.darkSteel(), 0.45, 0.45, 0.04, 0, 0.75, -0.2);
  const wheel = new THREE.TorusGeometry(0.28, 0.025, 8, 20);
  const wl = new THREE.Mesh(wheel, MAT.steel()); wl.position.set(-0.26, 0.28, 0); wl.rotation.y = Math.PI / 2; g.add(wl);
  const wr = new THREE.Mesh(wheel, MAT.steel()); wr.position.set(0.26, 0.28, 0); wr.rotation.y = Math.PI / 2; g.add(wr);
  return { group: g, collider: { hx: 0.35, hz: 0.35 } };
}

export function desk() {
  const g = new THREE.Group();
  box(g, MAT.cream(), 1.5, 0.05, 0.7, 0, 0.74, 0);
  box(g, MAT.cream(), 0.05, 0.72, 0.65, -0.7, 0.36, 0);
  box(g, MAT.cream(), 0.05, 0.72, 0.65, 0.7, 0.36, 0);
  box(g, MAT.cream(), 0.4, 0.5, 0.6, 0.45, 0.3, 0);
  return { group: g, collider: { hx: 0.8, hz: 0.4 } };
}

export function cabinet() {
  const g = new THREE.Group();
  box(g, MAT.white(), 0.5, 0.85, 0.45, 0, 0.42, 0);
  box(g, MAT.steel(), 0.08, 0.02, 0.02, 0.1, 0.6, 0.23);
  box(g, MAT.steel(), 0.08, 0.02, 0.02, 0.1, 0.3, 0.23);
  return { group: g, collider: { hx: 0.28, hz: 0.25 } };
}

export function shelves() {
  const g = new THREE.Group();
  box(g, MAT.steel(), 1.2, 0.03, 0.4, 0, 0.4, 0);
  box(g, MAT.steel(), 1.2, 0.03, 0.4, 0, 0.9, 0);
  box(g, MAT.steel(), 1.2, 0.03, 0.4, 0, 1.4, 0);
  box(g, MAT.steel(), 0.04, 1.6, 0.4, -0.58, 0.8, 0);
  box(g, MAT.steel(), 0.04, 1.6, 0.4, 0.58, 0.8, 0);
  for (let i = 0; i < 5; i++) {
    box(g, MAT.paper(), 0.18, 0.22, 0.3, -0.4 + i * 0.2, 0.52 + (i % 2) * 0.5, 0);
  }
  return { group: g, collider: { hx: 0.65, hz: 0.25 } };
}

export function plant() {
  const g = new THREE.Group();
  cyl(g, MAT.pot(), 0.18, 0.3, 0, 0.15, 0);
  const leaf = new THREE.ConeGeometry(0.28, 0.8, 7);
  const l1 = new THREE.Mesh(leaf, MAT.plant()); l1.position.set(0, 0.75, 0); g.add(l1);
  const l2 = new THREE.Mesh(leaf, MAT.plant()); l2.position.set(0.1, 0.6, 0.06); l2.rotation.z = -0.35; g.add(l2);
  const l3 = new THREE.Mesh(leaf, MAT.plant()); l3.position.set(-0.1, 0.62, -0.05); l3.rotation.z = 0.3; g.add(l3);
  return { group: g, collider: null };
}

export function vending(emissiveColor = 0x9fd8e8) {
  const g = new THREE.Group();
  box(g, lam(0x3a5a7a), 0.9, 1.85, 0.65, 0, 0.92, 0);
  const face = new THREE.Mesh(_box, new THREE.MeshBasicMaterial({ color: emissiveColor }));
  face.scale.set(0.55, 1.1, 0.02); face.position.set(-0.12, 1.05, 0.33); g.add(face);
  box(g, MAT.black(), 0.2, 0.3, 0.02, 0.3, 0.6, 0.33);
  return { group: g, collider: { hx: 0.5, hz: 0.4 }, light: { color: emissiveColor, y: 1.1, z: 0.5 } };
}

export function clock(time = '3:33') {
  // wall clock, hands frozen at 3:33
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), MAT.paper());
  g.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.015, 6, 24), MAT.darkSteel());
  g.add(rim);
  const hour = new THREE.Mesh(_box, MAT.black());
  hour.scale.set(0.02, 0.1, 0.01); hour.position.set(0.05, 0.04, 0.012); hour.rotation.z = -Math.PI * 0.55;
  g.add(hour);
  const min = new THREE.Mesh(_box, MAT.black());
  min.scale.set(0.015, 0.17, 0.01); min.position.set(-0.045, 0.06, 0.013); min.rotation.z = Math.PI * 0.31;
  g.add(min);
  return { group: g, collider: null };
}

export function papers(n = 6, spread = 1.2) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.297), MAT.paper());
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = (i * 2.39996) % (Math.PI * 2);
    p.position.set(Math.sin(i * 1.7) * spread * 0.4, 0.012 + i * 0.002, Math.cos(i * 2.3) * spread * 0.4);
    g.add(p);
  }
  return { group: g, collider: null };
}

export function curtainRail(len = 2) {
  const g = new THREE.Group();
  box(g, MAT.steel(), len, 0.03, 0.03, 0, 2.1, 0);
  const c = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.6, 1.9), MAT.curtain());
  c.position.set(-len * 0.18, 1.12, 0);
  g.add(c);
  return { group: g, collider: null };
}

export function shoe() {
  const g = new THREE.Group();
  box(g, lam(0xeae6de), 0.09, 0.07, 0.26, 0, 0.035, 0, 0.4);
  return { group: g, collider: null };
}

export function tv(on = false) {
  const g = new THREE.Group();
  box(g, MAT.black(), 0.78, 0.46, 0.05, 0, 0, 0);
  const screen = new THREE.Mesh(_box, new THREE.MeshBasicMaterial({ color: on ? 0xbfd4d8 : 0x0c0e0f }));
  screen.scale.set(0.72, 0.4, 0.01); screen.position.set(0, 0, 0.028); g.add(screen);
  return { group: g, collider: null, screen };
}

export function receptionDesk() {
  const g = new THREE.Group();
  box(g, MAT.cream(), 4.2, 1.1, 0.6, 0, 0.55, 0);
  box(g, lam(0xd8d2c4), 4.4, 0.06, 0.8, 0, 1.12, 0);
  box(g, MAT.cream(), 0.6, 1.1, 1.6, -2.0, 0.55, 0.9);
  box(g, MAT.cream(), 0.6, 1.1, 1.6, 2.0, 0.55, 0.9);
  // a phone, off the hook
  box(g, MAT.black(), 0.2, 0.06, 0.14, 0.8, 1.18, 0.1);
  box(g, MAT.black(), 0.16, 0.05, 0.05, 1.15, 1.17, 0.25, 0.7);
  return { group: g, collider: { hx: 2.3, hz: 0.9 } };
}

// ---------------------------------------------------------------- relics
export const RELIC_NAMES = ['black orb', 'brass knot', 'wet obelisk', 'porcelain eye', 'silent bell'];
export function relic(type) {
  const g = new THREE.Group();
  const m = MAT.relic();
  let mesh;
  switch (type % 5) {
    case 0: mesh = sph(g, m, 0.14, 0, 0, 0); break;
    case 1: mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(0.1, 0.035, 64, 8), lam(0x8a6f3a, { emissive: 0x221a08, emissiveIntensity: 0.6 })); g.add(mesh); break;
    case 2: mesh = box(g, lam(0x2a3138, { emissive: 0x06121a, emissiveIntensity: 0.8 }), 0.09, 0.34, 0.09, 0, 0.06, 0); mesh.rotation.y = 0.6; break;
    case 3: mesh = sph(g, lam(0xf2f0ea), 0.11, 0, 0, 0);
      sph(g, lam(0x2a6a7a), 0.045, 0, 0, 0.085);
      sph(g, MAT.black(), 0.02, 0, 0, 0.115);
      break;
    case 4: mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.13, 0.18, 14), lam(0x707a82, { emissive: 0x0a0e14, emissiveIntensity: 0.7 })); mesh.position.y = 0.02; g.add(mesh); break;
  }
  return { group: g, collider: null };
}

export function keycard(color) {
  const g = new THREE.Group();
  const c = box(g, new THREE.MeshBasicMaterial({ color }), 0.2, 0.012, 0.13, 0, 0, 0);
  box(g, MAT.paper(), 0.06, 0.014, 0.06, -0.04, 0.002, 0);
  return { group: g, collider: null, card: c };
}

export function pedestal() {
  const g = new THREE.Group();
  box(g, MAT.cream(), 0.5, 0.9, 0.5, 0, 0.45, 0);
  return { group: g, collider: { hx: 0.3, hz: 0.3 } };
}

// ---------------------------------------------------------------- mannequins
// Featureless display mannequins in surgical-green gowns, the kind that tie
// (and gape) at the back. The gap and the ties face -z; the "front" faces +z.
export function mannequin(headTurn = 0, tilt = 0) {
  const g = new THREE.Group();
  const skin = lam(0xd9d5cb);
  const gown = lam(0x6f9b84);
  const gownDark = lam(0x5d8470);
  // legs
  cyl(g, skin, 0.045, 0.78, -0.07, 0.39, 0);
  cyl(g, skin, 0.045, 0.78, 0.07, 0.39, 0);
  // gown — flared, knee to shoulder
  const gw = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.27, 0.92, 12), gown);
  gw.position.y = 1.02; g.add(gw);
  // the gap at the back: a pale strip where the gown doesn't close
  const gap = box(g, skin, 0.055, 0.86, 0.02, 0, 1.0, -0.215);
  gap.rotation.x = 0.115; // follow the flare
  // ties across the gap
  box(g, gownDark, 0.16, 0.025, 0.02, 0, 1.38, -0.175);
  box(g, gownDark, 0.16, 0.025, 0.02, 0, 1.08, -0.225, 0.15);
  // arms, hanging slightly away from the body
  const aL = cyl(g, skin, 0.038, 0.56, -0.225, 1.16, 0); aL.rotation.z = 0.14;
  const aR = cyl(g, skin, 0.038, 0.56, 0.225, 1.16, 0); aR.rotation.z = -0.14;
  // neck + featureless head
  cyl(g, skin, 0.05, 0.09, 0, 1.5, 0);
  const head = sph(g, skin, 0.105, 0, 1.65, 0);
  if (headTurn) head.rotation.y = headTurn; // (invisible on a blank head; kept for the seam)
  // a faint seam line across the face height
  const seam = box(g, lam(0xc7c2b6), 0.16, 0.012, 0.012, 0, 1.65, 0.095);
  seam.visible = Math.abs(headTurn) > 0.01;
  if (tilt) { g.rotation.z = tilt * 0.06; g.rotation.x = tilt * 0.04; }
  return { group: g, collider: { hx: 0.24, hz: 0.24 } };
}

// ---------------------------------------------------------------- the figure
export function figure() {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: 0x23282b, transparent: true, opacity: 0.85 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.0, 4, 10), m);
  body.position.y = 0.95; g.add(body);
  const head = new THREE.Mesh(_sph, m);
  head.scale.setScalar(0.14); head.position.y = 1.68; g.add(head);
  return g;
}

// ---------------------------------------------------------------- signs
const signCanvases = new Map();
export function signTexture(text, opts = {}) {
  const key = text + JSON.stringify(opts);
  if (signCanvases.has(key)) return signCanvases.get(key);
  const w = 512, h = 128;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = opts.bg || '#3d565e';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.fillStyle = opts.fg || '#eef2f2';
  let size = opts.size || 52;
  ctx.font = `300 ${size}px Helvetica, Arial, sans-serif`;
  while (size > 18 && ctx.measureText(text).width > w - 40) {
    size -= 2;
    ctx.font = `300 ${size}px Helvetica, Arial, sans-serif`;
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  signCanvases.set(key, tex);
  return tex;
}
export function sign(text, w = 1.6, opts = {}) {
  const tex = signTexture(text, opts);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, w * 0.25),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  return m;
}

// ---------------------------------------------------------------- portraits
// Framed photographs of the hospital board, hung sparsely. Names courtesy of
// the great deserts, approximately. Files are loaded from assets/portraits/;
// until (or unless) a file exists, the frame holds a faded, empty photograph,
// which is arguably worse.
export const PORTRAITS = [
  { file: 'assets/portraits/p1.jpg', name: 'MATRON E. SAHEERA' },
  { file: 'assets/portraits/p2.jpg', name: 'DR. H. ATACAMBA' },
  { file: 'assets/portraits/p3.jpg', name: 'SISTER N. GOBEE' },
  { file: 'assets/portraits/p4.jpg', name: 'DR. T. MOHAVE' },
  { file: 'assets/portraits/p5.jpg', name: 'V. KALAHARRI — CHAIR' },
  { file: 'assets/portraits/p6.jpg', name: 'MR. J. SONORAN — TREASURER' },
  { file: 'assets/portraits/p7.jpg', name: 'PROF. A. KARAKUM' },
  { file: 'assets/portraits/p8.jpg', name: 'MRS. D. NAMIBE' },
];
const _texLoader = new THREE.TextureLoader();
const _portraitTex = new Map();   // idx -> texture (fallback first, swapped on load)
function fallbackPortraitTexture(i) {
  const cv = document.createElement('canvas'); cv.width = 205; cv.height = 256;
  const ctx = cv.getContext('2d');
  // aged paper border, like a mounted studio print
  ctx.fillStyle = '#e8ddc4'; ctx.fillRect(0, 0, 205, 256);
  const g = ctx.createRadialGradient(102, 115, 20, 102, 128, 160);
  g.addColorStop(0, '#a39684'); g.addColorStop(1, '#6e6354');
  ctx.fillStyle = g; ctx.fillRect(14, 14, 177, 228);
  // the faintest suggestion that someone was once in the frame
  ctx.fillStyle = 'rgba(60,54,46,0.18)';
  ctx.beginPath(); ctx.ellipse(102, 105, 34, 42, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(102, 205, 62, 70, 0, Math.PI, 0); ctx.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function portraitTexture(idx) {
  if (_portraitTex.has(idx)) return _portraitTex.get(idx);
  const tex = fallbackPortraitTexture(idx);
  _portraitTex.set(idx, tex);
  _texLoader.load(PORTRAITS[idx].file, loaded => {
    loaded.colorSpace = THREE.SRGBColorSpace;
    // swap the image into every material that uses this slot
    for (const m of _portraitMats.get(idx) || []) { m.map = loaded; m.needsUpdate = true; }
    _portraitTex.set(idx, loaded);
  }, undefined, () => {});  // missing file → the empty photograph stays
  return tex;
}
const _portraitMats = new Map(); // idx -> [materials]
function plateTexture(name) {
  const key = 'plate' + name;
  if (signCanvases.has(key)) return signCanvases.get(key);
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 48;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 48);
  g.addColorStop(0, '#c9a96a'); g.addColorStop(0.5, '#a98c4f'); g.addColorStop(1, '#8f7440');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 48);
  ctx.strokeStyle = 'rgba(80,60,20,0.5)'; ctx.strokeRect(3, 3, 250, 42);
  ctx.fillStyle = '#3a2e1a';
  let size = 22;
  ctx.font = `${size}px Georgia, serif`;
  while (size > 10 && ctx.measureText(name).width > 236) { size -= 1; ctx.font = `${size}px Georgia, serif`; }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name, 128, 25);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  signCanvases.set(key, tex);
  return tex;
}
export function portrait(idx) {
  idx = idx % PORTRAITS.length;
  const g = new THREE.Group();
  // dark wood frame with cream mount
  box(g, lam(0x4a3526), 0.6, 0.76, 0.045, 0, 0, 0);
  box(g, lam(0xe8e2d2), 0.52, 0.68, 0.012, 0, 0, 0.02);
  const photoM = new THREE.MeshLambertMaterial({ map: portraitTexture(idx) });
  if (!_portraitMats.has(idx)) _portraitMats.set(idx, []);
  _portraitMats.get(idx).push(photoM);
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.575), photoM);
  photo.position.z = 0.028; g.add(photo);
  // brass name plate beneath the frame
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.064),
    new THREE.MeshLambertMaterial({ map: plateTexture(PORTRAITS[idx].name) })
  );
  plate.position.set(0, -0.46, 0.005); g.add(plate);
  return { group: g, collider: null };
}

// ---------------------------------------------------------------- posters
// Patient-information posters. The first four load from assets/posters/;
// the rest are generated in the same house style, and the further you walk,
// the less sound their advice becomes.
export const POSTER_FILES = [
  'assets/posters/i1.jpg',   // WASH BEFORE THE WARD
  'assets/posters/i2.jpg',   // KEEP THE LID ON
  'assets/posters/i3.jpg',   // DON'T WAIT (immunisation)
  'assets/posters/i4.jpg',   // KEEP IT TO YOURSELF
];
const POSTER_SLOGANS = [
  { lines: ['QUIET', 'PLEASE'], accent: 1, sub: 'Rest is part of treatment.', foot: 'BY ORDER OF THE BOARD' },
  { lines: ['VISITORS', 'MUST', 'SIGN IN'], accent: 1, sub: 'And sign out.', foot: 'ASK AT RECEPTION' },
  { lines: ['COVER', 'EVERY', 'COUGH'], accent: 1, sub: 'Someone is counting.', foot: 'YOUR CO-OPERATION IS NOTED' },
  { lines: ['THE WARD', 'IS CLEAN'], accent: 1, sub: 'It has always been clean.', foot: 'USE SOAP. DRY THOROUGHLY' },
  { lines: ['DO NOT', 'WANDER'], accent: 1, sub: 'Corridors are for walking through.', foot: 'BY ORDER OF THE BOARD' },
  { lines: ['HAVE YOU', 'WASHED'], accent: 1, sub: 'Clean hands are noticed.', foot: 'THEY ARE NOTICED' },
  { lines: ['GO BACK', 'TO BED'], accent: 0, sub: 'You will feel better presently.', foot: 'VISITING HOURS ARE OVER' },
  { lines: ['DONATE', 'BLOOD'], accent: 1, sub: 'It remembers you.', foot: 'THANK YOU FOR GIVING' },
];
export const POSTER_REAL_COUNT = POSTER_FILES.length;
export const POSTER_COUNT = POSTER_FILES.length + POSTER_SLOGANS.length;

function agedPaper(ctx, w, h, tone = '#ece3cb') {
  ctx.fillStyle = tone; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 130; i++) {
    ctx.fillStyle = `rgba(120,100,70,${0.02 + (i % 4) * 0.012})`;
    ctx.fillRect((i * 53) % w, (i * 89) % h, 2, 2);
  }
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(90,70,40,0.16)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
function sloganPosterTexture(i) {
  const s = POSTER_SLOGANS[i % POSTER_SLOGANS.length];
  const w = 256, h = 366;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  agedPaper(ctx, w, h);
  let y = 64;
  for (let li = 0; li < s.lines.length; li++) {
    let size = 56;
    ctx.font = `bold ${size}px 'Arial Narrow', 'Helvetica Neue', sans-serif`;
    while (size > 20 && ctx.measureText(s.lines[li]).width > w - 36) {
      size -= 2; ctx.font = `bold ${size}px 'Arial Narrow', 'Helvetica Neue', sans-serif`;
    }
    ctx.fillStyle = li === s.accent ? '#b5392f' : '#2c3e57';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(s.lines[li], 18, y);
    y += size * 1.06;
  }
  ctx.fillStyle = '#2c3e57';
  ctx.font = '500 19px Helvetica, sans-serif';
  ctx.fillText(s.sub, 18, y + 26);
  ctx.font = 'bold 11px Helvetica, sans-serif';
  ctx.fillText(s.foot, 18, h - 18);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function fadedPosterTexture() {
  // a poster the sun got to first: layout intact, information gone
  const w = 256, h = 366;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  agedPaper(ctx, w, h, '#efe9d8');
  ctx.fillStyle = 'rgba(110,120,135,0.22)';
  ctx.fillRect(18, 30, 200, 38); ctx.fillRect(18, 76, 160, 38);
  ctx.fillStyle = 'rgba(150,90,80,0.16)'; ctx.fillRect(18, 122, 180, 38);
  ctx.fillStyle = 'rgba(110,120,135,0.13)';
  ctx.fillRect(18, 180, 150, 12);
  ctx.beginPath(); ctx.ellipse(128, 280, 70, 56, 0.2, 0, 7);
  ctx.fillStyle = 'rgba(120,130,140,0.10)'; ctx.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const _posterTex = new Map(), _posterMats = new Map();
function posterTexture(idx) {
  if (_posterTex.has(idx)) return _posterTex.get(idx);
  let tex;
  if (idx < POSTER_FILES.length) {
    tex = fadedPosterTexture();
    _texLoader.load(POSTER_FILES[idx], loaded => {
      loaded.colorSpace = THREE.SRGBColorSpace;
      for (const m of _posterMats.get(idx) || []) { m.map = loaded; m.needsUpdate = true; }
      _posterTex.set(idx, loaded);
    }, undefined, () => {});
  } else {
    tex = sloganPosterTexture(idx - POSTER_FILES.length);
  }
  _posterTex.set(idx, tex);
  return tex;
}
export function poster(idx, tilt = 0) {
  idx = idx % POSTER_COUNT;
  const g = new THREE.Group();
  // slim clip-frame backing
  box(g, lam(0xb9bdbd), 0.58, 0.82, 0.018, 0, 0, 0);
  const m = new THREE.MeshLambertMaterial({ map: posterTexture(idx) });
  if (!_posterMats.has(idx)) _posterMats.set(idx, []);
  _posterMats.get(idx).push(m);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.785), m);
  sheet.position.z = 0.012; g.add(sheet);
  if (tilt) g.rotation.z = tilt;
  return { group: g, collider: null };
}

// child's drawing taped to a wall — crayon scrawl of the hospital
export function drawing(seedNum) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fbf8ef'; ctx.fillRect(0, 0, 256, 256);
  const rng = (n => () => (n = (n * 1664525 + 1013904223) >>> 0) / 4294967296)(seedNum);
  ctx.strokeStyle = '#c44'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  // a box building
  ctx.strokeRect(48 + rng() * 20, 90, 140, 110);
  // many small squares (windows... or doors)
  ctx.strokeStyle = '#368'; ctx.lineWidth = 3;
  const n = 5 + Math.floor(rng() * 9);
  for (let i = 0; i < n; i++) ctx.strokeRect(60 + (i % 4) * 34, 105 + Math.floor(i / 4) * 30, 16, 20);
  // a stick figure, too tall
  ctx.strokeStyle = '#222'; ctx.lineWidth = 3;
  const fx = 200 + rng() * 30;
  ctx.beginPath(); ctx.arc(fx, 60, 9, 0, 7); ctx.moveTo(fx, 69); ctx.lineTo(fx, 190);
  ctx.moveTo(fx - 12, 100); ctx.lineTo(fx + 12, 100); ctx.stroke();
  // sun, scribbled out
  ctx.strokeStyle = '#d90'; ctx.beginPath(); ctx.arc(40, 40, 16, 0, 7); ctx.stroke();
  ctx.strokeStyle = '#222';
  for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(24 + rng() * 32, 24 + rng() * 32); ctx.lineTo(24 + rng() * 32, 24 + rng() * 32); ctx.stroke(); }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshLambertMaterial({ map: tex }));
  return m;
}
