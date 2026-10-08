// Event 1: THE STAIR DISMOUNT. The Grand Staircase of Mount Olympus: 24
// marble steps from the temple at the top down to the fountain in the plaza.
// Throw yourself off the top.
// Scoring:
//  - every impact scores; the harder the hit, the more, and heads count most
//  - hits that come quickly build a combo
//  - broken bones are a bonus
//  - so is smashing the amphorae, bouncing off the toppled columns and
//    landing in the fountain.
import * as THREE from 'three';
import { mat, colorMat, boxGeo, cylGeo, flutedGeo, V, rnd } from '../kit.js';
import { aimPhase, amphora, award, hitName } from './common.js';
import * as A from '../audio.js';

const ZB = -262, RISE = 3.5, RUN = 3.0, N = 22, X = 40;
const Z_TOP = ZB - N * RUN, Y_TOP = N * RISE; // -343.6, 76.8
const T0 = Z_TOP - 26, T1 = T0 - 44; // the temple's front and back rows of columns
const LANE = 9;
const AIM_SECS = 9, FALL_SECS = 15, FLAIL_SECS = 5;
const FOUNTAIN = { x: 0, z: -228, r: 12 };

/** The top of the steps at z. */
function profile(z) {
  if (z >= ZB) return 0;
  if (z >= Z_TOP) return Math.ceil((ZB - z) / RUN - 1e-6) * RISE;
  return Y_TOP;
}
function smooth(z) { return z >= ZB ? 0 : z >= Z_TOP ? ((ZB - z) / (ZB - Z_TOP)) * Y_TOP : Y_TOP; }

function buildHill(K) {
  // a grassy mountain with the stairs cut into its face and the temple terrace on top
  const nx = 66, nz = 42, x0 = -264, x1 = 264, z0 = -580, z1 = -238;
  const H = (x, z) => {
    const ax = Math.abs(x);
    if (z <= Z_TOP + 9 && z > Z_TOP - 88 && ax < 66) return Y_TOP - 0.4;
    let base;
    if (z > Z_TOP - 88) base = smooth(z);
    else base = Y_TOP * Math.max(0, 1 - Math.pow((Z_TOP - 88 - z) / 130, 2));
    const edge = z > Z_TOP ? 43 : 66;
    const d = Math.max(0, ax - edge);
    let h = base + 2.5 - d * 0.62 - Math.max(0, ax - 150) * 0.4;
    h += Math.sin(x * 0.07 + z * 0.05) * 3 + Math.sin(x * 0.023 - z * 0.04) * 6;
    return Math.max(-1, h * (z > -260 ? Math.max(0, (-238 - z) / 22) : 1));
  };
  const P = [], U = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const xa = x0 + ((x1 - x0) * i) / nx, xb = x0 + ((x1 - x0) * (i + 1)) / nx, za = z0 + ((z1 - z0) * j) / nz, zb = z0 + ((z1 - z0) * (j + 1)) / nz;
      const cx = (xa + xb) / 2, cz = (za + zb) / 2;
      if (Math.abs(cx) < 44 && cz > Z_TOP - 1) continue; // the stairs
      const q = [[xa, za], [xb, za], [xb, zb], [xa, zb]].map(([x, z]) => [x, H(x, z), z]);
      P.push(...q[0], ...q[2], ...q[1], ...q[0], ...q[3], ...q[2]);
      const uv = (p) => [p[0] / 40, p[2] / 40];
      U.push(...uv(q[0]), ...uv(q[2]), ...uv(q[1]), ...uv(q[0]), ...uv(q[3]), ...uv(q[2]));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.computeVertexNormals();
  K.geo(g, mat('grass'), 0, 0, 0);
  // rocks poking out of the slopes
  const rock = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 60; i++) {
    const x = (Math.random() < 0.5 ? -1 : 1) * rnd(74, 200), z = rnd(-520, -265);
    const s = rnd(2, 7);
    K.geo(rock, colorMat(0x9a9488, 0.95), x, H(x, z) + s * 0.3, z, [rnd(0, 90), rnd(0, 360), 0], { scale: [s * 1.3, s, s] });
  }
}

function buildTemple(K, fires) {
  // the terrace
  K.span(-66, Y_TOP - 6, Z_TOP - 88, 66, Y_TOP, Z_TOP, 'marble');
  K.box(0, Y_TOP + 0.04, Z_TOP - 0.6, 132, 0.1, 1.2, 'marbleDark', { col: false });
  // stylobate: three steps
  for (let i = 0; i < 3; i++) K.span(-40 + i * 1.5, Y_TOP + i * 1.1, T1 - 5 + i * 1.5, 40 - i * 1.5, Y_TOP + (i + 1) * 1.1, T0 + 5 - i * 1.5, 'marble');
  const yb = Y_TOP + 3.3, colH = 26;
  const shaft = flutedGeo(2, 1.7, colH, 18, 8);
  const col = (x, z) => {
    K.geo(shaft, mat('marble'), x, yb + colH / 2, z);
    K.col(x, yb + colH / 2, z, 3.6, colH, 3.6);
    K.box(x, yb + colH + 0.6, z, 5, 1.2, 5, 'marble', { col: false });
    K.geo(cylGeo(2.6, 2, 0.8, 18), mat('marble'), x, yb + colH - 0.2, z);
    K.box(x, yb + 0.5, z, 4.6, 1, 4.6, 'marble', { col: false });
  };
  for (let i = 0; i < 8; i++) { const x = -31.5 + i * 9; col(x, T0); col(x, T1); }
  for (let z = T0 - 11; z > T1 + 1; z -= 11) { col(-31.5, z); col(31.5, z); }
  // the entablature and the pediments
  const ye = yb + colH + 1.2;
  K.span(-36, ye, T1 - 4, 36, ye + 3.5, T0 + 4, 'marble', { col: false });
  K.span(-36.5, ye + 3.5, T1 - 4.5, 36.5, ye + 5, T0 + 4.5, 'marbleDark', { col: false });
  for (const [z, s] of [[T0 + 4.4, 1], [T1 - 4.4, -1]]) {
    const tri = new THREE.Shape(); tri.moveTo(-36.5, 0); tri.lineTo(36.5, 0); tri.lineTo(0, 12); tri.closePath();
    const g = new THREE.ExtrudeGeometry(tri, { depth: 1.6, bevelEnabled: false });
    g.translate(0, 0, s > 0 ? -1.6 : 0);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 24, uv.getY(i) / 24);
    K.geo(g, mat('marble'), 0, ye + 5, z);
  }
  // the roof: two slopes of terracotta tiles
  const slope = Math.atan2(12, 36.5), L = Math.hypot(12, 36.5);
  for (const sx of [-1, 1]) K.geo(boxGeo(L + 1, 1, T0 - T1 + 10, 6), colorMat(0xb8573a, 0.8), sx * 18.25, ye + 5 + 6.4, (T0 + T1) / 2, [0, 0, -sx * slope * 57.2958]);
  // the frieze: a band of blue
  K.span(-36.2, ye + 1.2, T0 + 4.1, 36.2, ye + 2.4, T0 + 4.6, colorMat(0x1f4fa0, 0.6), { col: false });
  // a golden statue of a champion inside, arm raised
  const zs = (T0 + T1) / 2;
  K.cyl(0, yb + 2, zs, 3.5, 4, 'marble', { seg: 20 });
  const gold = mat('gold');
  K.box(0, yb + 7, zs, 4, 4, 2, gold, { col: false }); K.box(0, yb + 10.2, zs, 2.4, 2.4, 2.4, gold, { col: false });
  K.box(-3, yb + 8.5, zs, 2, 4, 2, gold, { col: false, rot: [0, 0, -150] }); K.box(3, yb + 7, zs, 2, 4, 2, gold, { col: false });
  K.box(-1, yb + 3, zs, 2, 4, 2, gold, { col: false }); K.box(1, yb + 3, zs, 2, 4, 2, gold, { col: false });
  // braziers either side of the start
  for (const sx of [-1, 1]) {
    const x = sx * 50, z = Z_TOP - 6;
    K.cyl(x, Y_TOP + 3, z, 1.4, 6, 'darkSteel', { seg: 10 });
    K.geo(new THREE.CylinderGeometry(3, 1.6, 2, 14), mat('bronze'), x, Y_TOP + 7, z);
    fires.push([V(x, Y_TOP + 7.8, z), 0.75]);
  }
}

function buildStairs(K, props, fires, world) {
  for (let i = 0; i < N; i++) {
    const zf = ZB - i * RUN, top = (i + 1) * RISE;
    K.span(-X, Math.max(0, top - RISE * 2.5), zf - RUN, X, top, zf, 'marble', { tag: 'step' });
    K.box(0, top - 0.15, zf - 0.2, X * 2, 0.32, 0.42, 'marbleDark', { col: false }); // the nosing
  }
  // the side walls (stepped, with pillars and urns on top); tall invisible colliders keep everyone on the stairs
  for (const sx of [-1, 1]) {
    const x = sx * (X + 1.5);
    for (let z = ZB; z > Z_TOP - 1; z -= RUN) {
      const top = profile(z - 0.01) + 2.6;
      K.span(x - 1.5, 0, z - RUN, x + 1.5, top, z, 'stone', { col: false });
      K.col(x, (top + 14) / 2, z - RUN / 2, 3, top + 14, RUN);
    }
    for (const k of [0.5, 8.5, 16.5, 23.5]) {
      const z = ZB - k * RUN, y = profile(z) + 2.6;
      K.box(x, y + 2, z, 4.2, 4, 4.2, 'marble');
      K.geo(new THREE.CylinderGeometry(2.4, 1.2, 1.6, 14), mat('bronze'), x, y + 4.8, z);
      if (k === 8.5 || k === 16.5) fires.push([V(x, y + 5.6, z), 0.6]);
    }
  }
  // toppled columns lying across the steps
  const stepTop = (k) => (k + 1) * RISE, stepZ = (k) => ZB - (k + 0.5) * RUN;
  const lying = (x, k, len, yaw) => {
    const y = stepTop(k) + 2.1, z = stepZ(k) + 0.8;
    K.geo(flutedGeo(2.1, 2.1, len, 18, 8).rotateZ(Math.PI / 2), mat('marble'), x, y, z, yaw);
    K.col(x, y, z, len, 3.8, 3.8, yaw, { tag: 'column' });
  };
  lying(7, 6, 22, 0.1);
  lying(-18, 15, 12, -0.35);
  lying(22, 19, 8, 0.6);
  // stone benches near the walls
  for (const [x, k] of [[-31, 11], [31, 3], [-30, 20]]) {
    const y = stepTop(k), z = stepZ(k);
    K.box(x, y + 1.6, z, 8, 0.8, 2.4, 'marble');
    for (const dx of [-3, 3]) K.box(x + dx, y + 0.6, z, 0.9, 1.2, 1.8, 'marble', { col: false });
  }
  // amphorae dotted down the stairs
  for (const [x, k] of [[-26, 2], [14, 4], [-8, 9], [26, 10], [-20, 13], [4, 17], [-33, 18], [18, 21], [-12, 22], [33, 14]]) props.push(amphora(world, V(x, stepTop(k), stepZ(k)), { scale: rnd(0.75, 1) }));
  // the plaza and its fountain
  K.span(-60, 0, -262, 60, 0.12, -200, 'paving', { col: false });
  const F = FOUNTAIN;
  K.cyl(F.x, 0.9, F.z, F.r, 1.8, 'marble', { seg: 36, col: false });
  // the rim as a ring of boxes (so a body can land in the water)
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; K.col(F.x + Math.cos(a) * (F.r - 0.6), 0.9, F.z + Math.sin(a) * (F.r - 0.6), 1.4, 1.8, F.r * 0.42, -a); }
  K.cyl(F.x, 1.5, F.z, F.r - 1.1, 0.25, colorMat(0x3f9fd6, 0.06, 0.1, { transparent: true, opacity: 0.85 }), { col: false, seg: 36, noShadow: true });
  K.cyl(F.x, 4, F.z, 1.6, 6, 'marble', { seg: 14 });
  K.cyl(F.x, 7.3, F.z, 4, 0.8, 'marble', { seg: 22, col: false });
  K.box(F.x, 9.5, F.z, 1.2, 3.6, 1.2, 'gold', { col: false });
}

/** Following the fall: from downhill and to the side, so the steps never get in the way. */
function followCam(E, a) {
  const off = V(a.x > 0 ? -16 : 16, 15, 24);
  E.shot(() => (a.rag?.alive ? a.rag.position : a.p.character.rootPosition).clone().add(off), () => (a.rag?.alive ? a.rag.position : a.p.character.rootPosition).clone(), 3.5);
}

/** The aim camera: behind and above, looking down the line the athlete will take. */
function aimCam(E, a) {
  const f = a.p.character.facing, fx = -Math.sin(f), fz = -Math.cos(f);
  return {
    pos: () => V(a.x - fx * 12 - fz * 5, Y_TOP + 30, Z_TOP - 2.5 - fz * 12 + fx * 5),
    look: () => V(a.x + fx * 40, Y_TOP - 46, Z_TOP - 2.5 + fz * 40),
  };
}

export default {
  id: 'stairs', name: 'Stair Dismount', icon: '🏛️', color: '#ffd24a',
  where: 'The Grand Staircase of Mount Olympus',
  desc: 'Throw yourself down the steps. Every impact scores, heads count most, broken bones are a bonus.',
  keys: [['A D', 'aim'], ['Space', 'hold for power, let go to jump'], ['Space', 'in the air: flail']],
  time: AIM_SECS + FALL_SECS + 2, higher: true, camDist: 24,
  fmt: (a) => `${Math.round(a.score).toLocaleString('en-US')}`,

  build(K, E) {
    const props = [], fires = [];
    buildHill(K);
    buildTemple(K, fires);
    buildStairs(K, props, fires, E.world);
    // spectators on terraces either side of the plaza
    for (const sx of [-1, 1]) {
      for (let row = 0; row < 6; row++) {
        const x0 = sx * (66 + row * 3);
        K.span(x0 - 1.5, 0, -258, x0 + 1.5, 1 + row * 1.4, -204, 'stone', { col: false });
        for (let z = -255; z < -206; z += 2.3) if (Math.random() < 0.75) E.park.crowd.seat(x0, 1 + row * 1.4, z, sx > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
    }
    const F = FOUNTAIN;
    const water = [{ x0: F.x - F.r + 1, x1: F.x + F.r - 1, z0: F.z - F.r + 1, z1: F.z + F.r - 1, y: 1.5, bottom: -1, round: true }];
    return { props, fires, water, update() { for (const p of props) p.sync(); } };
  },

  shots: () => [
    { from: V(-30, 8, -208), to: V(10, 26, -250), look: V(0, 55, Z_TOP), secs: 2.8 },
    { from: V(62, 112, Z_TOP + 14), to: V(22, 100, Z_TOP + 30), look: V(0, 84, Z_TOP - 22), look2: V(0, 30, -280), secs: 2.8 },
  ],

  enter(E, ev) {
    for (const p of ev.venue.props) p.reset();
    ev.ath.forEach((a, k) => {
      a.x = -LANE * 3.5 + (k % 8) * LANE + (k >= 8 ? LANE / 2 : 0);
      a.aim = 0;
      E.stand(a.p, V(a.x, Y_TOP, Z_TOP - 2.5 - (k >= 8 ? 4 : 0)), Math.PI, true);
    });
  },

  spectate: () => ({ position: V(rnd(-50, 50), 0.2, rnd(-215, -205)), yaw: Math.PI }),

  start(E, ev) {
    ev.aimLeft = AIM_SECS;
    ev.status = 'Hold SPACE for power, let go to jump!';
    const me = ev.ath.find((a) => a.p.isLocal);
    if (me) {
      const c = aimCam(E, me);
      E.shot(c.pos, c.look, 5);
      E.ui.hint('<b>A</b><b>D</b> aim · hold <b>SPACE</b> to power up, let go to jump');
      E.ui.myScore(0);
    }
    A.whistle();
  },

  update(E, ev, dt) {
    ev.aimLeft -= dt;
    const waiting = aimPhase(E, ev, dt, {
      aim: (a, dx) => { a.aim = Math.max(-0.5, Math.min(0.5, a.aim - dx * 1.2)); const ch = a.p.character; ch.facing = ch.lockFacing = Math.PI + a.aim; },
      botAim: (a) => { const s = a.bot.skill; a.bot.power = Math.min(1, rnd(0.35, 0.75) + s * 0.3); a.aim = rnd(-0.3, 0.3); const ch = a.p.character; ch.facing = ch.lockFacing = Math.PI + a.aim; a.bot.at = rnd(1.2, AIM_SECS - 1.5); },
      launch: (a, pw) => {
        const ch = a.p.character, f = Math.PI + a.aim;
        const fx = -Math.sin(f), fz = -Math.cos(f);
        const rag = E.ragdoll(a);
        const fwd = 10 + 28 * pw, up = 9 + 14 * pw, spin = 4 * (0.6 + pw);
        rag.push(fx * fwd, up, fz * fwd, V(fz * spin, rnd(-1, 1), -fx * spin));
        rag.pose('superman', 0.25);
        E.world.delay(0.25, () => rag.alive && rag.pose(null));
        A.swoosh(ch.rootPosition);
        a.wriggles = 2;
        if (a.p.isLocal) { E.ui.hint('hold <b>SPACE</b> to flail'); followCam(E, a); }
      },
    });
    if (waiting) ev.timer = Math.max(0, ev.aimLeft);
    else { ev.fallT = (ev.fallT ?? FALL_SECS) - dt; ev.timer = ev.fallT; ev.status = 'Tumble!'; }
    // in the air: flailing, and settling
    let busy = 0;
    for (const a of ev.ath) {
      if (!a.launched) { busy++; continue; }
      if (a.done) continue;
      const rag = a.rag;
      if (!rag) { a.done = true; continue; }
      // (only while actually tumbling, and only for so long: no flapping about on the ground for points)
      if (a.p.isLocal) { const on = E.held(' ') && rag.torso.velocity.length() > 6 && (a.flailT || 0) < FLAIL_SECS; if (on) a.flailT = (a.flailT || 0) + dt; rag.flail(on, 0.16); }
      else if (a.bot && !a.bot.flailed && ev.t - a.launchT > 0.3) { a.bot.flailed = true; if (Math.random() < 0.5) { rag.flail(true, 0.14); E.world.delay(rnd(0.6, 2), () => rag.alive && rag.flail(false)); } }
      // stuck on the steps? wriggle free (twice)
      a.stuckT = rag.still > 0.45 || rag.asleep ? (a.stuckT || 0) + dt : 0;
      const stuck = a.stuckT > 0 && rag.position.y > 6 && a.wriggles > 0;
      if (stuck && a.p.isLocal) E.ui.hint(`stuck! press <b>SPACE</b> to wriggle free (${a.wriggles} left)`);
      if (stuck && ((a.p.isLocal && E.pressed(' ')) || (a.bot && a.stuckT > 0.5 + (1 - a.bot.skill) * 0.8))) {
        a.wriggles--; a.stuckT = 0;
        const f = Math.PI + a.aim;
        rag.push(-Math.sin(f) * rnd(12, 18), rnd(10, 15), -Math.cos(f) * rnd(12, 18), V(-Math.cos(f) * 5, rnd(-2, 2), Math.sin(f) * 5));
        A.swoosh(rag.position);
        if (a.p.isLocal) E.ui.hint(a.wriggles ? 'hold <b>SPACE</b> to flail' : '');
      }
      // the combo runs out
      if (ev.t - a.lastHitT > 0.9 && a.combo > 1) { a.combo = 1; if (a.p.isLocal) E.ui.combo(1); }
      if (((rag.still > 1.2 || rag.asleep) && (a.wriggles === 0 || rag.position.y < 6 || a.stuckT > 3)) || rag.lowest() < -30 || ev.t - a.launchT > FALL_SECS - 1) {
        a.done = true;
        rag.flail(false);
        if (a.p.isLocal) { E.ui.hint(''); E.ui.toast(`Final score: ${Math.round(a.score).toLocaleString('en-US')}`, '#ffd24a', 3); A.ding(); }
        continue;
      }
      busy++;
    }
    return !busy && ev.t > 2;
  },

  resultCam: (E, ev, w) => { const p = () => (w.rag?.alive ? w.rag.position : w.p.character.rootPosition); return [() => p().clone().add(V(Math.sin(E.phaseT * 0.2) * 14, 13, 22)), () => p().clone()]; },

  impact(E, ev, a, h) {
    if (!a.launched || a.done) return;
    if (h.v < 9) return;
    let pts = Math.pow(h.v - 8, 1.45) * h.w;
    if (h.other?.prop) pts *= 1.4;
    if (h.other?.rag) pts *= 1.25;
    if (h.other?.tag === 'column') pts *= 1.3;
    if (ev.t - a.lastHitT < 0.9) a.combo = Math.min(3, a.combo + 0.1);
    a.lastHitT = ev.t;
    pts *= a.combo;
    award(E, a, pts, pts > 40 ? hitName(h) : '', h.point);
    if (a.p.isLocal) E.ui.combo(a.combo);
  },
  broke(E, ev, a, part) {
    if (!a.launched || a.done) return;
    const bonus = [900, 1200, 500, 500, 650, 650][part] * a.combo;
    award(E, a, bonus, `BROKEN ${['RIBS', 'SKULL', 'ARM', 'ARM', 'LEG', 'LEG'][part]}!`, a.rag.position.clone().add(V(0, 3, 0)), { cls: 'brk', pop: true, color: '#ff8a7a' });
  },
  splash(E, ev, a, i) {
    if (!a.launched || a.done || a.splashed || i !== 0) return;
    a.splashed = true;
    award(E, a, 750, 'SPLASHDOWN!', a.rag.position.clone().add(V(0, 3, 0)), { pop: true, color: '#7cd8ff' });
    if (a.p.isLocal) A.cheer(1);
  },
  leave(E, ev) { for (const a of ev.ath) a.rag?.flail(false); },
};
