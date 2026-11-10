// Unit tests for the fracture toolkit (pure math, no browser needed):  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../src/core/fracture.js';

const volume = (polys) => polys.reduce((s, p) => s + F.polyMassProps(p).volume, 0);
const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);

test('box volume and centroid', () => {
  const mp = F.polyMassProps(F.translatePoly(F.boxPoly(0.5, 0.6, 0.004), 1, 2, 3));
  close(mp.volume, 1 * 1.2 * 0.008);
  close(mp.centroid[0], 1);
  close(mp.centroid[1], 2);
  close(mp.centroid[2], 3);
});

test('plane cut conserves volume and yields closed convex pieces', () => {
  const box = F.boxPoly(0.3, 0.2, 0.1);
  const n = [0.3, 0.8, 0.52];
  const l = Math.hypot(...n);
  const [a, b] = F.cutPoly(box, n.map((x) => x / l), 0.03);
  assert.ok(a && b);
  close(volume([a, b]), F.polyMassProps(box).volume);
  assert.ok(a.faces.some((f) => f.tag === 1) && b.faces.some((f) => f.tag === 1), 'both halves get a cap face');
});

test('cut that misses returns the original on one side', () => {
  const box = F.boxPoly(0.1, 0.1, 0.1);
  const [front, back] = F.cutPoly(box, [1, 0, 0], 5);
  assert.equal(front, null);
  assert.equal(back, box);
});

test('radial glass pattern tiles the pane exactly', () => {
  const rng = F.makeRng(42);
  const pane = F.boxPoly(0.5, 0.6, 0.003);
  for (const [cx, cy] of [[0.1, -0.2], [-0.49, 0.59], [0, 0]]) {
    const cells = F.radialCells(cx, cy, 1.6, rng, { sectors: 10 });
    const frags = F.fractureByCells(pane, 2, cells);
    assert.ok(frags.length > 40, 'enough shards: ' + frags.length);
    close(volume(frags), F.polyMassProps(pane).volume, 1e-5);
    for (const f of frags) assert.ok(F.polyMassProps(f).volume > 0);
  }
});

test('tempered (voronoi) pattern tiles the pane exactly', () => {
  const rng = F.makeRng(7);
  const pane = F.boxPoly(0.2, 0.2, 0.0025);
  const frags = F.fractureByCells(pane, 2, F.voronoiCells(-0.2, -0.2, 0.2, 0.2, 0.05, rng));
  assert.ok(frags.length >= 60);
  close(volume(frags), F.polyMassProps(pane).volume, 1e-5);
});

test('wood splits into elongated pieces along the grain', () => {
  const rng = F.makeRng(3);
  const plank = F.boxPoly(0.15, 1.0, 0.01); // grain along Y
  const pieces = F.fractureWood(plank, 1, [0.05, 0.1, 0.01], 2, rng);
  assert.ok(pieces.length >= 3);
  close(volume(pieces), F.polyMassProps(plank).volume, 1e-5);
  let elongated = 0;
  for (const p of pieces) {
    const [mn, mx] = F.polyBounds(p);
    if (mx[1] - mn[1] > 1.5 * (mx[0] - mn[0])) elongated++;
  }
  assert.ok(elongated >= pieces.length * 0.6, 'most pieces follow the grain');
});

test('chunky fracture produces the requested number of pieces', () => {
  const rng = F.makeRng(11);
  const block = F.boxPoly(0.1, 0.05, 0.2);
  const pieces = F.fractureChunky(block, [0.1, 0, 0], 12, rng);
  assert.equal(pieces.length, 12);
  close(volume(pieces), F.polyMassProps(block).volume, 1e-5);
});

test('hull contact detects touching, rejects separated and corner-only contact', () => {
  const unit = F.boxPoly(0.5, 0.5, 0.5);
  const A = F.makeHull(unit, null, [0, 0, 0]);
  assert.ok(F.hullContact(A, F.makeHull(unit, null, [1.0005, 0, 0])), 'face contact');
  assert.equal(F.hullContact(A, F.makeHull(unit, null, [1.1, 0, 0])), null, 'gap');
  assert.equal(F.hullContact(A, F.makeHull(unit, null, [1, 1, 0])), null, 'edge-only');
});

test('seeded rng is deterministic', () => {
  const a = F.makeRng(5), b = F.makeRng(5);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
});
