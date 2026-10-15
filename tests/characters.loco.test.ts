// The allocation-free locomotion blend helpers must reproduce the reference (allocating) helpers exactly.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeClipInfo } from '../src/characters/anim/Clips';
import { bracket, bracketInto, directionIndex, speedBlend, speedBlendInto, uniqueAngles } from '../src/characters/anim/Locomotion';

const mk = (name: string, speed: number, x: number, y: number) =>
  makeClipInfo(new THREE.AnimationClip(name, 1, []), { speed_mps: speed, move_dir: [x, y], mode: 'loco', loop: true }, null);

const D = Math.SQRT1_2;
const loco = [
  mk('walk_f', 1.5, 0, 1),
  mk('run_f', 5, 0, 1),
  mk('sprint_f', 6.5, 0, 1),
  mk('walk_b', 1.4, 0, -1),
  mk('run_b', 3.2, 0, -1),
  mk('walk_l', 1.4, -1, 0),
  mk('run_l', 4, -1, 0),
  mk('walk_r', 1.4, 1, 0),
  mk('run_fr', 4.8, D, D),
  mk('run_fl', 4.8, -D, D),
];

describe('locomotion blend (allocation-free)', () => {
  const idx = directionIndex(loco);
  it('indexes distinct directions with clips sorted by speed', () => {
    expect(idx.dirs).toEqual(uniqueAngles(loco));
    for (const list of idx.byDir) for (let i = 1; i < list.length; i++) expect(list[i].speed).toBeGreaterThanOrEqual(list[i - 1].speed);
    expect(idx.byDir.reduce((a, l) => a + l.length, 0)).toBe(loco.length);
  });

  it('bracketInto matches bracket for every direction', () => {
    const out: [number, number, number] = [0, 0, 0];
    for (let a = -Math.PI; a <= Math.PI; a += 0.137) {
      const [a0, a1, t] = bracket(idx.dirs, a);
      const r = bracketInto(idx.dirs, a, out);
      expect(idx.dirs[r[0]]).toBeCloseTo(a0, 9);
      expect(idx.dirs[r[1]]).toBeCloseTo(a1, 9);
      expect(r[2]).toBeCloseTo(t, 9);
    }
  });

  it('speedBlendInto matches speedBlend (weights scaled, appended)', () => {
    const out = [0, 1, 2, 3].map(() => ({ c: null as ReturnType<typeof mk> | null, w: 0 }));
    for (const list of idx.byDir)
      for (const sp of [0, 1, 1.45, 2.7, 4.9, 5.5, 9]) {
        const ref = speedBlend(list, sp);
        const n = speedBlendInto(list, sp, 0.5, out, 1);
        expect(n - 1).toBe(ref.length);
        for (let i = 0; i < ref.length; i++) {
          expect(out[1 + i].c).toBe(ref[i].c);
          expect(out[1 + i].w).toBeCloseTo(ref[i].w * 0.5, 9);
        }
      }
  });
});
