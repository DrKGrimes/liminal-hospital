// main.js — Liminal Hospital
import * as THREE from 'three';
import { setSeed, getSeed, CELL, cellInfo, zoneOfDist, rand } from './gen.js';
import { World, zoneColor, zoneName } from './world.js';
import { Player } from './player.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import * as PR from './props.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const seed = params.get('seed') ? (parseInt(params.get('seed'), 10) >>> 0) : (Math.random() * 0xffffffff) >>> 0;
setSeed(seed);
document.getElementById('seedlabel').textContent = 'SEED ' + seed;

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FOG_COLOR = new THREE.Color(0xe9edee);
scene.background = FOG_COLOR.clone();
scene.fog = new THREE.FogExp2(FOG_COLOR.clone(), 0.030);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 220);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// base light — sterile, even
scene.add(new THREE.AmbientLight(0xf2f4f2, 0.42));
const hemi = new THREE.HemisphereLight(0xf4f6f2, 0x8e9696, 0.55);
scene.add(hemi);

// ---------------------------------------------------------------- systems
const world = new World(scene);
const player = new Player(camera, world, renderer.domElement);
const audio = new AudioEngine();
const ui = new UI();

player.pos.set(2, 1.62, 33.5);
player.setFacing(0); // facing -z: the entrance doors

// pooled point lights that follow the nearest ceiling panels
const LIGHTS = 6;
const pool = [];
for (let i = 0; i < LIGHTS; i++) {
  const l = new THREE.PointLight(0xfff6e6, 9, 13, 2);
  l.position.y = 2.85;
  scene.add(l);
  pool.push({ light: l, panel: null });
}

// ---------------------------------------------------------------- inventory
const cards = new Set();
let relicsCarried = 0;
world.hasCard = tier => cards.has(tier);

function refreshInv() {
  ui.setInventory([...cards].sort((a, b) => a - b), relicsCarried, zoneColor);
  audio.setRelicsCarried(relicsCarried);
  document.getElementById('vignette').style.opacity = String(Math.min(1, 0.85 + relicsCarried * 0.05));
  const fogDarken = Math.min(0.12, relicsCarried * 0.015);
  scene.fog.color.copy(FOG_COLOR).multiplyScalar(1 - fogDarken);
  scene.background.copy(scene.fog.color);
}

const RELIC_LINES = [
  'A black orb, heavier than it looks. It is looking back.',
  'A brass knot that cannot be untied. It turns when you aren’t watching.',
  'A small obelisk of wet stone. It is always wet.',
  'A porcelain eye. The pupil follows the corridor lights.',
  'A bell with no clapper. You can hear it anyway.',
];

// ---------------------------------------------------------------- world events
let lastSlideTick = -10;
world.events = {
  doorLocked(d) {
    audio.lockedBeep();
    ui.say(`The reader blinks red. WARD ${zoneName(d.tier)} needs a card you don’t have.`);
  },
  doorOpen() { audio.doorHiss(); },
  slideStart() { ui.say('The doors are trying.', 3500); },
  slideTick(d, stall) { lastSlideTick = nowSec; audio.slideMotor(true, stall === 0); },
};

// ---------------------------------------------------------------- flicker
const flicker = { panel: null, until: 0, next: 3, state: 1 };
function updateFlicker(dt, t) {
  if (flicker.panel) {
    if (t > flicker.until) {
      setPanel(flicker.panel, 1);
      flicker.panel = null;
      flicker.next = t + 3 + Math.random() * 11;
    } else if (Math.random() < 0.45) {
      flicker.state = flicker.state === 1 ? 0.12 + Math.random() * 0.2 : 1;
      setPanel(flicker.panel, flicker.state);
    }
  } else if (t > flicker.next) {
    const near = world.panelsNear(player.pos.x, player.pos.z, 17);
    if (near.length) {
      flicker.panel = near[Math.floor(Math.random() * Math.min(near.length, 8))];
      flicker.until = t + 0.4 + Math.random() * 0.9;
      audio.flickerBuzz();
    } else flicker.next = t + 4;
  }
}
const _c = new THREE.Color();
function setPanel(p, v) {
  _c.setRGB(0.96 * v, 0.97 * v, 0.94 * v);
  p.mesh.setColorAt(p.i, _c);
  p.mesh.instanceColor.needsUpdate = true;
  flicker.lightScale = v;
}

function updateLightPool() {
  const near = world.panelsNear(player.pos.x, player.pos.z, 16);
  for (let i = 0; i < LIGHTS; i++) {
    const slot = pool[i];
    const p = near[i];
    if (p) {
      slot.panel = p;
      slot.light.position.set(p.x, 2.85, p.z);
      const isFlick = flicker.panel && flicker.panel.mesh === p.mesh && flicker.panel.i === p.i;
      slot.light.intensity = 9 * (isFlick ? flicker.state : 1);
      slot.light.visible = true;
    } else {
      slot.light.visible = false;
      slot.panel = null;
    }
  }
}

// ---------------------------------------------------------------- the figure
const figureMesh = PR.figure();
figureMesh.visible = false;
scene.add(figureMesh);
const fig = { active: false, t: 0, dur: 1.3, from: null, to: null, next: 25 + Math.random() * 30 };
function updateFigure(dt, t) {
  if (fig.active) {
    fig.t += dt / fig.dur;
    if (fig.t >= 1) { fig.active = false; figureMesh.visible = false; }
    else {
      figureMesh.position.lerpVectors(fig.from, fig.to, fig.t);
    }
    return;
  }
  if (t < fig.next) return;
  fig.next = t + 30 + Math.random() * 60;
  // scan ahead for a corridor junction to cross
  const dir = player.forwardDir();
  for (let d = 14; d <= 30; d += 2) {
    const px = player.pos.x + dir.x * d, pz = player.pos.z + dir.z * d;
    const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);
    const info = cellInfo(cx, cz);
    if (info.kind === 'corridor' && info.onX && info.onZ) {
      const mx = cx * CELL + CELL / 2, mz = cz * CELL + CELL / 2;
      // cross perpendicular to the player's view
      const perp = Math.abs(dir.x) > Math.abs(dir.z)
        ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      fig.from = new THREE.Vector3(mx - perp.x * CELL * 0.8, 0, mz - perp.z * CELL * 0.8);
      fig.to = new THREE.Vector3(mx + perp.x * CELL * 0.8, 0, mz + perp.z * CELL * 0.8);
      if (Math.random() < 0.5) { const tmp = fig.from; fig.from = fig.to; fig.to = tmp; }
      fig.active = true; fig.t = 0;
      figureMesh.visible = true;
      figureMesh.position.copy(fig.from);
      figureMesh.lookAt(fig.to.x, 0, fig.to.z);
      audio.figurePass();
      break;
    }
  }
}

// ---------------------------------------------------------------- interaction
let promptTarget = null;
function updateInteraction() {
  promptTarget = null;
  const near = world.pickupsNear(player.pos.x, player.pos.z, 2.7);
  const fwd = player.forwardDir();
  for (const entry of near) {
    const dx = entry.p.x - player.pos.x, dz = entry.p.z - player.pos.z;
    const dist = Math.sqrt(entry.d2) || 1;
    const dot = (dx / dist) * fwd.x + (dz / dist) * fwd.z;
    if (dot > 0.55 || dist < 0.9) { promptTarget = entry; break; }
  }
  if (promptTarget) {
    const p = promptTarget.p;
    const label = p.type === 'card' ? `staff card — ward ${zoneName(p.tier)}` : PR.RELIC_NAMES[p.relic];
    ui.setPrompt(`E — take the ${label}`);
  } else ui.setPrompt('');

  // relic proximity drone
  let closeness = 0;
  for (const entry of near.length ? near : world.pickupsNear(player.pos.x, player.pos.z, 12)) {
    if (entry.p.type === 'relic') closeness = Math.max(closeness, 1 - Math.sqrt(entry.d2) / 12);
  }
  audio.setRelicProximity(closeness);
}
window.addEventListener('keydown', e => {
  if (e.code === 'KeyE' && promptTarget && player.enabled) {
    const p = world.collect(promptTarget);
    audio.pickup();
    if (p.type === 'card') {
      cards.add(p.tier);
      ui.say(`STAFF CARD — WARD ${zoneName(p.tier)}. The photo shows no one.`);
    } else {
      relicsCarried++;
      ui.say(RELIC_LINES[p.relic] || 'You should not have this.');
      if (relicsCarried === 3) setTimeout(() => ui.say('Three. The hum has changed key.'), 7000);
    }
    refreshInv();
    promptTarget = null;
  }
});

// ---------------------------------------------------------------- captions & zones
let currentZone = -1;
let visitedReception = false, visitedCorridor = false;
let maxDepth = 0;
const depthMilestones = [
  [120, 'The exit is 120 metres behind you. Probably behind you.'],
  [250, 'A quarter kilometre in. Every clock still says 3:33.'],
  [450, 'You have walked further than the building is.'],
  [800, 'The stripes have repeated. You are sure the stripes have repeated.'],
];
function updateNarrative() {
  const d = Math.hypot(player.pos.x, player.pos.z);
  const z = zoneOfDist(d);
  if (z !== currentZone) {
    if (currentZone >= 0) {
      if (z > currentZone) ui.say(`WARD ${zoneName(z)}. The stripe on the wall has changed colour.`);
    }
    currentZone = z;
    ui.setZone('WARD ' + zoneName(z));
  }
  if (!visitedReception && player.pos.z < 23 && Math.abs(player.pos.x - 2) < 13) {
    visitedReception = true;
    ui.say('Reception is unstaffed. The phone is off the hook.');
  }
  if (!visitedCorridor && player.pos.z < 4) {
    visitedCorridor = true;
    setTimeout(() => ui.say('The corridor smells of nothing at all.'), 2500);
  }
  if (d > maxDepth) {
    maxDepth = d;
    for (const m of depthMilestones) {
      if (m[0] < d + 1 && !m.done && Math.abs(d - m[0]) < 6) { m.done = true; ui.say(m[1]); }
    }
  }
}

// ---------------------------------------------------------------- photo mode
function ordinal(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
}
function photoCaption() {
  const d = new Date();
  let h = d.getHours();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  const hh = String(h).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `St Curwen's   ${hh}:${mm} ${ampm}   ${days[d.getDay()]} ${d.getDate()}${ordinal(d.getDate())} ${months[d.getMonth()]}, ${d.getFullYear()}`;
}
function takePhoto(save = true) {
  renderer.render(scene, camera);   // fresh frame so the buffer is readable
  const src = renderer.domElement;
  const w = src.width, hgt = src.height;
  if (!w || !hgt) return null;      // window currently has no size
  const side = Math.round(w * 0.045), top = side, bottom = Math.round(w * 0.10);
  const cv = document.createElement('canvas');
  cv.width = w + side * 2; cv.height = hgt + top + bottom;
  const ctx = cv.getContext('2d');
  // aged mount
  ctx.fillStyle = '#ece4d0';
  ctx.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(150,120,80,${0.02 + (i % 5) * 0.008})`;
    ctx.fillRect((i * 67) % cv.width, (i * 113) % cv.height, 2, 2);
  }
  // the photograph, sepia-leaning
  if ('filter' in ctx) ctx.filter = 'sepia(0.38) saturate(0.88) contrast(0.96) brightness(1.02)';
  ctx.drawImage(src, side, top, w, hgt);
  ctx.filter = 'none';
  // warm wash + vignette
  ctx.fillStyle = 'rgba(185,135,65,0.09)';
  ctx.fillRect(side, top, w, hgt);
  const vg = ctx.createRadialGradient(side + w / 2, top + hgt / 2, Math.min(w, hgt) * 0.4, side + w / 2, top + hgt / 2, Math.max(w, hgt) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(60,40,20,0.28)');
  ctx.fillStyle = vg;
  ctx.fillRect(side, top, w, hgt);
  // a hairline around the print
  ctx.strokeStyle = 'rgba(110,90,60,0.45)';
  ctx.lineWidth = Math.max(1, w / 800);
  ctx.strokeRect(side - 0.5, top - 0.5, w + 1, hgt + 1);
  // caption
  ctx.fillStyle = '#5a4a36';
  ctx.font = `italic ${Math.round(w * 0.022)}px Georgia, 'Times New Roman', serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(photoCaption(), cv.width / 2, hgt + top + bottom * 0.52);
  if (save) {
    cv.toBlob(b => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      const d = new Date();
      a.download = `st-curwens-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/jpeg', 0.92);
    audio.shutter();
    const fl = document.getElementById('photoflash');
    fl.classList.remove('snap'); void fl.offsetWidth; fl.classList.add('snap');
  }
  return cv;
}
window.addEventListener('keydown', e => {
  if (e.code === 'KeyP' && started) takePhoto();
});

// ---------------------------------------------------------------- start flow
let started = false;
const overlay = document.getElementById('overlay');
function start() {
  audio.init(); audio.resume();
  if (!TEST) renderer.domElement.requestPointerLock();
  ui.hideOverlay();
  player.enabled = true;
  if (!started) {
    started = true;
    ui.fadeIn();
    setTimeout(() => ui.say('ST. CURWEN GENERAL HOSPITAL', 4000), 1200);
    setTimeout(() => ui.say('Visiting hours ended some time ago.', 4500), 6200);
  }
}
overlay.addEventListener('click', start);
document.addEventListener('pointerlockchange', () => {
  if (!TEST && started && document.pointerLockElement === null) {
    player.enabled = false;
    ui.showOverlay();
    overlay.querySelector('.start').textContent = 'click to resume';
  }
});
if (TEST) { setTimeout(start, 300); }

// build the immediate surroundings before first frame
world.ensure(player.pos.x, player.pos.z);
world.processQueue(9);

// ---------------------------------------------------------------- loop
let nowSec = 0;
let last = performance.now();
let fovTarget = 72;
const clockEl = { acc: 0 };

function frame(nowMs) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (nowMs - last) / 1000);
  last = nowMs;
  nowSec += dt;
  const t = nowSec;

  if (started || TEST) {
    player.update(dt);
    world.update(dt, player.pos, t);
    updateFlicker(dt, t);
    updateLightPool();
    updateFigure(dt, t);
    updateInteraction();
    updateNarrative();

    // streaming, throttled
    clockEl.acc += dt;
    if (clockEl.acc > 0.5) {
      clockEl.acc = 0;
      world.ensure(player.pos.x, player.pos.z);
    }

    // distant sounds
    const ev = audio.maybeDistant(dt, currentZone);
    if (ev === 'announcement' && Math.random() < 0.5) {
      setTimeout(() => ui.say('The tannoy says a name. Not yours. Not quite anyone’s.', 4000), 800);
    }
    if (relicsCarried >= 3 && Math.random() < dt * 0.01) audio.whisper();

    // motor cut-off when the entrance door stops
    if (nowSec - lastSlideTick > 0.25) audio.slideMotor(false);

    // sprint fov
    const running = (player.keys['ShiftLeft'] || player.keys['ShiftRight']) &&
      (player.keys['KeyW'] || player.keys['KeyA'] || player.keys['KeyS'] || player.keys['KeyD']);
    fovTarget = running ? 78 : 72;
    camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 5);
    camera.updateProjectionMatrix();
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
refreshInv();
ui.setZone('');

// ---------------------------------------------------------------- debug api
import * as GEN from './gen.js';
window.__game = {
  player, world, audio, seed: getSeed(), gen: GEN,
  teleport(x, z) { player.pos.x = x; player.pos.z = z; world.ensure(x, z); world.buildAllPending(); },
  state() {
    return {
      pos: { x: +player.pos.x.toFixed(1), z: +player.pos.z.toFixed(1) },
      yaw: +player.yaw.toFixed(2),
      zone: currentZone, cards: [...cards], relics: relicsCarried,
      chunks: world.chunks.size, started,
    };
  },
  look(yaw, pitch = 0) { player.yaw = yaw; player.pitch = pitch; },
  press(code, down = true) { player.keys[code] = down; },
  fig,
  photo: takePhoto,
};
