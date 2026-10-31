// LAST LOOKOUT — the game itself, without any rendering (runs in Node for the tests): the physics
// sandbox and the valley's colliders, the horde, rounds in flight, defences, waves, the rifle,
// money, scoring and the run's save. The browser front end (main.js) feeds it input and turns its
// events into pictures and sound.
import { Vec3, Quat, clamp, makeRng } from '../../physics/math.js';
import { Body } from '../../physics/body.js';
import { Shape } from '../../physics/shapes.js';
import { Sandbox } from '../../game/sandbox.js';
import { WEAPONS } from '../../game/weapons.js';
import { RIFLES, AMMO, UPGRADES, DEFENCES, ENEMIES, BONUS, GATE, PLAYER, WAVES } from '../catalog.js';
import { GateField } from './nav.js';
import { Horde } from './horde.js';
import { Ballistics } from './ballistics.js';
import { Defences } from './defences.js';
import { Director } from './director.js';
import { StubAnimPlayer, STUB_CLIP_INFO } from './stubAnim.js';

const UP = new Vec3(0, 1, 0);

function staticBox(c) {
  const body = new Body({ name: `level:${c.kind}`, isStatic: true });
  const r = 0.004;
  body.addShape(Shape.box(c.h[0] - r, c.h[1] - r, c.h[2] - r, { radius: r, friction: 0.8, restitution: 0.05, material: c.material || 'concrete' }));
  body.makeStatic();
  body.setPose(new Vec3(c.c[0], c.c[1], c.c[2]), new Quat().setFromAxisAngle(UP, c.yaw || 0));
  body.userData = { obstacle: true, level: true, kind: c.kind, gate: c.gate || null };
  return body;
}

/** The rifle in the player's hands: magazine, bolt / trigger reset, reload. */
export class RifleState {
  constructor(game) {
    this.game = game;
    this.id = 'm91';
    this.ammo = 5;
    this.state = 'idle'; // idle | cycling | reload
    this.t = 0;
  }

  get def() {
    return RIFLES[this.id];
  }

  get mag() {
    return Math.round(this.def.mag * (this.game.upgradeLevel('magazine') ? UPGRADES.magazine.levels[0].mag : 1));
  }

  get cycle() {
    return this.def.cycle * (this.game.upgradeLevel('action') ? UPGRADES.action.levels[0].cycle : 1);
  }

  get reloadTime() {
    return this.def.reload;
  }

  equip(id) {
    this.id = id;
    this.ammo = this.mag;
    this.state = 'idle';
    this.t = 0;
  }

  canFire() {
    return this.state === 'idle' && this.ammo > 0;
  }

  step(dt) {
    this.t += dt;
    if (this.state === 'cycling' && this.t >= this.cycle) {
      this.state = 'idle';
      if (this.ammo === 0) this.reload();
    } else if (this.state === 'reload' && this.t >= this.reloadTime) {
      this.ammo = this.mag;
      this.state = 'idle';
      this.game.emit({ type: 'reloadEnd', rifle: this.id });
    }
  }

  fired() {
    this.ammo--;
    this.state = 'cycling';
    this.t = 0;
  }

  reload() {
    if (this.state === 'reload' || this.ammo >= this.mag) return false;
    this.state = 'reload';
    this.t = 0;
    this.game.emit({ type: 'reloadStart', rifle: this.id, empty: this.ammo === 0 });
    return true;
  }
}

export class TowerGame {
  /**
   * opts: { layout, isWalkable, shape (BodyShape: required for shots), rng, makeAnim(rd, seed),
   *         clipInfo, maxPhysical, substeps }
   */
  constructor(opts) {
    this.layout = opts.layout;
    this.isWalkable = opts.isWalkable;
    this.rng = opts.rng ?? makeRng(Date.now() & 0xffff);
    this.sb = new Sandbox({ shape: opts.shape, rng: this.rng, groundHalfSize: 270, substeps: opts.substeps ?? 20 });
    this.sb.setAssist(1);
    for (const c of this.layout.colliders) this.sb.world.addBody(staticBox(c));
    this.field = new GateField(this.layout, this.isWalkable);
    this.makeAnim = opts.makeAnim ?? ((rd) => new StubAnimPlayer(rd));
    this.clipInfo = opts.clipInfo ?? STUB_CLIP_INFO;
    this.events = [];
    this.time = 0;
    this.horde = new Horde(this, { maxPhysical: opts.maxPhysical ?? 10 });
    this.ballistics = new Ballistics(this);
    this.defences = new Defences(this);
    this.director = new Director(this);
    this.rifle = new RifleState(this);
    this.killcam = null; // set by the front end: { consider(bullet, origin, dir) -> bool }
    this.wind = new Vec3();
    this.windTarget = new Vec3();
    this.timeOfDay = 0;
    this.timeOfDayTarget = 0;
    this.newRun();
  }

  emit(e) {
    this.events.push(e);
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  // -------------------------------------------------------------------------------------------
  newRun(save = null) {
    this.horde.clear();
    this.defences.clear();
    this.ballistics.list.length = 0;
    this.gate = { hp: GATE.hp, max: GATE.hp };
    this.player = { hp: PLAYER.hp, max: PLAYER.hp };
    this.cash = PLAYER.startCash;
    this.owned = { rifles: new Set(['m91']), upgrades: {}, ammo: { hp: 0, ap: 0, ex: 0 }, defences: {} };
    this.equipped = { rifle: 'm91', ammo: 'fmj' };
    this.stats = { kills: 0, headshots: 0, shots: 0, hits: 0, longest: 0, cashEarned: 0, collaterals: 0, bossKills: 0 };
    this.focus = 0;
    this.focusActive = false;
    this.over = null;
    this.director.wave = 0;
    this.director.phase = 'title';
    if (save) this.restore(save);
    this.rifle.equip(this.equipped.rifle);
    this.rollWind(this.director.wave + 1);
    this.wind.copy(this.windTarget);
  }

  /** The run as plain data (saved between waves, in the shop). */
  serialize() {
    return {
      wave: this.director.wave, cash: this.cash, gate: { ...this.gate }, player: { ...this.player },
      owned: { rifles: [...this.owned.rifles], upgrades: { ...this.owned.upgrades }, ammo: { ...this.owned.ammo }, defences: { ...this.owned.defences } },
      equipped: { ...this.equipped }, stats: { ...this.stats }, defencesPlaced: this.defences.save(), focus: this.focus,
    };
  }

  restore(s) {
    this.director.wave = s.wave;
    this.cash = s.cash;
    this.gate = { ...s.gate };
    this.player = { ...s.player };
    this.owned = { rifles: new Set(s.owned.rifles), upgrades: { ...s.owned.upgrades }, ammo: { ...s.owned.ammo }, defences: { ...s.owned.defences } };
    this.equipped = { ...s.equipped };
    this.stats = { ...this.stats, ...s.stats };
    this.focus = s.focus || 0;
    this.defences.load(s.defencesPlaced);
    this.director.phase = 'shop';
  }

  // -------------------------------------------------------------------------------------------
  /** One fixed physics step. */
  step(dt) {
    if (this.over) return;
    this.time += dt;
    // (shots fired between steps - the kill cam's round - are booked before anyone's death is)
    for (const e of this.sb.drainFx()) this.onSandboxFx(e);
    // weather drifts
    this.wind.x += (this.windTarget.x - this.wind.x) * dt * 0.2;
    this.wind.z += (this.windTarget.z - this.wind.z) * dt * 0.2;
    this.timeOfDay += clamp(this.timeOfDayTarget - this.timeOfDay, -dt * 0.02, dt * 0.02);
    this.rifle.step(dt);
    this.horde.step(dt);
    this.director.step(dt);
    this.defences.step(dt);
    this.ballistics.step(dt);
    if (this.pendingBlasts && this.pendingBlasts.length) {
      const list = this.pendingBlasts;
      this.pendingBlasts = [];
      for (const b of list) this.defences.detonateBarrel(b.barrel, b.by);
    }
    this.sb.step(dt);
    for (const e of this.sb.drainFx()) this.onSandboxFx(e);
    // focus (bullet time) drains while in use
    if (this.focusActive) {
      this.focus -= dt / (4 * this.focusCapacity);
      if (this.focus <= 0) {
        this.focus = 0;
        this.focusActive = false;
        this.emit({ type: 'focus', on: false });
      }
    }
  }

  onSandboxFx(e) {
    if (e.type === 'injury') {
      const ev = e.event, z = e.person.towerZombie;
      if (ev.type === 'fracture' || ev.type === 'bonebreak') this.emit({ type: 'bone', zombie: z, point: ev.pointW || e.person.rd.pelvis.pos.clone() });
      else if (ev.type === 'armor') this.emit({ type: 'armor', zombie: z, part: ev.part, left: ev.left, point: e.person.rd.segments.head.body.pos.clone() });
    } else if (e.type === 'shot' && e.by === 'killcam') {
      // the kill cam fired the real round: it counts as the player's shot
      const shot = this.killcamShot;
      if (shot) this.registerShot(shot, e.paths, null);
      this.killcamShot = null;
    }
    this.emit({ type: 'sandbox', fx: e });
  }

  // -------------------------------------------------------------------------------------------
  // the player's rifle
  upgradeLevel(id) {
    return this.owned.upgrades[id] || 0;
  }

  upgradeValue(id, key, base) {
    const lv = this.upgradeLevel(id);
    return lv ? UPGRADES[id].levels[lv - 1][key] : base;
  }

  get zoom() {
    return RIFLES[this.rifle.id].zoom * this.upgradeValue('optics', 'zoom', 1);
  }

  get sway() {
    return RIFLES[this.rifle.id].sway * this.upgradeValue('steady', 'sway', 1);
  }

  get breathHold() {
    return this.upgradeValue('lungs', 'hold', 3.5);
  }

  get focusCapacity() {
    return this.upgradeValue('focus', 'focus', 1);
  }

  /** WEAPONS entry for a rifle with an ammunition type (derived entries are made on demand). */
  weaponKey(rifleId, ammo) {
    const base = RIFLES[rifleId].weapon;
    if (ammo === 'fmj') return base;
    const key = `${base}:${ammo}`;
    if (!WEAPONS[key]) {
      const w = { ...WEAPONS[base], base };
      if (ammo === 'hp') Object.assign(w, { expanding: true, pen: w.pen * 0.5, round: w.round.replace('FMJ', 'HP') });
      else if (ammo === 'ap') Object.assign(w, { ap: true, pen: w.pen * 1.45, round: w.round.replace('FMJ', 'AP') });
      else if (ammo === 'ex') Object.assign(w, { fragmenting: true, pen: w.pen * 0.6, round: w.round.replace('FMJ', 'HE') });
      WEAPONS[key] = w;
    }
    return key;
  }

  /** Pull the trigger from the muzzle along dir. Returns the shot or null (empty, cycling). */
  fire(origin, dir) {
    if (this.over) return null;
    const R = this.rifle;
    if (!R.canFire()) {
      if (R.state === 'idle' && R.ammo === 0) {
        this.emit({ type: 'dry' });
        R.reload();
      }
      return null;
    }
    let ammo = this.equipped.ammo;
    if (ammo !== 'fmj') {
      if ((this.owned.ammo[ammo] || 0) <= 0) {
        ammo = this.equipped.ammo = 'fmj';
      } else this.owned.ammo[ammo]--;
    }
    R.fired();
    this.stats.shots++;
    const key = this.weaponKey(R.id, ammo);
    const shot = this.ballistics.fire(RIFLES[R.id], ammo, key, origin, dir);
    this.emit({ type: 'fire', rifle: R.id, ammo, origin: origin.clone(), dir: dir.clone(), suppressed: RIFLES[R.id].suppressed, shot });
    // the report carries: the dead look up (and come)
    if (!RIFLES[R.id].suppressed) this.emit({ type: 'report', pos: origin.clone() });
    return shot;
  }

  reload() {
    return this.rifle.reload();
  }

  toggleFocus() {
    if (this.focusActive) {
      this.focusActive = false;
      this.emit({ type: 'focus', on: false });
    } else if (this.focus > 0.15) {
      this.focusActive = true;
      this.emit({ type: 'focus', on: true });
    }
  }

  /** World time scale the front end should apply (Focus slows the world). */
  get timeScale() {
    return this.focusActive ? 0.3 : 1;
  }

  // -------------------------------------------------------------------------------------------
  // hits, kills, money
  /** Shots resolved through the engine's ballistics: who it hit, for the reward when they die. */
  registerShot(shot, paths, point) {
    const seen = new Set();
    for (const p of paths) {
      for (const h of p.hits) {
        if (seen.has(h.person)) continue;
        seen.add(h.person);
        const z = h.person.towerZombie;
        if (!z) continue;
        const head = h.seg === 'head' || h.seg === 'neck';
        const moving = z.wasState === 'walk' && z.speed() > 1.6;
        z.lastHit = {
          by: 'player', shot: shot.id, time: this.time, head, dist: shot.dist || (point ? point.distanceTo(shot.origin) : 0), moving,
          climbing: z.wasState === 'climb' || z.wasState === 'top' || z.wasState === 'vault', wire: z.lastHit && z.lastHit.wire && this.time - z.lastHit.wire < 4,
          ammo: shot.ammo, order: seen.size,
        };
        shot.people.add(z);
        this.emit({ type: 'hit', zombie: z, head, armor: !!h.armor, point: point ? point.clone() : null, shot });
      }
    }
    if (seen.size) this.stats.hits++;
    if (seen.size >= 2) shot.collateral = seen.size;
  }

  registerMiss(shot, point) {
    void shot;
    void point;
  }

  registerSentry(paths) {
    for (const p of paths) {
      for (const h of p.hits) {
        const z = h.person.towerZombie;
        if (z) z.lastHit = { by: 'sentry', time: this.time, head: h.seg === 'head', dist: 0 };
      }
    }
  }

  /** A zombie just died (from the horde). Pays out and emits the kill. */
  zombieDied(z) {
    const H = z.lastHit, def = z.def;
    const byPlayer = H && (H.by === 'player' || (H.by && H.by.id) || H.by === 'mine' || H.by === 'barrel' || H.by === 'sentry') && this.time - H.time < 12;
    const bonuses = [];
    let mult = 1, extra = 0;
    if (H && H.by === 'player') {
      if (H.head) {
        mult += BONUS.headshot.mult;
        bonuses.push(BONUS.headshot.text);
        this.stats.headshots++;
      }
      for (const L of BONUS.long) {
        if (H.dist >= L.dist) {
          mult += L.mult;
          bonuses.push(`${L.text} ${Math.round(H.dist)} m`);
          break;
        }
      }
      if (H.moving) {
        mult += BONUS.moving.mult;
        bonuses.push(BONUS.moving.text);
      }
      if (H.climbing) {
        mult += BONUS.climber.mult;
        bonuses.push(BONUS.climber.text);
      }
      if (H.wire) {
        mult += BONUS.wire.mult;
        bonuses.push(BONUS.wire.text);
      }
      if (H.order >= 2) {
        extra += BONUS.collateral.cash;
        bonuses.push(`${BONUS.collateral.text} ×${H.order}`);
        this.stats.collaterals++;
      }
      this.stats.longest = Math.max(this.stats.longest, H.dist || 0);
    } else if (H && (H.by === 'barrel' || (H.by && H.by.id && z.lastHit.blast))) {
      extra += BONUS.barrel.cash;
      bonuses.push(BONUS.barrel.text);
    }
    const cash = byPlayer || !H ? Math.round(def.cash * mult + extra) : Math.round(def.cash * 0.5);
    this.addCash(cash);
    this.stats.kills++;
    if (def.boss) this.stats.bossKills++;
    this.focus = Math.min(1, this.focus + (H && H.head ? 0.12 : 0.04));
    this.director.killsThisWave++;
    this.emit({ type: 'kill', zombie: z, cash, bonuses, head: !!(H && H.head), dist: H ? H.dist : 0, by: H ? H.by : null, boss: !!def.boss });
    // a bloater bursts
    if (z.kind === 'bloater') {
      const p = z.person.rd.segments.abdomen.body.pos.clone();
      this.explode(p, { radius: def.burst.radius, power: def.burst.power, kind: 'bloater', by: 'bloater' });
    }
  }

  addCash(n) {
    this.cash += n;
    this.stats.cashEarned += Math.max(0, n);
  }

  waveCleared(n) {
    const bonus = BONUS.waveClear(n);
    this.addCash(bonus);
    this.emit({ type: 'waveCleared', n, bonus, kills: this.director.killsThisWave });
  }

  // -------------------------------------------------------------------------------------------
  damageGate(amount, perGate) {
    if (this.over) return;
    this.gate.hp = Math.max(0, this.gate.hp - amount);
    this.gateHitT = (this.gateHitT || 0) - amount;
    if (this.gateHitT <= 0) {
      this.gateHitT = 25;
      this.emit({ type: 'gateHit', hp: this.gate.hp, max: this.gate.max, perGate });
    }
    if (this.gate.hp <= 0) this.gameOver('gate');
  }

  damagePlayer(amount, z) {
    if (this.over) return;
    this.player.hp = Math.max(0, this.player.hp - amount);
    this.playerHitT = (this.playerHitT || 0) - amount;
    if (this.playerHitT <= 0) {
      this.playerHitT = 6;
      this.emit({ type: 'playerHurt', hp: this.player.hp, zombie: z });
    }
    if (this.player.hp <= 0) this.gameOver('player');
  }

  gameOver(reason) {
    if (this.over) return;
    this.over = { reason, wave: this.director.wave, stats: { ...this.stats } };
    this.director.phase = 'over';
    this.emit({ type: 'over', reason, wave: this.director.wave, stats: this.over.stats });
  }

  // -------------------------------------------------------------------------------------------
  /** Wake every animated zombie a straight line would pass through (hitscan weapons). */
  wakeAlong(origin, dir, maxDist) {
    const people = this.sb.people;
    for (const p of people) {
      const z = p.towerZombie;
      if (!z || !z.animated) continue;
      const c = p.rd.pelvis.pos;
      const t = (c.x - origin.x) * dir.x + (c.y - origin.y) * dir.y + (c.z - origin.z) * dir.z;
      if (t < 0 || t > maxDist) continue;
      const ex = origin.x + dir.x * t - c.x, ey = origin.y + dir.y * t - c.y, ez = origin.z + dir.z * t - c.z;
      if (ex * ex + ey * ey + ez * ez < 1.3 * 1.3) this.horde.wake(z, { cause: 'shot' });
    }
  }

  /**
   * A blast: everything within `radius` is thrown (animated zombies go physical), hurt with the
   * falloff, legs broken near the middle; barrels in range go up next step.
   */
  explode(pos, opts = {}) {
    const R = opts.radius ?? 4, power = opts.power ?? 1;
    for (const z of this.horde.list) {
      if (z.state === 'frozen' || z.state === 'gone') continue;
      const rd = z.person.rd;
      const c = rd.pelvis.pos;
      const d = Math.hypot(c.x - pos.x, c.y - pos.y, c.z - pos.z);
      if (d > R) continue;
      const f = Math.pow(1 - d / R, 1.4);
      if (z.animated) this.horde.wake(z, { mode: 'falling', cause: 'blast' });
      const inj = z.person.injury;
      for (const b of rd.allBodies()) {
        const dx = b.pos.x - pos.x, dy = b.pos.y - pos.y + 0.6, dz = b.pos.z - pos.z;
        const l = Math.hypot(dx, dy, dz) || 1;
        const dv = power * 11 * f * (0.75 + 0.5 * this.rng()) * (z.def.boss ? 0.35 : 1);
        b.vel.x += (dx / l) * dv;
        b.vel.y += (dy / l) * dv + 1.5 * f * power;
        b.vel.z += (dz / l) * dv;
        b.angVel.x += (this.rng() - 0.5) * 12 * f;
        b.angVel.z += (this.rng() - 0.5) * 12 * f;
      }
      if (inj.alive) {
        const dmg = 950 * power * f * f * (z.def.boss ? 0.4 : 1);
        inj.hp -= dmg;
        if (f > 0.5 && !z.def.boss) {
          const s = this.rng() < 0.5 ? 'L' : 'R';
          const seg = rd.segments[(this.rng() < 0.5 ? 'shin' : 'thigh') + s];
          if (!seg.fractured) inj.queueBreak(seg, 0.35 + this.rng() * 0.3, true);
        }
        if (inj.hp <= 0) inj.kill('blast');
        if (!z.lastHit || this.time - z.lastHit.time > 0.5 || !z.lastHit.head) z.lastHit = { by: opts.by || 'blast', time: this.time, blast: opts.kind, dist: 0 };
      }
    }
    // barrels nearby go up a moment later (a chain reaction)
    for (const b of this.defences.barrels) {
      if (b.pos.distanceTo(pos) < R * 0.85) {
        this.pendingBlasts = this.pendingBlasts || [];
        if (!this.pendingBlasts.some((x) => x.barrel === b)) this.pendingBlasts.push({ barrel: b, by: opts.by });
      }
    }
    this.emit({ type: 'explosion', pos: pos.clone(), radius: R, power, kind: opts.kind || 'blast', fire: !!opts.fire });
  }

  // -------------------------------------------------------------------------------------------
  // weather and time of day
  setTimeOfDay(t) {
    this.timeOfDayTarget = t;
  }

  rollWind(n) {
    const speed = n < 4 ? 0 : Math.min(7, 1 + this.rng() * (n * 0.45));
    const a = this.rng() * Math.PI * 2;
    this.windTarget.set(Math.cos(a) * speed, 0, Math.sin(a) * speed);
  }

  // -------------------------------------------------------------------------------------------
  // the shop
  /** Buy something. Returns { ok, place? } (place: the defence must now be put somewhere). */
  buy(cat, id) {
    const fail = (msg) => ({ ok: false, msg });
    if (cat === 'rifle') {
      const r = RIFLES[id];
      if (this.owned.rifles.has(id)) return this.equip('rifle', id);
      if (this.cash < r.price) return fail('Not enough cash');
      this.cash -= r.price;
      this.owned.rifles.add(id);
      this.equip('rifle', id);
      return { ok: true };
    }
    if (cat === 'ammo') {
      const a = AMMO[id];
      if (this.cash < a.price) return fail('Not enough cash');
      this.cash -= a.price;
      this.owned.ammo[id] = (this.owned.ammo[id] || 0) + a.pack;
      return { ok: true };
    }
    if (cat === 'upgrade') {
      const U = UPGRADES[id], lv = this.upgradeLevel(id);
      if (lv >= U.levels.length) return fail('Maxed out');
      const price = U.levels[lv].price;
      if (this.cash < price) return fail('Not enough cash');
      this.cash -= price;
      this.owned.upgrades[id] = lv + 1;
      if (id === 'magazine') this.rifle.ammo = this.rifle.mag;
      return { ok: true };
    }
    if (cat === 'defence') {
      const D = DEFENCES[id];
      if (D.once && this.owned.defences[id]) return fail('Already done');
      if (id === 'repair' && this.gate.hp >= this.gate.max) return fail('The gate is whole');
      if (id === 'sentry' && this.defences.sentry) {
        if (this.cash < D.refill) return fail('Not enough cash');
        this.cash -= D.refill;
        this.defences.addSentry(D.ammo);
        return { ok: true };
      }
      if (this.cash < D.price) return fail('Not enough cash');
      this.cash -= D.price;
      if (id === 'repair') {
        this.gate.hp = Math.min(this.gate.max, this.gate.hp + this.gate.max * D.amount);
        this.emit({ type: 'gateRepaired', hp: this.gate.hp, max: this.gate.max });
        return { ok: true };
      }
      if (id === 'steelGate') {
        this.owned.defences.steelGate = 1;
        this.gate.max = Math.round(GATE.hp * D.maxHp);
        this.gate.hp = this.gate.max;
        this.emit({ type: 'gateRepaired', hp: this.gate.hp, max: this.gate.max, steel: true });
        return { ok: true };
      }
      if (id === 'sentry') {
        this.defences.addSentry(D.ammo);
        return { ok: true };
      }
      this.owned.defences[id] = (this.owned.defences[id] || 0) + 1;
      return { ok: true, place: D.place };
    }
    return fail('Unknown item');
  }

  equip(cat, id) {
    if (cat === 'rifle') {
      if (!this.owned.rifles.has(id)) return { ok: false, msg: 'Not owned' };
      this.equipped.rifle = id;
      this.rifle.equip(id);
      this.emit({ type: 'equip', rifle: id });
      return { ok: true };
    }
    if (cat === 'ammo') {
      if (id !== 'fmj' && !(this.owned.ammo[id] > 0)) return { ok: false, msg: 'None left' };
      this.equipped.ammo = id;
      this.emit({ type: 'ammo', ammo: id });
      return { ok: true };
    }
    return { ok: false };
  }

  /** Cycle the loaded ammunition type (T). */
  cycleAmmo() {
    const order = ['fmj', 'hp', 'ap', 'ex'].filter((a) => a === 'fmj' || this.owned.ammo[a] > 0);
    const i = order.indexOf(this.equipped.ammo);
    return this.equip('ammo', order[(i + 1) % order.length]);
  }

  /**
   * Put a bought defence down: kind 'wire' (centre + yaw), 'mine', 'barrel' (nearest free spot),
   * 'floodlight' (nearest mount). Returns { ok, msg }.
   */
  placeTrap(kind, point, yaw = 0) {
    const have = this.owned.defences[kind] || 0;
    if (have <= 0) return { ok: false, msg: 'None to place' };
    const D = this.defences, L = this.layout;
    if (kind === 'wire' || kind === 'mine') {
      if (!D.inTrapZone(point.x, point.z)) return { ok: false, msg: 'Not here: out of the trap zone' };
      if (kind === 'wire') {
        const h = DEFENCES.wire.length / 2, dx = Math.cos(yaw) * h, dz = -Math.sin(yaw) * h;
        D.addWire(new Vec3(point.x - dx, 0, point.z - dz), new Vec3(point.x + dx, 0, point.z + dz));
      } else D.addMine(new Vec3(point.x, 0, point.z));
    } else if (kind === 'barrel') {
      let best = -1, bd = 8;
      L.barrelSpots.forEach((s, i) => {
        const d = Math.hypot(s[0] - point.x, s[1] - point.z);
        if (d < bd && !D.barrels.some((b) => b.spot === i)) {
          bd = d;
          best = i;
        }
      });
      if (best < 0) return { ok: false, msg: 'Put it on a marked barrel spot' };
      D.addBarrel(best);
    } else if (kind === 'floodlight') {
      let best = null, bd = 18;
      for (const m of L.floodlightMounts) {
        const d = Math.hypot(m.pos[0] - point.x, m.pos[2] - point.z);
        if (d < bd && !D.floodlights.has(m.id)) {
          bd = d;
          best = m.id;
        }
      }
      if (!best) return { ok: false, msg: 'Point at a floodlight mast' };
      D.addFloodlight(best);
    } else return { ok: false, msg: 'Unknown defence' };
    this.owned.defences[kind] = have - 1;
    return { ok: true };
  }

  nextWave() {
    if (this.director.phase !== 'shop' && this.director.phase !== 'title') return false;
    this.director.startWave();
    return true;
  }
}

export { ENEMIES, WAVES };
