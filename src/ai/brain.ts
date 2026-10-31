import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import { C } from '../sim/constants';
import type { SimEvent } from '../sim/events';
import type { Fighter } from '../sim/fighter';
import type { Controller, Simulation } from '../sim/simulation';
import type { AbilitySlot, ActionDef, ActionRequest, Command, Side, Traits } from '../sim/types';
import { emptyCommand } from '../sim/types';
import { ABILITIES } from '../sim/abilities';
import { scoreAbility } from './abilityAI';
import type { AICtx, PlanKind } from './context';
import { OpponentModel, TacticMemory, type OpenerKind, type TeleportPlace } from './model';
import { assessThreats, Perception, snapshot, type Snap, type Threat } from './perception';

/**
 * The fighter AI.
 *
 * Layers (highest priority first):
 *  1. Locked sequences — struggle inputs (blade locks, beam struggles, grabs).
 *  2. Stun — combo bursts, tech/wake-up choices.
 *  3. Busy — hit-confirmed combo routing, cancels, chases.
 *  4. Scheduled — precisely timed parries, reads, meaty attacks.
 *  5. Threat response — block / parry / dodge / interrupt / escape / defensive abilities, scored.
 *  6. Opportunity — whiff punishes and openings.
 *  7. Reads — teleport prediction, anticipated openers, throw anticipation.
 *  8. Plan — tactical intent (probe, rushdown, zone, bait, fortress, ambush, ...), chosen by
 *     utility (traits + situation + opponent model + learned rewards) with softmax randomness.
 */

const MELEE = ['light1', 'heavy', 'launcher', 'sweep', 'thrust', 'throw'] as const;
const AIR = ['air1', 'air2', 'airSlam'] as const;
const SLOTS: AbilitySlot[] = ['mobility', 'ranged', 'special', 'defense', 'ultimate'];

interface Scheduled {
  tick: number;
  req: ActionRequest | null;
  face: number;
  kind: string;
  /** Hold block until the action fires. */
  guard: boolean;
}

interface Option {
  score: number;
  tag: string;
  apply: () => void;
}

export class Brain implements Controller {
  readonly side: Side;
  readonly traits: Traits;
  readonly rng: Rng;
  readonly model: OpponentModel;
  readonly memory: TacticMemory;
  private perc = new Perception();

  plan: PlanKind = 'probe';
  planReason = 'opening';
  private planUntil = 0;
  private planDealt = 0;
  private planTaken = 0;
  private lastPlanEval = -999;

  private moveDir = 0;
  private moveUntil = 0;
  private wantRun = false;
  private blockUntil = 0;
  private blockLow = false;
  private sched: Scheduled | null = null;
  private nextOffense = 0;
  private respondingTo: { key: string; until: number } | null = null;
  private fooled = new Map<number, boolean>();
  private selfRates = new Map<string, { s: number; n: number }>();
  private pendingTactic: { kind: string; tick: number } | null = null;
  private myAttack: { tick: number; resolved: boolean } | null = null;
  private lastHp: number = C.HP;
  private lastOppHp: number = C.HP;
  private readDone = false;
  private slipTried = false;
  private lastIntentTick = -999;
  private oppVanishFrom: { x: number; y: number; myX: number } | null = null;
  private lastOppCombo = 0;
  private chargeLock = 0;
  /** Tempo: no voluntary attack before this tick (rhythm between exchanges). */
  private tempoUntil = 0;
  private comboDrop = 0;
  /** Exposed for HUD / narration. */
  thought = '';

  constructor(side: Side, traits: Traits, seed: number) {
    this.side = side;
    this.traits = traits;
    this.rng = new Rng(seed);
    this.model = new OpponentModel(traits.adaptivity);
    this.memory = new TacticMemory(0.25 + traits.adaptivity * 0.35);
  }

  /* ================================================================== */
  /* Entry point                                                        */
  /* ================================================================== */

  decide(sim: Simulation, me: Fighter): Command {
    const cmd = emptyCommand();
    const opp = sim.opponentOf(me);
    this.perc.push(snapshot(sim, opp));
    this.trackDamage(me, opp);
    const delay = this.reactionDelay(me);
    const ov = this.perc.view(delay);
    this.observeWake(ov);

    if (me.scripted || me.state === 'locked') {
      cmd.struggle = this.struggleInput(sim, me, opp);
      return cmd;
    }
    if (me.inHitstun) {
      cmd.burst = this.wantBurst(sim, me, opp);
      cmd.wake = this.wakeOption(sim, me, opp, true);
      return cmd;
    }
    if (me.state === 'knockdown') {
      cmd.wake = this.wakeOption(sim, me, opp, false);
      return cmd;
    }
    if (me.state === 'dead' || me.state === 'victory' || me.state === 'intro') return cmd;

    const c = this.buildCtx(sim, me, opp, ov, delay);
    this.maybeReplan(c);
    if (!ov.vanished) this.readDone = false;

    if (me.state === 'action') {
      this.busy(c, cmd);
      return cmd;
    }
    if (me.state === 'charge') {
      if (this.keepCharging(c)) cmd.act = { id: 'charge' };
      return cmd;
    }
    if (!me.actionable) {
      cmd.moveX = this.moveDir;
      cmd.run = this.wantRun;
      return cmd;
    }

    // Appeared from a teleport: strike immediately if in reach.
    if (me.state === 'appear' && this.strikeOnAppear(c, cmd)) return cmd;

    // New threats take priority over plans already in motion (scheduled reads, meaties...).
    const threat = this.pickThreat(c);
    if (threat) {
      const keep = this.sched;
      if (this.respond(c, threat, cmd)) {
        if (cmd.act || cmd.block || cmd.jump) {
          if (keep && keep === this.sched) this.sched = null;
        }
        return cmd;
      }
    }
    if (this.sched && this.runScheduled(c, cmd)) return cmd;

    if (this.punish(c, cmd)) return cmd;

    if (this.blockUntil > sim.tick && me.grounded) {
      cmd.block = true;
      cmd.crouch = this.blockLow;
      // Cross-up check: opponent switched sides — re-block facing them (needs a release).
      if (Math.sign(ov.x - me.x) !== me.facing && Math.abs(ov.x - me.x) > 20) {
        cmd.block = false;
        this.blockUntil = sim.tick + 2;
      }
      return cmd;
    }

    if (this.teleportRead(c, cmd)) return cmd;
    if (this.anticipate(c, cmd)) return cmd;
    if (c.oppKnockdown && this.okizeme(c, cmd)) return cmd;
    this.executePlan(c, cmd);
    return cmd;
  }

  /* ================================================================== */
  /* Perception & context                                               */
  /* ================================================================== */

  private reactionDelay(me: Fighter): number {
    let d = this.traits.reaction;
    if (me.hasBuff('blind')) d += 6;
    if (me.hasBuff('ascended')) d -= 1;
    return Math.max(5, d);
  }

  private buildCtx(sim: Simulation, me: Fighter, opp: Fighter, ov: Snap, delay: number): AICtx {
    const half = sim.arena.halfWidth;
    let px = clamp(ov.x + ov.vx * delay * (1 / 60) * 0.7, -half, half);
    let py = Math.min(0, ov.y + ov.vy * delay * (1 / 60) * 0.5);
    // Decoys: a fooled brain tracks the decoy instead of the real fighter.
    const decoy = sim.decoyOf(opp.side);
    if (decoy) {
      if (!this.fooled.has(decoy.id)) {
        const seen = this.model.seen('ab.mirage');
        const p = clamp(0.85 - seen * 0.22 - this.traits.adaptivity * 0.2, 0.15, 0.85);
        const f = this.rng.chance(p);
        this.fooled.set(decoy.id, f);
        sim.emit({ type: 'decoy', side: opp.side, x: decoy.x, y: decoy.y, fooled: f });
      }
      if (this.fooled.get(decoy.id)) {
        px = decoy.x;
        py = decoy.y;
      }
    }
    const dist = Math.abs(px - me.x);
    const dy = py - me.y;
    const toward: 1 | -1 = px >= me.x ? 1 : -1;
    // Threat recognition is a trained reflex: slightly faster than general perception.
    const fastDelay = Math.max(5, delay - 3);
    const threats = assessThreats(sim, me, this.perc.view(fastDelay), fastDelay);

    // How long is the opponent open?
    let openFor = 0;
    let recovering = false;
    if (ov.action && ov.state === 'action') {
      const a = ov.action;
      const frame = ov.actionFrame + delay;
      const total = a.startup + a.active + a.recovery;
      if (frame >= a.startup + a.active) {
        openFor = total - frame + 3;
        recovering = true;
      } else if (a.startup >= 20 && frame < a.startup) {
        openFor = a.startup - frame;
      }
    }
    switch (ov.state) {
      case 'hitstun': case 'launched': case 'guardbreak': case 'parried': case 'stagger': case 'bound': case 'wallsplat':
        openFor = Math.max(openFor, ov.stun - delay);
        break;
      case 'charge':
        openFor = Math.max(openFor, 26);
        break;
      case 'parry':
        if (ov.stateT + delay > C.PARRY_WINDOW + 1) openFor = Math.max(openFor, C.PARRY_T - ov.stateT - delay);
        break;
      default:
        break;
    }
    if (opp.timeFrozen && sim.timeStop) openFor = Math.max(openFor, sim.timeStop.t);
    if (ov.intangible || ov.vanished) openFor = 0;

    const wallBehind = toward > 0 ? me.x + half : half - me.x;
    const oppWallBehind = toward > 0 ? half - px : px + half;
    return {
      sim, me, opp, ov, delay, dist, dy, toward, threats, openFor: Math.max(0, openFor), oppRecovering: recovering,
      oppAirborne: !ov.grounded, oppKnockdown: ov.state === 'knockdown' || ov.state === 'getup', oppCharging: ov.state === 'charge',
      oppBlocking: ov.blocking, oppCounter: ov.counter, oppReflect: ov.reflect, oppShield: ov.shield, oppPhase: ov.phase,
      oppStunned: ov.state === 'bound' || ov.state === 'guardbreak', oppFrozen: opp.timeFrozen,
      myHp: me.hp / me.maxHp, oppHp: ov.hp / opp.maxHp, hpLead: (me.hp - ov.hp) / me.maxHp,
      cornered: wallBehind < 220, oppCornered: oppWallBehind < 260, wallBehind, plan: this.plan, model: this.model,
      traits: this.traits, time: sim.time, oppThreatRange: opp.weapon.idealRange + 30, myRange: me.weapon.idealRange,
    };
  }

  private trackDamage(me: Fighter, opp: Fighter): void {
    const taken = Math.max(0, this.lastHp - me.hp);
    const dealt = Math.max(0, this.lastOppHp - opp.hp);
    this.planTaken += taken;
    this.planDealt += dealt;
    this.lastHp = me.hp;
    this.lastOppHp = opp.hp;
  }

  private rate(key: string): number {
    const r = this.selfRates.get(key);
    return r ? (r.s + 1) / (r.n + 2) : 0.5;
  }
  private recordRate(key: string, success: boolean): void {
    const r = this.selfRates.get(key) ?? { s: 0, n: 0 };
    r.s = r.s * 0.85 + (success ? 1 : 0);
    r.n = r.n * 0.85 + 1;
    this.selfRates.set(key, r);
  }

  private mv(me: Fighter, name: string): ActionDef | undefined {
    return me.actions.get(`${me.def.weapon}.${name}`);
  }

  private inReach(c: AICtx, m: ActionDef, slack = 0): boolean {
    if (c.dist < m.range[0] - 30 - slack || c.dist > m.range[1] + slack) return false;
    if (m.yRange && (c.dy < m.yRange[0] - slack || c.dy > m.yRange[1] + slack)) return false;
    return true;
  }

  /* ================================================================== */
  /* Locked / stunned                                                   */
  /* ================================================================== */

  private struggleInput(sim: Simulation, me: Fighter, opp: Fighter): Command['struggle'] {
    const seq = sim.sequences[0];
    const kind = seq?.kind ?? '';
    if (opp.cmd?.struggle) this.model.struggle.observe(opp.cmd.struggle === 'vanish' ? 'hold' : opp.cmd.struggle, 0.25);
    if (kind === 'throw') {
      if (me.anim?.clip === 'throw.grabbed') {
        const expect = this.model.throwRate.p('throw') * this.model.confidence(this.model.throwRate);
        return this.rng.chance(0.18 + expect * 0.5 + this.traits.precision * 0.1) ? 'slip' : 'hold';
      }
      return null;
    }
    if (kind === 'bladeLock') {
      if (me.energy < 2) return 'hold';
      const pushRate = this.model.struggle.p('push');
      if (!this.slipTried && this.rng.chance(this.traits.trickery * pushRate * 0.035)) {
        this.slipTried = true;
        return 'slip';
      }
      return this.rng.chance(0.85) ? 'push' : 'hold';
    }
    this.slipTried = false;
    if (kind === 'beamStruggle') {
      if (me.energy < 1.5) return 'hold';
      if (me.energy >= 20 && me.hp < 300 && this.rng.chance(0.006 + this.traits.trickery * 0.01)) return 'vanish';
      return this.rng.chance(0.9) ? 'push' : 'hold';
    }
    return 'push';
  }

  private wantBurst(sim: Simulation, me: Fighter, opp: Fighter): boolean {
    if (!me.canMovement('burst')) return false;
    const severity = me.comboHits * 0.12 + me.comboDamage / 220 + (me.hp < 280 ? 0.5 : 0) + (opp.wrath >= 100 ? 0.4 : 0);
    const want = severity * (0.5 + this.traits.defense * 0.5);
    return want > 0.9 && this.rng.chance(0.25);
  }

  private wakeOption(sim: Simulation, me: Fighter, opp: Fighter, airborne: boolean): Command['wake'] {
    if (airborne) return this.rng.chance(0.55 + this.traits.precision * 0.35) ? 'tech' : 'neutral';
    const half = sim.arena.halfWidth;
    const cornered = Math.abs(me.x) > half - 260 && Math.sign(opp.x - me.x) !== Math.sign(me.x);
    const w: [Command['wake'], number][] = [
      ['neutral', 1],
      ['rollF', cornered ? 1.6 : 0.7],
      ['rollB', cornered ? 0.1 : 0.8 + this.traits.patience * 0.3],
    ];
    return this.rng.weightedPairs(w);
  }

  private observeWake(ov: Snap): void {
    if (ov.state === 'getup' && ov.stateT === 1) {
      const me = this.lastMeX;
      const dir = Math.sign(ov.vx);
      const toMe = Math.sign(me - ov.x);
      this.model.wake.observe(dir === 0 ? 'neutral' : dir === toMe ? 'rollF' : 'rollB');
    }
    if (ov.state === 'tech' && ov.stateT === 1) this.model.wake.observe('tech');
  }
  private lastMeX = 0;

  /* ================================================================== */
  /* Busy: combos, cancels, chases                                      */
  /* ================================================================== */

  private busy(c: AICtx, cmd: Command): void {
    const me = c.me;
    const a = me.action!;
    this.lastMeX = me.x;
    if (a.def.kind === 'ability' || a.def.kind === 'universal') {
      // Steer while hovering/firing.
      cmd.moveX = 0;
      return;
    }
    if (a.hasHit || (a.wasBlocked && a.def.cancelOnBlock)) {
      const next = this.comboNext(c);
      if (next) {
        cmd.act = next;
        return;
      }
      if (a.def.jumpCancel && a.hasHit && me.actionPhase !== 'startup' && (c.opp.state === 'launched')) {
        cmd.jump = true;
        cmd.moveX = c.toward;
        return;
      }
    }
    // Air attacks: drift toward the target.
    if (!me.grounded) cmd.moveX = c.toward * 0.6;
  }

  private comboNext(c: AICtx): ActionRequest | null {
    const me = c.me, opp = c.opp, sim = c.sim;
    const a = me.action!;
    if (sim.tick < this.comboDrop) return null;
    if (me.actionPhase === 'startup') return null;
    // True (felt) positions for hit-confirms.
    const dist = Math.abs(opp.x - me.x);
    const dy = opp.y - me.y;
    const oppOpen = opp.inHitstun || opp.state === 'guardbreak';
    // Precision: occasional dropped / late links.
    if (this.rng.chance((1 - this.traits.precision) * 0.06)) {
      this.comboDrop = sim.tick + this.rng.int(3, 9);
      return null;
    }
    const cancels = a.def.cancels ?? [];
    const can = (id: string) => me.canCancelInto(id) && me.canStart(sim, id);
    const reach = (m: ActionDef | undefined, extra = 0) => {
      if (!m) return false;
      const lead = (opp.vx * (m.startup / 60)) * Math.sign(opp.x - me.x);
      const d = dist + lead;
      if (d < m.range[0] - 40 || d > m.range[1] + extra) return false;
      if (m.yRange && (dy + opp.vy * (m.startup / 60) < m.yRange[0] - 20 || dy + opp.vy * (m.startup / 60) > m.yRange[1] + 20)) return false;
      return true;
    };

    if (a.wasBlocked && !a.hasHit) {
      // Blocked: frame trap, cross-up cancel, guard crush, or stop and let them guess.
      if (opp.guard < 30) {
        const hv = this.mv(me, 'heavy');
        if (hv && can(hv.id) && reach(hv)) return { id: hv.id };
      }
      if (can('vanish') && this.rng.chance(this.traits.trickery * 0.12)) {
        this.pendingTactic = { kind: 'crossup', tick: sim.tick };
        return { id: 'vanish', place: 'behind' };
      }
      const nextLight = cancels.find((id) => id.endsWith('light2') || id.endsWith('light3') || id.endsWith('light4'));
      if (nextLight && can(nextLight) && this.rng.chance(0.45 + this.traits.aggression * 0.25)) {
        const hold = this.model.defense.p('attack') > 0.3 ? this.rng.int(2, 8) : 0;
        return { id: nextLight, hold };
      }
      return null;
    }
    if (!oppOpen) return null;

    const opts: [ActionRequest, number][] = [];
    // Ultimate as a combo ender.
    const ult = me.def.abilities.ultimate;
    if (ult === 'thousandCuts' && can('ab.thousandCuts') && dist < 380 && opp.comboDamage < 400) opts.push([{ id: 'ab.thousandCuts' }, 3]);
    if (ult === 'supernova' && can('ab.supernova') && dist < 300 && opp.state === 'guardbreak') opts.push([{ id: 'ab.supernova' }, 2.5]);
    // Weapon chain / launcher / heavy.
    for (const id of cancels) {
      if (id.startsWith('*') || id === 'kiblast' || id === 'vanish') continue;
      const m = me.actions.get(id);
      if (!m || !can(id) || !reach(m)) continue;
      let s = (m.hit?.damage ?? 0) / 60;
      if (m.kind === 'launcher' && opp.grounded && opp.comboHits < 5) s += 1.2;
      if (m.kind === 'heavy' && c.oppCornered) s += 0.8;
      if (m.kind === 'light') s += 0.5;
      if (m.kind === 'airSlam' && opp.comboHits >= 3) s += 0.6;
      if (opp.juggle >= C.JUGGLE_LIMIT - 1 && m.kind !== 'airSlam') s -= 1;
      opts.push([{ id }, s]);
    }
    // Ability extenders: projectiles at launched opponents, chains, beams.
    if (cancels.includes('*ability')) {
      for (const slot of ['ranged', 'special', 'mobility'] as AbilitySlot[]) {
        const ab = me.def.abilities[slot];
        const id = `ab.${ab}`;
        if (!can(id)) continue;
        let s = 0;
        switch (ab) {
          case 'crescentWave': case 'spikeEruption': s = dist > 120 && dist < 700 ? 1.3 : 0; break;
          case 'barrage': s = dist > 150 ? 1.1 : 0.3; break;
          case 'annihilationBeam': s = opp.state === 'launched' && dist > 200 && me.energy > 60 ? 1.2 : 0; break;
          case 'bindingChains': s = opp.grounded ? 0.9 : 0; break;
          case 'flashCut': s = dist < 300 ? 1.2 : 0; break;
          case 'phantomStep': s = opp.state === 'launched' && dist > 160 ? 0.9 : 0; break;
          case 'titanSlam': s = opp.state === 'launched' && dist < 500 ? 0.8 : 0; break;
          case 'thunderJudgment': case 'starfall': s = opp.pendingKnockdown ? 0.7 : 0; break;
          default: s = 0;
        }
        if (s > 0) opts.push([{ id }, s * (0.6 + me.energy / 140)]);
      }
    }
    if (cancels.includes('kiblast') && can('kiblast') && dist > 140) opts.push([{ id: 'kiblast' }, 0.5]);
    if (opts.length === 0) return null;
    const i = this.rng.softmaxIndex(opts.map((o) => o[1]), 0.35);
    return opts[i][0];
  }

  /* ================================================================== */
  /* Scheduled actions                                                  */
  /* ================================================================== */

  private schedule(tick: number, req: ActionRequest | null, kind: string, face = 0, guard = false): void {
    this.sched = { tick, req, face, kind, guard };
  }

  private runScheduled(c: AICtx, cmd: Command): boolean {
    const s = this.sched!;
    const sim = c.sim;
    if (sim.tick > s.tick + 6) {
      this.sched = null;
      return false;
    }
    if (sim.tick < s.tick) {
      if (s.guard && c.me.grounded) {
        cmd.block = true;
        cmd.crouch = this.blockLow;
      }
      if (s.face) cmd.face = s.face;
      return true;
    }
    this.sched = null;
    if (!s.req) return false;
    if (!c.me.canStart(sim, s.req.id)) return false;
    const def = c.me.actions.get(s.req.id);
    if (def && def.hitbox && s.kind !== 'cut' && s.kind !== 'meet' && !s.kind.startsWith('read')) {
      // Re-validate: the opponent may have moved out of reach.
      if (c.dist > def.range[1] + 25 || c.ov.intangible) return false;
    }
    cmd.act = s.req;
    if (s.face) cmd.face = s.face;
    this.pendingTactic = { kind: s.kind, tick: sim.tick };
    return true;
  }

  private strikeOnAppear(c: AICtx, cmd: Command): boolean {
    const me = c.me;
    if (me.stateT < C.APPEAR_LOCK) return false;
    const opts: [string, number][] = [];
    const list = me.grounded ? MELEE : AIR;
    for (const name of list) {
      const m = this.mv(me, name);
      if (!m || !me.canStart(c.sim, m.id) || !this.inReach(c, m, 20)) continue;
      if (m.kind === 'throw' && !c.oppBlocking) continue;
      let s = (m.hit?.damage ?? 0) / 60 - m.startup / 20;
      if (m.kind === 'launcher' || m.kind === 'airSlam') s += 0.5;
      opts.push([m.id, s]);
    }
    if (!opts.length) return false;
    cmd.act = { id: opts[this.rng.softmaxIndex(opts.map((o) => o[1]), 0.4)][0] };
    this.pendingTactic = { kind: 'teleportStrike', tick: c.sim.tick };
    return true;
  }

  /* ================================================================== */
  /* Threat response                                                    */
  /* ================================================================== */

  private pickThreat(c: AICtx): Threat | null {
    for (const t of c.threats) {
      const horizon = t.kind === 'zone' ? 46 : t.kind === 'beamCharge' ? 40 : t.kind === 'timestop' ? 24 : t.kind === 'projectile' ? 20 : t.kind === 'beam' ? 14 : 14;
      if (t.eta > horizon) continue;
      const key = `${t.kind}:${t.source}:${t.projectile?.id ?? t.zone?.id ?? ''}`;
      if (this.respondingTo && this.respondingTo.key === key && this.respondingTo.until > c.sim.tick) continue;
      return t;
    }
    return null;
  }

  private fastestReaching(c: AICtx): ActionDef | null {
    let best: ActionDef | null = null;
    for (const name of c.me.grounded ? MELEE : AIR) {
      const m = this.mv(c.me, name);
      if (!m || m.kind === 'throw' || !c.me.canStart(c.sim, m.id) || !this.inReach(c, m)) continue;
      if (!best || m.startup < best.startup) best = m;
    }
    return best;
  }

  private respond(c: AICtx, t: Threat, cmd: Command): boolean {
    const me = c.me, sim = c.sim, P = this.traits;
    const opts: Option[] = [];
    const dmg = t.damage / 100;
    const key = `${t.kind}:${t.source}:${t.projectile?.id ?? t.zone?.id ?? ''}`;
    const commit = (until: number) => {
      this.respondingTo = { key, until: sim.tick + until };
    };
    const blockable = !t.unblockable && t.kind !== 'throw';
    const canBlock = me.grounded && blockable;
    const parryTiming = (extraSigma: number): number => {
      const sigma = 0.8 + (1 - P.precision) * 3 + extraSigma;
      return clamp(1 - sigma / 9, 0.12, 0.93);
    };

    // ---- Defensive abilities (any threat).
    for (const slot of ['defense', 'mobility'] as AbilitySlot[]) {
      const id = me.def.abilities[slot];
      const def = ABILITIES[id].def;
      if (!me.canStart(sim, def.id)) continue;
      const sc = scoreAbility(id, c);
      if (sc && sc.score > 0.75) {
        opts.push({ score: sc.score, tag: `ab:${id}`, apply: () => { cmd.act = sc.req; commit(20); } });
      }
    }

    switch (t.kind) {
      case 'melee':
      case 'dash': {
        if (canBlock) {
          const low = t.height === 'low';
          const guardCost = t.def?.hit?.guard ?? 20;
          const guardRisk = me.guard < guardCost * 1.3 ? 0.9 : 0;
          opts.push({
            score: 0.7 + P.defense * 0.4 - guardRisk + (t.height === 'mid' ? 0.1 : 0), tag: 'block',
            apply: () => {
              this.blockLow = low;
              this.blockUntil = sim.tick + t.eta + (t.def?.active ?? 4) + 8;
              cmd.block = true;
              cmd.crouch = low;
              commit(t.eta + 6);
            },
          });
        }
        if (me.grounded && t.eta >= 2 && blockable) {
          const feintRisk = this.model.feints.p('feint') * this.model.confidence(this.model.feints) * (t.def?.feintable ? 1 : 0);
          const pS = parryTiming((t.chargeable ? 2.4 : 0)) * (1 - feintRisk * 0.6);
          opts.push({
            score: pS * (1.25 + P.defense * 0.8) - (1 - pS) * dmg * 1.1, tag: 'parry',
            apply: () => {
              const noise = this.rng.gaussian(0, 0.8 + (1 - P.precision) * 2.4);
              const at = sim.tick + Math.max(0, Math.round(t.eta - 3 + noise));
              if (at <= sim.tick) cmd.act = { id: 'parry' };
              else this.schedule(at, { id: 'parry' }, 'parry', 0, false);
              commit(t.eta + 4);
            },
          });
        }
        if (me.grounded && t.eta >= 2) {
          const pS = parryTiming(-1.5);
          const through = c.dist < 150 && (c.cornered || this.rng.chance(P.trickery * 0.5));
          opts.push({
            score: pS * (0.85 + P.trickery * 0.45) - (1 - pS) * dmg, tag: 'dodge',
            apply: () => {
              const id = through ? 'rollF' : this.rng.chance(0.5) ? 'rollB' : 'dodge';
              const at = sim.tick + Math.max(0, t.eta - 4);
              if (at <= sim.tick) cmd.act = { id };
              else this.schedule(at, { id }, 'dodge');
              commit(t.eta + 4);
            },
          });
        }
        if (me.grounded && t.def && c.dist > t.def.range[1] - 80 && c.wallBehind > 180) {
          opts.push({ score: 0.85 + P.patience * 0.4, tag: 'backdash', apply: () => { cmd.act = { id: 'dashB' }; commit(12); } });
        }
        const f = this.fastestReaching(c);
        if (f && f.startup + 1 < t.eta) {
          opts.push({ score: 1.15 + P.aggression * 0.45 + P.risk * 0.2, tag: 'interrupt', apply: () => { cmd.act = { id: f.id }; this.pendingTactic = { kind: 'interrupt', tick: sim.tick }; commit(10); } });
        }
        // Meet the strike head-on: swing so the blades collide (clash).
        if (me.grounded && t.def && t.kind === 'melee' && t.def.kind !== 'throw') {
          const meet = this.mv(me, t.def.kind === 'heavy' || t.def.kind === 'dashAttack' ? 'heavy' : 'light1');
          if (meet && me.canStart(sim, meet.id) && meet.startup <= t.eta + 3) {
            opts.push({
              score: 0.75 + P.aggression * 0.35 + P.precision * 0.25 + (me.weapon.blade ? 0.15 : 0), tag: 'meet',
              apply: () => {
                const at = sim.tick + Math.max(0, t.eta - meet.startup);
                if (at <= sim.tick) cmd.act = { id: meet.id };
                else this.schedule(at, { id: meet.id }, 'meet');
                commit(t.eta + 6);
              },
            });
          }
        }
        if (me.grounded && t.low) opts.push({ score: 1.15, tag: 'jump', apply: () => { cmd.jump = true; cmd.moveX = c.toward * 0.5; commit(16); } });
        if (me.canStart(sim, 'vanish') && (dmg > 0.75 || me.guard < 25)) {
          opts.push({ score: 0.5 + P.trickery * 0.5 + dmg * 0.3, tag: 'vanish', apply: () => { cmd.act = { id: 'vanish', place: this.rng.chance(0.6) ? 'behind' : 'away' }; commit(16); } });
        }
        break;
      }
      case 'throw': {
        if (me.grounded) opts.push({ score: 1.0, tag: 'jump', apply: () => { cmd.jump = true; cmd.moveX = -c.toward * 0.6; commit(14); } });
        if (me.grounded && c.wallBehind > 160) opts.push({ score: 0.9, tag: 'backdash', apply: () => { cmd.act = { id: 'dashB' }; commit(12); } });
        const f = this.fastestReaching(c);
        if (f && f.startup < t.eta + 2) opts.push({ score: 1.1, tag: 'interrupt', apply: () => { cmd.act = { id: f.id }; commit(8); } });
        const th = this.mv(me, 'throw');
        if (th && me.canStart(sim, th.id) && t.eta <= 3) opts.push({ score: 0.8, tag: 'tech', apply: () => { cmd.act = { id: th.id }; commit(8); } });
        break;
      }
      case 'projectile': {
        const p = t.projectile!;
        if (canBlock) opts.push({ score: 0.6 + P.defense * 0.35 - dmg * 0.12, tag: 'block', apply: () => { this.blockLow = false; this.blockUntil = sim.tick + t.eta + 6; cmd.block = true; commit(t.eta + 4); } });
        if (me.grounded && t.eta >= 2) {
          const pS = parryTiming(0.6);
          opts.push({
            score: pS * (1.0 + P.defense * 0.6) - (1 - pS) * dmg * 0.8, tag: 'parry',
            apply: () => {
              const at = sim.tick + Math.max(0, Math.round(t.eta - 2 + this.rng.gaussian(0, 0.6 + (1 - P.precision) * 2)));
              if (at <= sim.tick) cmd.act = { id: 'parry' };
              else this.schedule(at, { id: 'parry' }, 'parry');
              commit(t.eta + 4);
            },
          });
        }
        if (me.grounded && t.low) opts.push({ score: 1.05, tag: 'jump', apply: () => { cmd.jump = true; cmd.moveX = c.toward * 0.7; commit(t.eta + 10); } });
        if (t.slashable && me.grounded && p.y < me.y - 55 && p.y > me.y - 105) {
          const l1 = this.mv(me, 'light1');
          if (l1 && me.canStart(sim, l1.id) && t.eta >= l1.startup) {
            opts.push({
              score: 0.75 + P.aggression * 0.3 + P.precision * 0.3, tag: 'cut',
              apply: () => {
                const at = sim.tick + Math.max(0, t.eta - l1.startup - 1);
                this.schedule(at, { id: l1.id }, 'cut', Math.sign(p.x - me.x) || me.facing);
                commit(t.eta + 4);
              },
            });
          }
        }
        if (me.grounded && t.eta >= 3) opts.push({ score: 0.55 + P.trickery * 0.3, tag: 'roll', apply: () => { this.schedule(sim.tick + Math.max(0, t.eta - 4), { id: 'rollF' }, 'dodge'); commit(t.eta + 4); } });
        if (me.canStart(sim, 'kiblast') && t.eta >= 14) opts.push({ score: 0.45, tag: 'counterfire', apply: () => { cmd.act = { id: 'kiblast' }; commit(12); } });
        if (!me.grounded && me.canMovement('airdashF')) opts.push({ score: 0.6, tag: 'airdash', apply: () => { cmd.act = { id: this.rng.chance(0.5) ? 'airdashF' : 'airdashB', place: undefined }; commit(10); } });
        if (dmg < 0.3 && c.dist > 700) opts.push({ score: 0.35, tag: 'ignore', apply: () => commit(t.eta + 2) });
        break;
      }
      case 'beam': {
        if (me.grounded) opts.push({ score: 1.0, tag: 'jump', apply: () => { cmd.jump = true; cmd.moveX = c.toward * 0.6; commit(14); } });
        if (canBlock) opts.push({ score: 0.55 + P.defense * 0.3, tag: 'block', apply: () => { this.blockUntil = sim.tick + 30; this.blockLow = false; cmd.block = true; commit(30); } });
        if (me.canStart(sim, 'vanish')) opts.push({ score: 0.9 + P.trickery * 0.3, tag: 'vanish', apply: () => { cmd.act = { id: 'vanish', place: 'behind' }; commit(16); } });
        if (!me.grounded && me.canMovement('airdashF')) opts.push({ score: 0.7, tag: 'airdash', apply: () => { cmd.act = { id: 'airdashF' }; commit(12); } });
        break;
      }
      case 'beamCharge': {
        if (me.canStart(sim, 'beamAnswer') && t.eta >= 6) {
          opts.push({ score: 1.25 + P.risk * 0.5 + P.aggression * 0.2, tag: 'answerBeam', apply: () => { cmd.act = { id: 'beamAnswer' }; commit(40); } });
        }
        // Interrupt the charge if we can reach in time.
        const f = this.fastestReaching(c);
        if (f) opts.push({ score: 1.6, tag: 'interruptBeam', apply: () => { cmd.act = { id: f.id }; commit(10); } });
        if (c.dist < 700 && t.eta > 14 && me.canStart(sim, 'dashF')) opts.push({ score: 1.0 + P.aggression * 0.5, tag: 'rushBeam', apply: () => { cmd.act = { id: 'dashF' }; commit(8); } });
        if (me.canStart(sim, 'vanish') && t.eta > 8) opts.push({ score: 0.9 + P.trickery * 0.4, tag: 'vanishBehind', apply: () => { cmd.act = { id: 'vanish', place: 'behind' }; this.pendingTactic = { kind: 'beamPunish', tick: sim.tick }; commit(18); } });
        if (me.canStart(sim, 'kiblast') && t.eta > 12) opts.push({ score: 0.6 + P.zoning * 0.4, tag: 'snipe', apply: () => { cmd.act = { id: 'kiblast' }; commit(14); } });
        if (me.grounded) opts.push({ score: 0.55, tag: 'jumpOver', apply: () => { this.schedule(sim.tick + Math.max(0, t.eta - 6), null, 'wait'); cmd.jump = t.eta < 10; commit(t.eta); } });
        if (canBlock) opts.push({ score: 0.4 + P.defense * 0.3, tag: 'brace', apply: () => { this.blockUntil = sim.tick + t.eta + 30; cmd.block = true; commit(t.eta + 10); } });
        break;
      }
      case 'zone': {
        const needTicks = (t.escapeDist / (C.RUN * me.speedMult)) * 60;
        if (t.escapeDir !== 0 && me.grounded && t.eta > needTicks + 3) {
          opts.push({
            score: 1.3, tag: 'run',
            apply: () => {
              this.moveDir = t.escapeDir;
              this.wantRun = true;
              this.moveUntil = sim.tick + Math.ceil(needTicks) + 4;
              cmd.moveX = t.escapeDir;
              cmd.run = true;
              commit(Math.ceil(needTicks) + 2);
            },
          });
        }
        if (t.escapeDir !== 0 && me.grounded && t.eta >= 3 && t.escapeDist < 260) {
          const away = t.escapeDir === -c.toward;
          if (me.canStart(sim, away ? 'dashB' : 'dashF')) opts.push({ score: 1.15, tag: 'dash', apply: () => { cmd.act = { id: away ? 'dashB' : 'dashF' }; commit(14); } });
          if (me.canStart(sim, away ? 'rollB' : 'rollF')) opts.push({ score: 0.9, tag: 'roll', apply: () => { cmd.act = { id: away ? 'rollB' : 'rollF' }; commit(14); } });
        }
        if (me.canStart(sim, 'vanish')) opts.push({ score: 0.7 + dmg * 0.25, tag: 'vanish', apply: () => { cmd.act = { id: 'vanish', place: 'away' }; commit(16); } });
        if (me.grounded && t.low) opts.push({ score: 1.2, tag: 'jump', apply: () => { cmd.jump = true; cmd.moveX = t.escapeDir || c.toward; commit(18); } });
        if (!me.grounded && me.canMovement('airdashF') && t.escapeDir !== 0) {
          const away = t.escapeDir === -c.toward;
          opts.push({ score: 0.9, tag: 'airdash', apply: () => { cmd.act = { id: away ? 'airdashB' : 'airdashF' }; commit(12); } });
        }
        if (canBlock) opts.push({ score: 0.3 + P.defense * 0.2 - dmg * 0.3, tag: 'block', apply: () => { this.blockUntil = sim.tick + t.eta + 10; cmd.block = true; commit(t.eta + 6); } });
        if (me.grounded && t.escapeDir !== 0) {
          opts.push({ score: 0.6, tag: 'walkOut', apply: () => { this.moveDir = t.escapeDir; this.wantRun = true; this.moveUntil = sim.tick + 10; cmd.moveX = t.escapeDir; cmd.run = true; commit(6); } });
        }
        break;
      }
      case 'timestop': {
        const f = this.fastestReaching(c);
        if (f && f.startup < t.eta) opts.push({ score: 1.8, tag: 'interruptTime', apply: () => { cmd.act = { id: f.id }; commit(10); } });
        if (me.canStart(sim, 'kiblast') && c.dist < 900 && t.eta > 12) opts.push({ score: 1.0, tag: 'snipeTime', apply: () => { cmd.act = { id: 'kiblast' }; commit(12); } });
        if (c.dist < 500 && me.canStart(sim, 'dashB')) opts.push({ score: 0.7, tag: 'distance', apply: () => { cmd.act = { id: 'dashB' }; commit(12); } });
        break;
      }
      default:
        break;
    }
    if (opts.length === 0) return false;
    const i = this.rng.softmaxIndex(opts.map((o) => o.score), Math.max(0.12, this.traits.temperature * 0.45));
    const o = opts[i];
    o.apply();
    this.thought = o.tag;
    Brain.debug[`${t.kind}:${o.tag}`] = (Brain.debug[`${t.kind}:${o.tag}`] ?? 0) + 1;
    return true;
  }
  /** Aggregate decision counters (diagnostics only). */
  static debug: Record<string, number> = {};

  /* ================================================================== */
  /* Opportunity: punish                                                */
  /* ================================================================== */

  private punish(c: AICtx, cmd: Command): boolean {
    if (c.openFor <= 2 || c.oppPhase) return false;
    const me = c.me, sim = c.sim;
    const opts: [ActionRequest, number, string][] = [];
    const list = me.grounded ? MELEE : AIR;
    for (const name of list) {
      const m = this.mv(me, name);
      if (!m || !me.canStart(sim, m.id)) continue;
      if (m.kind === 'throw' && (c.oppAirborne || c.ov.state === 'launched')) continue;
      if (m.startup + 1 > c.openFor) continue;
      if (!this.inReach(c, m)) continue;
      let s = (m.hit?.damage ?? 0) / 55;
      if (m.kind === 'launcher') s += 0.9;
      if (m.kind === 'heavy' && m.chargeable && c.openFor > m.startup + 10) s += 0.4;
      opts.push([{ id: m.id, hold: m.kind === 'heavy' ? Math.min(m.chargeable ?? 0, Math.max(0, c.openFor - m.startup - 3)) : 0 }, s, 'melee']);
    }
    for (const slot of SLOTS) {
      const ab = me.def.abilities[slot];
      const def = ABILITIES[ab].def;
      if (!me.canStart(sim, def.id)) continue;
      const sc = scoreAbility(ab, c);
      if (sc && (sc.why === 'punish' || sc.why === 'interruptCharge' || sc.why === 'stunned') && sc.score > 1) opts.push([sc.req, sc.score + 0.4, 'ability']);
    }
    if (opts.length === 0) {
      if (c.openFor > 16 && c.dist < 560 && c.dist > 120 && me.grounded) {
        if (me.canStart(sim, 'dashF') && c.dist > 200) cmd.act = { id: 'dashF' };
        else {
          cmd.moveX = c.toward;
          cmd.run = true;
        }
        this.thought = 'closing';
        return true;
      }
      return false;
    }
    const i = this.rng.softmaxIndex(opts.map((o) => o[1]), 0.3);
    cmd.act = opts[i][0];
    this.pendingTactic = { kind: c.oppRecovering ? 'whiffPunish' : 'punish', tick: sim.tick };
    this.thought = 'punish';
    return true;
  }

  /* ================================================================== */
  /* Reads                                                              */
  /* ================================================================== */

  private teleportRead(c: AICtx, cmd: Command): boolean {
    if (!c.ov.vanished || this.readDone) return false;
    this.readDone = true;
    const [place, p] = this.model.teleport.top();
    const conf = this.model.confidence(this.model.teleport);
    if (p * conf < 0.3 + this.rng.next() * 0.25) return false;
    const me = c.me, sim = c.sim;
    const appearIn = Math.max(1, C.VANISH_T - (c.ov.stateT + c.delay));
    if (place === 'behind' && me.grounded) {
      const m = this.mv(me, 'light1') ?? this.mv(me, 'launcher');
      if (!m) return false;
      const at = sim.tick + Math.max(0, appearIn + 2 - m.startup);
      this.schedule(at, { id: m.id }, 'read:teleport', -c.toward);
      this.thought = 'readTeleport';
      return true;
    }
    if (place === 'above' && me.grounded) {
      const m = this.mv(me, 'launcher');
      if (!m) return false;
      this.schedule(sim.tick + Math.max(0, appearIn + 3 - m.startup), { id: m.id }, 'read:teleport');
      this.thought = 'readTeleport';
      return true;
    }
    return false;
  }

  private anticipate(c: AICtx, cmd: Command): boolean {
    const me = c.me, sim = c.sim, ov = c.ov;
    if (!me.grounded) return false;
    // Opponent rushing in: predict their opener and prepare.
    const rushing = (ov.state === 'dash' || ov.state === 'run') && Math.sign(ov.vx) === -c.toward && c.dist < 420;
    if (rushing && this.rng.chance(0.12 + this.traits.defense * 0.25)) {
      const [op, p] = this.model.opener.top();
      const conf = this.model.confidence(this.model.opener);
      const sure = p * conf;
      if (op === 'throw' && sure > 0.3) {
        cmd.jump = true;
        cmd.moveX = -c.toward;
        this.pendingTactic = { kind: 'antic:throw', tick: sim.tick };
        this.thought = 'readThrow';
        return true;
      }
      if (sure > 0.25 && this.rng.chance(this.traits.defense)) {
        const speed = Math.max(300, Math.abs(ov.vx));
        const travel = Math.max(0, (c.dist - c.oppThreatRange) / speed) * 60;
        const expectStartup = op === 'thrust' ? 12 : op === 'heavy' ? 17 : 7;
        const eta = Math.round(travel + expectStartup);
        this.schedule(sim.tick + Math.max(0, eta - 3), { id: 'parry' }, 'antic:parry', 0, true);
        this.blockLow = false;
        this.thought = 'readOpener';
        return true;
      }
      this.blockLow = op === 'sweep' && sure > 0.3;
      this.blockUntil = sim.tick + 16;
      cmd.block = true;
      cmd.crouch = this.blockLow;
      return true;
    }
    // Throw anticipation when they hug us.
    if (c.dist < 80 && ov.state !== 'action' && this.model.throwRate.p('throw') * this.model.confidence(this.model.throwRate) > 0.35 && this.rng.chance(0.08)) {
      const th = this.mv(me, 'throw');
      if (th && me.canStart(sim, th.id) && this.rng.chance(0.5)) cmd.act = { id: th.id };
      else {
        cmd.jump = true;
        cmd.moveX = -c.toward;
      }
      this.pendingTactic = { kind: 'antic:throw', tick: sim.tick };
      return true;
    }
    // Anti-air: they jump at us.
    const jumpingIn = ov.state === 'air' || ov.state === 'airdash' || (ov.state === 'action' && !!ov.action?.airOK && !ov.grounded);
    if (jumpingIn && c.dy < -50 && c.dist < 230 && ov.vy > -200 && this.rng.chance(0.35 + this.traits.precision * 0.3)) {
      const ln = this.mv(me, 'launcher');
      if (ln && me.canStart(sim, ln.id) && this.inReach(c, ln, 30)) {
        const fallTime = Math.max(0, (-c.dy - 80) / Math.max(200, ov.vy + 400)) * 60;
        this.schedule(sim.tick + Math.max(0, Math.round(fallTime - ln.startup)), { id: ln.id }, 'antiAir');
        this.thought = 'antiAir';
        return true;
      }
    }
    return false;
  }

  private okizeme(c: AICtx, cmd: Command): boolean {
    const me = c.me, sim = c.sim, ov = c.ov;
    if (this.sched) return false;
    if (ov.state !== 'knockdown') return false;
    const remaining = C.KNOCKDOWN_T - (ov.stateT + c.delay) + C.GETUP_T;
    if (remaining < 6) return false;
    // Option A: set-ups with ranged abilities on their wake-up spot.
    for (const slot of ['ranged', 'special', 'ultimate'] as AbilitySlot[]) {
      const ab = me.def.abilities[slot];
      const def = ABILITIES[ab].def;
      if (!me.canStart(sim, def.id)) continue;
      const sc = scoreAbility(ab, c);
      if (sc && sc.score > 1.25 && this.rng.chance(0.5)) {
        cmd.act = sc.req;
        this.thought = 'setup';
        return true;
      }
    }
    // Option B: meaty strike timed to their wake-up.
    const m = this.mv(me, this.rng.chance(0.6) ? 'light1' : 'sweep');
    if (!m) return false;
    const want = Math.max(40, m.range[1] - 30);
    if (Math.abs(c.dist - want) > 40) {
      cmd.moveX = c.dist > want ? c.toward : -c.toward;
      cmd.run = Math.abs(c.dist - want) > 200;
      return true;
    }
    const at = sim.tick + Math.max(0, remaining - m.startup + 1);
    this.schedule(at, { id: m.id }, 'meaty');
    this.thought = 'meaty';
    return true;
  }

  private keepCharging(c: AICtx): boolean {
    const me = c.me;
    if (me.energy >= 96) return false;
    if (c.threats.length > 0) return false;
    if (c.dist < 420) return false;
    const approaching = (c.ov.state === 'dash' || c.ov.state === 'run' || c.ov.state === 'vanish') && c.dist < 800;
    if (approaching) return false;
    return c.sim.tick < this.chargeLock;
  }

  /* ================================================================== */
  /* Plans                                                              */
  /* ================================================================== */

  private maybeReplan(c: AICtx): void {
    const sim = c.sim;
    const big = this.planTaken > 140 || this.planDealt > 220;
    if (sim.tick < this.planUntil && !(big && sim.tick - this.lastPlanEval > 30)) return;
    this.lastPlanEval = sim.tick;
    // Learn from the plan that just ended.
    const dur = Math.max(1, (sim.tick - (this.planUntil - 120)) / 60);
    const reward = (this.planDealt - this.planTaken * 1.15) / 100 / Math.sqrt(dur);
    this.memory.update(this.plan, clamp(reward, -2, 2));
    const prev = this.plan;
    const prevReward = reward;
    this.planDealt = 0;
    this.planTaken = 0;

    const P = this.traits, me = c.me, m = this.model;
    const conf = m.confidence(m.defense);
    const oppParries = (m.defense.p('parry') + m.defense.p('dodge')) * conf;
    const oppZones = m.opener.p('projectile') * m.confidence(m.opener);
    const oppAggro = (m.edgeAggression.p('attack') * m.confidence(m.edgeAggression) + m.defense.p('attack') * conf) / 2;
    const late = sim.phase === 'collapse' || sim.phase === 'judgment';
    const hasRanged = true;
    const teleporty = ['phantomStep', 'voidGate', 'mirage', 'flashCut'].includes(me.def.abilities.mobility);
    const u: Record<PlanKind, number> = {
      probe: 0.35 + (c.time < 10 ? 0.9 : 0) + P.patience * 0.3 + (conf < 0.3 ? 0.25 : 0),
      rushdown: P.aggression * 1.25 + oppZones * 0.4 - oppParries * 0.5 * (1 - P.trickery) + (c.hpLead < -0.2 ? P.risk * 0.3 : 0) + (late ? 0.35 : 0),
      zone: P.zoning * 1.25 + (hasRanged ? 0.15 : 0) + (c.dist > 500 ? 0.2 : 0) + oppAggro * 0.2 - (c.oppReflect ? 0.5 : 0) - m.seen('ab.mirrorWard') * 0.25,
      bait: P.patience * 0.95 + oppAggro * 0.9 + P.defense * 0.2,
      turtle: P.defense * 0.9 + (c.hpLead > 0.25 ? 0.45 : 0) + (c.ov.ascended ? 0.5 : 0) + oppAggro * 0.4 - (late ? 0.4 : 0),
      charge: (me.energy < 40 ? 0.5 : -0.6) + P.patience * 0.35 + (c.dist > 650 ? 0.45 : -0.7),
      ambush: P.trickery * 1.1 + (me.energy >= 30 ? 0.25 : -0.6) + (teleporty ? 0.3 : 0) + oppParries * 0.3,
      recover: (c.myHp < 0.3 ? 0.9 : -1.2) + (['secondWind', 'chronoRewind'].includes(me.def.abilities.defense) ? 0.4 : 0) + P.defense * 0.2 - (late ? 0.5 : 0),
      ultimate: me.wrath >= 100 ? 1.4 + P.aggression * 0.3 : -3,
      corner: (c.oppCornered ? 0.7 : Math.abs(c.ov.x) > 700 ? 0.2 : -0.4) + P.aggression * 0.35,
    };
    let best: PlanKind = 'probe';
    const kinds = Object.keys(u) as PlanKind[];
    const scores = kinds.map((k) => {
      let s = u[k] + this.memory.get(k) * (0.4 + P.adaptivity * 1.2);
      if (k === prev) s += 0.3;
      return s;
    });
    const i = this.rng.softmaxIndex(scores, Math.max(0.15, P.temperature * 0.6));
    best = kinds[i];
    this.plan = best;
    this.planUntil = sim.tick + Math.round(this.rng.range(70, 160) * (0.7 + P.patience * 0.6));

    if (best !== prev) {
      let reason = 'shift';
      if (prev === 'probe' && c.time < 16) reason = 'scouted';
      if (prevReward < -0.3) reason = `failed:${prev}`;
      else if (prevReward > 0.4) reason = `winning:${prev}`;
      if (best === 'ultimate') reason = 'wrathFull';
      if (best === 'recover') reason = 'lowHp';
      if (best === 'rushdown' && oppZones > 0.3) reason = 'adapt:zoning';
      if (best === 'ambush' && oppParries > 0.35) reason = 'adapt:parries';
      if (best === 'bait' && oppAggro > 0.35) reason = 'adapt:aggression';
      if (best === 'turtle' && c.ov.ascended) reason = 'oppAscended';
      if (best === 'charge') reason = 'energyLow';
      if (best === 'corner') reason = 'cornering';
      this.planReason = reason;
      if (sim.tick - this.lastIntentTick > 90 || reason.startsWith('adapt') || reason === 'wrathFull' || reason === 'lowHp') {
        this.lastIntentTick = sim.tick;
        sim.emit({ type: 'intent', side: this.side, intent: best, reason });
      }
    }
  }

  private executePlan(c: AICtx, cmd: Command): void {
    const me = c.me, sim = c.sim, P = this.traits;
    let desired = c.myRange * 0.9;
    let tol = 30;
    let aggro = 0;
    switch (this.plan) {
      case 'probe':
        desired = Math.max(c.oppThreatRange, c.myRange) + 25;
        tol = 40;
        aggro = 0.1;
        break;
      case 'rushdown':
        desired = c.myRange * 0.7;
        tol = 24;
        aggro = 0.45;
        break;
      case 'zone':
        desired = 760;
        tol = 160;
        aggro = 0.15;
        if (c.dist < 380 && this.escapeRushdown(c, cmd)) return;
        break;
      case 'bait':
        desired = c.oppThreatRange + 25 + Math.sin(sim.tick / 22 + this.side) * 30;
        tol = 18;
        aggro = -0.15;
        this.recordEdge(c);
        break;
      case 'turtle':
        desired = c.myRange + 30;
        tol = 50;
        aggro = -0.2;
        break;
      case 'charge':
        desired = 900;
        tol = 200;
        if (c.dist > 650 && me.grounded && me.energy < 92 && c.threats.length === 0 && me.canStart(sim, 'charge')) {
          cmd.act = { id: 'charge' };
          this.chargeLock = sim.tick + this.rng.int(40, 110);
          this.thought = 'charging';
          return;
        }
        break;
      case 'ambush':
        desired = 420;
        tol = 120;
        aggro = 0.2;
        if (c.dist > 220 && c.dist < 900 && me.canStart(sim, 'vanish') && this.rng.chance(0.04 + P.trickery * 0.05)) {
          const place: TeleportPlace = this.rng.weightedPairs([['behind', 3], ['above', 1.4], ['front', 0.6]]);
          cmd.act = { id: 'vanish', place };
          this.pendingTactic = { kind: 'teleport', tick: sim.tick };
          return;
        }
        break;
      case 'recover':
        desired = 950;
        tol = 200;
        aggro = -0.3;
        break;
      case 'ultimate': {
        const ult = ABILITIES[me.def.abilities.ultimate].def;
        desired = clamp((ult.range[0] + ult.range[1]) / 2, 150, 700);
        tol = 140;
        aggro = 0.2;
        break;
      }
      case 'corner':
        desired = c.myRange * 0.8;
        tol = 30;
        aggro = 0.35;
        break;
    }
    if (c.ov.ascended && this.plan !== 'rushdown') aggro -= 0.1;
    if (sim.phase === 'judgment') aggro += 0.25;

    // Offense / abilities.
    if (this.offense(c, cmd, aggro)) return;
    if (this.neutralGuard(c, cmd)) return;

    // Air behaviour.
    if (!me.grounded) {
      cmd.moveX = c.dist > 60 ? c.toward * 0.7 : 0;
      cmd.moveY = me.canFly ? clamp((c.ov.y - 60 - me.y) / 200, -1, 1) : 0;
      return;
    }

    // Occasional jump-in approach.
    if ((this.plan === 'rushdown' || this.plan === 'ambush') && c.dist > 220 && c.dist < 520 && this.rng.chance(0.012 + P.aggression * 0.012)) {
      cmd.jump = true;
      cmd.moveX = c.toward;
      this.thought = 'jumpIn';
      return;
    }
    // Cornered: escape by jumping over or rolling through.
    if (c.cornered && c.dist < 160 && this.rng.chance(0.03 + P.trickery * 0.03)) {
      if (this.rng.chance(0.5)) {
        cmd.jump = true;
        cmd.moveX = c.toward;
      } else if (me.canStart(sim, 'rollF')) cmd.act = { id: 'rollF' };
      return;
    }
    this.moveTo(c, cmd, desired, tol);
  }

  /** Hold guard while inside the opponent's threat range (anticipation, not reaction). */
  private neutralGuard(c: AICtx, cmd: Command): boolean {
    const me = c.me, sim = c.sim;
    if (!me.grounded || c.oppKnockdown || c.openFor > 0 || c.ov.vanished) return false;
    const reach = c.oppThreatRange + 70 + (c.ov.state === 'dash' || c.ov.state === 'run' ? 160 : 0);
    const lungeReach = (c.opp.move('thrust')?.range[1] ?? reach) + 30;
    if (c.dist > Math.max(reach, lungeReach)) return false;
    const atLunge = c.dist > reach;
    const base: Record<PlanKind, number> = {
      turtle: 0.8, bait: 0.5, probe: 0.42, zone: 0.4, recover: 0.65, charge: 0.35, ambush: 0.28, rushdown: 0.2, ultimate: 0.4, corner: 0.22,
    };
    const aggro = this.model.opener.n > 2 ? 0.15 : 0;
    const p = (base[this.plan] * (0.55 + this.traits.defense * 0.65) + aggro) * (atLunge ? 0.35 : 1);
    if (!this.rng.chance(p * 0.3)) return false;
    const lowRate = this.model.opener.p('sweep') * this.model.confidence(this.model.opener);
    this.blockLow = this.rng.chance(clamp(lowRate * 1.6, 0.05, 0.6));
    this.blockUntil = sim.tick + this.rng.int(10, 30);
    cmd.block = true;
    cmd.crouch = this.blockLow;
    this.thought = 'guard';
    return true;
  }

  private escapeRushdown(c: AICtx, cmd: Command): boolean {
    const me = c.me, sim = c.sim;
    if (this.rng.chance(0.7)) return false;
    if (c.wallBehind > 260 && me.canStart(sim, 'dashB')) {
      cmd.act = { id: 'dashB' };
      return true;
    }
    if (me.canStart(sim, 'vanish') && this.rng.chance(0.4)) {
      cmd.act = { id: 'vanish', place: 'away' };
      return true;
    }
    if (me.grounded) {
      cmd.jump = true;
      cmd.moveX = c.wallBehind > 200 ? -c.toward : c.toward;
      return true;
    }
    return false;
  }

  private recordEdge(c: AICtx): void {
    // Learn whether the opponent attacks when we hover at the edge of their range.
    if (Math.abs(c.dist - c.oppThreatRange) < 40 && c.sim.tick % 20 === 0) {
      const attacking = c.ov.state === 'action' && !!c.ov.action?.hitbox;
      this.model.edgeAggression.observe(attacking ? 'attack' : 'wait', 0.5);
    }
  }

  private moveTo(c: AICtx, cmd: Command, desired: number, tol: number): void {
    const me = c.me, sim = c.sim, P = this.traits;
    if (sim.tick < this.moveUntil) {
      cmd.moveX = this.moveDir;
      cmd.run = this.wantRun;
      return;
    }
    const err = c.dist - desired;
    let dir = 0, run = false, hold = this.rng.int(5, 12);
    if (err > tol) {
      dir = c.toward;
      run = err > 240;
      if (err > 200 && me.canStart(sim, 'dashF') && this.rng.chance(0.06 + P.aggression * 0.1)) {
        cmd.act = { id: 'dashF' };
        return;
      }
    } else if (err < -tol) {
      dir = -c.toward;
      if (c.wallBehind < 120) dir = 0;
      if (err < -110 && c.wallBehind > 260 && me.canStart(sim, 'dashB') && this.rng.chance(0.1)) {
        cmd.act = { id: 'dashB' };
        return;
      }
    } else {
      // In the pocket: footsie dance — feints of movement, stutter steps, pauses.
      const r = this.rng.next();
      dir = r < 0.35 ? 0 : r < 0.68 ? c.toward : -c.toward;
      hold = this.rng.int(6, 18);
      if (this.rng.chance(0.03 * (1 - P.patience)) && me.canStart(sim, 'dashF')) {
        cmd.act = { id: this.rng.chance(0.5) ? 'dashF' : 'dashB' };
        return;
      }
    }
    this.moveDir = dir;
    this.wantRun = run;
    this.moveUntil = sim.tick + hold;
    cmd.moveX = dir;
    cmd.run = run;
  }

  /* ================================================================== */
  /* Offense                                                            */
  /* ================================================================== */

  private offense(c: AICtx, cmd: Command, aggro: number): boolean {
    const me = c.me, sim = c.sim, P = this.traits;
    if (sim.tick < this.nextOffense || sim.tick < this.tempoUntil) return false;
    this.nextOffense = sim.tick + this.rng.int(4, 10);
    const opts: [ActionRequest, number, string][] = [];

    // Melee.
    const list = me.grounded ? MELEE : AIR;
    const meleeOk = !c.ov.intangible && !c.oppKnockdown && !c.ov.vanished && c.ov.state !== 'tech';
    for (const name of meleeOk ? list : []) {
      const m = this.mv(me, name);
      if (!m || !me.canStart(sim, m.id) || !this.inReach(c, m, -10)) continue;
      if (m.kind === 'throw' && (c.dist > 70 || c.oppAirborne)) continue;
      if (c.oppCounter && m.kind !== 'throw') continue; // never strike into a counter stance
      const [ev, req] = this.meleeEV(c, m);
      opts.push([req, ev + aggro + P.aggression * 0.15, `melee:${m.kind}`]);
    }
    // Feinted heavy vs reactive defenders.
    const hv = this.mv(me, 'heavy');
    if (hv && me.grounded && me.canStart(sim, hv.id) && this.inReach(c, hv) && me.energy >= 6) {
      const reactive = (this.model.defense.p('parry') + this.model.defense.p('dodge') + this.model.defense.p('jump')) * this.model.confidence(this.model.defense);
      opts.push([{ id: hv.id, feintAt: this.rng.int(5, Math.max(6, hv.startup - 3)) }, reactive * 1.3 * (0.4 + P.trickery) - 0.2 + aggro, 'feint']);
    }
    // Abilities.
    for (const slot of SLOTS) {
      const ab = me.def.abilities[slot];
      const def = ABILITIES[ab].def;
      if (!me.canStart(sim, def.id)) continue;
      const sc = scoreAbility(ab, c);
      if (!sc) continue;
      // Abilities used repeatedly lose novelty (anti-predictability).
      const used = me.actionCounts.get(def.id) ?? 0;
      // Slow abilities inside the opponent's reach are dangerous unless they are open.
      const frames = def.startup + def.recovery;
      const proximity = clamp(1 - (c.dist - c.oppThreatRange) / 420, 0, 1);
      const exposure = c.openFor > def.startup ? 0 : proximity * (frames / 40) * 0.9 * (1 - P.risk * 0.4);
      opts.push([sc.req, sc.score - used * 0.04 - exposure + (slot === 'ultimate' && this.plan === 'ultimate' ? 0.4 : 0), `ab:${sc.why}`]);
    }
    // Universal.
    if (me.canStart(sim, 'kiblast') && c.dist > 320 && !c.oppReflect) {
      opts.push([{ id: 'kiblast' }, 0.15 + P.zoning * 0.55 + (c.oppCharging ? 0.7 : 0) + (this.plan === 'zone' ? 0.35 : 0) - (c.threats.length ? 0.4 : 0), 'kiblast']);
    }
    if (me.canStart(sim, 'blitz') && c.dist > 200 && c.dist < 850 && me.energy >= 50 && c.ov.energy >= 25 && sim.phase !== 'opening') {
      opts.push([{ id: 'blitz' }, 0.25 + P.aggression * 0.35 + P.trickery * 0.2, 'blitz']);
    }
    // Patience: doing nothing is an option.
    opts.push([{ id: '__wait' }, 0.62 + P.patience * 0.4 - aggro - (this.plan === 'rushdown' ? 0.25 : 0), 'wait']);
    const i = this.rng.softmaxIndex(opts.map((o) => o[1]), P.temperature);
    const [req, , tag] = opts[i];
    if (req.id === '__wait') return false;
    cmd.act = req;
    this.thought = tag;
    // After committing, give the exchange room to breathe before the next voluntary attack.
    const def = me.actions.get(req.id);
    const busyFor = def ? def.startup + def.active + def.recovery + (req.hold ?? 0) : 20;
    this.tempoUntil = sim.tick + busyFor + Math.round(this.rng.range(8, 46) * (1.15 - P.aggression * 0.7) * (this.plan === 'rushdown' ? 0.6 : 1));
    if (tag === 'feint') this.pendingTactic = { kind: 'feint', tick: sim.tick };
    return true;
  }

  private meleeEV(c: AICtx, m: ActionDef): [number, ActionRequest] {
    const P = this.traits, model = this.model;
    const conf = model.confidence(model.defense);
    const dmg = (m.hit?.damage ?? 0) / 100;
    let pHit: number;
    let blockedValue = 0;
    const req: ActionRequest = { id: m.id };
    if (c.openFor >= m.startup) {
      pHit = 0.95;
    } else if (c.oppBlocking) {
      const theirReact = 9;
      if (m.height === 'throw') pHit = 0.85;
      else if (m.height === 'low') pHit = c.ov.blockLow ? 0.04 : m.startup > theirReact + 3 ? 0.3 : 0.75;
      else if (m.height === 'overhead') pHit = !c.ov.blockLow ? 0.04 : m.startup > theirReact + 3 ? 0.35 : 0.75;
      else pHit = 0.04;
      blockedValue = ((m.hit?.guard ?? 0) / 100) * (c.ov.guard < 40 ? 1.2 : 0.4);
    } else if (c.ov.action && c.ov.state === 'action' && c.ov.action.hitbox) {
      const theirEta = c.ov.action.startup - (c.ov.actionFrame + c.delay);
      pHit = theirEta > m.startup + 1 ? 0.8 : 0.25;
    } else {
      const d = model.defense;
      const defend = (d.p('block') + d.p('parry') + d.p('dodge') + d.p('jump') + d.p('vanish')) * conf + 0.45 * (1 - conf);
      pHit = clamp(1 - defend, 0.12, 0.8);
      if (m.height === 'throw') pHit = clamp(d.p('block') * conf + 0.25, 0.15, 0.8);
      // Slow or long-travel attacks are reactable: a god sees them coming.
      const oppReact = Math.max(5, c.opp.def.traits.reaction - 3);
      const travel = m.kind === 'dashAttack' ? Math.max(0, c.dist - 140) / 18 : 0;
      if (m.startup + travel > oppReact + 2) pHit *= m.startup + travel > oppReact + 8 ? 0.42 : 0.62;
      // Delayed timing beats early parries.
      if (d.p('parry') * conf > 0.25 && m.kind === 'light') req.hold = this.rng.int(3, 9);
    }
    if (m.chargeable && c.openFor > m.startup + 8) req.hold = Math.min(m.chargeable, c.openFor - m.startup - 4);
    const recov = m.recovery + m.active;
    const pParried = m.height === 'throw' ? 0 : model.defense.p('parry') * conf * 0.6;
    // Whiffing or being blocked leaves us open: expected punish ≈ a combo if recovery is long.
    const pPunished = clamp((recov - 10) / 18, 0.05, 0.85);
    const risk = (1 - pHit) * pPunished * 1.35 * (1 - P.risk * 0.5) + pParried * 0.6;
    let s = pHit * (dmg * 1.5 + (m.kind === 'launcher' ? 0.45 : 0) + (m.kind === 'heavy' ? 0.15 : 0)) - risk + blockedValue;
    if (this.plan === 'probe' && (m.kind === 'light' || m.kind === 'dashAttack')) s += 0.15;
    if (this.plan === 'rushdown' && (m.kind === 'light' || m.kind === 'throw')) s += 0.15;
    if (m.kind === 'throw' && c.dist > 70) s -= 1;
    return [s, req];
  }

  /* ================================================================== */
  /* Learning from events                                               */
  /* ================================================================== */

  onEvents(sim: Simulation, events: readonly SimEvent[]): void {
    const me = sim.fighters[this.side];
    const opp = sim.opponentOf(me);
    for (const e of events) {
      switch (e.type) {
        case 'actionStart': {
          if (e.side === opp.side) {
            const cat = categorize(e.id, e.kind, opp);
            if (cat) {
              this.model.observeAction(cat);
              const dist = Math.abs(opp.x - me.x);
              if (dist < 450 && (cat !== 'projectile' || dist > 200)) this.model.opener.observe(cat, 0.5);
              if (cat === 'throw') this.model.throwRate.observe('throw');
              else if (dist < 160) this.model.throwRate.observe('strike', 0.5);
            }
            if (e.abilityId) this.model.sawAbility(e.id);
            if (this.myAttack && !this.myAttack.resolved && sim.tick - this.myAttack.tick < 25 && e.kind !== 'ability') {
              this.myAttack.resolved = true;
              this.model.defense.observe('attack');
            }
          } else if (e.side === me.side) {
            const def = me.actions.get(e.id);
            if (def && def.hitbox && Math.abs(opp.x - me.x) < 260) this.myAttack = { tick: sim.tick, resolved: false };
          }
          break;
        }
        case 'vanish':
          if (e.side === opp.side) this.oppVanishFrom = { x: e.x, y: e.y, myX: me.x };
          break;
        case 'appear':
          if (e.side === opp.side && this.oppVanishFrom) {
            const from = this.oppVanishFrom;
            const sideBefore = Math.sign(from.x - from.myX);
            const sideNow = Math.sign(e.x - me.x);
            let place: TeleportPlace = 'front';
            if (e.y < -160) place = 'above';
            else if (Math.abs(e.x - me.x) > 450) place = 'away';
            else if (sideNow !== sideBefore) place = 'behind';
            this.model.teleport.observe(place);
            this.oppVanishFrom = null;
            if (this.myAttack && !this.myAttack.resolved && sim.tick - this.myAttack.tick < 25) {
              this.myAttack.resolved = true;
              this.model.defense.observe('vanish');
            }
          }
          break;
        case 'block':
          if (e.defender === opp.side) {
            this.model.blockHeight.observe(opp.blockLow ? 'low' : 'high');
            if (this.myAttack && !this.myAttack.resolved) {
              this.myAttack.resolved = true;
              this.model.defense.observe('block');
            }
            if (this.pendingTactic) this.resolveTactic(false);
          }
          break;
        case 'parry':
          if (e.parrier === opp.side) {
            if (this.myAttack && !this.myAttack.resolved) {
              this.myAttack.resolved = true;
              this.model.defense.observe('parry');
            }
            if (this.pendingTactic) this.resolveTactic(false);
          } else if (e.parrier === me.side && this.pendingTactic?.kind.startsWith('antic')) {
            sim.emit({ type: 'read', side: me.side, what: 'opener' });
            me.stats.reads++;
            this.resolveTactic(true);
          }
          break;
        case 'dodge':
          if (e.side === opp.side && this.myAttack && !this.myAttack.resolved) {
            this.myAttack.resolved = true;
            this.model.defense.observe(opp.grounded ? 'dodge' : 'jump');
          }
          break;
        case 'hit':
          if (e.attacker === me.side && e.defender === opp.side) {
            if (this.myAttack && !this.myAttack.resolved) {
              this.myAttack.resolved = true;
              this.model.defense.observe('hit');
            }
            this.lastOppCombo = e.combo;
            if (this.pendingTactic) {
              const k = this.pendingTactic.kind;
              if (k === 'read:teleport') {
                sim.emit({ type: 'read', side: me.side, what: 'teleport' });
                me.stats.reads++;
              } else if (k === 'antic:throw' || k === 'antiAir') {
                sim.emit({ type: 'read', side: me.side, what: k === 'antiAir' ? 'jump' : 'throw' });
                me.stats.reads++;
              } else if (k === 'interrupt' && e.counter) {
                sim.emit({ type: 'read', side: me.side, what: 'interrupt' });
              }
              this.resolveTactic(true);
            }
          } else if (e.attacker === opp.side && e.defender === me.side) {
            if (this.pendingTactic && sim.tick - this.pendingTactic.tick < 40) this.resolveTactic(false);
          }
          break;
        case 'burst':
          if (e.side === opp.side) this.model.observeBurst(this.lastOppCombo);
          break;
        case 'feint':
          if (e.side === opp.side) this.model.feints.observe('feint');
          break;
        case 'swing':
          if (e.side === opp.side && (opp.action?.def.kind === 'heavy')) this.model.feints.observe('commit', 0.6);
          break;
        default:
          break;
      }
    }
    if (this.myAttack && !this.myAttack.resolved && sim.tick - this.myAttack.tick > 30) {
      this.myAttack.resolved = true;
      if (!opp.grounded) this.model.defense.observe('jump', 0.6);
    }
    if (this.pendingTactic && sim.tick - this.pendingTactic.tick > 60) this.pendingTactic = null;
  }

  private resolveTactic(success: boolean): void {
    if (!this.pendingTactic) return;
    this.recordRate(this.pendingTactic.kind, success);
    this.pendingTactic = null;
  }
}

function categorize(id: string, kind: string, opp: Fighter): OpenerKind | null {
  if (id === 'kiblast') return 'projectile';
  switch (kind) {
    case 'light': return 'poke';
    case 'dashAttack': return 'thrust';
    case 'heavy': return 'heavy';
    case 'sweep': return 'sweep';
    case 'throw': return 'throw';
    case 'launcher': return 'poke';
    case 'air': case 'airSlam': return 'jumpin';
    case 'ability': {
      const def = opp.actions.get(id);
      if (!def) return 'ability';
      if (def.slot === 'mobility') return 'teleport';
      if (def.slot === 'ranged') return 'projectile';
      return 'ability';
    }
    default: return null;
  }
}
