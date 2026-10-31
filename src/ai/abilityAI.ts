import type { AbilityId, ActionRequest } from '../sim/types';
import type { AICtx } from './context';

/**
 * Tactical knowledge of every ability: when it is a good idea, how to aim it, and why.
 * Scores are utilities on roughly the same scale as melee options (≈1 = solid choice now).
 */
export interface AbilityChoice {
  score: number;
  req: ActionRequest;
  why: string;
}

type Scorer = (c: AICtx, id: string) => AbilityChoice | null;

const between = (v: number, lo: number, hi: number) => v >= lo && v <= hi;
const imminent = (c: AICtx, within: number) => c.threats.find((t) => t.eta <= within);
const projThreat = (c: AICtx, lo: number, hi: number) => c.threats.find((t) => t.kind === 'projectile' && t.eta >= lo && t.eta <= hi);
const bigThreat = (c: AICtx, within: number) => c.threats.find((t) => t.eta <= within && (t.damage >= 140 || t.unblockable));
const underPressure = (c: AICtx) => c.dist < 170 && (c.me.state === 'block' || c.me.guard < 45 || c.threats.some((t) => t.kind === 'melee'));
const opp = (c: AICtx) => c.opp;

function req(id: string, extra: Partial<ActionRequest> = {}): ActionRequest {
  return { id, ...extra };
}

const S: Record<AbilityId, Scorer> = {
  /* ---------------------------- mobility ---------------------------- */
  phantomStep: (c, id) => {
    if (c.oppCounter) return null;
    if (underPressure(c)) return { score: 1.1 + c.traits.trickery * 0.4, req: req(id), why: 'escapePressure' };
    if (!between(c.dist, 170, 950)) return null;
    let s = 0.35 + c.traits.trickery * 0.6;
    if (c.plan === 'ambush') s += 0.7;
    if (c.plan === 'rushdown') s += 0.3;
    if (c.oppBlocking) s += 0.3;
    if (c.oppCharging) s += 0.9;
    if (c.ov.action && c.ov.action.kind === 'ability' && c.openFor > 10) s += 0.8;
    return { score: s, req: req(id), why: 'crossup' };
  },
  flashCut: (c, id) => {
    if (c.openFor >= 12 && between(c.dist, 50, 330)) return { score: 2.0, req: req(id), why: 'punish' };
    const p = projThreat(c, 7, 14);
    if (p && c.dist < 340) return { score: 1.4, req: req(id), why: 'throughProjectile' };
    if (c.oppCharging && c.dist < 340) return { score: 1.8, req: req(id), why: 'interruptCharge' };
    if (c.plan === 'rushdown' && between(c.dist, 200, 320)) return { score: 0.5 + c.traits.risk * 0.5, req: req(id), why: 'gapclose' };
    return null;
  },
  voidGate: (c, id) => {
    const half = c.sim.arena.halfWidth;
    if ((c.cornered && c.dist < 300) || (c.myHp < 0.35 && c.dist < 220) || bigThreat(c, 14)) {
      const awayX = c.me.x > 0 ? -half * 0.55 : half * 0.55;
      return { score: 1.3, req: req(id, { aim: { x: awayX, y: 0 } }), why: 'escape' };
    }
    if ((c.plan === 'ambush' || c.plan === 'rushdown') && c.dist > 320 && !c.oppAirborne) {
      return { score: 0.6 + c.traits.trickery * 0.5, req: req(id, { aim: { x: opp(c).x, y: -330 } }), why: 'dive' };
    }
    if (c.oppCharging) return { score: 1.2, req: req(id, { aim: { x: opp(c).x + c.toward * 90, y: 0 } }), why: 'interruptCharge' };
    return null;
  },
  galeAscent: (c, id) => {
    if (underPressure(c)) return { score: 1.2 + c.traits.defense * 0.3, req: req(id, { aim: { x: c.me.x - c.toward * 100, y: 0 } }), why: 'escapePressure' };
    const z = c.threats.find((t) => t.kind === 'zone' && t.low && t.eta < 20);
    if (z) return { score: 1.3, req: req(id, { aim: { x: c.me.x + z.escapeDir * 100, y: 0 } }), why: 'evade' };
    if (c.oppAirborne && c.dist < 180 && c.dy < -60) return { score: 0.9, req: req(id), why: 'antiAir' };
    return null;
  },
  mirage: (c, id) => {
    if (c.oppCounter || !between(c.dist, 150, 650)) return null;
    let s = 0.3 + c.traits.trickery * 0.7;
    const reactive = c.model.defense.p('parry') + c.model.defense.p('dodge') + c.model.defense.p('attack');
    s += reactive * 0.8 * c.model.confidence(c.model.defense);
    if (c.plan === 'ambush' || c.plan === 'rushdown') s += 0.4;
    return { score: s, req: req(id), why: 'deception' };
  },

  /* ----------------------------- ranged ----------------------------- */
  barrage: (c, id) => {
    if (c.dist < 320 || c.oppReflect || c.oppShield) return null;
    let s = 0.35 + c.traits.zoning * 0.8;
    if (c.plan === 'zone') s += 0.6;
    if (c.oppCharging) s += 1.0;
    if (c.openFor > 20) s += 0.5;
    if (imminent(c, 14)) s -= 1;
    return { score: s, req: req(id), why: 'zoning' };
  },
  crescentWave: (c, id) => {
    if (c.dist < 260 || c.oppReflect) return null;
    let s = 0.35 + c.traits.zoning * 0.7;
    if (c.plan === 'zone') s += 0.5;
    if (c.openFor > 18) s += 0.6;
    if (c.oppCharging) s += 0.9;
    if (imminent(c, 16)) s -= 1;
    return { score: s, req: req(id), why: 'zoning' };
  },
  seekerOrbs: (c, id) => {
    if (c.dist < 300 || c.oppReflect) return null;
    let s = 0.3 + c.traits.zoning * 0.6;
    if (c.plan === 'zone') s += 0.5;
    if (c.plan === 'rushdown' && c.dist > 500) s += 0.4; // cover for an approach
    s += (c.model.defense.p('dodge') + c.model.defense.p('jump')) * 0.5;
    if (imminent(c, 18)) s -= 1;
    return { score: s, req: req(id), why: 'zoning' };
  },
  starfall: (c, id) => {
    if (c.dist < 380 && !c.oppKnockdown) return null;
    let s = 0.3 + c.traits.zoning * 0.7;
    if (c.oppKnockdown) s += 0.9;
    if (c.oppCharging) s += 1.2;
    if (c.plan === 'zone') s += 0.4;
    if (imminent(c, 20)) s -= 1.2;
    return { score: s, req: req(id), why: 'setup' };
  },
  thunderJudgment: (c, id) => {
    if (c.dist < 320 && !c.oppKnockdown) return null;
    let s = 0.3 + c.traits.zoning * 0.7;
    if (c.oppKnockdown) s += 0.8;
    if (c.oppCharging) s += 1.2;
    if (c.oppAirborne) s += 0.3;
    if (c.plan === 'zone') s += 0.4;
    if (imminent(c, 18)) s -= 1.2;
    return { score: s, req: req(id), why: 'zoning' };
  },
  spikeEruption: (c, id) => {
    if (!between(c.dist, 120, 1000) || c.oppAirborne) return null;
    let s = 0.35 + c.traits.zoning * 0.6;
    if (c.openFor > 16) s += 0.7;
    if (c.oppCharging) s += 0.8;
    if (imminent(c, 16)) s -= 1;
    return { score: s, req: req(id), why: 'zoning' };
  },
  gravityOrb: (c, id) => {
    if (!between(c.dist, 200, 950)) return null;
    let s = 0.35 + c.traits.zoning * 0.4 + c.traits.trickery * 0.2;
    if (c.plan === 'rushdown' || c.plan === 'ambush') s += 0.4;
    if (c.oppCharging) s += 0.6;
    if (imminent(c, 18)) s -= 1;
    return { score: s, req: req(id), why: 'trap' };
  },

  /* ----------------------------- special ---------------------------- */
  annihilationBeam: (c, id) => {
    if (c.oppReflect) return null;
    const theirBeam = c.threats.find((t) => t.kind === 'beamCharge');
    if (theirBeam) return { score: 1.3 + c.traits.risk * 0.5, req: req(id, { hold: 0 }), why: 'answerBeam' };
    if (c.dist < 300) return null;
    let s = 0.2 + c.traits.zoning * 0.5;
    if (c.openFor >= 36) s += 1.6;
    if (c.oppCharging) s += 1.4;
    if (c.plan === 'zone') s += 0.3;
    if (imminent(c, 30)) s -= 1.5;
    const hold = c.dist > 900 && !imminent(c, 60) ? Math.round(10 + c.traits.patience * 15) : 0;
    return { score: s, req: req(id, { hold }), why: 'beam' };
  },
  bindingChains: (c, id) => {
    if (!between(c.dist, 140, 1000) || c.oppPhase) return null;
    let s = 0.35 + c.traits.trickery * 0.3 + c.traits.aggression * 0.2;
    if (c.plan === 'rushdown' || c.plan === 'ambush') s += 0.4;
    if (c.openFor > 20) s += 0.6;
    if (c.oppCharging) s += 0.9;
    if (imminent(c, 18)) s -= 1;
    return { score: s, req: req(id), why: 'bind' };
  },
  dimensionRend: (c, id) => {
    if (!between(c.dist, 180, 1400)) return null;
    let s = 0.3 + c.traits.zoning * 0.5;
    if (c.oppCharging || c.openFor > 30) s += 1.0;
    if (c.oppKnockdown) s += 0.5;
    if (c.plan === 'zone') s += 0.3;
    if (imminent(c, 18)) s -= 1;
    return { score: s, req: req(id), why: 'trap' };
  },
  titanSlam: (c, id) => {
    if (!between(c.dist, 200, 640)) return null;
    let s = 0.05 + c.traits.aggression * 0.2;
    if (c.openFor >= 26) s += 1.4;
    if (c.oppCharging) s += 1.1;
    if (c.oppKnockdown) s += 0.5;
    if (c.plan === 'rushdown' && c.ov.state === 'action' && c.ov.action?.kind === 'ability') s += 0.6;
    return { score: s, req: req(id), why: c.openFor >= 26 ? 'punish' : 'gapclose' };
  },
  bladeStorm: (c, id) => {
    let s = 0.25 + c.traits.zoning * 0.4;
    if (projThreat(c, 6, 40)) s += 0.8;
    if (c.plan === 'zone' && c.dist > 300) s += 0.5;
    if (c.dist < 200) s -= 0.6;
    return { score: s, req: req(id), why: 'shieldBlades' };
  },
  chronoStop: (c, id) => {
    if (c.oppPhase || c.dist > 760) return null;
    let s = 0.5 + c.traits.trickery * 0.3 + c.traits.aggression * 0.3;
    if (c.threats.some((t) => t.kind === 'beamCharge' || (t.def?.slot === 'ultimate'))) s += 1.6;
    if (c.oppCharging) s += 0.8;
    if (c.dist < 450) s += 0.4;
    if (imminent(c, 22)) s -= 1.5;
    return { score: s, req: req(id), why: 'timeStop' };
  },

  /* ----------------------------- defense ---------------------------- */
  aegis: (c, id) => {
    const t = c.threats.find((x) => (x.kind === 'projectile' || x.kind === 'zone' || x.kind === 'beam' || x.kind === 'beamCharge') && x.eta >= 4 && x.eta <= 34 && x.source !== 'ab.colossus');
    if (t) return { score: 1.3 + c.traits.defense * 0.4, req: req(id), why: 'shield' };
    if (underPressure(c) && c.me.guard < 40) return { score: 0.9, req: req(id), why: 'shieldPressure' };
    return null;
  },
  mirrorWard: (c, id) => {
    const p = c.threats.find((x) => x.kind === 'projectile' && x.eta >= 2 && x.eta <= 14 && x.projectile?.reflectable);
    if (p) return { score: 1.8, req: req(id), why: 'reflect' };
    const b = c.threats.find((x) => (x.kind === 'beam' && x.eta < 10) || (x.kind === 'beamCharge' && x.eta < 6));
    if (b) return { score: 1.5, req: req(id), why: 'reflectBeam' };
    const m = c.threats.find((x) => x.kind === 'melee' && x.eta >= 2 && x.eta <= 5);
    if (m) return { score: 0.7 + c.traits.defense * 0.4, req: req(id), why: 'repel' };
    return null;
  },
  counterStance: (c, id) => {
    const m = c.threats.find((x) => (x.kind === 'melee' || x.kind === 'dash') && x.eta >= 3 && x.eta <= 12);
    if (m) return { score: 1.4 + c.traits.defense * 0.6, req: req(id), why: 'counterRead' };
    const aggressive = c.model.defense.p('attack') * c.model.confidence(c.model.defense) + c.model.edgeAggression.p('attack') * 0.5;
    if (c.dist < 240 && c.dist > 60 && aggressive > 0.35 && !c.threats.some((x) => x.kind === 'projectile')) {
      return { score: 0.5 + aggressive + c.traits.defense * 0.4, req: req(id), why: 'counterTrap' };
    }
    return null;
  },
  phaseShift: (c, id) => {
    const t = bigThreat(c, 10);
    if (t && t.eta >= 1) return { score: 1.8, req: req(id), why: 'phaseBig' };
    if (underPressure(c)) return { score: 0.8, req: req(id), why: 'phasePressure' };
    return null;
  },
  chronoRewind: (c, id) => {
    const h = c.me.history.length > 120 ? c.me.history[c.me.history.length - 120] : null;
    if (!h) return null;
    const lost = h.hp - c.me.hp;
    if (lost >= 110 && !imminent(c, 6)) return { score: 1.2 + lost / 200, req: req(id), why: 'rewind' };
    if (bigThreat(c, 8)) return { score: 1.1, req: req(id), why: 'rewindEscape' };
    return null;
  },
  secondWind: (c, id) => {
    if (c.myHp > 0.6 || c.dist < 620 || c.threats.length > 0) return null;
    return { score: 0.8 + (1 - c.myHp) * 1.2 + c.traits.patience * 0.3, req: req(id), why: 'heal' };
  },

  /* ---------------------------- ultimate ---------------------------- */
  ascension: (c, id) => {
    let s = 1.1 + c.traits.aggression * 0.4;
    if (c.dist > 500) s += 0.3;
    if (imminent(c, 4)) s -= 0.6;
    return { score: s, req: req(id), why: 'ascend' };
  },
  thousandCuts: (c, id) => {
    if (c.oppPhase) return null;
    if (c.openFor >= 14 && between(c.dist, 50, 420)) return { score: 2.6, req: req(id), why: 'punish' };
    const p = projThreat(c, 9, 16);
    if (p && c.dist <= 420) return { score: 1.4, req: req(id), why: 'throughProjectile' };
    if (c.oppCharging && c.dist <= 420) return { score: 2.2, req: req(id), why: 'interruptCharge' };
    return null;
  },
  supernova: (c, id) => {
    if (c.dist > 380) return null;
    if (c.openFor >= 44) return { score: 2.2, req: req(id), why: 'punish' };
    const m = c.threats.find((x) => x.kind === 'melee' && x.eta <= 14);
    if (m) return { score: 1.5 + c.traits.risk * 0.4, req: req(id), why: 'armorThrough' };
    if (c.oppStunned) return { score: 1.6, req: req(id), why: 'stunned' };
    return null;
  },
  heavensLance: (c, id) => {
    let s = 0.6;
    if (c.dist > 350) s += 0.6;
    if (c.oppKnockdown || c.oppCharging || c.oppStunned) s += 1.0;
    if (c.openFor > 40) s += 0.6;
    if (imminent(c, 18)) s -= 1;
    return { score: s, req: req(id), why: 'lance' };
  },
  blackHole: (c, id) => {
    if (!between(c.dist, 160, 1300)) return null;
    let s = 0.9;
    if (c.oppKnockdown || c.oppCharging) s += 0.9;
    if (c.openFor > 40) s += 0.5;
    if (imminent(c, 24)) s -= 1;
    return { score: s, req: req(id), why: 'singularity' };
  },
  colossus: (c, id) => {
    if (c.oppAirborne && c.dy < -160) return null;
    let s = 0.8;
    if (c.openFor > 28 || c.oppCharging || c.oppKnockdown) s += 1.0;
    if (c.dist > 400) s += 0.3;
    if (imminent(c, 30)) s -= 1;
    return { score: s, req: req(id), why: 'colossus' };
  },
  cataclysm: (c, id) => {
    let s = 0.7;
    if (c.dist > 450) s += 0.5;
    if (c.oppCharging || c.oppKnockdown || c.oppStunned) s += 1.0;
    if (c.openFor > 50) s += 0.6;
    if (imminent(c, 38)) s -= 1.2;
    return { score: s, req: req(id), why: 'cataclysm' };
  },
};

export function scoreAbility(id: AbilityId, c: AICtx): AbilityChoice | null {
  return S[id](c, `ab.${id}`);
}
