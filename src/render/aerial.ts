/**
 * Aerial life on worlds with complex biospheres.
 *
 * Floaters — buoyant "gasbags": bells filled with a light gas (hydrogen,
 * methane) trailing tentacles, drifting with the wind like aerial jellyfish.
 * Speculative biology (cf. Sagan & Salpeter 1976 on floaters in Jupiter's
 * atmosphere), constrained by physics: they need air much denser than their
 * lift gas, so they appear only where the surface pressure is high, and grow
 * larger where the air is denser and gravity weaker. Each drifts downwind
 * across its 600-m cell (fading in and out at the cell edges), bobs and
 * pulses its bell.
 *
 * Fliers — flocks of winged animals soaring in circles (thermals) with
 * bouts of flapping, banking into their turns. Flight needs air: wing span
 * grows with lower gravity and denser air; diurnal flocks roost at night and
 * nocturnal ones by day, and all of them stay down in heavy rain or snow.
 *
 * Both use the foliage material (translucent membranes when backlit, and a
 * bioluminescent glow at night on glowing worlds); placement is deterministic.
 */
import * as THREE from 'three';
import type { Body } from '../astro/body';
import type { SurfaceGenerator } from '../terrain/surface';
import { Rng, seedOf } from '../core/rng';
import { faceToDir } from '../terrain/cubesphere';
import { dirToFace } from './scatter';

const QPI = Math.PI / 4;
const CELL = 600;
const RADIUS = 1500;

interface FloaterSpecies {
  size: number;      // bell diameter (m)
  tentacles: number; // tentacle length / bell diameter
  color: THREE.Color;
  speed: number;     // drift speed (m/s)
  altitude: [number, number];
}

/** Bell (lathe) + hanging tentacles in one geometry; unit bell diameter, apex at +Y. */
function floaterGeometry(tentacleLen: number, rng: Rng): THREE.BufferGeometry {
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const r = 0.5 * Math.sin(t * Math.PI * 0.55) * (1 + 0.06 * Math.sin(t * 12));
    prof.push(new THREE.Vector2(Math.max(r, 0.001), 0.6 - t * 0.7)); // a taller dome
  }
  prof.push(new THREE.Vector2(0.38, -0.08)); // inner lip
  const bell = new THREE.LatheGeometry(prof.reverse(), 18);
  const parts: THREE.BufferGeometry[] = [bell.toNonIndexed()];
  const n = 6 + rng.int(0, 4);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const r = rng.range(0.15, 0.38);
    const L = tentacleLen * rng.range(0.6, 1.2);
    const c = new THREE.CylinderGeometry(0.018, 0.006, L, 4, 6, true);
    c.translate(Math.cos(a) * r, -0.1 - L / 2, Math.sin(a) * r);
    parts.push(c.toNonIndexed());
  }
  // merge
  let count = 0;
  for (const p of parts) count += p.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), part = new Float32Array(count);
  let o = 0;
  for (const p of parts) {
    p.computeVertexNormals();
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    nor.set(p.attributes.normal.array as Float32Array, o * 3);
    part.fill(1, o, o + p.attributes.position.count); // translucent, glowing tissue
    o += p.attributes.position.count;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  return g;
}

interface Floater {
  sp: number;
  base: THREE.Vector3;  // cell anchor on the ground (planet-fixed)
  side: number;         // cross-wind offset (m)
  alt: number;          // height above the ground (m)
  u0: number;           // phase along the drift path
  phase: number;
  scale: number;
}

export class Floaters {
  readonly group = new THREE.Group();
  private species: FloaterSpecies[] = [];
  private meshes: THREE.InstancedMesh[] = [];
  private cells = new Map<string, Floater[]>();
  private anchor = new THREE.Vector3();
  /** abundance: 0 = none */
  readonly abundance: number;
  count = 0;

  constructor(readonly body: Body, material: THREE.ShaderMaterial) {
    const pl = body.planet!;
    const P = pl.atmosphere?.pressure ?? 0;
    const known = body.known && body.name === 'Earth';
    this.abundance = pl.life.kind === 'complex' && !known ? Math.min(1, Math.max(0, (P - 0.8) / 3)) : 0;
    if (this.abundance <= 0) return;
    const rng = new Rng(seedOf(pl.surface!.seed, 'floaters'));
    const g = pl.gravity;
    // denser air and weaker gravity support larger bells (lift ∝ Δρ·V, weight ∝ g·surface)
    const sizeK = Math.min(4, Math.sqrt(Math.min(P, 20) / 1.5) * Math.sqrt(9.81 / Math.max(g, 1)));
    const pal = pl.surface!.palette;
    const nSp = rng.int(1, 2);
    for (let i = 0; i < nSp; i++) {
      const base = rng.pick([pal.veg2, pal.veg1, pal.highland]);
      const col = new THREE.Color(base[0], base[1], base[2]).multiplyScalar(rng.range(1.1, 1.8));
      col.offsetHSL(rng.range(-0.2, 0.2), rng.range(0, 0.3), rng.range(0, 0.15));
      const sp: FloaterSpecies = {
        size: rng.range(2, 6) * sizeK * (i === 0 ? 1.8 : 0.6),
        tentacles: rng.range(0.8, 3),
        color: col,
        speed: rng.range(1.5, 4.5),
        altitude: i === 0 ? [30, 320] : [8, 120],
      };
      this.species.push(sp);
      const m = new THREE.InstancedMesh(floaterGeometry(sp.tentacles, rng.fork(`geo${i}`)), material, 256);
      m.count = 0;
      m.frustumCulled = false;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(256 * 3), 3);
      this.meshes.push(m);
      this.group.add(m);
    }
  }

  private spawn(gen: SurfaceGenerator, face: number, ci: number, cj: number): Floater[] {
    const R = this.body.radius;
    const rng = new Rng(seedOf(this.body.planet!.surface!.seed, 'floatcell', face, ci, cj));
    const out: Floater[] = [];
    const n = rng.poisson(3 * this.abundance);
    const da = CELL / (R * QPI);
    const dir = [0, 0, 0];
    faceToDir(face, (ci + 0.5) * da, (cj + 0.5) * da, dir);
    const s = gen.sample(dir[0], dir[1], dir[2], 20);
    if (s.temp < 230 || s.temp > 360) return out;
    const ground = R + Math.max(s.height, gen.liquidLevel());
    const base = new THREE.Vector3(dir[0], dir[1], dir[2]).multiplyScalar(ground);
    for (let k = 0; k < n; k++) {
      const si = rng.int(0, this.species.length - 1);
      const sp = this.species[si];
      out.push({ sp: si, base, side: rng.range(-0.45, 0.45) * CELL, alt: rng.range(sp.altitude[0], sp.altitude[1]), u0: rng.next(), phase: rng.range(0, 6.28), scale: rng.range(0.6, 1.3) });
    }
    return out;
  }

  /** camBody: camera in planet-fixed coordinates (Y = spin axis). */
  update(gen: SurfaceGenerator | null, camBody: THREE.Vector3, time: number, enabled: boolean) {
    const R = this.body.radius;
    const want = enabled && !!gen && this.abundance > 0 && camBody.length() - R < 6000;
    this.group.visible = want;
    if (!want || !gen) { this.cells.clear(); return; }
    const dir = camBody.clone().normalize();
    const f = dirToFace(dir);
    const da = CELL / (R * QPI);
    const ci = Math.floor(f.a / da), cj = Math.floor(f.b / da);
    const rc = Math.ceil(RADIUS / CELL);
    const needed = new Set<string>();
    for (let dj = -rc; dj <= rc; dj++)
      for (let di = -rc; di <= rc; di++) {
        const key = `${f.face}:${ci + di}:${cj + dj}`;
        needed.add(key);
        if (!this.cells.has(key)) this.cells.set(key, this.spawn(gen, f.face, ci + di, cj + dj));
      }
    for (const k of this.cells.keys()) if (!needed.has(k)) this.cells.delete(k);
    if (this.anchor.distanceTo(camBody) > 1500 || this.anchor.lengthSq() === 0) this.anchor.copy(camBody);
    // instances
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const up = new THREE.Vector3(), w = new THREE.Vector3(), side = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    const counts = this.meshes.map(() => 0);
    for (const list of this.cells.values()) {
      for (const fl of list) {
        const sp = this.species[fl.sp];
        const mesh = this.meshes[fl.sp];
        if (counts[fl.sp] >= 256) continue;
        up.copy(fl.base).normalize();
        // zonal winds: easterly trades at low latitudes, westerlies beyond ~30°
        w.crossVectors(Y, up);
        if (w.lengthSq() < 1e-8) w.set(1, 0, 0);
        w.normalize().multiplyScalar(Math.abs(up.y) < 0.5 ? -1 : 1);
        side.crossVectors(up, w);
        // drift downwind across the cell, appearing and fading at its edges
        const u = (fl.u0 + (time * sp.speed) / CELL) % 1;
        const fade = Math.min(1, u / 0.08, (1 - u) / 0.08);
        const bob = Math.sin(time * 0.3 + fl.phase) * Math.min(4, sp.size * 0.25);
        p.copy(fl.base).addScaledVector(w, (u - 0.5) * CELL).addScaledVector(side, fl.side).addScaledVector(up, fl.alt + bob).sub(this.anchor);
        // bell pulse: slow contraction cycle
        const pulse = 1 + 0.07 * Math.sin(time * 0.9 + fl.phase * 3);
        const size = sp.size * fl.scale * fade;
        q.setFromUnitVectors(Y, up);
        q.multiply(new THREE.Quaternion().setFromAxisAngle(Y, fl.phase));
        // a gentle tilt with the wind
        q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.12 * Math.sin(time * 0.2 + fl.phase)));
        sc.set(size * pulse, size / pulse, size * pulse);
        m.compose(p, q, sc);
        mesh.setMatrixAt(counts[fl.sp], m);
        mesh.setColorAt(counts[fl.sp], sp.color);
        counts[fl.sp]++;
      }
    }
    this.count = 0;
    this.meshes.forEach((mesh, i) => {
      mesh.count = counts[i];
      mesh.position.copy(this.anchor);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.count += counts[i];
    });
  }

  dispose() {
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.dispose();
    }
  }
}

// ------------------------------------------------------------------ fliers

const FLOCK_CELL = 900;

interface FlierSpecies {
  span: number;     // wing span (m)
  speed: number;    // airspeed (m/s)
  color: THREE.Color;
  nocturnal: boolean;
  flock: [number, number];
}

interface Flock {
  sp: number;
  centre: THREE.Vector3; // ground point under the thermal (planet-fixed)
  alt: number;
  radius: number;
  dir: number;           // ±1 circling sense
  birds: { a: number; dr: number; dz: number; flap: number }[];
}

/** Unit-length body along −Z with membrane wings (span 1): right on +X, left its mirror image. */
function flierGeometries(rng: Rng): { body: THREE.BufferGeometry; wingR: THREE.BufferGeometry; wingL: THREE.BufferGeometry } {
  const body = new THREE.SphereGeometry(0.5, 10, 6);
  body.scale(0.16, 0.12, 1);
  const tail = new THREE.ConeGeometry(0.08, 0.35, 6);
  tail.rotateX(Math.PI / 2);
  tail.translate(0, 0, 0.6);
  const sweep = rng.range(0.05, 0.35), chord = rng.range(0.25, 0.45), tipChord = rng.range(0.08, 0.2);
  const shape = new THREE.Shape();
  shape.moveTo(0, -chord * 0.4);
  shape.lineTo(0.5, -chord * 0.4 + sweep);
  shape.lineTo(0.5, -chord * 0.4 + sweep + tipChord);
  shape.lineTo(0, chord * 0.6);
  shape.closePath();
  const wingR = new THREE.ShapeGeometry(shape);
  wingR.rotateX(Math.PI / 2); // XY plane → XZ plane
  // mirror for the left wing, restoring the triangle winding (a negative
  // instance scale would flip front faces and the shading normal)
  const wingL = wingR.clone();
  wingL.scale(-1, 1, 1);
  const idx = wingL.index!;
  for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); }
  wingL.computeVertexNormals();
  const merged = mergeParts([body, tail]);
  for (const g of [merged, wingR, wingL]) {
    g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(1), 1));
    if (g.attributes.uv) g.deleteAttribute('uv');
  }
  return { body: merged, wingR, wingL };
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  const flat = parts.map((p) => p.toNonIndexed());
  for (const p of flat) count += p.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  let o = 0;
  for (const p of flat) {
    p.computeVertexNormals();
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    nor.set(p.attributes.normal.array as Float32Array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

export class Fliers {
  readonly group = new THREE.Group();
  private species: FlierSpecies[] = [];
  private bodies: THREE.InstancedMesh[] = [];
  private wingsR: THREE.InstancedMesh[] = [];
  private wingsL: THREE.InstancedMesh[] = [];
  private cells = new Map<string, Flock[]>();
  private anchor = new THREE.Vector3();
  count = 0;

  constructor(readonly body: Body, material: THREE.ShaderMaterial) {
    const pl = body.planet!;
    const P = pl.atmosphere?.pressure ?? 0;
    const g = pl.gravity;
    if (pl.life.kind !== 'complex' || (body.known && body.name === 'Earth') || P < 0.25 || g > 25) return;
    const rng = new Rng(seedOf(pl.surface!.seed, 'fliers'));
    // span ∝ (g / ρ)^½-ish: bigger fliers in thin gravity and dense air
    const k = Math.min(3, Math.max(0.5, Math.sqrt((9.81 / Math.max(g, 1)) * Math.sqrt(Math.min(P, 10)))));
    const pal = pl.surface!.palette;
    const n = rng.int(1, 2);
    for (let i = 0; i < n; i++) {
      const base = rng.pick([pal.rockA, pal.veg1, pal.veg2, pal.highland]);
      const col = new THREE.Color(base[0], base[1], base[2]).multiplyScalar(rng.range(0.9, 1.6));
      col.offsetHSL(rng.range(-0.2, 0.2), rng.range(0, 0.2), 0);
      const big = i === 0;
      this.species.push({
        span: (big ? rng.range(2.5, 7) : rng.range(0.6, 1.6)) * k,
        speed: (big ? rng.range(9, 14) : rng.range(6, 10)) * Math.sqrt(Math.max(g, 1) / 9.81) / Math.pow(Math.max(P, 0.3), 0.25),
        color: col,
        nocturnal: rng.chance(pl.life.bioluminescence > 0.3 ? 0.5 : 0.2),
        flock: big ? [2, 6] : [6, 18],
      });
      const geo = flierGeometries(rng.fork(`geo${i}`));
      const mk = (g2: THREE.BufferGeometry, cap: number) => {
        const m = new THREE.InstancedMesh(g2, material, cap);
        m.count = 0;
        m.frustumCulled = false;
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        m.userData.nearShadowOnly = true;
        this.group.add(m);
        return m;
      };
      this.bodies.push(mk(geo.body, 200));
      this.wingsR.push(mk(geo.wingR, 200));
      this.wingsL.push(mk(geo.wingL, 200));
    }
  }

  get hasFliers() {
    return this.species.length > 0;
  }

  private spawn(gen: SurfaceGenerator, face: number, ci: number, cj: number): Flock[] {
    const R = this.body.radius;
    const rng = new Rng(seedOf(this.body.planet!.surface!.seed, 'flock', face, ci, cj));
    if (!rng.chance(0.45)) return [];
    const da = FLOCK_CELL / (R * QPI);
    const dir = [0, 0, 0];
    faceToDir(face, (ci + rng.next()) * da, (cj + rng.next()) * da, dir);
    const s = gen.sample(dir[0], dir[1], dir[2], 20);
    if (s.temp < 240 || s.temp > 335) return [];
    const ground = R + Math.max(s.height, gen.liquidLevel());
    const si = rng.int(0, this.species.length - 1);
    const sp = this.species[si];
    const n = rng.int(sp.flock[0], sp.flock[1]);
    const birds = Array.from({ length: n }, () => ({ a: rng.range(0, Math.PI * 2), dr: rng.normal(0, 0.12), dz: rng.normal(0, 8), flap: rng.range(0, 100) }));
    return [{ sp: si, centre: new THREE.Vector3(dir[0], dir[1], dir[2]).multiplyScalar(ground), alt: rng.range(35, 260), radius: rng.range(40, 160) * Math.max(1, sp.span / 3), dir: rng.chance(0.5) ? 1 : -1, birds }];
  }

  /** sunB: unit vector toward the star (planet-fixed); storm: precipitation intensity here. */
  update(gen: SurfaceGenerator | null, camBody: THREE.Vector3, time: number, enabled: boolean, sunB: THREE.Vector3 | null, storm: number) {
    const R = this.body.radius;
    const want = enabled && !!gen && this.species.length > 0 && camBody.length() - R < 5000;
    this.group.visible = want;
    if (!want || !gen) { this.cells.clear(); return; }
    const dir = camBody.clone().normalize();
    const f = dirToFace(dir);
    const da = FLOCK_CELL / (R * QPI);
    const ci = Math.floor(f.a / da), cj = Math.floor(f.b / da);
    const needed = new Set<string>();
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const key = `${f.face}:${ci + di}:${cj + dj}`;
        needed.add(key);
        if (!this.cells.has(key)) this.cells.set(key, this.spawn(gen, f.face, ci + di, cj + dj));
      }
    for (const k of this.cells.keys()) if (!needed.has(k)) this.cells.delete(k);
    if (this.anchor.distanceTo(camBody) > 1500 || this.anchor.lengthSq() === 0) this.anchor.copy(camBody);
    const g = this.body.planet!.gravity;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), qw = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const up = new THREE.Vector3(), east = new THREE.Vector3(), north = new THREE.Vector3(), radial = new THREE.Vector3(), tang = new THREE.Vector3();
    const basis = new THREE.Matrix4(), Z = new THREE.Vector3(0, 0, 1);
    const nb = this.bodies.map(() => 0);
    for (const list of this.cells.values()) for (const fl of list) {
      const sp = this.species[fl.sp];
      up.copy(fl.centre).normalize();
      const day = sunB ? up.dot(sunB) > -0.05 : true;
      if ((sp.nocturnal ? day : !day) || storm > 0.5) continue; // roosting or sheltering
      east.set(-up.z, 0, up.x);
      if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
      east.normalize();
      north.crossVectors(up, east);
      const omega = (sp.speed / fl.radius) * fl.dir;
      const bank = Math.atan((sp.speed * sp.speed) / (fl.radius * Math.max(g, 0.5))) * fl.dir;
      for (const b of fl.birds) {
        if (nb[fl.sp] >= 200) break;
        const ang = b.a + omega * time;
        const r = fl.radius * (1 + b.dr);
        radial.copy(east).multiplyScalar(Math.cos(ang)).addScaledVector(north, Math.sin(ang));
        tang.copy(east).multiplyScalar(-Math.sin(ang)).addScaledVector(north, Math.cos(ang)).multiplyScalar(fl.dir);
        const z = fl.alt + b.dz + 6 * Math.sin(time * 0.15 + b.a * 3);
        p.copy(fl.centre).addScaledVector(radial, r).addScaledVector(up, z).sub(this.anchor);
        // orientation: nose (−Z) along the flight path, banked into the turn
        const fwd = tang;
        const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
        const upB = new THREE.Vector3().crossVectors(right, fwd);
        basis.makeBasis(right, upB, fwd.clone().negate());
        q.setFromRotationMatrix(basis).multiply(qw.setFromAxisAngle(Z, -bank));
        // bouts of flapping between glides
        const cyc = (time + b.flap) % 9;
        const flapping = cyc < 3;
        const flapRate = 5 / Math.sqrt(sp.span);
        const wingAng = flapping ? 0.55 * Math.sin((time + b.flap) * flapRate * Math.PI * 2) : 0.12;
        sc.setScalar(sp.span * 0.45);
        m.compose(p, q, sc);
        const i = nb[fl.sp];
        this.bodies[fl.sp].setMatrixAt(i, m);
        this.bodies[fl.sp].setColorAt(i, sp.color);
        for (const side of [1, -1]) {
          const wq = q.clone().multiply(qw.setFromAxisAngle(Z, side * wingAng));
          sc.setScalar(sp.span);
          m.compose(p, wq, sc);
          const wm = side > 0 ? this.wingsR[fl.sp] : this.wingsL[fl.sp];
          wm.setMatrixAt(i, m);
          wm.setColorAt(i, sp.color);
        }
        nb[fl.sp]++;
      }
    }
    this.count = 0;
    this.bodies.forEach((mesh, i) => {
      for (const mm of [mesh, this.wingsR[i], this.wingsL[i]]) {
        mm.position.copy(this.anchor);
        mm.instanceMatrix.needsUpdate = true;
        if (mm.instanceColor) mm.instanceColor.needsUpdate = true;
        mm.count = nb[i];
      }
      this.count += nb[i];
    });
  }

  dispose() {
    for (const mm of [...this.bodies, ...this.wingsR, ...this.wingsL]) {
      mm.geometry.dispose();
      mm.dispose();
    }
  }
}
