// audio.js — everything is synthesized with Web Audio. No samples.
// Fluorescent hum, footsteps, distant PA chimes, door slams, gurney rattles,
// muffled announcements, relic drones, and the entrance door's failing motor.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.relicCount = 0;
    this._nextDistant = 8;
    this._slideOsc = null;
  }

  init() {
    if (this.ctx) return;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(ctx.destination);

    // shared "distant space" — feedback delay + lowpass
    this.space = ctx.createGain(); this.space.gain.value = 1;
    const delay = ctx.createDelay(1); delay.delayTime.value = 0.31;
    const fb = ctx.createGain(); fb.gain.value = 0.42;
    const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 900;
    this.space.connect(delay); delay.connect(damp); damp.connect(fb); fb.connect(delay);
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    damp.connect(wet); wet.connect(this.master);
    this.space.connect(this.master);

    // noise buffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this._hum();
    this._relicDroneBus();
  }

  resume() { this.ctx && this.ctx.state === 'suspended' && this.ctx.resume(); }

  _noise() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = true;
    return s;
  }

  // ------------------------------------------------------------- ambient hum
  _hum() {
    const c = this.ctx;
    this.humGain = c.createGain(); this.humGain.gain.value = 0.0;
    this.humGain.connect(this.master);
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 60;
    const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 120.3;
    const og = c.createGain(); og.gain.value = 0.012;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    o1.connect(og); o2.connect(og); og.connect(lp); lp.connect(this.humGain);
    o1.start(); o2.start();
    // fluorescent hiss
    const hiss = this._noise();
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 7800; bp.Q.value = 2.5;
    this.hissGain = c.createGain(); this.hissGain.gain.value = 0.0035;
    hiss.connect(bp); bp.connect(this.hissGain); this.hissGain.connect(this.humGain);
    hiss.start();
    // slow wobble
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = 0.004;
    lfo.connect(lg); lg.connect(og.gain); lfo.start();
    // fade in
    this.humGain.gain.linearRampToValueAtTime(1.0, c.currentTime + 4);
  }

  setHumThickness(v) { // grows with relics carried
    if (!this.ctx) return;
    this.humGain && this.humGain.gain.setTargetAtTime(1 + v * 0.5, this.ctx.currentTime, 1);
  }

  flickerBuzz() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const n = this._noise();
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4200; bp.Q.value = 1.2;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < 7; i++) {
      const tt = t + i * 0.05 + Math.random() * 0.03;
      g.gain.setValueAtTime(0.02 + Math.random() * 0.025, tt);
      g.gain.setValueAtTime(0.001, tt + 0.02);
    }
    g.gain.linearRampToValueAtTime(0, t + 0.5);
    n.connect(bp); bp.connect(g); g.connect(this.master);
    n.start(t); n.stop(t + 0.6);
  }

  // ------------------------------------------------------------- footsteps
  footstep(running) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const n = this._noise();
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = 700 + Math.random() * 300;
    const g = c.createGain();
    const v = running ? 0.16 : 0.10;
    g.gain.setValueAtTime(v + Math.random() * 0.03, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    n.connect(lp); lp.connect(g); g.connect(this.master);
    n.start(t); n.stop(t + 0.12);
    const o = c.createOscillator(); o.frequency.value = 64 + Math.random() * 10;
    const og = c.createGain();
    og.gain.setValueAtTime(0.05, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.1);
  }

  // ------------------------------------------------------------- distant events
  maybeDistant(dt, depthZone) {
    if (!this.ctx) return null;
    this._nextDistant -= dt;
    if (this._nextDistant > 0) return null;
    this._nextDistant = 9 + Math.random() * 20;
    const r = Math.random();
    if (r < 0.3) { this.paChime(); return 'chime'; }
    if (r < 0.5) { this.doorSlam(); return 'slam'; }
    if (r < 0.68) { this.gurneyRattle(); return 'rattle'; }
    if (r < 0.8 + depthZone * 0.04) { this.announcement(); return 'announcement'; }
    this.paChime(); return 'chime';
  }

  _panned(gainVal) {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = gainVal;
    const p = c.createStereoPanner(); p.pan.value = (Math.random() * 2 - 1) * 0.8;
    g.connect(p); p.connect(this.space);
    return g;
  }

  paChime() {
    const c = this.ctx, t = c.currentTime;
    const out = this._panned(0.05 + Math.random() * 0.03);
    [880, 659.3, 523.3].forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain();
      const t0 = t + i * 0.42;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(1, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.4);
      o.connect(g); g.connect(out);
      o.start(t0); o.stop(t0 + 1.5);
    });
  }

  announcement() {
    // a voice, somewhere, saying nothing you can parse
    const c = this.ctx, t = c.currentTime;
    const out = this._panned(0.10);
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 105;
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 6;
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 7;
    const muf = c.createBiquadFilter(); muf.type = 'lowpass'; muf.frequency.value = 700;
    const g = c.createGain(); g.gain.value = 0;
    o.connect(f1); f1.connect(muf); o.connect(f2); f2.connect(muf);
    muf.connect(g); g.connect(out);
    const dur = 2 + Math.random() * 1.8;
    let tt = t;
    while (tt < t + dur) {
      f1.frequency.setValueAtTime(350 + Math.random() * 500, tt);
      f2.frequency.setValueAtTime(900 + Math.random() * 1200, tt);
      g.gain.setValueAtTime(Math.random() < 0.18 ? 0 : 0.5 + Math.random() * 0.5, tt);
      tt += 0.07 + Math.random() * 0.12;
    }
    g.gain.setValueAtTime(0, t + dur);
    o.frequency.setValueAtTime(95 + Math.random() * 25, t);
    o.start(t); o.stop(t + dur + 0.1);
  }

  doorSlam() {
    const c = this.ctx, t = c.currentTime;
    const out = this._panned(0.16);
    const n = this._noise();
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    const g = c.createGain();
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    n.connect(lp); lp.connect(g); g.connect(out);
    n.start(t); n.stop(t + 0.3);
    const o = c.createOscillator(); o.frequency.setValueAtTime(55, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    const og = c.createGain();
    og.gain.setValueAtTime(0.7, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(og); og.connect(out);
    o.start(t); o.stop(t + 0.55);
  }

  gurneyRattle() {
    const c = this.ctx, t = c.currentTime;
    const out = this._panned(0.05);
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 280 + Math.random() * 120;
    const am = c.createOscillator(); am.frequency.value = 11 + Math.random() * 5;
    const amg = c.createGain(); amg.gain.value = 0.5;
    const g = c.createGain(); g.gain.value = 0.5;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    am.connect(amg); amg.connect(g.gain);
    o.connect(lp); lp.connect(g); g.connect(out);
    const dur = 0.8 + Math.random() * 1.2;
    g.gain.setValueAtTime(0.5, t);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.start(t); o.stop(t + dur); am.start(t); am.stop(t + dur);
  }

  whisper() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const out = this._panned(0.06);
    const n = this._noise();
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9;
    bp.frequency.setValueAtTime(1200, t);
    bp.frequency.linearRampToValueAtTime(2100, t + 1.4);
    const g = c.createGain(); g.gain.value = 0;
    let tt = t;
    while (tt < t + 1.5) {
      g.gain.setValueAtTime(Math.random() * 0.9, tt);
      tt += 0.05 + Math.random() * 0.07;
    }
    g.gain.setValueAtTime(0, t + 1.5);
    n.connect(bp); bp.connect(g); g.connect(out);
    n.start(t); n.stop(t + 1.6);
  }

  // ------------------------------------------------------------- doors
  lockedBeep() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    [0, 0.18].forEach(off => {
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 196;
      const g = c.createGain();
      g.gain.setValueAtTime(0.05, t + off);
      g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.13);
      o.connect(g); g.connect(this.master);
      o.start(t + off); o.stop(t + off + 0.15);
    });
  }

  doorHiss() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(880, t);
    o.frequency.setValueAtTime(1175, t + 0.12);
    const og = c.createGain();
    og.gain.setValueAtTime(0.05, t); og.gain.setValueAtTime(0.05, t + 0.2);
    og.gain.linearRampToValueAtTime(0, t + 0.25);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.3);
    const n = this._noise();
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
    const g = c.createGain();
    g.gain.setValueAtTime(0.04, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    n.connect(hp); hp.connect(g); g.connect(this.master);
    n.start(t + 0.1); n.stop(t + 0.8);
  }

  slideMotor(on, stalled) {
    if (!this.ctx) return;
    const c = this.ctx;
    if (on && !this._slideOsc) {
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 84;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
      const g = c.createGain(); g.gain.value = 0.025;
      o.connect(lp); lp.connect(g); g.connect(this.master);
      o.start();
      this._slideOsc = { o, g };
    }
    if (this._slideOsc) {
      if (!on) {
        this._slideOsc.g.gain.linearRampToValueAtTime(0, c.currentTime + 0.15);
        const dead = this._slideOsc; this._slideOsc = null;
        setTimeout(() => dead.o.stop(), 300);
      } else {
        this._slideOsc.g.gain.setTargetAtTime(stalled ? 0.006 : 0.028, c.currentTime, 0.03);
        this._slideOsc.o.frequency.setTargetAtTime(stalled ? 55 : 84 + Math.random() * 8, c.currentTime, 0.03);
      }
    }
  }

  // ------------------------------------------------------------- pickups & relics
  pickup() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    [1318.5, 1975.5].forEach((f, i) => {
      const o = c.createOscillator(); o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.06, t + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.5);
      o.connect(g); g.connect(this.master);
      o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.55);
    });
  }

  _relicDroneBus() {
    const c = this.ctx;
    this.relicGain = c.createGain(); this.relicGain.gain.value = 0;
    this.relicGain.connect(this.master);
    this.proxGain = c.createGain(); this.proxGain.gain.value = 0;
    this.proxGain.connect(this.master);
    [55, 55.7, 82.4].forEach(f => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      o.connect(this.relicGain); o.start();
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 1.498;
      o2.connect(this.proxGain); o2.start();
    });
  }

  setRelicsCarried(n) {
    this.relicCount = n;
    if (!this.ctx) return;
    this.relicGain.gain.setTargetAtTime(Math.min(0.05, n * 0.011), this.ctx.currentTime, 2);
    this.setHumThickness(n * 0.15);
  }

  setRelicProximity(closeness) { // 0..1
    if (!this.ctx) return;
    this.proxGain.gain.setTargetAtTime(closeness * 0.035, this.ctx.currentTime, 0.4);
  }

  shutter() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    // mechanical click-clack
    [[0, 3200, 0.07], [0.06, 2200, 0.05]].forEach(([off, fq, vol]) => {
      const n = this._noise();
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = fq;
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t + off);
      g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.03);
      n.connect(hp); hp.connect(g); g.connect(this.master);
      n.start(t + off); n.stop(t + off + 0.05);
    });
    const o = c.createOscillator(); o.frequency.value = 170;
    const og = c.createGain();
    og.gain.setValueAtTime(0.04, t + 0.06);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(og); og.connect(this.master);
    o.start(t + 0.06); o.stop(t + 0.14);
  }

  figurePass() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    // soft hurried steps, almost cloth
    for (let i = 0; i < 5; i++) {
      const n = this._noise();
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480;
      const g = c.createGain();
      const tt = t + i * 0.21;
      g.gain.setValueAtTime(0.05 - i * 0.006, tt);
      g.gain.exponentialRampToValueAtTime(0.001, tt + 0.07);
      n.connect(lp); lp.connect(g); g.connect(this.space);
      n.start(tt); n.stop(tt + 0.1);
    }
  }
}
