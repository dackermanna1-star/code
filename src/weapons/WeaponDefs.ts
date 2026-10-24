import type { DamageType } from '../game/Combat';

export interface WeaponDef {
  id: string;
  name: string;
  damage: number;
  force: number;
  reach: number;
  /** animation speed multiplier (handling) */
  speed: number;
  type: DamageType;
  twoHanded: boolean;
  heavy: boolean;
  /** hits before it breaks (Infinity = unbreakable) */
  durability: number;
  /** player viewmodel moves cycled per click */
  moves: string[];
  /** NPC third-person actions */
  npcMoves: string[];
  arc: [number, number];
  arcPitch: [number, number];
  dismember: number;
  bleed: number;
  carve: number;
  stun: number;
  /** number of targets one swing can pass through */
  cleave: number;
  /** thrown */
  throwDamage: number;
  throwSpeed: number;
  sticks?: boolean;
  shatterOnThrow?: boolean;
  /** what you are left holding when it breaks */
  brokenInto?: string;
  /** impact sound family */
  sound: 'glass' | 'wood' | 'metal' | 'pan' | 'blade' | 'plastic' | 'ceramic' | 'guitar';
  /** first-person grip transform tweaks */
  grip?: { pos?: [number, number, number]; rot?: [number, number, number] };
  /** AI preference (0..1) */
  aiValue: number;
}

const D = (w: Partial<WeaponDef> & Pick<WeaponDef, 'id' | 'name'>): WeaponDef => ({
  damage: 12,
  force: 180,
  reach: 1.4,
  speed: 1,
  type: 'blunt',
  twoHanded: false,
  heavy: false,
  durability: 8,
  moves: ['swingA', 'swingB'],
  npcMoves: ['swing1h'],
  arc: [38, -32],
  arcPitch: [4, -6],
  dismember: 0,
  bleed: 0,
  carve: 1,
  stun: 0,
  cleave: 1,
  throwDamage: 14,
  throwSpeed: 15,
  sound: 'wood',
  aiValue: 0.5,
  ...w,
});

export const WEAPONS: Record<string, WeaponDef> = {};
for (const w of [
  D({ id: 'bottle', name: 'Beer Bottle', damage: 15, force: 170, reach: 1.42, speed: 1.15, durability: 1, brokenInto: 'broken_bottle', shatterOnThrow: true, sound: 'glass', stun: 0.4, throwDamage: 18, aiValue: 0.5 }),
  D({ id: 'liquor', name: 'Whiskey Bottle', damage: 17, force: 190, reach: 1.45, speed: 1.08, durability: 1, brokenInto: 'broken_bottle', shatterOnThrow: true, sound: 'glass', stun: 0.45, throwDamage: 20, aiValue: 0.55 }),
  D({ id: 'broken_bottle', name: 'Broken Bottle', damage: 13, force: 70, reach: 1.3, speed: 1.4, type: 'sharp', durability: 7, moves: ['stab', 'swingA'], npcMoves: ['stab', 'swing1h'], bleed: 3.5, dismember: 0.3, carve: 1.3, sound: 'glass', throwDamage: 10, shatterOnThrow: true, aiValue: 0.7 }),
  D({ id: 'mug', name: 'Beer Mug', damage: 17, force: 220, reach: 1.38, speed: 1.05, durability: 3, shatterOnThrow: true, sound: 'glass', stun: 0.35, throwDamage: 20, aiValue: 0.45 }),
  D({ id: 'pint', name: 'Pint Glass', damage: 11, force: 120, reach: 1.32, speed: 1.2, durability: 1, shatterOnThrow: true, sound: 'glass', throwDamage: 14, brokenInto: undefined, aiValue: 0.3 }),
  D({ id: 'shot', name: 'Shot Glass', damage: 6, force: 60, reach: 1.25, speed: 1.3, durability: 1, shatterOnThrow: true, sound: 'glass', throwDamage: 10, aiValue: 0.1 }),
  D({ id: 'pool_cue', name: 'Pool Cue', damage: 15, force: 240, reach: 2.25, speed: 1.0, durability: 4, moves: ['stab', 'swingA', 'swingB'], npcMoves: ['stab', 'swing1h'], arc: [44, -40], brokenInto: 'cue_half', sound: 'wood', stun: 0.2, cleave: 2, throwDamage: 12, aiValue: 0.7 }),
  D({ id: 'cue_half', name: 'Snapped Cue', damage: 13, force: 140, reach: 1.6, speed: 1.25, type: 'pierce', durability: 5, moves: ['stab', 'swingA'], npcMoves: ['stab', 'swing1h'], bleed: 2, carve: 1.2, sound: 'wood', throwDamage: 12, aiValue: 0.6 }),
  D({ id: 'chair', name: 'Chair', damage: 27, force: 560, reach: 1.75, speed: 0.72, twoHanded: true, heavy: true, durability: 3, moves: ['swing2h', 'overhead2h'], npcMoves: ['swing2h', 'overhead2h'], arc: [55, -50], brokenInto: 'chair_leg', sound: 'wood', stun: 0.6, cleave: 3, throwDamage: 26, throwSpeed: 11, aiValue: 0.75 }),
  D({ id: 'chair_leg', name: 'Chair Leg', damage: 13, force: 190, reach: 1.45, speed: 1.2, durability: 5, sound: 'wood', moves: ['swingA', 'swingB', 'overhead'], throwDamage: 12, aiValue: 0.55 }),
  D({ id: 'stool', name: 'Bar Stool', damage: 29, force: 600, reach: 1.8, speed: 0.68, twoHanded: true, heavy: true, durability: 4, moves: ['swing2h', 'overhead2h'], npcMoves: ['swing2h', 'overhead2h'], arc: [55, -50], brokenInto: 'stool_leg', sound: 'metal', stun: 0.7, cleave: 3, throwDamage: 28, throwSpeed: 11, aiValue: 0.8 }),
  D({ id: 'stool_leg', name: 'Steel Leg', damage: 15, force: 210, reach: 1.55, speed: 1.15, durability: 10, sound: 'metal', moves: ['swingA', 'swingB', 'overhead'], aiValue: 0.6 }),
  D({ id: 'bat', name: 'Baseball Bat', damage: 25, force: 450, reach: 1.8, speed: 0.95, durability: 16, moves: ['swingA', 'swingB', 'overhead'], npcMoves: ['swing1h', 'overhead1h'], arc: [48, -44], sound: 'wood', stun: 0.5, cleave: 2, carve: 1.4, throwDamage: 20, aiValue: 0.95 }),
  D({ id: 'knife', name: 'Kitchen Knife', damage: 16, force: 60, reach: 1.28, speed: 1.55, type: 'sharp', durability: 24, moves: ['stab', 'swingA', 'stab'], npcMoves: ['stab', 'swing1h'], bleed: 4, dismember: 0.6, carve: 1.2, sound: 'blade', throwDamage: 30, throwSpeed: 18, sticks: true, aiValue: 0.85 }),
  D({ id: 'cleaver', name: 'Meat Cleaver', damage: 25, force: 150, reach: 1.38, speed: 1.05, type: 'sharp', durability: 18, moves: ['overhead', 'swingA', 'swingB'], npcMoves: ['overhead1h', 'swing1h'], bleed: 5, dismember: 1.6, carve: 1.5, sound: 'blade', throwDamage: 34, throwSpeed: 15, sticks: true, aiValue: 0.95 }),
  D({ id: 'pan', name: 'Frying Pan', damage: 19, force: 400, reach: 1.48, speed: 1.0, durability: 40, moves: ['swingA', 'swingB', 'overhead'], npcMoves: ['swing1h', 'overhead1h'], sound: 'pan', stun: 0.9, carve: 0.8, throwDamage: 18, aiValue: 0.8 }),
  D({ id: 'rolling_pin', name: 'Rolling Pin', damage: 14, force: 230, reach: 1.42, speed: 1.15, durability: 14, sound: 'wood', stun: 0.4, aiValue: 0.5 }),
  D({ id: 'guitar', name: 'Electric Guitar', damage: 31, force: 640, reach: 1.95, speed: 0.64, twoHanded: true, heavy: true, durability: 2, moves: ['swing2h', 'overhead2h'], npcMoves: ['swing2h', 'overhead2h'], arc: [58, -52], brokenInto: 'guitar_neck', sound: 'guitar', stun: 0.7, cleave: 3, throwDamage: 24, throwSpeed: 10, aiValue: 0.8 }),
  D({ id: 'guitar_neck', name: 'Guitar Neck', damage: 14, force: 200, reach: 1.6, speed: 1.15, durability: 6, sound: 'wood', aiValue: 0.5 }),
  D({ id: 'mic_stand', name: 'Mic Stand', damage: 18, force: 320, reach: 2.05, speed: 0.85, twoHanded: true, heavy: false, durability: 12, moves: ['swing2h', 'overhead2h'], npcMoves: ['swing2h'], arc: [55, -50], sound: 'metal', cleave: 2, aiValue: 0.6 }),
  D({ id: 'extinguisher', name: 'Fire Extinguisher', damage: 27, force: 540, reach: 1.45, speed: 0.72, twoHanded: true, heavy: true, durability: 14, moves: ['overhead2h', 'swing2h'], npcMoves: ['overhead2h', 'swing2h'], sound: 'metal', stun: 0.8, carve: 1.6, throwDamage: 30, throwSpeed: 10, aiValue: 0.75 }),
  D({ id: 'wrench', name: 'Wrench', damage: 18, force: 270, reach: 1.42, speed: 1.1, durability: 40, moves: ['swingA', 'swingB', 'overhead'], sound: 'metal', stun: 0.4, aiValue: 0.7 }),
  D({ id: 'tire_iron', name: 'Tire Iron', damage: 21, force: 300, reach: 1.55, speed: 1.0, durability: 40, moves: ['swingA', 'swingB', 'overhead'], sound: 'metal', stun: 0.4, carve: 1.2, aiValue: 0.85 }),
  D({ id: 'chain', name: 'Bike Chain', damage: 15, force: 150, reach: 1.95, speed: 1.05, type: 'sharp', durability: 60, moves: ['swingA', 'swingB'], arc: [50, -46], bleed: 2.5, sound: 'metal', cleave: 2, aiValue: 0.75 }),
  D({ id: 'sledgehammer', name: 'Sledgehammer', damage: 48, force: 950, reach: 1.9, speed: 0.5, twoHanded: true, heavy: true, durability: 80, moves: ['overhead2h', 'swing2h'], npcMoves: ['overhead2h', 'swing2h'], sound: 'metal', stun: 1, cleave: 3, carve: 2.4, dismember: 0.8, throwDamage: 40, throwSpeed: 9, aiValue: 1 }),
  D({ id: 'broom', name: 'Broom', damage: 9, force: 220, reach: 2.0, speed: 1.1, twoHanded: true, durability: 3, moves: ['swing2h', 'overhead2h'], npcMoves: ['swing2h'], brokenInto: 'broom_handle', sound: 'wood', cleave: 2, aiValue: 0.3 }),
  D({ id: 'broom_handle', name: 'Broom Handle', damage: 10, force: 160, reach: 1.7, speed: 1.25, type: 'pierce', durability: 5, moves: ['stab', 'swingA'], npcMoves: ['stab'], sound: 'wood', aiValue: 0.4 }),
  D({ id: 'tray', name: 'Serving Tray', damage: 12, force: 300, reach: 1.42, speed: 1.15, durability: 12, sound: 'pan', stun: 0.6, carve: 0.4, throwDamage: 14, aiValue: 0.35 }),
  D({ id: 'plate', name: 'Plate', damage: 8, force: 90, reach: 1.3, speed: 1.2, durability: 1, shatterOnThrow: true, sound: 'ceramic', throwDamage: 16, throwSpeed: 16, aiValue: 0.2 }),
  D({ id: 'ashtray', name: 'Ashtray', damage: 13, force: 150, reach: 1.3, speed: 1.2, durability: 3, shatterOnThrow: true, sound: 'glass', throwDamage: 22, aiValue: 0.35 }),
  D({ id: 'dart', name: 'Dart', damage: 4, force: 10, reach: 1.15, speed: 1.6, type: 'pierce', durability: 8, moves: ['stab'], npcMoves: ['stab'], sound: 'blade', throwDamage: 14, throwSpeed: 20, sticks: true, aiValue: 0.15 }),
  D({ id: 'pool_ball', name: 'Pool Ball', damage: 11, force: 160, reach: 1.25, speed: 1.2, durability: Infinity, sound: 'ceramic', throwDamage: 28, throwSpeed: 19, aiValue: 0.4 }),
  D({ id: 'ketchup', name: 'Ketchup Bottle', damage: 5, force: 60, reach: 1.25, speed: 1.3, durability: 2, sound: 'plastic', throwDamage: 6, aiValue: 0.05 }),
  D({ id: 'plank', name: 'Wooden Plank', damage: 16, force: 260, reach: 1.7, speed: 0.95, durability: 4, moves: ['swingA', 'swingB', 'overhead'], sound: 'wood', cleave: 2, aiValue: 0.6 }),
  D({ id: 'mop', name: 'Mop', damage: 10, force: 220, reach: 2.0, speed: 1.05, twoHanded: true, durability: 4, moves: ['swing2h', 'overhead2h'], npcMoves: ['swing2h'], brokenInto: 'broom_handle', sound: 'wood', cleave: 2, aiValue: 0.3 }),
  D({ id: 'register', name: 'Cash Register', damage: 30, force: 600, reach: 1.3, speed: 0.6, twoHanded: true, heavy: true, durability: 4, moves: ['overhead2h'], npcMoves: ['overhead2h'], sound: 'metal', stun: 1, throwDamage: 34, throwSpeed: 9, aiValue: 0.5 }),
  D({ id: 'phone', name: 'Telephone', damage: 12, force: 200, reach: 1.3, speed: 1.1, durability: 4, sound: 'plastic', throwDamage: 14, aiValue: 0.2 }),
  D({ id: 'trophy', name: 'Trophy', damage: 20, force: 300, reach: 1.4, speed: 1.0, durability: 10, sound: 'metal', stun: 0.5, throwDamage: 22, aiValue: 0.6 }),
]) {
  WEAPONS[w.id] = w;
}
