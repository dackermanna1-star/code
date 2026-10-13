// A player (human or bot): movement state, health/armor/money, inventory.

import { createPlayerMove, HULL_STAND, HULL_DUCK, VEC_VIEW } from '../engine/pmove.js';

export const TEAM_T = 'T';
export const TEAM_CT = 'CT';
export const TEAM_SPEC = 'SPEC';

let nextId = 1;

export class Player {
  constructor({ name, team = TEAM_SPEC, skin = null, isBot = false }) {
    this.id = nextId++;
    this.name = name;
    this.team = team;
    this.skin = skin;
    this.isBot = isBot;
    this.isLocal = false;
    this.pm = createPlayerMove();
    this.alive = false;
    this.health = 100;
    this.maxHealth = 100; // (zombie survival: perks raise it, zmods.js; zombies and bosses set their own)
    this.armor = 0;
    this.helmet = false;
    this.money = 800;
    this.defuser = false;
    this.kills = 0;
    this.deaths = 0;
    this.ping = 5 + Math.floor(Math.random() * 30);
    this.weapons = { 1: null, 2: null, 3: null, 4: [], 5: null };
    this.active = null; // current weapon state
    this.lastWeapon = null;
    this.buttons = 0;
    this.prevButtons = 0;
    this.model = null; // PlayerModel
    this.prevOrigin = [0, 0, 0];
    this.renderOrigin = [0, 0, 0];
    this.lastHurt = 0;
    this.lastShot = 0;
    this.velocityModifierTime = 0;
    this.flashUntil = 0;
    this.flashStart = 0;
    this.flashFull = 0;
    this.deathTime = 0;
    this.blind = 0;
    this.fov = 90;
    this.planting = false;
    this.defusing = false;
    this.bot = null;
    this.spawnedThisRound = false;
    this.hasMovedSinceSpawn = false;
    this.aimPitch = 0;
  }

  get origin() { return this.pm.origin; }
  get onGround() { return this.pm.onground; }
  get ducking() { return this.pm.ducking; }

  hull() { return this.pm.ducking ? HULL_DUCK : HULL_STAND; }

  eyePos(out = [0, 0, 0]) {
    const o = this.pm.origin;
    out[0] = o[0]; out[1] = o[1]; out[2] = o[2] + this.pm.viewOfs;
    return out;
  }

  // feet position (bottom of hull)
  feet(out = [0, 0, 0]) {
    const o = this.pm.origin;
    out[0] = o[0]; out[1] = o[1]; out[2] = o[2] + this.hull().mins[2];
    return out;
  }

  get viewAngles() { return this.pm.angles; }

  allWeapons() {
    const l = [];
    for (const s of [1, 2, 3, 5]) if (this.weapons[s]) l.push(this.weapons[s]);
    for (const g of this.weapons[4]) l.push(g);
    return l;
  }

  hasWeapon(id) { return this.allWeapons().some((w) => w.id === id); }
  findWeapon(id) { return this.allWeapons().find((w) => w.id === id) || null; }

  resetForSpawn(pos, yaw) {
    this.pm = createPlayerMove();
    this.pm.origin = pos.slice();
    this.pm.angles = [0, yaw, 0];
    this.pm.viewOfs = VEC_VIEW;
    this.prevOrigin = pos.slice();
    this.renderOrigin = pos.slice();
    this.alive = true;
    this.health = this.maxHealth || 100;
    this.planting = false;
    this.defusing = false;
    this.flashUntil = 0;
    this.blind = 0;
    this.fov = 90;
    this.hasMovedSinceSpawn = false;
    this.downed = null; // zombie survival: on the floor (zdowned.js)
    this.reviving = null;
  }
}
