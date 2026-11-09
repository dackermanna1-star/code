// Game orchestration: level lifecycle, fixed-step simulation, player state, explosions,
// gore spawning, checkpoints, collectibles and win/lose flow.

import { PHYS } from './config.js';
import { Physics } from './physics/physics.js';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { Camera } from './core/camera.js';
import { Particles } from './core/particles.js';
import { Store } from './core/store.js';
import { Level } from './level/level.js';
import { createObject } from './objects/index.js';
import { Debris, chunkVerts } from './objects/debris.js';
import { Renderer } from './render/renderer.js';
import { DEATH_TEXT } from './characters/ragdoll.js';
import { clamp, rand, pick, wrapAngle } from './core/math.js';

const NO_INPUT = { isDown: () => false, gamePressed: () => false };
const MAX_DEBRIS = 140;
const MAX_CORPSES = 2;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input();
    this.audio = new AudioEngine();
    this.camera = new Camera();
    this.particles = new Particles(this);
    this.store = new Store();
    this.settings = this.store.settings;
    this.audio.volume = this.settings.volume;
    this.audio.muted = this.settings.muted;
    this.renderer = new Renderer(this);
    this.listeners = {};
    this.phys = null;
    this.level = null;
    this.levelDef = null;
    this.CharClass = null;
    this.entities = [];
    this.player = null;
    this.corpses = [];
    this.state = 'idle';
    this.time = 0;
    this.levelTime = 0;
    this.acc = 0;
    this.timeScale = 1;
    this.slowmoT = 0;
    this.flash = 0;
    this.hurtFlash = 0;
    this.killY = -100;
    this.attract = false;
    this.autopilot = null;
    this.checkpoint = null;
    this.teeth = [];
    this.lastHp = 100;
  }

  // ------------------------------------------------------------ events

  on(evt, fn) {
    (this.listeners[evt] ||= []).push(fn);
  }

  emit(evt, data) {
    for (const fn of this.listeners[evt] || []) fn(data);
  }

  // ------------------------------------------------------------ lifecycle

  start(levelDef, CharClass, opts = {}) {
    this.levelDef = levelDef;
    this.CharClass = CharClass;
    this.attract = !!opts.attract;
    this.startCheckpoint = opts.checkpoint || 0; // 0 = level start, n = n-th checkpoint
    // in the menu background keep the rider in the lower-left, clear of the buttons
    this.camera.offsetX = this.attract ? 5.5 : 0;
    this.camera.offsetY = this.attract ? 1.0 : 0;
    this.build();
  }

  build() {
    this.audio.stopAllLoops();
    this.particles.clear();
    this.phys = new Physics();
    this.phys.postSolveHook = (c, imp) => this.impactSound(c, imp);
    this.entities = [];
    this.corpses = [];
    this.player = null;
    this.level = new Level(this, this.levelDef);
    this.level.createPhysics(this.phys);
    this.killY = this.level.killY;
    for (const o of this.level.data.objects) {
      const e = createObject(this, o);
      if (e) {
        e.levelDef = o;
        this.entities.push(e);
      }
    }
    this.teeth = new Array(this.level.data.teeth).fill(false);
    const prevTeeth = this.store.level(this.levelDef.id).teeth || [];
    for (const e of this.entities) if (e.isTooth && prevTeeth[e.index]) e.previously = true;
    this.checkpoint = null;
    this.levelTime = 0;
    this.timeScale = 1;
    this.slowmoT = 0;
    this.acc = 0;
    this.state = 'playing';
    const s = this.level.data.start;
    const cps = this.checkpointEntities();
    const startCp = this.startCheckpoint > 0 ? cps[Math.min(this.startCheckpoint, cps.length) - 1] : null;
    this.practice = !!startCp; // runs started mid-level don't set best times
    if (startCp) {
      // starting at a checkpoint: it (and every earlier one) counts as reached
      for (const cp of cps) if (cp.x <= startCp.x) cp.active = true;
      this.checkpoint = { x: startCp.x, y: startCp.y };
      this.spawnPlayer(startCp.x + 1.2, startCp.y + 0.2);
    } else {
      this.spawnPlayer(s.x, s.y);
    }
    const f = this.player.focus();
    this.camera.snap(f.x, f.y);
    this.emit('levelstart', { level: this.levelDef, character: this.CharClass });
  }

  spawnPlayer(x, y) {
    const gy = this.phys.groundY(x, y + 6, y - 20);
    const ch = new this.CharClass(this, x, gy + 0.03);
    this.player = ch;
    this.lastHp = 100;
    return ch;
  }

  restart() {
    this.build();
  }

  respawn() {
    if (!this.levelDef) return;
    if (!this.checkpoint) {
      this.restart();
      return;
    }
    const old = this.player;
    if (old) {
      old.stopAudio();
      if (old.alive) old.destroy();
      else {
        this.corpses.push(old);
        while (this.corpses.length > MAX_CORPSES) this.corpses.shift().destroy();
      }
    }
    const cp = this.checkpoint;
    // a corpse lying on the spawn point would overlap (and kill) the new rider
    this.corpses = this.corpses.filter((c) => {
      const near = c.allBodies().some((b) => {
        const p = b.getPosition();
        return Math.abs(p.x - (cp.x + 1.2)) < 3.5 && Math.abs(p.y - cp.y) < 4;
      });
      if (near) c.destroy();
      return !near;
    });
    this.resetAhead(cp.x - 3);
    this.spawnPlayer(cp.x + 1.2, cp.y + 0.2);
    this.state = 'playing';
    this.timeScale = 1;
    this.emit('respawn', {});
  }

  /** Level checkpoints in course order. */
  checkpointEntities() {
    return this.entities.filter((e) => e.levelDef && e.levelDef.type === 'checkpoint').sort((a, b) => a.x - b.x);
  }

  /**
   * Rebuild every level object from x0 onwards (broken bridges, smashed crates, used
   * mines, fallen rocks...) so a checkpoint respawn faces the course as designed.
   * Gold teeth stay collected; checkpoints, signs and the finish are left alone.
   */
  resetAhead(x0) {
    const fixed = (d) => d.type === 'checkpoint' || d.type === 'sign' || d.type === 'finish';
    const ahead = (d) => Math.max(d.x ?? -Infinity, d.x2 ?? -Infinity) >= x0 && !fixed(d);
    const keep = [];
    for (const e of this.entities) {
      if (e.dead) continue;
      const d = e.levelDef;
      if (d) {
        if (ahead(d)) e.remove(); // rebuilt below from the level data
        else keep.push(e);
        continue;
      }
      // spawned stuff (debris, harpoons, cannonballs) ahead of the checkpoint is cleared
      const b = e.body && !e.body._gone ? e.body.getPosition() : null;
      if (b && b.x >= x0) e.remove();
      else keep.push(e);
    }
    // rebuild from the level definition, so objects that already destroyed themselves
    // (smashed crates, shattered glass, exploded mines/barrels, fallen boards) return too
    const prevTeeth = this.store.level(this.levelDef.id).teeth || [];
    for (const d of this.level.data.objects) {
      if (!ahead(d)) continue;
      const ne = createObject(this, d);
      if (!ne) continue;
      ne.levelDef = d;
      if (ne.isTooth) {
        if (this.teeth[ne.index]) ne.taken = true;
        if (prevTeeth[ne.index]) ne.previously = true;
      }
      keep.push(ne);
    }
    this.entities = keep;
    // bodies left ahead of the checkpoint go too (one lying on a rebuilt mine would set it off)
    this.corpses = this.corpses.filter((c) => {
      const f = c.focus();
      if (f.x >= x0) {
        c.destroy();
        return false;
      }
      return true;
    });
  }

  quit() {
    this.audio.stopAllLoops();
    this.state = 'idle';
    this.phys = null;
    this.player = null;
    this.entities = [];
    this.corpses = [];
    this.level = null;
  }

  addEntity(e) {
    this.entities.push(e);
    return e;
  }

  // ------------------------------------------------------------ frame & step

  frame(dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const input = this.input;
    if (this.autopilot && this.player) this.autopilot.update(this, dt);

    if (this.state !== 'idle' && !this.attract) {
      if (input.pressed('pause')) this.togglePause();
      if (input.pressed('mute')) this.setMuted(!this.settings.muted);
      if (this.state !== 'paused') {
        if (input.pressed('restart')) this.restart();
        else if (input.pressed('respawn') && (this.state === 'dead' || this.checkpoint)) this.respawn();
      }
    }

    if (this.phys && this.state !== 'paused' && this.state !== 'idle') {
      if (this.slowmoT > 0) {
        this.slowmoT -= dt;
        if (this.slowmoT <= 0) this.timeScale = 1;
      }
      this.acc += dt * this.timeScale;
      let steps = 0;
      while (this.acc >= PHYS.dt && steps < PHYS.maxStepsPerFrame) {
        this.fixedStep(PHYS.dt);
        this.acc -= PHYS.dt;
        steps++;
      }
      if (steps >= PHYS.maxStepsPerFrame) this.acc = 0;
      if (this.state === 'playing') this.levelTime += dt * this.timeScale;
      this.particles.update(dt * this.timeScale);
      for (const e of this.entities) if (!e.dead) e.update(dt * this.timeScale);
      if (this.entities.some((e) => e.dead)) this.entities = this.entities.filter((e) => !e.dead);
      this.updateCamera(dt);
      this.updateAudio();
      this.flash = Math.max(0, this.flash - dt * 3);
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
      if (this.player) {
        const hp = this.player.rider.hp;
        if (hp < this.lastHp - 3) this.hurtFlash = Math.min(0.6, this.hurtFlash + (this.lastHp - hp) / 60);
        this.lastHp = hp;
      }
    } else if (this.phys) {
      this.updateCamera(0);
    }
    input.endFrame();
  }

  fixedStep(dt) {
    const input = this.attract || this.state !== 'playing' ? (this.autopilot ? this.input : NO_INPUT) : this.input;
    const playerInput = this.state === 'playing' || this.attract ? input : NO_INPUT;
    if (this.player) this.player.preStep(dt, playerInput);
    for (const c of this.corpses) c.preStep(dt, NO_INPUT);
    for (const e of this.entities) if (!e.dead) e.preStep(dt);
    this.phys.step(dt);
    if (this.player) this.player.postStep(dt);
    for (const c of this.corpses) c.postStep(dt);
    for (const e of this.entities) if (!e.dead) e.postStep(dt);
    this.phys.flush();
  }

  updateCamera(dt) {
    const p = this.player;
    if (!p) return;
    const f = p.focus();
    this.camera.resize(this.canvas.width, this.canvas.height);
    if (dt > 0) this.camera.follow(f.x, f.y, f.vx, f.vy, dt, this.settings.shake !== false);
    else this.camera.follow(f.x, f.y, 0, 0, 0.0001, false);
    this.audio.setListener(this.camera.x, this.camera.y);
  }

  updateAudio() {
    if (!this.audio.ok) return;
    if (this.player) this.player.updateAudio();
    for (const c of this.corpses) c.updateAudio();
    const wind = this.audio.loop('wind', 'wind');
    if (wind && this.player) {
      const f = this.player.focus();
      wind.set({ speed: Math.hypot(f.vx, f.vy) });
    }
    // nearest saw
    let best = 0;
    const cx = this.camera.x;
    const cy = this.camera.y;
    for (const e of this.entities) {
      if (!e.isSaw || e.dead) continue;
      const p = e.body.getPosition();
      const d = Math.hypot(p.x - cx, p.y - cy);
      best = Math.max(best, clamp(1 - d / 22, 0, 1));
    }
    const saw = this.audio.loop('saw', 'saw');
    if (saw) saw.set({ gain: best * best });
  }

  togglePause() {
    if (this.state === 'paused') {
      this.state = this.prevState || 'playing';
      this.emit('resume', {});
    } else if (this.state === 'playing' || this.state === 'dead') {
      this.prevState = this.state;
      this.state = 'paused';
      this.emit('pause', {});
    }
  }

  setMuted(m) {
    this.settings.muted = m;
    this.audio.setMuted(m);
    this.store.save();
    this.emit('settings', this.settings);
  }

  slowmo(scale, seconds) {
    this.timeScale = scale;
    this.slowmoT = seconds;
  }

  // ------------------------------------------------------------ gameplay events

  onPlayerDeath(ch, cause) {
    if (ch !== this.player) return;
    if (this.state !== 'playing') return;
    this.state = 'dead';
    const texts = DEATH_TEXT[cause] || DEATH_TEXT.default;
    if (!this.attract) {
      this.slowmo(0.35, 0.8);
      setTimeout(() => this.audio.sadTrombone(), 900);
    }
    this.emit('death', { cause, text: pick(texts), hasCheckpoint: !!this.checkpoint });
    if (this.attract) setTimeout(() => this.state === 'dead' && this.attract && this.restart(), 2600);
  }

  onDismount(ch) {
    if (ch === this.player && !this.attract) this.emit('toast', { text: ch.ejected ? 'EJECT!' : 'BAILED!', kind: 'warn' });
  }

  onGore(kind) {
    if (this.attract) return;
    if (kind === 'decap') this.emit('toast', { text: pick(['DECAPITATION!', 'HEADLESS!', 'OFF WITH IT!']), kind: 'gore' });
  }

  reachCheckpoint(cp) {
    this.checkpoint = { x: cp.x, y: cp.y };
    this.audio.checkpoint();
    this.particles.confetti(cp.x, cp.y + 3, 30);
    this.emit('toast', { text: 'CHECKPOINT', kind: 'good' });
  }

  collectTooth(t) {
    this.teeth[t.index] = true;
    this.audio.coin();
    this.particles.sparks(t.x, t.y, 16, 4, 0, Math.PI * 2, '#ffe680');
    this.particles.ring(t.x, t.y, '#ffd23f', 1.2);
    this.emit('teeth', { teeth: this.teeth });
    this.emit('toast', { text: 'GOLD TOOTH!', kind: 'good' });
  }

  finishLevel() {
    if (this.state !== 'playing') return;
    this.state = 'finished';
    this.slowmo(0.3, 1.6);
    const p = this.player.focus();
    this.particles.confetti(p.x, p.y + 2, 120);
    this.audio.fanfare();
    if (this.attract) {
      setTimeout(() => this.attract && this.restart(), 2500);
      return;
    }
    const time = this.levelTime;
    const res = this.store.recordFinish(this.levelDef.id, this.practice ? null : time, this.teeth);
    const r = this.player.rider;
    this.emit('finish', {
      practice: this.practice,
      time,
      best: res.best,
      newBest: res.newBest,
      teeth: this.teeth,
      limbsLost: r.stats.limbsLost,
      hp: r.hp,
      impales: r.stats.impales,
    });
  }

  // ------------------------------------------------------------ effects

  explode(x, y, { radius = 5, power = 1 } = {}) {
    const hits = this.phys.blast(x, y, radius, power);
    for (const h of hits) {
      const u = h.body.getUserData();
      if (!u) continue;
      if (u.kind === 'part') {
        const rag = u.ragdoll;
        const part = u.part;
        const f = h.f * power;
        this.phys.defer(() => {
          if (part.gone) return;
          if (f > 0.82 && (part.kind !== 'chest' || Math.random() < 0.5)) rag.gib(part, 'explosion');
          else if (f > 0.5 && part.attached && part.kind !== 'hips' && Math.random() < f * 0.8) rag.sever(part, 'explosion');
          if (rag.alive) {
            rag.damage(55 * f, 'explosion');
            rag.scream(1);
          }
        });
      } else if (u.onExplosion) {
        u.onExplosion(h.f, h.nx, h.ny);
      }
    }
    this.particles.explosion(x, y, 0.8 + power * 0.4);
    this.particles.decals.push({ x, y: y - 0.2, a: Math.PI / 2, r: radius * 0.35, color: 'rgba(20,16,14,0.55)', seed: 0.2 });
    this.audio.explosion(x, y, power);
    const f = this.player ? this.player.focus() : { x, y };
    const d = Math.hypot(f.x - x, f.y - y);
    this.camera.shake(clamp(0.9 - d / 30, 0.1, 0.9) * power);
    if (d < 25) this.flash = Math.max(this.flash, 0.5 * (1 - d / 25));
  }

  spawnDebris(o) {
    const n = this.entities.reduce((a, e) => a + (e.kind === 'debris' ? 1 : 0), 0);
    if (n >= MAX_DEBRIS) {
      const first = this.entities.find((e) => e.kind === 'debris' && !e.dead);
      if (first) first.remove();
    }
    return this.addEntity(new Debris(this, o));
  }

  spawnGibs(x, y, vx, vy, part, look) {
    const meat = ['#9c0f1c', '#b3122a', '#7a0a14'];
    const kind = part.kind;
    const cloth =
      kind === 'head' ? [look.skin, look.skin] : kind === 'chest' ? [look.shirt, look.shirt] : kind === 'hips' || kind === 'thigh' || kind === 'shin' ? [look.pants] : [look.sleeve || look.shirt, look.skin];
    const n = kind === 'head' ? 6 : kind === 'chest' ? 8 : kind === 'hips' ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const isMeat = i % 2 === 1;
      this.spawnDebris({
        x: x + rand(-0.1, 0.1),
        y: y + rand(-0.1, 0.1),
        vx: vx + rand(-6, 6),
        vy: vy + rand(1, 8),
        verts: chunkVerts(rand(0.05, kind === 'chest' ? 0.12 : 0.085)),
        color: isMeat ? pick(meat) : pick(cloth),
        av: rand(-20, 20),
        bleed: 1.5,
        density: 6,
        life: 18,
      });
    }
    if (kind === 'head') {
      this.spawnDebris({ x, y, vx: vx + rand(-4, 4), vy: vy + rand(3, 8), r: 0.045, color: '#ffffff', eye: true, av: rand(-30, 30), life: 18, density: 6 });
      for (let i = 0; i < 2; i++) this.spawnDebris({ x, y, vx: vx + rand(-5, 5), vy: vy + rand(3, 7), w: 0.035, h: 0.05, color: '#fffbe8', life: 14, density: 6 });
    }
    if (kind !== 'head') {
      this.spawnDebris({ x, y, vx: vx + rand(-5, 5), vy: vy + rand(2, 7), w: kind === 'chest' ? 0.22 : 0.18, h: 0.035, color: '#efe6d2', av: rand(-25, 25), life: 18, density: 6 });
    }
  }

  impactSound(contact, impulse) {
    const n = contact.getManifold().pointCount;
    let s = 0;
    for (let i = 0; i < n; i++) s += impulse.normalImpulses[i];
    if (s < 2) return;
    const fa = contact.getFixtureA();
    const fb = contact.getFixtureB();
    const ba = fa.getBody();
    const bb = fb.getBody();
    const ua = ba.getUserData();
    const ub = bb.getUserData();
    if ((ua && ua.kind === 'part') || (ub && ub.kind === 'part')) return;
    let body = null;
    let ud = null;
    let m = Infinity;
    if (ba.isDynamic() && ba.getMass() < m) {
      body = ba;
      ud = ua;
      m = ba.getMass();
    }
    if (bb.isDynamic() && bb.getMass() < m) {
      body = bb;
      ud = ub;
      m = bb.getMass();
    }
    if (!body) return;
    const dv = s / m;
    if (dv < 3) return;
    const mat = (ud && ud.material) || 'ground';
    const p = body.getPosition();
    const strength = clamp((dv - 3) / 12, 0, 1);
    this.audio.impact(strength, mat === 'rubber' ? 'ground' : mat, p.x, p.y);
    if (ud && ud.kind === 'vehicle' && dv > 6) {
      const other = body === ba ? bb : ba;
      if (other.isStatic()) this.particles.dust(p.x, p.y - 0.2, 0, 0.5, Math.round(2 + strength * 6));
      if (dv > 9 && ud.character === this.player) this.camera.shake(0.12 * strength);
    }
  }

  render() {
    this.renderer.render();
  }

  /** Run the simulation without rendering (used by automated tests). */
  simulate(seconds, onFrame) {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) {
      if (onFrame && onFrame(this, i / 60) === false) break;
      this.frame(1 / 60);
    }
  }
}
