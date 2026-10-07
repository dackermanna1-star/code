// Sound for the Outbreak, all synthesized. Footsteps that sound like what
// you're walking on; wind always, rain when it rains, birds in the day,
// crickets and the odd owl at night; the infected groaning, shrieking when
// they see you, snarling as they swing; bandits shouting to each other;
// gunshots that echo off the hills when they're far away; doors, glass,
// eating, bandaging, your heart when you've lost too much blood. Sounds are
// placed left and right of you and muffled when there's a wall in the way.
import { sounds } from '../../../engine/Sound.js';
import { O } from '../state.js';

const rnd = (a, b) => a + Math.random() * (b - a);

/** Wire a source into: pan by direction, quieter by distance, muffled behind walls. */
function placed(c, out, pos, o = {}) {
  let node = out;
  if (pos) {
    const cam = O.world.camera;
    const dx = pos.x - cam.position.x, dy = (pos.y ?? cam.position.y) - cam.position.y, dz = pos.z - cam.position.z;
    const d = Math.hypot(dx, dy, dz);
    // left/right: the sound's direction against the way you face
    const yaw = Math.atan2(-dx, -dz) - O.player.yaw;
    const pan = c.createStereoPanner(); pan.pan.value = Math.max(-0.9, Math.min(0.9, -Math.sin(yaw) * Math.min(1, d / 6)));
    const g = c.createGain();
    const ref = o.ref ?? 12, max = o.max ?? 160;
    g.gain.value = d < ref ? 1 : Math.max(0, (ref / d) ** (o.roll ?? 1.0) * (1 - Math.max(0, (d - max * 0.7) / (max * 0.3))));
    pan.connect(g);
    // through a wall: lose the top end
    const blocked = d > 4 && !O.phys.sees(cam.position.x, cam.position.y, cam.position.z, pos.x, (pos.y ?? 0) + 2, pos.z, { terrain: true });
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = blocked ? 900 : Math.max(2000, 20000 - d * 40);
    g.connect(lp); lp.connect(out);
    node = pan;
  }
  return node;
}
function vol(pos, max = 160) { if (!pos) return 1; const cam = O.world.camera.position; return Math.hypot(pos.x - cam.x, pos.z - cam.z) > max ? 0 : 1; }

export class Audio {
  constructor() {
    this.loops = {};
    this.heartT = 0; this.breathT = 0;
    this.ambT = 5;
  }
  play(fn, pos, v = 1, o) { if (!vol(pos, o?.max)) return; sounds.custom((c, out, t, K) => fn(c, placed(c, out, pos, o), t, K), null, v); }

  // --- footsteps and movement ---------------------------------------------------------------------------------------------------
  step(surface, mode, pos) {
    const loud = mode === 'sprint' ? 1 : mode === 'jog' ? 0.7 : mode === 'crouch' || mode === 'prone' ? 0.25 : 0.4;
    this.play((c, out, t, K) => {
      const n = K.noise(c); const g = c.createGain();
      const f = { grass: [900, 1.2, 0.09], leaves: [2200, 0.8, 0.12], gravel: [2600, 0.6, 0.1], concrete: [1500, 2.5, 0.05], wood: [500, 3, 0.08], metal: [2400, 8, 0.12], water: [1200, 0.7, 0.18] }[surface] || [1000, 1, 0.08];
      K.env(g, t, 0.004, 0.5 * loud, f[2]);
      K.chain(n, K.filt(c, surface === 'grass' || surface === 'leaves' || surface === 'water' ? 'bandpass' : 'peaking', f[0] * rnd(0.85, 1.15), f[1]), K.filt(c, 'lowpass', 5000), g, out);
      n.start(t); n.stop(t + f[2] + 0.05);
      if (surface === 'wood' || surface === 'concrete') { const o = c.createOscillator(); o.frequency.value = surface === 'wood' ? rnd(110, 140) : rnd(70, 90); const og = c.createGain(); K.env(og, t, 0.002, 0.25 * loud, 0.05); o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.08); }
    }, null, 0.55);
  }
  jump() { this.cloth(0.8); }
  land(drop, pos = null) { this.play((c, out, t, K) => { const n = K.noise(c, 'brown'); const g = c.createGain(); K.env(g, t, 0.003, Math.min(1.2, 0.3 + drop * 0.03), 0.15); K.chain(n, K.filt(c, 'lowpass', 400), g, out); n.start(t); n.stop(t + 0.25); }, pos, 0.7, pos ? { ref: 20, max: 700 } : undefined); }
  cloth(v = 0.5) { this.play((c, out, t, K) => { const n = K.noise(c); const g = c.createGain(); K.env(g, t, 0.02, 0.25 * v, 0.18); K.chain(n, K.filt(c, 'bandpass', 2400, 0.7), g, out); n.start(t); n.stop(t + 0.3); }, null, 0.5); }
  ladder() { this.rung(); }
  rung() { this.play((c, out, t, K) => { const o = c.createOscillator(); o.frequency.value = rnd(300, 380); const g = c.createGain(); K.env(g, t, 0.002, 0.25, 0.08); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.1); const n = K.noise(c); const ng = c.createGain(); K.env(ng, t, 0.002, 0.2, 0.04); K.chain(n, K.filt(c, 'bandpass', 3000, 2), ng, out); n.start(t); n.stop(t + 0.06); }, null, 0.6); }

  // --- you ---------------------------------------------------------------------------------------------------------------------------
  hurt(dmg) {
    this.play((c, out, t, K) => {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(rnd(160, 200), t); o.frequency.exponentialRampToValueAtTime(rnd(90, 110), t + 0.25);
      const g = c.createGain(); K.env(g, t, 0.01, 0.3, 0.25); K.chain(o, K.filt(c, 'bandpass', 700, 2), g, out); o.start(t); o.stop(t + 0.3);
      const n = K.noise(c, 'brown'); const ng = c.createGain(); K.env(ng, t, 0.002, Math.min(1, 0.3 + dmg / 20), 0.12); K.chain(n, K.filt(c, 'lowpass', 300), ng, out); n.start(t); n.stop(t + 0.2);
    }, null, 0.7);
  }
  bone() { this.play((c, out, t, K) => { for (let i = 0; i < 3; i++) { const n = K.noise(c); const g = c.createGain(); K.env(g, t + i * 0.025, 0.001, 0.9, 0.03); K.chain(n, K.filt(c, 'bandpass', 1800 + i * 600, 3), g, out); n.start(t + i * 0.025); n.stop(t + i * 0.025 + 0.05); } }, null, 0.9); }
  vomit() { this.play((c, out, t, K) => { const n = K.noise(c, 'pink'); const g = c.createGain(); K.env(g, t, 0.05, 0.6, 0.7); K.chain(n, K.filt(c, 'bandpass', 400, 1.5), g, out); n.start(t); n.stop(t + 0.9); }, null, 0.7); }
  eat() { for (let i = 0; i < 5; i++) setTimeout(() => this.play((c, out, t, K) => { const n = K.noise(c); const g = c.createGain(); K.env(g, t, 0.005, 0.35, 0.09); K.chain(n, K.filt(c, 'bandpass', rnd(800, 1600), 1.5), g, out); n.start(t); n.stop(t + 0.12); }, null, 0.6), i * 550 + 300); }
  drink() { for (let i = 0; i < 4; i++) setTimeout(() => this.play((c, out, t, K) => { const o = c.createOscillator(); o.frequency.setValueAtTime(rnd(250, 350), t); o.frequency.exponentialRampToValueAtTime(rnd(500, 700), t + 0.12); const g = c.createGain(); K.env(g, t, 0.01, 0.2, 0.14); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.18); }, null, 0.6), i * 500 + 300); }
  bandage() { for (let i = 0; i < 6; i++) setTimeout(() => this.play((c, out, t, K) => { const n = K.noise(c); const g = c.createGain(); K.env(g, t, 0.05, 0.3, 0.25); K.chain(n, K.filt(c, 'highpass', 2500), g, out); n.start(t); n.stop(t + 0.35); }, null, 0.5), i * 520); }
  pills() { this.play((c, out, t, K) => { for (let i = 0; i < 5; i++) { const o = c.createOscillator(); o.frequency.value = rnd(3000, 5000); const g = c.createGain(); K.env(g, t + i * 0.05, 0.001, 0.15, 0.03); o.connect(g); g.connect(out); o.start(t + i * 0.05); o.stop(t + i * 0.05 + 0.05); } }, null, 0.5); }
  click() { this.play((c, out, t, K) => { const n = K.noise(c); const g = c.createGain(); K.env(g, t, 0.001, 0.4, 0.02); K.chain(n, K.filt(c, 'bandpass', 3500, 4), g, out); n.start(t); n.stop(t + 0.04); }, null, 0.5); }
  pickup() { this.cloth(0.6); this.play((c, out, t, K) => { const n = K.noise(c); const g = c.createGain(); K.env(g, t, 0.005, 0.25, 0.06); K.chain(n, K.filt(c, 'bandpass', 1400, 2), g, out); n.start(t); n.stop(t + 0.1); }, null, 0.5); }
  equip(mode) { if (mode === 'gun') return; this.cloth(0.5); }
  ui() { this.play((c, out, t) => { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 900; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.08); }, null, 0.4); }
  jam() { this.play((c, out, t, K) => { const n = K.noise(c); const g = c.createGain(); K.env(g, t, 0.001, 0.6, 0.05); K.chain(n, K.filt(c, 'bandpass', 2000, 5), g, out); n.start(t); n.stop(t + 0.08); }, null, 0.6); }
  hitmark(head) { this.play((c, out, t) => { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = head ? 1900 : 1300; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + (head ? 0.12 : 0.06)); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.15); }, null, 0.4); }
  whiz() { this.play((c, out, t, K) => { const n = K.noise(c); const f = K.filt(c, 'bandpass', 3000, 4); f.frequency.setValueAtTime(4500, t); f.frequency.exponentialRampToValueAtTime(800, t + 0.15); const g = c.createGain(); K.env(g, t, 0.02, 0.6, 0.12); K.chain(n, f, g, out); n.start(t); n.stop(t + 0.2); const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 1700; const og = c.createGain(); K.env(og, t, 0.001, 0.2, 0.02); K.chain(o, K.filt(c, 'highpass', 1200), og, out); o.start(t); o.stop(t + 0.03); }, null, 0.7); }
  swish(heavy) { this.play((c, out, t, K) => { const n = K.noise(c); const f = K.filt(c, 'bandpass', 900, 1.2); f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(heavy ? 1600 : 2200, t + 0.15); const g = c.createGain(); K.env(g, t, 0.04, heavy ? 0.5 : 0.35, 0.16); K.chain(n, f, g, out); n.start(t); n.stop(t + 0.25); }, null, 0.6); }
  melee(kind, flesh, mat) {
    this.play((c, out, t, K) => {
      const n = K.noise(c, flesh ? 'brown' : 'white'); const g = c.createGain();
      K.env(g, t, 0.002, flesh ? 1.0 : 0.6, flesh ? 0.12 : 0.08);
      K.chain(n, K.filt(c, flesh ? 'lowpass' : 'bandpass', flesh ? (kind === 'chop' ? 900 : 500) : mat === 'metal' ? 3000 : 1100, flesh ? 1 : 3), g, out); n.start(t); n.stop(t + 0.2);
      if (flesh && kind === 'chop') { const n2 = K.noise(c); const g2 = c.createGain(); K.env(g2, t + 0.01, 0.002, 0.4, 0.05); K.chain(n2, K.filt(c, 'highpass', 2500), g2, out); n2.start(t); n2.stop(t + 0.1); }
    }, null, 0.8);
  }
  flesh(pos) { this.play((c, out, t, K) => { const n = K.noise(c, 'brown'); const g = c.createGain(); K.env(g, t, 0.002, 0.8, 0.09); K.chain(n, K.filt(c, 'lowpass', 600), g, out); n.start(t); n.stop(t + 0.12); }, pos, 0.6, { max: 80 }); }
  impact(mat, pos) {
    this.play((c, out, t, K) => {
      const n = K.noise(c); const g = c.createGain();
      if (mat === 'metal') { K.env(g, t, 0.001, 0.5, 0.15); K.chain(n, K.filt(c, 'bandpass', 3800, 7), g, out); const o = c.createOscillator(); o.frequency.value = rnd(2400, 3600); const og = c.createGain(); K.env(og, t, 0.001, 0.12, 0.25); o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.3); }
      else if (mat === 'wood') { K.env(g, t, 0.001, 0.5, 0.07); K.chain(n, K.filt(c, 'bandpass', 700, 2), g, out); }
      else { K.env(g, t, 0.001, 0.4, 0.06); K.chain(n, K.filt(c, 'bandpass', 1200, 1.2), g, out); }
      n.start(t); n.stop(t + 0.2);
    }, pos, 0.55, { max: 120 });
  }
  glass(pos) { this.play((c, out, t, K) => { for (let i = 0; i < 9; i++) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = rnd(2500, 7000); const g = c.createGain(); const tt = t + i * rnd(0.01, 0.04); K.env(g, tt, 0.001, rnd(0.08, 0.2), rnd(0.05, 0.3)); o.connect(g); g.connect(out); o.start(tt); o.stop(tt + 0.4); } const n = K.noise(c); const g = c.createGain(); K.env(g, t, 0.001, 0.6, 0.1); K.chain(n, K.filt(c, 'highpass', 3000), g, out); n.start(t); n.stop(t + 0.15); }, pos, 0.8, { max: 140 }); }
  door(pos, open) { this.play((c, out, t, K) => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(open ? rnd(180, 240) : rnd(260, 300), t); o.frequency.linearRampToValueAtTime(open ? rnd(320, 420) : rnd(140, 180), t + 0.45); const g = c.createGain(); K.env(g, t, 0.05, 0.06, 0.4); K.chain(o, K.filt(c, 'bandpass', 900, 4), g, out); o.start(t); o.stop(t + 0.55); if (!open) { const n = K.noise(c, 'brown'); const ng = c.createGain(); K.env(ng, t + 0.45, 0.002, 0.7, 0.12); K.chain(n, K.filt(c, 'lowpass', 300), ng, out); n.start(t + 0.45); n.stop(t + 0.6); } }, pos, 0.7, { max: 90 }); }
  bash(pos) { this.play((c, out, t, K) => { const n = K.noise(c, 'brown'); const g = c.createGain(); K.env(g, t, 0.002, 1.2, 0.18); K.chain(n, K.filt(c, 'lowpass', 500), g, out); n.start(t); n.stop(t + 0.25); const o = c.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.15); const og = c.createGain(); K.env(og, t, 0.002, 0.7, 0.15); o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.2); }, pos, 0.9, { max: 120 }); }
  breakDoor(pos) { this.bash(pos); this.play((c, out, t, K) => { for (let i = 0; i < 4; i++) { const n = K.noise(c); const g = c.createGain(); K.env(g, t + i * 0.04, 0.001, 0.6, 0.06); K.chain(n, K.filt(c, 'bandpass', 600 + i * 300, 2), g, out); n.start(t + i * 0.04); n.stop(t + i * 0.04 + 0.08); } }, pos, 0.9, { max: 150 }); }

  // --- the infected ------------------------------------------------------------------------------------------------------------------
  zombie(kind, pos) {
    const v = { idle: 0.45, groan: 0.55, alert: 0.9, chase: 0.6, attack: 0.75, hit: 0.6, hurt: 0.7, die: 0.7 }[kind] ?? 0.5;
    this.play((c, out, t, K) => {
      const base = rnd(70, 120) * (kind === 'alert' ? 2.6 : kind === 'attack' ? 1.6 : kind === 'die' ? 0.9 : 1);
      const len = kind === 'alert' ? rnd(0.7, 1.1) : kind === 'attack' ? 0.35 : kind === 'die' ? 1.2 : kind === 'hit' ? 0.15 : rnd(0.8, 1.6);
      // a rough voice: a buzzing saw through two formant filters, plus breath
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(base, t);
      if (kind === 'alert') { o.frequency.linearRampToValueAtTime(base * 1.4, t + len * 0.3); o.frequency.linearRampToValueAtTime(base * 0.8, t + len); }
      else o.frequency.linearRampToValueAtTime(base * rnd(0.6, 0.9), t + len);
      const lfo = c.createOscillator(); lfo.frequency.value = rnd(7, 18); const lg = c.createGain(); lg.gain.value = base * 0.15; lfo.connect(lg); lg.connect(o.frequency);
      const f1 = K.filt(c, 'bandpass', kind === 'alert' ? 1100 : rnd(500, 750), 4), f2 = K.filt(c, 'bandpass', kind === 'alert' ? 2600 : rnd(1100, 1500), 5);
      const g = c.createGain(); K.env(g, t, kind === 'hit' ? 0.01 : 0.08, kind === 'alert' ? 0.7 : 0.45, len);
      o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(out);
      const n = K.noise(c, 'pink'); const ng = c.createGain(); K.env(ng, t, 0.05, kind === 'alert' ? 0.5 : 0.25, len); K.chain(n, K.filt(c, 'bandpass', kind === 'alert' ? 2500 : 900, 1.5), ng, out);
      o.start(t); o.stop(t + len + 0.1); lfo.start(t); lfo.stop(t + len + 0.1); n.start(t); n.stop(t + len + 0.1);
    }, pos, v, { ref: 10, max: kind === 'alert' ? 140 : 90 });
  }

  // --- bandits ------------------------------------------------------------------------------------------------------------------------
  voice(kind, pos) {
    // no words, but the shape of a shout: a few syllables of a gruff voice
    const n = kind === 'hurt' || kind === 'die' ? 1 : 2 + Math.floor(Math.random() * 2);
    this.play((c, out, t, K) => {
      let tt = t;
      for (let i = 0; i < n; i++) {
        const len = kind === 'die' ? 0.8 : rnd(0.12, 0.22);
        const o = c.createOscillator(); o.type = 'sawtooth';
        const f0 = kind === 'hurt' || kind === 'die' ? rnd(170, 210) : kind === 'spot' ? rnd(160, 190) : rnd(110, 140);
        o.frequency.setValueAtTime(f0, tt); o.frequency.linearRampToValueAtTime(f0 * (kind === 'die' ? 0.6 : rnd(0.85, 1.15)), tt + len);
        const g = c.createGain(); K.env(g, tt, 0.02, kind === 'chatter' ? 0.12 : 0.35, len);
        const vowel = [[700, 1200], [400, 2000], [500, 900], [300, 2300]][Math.floor(Math.random() * 4)];
        const f1 = K.filt(c, 'bandpass', vowel[0], 6), f2 = K.filt(c, 'bandpass', vowel[1], 8);
        o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(out);
        o.start(tt); o.stop(tt + len + 0.05);
        tt += len + rnd(0.04, 0.1);
      }
    }, pos, kind === 'chatter' ? 0.5 : 0.8, { ref: 10, max: kind === 'spot' ? 160 : 100 });
  }

  // --- far away -------------------------------------------------------------------------------------------------------------------------
  /** A shot heard from a distance: a delayed crack and a long rolling echo off the hills. */
  distantShot(pos, kind) {
    const cam = O.world.camera.position, d = Math.hypot(pos.x - cam.x, pos.z - cam.z);
    if (d < 150) return;
    const delay = Math.min(2.5, d / 1100); // sound is slower than light
    sounds.custom((c, out, t, K) => {
      const tt = t + delay;
      const node = placed(c, out, pos, { ref: 150, max: 2500, roll: 0.7 });
      const n = K.noise(c, 'pink'); const g = c.createGain(); K.env(g, tt, 0.004, 0.8, 0.25);
      K.chain(n, K.filt(c, 'lowpass', Math.max(500, 3000 - d)), g, node); n.start(tt); n.stop(tt + 0.35);
      const e = K.noise(c, 'brown'); const eg = c.createGain(); K.env(eg, tt + 0.1, 0.1, 0.35, 1.8);
      K.chain(e, K.filt(c, 'lowpass', 500), eg, node); e.start(tt + 0.1); e.stop(tt + 2.2);
    }, null, Math.min(1, 1.6 * (kind === 'sniper' ? 1.4 : 1)));
  }

  // --- the world going on around you -----------------------------------------------------------------------------------------------------
  update(dt) {
    const P = O.player, S = O.survival;
    if (!P) return;
    const sky = O.sky, w = sky?.w || {};
    const night = sky?.state?.night ?? 0;
    // wind: always there, more on the hills and in a storm
    if (!this.loops.wind || this.loops.wind.dead) this.loops.wind = sounds.customLoop((c, out, t, K) => {
      const n = K.noise(c, 'pink', true); const f = K.filt(c, 'bandpass', 500, 0.6); const g = c.createGain(); g.gain.value = 0.25;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.13; const lg = c.createGain(); lg.gain.value = 250; lfo.connect(lg); lg.connect(f.frequency);
      K.chain(n, f, g, out); n.start(t); lfo.start(t);
      return { stop: (tt) => { n.stop(tt); lfo.stop(tt); } };
    }, 0);
    const height = Math.max(0, P.pos.y - 60) / 300;
    this.loops.wind.setVolume?.(Math.min(0.5, (0.07 + (w.wind || 0.2) * 0.25 + height * 0.15) * (P.indoors ? 0.35 : 1)));
    // rain
    const rain = w.rain || 0;
    if (rain > 0.05 && (!this.loops.rain || this.loops.rain.dead)) this.loops.rain = sounds.customLoop((c, out, t, K) => {
      const n = K.noise(c, 'white', true); const f = K.filt(c, 'highpass', 900); const f2 = K.filt(c, 'lowpass', 7000); K.chain(n, f, f2, out); n.start(t);
      return { stop: (tt) => n.stop(tt) };
    }, 0);
    this.loops.rain?.setVolume?.(rain * (P.indoors ? 0.12 : 0.35));
    // birds by day, crickets by night (not in a storm, not deep indoors)
    this.ambT -= dt;
    if (this.ambT <= 0) {
      this.ambT = rnd(2, 6);
      if (rain < 0.3 && !P.indoors) {
        const forest = O.terrain.sample(O.terrain.forest, P.pos.x, P.pos.z);
        const pos = { x: P.pos.x + rnd(-40, 40), y: P.pos.y + 15, z: P.pos.z + rnd(-40, 40) };
        if (night < 0.3) { if (Math.random() < 0.4 + forest * 0.5) this.bird(pos); }
        else if (Math.random() < 0.8) this.cricket(pos); else if (Math.random() < 0.15) this.owl(pos);
      }
    }
    // your heart and your breath
    if (S && S.alive && O.session?.state === 'play') {
      this.heartT -= dt;
      if (S.blood < 55 && this.heartT <= 0) { this.heartT = 0.45 + S.blood / 100; this.play((c, out, t) => { for (const [dt2, f] of [[0, 55], [0.16, 48]]) { const o = c.createOscillator(); o.frequency.value = f; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + dt2); g.gain.exponentialRampToValueAtTime(0.5 * (1 - S.blood / 60), t + dt2 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dt2 + 0.16); o.connect(g); g.connect(out); o.start(t + dt2); o.stop(t + dt2 + 0.2); } }, null, 0.8); }
      this.breathT -= dt;
      if (P.stamina < 30 && this.breathT <= 0) { this.breathT = 0.7; this.play((c, out, t, K) => { const n = K.noise(c, 'pink'); const g = c.createGain(); K.env(g, t, 0.15, 0.2 * (1 - P.stamina / 30), 0.4); K.chain(n, K.filt(c, 'bandpass', 1000, 1), g, out); n.start(t); n.stop(t + 0.6); }, null, 0.6); }
    }
  }
  bird(pos) {
    this.play((c, out, t, K) => {
      const n = 2 + Math.floor(Math.random() * 5), f0 = rnd(2200, 4200), kind = Math.random();
      for (let i = 0; i < n; i++) {
        const o = c.createOscillator(); o.type = 'sine';
        const tt = t + i * rnd(0.09, 0.16);
        o.frequency.setValueAtTime(f0 * rnd(0.9, 1.1), tt);
        o.frequency.exponentialRampToValueAtTime(f0 * (kind < 0.5 ? 1.4 : 0.7), tt + 0.07);
        const g = c.createGain(); K.env(g, tt, 0.005, 0.12, 0.07);
        o.connect(g); g.connect(out); o.start(tt); o.stop(tt + 0.1);
      }
    }, pos, 0.5, { ref: 20, max: 120 });
  }
  cricket(pos) { this.play((c, out, t, K) => { for (let i = 0; i < 6; i++) { const o = c.createOscillator(); o.frequency.value = rnd(4300, 4700); const g = c.createGain(); const tt = t + i * 0.06; K.env(g, tt, 0.003, 0.05, 0.03); o.connect(g); g.connect(out); o.start(tt); o.stop(tt + 0.05); } }, pos, 0.5, { ref: 20, max: 80 }); }
  owl(pos) { this.play((c, out, t, K) => { for (const [dt2, len] of [[0, 0.25], [0.45, 0.6]]) { const o = c.createOscillator(); o.frequency.setValueAtTime(420, t + dt2); o.frequency.linearRampToValueAtTime(380, t + dt2 + len); const g = c.createGain(); K.env(g, t + dt2, 0.05, 0.12, len); o.connect(g); g.connect(out); o.start(t + dt2); o.stop(t + dt2 + len + 0.05); } }, pos, 0.5, { ref: 30, max: 200 }); }
  /** Something big blowing up: a crack, a deep boom and a long roll off the hills, late if it's far. */
  explosion(pos, size = 1) {
    const cam = O.world.camera.position, d = Math.hypot(pos.x - cam.x, pos.z - cam.z);
    if (d > 5000) return;
    const delay = Math.min(4, d / 1100);
    sounds.custom((c, out, t, K) => {
      const tt = t + delay;
      const node = placed(c, out, pos, { ref: 80, max: 5000, roll: 0.55 });
      if (d < 600) { const n = K.noise(c); const g = c.createGain(); K.env(g, tt, 0.002, 1, 0.12); K.chain(n, K.filt(c, 'lowpass', 6000 - d * 8), g, node); n.start(tt); n.stop(tt + 0.2); }
      const b = K.noise(c, 'brown'); const bg = c.createGain(); K.env(bg, tt, 0.01, 1.4 * size, 2.8); K.chain(b, K.filt(c, 'lowpass', Math.max(160, 600 - d * 0.2)), bg, node); b.start(tt); b.stop(tt + 3.2);
      const o = c.createOscillator(); o.frequency.setValueAtTime(70, tt); o.frequency.exponentialRampToValueAtTime(28, tt + 1.2); const og = c.createGain(); K.env(og, tt, 0.01, 0.9 * size, 1.3); o.connect(og); og.connect(node); o.start(tt); o.stop(tt + 1.5);
      const e = K.noise(c, 'brown'); const eg = c.createGain(); K.env(eg, tt + 0.4, 0.3, 0.5, 3.5); K.chain(e, K.filt(c, 'lowpass', 300), eg, node); e.start(tt + 0.4); e.stop(tt + 4.5);
    }, null, 1);
  }
  thunder(d = 800) {
    sounds.custom((c, out, t, K) => {
      const tt = t + Math.min(3, d / 1100);
      const n = K.noise(c, 'brown'); const g = c.createGain(); K.env(g, tt, 0.05, 1.2, 2.5); K.chain(n, K.filt(c, 'lowpass', 250), g, out); n.start(tt); n.stop(tt + 3);
    }, null, 0.9);
  }
}
