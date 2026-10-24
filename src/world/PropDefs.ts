import { GeoBuilder } from '../render/GeoBuilder';
import { T } from '../render/PropAtlas';
import type { SurfaceMaterial } from '../physics/Physics';

export interface ColliderDef {
  shape: 'box' | 'cyl' | 'ball';
  /** box: full size; cyl: [radius, height]; ball: [radius] */
  size: number[];
  pos?: [number, number, number];
  rot?: [number, number, number];
}

export type InteractKind = 'drink' | 'jukebox' | 'tap' | 'arcade' | 'register' | 'flush' | 'sink' | 'pinball' | 'piano' | 'phone' | 'tv' | 'dartboard';
export type BreakFx = 'glass' | 'wood' | 'ceramic' | 'metal' | 'plastic' | 'paper' | 'none';

export interface PropDef {
  id: string;
  name: string;
  build: (b: GeoBuilder, variant: number) => void;
  variants?: number;
  colliders: ColliderDef[];
  mass: number;
  material: SurfaceMaterial;
  glass?: boolean;
  health?: number;
  breakImpulse?: number;
  breakFx?: BreakFx;
  debrisColor?: string;
  liquid?: number;
  pieces?: { id: string; pos?: [number, number, number]; rot?: [number, number, number] }[];
  weapon?: string;
  grip?: [number, number, number];
  gripRot?: [number, number, number];
  carry?: boolean;
  interact?: InteractKind;
  heal?: number;
  fixed?: boolean;
  wakeImpulse?: number;
  friction?: number;
  restitution?: number;
  ccd?: boolean;
  shadow?: boolean;
  /** NPCs can sit on this */
  seat?: { height: number; kind: 'chair' | 'stool' | 'couch' };
  /** small clutter: no shadows, cheap */
  small?: boolean;
}

export const PROPS: Record<string, PropDef> = {};
function def(p: PropDef): PropDef {
  PROPS[p.id] = p;
  return p;
}

const WOOD_C = ['#8a5a36', '#6e4428', '#a06a40', '#5a3a24'];
const BEER_GLASS = ['#5a3010', '#2a5a1a', '#6a3a14', '#3a6a2a'];
const BEER_LABELS = [T.LABEL_A, T.LABEL_B, T.LABEL_D, T.LABEL_E];

// ------------------------------------------------------------------ furniture
def({
  id: 'chair',
  name: 'Chair',
  variants: 4,
  build: (b, v) => {
    const c = WOOD_C[v % 4];
    b.box({ size: [0.44, 0.05, 0.42], pos: [0, 0.47, 0], tile: T.WOOD, color: c });
    for (const [x, z] of [
      [-0.19, -0.18],
      [0.19, -0.18],
      [-0.19, 0.18],
      [0.19, 0.18],
    ])
      b.box({ size: [0.045, 0.46, 0.045], pos: [x, 0.23, z], tile: T.WOOD_DARK, color: c });
    b.box({ size: [0.045, 0.52, 0.045], pos: [-0.19, 0.74, -0.18], tile: T.WOOD_DARK, color: c });
    b.box({ size: [0.045, 0.52, 0.045], pos: [0.19, 0.74, -0.18], tile: T.WOOD_DARK, color: c });
    b.box({ size: [0.4, 0.1, 0.035], pos: [0, 0.93, -0.18], tile: T.WOOD, color: c });
    b.box({ size: [0.4, 0.06, 0.03], pos: [0, 0.72, -0.18], tile: T.WOOD, color: c });
    b.box({ size: [0.36, 0.03, 0.03], pos: [0, 0.14, 0.18], tile: T.WOOD_DARK, color: c });
  },
  colliders: [
    { shape: 'box', size: [0.44, 0.06, 0.42], pos: [0, 0.47, 0] },
    { shape: 'box', size: [0.05, 0.44, 0.05], pos: [-0.19, 0.22, -0.18] },
    { shape: 'box', size: [0.05, 0.44, 0.05], pos: [0.19, 0.22, -0.18] },
    { shape: 'box', size: [0.05, 0.44, 0.05], pos: [-0.19, 0.22, 0.18] },
    { shape: 'box', size: [0.05, 0.44, 0.05], pos: [0.19, 0.22, 0.18] },
    { shape: 'box', size: [0.42, 0.48, 0.05], pos: [0, 0.74, -0.18] },
  ],
  mass: 6,
  material: 'wood',
  health: 55,
  breakImpulse: 38,
  breakFx: 'wood',
  debrisColor: '#7a4a2a',
  pieces: [
    { id: 'chair_leg', pos: [-0.19, 0.22, 0.18] },
    { id: 'chair_leg', pos: [0.19, 0.22, 0.18] },
    { id: 'plank_small', pos: [0, 0.47, 0] },
  ],
  weapon: 'chair',
  grip: [0, 0.9, -0.18],
  gripRot: [180, 0, 0],
  seat: { height: 0.5, kind: 'chair' },
});

def({
  id: 'stool',
  name: 'Bar Stool',
  variants: 2,
  build: (b, v) => {
    b.cyl({ radius: 0.19, height: 0.07, pos: [0, 0.78, 0], tile: T.CUSHION, color: v ? '#ffffff' : '#7a2a1a', segments: 10 });
    b.cyl({ radius: 0.15, height: 0.03, pos: [0, 0.73, 0], tile: T.CHROME, color: '#c8c8c8', segments: 10 });
    for (const [x, z] of [
      [-0.12, -0.12],
      [0.12, -0.12],
      [-0.12, 0.12],
      [0.12, 0.12],
    ])
      b.box({ size: [0.03, 0.74, 0.03], pos: [x * 1.15, 0.37, z * 1.15], rot: [z > 0 ? -4 : 4, 0, x > 0 ? 4 : -4], tile: T.CHROME, color: '#a8a8b0' });
    b.box({ size: [0.3, 0.025, 0.025], pos: [0, 0.28, 0.13], tile: T.CHROME, color: '#a8a8b0' });
    b.box({ size: [0.3, 0.025, 0.025], pos: [0, 0.28, -0.13], tile: T.CHROME, color: '#a8a8b0' });
  },
  colliders: [
    { shape: 'cyl', size: [0.19, 0.1], pos: [0, 0.77, 0] },
    { shape: 'box', size: [0.32, 0.72, 0.32], pos: [0, 0.36, 0] },
  ],
  mass: 7,
  material: 'metal',
  health: 70,
  breakImpulse: 50,
  breakFx: 'metal',
  debrisColor: '#8a8a90',
  pieces: [
    { id: 'stool_leg', pos: [0.12, 0.37, 0.12] },
    { id: 'stool_seat', pos: [0, 0.78, 0] },
  ],
  weapon: 'stool',
  grip: [0, 0.2, 0],
  gripRot: [180, 0, 0],
  seat: { height: 0.8, kind: 'stool' },
});

def({
  id: 'table_round',
  name: 'Table',
  variants: 2,
  build: (b, v) => {
    const c = WOOD_C[v];
    b.cyl({ radius: 0.42, height: 0.045, pos: [0, 0.75, 0], tile: T.WOOD, color: c, segments: 12 });
    b.cyl({ radius: 0.05, height: 0.7, pos: [0, 0.38, 0], tile: T.WOOD_DARK, color: '#3a2a1a', segments: 6 });
    b.box({ size: [0.6, 0.04, 0.08], pos: [0, 0.03, 0], tile: T.METAL, color: '#2a2a2a' });
    b.box({ size: [0.08, 0.04, 0.6], pos: [0, 0.03, 0], tile: T.METAL, color: '#2a2a2a' });
  },
  colliders: [
    { shape: 'cyl', size: [0.42, 0.05], pos: [0, 0.75, 0] },
    { shape: 'box', size: [0.1, 0.7, 0.1], pos: [0, 0.38, 0] },
    { shape: 'box', size: [0.6, 0.05, 0.6], pos: [0, 0.03, 0] },
  ],
  mass: 16,
  material: 'wood',
  health: 120,
  breakImpulse: 70,
  breakFx: 'wood',
  debrisColor: '#6a4428',
  pieces: [
    { id: 'plank', pos: [0.15, 0.75, 0], rot: [0, 0, 90] },
    { id: 'plank', pos: [-0.15, 0.75, 0], rot: [0, 0, 90] },
    { id: 'chair_leg', pos: [0, 0.38, 0] },
  ],
  carry: true,
});

def({
  id: 'table_square',
  name: 'Table',
  variants: 2,
  build: (b, v) => {
    const c = WOOD_C[v + 1];
    b.box({ size: [0.9, 0.05, 0.9], pos: [0, 0.75, 0], tile: T.PLANKS, color: c, uvScale: 0.9 });
    b.box({ size: [0.82, 0.08, 0.82], pos: [0, 0.69, 0], tile: T.WOOD_DARK, color: c });
    for (const [x, z] of [
      [-0.38, -0.38],
      [0.38, -0.38],
      [-0.38, 0.38],
      [0.38, 0.38],
    ])
      b.box({ size: [0.06, 0.66, 0.06], pos: [x, 0.33, z], tile: T.WOOD_DARK, color: c });
  },
  colliders: [
    { shape: 'box', size: [0.9, 0.12, 0.9], pos: [0, 0.71, 0] },
    { shape: 'box', size: [0.06, 0.64, 0.06], pos: [-0.38, 0.32, -0.38] },
    { shape: 'box', size: [0.06, 0.64, 0.06], pos: [0.38, 0.32, -0.38] },
    { shape: 'box', size: [0.06, 0.64, 0.06], pos: [-0.38, 0.32, 0.38] },
    { shape: 'box', size: [0.06, 0.64, 0.06], pos: [0.38, 0.32, 0.38] },
  ],
  mass: 20,
  material: 'wood',
  health: 140,
  breakImpulse: 80,
  breakFx: 'wood',
  debrisColor: '#6a4428',
  pieces: [
    { id: 'plank', pos: [0.2, 0.75, 0], rot: [0, 0, 90] },
    { id: 'plank', pos: [-0.2, 0.75, 0], rot: [0, 0, 90] },
    { id: 'chair_leg', pos: [0.38, 0.33, 0.38] },
    { id: 'chair_leg', pos: [-0.38, 0.33, -0.38] },
  ],
  carry: true,
});

def({
  id: 'table_long',
  name: 'Long Table',
  build: (b) => {
    const c = '#7a4e30';
    b.box({ size: [1.9, 0.06, 0.85], pos: [0, 0.75, 0], tile: T.PLANKS, color: c, uvScale: 1.0, stretch: false });
    for (const [x, z] of [
      [-0.85, -0.35],
      [0.85, -0.35],
      [-0.85, 0.35],
      [0.85, 0.35],
    ])
      b.box({ size: [0.08, 0.72, 0.08], pos: [x, 0.36, z], tile: T.WOOD_DARK, color: c });
    b.box({ size: [1.6, 0.06, 0.05], pos: [0, 0.2, 0], tile: T.WOOD_DARK, color: c });
  },
  colliders: [
    { shape: 'box', size: [1.9, 0.08, 0.85], pos: [0, 0.74, 0] },
    { shape: 'box', size: [0.08, 0.7, 0.08], pos: [-0.85, 0.35, -0.35] },
    { shape: 'box', size: [0.08, 0.7, 0.08], pos: [0.85, 0.35, -0.35] },
    { shape: 'box', size: [0.08, 0.7, 0.08], pos: [-0.85, 0.35, 0.35] },
    { shape: 'box', size: [0.08, 0.7, 0.08], pos: [0.85, 0.35, 0.35] },
  ],
  mass: 38,
  material: 'wood',
  health: 220,
  breakImpulse: 120,
  breakFx: 'wood',
  debrisColor: '#6a4428',
  pieces: [
    { id: 'plank', pos: [0.4, 0.75, 0], rot: [0, 0, 90] },
    { id: 'plank', pos: [-0.4, 0.75, 0], rot: [0, 0, 90] },
    { id: 'plank', pos: [0, 0.75, 0.2], rot: [0, 0, 90] },
    { id: 'chair_leg', pos: [0.85, 0.36, 0.35] },
  ],
  carry: true,
});

def({
  id: 'couch',
  name: 'Couch',
  variants: 2,
  build: (b, v) => {
    const c = v ? '#6a1418' : '#3a2a5a';
    b.box({ size: [1.9, 0.42, 0.82], pos: [0, 0.21, 0], tile: T.VINYL, color: c, uvScale: 0.6 });
    b.box({ size: [1.9, 0.5, 0.2], pos: [0, 0.66, -0.31], tile: T.VINYL, color: c, uvScale: 0.6 });
    b.box({ size: [0.2, 0.3, 0.82], pos: [-0.85, 0.55, 0], tile: T.VINYL, color: c });
    b.box({ size: [0.2, 0.3, 0.82], pos: [0.85, 0.55, 0], tile: T.VINYL, color: c });
    b.box({ size: [1.5, 0.1, 0.6], pos: [0, 0.46, 0.06], tile: T.VINYL, color: c });
  },
  colliders: [
    { shape: 'box', size: [1.9, 0.5, 0.82], pos: [0, 0.25, 0] },
    { shape: 'box', size: [1.9, 0.5, 0.2], pos: [0, 0.66, -0.31] },
    { shape: 'box', size: [0.2, 0.3, 0.82], pos: [-0.85, 0.55, 0] },
    { shape: 'box', size: [0.2, 0.3, 0.82], pos: [0.85, 0.55, 0] },
  ],
  mass: 70,
  material: 'fabric',
  health: Infinity,
  seat: { height: 0.5, kind: 'couch' },
});

def({
  id: 'coffee_table',
  name: 'Coffee Table',
  build: (b) => {
    b.box({ size: [1.1, 0.04, 0.55], pos: [0, 0.4, 0], tile: T.GLASS, color: '#b8d8d0' });
    b.box({ size: [1.0, 0.04, 0.5], pos: [0, 0.08, 0], tile: T.WOOD_DARK, color: '#3a2418' });
    for (const [x, z] of [
      [-0.5, -0.22],
      [0.5, -0.22],
      [-0.5, 0.22],
      [0.5, 0.22],
    ])
      b.box({ size: [0.04, 0.4, 0.04], pos: [x, 0.2, z], tile: T.CHROME, color: '#c8a040' });
  },
  colliders: [
    { shape: 'box', size: [1.1, 0.06, 0.55], pos: [0, 0.4, 0] },
    { shape: 'box', size: [1.05, 0.34, 0.5], pos: [0, 0.2, 0] },
  ],
  mass: 14,
  material: 'glass',
  health: 40,
  breakImpulse: 25,
  breakFx: 'glass',
  debrisColor: '#c8e8e0',
  pieces: [{ id: 'chair_leg', pos: [0.5, 0.2, 0.22] }],
  carry: true,
});

def({
  id: 'armchair',
  name: 'Armchair',
  build: (b) => {
    const c = '#5a2a14';
    b.box({ size: [0.9, 0.42, 0.85], pos: [0, 0.21, 0], tile: T.LEATHER, color: '#ffffff' });
    b.box({ size: [0.9, 0.55, 0.2], pos: [0, 0.68, -0.33], tile: T.LEATHER, color: '#ffffff' });
    b.box({ size: [0.16, 0.28, 0.85], pos: [-0.37, 0.55, 0], tile: T.LEATHER, color: '#ffffff' });
    b.box({ size: [0.16, 0.28, 0.85], pos: [0.37, 0.55, 0], tile: T.LEATHER, color: '#ffffff' });
    void c;
  },
  colliders: [
    { shape: 'box', size: [0.9, 0.5, 0.85], pos: [0, 0.25, 0] },
    { shape: 'box', size: [0.9, 0.55, 0.2], pos: [0, 0.68, -0.33] },
  ],
  mass: 40,
  material: 'fabric',
  health: Infinity,
  seat: { height: 0.48, kind: 'couch' },
});

// ------------------------------------------------------------------ drinkware
def({
  id: 'bottle',
  name: 'Beer Bottle',
  variants: 4,
  build: (b, v) => {
    const glass = BEER_GLASS[v % 4];
    b.cyl({ radius: 0.032, height: 0.16, pos: [0, 0.08, 0], tile: BEER_LABELS[v % 4], color: '#ffffff', segments: 7, capColor: glass, capTile: T.WHITE });
    b.cyl({ radius: 0.032, radiusTop: 0.013, height: 0.05, pos: [0, 0.185, 0], color: glass, segments: 7 });
    b.cyl({ radius: 0.013, height: 0.045, pos: [0, 0.232, 0], color: glass, segments: 6 });
    b.cyl({ radius: 0.015, height: 0.012, pos: [0, 0.258, 0], tile: T.METAL, color: '#d8c060', segments: 6 });
  },
  colliders: [{ shape: 'cyl', size: [0.032, 0.26], pos: [0, 0.13, 0] }],
  mass: 0.5,
  material: 'glass',
  health: 8,
  breakImpulse: 2.6,
  breakFx: 'glass',
  debrisColor: '#5a3010',
  liquid: 0xd8a030,
  weapon: 'bottle',
  grip: [0, 0.22, 0],
  gripRot: [180, 0, 0],
  interact: 'drink',
  heal: 10,
  small: true,
  ccd: true,
});

def({
  id: 'liquor',
  name: 'Whiskey',
  variants: 4,
  build: (b, v) => {
    const glass = ['#7a4010', '#c8d8d0', '#1a3a1a', '#8a2a1a'][v % 4];
    b.box({ size: [0.075, 0.2, 0.075], pos: [0, 0.1, 0], tile: v % 2 ? T.LABEL_C : T.LABEL_B, color: '#ffffff', faces: { py: { tile: T.WHITE, color: glass }, ny: { tile: T.WHITE, color: glass } } });
    b.cyl({ radius: 0.016, height: 0.08, pos: [0, 0.24, 0], color: glass, segments: 6 });
    b.cyl({ radius: 0.018, height: 0.02, pos: [0, 0.29, 0], color: '#2a2a2a', segments: 6 });
  },
  colliders: [{ shape: 'box', size: [0.075, 0.3, 0.075], pos: [0, 0.15, 0] }],
  mass: 0.9,
  material: 'glass',
  health: 8,
  breakImpulse: 3,
  breakFx: 'glass',
  debrisColor: '#7a4010',
  liquid: 0xb06018,
  weapon: 'liquor',
  grip: [0, 0.26, 0],
  gripRot: [180, 0, 0],
  interact: 'drink',
  heal: 14,
  small: true,
  ccd: true,
});

def({
  id: 'mug',
  name: 'Beer Mug',
  build: (b) => {
    b.cyl({ radius: 0.048, height: 0.15, pos: [0, 0.075, 0], tile: T.GLASS, color: '#e8b040', segments: 8, capTile: T.WHITE, capColor: '#f4f0e0' });
    b.box({ size: [0.025, 0.1, 0.03], pos: [0.065, 0.08, 0], tile: T.GLASS, color: '#d8e8e0' });
    b.box({ size: [0.03, 0.022, 0.03], pos: [0.05, 0.125, 0], tile: T.GLASS, color: '#d8e8e0' });
    b.box({ size: [0.03, 0.022, 0.03], pos: [0.05, 0.035, 0], tile: T.GLASS, color: '#d8e8e0' });
  },
  colliders: [{ shape: 'cyl', size: [0.05, 0.15], pos: [0, 0.075, 0] }],
  mass: 0.8,
  material: 'glass',
  health: 18,
  breakImpulse: 4.5,
  breakFx: 'glass',
  debrisColor: '#d8e8e0',
  liquid: 0xe0a830,
  weapon: 'mug',
  grip: [0.06, 0.08, 0],
  gripRot: [0, 0, 0],
  interact: 'drink',
  heal: 16,
  small: true,
  ccd: true,
});

def({
  id: 'pint',
  name: 'Pint',
  build: (b) => {
    b.cyl({ radius: 0.038, radiusTop: 0.045, height: 0.15, pos: [0, 0.075, 0], tile: T.GLASS, color: '#d89a30', segments: 8, capTile: T.WHITE, capColor: '#f6f2e6' });
  },
  colliders: [{ shape: 'cyl', size: [0.043, 0.15], pos: [0, 0.075, 0] }],
  mass: 0.5,
  material: 'glass',
  health: 6,
  breakImpulse: 2.4,
  breakFx: 'glass',
  debrisColor: '#d8e8e0',
  liquid: 0xd89a30,
  weapon: 'pint',
  grip: [0, 0.07, 0],
  interact: 'drink',
  heal: 12,
  small: true,
  ccd: true,
});

def({
  id: 'shot',
  name: 'Shot Glass',
  build: (b) => {
    b.cyl({ radius: 0.022, radiusTop: 0.026, height: 0.055, pos: [0, 0.0275, 0], tile: T.GLASS, color: '#c87828', segments: 6 });
  },
  colliders: [{ shape: 'cyl', size: [0.025, 0.055], pos: [0, 0.0275, 0] }],
  mass: 0.15,
  material: 'glass',
  health: 4,
  breakImpulse: 1.2,
  breakFx: 'glass',
  debrisColor: '#d8e8e0',
  liquid: 0xc87828,
  weapon: 'shot',
  grip: [0, 0.03, 0],
  interact: 'drink',
  heal: 6,
  small: true,
});

def({
  id: 'ashtray',
  name: 'Ashtray',
  build: (b) => {
    b.cyl({ radius: 0.07, height: 0.035, pos: [0, 0.0175, 0], tile: T.GLASS, color: '#5a7a8a', segments: 8, capColor: '#3a3a3a' });
  },
  colliders: [{ shape: 'cyl', size: [0.07, 0.035], pos: [0, 0.0175, 0] }],
  mass: 0.6,
  material: 'glass',
  health: 12,
  breakImpulse: 5,
  breakFx: 'glass',
  debrisColor: '#5a7a8a',
  weapon: 'ashtray',
  grip: [0, 0.02, 0],
  small: true,
});

def({
  id: 'plate',
  name: 'Plate',
  build: (b) => {
    b.cyl({ radius: 0.12, height: 0.018, pos: [0, 0.009, 0], tile: T.CERAMIC, color: '#ffffff', segments: 10 });
  },
  colliders: [{ shape: 'cyl', size: [0.12, 0.02], pos: [0, 0.01, 0] }],
  mass: 0.5,
  material: 'ceramic',
  health: 5,
  breakImpulse: 2.2,
  breakFx: 'ceramic',
  debrisColor: '#f0eee8',
  weapon: 'plate',
  grip: [0.1, 0.01, 0],
  gripRot: [90, 0, 0],
  small: true,
});

def({
  id: 'ketchup',
  name: 'Ketchup',
  variants: 2,
  build: (b, v) => {
    b.cyl({ radius: 0.025, height: 0.13, pos: [0, 0.065, 0], color: v ? '#e0c020' : '#c01818', segments: 6 });
    b.cyl({ radius: 0.012, radiusTop: 0.004, height: 0.03, pos: [0, 0.145, 0], color: '#f0f0f0', segments: 6 });
  },
  colliders: [{ shape: 'cyl', size: [0.025, 0.16], pos: [0, 0.08, 0] }],
  mass: 0.3,
  material: 'rubber',
  health: Infinity,
  weapon: 'ketchup',
  grip: [0, 0.07, 0],
  small: true,
});

def({
  id: 'napkins',
  name: 'Napkin Holder',
  build: (b) => {
    b.box({ size: [0.12, 0.09, 0.06], pos: [0, 0.045, 0], tile: T.CHROME, color: '#c8c8c8' });
    b.box({ size: [0.1, 0.08, 0.04], pos: [0, 0.06, 0], tile: T.PAPER, color: '#ffffff' });
  },
  colliders: [{ shape: 'box', size: [0.12, 0.1, 0.06], pos: [0, 0.05, 0] }],
  mass: 0.4,
  material: 'metal',
  health: Infinity,
  small: true,
});

def({
  id: 'pool_ball',
  name: 'Pool Ball',
  variants: 16,
  build: (b, v) => {
    const cols = ['#f4f0e6', '#e8c020', '#2040c0', '#c02020', '#6a2a8a', '#e06a10', '#208040', '#7a1a1a', '#111111', '#e8c020', '#2040c0', '#c02020', '#6a2a8a', '#e06a10', '#208040', '#7a1a1a'];
    const stripe = v >= 9;
    b.sphere({ radius: 0.028, color: stripe ? '#f4f0e6' : cols[v], bandColor: stripe ? cols[v] : undefined, lat: 6, lon: 8, pos: [0, 0.028, 0] });
  },
  colliders: [{ shape: 'ball', size: [0.028], pos: [0, 0.028, 0] }],
  mass: 0.17,
  material: 'ceramic',
  health: Infinity,
  weapon: 'pool_ball',
  grip: [0, 0.028, 0],
  restitution: 0.85,
  friction: 0.2,
  small: true,
  ccd: true,
});

def({
  id: 'dart',
  name: 'Dart',
  build: (b) => {
    b.box({ size: [0.006, 0.05, 0.006], pos: [0, 0.025, 0], tile: T.METAL, color: '#c8c8c8' });
    b.box({ size: [0.012, 0.06, 0.012], pos: [0, 0.08, 0], tile: T.METAL, color: '#e8c040' });
    b.box({ size: [0.035, 0.04, 0.002], pos: [0, 0.13, 0], color: '#c02020' });
    b.box({ size: [0.002, 0.04, 0.035], pos: [0, 0.13, 0], color: '#c02020' });
  },
  colliders: [{ shape: 'box', size: [0.02, 0.15, 0.02], pos: [0, 0.075, 0] }],
  mass: 0.03,
  material: 'metal',
  health: Infinity,
  weapon: 'dart',
  grip: [0, 0.08, 0],
  gripRot: [0, 0, 0],
  small: true,
  ccd: true,
});

// ------------------------------------------------------------------ weapons
def({
  id: 'pool_cue',
  name: 'Pool Cue',
  build: (b) => {
    b.cyl({ radius: 0.017, radiusTop: 0.012, height: 0.6, pos: [0, 0.3, 0], tile: T.WOOD_DARK, color: '#5a2a14', segments: 6 });
    b.cyl({ radius: 0.012, radiusTop: 0.0075, height: 0.84, pos: [0, 1.02, 0], tile: T.WOOD_LIGHT, color: '#e8d0a8', segments: 6 });
    b.cyl({ radius: 0.0078, height: 0.02, pos: [0, 1.45, 0], color: '#2060c0', segments: 6 });
  },
  colliders: [{ shape: 'box', size: [0.03, 1.46, 0.03], pos: [0, 0.73, 0] }],
  mass: 0.55,
  material: 'wood',
  health: 40,
  breakImpulse: 30,
  breakFx: 'wood',
  debrisColor: '#d8c098',
  pieces: [
    { id: 'cue_half', pos: [0, 0.35, 0] },
    { id: 'cue_tip', pos: [0, 1.1, 0] },
  ],
  weapon: 'pool_cue',
  grip: [0, 0.18, 0],
  ccd: true,
});
def({
  id: 'cue_half',
  name: 'Snapped Cue',
  build: (b) => {
    b.cyl({ radius: 0.017, radiusTop: 0.012, height: 0.6, pos: [0, 0.3, 0], tile: T.WOOD_DARK, color: '#5a2a14', segments: 6 });
    b.cyl({ radius: 0.012, radiusTop: 0.004, height: 0.12, pos: [0, 0.66, 0], tile: T.WOOD_LIGHT, color: '#e8d0a8', segments: 5 });
  },
  colliders: [{ shape: 'box', size: [0.03, 0.72, 0.03], pos: [0, 0.36, 0] }],
  mass: 0.35,
  material: 'wood',
  health: 30,
  weapon: 'cue_half',
  grip: [0, 0.12, 0],
  ccd: true,
});
def({
  id: 'cue_tip',
  name: 'Cue Tip',
  build: (b) => {
    b.cyl({ radius: 0.011, radiusTop: 0.0075, height: 0.7, pos: [0, 0.35, 0], tile: T.WOOD_LIGHT, color: '#e8d0a8', segments: 5 });
  },
  colliders: [{ shape: 'box', size: [0.024, 0.7, 0.024], pos: [0, 0.35, 0] }],
  mass: 0.2,
  material: 'wood',
  health: 20,
  weapon: 'broom_handle',
  grip: [0, 0.1, 0],
});

def({
  id: 'bat',
  name: 'Baseball Bat',
  build: (b) => {
    b.cyl({ radius: 0.018, height: 0.22, pos: [0, 0.11, 0], tile: T.RUBBER, color: '#ffffff', segments: 6 });
    b.cyl({ radius: 0.022, height: 0.02, pos: [0, -0.005, 0], tile: T.WOOD, color: '#c8a070', segments: 6 });
    b.cyl({ radius: 0.019, radiusTop: 0.034, height: 0.46, pos: [0, 0.45, 0], tile: T.WOOD_LIGHT, color: '#d8b080', segments: 7 });
    b.cyl({ radius: 0.034, radiusTop: 0.03, height: 0.16, pos: [0, 0.76, 0], tile: T.WOOD_LIGHT, color: '#d8b080', segments: 7 });
  },
  colliders: [{ shape: 'cyl', size: [0.032, 0.84], pos: [0, 0.42, 0] }],
  mass: 0.95,
  material: 'wood',
  health: Infinity,
  weapon: 'bat',
  grip: [0, 0.1, 0],
  ccd: true,
});

def({
  id: 'knife',
  name: 'Kitchen Knife',
  build: (b) => {
    b.box({ size: [0.022, 0.1, 0.03], pos: [0, 0.05, 0], tile: T.RUBBER, color: '#ffffff' });
    b.box({ size: [0.008, 0.17, 0.035], pos: [0, 0.185, 0.003], tile: T.CHROME, color: '#e0e4e8' });
    b.box({ size: [0.008, 0.04, 0.018], pos: [0, 0.285, 0.01], tile: T.CHROME, color: '#e0e4e8' });
  },
  colliders: [{ shape: 'box', size: [0.025, 0.3, 0.035], pos: [0, 0.15, 0] }],
  mass: 0.2,
  material: 'metal',
  health: Infinity,
  weapon: 'knife',
  grip: [0, 0.05, 0],
  small: true,
  ccd: true,
});

def({
  id: 'cleaver',
  name: 'Meat Cleaver',
  build: (b) => {
    b.box({ size: [0.024, 0.11, 0.03], pos: [0, 0.055, 0], tile: T.WOOD_DARK, color: '#ffffff' });
    b.box({ size: [0.008, 0.16, 0.1], pos: [0, 0.19, 0.035], tile: T.CHROME, color: '#d0d4d8' });
  },
  colliders: [{ shape: 'box', size: [0.025, 0.27, 0.1], pos: [0, 0.135, 0.02] }],
  mass: 0.55,
  material: 'metal',
  health: Infinity,
  weapon: 'cleaver',
  grip: [0, 0.05, 0],
  gripRot: [0, 90, 0],
  small: true,
  ccd: true,
});

def({
  id: 'pan',
  name: 'Frying Pan',
  build: (b) => {
    b.box({ size: [0.03, 0.22, 0.02], pos: [0, 0.11, 0], tile: T.RUBBER, color: '#ffffff' });
    b.cyl({ radius: 0.13, height: 0.035, pos: [0, 0.35, 0], rot: [90, 0, 0], tile: T.METAL, color: '#3a3a3e', segments: 10, capColor: '#2a2a2e' });
  },
  colliders: [
    { shape: 'box', size: [0.03, 0.22, 0.03], pos: [0, 0.11, 0] },
    { shape: 'cyl', size: [0.13, 0.04], pos: [0, 0.35, 0], rot: [90, 0, 0] },
  ],
  mass: 1.4,
  material: 'metal',
  health: Infinity,
  weapon: 'pan',
  grip: [0, 0.05, 0],
  gripRot: [0, 90, 0],
});

def({
  id: 'rolling_pin',
  name: 'Rolling Pin',
  build: (b) => {
    b.cyl({ radius: 0.012, height: 0.08, pos: [0, 0.04, 0], tile: T.WOOD, color: '#c09060', segments: 6 });
    b.cyl({ radius: 0.03, height: 0.3, pos: [0, 0.23, 0], tile: T.WOOD_LIGHT, color: '#e0c090', segments: 8 });
    b.cyl({ radius: 0.012, height: 0.08, pos: [0, 0.42, 0], tile: T.WOOD, color: '#c09060', segments: 6 });
  },
  colliders: [{ shape: 'cyl', size: [0.03, 0.46], pos: [0, 0.23, 0] }],
  mass: 0.7,
  material: 'wood',
  health: Infinity,
  weapon: 'rolling_pin',
  grip: [0, 0.04, 0],
});

def({
  id: 'guitar',
  name: 'Electric Guitar',
  build: (b) => {
    // neck along +Y; held by the neck, body is the business end
    b.box({ size: [0.05, 0.62, 0.03], pos: [0, 0.31, 0], tile: T.WOOD, color: '#c09060' });
    b.box({ size: [0.08, 0.16, 0.035], pos: [0, -0.06, 0], tile: T.WOOD_DARK, color: '#2a1a12' });
    b.box({ size: [0.36, 0.42, 0.05], pos: [0, 0.82, 0], tile: T.GUITAR, color: '#ffffff', faces: { nz: { tile: T.WHITE, color: '#a01818' } } });
    b.box({ size: [0.14, 0.12, 0.05], pos: [0.14, 0.68, 0], tile: T.WHITE, color: '#c02020' });
  },
  colliders: [
    { shape: 'box', size: [0.06, 0.7, 0.04], pos: [0, 0.28, 0] },
    { shape: 'box', size: [0.36, 0.44, 0.06], pos: [0, 0.82, 0] },
  ],
  mass: 3.8,
  material: 'wood',
  health: 40,
  breakImpulse: 40,
  breakFx: 'wood',
  debrisColor: '#c02020',
  pieces: [{ id: 'guitar_neck', pos: [0, 0.3, 0] }],
  weapon: 'guitar',
  grip: [0, 0.1, 0],
});
def({
  id: 'guitar_neck',
  name: 'Guitar Neck',
  build: (b) => {
    b.box({ size: [0.05, 0.62, 0.03], pos: [0, 0.31, 0], tile: T.WOOD, color: '#c09060' });
    b.box({ size: [0.08, 0.16, 0.035], pos: [0, -0.06, 0], tile: T.WOOD_DARK, color: '#2a1a12' });
    b.box({ size: [0.12, 0.08, 0.05], pos: [0, 0.64, 0], tile: T.WHITE, color: '#a01818' });
  },
  colliders: [{ shape: 'box', size: [0.08, 0.84, 0.05], pos: [0, 0.28, 0] }],
  mass: 0.8,
  material: 'wood',
  health: 30,
  weapon: 'guitar_neck',
  grip: [0, 0.1, 0],
});

def({
  id: 'mic_stand',
  name: 'Mic Stand',
  build: (b) => {
    b.cyl({ radius: 0.012, height: 1.5, pos: [0, 0.75, 0], tile: T.METAL, color: '#2a2a2e', segments: 6 });
    b.cyl({ radius: 0.16, height: 0.03, pos: [0, 0.015, 0], tile: T.METAL, color: '#2a2a2e', segments: 8 });
    b.cyl({ radius: 0.024, height: 0.12, pos: [0, 1.56, 0.04], rot: [30, 0, 0], tile: T.GRILL, color: '#c8c8c8', segments: 6 });
  },
  colliders: [
    { shape: 'cyl', size: [0.16, 0.04], pos: [0, 0.02, 0] },
    { shape: 'box', size: [0.03, 1.6, 0.03], pos: [0, 0.8, 0] },
  ],
  mass: 3.5,
  material: 'metal',
  health: Infinity,
  weapon: 'mic_stand',
  grip: [0, 1.0, 0],
  gripRot: [180, 0, 0],
});

def({
  id: 'extinguisher',
  name: 'Fire Extinguisher',
  build: (b) => {
    b.cyl({ radius: 0.07, height: 0.42, pos: [0, 0.21, 0], tile: T.WHITE, color: '#c81818', segments: 8 });
    b.cyl({ radius: 0.03, height: 0.06, pos: [0, 0.45, 0], tile: T.METAL, color: '#2a2a2a', segments: 6 });
    b.box({ size: [0.12, 0.02, 0.03], pos: [0.03, 0.49, 0], tile: T.METAL, color: '#2a2a2a' });
    b.box({ size: [0.09, 0.08, 0.002], pos: [0, 0.24, 0.071], tile: T.PAPER, color: '#ffffff' });
  },
  colliders: [{ shape: 'cyl', size: [0.07, 0.5], pos: [0, 0.25, 0] }],
  mass: 6,
  material: 'metal',
  health: Infinity,
  weapon: 'extinguisher',
  grip: [0, 0.47, 0],
  gripRot: [180, 0, 0],
});

def({
  id: 'wrench',
  name: 'Wrench',
  build: (b) => {
    b.box({ size: [0.03, 0.32, 0.012], pos: [0, 0.16, 0], tile: T.CHROME, color: '#b8bcc0' });
    b.box({ size: [0.07, 0.05, 0.014], pos: [0, 0.34, 0], tile: T.CHROME, color: '#b8bcc0' });
  },
  colliders: [{ shape: 'box', size: [0.07, 0.38, 0.02], pos: [0, 0.19, 0] }],
  mass: 0.8,
  material: 'metal',
  health: Infinity,
  weapon: 'wrench',
  grip: [0, 0.06, 0],
  small: true,
});

def({
  id: 'tire_iron',
  name: 'Tire Iron',
  build: (b) => {
    b.cyl({ radius: 0.011, height: 0.55, pos: [0, 0.275, 0], tile: T.METAL, color: '#4a4a4e', segments: 6 });
    b.box({ size: [0.022, 0.08, 0.022], pos: [0.03, 0.56, 0], rot: [0, 0, 50], tile: T.METAL, color: '#4a4a4e' });
  },
  colliders: [{ shape: 'box', size: [0.03, 0.6, 0.03], pos: [0, 0.3, 0] }],
  mass: 1.1,
  material: 'metal',
  health: Infinity,
  weapon: 'tire_iron',
  grip: [0, 0.06, 0],
});

def({
  id: 'chain',
  name: 'Bike Chain',
  build: (b) => {
    for (let i = 0; i < 9; i++) b.box({ size: [0.03, 0.05, 0.012], pos: [0, 0.03 + i * 0.045, 0], rot: [0, i % 2 ? 90 : 0, 0], tile: T.CHROME, color: '#8a8a90' });
  },
  colliders: [{ shape: 'box', size: [0.04, 0.42, 0.04], pos: [0, 0.21, 0] }],
  mass: 0.9,
  material: 'metal',
  health: Infinity,
  weapon: 'chain',
  grip: [0, 0.04, 0],
  small: true,
});

def({
  id: 'sledgehammer',
  name: 'Sledgehammer',
  build: (b) => {
    b.cyl({ radius: 0.019, height: 0.9, pos: [0, 0.45, 0], tile: T.WOOD_LIGHT, color: '#c8a070', segments: 6 });
    b.box({ size: [0.11, 0.11, 0.26], pos: [0, 0.92, 0], tile: T.METAL, color: '#3a3a3e' });
  },
  colliders: [
    { shape: 'box', size: [0.04, 0.9, 0.04], pos: [0, 0.45, 0] },
    { shape: 'box', size: [0.11, 0.11, 0.26], pos: [0, 0.92, 0] },
  ],
  mass: 6,
  material: 'metal',
  health: Infinity,
  weapon: 'sledgehammer',
  grip: [0, 0.1, 0],
});

def({
  id: 'broom',
  name: 'Broom',
  build: (b) => {
    b.cyl({ radius: 0.012, height: 1.2, pos: [0, 0.6, 0], tile: T.WOOD_LIGHT, color: '#d8b880', segments: 5 });
    b.box({ size: [0.3, 0.05, 0.05], pos: [0, 1.22, 0], tile: T.WOOD, color: '#8a5a30' });
    b.box({ size: [0.28, 0.12, 0.04], pos: [0, 1.31, 0], tile: T.FABRIC, color: '#d8c070' });
  },
  colliders: [
    { shape: 'box', size: [0.03, 1.22, 0.03], pos: [0, 0.61, 0] },
    { shape: 'box', size: [0.3, 0.17, 0.05], pos: [0, 1.28, 0] },
  ],
  mass: 1.1,
  material: 'wood',
  health: 25,
  breakImpulse: 30,
  breakFx: 'wood',
  debrisColor: '#d8b880',
  pieces: [{ id: 'cue_tip', pos: [0, 0.4, 0] }],
  weapon: 'broom',
  grip: [0, 0.25, 0],
});

def({
  id: 'mop',
  name: 'Mop',
  build: (b) => {
    b.cyl({ radius: 0.012, height: 1.2, pos: [0, 0.6, 0], tile: T.WOOD_LIGHT, color: '#c8c8c8', segments: 5 });
    b.box({ size: [0.18, 0.16, 0.18], pos: [0, 1.28, 0], tile: T.FABRIC, color: '#e8e0d0' });
  },
  colliders: [
    { shape: 'box', size: [0.03, 1.22, 0.03], pos: [0, 0.61, 0] },
    { shape: 'box', size: [0.18, 0.16, 0.18], pos: [0, 1.28, 0] },
  ],
  mass: 1.3,
  material: 'wood',
  health: 25,
  breakImpulse: 30,
  breakFx: 'wood',
  debrisColor: '#c8c8c8',
  pieces: [{ id: 'cue_tip', pos: [0, 0.4, 0] }],
  weapon: 'mop',
  grip: [0, 0.25, 0],
});

def({
  id: 'tray',
  name: 'Serving Tray',
  build: (b) => {
    b.cyl({ radius: 0.2, height: 0.015, pos: [0, 0.2, 0], rot: [90, 0, 0], tile: T.CHROME, color: '#d0d0d4', segments: 12 });
  },
  colliders: [{ shape: 'cyl', size: [0.2, 0.02], pos: [0, 0.2, 0], rot: [90, 0, 0] }],
  mass: 0.7,
  material: 'metal',
  health: Infinity,
  weapon: 'tray',
  grip: [0, 0.02, 0],
  small: true,
});

def({
  id: 'trophy',
  name: 'Trophy',
  build: (b) => {
    b.box({ size: [0.12, 0.06, 0.12], pos: [0, 0.03, 0], tile: T.WOOD_DARK, color: '#ffffff' });
    b.cyl({ radius: 0.015, height: 0.12, pos: [0, 0.12, 0], tile: T.BRASS, color: '#ffffff', segments: 6 });
    b.cyl({ radius: 0.07, radiusTop: 0.09, height: 0.12, pos: [0, 0.24, 0], tile: T.BRASS, color: '#ffffff', segments: 8 });
  },
  colliders: [{ shape: 'box', size: [0.14, 0.3, 0.14], pos: [0, 0.15, 0] }],
  mass: 1.5,
  material: 'metal',
  health: Infinity,
  weapon: 'trophy',
  grip: [0, 0.12, 0],
  gripRot: [0, 0, 0],
});

// ------------------------------------------------------------------ debris pieces
def({
  id: 'chair_leg',
  name: 'Chair Leg',
  build: (b) => {
    b.box({ size: [0.045, 0.46, 0.045], pos: [0, 0.23, 0], tile: T.WOOD_DARK, color: '#7a4a2a' });
    b.box({ size: [0.05, 0.04, 0.05], pos: [0.006, 0.47, 0.004], rot: [0, 0, 18], tile: T.WOOD_DARK, color: '#5a3a20' });
  },
  colliders: [{ shape: 'box', size: [0.05, 0.48, 0.05], pos: [0, 0.24, 0] }],
  mass: 0.5,
  material: 'wood',
  health: 30,
  weapon: 'chair_leg',
  grip: [0, 0.06, 0],
});
def({
  id: 'stool_leg',
  name: 'Steel Leg',
  build: (b) => {
    b.box({ size: [0.03, 0.74, 0.03], pos: [0, 0.37, 0], tile: T.CHROME, color: '#a8a8b0' });
  },
  colliders: [{ shape: 'box', size: [0.035, 0.74, 0.035], pos: [0, 0.37, 0] }],
  mass: 0.9,
  material: 'metal',
  health: Infinity,
  weapon: 'stool_leg',
  grip: [0, 0.08, 0],
});
def({
  id: 'stool_seat',
  name: 'Stool Seat',
  build: (b) => {
    b.cyl({ radius: 0.19, height: 0.07, pos: [0, 0.035, 0], tile: T.CUSHION, color: '#7a2a1a', segments: 10 });
  },
  colliders: [{ shape: 'cyl', size: [0.19, 0.07], pos: [0, 0.035, 0] }],
  mass: 1.2,
  material: 'fabric',
  health: Infinity,
  small: true,
});
def({
  id: 'plank',
  name: 'Plank',
  build: (b) => {
    b.box({ size: [0.12, 0.85, 0.035], pos: [0, 0.425, 0], tile: T.PLANKS, color: '#8a5a36' });
  },
  colliders: [{ shape: 'box', size: [0.12, 0.85, 0.04], pos: [0, 0.425, 0] }],
  mass: 1.4,
  material: 'wood',
  health: 30,
  weapon: 'plank',
  grip: [0, 0.1, 0],
});
def({
  id: 'plank_small',
  name: 'Seat',
  build: (b) => {
    b.box({ size: [0.42, 0.05, 0.4], pos: [0, 0.025, 0], tile: T.WOOD, color: '#7a4a2a' });
  },
  colliders: [{ shape: 'box', size: [0.42, 0.05, 0.4], pos: [0, 0.025, 0] }],
  mass: 1.2,
  material: 'wood',
  health: 20,
  small: true,
});
def({
  id: 'broken_bottle',
  name: 'Broken Bottle',
  variants: 4,
  build: (b, v) => {
    const glass = BEER_GLASS[v % 4];
    b.cyl({ radius: 0.013, height: 0.06, pos: [0, 0.03, 0], color: glass, segments: 6 });
    b.cyl({ radius: 0.013, radiusTop: 0.03, height: 0.05, pos: [0, 0.085, 0], color: glass, segments: 7 });
    b.box({ size: [0.02, 0.06, 0.006], pos: [0.015, 0.14, 0.02], rot: [0, 30, 10], color: glass });
    b.box({ size: [0.02, 0.045, 0.006], pos: [-0.018, 0.13, -0.01], rot: [0, -40, -12], color: glass });
  },
  colliders: [{ shape: 'cyl', size: [0.028, 0.17], pos: [0, 0.085, 0] }],
  mass: 0.25,
  material: 'glass',
  health: Infinity,
  weapon: 'broken_bottle',
  grip: [0, 0.03, 0],
  small: true,
});

// ------------------------------------------------------------------ containers & clutter
def({
  id: 'crate',
  name: 'Crate',
  build: (b) => {
    b.box({ size: [0.55, 0.45, 0.45], pos: [0, 0.225, 0], tile: T.CRATE, color: '#ffffff', stretch: true });
  },
  colliders: [{ shape: 'box', size: [0.55, 0.45, 0.45], pos: [0, 0.225, 0] }],
  mass: 9,
  material: 'wood',
  health: 50,
  breakImpulse: 40,
  breakFx: 'wood',
  debrisColor: '#a07a48',
  pieces: [
    { id: 'plank', pos: [0, 0.22, 0], rot: [0, 0, 90] },
    { id: 'bottle', pos: [0.1, 0.1, 0] },
    { id: 'bottle', pos: [-0.1, 0.1, 0.1] },
  ],
  carry: true,
});
def({
  id: 'crate_beer',
  name: 'Beer Crate',
  build: (b) => {
    b.box({ size: [0.42, 0.25, 0.3], pos: [0, 0.125, 0], tile: T.WHITE, color: '#2a6a2a' });
    for (let i = 0; i < 6; i++) b.cyl({ radius: 0.03, height: 0.08, pos: [-0.13 + (i % 3) * 0.13, 0.29, -0.07 + Math.floor(i / 3) * 0.14], color: '#4a2a10', segments: 6 });
  },
  colliders: [{ shape: 'box', size: [0.42, 0.33, 0.3], pos: [0, 0.165, 0] }],
  mass: 8,
  material: 'plastic',
  health: 40,
  breakImpulse: 35,
  breakFx: 'glass',
  debrisColor: '#4a2a10',
  liquid: 0xd8a030,
  pieces: [
    { id: 'bottle', pos: [-0.1, 0.15, 0] },
    { id: 'bottle', pos: [0.1, 0.15, 0] },
  ],
  carry: true,
});
def({
  id: 'keg',
  name: 'Keg',
  build: (b) => {
    b.cyl({ radius: 0.2, height: 0.58, pos: [0, 0.29, 0], tile: T.KEG, color: '#ffffff', segments: 10, capTile: T.METAL });
    b.cyl({ radius: 0.04, height: 0.06, pos: [0, 0.61, 0], tile: T.CHROME, color: '#d8d8d8', segments: 6 });
  },
  colliders: [{ shape: 'cyl', size: [0.2, 0.6], pos: [0, 0.3, 0] }],
  mass: 45,
  material: 'metal',
  health: Infinity,
  carry: true,
});
def({
  id: 'barrel',
  name: 'Barrel',
  build: (b) => {
    b.cyl({ radius: 0.27, height: 0.85, pos: [0, 0.425, 0], tile: T.BARREL, color: '#ffffff', segments: 10, capTile: T.WOOD_DARK });
  },
  colliders: [{ shape: 'cyl', size: [0.27, 0.85], pos: [0, 0.425, 0] }],
  mass: 55,
  material: 'wood',
  health: 150,
  breakImpulse: 100,
  breakFx: 'wood',
  debrisColor: '#8a5a30',
  liquid: 0xd8a030,
  pieces: [
    { id: 'plank', pos: [0.1, 0.4, 0] },
    { id: 'plank', pos: [-0.1, 0.4, 0] },
  ],
});
def({
  id: 'trash_can',
  name: 'Trash Can',
  build: (b) => {
    b.cyl({ radius: 0.22, radiusTop: 0.24, height: 0.62, pos: [0, 0.31, 0], tile: T.METAL, color: '#8a9090', segments: 10, capColor: '#2a2a2a' });
    b.cyl({ radius: 0.25, height: 0.04, pos: [0, 0.64, 0], tile: T.METAL, color: '#7a8080', segments: 10 });
  },
  colliders: [{ shape: 'cyl', size: [0.24, 0.66], pos: [0, 0.33, 0] }],
  mass: 6,
  material: 'metal',
  health: Infinity,
  carry: true,
});
def({
  id: 'box',
  name: 'Box',
  build: (b) => {
    b.box({ size: [0.4, 0.32, 0.36], pos: [0, 0.16, 0], tile: T.CARDBOARD, color: '#ffffff', stretch: true });
  },
  colliders: [{ shape: 'box', size: [0.4, 0.32, 0.36], pos: [0, 0.16, 0] }],
  mass: 3,
  material: 'paper',
  health: 15,
  breakImpulse: 22,
  breakFx: 'paper',
  debrisColor: '#b8905a',
  carry: true,
});
def({
  id: 'bucket',
  name: 'Bucket',
  build: (b) => {
    b.cyl({ radius: 0.14, radiusTop: 0.16, height: 0.3, pos: [0, 0.15, 0], tile: T.WHITE, color: '#3070c0', segments: 8, capColor: '#5a7a8a' });
  },
  colliders: [{ shape: 'cyl', size: [0.16, 0.3], pos: [0, 0.15, 0] }],
  mass: 2,
  material: 'plastic',
  health: Infinity,
  carry: true,
});
def({
  id: 'register',
  name: 'Cash Register',
  build: (b) => {
    b.box({ size: [0.42, 0.14, 0.4], pos: [0, 0.07, 0], tile: T.METAL, color: '#3a3a3a' });
    b.box({ size: [0.4, 0.14, 0.24], pos: [0, 0.2, -0.05], rot: [-20, 0, 0], tile: T.REGISTER, color: '#ffffff', faces: { nz: { tile: T.METAL, color: '#3a3a3a' } } });
    b.box({ size: [0.2, 0.12, 0.06], pos: [0, 0.34, -0.14], tile: T.METAL, color: '#2a2a2a', faces: { pz: { tile: T.TV, color: '#ffffff' } } });
  },
  colliders: [{ shape: 'box', size: [0.42, 0.4, 0.4], pos: [0, 0.2, 0] }],
  mass: 14,
  material: 'metal',
  health: Infinity,
  weapon: 'register',
  grip: [0, 0.2, 0.2],
  interact: 'register',
});
def({
  id: 'speaker',
  name: 'Speaker',
  build: (b) => {
    b.box({ size: [0.5, 0.75, 0.4], pos: [0, 0.375, 0], tile: T.WHITE, color: '#1a1a1a', faces: { pz: { tile: T.SPEAKER, color: '#ffffff' } }, stretch: true });
  },
  colliders: [{ shape: 'box', size: [0.5, 0.75, 0.4], pos: [0, 0.375, 0] }],
  mass: 22,
  material: 'wood',
  health: 90,
  breakImpulse: 90,
  breakFx: 'plastic',
  debrisColor: '#1a1a1a',
  carry: true,
});
def({
  id: 'amp',
  name: 'Amplifier',
  build: (b) => {
    b.box({ size: [0.55, 0.45, 0.3], pos: [0, 0.225, 0], tile: T.WHITE, color: '#222222', faces: { pz: { tile: T.GRILL, color: '#ffffff' } }, stretch: true });
    b.box({ size: [0.5, 0.06, 0.02], pos: [0, 0.4, 0.15], tile: T.BRASS, color: '#ffffff' });
  },
  colliders: [{ shape: 'box', size: [0.55, 0.45, 0.3], pos: [0, 0.225, 0] }],
  mass: 14,
  material: 'wood',
  health: 70,
  breakImpulse: 70,
  breakFx: 'plastic',
  debrisColor: '#222222',
  carry: true,
});
def({
  id: 'drum',
  name: 'Drum',
  variants: 2,
  build: (b, v) => {
    if (v === 0) b.cyl({ radius: 0.28, height: 0.4, pos: [0, 0.28, 0], rot: [90, 0, 0], tile: T.DRUM, color: '#ffffff', segments: 12, capTile: T.CERAMIC });
    else b.cyl({ radius: 0.18, height: 0.16, pos: [0, 0.6, 0], tile: T.DRUM, color: '#ffffff', segments: 10, capTile: T.CERAMIC });
    if (v === 1) {
      b.cyl({ radius: 0.012, height: 0.52, pos: [0, 0.26, 0], tile: T.CHROME, color: '#c8c8c8', segments: 5 });
    }
  },
  colliders: [{ shape: 'cyl', size: [0.28, 0.56], pos: [0, 0.28, 0] }],
  mass: 6,
  material: 'wood',
  health: 40,
  breakImpulse: 40,
  breakFx: 'wood',
  debrisColor: '#2050c0',
  carry: true,
});
def({
  id: 'cymbal',
  name: 'Cymbal',
  build: (b) => {
    b.cyl({ radius: 0.012, height: 1.1, pos: [0, 0.55, 0], tile: T.CHROME, color: '#c8c8c8', segments: 5 });
    b.cyl({ radius: 0.2, radiusTop: 0.02, height: 0.03, pos: [0, 1.12, 0], tile: T.BRASS, color: '#ffffff', segments: 12 });
    b.cyl({ radius: 0.15, height: 0.02, pos: [0, 0.01, 0], tile: T.METAL, color: '#2a2a2a', segments: 6 });
  },
  colliders: [
    { shape: 'cyl', size: [0.15, 0.03], pos: [0, 0.015, 0] },
    { shape: 'box', size: [0.03, 1.1, 0.03], pos: [0, 0.55, 0] },
    { shape: 'cyl', size: [0.2, 0.03], pos: [0, 1.12, 0] },
  ],
  mass: 4,
  material: 'metal',
  health: Infinity,
  weapon: 'mic_stand',
  grip: [0, 0.9, 0],
  gripRot: [180, 0, 0],
});
def({
  id: 'plant',
  name: 'Potted Plant',
  build: (b) => {
    b.cyl({ radius: 0.16, radiusTop: 0.19, height: 0.32, pos: [0, 0.16, 0], tile: T.CERAMIC, color: '#b8603a', segments: 8 });
    b.box({ size: [0.36, 0.38, 0.36], pos: [0, 0.52, 0], tile: T.PLANT, color: '#ffffff' });
    b.box({ size: [0.24, 0.26, 0.24], pos: [0.04, 0.8, -0.02], tile: T.PLANT, color: '#ffffff' });
  },
  colliders: [
    { shape: 'cyl', size: [0.19, 0.34], pos: [0, 0.17, 0] },
    { shape: 'box', size: [0.36, 0.6, 0.36], pos: [0, 0.62, 0] },
  ],
  mass: 9,
  material: 'ceramic',
  health: 20,
  breakImpulse: 25,
  breakFx: 'ceramic',
  debrisColor: '#b8603a',
  carry: true,
});
def({
  id: 'menu_board',
  name: 'Sign',
  build: (b) => {
    b.box({ size: [0.55, 0.85, 0.03], pos: [0, 0.45, 0.12], rot: [-12, 0, 0], tile: T.CHALK, color: '#ffffff', faces: { nz: { tile: T.WOOD_DARK, color: '#5a3a24' } }, stretch: true });
    b.box({ size: [0.55, 0.85, 0.03], pos: [0, 0.45, -0.12], rot: [12, 0, 0], tile: T.CHALK, color: '#ffffff', faces: { pz: { tile: T.WOOD_DARK, color: '#5a3a24' } }, stretch: true });
  },
  colliders: [{ shape: 'box', size: [0.56, 0.86, 0.3], pos: [0, 0.43, 0] }],
  mass: 5,
  material: 'wood',
  health: 30,
  breakImpulse: 30,
  breakFx: 'wood',
  debrisColor: '#1e2a24',
  pieces: [{ id: 'plank', pos: [0, 0.4, 0] }],
  carry: true,
});
def({
  id: 'file_cabinet',
  name: 'File Cabinet',
  build: (b) => {
    b.box({ size: [0.48, 1.2, 0.6], pos: [0, 0.6, 0], tile: T.METAL, color: '#7a8a8a', faces: { pz: { tile: T.FILE_CABINET, color: '#ffffff' } }, stretch: true });
  },
  colliders: [{ shape: 'box', size: [0.48, 1.2, 0.6], pos: [0, 0.6, 0] }],
  mass: 55,
  material: 'metal',
  health: Infinity,
});
def({
  id: 'office_chair',
  name: 'Office Chair',
  build: (b) => {
    b.box({ size: [0.5, 0.08, 0.48], pos: [0, 0.5, 0], tile: T.LEATHER, color: '#ffffff' });
    b.box({ size: [0.48, 0.6, 0.08], pos: [0, 0.85, -0.22], tile: T.LEATHER, color: '#ffffff' });
    b.cyl({ radius: 0.03, height: 0.4, pos: [0, 0.27, 0], tile: T.CHROME, color: '#c8c8c8', segments: 6 });
    b.box({ size: [0.55, 0.04, 0.06], pos: [0, 0.05, 0], tile: T.METAL, color: '#2a2a2a' });
    b.box({ size: [0.06, 0.04, 0.55], pos: [0, 0.05, 0], tile: T.METAL, color: '#2a2a2a' });
  },
  colliders: [
    { shape: 'box', size: [0.5, 0.1, 0.48], pos: [0, 0.5, 0] },
    { shape: 'box', size: [0.48, 0.6, 0.08], pos: [0, 0.85, -0.22] },
    { shape: 'box', size: [0.5, 0.45, 0.5], pos: [0, 0.23, 0] },
  ],
  mass: 12,
  material: 'fabric',
  health: 80,
  breakImpulse: 60,
  breakFx: 'plastic',
  debrisColor: '#4a2e1e',
  weapon: 'chair',
  grip: [0, 1.05, -0.22],
  gripRot: [180, 0, 0],
  seat: { height: 0.52, kind: 'chair' },
});
def({
  id: 'phone',
  name: 'Telephone',
  build: (b) => {
    b.box({ size: [0.2, 0.08, 0.2], pos: [0, 0.04, 0], tile: T.WHITE, color: '#8a1a1a' });
    b.box({ size: [0.22, 0.05, 0.06], pos: [0, 0.1, 0], tile: T.WHITE, color: '#7a1414' });
  },
  colliders: [{ shape: 'box', size: [0.22, 0.13, 0.2], pos: [0, 0.065, 0] }],
  mass: 1.2,
  material: 'plastic',
  health: Infinity,
  weapon: 'phone',
  grip: [0, 0.06, 0],
  small: true,
});

// ------------------------------------------------------------------ big interactive machines
def({
  id: 'arcade',
  name: 'Arcade Machine',
  variants: 2,
  build: (b, v) => {
    const body = v ? '#1a1a6a' : '#6a1a1a';
    b.box({ size: [0.72, 1.85, 0.75], pos: [0, 0.925, 0], tile: T.ARCADE_SIDE, color: '#ffffff', faces: { pz: { tile: T.WHITE, color: body }, nz: { tile: T.WHITE, color: '#151515' }, py: { tile: T.WHITE, color: body } }, stretch: true });
    b.box({ size: [0.62, 0.48, 0.05], pos: [0, 1.35, 0.33], rot: [-12, 0, 0], tile: v ? T.ARCADE_SCREEN2 : T.ARCADE_SCREEN, color: '#ffffff', faces: { pz: { tile: v ? T.ARCADE_SCREEN2 : T.ARCADE_SCREEN, color: '#ffffff', emissive: true } }, stretch: true });
    b.box({ size: [0.7, 0.08, 0.32], pos: [0, 1.0, 0.45], rot: [12, 0, 0], tile: T.WHITE, color: '#2a2a2a' });
    b.box({ size: [0.04, 0.06, 0.04], pos: [-0.15, 1.06, 0.48], color: '#c02020' });
    b.box({ size: [0.03, 0.03, 0.03], pos: [0.05, 1.05, 0.48], color: '#f0d020' });
    b.box({ size: [0.03, 0.03, 0.03], pos: [0.12, 1.05, 0.48], color: '#2060f0' });
    b.box({ size: [0.66, 0.16, 0.04], pos: [0, 1.75, 0.37], tile: T.NEON, color: v ? '#40a0ff' : '#ff4040', faces: { pz: { tile: T.NEON, color: v ? '#40a0ff' : '#ff4040', emissive: true } } });
  },
  colliders: [{ shape: 'box', size: [0.72, 1.85, 0.75], pos: [0, 0.925, 0] }],
  mass: 120,
  material: 'wood',
  health: Infinity,
  interact: 'arcade',
});
def({
  id: 'pinball',
  name: 'Pinball',
  build: (b) => {
    b.box({ size: [0.75, 0.32, 1.4], pos: [0, 0.95, 0], rot: [-5, 0, 0], tile: T.PINBALL, color: '#ffffff', faces: { py: { tile: T.PINBALL, color: '#ffffff', emissive: true } }, stretch: true });
    b.box({ size: [0.75, 0.75, 0.12], pos: [0, 1.45, -0.65], tile: T.PINBALL, color: '#ffffff', faces: { pz: { tile: T.PINBALL, color: '#ffffff', emissive: true } }, stretch: true });
    for (const [x, z] of [
      [-0.32, -0.6],
      [0.32, -0.6],
      [-0.32, 0.6],
      [0.32, 0.6],
    ])
      b.box({ size: [0.05, 0.82, 0.05], pos: [x, 0.41, z], tile: T.CHROME, color: '#c8c8c8' });
  },
  colliders: [
    { shape: 'box', size: [0.75, 0.32, 1.4], pos: [0, 0.95, 0] },
    { shape: 'box', size: [0.75, 0.75, 0.12], pos: [0, 1.45, -0.65] },
    { shape: 'box', size: [0.7, 0.8, 1.3], pos: [0, 0.4, 0] },
  ],
  mass: 110,
  material: 'wood',
  health: Infinity,
  interact: 'pinball',
});
