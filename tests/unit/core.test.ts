import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Rng, seedOf, hash3i } from '../../src/core/rng';
import { UPos, CELL } from '../../src/core/upos';
import { noised, D, fbm, ridged } from '../../src/core/noise';
import { formatDistance } from '../../src/core/mathutil';
import { LY, MPC, AU } from '../../src/core/constants';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(seedOf('galaxy', 42, 'star', 7));
    const b = new Rng(seedOf('galaxy', 42, 'star', 7));
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it('separates nearby seeds and stays in [0, 1)', () => {
    const a = new Rng(1), b = new Rng(2);
    let same = 0;
    for (let i = 0; i < 1000; i++) {
      const x = a.next(), y = b.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      if (x === y) same++;
    }
    expect(same).toBe(0);
  });

  it('has a roughly uniform distribution', () => {
    const r = new Rng(123);
    const bins = new Array(10).fill(0);
    for (let i = 0; i < 100000; i++) bins[Math.floor(r.next() * 10)]++;
    for (const b of bins) expect(Math.abs(b - 10000)).toBeLessThan(500);
  });

  it('hashes integer lattice points independently of call order', () => {
    expect(hash3i(5, -3, 9, 77)).toBe(hash3i(5, -3, 9, 77));
    expect(hash3i(5, -3, 9, 77)).not.toBe(hash3i(5, -3, 10, 77));
  });

  it('fork() produces independent but reproducible streams', () => {
    const a = new Rng(9).fork('x'), b = new Rng(9).fork('x'), c = new Rng(9).fork('y');
    expect(a.next()).toBe(b.next());
    expect(new Rng(9).fork('x').next()).not.toBe(c.next());
  });
});

describe('UPos (hierarchical universe coordinates)', () => {
  it('keeps sub-millimetre precision across a gigaparsec', () => {
    const far = 1000 * MPC; // 3e25 m
    const a = new UPos().addXYZ(far, -far * 0.3, far * 0.7);
    const b = a.clone().addXYZ(0.001, 0.002, -0.003);
    const d = b.sub(a, new Vector3());
    // float64 spacing within a 2^40 m cell is ~0.12 mm at worst
    expect(Math.abs(d.x - 0.001)).toBeLessThan(1e-4);
    expect(Math.abs(d.y - 0.002)).toBeLessThan(1e-4);
    expect(Math.abs(d.z + 0.003)).toBeLessThan(1e-4);
  });

  it('round-trips through JSON', () => {
    const a = new UPos().addXYZ(1.234e22, -5.6e19, 7.8e10);
    const b = UPos.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));
    expect(b.sub(a, new Vector3()).length()).toBe(0);
  });

  it('normalises local offsets into cells', () => {
    const a = new UPos().addXYZ(CELL * 3.5, 0, 0);
    expect(Math.abs(a.x)).toBeLessThanOrEqual(CELL);
    expect(a.toApproxMeters(new Vector3()).x).toBeCloseTo(CELL * 3.5, -3);
  });

  it('measures distances between galaxies', () => {
    const a = new UPos().addXYZ(2.5 * MPC, 0, 0);
    const b = new UPos();
    expect(a.distanceTo(b) / MPC).toBeCloseTo(2.5, 9);
  });
});

describe('noise', () => {
  it('returns analytic derivatives matching finite differences', () => {
    const h = 1e-5;
    for (let i = 0; i < 50; i++) {
      const x = Math.sin(i) * 13.1, y = Math.cos(i * 1.7) * 7.3, z = i * 0.37;
      noised(x, y, z, 11);
      const [dx, dy, dz] = [D[0], D[1], D[2]];
      const fx = (noised(x + h, y, z, 11) - noised(x - h, y, z, 11)) / (2 * h);
      const fy = (noised(x, y + h, z, 11) - noised(x, y - h, z, 11)) / (2 * h);
      const fz = (noised(x, y, z + h, 11) - noised(x, y, z - h, 11)) / (2 * h);
      expect(dx).toBeCloseTo(fx, 4);
      expect(dy).toBeCloseTo(fy, 4);
      expect(dz).toBeCloseTo(fz, 4);
    }
  });

  it('fractional octaves blend continuously (no LOD popping)', () => {
    const p = [3.1, -2.2, 0.7];
    const a = fbm(p[0], p[1], p[2], 5, 4.999);
    const b = fbm(p[0], p[1], p[2], 5, 5.0);
    expect(Math.abs(a - b)).toBeLessThan(1e-3);
    const c = ridged(p[0], p[1], p[2], 5, 3.999);
    const d = ridged(p[0], p[1], p[2], 5, 4.0);
    expect(Math.abs(c - d)).toBeLessThan(1e-3);
  });
});

describe('formatting', () => {
  it('chooses astronomical units by scale', () => {
    expect(formatDistance(12)).toBe('12.0 m');
    expect(formatDistance(AU)).toMatch(/AU$/);
    expect(formatDistance(4.2 * LY)).toMatch(/ly$/);
    expect(formatDistance(2.5 * MPC)).toMatch(/Mpc$/);
  });
});
