import { C, ModelBuilder } from '../weapons/ModelBuilder';

export type DefCategory = 'basic' | 'medium' | 'trap' | 'advanced';
export type Material = 'wood' | 'metal' | 'concrete' | 'sand';

export interface TrapSpec {
  type: 'spikes' | 'wire' | 'beartrap' | 'mine' | 'explosive';
  dps?: number;
  slow?: number;
  wear?: number;
  damage?: number;
  radius?: number;
  uses?: number;
  hold?: number;
}

export interface DefenseDef {
  id: string;
  name: string;
  category: DefCategory;
  cost: number;
  unlockDay: number;
  hp: number;
  kind: 'barrier' | 'trap' | 'turret';
  /** Footprint half extents (x = width/2, z = depth/2) and height. */
  hw: number;
  hd: number;
  height: number;
  material: Material;
  /** Damage dealt back to zombies that attack it. */
  thorns?: number;
  trap?: TrapSpec;
  turret?: { heavy: boolean; rateMul: number; magMul: number; range: number };
  desc: string;
  /** Adds meshes; pieces tagged with userData.breakAt (hp fraction) fall off. */
  build: (mb: ModelBuilder) => void;
}

function piece(m: THREE.Object3D, breakAt: number) {
  m.userData.breakAt = breakAt;
  return m;
}
import type * as THREE from 'three';

const WOOD = 0x8a5a32;
const WOOD_D = 0x6a4224;
const WOOD_L = 0xa87444;

export const DEFENSES: DefenseDef[] = [
  {
    id: 'woodBarrier', name: 'Wooden Barrier', category: 'basic', cost: 120, unlockDay: 0, hp: 260, kind: 'barrier',
    hw: 1.3, hd: 0.22, height: 1.15, material: 'wood',
    desc: 'Cheap plank barrier. Zombies will tear it apart — but it buys time.',
    build(mb) {
      piece(mb.box([0.14, 1.15, 0.14], [-1.15, 0.575, 0], WOOD_D), 0.0);
      piece(mb.box([0.14, 1.15, 0.14], [1.15, 0.575, 0], WOOD_D), 0.0);
      piece(mb.box([2.6, 0.2, 0.06], [0, 0.95, 0.08], WOOD), 0.75);
      piece(mb.box([2.55, 0.2, 0.06], [0, 0.62, 0.08], WOOD_L, undefined, [0, 0, 0.03]), 0.5);
      piece(mb.box([2.6, 0.2, 0.06], [0, 0.3, 0.08], WOOD), 0.25);
      piece(mb.box([2.7, 0.14, 0.05], [0, 0.62, 0.13], WOOD_D, undefined, [0, 0, 0.36]), 0.6);
      piece(mb.box([0.18, 0.18, 0.02], [-0.6, 0.95, 0.115], 0x707070), 0.75);
    },
  },
  {
    id: 'woodWall', name: 'Wooden Wall', category: 'basic', cost: 260, unlockDay: 2, hp: 520, kind: 'barrier',
    hw: 1.6, hd: 0.2, height: 2.1, material: 'wood',
    desc: 'Tall plank wall. Blocks the view and the horde.',
    build(mb) {
      for (let i = 0; i < 9; i++) {
        const x = -1.42 + i * 0.355;
        const h = 1.9 + ((i * 37) % 5) * 0.05;
        piece(mb.box([0.33, h, 0.08], [x, h / 2, 0], i % 2 ? WOOD : WOOD_L), [0.9, 0.3, 0.7, 0.15, 0.55, 0.05, 0.8, 0.4, 0.2][i]);
      }
      piece(mb.box([3.2, 0.16, 0.1], [0, 0.5, 0.09], WOOD_D), 0.35);
      piece(mb.box([3.2, 0.16, 0.1], [0, 1.5, 0.09], WOOD_D), 0.6);
      piece(mb.box([0.12, 2.2, 0.12], [-1.55, 1.1, -0.1], WOOD_D), 0);
      piece(mb.box([0.12, 2.2, 0.12], [1.55, 1.1, -0.1], WOOD_D), 0);
    },
  },
  {
    id: 'woodBarricade', name: 'Wooden Barricade', category: 'basic', cost: 360, unlockDay: 4, hp: 480, kind: 'barrier',
    hw: 1.4, hd: 0.55, height: 1.3, material: 'wood', thorns: 3,
    desc: 'Cross-braced spiked barricade. Hurts zombies that attack it.',
    build(mb) {
      for (let i = 0; i < 3; i++) {
        const x = -1.0 + i * 1.0;
        piece(mb.box([0.12, 1.7, 0.12], [x, 0.62, 0], WOOD_D, undefined, [0.75, 0, 0]), [0.3, 0.1, 0.5][i]);
        piece(mb.box([0.12, 1.7, 0.12], [x, 0.62, 0], WOOD, undefined, [-0.75, 0, 0]), [0.6, 0.2, 0.8][i]);
        piece(mb.box([0.06, 0.25, 0.06], [x, 1.2, 0.48], 0xd0c0a0, undefined, [0.6, 0, 0]), 0.85);
      }
      piece(mb.box([2.8, 0.14, 0.14], [0, 0.62, 0], WOOD_L), 0.0);
    },
  },
  {
    id: 'sandbags', name: 'Sandbags', category: 'basic', cost: 420, unlockDay: 3, hp: 1100, kind: 'barrier',
    hw: 1.5, hd: 0.42, height: 0.95, material: 'sand',
    desc: 'Heavy, low and tough. Absorbs a lot of punishment.',
    build(mb) {
      const cols = [0xb8a878, 0xa89868, 0xc4b484];
      let k = 0;
      for (let row = 0; row < 3; row++) {
        const n = 5 - (row === 2 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const x = -1.2 + i * 0.6 + (row % 2) * 0.3;
          if (x > 1.35) continue;
          const y = 0.16 + row * 0.3;
          piece(mb.box([0.58, 0.3, 0.8 - row * 0.1], [x, y, 0], cols[k++ % 3]), [0.9, 0.7, 0.5, 0.3, 0.1][(i + row * 2) % 5] * (1 - row * 0.1));
        }
      }
    },
  },
  {
    id: 'concrete', name: 'Concrete Block', category: 'medium', cost: 1100, unlockDay: 8, hp: 4200, kind: 'barrier',
    hw: 1.5, hd: 0.36, height: 0.95, material: 'concrete',
    desc: 'Jersey barrier. Extremely durable — perfect for choke points.',
    build(mb) {
      piece(mb.box([3.0, 0.3, 0.72], [0, 0.15, 0], 0x9a9a96), 0);
      piece(mb.box([3.0, 0.4, 0.5], [0, 0.5, 0], 0xa4a4a0), 0.3);
      piece(mb.box([3.0, 0.25, 0.3], [0, 0.82, 0], 0xaaaaa6), 0.6);
      for (let i = 0; i < 7; i++) piece(mb.box([0.2, 0.06, 0.32], [-1.3 + i * 0.43, 0.97, 0], i % 2 ? 0x202020 : 0xf0c020), 0.6);
    },
  },
  {
    id: 'metalBarrier', name: 'Metal Barrier', category: 'medium', cost: 850, unlockDay: 6, hp: 1700, kind: 'barrier',
    hw: 1.5, hd: 0.18, height: 1.6, material: 'metal',
    desc: 'Corrugated steel sheets bolted to posts.',
    build(mb) {
      for (let i = 0; i < 10; i++) piece(mb.box([0.3, 1.5, 0.05], [-1.35 + i * 0.3, 0.8, (i % 2) * 0.05], i % 2 ? 0x7a8088 : 0x6a7078), [0.8, 0.2, 0.6, 0.4, 0.9, 0.1, 0.7, 0.3, 0.5, 0.15][i]);
      piece(mb.box([0.1, 1.7, 0.1], [-1.5, 0.85, -0.08], 0x3a3e44), 0);
      piece(mb.box([0.1, 1.7, 0.1], [1.5, 0.85, -0.08], 0x3a3e44), 0);
      piece(mb.box([3.1, 0.1, 0.08], [0, 1.2, -0.08], 0x3a3e44), 0.35);
      piece(mb.box([3.1, 0.1, 0.08], [0, 0.4, -0.08], 0x3a3e44), 0.2);
    },
  },
  {
    id: 'steelBarricade', name: 'Steel Barricade', category: 'medium', cost: 1900, unlockDay: 12, hp: 3000, kind: 'barrier',
    hw: 1.5, hd: 0.45, height: 1.4, material: 'metal', thorns: 8,
    desc: 'Welded steel frame bristling with spikes.',
    build(mb) {
      piece(mb.box([3.0, 0.12, 0.12], [0, 0.2, 0], 0x40444a), 0);
      piece(mb.box([3.0, 0.12, 0.12], [0, 1.25, 0], 0x40444a), 0.3);
      for (let i = 0; i < 6; i++) {
        const x = -1.25 + i * 0.5;
        piece(mb.box([0.1, 1.1, 0.1], [x, 0.72, 0], 0x50545a), [0.2, 0.5, 0.1, 0.6, 0.4, 0.15][i]);
        piece(mb.box([0.05, 0.05, 0.5], [x, 0.9, 0.3], 0xb0b4ba, undefined, [0.3, 0, 0]), 0.7);
        piece(mb.box([0.05, 0.05, 0.45], [x + 0.25, 0.5, 0.28], 0xb0b4ba, undefined, [0.2, 0, 0]), 0.8);
      }
      piece(mb.box([3.1, 1.0, 0.04], [0, 0.72, -0.07], 0x5c6068), 0.45);
    },
  },
  {
    id: 'spikeStrip', name: 'Spike Strip', category: 'trap', cost: 280, unlockDay: 2, hp: 420, kind: 'trap',
    hw: 1.5, hd: 0.35, height: 0.12, material: 'metal',
    trap: { type: 'spikes', dps: 6, slow: 0.72, wear: 5 },
    desc: 'Rows of steel spikes. Damages and slows everything walking over it.',
    build(mb) {
      mb.box([3.0, 0.03, 0.6], [0, 0.015, 0], 0x3a3a3c);
      for (let i = 0; i < 14; i++) for (let j = 0; j < 3; j++) mb.box([0.03, 0.12, 0.03], [-1.4 + i * 0.215, 0.07, -0.2 + j * 0.2], 0xc8c8c8, undefined, [0.2, 0, 0]);
    },
  },
  {
    id: 'spikeBarrier', name: 'Spike Barrier', category: 'trap', cost: 600, unlockDay: 9, hp: 700, kind: 'barrier',
    hw: 1.4, hd: 0.5, height: 1.2, material: 'wood', thorns: 10,
    trap: { type: 'spikes', dps: 10 },
    desc: 'Sharpened stakes angled at the horde. Blocks and impales.',
    build(mb) {
      piece(mb.box([2.8, 0.18, 0.3], [0, 0.09, -0.2], WOOD_D), 0);
      for (let i = 0; i < 9; i++) {
        const x = -1.25 + i * 0.31;
        piece(mb.box([0.09, 1.4, 0.09], [x, 0.55, 0.15], 0xe8dcc0, undefined, [0.65, 0, (i % 3 - 1) * 0.1]), [0.8, 0.4, 0.6, 0.2, 0.9, 0.3, 0.7, 0.1, 0.5][i]);
      }
    },
  },
  {
    id: 'barbedWire', name: 'Barbed Wire', category: 'trap', cost: 320, unlockDay: 5, hp: 600, kind: 'trap',
    hw: 1.5, hd: 0.45, height: 0.8, material: 'metal',
    trap: { type: 'wire', dps: 2.5, slow: 0.35, wear: 4 },
    desc: 'Concertina wire. Heavily slows zombies caught in it.',
    build(mb) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        mb.box([3.0, 0.02, 0.02], [0, 0.4 + Math.sin(a) * 0.35, Math.cos(a) * 0.35], 0x9a9a9e, undefined, [a, 0, 0]);
      }
      for (let i = 0; i < 12; i++) mb.box([0.03, 0.78, 0.78], [-1.4 + i * 0.255, 0.4, 0], 0x86868a, undefined, [(i % 2) * 0.3, 0, 0]).scale.set(1, 1, 1);
      mb.box([0.06, 0.9, 0.06], [-1.45, 0.45, 0], 0x5a4a3a);
      mb.box([0.06, 0.9, 0.06], [1.45, 0.45, 0], 0x5a4a3a);
    },
  },
  {
    id: 'bearTrap', name: 'Bear Trap', category: 'trap', cost: 240, unlockDay: 6, hp: 300, kind: 'trap',
    hw: 0.35, hd: 0.35, height: 0.1, material: 'metal',
    trap: { type: 'beartrap', damage: 30, hold: 3.5, uses: 6 },
    desc: 'Snaps shut on a zombie and holds it in place. Re-arms (6 uses).',
    build(mb) {
      mb.box([0.6, 0.02, 0.6], [0, 0.01, 0], 0x4a4a4c);
      const j1 = mb.part('jawA', [0, 0.02, -0.25]);
      const j2 = mb.part('jawB', [0, 0.02, 0.25]);
      for (let i = 0; i < 6; i++) {
        mb.box([0.03, 0.08, 0.03], [-0.22 + i * 0.09, 0.04, 0.0], 0xb0b0b0, j1);
        mb.box([0.03, 0.08, 0.03], [-0.18 + i * 0.09, 0.04, 0.0], 0xb0b0b0, j2);
      }
      mb.box([0.5, 0.03, 0.03], [0, 0.0, 0], 0x6a6a6c, j1);
      mb.box([0.5, 0.03, 0.03], [0, 0.0, 0], 0x6a6a6c, j2);
      mb.box([0.12, 0.02, 0.12], [0, 0.03, 0], 0x8a6a2a);
    },
  },
  {
    id: 'landMine', name: 'Land Mine', category: 'trap', cost: 300, unlockDay: 7, hp: 100, kind: 'trap',
    hw: 0.25, hd: 0.25, height: 0.08, material: 'metal',
    trap: { type: 'mine', damage: 100, radius: 4.6 },
    desc: 'Buried anti-personnel mine. One big boom.',
    build(mb) {
      mb.cyl(0.2, 0.06, [0, 0.03, 0], 0x4a5630, undefined, 'y', 10);
      mb.cyl(0.06, 0.03, [0, 0.07, 0], 0x303030, undefined, 'y', 8);
      mb.box([0.03, 0.01, 0.03], [0.1, 0.065, 0], 0xff3020, undefined, undefined, 0xff2010);
    },
  },
  {
    id: 'explosiveTrap', name: 'Explosive Barrels', category: 'trap', cost: 800, unlockDay: 11, hp: 150, kind: 'trap',
    hw: 0.7, hd: 0.6, height: 1.0, material: 'metal',
    trap: { type: 'explosive', damage: 150, radius: 7.5 },
    desc: 'Rigged fuel barrels. Detonate when zombies get close — or when you shoot them.',
    build(mb) {
      for (const [x, z] of [[-0.35, -0.2], [0.35, -0.2], [0, 0.3]]) {
        mb.cyl(0.29, 0.9, [x, 0.45, z], 0xb02418, undefined, 'y', 10);
        mb.cyl(0.3, 0.05, [x, 0.3, z], 0x701810, undefined, 'y', 10);
        mb.cyl(0.3, 0.05, [x, 0.65, z], 0x701810, undefined, 'y', 10);
        mb.box([0.2, 0.2, 0.01], [x, 0.5, z + 0.29], 0xf0d020);
      }
      mb.box([0.06, 0.06, 0.06], [0, 1.0, 0.3], 0x202020);
      mb.box([0.02, 0.02, 0.02], [0.03, 1.04, 0.3], 0xff2010, undefined, undefined, 0xff2010);
    },
  },
  {
    id: 'turret', name: 'Auto Turret', category: 'advanced', cost: 700, unlockDay: 10, hp: 350, kind: 'turret',
    hw: 0.45, hd: 0.45, height: 1.2, material: 'metal',
    turret: { heavy: false, rateMul: 1, magMul: 1, range: 34 },
    desc: 'Tripod turret that mounts one of your turret-capable weapons. Costs $700 + half the weapon price.',
    build(mb) {
      turretBase(mb, false);
    },
  },
  {
    id: 'heavyTurret', name: 'Heavy Turret', category: 'advanced', cost: 3000, unlockDay: 22, hp: 1400, kind: 'turret',
    hw: 0.8, hd: 0.8, height: 1.3, material: 'metal',
    turret: { heavy: true, rateMul: 1.4, magMul: 1.5, range: 45 },
    desc: 'Armored emplacement: +40% fire rate, +50% magazine, sandbagged. $3000 + the weapon price.',
    build(mb) {
      turretBase(mb, true);
    },
  },
];

function turretBase(mb: ModelBuilder, heavy: boolean) {
  if (heavy) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      if (Math.cos(a) > 0.5) continue;
      piece(mb.box([0.5, 0.3, 0.3], [Math.sin(a) * 0.72, 0.15 + (i % 2) * 0.28, Math.cos(a) * 0.72], [0xb8a878, 0xa89868][i % 2], undefined, [0, a, 0]), 0.3 + (i % 3) * 0.2);
    }
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    piece(mb.box([0.05, 0.9, 0.05], [Math.sin(a) * 0.28, 0.4, Math.cos(a) * 0.28], C.DARK, undefined, [Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35]), 0);
  }
  mb.box([0.12, 0.25, 0.12], [0, 0.85, 0], C.BLACK);
  const yaw = mb.part('yaw', [0, 1.0, 0]);
  mb.box([0.2, 0.08, 0.2], [0, 0, 0], C.GUNMETAL, yaw);
  const pitch = mb.part('pitch', [0, 0.08, 0], yaw);
  mb.box([0.14, 0.12, 0.25], [0, 0.0, 0.05], C.GUNMETAL, pitch);
  mb.box([0.18, 0.14, 0.14], [0.15, -0.02, 0.1], heavy ? C.OD : 0x4a5a3a, pitch);
  if (heavy) mb.box([0.7, 0.45, 0.04], [0, 0.1, -0.3], 0x5c6068, pitch);
  mb.anchor('mount', [0, 0.1, 0], pitch);
}

export const DEFENSE_MAP: Record<string, DefenseDef> = Object.fromEntries(DEFENSES.map((d) => [d.id, d]));

export function turretCost(def: DefenseDef, weaponCost: number) {
  return def.id === 'heavyTurret' ? def.cost + weaponCost : def.cost + Math.round(weaponCost / 2);
}
