// Unit type definitions. Weapons given as [coalition, federation] pairs are
// faction-specific. Armor is mm RHA equivalent per facing. Speeds in m/s.

import { MOVE_INF, MOVE_TRACK, MOVE_WHEEL } from '../world/nav.js';

const RIFLE = ['rifle_556', 'rifle_545'];
const MG = ['lmg_556', 'gpmg_762'];

const INF_SPEED = { crawl: 0.45, walk: 1.5, run: 3.7, sprint: 5.4 };

export const UNIT_DEFS = {
  // ----------------------------------------------------------- infantry
  rifleman: {
    cat: 'inf', role: 'rifleman', names: ['Rifleman', 'Rifleman'], hp: 100, cost: 1,
    weapons: [RIFLE, 'frag'], vision: 520, speed: INF_SPEED, vest: 0.35, move: MOVE_INF,
  },
  leader: {
    cat: 'inf', role: 'leader', names: ['Squad Leader', 'Squad Leader'], hp: 100, cost: 1,
    weapons: [RIFLE, 'frag'], vision: 780, speed: INF_SPEED, vest: 0.35, smokeGrenades: 2, move: MOVE_INF, observer: true,
  },
  grenadier: {
    cat: 'inf', role: 'grenadier', names: ['Grenadier', 'Grenadier'], hp: 100, cost: 1,
    weapons: [RIFLE, 'ugl', 'frag'], vision: 520, speed: INF_SPEED, vest: 0.35, move: MOVE_INF,
  },
  mg: {
    cat: 'inf', role: 'mg', names: ['Machine Gunner', 'Machine Gunner'], hp: 100, cost: 1,
    weapons: [MG], vision: 600, speed: { ...INF_SPEED, run: 3.3, sprint: 4.6 }, vest: 0.35, prone: true, move: MOVE_INF,
  },
  at: {
    cat: 'inf', role: 'at', names: ['AT Rifleman', 'AT Grenadier'], hp: 100, cost: 1,
    weapons: [RIFLE, 'rpg'], vision: 520, speed: INF_SPEED, vest: 0.35, move: MOVE_INF,
  },
  atgm: {
    cat: 'inf', role: 'atgm', names: ['ATGM Gunner', 'ATGM Gunner'], hp: 100, cost: 2,
    weapons: [RIFLE, 'javelin'], vision: 1100, speed: { ...INF_SPEED, run: 3.2, sprint: 4.4 }, vest: 0.35, prone: true, move: MOVE_INF,
  },
  sniper: {
    cat: 'inf', role: 'sniper', names: ['Sniper', 'Sniper'], hp: 100, cost: 2,
    weapons: ['dmr'], vision: 1150, speed: INF_SPEED, vest: 0.1, prone: true, camo: 0.45, move: MOVE_INF,
  },
  manpads: {
    cat: 'inf', role: 'manpads', names: ['AA Gunner', 'AA Gunner'], hp: 100, cost: 2,
    weapons: [RIFLE, 'manpads'], vision: 600, airVision: 4500, speed: INF_SPEED, vest: 0.35, move: MOVE_INF,
  },
  drone_op: {
    cat: 'inf', role: 'drone_op', names: ['Drone Operator', 'Drone Operator'], hp: 100, cost: 2,
    weapons: [RIFLE], vision: 520, speed: INF_SPEED, vest: 0.35, drones: 6, move: MOVE_INF,
  },
  crew: {
    cat: 'inf', role: 'crew', names: ['Vehicle Crew', 'Vehicle Crew'], hp: 100, cost: 0,
    weapons: ['pistol'], vision: 450, speed: INF_SPEED, vest: 0.25, move: MOVE_INF,
  },
  pilot: {
    cat: 'inf', role: 'pilot', names: ['Pilot', 'Pilot'], hp: 100, cost: 0,
    weapons: ['pistol'], vision: 450, speed: INF_SPEED, vest: 0.2, move: MOVE_INF,
  },

  // ----------------------------------------------------------- vehicles
  mbt: {
    cat: 'veh', vclass: 'armor', names: ['M90 Sentinel MBT', 'T-94 Bastion MBT'], hp: 1000, cost: 10,
    armor: { front: 620, side: 110, rear: 45, top: 35, turretFront: 760 }, move: MOVE_TRACK,
    speed: { road: 17, offroad: 12, reverse: 5 }, accel: 2.6, turnRate: 0.75, turretRate: 0.72, elev: [-0.14, 0.36],
    weapons: [{ w: 'mbt_gun', mount: 'gun' }, { w: 'coax_mg', mount: 'coax' }, { w: 'hmg', mount: 'roof' }],
    vision: 2600, crew: 4, smoke: 2, cookoff: [0.12, 0.3],
  },
  ifv: {
    cat: 'veh', vclass: 'light', names: ['M37 Warden IFV', 'BTK-5 IFV'], hp: 560, cost: 6,
    armor: { front: 75, side: 35, rear: 25, top: 15, turretFront: 60 }, move: MOVE_TRACK,
    speed: { road: 17, offroad: 12, reverse: 5 }, accel: 3, turnRate: 0.9, turretRate: 1.0, elev: [-0.12, 0.85],
    weapons: [{ w: 'autocannon', mount: 'gun' }, { w: 'coax_mg', mount: 'coax' }, { w: 'ifv_atgm', mount: 'atgm' }],
    vision: 2200, crew: 3, capacity: 7, smoke: 2, cookoff: [0.2, 0.25],
  },
  apc: {
    cat: 'veh', vclass: 'light', names: ['LAV-8 Stallion APC', 'BTR-K APC'], hp: 440, cost: 4,
    armor: { front: 40, side: 20, rear: 15, top: 10, turretFront: 20 }, move: MOVE_WHEEL,
    speed: { road: 24, offroad: 13, reverse: 6 }, accel: 3.2, turnRate: 0.8, turretRate: 1.4, elev: [-0.15, 1.0],
    weapons: [{ w: 'hmg', mount: 'gun' }], vision: 1800, crew: 2, capacity: 9, smoke: 1, cookoff: [0.15, 0.15],
  },
  scout: {
    cat: 'veh', vclass: 'light', names: ['RV-4 Ranger', 'GAZ-R Scout'], hp: 280, cost: 3,
    armor: { front: 18, side: 14, rear: 10, top: 8, turretFront: 12 }, move: MOVE_WHEEL,
    speed: { road: 27, offroad: 15, reverse: 7 }, accel: 4, turnRate: 1.0, turretRate: 1.6, elev: [-0.2, 1.0],
    weapons: [{ w: 'hmg', mount: 'gun' }], vision: 2300, crew: 3, smoke: 1, cookoff: [0.1, 0.1],
  },
  spaag: {
    cat: 'veh', vclass: 'light', names: ['SG-35 Skyguard SPAAG', 'ZRK-30 SPAAG'], hp: 480, cost: 6,
    armor: { front: 40, side: 25, rear: 15, top: 12, turretFront: 25 }, move: MOVE_TRACK,
    speed: { road: 16, offroad: 11, reverse: 5 }, accel: 2.6, turnRate: 0.8, turretRate: 1.5, elev: [-0.1, 1.45],
    weapons: [{ w: 'aa_twin', mount: 'gun' }, { w: 'sam_vehicle', mount: 'turret' }],
    vision: 1600, airVision: 7000, crew: 3, smoke: 1, cookoff: [0.25, 0.2], radar: true,
  },
  spg: {
    cat: 'veh', vclass: 'light', names: ['M155 Thunder SPH', 'SAU-152 SPH'], hp: 500, cost: 8,
    armor: { front: 30, side: 20, rear: 15, top: 12, turretFront: 25 }, move: MOVE_TRACK,
    speed: { road: 15, offroad: 10, reverse: 4 }, accel: 2.2, turnRate: 0.7, turretRate: 0.45, elev: [-0.05, 1.22],
    weapons: [{ w: 'howitzer', mount: 'gun' }], vision: 1200, crew: 4, artillery: true, cookoff: [0.3, 0.3],
  },
  mlrs: {
    cat: 'veh', vclass: 'light', names: ['HR-12 Hailstorm MLRS', 'RSZO-40 MLRS'], hp: 260, cost: 8,
    armor: { front: 12, side: 8, rear: 8, top: 6, turretFront: 8 }, move: MOVE_WHEEL,
    speed: { road: 22, offroad: 12, reverse: 5 }, accel: 2.8, turnRate: 0.7, turretRate: 0.5, elev: [0, 1.0],
    weapons: [{ w: 'mlrs_rocket', mount: 'gun' }], vision: 1000, crew: 3, artillery: true, cookoff: [0.4, 0.4],
  },

  // ----------------------------------------------------------- aircraft
  attack_heli: {
    cat: 'air', aclass: 'heli', names: ['AH-70 Harbinger', 'Ka-70 Hunter'], hp: 650, cost: 14,
    armor: 12, speed: { cruise: 72, attack: 38, max: 85 }, accel: 9, turnRate: 0.9, altitude: 55,
    weapons: [{ w: 'heli_cannon', mount: 'chin' }, { w: 'heli_rockets', mount: 'pods' }, { w: 'heli_atgm', mount: 'rails' }],
    vision: 3600, flares: 32, crew: 2,
  },
  transport_heli: {
    cat: 'air', aclass: 'heli', names: ['UH-80 Courier', 'Mi-30 Carrier'], hp: 520, cost: 7,
    armor: 8, speed: { cruise: 68, attack: 40, max: 78 }, accel: 7, turnRate: 0.8, altitude: 70,
    weapons: [{ w: 'door_gun', mount: 'door0' }, { w: 'door_gun', mount: 'door1' }],
    vision: 2400, flares: 24, capacity: 10, crew: 3,
  },
  jet: {
    cat: 'air', aclass: 'jet', names: ['FA-21 Talon', 'Su-44 Striker'], hp: 420, cost: 16,
    armor: 10, speed: { cruise: 230, attack: 190, max: 280 }, accel: 30, turnRate: 0.55, altitude: 420,
    weapons: [{ w: 'jet_cannon', mount: 'gun' }, { w: 'bomb', mount: 'pylon' }, { w: 'agm', mount: 'pylon' }, { w: 'aam', mount: 'pylon' }],
    vision: 4500, flares: 40, crew: 1,
  },
  transport_plane: {
    cat: 'air', aclass: 'plane', names: ['C-140 Hauler', 'An-112 Cargo'], hp: 1000, cost: 10,
    armor: 8, speed: { cruise: 105, attack: 95, max: 140 }, accel: 6, turnRate: 0.22, altitude: 380,
    weapons: [], vision: 2000, flares: 60, capacity: 18, crew: 4,
  },
  recon_uav: {
    cat: 'air', aclass: 'uav', names: ['RQ-9 Overwatch UAV', 'Orlan-K UAV'], hp: 45, cost: 2,
    armor: 0, speed: { cruise: 34, attack: 30, max: 45 }, accel: 4, turnRate: 0.4, altitude: 450,
    weapons: [], vision: 2600, crew: 0,
  },
  fpv_drone: {
    cat: 'air', aclass: 'drone', names: ['FPV Strike Drone', 'FPV Strike Drone'], hp: 6, cost: 0,
    armor: 0, speed: { cruise: 26, attack: 38, max: 42 }, accel: 22, turnRate: 4, altitude: 22,
    weapons: [], vision: 900, crew: 0, warhead: 'drone_warhead', battery: 300,
  },
};

for (const [id, d] of Object.entries(UNIT_DEFS)) d.id = id;

export function unitName(def, faction) {
  return def.names[faction] || def.names[0];
}

// Target class used for weapon suitability ('inf' | 'light' | 'armor' | 'air' | 'drone').
export function targetClassOf(def) {
  if (def.cat === 'inf') return 'inf';
  if (def.cat === 'veh') return def.vclass === 'armor' ? 'armor' : 'light';
  if (def.aclass === 'drone') return 'drone';
  return 'air';
}

// Squad templates (infantry roles in order; leader first).
export const SQUADS = {
  rifle: ['leader', 'rifleman', 'mg', 'grenadier', 'at', 'rifleman', 'rifleman', 'rifleman'],
  assault: ['leader', 'rifleman', 'grenadier', 'rifleman', 'at', 'mg', 'rifleman'],
  weapons: ['leader', 'mg', 'mg', 'atgm', 'rifleman', 'grenadier'],
  atgm_team: ['atgm', 'rifleman'],
  sniper_team: ['sniper', 'rifleman'],
  aa_team: ['manpads', 'rifleman'],
  drone_team: ['drone_op', 'rifleman'],
  para: ['leader', 'rifleman', 'mg', 'at', 'rifleman', 'grenadier', 'rifleman', 'rifleman', 'rifleman'],
  heli_squad: ['leader', 'rifleman', 'mg', 'at', 'grenadier', 'rifleman', 'rifleman', 'rifleman'],
};
