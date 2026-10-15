// Assembles the authored Erangel-inspired island layout into a single deterministic WorldLayout.
// Pure data: safe to run in node (tests/tools) and in the terrain worker.
import type { RoadSegment } from '../../core/contracts';
import { CLIFFS, ISLETS, MAIN_ISLAND, MILITARY_ISLAND } from './coast';
import { FIELDS, FLAT_AREAS, FORESTS, GROUND_PATCHES, HILLS, PONDS, QUARRY, RIDGES, RIVER } from './features';
import { dist, interpolateAlong, pointAtLength, polylineLength, resamplePolyline, smoothPolyline } from './geometry';
import { LayoutBuilder } from './LayoutBuilder';
import { addTownStreets, LOCATIONS, placeLocations } from './locations';
import { addHayBales, addLinearProps, addWrecks } from './props';
import { HIGHWAYS, TRACKS } from './roads';
import type { BridgeDef, RoadDef, WorldLayout, XZ } from './types';
import { addVehicleSpawns } from './vehicles';

export const WORLD_SIZE = 3072;
export const SEA_LEVEL = 0;

/** Find where roads cross water (sea channel or river) and turn those spans into straight bridges. */
function computeBridges(b: LayoutBuilder): BridgeDef[] {
  const bridges: BridgeDef[] = [];
  let id = 1;
  for (const road of b.roads) {
    if (road.kind !== 'asphalt') continue;
    const L = polylineLength(road.points);
    const step = 2;
    const spans: { s0: number; s1: number; river: boolean }[] = [];
    let cur: { s0: number; s1: number; river: boolean } | null = null;
    for (let s = 0; s <= L; s += step) {
      const p = pointAtLength(road.points, s);
      const inRiver = b.riverClearance(p.x, p.z) < 0;
      const wet = inRiver || !b.isOnIsland(p.x, p.z);
      if (wet) {
        if (!cur) cur = { s0: s, s1: s, river: inRiver };
        cur.s1 = s;
      } else if (cur) {
        spans.push(cur);
        cur = null;
      }
    }
    if (cur) spans.push(cur);
    // merge spans separated by tiny gaps
    const merged: typeof spans = [];
    for (const sp of spans) {
      const last = merged[merged.length - 1];
      if (last && sp.s0 - last.s1 < 30) last.s1 = sp.s1;
      else merged.push({ ...sp });
    }
    const toStraighten: [number, number, XZ, XZ][] = [];
    for (const sp of merged) {
      if (sp.s1 - sp.s0 < 4) continue;
      const ext = sp.river ? 16 : 26;
      const s0 = Math.max(0, sp.s0 - ext), s1 = Math.min(L, sp.s1 + ext);
      const a = pointAtLength(road.points, s0), e = pointAtLength(road.points, s1);
      bridges.push({
        id: id++,
        roadId: road.id,
        a: { x: a.x, z: a.z },
        b: { x: e.x, z: e.z },
        width: road.width + 2,
        deckY: 0,
        kind: sp.river ? 'river' : 'channel',
      });
      toStraighten.push([s0, s1, { x: a.x, z: a.z }, { x: e.x, z: e.z }]);
    }
    // straighten from the end so earlier arc lengths stay valid
    for (let i = toStraighten.length - 1; i >= 0; i--) straightenRoad(road, ...toStraighten[i]);
  }
  return bridges;
}

/** Replace the road polyline between arc lengths s0..s1 with a straight line a→b (bridge decks are straight). */
function straightenRoad(road: RoadDef, s0: number, s1: number, a: XZ, e: XZ): void {
  const out: XZ[] = [];
  let acc = 0;
  let inserted = false;
  const p = road.points;
  for (let i = 0; i < p.length; i++) {
    if (i > 0) acc += dist(p[i - 1], p[i]);
    if (acc < s0 - 0.01 || acc > s1 + 0.01) {
      if (acc > s1 && !inserted) {
        out.push(...resamplePolyline([a, e], 6));
        inserted = true;
      }
      out.push(p[i]);
    }
  }
  if (!inserted) out.push(...resamplePolyline([a, e], 6));
  road.points = out;
}

export function buildLayout(seed = 1337): WorldLayout {
  const islands = [MAIN_ISLAND, MILITARY_ISLAND, ...ISLETS].map((poly) => smoothPolyline(poly, 10, true));
  const riverPts = smoothPolyline(RIVER.points, 8);
  const riverWidths = interpolateAlong(RIVER.points, RIVER.widths, riverPts);
  const b = new LayoutBuilder(seed, islands, RIVER, riverPts, riverWidths);

  for (const h of HIGHWAYS) b.addRoad(h.points, h.width, h.kind, h.name);
  for (const t of TRACKS) b.addRoad(t.points, t.width, t.kind, t.name);
  const streets = addTownStreets(b);
  const bridges = computeBridges(b);

  placeLocations(b, streets);
  addLinearProps(b, bridges);
  addWrecks(b, bridges, 26);
  addHayBales(b, FIELDS);
  addVehicleSpawns(b, bridges);

  const roads: RoadSegment[] = b.roads.map((r) => ({ points: r.points, width: r.width, kind: r.kind }));
  return {
    size: WORLD_SIZE,
    seaLevel: SEA_LEVEL,
    seed,
    islands,
    cliffs: CLIFFS.map((c) => ({ ...c, points: smoothPolyline(c.points, 10) })),
    ridges: RIDGES.map((r) => {
      const pts = smoothPolyline(r.points, 10);
      return { points: pts, heights: interpolateAlong(r.points, r.heights, pts), width: r.width };
    }),
    hills: HILLS,
    quarry: QUARRY,
    river: { points: riverPts, widths: riverWidths, depth: RIVER.depth },
    ponds: PONDS.map((p) => ({ ...p })),
    forests: FORESTS,
    fields: FIELDS,
    flatAreas: FLAT_AREAS,
    groundPatches: GROUND_PATCHES,
    roadDefs: b.roads,
    bridges,
    locations: LOCATIONS,
    lots: b.lots,
    props: b.props,
    vehicleSpawns: b.spawns,
    roads,
  };
}
