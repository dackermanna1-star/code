import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Ragdoll } from '../src/physics/Ragdoll';
import { COUNTER } from '../src/world/Layout';
import type { CharacterModel } from '../src/characters/CharacterModel';

/** A bare rig with the same joint layout the character builder makes. */
function standingModel(x: number, z: number, yaw = Math.PI): CharacterModel {
  const dims = { thigh: 0.33, shin: 0.31, torso: 0.47, upperArm: 0.27, forearm: 0.25, shoulderX: 0.175, headR: 0.178, hipY: 0.7, seatDrop: 0 };
  const g = () => new THREE.Group();
  const rig = {
    root: g(), pelvis: g(), spine: g(), chest: g(), neck: g(), head: g(), hatGroup: g(),
    shoulderL: g(), shoulderR: g(), elbowL: g(), elbowR: g(), handL: g(), handR: g(),
    hipL: g(), hipR: g(), kneeL: g(), kneeR: g(), footL: g(), footR: g(),
  };
  rig.root.position.set(x, 0, z);
  rig.root.rotation.y = yaw;
  rig.root.add(rig.pelvis);
  rig.pelvis.position.y = dims.hipY;
  rig.pelvis.add(rig.spine);
  rig.spine.add(rig.chest);
  rig.chest.position.y = dims.torso * 0.45;
  rig.chest.add(rig.neck);
  rig.neck.position.y = dims.torso * 0.55;
  rig.neck.add(rig.head);
  rig.head.position.y = 0.035 + dims.headR * 0.86;
  rig.head.add(rig.hatGroup);
  for (const side of [1, -1]) {
    const [sh, el, hd] = side > 0 ? [rig.shoulderL, rig.elbowL, rig.handL] : [rig.shoulderR, rig.elbowR, rig.handR];
    rig.chest.add(sh);
    sh.position.set(side * (dims.shoulderX + 0.02), dims.torso * 0.42, 0);
    sh.rotation.z = side * 0.11;
    sh.add(el);
    el.position.y = -dims.upperArm;
    el.rotation.x = -0.14;
    el.add(hd);
    hd.position.y = -dims.forearm - 0.01;
    const [hip, knee, foot] = side > 0 ? [rig.hipL, rig.kneeL, rig.footL] : [rig.hipR, rig.kneeR, rig.footR];
    rig.pelvis.add(hip);
    hip.position.set(side * 0.09, -0.02, 0);
    hip.add(knee);
    knee.position.y = -dims.thigh;
    knee.add(foot);
    foot.position.y = -dims.shin;
  }
  return { rig, dims } as unknown as CharacterModel;
}

const run = (rd: Ragdoll, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) rd.step(1 / 60);
};

const bones: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [7, 8], [8, 9], [10, 11], [11, 12], [13, 14], [14, 15],
];

test('a shot body drops, keeps its proportions and comes to rest on the floor', () => {
  const model = standingModel(-1, 0.4);
  const rd = new Ragdoll(model);
  const len0 = bones.map(([a, b]) => rd.get(a).distanceTo(rd.get(b)));
  const head = rd.get(Ragdoll.HEAD);
  rd.hit(head, new THREE.Vector3(0.1, -0.25, 1).normalize(), 7);
  run(rd, 9);
  assert.ok(rd.sleeping, 'settles and sleeps');
  for (let i = 0; i < 16; i++) {
    const p = rd.get(i);
    assert.ok(Number.isFinite(p.x + p.y + p.z), `joint ${i} finite`);
    assert.ok(p.y > 0.02, `joint ${i} above the floor (${p.y.toFixed(3)})`);
  }
  assert.ok(rd.get(Ragdoll.HEAD).y < 0.4, 'head is down on the floor');
  assert.ok(rd.get(Ragdoll.PELVIS).y < 0.4, 'hips are down');
  bones.forEach(([a, b], i) => {
    const l = rd.get(a).distanceTo(rd.get(b));
    assert.ok(Math.abs(l - len0[i]) / len0[i] < 0.08, `bone ${a}-${b} length ${l.toFixed(3)} vs ${len0[i].toFixed(3)}`);
  });
});

test('bodies never end up inside the order counter', () => {
  // standing on the customer side, shot from behind toward the counter
  const model = standingModel(-1, -0.62, Math.PI);
  const rd = new Ragdoll(model);
  rd.hit(rd.get(Ragdoll.CHEST), new THREE.Vector3(0, -0.1, -1).normalize(), 6);
  run(rd, 9);
  const z0 = COUNTER.z - COUNTER.depth / 2;
  const z1 = COUNTER.z + COUNTER.depth / 2;
  for (let i = 0; i < 16; i++) {
    const p = rd.get(i);
    const inside = p.x > COUNTER.minX && p.x < COUNTER.maxX && p.z > z0 && p.z < z1 && p.y < COUNTER.height - 0.01;
    assert.ok(!inside, `joint ${i} inside the counter at ${p.toArray().map((v) => v.toFixed(2))}`);
  }
});

test('a second shot wakes a resting body and knocks it along', () => {
  const rd = new Ragdoll(standingModel(-2, 1.5));
  rd.hit(rd.get(Ragdoll.HEAD), new THREE.Vector3(0, 0, 1), 6);
  run(rd, 9);
  assert.ok(rd.sleeping);
  const before = rd.get(Ragdoll.CHEST);
  rd.hit(before, new THREE.Vector3(1, 0, 0), 5);
  assert.ok(!rd.sleeping);
  run(rd, 2);
  assert.ok(rd.get(Ragdoll.CHEST).x > before.x + 0.02, 'moved along the shot');
});
