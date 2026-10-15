// Linear/scattered world props derived from the layout: power poles, street lamps, car wrecks, hay bales,
// guard rails. Prop kinds and nominal footprints are documented in PROP_FOOTPRINTS (used by isReserved and the
// buildings/props module).
import type { LayoutBuilder } from './LayoutBuilder';
import type { BridgeDef, FieldDef, RoadDef } from './types';
import { pointAtLength, polylineLength } from './geometry';

export { PROP_FOOTPRINTS } from './propFootprints';

function onBridge(bridges: BridgeDef[], x: number, z: number, pad = 10): boolean {
  for (const br of bridges) {
    const dx = br.b.x - br.a.x, dz = br.b.z - br.a.z;
    const L2 = dx * dx + dz * dz;
    let t = ((x - br.a.x) * dx + (z - br.a.z) * dz) / L2;
    t = Math.max(0, Math.min(1, t));
    const cx = br.a.x + dx * t - x, cz = br.a.z + dz * t - z;
    if (Math.hypot(cx, cz) < br.width / 2 + pad) return true;
  }
  return false;
}

/** Small clearance check against placed lots. */
function spotFree(b: LayoutBuilder, x: number, z: number, r: number): boolean {
  return !b.overlapsLots({ x, z, hw: r, hd: r, rot: 0 }, 1);
}

export function addLinearProps(b: LayoutBuilder, bridges: BridgeDef[]): void {
  // Power poles along the main highways (one side), every ~48 m.
  for (const road of b.roads) {
    if (road.kind !== 'asphalt' || road.width < 8) continue;
    const L = polylineLength(road.points);
    for (let s = 20; s < L - 20; s += 48) {
      const p = pointAtLength(road.points, s);
      const off = road.width / 2 + 4.5;
      const x = p.x - p.tz * off, z = p.z + p.tx * off;
      if (onBridge(bridges, x, z, 25)) continue;
      if (b.roadClearance(x, z) < 2.5) continue;
      if (!spotFree(b, x, z, 0.5)) continue;
      b.prop('power_pole', x, z, Math.atan2(p.tx, p.tz));
    }
  }
  // Street lamps in Volodino along A3/A4.
  for (const road of b.roads) {
    if (!road.name || !(road.name.startsWith('A3') || road.name.startsWith('A4'))) continue;
    const L = polylineLength(road.points);
    let flip = 1;
    for (let s = 0; s < L; s += 30) {
      const p = pointAtLength(road.points, s);
      if (Math.hypot(p.x - 1380, p.z - 1400) > 170) continue;
      flip = -flip;
      const off = (road.width / 2 + 1.6) * flip;
      const x = p.x - p.tz * off, z = p.z + p.tx * off;
      if (b.roadClearance(x, z) < 0.8) continue;
      b.prop('street_lamp', x, z, Math.atan2(-p.tz * flip, p.tx * flip));
    }
  }
  // Guard rails on bridge approaches (both sides, 36 m).
  for (const br of bridges) {
    const dx = br.b.x - br.a.x, dz = br.b.z - br.a.z;
    const L = Math.hypot(dx, dz);
    const tx = dx / L, tz = dz / L;
    const nx = -tz, nz = tx;
    const hw = br.width / 2 + 0.4;
    for (const [px, pz, dir] of [
      [br.a.x, br.a.z, -1],
      [br.b.x, br.b.z, 1],
    ] as [number, number, number][]) {
      for (const side of [-1, 1]) {
        // start 1 m past the deck end (the terrain right under the deck end is the valley/abutment pit)
        const ax = px + nx * hw * side + tx * dir, az = pz + nz * hw * side + tz * dir;
        const bx = ax + tx * 36 * dir, bz = az + tz * 36 * dir;
        // the rail runs 1.4 m outside its own road edge: only cut it where another road joins
        b.linearProp('guard_rail', { x: ax, z: az }, { x: bx, z: bz }, 0.6);
      }
    }
  }
}

export function addWrecks(b: LayoutBuilder, bridges: BridgeDef[], count: number): void {
  const roads = b.roads.filter((r) => polylineLength(r.points) > 120);
  const weights = roads.map((r) => [r, polylineLength(r.points)] as [RoadDef, number]);
  let placed = 0;
  for (let t = 0; t < count * 8 && placed < count; t++) {
    const road = b.rng.weighted(weights);
    const L = polylineLength(road.points);
    const p = pointAtLength(road.points, b.rng.range(10, L - 10));
    const side = b.rng.chance(0.5) ? 1 : -1;
    const off = (road.width / 2 + b.rng.range(0.5, 3.5)) * side;
    const x = p.x - p.tz * off, z = p.z + p.tx * off;
    if (onBridge(bridges, x, z, 15)) continue;
    if (!spotFree(b, x, z, 2.5)) continue;
    if (b.coastDistance(x, z) < 20 || b.riverClearance(x, z) < 10) continue;
    b.prop('car_wreck', x, z, Math.atan2(p.tx, p.tz) + b.rng.range(-0.6, 0.6) + (b.rng.chance(0.5) ? Math.PI : 0));
    placed++;
  }
}

export function addHayBales(b: LayoutBuilder, fields: FieldDef[]): void {
  for (const f of fields) {
    if (f.crop !== 'wheat' && f.crop !== 'plowed') continue;
    const n = f.crop === 'wheat' ? 12 : 4;
    const c = Math.cos(f.rotation), s = Math.sin(f.rotation);
    for (let i = 0; i < n; i++) {
      const lx = b.rng.range(-f.w / 2 + 8, f.w / 2 - 8), lz = b.rng.range(-f.d / 2 + 8, f.d / 2 - 8);
      const x = f.x + lx * c + lz * s, z = f.z - lx * s + lz * c;
      if (b.roadClearance(x, z) < 3) continue;
      b.prop('hay_bale', x, z, b.rng.range(-Math.PI, Math.PI));
    }
  }
}
