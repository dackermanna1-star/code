// Headless experiment runner for the active ragdoll controller.
// node tools/sim.mjs [scenario] — prints a compact timeline of balance metrics.
import { World } from '../src/physics/world.js';
import { Vec3 } from '../src/physics/math.js';
import { Ragdoll } from '../src/human/ragdoll.js';
import { HumanController } from '../src/human/controller.js';

export function makeScene(opts = {}) {
  const world = new World({ substeps: opts.substeps ?? 20 });
  const rd = new Ragdoll(world, { position: new Vec3(0, 0, 0), yaw: opts.yaw ?? 0 });
  rd.addToWorld();
  const ctl = new HumanController(rd);
  return { world, rd, ctl };
}

export function stepScene(sc, n = 1, dt = 1 / 60) {
  for (let i = 0; i < n; i++) {
    sc.ctl.update(dt);
    applyPending(sc);
    sc.world.step(dt);
  }
}

export function push(sc, segName, impulse) {
  const b = sc.rd.segments[segName].body;
  b.applyImpulse(impulse, b.pos);
}

// A realistic shove: the impulse delivered as a constant force over `duration` seconds.
export function shove(sc, segName, impulse, duration = 0.15) {
  const frames = Math.max(1, Math.round(duration * 60));
  sc.pending = sc.pending || [];
  sc.pending.push({ body: sc.rd.segments[segName].body, force: impulse.clone().scale(1 / (frames / 60)), frames });
}

export function applyPending(sc) {
  if (!sc.pending) return;
  for (const p of sc.pending) {
    if (p.frames-- > 0) p.body.force.add(p.force);
  }
  sc.pending = sc.pending.filter((p) => p.frames > 0);
}

function fmt(v, d = 2) {
  return (v >= 0 ? ' ' : '') + v.toFixed(d);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const scenario = process.argv[2] || 'stand';
  const sc = makeScene();
  const T = +(process.argv[3] || 6);
  const pushes = {
    stand: [],
    fwd: [[1.0, 'chest', new Vec3(0, 0, 60)]],
    back: [[1.0, 'chest', new Vec3(0, 0, -60)]],
    side: [[1.0, 'chest', new Vec3(60, 0, 0)]],
    fwd2: [[1.0, 'chest', new Vec3(0, 0, 110)]],
    big: [[1.0, 'chest', new Vec3(0, 0, 220)]],
  }[scenario] || [];
  const mag = process.argv[4] ? +process.argv[4] : null;
  let lastMode = '';
  for (let f = 0; f < T * 60; f++) {
    const t = f / 60;
    for (const p of pushes) {
      if (Math.abs(p[0] - t) < 1e-6) {
        const imp = p[2].clone();
        if (mag) imp.normalize().scale(mag);
        push(sc, p[1], imp);
        console.log(`t=${t.toFixed(2)} PUSH ${p[1]} ${imp.length().toFixed(0)} N*s`);
      }
    }
    stepScene(sc, 1);
    const S = sc.ctl.sens;
    const ev = sc.ctl.events.filter((e) => e.type !== 'mode').map((e) => e.type + (e.foot || '')).join(',');
    if (f % 10 === 0 || sc.ctl.mode !== lastMode || ev) {
      console.log(
        `t=${t.toFixed(2)} ${sc.ctl.mode.padEnd(11)} comY=${fmt(S.com.y)} com=(${fmt(S.com.x)},${fmt(S.com.z)}) v=(${fmt(S.comVel.x)},${fmt(S.comVel.z)}) cpD=${fmt(S.cpDist)} tilt=${fmt(S.upTilt)} chest=${fmt(S.chestTilt)} feet=${S.footContact.L ? 'L' : '-'}${S.footContact.R ? 'R' : '-'} load=${fmt(S.footLoad.L)}/${fmt(S.footLoad.R)} assist=${fmt(sc.ctl.assist)} ${sc.ctl.step ? 'STEP' + sc.ctl.step.foot : ''} ${ev}`,
      );
      lastMode = sc.ctl.mode;
    }
  }
}
