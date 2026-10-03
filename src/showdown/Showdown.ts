import * as THREE from 'three';
import { G } from '../core/G';
import { Input } from '../core/Input';
import { Physics } from '../physics/Physics';
import { SD } from './core/SD';
import { SRenderer } from './render/SRenderer';
import { OUTLINE_RES } from './render/Toon';
import { COLLIDE, City } from './world/City';
import { SFX } from './fx/SFX';
import { Fight } from './game/Fight';
import { DIFFICULTY } from './game/Boss';
import { AudioEngine } from '../audio/Audio';
import { SD_RECIPES } from './audio/SDSounds';
import { Music } from './audio/Music';
import { buildGojo, buildMahoraga, buildSukuna } from './char/Characters';
import type { CharModel } from './char/Model';
import { Animator } from './char/Anim';
import { ALL_CLIPS, ALL_POSES, SK_IDLE, airPose, runCycle, walkCycle } from './char/Poses';
import './ui/sd.css';

/**
 * Shinjuku Showdown: boot, main loop and the debug camera. Gameplay systems
 * hang off SD as they're created.
 */
export class Showdown {
  ready = false;
  readonly renderer: SRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 6000);
  readonly vmScene = new THREE.Scene();
  readonly vmCamera = new THREE.PerspectiveCamera(58, 16 / 9, 0.05, 6000);
  readonly physics = new Physics();
  readonly input: Input;
  city!: City;
  fx!: SFX;
  fight: Fight | null = null;
  readonly audio = new AudioEngine();
  music!: Music;
  /** 0..1 while sounds are synthesized */
  loadProgress = 0;
  /** tests drive the simulation with advance(); the rAF loop stands still */
  manual = false;
  private last = 0;
  /** Free-fly debug camera (until the fight systems take over). */
  private fly = { yaw: 0, pitch: 0, on: true };

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly ui: HTMLDivElement,
  ) {
    this.renderer = new SRenderer(canvas, { samples: 4 });
    this.input = new Input(canvas);
    this.renderer.onResize = (w, h) => {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.vmCamera.aspect = w / h;
      this.vmCamera.updateProjectionMatrix();
      OUTLINE_RES.set(this.renderer.internalW, this.renderer.internalH);
    };
    this.renderer.onResize(this.renderer.width, this.renderer.height);
    Object.assign(SD, {
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      vmScene: this.vmScene,
      vmCamera: this.vmCamera,
      physics: this.physics,
      input: this.input,
    });
    // the Gojo/Sukuna effect modules read these
    Object.assign(G, { renderer: this.renderer as any, scene: this.scene, camera: this.camera, vmScene: this.vmScene, vmCamera: this.vmCamera, input: this.input });
  }

  async boot() {
    await this.physics.init();
    SD.physics = this.physics;
    G.physics = this.physics;
    this.city = new City(this.scene, this.physics.world);
    SD.city = this.city;
    this.fx = new SFX(this.scene);
    SD.fx = this.fx;
    SD.rayGroups = COLLIDE.rayAll;
    SD.enemies = [];
    this.camera.position.set(0, 1.7, 40);
    this.canvas.addEventListener('click', () => {
      this.audio.unlock();
      if (this.fight && !this.input.locked) this.input.requestLock(true);
    });
    window.addEventListener('keydown', () => this.audio.unlock());
    // sounds and the score are synthesized up front
    this.audio.ambience = false;
    await this.audio.init((p) => (this.loadProgress = p), SD_RECIPES);
    SD.audio = this.audio;
    G.audio = this.audio;
    this.music = new Music(this.audio);
    SD.music = this.music;
    this.ready = true;
    this.last = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(1 / 20, (now - this.last) / 1000);
      this.last = now;
      if (!this.manual) this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private frame(dt: number) {
    if (!this.ready) return;
    this.update(dt);
    this.renderer.render(this.studioScene ?? this.scene, this.camera, this.vmScene, this.vmCamera, dt);
    this.input.endFrame();
  }

  /** Deterministic stepping for tests: simulate `sec` seconds at 60 Hz. */
  advance(sec: number) {
    const n = Math.max(1, Math.round(sec * 60));
    for (let i = 0; i < n; i++) {
      this.update(1 / 60);
      this.input.endFrame();
    }
    this.renderer.render(this.studioScene ?? this.scene, this.camera, this.vmScene, this.vmCamera, 1 / 60);
  }

  private update(dt: number) {
    let sdt = dt * SD.timeScale;
    if (this.fight) {
      sdt = this.fight.update(dt);
      this.fly.on = false;
    }
    SD.dt = sdt;
    SD.time += sdt;
    SD.frame++;
    G.time = SD.time;
    G.dt = sdt;
    if (this.fly.on) this.updateFly(dt);
    this.physics.world.propagateModifiedBodyPositionsToColliders();
    this.physics.step(sdt);
    this.city.update(sdt, this.camera);
    this.city.placeSun(this.fight ? this.fight.player.f.pos : this.camera.position);
    this.fx.setAmbient(this.city.hemi.color.clone().multiplyScalar(0.9).lerp(new THREE.Color(1, 1, 1), 0.4));
    this.fx.update(sdt);
    this.audio.update(dt);
  }

  /** Start the duel right away (debug / quick play). */
  startFight(diff: keyof typeof DIFFICULTY = 'hard') {
    if (this.fight) return this.fight;
    this.fight = new Fight(this.ui, DIFFICULTY[diff]);
    this.fly.on = false;
    this.music.start();
    this.music.mix(1, 0.35, 0, 2);
    return this.fight;
  }

  private updateFly(dt: number) {
    const [mx, my] = this.input.consumeMouse();
    const f = this.fly;
    f.yaw -= mx * 0.002;
    f.pitch = THREE.MathUtils.clamp(f.pitch - my * 0.002, -1.5, 1.5);
    this.camera.quaternion.setFromEuler(new THREE.Euler(f.pitch, f.yaw, 0, 'YXZ'));
    const v = new THREE.Vector3(
      (this.input.down('KeyD') ? 1 : 0) - (this.input.down('KeyA') ? 1 : 0),
      (this.input.down('KeyE') ? 1 : 0) - (this.input.down('KeyQ') ? 1 : 0),
      (this.input.down('KeyS') ? 1 : 0) - (this.input.down('KeyW') ? 1 : 0),
    );
    v.applyQuaternion(this.camera.quaternion).multiplyScalar((this.input.down('ShiftLeft') ? 60 : 15) * dt);
    this.camera.position.add(v);
  }

  /** Debug: line up the cast in the plaza. */
  debugModels() {
    const out: Record<string, CharModel> = {};
    const g = buildGojo();
    g.group.position.set(-1.2, this.city.groundY(-1.2, 30), 30);
    const s = buildSukuna();
    s.group.position.set(1.2, this.city.groundY(1.2, 30), 30);
    const m = buildMahoraga();
    m.model.group.position.set(6, this.city.groundY(6, 26), 26);
    for (const c of [g, s, m.model]) this.scene.add(c.group);
    out.gojo = g;
    out.sukuna = s;
    out.maho = m.model;
    (window as any).__models = out;
    return out;
  }

  private studioScene: THREE.Scene | null = null;
  /** Debug: a plain backdrop with three-point light for judging models and poses. */
  studio(on = true) {
    if (!on) {
      this.studioScene = null;
      return;
    }
    const sc = new THREE.Scene();
    sc.background = new THREE.Color(0x8f97a6);
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
    sun.position.set(3, 6, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = c.bottom = -8;
    c.right = c.top = 8;
    sc.add(sun);
    const hemi = new THREE.HemisphereLight(0xb8c8ee, 0x6a6058, 1.2);
    sc.add(hemi);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: 0xb5b0a8 }));
    floor.receiveShadow = true;
    sc.add(floor);
    this.studioScene = sc;
    return sc;
  }

  /** Debug: a row of models, each frozen in a pose or a clip moment. */
  poseSheet(items: string[], who: 'sukuna' | 'gojo' = 'sukuna', spacing = 1.7) {
    for (const c of this.city.cars) c.mesh.visible = false;
    const out: Animator[] = [];
    items.forEach((name, i) => {
      const m = who === 'gojo' ? buildGojo() : buildSukuna();
      const x = (i - (items.length - 1) / 2) * spacing;
      m.group.position.set(x, 0, 0);
      (this.studioScene ?? this.scene).add(m.group);
      const an = new Animator(m, SK_IDLE, { walk: walkCycle, run: runCycle, air: airPose });
      const [base, arg] = name.split('@');
      if (ALL_POSES[base]) an.stance = ALL_POSES[base];
      else if (base === 'run' || base === 'walk') {
        an.speed = base === 'run' ? 8 : 2;
        an.phase = Number(arg ?? 0);
      } else if (ALL_CLIPS[base]) {
        an.play(ALL_CLIPS[base]);
        const t = arg !== undefined ? Number(arg) : ALL_CLIPS[base].events?.[0]?.[0] ?? 0.2;
        an.update(0.0001);
        for (let k = 0; k < Math.round(t / 0.01); k++) an.update(0.01);
        out.push(an);
        return;
      }
      for (let k = 0; k < 30; k++) {
        if (an.speed > 0) an.phase -= (an.speed / (an.speed < an.walkSpeed ? 1.35 : 2.4)) * 0.016 * Math.PI;
        an.update(0.016);
      }
      out.push(an);
    });
    (window as any).__anims = out;
    return out.length;
  }

  /** Debug: place the camera. */
  view(x: number, y: number, z: number, tx: number, ty: number, tz: number, fov = 72) {
    this.camera.position.set(x, y, z);
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(tx, ty, tz);
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.fly.yaw = e.y;
    this.fly.pitch = e.x;
  }
}
