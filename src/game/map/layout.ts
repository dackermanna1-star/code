// World layout: zones, pads, roads and points of interest. Coordinates in
// meters, +X east, +Z south, Y up. The central plain sits at y = 0.

import { Surface } from '../../sim/surfaces.ts';

export const WORLD_HALF = 800;
export const TERRAIN_CELL = 4;

export interface Pad {
  name: string;
  x: number;
  z: number;
  w: number; // extent along x
  d: number; // extent along z
  y: number;
  surface: number;
  /** render a concrete/asphalt slab */
  slab: 'asphalt' | 'concrete' | 'dirt' | 'none';
  falloff: number;
  rot?: number;
}

export interface RoadDef {
  name: string;
  pts: [number, number, number?][]; // x, z, optional y
  width: number;
  lanes: number;
  surface?: number;
  closed?: boolean;
  shoulder?: number;
  markings?: boolean;
}

export interface Zone {
  id: string;
  name: string;
  description: string;
  x: number;
  z: number;
  /** teleport spawn point and heading (yaw, radians; 0 = +Z) */
  spawn: [number, number, number];
  color: string;
}

export const ZONES: Zone[] = [
  { id: 'hub', name: 'Proving Grounds Hub', description: 'Garage plaza and spawn. Every road starts here.', x: 0, z: 0, spawn: [0, 10, Math.PI], color: '#4fb3ff' },
  { id: 'crash', name: 'Crash Test Center', description: 'Half-kilometre runway into rigid barriers, offset walls and a steel pole.', x: 0, z: -520, spawn: [-6, -110, Math.PI], color: '#ffcc33' },
  { id: 'maces', name: 'Mace Gauntlet', description: 'Corridor of giant swinging spiked maces. Time it right or get launched.', x: 330, z: -280, spawn: [330, -90, Math.PI], color: '#ff5a5a' },
  { id: 'spikes', name: 'Spike Alley', description: 'Spike strips, spiked walls and rolling spike drums.', x: 175, z: -470, spawn: [65, -470, Math.PI / 2], color: '#ff8f3a' },
  { id: 'industrial', name: 'Industrial Yard', description: 'Shredder, hydraulic presses, side crushers and a conveyor of doom.', x: 380, z: 80, spawn: [250, 40, Math.PI / 2], color: '#c2c2c2' },
  { id: 'drop', name: 'Drop Zone', description: 'Gantries that drop concrete, steel and containers when you pass beneath.', x: -360, z: 40, spawn: [-360, 150, Math.PI], color: '#9b7bff' },
  { id: 'course', name: 'Obstacle Course', description: 'Sliding walls, sweepers, pistons, bollards and a see-saw.', x: -360, z: -300, spawn: [-360, -170, Math.PI], color: '#47d18c' },
  { id: 'stunt', name: 'Stunt Park', description: 'Ramps, a vertical loop, a mega ramp and a container canyon jump.', x: 0, z: 380, spawn: [0, 210, 0], color: '#ff6ad5' },
  { id: 'arena', name: 'Demolition Arena', description: 'Walled dirt bowl full of wrecks to smash.', x: -360, z: 380, spawn: [-360, 300, 0], color: '#e0a060' },
  { id: 'offroad', name: 'Dirt Hills', description: 'Rough tracks, jumps and a mud pit.', x: 380, z: 400, spawn: [300, 330, Math.PI * 0.75], color: '#b08a5a' },
  { id: 'cliff', name: 'Summit Cliff', description: 'Mountain road to a 60 m sheer drop. Send it.', x: -560, z: -600, spawn: [-430, -430, Math.PI * 1.25], color: '#8fd3ff' },
];

export const PADS: Pad[] = [
  { name: 'hub', x: 0, z: 0, w: 160, d: 160, y: 0, surface: Surface.ASPHALT, slab: 'asphalt', falloff: 30 },
  { name: 'crashRunway', x: 0, z: -330, w: 44, d: 470, y: 0, surface: Surface.CONCRETE, slab: 'concrete', falloff: 25 },
  { name: 'crashEnd', x: 0, z: -590, w: 90, d: 70, y: 0, surface: Surface.CONCRETE, slab: 'concrete', falloff: 25 },
  { name: 'maces', x: 330, z: -280, w: 34, d: 360, y: 0, surface: Surface.CONCRETE, slab: 'concrete', falloff: 20 },
  { name: 'spikes', x: 180, z: -470, w: 260, d: 34, y: 0, surface: Surface.ASPHALT, slab: 'asphalt', falloff: 20 },
  { name: 'industrial', x: 380, z: 80, w: 220, d: 190, y: 0, surface: Surface.CONCRETE, slab: 'concrete', falloff: 25 },
  { name: 'drop', x: -360, z: 40, w: 50, d: 280, y: 0, surface: Surface.ASPHALT, slab: 'asphalt', falloff: 20 },
  { name: 'course', x: -360, z: -300, w: 70, d: 300, y: 0, surface: Surface.ASPHALT, slab: 'asphalt', falloff: 20 },
  { name: 'stunt', x: 0, z: 400, w: 260, d: 230, y: 0, surface: Surface.ASPHALT, slab: 'asphalt', falloff: 30 },
  { name: 'arena', x: -360, z: 390, w: 150, d: 120, y: 0, surface: Surface.DIRT, slab: 'dirt', falloff: 25 },
];

const RING = 250;
export const ROADS: RoadDef[] = [
  {
    name: 'ring',
    pts: [
      [-RING, -RING], [0, -RING - 12], [RING, -RING], [RING + 12, 0], [RING, RING], [0, RING + 12], [-RING, RING], [-RING - 12, 0],
    ],
    width: 14,
    lanes: 4,
    closed: true,
  },
  { name: 'eastSpoke', pts: [[75, 20], [160, 20], [262, 25], [270, 40]], width: 12, lanes: 2 },
  { name: 'westSpoke', pts: [[-75, 20], [-160, 20], [-262, 30], [-335, 40]], width: 12, lanes: 2 },
  { name: 'southSpoke', pts: [[0, 75], [0, 160], [0, 262], [0, 290]], width: 14, lanes: 2 },
  { name: 'macesLink', pts: [[RING + 2, -170], [300, -130], [330, -100]], width: 12, lanes: 2 },
  { name: 'courseLink', pts: [[-RING - 2, -170], [-320, -150], [-360, -140]], width: 12, lanes: 2 },
  { name: 'dropLink', pts: [[-RING - 10, 150], [-320, 175], [-360, 175]], width: 12, lanes: 2 },
  { name: 'arenaLink', pts: [[-RING + 5, RING + 5], [-300, 310], [-340, 330]], width: 12, lanes: 2 },
  { name: 'offroadLink', pts: [[RING + 5, RING + 5], [290, 300], [320, 330]], width: 10, lanes: 2, surface: Surface.GRAVEL, markings: false },
  { name: 'spikesLink', pts: [[-20, -470], [20, -470], [50, -470]], width: 12, lanes: 2 },
  {
    name: 'mountain',
    pts: [
      [-RING, -RING, 0], [-320, -330, 0], [-380, -400, 2], [-430, -430, 6], [-480, -420, 12], [-540, -440, 20], [-580, -490, 28],
      [-560, -540, 36], [-510, -560, 42], [-470, -600, 48], [-500, -650, 54], [-560, -660, 58], [-610, -640, 60], [-630, -600, 60],
    ],
    width: 10,
    lanes: 2,
    shoulder: 6,
  },
];

/** Plateau at the end of the mountain road with its cliff edge facing south-east. */
export const CLIFF = { x: -620, z: -615, radius: 60, y: 60 };

/** Off-road hill field. */
export const HILLS = { x: 380, z: 410, w: 230, d: 200 };

export const SPAWN = ZONES[0].spawn;
