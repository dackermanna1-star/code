import * as THREE from 'three';
import { Renderer } from './render/renderer';
import { loadSettings, PRESETS, Settings } from './core/settings';
import { Input } from './core/input';
import { CameraRig } from './fx/camera';
import { Arena, HALF_D, HALF_W } from './world/arena';
import { BloodAtlas, SPLAT } from './world/bloodAtlas';
import { CharacterLibrary } from './character/library';
import { Archetype, registerVariants } from './character/variants';
import { registerAllClips } from './anim/lib';
import type { Fighter } from './combat/fighter';
import { Player } from './combat/player';
import { clamp, damp, rand } from './core/math';
import { Physics } from './world/physics';
import { CorpseSystem, CorpseRecord } from './world/corpses';
import { DeathSystem } from './combat/death';
import { FX } from './fx/particles';
import { AudioSys } from './audio/audio';
import { Music } from './audio/music';
import { Combat } from './combat/combat';
import { Director } from './ai/director';
import { WaveManager } from './ai/waves';
import { BossManager } from './ai/bosses';
import { Enemy } from './ai/enemy';
import { Weapon } from './combat/weapons';
import { HUD } from './ui/hud';
import { HitInfo, makeHit } from './combat/types';

export class Game {
  settings: Settings;
  renderer: Renderer;
  scene = new THREE.Scene();
  input: Input;
  cam: CameraRig;
  arena: Arena;
  blood: BloodAtlas;
  lib = new CharacterLibrary();
  archetypes!: Record<Archetype, string[]>;
  player!: Player;
  fighters: Fighter[] = [];
  timeScale = 1;
  private slowmo: { scale: number; t: number; dur: number } | null = null;
  hitstop = 0;
  time = 0;
  realTime = 0;
  paused = false;
  frame = 0;
  private last = performance.now();
  params: URLSearchParams;
  testMode = false;
  physics = new Physics();
  corpses!: CorpseSystem;
  death!: DeathSystem;
  fx!: FX;
  audio = new AudioSys();
  music: Music;
  combat: Combat;
  director: Director;
  waves: WaveManager;
  bosses: BossManager;
  weapons: Weapon[] = [];
  hud: HUD | null = null;
  thrown: { e: Enemy; t: number; dir: THREE.Vector3; hitWall?: boolean }[] = [];
  onCorpse: ((r: CorpseRecord) => void) | null = null;
  started = false;
  over = false;
  debug = false;
  private enemyCache: Enemy[] = [];
  private enemyCacheFrame = -1;

  constructor(container: HTMLElement, params: URLSearchParams) {
    this.params = params;
    this.settings = loadSettings();
    const q = params.get('quality');
    if (q === 'low' || q === 'medium' || q === 'high' || q === 'ultra') this.settings.quality = q;
    this.debug = params.get('debug') === '1';
    this.renderer = new Renderer(container, this.settings);
    const preset = PRESETS[this.settings.quality];
    this.input = new Input(this.renderer.gl.domElement);
    this.blood = new BloodAtlas(preset.bloodAtlas, HALF_W * 2, HALF_D * 2);
    this.blood.renderer = this.renderer.gl;
    this.arena = new Arena(this.blood, preset.pointLights, preset.shadowMap);
    this.scene.add(this.arena.group);
    this.scene.fog = new THREE.FogExp2(0x0b0d12, 0.028);
    this.scene.background = new THREE.Color(0x07080b);
    this.cam = new CameraRig(window.innerWidth / window.innerHeight, this.arena);
    this.renderer.onResize = () => {
      this.cam.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
      this.cam.camera.updateProjectionMatrix();
    };
    this.renderer.onResize();
    registerAllClips();
    this.archetypes = registerVariants(this.lib);
    this.lib.build();
    this.music = new Music(this.audio);
    this.combat = new Combat(this);
    this.director = new Director(this);
    this.waves = new WaveManager(this);
    this.bosses = new BossManager(this);
    // context loss: rebuild persistent blood from the splat log
    this.renderer.gl.domElement.addEventListener('webglcontextrestored', () => {
      this.blood.needsRestore = true;
    });
  }

  async init() {
    await this.physics.init(this.arena);
    this.corpses = new CorpseSystem(this.lib, this.physics, this.blood);
    this.scene.add(this.corpses.group);
    this.death = new DeathSystem(this);
    this.fx = new FX(this, PRESETS[this.settings.quality].maxParticles);
    this.player = new Player(this, this.lib, this.lib.get('player'));
    this.player.spawn(0, 2, Math.PI);
    this.player.hp = this.player.maxHp = 100;
    this.player.model.uniforms.uRim.value.set(0.35, 0.5, 0.8, 0.22);
    this.fighters.push(this.player);
    this.cam.yaw = 0;
    this.applySettings();
    if (!this.params.get('test')) {
      this.hud = new HUD(this);
      this.waves.onWaveStart = (w, def) => {
        this.hud?.bannerShow(def.boss ? def.title ?? 'BOSS' : `WAVE ${w}`, def.boss ? `WAVE ${w}` : def.comp.reduce((a, c) => a + c[1], 0) + ' ENEMIES', 2.6);
        if (def.hint) this.hud?.hint(def.hint, undefined, 9);
        this.audio.play('announcer', { file: def.boss ? 'audio/announcer/announcer_prepare_yourself.wav' : w === 1 ? 'audio/announcer/announcer_fight.wav' : 'audio/announcer/announcer_begin.wav', vol: 0.75 });
      };
      this.waves.onWaveClear = (w) => {
        this.hud?.bannerShow('CLEARED', `WAVE ${w} · ${this.corpses.count} BODIES`, 2.2);
      };
      const onFirstGesture = () => {
        this.audio.resume();
      };
      window.addEventListener('pointerdown', onFirstGesture);
      window.addEventListener('keydown', onFirstGesture);
      window.addEventListener('keydown', (e) => {
        if ((e.code === 'Escape' || e.code === 'KeyP') && this.started && !this.over) this.setPaused(!this.paused);
      });
      this.renderer.gl.domElement.addEventListener('click', () => {
        if (this.started && !this.paused && !this.over) this.input.requestLock();
      });
      this.hud.show('title');
    }
    if (!this.params.get('test') || this.params.get('audio') === '1') await this.audio.init();
  }

  applySettings() {
    const s = this.settings;
    this.renderer.applySettings(s);
    this.cam.shakeScale = s.cameraShake;
    this.cam.sensitivity = s.mouseSensitivity;
    this.cam.invertY = s.invertY;
    this.audio.volumes = { master: s.masterVolume, sfx: s.sfxVolume, music: s.musicVolume };
    this.audio.applyVolumes();
  }

  beginRun() {
    this.hud?.show(null);
    this.started = true;
    this.paused = false;
    this.audio.resume();
    this.audio.startAmbience();
    this.music.start();
    this.input.requestLock();
    this.waves.start(Number(this.params.get('wave') ?? 1));
  }

  setPaused(p: boolean) {
    if (this.over) return;
    this.paused = p;
    if (p) {
      this.input.exitLock();
      this.hud?.show('pause');
      this.audio.ctx?.suspend();
    } else {
      this.hud?.show(null);
      this.input.requestLock();
      this.audio.resume();
    }
  }

  enemies(): Enemy[] {
    if (this.enemyCacheFrame !== this.frame) {
      this.enemyCache = this.fighters.filter((f): f is Enemy => f instanceof Enemy);
      this.enemyCacheFrame = this.frame;
    }
    return this.enemyCache;
  }

  slowMo(scale: number, dur: number) {
    this.slowmo = { scale, t: 0, dur };
  }
  hitStop(sec: number) {
    this.hitstop = Math.max(this.hitstop, sec);
  }

  start() {
    const loop = () => {
      const now = performance.now();
      const realDt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(realDt);
      this.renderFrame();
      this.renderer.trackFrame(realDt * 1000, this.realTime);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  step(realDt: number) {
    this.frame++;
    this.realTime += realDt;
    this.input.update(realDt);
    if (this.paused) return;
    let ts = 1;
    if (this.slowmo) {
      this.slowmo.t += realDt;
      const s = this.slowmo;
      const k = s.t < s.dur * 0.75 ? 1 : 1 - (s.t - s.dur * 0.75) / (s.dur * 0.25);
      ts = 1 + (s.scale - 1) * clamp(k, 0, 1);
      if (s.t >= s.dur) this.slowmo = null;
    }
    this.timeScale = ts;
    let dt = realDt * ts;
    if (this.hitstop > 0) {
      this.hitstop -= realDt;
      dt = 0;
    }
    this.time += dt;
    const playing = this.started || this.testMode;
    if (playing) {
      this.waves.update(dt);
      this.director.update(dt);
      this.bosses.update(dt);
    }
    for (const f of this.fighters) if (f.alive && (playing || f === this.player)) f.think(dt);
    for (const f of this.fighters) if (f.alive) f.move(dt);
    this.separate();
    this.physics.update(dt);
    this.death.update(dt);
    this.updateThrown(dt);
    for (const f of this.fighters) f.animate(dt);
    for (const w of this.weapons) w.update(dt);
    this.arena.update(realDt * ts);
    this.blood.update(dt);
    this.fx.update(dt);
    this.footsteps();
    // camera
    const [lx, ly] = this.input.takeLook();
    let near = 0;
    for (const e of this.enemies()) if (e.alive && e.distTo(this.player) < 7) near++;
    const focus = new THREE.Vector3(this.player.x, 1.0, this.player.z);
    if (!this.started && !this.testMode) {
      this.cam.yaw += realDt * 0.08;
    }
    this.cam.update(dt, realDt, focus, lx, ly, near, Math.hypot(this.player.vx, this.player.vz) > 0.5);
    // audio listener
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.cam.camera.quaternion);
    this.audio.setListener(this.cam.camera.position, right);
    // music intensity
    const active = this.enemies().filter((e) => e.alive && e.state !== 'enter').length;
    this.music.target = clamp((active > 0 ? 0.3 : 0.05) + active * 0.07 + Math.min(0.3, this.player.combo * 0.015) + (this.bosses.active ? 0.3 : 0), 0, 1);
    this.music.update(realDt);
    // post fx decay
    const fx = this.renderer.fx;
    fx.chroma = damp(fx.chroma, 0, 7, realDt);
    fx.flash = damp(fx.flash, 0, 12, realDt);
    const lowHp = 1 - this.player.hp / this.player.maxHp;
    fx.red = damp(fx.red, lowHp > 0.65 ? (lowHp - 0.65) * 0.9 : 0, 3, realDt);
    fx.desat = damp(fx.desat, this.timeScale < 0.6 ? 0.45 : this.over ? 0.8 : 0, 6, realDt);
    this.hud?.update(dt, realDt);
  }

  private footsteps() {
    // footstep sounds & bloody footprints from planted feet (cheap poll on locomotion plants)
    for (const f of this.fighters) {
      if (!f.alive || f.anim.mode !== 'loco') continue;
      const lo = f.anim.loco;
      for (let i = 0; i < 2; i++) {
        const ft = lo.feet[i];
        if (!ft.swing && ft.plantedTime === 0) {
          const sp = Math.hypot(f.vx, f.vz);
          if (sp > 0.6) this.audio.play('footstep', { pos: ft.pos, vol: clamp(sp / 5, 0.25, 1) * (f === this.player ? 0.8 : 0.5) });
          // bloody footprints: stepping in blood coats the sole for a few steps
          const cov = this.blood.coverageAt(ft.pos.x, ft.pos.z);
          const fs = f as Fighter & { bloodSteps?: number };
          if (cov > 0.5) fs.bloodSteps = 8;
          if ((fs.bloodSteps ?? 0) > 0 && cov < 0.5) {
            const dir = new THREE.Vector3(Math.sin(ft.yaw), 0, Math.cos(ft.yaw));
            this.blood.splat(new THREE.Vector3(ft.pos.x, 0.01, ft.pos.z), 0.15 * f.scale, SPLAT.print, 0.25 + 0.09 * (fs.bloodSteps ?? 0), new THREE.Vector3(0, 1, 0), dir, 0);
            fs.bloodSteps = (fs.bloodSteps ?? 0) - 1;
          }
          ft.plantedTime = 1e-4;
        }
      }
    }
  }

  private updateThrown(dt: number) {
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const t = this.thrown[i];
      t.t += dt;
      const e = t.e;
      const rag = e.downRag ?? e.ragdoll;
      if (!rag || t.t > 1.6) {
        this.thrown.splice(i, 1);
        continue;
      }
      rag.read();
      const pelvis = rag.pos[0];
      const v = rag.parts[0].rb!.linvel();
      const speed = Math.hypot(v.x, v.z);
      // bowl over other enemies
      for (const o of this.enemies()) {
        if (o === e || !o.alive || o.down || o.paired || o.cfg.boss) continue;
        if (Math.hypot(o.x - pelvis.x, o.z - pelvis.z) < 0.75 && speed > 2) {
          const h = makeHit({ dir: t.dir.clone(), point: new THREE.Vector3(o.x, 1.0, o.z), damage: 12, strength: 1.1, kind: 'slam', knockdown: true, launch: 1.5, bleed: 0.2, attacker: this.player });
          const res = o.takeHit(h);
          this.combat.feedback(this.player, o, h, res);
          this.player.addCombo(1, 'bowl');
        }
      }
      // wall / pillar impact
      if (!t.hitWall) {
        const surf = this.arena.nearestSurface(pelvis.x, pelvis.z, 0.55);
        if (surf && speed > 2.5) {
          t.hitWall = true;
          const p = surf.point.clone().setY(clamp(pelvis.y + 0.3, 0.4, 1.8));
          this.blood.splat(p.clone().addScaledVector(surf.normal, 0.02), 0.32, SPLAT.splash, 1, surf.normal);
          this.blood.splat(p.clone().addScaledVector(surf.normal, 0.02), 0.22, SPLAT.drip, 0.9, surf.normal, null, 2.2);
          this.audio.play('body_fall', { pos: p });
          this.audio.play(surf.obstacle.kind === 'crate' ? 'wood_break' : 'metal_hit', { pos: p, vol: 0.7 });
          if (surf.obstacle.kind === 'crate') this.fx.woodBurst(p, 10);
          this.fx.dust(p, 1.2);
          this.cam.addTrauma(0.35);
          this.arena.shakeLamps(p.x, p.z, 1.5);
          if (e.alive) {
            const h = makeHit({ dir: surf.normal.clone().negate(), point: p, damage: 35, strength: 1.3, kind: 'slam', bleed: 1.0, boneBreak: Math.random() < 0.4, attacker: this.player });
            e.hp -= h.damage;
            this.combat.feedback(this.player, e, h, e.hp <= 0 ? 'killed' : 'hit');
            if (e.hp <= 0) e.die(h);
            this.player.stats.envKills += e.alive ? 0 : 1;
          }
        }
      }
    }
  }

  onEnemyKilled(e: Enemy, h: HitInfo) {
    const p = this.player;
    p.score += Math.round(e.scoreValue * p.multiplier * (h.finisher ? 1.5 : 1));
    if (e.cfg.boss) {
      this.slowMo(0.15, 1.6);
      this.hud?.bannerShow(`${e.cfg.label}`, 'DEFEATED', 3);
      this.audio.play('announcer', { file: 'audio/announcer/announcer_winner.wav', vol: 0.8 });
    }
  }

  onWeaponThrownHit(w: Weapon, target: Fighter) {
    const e = target as Enemy;
    const p = new THREE.Vector3();
    e.bodyPoint('chest', p);
    const h = makeHit({ dir: new THREE.Vector3(e.x - this.player.x, 0, e.z - this.player.z).normalize(), point: p, damage: w.kind === 'knife' ? 45 : 30, strength: 1.0, kind: w.kind === 'club' ? 'blunt' : 'blade', bleed: w.kind === 'club' ? 0.5 : 1.3, stun: 1.8, attacker: this.player });
    const res = e.takeHit(h);
    this.combat.feedback(this.player, e, h, res);
    this.player.addCombo(1, 'throwweapon');
    if (w.body) w.body.setLinvel({ x: rand(-1, 1), y: 1, z: rand(-1, 1) }, true);
  }

  onPlayerDeath() {
    if (this.over) return;
    this.over = true;
    this.slowMo(0.2, 2.5);
    this.audio.play('announcer', { file: 'audio/announcer/announcer_game_over.wav', vol: 0.8 });
    const p = this.player;
    const stats = {
      'Wave reached': this.waves.wave,
      Score: p.score.toLocaleString(),
      Kills: p.stats.kills,
      'Bodies on the floor': this.corpses.count,
      'Best combo': p.bestCombo,
      Counters: `${p.stats.counters} (${p.stats.perfectCounters} perfect)`,
      Dodges: `${p.stats.dodges} (${p.stats.perfectDodges} perfect)`,
      Finishers: p.stats.finishers,
      Takedowns: p.stats.takedowns,
      'Environment kills': p.stats.envKills,
      'Bones broken': p.stats.boneBreaks,
      Disarms: p.stats.disarms,
    };
    try {
      const prev = JSON.parse(localStorage.getItem('last-stance-best') ?? 'null');
      if (!prev || p.score > prev.score) localStorage.setItem('last-stance-best', JSON.stringify({ wave: this.waves.wave, score: p.score, kills: p.stats.kills }));
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      this.input.exitLock();
      this.hud?.gameOver(stats);
    }, 2600);
  }

  addFighter(f: Fighter) {
    this.fighters.push(f);
  }
  removeFighter(f: Fighter) {
    const i = this.fighters.indexOf(f);
    if (i >= 0) this.fighters.splice(i, 1);
  }

  separate() {
    const fs = this.fighters;
    for (let i = 0; i < fs.length; i++) {
      const a = fs[i];
      if (!a.solid || !a.alive) continue;
      for (let j = i + 1; j < fs.length; j++) {
        const b = fs[j];
        if (!b.solid || !b.alive) continue;
        if (a.paired === b || b.paired === a) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const r = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = (r - d) * 0.5;
          const nx = dx / d, nz = dz / d;
          const wa = a.anim.mode === 'clip' ? 0.3 : 1, wb = b.anim.mode === 'clip' ? 0.3 : 1;
          const tw = wa + wb;
          a.x -= nx * push * ((2 * wa) / tw);
          a.z -= nz * push * ((2 * wa) / tw);
          b.x += nx * push * ((2 * wb) / tw);
          b.z += nz * push * ((2 * wb) / tw);
        }
      }
    }
  }

  renderFrame() {
    this.blood.flush(this.renderer.gl);
    this.renderer.render(this.scene, this.cam.camera, this.realTime);
  }
}

export async function startGame(params: URLSearchParams) {
  const app = document.getElementById('app')!;
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.textContent = 'LOADING';
  loading.style.cssText = 'position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:#050505;color:#aaa;font:700 14px Arial;letter-spacing:.3em';
  document.body.appendChild(loading);
  const game = new Game(app, params);
  (window as unknown as { game: Game }).game = game;
  await game.init();
  loading.remove();
  if (params.get('test')) {
    game.testMode = true;
    const t = await import('./debug/testHarness');
    await t.runTest(game, params);
    return;
  }
  game.start();
}
