// Wires the AI into a World: cover points, faction intel, a brain for every
// unit spawned, and one commander per faction that deploys its army.

import { CoverSystem } from './cover.js';
import { FactionIntel } from './intel.js';
import { Commander, DEFAULT_ARMY } from './commander.js';
import { InfantryBrain } from './infantry.js';
import { VehicleBrain, ArtilleryBrain } from './vehicle.js';
import { AttackHeliBrain, TransportHeliBrain, JetBrain, PlaneBrain, UavBrain, DroneBrain } from './air.js';
import { resetCallsigns } from './squad.js';

export { DEFAULT_ARMY };

// Army sizes and ticket pools for a battle. Assaulting a prepared defence
// needs local superiority, so the attacker fields a larger force with a deeper
// reinforcement pool; meeting engagements are symmetric.
export function planForces(map, size, mix = {}) {
  const base = { ...DEFAULT_ARMY, ...mix, size, reinforcements: true };
  const att = map.attacker;
  if (att < 0) {
    const t = Math.round(size * 2.4);
    return { armies: [base, base], tickets: [t, t] };
  }
  const armies = [];
  const tickets = [];
  for (const f of [0, 1]) {
    const attacker = f === att;
    armies[f] = { ...base, size: Math.round(size * (attacker ? 1.3 : 0.8)) };
    tickets[f] = Math.round(size * (attacker ? 3 : 1.8));
  }
  return { armies, tickets };
}

export function createBrain(u) {
  if (u.cat === 'inf') return new InfantryBrain(u);
  if (u.cat === 'veh') return u.def.artillery ? new ArtilleryBrain(u) : new VehicleBrain(u);
  switch (u.type) {
    case 'attack_heli':
      return new AttackHeliBrain(u);
    case 'transport_heli':
      return new TransportHeliBrain(u);
    case 'jet':
      return new JetBrain(u);
    case 'transport_plane':
      return new PlaneBrain(u);
    case 'recon_uav':
      return new UavBrain(u);
    case 'fpv_drone':
      return new DroneBrain(u);
    default:
      return null;
  }
}

// armies: [settingsForCoalition, settingsForFederation]
export function attachAI(world, armies = [DEFAULT_ARMY, DEFAULT_ARMY]) {
  resetCallsigns();
  world.cover = new CoverSystem(world);
  world.cover.build(world.map);
  for (const f of world.factions) f.intel = new FactionIntel(world, f.id);
  world.brainFactory = (u) => createBrain(u);
  for (const f of world.factions) f.commander = new Commander(world, f.id, armies[f.id] || DEFAULT_ARMY);
  for (const f of world.factions) f.commander.deployInitial();
}
