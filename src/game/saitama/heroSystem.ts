/**
 * One-punch hero mod: while holding the "Hero Gloves" (creative Combat tab) you are Saitama.
 *
 *  - LMB: NORMAL PUNCH. Whatever you hit is obliterated; the shockwave tunnels ~50 blocks
 *    through anything behind it.
 *  - Hold LMB: CONSECUTIVE NORMAL PUNCHES, ~18 a second, each with its own shockwave, chewing a
 *    huge ragged hole in front of you (afterimage fists, speed lines).
 *  - RMB: SERIOUS SERIES: SERIOUS PUNCH. A short wind-up, then a 170-block blast that erases
 *    everything along it and blows the clouds out of the sky.
 *    Aimed at the ground, it breaks the world: a crater spreads to the edge of the loaded map,
 *    flattening everything, with fissures down to the bottom of the world filling with lava.
 *  - Hold RMB: SERIOUS SERIES: CONSECUTIVE SERIOUS PUNCHES.
 *  - You can't be hurt, sprinting is absurdly fast, jumps are huge, Shift+Space is a super leap,
 *    and landing from one leaves a crater.
 *
 * Terrain destruction is progressive (`Carver`) within a per-frame time budget; mobs, vehicles
 * and items caught by a wave are obliterated / flung (ragdolls, gore and debris come from the
 * existing systems).
 */
import * as THREE from 'three';
import type { Game } from '../game';
import type { GameSystem } from '../systems';
import { addItemBehavior } from '../items/registry';
import { BulkEdit, relightStep } from '../disasters/kit';
import { LivingEntity } from '../../entity/living';
import { BLOCKS } from '../../world/blocks/registry';
import { Carver, type CarveJob } from './carve';
import { HERO_ANIM } from './heroItem';
import { AirBlast, ShockRing, HeroHud } from './heroFx';
import { shotRaycast } from '../portal/portalMath';

interface JobInfo {
  job: CarveJob;
  /** cone: origin, direction, length, radii */
  o: THREE.Vector3;
  d: THREE.Vector3;
  len: number;
  r0: number;
  r1: number;
  power: number;
  hit: Set<number>;
}

const rnd = Math.random;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _d = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class HeroSystem implements GameSystem {
  readonly name = 'hero';
  private game!: Game;
  private bulk!: BulkEdit;
  private carver!: Carver;
  private jobs: JobInfo[] = [];
  private fx = new THREE.Scene();
  private blasts: AirBlast[] = [];
  private rings: ShockRing[] = [];
  private delayed: { t: number; fn: () => void }[] = [];
  private hud: HeroHud | null = null;
  private hintShown = false;
  // input state
  private lmbT = -1;
  private rmbT = -1;
  private barrageT = 0;
  private side = 0;
  private seriousFired = false;
  private seriousBarrage = false;
  private chargeSound = false;
  // powers
  private holding = false;
  private leaping = false;
  private prevVy = 0;
  private wasGround = true;
  // per-frame effect budgets
  private debrisBudget = 0;
  private crumbBudget = 0;
  private dustBudget = 0;
  // sky
  private baseCoverage: number | null = null;
  private clearT = 0;
  private planet: JobInfo | null = null;
  private okSaid = true;
  private time = 0;

  init(game: Game) {
    this.game = game;
    addItemBehavior('hero_gloves', { ownsMouse: true });
    this.bulk = new BulkEdit(game);
    this.carver = new Carver({
      get: (x, y, z) => game.world.getBlock(x, y, z),
      set: (x, y, z, s) => {
        const w = game.world;
        if (w.getBlockEntity(x, y, z)) w.setBlockEntity(x, y, z, null);
        return this.bulk.set(x, y, z, s);
      },
      top: (x, z) => {
        const w = game.world;
        if (!w.isLoaded(x, z)) return -1;
        // the heightmap skips foliage: look a little higher for tree canopies
        const h = w.getHeight(x, z);
        for (let y = Math.min(255, h + 40); y > h; y--) if (w.getBlock(x, y, z)) return y;
        return Math.min(255, h + 1);
      },
      destroyed: (x, y, z, st, dir) => this.onDestroyed(x, y, z, st, dir),
    });
    (game.renderExtras.forward ??= []).push(this.fx);
    game.events.on('dimensionChanged', () => this.reset());
  }

  onWorldChange() {
    this.reset();
  }

  private reset() {
    this.carver?.jobs.splice(0);
    this.jobs.length = 0;
    for (const b of this.blasts) b.dispose();
    for (const r of this.rings) r.dispose();
    this.blasts.length = 0;
    this.rings.length = 0;
    this.delayed.length = 0;
    this.planet = null;
  }

  private get effects(): any {
    return (this.game.systems.find((s) => s.name === 'disasters') as any)?.effects ?? null;
  }

  // ------------------------------------------------------------------------------- frame
  update(game: Game, dt: number, _alpha: number) {
    this.time += dt;
    HERO_ANIM.time = this.time;
    HERO_ANIM.jabR += dt;
    HERO_ANIM.jabL += dt;
    HERO_ANIM.serious += dt;
    const p: any = game.player;
    const holding = !!p && !p.dead && !p.vehicle && !p.spectator && p.mainHand?.item.name === 'hero_gloves';
    if (holding !== this.holding) {
      this.holding = holding;
      p.powers.invulnerable = holding;
      p.powers.speed = holding ? 3.4 : 1;
      p.powers.jump = holding ? 1.7 : 1;
      if (holding && !this.hintShown) { this.hintShown = true; this.hudEl()?.showHint(); }
      if (!holding) { this.lmbT = this.rmbT = -1; HERO_ANIM.charge = 0; HERO_ANIM.barrage = 0; }
    }
    if (holding) this.handleInput(game, dt);
    // delayed effects
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      if ((this.delayed[i].t -= dt) <= 0) {
        const f = this.delayed[i].fn;
        this.delayed.splice(i, 1);
        f();
      }
    }
    // destruction
    this.debrisBudget = 14;
    this.crumbBudget = 26;
    this.dustBudget = 10;
    if (this.carver.busy) {
      this.carver.advance(dt);
      this.bulk.begin();
      const heavy = !!this.planet;
      this.carver.work(heavy ? 90000 : 40000, heavy ? 16 : 8);
      this.bulk.end();
      this.hitEntities(game);
    }
    // relight what the punches opened up (no-op when nothing is queued)
    relightStep(game, this.planet ? 3 : 4);
    for (let i = this.jobs.length - 1; i >= 0; i--) if (this.jobs[i].job.done && !this.carver.jobs.includes(this.jobs[i].job)) {
      if (this.jobs[i] === this.planet) this.planetDone();
      this.jobs.splice(i, 1);
    }
    if (this.planet) this.planetFrame(game, dt);
    // visuals
    for (let i = this.blasts.length - 1; i >= 0; i--) if (!this.blasts[i].update(dt)) { this.blasts[i].dispose(); this.blasts.splice(i, 1); }
    for (let i = this.rings.length - 1; i >= 0; i--) if (!this.rings[i].update(dt)) { this.rings[i].dispose(); this.rings.splice(i, 1); }
    this.updateSky(game, dt);
    const running = holding && p.sprinting && Math.hypot(p.vel.x, p.vel.z) > 9;
    const lines = Math.max(HERO_ANIM.barrage, HERO_ANIM.charge * 0.8, running ? 0.35 : 0, this.leaping ? 0.5 : 0);
    this.hudEl()?.update(dt, holding && game.cameraCtl.perspective === 'first' && !game.ui?.hudHidden, lines);
  }

  private hudEl(): HeroHud | null {
    if (!this.hud && this.game.ui?.hud?.el) this.hud = new HeroHud(this.game.ui.hud.el);
    return this.hud;
  }

  private handleInput(game: Game, dt: number) {
    const inp = game.input;
    const active = inp.enabled && !game.paused;
    const lmb = active && inp.isDown('attack');
    const rmb = active && inp.isDown('use');
    // ---- left: normal punch, held → consecutive normal punches
    if (lmb && this.lmbT < 0) {
      this.lmbT = 0;
      this.normalPunch();
    } else if (lmb) {
      this.lmbT += dt;
      if (this.lmbT > 0.22) {
        if (HERO_ANIM.barrage === 0) this.hudEl()?.say('CONSECUTIVE NORMAL PUNCHES', '', 1.6);
        HERO_ANIM.barrage = Math.min(1, HERO_ANIM.barrage + dt * 6);
        HERO_ANIM.seriousBarrage = false;
        this.barrageT -= dt;
        while (this.barrageT <= 0) {
          this.barrageT += 0.055;
          this.barragePunch();
        }
      }
    } else if (this.lmbT >= 0) {
      this.lmbT = -1;
    }
    // ---- right: serious punch (wind-up), held → consecutive serious punches
    if (rmb && this.rmbT < 0) {
      this.rmbT = 0;
      this.seriousFired = false;
      this.seriousBarrage = false;
      this.chargeSound = false;
    }
    if (this.rmbT >= 0) {
      if (rmb) this.rmbT += dt;
      if (!this.seriousFired) {
        HERO_ANIM.charge = Math.min(1, this.rmbT / 0.55);
        if (!this.chargeSound) {
          this.chargeSound = true;
          game.audio?.play?.('hero.charge', { volume: 1 });
          this.hudEl()?.say('SERIOUS SERIES', '', 0.7);
        }
        this.effects?.addShake(0.12 * HERO_ANIM.charge);
        if (HERO_ANIM.charge >= 1 || (!rmb && this.rmbT > 0.12)) {
          this.seriousFired = true;
          HERO_ANIM.charge = 0;
          this.seriousPunch();
        } else if (!rmb) {
          this.rmbT = -1;
          HERO_ANIM.charge = 0;
        }
      } else if (rmb && this.rmbT > 1.25) {
        if (!this.seriousBarrage) {
          this.seriousBarrage = true;
          this.hudEl()?.say('CONSECUTIVE SERIOUS PUNCHES', 'SERIOUS SERIES', 2.2);
        }
        HERO_ANIM.barrage = Math.min(1, HERO_ANIM.barrage + dt * 6);
        HERO_ANIM.seriousBarrage = true;
        this.barrageT -= dt;
        while (this.barrageT <= 0) {
          this.barrageT += 0.17;
          this.seriousBarragePunch();
        }
      }
      if (!rmb) this.rmbT = -1;
    }
    if (!lmb && !(rmb && this.seriousBarrage)) HERO_ANIM.barrage = Math.max(0, HERO_ANIM.barrage - dt * 5);
  }

  // ------------------------------------------------------------------------------- punches
  private aim(): { eye: THREE.Vector3; dir: THREE.Vector3 } {
    const g = this.game;
    const cam = g.cameraCtl.camera;
    const eye = g.cameraCtl.perspective === 'first' ? cam.position.clone() : g.player.eyePos;
    const dir = g.cameraCtl.perspective === 'first' ? new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion) : g.player.lookDir(new THREE.Vector3());
    return { eye, dir: dir.normalize() };
  }

  private jitter(d: THREE.Vector3, a: number) {
    const r = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(2 * a);
    return d.clone().add(r).normalize();
  }

  /** Start a shockwave job + its visuals. */
  private wave(o: THREE.Vector3, d: THREE.Vector3, len: number, r0: number, r1: number, speed: number, power: number, visual: { bright: number; life: number; rings?: number }) {
    const job = this.carver.cone(o, d, len, r0, r1, speed);
    const info: JobInfo = { job, o: o.clone(), d: d.clone(), len, r0, r1, power, hit: new Set() };
    this.jobs.push(info);
    const b = new AirBlast(o.clone().addScaledVector(d, -0.6), d, len, Math.max(0.25, r0 * 0.35), r1, speed, visual.life, visual.bright);
    this.fx.add(b.mesh);
    this.blasts.push(b);
    const nr = visual.rings ?? 1;
    for (let i = 0; i < nr; i++) {
      const dist = 1.2 + i * len * 0.18;
      const delay = dist / speed;
      this.delayed.push({ t: delay, fn: () => {
        const r = new ShockRing(o.clone().addScaledVector(d, dist), d, r0 * (0.4 + i * 0.4), r1 * (0.7 + i * 0.5), 0.35 + i * 0.15);
        this.fx.add(r.mesh);
        this.rings.push(r);
      } });
    }
    return info;
  }

  private normalPunch() {
    const g = this.game;
    const { eye, dir } = this.aim();
    this.side = 0;
    HERO_ANIM.jabR = 0;
    g.player.swing?.();
    this.wave(eye.clone().addScaledVector(dir, 1.0), dir, 50, 1.6, 7.5, 420, 1, { bright: 1.3, life: 0.6, rings: 2 });
    g.audio?.play?.('hero.punch', { volume: 1.2 });
    this.effects?.addShake(0.45);
    this.effects?.flash(0.18);
    this.dustAt(eye.clone().addScaledVector(dir, 2), 3);
    this.hudEl()?.say('NORMAL PUNCH', '', 0.9);
  }

  private barragePunch() {
    const g = this.game;
    const { eye, dir } = this.aim();
    this.side ^= 1;
    if (this.side) HERO_ANIM.jabL = 0; else HERO_ANIM.jabR = 0;
    const d = this.jitter(dir, 0.11);
    this.wave(eye.clone().addScaledVector(d, 1.0), d, 28, 1.0, 3.4, 320, 0.6, { bright: 0.55, life: 0.32, rings: rnd() < 0.3 ? 1 : 0 });
    g.audio?.play?.('hero.jab', { volume: 0.8 });
    this.effects?.addShake(0.2);
    if (rnd() < 0.3) g.player.swing?.();
  }

  private seriousPunch() {
    const g = this.game;
    const { eye, dir } = this.aim();
    HERO_ANIM.serious = 0;
    g.player.swing?.();
    // aimed at the ground: break the world
    if (dir.y < -0.72) {
      const hit = shotRaycast(g.world, eye, dir, 24);
      if (hit) { this.breakWorld(hit.point, dir); return; }
    }
    this.wave(eye.clone().addScaledVector(dir, 1.5), dir, 170, 4, 26, 340, 3, { bright: 1.8, life: 1.5, rings: 4 });
    g.audio?.play?.('hero.serious', { volume: 1.6 });
    this.effects?.addShake(1.6);
    this.effects?.flash(0.65);
    this.clearClouds();
    this.hudEl()?.say('SERIOUS PUNCH', 'SERIOUS SERIES', 2.2);
    g.player.cameraShake.z = 1;
  }

  private seriousBarragePunch() {
    const g = this.game;
    const { eye, dir } = this.aim();
    this.side ^= 1;
    if (this.side) HERO_ANIM.jabL = 0; else HERO_ANIM.jabR = 0;
    const d = this.jitter(dir, 0.28);
    this.wave(eye.clone().addScaledVector(d, 1.4), d, 135, 3, 16, 330, 2, { bright: 1.1, life: 1.0, rings: 2 });
    g.audio?.play?.('hero.punch', { volume: 1.4, pitch: 0.75 });
    this.effects?.addShake(0.9);
    if (rnd() < 0.4) this.effects?.flash(0.25);
    this.clearClouds();
  }

  /** The serious punch into the ground: the world breaks apart to the edge of the loaded map. */
  private breakWorld(pt: THREE.Vector3, dir: THREE.Vector3) {
    const g = this.game;
    const R = Math.max(48, Math.min(260, g.settings.renderDistance * 16 - 6));
    const depth = Math.max(12, Math.min(80, pt.y - 4));
    const sphere = this.carver.sphere(pt, 10);
    this.jobs.push({ job: sphere, o: pt.clone(), d: dir.clone(), len: 10, r0: 10, r1: 10, power: 4, hit: new Set() });
    const job = this.carver.crater(pt, R, depth, 60);
    const info: JobInfo = { job, o: pt.clone(), d: UP.clone(), len: R, r0: R, r1: R, power: 5, hit: new Set() };
    this.jobs.push(info);
    this.planet = info;
    this.okSaid = false;
    g.audio?.play?.('hero.serious', { volume: 2 });
    g.audio?.play?.('hero.quake', { volume: 2 });
    this.effects?.flash(1);
    this.effects?.addShake(3);
    this.clearClouds();
    this.hudEl()?.say('SERIOUS PUNCH', 'SERIOUS SERIES', 3);
    // ground-level blast rings racing out
    for (let i = 0; i < 4; i++) this.delayed.push({ t: i * 0.25, fn: () => {
      const r = new ShockRing(pt.clone().setY(pt.y + 1.5), UP, 4, 60 + i * 50, 1.2 + i * 0.4, new THREE.Color(1, 0.92, 0.8));
      this.fx.add(r.mesh);
      this.rings.push(r);
    } });
    g.particles?.flash?.(pt.x, pt.y + 3, pt.z, 0xfff0d0, 4e4, 1.2, 160);
  }

  private planetFrame(game: Game, dt: number) {
    const job = this.planet!.job;
    const k = job.front;
    this.effects?.addShake(2.4 * (1 - k * 0.7));
    this.effects?.requestTint(0.38, 0.32, 0.26, 0.18 * (1 - k));
    // dust walls along the expanding front
    const c = this.planet!.o;
    const r = k * this.planet!.len;
    for (let i = 0; i < 4; i++) {
      const a = rnd() * Math.PI * 2;
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      const y = Math.max(c.y, game.world.isLoaded(Math.floor(x), Math.floor(z)) ? game.world.getHeight(Math.floor(x), Math.floor(z)) : c.y);
      game.particles?.emit?.('explosion_smoke', [x, y + 2, z], { count: 2, speed: 4 });
    }
    void dt;
  }

  private planetDone() {
    this.planet = null;
    if (!this.okSaid) {
      this.okSaid = true;
      this.hudEl()?.say('OK.', '', 2.5);
    }
  }

  // ------------------------------------------------------------------------------- consequences
  private onDestroyed(x: number, y: number, z: number, st: number, dir: THREE.Vector3) {
    const g = this.game;
    const def = BLOCKS[st >>> 4];
    if (!def) return;
    const solid = def.solid !== false;
    if (solid && this.debrisBudget > 0 && rnd() < 0.08) {
      this.debrisBudget--;
      const ex: any = (g as any).explosions;
      _v.set(x + 0.5, y + 0.5, z + 0.5).addScaledVector(dir, -3);
      ex?.debris?.spawn?.(st, x, y, z, _v.clone(), 22 + rnd() * 14, 1);
    }
    if (this.crumbBudget > 0 && rnd() < 0.12) {
      this.crumbBudget--;
      g.particles?.spawnBlockBreak?.(x, y, z, st);
    }
    if (solid && this.dustBudget > 0 && rnd() < 0.05) {
      this.dustBudget--;
      g.particles?.emit?.('large_smoke', [x + 0.5, y + 0.5, z + 0.5], { count: 1, speed: 2 });
    }
  }

  private dustAt(p: THREE.Vector3, n: number) {
    for (let i = 0; i < n; i++) this.game.particles?.emit?.('poof', [p.x + (rnd() - 0.5), p.y + (rnd() - 0.5), p.z + (rnd() - 0.5)], { count: 1 });
  }

  /** Anything caught by a wave front is obliterated (living) or flung (items). */
  private hitEntities(game: Game) {
    const p: any = game.player;
    for (const info of this.jobs) {
      const j = info.job;
      for (const e of game.entities.list as any[]) {
        if (e === p || e.removed || e.passenger === p || info.hit.has(e.id)) continue;
        if (e.dead) continue;
        _v.set(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z);
        let inside = false;
        if (j.kind === 'cone') {
          const t = _w.copy(_v).sub(info.o).dot(info.d);
          if (t < -1 || t > j.front * info.len) continue;
          const r = info.r0 + (info.r1 - info.r0) * Math.sqrt(Math.max(0, t) / info.len);
          const radial = _w.copy(_v).sub(info.o).addScaledVector(info.d, -t).length();
          inside = radial < r + Math.max(e.width, 1);
          _d.copy(info.d);
        } else {
          const dx = _v.x - info.o.x, dz = _v.z - info.o.z;
          const dist = Math.hypot(dx, dz);
          const reach = j.kind === 'sphere' ? info.r0 + 2 : j.front * info.len;
          inside = dist < reach && _v.y > info.o.y - 90;
          _d.set(dx, Math.max(2, dist * 0.4), dz).normalize();
        }
        if (!inside) continue;
        info.hit.add(e.id);
        this.obliterate(e, _d.clone(), info.power);
      }
    }
  }

  private obliterate(e: any, dir: THREE.Vector3, power: number) {
    const g = this.game;
    const p: any = g.player;
    if (e instanceof LivingEntity || typeof e.hurt === 'function') {
      e.hurt({ type: 'explosion', explosion: true, attacker: p, direct: p, dir, impulse: 60 * power, point: e.pos.clone().setY(e.pos.y + e.height * 0.5), weapon: 'hero_gloves', bypassArmor: true }, e.isVehicle ? 5000 : 1e5);
    }
    if (!e.isVehicle) e.vel.addScaledVector(dir, 25 * power).add(_w.set(0, 6 * power, 0));
    if (e.type === 'item' && power >= 3) e.remove();
  }

  // ------------------------------------------------------------------------------- sky
  private clearClouds() {
    const atmo: any = this.game.renderer.atmosphere;
    if (!atmo || typeof atmo.cloudCoverage !== 'number') return;
    if (this.baseCoverage === null) this.baseCoverage = atmo.cloudCoverage;
    this.clearT = 75;
  }

  private updateSky(game: Game, dt: number) {
    const atmo: any = game.renderer.atmosphere;
    if (!atmo || this.baseCoverage === null) return;
    this.clearT -= dt;
    const target = this.clearT > 0 ? 0.0 : this.baseCoverage;
    const rate = this.clearT > 0 ? 2.5 : 0.04;
    atmo.cloudCoverage += (target - atmo.cloudCoverage) * (1 - Math.exp(-dt * rate));
    if (this.clearT <= 0 && Math.abs(atmo.cloudCoverage - this.baseCoverage) < 0.002) {
      atmo.cloudCoverage = this.baseCoverage;
      this.baseCoverage = null;
    }
  }

  // ------------------------------------------------------------------------------- physics (leap / landing)
  physics(game: Game, _dt: number) {
    const p: any = game.player;
    if (!p || !this.holding) { this.leaping = false; this.wasGround = !!p?.onGround; return; }
    const inp = game.input;
    // super leap: Shift + Space on the ground
    if (p.onGround && inp.enabled && inp.isDown('sneak') && inp.isDown('jump') && !this.leaping) {
      const d = p.lookDir(new THREE.Vector3());
      const h = new THREE.Vector3(d.x, 0, d.z).normalize();
      p.vel.copy(h.multiplyScalar(30)).setY(Math.max(26, d.y * 40 + 18));
      p.airDragScale = 0.05;
      p.onGround = false;
      this.leaping = true;
      game.audio?.play?.('hero.jab', { volume: 1.2, pitch: 0.5 });
      game.particles?.emit?.('dust_ring', [p.pos.x, p.pos.y + 0.1, p.pos.z], { count: 1 });
      this.dustAt(p.pos.clone(), 6);
      this.effects?.addShake(0.3);
    }
    // landing impact
    if (p.onGround && !this.wasGround && this.prevVy < -22) {
      const speed = -this.prevVy;
      const r = Math.min(7, 1.5 + speed / 12);
      const c = p.pos.clone().setY(p.pos.y - 0.6);
      const job = this.carver.sphere(c, r);
      this.jobs.push({ job, o: c, d: UP.clone(), len: r, r0: r + 2, r1: r + 2, power: 1.5, hit: new Set() });
      game.audio?.play?.('hero.land', { volume: Math.min(1.6, speed / 25) });
      game.particles?.emit?.('dust_ring', [p.pos.x, p.pos.y + 0.2, p.pos.z], { count: 1 });
      game.particles?.emit?.('shockwave', [p.pos.x, p.pos.y + 0.2, p.pos.z], { count: 1 });
      this.dustAt(p.pos.clone().setY(p.pos.y + 0.5), 10);
      this.effects?.addShake(Math.min(1.5, speed / 30));
      const ring = new ShockRing(p.pos.clone().setY(p.pos.y + 0.3), UP, 1, 6 + r * 2, 0.45);
      this.fx.add(ring.mesh);
      this.rings.push(ring);
    }
    if (p.onGround) { this.leaping = false; p.airDragScale = 1; }
    this.prevVy = p.vel.y;
    this.wasGround = p.onGround;
  }

  dispose() {
    this.reset();
    this.hud?.dispose();
  }
}
