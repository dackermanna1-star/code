// Player controller: maps input to character intents and actions. Movement is camera-relative
// and immediate; actions are buffered briefly so presses made during another action still
// happen; interactions pick a sensible default target that can be cycled.
import { CONFIG } from '../config.js';
import { pickCombatTarget, interactionCandidates } from './targeting.js';
import { yawTo } from '../core/mathutil.js';

export class PlayerController {
  constructor(game, c) {
    this.game = game; this.c = c;
    this.interactTarget = null; this.candidates = []; this.cycleIndex = 0;
    this.approach = null; // {cand, t}
    this.lastMoveYaw = c.yaw;
    this.lock = null;
  }
  get input() { return this.game.input; }

  update(dt) {
    const g = this.game, c = this.c, input = this.input;
    if (!input.enabled) { c.stop(); return; }
    const mv = input.moveVector();
    const rig = g.cameraRig;
    const { fx, fz, rx, rz } = rig.basis();
    let dx = rx * mv.x + fx * mv.y, dz = rz * mv.x + fz * mv.y;
    const moving = mv.mag > 0.05;
    if (moving) this.lastMoveYaw = Math.atan2(dx, dz);
    // Conversations: walking away ends them (after a short grace so the E press doesn't leak).
    if (g.dialogue && g.dialogue.active) {
      if (moving && g.dialogue.age > 0.35) g.dialogue.close('walkaway');
      else { c.stop(); return; }
    }
    // State-specific mashing
    if (c.state === 'down') { for (const a of ['attack', 'heavy', 'dodge', 'interact', 'grab']) if (input.consume(a, 0.2)) c.struggleUp(); c.stop(); return; }
    if (c.state === 'grappled') { for (const a of ['attack', 'heavy', 'dodge', 'grab']) if (input.consume(a, 0.2)) c.struggle(0.11 + c.stats.str / 900); c.stop(); return; }
    if (c.state === 'ko' || c.state === 'thrown' || c.state === 'cuffed') { c.stop(); return; }
    if (c.state === 'spot') {
      if (moving || input.consume('interact', 0.2) || input.consume('dodge', 0.2)) c.leaveSpot();
      g.activityInput?.(c, input);
      return;
    }
    // Movement
    const sprint = input.isDown('sprint') && mv.mag > 0.5 && c.stamina > 4 && !c.blocking;
    const walk = input.isDown('walk');
    c.sprinting = sprint;
    let speed = mv.mag * c.maxSpeed(sprint ? 'sprint' : walk ? 'walk' : 'run');
    if (moving) this.approach = null;
    // Auto-approach toward an interaction target (short, cancellable)
    if (this.approach) {
      const ap = this.approach; ap.t += dt;
      const tx = ap.cand.kind === 'spot' ? ap.cand.ref.ax : ap.cand.x, tz = ap.cand.kind === 'spot' ? ap.cand.ref.az : ap.cand.z;
      const d = Math.hypot(tx - c.x, tz - c.z);
      const reach = ap.cand.kind === 'talk' ? CONFIG.interact.talkReach - 0.4 : ap.cand.kind === 'spot' ? 0.45 : CONFIG.interact.reach - 0.15;
      if (d <= reach) { this.approach = null; this._perform(ap.cand); }
      else if (ap.t > 1.8) this.approach = null;
      else { dx = tx - c.x; dz = tz - c.z; speed = c.maxSpeed('run') * 0.85; }
    }
    c.setMove(dx, dz, speed);
    // Targeting
    const prefYaw = moving ? this.lastMoveYaw : c.yaw;
    c.combatTarget = this.lock && !this.lock.isDown ? this.lock : pickCombatTarget(c, g.characters, prefYaw, c.combatTarget);
    if (input.consume('lock', 0.2)) {
      if (this.lock) this.lock = null;
      else if (c.combatTarget) this.lock = c.combatTarget;
      g.events.emit('lockOn', { c, target: this.lock });
    }
    if (this.lock && (this.lock.state === 'ko' || Math.hypot(this.lock.x - c.x, this.lock.z - c.z) > 12)) this.lock = null;
    c.lockTarget = this.lock;
    // Interaction target (only when not mid-fight)
    this.candidates = interactionCandidates(g, c, prefYaw);
    if (input.consume('cycle', 0.2) && this.candidates.length > 1) this.cycleIndex = (this.cycleIndex + 1) % this.candidates.length;
    const prev = this.interactTarget;
    let pick = this.candidates[Math.min(this.cycleIndex, this.candidates.length - 1)] || null;
    if (prev && pick && prev.ref !== pick.ref) {
      const still = this.candidates.find((x) => x.ref === prev.ref);
      if (still && still.score < pick.score + CONFIG.interact.hysteresis && this.cycleIndex === 0) pick = still;
    }
    if (!pick) this.cycleIndex = 0;
    this.interactTarget = pick;
    // Actions (pressed() keeps a press alive for the buffer window until it succeeds)
    const B = CONFIG.combat.bufferWindow;
    if (c.state === 'grapple') {
      if (input.consume('attack', B)) c.attack('light');
      if (input.consume('heavy', B)) c.attack('heavy');
      if (input.consume('grab', B)) c.grappleThrow(dx, dz);
      if (input.consume('dodge', B)) c.grappleRelease();
      return;
    }
    if (input.pressed('block', 0.05) && c.counterWindow > 0 && c.counter()) { input.clearAction('block'); }
    c.setBlock(input.isDown('block') && c.state === 'free');
    if (input.pressed('dodge', B) && c.dodge(moving ? dx : 0, moving ? dz : 0)) input.clearAction('dodge');
    if (input.pressed('attack', B) && c.attack('light')) input.clearAction('attack');
    if (input.pressed('heavy', B) && c.attack('heavy')) input.clearAction('heavy');
    if (input.pressed('grab', B)) {
      const ok = c.held ? c.throwHeld(c.combatTarget && Math.hypot(c.combatTarget.x - c.x, c.combatTarget.z - c.z) < 14 ? c.combatTarget : null, moving ? dx : null, moving ? dz : null) : c.grab();
      if (ok) input.clearAction('grab');
    }
    if (input.pressed('drop', B) && c.drop()) input.clearAction('drop');
    if (input.pressed('use', B) && c.useHeld()) input.clearAction('use');
    if (input.consume('interact', B)) this.interact();
  }

  interact() {
    const t = this.interactTarget;
    if (!t) { this.game.events.emit('nothingHere', { c: this.c }); return; }
    const c = this.c;
    const tx = t.kind === 'spot' ? t.ref.ax : t.x, tz = t.kind === 'spot' ? t.ref.az : t.z;
    const d = Math.hypot(tx - c.x, tz - c.z);
    const reach = t.kind === 'talk' ? CONFIG.interact.talkReach : t.kind === 'spot' ? 0.9 : CONFIG.interact.reach;
    if (d <= reach || (t.kind === 'spot' && Math.hypot(t.ref.x - c.x, t.ref.z - c.z) < 1.1)) this._perform(t);
    else if (d <= CONFIG.interact.approachMax + (t.kind === 'spot' ? 1 : 0)) this.approach = { cand: t, t: 0 };
    else this.game.events.emit('tooFar', { c, target: t });
  }
  _perform(t) {
    const g = this.game, c = this.c;
    if (t.kind === 'talk') g.startConversation(c, t.ref);
    else if (t.kind === 'item') { if (c.held && !(t.ref.def.pocket && c.pockets.length < 3)) c.dropHeld(1); c.pickUp(t.ref); }
    else if (t.kind === 'spot') g.tryUseSpot(c, t.ref);
    else if (t.kind === 'special' && t.action) t.action(c);
    this.cycleIndex = 0;
  }
  promptText() {
    const t = this.interactTarget;
    if (!t) return null;
    const verb = t.kind === 'talk' ? `Talk to ${t.ref.short}` : t.kind === 'item' ? (t.ref.def.pocket && !this.c.held ? `Pick up ${t.ref.def.name}` : `Pick up ${t.ref.def.name}`) : t.kind === 'spot' ? this.game.spotVerb(t.ref) : t.label;
    return { verb, more: this.candidates.length > 1 ? this.candidates.length - 1 : 0, cand: t };
  }
}
void yawTo;
