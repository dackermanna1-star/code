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

export class Game {
  private last = 0;
  ready = false;
  debugCam = { active: false, pos: new THREE.Vector3(0, 1.65, 0), yaw: Math.PI, pitch: 0 };
  paused = false;
  timeScale = 1;

  constructor(private canvas: HTMLCanvasElement, private uiRoot: HTMLDivElement) {}

  async boot() {
    G.renderer = new GameRenderer(this.canvas);
    G.physics = new Physics();
    await G.physics.init();
    G.input = new Input(this.canvas);
    G.scene = new THREE.Scene();
    G.camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 2500);
    G.vmScene = new THREE.Scene();
    G.vmCamera = new THREE.PerspectiveCamera(58, 16 / 9, 0.01, 10);
    G.renderer.onResize = (w, h) => {
      G.camera.aspect = w / h;
      G.camera.updateProjectionMatrix();
      G.vmCamera.aspect = w / h;
      G.vmCamera.updateProjectionMatrix();
    };
    G.renderer.resize();
    G.audio = new AudioEngine();
    G.atmosphere = new Atmosphere(G.scene);
    G.env = new Environment(G.scene);
    G.env.addColliders(G.physics);
    G.atmosphere.setDay(1);

    const atlas = buildSkinAtlas();
    G.skinPalette = atlas.palette;
    G.bodyRenderer = new BodyRenderer(atlas, 900, 2600);
    G.scene.add(G.bodyRenderer.group);
    G.ragdolls = new RagdollSystem(G.bodyRenderer);
    G.zombies = new ZombieManager(G.bodyRenderer, G.ragdolls);
    G.fx = new FX(G.scene, G.renderer.renderer);
    G.explosions = new Explosions();
    G.postKick = (k: number) => {
      G.renderer.post.flash = Math.max(G.renderer.post.flash, k * 0.35);
      G.renderer.post.aberration = Math.max(G.renderer.post.aberration, k * 1.2);
    };
    (window as any).__G = G;
    G.player = new Player();
    G.player.spawn();
    G.ballistics = new Ballistics();
    G.projectiles = new Projectiles(G.scene);
    G.weapons = new WeaponController();
    G.weapons.setLoadout(['m686', 'shorty', null, null], {});
    this.ready = true;
    requestAnimationFrame((t) => this.frame(t));
  }

  setPreset(name: string) {
    const p = PRESETS[name];
    if (p) G.atmosphere.setPresets(p, p, 0);
  }

  /** When true the RAF loop only renders; tests drive time with advance(). */
  manual = false;

  private frame(t: number) {
    const rawDt = Math.min(0.1, (t - (this.last || t)) / 1000);
    this.last = t;
    if (this.manual) {
      this.update(0, true);
    } else {
      const dt = rawDt * this.timeScale;
      G.dt = dt;
      G.time += dt;
      G.frame++;
      this.update(dt, true);
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }

  /** Advance simulation deterministically (tests). */
  step(n: number, dt = 1 / 60) {
    for (let i = 0; i < n; i++) {
      G.dt = dt;
      G.time += dt;
      this.simulate(dt);
    }
  }

  /** Test hook: run `sec` seconds of game time at 60 Hz (no rendering), then one visual frame. */
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

  simulate(dt: number) {
    G.player.update(dt);
    G.weapons.update(dt);
    G.projectiles.update(dt);
    G.zombies.update(dt);
    G.physics.step(dt);
    G.zombies.postPhysics(dt);
    G.ragdolls.update(dt);
    G.ragdolls.updateCorpses(dt);
    G.zombies.ragdollCollisions();
  }

  update(dt: number, render = true) {
    if (!this.paused && dt > 0) this.simulate(dt);
    const cam = G.camera;
    if (this.debugCam.active) {
      const dc = this.debugCam;
      cam.position.copy(dc.pos);
      cam.rotation.set(dc.pitch, dc.yaw, 0, 'YXZ');
      cam.updateMatrixWorld();
    }
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    G.atmosphere.update(dt, G.player.pos, fwd, cam.position);
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

    const post = G.renderer.post;
    post.exposure = s.exposure;
    post.saturation = s.saturation;
    post.contrast = s.contrast;
    post.tint.copy(s.tint);
    post.lift.copy(s.lift);
    post.flash = Math.max(0, post.flash - dt * 3);
    post.aberration = Math.max(0, post.aberration - dt * 3);
    post.damage = G.player.damageFlash;
    if (render) G.renderer.render(G.scene, cam, G.vmScene, G.vmCamera, dt);
    G.input.endFrame();
  }
}
