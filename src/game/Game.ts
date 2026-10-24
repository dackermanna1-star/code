import * as THREE from 'three';
import { Engine, QUALITY_PRESETS } from '../core/Engine';
import { Input } from '../core/Input';
import { TimeControl } from '../core/Time';
import { Physics, RAPIER, GROUPS, BodySync } from '../physics/Physics';
import { ctx } from './ctx';
import { events } from './events';
import { Player } from '../player/Player';
import { CameraFX } from '../fx/CameraFX';
import { FX } from '../fx/FX';
import { Character } from '../characters/Character';
import { makeAppearance, type Style } from '../characters/Appearance';
import { CombatSystem } from './CombatSystem';
import { PropSystem } from '../world/Props';
import { WeaponSystem } from '../weapons/Weapons';
import { PlayerInteraction } from '../player/Interaction';
import { Gibs } from '../fx/Gibs';

/** Bootstraps systems and runs the main loop. */
export class Game {
  engine!: Engine;
  physics!: Physics;
  input!: Input;
  time = new TimeControl();
  player!: Player;
  camFx = new CameraFX();
  combat = new CombatSystem();
  fx!: FX;
  props!: PropSystem;
  weapons!: WeaponSystem;
  interaction!: PlayerInteraction;
  gibs!: Gibs;
  private syncs: BodySync[] = [];
  private last = 0;
  private acc = 0;
  running = false;
  frameMs = 0;
  fps = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  baseFov = 80;
  characters: Character[] = [];
  frameCount = 0;
  paused = false;

  async init(container: HTMLElement): Promise<void> {
    this.physics = await Physics.create();
    this.engine = new Engine(container, QUALITY_PRESETS.medium);
    this.input = new Input(this.engine.canvas);
    ctx.engine = this.engine;
    ctx.physics = this.physics;
    ctx.input = this.input;
    ctx.time = this.time;
    this.fx = new FX(this.engine.scene, this.engine.quality.maxParticles, this.engine.quality.maxDecals);
    ctx.fx = this.fx;
    ctx.combat = this.combat;
    this.props = new PropSystem(this.engine.scene);
    this.weapons = new WeaponSystem(this.props);
    this.gibs = new Gibs(this.engine.scene);

    this.buildTestRoom();
    this.player = new Player(new THREE.Vector3(0, 0, 6), 0);
    this.player.camFx = this.camFx;
    this.player.combat = this.combat;
    this.player.attachViewModel(this.engine.camera);
    ctx.player = this.player;
    this.combat.add(this.player);
    this.interaction = new PlayerInteraction(this.player, this.weapons);
    this.spawnTestProps();
    this.spawnShowcase();

    events.on('footstep', (e) => {
      if (!e.isPlayer) return;
    });

    this.engine.canvas.addEventListener('click', () => this.input.requestLock());
    (window as any).__game = this;
  }

  private buildTestRoom(): void {
    const scene = this.engine.scene;
    scene.background = new THREE.Color(0x1a1210);
    scene.fog = new THREE.Fog(0x1a1210, 25, 80);
    const hemi = new THREE.HemisphereLight(0xffe2c0, 0x6a4a32, 1.6);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0dd, 2.2);
    sun.position.set(8, 18, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    sun.shadow.bias = -0.0004;
    scene.add(sun);

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.9 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(40, 0.4, 40), floorMat);
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    scene.add(floor);
    this.physics.addStaticBox({ x: 0, y: -0.2, z: 0 }, { x: 20, y: 0.2, z: 20 }, 'wood');

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xd8c9a8, roughness: 0.95 });
    const walls: [number, number, number, number][] = [
      [0, -20, 40, 0.4],
      [0, 20, 40, 0.4],
      [-20, 0, 0.4, 40],
      [20, 0, 0.4, 40],
    ];
    for (const [x, z, w, d] of walls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 5, d), wallMat);
      m.position.set(x, 2.5, z);
      m.receiveShadow = true;
      scene.add(m);
      this.physics.addStaticBox({ x, y: 2.5, z }, { x: w / 2, y: 2.5, z: d / 2 }, 'plaster');
    }
    // inner wall to test sprays
    const iw = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 0.3), wallMat);
    iw.position.set(0, 1.5, -3);
    iw.receiveShadow = iw.castShadow = true;
    scene.add(iw);
    this.physics.addStaticBox({ x: 0, y: 1.5, z: -3 }, { x: 4, y: 1.5, z: 0.15 }, 'plaster');

    // ramp + platform (stairs test)
    const platMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.8 });
    const plat = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 6), platMat);
    plat.position.set(-10, 3, -10);
    plat.castShadow = plat.receiveShadow = true;
    scene.add(plat);
    this.physics.addStaticBox({ x: -10, y: 3, z: -10 }, { x: 3, y: 0.15, z: 3 }, 'wood');
    const rampLen = Math.hypot(8, 3.15);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, rampLen), platMat);
    const angle = Math.atan2(3.15, 8);
    ramp.position.set(-10, 1.55, -3);
    ramp.rotation.x = angle;
    ramp.castShadow = ramp.receiveShadow = true;
    scene.add(ramp);
    this.physics.addStaticBox(ramp.position, { x: 1, y: 0.1, z: rampLen / 2 }, 'wood', ramp.quaternion);

    // dynamic crates
    const crateMat = new THREE.MeshStandardMaterial({ color: 0xa0703a, roughness: 0.85 });
    for (let i = 0; i < 8; i++) {
      const s = 0.4 + Math.random() * 0.4;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
      const body = this.physics.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(8 + (Math.random() - 0.5) * 4, 1 + i * 0.6, (Math.random() - 0.5) * 6),
      );
      const col = this.physics.world.createCollider(
        RAPIER.ColliderDesc.cuboid(s / 2, s / 2, s / 2).setDensity(300).setCollisionGroups(GROUPS.PROP),
        body,
      );
      this.physics.register(col, { kind: 'prop', material: 'wood' });
      this.syncs.push(new BodySync(body, mesh));
    }
  }

  spawnTestProps(): void {
    const P = this.props;
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    P.spawn('table_round', V(4, 0, 6));
    P.spawn('chair', V(4.6, 0, 6.3), -1.2);
    P.spawn('chair', V(3.4, 0, 5.6), 1.9);
    for (let i = 0; i < 4; i++) P.spawn('bottle', V(4 + (i - 1.5) * 0.12, 0.78, 6 + (i % 2) * 0.1));
    P.spawn('mug', V(3.8, 0.78, 5.9));
    P.spawn('table_square', V(-4, 0, 6));
    P.spawn('stool', V(-3, 0, 6.6));
    P.spawn('stool', V(-5, 0, 6.6));
    P.spawn('bat', V(-4, 0.8, 6), 0.3, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0.3, 0)) });
    P.spawn('knife', V(-3.8, 0.8, 5.8), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 1.2, 0)) });
    P.spawn('pool_cue', V(-4.2, 0.85, 6.2), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)) });
    P.spawn('pan', V(-4.3, 0.85, 5.8), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)) });
    P.spawn('crate', V(6, 0, 8));
    P.spawn('crate', V(6, 0.46, 8));
    P.spawn('keg', V(7, 0, 8));
    P.spawn('barrel', V(7.8, 0, 7));
    P.spawn('arcade', V(-7, 0, 9), Math.PI);
    P.spawn('arcade', V(-7.8, 0, 9), Math.PI, 1);
    P.spawn('couch', V(0, 0, 10), Math.PI);
    P.spawn('guitar', V(1.5, 0.1, 9), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)) });
    P.spawn('extinguisher', V(-1.5, 0, 9));
    P.spawn('cleaver', V(-3.9, 0.82, 6.3), 0, 0, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0.7, 0)) });
    for (let i = 0; i < 6; i++) P.spawn('pool_ball', V(2 + i * 0.07, 0.1, 7), 0, i);
  }

  spawnShowcase(): void {
    const styles: Style[] = ['biker', 'bouncer', 'bartender', 'cook', 'waitress', 'drunk', 'nerd', 'brawler', 'boss', 'punk', 'cowboy', 'patron'];
    styles.forEach((st, i) => {
      const app = makeAppearance(st, 1000 + i * 17);
      const x = (i - (styles.length - 1) / 2) * 1.1;
      const c = new Character(app, new THREE.Vector3(x, 0, 2), 0);
      this.addCharacter(c);
    });
  }

  addCharacter(c: Character): void {
    this.engine.scene.add(c.model.root);
    this.characters.push(c);
    this.combat.add(c);
  }

  start(): void {
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      this.frame(now);
    };
    requestAnimationFrame(loop);
  }

  /** Advance the simulation manually (used by headless tests). */
  stepFrames(n: number, dt = 1 / 60): void {
    for (let i = 0; i < n; i++) this.tick(dt);
  }

  private frame(now: number): void {
    const realDt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    const t0 = performance.now();
    this.tick(realDt);
    this.frameMs = performance.now() - t0;
    this.fpsAcc += realDt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
  }

  private tick(realDt: number): void {
    const dt = this.paused ? 0 : this.time.update(realDt);
    this.updateInput(realDt);

    const fixed = this.physics.fixedDt;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= fixed && steps < 4) {
      this.fixedUpdate(fixed);
      this.acc -= fixed;
      steps++;
    }
    if (steps >= 4) this.acc = 0;
    const alpha = this.acc / fixed;

    for (const s of this.syncs) s.apply(alpha);
    this.frameCount++;
    this.player.ctrl.updateVisual(dt, alpha);
    this.player.update(dt, realDt);
    this.interaction.update(dt);
    this.props.update(alpha);
    this.gibs.update(dt, alpha);
    for (const c of this.characters) c.update(dt, alpha, this.frameCount);
    this.fx.update(dt, this.engine.camera);
    this.updateCamera(dt, realDt);
    this.engine.renderer.render(this.engine.scene, this.engine.camera);
    this.input.endFrame();
  }

  private updateInput(realDt: number): void {
    const input = this.input;
    const look = input.consumeLook();
    const p = this.player.ctrl;
    if (this.player.alive) {
      p.yaw -= look.dx * 0.0022;
      p.pitch -= look.dy * 0.0022;
      p.pitch = Math.max(-1.54, Math.min(1.54, p.pitch));
      this.player.vm.addSway(look.dx, look.dy);
    }
    const it = p.intent;
    it.x = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    it.z = (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0);
    it.sprint = input.isDown('sprint');
    it.crouch = input.isDown('crouch');
    if (input.wasPressed('jump')) it.jump = true;
    if (input.wasPressed('dodge') || input.wasDoubleTapped('left') || input.wasDoubleTapped('right') || input.wasDoubleTapped('back')) it.dodge = true;
    void realDt;
  }

  private fixedUpdate(dt: number): void {
    this.player.fixedUpdate(dt);
    this.player.ctrl.intent.jump = false;
    this.player.ctrl.intent.dodge = false;
    for (const c of this.characters) c.fixedUpdate(dt);
    this.physics.step();
    this.player.ctrl.capture();
    for (const c of this.characters) c.capture();
    for (const s of this.syncs) s.capture();
    this.props.capture();
    this.gibs.capture();
  }

  private _camPos = new THREE.Vector3();
  private _shakePos = new THREE.Vector3();
  private _shakeRot = new THREE.Euler();
  private _bob = new THREE.Vector3();

  private updateCamera(dt: number, realDt: number): void {
    const cam = this.engine.camera;
    const p = this.player.ctrl;
    p.eyePosition(this._camPos);
    const { roll } = p.bobOffset(this._bob);
    const fovK = this.camFx.update(realDt, this._shakePos, this._shakeRot);
    cam.position.copy(this._camPos);
    let deathRoll = 0;
    if (!this.player.alive) {
      const t = Math.min(1, (this.time.realElapsed - this.player.deathTime) / 1.2);
      cam.position.y -= t * (p.eyeHeight - 0.25);
      deathRoll = t * 1.1;
    }
    const drunk = this.player.drunk;
    const dw = drunk > 0 ? Math.sin(this.time.realElapsed * 1.3) * 0.06 * drunk : 0;
    cam.rotation.set(p.pitch + this._shakeRot.x + dw * 0.5, p.yaw + this._shakeRot.y, roll + this._shakeRot.z + deathRoll + dw, 'YXZ');
    this._bob.add(this._shakePos);
    this._bob.applyQuaternion(cam.quaternion);
    cam.position.add(this._bob);
    const targetFov = this.baseFov + (p.sprinting ? 5 * Math.min(1, p.horizSpeed / 7) : 0) + (this.player.raging ? 6 : 0) + fovK;
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 10 + 0.0001);
    cam.updateProjectionMatrix();
  }
}
