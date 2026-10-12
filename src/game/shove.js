// Zombie survival melee shove (Milestone 2.2, owner: shove). Any weapon bashes: zombies in a
// short cone in front (60 degrees, 70 u: the pool, specials and the boss) are pushed back and
// staggered (g.zombies.stagger(z, amount, dir, 'shove', p)), lose their swing, and a teammate
// held by a hunter or a smoker is pulled free (g.zombies.specials.letGo(special, p)). Spamming
// it tires you (pips under the crosshair, L4D style). Bots shove too (bots.js combat, zombie
// branch): when they're swarmed, and to free a pinned or tongued teammate.
//  - a full shove takes a pip; a pip comes back diff.shove.regen s after the last shove (every
//    shove restarts the clock, so spamming keeps you tired). Out of pips you still bash, but
//    weakly (a flinch and a nudge, the swing goes on) and only every diff.shove.tired s
//  - a hunter in mid-air is knocked out of its leap (the deadstop); a charger is too heavy to
//    move much and the boss only rocks (a token push, no stagger)
//  - pinned flat you can't shove; on a smoker's tongue you can (shove it when it reels you in)
//  - bindings: Mouse 4 (input.js DEFAULT_BINDS) and the Options shove key (settings shoveKey,
//    T by default; F stays the flashlight), both the 'shove' command
//
// Contract (m2-contracts 3.6):
//   shove.command(p, 'shove')       the key bind / console command. True when taken.
//   shove.tryShove(p)               do it for p (you or a bot); returns the zombies hit, or -1
//                                   when it can't (down, dead, pinned, too soon, too tired)
//   shove.pips(p)                   fatigue pips left (for the HUD and the bots)
// Per player: p.shove = { pips, regenAt, at (the last shove: the bash animation), next,
// tiredUntil, weak } (this module's; null until the first look).
// Difficulty: g.zombies.diff.shove { pips, regen, tired } (zdiff.js). Event: 'shove' (runstats.js).
import { inSquad } from './runstats.js';

const RAD = Math.PI / 180;
const HALF = 30 * RAD; // the cone: 60 degrees across...
const RANGE = 70; // ...and 70 u out to the zombie's hull (16 u radius)
const HULL_R = 16;
const DZ = 56; // vertical reach (a step up or down)
const COOLDOWN = 0.55; // s between two shoves, fresh or not
const BASH = 0.36; // s the view model's bash lasts
const AMOUNT = 1, AMOUNT_WEAK = 0.3; // stopping power (zstagger.js: 1 a full stagger, under 0.35 a flinch)
const PUSH = 230, PUSH_WEAK = 90, PUSH_BOSS = 35; // u/s on top of the stagger's own push
const SWING_LOST = 0.45; // s before a shoved zombie may wind up again
const DEADSTOP = 1.1; // s a hunter knocked out of its leap needs to get up
// bots: who to free (u), how close to shove, how often they think about it
const RESCUE_R = 360, BOT_THINK = [0.12, 0.3];

const _eye = [0, 0, 0], _chest = [0, 0, 0];
const rand = (a, b) => a + Math.random() * (b - a);

export class Shove {
  constructor(game) {
    this.game = game;
    this.subscribed = false;
    this.hs = { show: false, pips: 0, max: 0, frac: 0, weak: false, alpha: 0, bash: 0 }; // (HUD state, reused)
    this.reset();
    Promise.resolve().then(() => this.subscribe()); // (built before game.zombies is set)
    game.hud?.addLayer?.((hud, s) => this.draw(hud, s), 2);
  }

  get Z() { return this.game.zombies; }

  subscribe() {
    const ev = this.game.zombies?.events;
    if (this.subscribed || !ev) return;
    this.subscribed = true;
    ev.on('run', (e) => { if (e.phase === 'start') this.reset(); });
  }

  /** A new run: everybody fresh (the difficulty may have changed the pips). */
  reset() {
    for (const p of this.game.players || []) p.shove = null;
  }

  /** p's fatigue state (made on first use, full). */
  state(p) {
    return p.shove || (p.shove = { pips: this.Z.diff.shove.pips, regenAt: 0, at: -9, next: 0, tiredUntil: 0, weak: false });
  }

  /** Every tick (ZombieMode.tick): pips come back one at a time once you stop shoving. */
  tick(t) {
    const D = this.Z.diff.shove;
    for (const p of this.game.players) {
      const s = p.shove;
      if (!s || s.pips >= D.pips || t < s.regenAt) continue;
      s.pips++;
      s.regenAt = t + D.regen;
    }
  }

  /** Fatigue pips p has left. */
  pips(p) { return p?.shove ? p.shove.pips : this.Z.diff.shove.pips; }

  /** Could p shove right now (alive, up, not pinned, rested enough)? */
  ready(p, t = this.game.time) {
    if (!this.Z.enabled || !p || !p.alive || p.isZombie || !inSquad(p) || p.downed || p.pinnedBy) return false;
    const s = this.state(p);
    return t >= s.next && (s.pips > 0 || t >= s.tiredUntil);
  }

  /**
   * Is q (a zombie, the boss or a teammate) in p's shove cone? Range to its hull, the cone
   * widened by the hull's own width, a step up or down, and nothing solid in between.
   */
  inCone(p, q, fx, fy) {
    const o = p.pm.origin, qo = q.pm.origin;
    const dx = qo[0] - o[0], dy = qo[1] - o[1], dz = qo[2] - o[2];
    if (dz > DZ || dz < -DZ) return false;
    const d = Math.hypot(dx, dy);
    if (d > RANGE + HULL_R) return false;
    if (d > 1) {
      const cos = (dx * fx + dy * fy) / d;
      const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
      if (ang > HALF + Math.asin(Math.min(1, HULL_R / d))) return false;
    }
    _chest[0] = qo[0]; _chest[1] = qo[1]; _chest[2] = qo[2] + 10;
    return this.game.visible(p.eyePos(_eye), _chest);
  }

  /** Shove for p now. Returns how many zombies it hit, -1 when it can't. */
  tryShove(p) {
    const g = this.game, Z = this.Z, t = g.time, D = Z.diff.shove;
    if (!this.ready(p, t)) return -1;
    const s = this.state(p);
    const strong = s.pips > 0;
    if (strong) s.pips--;
    else s.tiredUntil = t + D.tired;
    s.next = t + COOLDOWN;
    s.regenAt = t + D.regen; // (the clock starts over: keep bashing and you stay tired)
    s.at = t; s.weak = !strong;
    // the gun is busy for a moment (not grenades, the C4, mines or the medkit: they keep their own timing)
    const w = p.active;
    if (w && (w.def.clip > 0 || w.def.kind === 'knife')) w.nextPrimary = Math.max(w.nextPrimary, t + 0.3);
    const yaw = p.pm.angles[1] * RAD, fx = Math.cos(yaw), fy = Math.sin(yaw);
    let hits = 0, freed = null, first = null;
    // the horde: commons and specials
    for (const z of Z.pool) {
      if (!z.alive || !this.inCone(p, z, fx, fy)) continue;
      hits++;
      first = first || z;
      const v = this.hitZombie(p, z, strong, fx, fy, t);
      if (v && v !== p) freed = v;
    }
    // the boss rocks a little, no more
    const B = g.bosses?.boss;
    if (B && B.alive && this.inCone(p, B, fx, fy)) {
      hits++;
      first = first || B;
      this.push(p, B, PUSH_BOSS, fx, fy);
    }
    // a teammate held in the cone: the shove knocks him loose (the hunter on him may be just out of it)
    for (const q of g.players) {
      if (q === p || !q.alive || !inSquad(q) || !(q.pinnedBy || q.tonguedBy) || !this.inCone(p, q, fx, fy)) continue;
      Z.specials.letGo(q.pinnedBy || q.tonguedBy, p);
      freed = q;
    }
    this.feel(p, hits, first, strong);
    const ev = Z.events;
    if (ev.has('shove')) {
      const e = ev.obj('shove');
      e.player = p; e.hits = hits; e.freed = freed; e.tired = s.pips === 0;
      e.wave = Z.wave; e.t = t;
      ev.emit('shove', e);
    }
    return hits;
  }

  /** One zombie in the cone. Returns the teammate (or p) it let go of, if it held one. */
  hitZombie(p, z, strong, fx, fy, t) {
    const S = z.sp;
    // a hunter / smoker holding somebody lets go (and its own let-go knocks it back)
    if (S?.victim && (S.state === 'pin' || S.state === 'pull')) {
      const v = S.victim;
      this.Z.specials.letGo(z, p);
      return v;
    }
    if (!strong) {
      // tired: a flinch and a nudge, its swing goes on
      this.Z.stagger(z, AMOUNT_WEAK, this.dir(p, z, fx, fy), 'shove', p);
      this.push(p, z, PUSH_WEAK, fx, fy);
      return null;
    }
    // a hunter in mid-leap: knocked out of the air (the deadstop)
    if (z.special === 'hunter' && S?.state === 'air') {
      S.state = 'recover'; S.until = t + DEADSTOP; S.cd.pounce = Math.max(S.cd.pounce, t + 3);
      z.pm.speedCap = null;
      z.pm.velocity[0] = z.pm.velocity[1] = 0;
    }
    this.Z.stagger(z, AMOUNT, this.dir(p, z, fx, fy), 'shove', p);
    // a charger barely moves; everybody else is thrown back
    this.push(p, z, z.special === 'charger' ? PUSH * 0.2 : PUSH, fx, fy);
    // the swing is lost even if it shrugged the stagger off
    if (z.windup) z.windup = 0;
    z.nextAttack = Math.max(z.nextAttack || 0, t + SWING_LOST);
    return null;
  }

  /** The push direction p -> z (flat; your facing when it's right on top of you). Reused array. */
  dir(p, z, fx, fy) {
    const d = this._dir || (this._dir = [0, 0, 0]);
    const dx = z.pm.origin[0] - p.pm.origin[0], dy = z.pm.origin[1] - p.pm.origin[1], l = Math.hypot(dx, dy);
    if (l < 1) { d[0] = fx; d[1] = fy; } else { d[0] = dx / l; d[1] = dy / l; }
    d[2] = 0;
    return d;
  }

  push(p, z, k, fx, fy) {
    const d = this.dir(p, z, fx, fy), v = z.pm.velocity;
    v[0] += d[0] * k; v[1] += d[1] * k;
  }

  /** Sound and a kick of the view for the one who shoved. */
  feel(p, hits, first, strong) {
    const g = this.game, me = p === g.viewTarget;
    g.sound?.play('shove_swing', { pos: me ? null : p.eyePos(), volume: strong ? 0.8 : 0.5 });
    if (hits > 0 && first) {
      const o = first.pm.origin;
      g.sound?.play('shove_hit', { pos: [o[0], o[1], o[2] + 10], volume: strong ? 1 : 0.6 });
    }
    if (me) { p.pm.punch[1] += strong ? 1.6 : 0.8; p.pm.punch[0] += strong ? 0.8 : 0.4; }
  }

  // ---------------------------------------------------------------- bots
  /**
   * A bot in a fight with zombie e at distance d (bots.js combat, before it backs off): free a
   * teammate a hunter or a smoker holds nearby (walk up and shove), or shove when they're on
   * top of it. True when it took over this tick (combat leaves it at that).
   */
  bot(bot, e, d) {
    void d;
    const p = bot.p, it = bot.it, t = this.game.time;
    if (!it || !this.Z.enabled || p.downed || p.pinnedBy) return false;
    const yaw = p.pm.angles[1] * RAD, fx = Math.cos(yaw), fy = Math.sin(yaw);
    // a teammate held nearby: go and knock him loose
    const q = this.held(p);
    if (q) {
      const h = q.pinnedBy || q.tonguedBy;
      const tgt = q.pinnedBy ? h : q; // (the hunter on him, or him on the tongue)
      const o = p.pm.origin, to = tgt.pm.origin;
      const dist = Math.hypot(to[0] - o[0], to[1] - o[1]);
      if (dist < RANGE + HULL_R - 6) {
        const look = it.look = bot.shoveLook || (bot.shoveLook = [0, 0, 0]);
        look[0] = to[0]; look[1] = to[1]; look[2] = to[2] + 10;
        it.fire = false; // (not into him)
        it.move = null;
        if ((this.inCone(p, tgt, fx, fy) || this.inCone(p, q, fx, fy)) && t >= (bot.shoveThink || 0)) {
          bot.shoveThink = t + rand(BOT_THINK[0], BOT_THINK[1]);
          this.tryShove(p);
        }
      } else {
        it.move = tgt.feet();
        it.tol = 16;
        if (dist < 160) it.fire = false;
      }
      return true;
    }
    // swarmed: two in its face, or one about to swing, and pips to spare (one kept for a save)
    if (t < (bot.shoveThink || 0)) return false;
    bot.shoveThink = t + rand(BOT_THINK[0], BOT_THINK[1]);
    const s = this.state(p);
    if (s.pips < 2 || !this.ready(p, t)) return false;
    let n = 0, swing = false;
    for (const z of this.Z.pool) {
      if (!z.alive || z.special === 'charger' || !this.inCone(p, z, fx, fy)) continue;
      n++;
      if (z.windup) swing = true;
    }
    if (n >= 2 || (n && swing) || (e.isZombie && !e.isBoss && n && e.windup)) return this.tryShove(p) > 0;
    return false;
  }

  /** A squadmate within RESCUE_R of bot p that a hunter or a smoker holds (and p can see), or null. */
  held(p) {
    const o = p.pm.origin;
    let best = null, bd = RESCUE_R;
    for (const q of this.game.players) {
      if (q === p || !q.alive || !inSquad(q) || !(q.pinnedBy || q.tonguedBy)) continue;
      const d = Math.hypot(q.pm.origin[0] - o[0], q.pm.origin[1] - o[1]);
      if (d >= bd || Math.abs(q.pm.origin[2] - o[2]) > 80) continue;
      _chest[0] = q.pm.origin[0]; _chest[1] = q.pm.origin[1]; _chest[2] = q.pm.origin[2] + 10;
      if (!this.game.visible(p.eyePos(_eye), _chest)) continue;
      best = q; bd = d;
    }
    return best;
  }

  // ---------------------------------------------------------------- HUD and view model
  /** HUD state (buildHudState, every frame): the fatigue pips of whoever you watch. */
  hud(s) {
    const g = this.game, me = g.local, h = this.hs, t = g.time;
    const p = me?.alive ? me : (g.spectate?.mode === 'chase' && g.spectate.target?.alive ? g.spectate.target : null);
    s.shove = h;
    h.show = false;
    if (!p || !p.shove || p.downed || s.scope) return;
    const D = this.Z.diff.shove, st = p.shove;
    h.max = D.pips; h.pips = st.pips;
    h.frac = st.pips < D.pips ? Math.max(0, Math.min(1, 1 - (st.regenAt - t) / D.regen)) : 0;
    h.weak = st.pips === 0;
    // shown while you're short, and a moment after the last pip is back
    const since = Math.max(st.at, st.pips >= D.pips ? st.regenAt - D.regen : t);
    h.alpha = st.pips < D.pips ? 1 : Math.max(0, 1 - (t - since - 0.8) / 0.6);
    h.show = h.alpha > 0;
  }

  /** The pips: a row of small bars under the crosshair (one filling up as it comes back). */
  draw(hud, s) {
    const h = s.shove;
    if (!h || !h.show || !s.alive || !s.zombie) return;
    const k = hud.k || 1;
    const w = Math.max(3, Math.round(6 * k)), ht = Math.max(2, Math.round(3 * k)), gap = Math.max(2, Math.round(3 * k));
    const total = h.max * w + (h.max - 1) * gap;
    // (below the crosshair's bottom arm however far it's spread: hud.crossR)
    const x0 = Math.round(hud.vw / 2 - total / 2), y = Math.round(hud.vh / 2 + Math.max(26 * k, hud.crossR + 5 * k));
    const G = hud.gTop, al = h.alpha;
    const on = h.weak ? RED_CSS : AMBER_CSS;
    // on a dark plate, painted normally (not additive: it has to read on bright sand)
    G.globalAlpha = al * 0.55; G.fillStyle = '#000';
    G.fillRect(x0 - 2, y - 2, total + 4, ht + 4);
    G.fillStyle = on;
    for (let i = 0; i < h.max; i++) {
      const x = x0 + i * (w + gap);
      if (i < h.pips) { G.globalAlpha = al * 0.95; G.fillRect(x, y, w, ht); }
      else {
        G.globalAlpha = al * 0.22; G.fillRect(x, y, w, ht);
        if (i === h.pips && h.frac > 0) { G.globalAlpha = al * 0.6; G.fillRect(x, y, Math.max(1, Math.round(w * h.frac)), ht); }
      }
    }
    G.globalAlpha = 1;
  }

  /**
   * The view model's bash (game.updateCamera, after vm.update): the gun is thrown forward and
   * to the left, then brought back. Adds to the root's bob / sway pose for this frame.
   */
  bash(vm, p) {
    const s = p?.shove;
    if (!vm || !s) return;
    const a = (this.game.time - s.at) / BASH;
    if (a < 0 || a >= 1) return;
    const out = a < 0.22 ? 1 - (1 - a / 0.22) ** 2 : 1 - ((a - 0.22) / 0.78) ** 2 * (3 - 2 * (a - 0.22) / 0.78);
    const k = out * (s.weak ? 0.55 : 1);
    const o = vm.object3D;
    o.position.x -= 2.6 * k; o.position.y -= 1.2 * k; o.position.z -= 6.5 * k;
    o.rotation.y += 0.42 * k; o.rotation.z += 0.3 * k; o.rotation.x -= 0.1 * k;
  }

  /** Per frame (game.frame, zombie mode only). */
  frame(dt) { void dt; }

  /** An unclaimed command (ZombieMode.command): 'shove'. True when it was ours. */
  command(p, cmd, args) {
    void args;
    if (cmd !== 'shove') return false;
    this.tryShove(p);
    return true;
  }
}

const AMBER_CSS = 'rgb(255,160,0)', RED_CSS = 'rgb(255,40,16)';
