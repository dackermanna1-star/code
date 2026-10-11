// Hostage rescue (cs_ maps), after CS 1.6's CHostage / multiplay_gamerules:
//  - hostage_entity spots get a scientist each round; a CT presses +use on one to
//    have it follow him (again to make it wait); Ts can't move hostages
//  - a following hostage within 256 units of a rescue point is rescued (no
//    func_hostage_rescue / info_hostage_rescue on the map: the CT spawn points)
//  - CTs win once every hostage is rescued or dead and at least half were rescued;
//    Ts win when the time runs out
//  - money: first touch +150 (team +100), rescue +1000 to the rescuer (team +750 each
//    next round); hurting a hostage costs 20 x damage, killing one 20 x (25 + damage)
// Hostages are Player objects (movement, hitboxes, blood, wounds and ragdolls work
// as for players) kept out of game.players.
import { Player, TEAM_CT } from './player.js';
import { createPlayerModel } from '../assets/playermodels.js';
import { makeDynamicBox, setDynamicBox, TraceResult, MASK_WORLD_PLAYER, MASK_PLAYER } from '../engine/collision.js';
import { HULL_STAND } from '../engine/pmove.js';
import * as CR from './combatrules.js';

export const RESCUE_RADIUS = 256;
const USE_RANGE = 72;
const RUN = 250, WALK = 110;
const tr = new TraceResult();
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export class Hostages {
  constructor(game) {
    this.game = game;
    const ents = game.map.entities;
    this.spots = ents.filter((e) => e.classname === 'hostage_entity');
    this.enabled = this.spots.length > 0;
    this.list = [];
    this.rescueBoxes = ents.filter((e) => e.classname === 'func_hostage_rescue');
    this.rescuePoints = ents.filter((e) => e.classname === 'info_hostage_rescue').map((e) => e.origin);
    if (!this.rescueBoxes.length && !this.rescuePoints.length) this.rescuePoints = game.spawns.CT.map((e) => e.origin);
    this.rescued = 0;
    this.lastRescued = 0;
  }

  get total() { return this.list.length; }
  get remaining() { return this.list.filter((h) => h.alive && !h.rescued).length; }

  // ---------------------------------------------------------------- round
  reset() {
    this.lastRescued = this.rescued;
    for (const h of this.list) this.remove(h);
    this.list = [];
    this.rescued = 0;
    if (!this.enabled) return;
    const g = this.game;
    for (const s of this.spots) {
      const h = new Player({ name: 'Hostage', team: 'HOSTAGE', skin: 'scientist' });
      h.isHostage = true;
      // the entity origin is at its feet; drop onto the floor below it
      const top = [s.origin[0], s.origin[1], s.origin[2] + 40];
      g.collision.trace(top, [top[0], top[1], top[2] - 256], HULL_STAND.mins, HULL_STAND.maxs, MASK_WORLD_PLAYER, tr);
      const pos = tr.fraction < 1 && !tr.startsolid ? tr.endpos.slice() : [s.origin[0], s.origin[1], s.origin[2] + 36];
      h.resetForSpawn(pos, s.angle || 0);
      h.home = pos.slice();
      h.pm.maxspeed = RUN;
      h.leader = null;
      h.touched = false;
      h.rescued = false;
      h.path = null;
      h.pathT = -9;
      h.progT = 0;
      h.progPos = pos.slice();
      h.nextUse = 0;
      h.box = makeDynamicBox(h);
      g.collision.dynamic.push(h.box);
      h.box.active = true;
      setDynamicBox(h.box, h.pm.origin, h.hull().mins, h.hull().maxs);
      try {
        h.model = createPlayerModel('scientist');
        g.renderer.world.add(h.model.object3D);
        h.model.setWeapon?.(null);
      } catch (e) { console.warn('hostage model', e); }
      this.list.push(h);
    }
  }

  remove(h) {
    const g = this.game;
    if (h.model) { h.model.dispose(); h.model = null; }
    const i = g.collision.dynamic.indexOf(h.box);
    if (i >= 0) g.collision.dynamic.splice(i, 1);
  }

  /** Money at round restart: CT team 750 per hostage rescued last round, Ts 150 per hostage still held (max 2000). */
  roundStartMoney() {
    if (!this.enabled || !this.list.length) return { T: 0, CT: 0 };
    const R = CR.RULES.reward;
    const held = this.list.filter((h) => h.alive && !h.rescued).length;
    return { CT: this.rescued * R.rescuedHostageTeam, T: Math.min(2000, held * R.hostageHeldT) };
  }

  // ---------------------------------------------------------------- +use
  /** A player pressed use: the hostage he is looking at within reach. Returns true if one was used. */
  use(p) {
    if (!this.enabled || !p.alive) return false;
    const g = this.game, eye = p.eyePos();
    const a = p.pm.angles, DEG = Math.PI / 180;
    const cp = Math.cos(a[0] * DEG);
    const f = [Math.cos(a[1] * DEG) * cp, Math.sin(a[1] * DEG) * cp, -Math.sin(a[0] * DEG)];
    let best = null, bd = Infinity;
    for (const h of this.list) {
      if (!h.alive || h.rescued) continue;
      const c = [h.pm.origin[0], h.pm.origin[1], h.pm.origin[2] + 10];
      const d = [c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]];
      const l = Math.hypot(d[0], d[1], d[2]);
      if (l > USE_RANGE + 16) continue;
      if ((d[0] * f[0] + d[1] * f[1] + d[2] * f[2]) / l < 0.6) continue;
      if (l < bd) { bd = l; best = h; }
    }
    if (!best) return false;
    const h = best;
    if (g.time < h.nextUse) return true;
    h.nextUse = g.time + 1;
    if (p.team !== TEAM_CT) {
      if (p.isLocal && !this.hintShown) { this.hintShown = true; g.hud?.centerPrint?.('Only Counter-Terrorists can move hostages.', 2.5); }
      return true;
    }
    if (h.leader === p) {
      h.leader = null; // wait here
      h.path = null;
    } else {
      h.leader = p;
      h.pathT = -9;
      g.sound?.play('hostage_use', { pos: h.eyePos(), volume: 0.9 });
      if (p.isBot) g.bots?.onHostageUsed?.(p, h);
    }
    if (!h.touched) {
      // CHostage::GiveCTTouchBonus
      h.touched = true;
      const R = CR.RULES.reward;
      g.rounds.addMoney(p, R.tookHostage);
      for (const q of g.players) if (q.team === TEAM_CT) g.rounds.addMoney(q, R.tookHostageTeam, true);
    }
    return true;
  }

  // ---------------------------------------------------------------- per tick
  update(dt) {
    if (!this.list.length) return;
    const g = this.game;
    for (const h of this.list) {
      if (!h.alive || h.rescued) continue;
      h.prevOrigin = h.pm.origin.slice();
      const L = h.leader;
      if (L && (!L.alive || L.team !== TEAM_CT)) { h.leader = null; h.path = null; }
      const cmd = { forwardmove: 0, sidemove: 0, upmove: 0, buttons: 0, wbuttons: 0 };
      if (h.leader) this.follow(h, h.leader, cmd);
      h.cmd = cmd;
      // hostages walk through people (no deadlocks in narrow corridors); people still bump into them
      g.mover.ignore = h.box;
      g.mover.mask = MASK_WORLD_PLAYER;
      g.mover.move(h.pm, cmd, dt);
      g.mover.mask = MASK_PLAYER;
      g.mover.ignore = null;
      setDynamicBox(h.box, h.pm.origin, h.hull().mins, h.hull().maxs);
      if (h.leader) this.checkRescue(h);
    }
  }

  follow(h, L, cmd) {
    const g = this.game, now = g.time;
    const feet = h.feet(), lf = L.feet();
    const d = Math.hypot(lf[0] - feet[0], lf[1] - feet[1]);
    const dz = Math.abs(lf[2] - feet[2]);
    // close enough: stand and face him
    if (d < 90 && dz < 48) {
      h.pm.angles[1] = Math.atan2(lf[1] - feet[1], lf[0] - feet[0]) * 180 / Math.PI;
      h.path = null;
      h.progT = now;
      return;
    }
    // path along the bots' nav graph, refreshed as the leader moves
    if (!h.path || now - h.pathT > 1.0 || (h.goal && dist2(h.goal, lf) > 96)) {
      h.pathT = now;
      h.goal = lf.slice();
      const nav = g.nav;
      const a = nav?.nearest(feet, 160), b = nav?.nearest(lf, 200) || nav?.nearestXY(lf, 260, 120);
      const raw = a && b ? nav.findPath(a, b) : null;
      h.path = raw ? nav.smooth(raw, feet) : [[lf[0], lf[1], lf[2], 'walk']];
      h.pathIdx = 0;
    }
    let pt = h.path[h.pathIdx];
    while (pt && h.pathIdx < h.path.length - 1 && Math.hypot(pt[0] - feet[0], pt[1] - feet[1]) < 24) pt = h.path[++h.pathIdx];
    if (!pt) return;
    h.pm.angles[1] = Math.atan2(pt[1] - feet[1], pt[0] - feet[0]) * 180 / Math.PI;
    h.pm.angles[0] = 0;
    cmd.forwardmove = d > 220 ? RUN : WALK + (d - 90) * 0.9;
    if (pt[3] === 'jump' && pt[2] - feet[2] > 12 && h.pm.onground) cmd.buttons |= 1;
    // stuck: hop
    if (dist2(h.pm.origin, h.progPos) > 16) { h.progPos = h.pm.origin.slice(); h.progT = now; }
    else if (now - h.progT > 1.5 && h.pm.onground) { cmd.buttons |= 1; h.progT = now; h.path = null; }
  }

  checkRescue(h) {
    const o = h.pm.origin;
    let ok = false;
    for (const z of this.rescueBoxes) {
      if (o[0] >= z.mins[0] && o[0] <= z.maxs[0] && o[1] >= z.mins[1] && o[1] <= z.maxs[1] && o[2] >= z.mins[2] - 36 && o[2] <= z.maxs[2] + 36) { ok = true; break; }
    }
    if (!ok) for (const p of this.rescuePoints) if (Math.hypot(o[0] - p[0], o[1] - p[1], o[2] - p[2]) < RESCUE_RADIUS) { ok = true; break; }
    if (ok) this.rescue(h);
  }

  rescue(h) {
    const g = this.game, L = h.leader;
    h.rescued = true;
    h.leader = null;
    h.box.active = false;
    if (h.model) h.model.object3D.visible = false;
    this.rescued++;
    if (L) g.rounds.addMoney(L, CR.RULES.reward.rescuedHostage);
    g.hud?.centerPrint?.('Hostage has been rescued!', 2);
    g.sound?.play('radio_beep', { volume: 0.5 });
    g.bots?.onHostageRescued?.(h, L);
    g.rounds.checkHostages?.();
  }

  // ---------------------------------------------------------------- damage
  /** game.damagePlayer hands hostage hits here. */
  damage(h, attacker, damage, hitgroup, weaponId, dir, point, opts = {}) {
    const g = this.game;
    if (!h.alive || h.rescued || damage <= 0) return;
    const res = CR.computeDamage({ health: h.health, armor: 0, helmet: false, ducking: false, speed: 0 }, damage, hitgroup, { attackerWeapon: weaponId, blast: opts.blast });
    const take = Math.min(h.health, res.damageToHealth || Math.round(damage));
    h.health -= take;
    h.lastHit = { time: g.time, dir, point, damage: take, hitgroup: res.hitgroup ?? hitgroup, weaponId, blast: !!opts.blast, from: attacker?.pm.origin.slice() };
    const head = (res.hitgroup ?? hitgroup) === CR.HITGROUP.HEAD;
    const pos = point || h.eyePos();
    if (dir) {
      g.effects.blood(pos, dir, take, { head, victim: h, blast: !!opts.blast, exit: !!opts.exit });
      if (!opts.blast) g.effects.wound(h, pos, dir, { head, exit: !!opts.exit, damage: take, knife: weaponId === 'knife' });
    }
    g.sound?.play(head ? 'headshot' : 'hit_flesh', { pos, volume: 0.9 });
    const R = CR.RULES.reward;
    if (h.health > 0) {
      if (attacker?.team) g.rounds.addMoney(attacker, R.hostageDamagePerHp * take);
      if (Math.random() < 0.4) g.sound?.play('pain', { pos, volume: 0.6 });
      return;
    }
    // killed
    h.alive = false;
    h.health = 0;
    h.deathTime = g.time;
    h.leader = null;
    h.box.active = false;
    if (attacker?.team) {
      g.rounds.addMoney(attacker, 20 * (-25 - take));
      if (attacker.isLocal) g.hud?.centerPrint?.('You killed a hostage!', 2);
    }
    g.sound?.play('die', { pos, volume: 1 });
    g.effects.bloodPuddle(h);
    if (h.model) {
      const hit = h.lastHit;
      if (!g.ragdolls.spawn(h.model, { origin: h.pm.origin, velocity: h.pm.velocity, hit, headshot: head, weaponId })) h.model.playDeath(head ? 'headshot' : 'back');
    }
    g.bots?.onHostageKilled?.(h, attacker);
    g.rounds.checkHostages?.();
  }

  /** Living, unrescued hostages (for hit tests, radar, bots). */
  active() { return this.list.filter((h) => h.alive && !h.rescued); }
}
