// The simulation: a deterministic fixed-step world (no DOM). Presentation
// layers read state and drain `events` after each step.

import { SIM_DT, SUBSTEPS, BASE_GRAVITY, sanitizeSettings } from '../config.js';
import { RNG, mixSeed } from '../core/rng.js';
import { PointGrid } from '../core/spatial.js';
import { clamp } from '../core/math.js';
import { collideParticles, collideStatic } from '../physics/particles.js';
import { generateLevel } from '../world/generator.js';
import { buildNav } from '../world/nav.js';
import { Props, WEAPONS } from '../world/props.js';
import { Hazards } from '../world/hazards.js';
import { Fighter } from '../fighter/fighter.js';
import { HEAD, NECK, PELVIS, KNEE_A, KNEE_B, FOOT_A, FOOT_B, NJ } from '../fighter/skeleton.js';
import { HeroBrain } from '../ai/heroBrain.js';
import { TokenManager } from '../ai/enemyBrain.js';
import { Director } from '../ai/director.js';
import { makeHeroSpec } from '../ai/roster.js';
import { processAttacks, processBodyImpacts, processTrips } from '../combat/combat.js';

const CORE = [HEAD, NECK, PELVIS, KNEE_A, KNEE_B];
export const ENV_CAUSES = new Set(['electric', 'fell', 'window', 'explosion', 'steam', 'wall', 'object']);
const LEGS = [PELVIS, KNEE_A, FOOT_A, KNEE_B, FOOT_B];
const near = [];
const byX = (a, b) => a.x - b.x;
const MAX_PART_R = 20; // largest ragdoll particle (a big brute's head)

export class Simulation {
  constructor(settings, seed, number = 1) {
    this.settings = sanitizeSettings(settings);
    this.seed = seed >>> 0;
    this.number = number;
    this.rng = new RNG(mixSeed(this.seed, 0xc0ffee));
    this.time = 0;
    this.steps = 0;
    this.dt = SIM_DT;
    this.sub = SUBSTEPS;
    this.h = SIM_DT / SUBSTEPS;
    this.gravity = BASE_GRAVITY * this.settings.gravity;
    this.level = generateLevel(this.seed, this.settings);
    this.nav = this.level.nav;
    this.level.onBreak = (s, p, speed) => this.breakSolid(s, p.x, p.y, speed);
    this.fighters = [];
    this.enemies = [];
    this.hero = null;
    this.enemiesAlive = 0;
    // particle grids: simulated body particles, and animated legs (which only
    // shove props). Points sit in one cell; queries add MAX_PART_R.
    const B = this.level.bounds;
    this.fighterHash = new PointGrid(96, 30);
    this.fighterHash.setBounds(B.left - 300, B.top - 900, B.right + 300, this.level.killY + 50);
    this.bodyHash = new PointGrid(96, 40);
    this.bodyHash.setBounds(B.left - 300, B.top - 900, B.right + 300, this.level.killY + 50);
    this.partHash = new PointGrid(24);
    this.partHash.setBounds(B.left - 300, B.top - 900, B.right + 300, this.level.killY + 50);
    this.kinHash = new PointGrid(32);
    this.kinHash.setBounds(B.left - 300, B.top - 900, B.right + 300, this.level.killY + 50);
    this.events = [];
    this.pairT = new Map();
    this.tripT = new Map();
    this.chains = new Map();
    this.chainSeq = 1;
    this.names = new Map();
    this.nextId = 1;
    this.hitstopFrames = 0;
    this.windNow = 0;
    this.over = null;
    this.overT = 0;
    // corpses: the newest stay physical (piles, trips); older ones are baked
    // into frozen scenery that costs nothing; the oldest finally fade away
    const low = this.settings.quality === 'low';
    this.physCorpseCap = low ? 32 : 60;
    this.corpseCap = low ? 110 : 240;
    this.corpseList = [];
    this.stats = {
      defeated: 0, spawned: 0, hits: 0, taken: 0, blocks: 0, dodges: 0, parries: 0, throws: 0,
      envKOs: 0, friendlyKOs: 0, bestChain: 0, bestCombo: 0, maxEngaged: 0, damageTaken: 0,
      byCause: {},
    };
    this.props = new Props(this);
    this.props.spawnFromLevel(this.level);
    this.hazards = new Hazards(this);
    this.director = new Director(this);
    this.tokens = new TokenManager(this);
    this.spawnHero();
  }

  // ---------------------------------------------------------------- setup
  spawnHero() {
    const L = this.level;
    const main = this.nav.surfaces[this.nav.main];
    let x = (main.x0 + main.x1) / 2;
    let y = main.y;
    // a calm spot away from spawn points, hazards and holes
    let best = -1e9;
    for (let i = 0; i < 40; i++) {
      const S = this.rng.pick(this.nav.surfaces.filter((s) => s.type !== 'stairs' && !s.isolated && s.x1 - s.x0 > 300));
      const cx = this.rng.range(S.x0 + 120, S.x1 - 120);
      let score = 0;
      for (const p of L.spawnPoints) score -= 200 / (60 + Math.abs(p.x - cx) + Math.abs(p.y - S.y));
      for (const hz of L.hazards) if (Math.abs(hz.x - cx) < 150 && Math.abs(hz.y - S.y) < 20) score -= 2;
      for (const lg of L.ledges) if (Math.abs(lg.y - S.y) < 10 && cx > lg.x0 - 150 && cx < lg.x1 + 150) score -= 2;
      score -= Math.abs(cx - L.width / 2) / 3000;
      if (S.id === this.nav.main) score += 0.3;
      if (score > best) {
        best = score;
        x = cx;
        y = S.y;
      }
    }
    const spec = makeHeroSpec(this.settings);
    const f = new Fighter(this, { ...spec, x, y, facing: this.rng.sign() });
    f.brain = new HeroBrain(f, this);
    f.grounded = true;
    this.hero = f;
    this.fighters.push(f);
  }

  addFighter(f) {
    this.fighters.push(f);
    if (!f.isHero) {
      this.enemies.push(f);
      this.stats.spawned++;
    }
  }

  uniqueName(base) {
    const n = (this.names.get(base) || 0) + 1;
    this.names.set(base, n);
    return n === 1 ? base : `${base} ${n}`;
  }

  emit(e) {
    e.time = this.time;
    this.events.push(e);
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  newChain(by) {
    const id = this.chainSeq++;
    this.chains.set(id, { id, by, count: 0, t: this.time, victims: [] });
    return id;
  }

  onChain(knock, victim, via) {
    const c = this.chains.get(knock.chainId);
    if (!c) return;
    c.count++;
    c.victims.push(victim);
    if (c.count > this.stats.bestChain && c.by && c.by.isHero) this.stats.bestChain = c.count;
    this.emit({ t: 'chain', count: c.count, by: c.by, victim, via, x: victim.x, y: victim.y - 40 });
  }

  hitstop(frames) {
    this.hitstopFrames = Math.max(this.hitstopFrames, frames);
  }

  // ------------------------------------------------------------- the step
  step() {
    if (this.hitstopFrames > 0) {
      this.hitstopFrames--;
      return false;
    }
    const dt = this.dt;
    const h = this.h;
    this.time += dt;
    this.steps++;
    if (this.over) this.overT += dt;
    const L = this.level;
    if (L.wind) {
      const gust = Math.max(0, Math.sin(this.time * 0.37) * Math.sin(this.time * 1.13 + 1.7));
      this.windNow = L.wind * (0.45 + 1.4 * gust);
    }
    const fighters = this.fighters;
    for (let i = 0; i < fighters.length; i++) fighters[i].rag.saveOld();
    for (const b of this.props.boxes) for (const q of b.p) {
      q.ox = q.x;
      q.oy = q.y;
    }
    for (const s of this.props.sticks) for (const q of s.p) {
      q.ox = q.x;
      q.oy = q.y;
    }
    for (const pr of this.props.projectiles) {
      pr.p.ox = pr.p.x;
      pr.p.oy = pr.p.y;
    }

    this.director.update(dt);
    this.tokens.update();
    this.rebuildFighterHash();

    // AI
    for (let i = 0; i < fighters.length; i++) {
      const f = fighters[i];
      if (f.brain && !f.removed && !f.frozen) f.brain.update(dt);
    }
    // character logic + controllers
    for (let i = 0; i < fighters.length; i++) fighters[i].updateLogic(dt);
    this.separate();
    for (let i = 0; i < fighters.length; i++) fighters[i].updateBody(dt);

    // physics
    for (let i = 0; i < fighters.length; i++) fighters[i].drivePhysics();
    this.rebuildPartHash();
    const g = this.gravity;
    const mu = 0.55 * L.friction;
    for (let s = 0; s < this.sub; s++) {
      for (let i = 0; i < fighters.length; i++) {
        const f = fighters[i];
        if (f.kinematic || f.removed || f.rag.sleeping) continue;
        const far = Math.abs(f.x - this.hero.x) > 1500;
        if (far && s > 0 && f.ragdolled) continue; // distant bodies: one substep is plenty
        f.rag.step(far && f.ragdolled ? h * 2 : h, g, L, f.muscle > 0 ? f.jt : null, f.muscle, mu, 0.22, far ? 2 : 4);
        if (f.state === 'grabbed') this.applyPins(f);
        if (this.windNow && f.ragdolled) for (const p of f.rag.p) p.addVel(this.windNow * h * 0.5, 0, h);
      }
      this.props.substep(h, g);
      this.collideBodies();
    }
    this.postPhysics(dt);

    // interactions
    this.rebuildFighterHash();
    processAttacks(this);
    processBodyImpacts(this);
    processTrips(this);
    this.hazards.update(dt);
    this.props.postStep(dt);
    this.cleanup(dt);
    this.checkEnd();
    return true;
  }

  applyPins(f) {
    const k = 0.62;
    if (f.pinNeck) {
      const p = f.rag.p[NECK];
      p.x += (f.pinNeck[0] - p.x) * k;
      p.y += (f.pinNeck[1] - p.y) * k;
    }
    if (f.pinPelvis) {
      const p = f.rag.p[PELVIS];
      p.x += (f.pinPelvis[0] - p.x) * k;
      p.y += (f.pinPelvis[1] - p.y) * k;
    }
  }

  rebuildFighterHash() {
    const fh = this.fighterHash;
    const bh = this.bodyHash;
    fh.clear();
    bh.clear();
    let alive = 0;
    for (const f of this.fighters) {
      if (f.removed || f.baked) continue;
      if (f.ragdolled && (f.state === 'ko' || f.state === 'down')) {
        bh.insert(f, f.rag.p[PELVIS].x, f.y - 10);
        if (f.state === 'ko' && f.rag.sleeping) continue;
      }
      const cx = f.ragdolled ? f.rag.p[PELVIS].x : f.x;
      const cy = f.ragdolled ? f.rag.p[PELVIS].y : f.y - 45;
      fh.insert(f, cx, cy);
      if (!f.isHero && !f.dead) alive++;
    }
    this.enemiesAlive = alive;
  }

  rebuildPartHash() {
    const ph = this.partHash;
    const kh = this.kinHash;
    ph.clear();
    kh.clear();
    const hx = this.hero.x;
    for (const f of this.fighters) {
      if (f.removed || f.baked) continue;
      const kin = f.kinematic;
      if (kin && Math.abs(f.x - hx) > 1400) continue;
      const list = kin ? LEGS : CORE;
      const hash = kin ? kh : ph;
      for (let i = 0; i < list.length; i++) {
        const p = f.rag.p[list[i]];
        p.owner = f;
        p.kin = kin;
        hash.insert(p, p.x, p.y);
      }
    }
  }

  // Ragdoll vs ragdoll: bodies pile up instead of overlapping.
  collideBodies() {
    const P = this.partHash;
    for (const f of this.fighters) {
      if (f.kinematic || f.removed || f.rag.sleeping) continue;
      const rp = f.rag.p;
      for (let i = 0; i < CORE.length; i++) {
        const p = rp[CORE[i]];
        const reach = p.r + MAX_PART_R;
        P.query(p.x, p.y, reach + 4, near);
        for (let k = 0; k < near.length; k++) {
          const q = near[k];
          const o = q.owner;
          if (o === f || o.removed) continue;
          const ddx = q.x - p.x;
          const ddy = q.y - p.y;
          const rr = p.r + q.r;
          if (ddx * ddx + ddy * ddy >= rr * rr) continue;
          if (o.rag.sleeping) {
            // resting on a sleeping body: it is static ground unless hit hard
            const rv = Math.abs(p.x - p.px) + Math.abs(p.y - p.py);
            if (rv > 2.5 && Math.abs(p.x - q.x) + Math.abs(p.y - q.y) < p.r + q.r) {
              o.rag.sleeping = false;
              o.rag.sleepT = 0;
              collideParticles(p, q, 0.05);
            } else collideStatic(p, q);
            continue;
          }
          if (o.id < f.id) continue;
          const hit = collideParticles(p, q, 0.05);
          if (hit && !o.rag.sleeping && f.rag.settle > 0.3 && o.rag.settle > 0.3) {
            // two slow bodies grinding against each other: bleed energy
            p.px += (p.x - p.px) * 0.4;
            p.py += (p.y - p.py) * 0.4;
            q.px += (q.x - q.px) * 0.4;
            q.py += (q.y - q.py) * 0.4;
          }

        }
      }
    }
  }

  postPhysics(dt) {
    const h = this.h;
    for (const f of this.fighters) {
      if (f.removed || f.kinematic) continue;
      const rag = f.rag;
      if (rag.hasNaN()) {
        // recover from a numerical blow-up rather than poisoning the world
        rag.setFromJoints(f.jt);
        for (const p of rag.p) if (!Number.isFinite(p.x)) p.setPos(f.x, f.y - 40);
        continue;
      }
      const imp = rag.maxImpact;
      rag.maxImpact = 0;
      if (imp > 300 && f.ragdolled && (!f._thudT || this.time - f._thudT > 0.22)) {
        f._thudT = this.time;
        this.emit({ t: 'thud', x: rag.p[PELVIS].x, y: rag.p[PELVIS].y, power: Math.min(1.6, imp / 900), body: true, f });
        if (imp > 760 && !f.dead) {
          const by = f.knock ? f.knock.by : f.thrownBy || null;
          const k = f.isHero ? 0.6 : 1;
          f.damage((imp - 760) * 0.034 * k, by, f.knock && f.knock.kind === 'throw' ? 'throw' : 'slam');
        }
      }
      if (rag.p[PELVIS].y > this.level.killY) {
        this.outOfBounds(f);
        continue;
      }
      // slow bodies get extra damping so piles settle instead of jostling
      const core = rag.coreSpeed(h);
      rag.coreAvg += (core - rag.coreAvg) * 0.2;
      rag.settle = f.ragdolled ? clamp((90 - core) / 70, 0, 1) : 0;
      // sleep settled bodies. The smoothed speed ignores the contact jitter of
      // a pile; long-dead bodies are put to rest more and more firmly.
      if (f.dead && f.ragdolled && f.state !== 'zap') {
        const age = this.time - f.koTime;
        const lim = age > 5 ? 70 : 32;
        if (rag.coreAvg < lim) {
          rag.sleepT += dt * (age > 5 ? 2 : 1);
        } else if (rag.coreAvg > lim * 1.7 || core > 320) rag.sleepT = 0;
        if (rag.sleepT > 0.45 || (age > 12 && core < 160)) {
          rag.sleeping = true;
          rag.coreAvg = 0;
          for (const p of rag.p) {
            p.px = p.x;
            p.py = p.y;
          }
        }
      }
    }
  }

  // Crowd separation between standing fighters (sort and sweep along x).
  separate() {
    const list = this.sepList || (this.sepList = []);
    list.length = 0;
    for (const f of this.fighters) {
      if (f.removed || f.ragdolled || f.state === 'grabbed' || f.passT > 0 || f.state === 'held' || f.state === 'holding') continue;
      list.push(f);
    }
    list.sort(byX);
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const g = list[j];
        if (g.x - f.x > 40) break;
        if (Math.abs(g.y - f.y) > 34) continue;
        const minSep = (f.w + g.w) * 0.5 * 0.86;
        const dx = g.x - f.x;
        const ad = Math.abs(dx);
        if (ad >= minSep) continue;
        const dir = dx !== 0 ? Math.sign(dx) : f.id % 2 ? 1 : -1;
        const push = (minSep - ad) * 0.5;
        let kf = g.mass / (f.mass + g.mass);
        let kg = 1 - kf;
        // a planted hero is hard to shove
        if (f.isHero && f.state !== 'ground') kf *= 0.6;
        if (g.isHero && g.state !== 'ground') kg *= 0.6;
        f.x -= dir * push * kf;
        g.x += dir * push * kg;
      }
    }
  }

  cleanup(dt) {
    let phys = 0;
    let all = 0;
    for (let i = 0; i < this.fighters.length; i++) {
      const f = this.fighters[i];
      if (!f.dead || f.isHero || f.removed || f.fading) continue;
      all++;
      if (!f.baked) phys++;
    }
    if (phys > this.physCorpseCap || all > this.corpseCap) {
      const list = this.corpseList;
      list.length = 0;
      for (const f of this.fighters) if (f.dead && !f.isHero && !f.removed && !f.fading) list.push(f);
      list.sort((a, b) => a.koTime - b.koTime);
      let bake = phys - this.physCorpseCap;
      let fade = all - this.corpseCap;
      for (const f of list) {
        if (fade > 0) {
          f.fading = 1;
          fade--;
          if (!f.baked) bake--;
          continue;
        }
        if (bake <= 0) break;
        if (!f.baked && f.state === 'ko' && f.rag.sleeping) {
          f.baked = true;
          bake--;
        }
      }
    }
    for (let i = this.fighters.length - 1; i >= 0; i--) {
      const f = this.fighters[i];
      if (f.fading) {
        f.fading -= dt * 0.8;
        if (f.fading <= 0) f.removed = true;
      }
      if (f.removed && !f.isHero) {
        this.fighters.splice(i, 1);
        const j = this.enemies.indexOf(f);
        if (j >= 0) this.enemies.splice(j, 1);
      }
    }
    for (const [id, c] of this.chains) if (this.time - c.t > 4) this.chains.delete(id);
    if (this.hero.brain) this.stats.maxEngaged = Math.max(this.stats.maxEngaged, this.hero.brain.engaged);
  }

  checkEnd() {
    if (this.over) return;
    const S = this.settings;
    const hero = this.hero;
    if (hero.dead) {
      this.over = { victory: false, time: this.time, cause: hero.koCause, by: hero.koBy ? hero.koBy.name : null };
      this.emit({ t: 'heroDefeated', x: hero.pelvisX, y: hero.pelvisY, cause: hero.koCause, by: hero.koBy });
      return;
    }
    if (S.totalEnemies > 0 && this.director.spawned >= S.totalEnemies && this.enemiesAlive === 0 && this.director.queue.length === 0) {
      this.over = { victory: true, time: this.time, reason: 'cleared' };
      this.emit({ t: 'victory', reason: 'cleared' });
      return;
    }
    if (S.timeLimit > 0 && this.time >= S.timeLimit) {
      this.over = { victory: true, time: this.time, reason: 'survived' };
      this.emit({ t: 'victory', reason: 'survived' });
    }
  }

  // ------------------------------------------------------------- callbacks
  onKO(f, by, cause) {
    if (f.isHero) return;
    const st = this.stats;
    st.defeated++;
    const env = ENV_CAUSES.has(cause);
    if (env) st.envKOs++;
    st.byCause[cause] = (st.byCause[cause] || 0) + 1;
    if (by && !by.isHero) st.friendlyKOs++;
    if (this.tokens) this.tokens.release(f);
    this.emit({ t: 'ko', f, by, cause, knock: f.knock, x: f.pelvisX, y: f.pelvisY });
    // nearby enemies lose some nerve
    this.fighterHash.query(f.x, f.y - 40, 500, near);
    for (const o of near) {
      if (o.isHero || o.dead || !o.brain || !o.brain.onWitnessKO) continue;
      o.brain.onWitnessKO(Math.abs(o.x - f.x));
    }
  }

  outOfBounds(f) {
    if (f.removed) return;
    const cause = f.windowT && this.time - f.windowT < 3 ? 'window' : 'fell';
    if (!f.dead) {
      f.hp = 0;
      f.dead = true;
      f.koCause = cause;
      f.koTime = this.time;
      const by = f.knock ? f.knock.by : null;
      f.koBy = by;
      if (f.isHero) {
        this.emit({ t: 'feed', text: 'Onyx falls out of the arena', level: 3 });
      } else this.onKO(f, by, cause);
    }
    if (!f.isHero) f.removed = true;
    else f.setState('ko');
  }

  breakSolid(s, x, y, speed) {
    if (s.broken) return;
    this.level.breakSolid(s);
    // a smashed skylight is a hole in the floor: re-plan the walkways so
    // everyone jumps it instead of strolling into it
    if (s.kind === 'skylight') this.nav = buildNav(this.level);
    this.emit({ t: 'break', material: 'glass', x, y, power: Math.min(1.6, speed / 600), solid: s });
    if (s.kind === 'skylight') this.level.ledges.push({ x0: s.x, x1: s.x + s.w, y: s.y, floor: 0, skylight: true });
    // whoever smashed through gets tagged for "thrown through the window"
    this.fighterHash.query(x, y, 80, near);
    for (const f of near) f.windowT = this.time;
  }

  moveEvent(f, ev) {
    if (ev === 'pickup') this.props.pickup(f);
    else if (ev === 'throwWeapon') this.props.throwHeldWeapon(f, f.moveTarget);
    else if (ev === 'throwObject') this.props.throwObject(f, this.hero);
  }

  explode(x, y, power, by) {
    const R = 240 * power;
    let victims = 0;
    const h = this.h;
    this.emit({ t: 'explosion', x, y, power, R, by });
    for (const f of this.fighters) {
      if (f.removed) continue;
      const cx = f.ragdolled ? f.rag.p[PELVIS].x : f.x;
      const cy = f.ragdolled ? f.rag.p[PELVIS].y : f.y - 45;
      const d = Math.hypot(cx - x, cy - y);
      if (d > R) continue;
      f.baked = false; // blasted scenery comes back to life
      const k = 1 - d / R;
      const nx = (cx - x) / (d || 1);
      const ny = (cy - y) / (d || 1) - 0.55;
      const v = 950 * k * power * this.settings.physicsIntensity;
      if (!f.dead) {
        victims++;
        f.knock = { by, chainId: this.newChain(by), depth: 1, time: this.time, kind: 'explosion' };
        if (!f.ragdolled) f.knockdown(nx * v, ny * v, { spin: (this.rng.sign() * 8 * k) });
        else f.rag.addVel(nx * v, ny * v, h);
        f.damage(58 * k * power * (f.isHero ? 0.8 : 1), by, 'explosion');
      } else {
        f.rag.addVel(nx * v, ny * v, h);
      }
      f.flash = 1;
    }
    this.props.blast(x, y, R, power, by);
    for (const w of this.level.windows) {
      if (w.broken) continue;
      const d = Math.hypot(w.x + w.w / 2 - x, w.y + w.h / 2 - y);
      if (d < R * 0.9) this.breakSolid(w, w.x + w.w / 2, w.y + w.h / 2, 900);
    }
    this.emit({ t: 'spectacle', score: 10 + victims * 2, x, y, kind: 'explosion', victims });
  }

  makeWeapon(kind) {
    return this.props.makeWeapon(kind);
  }

  // ------------------------------------------------------------ queries
  heroState() {
    const f = this.hero;
    return {
      hp: f.hp,
      maxHp: f.maxHp,
      injury: f.injury,
      stamina: f.stamina,
      maxStamina: f.maxStamina(),
      fatigue: f.fatigue,
      weapon: f.weapon ? WEAPONS[f.weapon.kind].label : null,
      mind: f.brain ? f.brain.mind : '',
      engaged: f.brain ? f.brain.engaged : 0,
      state: f.state,
    };
  }
}

export function clampSeed(s) {
  return clamp(s >>> 0, 0, 0xffffffff);
}
