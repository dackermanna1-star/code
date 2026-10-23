import test from 'node:test';
import assert from 'node:assert/strict';
import { Ragdoll, HIP_L, HIP_R, KN_L, KN_R, FT_L, FT_R, SH_L, SH_R, EL_L, EL_R, HA_L, HA_R, NECK, HEAD } from '../src/render/RagdollBody.js';
import { segSegClosest } from '../src/core/math.js';

const ground = { heightAt: (x, z) => 0.15 * Math.sin(x * 0.3) * Math.cos(z * 0.2) };
const world = { structures: { queryRadius: () => [] } };
const weapon = { center: { x: -0.05, y: 1.3, z: 0.35 }, len: 0.9 };

const at = (b, i) => [b.p[i * 3], b.p[i * 3 + 1], b.p[i * 3 + 2]];
const sub = (a, c) => [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
const dot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
const unit = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

// Shoot, blast and topple bodies from each stance and let them settle.
function settle(n) {
  const u = { id: n, faction: 0, pos: { x: n * 3, y: 0, z: 0 }, yaw: n * 1.3, stance: n % 3, vel: { x: 0, y: 0, z: 0 } };
  u.pos.y = ground.heightAt(u.pos.x, u.pos.z);
  const b = new Ragdoll(u, 0, weapon);
  b.dead = true;
  b.build(u);
  b.gatherStructs(world);
  b.rest(ground);
  if (n % 3 === 0) for (const i of [SH_L, SH_R, NECK]) b.push(i, 2.5 * Math.sin(n), 0, 2.5 * Math.cos(n));
  else if (n % 3 === 1) b.blast(u.pos.x + 1.2, u.pos.y, u.pos.z + 0.4, 4, 300 + n * 5);
  b.push(KN_L, Math.sin(u.yaw), -0.3, Math.cos(u.yaw));
  for (let s = 0; s < 900 && !b.sleeping; s++) {
    b.age += 1 / 60;
    b.step(ground);
  }
  b.frame();
  return b;
}

test('ragdolls keep their joints in range and their limbs apart', () => {
  for (let n = 0; n < 45; n++) {
    const b = settle(n);
    assert.ok(b.sleeping, `body ${n} comes to rest`);
    const X = [b.F[0], b.F[1], b.F[2]];
    // Knees never bend backwards.
    for (const [h, k, f] of [[HIP_L, KN_L, FT_L], [HIP_R, KN_R, FT_R]]) {
      const t = unit(sub(at(b, k), at(b, h)));
      const a = unit(sub(X, t.map((c) => c * dot(X, t))));
      const fwd = [t[1] * a[2] - t[2] * a[1], t[2] * a[0] - t[0] * a[2], t[0] * a[1] - t[1] * a[0]];
      const s = sub(at(b, f), at(b, k));
      assert.ok(Math.atan2(-dot(s, fwd), dot(s, t)) > -0.15, `body ${n}: knee bent backwards`);
    }
    // The head stays on top of the neck.
    const head = unit(sub(at(b, HEAD), at(b, NECK)));
    assert.ok(dot(head, [b.F[3], b.F[4], b.F[5]]) > 0.35, `body ${n}: neck folded`);
    // Limbs do not pass through one another.
    const caps = [[SH_L, EL_L, 0.055], [EL_L, HA_L, 0.05], [SH_R, EL_R, 0.055], [EL_R, HA_R, 0.05], [HIP_L, KN_L, 0.08], [KN_L, FT_L, 0.06], [HIP_R, KN_R, 0.08], [KN_R, FT_R, 0.06]];
    for (let i = 0; i < caps.length; i++) {
      for (let j = i + 1; j < caps.length; j++) {
        if ((i ^ 1) === j && i % 2 === 0) continue; // two bones of one limb
        const A = caps[i];
        const C = caps[j];
        const q = segSegClosest(...at(b, A[0]), ...at(b, A[1]), ...at(b, C[0]), ...at(b, C[1]));
        assert.ok(Math.sqrt(q.d2) > A[2] + C[2] - 0.04, `body ${n}: limbs ${i} and ${j} overlap`);
      }
    }
    // Nothing sinks into the ground.
    for (let i = 0; i < 20; i++) assert.ok(b.p[i * 3 + 1] > ground.heightAt(b.p[i * 3], b.p[i * 3 + 2]) + b.r[i] - 0.03, `body ${n}: particle ${i} under ground`);
  }
});
