// gen.js — deterministic, infinite hospital layout. Pure logic, no three.js.
//
// World is a grid of 4m cells. Every 6th row/column of cells is a corridor
// line; the 5x5 blocks between corridors hold rooms, open bays, or solid
// service cores. Everything is derived from (seed, x, z) hashes so any cell
// can be queried without generating its neighbours.

export const CELL = 4;          // metres per cell
export const WALL_H = 3.2;      // wall height
export const P = 6;             // corridor period (5-cell blocks + 1 corridor)

let SEED = 1;
export function setSeed(s) { SEED = s >>> 0; }
export function getSeed() { return SEED; }

function h32(x) {
  x ^= x >>> 16; x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16; x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16; return x >>> 0;
}
function hstr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h | 0;
}
export function hash(...ns) {
  let h = SEED >>> 0;
  for (let n of ns) {
    if (typeof n === 'string') n = hstr(n);
    h = h32(h ^ Math.imul(n | 0, 0x9E3779B1));
  }
  return h;
}
export function rand(...ns) { return hash(...ns) / 4294967296; }

export const cm = n => ((n % P) + P) % P;
const bcoord = n => Math.floor(n / P);

// ---------------------------------------------------------------- reception
// Handcrafted region around the origin. The player spawns outside on a pad
// of white void, walks through faulty sliding doors into reception, and the
// reception opens north onto the corridor grid at the (0,0) junction.
const REC = {
  rect: { x0: -5, x1: 5, z0: 1, z1: 10 },   // suppression rect (everything else solid)
  room: { x0: -3, x1: 3, z0: 1, z1: 5 },    // reception interior
  pad:  { x0: -3, x1: 3, z0: 6, z1: 8 },    // outside pad
};
export const RECEPTION = REC;
const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

// ---------------------------------------------------------------- zones
// Concentric depth rings. Crossing a ring means passing a locked security
// door; the card for zone t is found somewhere in zone t-1.
export function zoneRadius(i) { return 70 + 85 * i + 8 * i * i; }
export function zoneOfDist(d) {
  let i = 0;
  while (d >= zoneRadius(i)) i++;
  return i;
}
function cellDist(x, z) { return Math.hypot(x * CELL + CELL / 2, z * CELL + CELL / 2); }
function blockDist(bx, bz) {
  return Math.hypot((bx * P + 3) * CELL, (bz * P + 3) * CELL);
}

// ---------------------------------------------------------------- cell info
export function cellInfo(x, z) {
  if (inRect(REC.rect, x, z)) {
    if (inRect(REC.room, x, z)) return { kind: 'reception', zone: 0 };
    if (inRect(REC.pad, x, z))  return { kind: 'outside', zone: 0 };
    return { kind: 'solid', zone: 0 };
  }
  const onX = cm(x) === 0, onZ = cm(z) === 0;
  if (onX || onZ) {
    return { kind: 'corridor', onX, onZ, zone: zoneOfDist(cellDist(x, z)) };
  }
  const bx = bcoord(x), bz = bcoord(z);
  const zone = zoneOfDist(blockDist(bx, bz));
  const r = rand('blk', bx, bz);
  if (r < 0.15) return { kind: 'solid', bx, bz, zone };
  if (r < 0.30) return { kind: 'bay', bx, bz, zone, key: `b${bx}_${bz}` };
  // rooms — subdivide the 5x5 block into rectangles
  const lx = cm(x) - 1, lz = cm(z) - 1;            // 0..4 within block
  const sub = hash('sub', bx, bz) % 4;             // 0 single, 1 splitZ, 2 splitX, 3 quad
  const cutX = 2 + hash('cx', bx, bz) % 2;         // 2 or 3
  const cutZ = 2 + hash('cz', bx, bz) % 2;
  let x0 = 0, x1 = 4, z0 = 0, z1 = 4;
  if (sub === 1) { if (lz < cutZ) z1 = cutZ - 1; else z0 = cutZ; }
  else if (sub === 2) { if (lx < cutX) x1 = cutX - 1; else x0 = cutX; }
  else if (sub === 3) {
    if (lx < cutX) x1 = cutX - 1; else x0 = cutX;
    if (lz < cutZ) z1 = cutZ - 1; else z0 = cutZ;
  }
  const rx0 = bx * P + 1 + x0, rx1 = bx * P + 1 + x1;
  const rz0 = bz * P + 1 + z0, rz1 = bz * P + 1 + z1;
  return {
    kind: 'room', bx, bz, zone,
    rx0, rx1, rz0, rz1,
    key: `r${rx0}_${rz0}`,
  };
}

export const walkable = info =>
  info.kind === 'corridor' || info.kind === 'room' || info.kind === 'bay' ||
  info.kind === 'reception' || info.kind === 'outside';

// ---------------------------------------------------------------- room doors
// Each room picks 1-2 door cells on sides that face a corridor.
function roomDoorEdges(info) {
  const cands = [];
  if (cm(info.rx0) === 1) for (let z = info.rz0; z <= info.rz1; z++) cands.push([info.rx0, z, info.rx0 - 1, z]);
  if (cm(info.rx1) === P - 1) for (let z = info.rz0; z <= info.rz1; z++) cands.push([info.rx1, z, info.rx1 + 1, z]);
  if (cm(info.rz0) === 1) for (let x = info.rx0; x <= info.rx1; x++) cands.push([x, info.rz0, x, info.rz0 - 1]);
  if (cm(info.rz1) === P - 1) for (let x = info.rx0; x <= info.rx1; x++) cands.push([x, info.rz1, x, info.rz1 + 1]);
  if (!cands.length) return [];
  const doors = [cands[hash('door', info.rx0, info.rz0) % cands.length]];
  if (cands.length > 1 && rand('door2', info.rx0, info.rz0) < 0.3) {
    const d2 = cands[hash('door2i', info.rx0, info.rz0) % cands.length];
    if (d2[0] !== doors[0][0] || d2[1] !== doors[0][1] || d2[2] !== doors[0][2] || d2[3] !== doors[0][3]) doors.push(d2);
  }
  return doors;
}
function isRoomDoor(roomInfo, x, z, ox, oz) {
  return roomDoorEdges(roomInfo).some(d => d[0] === x && d[1] === z && d[2] === ox && d[3] === oz);
}

// ---------------------------------------------------------------- edges
// Returns the boundary type between two adjacent cells:
// 'open' | 'wall' | 'door' (room swing door) | 'security' (locked glass, tier)
// | 'glass' (fixed glazing) | 'slide' (faulty entrance door)
export function edge(ax, az, bx, bz) {
  const A = cellInfo(ax, az), B = cellInfo(bx, bz);
  const wA = walkable(A), wB = walkable(B);
  if (!wA && !wB) return { type: 'none' };
  if (!wA || !wB) return { type: 'wall' };

  // ---- handcrafted reception edges
  const kinds = A.kind + '|' + B.kind;
  if (A.kind === 'reception' && B.kind === 'reception') return { type: 'open' };
  if (A.kind === 'outside' && B.kind === 'outside') return { type: 'open' };
  if (kinds === 'reception|outside' || kinds === 'outside|reception') {
    const rx = A.kind === 'reception' ? ax : bx;
    return rx === 0 ? { type: 'slide' } : { type: 'glass' };
  }
  if (A.kind === 'reception' || B.kind === 'reception') {
    // reception ↔ corridor: open archway at x in [-1..1] on the north edge
    const rx = A.kind === 'reception' ? ax : bx;
    const rz = A.kind === 'reception' ? az : bz;
    if (rz === REC.room.z0 && Math.abs(rx) <= 1) return { type: 'open' };
    return { type: 'wall' };
  }
  if (A.kind === 'outside' || B.kind === 'outside') return { type: 'wall' };

  // ---- security rings between zones
  let base = null;
  if (kinds === 'corridor|corridor') {
    // blockages make the corridor grid maze-like; never block junctions
    const junc = (i => i.onX && i.onZ);
    if (junc(A) || junc(B)) base = { type: 'open' };
    else {
      const blocked = ax === bx
        ? rand('cbz', ax, Math.min(az, bz)) < 0.10
        : rand('cbx', Math.min(ax, bx), az) < 0.10;
      base = { type: blocked ? 'wall' : 'open' };
    }
  } else if (kinds === 'corridor|room' || kinds === 'room|corridor') {
    const R = A.kind === 'room' ? A : B;
    const rc = A.kind === 'room' ? [ax, az, bx, bz] : [bx, bz, ax, az];
    base = isRoomDoor(R, ...rc) ? { type: 'door' } : { type: 'wall' };
  } else if (kinds === 'corridor|bay' || kinds === 'bay|corridor' || kinds === 'bay|bay') {
    base = { type: 'open' };
  } else if (kinds === 'room|room') {
    if (A.key === B.key) base = { type: 'open' };
    else {
      // occasional interior door between sibling rooms
      const k = A.key < B.key ? A.key + B.key : B.key + A.key;
      if (rand('idoor', hash(k)) < 0.3) {
        // door at one deterministic cell along the shared wall
        const idx = hash('idoori', hash(k));
        const coord = ax === bx ? ax : az;
        base = { type: cm(coord) === 1 + (idx % 5) ? 'door' : 'wall' };
      } else base = { type: 'wall' };
    }
  } else {
    base = { type: 'wall' };
  }

  if (base.type !== 'wall' && base.type !== 'none' && A.zone !== B.zone) {
    return { type: 'security', tier: Math.max(A.zone, B.zone) };
  }
  return base;
}

// ---------------------------------------------------------------- spawns
// Keycards: tier t (unlocks zone t) spawns in rooms of zone t-1.
// Relics: rare strange objects in rooms, more common with depth.
export function spawnAt(x, z, info) {
  if (info.kind !== 'room') return null;
  // only one candidate cell per room (its anchor) so rooms hold at most one item
  if (x !== info.rx0 + hash('sx', info.rx0, info.rz0) % (info.rx1 - info.rx0 + 1)) return null;
  if (z !== info.rz0 + hash('sz', info.rx0, info.rz0) % (info.rz1 - info.rz0 + 1)) return null;

  const g = guaranteedCard(info.zone + 1);
  if (g && g[0] === x && g[1] === z) return { type: 'card', tier: info.zone + 1 };

  const r = rand('spawn', x, z);
  if (r < 0.06) return { type: 'card', tier: info.zone + 1 };
  if (r < 0.06 + 0.018 + info.zone * 0.006) {
    return { type: 'relic', relic: hash('relic', x, z) % 5 };
  }
  return null;
}

// Deterministic fallback so every zone always contains at least one card for
// the next ring, at a hashed angle in the middle of the zone.
const gcardCache = new Map();
export function guaranteedCard(tier) {
  if (tier < 1) return null;
  if (gcardCache.has(tier)) return gcardCache.get(tier);
  const lo = tier >= 2 ? zoneRadius(tier - 2) : 0;
  const hi = zoneRadius(tier - 1);
  const theta = rand('gcard', tier) * Math.PI * 2;
  const d = (lo + hi) / 2;
  let bx = Math.round(d * Math.cos(theta) / (CELL * P));
  let bz = Math.round(d * Math.sin(theta) / (CELL * P));
  // spiral out to the nearest rooms-kind block in the right zone
  let found = null;
  outer:
  for (let ring = 0; ring < 8 && !found; ring++) {
    for (let dx = -ring; dx <= ring; dx++) for (let dz = -ring; dz <= ring; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
      const tx = bx + dx, tz = bz + dz;
      const cx = tx * P + 3, czz = tz * P + 3;
      if (inRect(REC.rect, cx, czz)) continue;
      const inf = cellInfo(cx, czz);
      if (inf.kind === 'room' && inf.zone === tier - 1) { found = [tx, tz]; break outer; }
    }
  }
  let cell = null;
  if (found) {
    const inf = cellInfo(found[0] * P + 3, found[1] * P + 3);
    cell = [
      inf.rx0 + hash('sx', inf.rx0, inf.rz0) % (inf.rx1 - inf.rx0 + 1),
      inf.rz0 + hash('sz', inf.rx0, inf.rz0) % (inf.rz1 - inf.rz0 + 1),
    ];
  }
  gcardCache.set(tier, cell);
  return cell;
}

// ---------------------------------------------------------------- dressing
// What a room/bay/corridor cell contains, decided per room key.
export function roomStyle(info) {
  const h = hash('style', info.rx0, info.rz0);
  const r = rand('anom', info.rx0, info.rz0);
  // the board convenes rarely, deeper in, and only in full-size rooms
  if (info.zone >= 1 && info.rx1 - info.rx0 === 4 && info.rz1 - info.rz0 === 4
      && rand('board', info.rx0, info.rz0) < 0.03) {
    return { anomaly: 'boardRoom' };
  }
  const anomChance = 0.10 + info.zone * 0.05;
  if (r < anomChance) {
    const anomalies = ['chairCircle', 'clockWall', 'plantRoom', 'bedAudience', 'paperRoom', 'emptyHum', 'mannequins', 'mannequinCircle'];
    return { anomaly: anomalies[h % anomalies.length] };
  }
  const w = info.rx1 - info.rx0, d = info.rz1 - info.rz0;
  const styles = (w >= 3 && d >= 3) ? ['ward', 'ward', 'waiting', 'vacated']
    : (w >= 2 || d >= 2) ? ['exam', 'office', 'vacated', 'ward']
    : ['office', 'storage', 'exam', 'vacated'];
  return { style: styles[h % styles.length] };
}
