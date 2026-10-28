/**
 * Fauna for worlds with complex life: species with procedurally generated
 * body plans (leg count, proportions, colouring; size scales with gravity)
 * live in herds that are placed deterministically in 400-m cells around the
 * observer. Animals graze, wander with their herd, and flee from a nearby
 * observer; legs swing with a gait whose speed follows the body speed.
 */
import * as THREE from 'three';
import type { Body } from '../astro/body';
import type { SurfaceGenerator } from '../terrain/surface';
import { Rng, seedOf } from '../core/rng';
import { FACES, faceToDir } from '../terrain/cubesphere';

const QPI = Math.PI / 4;
const CELL = 400;
const RADIUS = 650;

interface Species {
  legs: number;
  length: number;   // body length (m)
  height: number;   // hip height (m)
  neck: number;     // head offset forward/up factor
  color: THREE.Color;
  belly: THREE.Color;
  speed: number;    // walking speed (m/s)
  herd: [number, number];
}

interface Animal {
  sp: number;
  herd: string;
  pos: THREE.Vector3;   // planet-fixed
  heading: number;      // radians in the local tangent frame
  speed: number;
  phase: number;
  state: 'graze' | 'walk' | 'flee';
  timer: number;
  rng: Rng;
}

function tangentBasis(up: THREE.Vector3, east: THREE.Vector3, north: THREE.Vector3) {
  east.set(-up.z, 0, up.x);
  if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
  east.normalize();
  north.crossVectors(up, east).normalize();
}

export class Fauna {
  readonly group = new THREE.Group();
  private species: Species[] = [];
  private animals: Animal[] = [];
  private herds = new Map<string, Animal[]>();
  private bodyMesh: THREE.InstancedMesh;
  private headMesh: THREE.InstancedMesh;
  private legMesh: THREE.InstancedMesh;
  private anchor = new THREE.Vector3();
  active = false;
  count = 0;

  constructor(readonly body: Body, material: THREE.ShaderMaterial) {
    const sp = body.planet!.surface!;
    const rng = new Rng(seedOf(sp.seed, 'fauna'));
    const g = body.planet!.gravity;
    const scale = Math.min(2.5, Math.max(0.5, Math.pow(9.81 / Math.max(g, 0.5), 0.5)));
    const pal = sp.palette;
    const nSp = body.known && body.name === 'Earth' ? 0 : rng.int(2, 3); // Earth: wildlife left to the imagination
    for (let i = 0; i < nSp; i++) {
      const base = rng.pick([pal.rockA, pal.rockB, pal.sand, pal.highland, pal.veg2]);
      const col = new THREE.Color(base[0], base[1], base[2]).multiplyScalar(rng.range(0.8, 1.6));
      col.offsetHSL(rng.range(-0.15, 0.15), rng.range(-0.1, 0.25), 0);
      const big = i === 0;
      this.species.push({
        legs: rng.chance(0.65) ? 4 : 6,
        length: (big ? rng.range(1.6, 4.5) : rng.range(0.4, 1.1)) * scale,
        height: (big ? rng.range(0.9, 2.2) : rng.range(0.2, 0.5)) * scale,
        neck: rng.range(0.2, 0.7),
        color: col,
        belly: col.clone().lerp(new THREE.Color(0.6, 0.55, 0.45), 0.5),
        speed: (big ? rng.range(1.2, 2.2) : rng.range(0.8, 1.6)) * Math.sqrt(scale),
        herd: big ? [4, 12] : [2, 7],
      });
    }
    const bodyGeo = new THREE.SphereGeometry(0.5, 14, 10);
    bodyGeo.scale(0.55, 0.45, 1);
    const headGeo = new THREE.SphereGeometry(0.5, 10, 8);
    headGeo.scale(0.8, 0.8, 1.1);
    const legGeo = new THREE.CylinderGeometry(0.5, 0.35, 1, 6);
    legGeo.translate(0, -0.5, 0);
    for (const geo of [bodyGeo, headGeo, legGeo]) {
      geo.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
      geo.deleteAttribute('uv');
    }
    const mk = (geo: THREE.BufferGeometry, cap: number) => {
      const m = new THREE.InstancedMesh(geo, material, cap);
      m.count = 0;
      m.frustumCulled = false;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      m.userData.nearShadowOnly = true;
      this.group.add(m);
      return m;
    };
    this.bodyMesh = mk(bodyGeo, 400);
    this.headMesh = mk(headGeo, 400);
    this.legMesh = mk(legGeo, 2400);
  }

  get hasFauna() {
    return this.species.length > 0;
  }

  private spawnHerds(gen: SurfaceGenerator, face: number, ci: number, cj: number, key: string): Animal[] {
    const R = this.body.radius;
    const rng = new Rng(seedOf(this.body.planet!.surface!.seed, 'herd', face, ci, cj));
    const out: Animal[] = [];
    if (!rng.chance(0.55)) return out;
    const si = rng.int(0, this.species.length - 1);
    const sp = this.species[si];
    const da = CELL / (R * QPI);
    const a0 = (ci + rng.next()) * da, b0 = (cj + rng.next()) * da;
    const dir = [0, 0, 0];
    faceToDir(face, a0, b0, dir);
    const s = gen.sample(dir[0], dir[1], dir[2], 1);
    const sea = gen.liquidLevel();
    if (sea > -Infinity && s.height < sea + 1) return out;
    if (s.temp < 245 || s.temp > 330) return out;
    const n = rng.int(sp.herd[0], sp.herd[1]);
    const centre = new THREE.Vector3(dir[0], dir[1], dir[2]);
    const east = new THREE.Vector3(), north = new THREE.Vector3();
    tangentBasis(centre, east, north);
    for (let k = 0; k < n; k++) {
      const p = centre.clone().multiplyScalar(R).addScaledVector(east, rng.normal(0, 12)).addScaledVector(north, rng.normal(0, 12));
      out.push({ sp: si, herd: key, pos: p, heading: rng.range(0, Math.PI * 2), speed: 0, phase: rng.range(0, 6.28), state: 'graze', timer: rng.range(0, 6), rng: rng.fork(String(k)) });
    }
    return out;
  }

  update(gen: SurfaceGenerator | null, camBody: THREE.Vector3, dt: number, enabled: boolean) {
    const R = this.body.radius;
    const want = enabled && !!gen && this.hasFauna && camBody.length() - R < 1500;
    if (want !== this.active) {
      this.active = want;
      this.group.visible = want;
      if (!want) { this.herds.clear(); this.animals = []; }
    }
    if (!want || !gen) return;
    dt = Math.min(dt, 0.1);
    // herds in nearby cells (face of the camera only: plenty at walking scale)
    const dir = camBody.clone().normalize();
    let face = 0, best = -Infinity;
    for (let f = 0; f < 6; f++) { const n = FACES[f].n; const v = dir.x * n[0] + dir.y * n[1] + dir.z * n[2]; if (v > best) { best = v; face = f; } }
    const F = FACES[face];
    const a = Math.atan((dir.x * F.u[0] + dir.y * F.u[1] + dir.z * F.u[2]) / best) / QPI;
    const b = Math.atan((dir.x * F.v[0] + dir.y * F.v[1] + dir.z * F.v[2]) / best) / QPI;
    const da = CELL / (R * QPI);
    const ci = Math.floor(a / da), cj = Math.floor(b / da);
    const rc = Math.ceil(RADIUS / CELL);
    const needed = new Set<string>();
    for (let dj = -rc; dj <= rc; dj++)
      for (let di = -rc; di <= rc; di++) {
        const key = `${face}:${ci + di}:${cj + dj}`;
        needed.add(key);
        if (!this.herds.has(key)) this.herds.set(key, this.spawnHerds(gen, face, ci + di, cj + dj, key));
      }
    for (const k of [...this.herds.keys()]) if (!needed.has(k)) this.herds.delete(k);
    this.animals = [...this.herds.values()].flat();
    // behaviour
    const up = new THREE.Vector3(), east = new THREE.Vector3(), north = new THREE.Vector3(), fwd = new THREE.Vector3();
    for (const an of this.animals) {
      const sp = this.species[an.sp];
      up.copy(an.pos).normalize();
      tangentBasis(up, east, north);
      const toCam = camBody.clone().sub(an.pos);
      const dCam = toCam.length();
      an.timer -= dt;
      if (dCam < 18 + sp.length * 4) {
        an.state = 'flee';
        an.timer = 3;
        const away = toCam.negate().addScaledVector(up, -toCam.dot(up));
        an.heading = Math.atan2(away.dot(east), away.dot(north)) + an.rng.range(-0.3, 0.3) * dt;
      } else if (an.timer <= 0) {
        an.state = an.rng.chance(0.55) ? 'graze' : 'walk';
        an.timer = an.rng.range(3, 10);
        if (an.state === 'walk') an.heading += an.rng.range(-1.2, 1.2);
      }
      const target = an.state === 'flee' ? sp.speed * 3.2 : an.state === 'walk' ? sp.speed : 0;
      an.speed += (target - an.speed) * Math.min(1, dt * 2.5);
      fwd.copy(north).multiplyScalar(Math.cos(an.heading)).addScaledVector(east, Math.sin(an.heading));
      an.pos.addScaledVector(fwd, an.speed * dt);
      const g = gen.sample(up.x, up.y, up.z, Math.max(0.5, dCam / 55));
      const sea = gen.liquidLevel();
      const wl = Math.max(sea, g.water);
      if (wl > -Infinity && g.height < wl + 0.3) { an.heading += Math.PI * 0.8; an.pos.addScaledVector(fwd, -an.speed * dt * 2); }
      an.pos.copy(up).multiplyScalar(R + Math.max(g.height, wl > -Infinity ? wl : g.height));
      an.phase += dt * (1.5 + an.speed * 2.2 / Math.max(sp.height, 0.2));
    }
    this.rebuild(camBody);
  }

  private rebuild(camBody: THREE.Vector3) {
    if (this.anchor.distanceTo(camBody) > 1000 || this.anchor.lengthSq() === 0) this.anchor.copy(camBody);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const up = new THREE.Vector3(), east = new THREE.Vector3(), north = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
    let nb = 0, nl = 0;
    for (const an of this.animals) {
      if (nb >= 400 || nl + 6 > 2400) break;
      const sp = this.species[an.sp];
      up.copy(an.pos).normalize();
      tangentBasis(up, east, north);
      // orientation: local +Y = up, +Z = heading
      q.setFromUnitVectors(Y, up);
      const localN = north.clone().applyQuaternion(q.clone().invert());
      const yaw0 = Math.atan2(localN.x, localN.z);
      q.multiply(q2.setFromAxisAngle(Y, yaw0 + an.heading));
      const bob = Math.abs(Math.sin(an.phase)) * 0.04 * sp.height * Math.min(1, an.speed);
      const graze = an.state === 'graze' ? 1 : 0;
      // body
      p.copy(an.pos).sub(this.anchor).addScaledVector(up, sp.height + bob);
      s.set(sp.length, sp.length, sp.length);
      m.compose(p, q, s);
      this.bodyMesh.setMatrixAt(nb, m);
      this.bodyMesh.setColorAt(nb, sp.color);
      // head (lowered while grazing)
      const hp = new THREE.Vector3(0, sp.length * (0.12 + sp.neck * 0.3) - graze * (sp.height * 0.8), sp.length * (0.5 + sp.neck * 0.25)).applyQuaternion(q);
      p.copy(an.pos).sub(this.anchor).addScaledVector(up, sp.height + bob).add(hp);
      s.setScalar(sp.length * 0.3);
      m.compose(p, q, s);
      this.headMesh.setMatrixAt(nb, m);
      this.headMesh.setColorAt(nb, sp.belly);
      // legs: pairs along the body, alternating gait
      const pairs = sp.legs / 2;
      for (let k = 0; k < pairs; k++) {
        const z = (pairs === 1 ? 0 : (k / (pairs - 1) - 0.5) * 0.6) * sp.length;
        for (const side of [-1, 1]) {
          const ph = an.phase + (k % 2 === 0 ? 0 : Math.PI) + (side > 0 ? Math.PI : 0);
          const swing = Math.sin(ph) * 0.45 * Math.min(1, an.speed / Math.max(0.3, sp.speed));
          const lq = q.clone().multiply(q2.setFromAxisAngle(X, swing));
          p.copy(an.pos).sub(this.anchor).addScaledVector(up, sp.height + bob).add(new THREE.Vector3(side * sp.length * 0.2, 0, z).applyQuaternion(q));
          s.set(sp.length * 0.09, sp.height + bob, sp.length * 0.09);
          m.compose(p, lq, s);
          this.legMesh.setMatrixAt(nl, m);
          this.legMesh.setColorAt(nl, sp.belly);
          nl++;
        }
      }
      nb++;
    }
    for (const mesh of [this.bodyMesh, this.headMesh, this.legMesh]) {
      mesh.position.copy(this.anchor);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.bodyMesh.count = nb;
    this.headMesh.count = nb;
    this.legMesh.count = nl;
    this.count = nb;
  }

  dispose() {
    for (const m of [this.bodyMesh, this.headMesh, this.legMesh]) {
      m.geometry.dispose();
      m.dispose();
    }
  }
}
