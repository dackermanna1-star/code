// The street behind the fence: sodium street lights and the occasional car
// passing on wet asphalt. Its headlights sweep across the alley mouth and
// through the mist (they are part of the volumetric fog light list) while the
// audio engine plays the matching pass-by with Doppler.
import * as THREE from 'three';
import { VoxelGrid, Palette, VoxelModel } from '../voxel/VoxelGrid.js';
import { meshModel } from '../voxel/mesher.js';
import { createVoxelMaterial, MCLS } from '../render/voxelMaterial.js';
import { RNG } from '../core/rng.js';
import { LAYER_REFLECT } from './units.js';

const LANE_Z = [18.4, 21.0];

function carModel(rng) {
  const vs = 0.04;
  const L = Math.round(4.4 / vs), W = Math.round(1.8 / vs), H = Math.round(1.45 / vs);
  const g = new VoxelGrid(L, H, W);
  const P = new Palette();
  const paint = P.add('paint', { color: rng.pick([[30, 32, 36], [70, 20, 22], [90, 92, 96], [24, 40, 60]]), rough: 0.3, metal: 0.4, cls: MCLS.GENERIC, vari: 0.03 });
  const glass = P.add('glass', { color: [10, 12, 14], rough: 0.08, cls: MCLS.GENERIC, vari: 0.01 });
  const tire = P.add('tire', { color: [12, 12, 12], rough: 0.85, cls: MCLS.RUBBER, vari: 0.04 });
  const trim = P.add('trim', { color: [40, 40, 42], rough: 0.5, metal: 0.6, cls: MCLS.GENERIC, vari: 0.04 });
  const wh = Math.round(0.34 / vs);
  // body
  g.box(2, wh - 2, 1, L - 2, Math.round(0.95 / vs), W - 1, paint);
  // cabin
  g.box(Math.round(1.15 / vs), Math.round(0.95 / vs), 3, Math.round(3.3 / vs), H, W - 3, glass);
  g.box(Math.round(1.25 / vs), H - 2, 4, Math.round(3.2 / vs), H, W - 4, paint);
  // bumpers
  g.box(0, wh, 2, 2, Math.round(0.6 / vs), W - 2, trim);
  g.box(L - 2, wh, 2, L, Math.round(0.6 / vs), W - 2, trim);
  // wheels
  for (const x of [Math.round(0.85 / vs), Math.round(3.5 / vs)])
    for (const z of [0, W - 4]) g.box(x - wh, 0, z, x + wh, wh * 2, z + 4, tire);
  const model = new VoxelModel(g, P, vs, [(-L * vs) / 2, 0, (-W * vs) / 2]);
  // emissive head/tail lights as separate parts
  const hl = new VoxelGrid(1, 3, W);
  const PH = new Palette();
  const head = PH.add('head', { color: [255, 240, 210], cls: MCLS.EMISSIVE, rough: 0.2, vari: 0 });
  hl.box(0, 0, 2, 1, 3, 9, head);
  hl.box(0, 0, W - 9, 1, 3, W - 2, head);
  const tl = new VoxelGrid(1, 2, W);
  const PT = new Palette();
  const tail = PT.add('tail', { color: [255, 30, 20], cls: MCLS.EMISSIVE, rough: 0.2, vari: 0 });
  tl.box(0, 0, 2, 1, 2, 8, tail);
  tl.box(0, 0, W - 8, 1, 2, W - 2, tail);
  return {
    model,
    head: new VoxelModel(hl, PH, vs, [(L * vs) / 2 - vs * 0.5, 0.62, (-W * vs) / 2]),
    tail: new VoxelModel(tl, PT, vs, [(-L * vs) / 2 - vs * 0.5, 0.7, (-W * vs) / 2]),
  };
}

export class Traffic {
  constructor(engine) {
    this.engine = engine;
    this.rng = new RNG(4141);
    this.cars = [];
    this.next = 6 + this.rng.range(0, 10);
    this.lights = [];
  }

  /** Street lights + the car light rigs. Must run before Post.init so the fog sees these lights. */
  buildLights(scene, lamps) {
    // two sodium street lights on the street behind the fence
    for (const [x, z, tx, tz] of [[3.6, 15.3, 2.4, 18.5], [-13.0, 24.9, -12.5, 21.0], [19.0, 15.3, 19.5, 18.6]]) {
      const l = new THREE.SpotLight(0xff9a3c, 13, 24, 1.15, 0.6, 2);
      l.position.set(x, 7.6, z);
      l.target.position.set(tx, 0, tz);
      scene.add(l, l.target);
      lamps.push({ def: { id: `street${x}`, kind: 'street', flicker: 0.0 }, light: l, base: 13, pos: l.position.clone(), normal: new THREE.Vector3(0, -1, 0) });
    }
    // two pooled car rigs (headlight spot + tail glow)
    for (let i = 0; i < 2; i++) {
      const head = new THREE.SpotLight(0xfff0d8, 0, 34, 0.55, 0.5, 2);
      scene.add(head, head.target);
      this.lights.push({ head });
    }
    return this.lights.map((l) => ({ light: l.head, def: { id: 'car' } }));
  }

  build() {
    const mat = createVoxelMaterial({ name: 'car' });
    for (let i = 0; i < 2; i++) {
      const m = carModel(this.rng.fork(i));
      const group = new THREE.Group();
      const body = new THREE.Mesh(meshModel(m.model), mat);
      const headMat = createVoxelMaterial({ name: 'carHead', emissive: 30, emissiveColor: 0xfff0d8 });
      const tailMat = createVoxelMaterial({ name: 'carTail', emissive: 18, emissiveColor: 0xff2a1a });
      const head = new THREE.Mesh(meshModel(m.head), headMat);
      const tail = new THREE.Mesh(meshModel(m.tail), tailMat);
      group.add(body, head, tail);
      group.visible = false;
      group.traverse((o) => o.isMesh && o.layers.enable(LAYER_REFLECT));
      this.engine.scene.add(group);
      this.cars.push({ group, active: false, x: 0, dir: 1, speed: 9, lane: 0, rig: this.lights[i] });
    }
    return this;
  }

  spawn() {
    const car = this.cars.find((c) => !c.active);
    if (!car) return;
    const r = this.rng;
    car.dir = r.chance(0.5) ? 1 : -1;
    car.lane = car.dir > 0 ? LANE_Z[0] : LANE_Z[1];
    car.speed = r.range(7, 12);
    car.x = -car.dir * 55;
    car.active = true;
    car.group.visible = true;
    const duration = 110 / car.speed;
    this.engine.audio?.oneShot?.('carPass', {
      from: { x: car.x, y: 0.6, z: car.lane },
      to: { x: car.x + car.dir * 110, y: 0.6, z: car.lane },
      duration,
    });
  }

  update(dt, t) {
    this.next -= dt;
    if (this.next <= 0) {
      this.spawn();
      this.next = this.rng.range(18, 75);
    }
    for (const car of this.cars) {
      const { head } = car.rig;
      if (!car.active) {
        head.intensity = 0;
        continue;
      }
      car.x += car.dir * car.speed * dt;
      car.group.position.set(car.x, 0.0, car.lane);
      car.group.rotation.y = car.dir > 0 ? 0 : Math.PI;
      head.position.set(car.x + car.dir * 2.25, 0.7, car.lane);
      head.target.position.set(car.x + car.dir * 14, 0.0, car.lane + (car.dir > 0 ? -1.2 : 1.2));
      head.intensity = 26;
      if (Math.abs(car.x) > 56) {
        car.active = false;
        car.group.visible = false;
      }
    }
  }
}
