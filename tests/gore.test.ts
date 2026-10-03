import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { classifyDamage, WoundSet, MAX_WOUNDS, WOUND_CODE, decideDismember, dismemberChance, severityOf, type BoneInfo } from '../src/game/gore/wounds';
import { boneMasses, subtreeNames, type RagdollBone } from '../src/physics/ragdoll';

describe('wound classification', () => {
  it('maps damage sources to wound types', () => {
    expect(classifyDamage({ type: 'player', weapon: 'iron_sword' })).toBe('cut');
    expect(classifyDamage({ type: 'player', weapon: 'diamond_axe' })).toBe('cut');
    expect(classifyDamage({ type: 'player', weapon: 'hand' })).toBe('blunt');
    expect(classifyDamage({ type: 'player', weapon: 'iron_pickaxe' })).toBe('blunt');
    expect(classifyDamage({ type: 'player', weapon: 'iron_shovel' })).toBe('blunt');
    expect(classifyDamage({ type: 'arrow', weapon: 'arrow', projectile: true })).toBe('pierce');
    expect(classifyDamage({ type: 'projectile', weapon: 'trident', projectile: true })).toBe('pierce');
    expect(classifyDamage({ type: 'fire', fire: true })).toBe('burn');
    expect(classifyDamage({ type: 'lava', fire: true })).toBe('burn');
    expect(classifyDamage({ type: 'fall' })).toBe('blunt');
    expect(classifyDamage({ type: 'explosion', explosion: true })).toBe('blunt');
    expect(classifyDamage({ type: 'drown' })).toBeNull();
    expect(classifyDamage({ type: 'poison' })).toBeNull();
  });
});

describe('wound set', () => {
  const at = (x: number) => ({ x, y: 1, z: 0 });
  it('never holds more than the shader limit and evicts the least significant wound', () => {
    const set = new WoundSet();
    for (let i = 0; i < MAX_WOUNDS; i++) set.add({ type: 'cut', pos: at(i), severity: 0.5 + i * 0.05 });
    expect(set.list.length).toBe(MAX_WOUNDS);
    set.add({ type: 'cut', pos: at(100), severity: 0.9 });
    expect(set.list.length).toBe(MAX_WOUNDS);
    // the weakest (x = 0) went, the new one is in
    expect(set.list.some((w) => w.x === 0)).toBe(false);
    expect(set.list.some((w) => w.x === 100)).toBe(true);
  });
  it('keeps bleeding wounds over equally severe dry ones and evicts older ties first', () => {
    const set = new WoundSet(2);
    const a = set.add({ type: 'blunt', pos: at(0), severity: 0.3 });
    set.tick(5);
    const b = set.add({ type: 'blunt', pos: at(5), severity: 0.3 });
    set.add({ type: 'blunt', pos: at(9), severity: 0.3 });
    expect(set.list).not.toContain(a);
    expect(set.list).toContain(b);
    const bleed = new WoundSet(2);
    bleed.add({ type: 'cut', pos: at(0), severity: 0.2 });
    bleed.add({ type: 'blunt', pos: at(1), severity: 0.2 });
    bleed.add({ type: 'burn', pos: at(2), severity: 0.2 });
    expect(bleed.list.some((w) => w.type === 'cut')).toBe(true);
  });
  it('merges bruises on the same spot and grows them', () => {
    const set = new WoundSet();
    const a = set.add({ type: 'blunt', pos: at(0), severity: 0.3 });
    const b = set.add({ type: 'blunt', pos: { x: 0.03, y: 1, z: 0 }, severity: 0.3 });
    expect(b).toBe(a);
    expect(set.list.length).toBe(1);
    expect(a.severity).toBeGreaterThan(0.3);
  });
  it('only heavy bruises bleed, cuts bleed for seconds, burns never', () => {
    const set = new WoundSet();
    expect(set.add({ type: 'blunt', pos: at(0), severity: 0.3 }).bleed).toBe(0);
    expect(set.add({ type: 'blunt', pos: at(1), severity: 0.95 }).bleed).toBeGreaterThan(0);
    const cut = set.add({ type: 'cut', pos: at(2), severity: 0.6 });
    expect(cut.bleed).toBeGreaterThan(3);
    expect(set.add({ type: 'burn', pos: at(3), severity: 0.6 }).bleed).toBe(0);
    set.tick(100);
    expect(set.bleeding).toBe(false);
  });
  it('encodes type, severity and size for the shader', () => {
    const set = new WoundSet();
    set.add({ type: 'pierce', pos: { x: 0.1, y: 0.2, z: 0.3 }, severity: 0.57, size: 0.5 });
    const p = new THREE.Vector4(), d = new THREE.Vector4();
    set.encode(0, p, d);
    expect(Math.floor(p.w / 100)).toBe(WOUND_CODE.pierce);
    expect(Math.floor(p.w % 100)).toBe(5);
    expect(p.w % 1).toBeCloseTo(0.5, 3);
    expect(p.x).toBeCloseTo(0.1);
    expect(severityOf('cut', 20)).toBe(1);
  });
});

describe('dismemberment decision', () => {
  const bones: BoneInfo[] = [
    { name: 'body', parent: null, part: 'torso' },
    { name: 'head', parent: 'body', part: 'head' },
    { name: 'armR', parent: 'body', part: 'upperArm' },
    { name: 'foreR', parent: 'armR', part: 'lowerArm' },
    { name: 'legR', parent: 'body', part: 'upperLeg' },
    { name: 'shinR', parent: 'legR', part: 'lowerLeg' },
  ];
  const base = { bones, maxHealth: 20 };
  it('is impossible for blunt or weak blows', () => {
    expect(dismemberChance({ type: 'blunt', amount: 20, maxHealth: 20 })).toBe(0);
    expect(dismemberChance({ type: 'cut', amount: 2, maxHealth: 20 })).toBe(0);
    expect(dismemberChance({ type: 'pierce', amount: 9, maxHealth: 20 })).toBe(0);
    expect(decideDismember({ ...base, type: 'blunt', amount: 20, rand: () => 0 })).toEqual([]);
    expect(decideDismember({ ...base, type: 'cut', amount: 3, rand: () => 0 })).toEqual([]);
  });
  it('heavier sharp hits are likelier, axes and crits more so', () => {
    const sword = dismemberChance({ type: 'cut', amount: 6, maxHealth: 20, weapon: 'iron_sword' });
    expect(dismemberChance({ type: 'cut', amount: 10, maxHealth: 20, weapon: 'iron_sword' })).toBeGreaterThan(sword);
    expect(dismemberChance({ type: 'cut', amount: 6, maxHealth: 20, weapon: 'iron_axe' })).toBeGreaterThan(sword);
    expect(dismemberChance({ type: 'cut', amount: 6, maxHealth: 20, weapon: 'iron_sword', crit: true })).toBeGreaterThan(sword);
    expect(sword).toBeLessThan(1);
  });
  it('takes one limb or the head on a sword kill, favouring the bone that was hit', () => {
    const r = decideDismember({ ...base, type: 'cut', amount: 8, hitBone: 'head', rand: () => 0 });
    expect(r.length).toBe(1);
    expect(['head', 'armR', 'foreR', 'legR', 'shinR']).toContain(r[0]);
    // roll above the chance: nothing
    expect(decideDismember({ ...base, type: 'cut', amount: 8, rand: () => 0.99 })).toEqual([]);
    let heads = 0;
    for (let i = 0; i < 400; i++) {
      let calls = 0;
      const rand = () => (calls++ === 0 ? 0 : Math.random());
      if (decideDismember({ ...base, type: 'cut', amount: 8, hitBone: 'head', rand })[0] === 'head') heads++;
    }
    expect(heads).toBeGreaterThan(150);
  });
  it('gibs several unrelated parts on explosions, never a part and its own child', () => {
    for (let i = 0; i < 50; i++) {
      let calls = 0;
      const rand = () => (calls++ === 0 ? 0 : Math.random());
      const r = decideDismember({ ...base, type: 'blunt', explosion: true, amount: 16, rand });
      expect(r.length).toBeGreaterThanOrEqual(2);
      expect(new Set(r).size).toBe(r.length);
      expect(r.includes('armR') && r.includes('foreR')).toBe(false);
      expect(r.includes('legR') && r.includes('shinR')).toBe(false);
      expect(r).not.toContain('body');
    }
  });
});

describe('ragdoll masses', () => {
  const mk = (name: string, parent: string | null, size: [number, number, number]): RagdollBone => ({ name, parent, size, obj: new THREE.Object3D() });
  const defs = [mk('body', null, [0.5, 0.75, 0.25]), mk('head', 'body', [0.5, 0.5, 0.5]), mk('armR', 'body', [0.25, 0.375, 0.25]), mk('foreR', 'armR', [0.25, 0.375, 0.25]), mk('legR', 'body', [0.25, 0.375, 0.25])];
  it('distributes the total by volume with the torso heaviest', () => {
    const m = boneMasses(defs, 70);
    let sum = 0;
    for (const v of m.values()) sum += v;
    expect(sum).toBeCloseTo(70, 3);
    for (const n of ['head', 'armR', 'foreR', 'legR']) expect(m.get('body')!).toBeGreaterThan(m.get(n)!);
    expect(m.get('legR')!).toBeGreaterThan(m.get('foreR')!);
  });
  it('collects subtrees', () => {
    expect([...subtreeNames(defs, 'armR')].sort()).toEqual(['armR', 'foreR']);
  });
});
