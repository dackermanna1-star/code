// Zombie survival downed / revive (Milestone 1.3): at 0 HP you go down instead of dying,
// a teammate (or bot) holds use to pick you up, you bleed out if nobody does, and the run
// ends only when the whole squad is down or dead. Bleed-out and revive times come from the
// difficulty (g.zombies.diff.squad).
//  - down: p.alive stays true and p.downed is set ({ since, bleed, rate, downs, attacker,
//    weapon, gun, prev, by, prog, byT, claim, claimT }). You crawl (ducked, speed capped),
//    hold only your pistol (it can still shoot: a last magazine is topped up), and can't buy
//  - the bleed pool: while down, health counts down from DOWN_HP to 0 over the bleed-out
//    (squad.bleedOut, bleedOutStep shorter for every further down in the same wave, not
//    below bleedOutMin); claws take it faster; 0 = bled out = a real death (killPlayer)
//  - revive: a teammate within REACH holds use for squad.reviveTime (both of them hold still
//    and the reviver can't shoot; the bleeding pauses); letting go starts it over. Back up
//    with squad.reviveHealth. Second Wind (perk_secondwind, $2500): hold use while down to
//    get yourself up, once. A cleared wave (the break) picks everybody up, and nobody goes
//    down in a break (a fall or your own blast leaves you at 1 HP)
//  - wipe: nobody in the squad up (alive and not down; a Second Wind still to use counts
//    as up) = game over. The dead come back when the next wave starts (ZombieMode.startWave)
//  - zombies treat a downed survivor as DOWN_PENALTY units farther away (pickTarget and the
//    flow field); hunters and smokers leave them alone
// Events: down, revive, bleedout, respawn, wipe (runstats.js). Hooks: game.damagePlayer's
// death line (onLethal), the use routing (use), selectWeapon (pistol only), inBuyZone;
// Specials.constrain (constrain); ZombieMode pickTarget / buildFlow (cost), onKilled
// (checkWipe), startWave (respawned); rounds.buyItem (buyPerk); bots (reviveTarget, left).
// Scaffold: ZombieMode builds it and calls tick(t) first thing every tick; buildHudState
// calls hud(s) every frame. Run resets: listen for the 'run' event.
import * as THREE from 'three';
import { TEAM_CT } from './player.js';
import { IN_JUMP, IN_DUCK } from '../engine/pmove.js';
import { clipSize } from './weaponsys.js';
import { fontString } from '../ui/hud/font.js';

const BTN_ATTACK = 1, BTN_ATTACK2 = 2, BTN_RELOAD = 4; // (game.js)
export const DOWN_HP = 100; // the bleed pool (health while down)
export const DOWN_PENALTY = 500; // units a zombie adds to its distance to a downed survivor
export const DOWN_HURT = 0.4; // damage taken while down, x (a claw takes ~9 off the pool: teammates get a few seconds to clear them)
// speed cap while down; ducked that's a ~75 units/s crawl (any slower and ground friction,
// 3 units/s a tick below stopspeed, beats the acceleration: you'd never get going)
const CRAWL = 225;
const REACH = 80; // revive: this close (horizontally) and about the same height
const DOWN_RADIO = ["I'm down! Need a hand here!", "I'm down! Help me up!", "They got me! I'm down!"];

/** Perks sold in the buy menu (rounds.buyItem routes perk_* here). */
export const SECOND_WIND = {
  id: 'perk_secondwind', name: 'Second Wind', price: 2500,
  text: 'An adrenaline shot for later: when you go down, hold E (use) to get yourself back up without help. Once; used up when you use it, lost if you die.',
};

const _v = new THREE.Vector3();
const _e = [0, 0, 0], _scr = [0, 0, 0];
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const inSquad = (p) => p.team === TEAM_CT && !p.isZombie;

export class ZDowned {
  constructor(game) {
    this.game = game;
    this.lastT = 0;
    this.breathAt = 0;
    // HUD state, reused frame to frame (hud(s))
    this.hs = { down: { left: 0, frac: 0, by: '', prog: 0, self: false, secondWind: false, helper: '', helperDist: 0 }, reviving: { name: '', prog: 0 }, prompt: '' };
    this.fonts = { px: 0, big: '', small: '' };
    this.vig = null; // cached red vignette canvas
    this.subscribed = false;
    this.hurtScale = DOWN_HURT; // (game.damagePlayer)
    game.hud?.addLayer?.((hud, s, dt) => this.drawUnder(hud, s, dt), -2);
    game.hud?.addLayer?.((hud, s, dt) => this.drawOver(hud, s, dt), 4);
  }

  get Z() { return this.game.zombies; }
  get events() { return this.game.zombies?.events; }

  /**
   * Subscribe to the run's events. (Built inside ZombieMode's constructor, before
   * game.zombies is set: done on the first tick instead, long before anything can die.)
   */
  subscribe() {
    const ev = this.events;
    if (this.subscribed || !ev) return;
    this.subscribed = true;
    ev.on('run', (e) => { if (e.phase === 'start') this.reset(); });
    ev.on('kill', (e) => this.onKill(e.victim));
  }

  reset() {
    for (const p of this.game.players) {
      p.downed = null; p.reviving = null; p.secondWind = false; p.downCount = 0; p.downWave = -1;
      if (p.pm && !p.isZombie) p.pm.speedCap = null;
    }
    this.lastT = 0;
  }

  // ---------------------------------------------------------------- going down
  /**
   * game.damagePlayer's death line (health just went to 0 or below): true when the victim
   * went down instead of dying. A downed victim is finished off (bled out: the caller kills).
   */
  onLethal(victim, attacker, weaponId) {
    if (!this.subscribed) this.subscribe();
    if (victim.downed) { this.events?.mode('bleedout', { player: victim }); return false; }
    return this.goDown(victim, attacker, weaponId);
  }

  /** Put p on the floor (false: not in this mode / not a squad member / the run is over). */
  goDown(p, attacker = null, weaponId = 'world') {
    const g = this.game, Z = this.Z;
    if (!Z.enabled || (Z.state !== 'wave' && Z.state !== 'break') || !p.alive || p.downed || !inSquad(p)) return false;
    if (Z.state === 'break') { p.health = 1; return true; } // (the fight's over: a fall or your own blast leaves you at 1)
    const S = Z.diff.squad, t = g.time;
    if (p.downWave !== Z.wave) { p.downWave = Z.wave; p.downCount = 0; }
    p.downCount++;
    const bleed = Math.max(S.bleedOutMin, S.bleedOut - S.bleedOutStep * (p.downCount - 1));
    // a hunter / smoker lets go (quietly: going down is no save), a revive he was doing stops
    if (p.pinnedBy) Z.specials.unpin(p.pinnedBy, true);
    if (p.tonguedBy) Z.specials.release(p.tonguedBy, true);
    if (p.reviving) this.stopRevive(p);
    if (p.ads) g.setAds(p, false);
    if (p.bot) { p.bot.nade = null; p.bot.heal = null; p.bot.revive = null; } // (a bot drops whatever it was doing)
    g.stopWeaponLoops(p);
    // the pistol, with at least a magazine to go
    let gun = p.weapons[2];
    if (!gun) gun = p.weapons[2] = g.newWeapon('usp', true);
    if (gun.clip + gun.ammo < clipSize(gun)) gun.ammo = clipSize(gun) - gun.clip;
    const prev = p.active && p.active !== gun && p.active.def.slot !== 4 ? p.active : null;
    p.downed = { since: t, bleed, rate: DOWN_HP / bleed, downs: p.downCount, attacker: attacker && attacker !== p ? attacker : null, weapon: weaponId, gun, prev, by: null, prog: 0, byT: 0, claim: null, claimT: 0 };
    p.health = DOWN_HP;
    g.selectWeapon(p, gun, true);
    g.sound?.play('downed', { pos: p === g.viewTarget ? null : p.eyePos(), volume: 1, channel: `${p.id}:voice` });
    if (p === g.local) { g.shakeAt?.(p.pm.origin, 5, 300); this.breathAt = t + 1.2; } else if (p.bot) g.bots.radio(p.bot, DOWN_RADIO[p.downCount % DOWN_RADIO.length]); // (rate limited)
    this.events?.mode('down', { player: p, attacker: p.downed.attacker, bleedOut: bleed, downs: p.downCount });
    this.checkWipe();
    return true;
  }

  /** Back on his feet: by a teammate (by), on his own (Second Wind: by = null), or the wave ended. */
  revive(p, by = null, health = this.Z.diff.squad.reviveHealth) {
    const g = this.game, D = p.downed;
    if (!D) return;
    p.downed = null;
    p.pm.speedCap = null;
    if (by && by.reviving === p) by.reviving = null;
    p.health = Math.max(1, Math.min(p.maxHealth || 100, health));
    const back = D.prev && p.allWeapons().includes(D.prev) ? D.prev : p.weapons[1] || p.weapons[2] || p.weapons[3];
    if (back && back !== p.active) g.selectWeapon(p, back, true);
    const self = !by && D.self;
    g.sound?.play(self ? 'second_wind' : 'revive_up', { pos: p === g.viewTarget ? null : p.eyePos(), volume: 0.9 });
    if (p === g.local) {
      g.hud?.centerPrint?.(self ? 'SECOND WIND!' : by ? `${by.name} picked you up` : "You're back on your feet", 2);
      if (self) g.shakeAt?.(p.pm.origin, 3, 300);
    } else if (by === g.local) g.hud?.centerPrint?.(`You picked ${p.name} up`, 2);
    this.events?.mode('revive', { player: p, by });
  }

  /** Bled out (or finished off on the floor): a real death. */
  bleedOut(p) {
    const D = p.downed;
    this.events?.mode('bleedout', { player: p });
    if (p === this.game.local) this.game.hud?.centerPrint?.('You bled out.', 3);
    this.game.killPlayer(p, D?.attacker?.alive ? D.attacker : null, D?.weapon || 'world', false);
  }

  /** Every death in the mode (the 'kill' event, inside killPlayer): nothing left to revive. */
  onKill(v) {
    if (v.reviving) this.stopRevive(v);
    const D = v.downed;
    if (D) {
      if (D.by && D.by.reviving === v) D.by.reviving = null;
      v.downed = null;
    }
    v.secondWind = false; // (a perk dies with you)
  }

  /** A dead squad member back for wave n (ZombieMode.startWave, after spawnPlayer). */
  respawned(p, n) {
    p.downed = null; p.reviving = null;
    this.events?.mode('respawn', { player: p, wave: n });
  }

  /** Up: alive and on his feet, or down with a Second Wind still to use. */
  isUp(p) { return p.alive && (!p.downed || !!p.secondWind); }

  /** The whole squad down or dead: the run is over (ZombieMode.onKilled, after every down). */
  checkWipe() {
    const Z = this.Z;
    if (!Z.enabled || (Z.state !== 'wave' && Z.state !== 'break')) return false;
    let any = false;
    for (const p of this.game.players) {
      if (!inSquad(p)) continue;
      if (this.isUp(p)) return false;
      any = true;
    }
    if (!any) return false; // (nobody has joined yet)
    this.events?.mode('wipe', {});
    Z.gameOver();
    return true;
  }

  // ---------------------------------------------------------------- reviving
  /**
   * The use key of a squad member, every tick (game.simulatePlayer, before the +use routing).
   * True while it's busy picking somebody up (the press then opens no door).
   */
  use(p, held) {
    if (!held || !this.Z.enabled || this.Z.state === 'over' || !inSquad(p) || p.pinnedBy || p.tonguedBy) {
      if (p.reviving) this.stopRevive(p);
      return false;
    }
    let q = null;
    if (p.downed) q = p.secondWind ? p : null; // on your own: Second Wind
    else if (p.reviving && this.canReach(p, p.reviving)) q = p.reviving;
    else q = this.inReach(p);
    if (!q || (q.downed.by && q.downed.by !== p)) {
      if (p.reviving && p.reviving !== q) this.stopRevive(p);
      return false;
    }
    const D = q.downed, t = this.game.time;
    if (D.by !== p) { D.by = p; D.prog = 0; D.self = q === p; p.reviving = q; }
    D.prog += Math.max(0, Math.min(0.05, t - (D.byT || t))) / this.Z.diff.squad.reviveTime;
    D.byT = t;
    if (D.prog >= 1) {
      p.reviving = null;
      if (q === p) p.secondWind = false;
      this.revive(q, q === p ? null : p);
    }
    return true;
  }

  stopRevive(p) {
    const q = p.reviving;
    p.reviving = null;
    if (q?.downed && q.downed.by === p) { q.downed.by = null; q.downed.prog = 0; q.downed.self = false; }
  }

  canReach(p, q) {
    if (!q?.alive || !q.downed || q === p) return false;
    const a = p.pm.origin, b = q.pm.origin;
    return dist2(a, b) < REACH && Math.abs(a[2] - b[2]) < 64 && this.game.visible(p.eyePos(_e), b);
  }

  /** The downed teammate p can pick up from where it stands (the closest), or null. */
  inReach(p) {
    let best = null, bd = REACH;
    for (const q of this.game.players) {
      if (!q.downed || q === p || !inSquad(q) || (q.downed.by && q.downed.by !== p)) continue;
      const d = dist2(p.pm.origin, q.pm.origin);
      if (d < bd && this.canReach(p, q)) { bd = d; best = q; }
    }
    return best;
  }

  /** Bots: the downed teammate bot p should go and pick up (you first), within range, or null. */
  reviveTarget(p, range = 1600) {
    const t = this.game.time;
    let best = null, bs = Infinity;
    for (const q of this.game.players) {
      const D = q.downed;
      if (!D || q === p || !q.alive || !inSquad(q) || (D.by && D.by !== p)) continue;
      if (D.claim && D.claim !== p && D.claim.alive && !D.claim.downed && t - D.claimT < 0.6) continue; // somebody's on his way
      const d = Math.hypot(q.pm.origin[0] - p.pm.origin[0], q.pm.origin[1] - p.pm.origin[1], (q.pm.origin[2] - p.pm.origin[2]) * 2);
      if (d > range) continue;
      const sc = d - (q.isBot ? 0 : 1200) - (q.health < 35 ? 300 : 0);
      if (sc < bs) { bs = sc; best = q; }
    }
    return best;
  }

  /** A zombie within r of q, or the boss within rb? (bots: is it safe to go in and pick him up) */
  danger(q, r, rb = r * 1.5) {
    const o = q.pm.origin;
    for (const z of this.Z.pool) if (z.alive && Math.hypot(z.pm.origin[0] - o[0], z.pm.origin[1] - o[1], z.pm.origin[2] - o[2]) < r) return true;
    const b = this.game.bosses?.boss;
    return !!(b && b.alive && Math.hypot(b.pm.origin[0] - o[0], b.pm.origin[1] - o[1], b.pm.origin[2] - o[2]) < rb);
  }

  /** Seconds p has left on the floor (Infinity when not down). */
  left(p) { return p.downed ? Math.max(0, p.health) / p.downed.rate : Infinity; }

  /** What a downed survivor adds to a zombie's distance to him (pickTarget, the flow field); Infinity: never (hunters, smokers). */
  cost(z, h) {
    if (!h.downed) return 0;
    return z && (z.special === 'hunter' || z.special === 'smoker') ? Infinity : DOWN_PENALTY;
  }

  /**
   * Specials.constrain, before p moves: downed = a crawl (ducked, capped, no jumping), held
   * still while being picked up; a reviver holds still and holds fire. True when it handled p.
   */
  constrain(p, cmd) {
    const D = p.downed;
    if (D) {
      p.pm.speedCap = CRAWL;
      cmd.buttons = (cmd.buttons | IN_DUCK) & ~IN_JUMP;
      cmd.upmove = 0;
      if (D.by) { p.pm.frozen = true; cmd.forwardmove = cmd.sidemove = 0; p.pm.velocity[0] = p.pm.velocity[1] = 0; }
      if (D.by === p) cmd.wbuttons &= ~(BTN_ATTACK | BTN_ATTACK2 | BTN_RELOAD);
      return true;
    }
    if (p.reviving) {
      p.pm.frozen = true;
      cmd.forwardmove = cmd.sidemove = cmd.upmove = 0;
      cmd.buttons &= ~IN_JUMP;
      cmd.wbuttons &= ~(BTN_ATTACK | BTN_ATTACK2 | BTN_RELOAD);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- per tick
  /** Every tick while the mode runs (ZombieMode.tick, before the break / wave logic). */
  tick(t) {
    const g = this.game, Z = this.Z;
    if (!this.subscribed) this.subscribe();
    const dt = this.lastT && t > this.lastT ? Math.min(0.1, t - this.lastT) : 0;
    this.lastT = t;
    if (Z.state !== 'wave' && Z.state !== 'break') return; // (frozen at game over)
    for (const p of g.players) {
      const D = p.downed;
      if (!D) continue;
      if (!p.alive) { p.downed = null; continue; }
      // the fight's over: everybody gets up for the break (a Second Wind under way isn't used: D.self off)
      if (Z.state === 'break') { D.self = false; this.revive(p, null, Z.diff.squad.reviveHealth + Z.diff.econ.waveHeal); continue; }
      // a revive nobody's holding any more (the reviver let go, died, or went down)
      if (D.by && (t - D.byT > 0.05 || !D.by.alive || (D.by !== p && D.by.downed))) {
        if (D.by.reviving === p) D.by.reviving = null;
        D.by = null; D.prog = 0; D.self = false;
      }
      // bleeding (on hold while somebody's picking him up)
      if (!D.by) {
        p.health -= D.rate * dt;
        if (p.health <= 0) { this.bleedOut(p); continue; }
      }
      if (p === g.local && t >= this.breathAt) {
        const f = Math.max(0, p.health) / DOWN_HP;
        this.breathAt = t + 0.9 + 1.1 * f;
        g.sound?.play('downed_breath', { volume: 0.55 + 0.35 * (1 - f) });
      }
    }
  }

  // ---------------------------------------------------------------- HUD
  /**
   * HUD state (buildHudState, zombie survival only): s.downed / s.reviving / s.revivePrompt
   * (in a wave or a break only: not under GAME OVER), downed teammates flash on the radar.
   * While you're down your health reads 0 (p.health is the bleed pool: the bar shows it).
   */
  hud(s) {
    const g = this.game, me = g.local, H = this.hs, st = this.Z.state;
    s.downed = null; s.reviving = null; s.revivePrompt = null;
    if (!me) return;
    if (me.alive && me.downed) s.health = 0;
    const D = me.alive && (st === 'wave' || st === 'break') ? me.downed : null;
    if (D) {
      const o = H.down;
      o.left = this.left(me);
      o.frac = Math.max(0, Math.min(1, me.health / DOWN_HP));
      o.by = D.by && D.by !== me ? D.by.name : '';
      o.self = D.by === me;
      o.prog = D.by ? Math.min(1, D.prog) : 0;
      o.secondWind = !!me.secondWind;
      // the closest teammate on his way (a bot that has claimed you)
      o.helper = ''; o.helperDist = 0;
      if (!D.by && D.claim && D.claim.alive && !D.claim.downed && g.time - D.claimT < 0.6) { o.helper = D.claim.name; o.helperDist = dist2(me.pm.origin, D.claim.pm.origin); }
      s.downed = o;
    } else if (st !== 'wave' && st !== 'break') {
      // (the run is over: no prompts)
    } else if (me.alive && me.reviving?.downed) {
      H.reviving.name = me.reviving.name;
      H.reviving.prog = Math.min(1, me.reviving.downed.prog);
      s.reviving = H.reviving;
    } else if (me.alive) {
      const q = this.inReach(me);
      if (q) { H.prompt = q.name; s.revivePrompt = H.prompt; }
    }
    // radar: downed teammates blink red
    const bl = s.radar?.blips;
    if (bl) {
      for (const q of g.players) {
        if (!q.downed || q === me || !q.alive) continue;
        const o = q.pm.origin;
        for (let i = 0; i < bl.length; i++) if (bl[i].kind === 'teammate' && bl[i].x === o[0] && bl[i].y === o[1]) bl[i].flash = true;
      }
    }
  }

  /**
   * GS point -> HUD pixels in out[0..1]; out[2] = 1 in front of the camera, 0 behind / off
   * screen: then pinned to the edge in its direction, inside a safe rectangle clear of the
   * radar (top left), the health / armour / money / ammo rows along the bottom and the chat
   * lines, with room under the marker for its name and bar.
   */
  toScreen(hud, pos, out) {
    const cam = this.game.renderer?.camera;
    if (!cam) return false;
    _v.set(pos[0], pos[2], -pos[1]).applyMatrix4(cam.matrixWorldInverse);
    const behind = _v.z > -1;
    _v.applyMatrix4(cam.projectionMatrix);
    let x = _v.x, y = _v.y;
    if (behind) { x = -x; y = -y; }
    const W = hud.vw, Hh = hud.vh, m = 28 * hud.k;
    const on = !behind && x > -1 && x < 1 && y > -1 && y < 1;
    if (!on) {
      // off screen: pin it to the nearest edge, in its direction
      const l = Math.max(Math.abs(x), Math.abs(y), 1e-6);
      x /= l; y /= l;
      if (behind && y > -0.2) y = -1;
    }
    let px = (x + 1) / 2 * W, py = (1 - y) / 2 * Hh;
    if (on) {
      px = Math.max(m, Math.min(W - m, px));
      py = Math.max(m, Math.min(Hh - m, py));
    } else {
      const k = hud.k, mx = 36 * k; // (half the name / bar's width from the side)
      const top = 150 * k; // (under the radar, the wave readout and the kill feed)
      const bottom = Hh - 80 * k - 8 * hud.lineH; // (the marker, its name and bar above the chat's 5 lines - hud.drawChat - and the HUD rows under them)
      px = Math.max(mx, Math.min(W - mx, px));
      py = Math.max(top, Math.min(Math.max(top, bottom), py));
    }
    out[0] = px; out[1] = py;
    out[2] = on ? 1 : 0;
    return true;
  }

  font(hud, big) {
    const F = this.fonts;
    if (F.px !== hud.fontPx) { F.px = hud.fontPx; F.big = fontString(Math.round(hud.fontPx * 1.6), true); F.small = fontString(Math.max(9, Math.round(hud.fontPx * 0.85)), true); }
    return big ? F.big : F.small;
  }

  bar(hud, x, y, w, h, f, rgb) {
    const g = hud.gTop;
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(x - 2, y - 2, w + 4, h + 4);
    g.fillStyle = `rgba(${rgb[0] * 0.3 | 0},${rgb[1] * 0.3 | 0},${rgb[2] * 0.3 | 0},0.85)`;
    g.fillRect(x, y, w, h);
    g.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    g.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, f))), h);
  }

  /** Under the stock HUD: the view goes red while you're down (deeper as you bleed out). */
  drawUnder(hud, s) {
    const D = s.downed;
    if (!D || !this.Z.enabled) return;
    const g = hud.gUnder, W = hud.vw, H = hud.vh;
    if (!this.vig || this.vig.width !== W || this.vig.height !== H) {
      const c = this.vig || (this.vig = document.createElement('canvas'));
      c.width = W; c.height = H;
      const x = c.getContext('2d');
      const r = Math.hypot(W, H) / 2;
      const gr = x.createRadialGradient(W / 2, H / 2, r * 0.25, W / 2, H / 2, r);
      gr.addColorStop(0, 'rgba(90,0,0,0)');
      gr.addColorStop(0.55, 'rgba(110,0,0,0.45)');
      gr.addColorStop(1, 'rgba(40,0,0,0.95)');
      x.fillStyle = gr;
      x.fillRect(0, 0, W, H);
    }
    const k = 1 - D.frac, t = hud.time;
    const pulse = 0.5 + 0.5 * Math.sin(t * (3 + 5 * k));
    g.globalAlpha = Math.min(1, 0.55 + 0.35 * k + 0.1 * pulse);
    g.drawImage(this.vig, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = `rgba(150,0,0,${(0.1 + 0.16 * k + 0.05 * pulse).toFixed(3)})`;
    g.fillRect(0, 0, W, H);
  }

  /** Over the stock HUD: icons over downed teammates (through walls), your bleed-out and revive bars, prompts. */
  drawOver(hud, s) {
    const g = this.game, Z = this.Z;
    if (!Z.enabled || !s.zombie) return;
    const me = g.local, k = hud.k, W = hud.vw, H = hud.vh, lh = hud.lineH;
    // teammates on the floor: where they are, how long they have, who's on it
    if (Z.state === 'wave' || Z.state === 'break') {
      const vt = g.viewTarget;
      for (const q of g.players) {
        const D = q.downed;
        if (!D || !q.alive || q === vt) continue;
        const o = q.pm.origin;
        _scr[0] = o[0]; _scr[1] = o[1]; _scr[2] = o[2] + 30;
        if (!this.toScreen(hud, _scr, _scr)) continue;
        const x = _scr[0], y = _scr[1], on = _scr[2] === 1;
        const sz = Math.round(9 * k), pulse = 0.6 + 0.4 * Math.sin(hud.time * 6 + q.id);
        const T = hud.gTop;
        T.globalAlpha = on ? 1 : 0.8;
        T.fillStyle = 'rgba(0,0,0,0.55)';
        T.fillRect(x - sz - 2, y - sz - 2, sz * 2 + 4, sz * 2 + 4);
        T.fillStyle = D.by ? 'rgb(90,230,110)' : `rgb(255,${40 + 60 * pulse | 0},30)`;
        const b = Math.max(2, Math.round(sz * 0.45));
        T.fillRect(x - b / 2, y - sz, b, sz * 2);
        T.fillRect(x - sz, y - b / 2, sz * 2, b);
        T.globalAlpha = 1;
        const font = this.font(hud, false);
        const dm = me && me.alive ? Math.round(dist2(me.pm.origin, o) * 0.0254) : null;
        hud.text(dm != null ? `${q.name}  ${dm}m` : q.name, x, y + sz + 3 * k, [255, 210, 190], { align: 'center', font, alpha: on ? 1 : 0.85 });
        const bw = Math.round(44 * k), bh = Math.max(2, Math.round(3 * k)), by = y + sz + 3 * k + lh;
        if (D.by) this.bar(hud, x - bw / 2, by, bw, bh, D.prog, [90, 230, 110]);
        else this.bar(hud, x - bw / 2, by, bw, bh, Math.max(0, q.health) / DOWN_HP, [230, 40, 30]);
      }
    }
    if (!me) return;
    // you're down
    const DD = s.downed;
    if (DD) {
      const y0 = Math.round(H * 0.54); // (clear of the chat lines, bottom left)
      hud.text("YOU'RE DOWN", W / 2, y0, [235, 40, 30], { align: 'center', font: this.font(hud, true) });
      const bw = Math.round(Math.min(W * 0.42, 300 * k)), bh = Math.round(7 * k);
      const y1 = y0 + Math.round(hud.fontPx * 1.9);
      this.bar(hud, W / 2 - bw / 2, y1, bw, bh, DD.frac, [230, 40, 30]);
      let y2 = y1 + bh + Math.round(5 * k);
      hud.text(DD.by ? `${DD.by} is picking you up...` : DD.self ? 'Second Wind...' : `Bleeding out  ${Math.ceil(DD.left)}s`, W / 2, y2, [255, 200, 180], { align: 'center' });
      y2 += lh + Math.round(3 * k);
      if (DD.by || DD.self) this.bar(hud, W / 2 - bw / 2, y2, bw, bh, DD.prog, [90, 230, 110]);
      else if (DD.secondWind) hud.text('Hold E (use): Second Wind, get yourself up', W / 2, y2, [120, 240, 140], { align: 'center' });
      else if (DD.helper) hud.text(`${DD.helper} is coming for you (${Math.round(DD.helperDist * 0.0254)}m)`, W / 2, y2, [200, 220, 255], { align: 'center' });
      else hud.text('Pistol only. Crawl to your squad and hold on.', W / 2, y2, [200, 200, 200], { align: 'center' });
      return;
    }
    if (s.reviving) {
      const y0 = Math.round(H * 0.6), bw = Math.round(Math.min(W * 0.36, 240 * k)), bh = Math.round(7 * k);
      hud.text(`Reviving ${s.reviving.name}`, W / 2, y0, [140, 240, 160], { align: 'center' });
      this.bar(hud, W / 2 - bw / 2, y0 + lh + Math.round(3 * k), bw, bh, s.reviving.prog, [90, 230, 110]);
    } else if (s.revivePrompt) {
      hud.text(`Hold E (use) to revive ${s.revivePrompt}`, W / 2, Math.round(H * 0.6), [140, 240, 160], { align: 'center' });
    }
    if (me.alive && me.secondWind) hud.text('SECOND WIND', 16 * k, H - Math.round(42 * k) - lh, [110, 230, 130], { font: this.font(hud, false) });
    // bled out: when you're coming back
    if (!me.alive && me.team === TEAM_CT && (Z.state === 'wave' || Z.state === 'break')) {
      hud.text(`You bled out. You'll be back when wave ${Z.wave + 1} starts.`, W / 2, Math.round(H * (s.zombie.boss ? 0.32 : 0.25)), [255, 176, 0], { align: 'center' });
    }
  }

  // ---------------------------------------------------------------- perks
  /** rounds.buyItem, perk_* (zombie survival): Second Wind. */
  buyPerk(p, item, pay, say) {
    if (item !== SECOND_WIND.id) return false;
    if (p.secondWind) { say('You already have a Second Wind!'); return false; }
    if (!pay(SECOND_WIND.price)) return false;
    p.secondWind = true;
    this.game.sound?.play('ammo_pickup', { pos: p.isLocal ? null : p.eyePos(), volume: 0.8 });
    say('Second Wind: when you go down, hold E to get back up (once).');
    return true;
  }

  /** A key / console command nothing else took (ZombieMode.command): true if it was yours. */
  command() { return false; }
}
