// Bots: a compact take on the Condition Zero / CS 1.6 bots. Team plans (rush a
// site through long / short / tunnels / mid), CT site holds, vision with reaction
// time, imperfect aim that settles, burst fire, buying, planting and defusing.

import { TEAM_T, TEAM_CT } from './player.js';
import { Player } from './player.js';
import { IN_JUMP, IN_DUCK, IN_WALK } from '../engine/pmove.js';
import { angleVectors, DEG } from '../engine/coords.js';
import { TraceResult, MASK_SHOT } from '../engine/collision.js';
import { PLAYER_SKINS } from '../assets/playermodels.js';
import * as WS from './weaponsys.js';

const BTN_ATTACK = 1, BTN_ATTACK2 = 2, BTN_RELOAD = 4, BTN_USE = 8;

export const BOT_NAMES = [
  'Albert', 'Allen', 'Bert', 'Bob', 'Cecil', 'Clarence', 'Elliot', 'Elmer', 'Ernie', 'Eugene', 'Fergus', 'Ferris',
  'Frank', 'Frasier', 'Fred', 'George', 'Graham', 'Harvey', 'Irwin', 'Jerry', 'Joe', 'Josh', 'Kurt', 'Lars',
  'Larry', 'Leonard', 'Lionel', 'Louis', 'Maxwell', 'Moe', 'Morris', 'Neil', 'Oscar', 'Oswald', 'Pete', 'Quentin',
  'Ray', 'Rich', 'Rock', 'Sergio', 'Seth', 'Shark', 'Stan', 'Steve', 'Ted', 'Tim', 'Ulric', 'Vinny', 'Wade', 'Walt',
  'Xavier', 'Yanni', 'Zach', 'Gunner', 'Hank', 'Grunt', 'Ringo', 'Rabbit', 'Wolf', 'Vitaliy',
];

export const DIFFICULTY = {
  easy: { reaction: 0.65, err: 5.5, turn: 260, head: 0.08, spray: 0.4, name: 'Easy' },
  normal: { reaction: 0.42, err: 3.2, turn: 420, head: 0.2, spray: 0.6, name: 'Normal' },
  hard: { reaction: 0.27, err: 2.0, turn: 620, head: 0.35, spray: 0.75, name: 'Hard' },
  expert: { reaction: 0.17, err: 1.1, turn: 900, head: 0.5, spray: 0.9, name: 'Expert' },
};

// Routes and positions on de_dust2 (feet positions)
const SITES = {
  A: { plant: [[1110, 2560, 96], [1180, 2660, 96], [1060, 2700, 96]], center: [1120, 2600, 96] },
  B: { plant: [[-1560, 2640, 0], [-1640, 2760, 0], [-1480, 2560, 0]], center: [-1560, 2660, 0] },
};
const T_ROUTES = [
  { name: 'long', site: 'A', weight: 4, via: [[260, -120, 0], [640, 560, 0], [1150, 1000, 0], [1420, 1500, 0], [1460, 2150, 0]] },
  { name: 'short', site: 'A', weight: 2, via: [[-450, 380, 0], [-190, 1000, 0], [300, 1460, 0], [330, 1860, 96], [600, 2600, 96]] },
  { name: 'tunnels', site: 'B', weight: 4, via: [[-1700, 250, 0], [-1668, 860, 32], [-1700, 1200, 32], [-1984, 1600, 32], [-1984, 1900, 0]] },
  { name: 'midb', site: 'B', weight: 1, via: [[-450, 380, 0], [-420, 1200, -100], [-450, 1900, -124], [-900, 2330, -40], [-1290, 2260, 0]] },
];
// CT hold spots: [pos, lookYaw]
const CT_HOLDS = {
  A: [
    [[1160, 2740, 96], 260], [[700, 2700, 96], 300], [[1450, 3000, 128], 270], [[1420, 1880, 0], 270], [[400, 2300, 96], 270],
  ],
  B: [
    [[-1620, 2830, 0], 250], [[-2020, 2760, 32], 300], [[-1300, 2300, 0], 180], [[-1700, 2420, 0], 230], [[-1880, 2380, 0], 260],
  ],
  mid: [
    [[-450, 1960, -124], 270], [[330, 1880, 96], 210], [[-160, 1500, 0], 250],
  ],
};

const RADIO_SPOT = ['Enemy spotted.', 'Enemy spotted.', 'Taking fire, need assistance!'];

const tr = new TraceResult();
const _f = [0, 0, 0];

function angleTo(from, to) {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  const yaw = Math.atan2(dy, dx) / DEG;
  const pitch = -Math.atan2(dz, Math.hypot(dx, dy)) / DEG;
  return [pitch, yaw];
}
function angDiff(a, b) { return ((a - b) % 360 + 540) % 360 - 180; }
function dist2(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function weightedPick(arr) {
  const total = arr.reduce((s, r) => s + r.weight, 0);
  let x = Math.random() * total;
  for (const r of arr) { x -= r.weight; if (x <= 0) return r; }
  return arr[arr.length - 1];
}

export class BotManager {
  constructor(game) {
    this.game = game;
    this.bots = [];
    this.difficulty = 'normal';
    this.usedNames = new Set();
    this.plan = { route: null };
  }

  name() {
    const free = BOT_NAMES.filter((n) => !this.usedNames.has(n));
    const n = free.length ? pick(free) : 'Bot' + (this.bots.length + 1);
    this.usedNames.add(n);
    return n;
  }

  populate(opts) {
    this.bots = [];
    this.usedNames = new Set();
    this.difficulty = opts.difficulty || 'normal';
    this.opts = opts;
  }

  // Fill teams up to the configured size (called after the human picks a team).
  fillTeams(perTeam) {
    const g = this.game;
    for (const team of [TEAM_T, TEAM_CT]) {
      let have = g.players.filter((p) => p.team === team).length;
      while (have < perTeam) {
        this.addBot(team);
        have++;
      }
    }
  }

  addBot(team) {
    const g = this.game;
    const p = new Player({ name: this.name(), isBot: true });
    g.addPlayer(p);
    const bot = new Bot(this, p, DIFFICULTY[this.difficulty] || DIFFICULTY.normal);
    p.bot = bot;
    this.bots.push(bot);
    g.joinTeam(p, team, pick(team === TEAM_T ? PLAYER_SKINS.t : PLAYER_SKINS.ct));
    return p;
  }

  think(dt) {
    for (const b of this.bots) {
      if (!b.p.alive) { b.p.cmd = null; continue; }
      b.update(dt);
    }
  }

  onRoundStart() {
    this.plan = { route: weightedPick(T_ROUTES), splitRoute: Math.random() < 0.35 ? weightedPick(T_ROUTES) : null };
    // CT assignments: spread over A, B, mid
    const cts = this.bots.filter((b) => b.p.team === TEAM_CT);
    const order = ['B', 'A', 'mid', 'A', 'B', 'A', 'B'];
    const used = { A: new Set(), B: new Set(), mid: new Set() };
    cts.forEach((b, i) => {
      const zone = order[(i + Math.floor(Math.random() * 2)) % order.length];
      const spots = CT_HOLDS[zone].filter((_, k) => !used[zone].has(k));
      const k = CT_HOLDS[zone].indexOf(spots.length ? pick(spots) : pick(CT_HOLDS[zone]));
      used[zone].add(k);
      b.assign = { zone, spot: CT_HOLDS[zone][k] };
    });
    const ts = this.bots.filter((b) => b.p.team === TEAM_T);
    ts.forEach((b) => {
      b.route = this.plan.splitRoute && Math.random() < 0.3 && !b.p.weapons[5] ? this.plan.splitRoute : this.plan.route;
    });
    for (const b of this.bots) b.roundStart();
  }

  onRoundEnd(winner) {
    for (const b of this.bots) b.onRoundEnd(winner);
  }

  onBombPlanted(bomb) {
    for (const b of this.bots) b.onBombPlanted(bomb);
  }

  onDefuseStarted(p) {
    for (const b of this.bots) if (b.p.team === TEAM_T && b.p.alive) b.alert(p.pm.origin, 0.6);
  }

  onNoise(src, pos, radius) {
    for (const b of this.bots) {
      if (!b.p.alive || b.p === src || src.team === b.p.team) continue;
      const d = Math.hypot(pos[0] - b.p.pm.origin[0], pos[1] - b.p.pm.origin[1], pos[2] - b.p.pm.origin[2]);
      if (d < radius) b.alert(pos, 1 - d / radius);
    }
  }

  onHurt(victim, attacker) {
    victim.bot?.onHurt(attacker);
  }

  onDeath(victim, attacker) {
    for (const b of this.bots) {
      if (b.enemy === victim) b.loseEnemy();
      if (b.p === victim) b.onDead();
    }
  }

  onFlashed(p, dur) { if (p.bot) p.bot.blindUntil = this.game.time + dur; }
}

class Bot {
  constructor(mgr, p, skill) {
    this.mgr = mgr;
    this.game = mgr.game;
    this.p = p;
    this.skill = skill;
    this.state = 'idle';
    this.enemy = null;
    this.path = null;
    this.pathIdx = 0;
    this.goal = null;
    this.nextScan = Math.random() * 0.1;
    this.aim = [0, 0];
    this.err = [0, 0];
    this.lastPos = [0, 0, 0];
    this.stuck = 0;
    this.blindUntil = 0;
    this.alertPos = null;
    this.alertTime = -10;
    this.fireHold = 0;
    this.nextFire = 0;
    this.burst = 0;
    this.strafeDir = 1;
    this.nextStrafe = 0;
    this.crouchFight = false;
    this.lookTarget = null;
    this.radioCooldown = 0;
  }

  get time() { return this.game.time; }

  roundStart() {
    this.enemy = null;
    this.path = null;
    this.goal = null;
    this.state = 'buy';
    this.buyDone = false;
    this.viaIdx = 0;
    this.plantSpot = null;
    this.holdUntil = 0;
    this.alertPos = null;
    this.buyAt = this.time + 0.4 + Math.random() * 1.6;
  }

  onRoundEnd() { this.enemy = null; }
  onDead() { this.enemy = null; this.path = null; }

  onBombPlanted(bomb) {
    this.bombKnown = bomb;
    this.path = null;
    this.goal = null;
  }

  onHurt(attacker) {
    if (!attacker || attacker.team === this.p.team) return;
    if (!this.enemy) this.alert(attacker.eyePos(), 1);
    if (Math.random() < 0.25) this.say('Taking fire, need assistance!');
  }

  alert(pos, strength) {
    if (this.time - this.alertTime < 0.5 && strength < 0.8) return;
    this.alertPos = pos.slice();
    this.alertTime = this.time;
  }

  loseEnemy() {
    this.enemy = null;
    this.burst = 0;
  }

  say(text) {
    if (this.time < this.radioCooldown) return;
    this.radioCooldown = this.time + 6 + Math.random() * 6;
    this.game.rounds.radio(this.p, text);
  }

  // ------------------------------------------------------------------ buying
  buy() {
    const g = this.game, p = this.p, R = g.rounds;
    const want = [];
    const m = p.money;
    const prim = p.weapons[1];
    if (!prim) {
      if (p.team === TEAM_T) {
        if (m >= 5750 && Math.random() < 0.15) want.push('awp');
        else if (m >= 2500 + 650) want.push('ak47');
        else if (m >= 2000 + 650 && Math.random() < 0.7) want.push('galil');
        else if (m >= 1400 + 650 && Math.random() < 0.5) want.push('mac10');
      } else {
        if (m >= 5750 && Math.random() < 0.2) want.push('awp');
        else if (m >= 3100 + 650) want.push('m4a1');
        else if (m >= 2250 + 650 && Math.random() < 0.7) want.push('famas');
        else if (m >= 1500 + 650 && Math.random() < 0.5) want.push('mp5');
      }
    }
    for (const w of want) R.buy(p, w);
    const prim2 = p.weapons[1];
    if (prim2) for (let i = 0; i < 4; i++) R.buy(p, 'primammo');
    // pistol rounds: armour or a deagle
    if (!p.weapons[1] && p.money >= 650 && p.money < 1500) {
      if (Math.random() < 0.55) R.buy(p, 'vest');
      else if (Math.random() < 0.4) { R.buy(p, 'deagle'); R.buy(p, 'secammo'); }
    }
    if (p.money >= 1000 && p.armor < 100) R.buy(p, 'vesthelm');
    else if (p.money >= 650 && p.armor < 100) R.buy(p, 'vest');
    if (p.team === TEAM_CT && p.money >= 200 && Math.random() < 0.5) R.buy(p, 'defuser');
    if (p.money >= 300 && Math.random() < 0.6) R.buy(p, 'hegrenade');
    if (p.money >= 200 && Math.random() < 0.5) R.buy(p, 'flashbang');
    if (p.money >= 300 && Math.random() < 0.3) R.buy(p, 'smokegrenade');
    for (let i = 0; i < 2; i++) R.buy(p, 'secammo');
    const best = p.weapons[1] || p.weapons[2];
    if (best && p.active !== best) g.selectWeapon(p, best);
  }

  // ------------------------------------------------------------------ main update
  update(dt) {
    const g = this.game, p = this.p;
    const cmd = p.cmd || (p.cmd = { forwardmove: 0, sidemove: 0, upmove: 0, buttons: 0, wbuttons: 0 });
    cmd.forwardmove = 0; cmd.sidemove = 0; cmd.buttons = 0; cmd.wbuttons = 0;
    if (this.state === 'buy') {
      if (this.time >= this.buyAt && !this.buyDone) { this.buy(); this.buyDone = true; }
      if (!g.rounds.freeze) this.state = 'objective';
      else { this.lookAround(dt); return; }
    }
    // perception at 10 Hz
    this.nextScan -= dt;
    if (this.nextScan <= 0) { this.nextScan = 0.1; this.scan(); }

    const blind = this.time < this.blindUntil;
    let moveTo = null; // feet position to walk toward
    let lookAt = null; // eye-level point to look at
    let wantFire = false;
    let walk = false;

    if (this.enemy && (this.enemyVisible || this.time - this.lastSeenTime < 1.2) && !blind) {
      // ---------------- combat
      const e = this.enemy;
      const targetPt = this.aimPoint(e);
      lookAt = this.enemyVisible ? targetPt : this.lastSeenPos;
      const ready = this.time >= this.reactAt;
      const d = dist2(p.pm.origin, e.pm.origin);
      if (this.enemyVisible && ready) wantFire = true;
      // movement during fights: strafe, close distance with pistols/smgs, hold with rifles
      if (this.time > this.nextStrafe) {
        this.nextStrafe = this.time + 0.4 + Math.random() * 0.9;
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
        this.crouchFight = d > 900 && Math.random() < 0.35 && this.p.active?.def?.slot === 1;
      }
      const sniper = /awp|scout|g3sg1|sg550/.test(p.active?.id || '');
      cmd.sidemove = sniper ? 0 : 250 * this.strafeDir * (d > 1200 ? 0.4 : 1);
      if (!this.enemyVisible) moveTo = this.lastSeenPos;
      if (this.crouchFight) cmd.buttons |= IN_DUCK;
      if (Math.random() < 0.004 && d < 600) cmd.buttons |= IN_JUMP;
      if (this.time - this.lastSeenTime > 0.2 && Math.random() < 0.002) this.say(pick(RADIO_SPOT));
    } else {
      if (this.enemy && this.time - this.lastSeenTime >= 1.2) this.loseEnemy();
      // ---------------- objectives
      const obj = this.objective(dt);
      moveTo = obj.moveTo;
      lookAt = obj.lookAt;
      walk = obj.walk;
      if (obj.fire) wantFire = true;
      if (obj.use) cmd.wbuttons |= BTN_USE;
      if (obj.duck) cmd.buttons |= IN_DUCK;
      // heard something: look there
      if (!lookAt && this.alertPos && this.time - this.alertTime < 2.5) lookAt = this.alertPos;
      // reload when safe
      const w = p.active;
      if (w && w.def && w.clip != null && w.def.clip > 0 && w.clip < w.def.clip * 0.4 && w.ammo > 0 && !w.inReload) cmd.wbuttons |= BTN_RELOAD;
    }
    if (blind) {
      cmd.forwardmove = -200;
      cmd.sidemove = 200 * this.strafeDir;
      if (Math.random() < 0.02 && this.enemy) wantFire = true;
    }

    // weapon management
    this.manageWeapon(cmd);

    // ---------------- move
    if (moveTo) this.navigate(moveTo, cmd, walk);
    // ---------------- aim
    this.turnTo(lookAt, dt);
    // ---------------- fire
    if (wantFire) this.fire(cmd);
    this.lastAngles = p.pm.angles.slice();
  }

  aimPoint(e) {
    const eye = e.eyePos();
    if (this.aimHead === undefined || this.time > (this.aimPick || 0)) {
      this.aimHead = Math.random() < this.skill.head;
      this.aimPick = this.time + 1 + Math.random();
    }
    // chest is ~14 units below the eye; head ~2 above
    return [eye[0], eye[1], eye[2] + (this.aimHead ? 1 : -16)];
  }

  scan() {
    const g = this.game, p = this.p;
    const eye = p.eyePos();
    angleVectors(p.pm.angles[0], p.pm.angles[1], _f, null, null);
    let best = null, bestD = Infinity;
    for (const e of g.players) {
      if (!e.alive || e.team === p.team || e.team === 'SPEC') continue;
      const ee = e.eyePos();
      const dx = ee[0] - eye[0], dy = ee[1] - eye[1], dz = ee[2] - eye[2];
      const d = Math.hypot(dx, dy, dz);
      if (d > 4000) continue;
      const dot = (dx * _f[0] + dy * _f[1] + dz * _f[2]) / d;
      const known = this.enemy === e;
      if (dot < (known ? 0.2 : 0.42) && d > 160) continue; // ~130° field of view
      // line of sight to head or chest
      const chest = [ee[0], ee[1], ee[2] - 18];
      let vis = false;
      for (const pt of [chest, ee]) {
        g.collision.trace(eye, pt, [0, 0, 0], [0, 0, 0], MASK_SHOT, tr);
        if (tr.fraction >= 1 && !g.grenades.blocksVision(eye, pt)) { vis = true; break; }
      }
      if (!vis) continue;
      const score = d * (known ? 0.6 : 1);
      if (score < bestD) { bestD = score; best = e; }
    }
    if (best) {
      if (this.enemy !== best) {
        const first = !this.enemy;
        this.enemy = best;
        // reaction delay & initial aim error
        this.reactAt = this.time + this.skill.reaction * (0.8 + Math.random() * 0.5);
        const e = this.skill.err;
        this.err = [(Math.random() - 0.5) * e * 2.2, (Math.random() - 0.5) * e * 4.5];
        this.burst = 0;
        if (first && Math.random() < 0.3) this.say('Enemy spotted.');
      }
      this.enemyVisible = true;
      this.lastSeenTime = this.time;
      this.lastSeenPos = best.eyePos();
    } else {
      this.enemyVisible = false;
    }
  }

  turnTo(target, dt) {
    const p = this.p;
    const a = p.pm.angles;
    if (!target) return;
    const eye = p.eyePos();
    let [pitch, yaw] = angleTo(eye, target);
    if (this.enemy && this.enemyVisible) {
      // aim error settles over ~0.5 s, with a small residual wobble
      const k = Math.exp(-dt / 0.35);
      this.err[0] *= k; this.err[1] *= k;
      const wob = this.skill.err * 0.25;
      pitch += this.err[0] + Math.sin(this.time * 3.1 + this.p.id) * wob * 0.5;
      yaw += this.err[1] + Math.sin(this.time * 2.3 + this.p.id * 2) * wob;
    }
    const maxStep = this.skill.turn * dt * (this.enemy ? 1 : 0.6);
    const dy = angDiff(yaw, a[1]), dp = pitch - a[0];
    // proportional turning with a cap (smooth, human-like)
    const sy = Math.sign(dy) * Math.min(Math.abs(dy), Math.max(maxStep * 0.15, Math.abs(dy) * 0.25), maxStep);
    const sp = Math.sign(dp) * Math.min(Math.abs(dp), Math.max(maxStep * 0.15, Math.abs(dp) * 0.25), maxStep);
    a[1] = ((a[1] + sy) % 360 + 360) % 360;
    a[0] = Math.max(-89, Math.min(89, a[0] + sp));
    this.aimErrorDeg = Math.hypot(angDiff(yaw, a[1]), pitch - a[0]);
  }

  manageWeapon(cmd) {
    const g = this.game, p = this.p;
    const w = p.active;
    if (!w) return;
    // never walk around with grenades/c4 unless planting
    if ((w.def.slot === 4 || (w.id === 'c4' && this.state !== 'plant')) && !w.pinPulled) {
      const best = p.weapons[1] || p.weapons[2] || p.weapons[3];
      if (best && best !== w && !(this.state === 'plant' && w.id === 'c4')) g.selectWeapon(p, best);
    }
    // out of ammo -> switch
    if (w.def.clip > 0 && w.clip === 0 && w.ammo === 0) {
      const alt = [p.weapons[1], p.weapons[2]].find((x) => x && x !== w && (x.clip > 0 || x.ammo > 0)) || p.weapons[3];
      if (alt) g.selectWeapon(p, alt);
    }
    // knife out in a fight with a gun available
    if (w.id === 'knife' && this.enemy) {
      const alt = [p.weapons[1], p.weapons[2]].find((x) => x && (x.clip > 0 || x.ammo > 0));
      if (alt) g.selectWeapon(p, alt);
    }
    // snipers zoom when engaging
    if (/awp|scout|g3sg1|sg550/.test(w.id)) {
      const zoomed = p.fov < 90;
      if (this.enemy && this.enemyVisible && !zoomed && !w.inReload && this.time > (this.zoomCd || 0)) { cmd.wbuttons |= BTN_ATTACK2; this.zoomCd = this.time + 0.4; }
      if (!this.enemy && zoomed && this.time > (this.zoomCd || 0)) { cmd.wbuttons |= BTN_ATTACK2; this.zoomCd = this.time + 0.4; }
    }
  }

  fire(cmd) {
    const p = this.p, w = p.active;
    if (!w) return;
    if (w.clip === 0 && w.def.clip > 0) { cmd.wbuttons |= BTN_RELOAD; return; }
    const e = this.enemy;
    const d = e ? dist2(p.pm.origin, e.pm.origin) : 500;
    // only shoot when the crosshair is close enough to the target
    const tol = Math.max(1.2, Math.atan2(22, d) / DEG * 1.4);
    if (e && this.aimErrorDeg > tol) return;
    if (this.time < this.nextFire) return;
    const auto = !!w.def.auto;
    if (!auto || w.def.slot === 2) {
      // semi-automatic: tap (press one tick, release the next)
      if (this.tapToggle) { this.tapToggle = false; return; }
      this.tapToggle = true;
      cmd.wbuttons |= BTN_ATTACK;
      const sniper = /awp|scout/.test(w.id);
      this.nextFire = this.time + (sniper ? 0.25 : (d > 800 ? 0.32 : 0.16) * (1.3 - this.skill.spray * 0.4));
      return;
    }
    // automatic: bursts at range, spray up close
    const maxBurst = d < 500 ? 30 : d < 1000 ? 5 : 3;
    if (this.burst >= maxBurst * (0.6 + this.skill.spray * 0.6)) {
      this.burst = 0;
      this.nextFire = this.time + (d < 1000 ? 0.25 : 0.42) * (1.4 - this.skill.spray * 0.5);
      return;
    }
    cmd.wbuttons |= BTN_ATTACK;
    this.burst++;
  }

  // ------------------------------------------------------------------ objectives
  objective(dt) {
    const g = this.game, p = this.p, R = g.rounds;
    const res = { moveTo: null, lookAt: null, walk: false };
    const bomb = R.bomb && !R.bomb.exploded && !R.bomb.defused ? R.bomb : null;
    if (p.team === TEAM_T) {
      if (bomb) {
        // guard the planted bomb
        if (!this.guardSpot || this.guardBomb !== bomb) {
          this.guardBomb = bomb;
          const ang = Math.random() * Math.PI * 2, r = 200 + Math.random() * 300;
          this.guardSpot = [bomb.pos[0] + Math.cos(ang) * r, bomb.pos[1] + Math.sin(ang) * r, bomb.pos[2]];
          const n = g.nav.nearest(this.guardSpot, 300) || g.nav.nearest(bomb.pos, 300);
          this.guardSpot = n ? [n.x, n.y, n.z] : bomb.pos.slice();
        }
        if (dist2(p.pm.origin, this.guardSpot) > 48) res.moveTo = this.guardSpot;
        else res.lookAt = [this.guardSpot[0] * 2 - bomb.pos[0], this.guardSpot[1] * 2 - bomb.pos[1], this.guardSpot[2] + 60];
        return res;
      }
      // fetch a dropped bomb
      const dropped = g.dropped.find((d) => d.weapon.id === 'c4');
      if (dropped && !R.bombCarrier) {
        const nearestT = g.players.filter((q) => q.team === TEAM_T && q.alive).sort((a, b) => dist2(a.pm.origin, dropped.pos) - dist2(b.pm.origin, dropped.pos))[0];
        if (nearestT === p) { res.moveTo = dropped.pos; return res; }
      }
      const route = this.route || this.mgr.plan.route;
      const site = SITES[route.site];
      if (p.weapons[5]) {
        // carrier: follow the route, then plant
        const zone = g.bombZoneOf(p);
        if (zone && R.state === 'live') {
          if (!this.plantSpot) this.plantSpot = pick(site.plant);
          if (dist2(p.pm.origin, this.plantSpot) > 40 && !(zone.name === route.site && this.time - (this.zoneEnter || this.time) > 2.5)) {
            if (!this.zoneEnter) this.zoneEnter = this.time;
            res.moveTo = this.plantSpot;
            return res;
          }
          // plant
          if (p.active?.id !== 'c4') g.selectWeapon(p, p.weapons[5]);
          this.state = 'plant';
          res.fire = true;
          res.duck = true;
          res.lookAt = [p.pm.origin[0] + 50, p.pm.origin[1], p.pm.origin[2] - 60];
          return res;
        }
      }
      this.state = 'objective';
      // walk the route's via points then the site
      const pts = [...route.via, site.center];
      while (this.viaIdx < pts.length - 1 && dist2(p.pm.origin, pts[this.viaIdx]) < 140) this.viaIdx++;
      const target = this.viaIdx < pts.length - 1 ? pts[this.viaIdx] : (p.weapons[5] ? (this.plantSpot || (this.plantSpot = pick(site.plant))) : this.siteHold(site));
      if (dist2(p.pm.origin, target) > 40) res.moveTo = target;
      else res.lookAt = null;
      // terrorists stay behind the carrier a little: wait at the last via point for the bomb
      return res;
    }
    // ---------------- CT
    if (bomb) {
      const d = dist2(p.pm.origin, bomb.pos);
      const defuser = bomb.defuser;
      const closestCT = g.players.filter((q) => q.team === TEAM_CT && q.alive).sort((a, b) => dist2(a.pm.origin, bomb.pos) - dist2(b.pm.origin, bomb.pos))[0];
      if (defuser === p) {
        res.use = true; res.duck = true;
        res.lookAt = bomb.pos;
        return res;
      }
      if (!defuser && closestCT === p && !this.enemy) {
        if (d > 40) { res.moveTo = bomb.pos; return res; }
        res.use = true; res.duck = true; res.lookAt = bomb.pos;
        return res;
      }
      // cover the defuser / move toward the site
      if (d > 300) res.moveTo = bomb.pos;
      else res.lookAt = [bomb.pos[0] + (p.pm.origin[0] - bomb.pos[0]) * 3, bomb.pos[1] + (p.pm.origin[1] - bomb.pos[1]) * 3, bomb.pos[2] + 60];
      return res;
    }
    const a = this.assign || { spot: CT_HOLDS.A[0], zone: 'A' };
    const [spot, yaw] = a.spot;
    if (dist2(p.pm.origin, spot) > 40) {
      res.moveTo = spot;
    } else {
      // hold: look toward the expected approach, sweeping a little
      const sweep = Math.sin(this.time * 0.6 + p.id) * 25;
      const yy = (yaw + sweep) * DEG;
      res.lookAt = [spot[0] + Math.cos(yy) * 400, spot[1] + Math.sin(yy) * 400, spot[2] + 53];
      res.walk = true;
    }
    return res;
  }

  siteHold(site) {
    if (!this.tHold) {
      const n = this.game.nav.nearest([site.center[0] + (Math.random() - 0.5) * 350, site.center[1] + (Math.random() - 0.5) * 350, site.center[2]], 400);
      this.tHold = n ? [n.x, n.y, n.z] : site.center;
    }
    return this.tHold;
  }

  lookAround(dt) {
    const p = this.p;
    p.pm.angles[1] += Math.sin(this.time * 0.7 + p.id) * dt * 20;
  }

  // ------------------------------------------------------------------ navigation
  navigate(target, cmd, walk) {
    const g = this.game, p = this.p;
    const feet = p.feet();
    if (!this.goal || dist2(this.goal, target) > 64 || Math.abs(this.goal[2] - target[2]) > 64 || !this.path || this.time > this.repathAt) {
      this.goal = target.slice();
      const a = g.nav.nearest(feet, 260), b = g.nav.nearest(target, 300);
      const raw = a && b ? g.nav.findPath(a, b) : null;
      this.path = raw ? g.nav.smooth(raw, feet) : null;
      this.pathIdx = 0;
      this.repathAt = this.time + 4 + Math.random() * 2;
      if (!this.path) { this.path = [[target[0], target[1], target[2], 'walk']]; }
    }
    // advance along the path
    while (this.pathIdx < this.path.length) {
      const pt = this.path[this.pathIdx];
      const dz = pt[2] - feet[2];
      if (dist2(feet, pt) < 26 && dz < 40 && dz > -80) this.pathIdx++;
      else break;
    }
    const pt = this.path[Math.min(this.pathIdx, this.path.length - 1)];
    if (!pt) return;
    const dx = pt[0] - feet[0], dy = pt[1] - feet[1];
    const d = Math.hypot(dx, dy);
    if (d < 4 && this.pathIdx >= this.path.length - 1) return;
    // move in world direction (dx,dy) relative to view yaw
    const yaw = p.pm.angles[1] * DEG;
    const fx = Math.cos(yaw), fy = Math.sin(yaw);
    const rx = Math.sin(yaw), ry = -Math.cos(yaw);
    const mx = dx / (d || 1), my = dy / (d || 1);
    const speed = walk ? 200 : 400;
    cmd.forwardmove += (mx * fx + my * fy) * speed;
    cmd.sidemove += (mx * rx + my * ry) * speed;
    if (pt[3] === 'jump' && d < 70) cmd.buttons |= IN_JUMP;
    // look where we're going when nothing else to look at
    if (!this.enemy) {
      const ahead = this.path[Math.min(this.pathIdx + 1, this.path.length - 1)];
      this.lookTarget = [ahead[0], ahead[1], ahead[2] + 60];
      if (!this.alertPos || this.time - this.alertTime > 2.5) this.turnTo(this.lookTarget, 0.01);
    }
    // stuck detection
    const moved = Math.hypot(p.pm.origin[0] - this.lastPos[0], p.pm.origin[1] - this.lastPos[1]);
    this.lastPos = p.pm.origin.slice();
    if (moved < 0.4) {
      this.stuck += 0.01;
      if (this.stuck > 0.5) cmd.buttons |= IN_JUMP;
      if (this.stuck > 0.5) cmd.sidemove += 300 * this.strafeDir;
      if (this.stuck > 1.5) { this.path = null; this.stuck = 0; this.strafeDir *= -1; }
    } else this.stuck = Math.max(0, this.stuck - 0.02);
  }
}
