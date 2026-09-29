import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { MaterialLib } from './Materials';
import { buildStructure, Customization, DEFAULT_CUSTOM, StructureRefs } from './Structure';
import { buildKitchen, KitchenRefs } from './Kitchen';
import { buildDining, DiningRefs } from './Dining';
import { buildExterior, ExteriorRefs, makeCar } from './Exterior';
import { Lighting } from './Lighting';
import { mergeStatic } from './Builder';
import { EnvMapper } from '../render/EnvMap';
import { clamp, damp, Ease, noise, rand } from '../core/math';
import * as S from '../render/Surfaces';

/**
 * The whole restaurant: building, kitchen, dining room, street and lighting,
 * plus ambient life (door, bell, fryer, trees, traffic, neon flicker).
 */
export class Restaurant {
  readonly root = new THREE.Group();
  readonly structure: StructureRefs;
  readonly kitchen: KitchenRefs;
  readonly dining: DiningRefs;
  readonly exterior: ExteriorRefs;
  readonly lighting: Lighting;
  private env: EnvMapper;
  private doorOpen = 0;
  private doorTarget = 0;
  private doorHold = 0;
  private bellSwing = 0;
  private bellVel = 0;
  private cars: { obj: THREE.Group; lane: number; x: number; speed: number; dir: 1 | -1 }[] = [];
  private carTimer = 3;
  private time = 0;
  hour = 10;
  onDoorOpen?: () => void;
  onCarPass?: (x: number) => void;
  custom: Customization;

  constructor(private engine: Engine, readonly mats: MaterialLib, custom: Partial<Customization> = {}) {
    this.custom = { ...DEFAULT_CUSTOM, ...custom };
    this.root.name = 'restaurant';
    engine.scene.add(this.root);
    this.structure = buildStructure(this.root, mats, this.custom);
    this.kitchen = buildKitchen(this.root, mats);
    this.dining = buildDining(this.root, mats, this.custom);
    this.exterior = buildExterior(this.root, mats);
    mergeStatic(this.root);

    this.lighting = new Lighting(engine.scene, { structure: this.structure, dining: this.dining, exterior: this.exterior, kitchen: this.kitchen }, engine.quality);
    // collect bulb materials so they brighten at night
    const bulb = mats.emissive(0xffd79a, 6, 'bulb') as THREE.MeshStandardMaterial;
    this.lighting.registerBulb(bulb);

    this.env = new EnvMapper(engine.renderer);
    this.lighting.onEnvNeedsUpdate = (night) => {
      engine.scene.environment = this.env.update(night, this.lighting.sky.uniforms.uHorizon.value);
    };
    engine.scene.environmentIntensity = 0.85;
    engine.onQualityChange = (q) => this.lighting.applyQuality(q);
    this.setHour(10.5, 0);
  }

  setHour(h: number, dt: number) {
    this.hour = h;
    this.lighting.setHour(h, this.time, dt);
    const { hour, minute } = this.kitchen.clockHands;
    const hh = h % 12;
    hour.rotation.z = -(hh / 12) * Math.PI * 2;
    minute.rotation.z = -((h % 1) * Math.PI * 2);
  }

  get doorAmount() {
    return this.doorOpen;
  }

  /** Swing the front door open for a moment and ring the bell. */
  openDoor(hold = 1.2) {
    if (this.doorTarget < 1) this.onDoorOpen?.();
    this.doorTarget = 1;
    this.doorHold = Math.max(this.doorHold, hold);
    this.bellVel += 9;
  }

  /** Apply cosmetic customization by re-baking the affected materials. */
  applyCustomization(c: Partial<Customization>) {
    Object.assign(this.custom, c);
    const baker = this.mats.baker;
    const swap = (name: string, mat: THREE.Material) => {
      this.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && !Array.isArray(m.material) && m.material.name === name) {
          m.material = mat;
        }
      });
      mat.name = name;
    };
    if (c.wallColor !== undefined) swap('upperWall', baker.material(S.plaster(c.wallColor), {}));
    if (c.floorA !== undefined || c.floorB !== undefined) swap('diningFloor', baker.material(S.checkerTile(this.custom.floorA, this.custom.floorB), {}));
    if (c.accentColor !== undefined) swap('wainscot', baker.material(S.beadboard(c.accentColor), {}));
    if (c.boothColor !== undefined) {
      swap('boothVinyl', this.mats.vinyl(c.boothColor, 5));
      swap('counterFront', this.mats.vinyl(c.boothColor, 6));
    }
    if (c.counterColor !== undefined) swap('counterTop', this.mats.laminate(c.counterColor));
  }

  update(dt: number, time: number) {
    this.time = time;
    // Door
    if (this.doorHold > 0) this.doorHold -= dt;
    else this.doorTarget = 0;
    this.doorOpen = damp(this.doorOpen, this.doorTarget, this.doorTarget > this.doorOpen ? 7 : 3.2, dt);
    const ang = Ease.inOutSine(clamp(this.doorOpen)) * 1.15;
    this.structure.doorLeft.rotation.y = ang;
    this.structure.doorRight.rotation.y = -ang;
    // Bell pendulum
    const acc = -40 * this.bellSwing - 2.2 * this.bellVel;
    this.bellVel += acc * dt;
    this.bellSwing += this.bellVel * dt;
    this.structure.bell.rotation.x = this.bellSwing * 0.08;

    // Fryer oil shimmer + basket bob
    for (const [i, oil] of this.kitchen.fryerOil.entries()) oil.position.y += Math.sin(time * 9 + i) * 0.00002;
    for (const [i, b] of this.kitchen.fryerBaskets.entries()) b.position.y += Math.sin(time * 1.3 + i * 2) * 0.00004;

    // Tree sway
    for (const [i, t] of this.exterior.trees.entries()) {
      t.rotation.z = noise.noise2(time * 0.25, i * 3.1) * 0.035;
      t.rotation.x = noise.noise2(time * 0.2, i * 7.7) * 0.025;
    }

    // Neon flicker (occasional)
    for (const [i, n] of this.dining.neon.entries()) {
      const f = noise.noise2(time * 4 + i * 10, 0.5);
      const mat = n.mesh.material as THREE.MeshBasicMaterial;
      const base = 1.6;
      mat.color.setScalar(f > 0.82 ? base * 0.35 : base);
    }

    // Traffic
    this.carTimer -= dt;
    if (this.carTimer <= 0) {
      this.carTimer = rand(4, 11);
      this.spawnCar();
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      const prevX = c.x;
      c.x += c.speed * c.dir * dt;
      c.obj.position.x = c.x;
      for (const w of c.obj.userData.wheels as THREE.Object3D[]) w.rotation.z -= (c.speed * dt) / 0.34;
      if (Math.sign(prevX - 1) !== Math.sign(c.x - 1)) this.onCarPass?.(c.x);
      if (Math.abs(c.x) > 50) {
        this.root.remove(c.obj);
        this.cars.splice(i, 1);
      }
    }
    this.setHour(this.hour, dt);
  }

  private spawnCar() {
    const lanes = this.exterior.carLane;
    const lane = Math.floor(Math.random() * lanes.length);
    const colors = [0xd1453b, 0x3b7dd1, 0xf2c14e, 0x6fbf73, 0xeeeeee, 0x333338, 0x9b59b6, 0xff8c42];
    const car = makeCar(this.mats, colors[Math.floor(Math.random() * colors.length)]);
    const dir = lanes[lane].dir;
    car.position.set(-dir * 48, 0, lanes[lane].z);
    car.rotation.y = dir > 0 ? 0 : Math.PI;
    car.traverse((o) => (o.castShadow = true));
    this.root.add(car);
    this.cars.push({ obj: car, lane, x: -dir * 48, speed: rand(7, 11), dir });
  }
}
