// Sound effects. The original rbxasset://sounds files are not shipped with
// this recreation; each effect is synthesized with WebAudio from
// measurements of the 2008 files (length, pitch contour, spectrum) recorded
// in docs/RESEARCH.md.
let ctx = null;
let master = null;
let listener = null; // THREE.Vector3 of the camera
let muted = false;
let level = 1; // master volume (places with a volume setting)
let unlocked = false; // browsers only allow audio after a user gesture
const loops = new Map();

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5 * level;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const buffers = {};
function noiseBuffer(kind = 'white', seconds = 2) {
  if (buffers[kind]) return buffers[kind];
  const c = ac();
  const len = Math.floor(c.sampleRate * seconds);
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  let last = 0, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else if (kind === 'pink') { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.05) * 2; }
    else d[i] = w;
  }
  buffers[kind] = b;
  return b;
}

function noise(c, kind = 'white', loop = false) {
  const n = c.createBufferSource();
  n.buffer = noiseBuffer(kind);
  n.loop = loop;
  return n;
}

function env(g, t, a, peak, d, end = 0.0001) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(end, t + a + d);
}
function filt(c, type, f, q = 1) { const x = c.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; }
function chain(...nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }

const SYNTHS = {
  // uuhhh.wav: 0.33 s voiced grunt, f0 ~530 Hz falling to ~260 Hz.
  uuhhh(c, out, t) {
    const src = c.createOscillator(); src.type = 'sawtooth';
    src.frequency.setValueAtTime(530, t);
    src.frequency.exponentialRampToValueAtTime(260, t + 0.3);
    const g = c.createGain(); env(g, t, 0.03, 0.9, 0.29);
    const sum = c.createGain(); sum.gain.value = 1;
    for (const [f, q, a] of [[650, 5, 1.0], [1100, 5, 0.7], [2500, 6, 0.25]]) {
      const bp = filt(c, 'bandpass', f, q); const ga = c.createGain(); ga.gain.value = a * 2.4;
      src.connect(bp); bp.connect(ga); ga.connect(sum);
    }
    chain(sum, g, out);
    src.start(t); src.stop(t + 0.36);
  },
  // button.wav (Jumping): soft click, tick, then a low ~180 Hz hum.
  jump(c, out, t) {
    const n = noise(c); const ng = c.createGain(); env(ng, t, 0.001, 0.4, 0.01);
    chain(n, filt(c, 'bandpass', 1500, 2), ng, out); n.start(t); n.stop(t + 0.02);
    const n2 = noise(c); const ng2 = c.createGain(); env(ng2, t + 0.07, 0.001, 0.2, 0.01);
    chain(n2, filt(c, 'bandpass', 3000, 3), ng2, out); n2.start(t + 0.07); n2.stop(t + 0.09);
    const o = c.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(183, t + 0.08); o.frequency.linearRampToValueAtTime(172, t + 0.29);
    const og = c.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.setValueAtTime(0.25, t + 0.08); og.gain.setValueAtTime(0.25, t + 0.2); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.29);
    chain(o, filt(c, 'lowpass', 3500), og, out); o.start(t); o.stop(t + 0.3);
  },
  // swoosh.wav (FreeFalling): short dull whoosh around 700 Hz.
  swoosh(c, out, t) {
    const n = noise(c); const g = c.createGain(); env(g, t, 0.04, 0.4, 0.13);
    chain(n, filt(c, 'bandpass', 700, 1), g, out); n.start(t); n.stop(t + 0.2);
  },
  landing(c, out, t) {
    const n = noise(c, 'brown'); const g = c.createGain(); env(g, t, 0.003, 0.25, 0.08);
    chain(n, filt(c, 'lowpass', 500), g, out); n.start(t); n.stop(t + 0.12);
  },
  // bfsl-minifigfoots: plastic tap footstep
  step(c, out, t) {
    const n = noise(c); const g = c.createGain(); env(g, t, 0.001, 0.2, 0.025);
    chain(n, filt(c, 'bandpass', 2400 + Math.random() * 1200, 3), g, out); n.start(t); n.stop(t + 0.04);
    const o = c.createOscillator(); o.frequency.value = 200 + Math.random() * 30;
    const og = c.createGain(); env(og, t, 0.001, 0.12, 0.03);
    chain(o, og, out); o.start(t); o.stop(t + 0.05);
  },
  // unsheath.wav: 0.25 s scrape then ringing partials.
  unsheath(c, out, t) {
    const n = noise(c); const g = c.createGain(); env(g, t, 0.01, 0.35, 0.24);
    chain(n, filt(c, 'highpass', 3000), g, out); n.start(t); n.stop(t + 0.27);
    for (const f of [3140, 3530, 4180, 5170, 5810]) {
      const o = c.createOscillator(); o.frequency.value = f;
      const og = c.createGain(); env(og, t + 0.25, 0.005, 0.06, 0.35);
      chain(o, og, out); o.start(t + 0.24); o.stop(t + 0.65);
    }
  },
  // swordslash.wav: ~0.36 s of leading silence then a 0.15 s airy swish.
  slash(c, out, t) {
    const s = t + 0.36;
    const n = noise(c); const f = filt(c, 'bandpass', 3000, 1.2);
    f.frequency.setValueAtTime(3000, s); f.frequency.exponentialRampToValueAtTime(1000, s + 0.15);
    const g = c.createGain(); env(g, s, 0.02, 0.5, 0.14);
    chain(n, filt(c, 'highpass', 600), f, g, out); n.start(s); n.stop(s + 0.2);
  },
  // swordlunge.wav: heavy fwoosh, centroid falling 1.9k -> 0.8k.
  lunge(c, out, t) {
    const n = noise(c); const f = filt(c, 'bandpass', 2000, 1);
    f.frequency.setValueAtTime(2000, t); f.frequency.exponentialRampToValueAtTime(600, t + 0.5);
    const g = c.createGain(); env(g, t, 0.08, 0.6, 0.5);
    chain(n, f, g, out); n.start(t); n.stop(t + 0.62);
  },
  // Rubber band sling shot: bright twang gliding down.
  slingshot(c, out, t) {
    const n = noise(c); const g = c.createGain(); env(g, t, 0.002, 0.3, 0.1);
    chain(n, filt(c, 'highpass', 2500), g, out); n.start(t); n.stop(t + 0.12);
    const o = c.createOscillator(); o.frequency.setValueAtTime(5000, t); o.frequency.exponentialRampToValueAtTime(1200, t + 0.35);
    const og = c.createGain(); env(og, t, 0.003, 0.25, 0.35);
    chain(o, og, out); o.start(t); o.stop(t + 0.4);
  },
  // short spring sound.wav (Superball boing): 0.1 s silence, sawtooth 780 -> 2200 Hz.
  boing(c, out, t) {
    const s = t + 0.1;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(780, s); o.frequency.exponentialRampToValueAtTime(2200, s + 0.35);
    const vib = c.createOscillator(); vib.frequency.value = 12; const vg = c.createGain(); vg.gain.value = 30;
    chain(vib, vg); vg.connect(o.frequency);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.22, s + 0.02); g.gain.setValueAtTime(0.22, s + 0.33); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.36);
    chain(o, filt(c, 'lowpass', 4000), g, out); o.start(s); vib.start(s); o.stop(s + 0.37); vib.stop(s + 0.37);
  },
  // paintball.wav: 65 Hz thump plus hiss burst and air tail.
  paintball(c, out, t) {
    const o = c.createOscillator(); o.frequency.value = 65;
    const og = c.createGain(); env(og, t, 0.004, 0.8, 0.08);
    chain(o, og, out); o.start(t); o.stop(t + 0.1);
    const n = noise(c); const g = c.createGain(); env(g, t, 0.005, 0.35, 0.6);
    chain(n, filt(c, 'highpass', 1800), g, out); n.start(t); n.stop(t + 0.7);
  },
  splat(c, out, t) {
    const n = noise(c); const f = filt(c, 'lowpass', 400);
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2500, t + 0.15);
    const g = c.createGain(); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.15); g.gain.setValueAtTime(0.5, t + 0.18); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    chain(n, f, g, out); n.start(t); n.stop(t + 0.23);
  },
  // Rocket whoosh 01.wav: looping jet hiss (see startLoop)
  whoosh(c, out, t) {
    const n = noise(c, 'pink', true); const g = c.createGain(); g.gain.value = 0.35;
    chain(n, filt(c, 'bandpass', 1200, 0.7), g, out); n.start(t);
    return { stop: (when) => { g.gain.setTargetAtTime(0, when, 0.05); n.stop(when + 0.3); } };
  },
  rocket(c, out, t) {
    const n = noise(c); const g = c.createGain(); env(g, t, 0.01, 0.4, 0.3);
    chain(n, filt(c, 'bandpass', 1200, 0.7), g, out); n.start(t); n.stop(t + 0.35);
  },
  // collide.wav (rocket explosion): crunchy 1 s crash with low thump.
  explosion(c, out, t) {
    const n = noise(c); const g = c.createGain(); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    chain(n, filt(c, 'lowpass', 2500), g, out); n.start(t); n.stop(t + 1.0);
    const o = c.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.5);
    const og = c.createGain(); env(og, t, 0.005, 0.8, 0.6);
    chain(o, og, out); o.start(t); o.stop(t + 0.7);
  },
  // Rocket shot.wav (timebomb): crack then a long low rumble.
  bigboom(c, out, t) {
    const cr = noise(c); const cg = c.createGain(); env(cg, t, 0.002, 0.9, 0.05);
    chain(cr, filt(c, 'bandpass', 650, 0.8), cg, out); cr.start(t); cr.stop(t + 0.08);
    const n = noise(c, 'brown'); const g = c.createGain(); g.gain.setValueAtTime(1.2, t); g.gain.setValueAtTime(1.0, t + 2.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 5.0);
    chain(n, filt(c, 'lowpass', 300), g, out); n.start(t); n.stop(t + 5.0);
  },
  // clickfast.wav (timebomb tick)
  tick(c, out, t) {
    const n = noise(c); const g = c.createGain(); env(g, t, 0.001, 0.3, 0.035);
    chain(n, filt(c, 'bandpass', 1900, 3), g, out); n.start(t); n.stop(t + 0.045);
  },
  // bass.wav (trowel build): 66 Hz synth bass, brightness falling
  bass(c, out, t) {
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 65.4;
    const f = filt(c, 'lowpass', 1500); f.frequency.setValueAtTime(1500, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.78);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.02); g.gain.setValueAtTime(0.5, t + 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.78);
    chain(o, f, g, out); o.start(t); o.stop(t + 0.8);
  },
  // victory.wav: bright "ta-da" chord
  victory(c, out, t) {
    for (const [f, a] of [[517, 0.25], [323, 0.12], [668, 0.12], [775, 0.15], [1055, 0.08], [1034, 0.08]]) {
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + 0.05); g.gain.setValueAtTime(a, t + 0.2); g.gain.exponentialRampToValueAtTime(a * 0.4, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
      chain(o, filt(c, 'lowpass', 3500), g, out); o.start(t); o.stop(t + 1.25);
    }
  },
  // electronicpingshort.wav: 918 Hz square, retriggered 3x
  ping(c, out, t) {
    for (let i = 0; i < 3; i++) {
      const s = t + i * 0.15;
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 918;
      const g = c.createGain(); env(g, s, 0.003, 0.18 * (1 - i * 0.25), 0.14);
      chain(o, filt(c, 'lowpass', 4000), g, out); o.start(s); o.stop(s + 0.16);
    }
  },
  // SWITCH3.wav: camera click
  camclick(c, out, t) {
    const n = noise(c); const g = c.createGain(); env(g, t, 0.001, 0.25, 0.02);
    chain(n, filt(c, 'bandpass', 2500, 2), g, out); n.start(t); n.stop(t + 0.03);
    const o = c.createOscillator(); o.frequency.value = 80; const og = c.createGain(); env(og, t, 0.002, 0.2, 0.1);
    chain(o, og, out); o.start(t); o.stop(t + 0.15);
  },
  // switch.wav: crisp GUI click
  click(c, out, t) {
    const n = noise(c); const g = c.createGain(); env(g, t, 0.001, 0.3, 0.03);
    chain(n, filt(c, 'highpass', 3000), g, out); n.start(t); n.stop(t + 0.04);
  },
  hit(c, out, t) {
    const n = noise(c, 'brown'); const g = c.createGain(); env(g, t, 0.005, 0.6, 0.25);
    chain(n, filt(c, 'lowpass', 800), g, out); n.start(t); n.stop(t + 0.3);
  },
  // metallic clank for the teapots
  clank(c, out, t) {
    const g = c.createGain(); env(g, t, 0.002, 0.5, 0.5);
    for (const [fr, a] of [[523, 1], [1170, 0.6], [1860, 0.4], [2790, 0.25]]) {
      const o = c.createOscillator(); o.frequency.value = fr * (0.97 + Math.random() * 0.06);
      const og = c.createGain(); og.gain.value = a * 0.4;
      chain(o, og, g); o.start(t); o.stop(t + 0.55);
    }
    g.connect(out);
  },
  kerplunk(c, out, t) {
    const o = c.createOscillator(); o.frequency.setValueAtTime(600, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.15);
    const g = c.createGain(); env(g, t, 0.003, 0.4, 0.15);
    chain(o, g, out); o.start(t); o.stop(t + 0.18);
  },
  groan(c, out, t) {
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(85, t); o.frequency.linearRampToValueAtTime(70, t + 1.2);
    const g = c.createGain(); env(g, t, 0.25, 0.5, 1.0);
    chain(o, filt(c, 'bandpass', 450, 3), g, out); o.start(t); o.stop(t + 1.4);
  },
};

const KIT = { noise, noiseBuffer, env, filt, chain };

export const sounds = {
  setListener(v) { listener = v; },
  setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5 * level; },
  setVolume(v) { level = Math.max(0, Math.min(1.5, v)); if (master && !muted) master.gain.value = 0.5 * level; },
  get muted() { return muted; },
  unlock() { unlocked = true; ac(); },
  _gain(position, volume) {
    let vol = volume;
    if (position && listener) {
      const d = listener.distanceTo(position);
      vol *= Math.max(0, Math.min(1, 1 - (d - 20) / 180));
    }
    return vol;
  },
  play(name, position = null, volume = 1) {
    if (muted || !unlocked) return;
    const c = ac();
    if (!c || !SYNTHS[name]) return;
    const vol = this._gain(position, volume);
    if (vol <= 0.01) return;
    const g = c.createGain();
    g.gain.value = vol;
    g.connect(master);
    SYNTHS[name](c, g, c.currentTime + 0.005);
  },
  /**
   * Play a synth defined outside this file: fn(ctx, out, t, kit), where kit has
   * the noise/envelope/filter helpers. Used by places with their own sounds.
   */
  custom(fn, position = null, volume = 1) {
    if (muted || !unlocked) return;
    const c = ac();
    if (!c) return;
    const vol = this._gain(position, volume);
    if (vol <= 0.01) return;
    const g = c.createGain();
    g.gain.value = vol;
    g.connect(master);
    fn(c, g, c.currentTime + 0.005, KIT);
  },
  /**
   * A looping sound defined outside this file: fn(ctx, out, t, kit) builds
   * the nodes and returns {stop(t), ...controls}. Returns that handle plus
   * setVolume(v) (0..1, smoothed).
   */
  customLoop(fn, volume = 1) {
    const c = unlocked ? ac() : null;
    if (!c || muted) return { stop() {}, setVolume() {}, dead: true };
    const g = c.createGain(); g.gain.value = volume; g.connect(master);
    const h = fn(c, g, c.currentTime + 0.005, KIT) || {};
    return {
      ...h, ctx: c,
      stop: () => { try { h.stop?.(c.currentTime + 0.05); } catch { /* already stopped */ } g.gain.setTargetAtTime(0, c.currentTime, 0.02); setTimeout(() => g.disconnect(), 300); },
      setVolume: (v) => g.gain.setTargetAtTime(Math.max(0, v), c.currentTime, 0.06),
    };
  },
  /** Distance attenuation used by play()/custom(), for places that pan their own loops. */
  falloff(position, volume = 1) { return this._gain(position, volume); },
  /** Start a looping sound (rocket whoosh). Returns a handle with stop(). */
  loop(name, volume = 1) {
    const c = unlocked ? ac() : null;
    if (!c || muted) return { stop() {}, setVolume() {} };
    const g = c.createGain(); g.gain.value = volume; g.connect(master);
    const h = SYNTHS[name](c, g, c.currentTime + 0.005);
    return { stop: () => h.stop(c.currentTime), setVolume: (v) => { g.gain.value = v; } };
  },
};
