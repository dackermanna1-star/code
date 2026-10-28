import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/physics/world.js';
import { Vec3, Quat } from '../src/physics/math.js';
import { Ragdoll } from '../src/human/ragdoll.js';
import { decomposeSwingTwist } from '../src/physics/joints.js';
import { TOTAL_MASS } from '../src/human/anatomy.js';

function maxJointSeparation(rd) {
  let m = 0;
  for (const j of rd.jointList) {
    const pa = j.parent.localToWorld(j.anchorP, new Vec3());
    const pc = j.child.localToWorld(j.anchorC, new Vec3());
    m = Math.max(m, pa.distanceTo(pc));
  }
  return m;
}

function maxLimitViolation(rd) {
  let worst = 0, worstName = '';
  const q = new Quat();
  const dec = { twist: 0, sx: 0, sz: 0 };
  for (const j of rd.jointList) {
    j.jointRotation(q);
    decomposeSwingTwist(q, j.swingInChildFrame, dec);
    const L = j.limits;
    const over = (v, r) => Math.max(0, r[0] - v, v - r[1]);
    const v = Math.max(over(dec.twist, L.twist), L.mode === 'box' ? Math.max(over(dec.sx, L.swingX), over(dec.sz, L.swingZ)) : 0);
    if (v > worst) {
      worst = v;
      worstName = j.name;
    }
  }
  return { worst, worstName };
}

test('ragdoll mass and bind pose are anatomically sane', () => {
  const w = new World();
  const rd = new Ragdoll(w, { position: new Vec3(0, 0, 0) });
  assert.ok(Math.abs(rd.totalMass - TOTAL_MASS) < 1e-9);
  assert.ok(rd.totalMass > 70 && rd.totalMass < 80);
  const com = rd.computeCOM();
  // standing COM ~ 55-57% of height
  assert.ok(com.y > 0.93 && com.y < 1.05, `com y ${com.y}`);
  assert.equal(rd.segList.length, 17);
  assert.equal(rd.jointList.length, 16);
  // bind pose must satisfy all joint limits
  const lv = maxLimitViolation(rd);
  assert.ok(lv.worst < 1e-6, `bind pose violates ${lv.worstName} by ${lv.worst}`);
  assert.ok(maxJointSeparation(rd) < 1e-9);
});

test('limp ragdoll collapses, settles and stays attached', () => {
  const w = new World();
  const rd = new Ragdoll(w, { position: new Vec3(0, 0.02, 0) });
  rd.addToWorld();
  // small passive tissue stiffness/damping only
  for (const j of rd.jointList) {
    j.damping = 0.8;
  }
  // tip it slightly forward
  for (const b of rd.bodies) b.vel.set(0, 0, 0.3 * (b.pos.y / 1.7));
  let maxSep = 0, maxViol = 0, minY = Infinity;
  const steps = 60 * 6;
  for (let i = 0; i < steps; i++) {
    w.step(1 / 60);
    maxSep = Math.max(maxSep, maxJointSeparation(rd));
    maxViol = Math.max(maxViol, maxLimitViolation(rd).worst);
    for (const b of rd.bodies) {
      assert.ok(b.pos.isFinite(), 'NaN position');
      for (const s of b.shapes) minY = Math.min(minY, s.aabbMin.y);
    }
  }
  const ke = rd.kineticEnergy();
  const com = rd.computeCOM();
  console.log(`  limp: maxSep=${maxSep.toFixed(4)} maxLimitViol=${maxViol.toFixed(3)} minY=${minY.toFixed(4)} KE=${ke.toFixed(4)} comY=${com.y.toFixed(3)}`);
  assert.ok(maxSep < 0.02, `joint separation ${maxSep}`);
  assert.ok(com.y < 0.35, `ragdoll did not collapse: com y ${com.y}`);
  assert.ok(ke < 0.5, `ragdoll still moving KE=${ke}`);
  assert.ok(minY > -0.03, `penetrated floor ${minY}`);
});

test('ragdoll dropped from 3m onto its back is stable', () => {
  const w = new World();
  const rd = new Ragdoll(w, { position: new Vec3(0, 0, 0) });
  // rotate to horizontal (lying face up) and lift
  const q = new Quat().setFromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2);
  for (const seg of rd.segList) {
    const p = seg.body.pos.clone().applyQuat(q).add(new Vec3(0, 3, 0));
    seg.body.setPose(p, q);
  }
  rd.addToWorld();
  for (const j of rd.jointList) j.damping = 0.8;
  let maxSep = 0;
  for (let i = 0; i < 60 * 5; i++) {
    w.step(1 / 60);
    maxSep = Math.max(maxSep, maxJointSeparation(rd));
  }
  const ke = rd.kineticEnergy();
  console.log(`  drop: maxSep=${maxSep.toFixed(4)} KE=${ke.toFixed(4)} stepMs=${w.stats.stepMs.toFixed(2)}`);
  assert.ok(maxSep < 0.03, `joint separation ${maxSep}`);
  assert.ok(ke < 0.5, `KE ${ke}`);
});

test('physics step performance for one ragdoll', () => {
  const w = new World();
  const rd = new Ragdoll(w, { position: new Vec3(0, 0.02, 0) });
  rd.addToWorld();
  for (const j of rd.jointList) j.damping = 0.8;
  const t0 = performance.now();
  const N = 240;
  for (let i = 0; i < N; i++) w.step(1 / 60);
  const ms = (performance.now() - t0) / N;
  console.log(`  avg step ${ms.toFixed(3)} ms (substeps=${w.substeps})`);
  assert.ok(ms < 8, `too slow ${ms} ms/step`);
});
