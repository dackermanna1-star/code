// Ragdoll quality after death: a dummy is killed in several ways and the corpse is followed for
// 6 s. Reports the worst joint-limit overshoot, floor and limb-vs-body interpenetration, the time
// the body takes to come to rest, the residual jitter once it has, and the peak segment speed.
// Lower is better for everything. Usage: node tools/bench/corpse.mjs [--seeds=N]
import { scene, run, report, fireAt, segPos, Vec3, finite } from './common.mjs';
import { ContactCollector, collideShapes } from '../../src/physics/collide.js';
import { decomposeSwingTwist } from '../../src/physics/joints.js';
import { Quat } from '../../src/physics/math.js';

const seeds = +(process.argv.find((a) => a.startsWith('--seeds='))?.split('=')[1] ?? 3);
const DEG = 180 / Math.PI;

const KILLS = {
  headFront: (sb, p) => fireAt(sb, 'sniper', segPos(p, 'head'), [0.3, 0.1, 12]),
  headRdr: (sb, p) => { sb.setReactions('rdr'); fireAt(sb, 'sniper', segPos(p, 'head'), [0.3, 0.1, 12]); },
  chestBack: (sb, p) => { for (let i = 0; i < 3; i++) fireAt(sb, 'rifle', segPos(p, 'chest').add(new Vec3(0.04 * i, -0.05 * i, 0)), [0.5, 0.2, -10]); },
  shotgun: (sb, p) => { fireAt(sb, 'shotgun', segPos(p, 'abdomen'), [0, 0.2, 2.5]); fireAt(sb, 'shotgun', segPos(p, 'chest'), [0, 0.2, 2.5]); },
  walkHead: (sb, p) => {
    sb.walkTo(p, new Vec3(0, 0, 8));
    run(sb, 2.2);
    fireAt(sb, 'pistol', segPos(p, 'head'), [2, 0.2, 6]);
  },
};

const _q = new Quat();
function limitExcess(j) {
  const L = j.limits;
  if (!L || !j.enabled) return 0;
  const d = decomposeSwingTwist(j.jointRotation(_q), j.swingInChildFrame);
  const over = (v, r) => (r ? Math.max(0, r[0] - v, v - r[1]) : 0);
  let ex = over(d.twist, L.twist);
  if (L.mode === 'box') ex = Math.max(ex, over(d.sx, L.swingX), over(d.sz, L.swingZ));
  else {
    const ax = L.swingX ? (d.sx < 0 ? -L.swingX[0] : L.swingX[1]) : Infinity;
    const az = L.swingZ ? (d.sz < 0 ? -L.swingZ[0] : L.swingZ[1]) : Infinity;
    const s = Math.hypot(d.sx, d.sz);
    if (s > 1e-6) {
      const cx = d.sx / s, cz = d.sz / s;
      const r = 1 / Math.sqrt((cx / Math.max(ax, 1e-3)) ** 2 + (cz / Math.max(az, 1e-3)) ** 2);
      ex = Math.max(ex, s - r);
    }
  }
  return ex;
}

function selfPen(person) {
  let worst = 0;
  const col = new ContactCollector((sA, sB, ax, ay, az, bx, by, bz, nx, ny, nz) => {
    const dep = (bx - ax) * nx + (by - ay) * ny + (bz - az) * nz;
    if (dep > worst) worst = dep;
  });
  col.margin = 0;
  const bodies = person.rd.allBodies();
  for (let i = 0; i < bodies.length; i++) {
    for (let k = i + 1; k < bodies.length; k++) {
      const A = bodies[i], B = bodies[k];
      if (A.ignore?.has(B) || B.ignore?.has(A)) continue;
      for (const sa of A.shapes) {
        if (!sa.collides) continue;
        for (const sb of B.shapes) if (sb.collides) collideShapes(sa, sb, col);
      }
    }
  }
  return worst;
}

function trial(kind, seed) {
  const { sb, person } = scene(seed, { shape: true, settle: 1.5 });
  const rd = person.rd;
  if (process.env.NOTWITCH) person.ctl.onDeath = () => {};
  KILLS[kind](sb, person);
  let limit = 0, limitJoint = '', ground = 0, self = 0, peak = 0;
  const speeds = [], jit = [];
  const gy = sb.world.groundY;
  run(sb, 6, () => {
    for (const j of rd.jointList) {
      const e = limitExcess(j);
      if (e > limit) { limit = e; limitJoint = j.name; }
    }
    let vmax = 0, w2 = 0, n = 0;
    for (const b of rd.allBodies()) {
      for (const s of b.shapes) if (s.collides) ground = Math.max(ground, gy - s.aabbMin.y);
      const v = b.vel.length();
      vmax = Math.max(vmax, v);
      w2 += b.angVel.lengthSq();
      n++;
    }
    peak = Math.max(peak, vmax);
    speeds.push(vmax);
    jit.push(Math.sqrt(w2 / n));
    self = Math.max(self, selfPen(person));
  });
  // settle: the earliest time after which the fastest segment stays below 8 cm/s
  let settle = speeds.length;
  while (settle > 0 && speeds[settle - 1] < 0.08) settle--;
  const tail = jit.slice(-60);
  return {
    dead: !person.ctl.alive, limitDeg: limit * DEG, limitJoint, groundCm: ground * 100, selfCm: self * 100,
    settleS: settle / 60, jitter: tail.reduce((a, b) => a + b, 0) / tail.length, peak, finite: finite(person),
  };
}

const out = {};
for (const kind of Object.keys(KILLS)) {
  const rs = [];
  for (let s = 1; s <= seeds; s++) rs.push(trial(kind, s));
  const max = (k) => Math.max(...rs.map((r) => r[k]));
  const worst = rs.reduce((a, b) => (b.limitDeg > a.limitDeg ? b : a));
  out[kind] = {
    dead: rs.filter((r) => r.dead).length, limitDeg: +max('limitDeg').toFixed(1), at: worst.limitJoint,
    groundCm: +max('groundCm').toFixed(1), selfCm: +max('selfCm').toFixed(1), settleS: +max('settleS').toFixed(2),
    jitter: +max('jitter').toFixed(3), peak: +max('peak').toFixed(1), finite: rs.every((r) => r.finite),
  };
  console.log(kind.padEnd(10), JSON.stringify(out[kind]));
}
const all = Object.values(out);
report('corpse', {
  limitDeg: Math.max(...all.map((r) => r.limitDeg)), groundCm: Math.max(...all.map((r) => r.groundCm)),
  selfCm: Math.max(...all.map((r) => r.selfCm)), settleS: Math.max(...all.map((r) => r.settleS)),
  jitter: Math.max(...all.map((r) => r.jitter)), finite: all.every((r) => r.finite),
});
