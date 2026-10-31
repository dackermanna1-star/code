import { Brain } from '../ai/brain';
import { createBattle, type BattleSetup } from '../sim/generator';
import { Simulation } from '../sim/simulation';
import type { FighterDef, FighterStats, Side, WinMethod } from '../sim/types';

/** Construct a simulation with AI brains for both fighters. */
export function createSimulation(setup: BattleSetup, opts: { headless?: boolean; introTicks?: number; timeline?: boolean } = {}): { sim: Simulation; brains: [Brain, Brain] } {
  const brains: [Brain, Brain] = [
    new Brain(0, setup.fighters[0].traits, setup.rngSeeds.brains[0]),
    new Brain(1, setup.fighters[1].traits, setup.rngSeeds.brains[1]),
  ];
  const sim = new Simulation(setup, {
    controllers: brains,
    headless: opts.headless ?? false,
    introTicks: opts.introTicks ?? (opts.headless ? 0 : undefined),
    timeline: opts.timeline ?? false,
  });
  return { sim, brains };
}

export interface BattleResult {
  seed: number;
  winner: Side;
  winnerDef: FighterDef;
  loserDef: FighterDef;
  startSide: [-1 | 1, -1 | 1];
  ticks: number;
  seconds: number;
  method: WinMethod;
  hpLeft: number;
  stats: [FighterStats, FighterStats];
  events: Record<string, number>;
  phase: string;
  lastStands: number;
  timedOut: boolean;
}

/** Run a whole battle without presentation as fast as possible. */
export function runHeadless(seed: number, maxTicks = 60 * 240, overrides?: Partial<{ fighters: [FighterDef, FighterDef] }>): BattleResult {
  const setup = createBattle(seed, overrides);
  const { sim } = createSimulation(setup, { headless: true });
  const counts: Record<string, number> = {};
  let lastStands = 0;
  while (!sim.over && sim.tick < maxTicks) {
    sim.step();
    for (const e of sim.takeEvents()) {
      const k = e.type === 'seq' ? `seq:${e.kind}:${e.beat}` : e.type === 'intent' ? `intent:${e.intent}` : e.type;
      counts[k] = (counts[k] ?? 0) + 1;
      if (e.type === 'lastStand') lastStands++;
    }
  }
  const timedOut = !sim.over;
  if (timedOut) {
    // Should never happen (final clash guarantees an ending) — reported loudly by tests.
    const w: Side = sim.fighters[0].hp >= sim.fighters[1].hp ? 0 : 1;
    sim.winner = w;
    sim.winMethod = 'finalClash';
  }
  const w = sim.winner as Side;
  return {
    seed,
    winner: w,
    winnerDef: setup.fighters[w],
    loserDef: setup.fighters[w === 0 ? 1 : 0],
    startSide: setup.startSide,
    ticks: sim.tick,
    seconds: sim.time,
    method: sim.winMethod ?? 'combo',
    hpLeft: Math.max(0, sim.fighters[w].hp),
    stats: [sim.fighters[0].stats, sim.fighters[1].stats],
    events: counts,
    phase: sim.phase,
    lastStands,
    timedOut,
  };
}
