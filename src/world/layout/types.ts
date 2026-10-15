// Authored world layout data types. Pure data (no three.js) so it can be structured-cloned into the
// terrain Web Worker and unit-tested in node.
import type { BuildingLot, MapLocation, PropPlacement, RoadSegment, VehicleSpawn } from '../../core/contracts';

export interface XZ {
  x: number;
  z: number;
}

/** A closed outline (implicitly closed, no repeated last point). */
export type Polygon = XZ[];

/** Coastal cliff: along this polyline the land rises steeply right at the shoreline. */
export interface CliffDef {
  points: XZ[];
  /** Cliff top height above sea level (m). */
  height: number;
  /** Horizontal distance over which the cliff rises (m). */
  width: number;
}

export interface RidgeDef {
  /** Crest polyline. */
  points: XZ[];
  /** Crest height added to the base terrain (m), per point (interpolated) or single value. */
  heights: number[];
  /** Half-width of the ridge base (m). */
  width: number;
}

export interface HillDef {
  x: number;
  z: number;
  radius: number;
  height: number;
  /** 0 = round dome, 1 = flat plateau top. */
  plateau?: number;
}

export interface QuarryDef {
  x: number;
  z: number;
  /** Half extents of the pit floor (m). */
  rx: number;
  rz: number;
  rotation: number;
  /** Depth of the pit floor below the surrounding rim (m). */
  depth: number;
  /** Number of terraces on the walls. */
  terraces: number;
}

export interface RiverDef {
  points: XZ[];
  /** Water-surface width per point (m). */
  widths: number[];
  /** Bed depth below sea level at the center (m). */
  depth: number;
}

export interface PondDef {
  x: number;
  z: number;
  radius: number;
  /** Water surface height (m). The terrain is carved below it. */
  level: number;
}

export interface ForestDef {
  x: number;
  z: number;
  radius: number;
  /** Peak tree density 0..1. */
  density: number;
  /** Elongation/rotation for less circular forests. */
  stretch?: number;
  rotation?: number;
}

export type FieldCrop = 'wheat' | 'plowed' | 'green';

/** Farm field: rotated rectangle. */
export interface FieldDef {
  x: number;
  z: number;
  w: number;
  d: number;
  rotation: number;
  crop: FieldCrop;
}

/** Area where natural relief is suppressed (towns, bases) and terrain is lifted/lowered toward `height` if given. */
export interface FlatAreaDef {
  x: number;
  z: number;
  radius: number;
  /** 0..1 how strongly relief is flattened in the core. */
  strength: number;
  /** Optional absolute target height (e.g. a quay at +2.5 m). */
  height?: number;
}

export type GroundPatchSurface = 'gravel' | 'dirt' | 'concrete' | 'sand' | 'mud';

/** Authored ground-surface patch (yards, quarry floor, military pads), rotated rectangle. */
export interface GroundPatchDef {
  x: number;
  z: number;
  w: number;
  d: number;
  rotation: number;
  surface: GroundPatchSurface;
}

export interface RoadDef {
  id: number;
  points: XZ[];
  width: number;
  kind: 'asphalt' | 'dirt';
  /** Optional name for debugging. */
  name?: string;
}

export interface BridgeDef {
  id: number;
  /** Road this bridge belongs to. */
  roadId: number;
  a: XZ;
  b: XZ;
  /** Deck width (m). */
  width: number;
  /** Deck height above sea level (m) — filled in by terrain generation if 0. */
  deckY: number;
  kind: 'channel' | 'river';
}

export interface WorldLayout {
  size: number;
  seaLevel: number;
  seed: number;
  islands: Polygon[];
  cliffs: CliffDef[];
  ridges: RidgeDef[];
  hills: HillDef[];
  quarry: QuarryDef;
  river: RiverDef;
  ponds: PondDef[];
  forests: ForestDef[];
  fields: FieldDef[];
  flatAreas: FlatAreaDef[];
  groundPatches: GroundPatchDef[];
  roadDefs: RoadDef[];
  bridges: BridgeDef[];
  locations: MapLocation[];
  lots: BuildingLot[];
  props: PropPlacement[];
  vehicleSpawns: VehicleSpawn[];
  /** Contract view of roadDefs. */
  roads: RoadSegment[];
}
