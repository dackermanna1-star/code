// The hand-authored plan of the alley. Everything procedural elsewhere is
// seeded from and constrained by this file.
//
// Facade local frame: x = u (meters along the wall, left→right as seen from
// the alley), y = up, z = out of the wall toward the alley (wall body at z<0).
// face: '+x' wall faces +X (left side of the alley), '-x' faces -X (right
// side), '+z' faces +Z (toward the start), '-z' faces -Z.
// start: world coordinate (z for ±x faces, x for ±z faces) of the u = 0 edge.
import * as THREE from 'three';

export const FACE_ROT = { '+x': Math.PI / 2, '-x': -Math.PI / 2, '+z': 0, '-z': Math.PI };
export const FACE_CODE = { '+x': 0, '-x': 1, '+z': 2, '-z': 3 };

export function facadeMatrix(f) {
  const m = new THREE.Matrix4().makeRotationY(FACE_ROT[f.face]);
  let ox, oz;
  if (f.face === '+x' || f.face === '-x') {
    ox = f.plane;
    oz = f.start;
  } else {
    ox = f.start;
    oz = f.plane;
  }
  m.setPosition(ox, f.base ?? 0, oz);
  return m;
}

/** Local facade coords (u, y, z-out) -> world Vector3. */
export function facadeToWorld(f, u, y, zOut = 0, target = new THREE.Vector3()) {
  switch (f.face) {
    case '+x':
      return target.set(f.plane + zOut, y, f.start - u);
    case '-x':
      return target.set(f.plane - zOut, y, f.start + u);
    case '+z':
      return target.set(f.start + u, y, f.plane + zOut);
    case '-z':
    default:
      return target.set(f.start - u, y, f.plane - zOut);
  }
}

export function facadeNormal(f) {
  switch (f.face) {
    case '+x': return new THREE.Vector3(1, 0, 0);
    case '-x': return new THREE.Vector3(-1, 0, 0);
    case '+z': return new THREE.Vector3(0, 0, 1);
    default: return new THREE.Vector3(0, 0, -1);
  }
}

/** Rotation (around Y) that maps prop-local +Z to the facade outward normal. */
export function facadeYaw(f) {
  return FACE_ROT[f.face];
}

// Brick colour schemes (sRGB). Index referenced by facades.
export const BRICK_SCHEMES = [
  {
    name: 'tan common',
    bricks: [[176, 146, 104], [188, 158, 114], [164, 128, 92], [196, 168, 124], [146, 116, 84], [180, 134, 100], [136, 102, 76], [170, 150, 112]],
    mortar: [146, 138, 124],
  },
  {
    name: 'red brown',
    bricks: [[118, 60, 46], [130, 68, 50], [102, 54, 42], [140, 78, 58], [92, 48, 38], [116, 70, 56], [84, 46, 40], [124, 58, 44]],
    mortar: [128, 120, 110],
  },
  {
    name: 'dark brown',
    bricks: [[88, 60, 50], [98, 66, 54], [76, 52, 44], [108, 74, 60], [66, 46, 40], [92, 58, 48], [80, 62, 56], [100, 70, 58]],
    mortar: [118, 112, 104],
  },
  {
    name: 'orange red',
    bricks: [[150, 78, 54], [162, 88, 60], [138, 70, 50], [170, 98, 68], [124, 64, 46], [156, 82, 58], [112, 60, 46], [166, 92, 62]],
    mortar: [140, 132, 120],
  },
  {
    name: 'buff',
    bricks: [[188, 172, 138], [198, 182, 148], [176, 160, 128], [206, 190, 156], [166, 150, 120], [184, 164, 130], [158, 144, 116], [194, 176, 140]],
    mortar: [150, 144, 132],
  },
  {
    name: 'salmon common',
    bricks: [[182, 140, 104], [170, 124, 92], [194, 154, 114], [160, 112, 84], [186, 150, 108], [148, 108, 80], [176, 132, 98], [198, 162, 120]],
    mortar: [144, 136, 122],
  },
];

const STD_WIN = { w: 0.88, h: 1.45, sill: 0.82 };

/**
 * Facade specs. Openings use local meters: {type, u (left edge), y (bottom), w, h, ...}.
 * Upper-floor windows are generated from `bays` (centers) on `upper` floors.
 */
export const FACADES = [
  // ───────────────────────── LEFT SIDE (faces +X) ─────────────────────────
  {
    id: 'L0', face: '+x', plane: -2.8, start: 14, width: 24, height: 14.2, scheme: 0, bond: 'common',
    floors: [0, 3.6, 6.9, 10.2], seed: 11, wallDepth: 0.55,
    cornice: 'corbel', coping: 'stone', belts: [3.55],
    bays: [1.6, 4.4, 9.2, 12.1, 16.2, 18.6, 22.2], upper: [1, 2, 3], win: STD_WIN,
    windowOverrides: { '1:4': { type: 'fe', h: 1.75, sill: 0.45 }, '2:4': { type: 'fe', h: 1.75, sill: 0.45 }, '3:4': { type: 'fe', h: 1.75, sill: 0.45 } },
    lit: ['2:2', '3:6', '1:0'],
    ground: [
      { type: 'window', u: 1.9, y: 1.25, w: 0.9, h: 1.2, bars: true },
      { type: 'window', u: 4.0, y: 1.25, w: 0.9, h: 1.2, bars: true },
      { type: 'door', u: 11.8, w: 0.95, h: 2.15, stoop: true, lamp: 'cage', style: 'steel' },
      { type: 'glassblock', u: 14.2, y: 1.1, w: 1.22, h: 1.08 },
      { type: 'bricked', u: 18.4, y: 0.95, w: 1.02, h: 1.55, infill: 'cmu' },
      { type: 'door', u: 21.4, w: 0.95, h: 2.1, style: 'boarded' },
    ],
    damage: [{ u: 6.2, y: 0.15, w: 0.9, h: 0.5 }, { u: 20.5, y: 2.6, w: 0.5, h: 0.4 }],
    patches: [{ u: 7.6, y: 0.0, w: 2.2, h: 1.3, kind: 'parge' }],
    paint: { density: 0.95, bands: [{ y0: 0, y1: 3.8, density: 1 }, { y0: 3.8, y1: 7, density: 0.12 }] },
  },
  {
    id: 'L1', face: '+x', plane: -2.8, start: -10, width: 23, height: 17.6, scheme: 5, bond: 'common',
    floors: [0, 4.2, 7.5, 10.8, 14.1], seed: 23, wallDepth: 0.6,
    cornice: 'corbel', coping: 'tile', belts: [4.15, 14.05],
    bays: [1.9, 4.8, 7.4, 11.0, 13.8, 16.6, 19.3, 21.6], upper: [1, 2, 3, 4], win: STD_WIN,
    windowOverrides: {
      '1:1': { type: 'fe', h: 1.75, sill: 0.45 }, '2:1': { type: 'fe', h: 1.75, sill: 0.45 },
      '3:1': { type: 'fe', h: 1.75, sill: 0.45 }, '4:1': { type: 'fe', h: 1.75, sill: 0.45 },
      '1:4': { type: 'bricked' }, '2:6': { type: 'boarded' }, '1:7': { type: 'bricked' },
    },
    lit: ['3:3', '4:5', '2:7', '1:5'],
    ground: [
      { type: 'window', u: 1.6, y: 2.25, w: 0.8, h: 0.8, bars: true },
      { type: 'door', u: 7.0, w: 0.95, h: 2.15, style: 'steel' },
      { type: 'window', u: 11.6, y: 2.35, w: 0.8, h: 0.8, bars: true },
      { type: 'rollup', u: 15.6, w: 3.6, h: 3.3, bollards: true },
      { type: 'door', u: 20.9, w: 0.95, h: 2.2, style: 'steel2' },
    ],
    damage: [{ u: 13.2, y: 0.1, w: 1.4, h: 0.6 }, { u: 3.0, y: 3.4, w: 0.4, h: 0.3 }],
    patches: [{ u: 9.4, y: 0.0, w: 3.2, h: 2.4, kind: 'paint', color: [118, 96, 82] }],
    paint: { density: 1.0, bands: [{ y0: 0, y1: 4.2, density: 1 }, { y0: 4.2, y1: 9, density: 0.15 }], style: { pieces: 1, throwups: 1 } },
  },
  {
    id: 'L2', face: '+x', plane: -2.8, start: -33, width: 16, height: 11.4, scheme: 3, bond: 'running',
    floors: [0, 4.0, 7.4], seed: 37, wallDepth: 2.65,
    cornice: 'none', coping: 'tile', belts: [],
    bays: [1.3, 3.0, 5.2, 7.6, 10.0, 12.4, 14.8], upper: [1, 2], win: { w: 0.82, h: 1.4, sill: 0.85 },
    windowOverrides: { '1:3': { type: 'boarded' } },
    lit: ['2:5', '1:1'],
    ground: [
      { type: 'recess', u: 4.0, y: 0, w: 8.0, h: 3.9, depth: 2.2, dock: 1.05, beam: true },
      { type: 'door', u: 13.0, w: 0.95, h: 2.15, stoop: true, style: 'kitchen', lamp: 'bulkhead' },
      { type: 'window', u: 15.05, y: 2.2, w: 0.6, h: 0.6, bars: true },
    ],
    damage: [{ u: 0.8, y: 0.0, w: 1.2, h: 0.45 }],
    patches: [{ u: 12.6, y: 2.3, w: 2.6, h: 1.6, kind: 'grease' }],
    paint: { density: 0.9, bands: [{ y0: 0, y1: 4.0, density: 1 }, { y0: 4, y1: 8, density: 0.08 }] },
  },
  {
    id: 'L3', face: '+x', plane: -2.8, start: -49, width: 17, height: 13.8, scheme: 2, bond: 'common',
    floors: [0, 3.8, 7.1, 10.4], seed: 41, wallDepth: 0.55,
    cornice: 'corbel', coping: 'stone', belts: [],
    bays: [1.4, 3.8, 6.3, 9.8, 12.2, 14.6, 16.2], upper: [1, 2, 3], win: STD_WIN,
    windowOverrides: { '1:3': { type: 'fe', h: 1.75, sill: 0.45 }, '2:3': { type: 'fe', h: 1.75, sill: 0.45 }, '3:3': { type: 'fe', h: 1.75, sill: 0.45 }, '2:6': { type: 'bricked' } },
    lit: ['1:5', '3:1', '2:4'],
    ground: [
      { type: 'window', u: 1.0, y: 1.2, w: 0.9, h: 1.3, bars: true },
      { type: 'window', u: 3.4, y: 1.2, w: 0.9, h: 1.3, bars: true },
      { type: 'door', u: 6.6, w: 0.95, h: 2.15, style: 'steel', lamp: 'wallpack' },
      { type: 'glassblock', u: 8.9, y: 1.3, w: 1.0, h: 1.0 },
      { type: 'garage', u: 11.6, w: 2.6, h: 2.4 },
      { type: 'window', u: 15.4, y: 1.2, w: 0.9, h: 1.3, bars: true },
    ],
    damage: [{ u: 10.4, y: 0.0, w: 1.0, h: 0.35 }],
    patches: [{ u: 0.4, y: 0.0, w: 5.2, h: 0.9, kind: 'parge' }],
    paint: { density: 0.9, bands: [{ y0: 0, y1: 3.8, density: 1 }, { y0: 3.8, y1: 8, density: 0.1 }] },
  },
  {
    id: 'L4', face: '+x', plane: -2.8, start: -66, width: 8, height: 10.6, scheme: 4, bond: 'running',
    floors: [0, 3.7, 7.0], seed: 53, wallDepth: 0.55,
    cornice: 'corbel', coping: 'stone', belts: [3.65],
    bays: [1.5, 4.0, 6.5], upper: [1, 2], win: STD_WIN,
    lit: ['2:0'],
    ground: [
      { type: 'window', u: 1.6, y: 1.2, w: 0.9, h: 1.3, bars: true },
      { type: 'door', u: 4.6, w: 0.95, h: 2.15, style: 'steel2' },
    ],
    paint: { density: 0.8, bands: [{ y0: 0, y1: 3.6, density: 1 }] },
  },
  {
    id: 'L4s', face: '-z', plane: -74, start: -2.8, width: 19.2, height: 10.6, scheme: 4, bond: 'running',
    floors: [0, 3.7, 7.0], seed: 59, wallDepth: 0.55,
    cornice: 'corbel', coping: 'stone', belts: [3.65],
    bays: [1.6, 4.2, 6.8, 9.4, 12.0, 14.6, 17.4], upper: [1, 2], win: STD_WIN,
    lit: ['1:3', '2:5'],
    ground: [
      { type: 'door', u: 2.6, w: 0.95, h: 2.15, style: 'steel' },
      { type: 'window', u: 5.6, y: 1.2, w: 0.9, h: 1.3, bars: true },
      { type: 'garage', u: 9.6, w: 2.8, h: 2.4 },
      { type: 'window', u: 15.4, y: 1.2, w: 0.9, h: 1.3, bars: true },
    ],
    paint: { density: 0.7, bands: [{ y0: 0, y1: 3.6, density: 1 }] },
  },

  // Height-step side walls on the left (visible above the lower neighbour)
  { id: 'L1sA', face: '+z', plane: -10, start: -14, width: 11.2, height: 17.6, scheme: 5, bond: 'common', seed: 61, wallDepth: 0.5, blank: true, coping: 'tile', base: 13.6, ghost: true },
  { id: 'L1sB', face: '-z', plane: -33, start: -2.8, width: 11.2, height: 17.6, scheme: 5, bond: 'common', seed: 67, wallDepth: 0.5, blank: true, coping: 'tile', base: 10.9 },
  { id: 'L3sA', face: '+z', plane: -49, start: -14, width: 11.2, height: 13.8, scheme: 2, bond: 'common', seed: 71, wallDepth: 0.5, blank: true, coping: 'stone', base: 10.9 },
  { id: 'L3sB', face: '-z', plane: -66, start: -2.8, width: 11.2, height: 13.8, scheme: 2, bond: 'common', seed: 73, wallDepth: 0.5, blank: true, coping: 'stone', base: 10.1 },

  // ───────────────────────── RIGHT SIDE (faces -X) ─────────────────────────
  {
    id: 'R0', face: '-x', plane: 2.8, start: -8, width: 22, height: 11.0, scheme: 1, bond: 'common',
    floors: [0, 3.5, 6.8], seed: 101, wallDepth: 0.55,
    cornice: 'corbel', coping: 'stone', belts: [],
    bays: [1.2, 3.4, 6.2, 8.6, 11.0, 13.4, 16.0, 18.6, 21.0], upper: [1, 2], win: STD_WIN,
    windowOverrides: { '1:3': { type: 'boarded' } },
    lit: ['1:1', '2:6', '2:2'],
    ground: [
      { type: 'window', u: 0.8, y: 1.15, w: 0.9, h: 1.3, bars: true },
      { type: 'door', u: 4.1, w: 0.95, h: 2.1, stoop: true, steps: 2, rail: true, style: 'steel2', lamp: 'bulkhead' },
      { type: 'glassblock', u: 6.6, y: 1.3, w: 0.8, h: 0.8 },
      { type: 'window', u: 12.0, y: 1.15, w: 0.9, h: 1.3, bars: true },
      { type: 'window', u: 17.2, y: 1.15, w: 0.9, h: 1.3, bars: true },
      { type: 'door', u: 19.8, w: 0.95, h: 2.1, style: 'steel' },
    ],
    damage: [{ u: 9.0, y: 0.0, w: 0.8, h: 0.4 }],
    paint: { density: 0.85, bands: [{ y0: 0, y1: 3.4, density: 1 }, { y0: 3.4, y1: 7, density: 0.1 }] },
  },
  { id: 'R0s', face: '-z', plane: -8, start: 14, width: 11.2, height: 11.0, scheme: 1, bond: 'common', seed: 107, wallDepth: 0.5, blank: true, coping: 'stone',
    ground: [{ type: 'window', u: 7.6, y: 1.4, w: 0.6, h: 0.9 }], sideWindows: [{ u: 8.0, y: 4.6, w: 0.6, h: 0.9 }, { u: 8.0, y: 7.9, w: 0.6, h: 0.9, lit: true }],
    paint: { density: 0.3, bands: [{ y0: 0, y1: 2.6, density: 1 }] } },
  {
    id: 'R1b', face: '-x', plane: 9.2, start: -14.5, width: 6.5, height: 10.6, scheme: 3, bond: 'running',
    floors: [0, 3.4, 6.6], seed: 113, wallDepth: 0.5,
    cornice: 'none', coping: 'tile', belts: [],
    bays: [1.5, 4.9], upper: [1, 2], win: STD_WIN,
    lit: ['1:0', '2:1'],
    ground: [{ type: 'door', u: 3.0, w: 0.9, h: 2.1, style: 'wood' }, { type: 'window', u: 0.9, y: 1.0, w: 0.9, h: 1.3 }],
  },
  { id: 'R2s', face: '+z', plane: -14.5, start: 2.8, width: 11.2, height: 14.4, scheme: 2, bond: 'common', seed: 127, wallDepth: 0.5, blank: true, coping: 'stone',
    sideWindows: [{ u: 4.6, y: 5.2, w: 0.6, h: 0.9 }, { u: 4.6, y: 8.5, w: 0.6, h: 0.9 }, { u: 4.6, y: 11.8, w: 0.6, h: 0.9, lit: true }],
    paint: { density: 0.35, bands: [{ y0: 0, y1: 2.4, density: 1 }] } },
  {
    id: 'R2', face: '-x', plane: 2.8, start: -31, width: 16.5, height: 14.4, scheme: 2, bond: 'common',
    floors: [0, 3.9, 7.2, 10.5], seed: 131, wallDepth: 0.55,
    cornice: 'corbel', coping: 'stone', belts: [3.85],
    bays: [1.2, 3.4, 6.3, 8.6, 11.4, 13.6, 15.6], upper: [1, 2, 3], win: STD_WIN,
    windowOverrides: { '2:3': { type: 'bricked' } },
    lit: ['1:4', '3:2', '2:5', '3:6'],
    ac: ['1:1', '2:4', '3:5', '1:6'],
    ground: [
      { type: 'window', u: 0.6, y: 1.2, w: 0.9, h: 1.3, bars: true },
      { type: 'window', u: 2.4, y: 1.2, w: 0.9, h: 1.3, bars: true },
      { type: 'door', u: 5.0, w: 0.95, h: 2.1, style: 'steel', lamp: 'fluoro' },
      { type: 'window', u: 12.0, y: 1.2, w: 0.9, h: 1.3, bars: true },
    ],
    damage: [{ u: 7.2, y: 0.0, w: 1.0, h: 0.55 }],
    paint: { density: 0.95, bands: [{ y0: 0, y1: 3.8, density: 1 }, { y0: 3.8, y1: 7, density: 0.1 }] },
  },
  { id: 'R2s2', face: '-z', plane: -31, start: 14, width: 11.2, height: 14.4, scheme: 2, bond: 'common', seed: 137, wallDepth: 0.5, blank: true, coping: 'stone',
    sideWindows: [{ u: 9.0, y: 1.3, w: 0.8, h: 1.1 }, { u: 9.0, y: 4.6, w: 0.8, h: 1.3 }, { u: 9.0, y: 7.9, w: 0.8, h: 1.3 }],
    paint: { density: 0.6, bands: [{ y0: 0, y1: 3.0, density: 1 }] } },
  {
    id: 'R3', face: '-x', plane: 5.6, start: -46, width: 15, height: 11.2, scheme: 3, bond: 'running',
    floors: [0, 3.6, 7.0], seed: 139, wallDepth: 0.5,
    cornice: 'none', coping: 'tile', belts: [],
    bays: [1.4, 3.6, 6.0, 9.0, 11.4, 13.6], upper: [1, 2], win: STD_WIN,
    lit: ['1:2', '2:4'],
    ground: [
      { type: 'window', u: 1.0, y: 1.1, w: 0.9, h: 1.3, bars: true },
      { type: 'door', u: 4.4, w: 0.9, h: 2.1, style: 'wood' },
      { type: 'door', u: 9.8, w: 0.9, h: 2.1, style: 'steel2' },
      { type: 'window', u: 12.6, y: 1.1, w: 0.9, h: 1.3 },
    ],
    paint: { density: 0.5, bands: [{ y0: 0, y1: 3.0, density: 1 }] },
  },
  { id: 'R4s', face: '+z', plane: -46, start: 2.8, width: 11.2, height: 13.9, scheme: 1, bond: 'common', seed: 149, wallDepth: 0.5, blank: true, coping: 'stone',
    paint: { density: 0.7, bands: [{ y0: 0, y1: 3.0, density: 1 }] } },
  {
    id: 'R4', face: '-x', plane: 2.8, start: -62, width: 16, height: 13.9, scheme: 1, bond: 'common',
    floors: [0, 3.8, 7.1, 10.4], seed: 151, wallDepth: 0.55,
    cornice: 'corbel', coping: 'stone', belts: [3.75],
    bays: [1.2, 3.5, 5.8, 8.2, 10.5, 12.8, 15.0], upper: [1, 2, 3], win: STD_WIN,
    windowOverrides: { '1:2': { type: 'boarded' } },
    lit: ['2:1', '3:4', '1:6'],
    ac: ['2:3', '1:5'],
    ground: [
      { type: 'glassblock', u: 0.8, y: 1.4, w: 1.2, h: 1.0 },
      { type: 'door', u: 3.0, w: 0.95, h: 2.15, style: 'steel', lamp: 'cage' },
      { type: 'window', u: 9.8, y: 1.2, w: 0.9, h: 1.3, bars: true },
      { type: 'glassblock', u: 13.4, y: 1.4, w: 1.2, h: 1.0 },
    ],
    damage: [{ u: 5.2, y: 0.0, w: 0.7, h: 0.3 }],
    paint: { density: 0.9, bands: [{ y0: 0, y1: 3.6, density: 1 }, { y0: 3.6, y1: 6, density: 0.1 }] },
  },
  { id: 'R4s2', face: '-z', plane: -62, start: 14, width: 11.2, height: 13.9, scheme: 1, bond: 'common', seed: 157, wallDepth: 0.5, blank: true, coping: 'stone', base: 7.8, ghost: true },
  {
    id: 'R5', face: '-x', plane: 2.8, start: -74, width: 12, height: 8.4, scheme: 2, bond: 'running',
    floors: [0, 4.4], seed: 163, wallDepth: 0.55,
    cornice: 'none', coping: 'stone', belts: [4.35],
    bays: [2.0, 5.2, 8.4, 10.8], upper: [1], win: { w: 1.4, h: 1.6, sill: 0.9, type: 'steel' },
    lit: [],
    ground: [
      { type: 'sliding', u: 2.8, w: 4.4, h: 3.6 },
      { type: 'door', u: 9.0, w: 0.95, h: 2.15, style: 'steel2', lamp: 'wallpack' },
    ],
    paint: { density: 1.0, bands: [{ y0: 0, y1: 4.0, density: 1 }, { y0: 4, y1: 8, density: 0.25 }] },
  },
  {
    id: 'R5s', face: '-z', plane: -74, start: 22, width: 19.2, height: 8.4, scheme: 2, bond: 'running',
    floors: [0, 4.4], seed: 167, wallDepth: 0.55, cornice: 'none', coping: 'stone', belts: [4.35],
    bays: [3.0, 7.0, 11.0, 15.0], upper: [1], win: { w: 1.4, h: 1.6, sill: 0.9, type: 'steel' },
    ground: [
      { type: 'rollup', u: 4.0, w: 3.2, h: 3.2 },
      { type: 'door', u: 12.0, w: 0.95, h: 2.15, style: 'steel' },
    ],
    paint: { density: 0.9, bands: [{ y0: 0, y1: 4.0, density: 1 }] },
  },

  // ───────────────────────── FAR END & BACKDROPS ─────────────────────────
  {
    id: 'E', face: '+z', plane: -79.5, start: -22, width: 44, height: 11.6, scheme: 1, bond: 'common',
    floors: [0, 3.8, 7.5], seed: 181, wallDepth: 0.55,
    cornice: 'corbel', coping: 'stone', belts: [3.75],
    bays: [1.6, 4.0, 6.4, 8.8, 11.6, 14.0, 16.8, 19.4, 22.6, 25.4, 28.0, 30.6, 33.2, 35.8, 38.6, 41.6], upper: [1, 2], win: STD_WIN,
    lit: ['1:7', '2:8', '1:9', '2:6', '1:12', '2:3', '1:14', '2:11'],
    ac: ['1:10', '2:13'],
    ground: [
      { type: 'window', u: 3.6, y: 1.2, w: 0.9, h: 1.3, bars: true },
      { type: 'door', u: 9.4, w: 0.95, h: 2.15, style: 'steel' },
      { type: 'garage', u: 13.4, w: 2.8, h: 2.4 },
      { type: 'window', u: 18.6, y: 1.2, w: 0.9, h: 1.3, bars: true, lit: true },
      { type: 'door', u: 23.6, w: 0.95, h: 2.15, style: 'steel2', lamp: 'cage' },
      { type: 'window', u: 26.6, y: 1.2, w: 0.9, h: 1.3, bars: true },
      { type: 'glassblock', u: 31.0, y: 1.3, w: 1.2, h: 1.0 },
      { type: 'door', u: 36.0, w: 0.95, h: 2.15, style: 'wood' },
    ],
    paint: { density: 0.75, bands: [{ y0: 0, y1: 3.6, density: 1 }] },
  },
  { id: 'Xend', face: '-x', plane: 22, start: -79.5, width: 5.5, height: 3.4, scheme: 3, bond: 'running', seed: 191, wallDepth: 0.4, blank: true, coping: 'tile',
    paint: { density: 0.8, bands: [{ y0: 0, y1: 3.0, density: 1 }] } },
  {
    id: 'S', face: '-z', plane: 26, start: 30, width: 60, height: 12.4, scheme: 3, bond: 'running',
    floors: [0, 4.2, 8.2], seed: 199, wallDepth: 0.4, cornice: 'corbel', coping: 'stone', backdrop: true,
    bays: [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35, 38, 41, 44, 47, 50, 53, 56, 59 - 1], upper: [1, 2], win: { w: 1.1, h: 1.7, sill: 0.8 },
    lit: ['1:9', '2:10', '1:12', '2:7', '1:5', '2:14', '1:16'],
    ground: [{ type: 'storefront', u: 24, w: 12, h: 3.2 }],
  },
  { id: 'L0st', face: '+z', plane: 14, start: -14, width: 11.2, height: 14.2, scheme: 0, bond: 'common', seed: 211, wallDepth: 0.4, blank: true, coping: 'stone', backdrop: true },
  { id: 'R0st', face: '+z', plane: 14, start: 2.8, width: 11.2, height: 11.0, scheme: 1, bond: 'common', seed: 223, wallDepth: 0.4, blank: true, coping: 'stone', backdrop: true },
];

export function facadeById(id) {
  return FACADES.find((f) => f.id === id);
}

// Utility poles (wooden) and their hardware.
export const POLES = [
  { id: 'P0', x: 2.25, z: 10.6, height: 11.2, transformer: 0, light: null },
  { id: 'P1', x: 2.3, z: -16.8, height: 12.0, transformer: 3, light: null, meterBox: true },
  { id: 'P2', x: 2.35, z: -50.5, height: 11.6, transformer: 1, light: { type: 'cobra', height: 7.8, reach: 1.4 } },
  { id: 'P3', x: 3.25, z: -78.9, height: 10.8, transformer: 2, light: { type: 'cobra', height: 7.0, reach: 1.6 } },
];

// Hero light sources (positions in world space). Spot lights cast static shadows.
export const LAMPS = [
  // warm caged bulb over L0 door
  { id: 'L0door', kind: 'cage', facade: 'L0', u: 12.27, y: 2.52, color: 0xffb46a, intensity: 0.66, spot: { angle: 1.15, penumbra: 0.85, dist: 9 }, shadow: true, flicker: 0.02 },
  // hero industrial gooseneck lamp on L1 (flickers, buzzes)
  { id: 'L1rlm', kind: 'rlm', facade: 'L1', u: 11.2, y: 4.55, out: 0.62, color: 0xffc27a, intensity: 10.20, spot: { angle: 1.05, penumbra: 0.7, dist: 22 }, shadow: true, flicker: 1.0 },
  // kitchen bulkhead on L2
  { id: 'L2kitchen', kind: 'bulkhead', facade: 'L2', u: 13.48, y: 2.45, color: 0xffd9a8, intensity: 0.48, spot: { angle: 1.2, penumbra: 0.9, dist: 8 }, shadow: false, flicker: 0.0 },
  // sodium wall pack under the L2 dock soffit
  { id: 'L2dock', kind: 'wallpack', facade: 'L2', u: 8.0, y: 3.55, out: -1.9, color: 0xff9a40, intensity: 1.68, spot: { angle: 1.25, penumbra: 0.6, dist: 12 }, shadow: true, flicker: 0.05 },
  // wall pack over L3 door
  { id: 'L3door', kind: 'wallpack', facade: 'L3', u: 7.07, y: 2.75, color: 0xffa955, intensity: 1.08, spot: { angle: 1.2, penumbra: 0.7, dist: 11 }, shadow: false, flicker: 0.03 },
  // greenish fluorescent over R2 door
  { id: 'R2fluoro', kind: 'fluoro', facade: 'R2', u: 5.47, y: 2.62, color: 0xd8ffe0, intensity: 0.84, spot: { angle: 1.3, penumbra: 0.9, dist: 10 }, shadow: false, flicker: 0.35 },
  // bulkhead at R0 door
  { id: 'R0door', kind: 'bulkhead', facade: 'R0', u: 4.57, y: 2.55, color: 0xffcf96, intensity: 0.50, spot: { angle: 1.2, penumbra: 0.9, dist: 8 }, shadow: false, flicker: 0.0 },
  // cage at R4 door
  { id: 'R4door', kind: 'cage', facade: 'R4', u: 3.47, y: 2.6, color: 0xffb060, intensity: 0.50, spot: { angle: 1.2, penumbra: 0.9, dist: 8 }, shadow: false, flicker: 0.0 },
  // wallpack on R5
  { id: 'R5door', kind: 'wallpack', facade: 'R5', u: 9.47, y: 2.75, color: 0xff9b45, intensity: 0.96, spot: { angle: 1.2, penumbra: 0.7, dist: 11 }, shadow: false, flicker: 0.0 },
  // cage at far end door (E)
  { id: 'Edoor', kind: 'cage', facade: 'E', u: 24.07, y: 2.6, color: 0xffb468, intensity: 0.60, spot: { angle: 1.2, penumbra: 0.9, dist: 9 }, shadow: false, flicker: 0.0 },
];

// The alley's walkable region, described as axis-aligned rectangles (x0,z0,x1,z1).
export const WALK_RECTS = [
  [-2.8, -74.0, 2.8, 6.85], // main alley
  [-22, -79.5, 22, -74.0], // cross alley
  [-5.0, -45.0, -2.8, -37.0], // L2 loading dock recess (floor; dock platform is a collider)
  [2.8, -46.0, 5.6, -31.0], // R3 setback yard
];

// Building masses (x0, z0, x1, z1, height) used to bake sky occlusion.
export const BLOCKS = [
  [-14.8, -10, -2.8, 14, 14.2], // L0
  [-14.8, -33, -2.8, -10, 17.6], // L1
  [-14.8, -49, -2.8, -33, 11.4], // L2
  [-14.8, -66, -2.8, -49, 13.8], // L3
  [-22, -74, -2.8, -66, 10.6], // L4 corner
  [-22, -66, -14.8, -40, 9.0], // deeper left block filler
  [2.8, -8, 14.8, 14, 11.0], // R0
  [9.2, -14.5, 21.2, -8, 10.6], // R1b
  [2.8, -14.5, 9.2, -8, 2.0], // yard fence
  [2.8, -31, 14.8, -14.5, 14.4], // R2
  [5.6, -46, 17.6, -31, 11.2], // R3
  [2.8, -62, 14.8, -46, 13.9], // R4
  [2.8, -74, 22, -62, 8.4], // R5
  [-22, -91.5, 22, -79.5, 11.6], // E
  [22, -79.5, 30, -74, 3.4], // Xend
  [-30, 26, 30, 38, 12.4], // across the street
  [-30, -110, 30, -91.5, 10.0], // beyond E
  [14.8, -74, 30, 14, 10.0], // far right fillers
  [-30, -74, -14.8, 14, 11.0], // far left fillers
];
