// STUB — replaced by the Match agent (match flow, plane, parachute, zone, teams, results).
import type { GameContext } from '../core/GameContext';
import type { IMatch, IZone, MatchConfig } from '../core/contracts';

export async function installMatch(ctx: GameContext): Promise<void> {
  const zone: IZone = {
    phase: 0, state: 'idle', current: { x: 1536, z: 1536, radius: 3000 }, next: null, timeRemaining: 0, damagePerSecond: 0,
    isInside: () => true, distanceOutside: () => 0,
  };
  let config: MatchConfig | null = null;
  const match: IMatch = {
    get config() { return config!; },
    state: 'lobby', time: 0, player: null, combatants: [], killFeed: [], planePath: null, result: null,
    aliveCount: () => 0, aliveTeams: () => 0, teammates: () => [], shouldKnock: () => false,
    stats: () => ({ kills: 0, knocks: 0, damage: 0 }),
    async start(cfg) { config = cfg; },
  };
  ctx.zone = zone;
  ctx.match = match;
}
