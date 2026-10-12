// Zombie survival stagger and stopping power (Milestone 2.1, owner: stagger). A hit, a shove,
// a tesla jolt or a chainsaw bite can stop a zombie for a moment: no step forward, no swing
// (a swing already winding up is lost).
//
// The shared API (m2-contracts): every caller goes through
//   g.zombies.stagger(z, amount, dir, src, by)  ->  seconds it is held (0: shrugged off)
// amount: stopping power, 1 = a clean full stagger (a point-blank pump shotgun); under FLINCH
// only a flinch (no hold); KNOCKDOWN and up drops it to its knees. dir: [x,y,z] the push
// (unit, or null); src: what did it (a weapon id, 'shove', 'tesla', 'chainsaw', 'director');
// by: the Player responsible, or null.
// Per zombie (reset in ZombieMode.spawnZombie, read by anyone, written only here):
//   z.staggerUntil  game time the hold ends (0 / past: free); ZombieMode.think skips
//                   chase / special trick / attack while it lasts and calls hold() instead
//   z.staggerKind   'flinch' | 'stagger' | 'knockdown' | 'stun' (the last one), or null
//   z.staggerN      staggers this life (diminishing returns)
//   z.poise         0..1, built up by hits, drains with time (the stagger builder fills it)
// Difficulty: g.zombies.diff.stagger { resist, decay, cooldown, knockdown } (zdiff.js).
// Event: 'stagger' when the one responsible is in the squad (runstats.js).
//
// Scaffold (foundation): a plain baseline - bosses never stagger, a special mid-trick is
// left alone, the hold lasts 0.6 s x amount (at most 1.2 s, / resist), diminishing returns
// and per-weapon stopping power are the stagger builder's (with the hit impulse on the model,
// leg knockdowns, HEAD_POPPERS and the tesla / chainsaw calls).
import { inSquad } from './runstats.js';

export const FLINCH = 0.35, KNOCKDOWN = 1.5;
const HOLD = 0.6, HOLD_MAX = 1.2, PUSH = 120;

export class ZStagger {
  constructor(game) {
    this.game = game;
    this.subscribed = false;
    this.reset();
    Promise.resolve().then(() => this.subscribe()); // (built before game.zombies is set)
  }

  get Z() { return this.game.zombies; }

  subscribe() {
    const ev = this.game.zombies?.events;
    if (this.subscribed || !ev) return;
    this.subscribed = true;
    ev.on('run', (e) => { if (e.phase === 'start') this.reset(); });
  }

  reset() {}

  /** Every tick (ZombieMode.tick). */
  tick(t) { void t; }

  /** See the header. Returns the seconds z is held (0: no hold). */
  apply(z, amount, dir = null, src = null, by = null) {
    if (!z || !z.alive || !z.isZombie || z.isBoss || !(amount > 0)) return 0;
    if (z.sp && z.sp.state !== 'chase') return 0; // (a special mid-trick: the stagger builder decides)
    const g = this.game, t = g.time, D = this.Z.diff.stagger;
    const kind = amount >= KNOCKDOWN ? 'knockdown' : amount >= FLINCH ? 'stagger' : 'flinch';
    z.staggerKind = kind;
    let hold = 0;
    if (kind !== 'flinch') {
      hold = Math.min(HOLD_MAX, HOLD * amount) / (D?.resist || 1);
      z.staggerUntil = Math.max(z.staggerUntil || 0, t + hold);
      z.staggerN = (z.staggerN || 0) + 1;
      z.windup = 0; // the swing is lost
      z.nextAttack = Math.max(z.nextAttack || 0, z.staggerUntil + 0.15);
      if (dir) { const k = PUSH * Math.min(1.5, amount); z.pm.velocity[0] += dir[0] * k; z.pm.velocity[1] += dir[1] * k; }
    }
    this.emit(z, by, kind, src, amount);
    return hold;
  }

  /** ZombieMode.think while z.staggerUntil is ahead: what it does instead. True: nothing else this tick. */
  hold(z, target, cmd, t) {
    void target; void t;
    cmd.forwardmove = 0; cmd.sidemove = 0;
    z.windup = 0;
    return true;
  }

  emit(z, by, kind, src, amount) {
    const ev = this.Z.events;
    if (!inSquad(by) || !ev.has('stagger')) return;
    const e = ev.obj('stagger');
    e.zombie = z; e.by = by; e.kind = kind; e.src = src || 'world'; e.amount = amount;
    e.until = z.staggerUntil || 0; e.wave = this.Z.wave; e.t = this.game.time;
    ev.emit('stagger', e);
  }

  /** HUD state (buildHudState, every frame). */
  hud(s) { void s; }

  /** Per frame (game.frame, zombie mode only): model impulses and the like. */
  frame(dt) { void dt; }

  /** An unclaimed command (ZombieMode.command). True when it was ours. */
  command(p, cmd, args) { void p; void cmd; void args; return false; }
}
