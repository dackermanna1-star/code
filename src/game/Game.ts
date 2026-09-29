import * as THREE from 'three';
import { G } from '../core/G';
import { Input } from '../core/Input';
import { GameRenderer } from '../render/Renderer';
import { Physics } from '../physics/Physics';
import { Atmosphere, PRESETS } from '../world/Atmosphere';
import { Environment } from '../world/Environment';
import { Player } from '../player/Player';
import { buildSkinAtlas } from '../zombies/Skins';
import { BodyRenderer } from '../zombies/BodyRenderer';
import { RagdollSystem } from '../zombies/Ragdolls';
import { ZombieManager } from '../zombies/ZombieManager';
import { FX } from '../fx/FX';
import { Explosions } from '../fx/Explosions';
import { AudioEngine } from '../audio/Audio';
import { Ballistics } from '../weapons/Ballistics';
import { Projectiles } from '../weapons/Projectiles';
import { WeaponController } from '../weapons/WeaponController';
import { WEAPONS, WEAPON_MAP } from '../weapons/defs';
import { Structures } from '../defenses/Structures';
import { Placement } from '../defenses/Placement';
import { DEFENSES } from '../defenses/defs';
import { Progress, wavesForDay } from './Progress';
import { Waves, rewardScale } from './Waves';
import { AirStrike } from './AirStrike';
import { UI, DaySummary } from '../ui/UI';
import { P } from '../zombies/skeleton';
import { rand } from '../core/math';

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

type Mode = 'loading' | 'menu' | 'play';

export class Game {
  private last = 0;
  ready = false;
  mode: Mode = 'loading';
  paused = false;
  manual = false;
  timeScale = 1;
  debugCam = { active: false, pos: new THREE.Vector3(0, 1.65, 0), yaw: Math.PI, pitch: 0 };
  private deathT = -1;
  private menuT = 0;
  private dayStartMoney = 0;

  constructor(private canvas: HTMLCanvasElement, private uiRoot: HTMLDivElement) {}

  get uiBlocking() {
    return this.paused || G.ui?.shopOpen || !!G.ui?.overlayOpen || this.mode !== 'play';
  }

  async boot() {
    const ui = new UI(this.uiRoot);
    G.ui = ui;
    G.hud = ui;
    ui.loading(0.05, 'Starting renderer');
    await nextFrame();
    G.renderer = new GameRenderer(this.canvas);
    G.physics = new Physics();
    await G.physics.init();
    G.input = new Input(this.canvas);
    G.progress = new Progress();
    G.scene = new THREE.Scene();
    G.camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 2500);
    G.vmScene = new THREE.Scene();
    G.vmCamera = new THREE.PerspectiveCamera(58, 16 / 9, 0.01, 10);
    G.renderer.onResize = (w, h) => {
      G.camera.aspect = w / h;
      G.camera.updateProjectionMatrix();
      G.vmCamera.aspect = w / h;
      G.vmCamera.updateProjectionMatrix();
      if (G.progress?.data.settings.pixelSize === 0) G.renderer.pixelSize = this.autoPixel();
    };
    G.renderer.resize();
    G.audio = new AudioEngine();
    ui.loading(0.15, 'Building the road');
    await nextFrame();
    G.atmosphere = new Atmosphere(G.scene);
    G.atmosphere.onThunder = (delay: number, s: number) => setTimeout(() => G.audio?.play('thunder', { volume: 0.6 + s * 0.4 }), delay * 1000);
    G.env = new Environment(G.scene);
    G.env.addColliders(G.physics);
    G.atmosphere.setDay(G.progress.data.day);
    ui.loading(0.35, 'Raising the dead');
    await nextFrame();
    const atlas = buildSkinAtlas();
    G.skinPalette = atlas.palette;
    G.bodyRenderer = new BodyRenderer(atlas, 700, 2600);
    G.scene.add(G.bodyRenderer.group);
    G.ragdolls = new RagdollSystem(G.bodyRenderer);
    G.zombies = new ZombieManager(G.bodyRenderer, G.ragdolls);
    ui.loading(0.55, 'Mixing blood');
    await nextFrame();
    G.fx = new FX(G.scene, G.renderer.renderer);
    G.explosions = new Explosions();
    G.postKick = (k: number) => {
      G.renderer.post.flash = Math.max(G.renderer.post.flash, k * 0.35);
      G.renderer.post.aberration = Math.max(G.renderer.post.aberration, k * 1.2);
    };
    G.player = new Player();
    G.player.spawn();
    G.ballistics = new Ballistics();
    G.projectiles = new Projectiles(G.scene);
    G.structures = new Structures(G.scene);
    G.placement = new Placement();
    G.waves = new Waves();
    G.airstrike = new AirStrike(G.scene);
    ui.loading(0.72, 'Cleaning the guns');
    await nextFrame();
    G.weapons = new WeaponController();
    G.game = this;
    this.hook();
    this.applySettings();
    ui.loading(0.85, 'Synthesizing screams');
    await nextFrame();
    await G.audio.init?.((p: number) => ui.loading(0.85 + p * 0.14, 'Synthesizing screams'));
    // warm up icons for the loadout
    for (const id of G.progress.data.loadout) if (id) ui.icons.get(`w:${id}`);
    ui.loading(1, 'Ready');
    await nextFrame();
    (window as any).__G = G;
    this.ready = true;
    ui.hideLoading();
    this.enterMenu();
    requestAnimationFrame((t) => this.frame(t));

    this.canvas.addEventListener('click', () => {
      G.audio?.unlock();
      if (this.mode === 'play' && !this.uiBlocking) G.input.requestLock(true);
    });
    G.input.onLockError = () => {
      G.ui.toast('Mouse capture is blocked here — open the game in its own tab for full mouse look', 6);
      this.canvas.classList.add('freelook');
    };
    G.input.onLockChange = (locked) => {
      if (!locked && this.mode === 'play' && !this.paused && !G.ui.shopOpen && !G.ui.overlayOpen && G.player.alive && !this.manual) this.pause();
    };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (G.ui.shopOpen) G.ui.closeShop();
        else if (this.paused) this.resume();
        // free-look fallback has no pointer lock to lose, so Escape pauses directly
        else if (!G.input.requireLock && this.mode === 'play' && !this.uiBlocking && G.player.alive) this.pause();
      }
    });
  }

  private autoPixel() {
    const h = G.renderer.height;
    return Math.max(1, Math.min(4, Math.round(h / 520)));
  }

  private hook() {
    const ui = G.ui as UI;
    G.zombies.onKill = (z: any, h: any) => {
      const day = G.waves.day;
      const reward = Math.max(1, Math.round(z.type.reward * rewardScale(day)));
      const head = h.part === P.Head && h.kind !== 'explosion' && h.kind !== 'fire';
      G.progress.earn(reward);
      G.waves.onKill();
      G.waves.dayMoney += reward;
      G.progress.data.stats.kills++;
      if (head) {
        G.progress.data.stats.headshots++;
        G.waves.dayHeadshots++;
      }
      if (this.mode === 'play') {
        ui.moneyPopup(reward, z.x, z.y + 2 * z.scale, z.z, head);
        if (z.type.id === 'boss') ui.banner('ABOMINATION DOWN', `+$${reward}`, 2.5);
        else if (z.type.id === 'brute') ui.killfeed(`Brute killed +$${reward}`);
      }
      G.audio?.play('kill', { volume: 0.35 });
    };
    G.zombies.onGroan = (z: any) => {
      const d = Math.hypot(z.x - G.player.pos.x, z.z - G.player.pos.z);
      if (d < 45) G.audio?.play('groan_' + z.type.groan, { x: z.x, y: z.y + 1.6 * z.scale, z: z.z, volume: 0.9, voices: 8 });
    };
    G.zombies.onAttack = (z: any, target: string) => {
      G.audio?.play(target === 'player' ? 'zombieAttack' : 'zombieHitStruct', { x: z.x, y: z.y + 1.4, z: z.z, voices: 5 });
    };
    G.zombies.onHit = (z: any, h: any, dmg: number, armored: boolean) => {
      if (h.kind === 'fire' || h.kind === 'melee') return;
      G.audio?.play(armored ? 'hitArmor' : h.part === P.Head ? 'hitHead' : 'hitFlesh', { x: h.x, y: h.y, z: h.z, volume: Math.min(1, 0.4 + dmg / 20), voices: 6 });
    };
    G.zombies.onHeadPop = (z: any) => G.audio?.play('headPop', { x: z.x, y: z.y + 1.7, z: z.z });
    G.zombies.onSever = (z: any) => G.audio?.play('sever', { x: z.x, y: z.y + 1.2, z: z.z });
    G.ragdolls.onThud = (x: number, y: number, z: number, s: number) => G.audio?.play('bodyFall', { x, y, z, volume: 0.4 + s * 0.6, voices: 6 });
    G.ballistics.onHitZombie = (_z: any, killed: boolean, head: boolean) => {
      ui.hitmarker(killed ? (head ? 'head' : 'kill') : 'hit');
    };
    G.player.onHurt = (amount: number) => {
      ui.damageDir(G.player.lastDamageDir);
      G.audio?.play('playerHurt', { volume: Math.min(1, 0.5 + amount / 20) });
    };
    G.player.onDeath = () => this.onPlayerDeath();
    G.player.onFootstep = (sprint: boolean) => G.audio?.play('footstep', { volume: sprint ? 0.45 : 0.3, voices: 2 });
    G.player.onLand = (v: number) => G.audio?.play('land', { volume: Math.min(1, v / 8) });
    G.waves.onPhase = (p: string) => this.onPhase(p);
    G.structures.onDestroyed = (s: any) => ui.toast(`${s.def.name} destroyed!`);
    G.progress.onChange = () => {
      if (G.ui.shopOpen) G.ui.renderShop();
    };
  }

  applySettings() {
    const s = G.progress.data.settings;
    G.player.sensitivity = 0.0022 * s.sensitivity;
    G.player.invertY = s.invertY;
    G.player.fov = s.fov;
    G.renderer.setPixelSize(s.pixelSize === 0 ? this.autoPixel() : s.pixelSize);
    G.audio?.setVolumes?.(s.volume, s.sfx, s.music);
    const q = s.quality;
    const shadow = q === 'low' ? 1024 : q === 'medium' ? 2048 : 2048;
    if (G.atmosphere.sun.shadow.mapSize.x !== shadow) {
      G.atmosphere.sun.shadow.mapSize.set(shadow, shadow);
      G.atmosphere.sun.shadow.map?.dispose();
      G.atmosphere.sun.shadow.map = null as any;
    }
    G.atmosphere.setShadowSize(q === 'low' ? 36 : 48);
    G.waves.maxAliveCap = q === 'low' ? 110 : q === 'medium' ? 170 : 240;
    G.ragdolls.maxActive = q === 'low' ? 24 : q === 'medium' ? 34 : 44;
    G.ragdolls.maxCorpses = q === 'low' ? 900 : q === 'medium' ? 1600 : 2400;
    G.zombies.activeDist = q === 'low' ? 40 : q === 'medium' ? 48 : 55;
  }

  // ------------------------------------------------------------------ flow
  enterMenu() {
    this.mode = 'menu';
    this.paused = false;
    G.input.exitLock();
    this.resetWorld();
    G.atmosphere.setDay(G.progress.data.day);
    G.atmosphere.setProgress(0.5, true);
    G.weapons.vm.setModel(null);
    G.ui.showHud(false);
    G.ui.showMenu();
    G.audio?.setAmbience?.('menu');
    this.menuT = 0;
    for (let i = 0; i < 26; i++) this.spawnMenuZombie(rand(18, 95));
  }

  private spawnMenuZombie(z: number) {
    const types = ['walker', 'walker', 'walker', 'walker', 'runner', 'tough', 'walker', 'dog', 'armored', 'crawler'];
    const t = types[Math.floor(Math.random() * types.length)];
    const zb = G.zombies.spawn(t, rand(-9, 9), z, Math.PI);
    if (t === 'runner' || t === 'dog') zb.speed *= 0.4;
  }

  private resetWorld() {
    G.zombies.clear();
    G.ragdolls.clear();
    G.structures.clear();
    G.projectiles.clear();
    G.airstrike.clear();
    G.fx.clear();
    G.placement.exit();
  }

  startDay(day: number) {
    G.ui.closeOverlay();
    G.ui.hideMenu();
    if (G.ui.shopOpen) G.ui.closeShop();
    this.mode = 'play';
    this.paused = false;
    this.deathT = -1;
    this.resetWorld();
    G.progress.data.day = day;
    G.progress.save(true);
    this.dayStartMoney = G.progress.data.money;
    G.player.despawn();
    G.player.spawn();
    G.atmosphere.setDay(day);
    G.waves.startDay(day);
    this.refreshLoadout();
    G.weapons.refillAll();
    G.weapons.grenades = G.progress.data.grenades;
    G.weapons.strength = G.progress.strength;
    G.ui.showHud(true);
    G.ui.banner(`DAY ${day}`, `${G.atmosphere.state.label} · ${wavesForDay(day)} waves`, 3);
    G.audio?.setAmbience?.('play');
    G.audio?.play('dayStart', {});
    G.input.requestLock();
  }

  nextDay() {
    this.startDay(G.progress.data.day);
  }

  refreshLoadout() {
    const d = G.progress.data;
    G.weapons.setLoadout(d.loadout, d.owned);
    for (const id of d.loadout) if (id) G.ui.icons.get(`w:${id}`);
  }

  pause() {
    if (this.mode !== 'play' || this.paused) return;
    this.paused = true;
    G.input.exitLock();
    G.ui.showPause();
  }

  resume(fromClick = false) {
    G.ui.closeOverlay();
    this.paused = false;
    G.input.requestLock(fromClick);
  }

  quitToMenu(fromSummary = false) {
    G.ui.closeOverlay();
    if (!fromSummary && G.waves.phase !== 'dayEnd') this.packStructures();
    G.progress.save(true);
    this.enterMenu();
  }

  onShopClosed(returnTo: 'game' | 'summary') {
    this.refreshLoadout();
    G.weapons.grenades = G.progress.data.grenades;
    if (returnTo === 'game' && this.mode === 'play' && !G.ui.overlayOpen) G.input.requestLock();
  }

  /** Surviving structures go back into the inventory with their current HP (no repair). */
  private packStructures() {
    for (const s of [...G.structures.list]) {
      if (!s.alive) continue;
      const key = s.turret ? `${s.def.id}:${s.turret.weaponId}` : s.def.id;
      const hp = G.structures.remove(s);
      G.progress.addItem(key, hp);
    }
  }

  private summary(): DaySummary {
    const W = G.waves;
    return {
      day: W.day,
      kills: W.dayKills,
      headshots: W.dayHeadshots,
      money: W.dayMoney,
      total: G.progress.data.money,
      wave: W.wave,
      waves: W.total,
      unlocks: [],
      nextWaves: wavesForDay(W.day + 1),
    };
  }

  private onPhase(p: string) {
    const W = G.waves;
    const ui = G.ui as UI;
    if (p === 'wave') {
      G.player.hp = G.player.maxHp;
      G.weapons.refillAll();
      ui.banner(`WAVE ${W.wave}`, W.wave === W.total ? 'FINAL WAVE' : `${W.waveSize} zombies incoming`, 2.2);
      G.audio?.play('waveStart', {});
      G.atmosphere.setProgress(W.total > 1 ? (W.wave - 1) / (W.total - 1) : 1);
    } else if (p === 'prep' && W.wave > 0) {
      ui.banner('WAVE CLEARED', `Next: wave ${W.wave + 1} of ${W.total} — press Enter when ready`, 2.6);
      G.audio?.play('waveClear', {});
    } else if (p === 'dayEnd') {
      const sum = this.summary();
      const oldDay = W.day;
      const d = G.progress.data;
      d.day = oldDay + 1;
      d.bestDay = Math.max(d.bestDay, d.day);
      d.stats.bestDay = d.bestDay;
      d.stats.daysSurvived++;
      for (const w of WEAPONS) if (w.unlockDay === d.day || (w.unlockDay > oldDay && w.unlockDay <= d.day)) sum.unlocks.push(`${w.name} — ${w.cost ? '$' + w.cost.toLocaleString() : 'free'}`);
      for (const w of WEAPONS) for (const L of w.levels ?? []) if (L.unlockDay > oldDay && L.unlockDay <= d.day) sum.unlocks.push(`Upgrade: ${L.name}`);
      for (const def of DEFENSES) if (def.unlockDay > oldDay && def.unlockDay <= d.day) sum.unlocks.push(`${def.name} (defense)`);
      this.packStructures();
      G.progress.save(true);
      G.audio?.play('dayComplete', {});
      setTimeout(() => {
        G.input.exitLock();
        ui.showDayEnd(sum);
      }, 1400);
      ui.banner('DAY SURVIVED', '', 1.4);
    }
  }

  private onPlayerDeath() {
    if (this.deathT >= 0) return;
    this.deathT = 0;
    G.placement.exit();
    G.progress.data.stats.deaths++;
    G.audio?.play('playerDeath', {});
    G.waves.setPhase('dead');
  }

  setPreset(name: string) {
    const p = PRESETS[name];
    if (p) G.atmosphere.setPresets(p, p, 0);
  }

  // ------------------------------------------------------------------ loop
  private frame(t: number) {
    const rawDt = Math.min(0.1, (t - (this.last || t)) / 1000);
    this.last = t;
    if (this.manual) this.update(0, true);
    else {
      const dt = rawDt * this.timeScale;
      G.dt = dt;
      G.time += dt;
      G.frame++;
      this.update(dt, true);
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }

  /** Test hook: run `sec` seconds of game time at 60 Hz (no rendering). */
  advance(sec: number) {
    this.manual = true;
    const n = Math.max(1, Math.round(sec * 60));
    for (let i = 0; i < n; i++) {
      const dt = 1 / 60;
      G.dt = dt;
      G.time += dt;
      G.frame++;
      this.update(dt, false);
    }
  }

  step(n: number, dt = 1 / 60) {
    for (let i = 0; i < n; i++) {
      G.dt = dt;
      G.time += dt;
      this.simulate(dt);
    }
  }

  private handleKeys() {
    const input = G.input;
    if (this.mode !== 'play') return;
    if (this.uiBlocking) return;
    if (input.pressed('Enter') && G.waves.phase === 'prep') {
      G.placement.exit();
      G.waves.startWave();
    }
    if (input.pressed('KeyP')) this.pause();
  }

  simulate(dt: number) {
    if (this.mode === 'play') {
      G.player.update(dt);
      G.placement.update(dt);
      G.weapons.update(dt);
    } else {
      G.player.getAim(new THREE.Vector3());
    }
    G.projectiles.update(dt);
    G.airstrike.update(dt);
    G.waves.update(dt);
    G.zombies.update(dt);
    G.structures.update(dt);
    G.physics.step(dt);
    G.zombies.postPhysics(dt);
    G.ragdolls.update(dt);
    G.ragdolls.updateCorpses(dt);
    G.zombies.ragdollCollisions();
  }

  update(dt: number, render = true) {
    if (!this.ready) return;
    this.handleKeys();
    const freeze = this.mode === 'play' && (this.paused || G.ui.shopOpen || (G.ui.overlayOpen && G.ui.overlayOpen !== 'dead'));
    G.input.enabled = !this.uiBlocking || this.deathT >= 0;
    if (!freeze && dt > 0) this.simulate(dt);
    else if (freeze) G.input.consumeMouse(); // no camera jump when a menu closes
    if (this.mode === 'menu') this.updateMenuCamera(dt);
    // death sequence
    if (this.deathT >= 0 && this.mode === 'play') {
      this.deathT += dt;
      if (this.deathT > 2.2 && !G.ui.overlayOpen) {
        const sum = this.summary();
        this.packStructures();
        G.progress.save(true);
        G.input.exitLock();
        G.ui.showDeath(sum);
      }
    }
    const cam = G.camera;
    if (this.debugCam.active) {
      const dc = this.debugCam;
      cam.position.copy(dc.pos);
      cam.rotation.set(dc.pitch, dc.yaw, 0, 'YXZ');
      cam.updateMatrixWorld();
    }
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const focus = this.mode === 'play' ? G.player.pos : cam.position;
    G.atmosphere.update(dt, focus, fwd, cam.position);
    G.env.update(dt, G.atmosphere.state, G.time);
    G.env.setLightningFlash(G.atmosphere.lightning);
    const s = G.atmosphere.state;
    const amb = new THREE.Color().copy(s.hemiSky).multiplyScalar(s.hemiIntensity * 0.55).add(new THREE.Color().copy(s.sunColor).multiplyScalar(s.sunIntensity * 0.25));
    amb.r = Math.min(1.4, amb.r + 0.05);
    amb.g = Math.min(1.4, amb.g + 0.05);
    amb.b = Math.min(1.4, amb.b + 0.05);
    G.fx.setAmbient(amb);
    G.fx.update(dt, G.time);
    G.bodyRenderer.uniforms.time.value = G.time;
    G.bodyRenderer.beginDynamic();
    G.zombies.render();
    G.ragdolls.render(G.bodyRenderer);
    G.bodyRenderer.endDynamic();
    G.bodyRenderer.flushStatic();
    G.audio?.update?.(dt);

    const post = G.renderer.post;
    post.exposure = s.exposure * (1 + G.atmosphere.lightning * 0.6);
    post.saturation = s.saturation * (G.player.hp < 30 && this.mode === 'play' ? 0.7 : 1);
    post.contrast = s.contrast;
    post.tint.copy(s.tint);
    post.lift.copy(s.lift);
    post.flash = Math.max(0, post.flash - dt * 3);
    post.aberration = Math.max(0, post.aberration - dt * 3);
    post.damage = this.mode === 'play' ? Math.max(G.player.damageFlash, G.player.alive ? 0 : Math.min(1, this.deathT)) : 0;
    G.ui.update(dt);
    if (render) {
      const vm = this.mode === 'play' && G.player.alive;
      G.renderer.render(G.scene, cam, vm ? G.vmScene : null, vm ? G.vmCamera : null, dt);
    }
    G.input.endFrame();
  }

  private updateMenuCamera(dt: number) {
    this.menuT += dt;
    const cam = G.camera;
    const t = this.menuT;
    cam.position.set(Math.sin(t * 0.07) * 3.5, 1.7 + Math.sin(t * 0.13) * 0.15, -4 + Math.sin(t * 0.05) * 2);
    cam.rotation.set(-0.02 + Math.sin(t * 0.09) * 0.02, Math.PI + Math.sin(t * 0.06) * 0.18, 0, 'YXZ');
    if (Math.abs(cam.fov - 70) > 0.1) {
      cam.fov = 70;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    // recycle zombies that reach the camera
    for (const z of [...G.zombies.list]) {
      if (z.z < 10) {
        z.alive = false;
        G.zombies.clearOne?.(z);
        this.spawnMenuZombie(rand(70, 100));
      }
    }
  }
}
