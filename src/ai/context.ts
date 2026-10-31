import type { Fighter } from '../sim/fighter';
import type { Simulation } from '../sim/simulation';
import type { Traits } from '../sim/types';
import type { OpponentModel } from './model';
import type { Snap, Threat } from './perception';

export type PlanKind = 'probe' | 'rushdown' | 'zone' | 'bait' | 'turtle' | 'charge' | 'ambush' | 'recover' | 'ultimate' | 'corner';

export const PLAN_NAMES: Record<PlanKind, string> = {
  probe: 'Probing',
  rushdown: 'Rushdown',
  zone: 'Zoning',
  bait: 'Baiting',
  turtle: 'Fortress',
  charge: 'Gathering Power',
  ambush: 'Ambush',
  recover: 'Regrouping',
  ultimate: 'Hunting an Opening',
  corner: 'Cornering',
};

/** Everything a brain knows when deciding this tick. */
export interface AICtx {
  sim: Simulation;
  me: Fighter;
  opp: Fighter;
  /** Delayed (perceived) opponent snapshot. */
  ov: Snap;
  delay: number;
  /** Perceived horizontal distance / vertical offset (opp.y - me.y). */
  dist: number;
  dy: number;
  toward: 1 | -1;
  threats: Threat[];
  /** Ticks the opponent remains open to punishment (0 if not). */
  openFor: number;
  oppRecovering: boolean;
  oppAirborne: boolean;
  oppKnockdown: boolean;
  oppCharging: boolean;
  oppBlocking: boolean;
  oppCounter: boolean;
  oppReflect: boolean;
  oppShield: boolean;
  oppPhase: boolean;
  oppStunned: boolean;
  oppFrozen: boolean;
  myHp: number;
  oppHp: number;
  hpLead: number;
  cornered: boolean;
  oppCornered: boolean;
  /** Distance from me to the wall behind me. */
  wallBehind: number;
  plan: PlanKind;
  model: OpponentModel;
  traits: Traits;
  time: number;
  /** Opponent's weapon ideal range (their comfort zone). */
  oppThreatRange: number;
  myRange: number;
}
