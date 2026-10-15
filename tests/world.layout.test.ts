// Layout invariants for the authored island.
import { describe, expect, it } from 'vitest';
import { buildLayout } from '../src/world/layout/MapData';
import { obbOverlap, pointInPolygon } from '../src/world/layout/geometry';
import { BUILDING_FOOTPRINTS } from '../src/core/contracts';

const layout = buildLayout();

describe('world layout', () => {
  it('is deterministic', () => {
    const b = buildLayout();
    expect(b.lots.length).toBe(layout.lots.length);
    expect(b.lots[10]).toEqual(layout.lots[10]);
    expect(b.props.length).toBe(layout.props.length);
  });

  it('has 9-12 named locations with distinct identities', () => {
    expect(layout.locations.length).toBeGreaterThanOrEqual(9);
    expect(layout.locations.length).toBeLessThanOrEqual(12);
    const kinds = new Set(layout.locations.map((l) => l.kind));
    for (const k of ['town', 'school', 'port', 'military', 'industrial', 'village', 'quarry', 'ruins']) expect(kinds.has(k as never)).toBe(true);
  });

  it('places 220-320 building lots without overlaps', () => {
    expect(layout.lots.length).toBeGreaterThanOrEqual(220);
    expect(layout.lots.length).toBeLessThanOrEqual(320);
    const obbs = layout.lots.map((l) => {
      const f = BUILDING_FOOTPRINTS[l.type];
      return { x: l.x, z: l.z, hw: f.w / 2, hd: f.d / 2, rot: l.rotationY };
    });
    let overlaps = 0;
    for (let i = 0; i < obbs.length; i++) for (let j = i + 1; j < obbs.length; j++) if (obbOverlap(obbs[i], obbs[j], 0.2)) overlaps++;
    expect(overlaps).toBe(0);
  });

  it('every lot lies on an island', () => {
    for (const l of layout.lots) expect(layout.islands.some((p) => pointInPolygon(l, p))).toBe(true);
  });

  it('central town, school, port and military base have the required buildings', () => {
    const count = (loc: string, type?: string) => layout.lots.filter((l) => l.location === loc && (!type || l.type === type)).length;
    expect(count('Volodino')).toBeGreaterThanOrEqual(35);
    expect(count('Volodino', 'church')).toBe(1);
    expect(count('Volodino', 'police')).toBe(1);
    expect(count('Ryabinovka School', 'school')).toBe(1);
    expect(count('Ryabinovka School', 'apartment')).toBe(4);
    expect(count('Zalivsk', 'warehouse')).toBeGreaterThanOrEqual(6);
    expect(count('Ostrov Military Base', 'military_barracks')).toBeGreaterThanOrEqual(6);
    expect(count('Ostrov Military Base', 'military_hangar')).toBe(2);
    expect(count('Ostrov Military Base', 'watchtower')).toBe(4);
  });

  it('has two channel bridges and 2-3 river bridges', () => {
    expect(layout.bridges.filter((b) => b.kind === 'channel').length).toBe(2);
    const river = layout.bridges.filter((b) => b.kind === 'river').length;
    expect(river).toBeGreaterThanOrEqual(2);
    expect(river).toBeLessThanOrEqual(3);
  });

  it('has ~40 land and ~8 water vehicle spawns', () => {
    const land = layout.vehicleSpawns.filter((v) => v.kind === 'land').length;
    const water = layout.vehicleSpawns.filter((v) => v.kind === 'water').length;
    expect(land).toBeGreaterThanOrEqual(36);
    expect(water).toBeGreaterThanOrEqual(8);
  });

  it('has props of the expected kinds', () => {
    const kinds = new Set(layout.props.map((p) => p.kind));
    for (const k of ['fence_wood', 'power_pole', 'container', 'car_wreck', 'hay_bale', 'barrier_concrete', 'sandbags', 'guard_rail'])
      expect(kinds.has(k)).toBe(true);
    expect(layout.props.filter((p) => p.kind.startsWith('container')).length).toBeGreaterThan(40);
  });
});
