import type { Capsule } from '../core/math';
import { clamp, approach } from '../core/math';
import { ASPECT_PALETTES } from '../core/ids';
import { C } from './constants';
import type {
  ActionDef, ActionRequest, ActiveAction, Buff, BuffId, Command, Facing, FighterDef, FighterStats, FState, Side,
} from './types';
import { DT, emptyStats } from './types';
import { WEAPONS, type WeaponDef } from './weapons';
import { ABILITIES } from './abilities';
import { UNIVERSAL } from './universal';
import type { Simulation } from './simulation';

let actionUid = 1;

export interface HistoryFrame {
  x: number;
  y: number;
  hp: number;
}

/** Actions that are handled as movement/defence state changes rather than ActionDefs. */
export type MovementAction =
  | 'dashF' | 'dashB' | 'airdashF' | 'airdashB' | 'dodge' | 'rollF' | 'rollB' | 'parry' | 'vanish' | 'charge' | 'jump' | 'burst';

const MOVEMENT_ACTIONS = new Set<string>(['dashF', 'dashB', 'airdashF', 'airdashB', 'dodge', 'rollF', 'rollB', 'parry', 'vanish', 'charge', 'jump', 'burst']);

export class Fighter {
  readonly side: Side;
  readonly def: FighterDef;
  readonly weapon: WeaponDef;
  /** Every ActionDef this fighter can perform, keyed by id. */
  readonly actions = new Map<string, ActionDef>();

  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  facing: Facing = 1;
  grounded = true;
  state: FState = 'intro';
  stateT = 0;
  action: ActiveAction | null = null;

  hp: number = C.HP;
  maxHp: number = C.HP;
  energy = 50;
  guard: number = C.GUARD;
  wrath = 0;
  cooldowns = new Map<string, number>();
  buffs: Buff[] = [];

  /** Remaining stun for hitstun / blockstun / stagger style states. */
  stun = 0;
  /** Full intangibility ticks (teleports, getups, bursts...). */
  invuln = 0;
  airJumps = 1;
  airDashes = 1;
  crouching = false;
  blockLow = false;
  /** Ticks since parry started (state 'parry'). */
  parryT = 0;
  /** Defender-side combo bookkeeping. */
  comboHits = 0;
  comboDamage = 0;
  juggle = 0;
  juggleImmune = false;
  pendingGroundBounce = false;
  pendingWallBounce = false;
  pendingKnockdown = false;
  hardKnockdown = false;
  /** Wake-up choice buffered from the AI. */
  wakeChoice: Command['wake'] = null;
  lastStandUsed = false;
  burstCd = 0;
  energyDelay = 0;
  guardDelay = 0;
  /** Momentum -1..1 (landing hits raises it; getting hit lowers it). */
  momentum = 0;
  /** Teleport destination while vanished. */
  tpX = 0;
  tpY = 0;
  tpSource = 'vanish';
  vanishDur: number = C.VANISH_T;
  /** Remaining dash/airdash ticks for movement states. */
  moveT = 0;
  moveDir = 1;
  /** Tick of last hit taken + info for presentation. */
  lastHitTick = -999;
  lastHitDir = 1;
  lastHitLevel = 1;
  lastBlockTick = -999;
  lastDodgeEventTick = -999;
  lastAttackTick = -999;
  /** Animation override set by sequences (presentation). */
  anim: { clip: string; t: number } | null = null;
  /** Whether the fighter is under a scripted sequence's control. */
  scripted = false;
  /** Is this fighter frozen by time stop? */
  timeFrozen = false;
  /** Ring buffer history for rewind (2.5s). */
  history: HistoryFrame[] = [];
  stats: FighterStats = emptyStats();
  /** Last action id that this fighter started (for AI modeling). */
  lastActionId = '';
  /** Running count of actions per id (for AI anti-repetition). */
  actionCounts = new Map<string, number>();
  /** Previous-tick state for event detection. */
  prevGrounded = true;
  /** Current command (set each tick before update). */
  cmd: Command | null = null;
  /** Hit-stop style freeze of this fighter only (ticks), used by sequences. */
  freeze = 0;
  /** Name shortcut. */
  get name(): string {
    return this.def.name;
  }

  constructor(side: Side, def: FighterDef) {
    this.side = side;
    this.def = def;
    this.weapon = WEAPONS[def.weapon];
    for (const m of this.weapon.moves) this.actions.set(m.id, m);
    for (const slot of Object.keys(def.abilities) as (keyof FighterDef['abilities'])[]) {
      const ab = ABILITIES[def.abilities[slot]];
      this.actions.set(ab.def.id, ab.def);
    }
    for (const u of Object.values(UNIVERSAL)) this.actions.set(u.id, u);
  }

  /* ------------------------------------------------------------------ */
  /* Queries                                                            */
  /* ------------------------------------------------------------------ */

  move(name: string): ActionDef | undefined {
    return this.actions.get(`${this.def.weapon}.${name}`);
  }

  hasBuff(id: BuffId): boolean {
    for (const b of this.buffs) if (b.id === id) return true;
    return false;
  }
  buff(id: BuffId): Buff | undefined {
    for (const b of this.buffs) if (b.id === id) return b;
    return undefined;
  }
  addBuff(id: BuffId, t: number, v = 1, src: Side = this.side): Buff {
    const existing = this.buff(id);
    if (existing) {
      existing.t = Math.max(existing.t, t);
      existing.v = v;
      return existing;
    }
    const b: Buff = { id, t, v, src };
    this.buffs.push(b);
    return b;
  }
  removeBuff(id: BuffId): void {
    this.buffs = this.buffs.filter((b) => b.id !== id);
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  get airborne(): boolean {
    return !this.grounded;
  }

  /** Can accept a new free action this tick (neutral). */
  get actionable(): boolean {
    switch (this.state) {
      case 'idle': case 'walk': case 'run': case 'crouch': case 'air':
        return true;
      case 'block':
        return this.stun <= 0;
      case 'land':
        return this.stateT >= 2;
      case 'dash':
        return this.stateT >= 6;
      case 'backdash':
        return this.stateT >= C.BACKDASH_T - 2;
      case 'airdash':
        return this.stateT >= 6;
      case 'appear':
        return this.stateT >= (this.def.aspect === 'void' ? C.APPEAR_LOCK - 2 : C.APPEAR_LOCK);
      case 'charge':
        return true;
      default:
        return false;
    }
  }

  /** In a state where incoming attacks are punishable / the fighter is helpless. */
  get vulnerable(): boolean {
    switch (this.state) {
      case 'hitstun': case 'launched': case 'wallsplat': case 'guardbreak': case 'parried': case 'stagger': case 'bound': case 'charge':
        return true;
      case 'action':
        return this.actionPhase !== 'active';
      default:
        return false;
    }
  }

  get inHitstun(): boolean {
    return this.state === 'hitstun' || this.state === 'launched' || this.state === 'wallsplat' || this.state === 'bound';
  }

  get actionPhase(): 'startup' | 'active' | 'recovery' | null {
    const a = this.action;
    if (!a) return null;
    const s = a.def.startup + a.hold;
    if (a.frame < s) return 'startup';
    if (a.frame < s + a.def.active) return 'active';
    return 'recovery';
  }

  /** Ticks until this action's first active frame (0 if active/recovery). */
  get ticksToActive(): number {
    const a = this.action;
    if (!a) return 0;
    return Math.max(0, a.def.startup + a.hold - a.frame);
  }

  get actionTotal(): number {
    const a = this.action;
    if (!a) return 0;
    return a.def.startup + a.hold + a.def.active + a.def.recovery + (a.whiffed ? 4 : 0);
  }

  /** Remaining ticks until the current action finishes. */
  get actionRemaining(): number {
    return this.action ? Math.max(0, this.actionTotal - this.action.frame) : 0;
  }

  get intangible(): boolean {
    if (this.invuln > 0) return true;
    if (this.hasBuff('phase')) return true;
    switch (this.state) {
      case 'vanish': case 'dead': case 'getup': case 'tech': case 'burst': case 'victory': case 'intro':
        return true;
      case 'backdash':
        return this.stateT < C.BACKDASH_IFRAMES;
      case 'dodge': {
        const fr = this.moveDir === 0 ? C.DODGE_IFRAMES : C.ROLL_IFRAMES;
        return this.stateT >= fr[0] && this.stateT <= fr[1];
      }
      case 'locked':
        return this.scripted;
      default:
        break;
    }
    const a = this.action;
    // iframes are relative to the action's frame counter.
    if (a && a.def.iframes && a.frame >= a.def.iframes[0] && a.frame <= a.def.iframes[1]) return true;
    return false;
  }

  /** Damage multiplier from buffs/aspect. */
  get damageMult(): number {
    let m = 1;
    if (this.hasBuff('ascended')) m *= 1.2;
    if (this.hasBuff('empowered')) m *= 1.15;
    return m;
  }

  get speedMult(): number {
    let m = 1;
    if (this.def.aspect === 'tempest') m *= 1.12;
    if (this.hasBuff('ascended')) m *= 1.18;
    if (this.hasBuff('haste')) m *= 1.15;
    const chill = this.buff('chill');
    if (chill) m *= 1 - 0.12 * Math.min(3, chill.v);
    return m;
  }

  get canFly(): boolean {
    return this.hasBuff('ascended');
  }

  cooldownReady(id: string): boolean {
    return (this.cooldowns.get(id) ?? 0) <= 0;
  }

  vanishCost(): number {
    return this.def.aspect === 'void' ? Math.round(C.VANISH_COST * 0.45) : C.VANISH_COST;
  }

  /** Can the fighter currently afford & is allowed to start this action? (ignores state) */
  canAfford(def: ActionDef): boolean {
    if (!this.cooldownReady(def.id)) return false;
    if ((def.energyCost ?? 0) > this.energy + 1e-6) return false;
    if ((def.wrathCost ?? 0) > this.wrath + 1e-6) return false;
    return true;
  }

  hurtbox(): Capsule | null {
    if (this.state === 'dead' || this.state === 'vanish') return null;
    const x = this.x, y = this.y;
    if (this.state === 'knockdown' || this.state === 'getup') {
      return { ax: x - 46, ay: y - 10, bx: x + 46, by: y - 10, r: 12 };
    }
    const a = this.action;
    const crouchy = this.crouching || this.state === 'crouch' || (this.state === 'block' && this.blockLow) || (a && a.def.kind === 'sweep');
    if (crouchy) return { ax: x, ay: y - 12, bx: x, by: y - 66, r: 17 };
    if (this.state === 'launched') return { ax: x, ay: y - 30, bx: x, by: y - 92, r: 19 };
    return { ax: x, ay: y - 14, bx: x, by: y - 100, r: 17 };
  }

  /** World-space hitbox of the current action, if active. */
  hitbox(): Capsule | null {
    const a = this.action;
    if (!a || !a.def.hitbox) return null;
    if (this.actionPhase !== 'active') return null;
    const h = a.def.hitbox;
    const f = this.facing;
    return { ax: this.x + h.ax * f, ay: this.y + h.ay, bx: this.x + h.bx * f, by: this.y + h.by, r: h.r };
  }

  /** Approximate hand position (projectile spawn point). */
  handPos(): { x: number; y: number } {
    return { x: this.x + this.facing * 44, y: this.y - 84 };
  }

  centerY(): number {
    if (this.state === 'knockdown' || this.state === 'getup') return this.y - 12;
    return this.y - 60;
  }

  /* ------------------------------------------------------------------ */
  /* State helpers                                                      */
  /* ------------------------------------------------------------------ */

  setState(s: FState): void {
    if (this.state !== s) {
      this.state = s;
      this.stateT = 0;
    }
    if (s !== 'action') this.action = null;
    if (s !== 'block') this.blockLow = false;
    if (s !== 'crouch' && s !== 'block') this.crouching = false;
  }

  faceToward(x: number): void {
    const dx = x - this.x;
    if (Math.abs(dx) > 3) this.facing = dx > 0 ? 1 : -1;
  }

  /** Begin an ActionDef (assumes legality already checked). */
  startAction(sim: Simulation, def: ActionDef, req?: ActionRequest): void {
    const hold = clamp(req?.hold ?? 0, 0, def.chargeable ?? 6);
    const feint = def.feintable && req?.feintAt !== undefined ? clamp(req.feintAt, 2, def.startup + hold - 1) : -1;
    this.setState('action');
    this.action = {
      def, frame: 0, hold, feintAt: feint, hitCount: 0, hasHit: false, wasBlocked: false, whiffed: false,
      data: {}, aim: req?.aim ? { x: req.aim.x, y: req.aim.y } : null, uid: actionUid++,
    };
    if (def.energyCost) this.spendEnergy(def.energyCost);
    if (def.wrathCost) this.wrath = Math.max(0, this.wrath - def.wrathCost);
    if (def.cooldown) {
      const cdMult = this.def.aspect === 'chrono' ? 0.78 : 1;
      this.cooldowns.set(def.id, Math.round(def.cooldown * cdMult));
    }
    if (def.lungeStartup && this.grounded) this.vx = this.facing * def.lungeStartup * this.speedMult * (def.kind === 'dashAttack' ? 1 : 0.6);
    this.lastActionId = def.id;
    this.lastAttackTick = sim.tick;
    this.actionCounts.set(def.id, (this.actionCounts.get(def.id) ?? 0) + 1);
    if (def.kind !== 'universal' && def.kind !== 'ability') this.stats.attacksAttempted++;
    if (def.abilityId) {
      this.stats.abilitiesUsed++;
      if (def.slot === 'ultimate') this.stats.ultimatesUsed++;
    }
    sim.emit({ type: 'actionStart', side: this.side, id: def.id, name: def.name, kind: def.kind, abilityId: def.abilityId, x: this.x, y: this.y });
    if (def.abilityId) ABILITIES[def.abilityId].start?.(sim, this, this.action);
    else if (def.kind === 'universal') sim.universalStart(this, this.action);
  }

  spendEnergy(n: number): void {
    this.energy = Math.max(0, this.energy - n);
    this.energyDelay = C.ENERGY_REGEN_DELAY;
  }

  gainEnergy(n: number): void {
    this.energy = Math.min(C.ENERGY, this.energy + n);
  }

  gainWrath(n: number): void {
    this.wrath = Math.min(C.WRATH, this.wrath + n);
  }

  /** Can this action be started right now given state (including cancels)? */
  canStart(sim: Simulation, id: string): boolean {
    if (MOVEMENT_ACTIONS.has(id)) return this.canMovement(id);
    const def = this.actions.get(id);
    if (!def) return false;
    if (!this.canAfford(def)) return false;
    if (id === 'beamAnswer') {
      const opp = sim.opponentOf(this);
      const charging = opp.action?.def.abilityId === 'annihilationBeam' && opp.actionPhase === 'startup';
      if (!charging) return false;
    }
    if (this.grounded && def.groundOK === false) return false;
    if (!this.grounded && !def.airOK) return false;
    if (this.grounded && !def.groundOK && def.airOK) return false;
    if (this.actionable && this.state !== 'charge') return true;
    if (this.state === 'charge') return true;
    return this.canCancelInto(id);
  }

  canCancelInto(id: string): boolean {
    const a = this.action;
    if (!a || this.state !== 'action') return false;
    if (!(a.hasHit || (a.wasBlocked && a.def.cancelOnBlock))) return false;
    if (a.frame < a.def.startup + a.hold) return false;
    const c = a.def.cancels;
    if (!c) return false;
    if (c.includes(id)) return true;
    const def = this.actions.get(id);
    if (def && def.kind === 'ability' && c.includes('*ability')) return true;
    return false;
  }

  canMovement(id: string): boolean {
    const free = this.actionable;
    switch (id) {
      case 'dashF': case 'dashB': case 'rollF': case 'rollB': case 'dodge': case 'parry':
        return free && this.grounded;
      case 'airdashF': case 'airdashB':
        return (free || this.canCancelInto('vanish')) && !this.grounded && this.airDashes > 0;
      case 'jump':
        return free && (this.grounded || this.airJumps > 0);
      case 'vanish':
        return (free || this.canCancelInto('vanish') || this.state === 'block') && this.energy >= this.vanishCost() && this.cooldownReady('vanish');
      case 'charge':
        return free && this.grounded;
      case 'burst':
        return this.inHitstun && this.energy >= C.BURST_COST && this.burstCd <= 0 && this.comboHits >= 2;
      default:
        return false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Command application                                                */
  /* ------------------------------------------------------------------ */

  applyCommand(sim: Simulation, cmd: Command): void {
    this.cmd = cmd;
    if (this.timeFrozen || this.scripted || this.freeze > 0) return;
    if (this.state === 'dead' || this.state === 'victory' || this.state === 'intro' || this.state === 'locked') return;

    if (cmd.wake) this.wakeChoice = cmd.wake;

    if (cmd.burst && this.canMovement('burst')) {
      this.doBurst(sim);
      return;
    }

    // Charging continues only while requested.
    if (this.state === 'charge' && !(cmd.act && cmd.act.id === 'charge')) {
      this.setState('idle');
      sim.emit({ type: 'charge', side: this.side, on: false });
    }

    if (cmd.act) {
      const id = cmd.act.id;
      if (id === 'charge' && this.state === 'charge') {
        // keep charging
      } else if (this.canStart(sim, id)) {
        if (MOVEMENT_ACTIONS.has(id)) {
          this.doMovement(sim, id as MovementAction, cmd);
          return;
        }
        const def = this.actions.get(id)!;
        if (this.state === 'charge') sim.emit({ type: 'charge', side: this.side, on: false });
        if (cmd.face !== 0 && this.actionable) this.facing = (cmd.face > 0 ? 1 : -1) as Facing;
        else if (this.actionable && this.state !== 'block') this.faceToward(sim.opponentOf(this).x);
        this.startAction(sim, def, cmd.act);
        return;
      }
    }

    // Jump cancel on hit (launcher -> chase).
    if (cmd.jump && this.state === 'action' && this.action?.def.jumpCancel && this.action.hasHit && this.actionPhase !== 'startup') {
      this.doJump(sim, cmd.moveX, true);
      return;
    }

    if (!this.actionable || this.state === 'charge') return;

    // Deliberate turn (reading a cross-up).
    if (cmd.face !== 0) this.facing = (cmd.face > 0 ? 1 : -1) as Facing;

    // Neutral control.
    if (this.grounded) {
      if (cmd.block) {
        if (this.state !== 'block') this.setState('block');
        this.blockLow = cmd.crouch;
        this.crouching = cmd.crouch;
        return;
      }
      if (this.state === 'block') this.setState('idle');
      if (cmd.jump) {
        this.doJump(sim, cmd.moveX, false);
        return;
      }
      if (cmd.crouch && Math.abs(cmd.moveX) < 0.2) {
        if (this.state !== 'crouch') this.setState('crouch');
        this.crouching = true;
        return;
      }
      if (this.state === 'crouch') this.setState('idle');
      if (Math.abs(cmd.moveX) > 0.1) {
        const want: FState = cmd.run ? 'run' : 'walk';
        if (this.state !== want && (this.state === 'idle' || this.state === 'walk' || this.state === 'run' || this.state === 'land' || this.state === 'appear' || this.state === 'dash')) this.setState(want);
      } else if (this.state === 'walk' || this.state === 'run') {
        this.setState('idle');
      }
    } else {
      if (cmd.jump && this.airJumps > 0 && this.state === 'air' && this.vy > -500) this.doJump(sim, cmd.moveX, false);
    }
  }

  private doJump(sim: Simulation, moveX: number, fromCancel: boolean): void {
    const double = !this.grounded;
    if (double) this.airJumps--;
    this.setState('air');
    this.grounded = false;
    const v = (double ? C.DJUMP_V : C.JUMP_V) * (fromCancel ? 1.08 : 1) * (this.hasBuff('ascended') ? 1.1 : 1);
    this.vy = -v;
    this.vx = clamp(moveX, -1, 1) * C.AIR_SPEED * this.speedMult + (fromCancel ? this.facing * 60 : 0);
    sim.emit({ type: 'jump', side: this.side, x: this.x, y: this.y, double });
  }

  private doMovement(sim: Simulation, id: MovementAction, cmd: Command): void {
    const opp = sim.opponentOf(this);
    const toward: number = opp.x >= this.x ? 1 : -1;
    switch (id) {
      case 'dashF':
      case 'dashB': {
        const dir = id === 'dashF' ? toward : -toward;
        this.facing = toward as Facing;
        this.setState(id === 'dashF' ? 'dash' : 'backdash');
        this.moveDir = dir;
        this.moveT = id === 'dashF' ? C.DASH_T : C.BACKDASH_T;
        this.vx = dir * (id === 'dashF' ? C.DASH_V : C.BACKDASH_V) * this.speedMult;
        sim.emit({ type: 'dash', side: this.side, x: this.x, y: this.y, dir, air: false });
        break;
      }
      case 'airdashF':
      case 'airdashB': {
        const dir = id === 'airdashF' ? toward : -toward;
        this.airDashes--;
        this.setState('airdash');
        this.moveDir = dir;
        this.moveT = C.AIRDASH_T;
        this.vx = dir * C.AIRDASH_V * this.speedMult;
        this.vy = cmd.moveY * 300;
        sim.emit({ type: 'dash', side: this.side, x: this.x, y: this.y, dir, air: true });
        break;
      }
      case 'rollF':
      case 'rollB': {
        const dir = id === 'rollF' ? toward : -toward;
        this.setState('dodge');
        this.moveDir = dir;
        this.moveT = C.ROLL_T;
        this.vx = dir * C.ROLL_V * this.speedMult;
        this.stats.dodges += 0; // counted on successful evasion
        sim.emit({ type: 'dash', side: this.side, x: this.x, y: this.y, dir, air: false });
        break;
      }
      case 'dodge': {
        this.setState('dodge');
        this.moveDir = 0;
        this.moveT = C.DODGE_T;
        this.vx = -toward * 160;
        break;
      }
      case 'parry': {
        this.setState('parry');
        this.parryT = 0;
        this.facing = toward as Facing;
        break;
      }
      case 'vanish': {
        const place = cmd.act?.place ?? 'behind';
        const p = sim.teleportTarget(this, place);
        this.beginVanish(sim, p.x, p.y, 'vanish');
        this.spendEnergy(this.vanishCost());
        this.cooldowns.set('vanish', C.VANISH_CD);
        break;
      }
      case 'charge': {
        this.setState('charge');
        sim.emit({ type: 'charge', side: this.side, on: true });
        break;
      }
      case 'jump':
        this.doJump(sim, cmd.moveX, false);
        break;
      case 'burst':
        this.doBurst(sim);
        break;
    }
  }

  beginVanish(sim: Simulation, tx: number, ty: number, source: string, duration: number = C.VANISH_T): void {
    sim.emit({ type: 'vanish', side: this.side, x: this.x, y: this.y, source });
    this.setState('vanish');
    this.vanishDur = duration;
    this.tpX = tx;
    this.tpY = ty;
    this.tpSource = source;
    this.vx = 0;
    this.vy = 0;
    this.stats.teleports++;
  }

  doBurst(sim: Simulation): void {
    this.spendEnergy(C.BURST_COST);
    this.burstCd = C.BURST_CD;
    this.setState('burst');
    this.stun = 0;
    this.vx = 0;
    this.vy = this.grounded ? 0 : -200;
    this.comboHits = 0;
    this.comboDamage = 0;
    this.juggle = 0;
    sim.onBurst(this);
  }

  /* ------------------------------------------------------------------ */
  /* Per-tick update                                                    */
  /* ------------------------------------------------------------------ */

  update(sim: Simulation): void {
    if (this.timeFrozen) return;
    if (this.freeze > 0) {
      this.freeze--;
      return;
    }
    this.stateT++;
    if (this.invuln > 0) this.invuln--;
    if (this.burstCd > 0) this.burstCd--;
    for (const [k, v] of this.cooldowns) if (v > 0) this.cooldowns.set(k, v - 1);

    // Buffs.
    for (const b of this.buffs) {
      b.t--;
      if (b.id === 'burn' && sim.tick % 15 === 0 && this.hp > 1) {
        const d = Math.min(this.hp - 1, 1.6 * b.v * sim.damageScale);
        this.hp -= d;
        this.stats.damageTaken += d;
        sim.fighters[b.src].stats.damageDealt += d;
      }
      if (b.id === 'regen' && this.hp > 0) {
        const heal = Math.min(this.maxHp - this.hp, b.v / 60);
        this.hp += heal;
        this.stats.healing += heal;
      }
    }
    const expired = this.buffs.filter((b) => b.t <= 0);
    if (expired.length) {
      this.buffs = this.buffs.filter((b) => b.t > 0);
      for (const b of expired) sim.onBuffExpired(this, b);
    }

    // Resources.
    if (this.energyDelay > 0) this.energyDelay--;
    else if (this.state !== 'charge') this.gainEnergy((C.ENERGY_REGEN * (this.hasBuff('ascended') ? 2 : 1) * sim.energyRegenMult) * DT);
    if (this.state === 'charge') this.gainEnergy(C.CHARGE_RATE * DT);
    if (this.guardDelay > 0) this.guardDelay--;
    else if (this.state !== 'block') this.guard = Math.min(C.GUARD, this.guard + C.GUARD_REGEN * DT);
    this.momentum *= 0.9985;

    if (this.scripted || this.state === 'locked') {
      // Sequence owns position/animation; still integrate if it set velocities.
      return;
    }

    switch (this.state) {
      case 'idle': case 'walk': case 'run': case 'crouch': case 'block': case 'land': case 'appear':
        this.updateGroundNeutral(sim);
        break;
      case 'jumpsquat':
        break;
      case 'air':
        this.updateAir(sim);
        break;
      case 'dash': case 'backdash':
        this.updateDash(sim);
        break;
      case 'airdash':
        this.moveT--;
        if (this.moveT <= 0) {
          this.setState('air');
          this.vx *= 0.55;
        }
        break;
      case 'dodge':
        this.moveT--;
        if (this.moveDir === 0 || this.moveT < 8) this.vx = approach(this.vx, 0, 2600 * DT);
        if (this.moveT <= 0) this.setState('idle');
        break;
      case 'parry':
        this.parryT++;
        this.vx = approach(this.vx, 0, C.GROUND_FRICTION * DT);
        if (this.parryT >= C.PARRY_T) this.setState(this.cmd?.block ? 'block' : 'idle');
        break;
      case 'action':
        this.updateAction(sim);
        break;
      case 'vanish':
        if (this.stateT >= this.vanishDur) {
          this.x = this.tpX;
          this.y = this.tpY;
          this.grounded = this.y >= 0;
          if (this.grounded) this.y = 0;
          this.faceToward(sim.opponentOf(this).x);
          this.setState('appear');
          this.vx = 0;
          this.vy = 0;
          sim.onAppear(this);
        }
        break;
      case 'hitstun':
        this.stun--;
        if (this.grounded) this.vx = approach(this.vx, 0, C.GROUND_FRICTION * 0.7 * DT);
        if (this.stun <= 0) this.recoverFromStun(sim);
        break;
      case 'launched':
        this.stun--;
        if (this.stun <= 0 && !this.pendingKnockdown && this.juggleImmune) {
          // Air recovery flip.
          this.setState('air');
          this.invuln = 8;
          this.endCombo();
          sim.emit({ type: 'tech', side: this.side, x: this.x, y: this.y });
        } else if (this.stun <= -30 && !this.grounded) {
          // Safety: never stay launched forever.
          this.setState('air');
          this.endCombo();
        }
        break;
      case 'wallsplat':
        this.stun--;
        this.vx = 0;
        this.vy = Math.min(this.vy, 120);
        if (this.stun <= 0) {
          this.setState('launched');
          this.stun = 18;
          this.pendingKnockdown = true;
          this.vx = -this.lastHitDir * -120;
          this.vy = -150;
        }
        break;
      case 'knockdown':
        this.vx = approach(this.vx, 0, C.GROUND_FRICTION * DT);
        if (this.stateT >= (this.hardKnockdown ? C.KNOCKDOWN_T + 10 : C.KNOCKDOWN_T)) this.startGetup(sim);
        break;
      case 'getup':
        this.vx = approach(this.vx, 0, C.GROUND_FRICTION * 0.5 * DT);
        if (this.stateT >= C.GETUP_T) {
          this.setState('idle');
          this.endCombo();
        }
        break;
      case 'tech':
        this.vx = approach(this.vx, 0, 2000 * DT);
        if (this.stateT >= C.TECH_T) {
          this.setState('idle');
          this.endCombo();
        }
        break;
      case 'guardbreak': case 'parried': case 'stagger':
        this.stun--;
        if (this.grounded) this.vx = approach(this.vx, 0, C.GROUND_FRICTION * DT);
        if (this.stun <= 0) this.setState(this.grounded ? 'idle' : 'air');
        break;
      case 'charge':
        this.vx = approach(this.vx, 0, C.GROUND_FRICTION * DT);
        break;
      case 'burst':
        this.vx = 0;
        if (!this.grounded) this.vy = Math.min(this.vy, 0);
        if (this.stateT >= 22) {
          this.setState(this.grounded ? 'idle' : 'air');
          this.invuln = 6;
        }
        break;
      case 'bound':
        this.stun--;
        this.vx = 0;
        if (this.grounded) this.vy = 0;
        else this.vy = Math.min(this.vy, 60);
        if (this.stun <= 0) {
          this.setState(this.grounded ? 'idle' : 'air');
          this.endCombo();
        }
        break;
      default:
        break;
    }
  }

  private updateGroundNeutral(sim: Simulation): void {
    const cmd = this.cmd;
    if (this.state === 'block' && this.stun > 0) {
      this.stun--;
      this.vx = approach(this.vx, 0, C.GROUND_FRICTION * 0.6 * DT);
      if (!this.grounded) this.setState('air');
      return;
    }
    if (this.state === 'land' && this.stateT >= C.LAND_T) this.setState('idle');
    if (this.state === 'appear' && this.stateT >= C.APPEAR_T) this.setState(this.grounded ? 'idle' : 'air');
    if (!this.grounded) {
      if (this.state !== 'appear') this.setState('air');
      else {
        // Teleported into the air: float briefly then fall.
        this.vy = Math.min(this.vy + C.GRAVITY * 0.3 * DT, 400);
      }
      return;
    }
    const opp = sim.opponentOf(this);
    if (cmd && cmd.face !== 0) this.facing = (cmd.face > 0 ? 1 : -1) as Facing;
    else if ((this.state !== 'block' || this.stateT < 2) && opp.state !== 'vanish') this.faceToward(opp.x);
    let target = 0;
    if (cmd && (this.state === 'walk' || this.state === 'run')) {
      const sp = (this.state === 'run' ? C.RUN : C.WALK) * this.speedMult;
      target = clamp(cmd.moveX, -1, 1) * sp;
    }
    const accel = target === 0 ? C.GROUND_FRICTION : C.GROUND_ACCEL;
    this.vx = approach(this.vx, target, accel * DT);
  }

  private updateAir(sim: Simulation): void {
    const cmd = this.cmd;
    const opp = sim.opponentOf(this);
    if (this.stateT < 3 || Math.abs(opp.x - this.x) > 30) this.faceToward(opp.x);
    if (cmd) {
      const target = clamp(cmd.moveX, -1, 1) * C.AIR_SPEED * this.speedMult;
      this.vx = approach(this.vx, target, C.AIR_ACCEL * DT);
      if (this.canFly) {
        // Ascended fighters can hover/fly.
        const ty = clamp(cmd.moveY, -1, 1) * 520;
        this.vy = approach(this.vy, ty, 3200 * DT);
      }
    }
  }

  private updateDash(sim: Simulation): void {
    this.moveT--;
    const isBack = this.state === 'backdash';
    if (this.moveT <= 0) {
      if (!isBack && this.cmd?.run) this.setState('run');
      else this.setState('idle');
      return;
    }
    // Late-dash deceleration for weight.
    if (this.moveT < 4) this.vx *= 0.82;
    void sim;
  }

  private updateAction(sim: Simulation): void {
    const a = this.action!;
    const def = a.def;
    const startupTotal = def.startup + a.hold;

    // Feint: cancel during startup.
    if (a.feintAt >= 0 && a.frame === a.feintAt) {
      this.stats.feints++;
      sim.emit({ type: 'feint', side: this.side, x: this.x, y: this.y });
      this.spendEnergy(4);
      this.setState(this.grounded ? 'idle' : 'air');
      return;
    }

    if (a.frame === startupTotal) {
      // Becoming active.
      if (def.lungeActive) this.vx = this.facing * def.lungeActive * this.speedMult;
      if (def.riseActive !== undefined) this.vy = def.riseActive;
      if (def.hitbox) sim.emit({ type: 'swing', side: this.side, id: def.id, level: def.hit?.level ?? 1, x: this.x, y: this.y, blade: this.weapon.blade });
    }

    // Ability / universal behaviour hooks.
    if (def.abilityId) ABILITIES[def.abilityId].update?.(sim, this, a);
    else if (def.kind === 'universal') sim.universalUpdate(this, a);
    if (this.state !== 'action' || this.action !== a) return; // hook changed state

    // Physics during actions.
    if (this.grounded) {
      const fr = a.frame < startupTotal ? 2600 : 3600;
      this.vx = approach(this.vx, 0, fr * DT);
    }

    a.frame++;
    if (a.frame === startupTotal + def.active && def.hitbox && !a.hasHit && !a.wasBlocked) a.whiffed = true;

    if (a.frame >= this.actionTotal) {
      if (def.abilityId) ABILITIES[def.abilityId].end?.(sim, this, a);
      if (this.state === 'action' && this.action === a) {
        this.setState(this.grounded ? 'idle' : 'air');
      }
    }
  }

  recoverFromStun(sim: Simulation): void {
    if (this.grounded) {
      this.setState('idle');
      this.endCombo();
    } else {
      this.setState('launched');
      this.stun = 6;
    }
    void sim;
  }

  startGetup(sim: Simulation): void {
    const choice = this.wakeChoice ?? 'neutral';
    this.wakeChoice = null;
    this.setState('getup');
    this.invuln = 0;
    this.hardKnockdown = false;
    const opp = sim.opponentOf(this);
    const toward = opp.x >= this.x ? 1 : -1;
    if (choice === 'rollF') this.vx = toward * 560;
    else if (choice === 'rollB') this.vx = -toward * 560;
    else this.vx = 0;
    this.faceToward(opp.x);
  }

  endCombo(): void {
    if (this.comboHits > 0) {
      this.comboHits = 0;
      this.comboDamage = 0;
    }
    this.juggle = 0;
    this.juggleImmune = false;
    this.pendingGroundBounce = false;
    this.pendingWallBounce = false;
    this.pendingKnockdown = false;
  }

  /** Integrate velocity, gravity, ground / ceiling / wall collisions. */
  integrate(sim: Simulation): void {
    if (this.timeFrozen || this.freeze > 0) return;
    if (this.state === 'vanish' || this.state === 'dead') return;
    if (this.scripted) {
      this.x += this.vx * DT;
      this.y += this.vy * DT;
      return;
    }
    const half = sim.arena.halfWidth - 20;
    // Gravity.
    const floating =
      this.state === 'airdash' || this.state === 'burst' || this.state === 'wallsplat' || this.state === 'bound' ||
      (this.state === 'appear' && this.stateT < 6) || (this.canFly && this.state === 'air') ||
      (this.state === 'action' && this.action?.def.abilityId !== undefined && this.action.data.float === 1);
    if (!this.grounded && !floating) {
      const g = this.state === 'launched' || this.state === 'hitstun' ? C.JUGGLE_GRAVITY : C.GRAVITY;
      this.vy = Math.min(C.MAX_FALL, this.vy + g * DT);
    }
    this.x += this.vx * DT;
    this.y += this.vy * DT;

    // Ceiling.
    if (this.y < sim.arena.ceiling) {
      this.y = sim.arena.ceiling;
      if (this.vy < 0) this.vy = -this.vy * 0.3;
    }

    // Walls.
    if (this.x < -half || this.x > half) {
      const dir = this.x < -half ? -1 : 1;
      this.x = dir < 0 ? -half : half;
      const speedIntoWall = this.vx * dir;
      if ((this.state === 'launched' || this.state === 'hitstun') && (this.pendingWallBounce || speedIntoWall > 900) && speedIntoWall > 380) {
        sim.onWallSplat(this, dir);
      } else if (speedIntoWall > 0) {
        this.vx = -this.vx * 0.2;
      }
    }

    // Ground.
    if (this.y >= 0) {
      const impactV = this.vy;
      this.y = 0;
      if (!this.grounded) {
        this.grounded = true;
        this.airJumps = 1;
        this.airDashes = 1;
        this.onLand(sim, impactV);
      } else {
        this.vy = 0;
      }
    } else if (this.grounded && this.y < -0.5) {
      this.grounded = false;
    }
  }

  private onLand(sim: Simulation, impactV: number): void {
    switch (this.state) {
      case 'launched':
      case 'hitstun': {
        if (this.pendingGroundBounce) {
          this.pendingGroundBounce = false;
          this.grounded = false;
          this.y = -1;
          this.vy = -Math.max(620, impactV * 0.55);
          this.vx *= 0.6;
          this.setState('launched');
          this.stun = Math.max(this.stun, 30);
          sim.emit({ type: 'groundBounce', side: this.side, x: this.x, y: 0 });
          sim.onHeavyLanding(this, impactV);
          return;
        }
        if (this.state === 'hitstun' && !this.pendingKnockdown && impactV < 700) {
          // Light air hit landing: keep standing hitstun.
          this.vy = 0;
          return;
        }
        // Tech or knockdown.
        this.vy = 0;
        const canTech = !this.hardKnockdown && this.wakeChoice === 'tech' && this.juggle < 5;
        if (canTech) {
          this.wakeChoice = null;
          this.setState('tech');
          const away = this.lastHitDir;
          this.vx = away * 380;
          sim.emit({ type: 'tech', side: this.side, x: this.x, y: 0 });
        } else {
          this.setState('knockdown');
          this.vx *= 0.4;
          sim.emit({ type: 'knockdown', side: this.side, x: this.x, y: 0 });
        }
        if (impactV > 1100) sim.onHeavyLanding(this, impactV);
        return;
      }
      case 'air':
      case 'airdash':
        this.vy = 0;
        this.setState('land');
        this.vx *= 0.5;
        sim.emit({ type: 'land', side: this.side, x: this.x, y: 0, heavy: impactV > 1300 });
        return;
      case 'action': {
        this.vy = 0;
        const a = this.action;
        if (a && a.def.slam) {
          sim.onSlamLanding(this, impactV);
          // Landing ends air attacks with landing recovery.
          a.frame = Math.max(a.frame, a.def.startup + a.hold + a.def.active);
        } else if (a && a.def.airOK && !a.def.groundOK) {
          // Air normal interrupted by landing: small landing lag.
          this.setState('land');
        }
        if (a?.def.abilityId) ABILITIES[a.def.abilityId].land?.(sim, this, a);
        sim.emit({ type: 'land', side: this.side, x: this.x, y: 0, heavy: impactV > 1300 });
        return;
      }
      case 'wallsplat':
      case 'bound':
        this.vy = 0;
        return;
      default:
        this.vy = 0;
        if (this.state === 'appear') return;
        sim.emit({ type: 'land', side: this.side, x: this.x, y: 0, heavy: impactV > 1300 });
        return;
    }
  }

  recordHistory(): void {
    this.history.push({ x: this.x, y: this.y, hp: this.hp });
    if (this.history.length > 150) this.history.shift();
  }

  get color(): string {
    return ASPECT_PALETTES[this.def.aspect].primary;
  }
}
