// Round flow, economy and the bomb (CS 1.6 multiplay_gamerules behaviour).

import { TEAM_T, TEAM_CT, TEAM_SPEC } from './player.js';
import * as WS from './weaponsys.js';
import * as CR from './combatrules.js';
import { createPlantedC4, createDefuseKit } from '../assets/worldweapons.js';
import { TraceResult, MASK_WORLD_PLAYER } from '../engine/collision.js';

const START_RADIO = ['Go go go!', 'Move out!', "Let's go!", 'Lock and load.'];

export class RoundManager {
  constructor(game) {
    this.game = game;
    this.configure({});
    this.state = 'warmup';
    this.tScore = 0;
    this.ctScore = 0;
    this.lossStreak = { T: 0, CT: 0 };
    this.bomb = null;
    this.bombCarrier = null;
    this.roundNumber = 0;
    this.freeze = false;
    this.tr = new TraceResult();
  }

  configure(o) {
    const R = CR.RULES || {};
    this.roundTime = (o.roundTime ?? 2.5) * 60;
    this.freezeTime = o.freezeTime ?? 6;
    this.c4Time = o.c4Timer ?? R.c4Timer ?? 45;
    this.startMoney = o.startMoney ?? R.startMoney ?? 800;
    this.buyTime = (o.buyTime ?? 1.5) * 60;
    this.friendlyFire = !!o.friendlyFire;
    this.restartDelay = 5;
  }

  get time() { return this.game.time; }

  startMatch() {
    this.tScore = this.ctScore = 0;
    this.lossStreak = { T: 0, CT: 0 };
    this.roundNumber = 0;
    for (const p of this.game.players) { p.money = this.startMoney; p.kills = 0; p.deaths = 0; }
    this.startRound(true);
  }

  canSpawnLate() {
    return this.state === 'freeze' || this.state === 'warmup' || (this.state === 'live' && this.time - this.roundStart < 10 && !this.bomb);
  }

  startRound(first = false) {
    const g = this.game;
    this.roundNumber++;
    this.state = 'freeze';
    this.freeze = true;
    this.freezeEnd = this.time + this.freezeTime;
    this.roundStart = this.freezeEnd;
    this.roundEndTime = 0;
    this.winner = null;
    this.removeBomb();
    g.clearDropped();
    g.grenades.clear();
    // respawn everybody (survivors keep their inventory)
    const used = { T: new Set(), CT: new Set() };
    for (const p of g.players) {
      if (p.team !== TEAM_T && p.team !== TEAM_CT) continue;
      if (!p.alive) {
        p.weapons = { 1: null, 2: null, 3: null, 4: [], 5: null };
        p.armor = 0; p.helmet = false; p.defuser = false;
      } else {
        p.weapons[5] = null;
      }
      p.deathTime = 0;
      p.model?.reset?.();
      g.spawnPlayer(p, used[p.team]);
    }
    // give the bomb to a random terrorist
    const ts = g.players.filter((p) => p.team === TEAM_T && p.alive);
    if (ts.length) {
      const carrier = ts[Math.floor(Math.random() * ts.length)];
      carrier.weapons[5] = g.newWeapon('c4');
      this.bombCarrier = carrier;
    }
    if (g.local && g.local.alive) g.viewTarget = g.local;
    g.spectate = { mode: 'free', angles: [20, 90, 0] };
    g.bots.onRoundStart();
    g.hud?.centerPrint?.('', 0);
  }

  tick(dt) {
    const g = this.game;
    if (this.state === 'freeze' && this.time >= this.freezeEnd) {
      this.state = 'live';
      this.freeze = false;
      for (const team of [TEAM_T, TEAM_CT]) {
        const alive = g.players.filter((p) => p.team === team && p.alive);
        if (!alive.length) continue;
        const speaker = alive[Math.floor(Math.random() * alive.length)];
        this.radio(speaker, START_RADIO[Math.floor(Math.random() * START_RADIO.length)]);
      }
    }
    if (this.state === 'live') {
      if (!this.bomb && this.time >= this.roundStart + this.roundTime) {
        this.endRound(TEAM_CT, 'time', 'Target has been saved!');
      }
      this.checkElimination();
    }
    if (this.bomb) this.tickBomb(dt);
    if (this.state === 'over' && this.time >= this.roundEndTime + this.restartDelay) {
      this.startRound();
    }
  }

  timeLeft() {
    if (this.state === 'freeze') return this.roundTime;
    if (this.state === 'live') return Math.max(0, this.roundStart + this.roundTime - this.time);
    if (this.state === 'over') return Math.max(0, this.roundStart + this.roundTime - this.roundEndTime);
    return this.roundTime;
  }

  buyTimeLeft() {
    if (this.state === 'freeze') return true;
    return this.state === 'live' && this.time - this.roundStart < this.buyTime;
  }

  checkElimination() {
    const g = this.game;
    const tAll = g.players.filter((p) => p.team === TEAM_T), ctAll = g.players.filter((p) => p.team === TEAM_CT);
    if (!tAll.length || !ctAll.length) return;
    const tAlive = tAll.some((p) => p.alive), ctAlive = ctAll.some((p) => p.alive);
    if (!tAlive && !ctAlive) {
      if (this.bomb) return; // the bomb decides
      this.endRound(null, 'draw', 'Round Draw!');
    } else if (!ctAlive) {
      this.endRound(TEAM_T, 'elimination');
    } else if (!tAlive && !this.bomb) {
      this.endRound(TEAM_CT, 'elimination');
    }
  }

  endRound(winner, reason, message = null) {
    if (this.state === 'over') return;
    const g = this.game;
    this.state = 'over';
    this.roundEndTime = this.time;
    this.winner = winner;
    const R = CR.RULES || {};
    const winMsg = winner === TEAM_T ? 'Terrorists Win!' : winner === TEAM_CT ? 'Counter-Terrorists Win!' : 'Round Draw!';
    g.hud?.centerPrint?.(message ? `${message}\n${winMsg}` : winMsg, 5);
    g.sound?.play('radio_beep', { volume: 0.6 });
    g.announce?.(winMsg);
    if (winner === TEAM_T) this.tScore++;
    if (winner === TEAM_CT) this.ctScore++;
    // money
    const rewards = {
      elimination: R.rewardElimination ?? 3250, time: R.rewardTimeout ?? 3250,
      bomb: R.rewardBombExploded ?? 3500, defuse: R.rewardBombDefused ?? 3500, draw: 0,
    };
    for (const team of [TEAM_T, TEAM_CT]) {
      const members = g.players.filter((p) => p.team === team);
      if (winner === team) {
        this.lossStreak[team] = 0;
        for (const p of members) this.addMoney(p, rewards[reason] ?? 3250, true);
      } else if (winner) {
        const base = R.lossBonusBase ?? 1400, step = R.lossBonusStep ?? 500, max = R.lossBonusMax ?? 3400;
        const bonus = Math.min(max, base + step * this.lossStreak[team]);
        this.lossStreak[team]++;
        let extra = 0;
        if (team === TEAM_T && this.bombWasPlanted) extra = R.rewardPlantedLost ?? 800;
        for (const p of members) this.addMoney(p, bonus + extra, true);
      }
    }
    this.bombWasPlanted = false;
    g.bots.onRoundEnd(winner);
  }

  addMoney(p, amount, quiet = false) {
    const before = p.money;
    p.money = Math.max(0, Math.min(CR.RULES?.maxMoney ?? 16000, p.money + amount));
    if (p.isLocal && p.money !== before) this.game.hud?.moneyDelta?.(p.money - before);
  }

  radio(p, text) {
    this.game.hud?.radio?.(p.name, p.team, text);
    this.game.sound?.play('radio_beep', { volume: 0.5 });
  }

  // ------------------------------------------------------------------ buying
  buy(p, item) {
    const g = this.game;
    const say = (t) => { if (p.isLocal) g.hud?.centerPrint?.(t, 2); };
    if (!p.alive) return false;
    if (!g.inBuyZone(p)) return false;
    if (!this.buyTimeLeft()) { say(`${Math.round(this.buyTime)} seconds have passed.\nYou can't buy anything now.`); return false; }
    const pay = (cost) => {
      if (p.money < cost) { say('You have insufficient funds!'); return false; }
      this.addMoney(p, -cost);
      return true;
    };
    if (item === 'primammo' || item === 'secammo') {
      const w = item === 'primammo' ? p.weapons[1] : p.weapons[2];
      if (!w || !w.def.ammoBuy) return false;
      if (w.ammo >= w.def.maxAmmo) return false;
      if (!pay(w.def.ammoBuy.cost)) return false;
      w.ammo = Math.min(w.def.maxAmmo, w.ammo + w.def.ammoBuy.amount);
      g.sound.play('ammo_pickup', { pos: p.isLocal ? null : p.eyePos(), volume: 0.8 });
      return true;
    }
    if (item === 'vest' || item === 'vesthelm') {
      const cost = item === 'vest' ? 650 : (p.armor >= 100 && !p.helmet ? 350 : 1000);
      if (p.armor >= 100 && (item === 'vest' || p.helmet)) { say('You already have kevlar!'); return false; }
      if (!pay(cost)) return false;
      p.armor = 100;
      if (item === 'vesthelm') p.helmet = true;
      g.sound.play('ammo_pickup', { pos: p.isLocal ? null : p.eyePos(), volume: 0.7 });
      return true;
    }
    if (item === 'defuser') {
      if (p.team !== TEAM_CT || p.defuser) return false;
      if (!pay(200)) return false;
      p.defuser = true;
      g.sound.play('defuser_on', { pos: p.isLocal ? null : p.eyePos(), volume: 0.7 });
      return true;
    }
    if (item === 'nvgs') { return pay(1250); }
    const def = WS.WEAPON_DEFS[item];
    if (!def) return false;
    if (def.team && def.team !== p.team) return false;
    if (def.slot === 4) {
      const have = p.weapons[4].find((x) => x.id === item);
      const max = item === 'flashbang' ? 2 : 1;
      if (have && (have.count || 1) >= max) { say("You can't carry any more!"); return false; }
    } else if (p.weapons[def.slot]?.id === item) { say('You already have one!'); return false; }
    if (!pay(def.price)) return false;
    g.giveWeapon(p, item, { select: def.slot !== 4 || !p.active });
    g.sound.play('ammo_pickup', { pos: p.isLocal ? null : p.eyePos(), volume: 0.8 });
    return true;
  }

  // ------------------------------------------------------------------ bomb
  canPlant(p) {
    return p.alive && p.team === TEAM_T && !!this.game.bombZoneOf(p) && p.pm.onground && this.state === 'live';
  }

  plantBomb(p) {
    const g = this.game;
    if (!this.canPlant(p) || this.bomb) return false;
    const feet = p.feet();
    // drop to floor
    g.collision.trace([feet[0], feet[1], feet[2] + 8], [feet[0], feet[1], feet[2] - 64], [0, 0, 0], [0, 0, 0], MASK_WORLD_PLAYER, this.tr);
    const pos = this.tr.fraction < 1 ? this.tr.endpos.slice() : feet;
    const c4 = createPlantedC4();
    c4.object3D.position.set(pos[0], pos[1], pos[2]);
    c4.object3D.rotation.set(0, 0, p.pm.angles[1] * Math.PI / 180);
    g.renderer.world.add(c4.object3D);
    const site = g.bombZoneOf(p);
    this.bomb = { pos, site: site?.name || '?', plantTime: this.time, explodeTime: this.time + this.c4Time, nextBeep: this.time + 1, model: c4, defuser: null, defuseEnd: 0, planter: p };
    this.bombWasPlanted = true;
    p.weapons[5] = null;
    this.bombCarrier = null;
    this.addMoney(p, CR.RULES?.rewardPlant ?? 300);
    g.sound.play('c4_planted', { pos, volume: 1 });
    g.hud?.centerPrint?.('The bomb has been planted!', 3);
    g.announce?.('Bomb has been planted.');
    g.bots.onBombPlanted(this.bomb);
    return true;
  }

  tickBomb(dt) {
    const g = this.game;
    const b = this.bomb;
    if (b.exploded || b.defused) return;
    const remaining = b.explodeTime - this.time;
    if (this.time >= b.nextBeep) {
      const frac = Math.max(0, remaining / this.c4Time);
      const interval = 0.1 + 1.35 * Math.pow(frac, 1.4);
      b.nextBeep = this.time + interval;
      g.sound.play('c4_beep', { pos: b.pos, volume: 1, attenuation: frac > 0.5 ? 'normal' : 'loud' });
      b.model.setBlink(true);
      b.blinkOff = this.time + 0.1;
    }
    if (b.blinkOff && this.time > b.blinkOff) { b.model.setBlink(false); b.blinkOff = 0; }
    if (b.defuser) {
      const d = b.defuser;
      if (!d.alive || !d.useHeld) {
        this.stopDefuse();
      } else if (this.time >= b.defuseEnd) {
        b.defused = true;
        d.defusing = false;
        g.sound.play('c4_disarmed', { pos: b.pos, volume: 1 });
        this.addMoney(d, CR.RULES?.rewardDefuse ?? 300);
        b.model.setBlink(false);
        this.endRound(TEAM_CT, 'defuse', 'Bomb has been defused!');
        return;
      }
    }
    if (remaining <= 0) {
      b.exploded = true;
      this.explode();
    }
  }

  explode() {
    const g = this.game;
    const b = this.bomb;
    g.effects.explosion(b.pos, 2.2);
    g.sound.play('c4_explode', { pos: b.pos, volume: 1, attenuation: 'none' });
    b.model.object3D.visible = false;
    const radius = CR.C4?.radius ?? 1750;
    const dmgMax = CR.C4?.damage ?? 500;
    for (const p of g.players) {
      if (!p.alive) continue;
      const d = Math.hypot(p.pm.origin[0] - b.pos[0], p.pm.origin[1] - b.pos[1], p.pm.origin[2] - b.pos[2]);
      if (d > radius) continue;
      // C4 falloff: CS uses a gaussian-ish falloff; approximate
      const dmg = dmgMax * Math.exp(-((d / (radius / 3)) ** 2));
      if (dmg < 1) continue;
      g.damagePlayer(p, b.planter && b.planter.alive ? b.planter : null, Math.round(dmg), 0, 'c4', null);
    }
    g.shake = { until: g.time + 1.5, amp: 12 };
    this.endRound(TEAM_T, 'bomb', 'Target Successfully Bombed!');
  }

  useButton(p, held) {
    p.useHeld = held;
    const b = this.bomb;
    if (!b || b.exploded || b.defused || p.team !== TEAM_CT || !p.alive) return;
    if (!held) return;
    if (b.defuser && b.defuser !== p) return;
    if (b.defuser === p) return;
    const o = p.pm.origin;
    const d = Math.hypot(o[0] - b.pos[0], o[1] - b.pos[1], (o[2] - 36) - b.pos[2]);
    if (d > 72 || !p.pm.onground) return;
    b.defuser = p;
    b.defuseEnd = this.time + (p.defuser ? 5 : 10);
    p.defusing = true;
    this.game.sound.play('c4_disarm', { pos: b.pos, volume: 0.9 });
    if (p.isLocal) this.game.hud?.centerPrint?.(p.defuser ? 'Defusing Bomb With Defuse Kit' : 'Defusing Bomb Without Defuse Kit', 2);
    this.game.bots.onDefuseStarted(p);
  }

  stopDefuse() {
    const b = this.bomb;
    if (!b || !b.defuser) return;
    b.defuser.defusing = false;
    b.defuser = null;
  }

  onDefuseInterrupted(p) {
    if (this.bomb && this.bomb.defuser === p) this.stopDefuse();
  }

  removeBomb() {
    if (this.bomb) {
      this.bomb.model.object3D.removeFromParent();
      this.bomb.model.object3D.userData.dispose?.();
    }
    this.bomb = null;
  }

  onBombDropped(p) {
    this.bombCarrier = null;
    if (p.isLocal) this.game.hud?.centerPrint?.('You dropped the bomb!', 2);
    for (const q of this.game.players) if (q.team === TEAM_T && q.isLocal && q !== p) this.game.hud?.centerPrint?.('The bomb has been dropped!', 2);
  }

  onBombPickup(p) {
    this.bombCarrier = p;
    if (p.isLocal) this.game.hud?.centerPrint?.('You picked up the bomb!', 2);
  }

  onPlayerKilled(victim, attacker) {
    if (victim === this.bombCarrier) this.bombCarrier = null;
    if (this.state === 'live') this.checkElimination();
  }
}
