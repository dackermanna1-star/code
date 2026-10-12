// Shared state for anything alive: player and enemies. Damage application lives in DamageSystem.
import { Body, makeBody } from './physics';

export type DamageType = 'projectile' | 'explosion' | 'fire' | 'ice' | 'electric' | 'slice' | 'drill' | 'melee' | 'toxic' | 'acid' | 'lava' | 'holy' | 'curse' | 'healing' | 'physical';

export type Faction = 'player' | 'hiisi' | 'beast' | 'mage' | 'robot' | 'slime' | 'guardian' | 'neutral';

export interface StatusState {
  onFire: number; // seconds remaining
  wet: number; // stain amounts 0..1
  bloody: number;
  oily: number;
  slimy: number;
  toxic: number;
  drunk: number;
  frozen: number; // seconds
  stunned: number;
  berserk: number;
  regen: number; // seconds of regeneration
  manaRegen: number;
  teleportitis: number;
  polymorph: number;
  poisoned: number;
  cursed: number;
  levitationDisabled: number;
  invuln: number; // seconds of invulnerability frames
}

export function newStatus(): StatusState {
  return {
    onFire: 0, wet: 0, bloody: 0, oily: 0, slimy: 0, toxic: 0, drunk: 0, frozen: 0, stunned: 0, berserk: 0,
    regen: 0, manaRegen: 0, teleportitis: 0, polymorph: 0, poisoned: 0, cursed: 0, levitationDisabled: 0, invuln: 0,
  };
}

let nextId = 1;

export abstract class Creature {
  readonly id = nextId++;
  body: Body;
  hp: number;
  maxHp: number;
  alive = true;
  faction: Faction;
  status: StatusState = newStatus();
  /** Damage multipliers per type (0 = immune, negative = heals). */
  mult: Partial<Record<DamageType, number>> = {};
  /** Material this creature bleeds. */
  bloodMat = 'blood';
  /** Last damage source for kill attribution. */
  lastHitBy: Creature | null = null;
  lastHitTrick = false;
  hurtFlash = 0;
  yaw = 0;
  pitch = 0;
  abstract readonly isPlayer: boolean;

  constructor(x: number, y: number, z: number, hw: number, h: number, hp: number, faction: Faction, stepUp = 0) {
    this.body = makeBody(x, y, z, hw, h, stepUp);
    this.hp = hp;
    this.maxHp = hp;
    this.faction = faction;
  }

  get cx(): number {
    return this.body.x;
  }
  get cy(): number {
    return this.body.y + this.body.h * 0.5;
  }
  get cz(): number {
    return this.body.z;
  }

  /** Approximate head position (aim target). */
  headY(): number {
    return this.body.y + this.body.h * 0.85;
  }

  containsPoint(x: number, y: number, z: number, pad = 0): boolean {
    const b = this.body;
    return (
      x >= b.x - b.hw - pad && x <= b.x + b.hw + pad && y >= b.y - pad && y <= b.y + b.h + pad && z >= b.z - b.hw - pad && z <= b.z + b.hw + pad
    );
  }
}
