import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { World } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { lightChunkLocal } from '../src/world/light';
import { S } from '../src/world/blocks/registry';
import '../src/world/blocks/blocks';
import { PhysicsWorld } from '../src/physics/rapierWorld';
import { buildRagdoll, applyKillImpulse, classifyBone, type RagdollBone } from '../src/physics/ragdoll';

function flatWorld() {
  const w = new World('overworld', 1);
  for (let cx = -1; cx <= 1; cx++)
    for (let cz = -1; cz <= 1; cz++) {
      const c = new Chunk(cx, cz);
      for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < 10; y++) c.set(x, y, z, S('stone'));
      lightChunkLocal(c);
      c.status = 'ready';
      w.addChunk(c);
    }
  return w;
}

/** Minecraft-proportioned humanoid in the bones format (meshes hang from their pivots). */
function humanoid(): THREE.Group {
  const root = new THREE.Group();
  const bones: RagdollBone[] = [];
  const part = (name: string, parent: THREE.Object3D, parentName: string | null, pivot: [number, number, number], size: [number, number, number], center: [number, number, number]) => {
    const o = new THREE.Group();
    o.position.set(...pivot);
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size));
    m.position.set(...center);
    o.add(m);
    parent.add(o);
    bones.push({ name, obj: o, size, parent: parentName, pivot: o.position.clone() });
    return o;
  };
  const body = part('body', root, null, [0, 1.5, 0], [0.5, 0.75, 0.25], [0, -0.375, 0]);
  part('head', body, 'body', [0, 0, 0], [0.5, 0.5, 0.5], [0, 0.25, 0]);
  const ua = part('rightArm', body, 'body', [0.375, -0.06, 0], [0.25, 0.375, 0.25], [0, -0.1875, 0]);
  part('rightForearm', ua, 'rightArm', [0, -0.375, 0], [0.25, 0.375, 0.25], [0, -0.1875, 0]);
  const la = part('leftArm', body, 'body', [-0.375, -0.06, 0], [0.25, 0.375, 0.25], [0, -0.1875, 0]);
  part('leftForearm', la, 'leftArm', [0, -0.375, 0], [0.25, 0.375, 0.25], [0, -0.1875, 0]);
  const ul = part('rightLeg', body, 'body', [0.125, -0.75, 0], [0.25, 0.375, 0.25], [0, -0.1875, 0]);
  part('rightShin', ul, 'rightLeg', [0, -0.375, 0], [0.25, 0.375, 0.25], [0, -0.1875, 0]);
  const ll = part('leftLeg', body, 'body', [-0.125, -0.75, 0], [0.25, 0.375, 0.25], [0, -0.1875, 0]);
  part('leftShin', ll, 'leftLeg', [0, -0.375, 0], [0.25, 0.375, 0.25], [0, -0.1875, 0]);
  root.userData.bones = bones;
  return root;
}

beforeAll(async () => {
  await RAPIER.init();
});

describe('ragdoll', () => {
  it('classifies bones', () => {
    expect(classifyBone('head')).toBe('head');
    expect(classifyBone('rightForearm')).toBe('lowerArm');
    expect(classifyBone('leftArm')).toBe('upperArm');
    expect(classifyBone('rightShin')).toBe('lowerLeg');
    expect(classifyBone('leftLeg')).toBe('upperLeg');
  });

  it('creates one body per bone and joints between the right parents', () => {
    const pw = new PhysicsWorld(RAPIER as any, flatWorld());
    const model = humanoid();
    model.position.set(4.5, 10, 4.5);
    const rd = buildRagdoll(pw, model, null, { mass: 70 })!;
    expect(rd.bones.length).toBe(10);
    expect(rd.joints.length).toBe(9);
    const handleOf = new Map(rd.bones.map((b) => [b.def.name, b.body.rb.handle]));
    for (const b of rd.bones) {
      if (!b.def.parent) continue;
      const j = rd.joints.find((jj) => jj.body2().handle === b.body.rb.handle)!;
      expect(j).toBeTruthy();
      expect(j.body1().handle).toBe(handleOf.get(b.def.parent));
    }
    const total = rd.bones.reduce((a, b) => a + b.body.mass, 0);
    expect(total).toBeGreaterThan(40);
    expect(total).toBeLessThan(90);
  });

  it('leaves excluded (dismembered) subtrees out and keeps the rest jointed', () => {
    const pw = new PhysicsWorld(RAPIER as any, flatWorld());
    const model = humanoid();
    model.position.set(4.5, 10, 4.5);
    const rd = buildRagdoll(pw, model, null, { mass: 70, exclude: new Set(['rightArm', 'rightForearm']) })!;
    expect(rd.bones.length).toBe(8);
    expect(rd.joints.length).toBe(7);
    expect(rd.bones.some((b) => b.def.name === 'rightArm')).toBe(false);
    const torso = rd.bones.find((b) => b.def.name === 'body')!;
    for (const b of rd.bones) if (b !== torso) expect(torso.body.mass).toBeGreaterThan(b.body.mass);
    rd.dispose();
  });

  it('settles and the bodies fall asleep without twitching', () => {
    const pw = new PhysicsWorld(RAPIER as any, flatWorld());
    const model = humanoid();
    model.position.set(4.5, 10.2, 4.5);
    const rd = buildRagdoll(pw, model, null, { mass: 70 })!;
    applyKillImpulse(rd, { type: 'player', dir: new THREE.Vector3(0, 0.2, 1).normalize(), impulse: 3, weapon: 'iron_axe', point: new THREE.Vector3(4.5, 11.2, 4.5) });
    for (let i = 0; i < 60 * 8; i++) pw.step(1 / 60);
    for (const b of rd.bones) {
      const v = b.body.rb.linvel(), a = b.body.rb.angvel();
      expect(Math.hypot(v.x, v.y, v.z)).toBeLessThan(0.3);
      expect(Math.hypot(a.x, a.y, a.z)).toBeLessThan(0.6);
      expect(b.body.pos.y).toBeGreaterThan(9.9);
    }
    rd.dispose();
  });

  it('falls over from a hit, stays connected and settles on the ground', () => {
    const pw = new PhysicsWorld(RAPIER as any, flatWorld());
    const model = humanoid();
    model.position.set(4.5, 10, 4.5);
    const rd = buildRagdoll(pw, model, null, { mass: 70 })!;
    applyKillImpulse(rd, { type: 'player', dir: new THREE.Vector3(0, 0.2, 1).normalize(), impulse: 2, weapon: 'iron_sword', point: new THREE.Vector3(4.5, 11.2, 4.5) });
    const anchorGap = () => {
      let worst = 0;
      for (const j of rd.joints) {
        const a = j.anchor1(), b = j.anchor2();
        const b1 = j.body1(), b2 = j.body2();
        const p1 = new THREE.Vector3(a.x, a.y, a.z).applyQuaternion(b1.rotation() as any).add(b1.translation() as any);
        const p2 = new THREE.Vector3(b.x, b.y, b.z).applyQuaternion(b2.rotation() as any).add(b2.translation() as any);
        worst = Math.max(worst, p1.distanceTo(p2));
      }
      return worst;
    };
    expect(anchorGap()).toBeLessThan(1e-3);
    let maxGap = 0;
    for (let i = 0; i < 240; i++) {
      pw.step(1 / 60);
      maxGap = Math.max(maxGap, anchorGap());
    }
    for (const b of rd.bones) {
      expect(Number.isFinite(b.body.pos.y)).toBe(true);
      expect(b.body.pos.y).toBeGreaterThan(9.9);
      expect(b.body.pos.y).toBeLessThan(10.9);
    }
    // knocked over toward +z
    expect(rd.root.body.pos.z).toBeGreaterThan(4.6);
    expect(maxGap).toBeLessThan(0.12);
    // visuals follow the bodies
    rd.drive(1);
    const head = rd.bones.find((b) => b.def.name === 'head')!;
    const hp = new THREE.Vector3();
    head.def.obj.getWorldPosition(hp);
    expect(hp.y).toBeLessThan(11);
    rd.dispose();
    expect(pw.bodies.size).toBe(0);
  });
});
