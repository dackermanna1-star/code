import * as THREE from 'three';
import { G } from '../core/G';
import { GROUPS, RAPIER } from '../physics/Physics';
import { rand } from '../core/math';
import { qRot, qRotInv, qMul } from '../core/qmath';
import { buildGrenade } from './models';
import { C, mat } from './ModelBuilder';
import type { ZombieHit } from '../zombies/ZombieManager';
import type { Zombie } from '../zombies/Zombie';
import type { Ragdoll, Corpse } from '../zombies/Ragdolls';
import { P } from '../zombies/skeleton';

interface Grenade {
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
  fuse: number;
  lastV: number;
  bounces: number;
}

export interface ProjSpec {
  kind: 'rocket' | 'grenade40' | 'arrow' | 'lightArrow';
  damage: number;
  pen: number;
  stopping: number;
  weapon: string;
  explosive?: { radius: number; damage: number };
  fire?: boolean;
  gravity: number;
}

interface Proj {
  spec: ProjSpec;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  mesh: THREE.Object3D;
  life: number;
  budget: number;
  hitSet: Set<Zombie>;
  trailT: number;
  armed: number;
}

interface Stuck {
  mesh: THREE.Object3D;
  owner: { z?: Zombie; r?: Ragdoll; c?: Corpse } | null;
  part: number;
  lp: THREE.Vector3;
  lq: THREE.Quaternion;
}

const _a = new Float32Array(4);
const _b = new Float32Array(4);
const _p3 = new Float32Array(3);
const zh: ZombieHit[] = [];

export class Projectiles {
  private grenades: Grenade[] = [];
  private projs: Proj[] = [];
  private stuck: Stuck[] = [];
  private grenadeTemplate = buildGrenade().root;
  private arrowGeo: THREE.BufferGeometry;
  private rocketGeo: THREE.BufferGeometry;
  private gl40Geo: THREE.BufferGeometry;

  constructor(private scene: THREE.Scene) {
    this.arrowGeo = new THREE.BoxGeometry(0.012, 0.012, 0.66);
    this.arrowGeo.translate(0, 0, 0.3);
    this.rocketGeo = new THREE.CylinderGeometry(0.04, 0.02, 0.32, 8);
    this.rocketGeo.rotateX(Math.PI / 2);
    this.gl40Geo = new THREE.BoxGeometry(0.04, 0.04, 0.06);
  }

  /** Hand grenade (physical, bouncing). */
  throwGrenade(pos: THREE.Vector3, vel: THREE.Vector3, fuse: number) {
    const w = G.physics.world;
    const body = w.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setLinvel(vel.x, vel.y, vel.z)
        .setAngvel({ x: rand(-8, 8), y: rand(-8, 8), z: rand(-8, 8) })
        .setCcdEnabled(true)
        .setLinearDamping(0.05)
        .setAngularDamping(0.4),
    );
    w.createCollider(RAPIER.ColliderDesc.ball(0.045).setDensity(2200).setRestitution(0.38).setFriction(0.6).setCollisionGroups(GROUPS.proj), body);
    const mesh = this.grenadeTemplate.clone();
    mesh.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    const pin = mesh.getObjectByName('pin');
    if (pin) pin.visible = false;
    const spoon = mesh.getObjectByName('spoon');
    if (spoon) spoon.visible = false;
    this.scene.add(mesh);
    this.grenades.push({ body, mesh, fuse, lastV: vel.length(), bounces: 0 });
    // spoon flies off
    G.fx.splinters.spawn(pos.x, pos.y, pos.z, vel.x * 0.3 + rand(-1, 1), 2 + rand(0, 1), vel.z * 0.3 + rand(-1, 1), 0.008, 0.05, 0.016, 0x8a8e94);
  }

  fire(spec: ProjSpec, pos: THREE.Vector3, dir: THREE.Vector3, speed: number) {
    let mesh: THREE.Object3D;
    if (spec.kind === 'arrow' || spec.kind === 'lightArrow') {
      const light = spec.kind === 'lightArrow';
      mesh = new THREE.Mesh(this.arrowGeo, light ? new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.4, 1.4) }) : mat(spec.explosive ? C.BLACK : 0xb08050));
      if (spec.explosive) {
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.06), mat(C.RED, 0x300000));
        tip.position.z = 0.64;
        mesh.add(tip);
      }
    } else if (spec.kind === 'rocket') {
      mesh = new THREE.Mesh(this.rocketGeo, mat(C.OD));
    } else {
      mesh = new THREE.Mesh(this.gl40Geo, mat(0x3c4630));
    }
    mesh.castShadow = true;
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.projs.push({
      spec,
      pos: pos.clone(),
      vel: dir.clone().multiplyScalar(speed),
      mesh,
      life: 8,
      budget: spec.pen,
      hitSet: new Set(),
      trailT: 0,
      armed: spec.kind === 'grenade40' ? 2.5 : 0,
    });
  }

  update(dt: number) {
    // hand grenades
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;
      const t = g.body.translation();
      const r = g.body.rotation();
      g.mesh.position.set(t.x, t.y, t.z);
      g.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      const v = g.body.linvel();
      const sp = Math.hypot(v.x, v.y, v.z);
      if (g.lastV - sp > 1.2 && g.bounces < 6) {
        g.bounces++;
        G.audio?.play('grenadeBounce', { x: t.x, y: t.y, z: t.z, volume: Math.min(1, (g.lastV - sp) / 6) });
      }
      g.lastV = sp;
      if (t.y < -2) g.fuse = 0;
      if (g.fuse <= 0) {
        G.physics.world.removeRigidBody(g.body);
        this.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
        G.explosions.explode(t.x, Math.max(t.y, 0.2), t.z, 7.5, 75, { source: 'player', player: true, gore: 1, big: true, weapon: 'grenade', selfMul: 0.4 });
      }
    }
    // flying projectiles
    const dir = new THREE.Vector3();
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      p.life -= dt;
      const s = p.spec;
      p.vel.y -= 9.81 * s.gravity * dt;
      if (s.kind === 'rocket') {
        // rocket motor: slight acceleration and wobble
        p.vel.multiplyScalar(1 + dt * 0.6);
        p.vel.x += rand(-1, 1) * dt * 2;
        p.vel.y += rand(-1, 1) * dt * 2;
      }
      const step = p.vel.length() * dt;
      dir.copy(p.vel).normalize();
      const res = this.sweep(p, dir, step);
      if (res === 'dead') {
        this.scene.remove(p.mesh);
        this.projs.splice(i, 1);
        continue;
      }
      p.pos.addScaledVector(dir, step);
      p.mesh.position.copy(p.pos);
      p.mesh.lookAt(p.pos.x + dir.x, p.pos.y + dir.y, p.pos.z + dir.z);
      p.armed -= step;
      // trails
      p.trailT -= dt;
      if (p.trailT <= 0) {
        if (s.kind === 'rocket') {
          p.trailT = 0.012;
          G.fx.smoke.emit(p.pos.x, p.pos.y, p.pos.z, rand(-0.3, 0.3), rand(0, 0.4), rand(-0.3, 0.3), rand(1.2, 2.4), 0.12, 1.1, 0.7, 0.7, 0.68, 0.55, 0.6, 0.6, 0.6, 0, 1.5, -0.03, rand(0, 6), rand(-1, 1));
          G.fx.fire.emit(p.pos.x - dir.x * 0.2, p.pos.y - dir.y * 0.2, p.pos.z - dir.z * 0.2, -dir.x * 3, -dir.y * 3, -dir.z * 3, 0.08, 0.25, 0.05, 3.5, 2.5, 1, 1, 2, 0.5, 0.1, 0, 2, 0);
          G.fx.lights.flash(p.pos.x, p.pos.y, p.pos.z, 0xffa050, 6, 8, 0.05);
        } else if (s.kind === 'grenade40') {
          p.trailT = 0.03;
          G.fx.smoke.emit(p.pos.x, p.pos.y, p.pos.z, 0, 0.1, 0, 0.5, 0.04, 0.25, 0.8, 0.8, 0.8, 0.3, 0.8, 0.8, 0.8, 0, 1, 0, 0, 0);
        } else if (s.kind === 'lightArrow') {
          p.trailT = 0.008;
          G.fx.flashes.emit(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.25, 0.25, 0.02, 3, 2.4, 0.8, 1, 2, 1, 0.2, 0);
          G.fx.sparksP.emit(p.pos.x, p.pos.y, p.pos.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), 0.3, 0.02, 0.01, 3, 2.4, 1, 1, 2, 1, 0.3, 1, 1, 0.2);
        } else if (s.explosive) {
          p.trailT = 0.02;
          G.fx.sparksP.emit(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.15, 0.015, 0.01, 3, 1, 0.3, 1, 2, 0.5, 0.1, 1, 0, 0);
        }
      }
      if (p.life <= 0 || p.pos.y < -1) {
        this.scene.remove(p.mesh);
        this.projs.splice(i, 1);
      }
    }
    // stuck arrows follow their bodies
    for (let i = this.stuck.length - 1; i >= 0; i--) {
      const s = this.stuck[i];
      if (!s.owner) continue;
      let pos: Float32Array | null = null;
      let quat: Float32Array | null = null;
      let o = s.owner;
      if (o.z) {
        if (o.z.alive) {
          pos = o.z.partPos;
          quat = o.z.partQuat;
          if (o.z.state === 'down' && o.z.ragdoll) {
            pos = o.z.ragdoll.partPos;
            quat = o.z.ragdoll.partQuat;
          }
        } else if (o.z.deathRagdoll) {
          s.owner = o = { r: o.z.deathRagdoll };
        } else {
          s.owner = null;
          continue;
        }
      }
      if (o.r) {
        if (o.r.corpse) s.owner = o = { c: o.r.corpse };
        else if (!o.r.has(s.part)) {
          this.scene.remove(s.mesh);
          this.stuck.splice(i, 1);
          continue;
        } else {
          pos = o.r.partPos;
          quat = o.r.partQuat;
        }
      }
      if (o.c) {
        if (o.c.woke) s.owner = { r: o.c.woke };
        else if (!o.c.alive) {
          this.scene.remove(s.mesh);
          this.stuck.splice(i, 1);
          continue;
        } else {
          pos = o.c.partPos;
          quat = o.c.partQuat;
        }
      }
      if (!pos || !quat) continue;
      const k = s.part;
      qRot(_p3, 0, quat, k * 4, s.lp.x, s.lp.y, s.lp.z);
      s.mesh.position.set(pos[k * 3] + _p3[0], pos[k * 3 + 1] + _p3[1], pos[k * 3 + 2] + _p3[2]);
      _b[0] = s.lq.x;
      _b[1] = s.lq.y;
      _b[2] = s.lq.z;
      _b[3] = s.lq.w;
      qMul(_a, 0, quat, k * 4, _b, 0);
      s.mesh.quaternion.set(_a[0], _a[1], _a[2], _a[3]);
    }
  }

  /** Swept collision for a projectile step. */
  private sweep(p: Proj, dir: THREE.Vector3, step: number): 'ok' | 'dead' {
    const s = p.spec;
    const o = p.pos;
    zh.length = 0;
    G.zombies.rayHits(o.x, o.y, o.z, dir.x, dir.y, dir.z, step + 0.05, zh);
    zh.sort((a, b) => a.t - b.t);
    const wh = G.physics.castRay(o.x, o.y, o.z, dir.x, dir.y, dir.z, step + 0.05, s.kind === 'rocket' || s.kind === 'grenade40' ? GROUPS.rayGround : GROUPS.rayWorldOnly);
    const worldT = wh ? wh.t : Infinity;
    for (const h of zh) {
      if (h.t > worldT) break;
      if (p.hitSet.has(h.z)) continue;
      p.hitSet.add(h.z);
      const hx = o.x + dir.x * h.t;
      const hy = o.y + dir.y * h.t;
      const hz = o.z + dir.z * h.t;
      if (s.explosive && (s.kind !== 'grenade40' || p.armed <= 0)) {
        G.explosions.explode(hx, hy, hz, s.explosive.radius, s.explosive.damage, { source: 'player', gore: 1, big: s.kind === 'rocket', weapon: s.weapon, selfMul: 0.5 });
        return 'dead';
      }
      if (s.kind === 'grenade40') {
        // unarmed 40mm: thunk
        G.zombies.damage(h.z, { damage: 12, part: h.part, x: hx, y: hy, z: hz, dx: dir.x, dy: dir.y, dz: dir.z, stopping: 200, pen: 0, kind: 'bullet', weapon: s.weapon });
        return 'dead';
      }
      const z = h.z;
      const killed = G.zombies.damage(z, { damage: s.damage, part: h.part, x: hx, y: hy, z: hz, dx: dir.x, dy: dir.y, dz: dir.z, stopping: s.stopping, pen: p.budget, kind: 'arrow', weapon: s.weapon, gore: 0.2 });
      G.ballistics?.onHitZombie?.(z, killed, h.part === P.Head);
      if (s.fire) G.zombies.ignite(z, 8, 4, s.weapon);
      p.budget -= z.type.toughness;
      if (s.explosive) {
        G.explosions.explode(hx, hy, hz, s.explosive.radius, s.explosive.damage, { source: 'player', gore: 1, weapon: s.weapon, selfMul: 0.5 });
        return 'dead';
      }
      if (p.budget <= 0 && s.kind === 'arrow') {
        this.stick(p, z, h.part, hx, hy, hz, dir);
        return 'dead';
      }
    }
    if (wh && worldT <= step + 0.05) {
      const ix = o.x + dir.x * worldT;
      const iy = o.y + dir.y * worldT;
      const iz = o.z + dir.z * worldT;
      if (s.explosive && (s.kind !== 'grenade40' || p.armed <= 0 || s.kind === 'grenade40')) {
        G.explosions.explode(ix, Math.max(0.15, iy), iz, s.explosive.radius, s.explosive.damage, { source: 'player', gore: 1, big: s.kind === 'rocket', weapon: s.weapon, selfMul: 0.5 });
        return 'dead';
      }
      G.fx.impact(ix, iy + 0.01, iz, wh.nx, wh.ny, wh.nz, Math.abs(ix) < 5 ? 'asphalt' : 'dirt');
      if (s.kind === 'arrow') {
        // stick in the ground
        const m = p.mesh;
        m.position.set(ix - dir.x * 0.25, iy - dir.y * 0.25, iz - dir.z * 0.25);
        m.lookAt(ix + dir.x, iy + dir.y, iz + dir.z);
        this.stuck.push({ mesh: m, owner: null, part: 0, lp: new THREE.Vector3(), lq: new THREE.Quaternion() });
        this.trimStuck();
        G.audio?.play('arrowThud', { x: ix, y: iy, z: iz });
        return 'dead';
      }
      if (s.kind === 'lightArrow') {
        G.fx.sparks(ix, iy + 0.05, iz, 0, 1, 0, 14, 5);
        G.fx.addFirePatch(ix, iz, 0.8, 3, 8, s.weapon);
      }
      return 'dead';
    }
    return 'ok';
  }

  private stick(p: Proj, z: Zombie, part: number, hx: number, hy: number, hz: number, dir: THREE.Vector3) {
    const m = p.mesh;
    const pos = z.partPos;
    const quat = z.partQuat;
    // arrow center pushed slightly into the body
    const wx = hx - dir.x * 0.35;
    const wy = hy - dir.y * 0.35;
    const wz = hz - dir.z * 0.35;
    qRotInv(_p3, 0, quat, part * 4, wx - pos[part * 3], wy - pos[part * 3 + 1], wz - pos[part * 3 + 2]);
    const lp = new THREE.Vector3(_p3[0], _p3[1], _p3[2]);
    m.position.set(wx, wy, wz);
    m.lookAt(wx + dir.x, wy + dir.y, wz + dir.z);
    const pq = new THREE.Quaternion(quat[part * 4], quat[part * 4 + 1], quat[part * 4 + 2], quat[part * 4 + 3]);
    const lq = pq.invert().multiply(m.quaternion);
    this.stuck.push({ mesh: m, owner: { z }, part, lp, lq });
    this.trimStuck();
  }

  private trimStuck() {
    while (this.stuck.length > 220) {
      const s = this.stuck.shift()!;
      this.scene.remove(s.mesh);
    }
  }

  get liveGrenades() {
    return this.grenades.length;
  }

  clear() {
    for (const g of this.grenades) {
      try {
        G.physics.world.removeRigidBody(g.body);
      } catch {
        /* reset */
      }
      this.scene.remove(g.mesh);
    }
    for (const p of this.projs) this.scene.remove(p.mesh);
    for (const s of this.stuck) this.scene.remove(s.mesh);
    this.grenades = [];
    this.projs = [];
    this.stuck = [];
  }
}
