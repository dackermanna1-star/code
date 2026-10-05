// Game orchestration: run lifecycle, floors, time control (hitstop / slow motion), interaction,
// abilities, meta progression and the main loop.
import * as THREE from 'three';
import { Renderer } from '../render/renderer.js';
import { Input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { RNG, randomSeedString } from '../core/rng.js';
import { sharedAssets } from '../render/materials.js';
import { themeForFloor } from '../render/themes.js';
import { FX } from '../render/fx.js';
import { FlameSystem } from '../render/batching.js';
import { PhysicsWorld, RigidBody } from '../physics/bodies.js';
import { generateDungeon } from '../world/dungeon-gen.js';
import { Level } from './level.js';
import { Player } from '../entities/player.js';
import { Projectile } from '../entities/projectiles.js';
import { LootManager } from './loot.js';
import { UI } from '../ui/ui.js';
import { RELICS, BOONS, CLASSES } from '../items/data.js';
import { explode, chainLightning, playerHitsEnemy } from './combat.js';
import { makeBomb } from '../world/prop-meshes.js';
import { raySphere, rand, clamp } from '../core/math.js';
import { TILE } from '../world/constants.js';

const SETTINGS_KEY = 'delve.settings.v1';
const META_KEY = 'delve.meta.v1';
const _v = new THREE.Vector3();

export class Game {
  constructor() {
    this.renderer = new Renderer(document.getElementById('app'));
    this.input = new Input(this.renderer.renderer.domElement);
    this.audio = audio;
    this.assets = sharedAssets(this.renderer.envMap);
    this.fx = new FX(this.renderer, this.assets);
    this.flames = new FlameSystem(this.renderer.scene, this.assets.tex.glow);
    this.settings = this._load(SETTINGS_KEY, { master: 0.8, sfx: 0.9, music: 0.5, sens: 1, fov: 78, shake: 1, gore: 1, quality: 'high', invertY: false, brightness: 1.15 });
    this.meta = this._load(META_KEY, { runs: 0, bestFloor: 0, totalKills: 0, bossKills: 0, secrets: 0, wins: 0, bestTime: 0, lastClass: 'wanderer' });
    this.applySettings();
    this.persistent = [...this.renderer.scene.children];
    this.state = 'menu';
    this.time = 0;
    this.realTime = 0;
    this.timeScale = 1;
    this.hitstopT = 0;
    this.slowT = 0;
    this.slowScale = 1;
    this.scheduled = [];
    this.post = { damage: 0, flash: 0 };
    this.floor = 1;
    this.finalFloor = 5;
    this.level = null;
    this.player = null;
    this.godMode = false;
    this.pendingLevelUps = 0;
    this.focus = null;
    this.multiKill = { n: 0, t: 0 };
    this.ui = new UI(this);
    this.input.onLockChange = (locked, failed) => this._onLock(locked, failed);
    this.input.sensitivity = this.settings.sens;
    this._last = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
    this.ui.showMenu();
    window.__game = this;
    // Debug entry: ?autostart&floor=3&seed=ABC&class=brute&god
    const q = new URLSearchParams(location.search);
    if (q.has('autostart')) {
      setTimeout(() => {
        this.ui.hideOverlay();
        this.startRun(q.get('class') || 'wanderer', q.get('seed') || 'DEBUG');
        const fl = Number(q.get('floor') || 1);
        if (fl > 1) this.loadFloor(fl);
        if (q.has('god')) this.godMode = true;
      }, 50);
    }
  }

  _load(key, def) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null');
      return v ? { ...def, ...v } : { ...def };
    } catch {
      return { ...def };
    }
  }

  _save(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
  }

  saveSettings() {
    this._save(SETTINGS_KEY, this.settings);
    this.applySettings();
  }

  saveMeta() {
    this._save(META_KEY, this.meta);
  }

  applySettings() {
    const s = this.settings;
    audio.volumes.master = s.master;
    audio.volumes.sfx = s.sfx;
    audio.volumes.music = s.music;
    audio.applyVolumes();
    if (this.input) this.input.sensitivity = s.sens;
    this.fx.gore = s.gore;
    this.renderer.setQuality(s.quality);
    this.renderer.renderer.toneMappingExposure = s.brightness ?? 1.15;
    this.renderer.camera.far = s.quality === 'low' ? 38 : 48;
    this.renderer.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ run lifecycle
  startRun(classId = 'wanderer', seed = null) {
    audio.init();
    this.seed = (seed || randomSeedString()).toUpperCase();
    this.rng = new RNG(this.seed);
    this.classId = classId;
    this.endless = false;
    this.transitioning = false;
    this.meta.lastClass = classId;
    this.meta.runs++;
    this.saveMeta();
    this.stats = { kills: 0, elites: 0, damageDealt: 0, damageTaken: 0, gold: 0, goldSpent: 0, itemsFound: 0, chests: 0, secrets: 0, secretsVisited: 0, parries: 0, potions: 0, environmentKills: 0, propsBroken: 0, bosses: 0, maxMulti: 0, startTime: performance.now(), floorsCleared: 0 };
    this.loot = new LootManager(this);
    if (this.level) { this.level.dispose(); this.level = null; }
    const vr = this.renderer.viewRoot;
    while (vr.children.length) vr.remove(vr.children[0]);
    this.player = new Player(this, classId, this.rng.fork('player'));
    this.persistent = this.persistent.filter((o) => o.parent === this.renderer.scene);
    this.floor = 1;
    this.pendingLevelUps = 0;
    this.loadFloor(1);
    this.ui.showHUD();
    this.state = 'playing';
    this.input.requestLock();
    if (this.meta.runs <= 3) {
      const tips = [
        'Left click to attack. Hold it to charge a heavy blow.',
        'Right click blocks. Raise your guard just as a blow lands to PARRY.',
        'Shift dodges through attacks. Red-glowing attacks cannot be blocked.',
        'F kicks: smash doors, break shields, punt foes into spikes and walls.',
        'Strike cracked walls to find secrets. Press Tab to see your build.',
      ];
      tips.forEach((t, i) => this.schedule(3 + i * 7, () => { if (this.state === 'playing') this.ui.toast(t, 'info'); }, true));
    }
  }

  loadFloor(n) {
    this.floor = n;
    const theme = themeForFloor(n);
    if (this.level) this.level.dispose();
    this.loot.clear();
    this.fx.clear();
    this.flames.clear();
    // keep real-time callbacks (e.g. the death screen) across floor loads
    this.scheduled = this.scheduled.filter((s) => s.real);
    this.transitioning = false;
    this.renderer.setTheme(theme);
    const dungeon = generateDungeon(this.seed, n, theme);
    this.physics = new PhysicsWorld(null);
    this.level = new Level(this, dungeon);
    this.physics.world = this.world;
    this.physics.level = this.level;
    this.fx.setWorld(this.world, theme);
    const p = this.player;
    p.orbit.length = 0;
    // face into the room
    const start = dungeon.start;
    const sr = dungeon.rooms[dungeon.startRoom];
    let yaw = 0;
    if (sr.entrances.length) {
      const e = sr.entrances[0];
      yaw = Math.atan2(-((e.ox + 0.5) * TILE - start.x), -((e.oy + 0.5) * TILE - start.z));
    }
    p.spawnAt(start.x, start.z, yaw);
    p.vm.root.visible = true;
    this.ui.floorIntro(theme.name, n);
    this.ui.onFloorLoaded();
    if (this.player.stats.revealSecrets) this.revealSecrets();
    audio.setMusic(true, 0);
    // pre-compile shaders for everything on the floor to avoid hitches on first sight
    try { this.renderer.renderer.compile(this.renderer.scene, this.renderer.camera); } catch { /* optional */ }
  }

  descend() {
    if (this.state !== 'playing' || this.transitioning) return;
    this.transitioning = true;
    this.stats.floorsCleared++;
    audio.stairs();
    if (this.floor >= this.finalFloor && !this.endless) {
      this.transitioning = false;
      this.victory();
      return;
    }
    this.ui.fadeOut(() => {
      if (!this.player || this.player.dead || this.state === 'dying' || this.state === 'dead') {
        this.transitioning = false;
        this.ui.fadeIn();
        return;
      }
      this.loadFloor(this.floor + 1);
      this.meta.bestFloor = Math.max(this.meta.bestFloor, this.floor);
      this.saveMeta();
      this.ui.fadeIn();
    });
  }

  victory() {
    this.state = 'victory';
    this.meta.wins++;
    this.meta.bestFloor = Math.max(this.meta.bestFloor, this.floor);
    this.saveMeta();
    audio.victory();
    this.input.exitLock();
    this.ui.showVictory();
  }

  continueEndless() {
    if (this.transitioning) return;
    this.transitioning = true;
    this.endless = true;
    this.state = 'playing';
    this.ui.showHUD();
    this.ui.fadeOut(() => {
      if (!this.player) { this.transitioning = false; this.ui.fadeIn(); return; }
      this.loadFloor(this.floor + 1);
      this.ui.fadeIn();
      this.input.requestLock();
    });
  }

  quitToMenu() {
    if (this.level) { this.level.dispose(); this.level = null; }
    if (this.loot) this.loot.clear();
    this.fx.clear();
    this.flames.clear();
    this.player = null;
    this.state = 'menu';
    audio.setMusic(false);
    this.input.exitLock();
    this.ui.showMenu();
  }

  // ------------------------------------------------------------ events
  onEnemyKilled(enemy, info) {
    this.loot.enemyDrops(enemy);
    this.meta.totalKills++;
    // multi-kill callouts
    const m = this.multiKill;
    m.n = this.time - m.t < 1.6 ? m.n + 1 : 1;
    m.t = this.time;
    this.stats.maxMulti = Math.max(this.stats.maxMulti, m.n);
    if (m.n >= 2) this.ui.multiKill(m.n);
    // dramatic final blow
    const others = this.level.enemies.some((e) => !e.dead && e !== enemy && e.alerted);
    if (!others && (enemy.alerted || info.source === 'player') && !enemy.boss) this.slowmo(0.3, 0.45);
    if (enemy.boss) this.slowmo(0.2, 1.6);
    if (this.ui.bossTarget === enemy) this.ui.setBoss(null);
  }

  onRoomCleared(room) {
    this.ui.banner('ROOM CLEARED', room.type === 'arena' ? 'A reward awaits' : '', 1.8);
    audio.victory();
    const p = this.player;
    if (p.stats.bombRegen) p.addBombs(p.stats.bombRegen);
    if (room.type === 'miniboss') this.ui.setBoss(null);
  }

  onBossDefeated(boss) {
    this.stats.bosses++;
    this.meta.bossKills++;
    this.saveMeta();
    this.ui.setBoss(null);
    this.ui.banner('GUARDIAN SLAIN', `${boss.def.name} has fallen`, 3.5);
    audio.victory();
    audio.setMusic(true, 0);
  }

  onPlayerHurt(dmg) {
    this.post.damage = Math.min(1, this.post.damage + 0.35 + dmg / 40);
    this.ui.hurt();
  }

  onPlayerDeath() {
    this.state = 'dying';
    this.slowmo(0.25, 1.5);
    this.meta.bestFloor = Math.max(this.meta.bestFloor, this.floor);
    this.meta.secrets += this.stats.secrets;
    this.saveMeta();
    this.schedule(1.1, () => {
      this.state = 'dead';
      this.input.exitLock();
      this.ui.showDeath();
    }, true);
  }

  queueLevelUp() {
    this.pendingLevelUps++;
    audio.levelUp();
    this.fx.levelUp(this.player.pos);
  }

  rollRelicId() {
    const ids = Object.keys(RELICS).filter((k) => !RELICS[k].cursed);
    return ids[Math.floor(Math.random() * ids.length)];
  }

  boonChoices() {
    const pool = [...BOONS];
    const out = [];
    while (out.length < 3 && pool.length) {
      let total = pool.reduce((s, b) => s + b.w, 0);
      let r = Math.random() * total;
      let pick = pool[0];
      for (const b of pool) { r -= b.w; if (r <= 0) { pick = b; break; } }
      out.push(pick);
      pool.splice(pool.indexOf(pick), 1);
    }
    return out;
  }

  chooseBoon(boon) {
    this.player.applyBoon(boon);
    this.pendingLevelUps--;
    audio.ui('click');
    if (this.pendingLevelUps > 0) this.ui.showLevelUp();
    else {
      this.state = 'playing';
      this.ui.hideOverlay();
      this.input.requestLock();
    }
  }

  revealSecrets() {
    for (const sw of this.level.secretWalls) sw.reveal();
    for (const r of this.world.rooms) if (r.type !== 'secret') r.mapHint = true;
  }

  // ------------------------------------------------------------ time control
  hitstop(t) {
    this.hitstopT = Math.max(this.hitstopT, t);
  }

  slowmo(scale, dur) {
    this.slowScale = Math.min(this.slowT > 0 ? this.slowScale : 1, scale);
    this.slowT = Math.max(this.slowT, dur);
  }

  schedule(delay, fn, real = false) {
    this.scheduled.push({ at: (real ? this.realTime : this.time) + delay, fn, real });
  }

  // ------------------------------------------------------------ actions
  throwBomb() {
    const p = this.player;
    const eye = p.eyePos(new THREE.Vector3());
    const f = p.forward(new THREE.Vector3());
    const mesh = makeBomb();
    mesh.scale.setScalar(1.3);
    this.renderer.scene.add(mesh);
    const body = new RigidBody({ type: 'box', hx: 0.14, hy: 0.14, hz: 0.14 }, { mass: 1, mesh, restitution: 0.3, friction: 1.2, collideBodies: false, onImpact: (b) => { audio.thunk(b.pos); b.vel.multiplyScalar(0.7); b.ang.multiplyScalar(0.6); } });
    body.pos.copy(eye).addScaledVector(f, 0.5).add(new THREE.Vector3(0, -0.2, 0));
    body.vel.copy(f).multiplyScalar(13).add(new THREE.Vector3(0, 3.5, 0)).add(new THREE.Vector3(p.vel.x, 0, p.vel.z));
    body.ang.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
    this.physics.add(body);
    audio.swing(0.6, 1.2);
    const light = this.renderer.addDynamic(body.pos.clone(), 0xffaa44, 3, 4, 1);
    let fuse = 1.8;
    const tick = () => {
      if (!this.level || !body.alive) return;
      fuse -= 1 / 30;
      light.pos.copy(body.pos);
      this.fx.spark(body.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), new THREE.Vector3(rand(-1, 1), rand(1, 3), rand(-1, 1)), 0xffcc66, 0.3, 0.06);
      // enemies are blasted on contact with a moving bomb only via explosion
      if (fuse <= 0) {
        body.alive = false;
        mesh.removeFromParent();
        this.renderer.removeDynamic(light);
        explode(this, body.pos.clone(), 3.4, 40 + this.floor * 14, { source: 'player', knock: 16, fire: true });
        return;
      }
      this.schedule(1 / 30, tick);
    };
    this.schedule(1 / 30, tick);
  }

  throwKnives(n) {
    const p = this.player;
    const eye = p.eyePos(new THREE.Vector3());
    for (let i = 0; i < n; i++) {
      const f = p.forward(new THREE.Vector3()).applyAxisAngle(new THREE.Vector3(0, 1, 0), (i - (n - 1) / 2) * 0.14);
      this.level.projectiles.push(new Projectile(this, 'knife', eye.clone().addScaledVector(f, 0.5), f.multiplyScalar(26), Math.round(p.stats.weaponDamage * 0.6 * p.stats.damage), p, 'player'));
    }
    audio.swing(0.5, 1.4);
  }

  spawnWave() {
    const p = this.player;
    const f = p.forward(new THREE.Vector3()).setY(0).normalize();
    const pos = p.eyePos(new THREE.Vector3()).addScaledVector(f, 1).add(new THREE.Vector3(0, -0.5, 0));
    const pr = new Projectile(this, 'wave', pos, f.multiplyScalar(16), Math.round(p.stats.weaponDamage * 0.9 * p.stats.damage), { fxColor: p.vm.fxColor ? p.vm.fxColor.getHex() : 0xbfd6ff }, 'player');
    this.level.projectiles.push(pr);
    audio.cast(pos, 'magic');
  }

  flameCone() {
    const p = this.player;
    const eye = p.eyePos(new THREE.Vector3());
    const f = p.forward(new THREE.Vector3()).setY(0).normalize();
    for (let i = 0; i < 40; i++) {
      const d = f.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rand(-0.4, 0.4)).multiplyScalar(rand(4, 9));
      this.fx.spark(eye.clone().add(new THREE.Vector3(0, -0.5, 0)), d.setY(rand(-0.5, 1)), 0xff8833, rand(0.4, 0.7), rand(0.15, 0.3), { c1: 0xff2200, grav: -1, floor: false });
    }
    audio.fire(eye, true);
    for (const e of this.level.enemies) {
      if (e.dead) continue;
      const to = _v.subVectors(e.pos, p.pos).setY(0);
      const d = to.length();
      if (d > 5 || to.normalize().dot(f) < 0.7) continue;
      e.ignite(this, 8 + this.floor * 3, 4);
      playerHitsEnemy(this, e, { base: p.stats.weaponDamage * 0.6, dir: to.clone(), point: e.chestPos(), knockback: 4, stagger: 20, source: 'player', melee: false, type: 'fire' });
    }
  }

  spawnEnemyProjectile(kind, from, vel, dmg, owner) {
    this.level.projectiles.push(new Projectile(this, kind, from, vel, dmg, owner, 'enemy'));
  }

  castAbility(id) {
    const p = this.player;
    const s = p.stats;
    const eye = p.eyePos(new THREE.Vector3());
    const f = p.forward(new THREE.Vector3());
    const dmg = s.weaponDamage * s.damage;
    switch (id) {
      case 'firebolt':
        this.level.projectiles.push(new Projectile(this, 'firebolt', eye.clone().addScaledVector(f, 0.6), f.clone().multiplyScalar(24), Math.round(dmg * 1.6 + 12 * this.floor), p, 'player'));
        audio.cast(eye, 'fire');
        p.camKick(-0.15, 0, 0);
        break;
      case 'whirlwind': {
        audio.swing(2, 0.8);
        let spins = 0;
        const spin = () => {
          if (!this.level || p.dead) return;
          spins++;
          this.fx.ring(p.pos, 0xd8e4ff, 3.4, 0.25, 0.6);
          audio.swing(1.6, 0.9 + spins * 0.1);
          for (const e of this.level.enemies) {
            if (e.dead || e.pos.distanceTo(p.pos) > s.reach + 0.9) continue;
            const d = _v.subVectors(e.pos, p.pos).setY(0).normalize().clone();
            playerHitsEnemy(this, e, { base: s.weaponDamage * 0.9, dir: d, point: e.chestPos(), knockback: 6, stagger: 30, source: 'player', melee: true, heavy: true, swingDir: new THREE.Vector3(-d.z, 0, d.x) });
          }
          p.addTrauma(0.15);
          if (spins < 3) this.schedule(0.22, spin);
        };
        spin();
        p.iframes = 0.5;
        break;
      }
      case 'groundslam': {
        p.vel.y = 8;
        p.onGround = false;
        audio.jump();
        const check = () => {
          if (!this.level || p.dead) return;
          if (p.onGround && p.vel.y <= 0) {
            explode(this, p.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 4.5, Math.round(dmg * 2 + 15), { hurtsPlayer: false, color: 0xd8c8a8, knock: 14 });
            this.fx.debris(p.pos.clone().setY(0.2), 'stone', 20, 6);
            p.addTrauma(0.5);
            return;
          }
          this.schedule(1 / 60, check);
        };
        this.schedule(0.15, check);
        break;
      }
      case 'frostnova': {
        audio.freeze(p.pos);
        this.fx.ring(p.pos, 0x99eeff, 7, 0.6, 1);
        this.fx.magic(p.chestPos(), 0x99eeff, 60, 8);
        this.renderer.flash(p.chestPos(), 0x99eeff, 30, 14, 0.4);
        for (const e of this.level.enemies) {
          if (e.dead || e.pos.distanceTo(p.pos) > 7) continue;
          for (let i = 0; i < 3; i++) e.chill(this, 3);
          playerHitsEnemy(this, e, { base: dmg * 0.5, dir: _v.subVectors(e.pos, p.pos).setY(0).normalize().clone(), point: e.chestPos(), knockback: 2, stagger: 20, source: 'player', melee: false, type: 'frost' });
        }
        break;
      }
      case 'chainlightning': {
        let best = null, bd = 14;
        for (const e of this.level.enemies) {
          if (e.dead) continue;
          const to = _v.subVectors(e.chestPos(), eye);
          const d = to.length();
          if (d > bd || to.normalize().dot(f) < 0.8) continue;
          if (!this.world.los(eye.x, eye.y, eye.z, e.pos.x, 1.2, e.pos.z)) continue;
          best = e; bd = d;
        }
        if (!best) { this.fx.lightning(eye.clone().addScaledVector(f, 0.5), eye.clone().addScaledVector(f, 6)); audio.zap(eye); break; }
        this.fx.lightning(eye.clone().addScaledVector(f, 0.4).add(new THREE.Vector3(0, -0.3, 0)), best.chestPos());
        playerHitsEnemy(this, best, { base: dmg * 1.4 + 8 * this.floor, dir: f.clone().setY(0).normalize(), point: best.chestPos(), knockback: 3, stagger: 30, source: 'player', melee: false, type: 'shock' });
        chainLightning(this, best, Math.round(dmg + 6 * this.floor), 6);
        break;
      }
      case 'blink': {
        const fl = f.clone().setY(0).normalize();
        const h = this.world.raycast(p.pos.x, 1, p.pos.z, fl.x, 0, fl.z, 7.5);
        const dist = h ? Math.max(0, h.dist - 0.6) : 7.5;
        const from = p.pos.clone();
        this.fx.magic(p.chestPos(), 0xaa66ff, 30, 3);
        p.pos.addScaledVector(fl, dist);
        this.world.collideCircle(p.pos, p.radius);
        p.iframes = 0.4;
        p.fovKick += 15;
        audio.cast(p.pos, 'magic');
        for (const e of this.level.enemies) {
          if (e.dead) continue;
          const t = clamp((e.pos.clone().sub(from)).dot(fl) / Math.max(0.01, dist), 0, 1);
          const closest = from.clone().addScaledVector(fl, dist * t);
          if (closest.distanceTo(e.pos) < 1.5) playerHitsEnemy(this, e, { base: dmg * 1.3, dir: fl.clone(), point: e.chestPos(), knockback: 5, stagger: 40, source: 'player', melee: true, critBonus: 0.3 });
        }
        this.fx.magic(p.chestPos(), 0xaa66ff, 30, 3);
        break;
      }
      default:
    }
  }

  // ------------------------------------------------------------ interaction focus
  _updateFocus() {
    const p = this.player;
    if (!p || p.dead || !this.level) { this.focus = null; return; }
    const eye = p.eyePos(new THREE.Vector3());
    const dir = p.forward(new THREE.Vector3());
    let best = null, bd = 3.0;
    const consider = (target, pos, radius, label) => {
      if (!label) return;
      const t = raySphere(eye, dir, pos, radius);
      const d = pos.distanceTo(eye);
      // allow near-by targets slightly off-centre too
      const score = t >= 0 ? t : d < 1.6 && _v.subVectors(pos, eye).normalize().dot(dir) > 0.75 ? d + 0.5 : -1;
      if (score < 0 || score > bd) return;
      if (!this.world.los(eye.x, eye.y, eye.z, pos.x, pos.y, pos.z)) return;
      bd = score;
      best = { target, label };
    };
    for (const it of this.level.interactables) {
      const label = it.label && it.label();
      if (!label) continue;
      consider(it, it.focusPos ? it.focusPos(eye) : it.center || it.pos, it.radius || 0.9, label);
    }
    for (const it of this.loot.items) {
      const pos = this.loot.itemPos(it);
      consider({ lootItem: it }, pos, 0.75, `Pick up ${it.item.name}`);
    }
    this.focus = best;
  }

  _interact() {
    const f = this.focus;
    if (!f || this.player.interactCd > 0) return;
    this.player.interactCd = 0.25;
    if (f.target.lootItem) this.loot.pickUpItem(f.target.lootItem);
    else if (f.target.interact) f.target.interact(this);
  }

  // ------------------------------------------------------------ input-driven state changes
  _onLock(locked, failed) {
    if (failed) { this.ui.toast('Pointer lock unavailable: move the mouse over the game to look around.', 'info'); return; }
    // leaving pointer lock mid-game (Esc, alt-tab) pauses; menus change state before releasing it
    if (!locked && this.state === 'map') { this.ui.showMap(false); this.state = 'playing'; }
    if (!locked && this.state === 'playing') this.pause();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.showPause();
  }

  resume() {
    this.state = 'playing';
    this.ui.hideOverlay();
    this.input.requestLock();
  }

  openInventory() {
    if (this.state !== 'playing') return;
    this.state = 'inventory';
    this.input.exitLock();
    this.ui.showInventory();
  }

  openMap() {
    if (this.state !== 'playing') return;
    this.state = 'map';
    this.ui.showMap(true);
  }

  // ------------------------------------------------------------ loop
  _loop(now) {
    requestAnimationFrame(this._loop);
    const rawDt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this.realTime += rawDt;
    try {
      this.update(rawDt);
    } catch (err) {
      console.error(err);
    }
    this.input.endFrame();
  }

  update(rawDt) {
    const input = this.input;
    // real-time scheduled
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      const s = this.scheduled[i];
      if (s.real && this.realTime >= s.at) { this.scheduled.splice(i, 1); s.fn(); }
    }

    if (this.state === 'menu' || !this.player) {
      this.renderer.render(rawDt);
      this.ui.update(rawDt);
      return;
    }

    // global hotkeys
    if (this.state === 'playing') {
      if (input.actionPressed('inventory')) this.openInventory();
      else if (input.actionPressed('map')) this.openMap();
      else if (input.actionPressed('interact')) this._interact();
      else if (input.actionPressed('pause')) { this.pause(); input.exitLock(); }
      // level-up choices open on demand (L) or automatically once the fight is over
      const inCombat = this.level && this.level.enemies.some((e) => !e.dead && e.alerted && e.pos.distanceToSquared(this.player.pos) < 18 * 18);
      if (this.pendingLevelUps > 0 && this.player.atk.state === 'idle' && !this.player.dead && (input.pressed.has('KeyL') || !inCombat)) {
        this.state = 'levelup';
        this.input.exitLock();
        this.ui.showLevelUp();
      }
    } else if (this.state === 'inventory') {
      if (input.actionPressed('inventory')) { this.state = 'playing'; this.ui.hideOverlay(); input.requestLock(); }
    } else if (this.state === 'map') {
      if (input.actionPressed('map') || input.actionPressed('inventory')) { this.state = 'playing'; this.ui.showMap(false); }
    } else if (this.state === 'levelup') {
      for (const [k, i] of [['Digit1', 0], ['Digit2', 1], ['Digit3', 2]]) {
        if (input.pressed.has(k)) { this.ui.pickLevelUp(i); input.pressed.clear(); break; }
      }
    }

    const running = this.state === 'playing' || this.state === 'dying' || this.state === 'map';
    // time scale
    if (this.slowT > 0) {
      this.slowT -= rawDt;
      if (this.slowT <= 0) this.slowScale = 1;
    }
    const target = this.slowT > 0 ? this.slowScale : 1;
    this.timeScale += (target - this.timeScale) * Math.min(1, rawDt * 12);
    let dt = running && this.state !== 'map' ? rawDt * this.timeScale : 0;
    if (this.hitstopT > 0) {
      this.hitstopT -= rawDt;
      dt *= 0.03;
    }
    this.time += dt;
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      const s = this.scheduled[i];
      if (!s.real && this.time >= s.at) { this.scheduled.splice(i, 1); s.fn(); }
    }

    if (running) {
      this.player.update(dt, this.state === 'map' ? 0 : rawDt);
      if (dt > 0) {
        this.level.update(dt);
        this.physics.update(dt);
        this.loot.update(dt);
      }
      this._updateFocus();
    }
    this.fx.update(dt, this.renderer.camera);
    if (this.level) this.flames.update(this.time + this.realTime * 0.0, this.renderer.camera.position, this.renderer.renderer.domElement.height);

    // post-processing state
    const post = this.renderer.post;
    this.post.damage = Math.max(0, this.post.damage - rawDt * 1.6);
    this.post.flash = Math.max(0, this.post.flash - rawDt * 3);
    const p = this.player;
    const lowHp = p ? Math.max(0, 1 - p.hp / p.stats.maxHp / 0.35) : 0;
    post.damage.value = this.post.damage;
    post.flash.value = this.post.flash;
    post.lowHealth.value = p && !p.dead ? lowHp : 0;
    post.aberration.value = this.post.damage * 0.8 + (this.timeScale < 0.6 ? 0.3 : 0);
    post.saturation.value = this.timeScale < 0.6 ? 0.75 : 1.08;
    this.renderer.render(rawDt);
    this.ui.update(rawDt);
  }
}

export { CLASSES };
