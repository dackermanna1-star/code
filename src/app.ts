import * as THREE from 'three';
import { SceneRenderer } from './render/scenerenderer';
import { World } from './sim/world';
import { Input } from './sim/input';
import { SpectatorController } from './sim/spectator';
import { Hud } from './ui/hud';
import { UPos } from './core/upos';
import { G } from './core/constants';
import { generateSystem } from './astro/systemgen';
import { Cosmos } from './sim/cosmos';
import { LY } from './core/constants';
import { galaxyToUPos } from './astro/galaxy';
import type { Body, StarSystem } from './astro/body';

export class App {
  readonly renderer: SceneRenderer;
  readonly world = new World();
  readonly input: Input;
  readonly spectator: SpectatorController;
  readonly hud: Hud;
  readonly cosmos: Cosmos;
  private last = performance.now();
  private fps = 60;
  running = true;
  /** draw only every n-th frame (tests let terrain stream without paying for software rendering) */
  drawEvery = 1;
  private frameNo = 0;

  constructor(readonly canvas: HTMLCanvasElement, readonly ui: HTMLElement) {
    this.renderer = new SceneRenderer(canvas);
    this.input = new Input(canvas);
    this.spectator = new SpectatorController(this.world, this.input);
    this.hud = new Hud(ui);
    this.cosmos = new Cosmos(20261027, true);
    this.renderer.cosmos = this.cosmos;
    this.cosmos.onSystemChange = (sys) => this.renderer.setSystem(sys);
    this.spectator.farSpeedRef = () => this.cosmos.speedReference(this.world.view.toUPos(new UPos()), this.renderer.starField);
    // start in interstellar space near the Sun's position in the Milky Way
    const u = this.cosmos.universe;
    const start = galaxyToUPos(u.home, u.sunLocal.x + 3, u.sunLocal.y + 1, u.sunLocal.z + 2);
    this.world.view.rebase('universe', null);
    this.world.view.upos.copy(start);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  loadSystem(seed: number, name = `ICS ${seed}`): StarSystem {
    // place the test system at the camera's current location (inside the current galaxy)
    const here = this.world.view.toUPos(new UPos());
    const sys = generateSystem({ id: `sys${seed}`, name, seed, upos: here });
    this.cosmos.activeRef = { id: sys.id, name, galaxyId: this.cosmos.current?.id ?? '', upos: here, local: this.cosmos.camG.clone(), build: () => sys };
    this.world.system = sys;
    sys.update(this.world.time);
    this.renderer.setSystem(sys);
    this.world.view.rebase('inertial', sys.root);
    return sys;
  }

  /** The star a body ultimately orbits (nearest star-like ancestor, else the brightest star). */
  hostStar(b: Body): Body {
    let p: Body | null = b.parent;
    while (p) {
      if (p.isStarLike) return p;
      p = p.parent;
    }
    return this.world.system!.stars[0];
  }

  findBody(ref: string | Body): Body | undefined {
    if (typeof ref !== 'string') return ref;
    return this.world.system?.bodies.find((b) => b.name === ref || b.id === ref || b.name.endsWith(ref));
  }

  /** Place the camera at distFactor × radius from a body, on its day side, looking at it. */
  placeNear(ref: string | Body, distFactor = 3, sideAngle = 0.6) {
    const b = this.findBody(ref);
    const sys = this.world.system;
    if (!b || !sys) return;
    sys.update(this.world.time);
    const view = this.world.view;
    view.rebase('inertial', b);
    const star = this.hostStar(b);
    const toSun = sys.relative(b, star, new THREE.Vector3()).normalize();
    const side = new THREE.Vector3(0, 1, 0).cross(toSun).normalize();
    view.local.copy(toSun).multiplyScalar(Math.cos(sideAngle)).addScaledVector(side, Math.sin(sideAngle)).normalize().multiplyScalar(b.radius * distFactor);
    const look = view.local.clone().negate().normalize();
    view.setWorldOrientation(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), look));
    this.spectator.cancelTravel();
    this.renderer.pipeline.resetExposure();
  }

  /**
   * Debug/test helper: place the camera above the first planet so that the
   * star is at the given elevation, looking along headingDeg (0 = toward the
   * star's azimuth) and pitchDeg (0 = horizon).
   */
  placeBySun(elevDeg: number, altitude: number, headingDeg = 0, pitchDeg = 0, bodyRef: number | string = 0) {
    const sys = this.world.system!;
    sys.update(this.world.time);
    const planet = typeof bodyRef === 'number' ? sys.bodies.filter((b) => b.planet?.surface)[bodyRef] : this.findBody(bodyRef)!;
    const qb = sys.bodyRotation(planet);
    const sunDir = sys.relative(planet, this.hostStar(planet), new THREE.Vector3()).normalize().applyQuaternion(qb.clone().invert());
    const axis = new THREE.Vector3(0, 1, 0).cross(sunDir).normalize();
    const theta = THREE.MathUtils.degToRad(90 - elevDeg);
    const up = sunDir.clone().applyAxisAngle(axis, theta).normalize();
    const ground = this.world.surfaceRadius(planet, up);
    const view = this.world.view;
    view.rebase('rotating', planet);
    view.local.copy(up).multiplyScalar(ground + altitude);
    // local frame: north-ish reference = sun azimuth projected on the horizon
    let toSunH = sunDir.clone().addScaledVector(up, -sunDir.dot(up));
    if (toSunH.lengthSq() < 1e-8) toSunH = new THREE.Vector3(1, 0, 0).addScaledVector(up, -up.x);
    toSunH.normalize();
    const fwd = toSunH.clone().applyAxisAngle(up, THREE.MathUtils.degToRad(-headingDeg));
    const right = fwd.clone().cross(up).normalize();
    fwd.applyAxisAngle(right, THREE.MathUtils.degToRad(pitchDeg));
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), fwd, up);
    const qLocal = new THREE.Quaternion().setFromRotationMatrix(m);
    view.orient.copy(qLocal);
    this.spectator.velocity.set(0, 0, 0);
    this.renderer.pipeline.resetExposure();
  }

  /** Test helper: draw rarely for `ms` so workers get the CPU, then resume. */
  settle(ms: number): Promise<void> {
    this.drawEvery = 30;
    return new Promise((res) => setTimeout(() => { this.drawEvery = 1; res(); }, ms));
  }

  resize() {
    this.renderer.resize(window.innerWidth, window.innerHeight);
  }

  start() {
    const loop = () => {
      if (!this.running) return;
      this.tick();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  tick(dtOverride?: number) {
    const now = performance.now();
    const dt = dtOverride ?? Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;
    this.input.pollGamepad();
    this.world.advance(dt);
    this.cosmos.update(this.world, this.world.view.toUPos(new UPos()), this.renderer.starField, this.frameNo);
    this.spectator.update(dt);
    this.frameNo++;
    this.renderer.render(this.world, dt, this.frameNo % this.drawEvery === 0);
    this.updateHud();
    this.input.endFrame();
  }

  private updateHud() {
    const s = this.spectator;
    const b = s.nearestBody;
    let g = 0;
    if (b) {
      const d = this.world.distanceToBody(this.world.view.toUPos(new UPos()), b);
      g = (G * b.mass) / (d * d);
    }
    const ts = this.renderer.terrainStats;
    this.hud.update({
      mode: 'Spectator',
      frame: this.world.view.body ? `${this.world.view.kind} · ${this.world.view.body.displayName}` : 'universe',
      speed: s.lastSpeed,
      altitude: s.altitude,
      gravity: g,
      target: b?.displayName ?? '',
      targetDist: s.altitude,
      timeScale: this.world.paused ? 0 : this.world.timeScale,
      date: new Date(Date.UTC(2000, 0, 1, 12) + this.world.time * 1000).toISOString().slice(0, 16).replace('T', ' '),
      fps: this.fps,
      extra: `terrain ${ts.drawn}/${ts.nodes} L${ts.maxLevel} q${ts.pending} · stars ${this.renderer.starField.stats.stars} · ${this.cosmos.current?.name ?? 'intergalactic'}`,
    });
  }
}
