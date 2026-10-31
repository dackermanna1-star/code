import type { AspectId } from '../core/ids';
import type { AbilityId, ActionKind, FightPhase, ProjectileStyle, Side, WinMethod, ZoneKind } from './types';

/**
 * Events emitted by the simulation each tick. The presentation layer (director, VFX, audio,
 * narration, HUD) reacts to these; the simulation never depends on how they are presented.
 */
export type SimEvent =
  | { type: 'actionStart'; side: Side; id: string; name: string; kind: ActionKind; abilityId?: AbilityId; x: number; y: number }
  | { type: 'swing'; side: Side; id: string; level: number; x: number; y: number; blade: boolean }
  | {
      type: 'hit'; attacker: Side; defender: Side; x: number; y: number; damage: number; level: number;
      counter: boolean; punish: boolean; combo: number; comboDamage: number; source: string; dirX: number;
      launch: boolean; knockdown: boolean; tag?: string; aspect: AspectId; lethal: boolean; armored: boolean;
    }
  | { type: 'block'; attacker: Side; defender: Side; x: number; y: number; damage: number; level: number; guardLeft: number; aspect: AspectId }
  | { type: 'guardBreak'; attacker: Side; defender: Side; x: number; y: number }
  | { type: 'parry'; parrier: Side; attacker: Side; x: number; y: number; perfect: boolean; projectile: boolean }
  | { type: 'clash'; x: number; y: number; heavy: boolean; lock: boolean; a: Side; b: Side }
  | { type: 'dodge'; side: Side; x: number; y: number; perfect: boolean; what: string }
  | { type: 'vanish'; side: Side; x: number; y: number; source: string }
  | { type: 'appear'; side: Side; x: number; y: number; source: string }
  | { type: 'dash'; side: Side; x: number; y: number; dir: number; air: boolean }
  | { type: 'jump'; side: Side; x: number; y: number; double: boolean }
  | { type: 'land'; side: Side; x: number; y: number; heavy: boolean }
  | { type: 'launch'; side: Side; x: number; y: number }
  | { type: 'wallSplat'; side: Side; x: number; y: number; dir: number }
  | { type: 'groundBounce'; side: Side; x: number; y: number }
  | { type: 'knockdown'; side: Side; x: number; y: number }
  | { type: 'tech'; side: Side; x: number; y: number }
  | { type: 'projectile'; side: Side; id: number; style: ProjectileStyle; x: number; y: number; source: string; aspect: AspectId }
  | { type: 'projectileHit'; owner: Side; x: number; y: number; style: ProjectileStyle; aspect: AspectId; blocked: boolean; target: 'fighter' | 'prop' | 'ground' | 'shield' }
  | { type: 'projectileClash'; x: number; y: number; aspectA: AspectId; aspectB: AspectId }
  | { type: 'projectileCut'; side: Side; x: number; y: number; aspect: AspectId }
  | { type: 'reflect'; side: Side; x: number; y: number }
  | { type: 'explosion'; x: number; y: number; r: number; aspect: AspectId | null; owner: Side | null; power: number }
  | { type: 'beamStart'; side: Side; id: number; aspect: AspectId }
  | { type: 'beamEnd'; side: Side; id: number }
  | { type: 'charge'; side: Side; on: boolean }
  | { type: 'zoneWarn'; id: number; kind: ZoneKind; x: number; y: number; r: number; owner: Side | null }
  | { type: 'zoneStrike'; id: number; kind: ZoneKind; x: number; y: number; r: number; owner: Side | null; aspect: AspectId | null }
  | { type: 'buff'; side: Side; id: string; on: boolean }
  | { type: 'timeStop'; side: Side; on: boolean }
  | { type: 'rewind'; side: Side; fromX: number; fromY: number; toX: number; toY: number; healed: number }
  | { type: 'heal'; side: Side; amount: number }
  | { type: 'burst'; side: Side; x: number; y: number }
  | { type: 'propHit'; propId: number; x: number; y: number; power: number }
  | { type: 'propBreak'; propId: number; dir: number; x: number }
  | { type: 'crater'; x: number; r: number }
  | { type: 'seq'; kind: string; beat: string; a: Side; b: Side; x: number; y: number; v?: number; text?: string }
  | { type: 'lastStand'; side: Side; x: number; y: number }
  | { type: 'ultimate'; side: Side; abilityId: AbilityId; name: string }
  | { type: 'transform'; side: Side; on: boolean }
  | { type: 'ko'; winner: Side; loser: Side; method: WinMethod; x: number; y: number; source: string }
  | { type: 'finisher'; winner: Side; loser: Side; kind: string; name: string }
  | { type: 'phase'; phase: FightPhase }
  | { type: 'intent'; side: Side; intent: string; reason: string }
  | { type: 'read'; side: Side; what: string }
  | { type: 'feint'; side: Side; x: number; y: number }
  | { type: 'whiffPunish'; side: Side }
  | { type: 'nearDeath'; side: Side }
  | { type: 'victory'; winner: Side }
  | { type: 'hazard'; kind: ZoneKind; x: number }
  | { type: 'stun'; side: Side; ticks: number; what: string }
  | { type: 'decoy'; side: Side; x: number; y: number; fooled: boolean };

export type SimEventType = SimEvent['type'];
