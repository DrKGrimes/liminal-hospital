// world.js — streams the infinite hospital in 12x12-cell chunks (48m).
// Each chunk builds merged wall/floor/ceiling geometry, an InstancedMesh of
// ceiling light panels, prop groups, door entities and pickups.
import * as THREE from 'three';
import {
  CELL, WALL_H, P, cm, cellInfo, walkable, edge, spawnAt, roomStyle,
  rand, hash, RECEPTION, zoneRadius,
} from './gen.js';
import * as PR from './props.js';

export const CHUNK = 12;                      // cells per chunk side (2 blocks)
const WALL_T = 0.2;

// ---------------------------------------------------------------- palette
export const ZONE_COLORS = [0x7fa8b0, 0x4d8a8a, 0xb98f4a, 0x7a5d8a, 0xa85d6a, 0x5d6aa8];
export const zoneColor = z => ZONE_COLORS[z % ZONE_COLORS.length];
export const ZONE_NAMES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const zoneName = z => ZONE_NAMES[z] || (z + 1).toString();

// ---------------------------------------------------------------- textures
function makeWallTexture(stripe) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#eff1f0'; ctx.fillRect(0, 0, 64, 256);
  // skirting
  ctx.fillStyle = '#b9bfc0'; ctx.fillRect(0, 248, 64, 8);
  // bumper stripe at ~1.1m
  const c = new THREE.Color(stripe);
  ctx.fillStyle = '#' + c.getHexString(); ctx.fillRect(0, 162, 64, 13);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function makeFloorTexture() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#dbdfdd'; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(150,160,158,0.5)'; ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 128, 128);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(120,130,128,${0.04 + (i % 5) * 0.012})`;
    ctx.fillRect((i * 37) % 128, (i * 53) % 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const wallMats = new Map();
function wallMat(zone) {
  const c = zoneColor(zone);
  if (!wallMats.has(c)) wallMats.set(c, new THREE.MeshLambertMaterial({ map: makeWallTexture(c) }));
  return wallMats.get(c);
}
let floorMat, ceilMat, outsideMat, plainWallMat, panelGeo, panelMat;
function initShared() {
  if (floorMat) return;
  floorMat = new THREE.MeshLambertMaterial({ map: makeFloorTexture() });
  ceilMat = new THREE.MeshLambertMaterial({ color: 0xc9ced0 });
  outsideMat = new THREE.MeshLambertMaterial({ color: 0xcfd3d1 });
  plainWallMat = new THREE.MeshLambertMaterial({ color: 0xeff1f0 });
  panelGeo = new THREE.PlaneGeometry(1.7, 1.0);
  panelGeo.rotateX(Math.PI / 2); // face down
  panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
}

// ---------------------------------------------------------------- merge util
function mergeGeoms(list) {
  if (!list.length) return null;
  let v = 0, ic = 0;
  for (const g of list) { v += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(v * 3), nor = new Float32Array(v * 3), uv = new Float32Array(v * 2);
  const idx = v > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
function tbox(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}
function tquad(w, d, x, y, z, up = true) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

export const wx = c => c * CELL + CELL / 2;   // cell -> world centre

// ---------------------------------------------------------------- doors
class DoorEntity {
  // kind: 'security' | 'slide'
  constructor(kind, axis, mx, mz, tier, zone) {
    this.kind = kind; this.axis = axis; this.tier = tier;
    this.x = mx; this.z = mz;
    this.t = 0; this.state = 'closed'; // closed|opening|open
    this.warned = false; this.judder = 0;
    this.group = new THREE.Group();
    this.group.position.set(mx, 0, mz);
    if (axis === 'x') this.group.rotation.y = Math.PI / 2; // wall runs along z
    const frameM = new THREE.MeshLambertMaterial({ color: 0x5a6e78 });
    const f1 = new THREE.Mesh(new THREE.BoxGeometry(CELL + 0.2, WALL_H - 2.45, WALL_T), frameM);
    f1.position.y = 2.45 + (WALL_H - 2.45) / 2; this.group.add(f1);
    const jw = 0.25;
    const j1 = new THREE.Mesh(new THREE.BoxGeometry(jw, 2.45, WALL_T), frameM);
    j1.position.set(-(CELL / 2) + jw / 2, 1.225, 0); this.group.add(j1);
    const j2 = j1.clone(); j2.position.x = CELL / 2 - jw / 2; this.group.add(j2);
    const pw = (CELL - jw * 2) / 2;
    this.pw = pw;
    const glass = PR.MAT.glassDoor();
    this.p1 = new THREE.Mesh(new THREE.BoxGeometry(pw, 2.4, 0.06), glass);
    this.p1.position.set(-pw / 2, 1.2, 0); this.group.add(this.p1);
    this.p2 = new THREE.Mesh(new THREE.BoxGeometry(pw, 2.4, 0.06), glass);
    this.p2.position.set(pw / 2, 1.2, 0); this.group.add(this.p2);
    // handle bars
    const barM = new THREE.MeshLambertMaterial({ color: 0x8a949a });
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.07, 0.09), barM);
    b1.position.y = 1.05; this.p1.add(b1); this.p2.add(b1.clone());
    if (kind === 'security') {
      // card reader with status lamp
      const rd = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.06), new THREE.MeshLambertMaterial({ color: 0x3a4448 }));
      rd.position.set(CELL / 2 - 0.05, 1.25, WALL_T / 2 + 0.05); this.group.add(rd);
      this.lampM = new THREE.MeshBasicMaterial({ color: 0xc23b3b });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), this.lampM);
      lamp.position.set(CELL / 2 - 0.05, 1.31, WALL_T / 2 + 0.085); this.group.add(lamp);
      const s = PR.sign('WARD ' + zoneName(tier) + ' — AUTHORISED ONLY', 1.7, { bg: '#46555c', size: 40 });
      s.position.set(0, 2.72, WALL_T / 2 + 0.02); this.group.add(s);
      const s2 = s.clone(); s2.rotation.y = Math.PI; s2.position.z = -WALL_T / 2 - 0.02; this.group.add(s2);
    }
  }
  get solid() { return this.t < 0.55; }
  update(dt, pdist, hasCard, ev) {
    if (this.kind === 'security') {
      if (this.state === 'closed' && pdist < 3.4) {
        if (hasCard(this.tier)) {
          this.state = 'opening';
          this.lampM.color.setHex(0x3bc26a);
          ev.doorOpen && ev.doorOpen(this);
        } else if (!this.warned) {
          this.warned = true;
          ev.doorLocked && ev.doorLocked(this);
        }
      }
      if (pdist > 6) this.warned = false;
      if (this.state === 'opening') {
        this.t = Math.min(1, this.t + dt * 1.4);
        if (this.t === 1) this.state = 'open';
      } else if (this.state === 'open' && pdist > 7) {
        this.t = Math.max(0, this.t - dt * 1.2);
        if (this.t === 0) { this.state = 'closed'; this.lampM.color.setHex(0xc23b3b); }
      }
    } else { // faulty entrance slider
      if (this.state === 'closed' && pdist < 3.2) {
        this.state = 'opening';
        ev.slideStart && ev.slideStart(this);
      }
      if (this.state === 'opening') {
        // judders: advances, stalls, slips back
        this.judder += dt;
        const stall = Math.sin(this.judder * 7.3) > 0.55 ? 0 : 1;
        const slip = Math.sin(this.judder * 2.9) > 0.93 ? -0.5 : 1;
        this.t = Math.max(0, Math.min(0.78, this.t + dt * 0.9 * stall * slip));
        if (this.judder > 4.5) this.state = 'open';
        ev.slideTick && ev.slideTick(this, stall);
      } else if (this.state === 'open' && pdist > 8) {
        this.t = Math.max(0.0, this.t - dt * 0.5);
        if (this.t <= 0.02) { this.state = 'closed'; this.judder = 0; }
      }
    }
    const o = this.t * (this.pw * 0.92);
    const jit = (this.kind === 'slide' && this.state === 'opening') ? Math.sin(this.judder * 31) * 0.012 : 0;
    this.p1.position.x = -this.pw / 2 - o + jit;
    this.p2.position.x = this.pw / 2 + o - jit;
  }
}

// ---------------------------------------------------------------- signage
const SIGNS_NORMAL = ['WARD A →', '← RADIOLOGY', 'OUTPATIENTS →', '← PHARMACY', 'X-RAY →', 'QUIET PLEASE', '← LIFTS', 'CHAPEL →', '← THEATRE 2', 'PAEDIATRICS →'];
const SIGNS_ODD = ['WARD A →', '← WARD A', 'WARD A →', 'NO RECEPTION', '← MEMORY CLINIC', 'THE SEA →', 'ROOM 0 →', '← YESTERDAY', 'VISITING HOURS: NEVER', 'DEEPER →'];
const SIGNS_DEEP = ['YOU ARE HERE', '← YOU WERE HERE', 'IT IS STILL 3:33', 'THE PATTERN →', '← BENEATH', 'DO NOT COUNT THE DOORS', 'WAKE ROOM →', '← THRESHOLD', '→ → →'];

// Departmental signs; sometimes the hospital forgets which country it is in.
const SPECIALISMS = [
  { en: 'CARDIOLOGY', hu: 'KARDIOLÓGIA', ar: 'أمراض القلب', ko: '심장내과' },
  { en: 'RADIOLOGY', hu: 'RADIOLÓGIA', ar: 'قسم الأشعة', ko: '영상의학과' },
  { en: 'ONCOLOGY', hu: 'ONKOLÓGIA', ar: 'علم الأورام', ko: '종양내과' },
  { en: 'NEUROLOGY', hu: 'NEUROLÓGIA', ar: 'طب الأعصاب', ko: '신경과' },
  { en: 'HAEMATOLOGY', hu: 'HEMATOLÓGIA', ar: 'أمراض الدم', ko: '혈액내과' },
  { en: 'GENERAL SURGERY', hu: 'SEBÉSZET', ar: 'الجراحة العامة', ko: '외과' },
  { en: 'GERIATRICS', hu: 'GERIÁTRIA', ar: 'طب المسنين', ko: '노인의학과' },
  { en: 'OBSTETRICS', hu: 'SZÜLÉSZET', ar: 'قسم التوليد', ko: '산부인과' },
  { en: 'PATHOLOGY', hu: 'PATOLÓGIA', ar: 'علم الأمراض', ko: '병리과' },
  { en: 'ENDOSCOPY', hu: 'ENDOSZKÓPIA', ar: 'التنظير الداخلي', ko: '내시경실' },
  { en: 'NEPHROLOGY', hu: 'NEFROLÓGIA', ar: 'أمراض الكلى', ko: '신장내과' },
  { en: 'AUDIOLOGY', hu: 'AUDIOLÓGIA', ar: 'علم السمع', ko: '청각클리닉' },
];
const SIGN_LANGS = ['hu', 'ar', 'ko'];
function specialismSign(x, z, zone) {
  const sp = SPECIALISMS[hash('spec', x, z) % SPECIALISMS.length];
  const pForeign = Math.min(0.45, 0.12 + zone * 0.06);
  const lang = rand('slang', x, z) < pForeign
    ? SIGN_LANGS[hash('slangi', x, z) % SIGN_LANGS.length] : 'en';
  const name = sp[lang];
  const arr = hash('sarr', x, z) % 3;
  return arr === 0 ? name + ' →' : arr === 1 ? '← ' + name : name;
}
function signText(x, z, zone) {
  const r = rand('signt', x, z);
  const pDeep = zone >= 1 ? 0.08 + zone * 0.07 : 0;
  const pOdd = zone === 0 ? 0.15 : 0.32;
  let list = SIGNS_NORMAL;
  if (r < pDeep) list = SIGNS_DEEP;
  else if (r < pDeep + pOdd) list = SIGNS_ODD;
  // departments make up the bulk of ordinary wayfinding
  if (list === SIGNS_NORMAL && rand('specp', x, z) < 0.65) return specialismSign(x, z, zone);
  return list[hash('signi', x, z) % list.length];
}

// ---------------------------------------------------------------- chunk
class Chunk {
  constructor(world, ccx, ccz) {
    this.world = world; this.ccx = ccx; this.ccz = ccz;
    this.group = new THREE.Group();
    this.colliders = [];   // {x0,z0,x1,z1} world metres
    this.doors = [];       // DoorEntity
    this.pickups = [];     // {id,type,tier,relic,mesh,x,z,baseY}
    this.panels = [];      // {x,z} world metres, index into instanced mesh
    this.panelMesh = null;
    this.build();
  }

  addProp(p, mx, mz, ry = 0) {
    p.group.position.set(mx, 0, mz);
    if (ry) p.group.rotation.y = ry;
    this.group.add(p.group);
    if (p.collider) {
      // conservative AABB for rotated colliders
      const r = Math.abs(Math.sin(ry)) > 0.3 && Math.abs(Math.cos(ry)) > 0.3
        ? Math.max(p.collider.hx, p.collider.hz)
        : null;
      const hx = r || (Math.abs(Math.cos(ry)) > 0.7 ? p.collider.hx : p.collider.hz);
      const hz = r || (Math.abs(Math.cos(ry)) > 0.7 ? p.collider.hz : p.collider.hx);
      this.colliders.push({ x0: mx - hx, z0: mz - hz, x1: mx + hx, z1: mz + hz });
    }
    return p.group;
  }

  addPickup(type, data, mx, mz) {
    const id = `p${Math.round(mx)}_${Math.round(mz)}`;
    if (this.world.collected.has(id)) return;
    const ped = PR.pedestal();
    this.addProp(ped, mx, mz);
    let p, baseY = 1.06;
    if (type === 'card') {
      p = PR.keycard(zoneColor(data.tier));
    } else {
      p = PR.relic(data.relic);
      baseY = 1.18;
    }
    p.group.position.set(mx, baseY, mz);
    this.group.add(p.group);
    this.pickups.push({ id, type, ...data, mesh: p.group, x: mx, z: mz, baseY });
  }

  build() {
    initShared();
    const walls = {};   // zone -> geoms
    const plains = [];  // headers/jambs without the stripe texture
    const floors = [], ceils = [], outs = [];
    const panelPts = [];
    const x0 = this.ccx * CHUNK, z0 = this.ccz * CHUNK;
    const dressedRooms = new Set();

    for (let x = x0; x < x0 + CHUNK; x++) for (let z = z0; z < z0 + CHUNK; z++) {
      const info = cellInfo(x, z);
      if (!walkable(info)) continue;
      const mx = wx(x), mz = wx(z);

      // floor + ceiling
      if (info.kind === 'outside') {
        outs.push(tquad(CELL, CELL, mx, 0, mz));
      } else {
        floors.push(tquad(CELL, CELL, mx, 0, mz));
        ceils.push(tquad(CELL, CELL, mx, WALL_H, mz, false));
      }

      // light panels
      let panel = false;
      if (info.kind === 'corridor') panel = ((x + z) % 2 === 0);
      else if (info.kind === 'room') panel = (x === Math.floor((info.rx0 + info.rx1) / 2) && z === Math.floor((info.rz0 + info.rz1) / 2));
      else if (info.kind === 'bay') panel = (cm(x) === 2 || cm(x) === 4) && cm(z) === 3;
      else if (info.kind === 'reception') panel = (x % 2 === 0) && (z % 2 === 1);
      if (panel) panelPts.push([mx, mz, info.kind === 'corridor' && info.onX && !info.onZ ? 0 : Math.PI / 2]);

      // walls / doors on the 4 edges (ownership rules avoid duplicates)
      const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      for (const [dx, dz] of dirs) {
        const nx = x + dx, nz = z + dz;
        const nInfo = cellInfo(nx, nz);
        const nWalk = walkable(nInfo);
        const owner = !nWalk || dx > 0 || dz > 0;
        if (!owner) continue;
        const et = edge(x, z, nx, nz);
        if (et.type === 'open' || et.type === 'none') continue;
        const ex = mx + dx * CELL / 2, ez = mz + dz * CELL / 2; // edge centre
        const alongX = dz !== 0; // wall runs along x axis
        const zone = Math.max(info.zone, nInfo.zone || 0);
        const wgeo = (w, h, yc, off = 0) => alongX
          ? tbox(w, h, WALL_T, ex + off, yc, ez)
          : tbox(WALL_T, h, w, ex, yc, ez + off);
        const push = g => { (walls[zone] = walls[zone] || []).push(g); };

        if (et.type === 'wall' || et.type === 'glass') {
          if (et.type === 'glass') {
            const pane = new THREE.Mesh(new THREE.BoxGeometry(alongX ? CELL : 0.08, WALL_H - 0.3, alongX ? 0.08 : CELL), PR.MAT.glassDoor());
            pane.position.set(ex, (WALL_H - 0.3) / 2, ez);
            this.group.add(pane);
            plains.push(wgeo(CELL + WALL_T, 0.3, WALL_H - 0.15));
          } else {
            push(wgeo(CELL + WALL_T, WALL_H, WALL_H / 2));
          }
        } else if (et.type === 'door') {
          // swing-door opening: jambs + header + ajar panel
          const dw = 1.1, side = (CELL - dw) / 2;
          push(wgeo(side + WALL_T / 2, WALL_H, WALL_H / 2, -(CELL / 2) + side / 2 - WALL_T / 4));
          push(wgeo(side + WALL_T / 2, WALL_H, WALL_H / 2, (CELL / 2) - side / 2 + WALL_T / 4));
          plains.push(wgeo(dw, WALL_H - 2.1, 2.1 + (WALL_H - 2.1) / 2));
          const ang = rand('ajar', x * 3 + dx, z * 3 + dz);
          if (ang > 0.25) { // most doors hang open at some angle
            const panelM = new THREE.Mesh(new THREE.BoxGeometry(1.02, 2.04, 0.05), new THREE.MeshLambertMaterial({ color: 0xdfe3df }));
            panelM.position.set(0.51, 0, 0);
            const hinge = new THREE.Group();
            hinge.add(panelM);
            hinge.position.set(
              alongX ? ex - dw / 2 : ex,
              1.06,
              alongX ? ez : ez - dw / 2
            );
            hinge.rotation.y = (alongX ? 0 : Math.PI / 2) + 0.25 + ang * 1.6;
            this.group.add(hinge);
          }
        } else if (et.type === 'security' || et.type === 'slide') {
          const d = new DoorEntity(et.type, alongX ? 'z' : 'x', ex, ez, et.tier || 0, et.tier || 0);
          // note: axis param means orientation of wall; alongX wall => panels slide along x
          if (alongX) d.group.rotation.y = 0; else d.group.rotation.y = Math.PI / 2;
          this.group.add(d.group);
          this.doors.push(d);
          this.world.doorMap.set(edgeKey(x, z, nx, nz), d);
        }

        // wall-mounted dressing (signs, drawings, clocks) on corridor-facing walls
        if (et.type === 'wall' && info.kind === 'corridor' && !nWalk) {
          const r = rand('wdress', x * 4 + dx, z * 4 + dz);
          const fy = alongX ? (dz > 0 ? Math.PI : 0) : (dx > 0 ? -Math.PI / 2 : Math.PI / 2);
          const ix = mx + dx * (CELL / 2 - WALL_T / 2 - 0.02);
          const iz = mz + dz * (CELL / 2 - WALL_T / 2 - 0.02);
          if (r < 0.045) {
            const s = PR.sign(signText(x, z, info.zone), 1.5, { bg: '#46555c', size: 44 });
            s.position.set(ix, 1.95, iz); s.rotation.y = fy; this.group.add(s);
          } else if (r < 0.06) {
            const c = PR.clock(); c.group.position.set(ix, 2.2, iz); c.group.rotation.y = fy; this.group.add(c.group);
          } else if (r < 0.072 && info.zone >= 1) {
            const dgm = PR.drawing(hash('draw', x, z));
            dgm.position.set(ix, 1.5, iz); dgm.rotation.y = fy; this.group.add(dgm);
          } else if (r < 0.082) {
            // a member of the board, watching the corridor
            const idx = hash('portr', x, z) % PR.PORTRAITS.length;
            const p = PR.portrait(idx);
            p.group.position.set(ix, 1.72, iz); p.group.rotation.y = fy;
            this.group.add(p.group);
            // deep in, the same member sometimes hangs twice, side by side
            if (info.zone >= 3 && rand('portr2', x, z) < 0.35) {
              const p2 = PR.portrait(idx);
              const ox = alongX ? 0.78 : 0, oz = alongX ? 0 : 0.78;
              p2.group.position.set(ix + ox, 1.72, iz + oz); p2.group.rotation.y = fy;
              this.group.add(p2.group);
            }
          } else if (r < 0.096) {
            // patient information; advice quality degrades with depth
            const pReal = Math.max(0.2, 0.85 - info.zone * 0.16);
            const idx = rand('postt', x, z) < pReal
              ? hash('posti', x, z) % PR.POSTER_REAL_COUNT
              : PR.POSTER_REAL_COUNT + hash('posti', x, z) % (PR.POSTER_COUNT - PR.POSTER_REAL_COUNT);
            const tilt = (rand('postl', x, z) - 0.5) * 0.07;
            // deep in, the same poster repeats along the wall, insistently
            const n = (info.zone >= 2 && rand('postr', x, z) < 0.25) ? 3 : 1;
            for (let k = 0; k < n; k++) {
              const p = PR.poster(idx, n === 1 ? tilt : (k === 1 ? 0 : tilt));
              const off = (k - (n - 1) / 2) * 0.8;
              p.group.position.set(ix + (alongX ? off : 0), 1.62, iz + (alongX ? 0 : off));
              p.group.rotation.y = fy;
              this.group.add(p.group);
            }
          }
        }
      }

      // ---- per-cell props
      if (info.kind === 'corridor') this.dressCorridor(x, z, info, mx, mz);
      else if (info.kind === 'room' && x === info.rx0 && z === info.rz0 && !dressedRooms.has(info.key)) {
        dressedRooms.add(info.key);
        this.dressRoom(info);
      } else if (info.kind === 'bay' && cm(x) === 1 && cm(z) === 1) {
        this.dressBay(info, x, z);
      }

      // ---- pickups
      const sp = spawnAt(x, z, info);
      if (sp) this.addPickup(sp.type, sp, mx, mz);
    }

    // reception is hand-dressed once, by the chunk containing its anchor
    if (x0 <= 0 && 0 < x0 + CHUNK && z0 <= 2 && 2 < z0 + CHUNK) this.dressReception();

    // merged meshes
    for (const [zone, geoms] of Object.entries(walls)) {
      const m = new THREE.Mesh(mergeGeoms(geoms), wallMat(+zone));
      this.group.add(m);
    }
    const pl = mergeGeoms(plains); if (pl) this.group.add(new THREE.Mesh(pl, plainWallMat));
    const fl = mergeGeoms(floors); if (fl) this.group.add(new THREE.Mesh(fl, floorMat));
    const ce = mergeGeoms(ceils); if (ce) this.group.add(new THREE.Mesh(ce, ceilMat));
    const ou = mergeGeoms(outs); if (ou) this.group.add(new THREE.Mesh(ou, outsideMat));

    // light panels
    if (panelPts.length) {
      const im = new THREE.InstancedMesh(panelGeo, panelMat, panelPts.length);
      const m4 = new THREE.Matrix4();
      const warm = new THREE.Color(0xf6f7ef);
      for (let i = 0; i < panelPts.length; i++) {
        const [px, pz, ry] = panelPts[i];
        m4.makeRotationY(ry);
        m4.setPosition(px, WALL_H - 0.05, pz);
        im.setMatrixAt(i, m4);
        im.setColorAt(i, warm);
        this.panels.push({ x: px, z: pz, i, mesh: im });
      }
      im.instanceColor.needsUpdate = true;
      this.group.add(im);
      this.panelMesh = im;
    }
  }

  // -------------------------------------------------------------- dressing
  dressCorridor(x, z, info, mx, mz) {
    // very occasionally, a mannequin — facing the wall, or facing you
    if (rand('mann', x, z) < (info.zone === 0 ? 0.002 : 0.005)) {
      const alongZ = info.onX && !info.onZ;
      const v = hash('mannv', x, z) % 3;
      if (v === 0) {
        // dead centre of the corridor, facing along it
        this.addProp(PR.mannequin(0, rand('mt', x, z) - 0.5), wx(x), wx(z), alongZ ? (hash('mf', x, z) % 2 ? 0 : Math.PI) : Math.PI / 2);
      } else {
        // an inch from the wall, facing it
        const side = hash('ms', x, z) % 2 ? 1 : -1;
        const ox = alongZ ? side * 1.45 : (rand('mo', x, z) - 0.5) * 2;
        const oz = alongZ ? (rand('mo', x, z) - 0.5) * 2 : side * 1.45;
        this.addProp(PR.mannequin(0, rand('mt', x, z) - 0.5), wx(x) + ox, wx(z) + oz,
          alongZ ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI));
      }
      return;
    }
    const r = rand('cdress', x, z);
    if (r > 0.045) return;
    const pick = hash('cpick', x, z) % 8;
    const alongZ = info.onX && !info.onZ;       // corridor runs along z
    const dir = alongZ ? 0 : Math.PI / 2;
    const off = (rand('coff', x, z) - 0.5) * 1.6;
    switch (pick) {
      case 0: this.addProp(PR.gurney(), mx, mz, dir + (rand('cr', x, z) - 0.5) * 0.4); break;
      case 1: this.addProp(PR.wheelchair(), mx + (alongZ ? 1.3 : off), mz + (alongZ ? off : 1.3), rand('cr', x, z) * 6.28); break;
      case 2: this.addProp(PR.ivStand(), mx + (alongZ ? 1.4 : off), mz + (alongZ ? off : 1.4)); break;
      case 3: this.addProp(PR.plant(), mx + (alongZ ? 1.45 : off), mz + (alongZ ? off : 1.45)); break;
      case 4: { // a single chair facing the wall
        const fx = mx + (alongZ ? 1.35 : off), fz = mz + (alongZ ? off : 1.35);
        this.addProp(PR.chair(alongZ ? Math.PI / 2 : Math.PI), fx, fz);
        break;
      }
      case 5: this.addProp(PR.papers(4 + hash('pn', x, z) % 5), mx, mz); break;
      case 6: this.addProp(PR.shoe(), mx + off, mz + off); break;
      case 7: if (info.zone >= 1) this.addProp(PR.cabinet(), mx + (alongZ ? 1.4 : off), mz + (alongZ ? off : 1.4)); break;
    }
  }

  dressRoom(info) {
    const x0 = info.rx0 * CELL, x1 = info.rx1 * CELL + CELL;
    const z0 = info.rz0 * CELL, z1 = info.rz1 * CELL + CELL;
    const cx = (x0 + x1) / 2, czc = (z0 + z1) / 2;
    const w = x1 - x0, d = z1 - z0;
    const st = roomStyle(info);
    const rr = (...a) => rand('dress', info.rx0, info.rz0, ...a);
    const hh = (...a) => hash('dress', info.rx0, info.rz0, ...a);

    if (st.anomaly) { this.dressAnomaly(st.anomaly, info, x0, z0, x1, z1); return; }
    switch (st.style) {
      case 'ward': {
        const n = Math.max(2, Math.floor(w / 2.4));
        for (let i = 0; i < n; i++) {
          const bx = x0 + 1.4 + i * ((w - 2.8) / Math.max(1, n - 1) || 0);
          if (rr('skip', i) < 0.25) continue;       // a missing bed
          this.addProp(PR.bed(rr('rump', i) < 0.5), bx, z0 + 1.5);
          if (i < n - 1) this.addProp(PR.curtainRail(2), bx + ((w - 2.8) / Math.max(1, n - 1)) / 2, z0 + 1.5, Math.PI / 2);
          if (rr('iv', i) < 0.3) this.addProp(PR.ivStand(), bx + 0.7, z0 + 0.7);
        }
        if (rr('ch') < 0.6) this.addProp(PR.chair(rr('cha') * 6.28), cx + (rr('chx') - 0.5) * (w - 2), z1 - 1.2);
        break;
      }
      case 'exam':
        this.addProp(PR.bed(rr('r') < 0.4), cx, czc, hh('br') % 2 ? Math.PI / 2 : 0);
        this.addProp(PR.ivStand(), x0 + 0.7, z0 + 0.7);
        this.addProp(PR.cabinet(), x1 - 0.6, z0 + 0.6);
        if (rr('cu') < 0.5) this.addProp(PR.curtainRail(2.4), cx, czc + 1.3);
        break;
      case 'office': {
        const ry = (hh('or') % 4) * Math.PI / 2;
        this.addProp(PR.desk(), cx, czc, ry);
        const back = rr('push') * 0.8;             // chair pushed back, mid-task
        this.addProp(PR.chair(ry + Math.PI + (rr('ca') - 0.5)), cx - Math.sin(ry) * (0.9 + back), czc - Math.cos(ry) * (0.9 + back));
        this.addProp(PR.shelves(), x0 + 0.7, z1 - 0.35, 0);
        if (rr('pp') < 0.6) this.addProp(PR.papers(3 + hh('pn') % 6), cx + 1, czc + 1);
        break;
      }
      case 'storage':
        this.addProp(PR.shelves(), cx, z0 + 0.35);
        if (d > 3) this.addProp(PR.shelves(), cx, z1 - 0.35, Math.PI);
        if (rr('gu') < 0.4) this.addProp(PR.gurney(), cx, czc, 0.3);
        break;
      case 'waiting': {
        const n = Math.floor(w / 0.85) - 1;
        for (let i = 0; i < n; i++) {
          if (rr('skip', i) < 0.15) continue;
          this.addProp(PR.chair(0), x0 + 0.9 + i * 0.85, z0 + 0.8);
        }
        this.addProp(PR.plant(), x1 - 0.7, z1 - 0.7);
        if (rr('tv') < 0.5) {
          const t = PR.tv(rr('tvon') < 0.3);
          t.group.position.set(cx, 2.0, z1 - 0.15); t.group.rotation.y = Math.PI;
          this.group.add(t.group);
        }
        break;
      }
      case 'vacated': default:
        // recently left: rumpled bed, knocked chair, scattered papers, a cup
        this.addProp(PR.bed(true), x0 + 1.2, czc);
        { const ch = this.addProp(PR.chair(rr('ca') * 6.28), cx + 0.5, czc + 0.6);
          if (rr('kn') < 0.45) { ch.rotation.z = Math.PI / 2; ch.position.y = 0.25; } }
        this.addProp(PR.papers(5 + hh('pn') % 7, 2), cx, czc);
        if (rr('iv') < 0.5) this.addProp(PR.ivStand(), x0 + 0.8, z0 + 0.8);
        break;
    }
  }

  dressAnomaly(kind, info, x0, z0, x1, z1) {
    const cx = (x0 + x1) / 2, czc = (z0 + z1) / 2;
    const w = x1 - x0, d = z1 - z0;
    const hh = (...a) => hash('anomd', info.rx0, info.rz0, ...a);
    switch (kind) {
      case 'chairCircle': {
        const n = 7 + hh('n') % 5, rad = Math.min(w, d) / 2 - 1.1;
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2;
          this.addProp(PR.chair(a + Math.PI), cx + Math.sin(a) * rad, czc + Math.cos(a) * rad);
        }
        break;
      }
      case 'clockWall': {
        const n = Math.floor(w / 0.6) * 3;
        for (let i = 0; i < n; i++) {
          const c = PR.clock();
          c.group.position.set(x0 + 0.5 + (i % Math.floor(w / 0.6)) * 0.6, 1.2 + Math.floor(i / Math.floor(w / 0.6)) * 0.62, z0 + 0.13);
          this.group.add(c.group);
        }
        break;
      }
      case 'plantRoom': {
        for (let px = x0 + 0.8; px < x1 - 0.5; px += 1.1)
          for (let pz = z0 + 0.8; pz < z1 - 0.5; pz += 1.1)
            this.addProp(PR.plant(), px, pz);
        break;
      }
      case 'bedAudience': {
        this.addProp(PR.bed(true), cx, z0 + 1.4);
        const rows = Math.floor((d - 3) / 1.0);
        for (let rI = 0; rI < rows; rI++)
          for (let px = x0 + 1; px < x1 - 0.7; px += 0.9)
            this.addProp(PR.chair(Math.PI), px, z0 + 3 + rI * 1.0);
        break;
      }
      case 'paperRoom': {
        for (let i = 0; i < 14; i++)
          this.addProp(PR.papers(8, 2.5), x0 + 1 + (hh('px', i) % 100) / 100 * (w - 2), z0 + 1 + (hh('pz', i) % 100) / 100 * (d - 2));
        this.addProp(PR.desk(), cx, czc, hh('dr') % 4 * Math.PI / 2);
        break;
      }
      case 'mannequins': {
        // a room full of them, all facing the same way (mostly)
        const baseF = (hh('mf') % 4) * Math.PI / 2;
        let count = 0;
        for (let px = x0 + 1.1; px < x1 - 0.8 && count < 26; px += 1.55) {
          for (let pz = z0 + 1.1; pz < z1 - 0.8 && count < 26; pz += 1.55) {
            if (hash('mskip', Math.round(px * 3), Math.round(pz * 3)) % 7 === 0) continue;
            const jx = (rand('mjx', Math.round(px * 3), Math.round(pz * 3)) - 0.5) * 0.5;
            const jz = (rand('mjz', Math.round(px * 3), Math.round(pz * 3)) - 0.5) * 0.5;
            // one in eight has turned to face somewhere else
            const dev = hash('mdev', Math.round(px * 3), Math.round(pz * 3)) % 8 === 0
              ? rand('mdf', Math.round(px * 3), Math.round(pz * 3)) * Math.PI * 2 : 0;
            this.addProp(PR.mannequin(0, rand('mtl', Math.round(px * 3), Math.round(pz * 3)) - 0.5),
              px + jx, pz + jz, dev || baseF);
            count++;
          }
        }
        break;
      }
      case 'mannequinCircle': {
        // gathered in a ring around a bed — or a fallen plant
        const aroundBed = hh('mwhat') % 2 === 0;
        if (aroundBed) this.addProp(PR.bed(true), cx, czc, (hh('mbr') % 2) * Math.PI / 2);
        else {
          const p = PR.plant();
          p.group.position.set(cx, 0.18, czc);
          p.group.rotation.z = Math.PI / 2;
          p.group.rotation.y = hh('mpr') % 6;
          this.group.add(p.group);
        }
        const n = 7 + hh('mn') % 4;
        const rad = Math.min(w, d) / 2 - 1.2;
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2 + (hh('moff') % 10) / 10;
          this.addProp(PR.mannequin(0, rand('mct', i, hh('m')) - 0.5),
            cx + Math.sin(a) * rad, czc + Math.cos(a) * rad, a + Math.PI);
        }
        break;
      }
      case 'boardRoom': {
        // a long table, eight chairs, eight portraits, and the minutes of a
        // meeting that never ended
        const ry = hh('br') % 2 ? Math.PI / 2 : 0;
        const table = new THREE.Group();
        const tm = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.07, 1.6), new THREE.MeshLambertMaterial({ color: 0x8a705a }));
        tm.position.y = 0.76; table.add(tm);
        for (const [lx, lz] of [[-2.3, -0.6], [2.3, -0.6], [-2.3, 0.6], [2.3, 0.6]]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.76, 0.09), new THREE.MeshLambertMaterial({ color: 0x5e4c3c }));
          leg.position.set(lx, 0.38, lz); table.add(leg);
        }
        table.position.set(cx, 0, czc); table.rotation.y = ry;
        this.group.add(table);
        this.colliders.push(ry === 0
          ? { x0: cx - 2.7, z0: czc - 0.9, x1: cx + 2.7, z1: czc + 0.9 }
          : { x0: cx - 0.9, z0: czc - 2.7, x1: cx + 0.9, z1: czc + 2.7 });
        // eight chairs; one pushed right back, as if someone just left
        const gone = hh('gone') % 8;
        for (let i = 0; i < 8; i++) {
          let lx, lz, f;
          if (i < 3) { lx = -1.7 + i * 1.7; lz = -1.25; f = 0; }
          else if (i < 6) { lx = -1.7 + (i - 3) * 1.7; lz = 1.25; f = Math.PI; }
          else { lx = i === 6 ? -3.1 : 3.1; lz = 0; f = i === 6 ? Math.PI / 2 : -Math.PI / 2; }
          if (i === gone) { lx *= 1.45; lz *= 1.45; f += 0.5; }
          const wxp = ry === 0 ? cx + lx : cx + lz, wzp = ry === 0 ? czc + lz : czc + lx;
          this.addProp(PR.chair(ry === 0 ? f : f + Math.PI / 2), wxp, wzp);
        }
        // the minutes, distributed and abandoned
        this.addProp(PR.papers(9, 3.2), cx, czc);
        // the full board, watching from every wall
        for (let i = 0; i < 8; i++) {
          const p = PR.portrait(i);
          const t = (i % 4 + 0.5) / 4;
          let px, pz, rot;
          if (i < 4) { px = x0 + t * w; pz = z0 + 0.13; rot = 0; }
          else { px = x0 + t * w; pz = z1 - 0.13; rot = Math.PI; }
          p.group.position.set(px, 1.78, pz); p.group.rotation.y = rot;
          this.group.add(p.group);
        }
        const bs = PR.sign('BOARD OF GOVERNORS', 2.2, { bg: '#3d4a52', size: 46 });
        bs.position.set(cx, 2.65, z0 + 0.13); this.group.add(bs);
        const ck = PR.clock(); ck.group.position.set(cx, 2.6, z1 - 0.13); ck.group.rotation.y = Math.PI; this.group.add(ck.group);
        break;
      }
      case 'emptyHum': default: {
        // perfectly empty but for one small thing in the centre
        const r = hh('what') % 3;
        if (r === 0) this.addProp(PR.shoe(), cx, czc);
        else if (r === 1) this.addProp(PR.chair(Math.PI), x0 + 0.6, czc); // facing the wall, an inch from it
        else { const c = PR.clock(); c.group.position.set(cx, 0.25, czc); c.group.rotation.x = -Math.PI / 2; this.group.add(c.group); }
        break;
      }
    }
  }

  dressBay(info, ax, az) {
    // 5x5 open waiting bay: rows of chairs, sometimes all facing a blank wall
    const bx0 = ax * CELL, bz0 = az * CELL;
    const hh = (...a) => hash('bay', info.bx, info.bz, ...a);
    const rr = (...a) => rand('bay', info.bx, info.bz, ...a);
    const facingWall = rr('fw') < 0.3;
    const facing = facingWall ? (hh('fd') % 4) * Math.PI / 2 : (hh('fd') % 2) * Math.PI;
    const rows = 2 + hh('rows') % 3;
    for (let rI = 0; rI < rows; rI++) {
      for (let i = 0; i < 8; i++) {
        if (rr('skip', rI, i) < 0.2) continue;
        const px = bx0 + 2.5 + i * 1.9, pz = bz0 + 3.5 + rI * 3.4;
        // very occasionally a mannequin stands in the row, facing as the chairs face
        if (rr('mann', rI, i) < 0.015) this.addProp(PR.mannequin(0, rr('mt', rI, i) - 0.5), px, pz, facing);
        else this.addProp(PR.chair(facing), px, pz);
      }
    }
    if (rr('vend') < 0.55) {
      const v = PR.vending();
      this.addProp(v, bx0 + 1.0, bz0 + 1.0, Math.PI / 4);
    }
    this.addProp(PR.plant(), bx0 + CELL * 5 - 1, bz0 + 1);
    if (rr('p2') < 0.5) this.addProp(PR.plant(), bx0 + 1, bz0 + CELL * 5 - 1);
  }

  dressReception() {
    const R = RECEPTION.room;
    const cx = wx(0);                              // x centre of door axis
    const zN = R.z0 * CELL, zS = R.z1 * CELL + CELL;
    // desk facing the entrance
    this.addProp(PR.receptionDesk(), cx, zN + 3.2, Math.PI);
    const s = PR.sign('RECEPTION', 3.2, { bg: '#3d565e', size: 64 });
    s.position.set(cx, 2.5, zN + 0.35); s.rotation.y = 0; this.group.add(s);
    const c = PR.clock(); c.group.position.set(cx - 8.2, 2.35, zN + 0.14); this.group.add(c.group);
    const c2 = PR.clock(); c2.group.position.set(cx + 8.2, 2.35, zN + 0.14); this.group.add(c2.group);
    // the chair of the trust and the matron flank the desk, oversee arrivals
    const pb1 = PR.portrait(4);
    pb1.group.position.set(cx - 6.6, 1.85, zN + 0.16); this.group.add(pb1.group);
    const pb2 = PR.portrait(0);
    pb2.group.position.set(cx + 6.6, 1.85, zN + 0.16); this.group.add(pb2.group);
    // waiting chairs, west side, all facing the desk-ish
    for (let rI = 0; rI < 3; rI++) for (let i = 0; i < 6; i++) {
      if (rand('rcskip', rI, i) < 0.18) continue;
      this.addProp(PR.chair(0), wx(-3) + 0.4 + i * 0.9, zN + 7 + rI * 1.6);
    }
    // east side: vending, plants, more chairs facing a wall
    const v = PR.vending(); this.addProp(v, wx(3) + 1.2, zN + 6, -Math.PI / 2);
    this.addProp(PR.plant(), wx(3) + 1.3, zN + 2.5);
    this.addProp(PR.plant(), wx(-3) - 1.0, zN + 2.5);
    this.addProp(PR.wheelchair(), wx(2) + 1.5, zS - 2.2, Math.PI * 0.9);
    this.addProp(PR.papers(5), cx + 1.5, zN + 4.6);
    // patient information by the waiting chairs
    const po1 = PR.poster(3, 0.02);   // KEEP IT TO YOURSELF — ask at reception for tissues
    po1.group.position.set(wx(-3) - 1.86, 1.62, zN + 4.5); po1.group.rotation.y = Math.PI / 2;
    this.group.add(po1.group);
    const po2 = PR.poster(0, -0.015); // WASH BEFORE THE WARD
    po2.group.position.set(wx(-3) - 1.86, 1.62, zN + 6.6); po2.group.rotation.y = Math.PI / 2;
    this.group.add(po2.group);
    // mat by the door
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), new THREE.MeshLambertMaterial({ color: 0x8e9694 }));
    mat.rotation.x = -Math.PI / 2; mat.position.set(cx, 0.012, zS - 1.2);
    this.group.add(mat);
    const mat2 = mat.clone(); mat2.position.set(cx, 0.012, zS + 1.2); this.group.add(mat2);
    // sign above the entrance, outside
    const es = PR.sign('ST. CURWEN — EMERGENCY DEPT', 3.6, { bg: '#37444a', size: 44 });
    es.position.set(cx, 2.9, zS + 0.18); es.rotation.y = 0; this.group.add(es);
  }

  dispose() {
    this.group.traverse(o => {
      if (o.geometry && o.geometry !== this.world._sharedGeo) o.geometry.dispose?.();
    });
  }
}

function edgeKey(ax, az, bx, bz) {
  return ax < bx || az < bz ? `${ax},${az},${bx},${bz}` : `${bx},${bz},${ax},${az}`;
}

// ---------------------------------------------------------------- world
export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.doorMap = new Map();
    this.collected = new Set();
    this.buildQueue = [];
    this.hasCard = () => false;
    this.events = {};
  }
  key(cx, cz) { return cx + ',' + cz; }

  ensure(px, pz) {
    const ccx = Math.floor(px / CELL / CHUNK), ccz = Math.floor(pz / CELL / CHUNK);
    const R = 2;
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      const k = this.key(ccx + dx, ccz + dz);
      if (!this.chunks.has(k) && !this.buildQueue.find(q => q.k === k)) {
        this.buildQueue.push({ k, cx: ccx + dx, cz: ccz + dz, d: Math.abs(dx) + Math.abs(dz) });
      }
    }
    this.buildQueue.sort((a, b) => a.d - b.d);
    // unload far chunks
    for (const [k, ch] of this.chunks) {
      if (Math.abs(ch.ccx - ccx) > R + 1 || Math.abs(ch.ccz - ccz) > R + 1) {
        this.scene.remove(ch.group);
        ch.dispose();
        for (const d of ch.doors) {
          for (const [dk, dv] of this.doorMap) if (dv === d) this.doorMap.delete(dk);
        }
        this.chunks.delete(k);
      }
    }
  }

  processQueue(maxPerFrame = 1) {
    let n = 0;
    while (this.buildQueue.length && n < maxPerFrame) {
      const { k, cx, cz } = this.buildQueue.shift();
      if (this.chunks.has(k)) continue;
      const ch = new Chunk(this, cx, cz);
      this.chunks.set(k, ch);
      this.scene.add(ch.group);
      n++;
    }
  }

  buildAllPending() { this.processQueue(1e9); }

  // is the boundary between two adjacent cells solid for the player?
  edgeSolid(ax, az, bx, bz) {
    const et = edge(ax, az, bx, bz);
    switch (et.type) {
      case 'open': return false;
      case 'door': return false;
      case 'security': case 'slide': {
        const d = this.doorMap.get(edgeKey(ax, az, bx, bz));
        return d ? d.solid : true;
      }
      default: return true;
    }
  }

  collidersNear(px, pz, r) {
    const out = [];
    for (const ch of this.chunks.values()) {
      const minx = ch.ccx * CHUNK * CELL, minz = ch.ccz * CHUNK * CELL;
      if (px < minx - r || px > minx + CHUNK * CELL + r || pz < minz - r || pz > minz + CHUNK * CELL + r) continue;
      for (const c of ch.colliders) {
        if (px > c.x0 - r && px < c.x1 + r && pz > c.z0 - r && pz < c.z1 + r) out.push(c);
      }
    }
    return out;
  }

  update(dt, ppos, t) {
    this.processQueue(this.chunks.size < 9 ? 4 : 1);
    for (const ch of this.chunks.values()) {
      for (const d of ch.doors) {
        const dist = Math.hypot(d.x - ppos.x, d.z - ppos.z);
        if (dist < 30) d.update(dt, dist, this.hasCard, this.events);
      }
      for (const p of ch.pickups) {
        const dist = Math.hypot(p.x - ppos.x, p.z - ppos.z);
        if (dist < 40) {
          p.mesh.position.y = p.baseY + Math.sin(t * 1.7 + p.x) * 0.04;
          p.mesh.rotation.y = t * 0.7;
        }
      }
    }
  }

  panelsNear(px, pz, r) {
    const out = [];
    for (const ch of this.chunks.values()) {
      for (const p of ch.panels) {
        const d2 = (p.x - px) ** 2 + (p.z - pz) ** 2;
        if (d2 < r * r) out.push({ ...p, d2 });
      }
    }
    out.sort((a, b) => a.d2 - b.d2);
    return out;
  }

  pickupsNear(px, pz, r) {
    const out = [];
    for (const ch of this.chunks.values()) {
      for (const p of ch.pickups) {
        const d2 = (p.x - px) ** 2 + (p.z - pz) ** 2;
        if (d2 < r * r) out.push({ p, ch, d2 });
      }
    }
    out.sort((a, b) => a.d2 - b.d2);
    return out;
  }

  collect(entry) {
    const { p, ch } = entry;
    this.collected.add(p.id);
    ch.group.remove(p.mesh);
    ch.pickups.splice(ch.pickups.indexOf(p), 1);
    return p;
  }
}
