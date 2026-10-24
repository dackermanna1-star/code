// Places the built-in obstacles, machines and props for every zone.

import { REGISTRY, type Obstacle, type ObstacleHost } from '../obstacles/base.ts';
import '../obstacles/static.ts';
import '../obstacles/dynamic.ts';

export interface Placement {
  type: string;
  x: number;
  z: number;
  yaw: number;
  p?: Record<string, number>;
}

export interface PropPlacement {
  kind: string;
  x: number;
  z: number;
  y?: number;
  yaw?: number;
}

export interface ParkedCar {
  id: string;
  x: number;
  z: number;
  yaw: number;
  color?: number;
  damage?: number;
}

const PI = Math.PI;

export function builtinPlacements(): Placement[] {
  const P: Placement[] = [];
  const add = (type: string, x: number, z: number, yaw: number, p: Record<string, number> = {}) => P.push({ type, x, z, yaw, p });

  // ------------------------------------------------------------ hub
  add('jersey', -78, -40, 0, { n: 10 });
  add('jersey', -78, 40, 0, { n: 10 });
  add('tireWall', 40, 60, 0, { w: 10, rows: 4 });
  add('ramp', 45, 20, 0, { w: 5, l: 8, h: 1.2 });
  add('kicker', 55, -20, PI / 2, { R: 5, w: 4, angle: 28 });

  // ------------------------------------------------------------ crash test center (cars travel -Z)
  add('crashBarrier', -14, -576, PI, { w: 5, h: 2, offset: 0 });
  add('crashBarrier', 0, -576, PI, { w: 5, h: 2, offset: 0.6 });
  add('pole', 14, -572, 0, { r: 0.17, h: 7 });
  add('wall', 0, -603, 0, { w: 88, h: 4, t: 2 });
  add('tireWall', 28, -576, 0, { w: 6, rows: 5 });
  add('wall', -42, -585, PI / 2, { w: 36, h: 2.5, t: 1 });
  add('wall', 42, -585, PI / 2, { w: 36, h: 2.5, t: 1 });
  add('spikeStrip', 28, -540, 0, { l: 6 });

  // ------------------------------------------------------------ mace gauntlet (cars travel -Z along x=330)
  add('jersey', 321, -280, 0, { n: 60 });
  add('jersey', 339, -280, 0, { n: 60 });
  const phases = [0, 0.35, 0.7, 0.15, 0.55, 0.85];
  const periods = [5.5, 5.0, 6.0, 4.6, 5.2, 6.4];
  phases.forEach((ph, i) => add('mace', 330, -160 - i * 46, 0, { L: 10.5, r: 1.25, amp: 62, period: periods[i], phase: ph }));
  add('ramp', 330, -425, PI, { w: 6, l: 10, h: 1.8 });

  // ------------------------------------------------------------ spike alley (cars travel +X along z=-470)
  add('spikeStrip', 95, -470, PI / 2, { l: 12 });
  add('spikeStrip', 140, -468, PI / 2, { l: 6 });
  add('spikeDrum', 165, -461, 0, { r: 0.9, h: 2.2, speed: 2.4 });
  add('spikeDrum', 165, -479, 0, { r: 0.9, h: 2.2, speed: -2.4 });
  add('spikeWall', 200, -480, PI, { w: 10, h: 2, len: 0.7 });
  add('spikeWall', 225, -460, 0, { w: 10, h: 2, len: 0.7 });
  add('spikeWall', 250, -480, PI, { w: 10, h: 2, len: 0.7 });
  add('spikeDrum', 272, -470, 0, { r: 1.0, h: 2.4, speed: 3 });
  add('spikeWall', 302, -470, -PI / 2, { w: 16, h: 2.5, len: 0.9 });

  // ------------------------------------------------------------ industrial yard
  add('grinder', 440, 30, PI / 2, { w: 5.5, speed: 2.6, R: 0.85 });
  add('crusher', 330, 125, PI / 2, { w: 5, d: 7, h: 3.6, period: 7, phase: 0 });
  add('crusher', 345, 125, PI / 2, { w: 5, d: 7, h: 3.6, period: 7, phase: 0.33 });
  add('crusher', 360, 125, PI / 2, { w: 5, d: 7, h: 3.6, period: 7, phase: 0.66 });
  add('sideCrusher', 420, 125, PI / 2, { len: 6, h: 2.2, open: 6, period: 8 });
  add('conveyor', 290, 60, PI / 2, { L: 18, w: 4, speed: 3 });
  add('crusher', 306, 60, PI / 2, { w: 5, d: 7, h: 3.6, period: 6, phase: 0.2 });
  add('container', 300, 0, 0, { stack: 3 });
  add('container', 304, 0, 0, { stack: 2 });
  add('container', 470, 160, PI / 2, { stack: 2 });
  add('container', 470, 150, PI / 2, { stack: 3 });
  add('wreckingBall', 400, 70, PI / 2, { L: 11, r: 1.1, mass: 6000, period: 12 });

  // ------------------------------------------------------------ drop zone (cars travel -Z along x=-360)
  add('dropper', -360, 120, PI, { span: 11, h: 10, kind: 0, lead: 14, cooldown: 12 });
  add('dropper', -360, 70, PI, { span: 11, h: 12, kind: 1, lead: 14, cooldown: 12 });
  add('dropper', -360, 20, PI, { span: 11, h: 11, kind: 2, lead: 16, cooldown: 14 });
  add('dropper', -360, -30, PI, { span: 11, h: 10, kind: 4, lead: 14, cooldown: 12 });
  add('jersey', -369, 40, 0, { n: 45 });
  add('jersey', -351, 40, 0, { n: 45 });

  // ------------------------------------------------------------ obstacle course (cars travel -Z along x=-360)
  add('jersey', -374, -300, 0, { n: 95 });
  add('jersey', -346, -300, 0, { n: 95 });
  add('slider', -360, -185, 0, { w: 8, h: 1.6, travel: 7, period: 4, phase: 0 });
  add('slider', -360, -215, 0, { w: 8, h: 1.6, travel: 7, period: 4, phase: 0.5 });
  add('sweeper', -360, -255, 0, { L: 13, speed: 1.1 });
  add('piston', -372, -295, 0, { stroke: 5, period: 3.5, phase: 0 });
  add('piston', -348, -305, PI, { stroke: 5, period: 3.5, phase: 0.5 });
  add('bollards', -360, -335, 0, { n: 8, spacing: 1.6, period: 5 });
  add('seesaw', -360, -370, 0, { L: 14, w: 4, mass: 900 });
  add('launcher', -360, -405, 0, { w: 5.5, power: 18 });
  add('sweeper', -360, -435, 0, { L: 13, speed: -1.5 });

  // ------------------------------------------------------------ stunt park (cars travel +Z from z=290)
  add('loop', 0, 410, 0, { R: 9, w: 5 });
  add('ramp', -60, 330, 0, { w: 6, l: 12, h: 3 });
  add('ramp', -60, 385, PI, { w: 6, l: 16, h: 3 });
  add('ramp', 80, 320, 0, { w: 10, l: 40, h: 11 });
  add('ramp', 80, 425, PI, { w: 16, l: 42, h: 9 });
  add('quarterPipe', -118, 460, -PI / 2, { R: 7, w: 14, angle: 88 });
  add('quarterPipe', 118, 470, PI / 2, { R: 7, w: 14, angle: 88 });
  add('kicker', -30, 340, 0, { R: 6, w: 5, angle: 35 });
  add('container', -18, 470, PI / 2, { stack: 2 });
  add('container', -18, 486, PI / 2, { stack: 2 });
  add('kicker', -45, 450, PI / 2, { R: 7, w: 5, angle: 30 });
  add('platform', 40, 470, 0, { w: 8, l: 10, h: 6, rampL: 26 });
  add('launcher', 110, 330, 0, { w: 5.5, power: 22 });

  // ------------------------------------------------------------ demolition arena
  add('jersey', -432, 390, 0, { n: 38 });
  add('jersey', -288, 390, 0, { n: 38 });
  add('jersey', -360, 448, PI / 2, { n: 46 });
  add('jersey', -400, 332, PI / 2, { n: 12 });
  add('jersey', -320, 332, PI / 2, { n: 12 });
  add('tireWall', -360, 400, 0, { w: 12, rows: 3 });

  // ------------------------------------------------------------ dirt hills
  add('kicker', 350, 360, PI * 0.75, { R: 6, w: 6, angle: 30 });
  add('kicker', 410, 440, PI * 0.25, { R: 8, w: 6, angle: 26 });
  add('tireWall', 450, 380, PI / 3, { w: 10, rows: 3 });

  // ------------------------------------------------------------ summit cliff
  add('kicker', -585, -580, PI * 0.25, { R: 8, w: 6, angle: 22 });
  return P;
}

export function builtinProps(): PropPlacement[] {
  const out: PropPlacement[] = [];
  // hub cones
  for (let i = 0; i < 10; i++) out.push({ kind: 'cone', x: -30 + i * 3.2, z: -45 });
  for (let i = 0; i < 6; i++) out.push({ kind: 'cone', x: 20, z: 30 + i * 4 });
  // crate pyramid in the hub
  for (let r = 0; r < 3; r++) for (let c = 0; c <= 2 - r; c++) out.push({ kind: 'crate', x: -40 + c * 1.15 + r * 0.575, z: 30, y: r * 1.12 });
  // barrels near crash center
  for (let i = 0; i < 8; i++) out.push({ kind: 'barrel', x: 30 + (i % 4) * 0.7, z: -500 + Math.floor(i / 4) * 0.7 });
  // bowling pins in the stunt park
  const rows = 4;
  for (let r = 0; r < rows; r++) for (let c = 0; c <= r; c++) out.push({ kind: 'pin', x: -60 + (c - r / 2) * 1.4, z: 470 + r * 1.3 });
  // industrial barrels and crates
  for (let i = 0; i < 12; i++) out.push({ kind: 'barrel', x: 380 + (i % 4) * 0.75, z: 150 + Math.floor(i / 4) * 0.75 });
  for (let i = 0; i < 6; i++) out.push({ kind: 'crate', x: 450, z: 120 + i * 1.2 });
  // barrel slalom on the approach to the obstacle course
  for (let i = 0; i < 6; i++) out.push({ kind: 'barrel', x: -360 + (i % 2 ? 2.5 : -2.5), z: -110 - i * 9 });
  // arena debris
  for (let i = 0; i < 10; i++) out.push({ kind: 'tire', x: -400 + i * 7, z: 360 + (i % 3) * 20, yaw: i });
  for (let i = 0; i < 8; i++) out.push({ kind: 'barrel', x: -330 + (i % 4) * 0.8, z: 420 + Math.floor(i / 4) * 0.8 });
  // hills: loose barriers
  for (let i = 0; i < 4; i++) out.push({ kind: 'jerseyProp', x: 330 + i * 4, z: 470, yaw: 0.3 });
  // spike alley: crates at the end
  for (let i = 0; i < 6; i++) out.push({ kind: 'crate', x: 296, z: -476 + i * 1.15 });
  return out;
}

export function parkedCars(): ParkedCar[] {
  return [
    { id: 'meridian', x: -28, z: -578, yaw: Math.PI / 2, color: 0x9aa4ad },
    { id: 'pico', x: -380, z: 380, yaw: 0.5, color: 0x8b2252 },
    { id: 'summit', x: -340, z: 410, yaw: 2.2, color: 0x2a4e6e },
    { id: 'courier', x: -395, z: 420, yaw: -0.8, color: 0xd23b1e },
    { id: 'meridian', x: -320, z: 370, yaw: 1.4, color: 0x2f5d3a },
  ];
}

export function spawnBuiltins(host: ObstacleHost): Obstacle[] {
  const list: Obstacle[] = [];
  for (const pl of builtinPlacements()) {
    const t = REGISTRY.get(pl.type);
    if (!t) continue;
    const params: Record<string, number> = {};
    for (const pd of t.params) params[pd.key] = pl.p?.[pd.key] ?? pd.def;
    const o = t.create(host, pl.x, pl.z, pl.yaw, params).init();
    o.builtin = true;
    list.push(o);
  }
  return list;
}
