// A stranger crossing the far end of the alley now and then: a dark figure in
// a hooded jacket, hands in pockets, walking through the cross alley under the
// streetlight without ever stopping. From the main alley it is a silhouette
// against the lit end wall, with a shadow that sweeps across the wet asphalt
// and through the mist (the streetlight's shadow map re-renders only while the
// figure is inside its cone). It spawns and leaves out of the player's sight.
import * as THREE from 'three';
import { VoxelGrid, Palette, VoxelModel } from '../voxel/VoxelGrid.js';
import { meshModel } from '../voxel/mesher.js';
import { createVoxelMaterial, MCLS } from '../render/voxelMaterial.js';
import { RNG } from '../core/rng.js';
import { LAYER_REFLECT } from './units.js';

const VS = 0.03;
const PATH_Z = -76.7;
const MOUTH_Z = -74.0; // where the main alley opens into the cross alley
const MOUTH_X = 2.8;
const X_END = 13; // spawn / leave point, hidden behind the corner buildings
const HIP = 0.9, THIGH = 0.45, SHIN = 0.45;

/** A box-built part. dims in metres; the pivot sits at `pivot` (fractions of the box, 0..1). */
function part(P, w, h, d, fill, pivot = [0.5, 1, 0.5]) {
  const nx = Math.max(1, Math.round(w / VS)), ny = Math.max(1, Math.round(h / VS)), nz = Math.max(1, Math.round(d / VS));
  const g = new VoxelGrid(nx, ny, nz);
  fill(g, nx, ny, nz);
  return new VoxelModel(g, P, VS, [-pivot[0] * nx * VS, -pivot[1] * ny * VS, -pivot[2] * nz * VS]);
}

function figure(rng) {
  const P = new Palette();
  const jacket = P.add('jacket', { color: [30, 32, 36], rough: 0.8, cls: MCLS.FABRIC, vari: 0.06 });
  const seam = P.add('seam', { color: [22, 23, 26], rough: 0.85, cls: MCLS.FABRIC, vari: 0.04 });
  const jeans = P.add('jeans', { color: rng.pick([[34, 40, 54], [30, 30, 32], [44, 42, 38]]), rough: 0.85, cls: MCLS.FABRIC, vari: 0.06 });
  const shoe = P.add('shoe', { color: [40, 38, 37], rough: 0.6, cls: MCLS.RUBBER, vari: 0.04 });
  const sole = P.add('sole', { color: [96, 92, 86], rough: 0.7, cls: MCLS.RUBBER, vari: 0.03 });
  const skin = P.add('skin', { color: [120, 88, 72], rough: 0.6, cls: MCLS.SKIN, vari: 0.04 });
  const hood = P.add('hood', { color: [26, 27, 30], rough: 0.85, cls: MCLS.FABRIC, vari: 0.05 });
  return {
    torso: part(P, 0.42, 0.62, 0.25, (g, nx, ny, nz) => {
      g.box(0, 0, 0, nx, ny, nz, jacket);
      // rounded shoulders, narrower waist, pocket seams
      g.box(0, ny - 2, 0, 1, ny, nz, 0);
      g.box(nx - 1, ny - 2, 0, nx, ny, nz, 0);
      g.box(0, 0, 0, 1, 6, nz, 0);
      g.box(nx - 1, 0, 0, nx, 6, nz, 0);
      g.box(2, 5, nz - 1, nx - 2, 6, nz, seam);
      g.box(Math.floor(nx / 2), 6, nz - 1, Math.floor(nx / 2) + 1, ny - 2, nz, seam);
    }, [0.5, 0, 0.5]),
    hood: part(P, 0.3, 0.12, 0.2, (g, nx, ny, nz) => g.box(0, 0, 0, nx, ny, nz, hood), [0.5, 0, 0.75]),
    head: part(P, 0.19, 0.25, 0.22, (g, nx, ny, nz) => {
      g.box(0, 0, 0, nx, ny, nz, hood);
      // face in the hood opening, kept in shadow by the brim
      g.box(1, 1, nz - 1, nx - 1, ny - 3, nz, skin);
      g.box(0, ny - 2, nz - 1, nx, ny, nz, hood);
    }, [0.5, 0, 0.5]),
    arm: part(P, 0.11, 0.5, 0.13, (g, nx, ny, nz) => g.box(0, 0, 0, nx, ny, nz, jacket)),
    thigh: part(P, 0.16, THIGH, 0.18, (g, nx, ny, nz) => g.box(0, 0, 0, nx, ny, nz, jeans)),
    shin: part(P, 0.14, SHIN, 0.15, (g, nx, ny, nz) => g.box(0, 0, 0, nx, ny, nz, jeans)),
    foot: part(P, 0.11, 0.09, 0.28, (g, nx, ny, nz) => {
      g.box(0, 1, 0, nx, ny, nz, shoe);
      g.box(0, 0, 0, nx, 1, nz, sole);
    }, [0.5, 1, 0.3]),
  };
}

export class Passerby {
  constructor(engine) {
    this.engine = engine;
    this.rng = new RNG(8686);
    this.active = false;
    this.next = this.rng.range(40, 80);
    this.dir = 1;
    this.x = 0;
    this.phase = 0;
  }

  build() {
    const m = figure(this.rng);
    const mat = createVoxelMaterial({ name: 'passerby' });
    const mesh = (model) => {
      const o = new THREE.Mesh(meshModel(model), mat);
      o.castShadow = true;
      o.receiveShadow = true;
      o.layers.enable(LAYER_REFLECT);
      return o;
    };
    const root = new THREE.Group();
    const pelvis = new THREE.Group();
    pelvis.position.y = HIP;
    root.add(pelvis);
    const torso = mesh(m.torso);
    torso.position.y = -0.04;
    torso.rotation.x = 0.08; // hunched against the cold
    pelvis.add(torso);
    const hood = mesh(m.hood);
    hood.position.set(0, 0.6, -0.04);
    torso.add(hood);
    const head = mesh(m.head);
    head.position.set(0, 0.62, 0.02);
    head.rotation.x = 0.12;
    torso.add(head);
    this.arms = [-1, 1].map((s) => {
      const a = mesh(m.arm);
      a.position.set(s * 0.25, 0.58, 0.0);
      a.rotation.z = s * 0.1; // hands in the jacket pockets
      a.rotation.x = -0.18;
      torso.add(a);
      return a;
    });
    this.legs = [-1, 1].map((s) => {
      const thigh = mesh(m.thigh);
      thigh.position.set(s * 0.1, 0, 0);
      pelvis.add(thigh);
      const shin = mesh(m.shin);
      shin.position.y = -THIGH;
      thigh.add(shin);
      const foot = mesh(m.foot);
      foot.position.y = -SHIN;
      shin.add(foot);
      return { thigh, shin, foot };
    });
    root.visible = false;
    this.root = root;
    this.pelvis = pelvis;
    this.torso = torso;
    this.engine.scene.add(root);
    this.lamp = this.engine.world.lamps.find((l) => l.def.id === 'P3') ?? null;
    return this;
  }

  /** Can the player see the point (x, PATH_Z) on the path through the alley mouth? */
  visible(x, margin = 0.8) {
    const p = this.engine.player?.pos;
    if (!p) return false;
    if (p.z < MOUTH_Z + 0.5) return true; // standing in the cross alley
    const k = (p.z - PATH_Z) / (p.z - MOUTH_Z);
    const xl = p.x + (-MOUTH_X - p.x) * k, xr = p.x + (MOUTH_X - p.x) * k;
    return x > xl - margin && x < xr + margin;
  }

  spawn() {
    const p = this.engine.player?.pos;
    if (!p || p.z < -62) return false;
    this.dir = this.rng.chance(0.5) ? 1 : -1;
    this.x = -this.dir * X_END;
    if (this.visible(this.x, 3)) return false;
    this.z = PATH_Z + this.rng.range(-0.5, 0.5);
    this.speed = this.rng.range(1.15, 1.4);
    this.phase = 0;
    this.active = true;
    this.root.visible = true;
    return true;
  }

  update(dt) {
    if (!this.root) return;
    if (!this.active) {
      this.next -= dt;
      if (this.next <= 0) this.next = this.spawn() ? 0 : 6;
      return;
    }
    this.x += this.dir * this.speed * dt;
    const pastEnd = this.dir * this.x > X_END;
    if ((pastEnd && !this.visible(this.x, 3)) || this.dir * this.x > 21.2) {
      this.active = false;
      this.root.visible = false;
      this.next = this.rng.range(70, 160);
      if (this.lamp) this.engine.refreshShadow(this.lamp.light); // clear the last shadow
      return;
    }
    // gait: one cycle every two steps (~0.72 m per step)
    this.phase += (dt * this.speed * Math.PI * 2) / 1.44;
    const ph = this.phase;
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.pelvis.position.y = HIP - 0.03 + 0.022 * Math.cos(2 * ph);
    this.pelvis.rotation.y = 0.08 * Math.sin(ph);
    this.pelvis.rotation.z = 0.025 * Math.cos(ph);
    this.torso.rotation.y = -0.12 * Math.sin(ph);
    this.legs.forEach((L, i) => {
      const p = ph + i * Math.PI;
      L.thigh.rotation.x = -0.4 * Math.sin(p);
      L.shin.rotation.x = 0.08 + 0.95 * Math.max(0, Math.cos(p - 0.35)) ** 2;
      L.foot.rotation.x = -0.25 * Math.sin(p + 0.6);
    });
    this.arms.forEach((a, i) => (a.rotation.x = -0.18 + 0.07 * Math.sin(this.phase + i * Math.PI + Math.PI)));
    // its shadow moves through the streetlight's cone
    if (this.lamp && Math.abs(this.x - this.lamp.pos.x) < 10) this.engine.refreshShadow(this.lamp.light);
  }
}
