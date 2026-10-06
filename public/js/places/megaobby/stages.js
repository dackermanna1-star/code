// The 32 stages of the Mega Obby, in five zones. Each builder works in its
// stage's frame (see kit.js), builds the obstacles, writes the bots' route,
// and returns where the next checkpoint goes. Every jump is checked against
// what a character can actually do (16 studs/s, jump 50, gravity 196.2).
import * as THREE from 'three';
import { V, rect, phase, reach } from './kit.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export const ZONES = [
  { id: 'meadow', name: 'SKY MEADOWS', sub: 'Zone 1', pad: 37, trim: 24, flag: 21, colors: [37, 24, 23, 106, 119, 1], color: '#5cc85c' },
  { id: 'volcano', name: 'VOLCANO ISLES', sub: 'Zone 2', pad: 199, trim: 106, flag: 106, colors: [199, 26, 192, 38, 25], color: '#ff7a2a' },
  { id: 'neon', name: 'NEON CITY', sub: 'Zone 3', pad: 26, trim: 104, flag: 104, colors: [26, 149, 23, 104, 107], color: '#c060ff' },
  { id: 'frozen', name: 'FROZEN PEAKS', sub: 'Zone 4', pad: 1, trim: 45, flag: 102, colors: [1, 45, 11, 102, 135], color: '#8ad8ff' },
  { id: 'cosmos', name: 'COSMIC VOID', sub: 'Zone 5', pad: 149, trim: 110, flag: 104, colors: [26, 149, 104, 110, 1], color: '#a080ff' },
];

/** Neon cap on a block (a glowing strip along its top edges). */
function neonEdge(k, r, color, h = 0.25) {
  k.box(r.x, r.y + 0.05, r.z0 + 0.15, r.sx, h, 0.3, color, { material: 'Neon', top: 'Smooth' });
  k.box(r.x, r.y + 0.05, r.z1 - 0.15, r.sx, h, 0.3, color, { material: 'Neon', top: 'Smooth' });
}

// --- moving things shared by several stages -------------------------------------------------------------------------------
/** A laser gate across the path: deadly while on. */
function laser(k, C, x, y0, z, w, h, P, onFor, off) {
  const isOn = (t) => phase(t, P, off) < onFor;
  const p = k.dp({ size: [w, h, 0.3], position: [x, y0 + h / 2, z], color: 21, material: 'Neon', canCollide: false, top: 'Smooth', bottom: 'Smooth', name: 'Laser' });
  p.onTouched((ch) => { if (isOn(C.world.time)) C.kill(ch, 'laser'); });
  for (const s of [-1, 1]) k.box(x + s * (w / 2 + 0.4), y0 + h / 2, z, 0.8, h + 0.4, 0.8, 26, { top: 'Smooth' });
  k.every((t) => { const on = isOn(t); if (on !== p._on) { p._on = on; p.setTransparency(on ? 0.15 : 0.93); } });
  /** Off now, and staying off for at least `dur` seconds. */
  const offFor = (t, dur) => { const ph = phase(t, P, off); return ph >= onFor && P - ph >= dur; };
  return { part: p, isOn, offFor };
}
/** A spinning bar about a vertical axis (and a test for whether it covers a point). */
function spinBar(k, C, cx, y, cz, len, thick, omega, theta0, o = {}) {
  const angle = (t) => omega * t + theta0;
  const r = k.rotor({ size: [len, thick, thick], position: [cx, y, cz], color: o.color ?? 21, material: o.neon === false ? 'Plastic' : 'Neon', top: 'Smooth', bottom: 'Smooth', name: 'SpinBar' }, [cx, y, cz], [0, 1, 0], angle);
  if (o.deadly !== false) r.part.onTouched((ch) => C.kill(ch, o.cause || 'spinner'));
  else r.part.onTouched((ch) => C.fling(ch, r.part, 70));
  const F = k.F;
  /** Is (world) point p under the bar at time t? (anyY: whatever its height) */
  const covers = (p, t, anyY) => {
    const q = F.L(p); const lx = q.x - cx, lz = q.z - cz, rr = Math.hypot(lx, lz);
    if (rr > len / 2 + 1.3 || (!anyY && Math.abs(q.y - 3 - y) > 3)) return false;
    if (rr < 1.5) return true;
    const d = ((((Math.atan2(-lz, lx) - angle(t)) % Math.PI) + Math.PI) % Math.PI);
    return Math.min(d, Math.PI - d) < (1.05 + thick / 2) / rr;
  };
  /** How far (radians) the nearest arm behind local direction phi is from it (for a bar turning +). */
  const behind = (phi, t) => (((phi - angle(t)) % Math.PI) + Math.PI) % Math.PI;
  return { r, covers, behind, y, thick };
}
/**
 * Hop a spinning bar: look ahead along where you're walking, and jump when
 * it's about to sweep there (so you're over it as it passes) - unless that
 * would put your head into another bar above.
 */
const _hp = new THREE.Vector3();
function hopOver(bot, C, low, highs = []) {
  const ch = bot.ch;
  if (!ch.grounded) return;
  const p = ch.rootPosition, v = ch.body.velocity, t = C.world.time;
  const at = (s) => _hp.set(p.x + v.x * s, p.y, p.z + v.z * s);
  let first = -1;
  for (let s = 0; s <= 0.3; s += 0.02) if (low.covers(at(s), t + s)) { first = s; break; }
  if (first < 0.03 || first > 0.15) return;
  for (const h of highs) for (let s = 0; s <= 0.52; s += 0.02) if (h.covers(at(s), t + s, true)) return;
  bot.forceJump = true;
}
/** Is anybody (but you) in this local box of the stage? (so you don't follow them onto crumbling tiles) */
function busy(k, C, x0, x1, z0, z1) {
  const F = k.F;
  let went = -9;
  const fn = (bot) => {
    if (C.world.time - went < 1.5) return true; // someone's just gone
    for (const ch of C.world.characters) {
      if (ch === bot.ch || !ch.alive) continue;
      const q = F.L(ch.rootPosition);
      if (q.x > x0 && q.x < x1 && q.z > z0 && q.z < z1 && Math.abs(q.y - 3) < 4) return true;
    }
    return false;
  };
  /** (call when you go) */
  fn.go = () => { went = C.world.time; return true; };
  return fn;
}
/** A platform falling away shortly after someone steps on it (back a few seconds later). */
function faller(k, C, x, y, z, sx, sz, color, delay = 0.5, back = 3.5, o = {}) {
  const t0 = o.t ?? 1.2;
  const part = k.dp({ size: [sx, t0, sz], position: [x, y - t0 / 2, z], color, name: 'Crumble', ...(o.props || {}) });
  part.setKinematic();
  const F = k.F, home = F.W(x, y - t0 / 2, z);
  const f = { part, state: 'idle', t: 0 };
  part.onTouched((ch) => { if (f.state === 'idle' && ch.alive && ch.rootPosition.y - 3 > y - 0.6) { f.state = 'shake'; f.t = 0; } });
  k.every((t, dt) => {
    if (f.state === 'idle') return;
    f.t += dt;
    const b = part.body;
    if (f.state === 'shake') {
      const j = 0.12;
      b.position.set(home.x + rnd(-j, j), home.y, home.z + rnd(-j, j));
      if (f.t > delay) { f.state = 'fall'; f.t = 0; part.setCanCollide(false); }
    } else if (f.state === 'fall') {
      b.position.set(home.x, home.y - 40 * f.t * f.t, home.z);
      b.velocity.set(0, -80 * f.t, 0);
      if (f.t > 0.8) { part.mesh.visible = false; f.state = 'gone'; f.t = 0; }
    } else if (f.state === 'gone' && f.t > back) {
      f.state = 'idle'; b.position.set(home.x, home.y, home.z); b.velocity.set(0, 0, 0);
      part.mesh.visible = true; part.setCanCollide(true);
    }
    if (f.state !== 'idle') part.mesh.position.set(b.position.x, b.position.y, b.position.z);
  });
  const r = rect(x, y, z, sx, sz); r.part = part; r.f = f;
  return r;
}

// --- the stages ---------------------------------------------------------------------------------------------------------------
export const STAGES = [
  // ===== ZONE 1: SKY MEADOWS =====
  { name: 'Hop Along', zone: 0, build(k) {
    const c = ZONES[0].colors;
    k.chain([{ gap: 4 }, { x: 4, dy: 1, gap: 3 }, { x: -1, dy: 1, gap: 3.5 }, { x: 3, dy: 1, gap: 3.5 }, { x: -2, dy: 1, gap: 4 }].map((it, i) => ({ ...it, color: c[i % 4] })));
    return k.end(4, 1);
  } },
  { name: 'Zig Zag Climb', zone: 0, build(k) {
    const c = ZONES[0].colors;
    k.chain(Array.from({ length: 8 }, (_, i) => ({ x: i % 2 ? 2.5 : -2.5, dy: 2.5, gap: 2.5, w: 3, color: c[i % 5] })));
    return k.end(3, 2.5);
  } },
  { name: 'Red Alert', zone: 0, build(k) {
    // a path with deadly bars across it...
    const path = k.plat(0, 0, -25, 6, 40, 37);
    k.go(path);
    for (const z of [-12, -20, -28, -36]) {
      k.kill(0, 0.5, z, 6, 1, 1);
      k.walk(0, 0, z + 2.4, { r: 0.5 });
      k.jumpTo([0, 0, z + 2.4], [0, 0, z - 2.4], { hard: 0.25 });
    }
    k.cur = rect(0, 0, -41, 6, 8);
    // ...then a deadly floor with white stepping tiles...
    k.kill(0, -0.3, -58, 8, 0.6, 22);
    const tiles = [[-2, -49], [2, -53.5], [-2, -58], [2, -62.5], [0, -67]];
    for (const [x, z] of tiles) k.go(k.plat(x, 0.8, z, 2.5, 2.5, 1, { t: 1 }), { hard: 0.45 });
    // ...and a lawn with deadly posts to weave round
    const lawn = k.plat(0, 1, -76, 10, 10, 37);
    k.go(lawn);
    for (const [x, z] of [[-2.5, -73.5], [2.5, -76.5], [-2.5, -79.5]]) k.kill(x, 2.5, z, 1.4, 3, 1.4);
    k.walk(2, 1, -73.5, { r: 0.6 }); k.walk(-1.8, 1, -76.5, { r: 0.6 }); k.walk(2, 1, -79.5, { r: 0.6 });
    k.cur = lawn;
    return k.end(4, 1);
  } },
  { name: 'Truss Tower', zone: 0, build(k) {
    const base = k.plat(0, 0, -14, 8, 10, 24);
    k.go(base);
    k.box(0, 11, -24, 6, 22, 6, 1);
    k.box(0, 22.1, -24, 6.4, 0.4, 6.4, 24, { top: 'Smooth' });
    k.sp({ shape: 'Truss', size: [2, 22.4, 2], position: [0, 11.2, -20], color: 194 });
    k.walk(0, 0, -17.6, { r: 0.4 });
    k.push({ type: 'climb', dir: k.D(0, 0, -1), p: k.W(0, 22.3, -23.5) });
    k.cur = rect(0, 22.3, -24, 6, 6);
    k.chain([{ dy: -3.3, gap: 5, w: 4, color: 23 }, { x: 3, dy: -3, gap: 4.5, w: 4, color: 106 }]);
    return k.end(5, -2);
  } },
  { name: 'Tightrope', zone: 0, build(k) {
    const T = 106;
    k.plat(0, 0, -13, 1.2, 16, T);
    k.plat(5, 0, -20.4, 11.2, 1.2, T);
    k.plat(10, 0, -29.2, 1.2, 18.8, T);
    k.walk(0, 0, -20.4, { r: 0.45 }); k.walk(10, 0, -20.4, { r: 0.45 }); k.walk(10, 0, -37.9, { r: 0.45 });
    k.cur = rect(10, 0, -38, 1.2, 1);
    const isl = k.plat(10, 1.5, -43, 3, 3, 37);
    k.go(isl, { hard: 0.4 });
    k.plat(4.5, 1.5, -43, 9, 1.2, T);
    k.plat(0, 1.5, -50.4, 1.2, 14, T);
    k.walk(0.2, 1.5, -43, { r: 0.45 }); k.walk(0, 1.5, -56.8, { r: 0.45 });
    k.cur = rect(0, 1.5, -57, 1.2, 1);
    return k.end(4, 0.5);
  } },
  { name: 'Bounce House', zone: 0, build(k, C) {
    const pads = [];
    const tramp = (x, y, z) => {
      const p = k.dp({ shape: 'Cylinder', size: [0.6, 4, 4], position: [x, y + 0.3, z], rotation: [0, 0, 90], color: 22, material: 'Neon', name: 'Trampoline' });
      p.onTouched((ch) => { if (ch.alive && (ch._bounceT || 0) < C.world.time - 0.4) { ch._bounceT = C.world.time; ch.body.velocity.y = 88; ch.grounded = false; C.sfx('boing', p.mesh.position); } });
      pads.push(p);
      return k.W(x, y, z);
    };
    const p0 = k.plat(0, 0, -12, 6, 8, 1);
    k.go(p0);
    const t1 = tramp(0, 0, -13.5);
    const p1 = k.plat(0, 14, -23.5, 6, 10, 23);
    k.push({ type: 'bounce', pad: t1, p: k.W(0, 14, -20) });
    const t2 = tramp(0, 14, -25.5);
    const p2 = k.plat(0, 28, -33.5, 6, 6, 24);
    k.push({ type: 'bounce', pad: t2, p: k.W(0, 28, -31.8) });
    k.cur = p2; void p1;
    return k.end(4, -2);
  } },

  // ===== ZONE 2: VOLCANO ISLES =====
  { name: 'Lava Stones', zone: 1, build(k, C) {
    k.kill(0, -6.5, -30, 34, 1, 56, { color: 106, cause: 'lava' });
    const sinkY = (t, off) => { const ph = phase(t, 5, off); return ph < 3 ? 0 : ph < 3.5 ? -9 * smooth((ph - 3) / 0.5) : ph < 4.3 ? -9 : -9 * (1 - smooth((ph - 4.3) / 0.7)); };
    const items = [[0, 0, 4, 0], [3, 0, 3.5, 0], [-1, 0, 4, 1], [2.5, 0.5, 4, 0], [-1.5, 0.5, 4, 2], [0, 1, 4, 0]];
    let i = 0;
    for (const [x, dy, gap, sink] of items) {
      const prev = k.cur, y = prev.y + dy, z = prev.z0 - gap - 2;
      if (!sink) { k.go(k.plat(x, y, z, 4, 4, i % 2 ? 199 : 26)); }
      else {
        const off = sink === 1 ? 0 : 2.5;
        k.mover({ size: [4, 1.2, 4], position: [x, y - 0.6, z], color: 38, name: 'Sinker' }, (t) => ({ x, y: y - 0.6 + sinkY(t, off), z }));
        // jump on while it's up and will stay up for a while
        k.go(rect(x, y, z, 4, 4), { cond: () => phase(C.world.time + 0.5, 5, off) < 2.2, hard: 0.5 });
      }
      i++;
    }
    return k.end(4, 1);
  } },
  { name: 'Conveyor Chaos', zone: 1, build(k, C) {
    const belt = (z, y, dir) => {
      const p = k.dp({ size: [6, 1.2, 12], position: [0, y - 0.6, z], color: 26, top: 'Smooth', name: 'Conveyor' });
      p.surfaceVelocity = k.D(dir, 0, 0);
      p.addDecal('Top', C.arrowTex(dir > 0, 6, 12, Math.abs(dir)), { color: 0xffd040 });
      const r = rect(0, y, z, 6, 12); r.part = p;
      return r;
    };
    k.go(belt(-13, 0, 9));
    k.walk(0, 0, -18.4, { r: 0.6 });
    k.go(belt(-30, 0, -9));
    k.walk(0, 0, -35.4, { r: 0.6 });
    k.go(belt(-47, 0.5, 11));
    k.walk(0, 0.5, -52.4, { r: 0.6 });
    return k.end(4, 1);
  } },
  { name: 'Crushers', zone: 1, build(k, C) {
    const floor = k.plat(0, 0, -27, 6, 44, 199);
    k.go(floor);
    for (const s of [-1, 1]) k.box(s * 3.6, 5, -27, 1.2, 10, 44, 26);
    const P = 2.6;
    const bottom = (t, off) => { const ph = phase(t, P, off); return ph < 1 ? 8 : ph < 1.15 ? 8 * (1 - (ph - 1) / 0.15) : ph < 1.6 ? 0 : 8 * ((ph - 1.6) / 1); };
    [-12, -21, -30, -39].forEach((z, i) => {
      const off = i * 0.65;
      const m = k.mover({ size: [6, 4, 5], position: [0, 10, z], color: 199, name: 'Crusher' }, (t) => ({ x: 0, y: bottom(t, off) + 2, z }));
      m.part.onTouched((ch) => { if (bottom(C.world.time, off) < 6) C.kill(ch, 'crusher'); });
      k.mover({ size: [6.1, 0.3, 5.1], position: [0, 10, z], color: 21, material: 'Neon', canCollide: false }, (t) => ({ x: 0, y: bottom(t, off) + 0.1, z }));
      const safeFor = (dur) => { const t = C.world.time; for (let s = 0; s <= dur; s += 0.04) if (bottom(t + s, off) < 6) return false; return true; };
      k.walk(0, 0, z + 4, { r: 0.6 });
      k.walk(0, 0, z - 4, { r: 0.8, cond: () => safeFor(0.62), hard: 0.6, timing: true });
    });
    return k.end(4, 1);
  } },
  { name: 'Crumbling Path', zone: 1, build(k, C) {
    const tiles = [[0, -8.5], [2, -14], [-1, -19.5], [2, -25], [-2, -30.5], [1, -36], [-1, -41.5], [1, -47]];
    // (wait on the checkpoint until the path is all back up: no following someone too closely)
    const fs = [], others = busy(k, C, -5, 5, -50, -6);
    k.wait((bot) => fs.every((t) => t.f.state === 'idle') && !others(bot) && others.go());
    for (const [x, z] of tiles) { const t = faller(k, C, x, 0, z, 4, 4, 25, 0.55, 3.5); fs.push(t); k.go(t, { hurry: true, hard: 0.3, quick: true, cond: () => t.f.state === 'idle' }); }
    return k.end(3, 1);
  } },
  { name: 'Rising Lava', zone: 1, build(k, C) {
    // the lava basin
    for (const [x, z, sx, sz] of [[-9, -26, 2, 40], [9, -26, 2, 40]]) k.box(x, 1, z, sx, 18, sz, 26);
    const P = 10;
    const lavaTop = (t) => { const ph = phase(t, P); return ph < 4.5 ? -4 : ph < 6.5 ? -4 + 13 * smooth((ph - 4.5) / 2) : ph < 8 ? 9 : 9 - 13 * smooth((ph - 8) / 2); };
    const lava = k.mover({ size: [16, 2, 40], position: [0, -5, -26], color: 106, material: 'Neon', top: 'Smooth', name: 'Lava' }, (t) => ({ x: 0, y: lavaTop(t) - 1, z: -26 }));
    lava.part.setCanCollide(false);
    lava.part.onTouched((ch) => C.kill(ch, 'lava'));
    // climb out: zig-zag up the basin
    const steps = [[-3.5, 2.5, -10.5], [3.5, 5, -15.5], [-3.5, 7.5, -20.5], [3.5, 10, -25.5], [-3.5, 12.5, -30.5], [3.5, 15, -35.5]];
    const go0 = () => { const t = C.world.time; if (lavaTop(t) > 1) return false; for (let s = 0; s < 2.3; s += 0.1) if (lavaTop(t + s) > 7.8) return false; return true; };
    steps.forEach(([x, y, z], i) => k.go(k.plat(x, y, z, 4, 4, i % 2 ? 199 : 192), i === 0 ? { cond: go0, hard: 0.5, timing: true } : { hurry: i < 4 }));
    const exit = k.plat(0, 15, -43, 10, 6, 199);
    k.go(exit);
    return k.end(4, 0);
  } },
  { name: 'Fire Spinners', zone: 1, build(k, C) {
    k.plat(0, 0, -6.5, 4, 3, 199);
    k.box(0, -0.6, -20, 1.2, 24, 24, 26, { shape: 'Cylinder', rotation: [0, 0, 90] });
    k.box(0, 3.5, -20, 7, 3, 3, 38, { shape: 'Cylinder', rotation: [0, 0, 90] });
    const low = spinBar(k, C, 0, 0.6, -20, 23.5, 0.8, 1.35, 0, { cause: 'fire' });
    const high = spinBar(k, C, 0, 6.2, -20, 23.5, 0.8, -0.85, 1.2, { cause: 'fire', color: 106 });
    k.plat(0, 0, -34, 4, 4, 199);
    k.walk(0, 0, -7); k.walk(6.5, 0, -15); k.walk(6.5, 0, -25); k.walk(0, 0, -33);
    k.cur = rect(0, 0, -34, 4, 4);
    k.stage.tick = (bot) => hopOver(bot, C, low, [high]);
    return k.end(4, 1);
  } },

  // ===== ZONE 3: NEON CITY =====
  { name: 'Laser Hall', zone: 2, build(k, C) {
    const floor = k.plat(0, 0, -27, 6, 44, 26, { top: 'Smooth' });
    k.go(floor);
    for (const s of [-1, 1]) { k.box(s * 3.6, 4, -27, 1, 8, 44, 149, { top: 'Smooth' }); k.box(s * 3, 0.1, -27, 0.3, 0.2, 44, 107, { material: 'Neon' }); }
    [-11, -19, -27, -35, -43].forEach((z, i) => {
      const L = laser(k, C, 0, 0, z, 6, 6.5, 2.4, 1.3, -i * 0.45);
      k.walk(0, 0, z + 2.6, { r: 0.6 });
      k.walk(0, 0, z - 2.6, { r: 0.8, cond: () => L.offFor(C.world.time, 0.4), hard: 0.5, timing: true });
    });
    return k.end(4, 1);
  } },
  { name: 'Slider Sky', zone: 2, build(k, C) {
    const A = 6, P = 4.2;
    const zs = [-11.5, -20.5, -29.5, -38.5];
    const xs = zs.map((z, i) => (t) => A * Math.sin(2 * Math.PI * (t / P) + i * 1.6));
    const ms = zs.map((z, i) => k.mover({ size: [5, 1.2, 5], position: [0, -0.6, z], color: [104, 107, 23, 22][i], top: 'Smooth' }, (t) => ({ x: xs[i](t), y: -0.6, z })));
    const F = k.F; // (this stage's frame: k.F moves on to the next stage)
    const live = (i, dz = 0) => () => { const w = ms[i].world(C.world.time); return w.add(F.D(0, 0.6, dz)); };
    k.walk(0, 0, -4.6, { r: 0.5 });
    // onto the first: when it'll be in front of you
    k.push({ type: 'jump', p: live(0, 1.2), cond: () => Math.abs(xs[0](C.world.time + 0.45)) < 0.9, hard: 0.5, timing: true });
    for (let i = 1; i < 4; i++) {
      k.push({ type: 'ride', hold: live(i - 1, -1.6), cond: () => { const t = C.world.time + 0.45; return Math.abs(xs[i](t) - xs[i - 1](t)) < 0.9; } });
      k.push({ type: 'jump', p: live(i, 1.2), hard: 0.5 });
    }
    k.push({ type: 'ride', hold: live(3, -1.6), cond: () => Math.abs(xs[3](C.world.time + 0.45)) < 0.9 });
    k.push({ type: 'jump', p: k.W(0, 1, -45.5), hard: 0.4 });
    k.cur = rect(0, 0, -38.5, 5, 5);
    return k.end(3.5, 1, 0, { noRoute: true });
  } },
  { name: 'Elevators', zone: 2, build(k, C) {
    const lift = (t, off, lo, hi) => { const ph = phase(t, 7, off); return ph < 1.5 ? lo : ph < 4 ? lo + (hi - lo) * smooth((ph - 1.5) / 2.5) : ph < 5.5 ? hi : hi - (hi - lo) * smooth((ph - 5.5) / 1.5); };
    const L1 = k.mover({ size: [5, 1.2, 5], position: [0, -0.6, -10.5], color: 107, top: 'Smooth' }, (t) => ({ x: 0, y: lift(t, 0, 0, 14) - 0.6, z: -10.5 }));
    const A = k.plat(0, 14, -17.5, 6, 4, 26, { top: 'Smooth' });
    const L2 = k.mover({ size: [5, 1.2, 5], position: [0, 13.4, -24.5], color: 104, top: 'Smooth' }, (t) => ({ x: 0, y: lift(t, 3.5, 14, 28) - 0.6, z: -24.5 }));
    const B = k.plat(0, 28, -31.5, 6, 4, 26, { top: 'Smooth' });
    for (const [z, y0, y1] of [[-10.5, -2, 16], [-24.5, 12, 30]]) for (const s of [-1, 1]) k.box(s * 3, (y0 + y1) / 2, z, 0.5, y1 - y0, 0.5, 107, { material: 'Neon' });
    const F = k.F;
    const top = (m) => () => m.world(C.world.time).add(F.D(0, 0.6, -1.2));
    k.walk(0, 0, -4.6, { r: 0.5 });
    k.push({ type: 'jump', p: () => L1.world(C.world.time).add(F.D(0, 0.6, 0.8)), cond: () => phase(C.world.time + 0.3, 7, 0) < 1.2, hard: 0.3, timing: true });
    k.push({ type: 'ride', hold: top(L1), cond: () => lift(C.world.time, 0, 0, 14) > 13.8 });
    k.push({ type: 'jump', p: k.W(0, 14, -16.6), hard: 0.3 });
    k.walk(0, 14, -19, { r: 0.5 });
    k.push({ type: 'jump', p: () => L2.world(C.world.time).add(F.D(0, 0.6, 0.8)), cond: () => phase(C.world.time + 0.3, 7, 3.5) < 1.2, hard: 0.3, timing: true });
    k.push({ type: 'ride', hold: top(L2), cond: () => lift(C.world.time, 3.5, 14, 28) > 27.8 });
    k.push({ type: 'jump', p: k.W(0, 28, -30.6), hard: 0.3 });
    k.cur = B; void A;
    return k.end(4, 0);
  } },
  { name: 'Neon Pillars', zone: 2, build(k) {
    const cols = [104, 107, 22, 23];
    const items = [[2, 1, 3], [-1.5, 1.5, 3.5], [2, -1, 4], [-2, 2, 3], [1.5, 0, 4.5], [-1, 1.5, 3.5], [1.5, -1, 4]];
    items.forEach(([x, dy, gap], i) => {
      const prev = k.cur, y = prev.y + dy, z = prev.z0 - gap - 1;
      k.box(x, y - 15.3, z, 2, 30, 2, 149);
      const r = k.plat(x, y, z, 2, 2, cols[i % 4], { material: 'Neon', t: 0.6 });
      k.go(r, { hard: 0.6 });
    });
    return k.end(4, 1);
  } },
  { name: 'Glass Bridge', zone: 2, build(k, C) {
    const rows = 6, panels = [], oy = k.O.y;
    for (let r = 0; r < rows; r++) {
      const z = -9 - r * 6.5, real = Math.random() < 0.5 ? 0 : 1;
      const row = [];
      for (let s = 0; s < 2; s++) {
        const x = s ? 2.6 : -2.6;
        const ok = s === real;
        const p = k.dp({ size: [4.5, 0.6, 4.5], position: [x, -0.3, z], color: ok ? 45 : 1, transparency: 0.45, reflectance: ok ? 0.3 : 0, top: 'Smooth', bottom: 'Smooth', name: 'Glass' });
        const g = { p, ok, broken: false, x, z, at: k.W(x, 0, z) };
        if (!ok) p.onTouched((ch) => { if (!g.broken && ch.alive && ch.rootPosition.y - 3 > oy - 1.2) C.breakGlass(g, ch); });
        row.push(g);
      }
      for (const s of [-1, 1]) k.box(s * 5.4, -0.3, z, 0.4, 0.8, 5, 26, { material: 'Neon', color: 107 });
      panels.push(row);
    }
    C.glass.push(...panels.flat());
    const F = k.F;
    // the bots pick a panel in each row (they remember the ones that broke, and look closely at the rest)
    for (let r = 0; r < rows; r++) {
      const row = panels[r];
      k.push({
        type: 'custom', run(bot, dt, s) {
          if (s.choice == null) {
            const known = row.findIndex((g) => g.broken || g.seenBroken);
            bot.mem.glassPrev = bot.mem.glassChoice;
            s.choice = known >= 0 ? 1 - known : (Math.random() < 0.55 + bot.skill * 0.35 ? row.findIndex((g) => g.ok) : (Math.random() < 0.5 ? 0 : 1));
            s.wait = r === 0 ? rnd(0.3, 1.2) * (1.4 - bot.skill) : rnd(0.1, 0.6) * (1.3 - bot.skill);
          }
          bot.mem.glassChoice = s.choice;
          return (s.wait -= dt) <= 0;
        },
      });
      const target = (bot) => { const g = row[bot.mem.glassChoice ?? 0]; const lp = F.L(bot.ch.rootPosition); return F.W(g.x + clamp(lp.x - g.x, -1.2, 1.2), 0, g.z + 1.2); };
      // (from the far edge of the panel you're on, as near the next one as you can get)
      const takeoff = (bot) => { const g = row[bot.mem.glassChoice ?? 0]; if (r === 0) return F.W(g.x * 0.6, 0, -4.6); const pg = panels[r - 1][bot.mem.glassPrev ?? 0]; return F.W(clamp(g.x, pg.x - 1.5, pg.x + 1.5), 0, -9 - (r - 1) * 6.5 - 1.7); };
      k.push({ type: 'jump', from: takeoff, p: target, hard: 0.35 });
    }
    k.cur = rect(0, 0, -9 - (rows - 1) * 6.5, 10, 4.5);
    return k.end(3, 0);
  } },
  { name: 'Spinning Planks', zone: 2, build(k, C) {
    const F = k.F;
    const plank = (z, omega, off) => {
      const ang = (t) => omega * t + off;
      const r = k.rotor({ size: [14, 1, 3], position: [0, -0.5, z], rotation: [0, 90, 0], color: [104, 107][z < -30 ? 1 : 0], top: 'Smooth' }, [0, -0.5, z], [0, 1, 0], ang);
      k.box(0, -2.6, z, 3, 2, 3, 26, { shape: 'Cylinder', rotation: [0, 0, 90] });
      // the plank's direction (local): it lies along z when the angle is a multiple of pi
      const axis = (t) => { const a = ang(t); return [Math.sin(a), Math.cos(a)]; };
      const aligned = (t, tol) => Math.abs(axis(t)[0]) < Math.sin(tol);
      const tip = (dir, d) => (bot) => { const [ax, az] = axis(C.world.time); const sgn = Math.sign(az * dir) || 1; return F.W(ax * d * sgn, 0, z + az * d * sgn); };
      return { r, z, aligned, tip, center: F.W(0, 0, z) };
    };
    const p1 = plank(-15, 0.9, 0.4), p2 = plank(-39, -1.1, 1.3);
    const isl = k.plat(0, 0, -27, 3, 3, 26, { top: 'Smooth' });
    k.box(0, -0.6, -27, 3.2, 0.4, 3.2, 107, { material: 'Neon' });
    const W = (t) => C.world.time + t;
    // pad -> plank 1
    k.walk(0, 0, -4.6, { r: 0.5 });
    k.push({ type: 'jump', p: p1.tip(1, 5.2), cond: () => p1.aligned(W(0.4), 0.16), hard: 0.6, timing: true });
    k.push({ type: 'walk', p: p1.center, r: 0.7 });
    k.push({ type: 'wait', cond: () => p1.aligned(W(0.42), 0.15) });
    k.push({ type: 'walk', p: p1.tip(-1, 5.6), r: 0.5, rel: true });
    k.push({ type: 'jump', p: k.W(0, 0, -26.2), hard: 0.5 });
    // island -> plank 2
    k.walk(0, 0, -27.9, { r: 0.4 });
    k.push({ type: 'jump', p: p2.tip(1, 5.2), cond: () => p2.aligned(W(0.4), 0.16), hard: 0.6, timing: true });
    k.push({ type: 'walk', p: p2.center, r: 0.7 });
    k.push({ type: 'wait', cond: () => p2.aligned(W(0.42), 0.15) });
    k.push({ type: 'walk', p: p2.tip(-1, 5.6), r: 0.5, rel: true });
    k.push({ type: 'jump', p: k.W(0, 0, -50.2), hard: 0.5 });
    k.cur = rect(0, 0, -39, 3, 14); void isl;
    return k.end(3, 0, 0, { noRoute: true });
  } },
  { name: 'Disco Danger', zone: 2, build(k, C) {
    const rows = 9, cols = [-3.5, 0, 3.5], P = 3.4, oy = k.O.y;
    // A: even rows red, then all green, B: odd rows red, then all green
    const state = (t, r) => { const ph = phase(t, P); if (ph < 1.0) return r % 2 === 0 ? 'red' : 'safe'; if (ph < 1.7) return ph > 1.35 && r % 2 === 1 ? 'warn' : 'safe'; if (ph < 2.7) return r % 2 === 1 ? 'red' : 'safe'; return ph > 3.05 && r % 2 === 0 ? 'warn' : 'safe'; };
    const tiles = [];
    for (let r = 0; r < rows; r++) for (const x of cols) {
      const z = -6.75 - r * 3.5;
      const p = k.dp({ size: [3.45, 0.8, 3.45], position: [x, -0.4, z], color: 1, material: 'Neon', top: 'Smooth', name: 'DiscoTile' });
      p.onTouched((ch) => { if (state(C.world.time, r) === 'red' && ch.rootPosition.y - 3 < oy + 1.5) C.kill(ch, 'disco'); });
      tiles.push({ p, r, x });
    }
    const palette = [104, 107, 22, 23, 24];
    k.every((t) => {
      const beat = Math.floor(t / (P / 2));
      for (const tl of tiles) {
        const s = state(t, tl.r);
        const c = s === 'red' ? 21 : s === 'warn' ? 24 : palette[(tl.r * 3 + Math.round(tl.x) + beat) % 5];
        if (tl.c !== c) { tl.c = c; tl.p.setColor(c); }
      }
    });
    const F = k.F, rowZ = (r) => -6.75 - r * 3.5;
    // the bots dance across: one row (or three, if they're good) every green
    k.push({
      type: 'custom', run(bot, dt, s) {
        const t = C.world.time, ph = phase(t, P);
        s.row ??= -1; s.lane ??= cols[Math.floor(Math.random() * 3)];
        if (s.row >= rows) return true;
        const green = (ph >= 1.0 && ph < 1.7) || ph >= 2.7;
        const left = ph < 1.7 ? 1.7 - ph : P - ph;
        const nextRedEven = ph >= 2.7 || ph < 1.0; // the pattern after this green
        if (!green) s.react = null;
        if (s.goal == null && green && left > 0.3) {
          s.react ??= rnd(0.05, 0.3) * (1.4 - bot.skill);
          if ((s.react -= dt) <= 0) {
            let g = s.row + 1;
            if (g < rows && (g % 2 === 0) === nextRedEven) g++; // that row is about to go red
            if (bot.skill > 0.88 && left > 0.75 && g + 2 < rows) g += 2;
            if (g >= rows) g = rows;
            const need = (g - s.row) * 3.5 / 16 + 0.08;
            if (need < left || g >= rows) s.goal = g;
            else s.react = 99; // not enough time left: wait for the next green
          }
        }
        if (s.goal != null) {
          const target = s.goal >= rows ? F.W(0, 0, rowZ(rows - 1) - 6.5) : F.W(s.lane, 0, rowZ(s.goal));
          if (bot.goTo(target, 0.3) < 0.6) { s.row = s.goal; s.goal = null; }
        } else bot.goTo(s.row < 0 ? F.W(0, 0, -3.5) : F.W(s.lane, 0, rowZ(s.row)), 0.3);
        return false;
      },
    });
    k.cur = rect(0, 0, rowZ(rows - 1), 10.5, 3.5);
    // (a step off the floor before the checkpoint, so nobody gets it while still on a tile)
    return k.end(1.2, 0, 0, { noRoute: true });
  } },

  // ===== ZONE 4: FROZEN PEAKS =====
  { name: 'Ice Cubes', zone: 3, build(k, C) {
    const items = [[0, 0, 3.5, 0], [2.5, 1, 3.5, 1], [-1, 1, 4, 0], [2, 0, 4, 2], [-2, 1, 3.5, 0], [1, 1, 4, 3], [-1, 0, 4, 0]];
    items.forEach(([x, dy, gap, bob], i) => {
      const prev = k.cur, y = prev.y + dy, z = prev.z0 - gap - 1.25;
      if (!bob) k.go(k.plat(x, y, z, 2.5, 2.5, i % 2 ? 45 : 1, { transparency: 0.15, top: 'Smooth' }), { hard: 0.55 });
      else {
        const by = (t) => Math.sin(t * 2.1 + bob) * 1.1;
        const m = k.mover({ size: [2.5, 2.5, 2.5], position: [x, y - 1.25, z], color: 11, transparency: 0.15, top: 'Smooth' }, (t) => ({ x, y: y - 1.25 + by(t), z }));
        const r = rect(x, y, z, 2.5, 2.5);
        const prevR = k.cur;
        k.go(r, { hard: 0.6, cond: () => by(C.world.time + 0.4) < 0.3 });
        // aim at where it is (it bobs)
        const step = k.stage.route[k.stage.route.length - 1];
        step.p = () => m.world(C.world.time).add(V(0, 1.25, 0));
        void prevR;
      }
    });
    return k.end(4, 1);
  } },
  { name: 'Pendulum Bridge', zone: 3, build(k, C) {
    const br = k.plat(0, 0, -29, 4, 48, 1, { top: 'Smooth' });
    k.go(br);
    const Pd = 3.2, A = 1.15, L = 13, F = k.F;
    [-12, -22, -32, -42].forEach((z, i) => {
      const ang = (t) => A * Math.sin(2 * Math.PI * (t / Pd) + i * 1.3);
      k.box(0, 16.5, z, 14, 1, 1.4, 149);
      for (const s of [-1, 1]) k.box(s * 7, 8, z, 1, 17, 1, 149);
      const rope = k.rotor({ size: [0.4, L - 2, 0.4], position: [0, 16 - (L - 2) / 2, z], color: 199, canCollide: false }, [0, 16, z], [0, 0, 1], ang, [0, -(L - 2) / 2, 0]);
      const blade = k.rotor({ size: [4, 5, 1.2], position: [0, 16 - L, z], color: 131, reflectance: 0.3, name: 'Axe' }, [0, 16, z], [0, 0, 1], ang, [0, -L, 0]);
      const edge = k.rotor({ size: [4.2, 0.4, 1.3], position: [0, 16 - L - 2.5, z], color: 21, material: 'Neon', canCollide: false }, [0, 16, z], [0, 0, 1], ang, [0, -L - 2.5, 0]);
      blade.part.onTouched((ch) => C.fling(ch, blade.part, 75, 'axe'));
      void rope; void edge;
      const bx = (t) => Math.sin(ang(t)) * L;
      const clear = (dur) => { const t = C.world.time; for (let s = 0; s <= dur; s += 0.03) if (Math.abs(bx(t + s)) < 3.4) return false; return true; };
      k.walk(0, 0, z + 2.8, { r: 0.6 });
      k.walk(0, 0, z - 2.8, { r: 0.8, cond: () => clear(0.42), hard: 0.6, timing: true });
      void F;
    });
    return k.end(4, 1);
  } },
  { name: 'Avalanche', zone: 3, build(k, C) {
    // a slope up, with snowballs rolling down it and nooks in the side to hide in
    k.plat(0, 0, -5.5, 8, 1, 1);
    k.box(0, 7, -26, 8, 14, 40, 1, { shape: 'Wedge', rotation: [0, 180, 0], top: 'Smooth' });
    const top = k.plat(0, 14, -51, 10, 10, 1);
    const h = (z) => 14 * (-z - 6) / 40;
    const nooks = [-16, -26, -36];
    for (const z of nooks) { k.plat(6, h(z), z, 4, 4, 45, { t: h(z) + 1 }); k.box(8.4, h(z) + 2, z, 0.8, 4, 4, 1); }
    for (const s of [-1, 1]) k.box(s * 4.3, 8, -26, 0.6, 18, 41, 45, { transparency: 0.6, canCollide: false });
    const v = 22, Pb = 2.4, span = 40 / v;
    const ballZ = (t, n) => -46 + v * (t - n * Pb); // ball n rolls from the top at t = n * Pb
    const balls = [0, 1].map(() => {
      const p = k.dp({ shape: 'Ball', size: [6, 6, 6], position: [0, -100, 0], color: 1, name: 'Snowball' });
      p.setKinematic();
      p.onTouched((ch) => C.kill(ch, 'snowball'));
      return p;
    });
    const F = k.F, q = new THREE.Quaternion(), X = F.D(1, 0, 0);
    k.every((t) => {
      const n0 = Math.floor(t / Pb);
      [n0, n0 - 1].forEach((n, i) => {
        let z = ballZ(t, n); const b = balls[(n % 2 + 2) % 2].body;
        if (z > -9 || z < -47) z = -200; // (gone over the bottom edge, or not rolled yet)
        const w = z < -100 ? F.W(0, -300, 0) : F.W(0, h(z) + 3.2, z);
        b.position.set(w.x, w.y, w.z); b.velocity.set(0, 0, 0);
        q.setFromAxisAngle(X, -(t - n * Pb) * v / 3); b.quaternion.set(q.x, q.y, q.z, q.w);
        balls[(n % 2 + 2) % 2].mesh.position.copy(w); balls[(n % 2 + 2) % 2].mesh.quaternion.copy(q);
        void i;
      });
    });
    // is the lane clear while I run from z0 to z1 (uphill, toward -z)?
    const clearRun = (z0, z1) => {
      const t = C.world.time, T = (Math.abs(z1 - z0) + 4) / 16 + 0.2;
      for (let s = 0; s <= T; s += 0.03) {
        const zb = z0 + (z1 - z0) * Math.min(1, s / (T - 0.2));
        const n0 = Math.floor((t + s) / Pb);
        for (const n of [n0, n0 - 1]) { const z = ballZ(t + s, n); if (z <= -9 && z >= -47 && Math.abs(z - zb) < 5) return false; }
      }
      return true;
    };
    void span;
    k.walk(0, 0, -3, { r: 0.6 });
    let from = -3;
    for (const z of nooks) {
      const zz = z, f = from;
      k.push({ type: 'walk', p: k.W(6, h(zz), zz), r: 0.8, cond: () => clearRun(f, zz), hard: 0.6, timing: true, via: from === -3 ? null : k.W(2, h(f - 3), f - 3) });
      from = zz;
    }
    k.push({ type: 'walk', p: k.W(0, 14, -48), r: 0.9, cond: () => clearRun(-36, -46), hard: 0.6, timing: true, via: k.W(2, h(-39), -39) });
    k.cur = top;
    return k.end(4, 1);
  } },
  { name: 'Cracking Ice', zone: 3, build(k, C) {
    const cols = [-4.5, 0, 4.5];
    const rowZ = (r) => -8 - r * 5;
    const path = [1, 0, 0, 1, 2, 2, 1], fs = [], others = busy(k, C, -7, 7, -40, -5.5);
    k.wait((bot) => fs.every((t) => t.f.state === 'idle') && !others(bot) && others.go());
    for (let r = 0; r < 7; r++) for (let c = 0; c < 3; c++) {
      if ((r * 7 + c * 3) % 5 === 1 && path[r] !== c) continue; // a few holes
      const t = faller(k, C, cols[c], 0, rowZ(r), 4, 4, (r + c) % 2 ? 45 : 11, 0.45, 4, { props: { transparency: 0.2, top: 'Smooth' } });
      if (path[r] === c) { fs.push(t); k.go(t, { hurry: true, hard: 0.35, quick: true, cond: () => t.f.state === 'idle' }); }
    }
    return k.end(3, 1);
  } },
  { name: 'Blizzard Bridge', zone: 3, build(k, C) {
    const P = 4.6;
    const gust = (t) => { const ph = phase(t, P); if (ph < 2.6 || ph > 4.2) return 0; const s = Math.sin((ph - 2.6) / 1.6 * Math.PI); return (Math.floor(t / P) % 2 ? 1 : -1) * 8.5 * s; };
    const segs = [[0, 0, -11, 12], [1.5, 0, -26, 12], [0, 1, -41.25, 11.5]];
    const F = k.F;
    const calm = (d) => { const t = C.world.time; for (let s = 0; s <= d; s += 0.1) if (gust(t + s) !== 0) return false; return true; };
    segs.forEach(([x, y, z, len], i) => {
      const r = k.plat(x, y, z, 2.4, len, i % 2 ? 45 : 1, { top: 'Smooth' });
      k.go(r, { cond: i ? () => calm(0.8) : null, hard: 0.5, pause: () => gust(C.world.time) !== 0 });
      k.walk(x, y, z - len / 2 + 0.6, { r: 0.6, pause: () => gust(C.world.time) !== 0 });
    });
    k.zone(k.inBox(-14, 14, -2, 30, -48, -4), (ch, dt, t) => { const g = gust(t); if (g) { const d = F.D(g * dt, 0, 0); ch.body.position.x += d.x; ch.body.position.z += d.z; } });
    C.gusts.push({ F, gust, z0: -48, z1: -4 });
    return k.end(4, 0.5, 0, { cond: () => calm(0.8) });
  } },
  { name: 'Bobsled Run', zone: 3, build(k, C) {
    const slide = k.dp({ size: [9, 1.2, 90], position: [0, -0.6, -50], color: 45, top: 'Smooth', name: 'Slide' });
    slide.surfaceVelocity = k.D(0, 0, -24);
    slide.addDecal('Top', C.arrowTex(null, 9, 90, 24), { color: 0xd8f0ff });
    for (const s of [-1, 1]) k.box(s * 4.8, 0.75, -50, 0.6, 1.5, 90, 1);
    const blocks = [[2.5, -18, 4], [-2.5, -36, 4], [0, -54, 3], [2, -72, 5]];
    for (const [x, z, w] of blocks) k.kill(x, 1, z, w, 2, 3);
    const lanes = [[-2.6, -8], [-2.6, -20.5], [2.6, -33], [2.6, -38.5], [3.0, -50], [3.0, -56.5], [-2.6, -69], [-2.6, -74.5], [0, -86]];
    const fwd = k.D(0, 0, -1);
    for (const [x, z] of lanes) k.walk(x, 0, z, { r: 1.2, pass: fwd });
    k.cur = rect(0, 0, -50, 9, 90);
    return k.end(0, 0, 0);
  } },

  // ===== ZONE 5: COSMIC VOID =====
  { name: 'Low Gravity', zone: 4, build(k, C) {
    const LG = 0.62; // gravity taken away
    const g = 196.2 * (1 - LG);
    const items = [[0, 0, 8, 26], [6, 4, 10, 149], [-4, -2, 11, 26], [4, 6, 9, 149], [0, 0, 12, 26]];
    for (const [x, dy, gap, c] of items) {
      const prev = k.cur, y = prev.y + dy, z = prev.z0 - gap - 3;
      const r = k.plat(x, y, z, 6, 6, c);
      k.box(x, y - 2.5, z, 4.5, 3, 4.5, 199); k.box(x, y - 4.5, z, 2.5, 2, 2.5, 199);
      k.go(r, { g, hard: 0.4 });
    }
    k.zone(k.inBox(-25, 25, -10, 60, -96, -3), (ch, dt) => { ch.body.velocity.y += 196.2 * LG * dt; ch.lowGrav = C.world.time; });
    const e = k.end(9, 2, 0, { g });
    return e;
  } },
  { name: 'Orbit', zone: 4, build(k, C) {
    const cz = -24, R = 13, w = 0.75;
    k.box(0, -2, cz, 12, 12, 12, 104, { shape: 'Ball', material: 'Neon', canCollide: false });
    k.box(0, -2, cz, 0.4, 21, 21, 110, { shape: 'Cylinder', rotation: [0, 0, 70], material: 'Neon', transparency: 0.4, canCollide: false });
    const F = k.F;
    const pos = (i, t) => { const a = w * t + i * 2 * Math.PI / 3; return { x: R * Math.cos(a), y: -0.6, z: cz + R * Math.sin(a) }; };
    const ms = [0, 1, 2].map((i) => k.mover({ size: [4, 1.2, 4], position: [0, -0.6, 0], color: [110, 104, 23][i], top: 'Smooth' }, (t) => pos(i, t)));
    const exit = k.plat(0, 0, -43, 6, 4, 149);
    const near = (pt, d) => { const t = C.world.time + 0.45; return ms.findIndex((m, i) => { const p = pos(i, t); return Math.hypot(p.x - pt[0], p.z - pt[1]) < d; }); };
    k.walk(0, 0, -4.6, { r: 0.5 });
    k.push({
      type: 'jump', cond: (bot) => { const i = near([0, cz + R], 1.8); if (i >= 0) bot.mem.orb = i; return i >= 0; },
      p: (bot) => ms[bot.mem.orb ?? 0].world(C.world.time).add(V(0, 0.6, 0)), hard: 0.5, timing: true,
    });
    k.push({ type: 'ride', hold: (bot) => ms[bot.mem.orb ?? 0].world(C.world.time).add(V(0, 0.6, 0)), cond: (bot) => { const p = pos(bot.mem.orb ?? 0, C.world.time + 0.4); return Math.hypot(p.x, p.z - (cz - R)) < 2.4; } });
    k.push({ type: 'jump', p: F.W(0, 0, -42.5), hard: 0.4 });
    k.cur = exit;
    return k.end(4, 1);
  } },
  { name: 'Invisible Path', zone: 4, build(k, C) {
    const P = 2.6, show = 0.7;
    const vis = (t) => phase(t, P) < show;
    const parts = [];
    const items = [[0, 0, 3.5], [3, 1, 3.5], [-1, 1, 4], [2, 0, 3.5], [-2, 1, 4], [1, 0, 3.5], [-1, 1, 4]];
    for (const [x, dy, gap] of items) {
      const prev = k.cur, y = prev.y + dy, z = prev.z0 - gap - 2;
      const r = k.plat(x, y, z, 4, 4, 110, { dyn: true, transparency: 1, material: 'Neon', top: 'Smooth' });
      parts.push(r.part);
      // they wait for a flash, then jump while they still remember where it was
      k.go(r, { hard: 0.55, cond: (bot) => bot.skill > 0.9 ? phase(C.world.time, P) < 2.0 : phase(C.world.time, P) < 1.3, timing: true });
    }
    // (in steps: every transparency is a material of its own)
    k.every((t) => { const ph = phase(t, P), a = ph < show ? Math.round((0.25 + 0.75 * (ph / show)) * 10) / 10 : 1; for (const p of parts) if (p._a !== a) { p._a = a; p.setTransparency(a); } });
    void vis;
    return k.end(4, 0);
  } },
  { name: 'Space Rollers', zone: 4, build(k) {
    k.rotor({ shape: 'Cylinder', size: [18, 7, 7], position: [0, -3.5, -15], rotation: [0, 90, 0], color: 104 }, [0, -3.5, -15], [0, 0, 1], (t) => 1.4 * t);
    k.rotor({ shape: 'Cylinder', size: [18, 7, 7], position: [0, -2.5, -37], rotation: [0, 90, 0], color: 110 }, [0, -2.5, -37], [0, 0, 1], (t) => -1.6 * t);
    for (const [z, y] of [[-15, -3.5], [-37, -2.5]]) for (const s of [-1, 1]) k.box(0, y, z + s * 9.3, 2, 2, 0.6, 149);
    k.cur = rect(0, 0, -15, 1.6, 18);
    k.walk(0, 0, -4.6, { r: 0.4 });
    k.jumpTo([0, 0, -4.6], [0, 0, -7.2], { hard: 0.4 });
    k.walk(0, 0, -23.4, { r: 0.5 });
    k.jumpTo([0, 0, -23.4], [0, 1, -29.2], { hard: 0.5 });
    k.walk(0, 1, -45.4, { r: 0.5 });
    k.cur = rect(0, 1, -37, 1.6, 18);
    return k.end(4, 0);
  } },
  { name: 'Speed Run', zone: 4, build(k, C) {
    const pad = k.dp({ size: [6, 0.3, 6], position: [0, 0.15, -8], color: 107, material: 'Neon', top: 'Smooth', name: 'SpeedPad' });
    pad.addDecal('Top', C.arrowTex(null, 6, 6, 8), { color: 0x10ffe0 });
    k.plat(0, 0, -8, 6, 6, 149);
    pad.onTouched((ch) => { if (ch.alive) { if (!ch.speedUntil || ch.speedUntil < C.world.time + 3) C.sfx('boost', pad.mesh.position, ch); ch.speedUntil = C.world.time + 3.6; } });
    const fs = [], tile = (z) => fs.push(faller(k, C, 0, 0, z, 4, 3.9, 110, 0.18, 3, { props: { material: 'Neon', top: 'Smooth' } }));
    for (let z = -13; z >= -45; z -= 4) tile(z);
    for (let z = -61; z >= -77; z -= 4) tile(z);
    k.plat(0, 0, -95, 8, 8, 149);
    // the whole track has to be there: wait for the one in front to get across
    const others = busy(k, C, -5, 5, -90, -10);
    k.wait((bot) => fs.every((t) => t.f.state === 'idle') && !others(bot) && others.go());
    k.walk(0, 0, -8, { r: 1, hurry: true });
    k.walk(0, 0, -46.4, { r: 0.6, hurry: true });
    k.jumpTo([0, 0, -46.4], [0, 0, -60], { speed: 36, hard: 0.4 });
    k.walk(0, 0, -78.4, { r: 0.6, hurry: true });
    k.jumpTo([0, 0, -78.4], [0, 0, -92], { speed: 36, hard: 0.4 });
    k.cur = rect(0, 0, -95, 8, 8);
    return k.end(4, 1);
  } },
  { name: 'The Gauntlet', zone: 4, build(k, C) {
    // a slider...
    const xs = (t) => 6 * Math.sin(2 * Math.PI * t / 3.6);
    const S = k.mover({ size: [5, 1.2, 5], position: [0, -0.6, -11.5], color: 104, top: 'Smooth' }, (t) => ({ x: xs(t), y: -0.6, z: -11.5 }));
    k.walk(0, 0, -4.6, { r: 0.5 });
    const F = k.F;
    k.push({ type: 'jump', p: () => S.world(C.world.time).add(F.D(0, 0.6, 1)), cond: () => Math.abs(xs(C.world.time + 0.45)) < 0.9, hard: 0.55, timing: true });
    k.push({ type: 'ride', hold: () => S.world(C.world.time).add(F.D(0, 0.6, -1.2)), cond: () => Math.abs(xs(C.world.time + 0.4)) < 0.9 });
    k.push({ type: 'jump', p: k.W(0, 0, -18.6), hard: 0.4 });
    const l1 = k.plat(0, 0, -20.5, 6, 6, 149);
    // ...a laser gate...
    k.plat(0, 0, -30, 4, 13, 26, { top: 'Smooth' });
    const L = laser(k, C, 0, 0, -30, 4, 6.5, 2.0, 1.0, 0);
    k.walk(0, 0, -27.4, { r: 0.5 });
    k.walk(0, 0, -32.6, { r: 0.7, cond: () => L.offFor(C.world.time, 0.4), hard: 0.5, timing: true });
    // ...a pendulum...
    k.plat(0, 0, -43, 4, 12, 26, { top: 'Smooth' });
    const ang = (t) => 1.15 * Math.sin(2 * Math.PI * t / 2.8);
    k.box(0, 16.5, -43, 14, 1, 1.4, 149); for (const s of [-1, 1]) k.box(s * 7, 8, -43, 1, 17, 1, 149);
    const blade = k.rotor({ size: [4, 5, 1.2], position: [0, 3, -43], color: 131, reflectance: 0.3, name: 'Axe' }, [0, 16, -43], [0, 0, 1], ang, [0, -13, 0]);
    k.rotor({ size: [0.4, 11, 0.4], position: [0, 10.5, -43], color: 199, canCollide: false }, [0, 16, -43], [0, 0, 1], ang, [0, -5.5, 0]);
    blade.part.onTouched((ch) => C.fling(ch, blade.part, 75, 'axe'));
    const clear = (dur) => { const t = C.world.time; for (let s = 0; s <= dur; s += 0.03) if (Math.abs(Math.sin(ang(t + s)) * 13) < 3.4) return false; return true; };
    k.walk(0, 0, -40.2, { r: 0.5 });
    k.walk(0, 0, -45.8, { r: 0.7, cond: () => clear(0.42), hard: 0.6, timing: true });
    k.walk(0, 0, -48.6, { r: 0.5 });
    // ...and a fire spinner
    k.box(0, -0.6, -59, 1.2, 14, 14, 26, { shape: 'Cylinder', rotation: [0, 0, 90] });
    k.box(0, 1.5, -59, 3, 2.6, 2.6, 149, { shape: 'Cylinder', rotation: [0, 0, 90] });
    const bar = spinBar(k, C, 0, 0.6, -59, 13.6, 0.8, 1.6, 0.5, { cause: 'fire' });
    k.cur = rect(0, 0, -43, 4, 12);
    // jump on just ahead of an arm (it turns 0.8 rad while you're in the air) and run round ahead of it: it's slower than you
    k.jumpTo([0, 0, -48.6], [0, 0, -53.2], { hard: 0.5, timing: true, cond: () => { const d = bar.behind(-Math.PI / 2, C.world.time); return d > 1.3 && d < 1.65; } });
    k.walk(5.2, 0, -59, { r: 0.8, hurry: true }); k.walk(0, 0, -65.2, { r: 0.6, hurry: true });
    k.stage.tick = (bot) => hopOver(bot, C, bar);
    k.cur = rect(0, 0, -59, 9, 9); void l1;
    return k.end(3, 1);
  } },
  { name: 'Final Ascent', zone: 4, build(k, C) {
    k.box(0, 12, -24, 46, 6, 6, 24, { shape: 'Cylinder', rotation: [0, 0, 90], reflectance: 0.2 });
    const seq = [];
    seq.push(k.go(k.plat(0, 2, -10, 4, 4, 127)));
    // half deadly
    const f2 = k.plat(6, 4.5, -16, 4, 4, 127);
    k.kill(7.25, 4.75, -16, 1.5, 0.5, 4);
    k.walk(1.4, 2, -10.6, { r: 0.4 }); k.jumpTo([1.4, 2, -10.6], [5, 4.5, -15.2], { hard: 0.6 }); k.cur = rect(5, 4.5, -16, 2, 4); void f2;
    // crumbling
    const f3 = faller(k, C, 6, 7, -24, 4, 4, 24, 0.45, 3);
    k.go(f3, { hurry: true, hard: 0.5, quick: true, cond: () => f3.f.state === 'idle' });
    k.go(k.plat(0, 9.5, -30, 4, 4, 127), { hard: 0.5 });
    // sliding
    const zs = (t) => -24 + 3 * Math.sin(t * 1.4);
    const M = k.mover({ size: [4, 1.2, 4], position: [-6, 11.4, -24], color: 24, top: 'Smooth' }, (t) => ({ x: -6, y: 11.4, z: zs(t) }));
    k.walk(-1.4, 9.5, -30, { r: 0.4 });
    k.push({ type: 'jump', p: () => M.world(C.world.time).add(V(0, 0.6, 0)), cond: () => zs(C.world.time + 0.4) < -25.5, hard: 0.6, timing: true });
    k.push({ type: 'ride', hold: () => M.world(C.world.time).add(V(0, 0.6, 0)), cond: () => zs(C.world.time + 0.4) > -22.6 });
    k.cur = rect(-6, 12, -21, 4, 2);
    k.go(k.plat(-6, 14.5, -15, 4, 4, 127), { hard: 0.5 });
    k.go(k.plat(0, 17, -15, 4, 8, 127), { hard: 0.5 });
    // the truss up the golden pillar, to the top
    k.sp({ shape: 'Truss', size: [2, 18.8, 2], position: [0, 26.4, -20], color: 24 });
    k.walk(0, 17, -17.8, { r: 0.4 });
    k.push({ type: 'climb', dir: k.D(0, 0, -1), p: k.W(0, 35.4, -23) });
    void seq;
    return null;
  } },
];

export { rnd, clamp, lerp, hd, reach };
