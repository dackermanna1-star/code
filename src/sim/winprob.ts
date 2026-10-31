import type { Simulation } from './simulation';

/**
 * Live win-probability estimate for fighter 0 (broadcast-style).
 *
 * The model is antisymmetric by construction: every feature is (f0 - f1), there is no bias
 * term, so P0(state) = 1 - P1(mirrored state) and the pre-fight estimate is exactly 50/50.
 * Coefficients were fitted offline by logistic regression on headless battles (tools/balance.ts --fit).
 */
export const WINPROB_COEF = {
  hp: 2.17,
  hpRatio: 2.15,
  energy: 0.32,
  wrath: 0.33,
  guard: 0.08,
  lastStand: 0.49,
  // Fitted value is slightly negative (fighters tend to ascend when behind); clamped for display sanity.
  ascended: 0.05,
};

export function winProbFeatures(sim: Simulation): number[] {
  const [a, b] = sim.fighters;
  const hpA = Math.max(0, a.hp) / a.maxHp, hpB = Math.max(0, b.hp) / b.maxHp;
  const tot = hpA + hpB + 0.15;
  return [
    hpA - hpB,
    (hpA - hpB) / tot,
    (a.energy - b.energy) / 100,
    (a.wrath - b.wrath) / 100,
    (a.guard - b.guard) / 100,
    (a.lastStandUsed ? 0 : 1) - (b.lastStandUsed ? 0 : 1),
    (a.hasBuff('ascended') ? 1 : 0) - (b.hasBuff('ascended') ? 1 : 0),
  ];
}

export function winProbability(sim: Simulation): number {
  if (sim.decided && sim.winner !== null) return sim.winner === 0 ? 1 : 0;
  const x = winProbFeatures(sim);
  const c = WINPROB_COEF;
  const z = c.hp * x[0] + c.hpRatio * x[1] + c.energy * x[2] + c.wrath * x[3] + c.guard * x[4] + c.lastStand * x[5] + c.ascended * x[6];
  return 1 / (1 + Math.exp(-z));
}
