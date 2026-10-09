// The sound of Vice City, all synthesized with WebAudio: positioned one-shots
// (panned by the camera, rolled off by distance), an engine note for each of
// the nearest vehicles (by kind and RPM), tyre squeal, horns and sirens,
// crashes, explosions, screams, splashes, footsteps, and the ambience -
// the city's hum, the surf on the beach, gulls by day, crickets at night.
//
//   V.audio = new Audio()
//   play(fn, pos, vol, {ref, max})   fn(ctx, out, t, K) builds a sound into out
//   named: step, land, punch, flesh, scream, splash, crash, glass, explosion, pickup, ui, horn, whiz, hitmark, jingle(kind)
//   update(dt)  pause(on)  dispose()
// It also listens to V.events (crashes, explosions, tyres, deaths) by itself.
import * as THREE from 'three';
import { V } from '../state.js';
import { sounds } from '../../../engine/Sound.js';

const ENGINES = 5;
const _v = new THREE.Vector3();

export class Audio {
  constructor() {
    this.loops = [];       // engine voices: {veh, h}
    this.amb = null;
    this.paused = false;
    this.offs = [];
    const on = (n, f) => this.offs.push(V.events.on(n, f));
    on('vehicle:crash', (e) => this.crash(e.pos, e.speed, e.kind));
    on('vehicle:destroyed', (e) => this.explosion(e.veh.pos, 1.3));
    on('vehicle:tyre', (e) => this.play(pop, e.pos, 0.9));
    on('death', (e) => { if (Math.random() < 0.7) this.scream(e.ped?.pos, true); });
    on('noise', (e) => { if (e.kind === 'explosion' && !e.src?.isVehicleBoom) this.explosion(e.pos, 1); });
    on('pickup', (e) => this.pickup(e.pos));
    on('vehicle:eject', (e) => this.play(thud, e.veh.pos, 0.8));
  }

  /** Positioned (or not) synth: pan by the camera, roll off by distance. */
  play(fn, pos = null, vol = 1, o = {}) {
    if (this.paused) return;
    let gain = vol, pan = 0;
    if (pos) {
      const cam = V.world.camera;
      const dx = pos.x - cam.position.x, dy = pos.y - cam.position.y, dz = pos.z - cam.position.z;
      const d = Math.hypot(dx, dy, dz), ref = o.ref ?? 14, max = o.max ?? 220;
      if (d > max) return;
      gain *= Math.min(1, ref / Math.max(ref, d)) * Math.min(1, (max - d) / (max * 0.25));
      // pan: the sound's bearing against the camera's right vector
      const yaw = V.cam?.yaw ?? 0, rx = Math.cos(yaw), rz = -Math.sin(yaw);
      pan = Math.max(-0.85, Math.min(0.85, (dx * rx + dz * rz) / Math.max(1, Math.hypot(dx, dz))));
    }
    if (gain < 0.01) return;
    sounds.custom((c, out, t, K) => {
      const p = c.createStereoPanner(); p.pan.value = pan; p.connect(out);
      fn(c, p, t, K);
    }, null, gain);
  }

  // ---- named sounds ----
  step(pos, surface = 'concrete', run = false) { this.play((c, o, t, K) => step(c, o, t, K, surface), pos, run ? 0.32 : 0.22, { ref: 6, max: 40 }); }
  land(pos, h) { this.play(thud, pos, Math.min(1, 0.3 + h / 30), { ref: 6, max: 60 }); }
  punch(pos, heavy) { this.play((c, o, t, K) => punch(c, o, t, K, heavy), pos, heavy ? 1 : 0.8, { ref: 8, max: 80 }); }
  flesh(pos) { this.play(flesh, pos, 0.7, { ref: 8, max: 70 }); }
  scream(pos, dying = false) { if (pos) this.play((c, o, t) => scream(c, o, t, dying), pos, 0.5, { ref: 10, max: 160 }); }
  splash(pos, size = 1) { this.play((c, o, t, K) => splash(c, o, t, K, size), pos, Math.min(1, 0.4 + size * 0.3), { ref: 12, max: 160 }); }
  crash(pos, speed = 20, kind) {
    if (kind === 'ped') return this.play(thud, pos, 0.9, { ref: 10, max: 120 });
    this.play((c, o, t, K) => crash(c, o, t, K, Math.min(1, speed / 60)), pos, Math.min(1.2, 0.3 + speed / 60), { ref: 16, max: 260 });
  }
  glass(pos) { this.play(glass, pos, 0.8, { ref: 10, max: 120 }); }
  explosion(pos, size = 1) {
    if (!pos) return;
    const d = V.world.camera.position.distanceTo(pos);
    // far booms arrive late and dull
    const late = d / 1100;
    setTimeout(() => this.play((c, o, t, K) => boom(c, o, t, K, size, d), pos, Math.min(1.6, 0.9 * size), { ref: 40, max: 2400 }), late * 1000);
    if (d < 120) V.cam?.shake(Math.min(2.5, (1.6 * size * (120 - d)) / 120));
  }
  pickup(pos) { this.play(chime, pos, 0.6, { ref: 10, max: 60 }); }
  ui() { this.play(click, null, 0.4); }
  hitmark(head) { this.play((c, o, t) => tick(c, o, t, head), null, 0.35); }
  whiz(pos) { this.play(whiz, pos, 0.5, { ref: 4, max: 30 }); }
  jingle(kind) { this.play((c, o, t) => jingle(c, o, t, kind), null, 0.6); }

  pause(on) { this.paused = on; if (on) this._stopAll(); }

  // ---- every frame: engines, sirens, ambience ----
  update(dt) {
    const state = V.session?.state;
    const live = state === 'play' || state === 'wasted' || state === 'busted';
    if (!live || this.paused) { this._stopAll(); return; }
    const cam = V.world.camera;
    sounds.setListener?.(cam.position);
    // the nearest vehicles with something to say
    const list = V.vehicles?.list || [];
    const cand = [];
    for (const v of list) {
      if (v.dead || !(v.engineOn || v.siren || v.ctl?.horn || (v.kind === 'heli' && v.rotor > 0.05))) continue;
      const d = v.pos.distanceTo(cam.position);
      if (d < 300) cand.push([d - (v.driver?.isPlayer ? 1000 : 0), v]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    const want = new Set(cand.slice(0, ENGINES).map((c) => c[1]));
    for (const L of [...this.loops]) if (!want.has(L.veh)) { L.h.stop(); this.loops.splice(this.loops.indexOf(L), 1); }
    for (const v of want) if (!this.loops.some((L) => L.veh === v)) { const h = sounds.customLoop((c, out) => engineVoice(c, out, v.kind), 0); if (!h.dead) this.loops.push({ veh: v, h }); }
    const yaw = V.cam?.yaw ?? 0, rx = Math.cos(yaw), rz = -Math.sin(yaw);
    for (const L of this.loops) {
      const v = L.veh, h = L.h;
      const d = v.pos.distanceTo(cam.position), mine = v.driver?.isPlayer;
      const roll = mine ? 1 : Math.min(1, 18 / Math.max(18, d)) * Math.max(0, 1 - d / 300);
      const rpm = v.rpm ?? Math.min(1, Math.abs(v.speed || 0) / 120);
      const thr = Math.abs(v.ctl?.throttle || 0);
      h.set?.(v.kind === 'heli' ? (v.rotor ?? 1) : rpm, thr, v.engineOn ? 1 : 0, Math.min(1, v.skid || 0), !!v.ctl?.horn, !!v.siren, v.def?.siren ? 1 : 0);
      const dx = v.pos.x - cam.position.x, dz = v.pos.z - cam.position.z;
      h.pan?.(mine ? 0 : Math.max(-0.8, Math.min(0.8, (dx * rx + dz * rz) / Math.max(1, Math.hypot(dx, dz)))));
      h.setVolume(roll * (mine ? 0.5 : 0.65));
    }
    // ambience: city hum, the sea, birds or crickets
    if (!this.amb) { const a = sounds.customLoop(ambience, 0); if (!a.dead) this.amb = a; }
    if (this.amb) {
      const P = V.player?.pos || cam.position;
      const coast = V.ground?.coastAt ? V.ground.coastAt(cam.position.x, cam.position.z) : 999;
      const beachy = V.ground?.kindAt && [1, 2].includes(V.ground.kindAt(P.x, P.z)) ? 1 : 0;
      const sea = Math.max(beachy, Math.max(0, 1 - Math.abs(coast) / 260));
      const night = V.sky?.state?.night ?? 0;
      const D = V.plan.districtAt(P.x, P.z);
      const city = Math.min(1, (D?.peds ?? 0.5) * 0.9 + 0.15) * (1 - sea * 0.5);
      const alt = Math.max(0, cam.position.y - 60) / 300;
      this.amb.set?.(city * (1 - alt), sea * (1 - alt), (1 - night) * (1 - alt) * 0.6, night * (1 - alt), Math.min(1, alt + (V.player?.vehicle ? Math.abs(V.player.vehicle.speed || 0) / 200 : 0)));
      this.amb.setVolume(0.55);
    }
  }
  _stopAll() { for (const L of this.loops) L.h.stop(); this.loops.length = 0; if (this.amb) { this.amb.stop(); this.amb = null; } }
  dispose() { this._stopAll(); for (const f of this.offs) f(); }
}

// ---- voices -------------------------------------------------------------------------------------------------
/** An engine: detuned saw + square through a low-pass, pitch by RPM; tyre squeal, horn and siren on top. */
function engineVoice(c, out, kind) {
  const mix = c.createGain(); mix.gain.value = 1;
  const pan = c.createStereoPanner(); mix.connect(pan); pan.connect(out);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 2; lp.connect(mix);
  const eg = c.createGain(); eg.gain.value = 0; eg.connect(lp);
  const base = { car: 38, bike: 62, boat: 30, heli: 11, plane: 44 }[kind] || 38;
  const o1 = c.createOscillator(); o1.type = 'sawtooth';
  const o2 = c.createOscillator(); o2.type = kind === 'bike' ? 'square' : 'sawtooth'; o2.detune.value = 9;
  const o3 = c.createOscillator(); o3.type = 'square';
  const g3 = c.createGain(); g3.gain.value = 0.35;
  o1.connect(eg); o2.connect(eg); o3.connect(g3); g3.connect(eg);
  // rotor: chop the noise with a low oscillator
  const nz = c.createBufferSource(); nz.buffer = noiseBuf(c); nz.loop = true;
  const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = kind === 'heli' ? 180 : kind === 'boat' ? 420 : 1200; nf.Q.value = kind === 'heli' ? 0.8 : 1.2;
  const ng = c.createGain(); ng.gain.value = 0; nz.connect(nf); nf.connect(ng); ng.connect(mix);
  const chop = c.createOscillator(); chop.type = 'sine'; chop.frequency.value = 11;
  const chopG = c.createGain(); chopG.gain.value = kind === 'heli' ? 0.5 : 0; chop.connect(chopG); chopG.connect(ng.gain);
  // tyres: squeal
  const sq = c.createOscillator(); sq.type = 'triangle'; sq.frequency.value = 780;
  const sqf = c.createBiquadFilter(); sqf.type = 'bandpass'; sqf.frequency.value = 900; sqf.Q.value = 4;
  const sqg = c.createGain(); sqg.gain.value = 0; sq.connect(sqf); sqf.connect(sqg); sqg.connect(mix);
  const sqLfo = c.createOscillator(); sqLfo.frequency.value = 23; const sqLfoG = c.createGain(); sqLfoG.gain.value = 40; sqLfo.connect(sqLfoG); sqLfoG.connect(sq.frequency);
  // horn: two square tones
  const h1 = c.createOscillator(), h2 = c.createOscillator(); h1.type = h2.type = 'square'; h1.frequency.value = 392; h2.frequency.value = 494;
  const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 1800;
  const hg = c.createGain(); hg.gain.value = 0; h1.connect(hf); h2.connect(hf); hf.connect(hg); hg.connect(mix);
  // siren: a wail swept by a slow oscillator
  const si = c.createOscillator(); si.type = 'sawtooth'; si.frequency.value = 900;
  const siL = c.createOscillator(); siL.frequency.value = 0.32; const siLg = c.createGain(); siLg.gain.value = 380; siL.connect(siLg); siLg.connect(si.frequency);
  const sif = c.createBiquadFilter(); sif.type = 'lowpass'; sif.frequency.value = 2400;
  const sig = c.createGain(); sig.gain.value = 0; si.connect(sif); sif.connect(sig); sig.connect(mix);
  const all = [o1, o2, o3, nz, chop, sq, sqLfo, h1, h2, si, siL];
  for (const o of all) o.start();
  const T = (p, v, k = 0.05) => p.setTargetAtTime(v, c.currentTime, k);
  return {
    set(rpm, thr, on, skid, horn, siren) {
      const f = base * (1 + rpm * (kind === 'heli' ? 0.9 : 3.2));
      T(o1.frequency, f); T(o2.frequency, f * 1.005); T(o3.frequency, f / 2);
      T(eg.gain, on ? (kind === 'heli' ? 0.12 : 0.16 + thr * 0.14) : 0);
      T(lp.frequency, 380 + rpm * 1600 + thr * 900);
      T(ng.gain, kind === 'heli' ? 0.5 * rpm : kind === 'boat' ? 0.12 * on * (0.3 + rpm) : 0.015 * on);
      T(chop.frequency, 8 + rpm * 8);
      T(sqg.gain, skid > 0.25 ? (skid - 0.25) * 0.28 : 0, 0.03);
      T(hg.gain, horn ? 0.09 : 0, 0.01);
      T(sig.gain, siren ? 0.07 : 0, 0.05);
    },
    pan(p) { T(pan.pan, p, 0.08); },
    stop(t) { for (const o of all) try { o.stop(t); } catch (e) { /* stopped */ } },
  };
}

/** The ambience: city hum (brown noise), surf (swelling filtered noise), birds by day, crickets at night, wind. */
function ambience(c, out) {
  const src = c.createBufferSource(); src.buffer = noiseBuf(c); src.loop = true;
  const city = c.createBiquadFilter(); city.type = 'lowpass'; city.frequency.value = 260;
  const cityG = c.createGain(); cityG.gain.value = 0; src.connect(city); city.connect(cityG); cityG.connect(out);
  const surf = c.createBiquadFilter(); surf.type = 'bandpass'; surf.frequency.value = 520; surf.Q.value = 0.5;
  const surfG = c.createGain(); surfG.gain.value = 0; src.connect(surf); surf.connect(surfG);
  const swell = c.createGain(); swell.gain.value = 0.5; surfG.connect(swell); swell.connect(out);
  const sw = c.createOscillator(); sw.frequency.value = 0.11; const swg = c.createGain(); swg.gain.value = 0.45; sw.connect(swg); swg.connect(swell.gain);
  const wind = c.createBiquadFilter(); wind.type = 'bandpass'; wind.frequency.value = 340; wind.Q.value = 0.7;
  const windG = c.createGain(); windG.gain.value = 0; src.connect(wind); wind.connect(windG); windG.connect(out);
  // crickets: a pulsing high tone
  const cr = c.createOscillator(); cr.type = 'sine'; cr.frequency.value = 4300;
  const crA = c.createGain(); crA.gain.value = 0; const crL = c.createOscillator(); crL.type = 'square'; crL.frequency.value = 26;
  const crLg = c.createGain(); crLg.gain.value = 0.5; crL.connect(crLg); crLg.connect(crA.gain);
  const crG = c.createGain(); crG.gain.value = 0; cr.connect(crA); crA.connect(crG); crG.connect(out);
  const all = [src, sw, cr, crL];
  for (const o of all) o.start();
  // gulls and birds now and then
  let birds = 0, alive = true;
  const chirp = () => {
    if (!alive) return;
    if (birds > 0.05) {
      const t = c.currentTime + 0.05, o = c.createOscillator(), g = c.createGain();
      const gull = Math.random() < 0.5;
      o.type = gull ? 'sawtooth' : 'sine';
      const f0 = gull ? 900 + Math.random() * 300 : 2600 + Math.random() * 1600;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * (gull ? 0.65 : 1.4), t + (gull ? 0.35 : 0.08));
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = f0; f.Q.value = 3;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(birds * (gull ? 0.05 : 0.025), t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + (gull ? 0.45 : 0.12));
      o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + 0.5);
    }
    setTimeout(chirp, 600 + Math.random() * 2600);
  };
  setTimeout(chirp, 1000);
  const T = (p, v) => p.setTargetAtTime(v, c.currentTime, 0.5);
  return {
    set(cityL, seaL, birdL, nightL, windL) {
      T(cityG.gain, cityL * 0.5); T(surfG.gain, seaL * 0.9); T(crG.gain, nightL * 0.025); T(windG.gain, windL * 0.35); birds = birdL;
    },
    stop(t) { alive = false; for (const o of all) try { o.stop(t); } catch (e) { /* stopped */ } },
  };
}

let _nb = null;
function noiseBuf(c) {
  if (_nb && _nb.sampleRate === c.sampleRate) return _nb;
  const n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5 * 0.5 + w * 0.5; }
  _nb = b;
  return b;
}
const nsrc = (c, K, kind = 'white') => K?.noise ? K.noise(c, kind) : (() => { const s = c.createBufferSource(); s.buffer = noiseBuf(c); return s; })();
function burst(c, out, t, K, f, q, dur, vol, type = 'bandpass', kind = 'white') {
  const s = nsrc(c, K, kind), fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(out); s.start(t); s.stop(t + dur + 0.05);
}
function tone(c, out, t, type, f0, f1, dur, vol) {
  const o = c.createOscillator(), g = c.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
}
function step(c, out, t, K, surface) {
  const f = surface === 'sand' ? 900 : surface === 'wood' ? 600 : surface === 'metal' ? 2400 : 1500;
  burst(c, out, t, K, f, surface === 'sand' ? 0.6 : 1.4, surface === 'sand' ? 0.12 : 0.06, 0.6);
}
function thud(c, out, t, K) { tone(c, out, t, 'sine', 120, 45, 0.25, 0.9); burst(c, out, t, K, 300, 0.8, 0.15, 0.6, 'lowpass'); }
function punch(c, out, t, K, heavy) { tone(c, out, t, 'sine', heavy ? 140 : 180, 50, 0.16, 0.9); burst(c, out, t, K, 1800, 0.7, 0.07, 0.8); }
function flesh(c, out, t, K) { burst(c, out, t, K, 700, 1.2, 0.09, 0.8); tone(c, out, t, 'sine', 90, 40, 0.12, 0.5); }
function pop(c, out, t, K) { burst(c, out, t, K, 900, 0.6, 0.25, 1.2); tone(c, out, t, 'square', 160, 40, 0.1, 0.4); }
function glass(c, out, t, K) { for (let i = 0; i < 7; i++) tone(c, out, t + i * 0.025 + Math.random() * 0.03, 'triangle', 2600 + Math.random() * 3200, 1800, 0.18, 0.12); burst(c, out, t, K, 5000, 0.8, 0.25, 0.4, 'highpass'); }
function crash(c, out, t, K, k) {
  burst(c, out, t, K, 220, 0.6, 0.5 + k * 0.6, 1.1, 'lowpass', 'brown');
  burst(c, out, t, K, 1300, 1.5, 0.3 + k * 0.4, 0.6 * k + 0.2);
  for (let i = 0; i < 3 + k * 5; i++) tone(c, out, t + Math.random() * 0.25, 'square', 300 + Math.random() * 900, 120, 0.12, 0.08); // rattling metal
  if (k > 0.5) glass(c, out, t + 0.05, K);
}
function boom(c, out, t, K, size, d) {
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(300, 4000 - d * 3); lp.connect(out);
  burst(c, lp, t, K, 80, 0.4, 1.8 * size, 1.4, 'lowpass', 'brown');
  burst(c, lp, t, K, 600, 0.5, 0.9 * size, 0.9);
  tone(c, lp, t, 'sine', 70, 25, 1.2 * size, 1.1);
  burst(c, lp, t + 0.3, K, 200, 0.6, 2.4 * size, 0.35, 'lowpass', 'brown'); // the rumble rolling off the towers
}
function splash(c, out, t, K, size) { burst(c, out, t, K, 900, 0.5, 0.4 + size * 0.4, 0.9, 'lowpass'); burst(c, out, t + 0.05, K, 3000, 1, 0.3, 0.3, 'highpass'); }
function scream(c, out, t, dying) {
  const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
  o.type = 'sawtooth'; o2.type = 'sawtooth';
  const f0 = 380 + Math.random() * 380, dur = dying ? 0.7 : 0.9 + Math.random() * 0.5;
  o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (dying ? 0.6 : 1.25), t + dur * 0.4); o.frequency.linearRampToValueAtTime(f0 * 0.8, t + dur);
  o2.frequency.value = f0 * 1.5; o2.detune.value = 14;
  const vib = c.createOscillator(); vib.frequency.value = 7; const vg = c.createGain(); vg.gain.value = 18; vib.connect(vg); vg.connect(o.frequency);
  f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 1.4;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.4, t + 0.05); g.gain.setValueAtTime(0.4, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); o2.connect(f); f.connect(g); g.connect(out);
  for (const x of [o, o2, vib]) { x.start(t); x.stop(t + dur + 0.05); }
}
function chime(c, out, t) { tone(c, out, t, 'triangle', 1318, 1318, 0.18, 0.35); tone(c, out, t + 0.08, 'triangle', 1760, 1760, 0.3, 0.35); }
function click(c, out, t) { tone(c, out, t, 'square', 1800, 900, 0.03, 0.25); }
function tick(c, out, t, head) { tone(c, out, t, 'square', head ? 2400 : 1600, head ? 2200 : 1500, 0.04, 0.25); }
function whiz(c, out, t, K) { burst(c, out, t, K, 2500, 2, 0.12, 0.5); }
/** Stingers: 'passed' (a bright rising chord), 'failed', 'wasted' (a low fall), 'start'. */
function jingle(c, out, t, kind) {
  const n = (s) => 440 * Math.pow(2, (s - 9) / 12);
  const seq = kind === 'passed' ? [[0, 4, 7], [5, 9, 12], [7, 11, 14], [12, 16, 19]] : kind === 'start' ? [[0, 7], [12]] : [[7, 3], [5, 1], [0, -4]];
  seq.forEach((ch, i) => { for (const s of ch) { const at = t + i * (kind === 'passed' ? 0.16 : 0.32); tone(c, out, at, 'sawtooth', n(s + 60 - 48), n(s + 60 - 48) * (kind === 'passed' ? 1 : 0.97), kind === 'passed' && i === 3 ? 1.4 : 0.5, 0.12); } });
}
