// player.js — first-person controller with grid-wall collision.
import * as THREE from 'three';
import { CELL } from './gen.js';

const EYE = 1.62;
const RADIUS = 0.34;          // body radius
const WALL_R = RADIUS + 0.1;  // walls are 0.2 thick, centred on cell edges

export class Player {
  constructor(camera, world, dom) {
    this.camera = camera;
    this.world = world;
    this.pos = new THREE.Vector3(2, EYE, 34);
    this.yaw = Math.PI;        // facing -z? yaw applied around Y; PI faces +z->... set in main
    this.pitch = 0;
    this.vel = new THREE.Vector3();
    this.keys = {};
    this.enabled = false;
    this.strideAcc = 0;
    this.bobPhase = 0;
    this.onStep = null;
    this.speedWalk = 3.1;
    this.speedRun = 5.0;

    window.addEventListener('keydown', e => { this.keys[e.code] = true; });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    dom.addEventListener('mousemove', e => {
      if (!this.enabled || document.pointerLockElement === null) return;
      this.yaw -= e.movementX * 0.0021;
      this.pitch -= e.movementY * 0.0021;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });
  }

  setFacing(yaw) { this.yaw = yaw; this.pitch = 0; }

  forwardDir() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  update(dt) {
    // arrow keys always rotate (accessibility + automated testing)
    const look = 1.9 * dt;
    if (this.keys['ArrowLeft']) this.yaw += look;
    if (this.keys['ArrowRight']) this.yaw -= look;
    if (this.keys['ArrowUp']) this.pitch = Math.min(1.45, this.pitch + look);
    if (this.keys['ArrowDown']) this.pitch = Math.max(-1.45, this.pitch - look);

    let fx = 0, fz = 0;
    if (this.enabled) {
      if (this.keys['KeyW']) fz += 1;
      if (this.keys['KeyS']) fz -= 1;
      if (this.keys['KeyA']) fx -= 1;
      if (this.keys['KeyD']) fx += 1;
    }
    const running = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    const speed = running ? this.speedRun : this.speedWalk;
    const len = Math.hypot(fx, fz);
    let dx = 0, dz = 0;
    if (len > 0) {
      fx /= len; fz /= len;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      // camera-relative: forward is -z in camera space
      dx = (fx * cos - fz * sin) * speed * dt;
      dz = (-fx * sin - fz * cos) * speed * dt;
    }
    this.move(dx, dz);

    // head bob + stride events
    const moving = len > 0;
    const rate = moving ? (running ? 11 : 7.4) : 0;
    this.bobPhase += rate * dt;
    const bob = moving ? Math.sin(this.bobPhase) * 0.035 : 0;
    this.strideAcc += Math.hypot(dx, dz);
    if (this.strideAcc > (running ? 2.3 : 1.85)) {
      this.strideAcc = 0;
      this.onStep && this.onStep(running);
    }

    this.camera.position.set(this.pos.x, EYE + bob, this.pos.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
  }

  move(dx, dz) {
    const w = this.world;
    let { x, z } = this.pos;

    // --- X axis
    if (dx !== 0) {
      let nx = x + dx;
      const cz0 = Math.floor((z - RADIUS) / CELL), cz1 = Math.floor((z + RADIUS) / CELL);
      const cx = Math.floor(x / CELL);
      for (let cz = cz0; cz <= cz1; cz++) {
        if (dx > 0 && nx + WALL_R > (cx + 1) * CELL && w.edgeSolid(cx, cz, cx + 1, cz)) {
          nx = Math.min(nx, (cx + 1) * CELL - WALL_R);
        } else if (dx < 0 && nx - WALL_R < cx * CELL && w.edgeSolid(cx, cz, cx - 1, cz)) {
          nx = Math.max(nx, cx * CELL + WALL_R);
        }
      }
      x = nx;
    }
    // --- Z axis
    if (dz !== 0) {
      let nz = z + dz;
      const cx0 = Math.floor((x - RADIUS) / CELL), cx1 = Math.floor((x + RADIUS) / CELL);
      const cz = Math.floor(z / CELL);
      for (let cx = cx0; cx <= cx1; cx++) {
        if (dz > 0 && nz + WALL_R > (cz + 1) * CELL && w.edgeSolid(cx, cz, cx, cz + 1)) {
          nz = Math.min(nz, (cz + 1) * CELL - WALL_R);
        } else if (dz < 0 && nz - WALL_R < cz * CELL && w.edgeSolid(cx, cz, cx, cz - 1)) {
          nz = Math.max(nz, cz * CELL + WALL_R);
        }
      }
      z = nz;
    }

    // --- prop colliders (axis push-out)
    for (const c of w.collidersNear(x, z, RADIUS + 0.5)) {
      if (x > c.x0 - RADIUS && x < c.x1 + RADIUS && z > c.z0 - RADIUS && z < c.z1 + RADIUS) {
        const pushL = x - (c.x0 - RADIUS), pushR = (c.x1 + RADIUS) - x;
        const pushU = z - (c.z0 - RADIUS), pushD = (c.z1 + RADIUS) - z;
        const m = Math.min(pushL, pushR, pushU, pushD);
        if (m === pushL) x = c.x0 - RADIUS;
        else if (m === pushR) x = c.x1 + RADIUS;
        else if (m === pushU) z = c.z0 - RADIUS;
        else z = c.z1 + RADIUS;
      }
    }

    this.pos.x = x; this.pos.z = z;
  }
}
