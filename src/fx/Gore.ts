import * as THREE from 'three';
import type { Particles } from './Particles';
import { COUNTER, SEATS, TABLE_TOP_Y } from '../world/Layout';
import { rand } from '../core/math';

/**
 * Blood and bullet aftermath: simulated droplets that leave splats where
 * they land, splat and bullet-hole decals, pools that spread under a body,
 * gibs, head wounds, loose props (a hat knocked off) and brass casings.
 * Everything is pooled and instanced; `clear()` resets it at day end.
 */

const MAX_DROPS = 360;
const MAX_SPLATS = 260;
const MAX_HOLES = 60;
const MAX_GIBS = 48;
const MAX_CASINGS = 36;

const tables: { x: number; z: number; r: number }[] = [];
for (const s of SEATS) if (!tables.some((t) => Math.hypot(t.x - s.table.x, t.z - s.table.z) < 0.2)) tables.push({ x: s.table.x, z: s.table.z, r: 0.42 });

/** Height of the surface under a point (floor, counter top or a table). */
export function surfaceAt(x: number, z: number, y = 9): number {
  let h = 0;
  const cz0 = COUNTER.z - COUNTER.depth / 2;
  const cz1 = COUNTER.z + COUNTER.depth / 2;
  if (x > COUNTER.minX && x < COUNTER.maxX && z > cz0 && z < cz1 && y > COUNTER.height - 0.02) h = COUNTER.height;
  for (const t of tables) if ((x - t.x) ** 2 + (z - t.z) ** 2 < t.r * t.r && y > TABLE_TOP_Y - 0.02) h = Math.max(h, TABLE_TOP_Y);
  return h;
}

function canvasTex(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d')!;
  draw(c, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Irregular splat: a lumpy core, satellite droplets and a few streaks. */
function splatTexture(seed: number): THREE.CanvasTexture {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return canvasTex(256, (c, S) => {
    c.clearRect(0, 0, S, S);
    const cx = S / 2;
    const cy = S / 2;
    c.fillStyle = '#fff';
    // lumpy core from overlapping circles
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * S * 0.12;
      c.beginPath();
      c.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, S * (0.07 + rnd() * 0.1), 0, Math.PI * 2);
      c.fill();
    }
    // spikes and satellites
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const d = S * (0.2 + rnd() * 0.26);
      const r = S * (0.006 + rnd() * 0.022);
      c.beginPath();
      c.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, 0, Math.PI * 2);
      c.fill();
      if (rnd() < 0.5) {
        c.lineWidth = r * 1.2;
        c.strokeStyle = '#fff';
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * S * 0.12, cy + Math.sin(a) * S * 0.12);
        c.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
        c.stroke();
      }
    }
  });
}

function poolTexture(): THREE.CanvasTexture {
  return canvasTex(256, (c, S) => {
    c.clearRect(0, 0, S, S);
    c.fillStyle = '#fff';
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
      const d = S * 0.12;
      c.beginPath();
      c.ellipse(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, S * (0.22 + Math.random() * 0.12), S * (0.18 + Math.random() * 0.1), a, 0, Math.PI * 2);
      c.fill();
    }
  });
}

function holeTexture(): THREE.CanvasTexture {
  return canvasTex(128, (c, S) => {
    c.clearRect(0, 0, S, S);
    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(10,8,6,1)');
    g.addColorStop(0.18, 'rgba(20,16,12,1)');
    g.addColorStop(0.3, 'rgba(60,50,40,0.85)');
    g.addColorStop(0.62, 'rgba(90,80,70,0.25)');
    g.addColorStop(1, 'rgba(90,80,70,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    c.strokeStyle = 'rgba(30,24,20,0.8)';
    c.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      c.beginPath();
      c.moveTo(S / 2 + Math.cos(a) * S * 0.1, S / 2 + Math.sin(a) * S * 0.1);
      c.lineTo(S / 2 + Math.cos(a) * S * (0.25 + Math.random() * 0.2), S / 2 + Math.sin(a + 0.1) * S * (0.25 + Math.random() * 0.2));
      c.stroke();
    }
  });
}

function crackTexture(): THREE.CanvasTexture {
  return canvasTex(256, (c, S) => {
    c.clearRect(0, 0, S, S);
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 1.6;
    const cx = S / 2;
    const cy = S / 2;
    const rays = 11;
    const pts: [number, number][][] = [];
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + Math.random() * 0.3;
      const ray: [number, number][] = [];
      let r = 4;
      c.beginPath();
      c.moveTo(cx, cy);
      while (r < S * 0.48) {
        r += 10 + Math.random() * 18;
        const aa = a + (Math.random() - 0.5) * 0.18;
        const p: [number, number] = [cx + Math.cos(aa) * r, cy + Math.sin(aa) * r];
        ray.push(p);
        c.lineTo(p[0], p[1]);
      }
      c.stroke();
      pts.push(ray);
    }
    // concentric rings joining neighbouring rays
    c.lineWidth = 1;
    for (let ring = 0; ring < 3; ring++)
      for (let i = 0; i < rays; i++) {
        const a = pts[i][ring + 1];
        const b = pts[(i + 1) % rays][ring + 1];
        if (!a || !b) continue;
        c.beginPath();
        c.moveTo(a[0], a[1]);
        c.lineTo(b[0], b[1]);
        c.stroke();
      }
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.beginPath();
    c.arc(cx, cy, 5, 0, Math.PI * 2);
    c.fill();
  });
}

interface Drop {
  alive: boolean;
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: number;
  life: number;
}

interface Body {
  alive: boolean;
  p: THREE.Vector3;
  v: THREE.Vector3;
  q: THREE.Quaternion;
  w: THREE.Vector3;
  s: THREE.Vector3;
  r: number;
  rest: boolean;
  splatted: boolean;
}

interface Loose {
  obj: THREE.Object3D;
  v: THREE.Vector3;
  w: THREE.Vector3;
  r: number;
  rest: boolean;
  dispose?: () => void;
}

interface Pool {
  mesh: THREE.Mesh;
  t: number;
  delay: number;
  max: number;
  dur: number;
}

class Decals {
  readonly mesh: THREE.InstancedMesh;
  private next = 0;
  private m = new THREE.Matrix4();
  constructor(tex: THREE.Texture, mat: THREE.MeshStandardMaterial, private max: number) {
    mat.map = tex;
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 2;
  }
  add(p: THREE.Vector3, normal: THREE.Vector3, size: number, stretch = 1, spin = rand(0, Math.PI * 2)) {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), spin));
    this.m.compose(p, q, new THREE.Vector3(size * stretch, size, 1));
    this.mesh.setMatrixAt(this.next, this.m);
    this.next = (this.next + 1) % this.max;
    this.mesh.count = Math.min(this.max, Math.max(this.mesh.count, this.next === 0 ? this.max : this.next));
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() {
    this.mesh.count = 0;
    this.next = 0;
  }
}

export class Gore {
  readonly root = new THREE.Group();
  private drops: Drop[] = [];
  private dropMesh: THREE.InstancedMesh;
  private splats: Decals[];
  private holes: Decals;
  private cracks: Decals;
  private gibs: Body[] = [];
  private gibMeshes: THREE.InstancedMesh[];
  private casings: Body[] = [];
  private casingMesh: THREE.InstancedMesh;
  private loose: Loose[] = [];
  /** blood effects on/off (the ragdoll falls either way) */
  enabled = true;
  private pools: Pool[] = [];
  private poolGeo = new THREE.PlaneGeometry(1, 1);
  private poolMat: THREE.MeshStandardMaterial;
  private woundGeo = new THREE.SphereGeometry(1, 12, 8);
  private woundMat = new THREE.MeshStandardMaterial({ color: 0x3a0303, roughness: 0.25 });
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpS = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  /** landing sounds: kind + position */
  onSound?: (kind: 'drip' | 'gib' | 'casing' | 'prop', at: THREE.Vector3, strength: number) => void;

  constructor(scene: THREE.Scene, private fx: Particles) {
    this.root.name = 'gore';
    scene.add(this.root);
    const blood = () =>
      new THREE.MeshStandardMaterial({
        color: 0x6a0606,
        roughness: 0.14,
        metalness: 0,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
    this.splats = [11, 29, 47].map((seed) => new Decals(splatTexture(seed), blood(), Math.floor(MAX_SPLATS / 3)));
    const holeMat = new THREE.MeshStandardMaterial({ roughness: 0.9, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.holes = new Decals(holeTexture(), holeMat, MAX_HOLES);
    const crackMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.cracks = new Decals(crackTexture(), crackMat, 16);
    for (const d of [...this.splats, this.holes, this.cracks]) this.root.add(d.mesh);

    this.dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), new THREE.MeshStandardMaterial({ color: 0x7a0808, roughness: 0.15 }), MAX_DROPS);
    this.dropMesh.count = 0;
    this.dropMesh.frustumCulled = false;
    this.root.add(this.dropMesh);
    for (let i = 0; i < MAX_DROPS; i++) this.drops.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: 0, life: 0 });

    const gibGeo = new THREE.IcosahedronGeometry(1, 0);
    this.gibMeshes = [
      new THREE.InstancedMesh(gibGeo, new THREE.MeshStandardMaterial({ color: 0xc98087, roughness: 0.35 }), MAX_GIBS),
      new THREE.InstancedMesh(gibGeo, new THREE.MeshStandardMaterial({ color: 0x6e0b0b, roughness: 0.25 }), MAX_GIBS),
    ];
    for (const g of this.gibMeshes) {
      g.count = 0;
      g.frustumCulled = false;
      g.castShadow = true;
      this.root.add(g);
    }
    const brass = new THREE.MeshStandardMaterial({ color: 0xc99a45, metalness: 1, roughness: 0.28 });
    this.casingMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0048, 0.0048, 0.03, 10), brass, MAX_CASINGS);
    this.casingMesh.count = 0;
    this.casingMesh.frustumCulled = false;
    this.casingMesh.castShadow = true;
    this.root.add(this.casingMesh);

    this.poolMat = new THREE.MeshStandardMaterial({
      color: 0x4a0303,
      roughness: 0.06,
      metalness: 0,
      map: poolTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  }

  // ------------------------------------------------------------------ spawning
  /** Droplets thrown in a cone around `dir`. */
  spray(origin: THREE.Vector3, dir: THREE.Vector3, count: number, speed: number, cone = 0.5, size = 1) {
    if (!this.enabled) return;
    const d = dir.clone().normalize();
    const side = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : this.up).normalize();
    const up2 = new THREE.Vector3().crossVectors(side, d).normalize();
    for (let i = 0; i < count; i++) {
      const drop = this.drops.find((x) => !x.alive);
      if (!drop) break;
      const a = rand(0, Math.PI * 2);
      const r = Math.sqrt(Math.random()) * cone;
      const v = d.clone().addScaledVector(side, Math.cos(a) * r).addScaledVector(up2, Math.sin(a) * r).normalize();
      drop.alive = true;
      drop.p.copy(origin).addScaledVector(v, rand(0, 0.03));
      drop.v.copy(v).multiplyScalar(speed * rand(0.35, 1.15));
      drop.r = rand(0.0025, 0.009) * size;
      drop.life = 0;
    }
  }

  /** Mist cloud (particles) plus fine spray. */
  mist(at: THREE.Vector3, dir: THREE.Vector3, amount = 1) {
    if (!this.enabled) return;
    const v = dir.clone().normalize().multiplyScalar(0.8);
    for (let i = 0; i < 14 * amount; i++) this.fx.emit('puff', at, { vel: v.clone().multiplyScalar(rand(0.3, 1.4)), color: 0x9a0e0e, color1: 0x4a0606, size: rand(0.04, 0.08), size1: rand(0.22, 0.42), life: rand(0.6, 1.2) });
    for (let i = 0; i < 18 * amount; i++) this.fx.emit('drop', at, { vel: v.clone().multiplyScalar(rand(1, 3.5)), color: 0x9a0d0d, size: rand(0.007, 0.014), floor: 0.002 });
  }

  /** "Brains": pink and red chunks thrown from an exit wound. */
  gibsFrom(at: THREE.Vector3, dir: THREE.Vector3, count: number) {
    if (!this.enabled) return;
    const d = dir.clone().normalize();
    for (let i = 0; i < count; i++) {
      const g: Body = {
        alive: true,
        p: at.clone(),
        v: d.clone().multiplyScalar(rand(1.8, 4.2)).add(new THREE.Vector3(rand(-0.9, 0.9), rand(0.2, 1.6), rand(-0.9, 0.9))),
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6))),
        w: new THREE.Vector3(rand(-14, 14), rand(-14, 14), rand(-14, 14)),
        s: new THREE.Vector3(rand(0.008, 0.02), rand(0.006, 0.014), rand(0.007, 0.018)),
        r: 0.01,
        rest: false,
        splatted: false,
      };
      if (this.gibs.length >= MAX_GIBS * 2) this.gibs.shift();
      this.gibs.push(g);
    }
  }

  splat(at: THREE.Vector3, normal = this.up, size = 0.1, stretch = 1, spin?: number) {
    if (!this.enabled) return;
    const d = this.splats[Math.floor(Math.random() * this.splats.length)];
    const p = at.clone().addScaledVector(normal, 0.0015 + Math.random() * 0.0015);
    d.add(p, normal, size, stretch, spin);
  }

  /** A pool that spreads out under a body. */
  pool(at: THREE.Vector3, max = 0.45, delay = 0, dur = 9) {
    if (!this.enabled) return;
    const m = new THREE.Mesh(this.poolGeo, this.poolMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rand(0, Math.PI * 2);
    m.position.set(at.x, surfaceAt(at.x, at.z, at.y + 0.05) + 0.0025 + Math.random() * 0.001, at.z);
    m.scale.setScalar(0.001);
    m.receiveShadow = true;
    m.renderOrder = 1;
    this.root.add(m);
    this.pools.push({ mesh: m, t: 0, delay, max, dur });
  }

  /** Entry wound stuck to a bone (moves with the body). */
  wound(bone: THREE.Object3D, worldPoint: THREE.Vector3, size = 0.018) {
    if (!this.enabled) return;
    const w = new THREE.Mesh(this.woundGeo, this.woundMat);
    const local = bone.worldToLocal(worldPoint.clone());
    const n = local.clone().normalize();
    w.position.copy(local).addScaledVector(n, -size * 0.25);
    w.scale.set(size, size, size * 0.45);
    w.userData.wound = true;
    w.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    bone.add(w);
  }

  bulletHole(at: THREE.Vector3, normal: THREE.Vector3, glass = false) {
    const p = at.clone().addScaledVector(normal, 0.002);
    if (glass) this.cracks.add(p, normal, rand(0.35, 0.55));
    this.holes.add(p, normal, glass ? 0.02 : rand(0.03, 0.045));
  }

  /**
   * A prop knocked loose (a hat, a dropped burger): tumbles with simple
   * rigid physics. `dispose` frees it when the day is cleared.
   */
  launch(obj: THREE.Object3D, v: THREE.Vector3, w: THREE.Vector3, r = 0.08, dispose?: () => void) {
    this.root.attach(obj);
    this.loose.push({ obj, v: v.clone(), w: w.clone(), r, rest: false, dispose });
  }

  ejectCasings(from: THREE.Vector3, count: number) {
    for (let i = 0; i < count; i++) {
      const c: Body = {
        alive: true,
        p: from.clone().add(new THREE.Vector3(rand(-0.01, 0.01), rand(-0.01, 0.01), rand(-0.01, 0.01))),
        v: new THREE.Vector3(rand(-0.4, 0.4), rand(-0.6, -0.1), rand(-0.3, 0.3)),
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6))),
        w: new THREE.Vector3(rand(-20, 20), rand(-20, 20), rand(-20, 20)),
        s: new THREE.Vector3(1, 1, 1),
        r: 0.006,
        rest: false,
        splatted: false,
      };
      if (this.casings.length >= MAX_CASINGS) this.casings.shift();
      this.casings.push(c);
    }
  }

  // ------------------------------------------------------------------ simulation
  update(dt: number) {
    if (dt <= 0) return;
    this.updateDrops(dt);
    this.updateBodies(this.gibs, dt, 'gib');
    this.updateBodies(this.casings, dt, 'casing');
    this.writeBodies(this.gibs, this.gibMeshes, true);
    this.writeBodies(this.casings, [this.casingMesh], false);
    this.updateLoose(dt);
    for (const p of this.pools) {
      p.t += dt;
      const k = Math.max(0, p.t - p.delay) / p.dur;
      const e = 1 - Math.pow(1 - Math.min(1, k), 3);
      p.mesh.scale.setScalar(Math.max(0.001, p.max * 2 * e));
    }
  }

  private updateDrops(dt: number) {
    let n = 0;
    const m = this.tmpM;
    for (const d of this.drops) {
      if (!d.alive) continue;
      d.life += dt;
      d.v.y -= 9.81 * dt;
      d.v.multiplyScalar(Math.exp(-0.35 * dt));
      const prevY = d.p.y;
      d.p.addScaledVector(d.v, dt);
      const floor = surfaceAt(d.p.x, d.p.z, prevY);
      if (d.p.y <= floor + 0.001 || d.life > 4) {
        d.alive = false;
        if (d.life <= 4) {
          // faster drops smear into longer splats along their travel
          const speed = Math.hypot(d.v.x, d.v.z);
          const size = d.r * rand(5, 9) * (1 + Math.min(1.5, Math.abs(d.v.y) * 0.08));
          const stretch = 1 + Math.min(2.2, speed * 0.35);
          const spin = Math.atan2(d.v.z, d.v.x);
          const at = new THREE.Vector3(d.p.x, floor, d.p.z);
          this.splat(at, this.up, size, stretch, -spin);
          if (Math.random() < 0.08) this.onSound?.('drip', at, Math.min(1, d.r * 120));
        }
        continue;
      }
      // stretch along velocity
      const v = d.v;
      const len = v.length();
      this.tmpQ.setFromUnitVectors(this.up, len > 1e-4 ? v.clone().divideScalar(len) : this.up);
      this.tmpS.set(d.r, d.r * (1 + Math.min(3, len * 0.25)), d.r);
      m.compose(d.p, this.tmpQ, this.tmpS);
      this.dropMesh.setMatrixAt(n++, m);
    }
    this.dropMesh.count = n;
    this.dropMesh.instanceMatrix.needsUpdate = true;
  }

  private updateBodies(list: Body[], dt: number, kind: 'gib' | 'casing') {
    for (const b of list) {
      if (b.rest) continue;
      b.v.y -= 9.81 * dt;
      const prevY = b.p.y;
      b.p.addScaledVector(b.v, dt);
      this.tmpQ.setFromEuler(new THREE.Euler(b.w.x * dt, b.w.y * dt, b.w.z * dt));
      b.q.multiply(this.tmpQ);
      const floor = surfaceAt(b.p.x, b.p.z, prevY) + b.r;
      if (b.p.y < floor) {
        b.p.y = floor;
        const impact = -b.v.y;
        if (kind === 'gib' && !b.splatted) {
          b.splatted = true;
          this.splat(new THREE.Vector3(b.p.x, floor - b.r, b.p.z), this.up, rand(0.05, 0.1), 1.3, rand(0, 6));
        }
        if (impact > 0.4) this.onSound?.(kind, b.p, Math.min(1, impact / 4));
        b.v.y = impact * (kind === 'casing' ? 0.45 : 0.18);
        b.v.x *= kind === 'casing' ? 0.7 : 0.35;
        b.v.z *= kind === 'casing' ? 0.7 : 0.35;
        b.w.multiplyScalar(0.6);
        if (impact < 0.35 && Math.hypot(b.v.x, b.v.z) < 0.05) b.rest = true;
      }
    }
  }

  private writeBodies(list: Body[], meshes: THREE.InstancedMesh[], split: boolean) {
    const counts = meshes.map(() => 0);
    list.forEach((b, i) => {
      const mi = split ? i % meshes.length : 0;
      this.tmpM.compose(b.p, b.q, b.s);
      meshes[mi].setMatrixAt(counts[mi]++, this.tmpM);
    });
    meshes.forEach((m, i) => {
      m.count = counts[i];
      m.instanceMatrix.needsUpdate = true;
    });
  }

  private updateLoose(dt: number) {
    // props taken away by their owner (a body that faded out) drop out of the sim
    if (this.loose.some((l) => l.obj.parent !== this.root)) this.loose = this.loose.filter((l) => l.obj.parent === this.root);
    for (const l of this.loose) {
      if (l.rest) continue;
      l.v.y -= 9.81 * dt;
      const o = l.obj;
      const prevY = o.position.y;
      o.position.addScaledVector(l.v, dt);
      o.rotateX(l.w.x * dt);
      o.rotateY(l.w.y * dt);
      o.rotateZ(l.w.z * dt);
      const floor = surfaceAt(o.position.x, o.position.z, prevY) + l.r * 0.4;
      if (o.position.y < floor) {
        o.position.y = floor;
        const impact = -l.v.y;
        if (impact > 0.5) this.onSound?.('prop', o.position, Math.min(1, impact / 4));
        l.v.y = impact * 0.25;
        l.v.x *= 0.5;
        l.v.z *= 0.5;
        l.w.multiplyScalar(0.45);
        // settle upright-ish or on its side, whichever is closer
        if (impact < 0.6 && Math.hypot(l.v.x, l.v.z) < 0.1) l.rest = true;
      }
    }
  }

  clear() {
    for (const d of this.drops) d.alive = false;
    this.dropMesh.count = 0;
    for (const s of this.splats) s.clear();
    this.holes.clear();
    this.cracks.clear();
    this.gibs.length = 0;
    this.casings.length = 0;
    for (const g of this.gibMeshes) g.count = 0;
    this.casingMesh.count = 0;
    for (const l of this.loose) {
      l.obj.removeFromParent();
      l.dispose?.();
    }
    this.loose.length = 0;
    for (const p of this.pools) p.mesh.removeFromParent();
    this.pools.length = 0;
  }
}
