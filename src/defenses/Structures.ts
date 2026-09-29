import * as THREE from 'three';
import { G } from '../core/G';
import { GROUPS, RAPIER } from '../physics/Physics';
import { clamp, rand, wrapAngle } from '../core/math';
import { ModelBuilder } from '../weapons/ModelBuilder';
import { buildWeaponModel } from '../weapons/models';
import { WEAPON_MAP, statsFor } from '../weapons/defs';
import { randomCone } from '../weapons/Ballistics';
import { ARENA } from '../world/config';
import { DEFENSE_MAP, DefenseDef } from './defs';
import type { Zombie } from '../zombies/Zombie';

let sid = 1;

interface TurretState {
  weaponId: string;
  level: number;
  s: ReturnType<typeof statsFor>;
  ammo: number;
  cooldown: number;
  reload: number;
  target: Zombie | null;
  retarget: number;
  yaw: number;
  pitch: number;
  model: THREE.Object3D;
  muzzle: THREE.Object3D;
  spin: number;
  kick: number;
}

export class Structure {
  readonly id = sid++;
  hp: number;
  maxHp: number;
  alive = true;
  readonly group = new THREE.Group();
  body: RAPIER.RigidBody | null = null;
  pieces: THREE.Mesh[] = [];
  wobble = 0;
  wobbleV = 0;
  fullyBlocking = false;
  trapUses = 0;
  trapCd = 0;
  held: Zombie | null = null;
  heldT = 0;
  tick = 0;
  turret: TurretState | null = null;
  mb: ModelBuilder;
  bloodDecals = 0;
  constructor(readonly def: DefenseDef, public x: number, public z: number, public yaw: number, hpFrac = 1) {
    this.maxHp = def.hp;
    this.hp = def.hp * hpFrac;
    this.mb = new ModelBuilder();
    def.build(this.mb);
    this.group.add(this.mb.root);
    this.group.position.set(x, 0, z);
    this.group.rotation.y = yaw;
    this.mb.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        if (m.userData.breakAt !== undefined) this.pieces.push(m);
      }
    });
    this.trapUses = def.trap?.uses ?? 0;
  }
  /** Distance from a point to the footprint (2D), negative inside. */
  dist(px: number, pz: number) {
    const c = Math.cos(-this.yaw);
    const s = Math.sin(-this.yaw);
    const dx = px - this.x;
    const dz = pz - this.z;
    const lx = dx * c + dz * s;
    const lz = -dx * s + dz * c;
    const qx = Math.abs(lx) - this.def.hw;
    const qz = Math.abs(lz) - this.def.hd;
    const ox = Math.max(qx, 0);
    const oz = Math.max(qz, 0);
    return Math.hypot(ox, oz) + Math.min(Math.max(qx, qz), 0);
  }
}

interface Debris {
  mesh: THREE.Object3D;
  body: RAPIER.RigidBody;
  t: number;
  hx: number;
  hy: number;
  hz: number;
}

const HOLO_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vW;
void main(){ vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const HOLO_FRAG = /* glsl */ `
uniform vec3 color; uniform float time;
varying vec3 vN; varying vec3 vW;
void main(){
  float scan = 0.55 + 0.45 * step(0.5, fract(vW.y * 12.0 - time * 2.0));
  float rim = pow(1.0 - abs(vN.z), 1.5);
  gl_FragColor = vec4(color * (0.6 + rim * 1.6) * scan, 0.42 + rim * 0.3);
}`;

export class Structures {
  list: Structure[] = [];
  private debris: Debris[] = [];
  maxZ = -100;
  private holoMat: THREE.ShaderMaterial;
  onDestroyed: ((s: Structure) => void) | null = null;
  private near: Zombie[] = [];

  constructor(private scene: THREE.Scene) {
    this.holoMat = new THREE.ShaderMaterial({
      vertexShader: HOLO_VERT,
      fragmentShader: HOLO_FRAG,
      uniforms: { color: { value: new THREE.Color(0.3, 1.2, 1.6) }, time: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }

  holoMaterial(valid: boolean) {
    (this.holoMat.uniforms.color.value as THREE.Color).setRGB(valid ? 0.3 : 1.8, valid ? 1.2 : 0.25, valid ? 1.6 : 0.2);
    return this.holoMat;
  }

  /** Build a hologram preview group for a defense id (optionally with a turret weapon). */
  buildPreview(defId: string, weaponId?: string) {
    const def = DEFENSE_MAP[defId];
    const mb = new ModelBuilder();
    def.build(mb);
    if (def.kind === 'turret' && weaponId) {
      const wm = buildWeaponModel(weaponId, []);
      wm.mb.root.position.set(0, 0.05, 0.05);
      mb.anchors.mount?.add(wm.mb.root);
    }
    mb.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = this.holoMat;
    });
    return mb.root;
  }

  place(defId: string, x: number, z: number, yaw: number, hpFrac = 1, weaponId?: string, weaponLevel = 0): Structure {
    const def = DEFENSE_MAP[defId];
    const s = new Structure(def, x, z, yaw, hpFrac);
    this.scene.add(s.group);
    if (def.kind === 'barrier' || def.kind === 'turret') {
      const w = G.physics.world;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const rb = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, 0, z).setRotation(q));
      w.createCollider(
        RAPIER.ColliderDesc.cuboid(def.hw, def.height / 2, def.hd).setTranslation(0, def.height / 2, 0).setCollisionGroups(GROUPS.struct).setFriction(0.4),
        rb,
      );
      s.body = rb;
    }
    if (def.kind === 'turret' && weaponId) {
      const wdef = WEAPON_MAP[weaponId];
      const st = statsFor(wdef, weaponLevel);
      const wm = buildWeaponModel(weaponId, st.visual);
      wm.mb.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      const mount = s.mb.anchors.mount;
      // weapon points -Z in its space; turret "forward" is -Z too
      wm.mb.root.position.set(0, 0.05, 0.05);
      mount.add(wm.mb.root);
      const tt = def.turret!;
      s.turret = {
        weaponId,
        level: weaponLevel,
        s: st,
        ammo: Math.round(st.mag * tt.magMul),
        cooldown: 0,
        reload: 0,
        target: null,
        retarget: 0,
        yaw: 0,
        pitch: 0,
        model: wm.mb.root,
        muzzle: wm.mb.anchors.muzzle,
        spin: 0,
        kick: 0,
      };
      s.group.rotation.y = 0;
      s.yaw = yaw;
      s.turret.yaw = yaw;
    }
    this.list.push(s);
    this.recompute();
    G.audio?.play('placeStructure', { x, y: 0.5, z, volume: 0.9 });
    for (let i = 0; i < 10; i++) G.fx.dust.emit(x + rand(-def.hw, def.hw), 0.1, z + rand(-def.hd, def.hd), rand(-0.6, 0.6), rand(0.2, 0.6), rand(-0.6, 0.6), rand(0.6, 1), 0.3, 1.1, 0.55, 0.5, 0.4, 0.5, 0.55, 0.5, 0.4, 0, 2, 0);
    return s;
  }

  /** Recompute flow-field costs and bookkeeping after changes. */
  recompute() {
    const ff = G.zombies.flow;
    ff.resetCosts();
    this.maxZ = -100;
    for (const s of this.list) {
      if (!s.alive) continue;
      this.maxZ = Math.max(this.maxZ, s.z + s.def.hw);
      if (s.def.kind === 'barrier' || s.def.kind === 'turret') {
        ff.addRect(s.x, s.z, s.def.hw, s.def.hd, -s.yaw, 8 + s.hp / 60);
      }
    }
    // a barrier line is "fully blocking" when the corridor is walled across
    for (const s of this.list) s.fullyBlocking = false;
    const lines = new Map<number, Structure[]>();
    for (const s of this.list) {
      if (!s.alive || s.def.kind !== 'barrier') continue;
      const key = Math.round(s.z / 3);
      if (!lines.has(key)) lines.set(key, []);
      lines.get(key)!.push(s);
    }
    for (const arr of lines.values()) {
      let covered = 0;
      for (const s of arr) covered += s.def.hw * 2 * Math.abs(Math.cos(s.yaw)) + s.def.hd * 2 * Math.abs(Math.sin(s.yaw));
      if (covered > ARENA.halfWidth * 2 * 0.7) for (const s of arr) s.fullyBlocking = true;
    }
  }

  /** Structure physically blocking this zombie's way, if any. */
  blockingFor(z: Zombie, dirX: number, dirZ: number): Structure | null {
    const r = z.type.body.radius * z.scale + 0.35;
    let best: Structure | null = null;
    let bd = r;
    for (const s of this.list) {
      if (!s.alive || s.def.kind === 'trap') continue;
      const d = s.dist(z.x, z.z);
      if (d > bd) continue;
      const tx = s.x - z.x;
      const tz = s.z - z.z;
      const l = Math.hypot(tx, tz) || 1;
      // the structure should be roughly ahead, or we are pressed against it
      const ahead = (tx * dirX + tz * dirZ) / l;
      const moving = Math.hypot(z.vx, z.vz);
      if (ahead < 0.05 && moving > z.speed * 0.4) continue;
      bd = d;
      best = s;
    }
    return best;
  }

  /** Zombie (or explosion) damage. */
  damage(s: Structure, amount: number, zombie?: Zombie) {
    if (!s.alive) return;
    s.hp -= amount;
    s.wobbleV += Math.min(4, amount / 12) * (Math.random() < 0.5 ? -1 : 1);
    if (zombie && s.def.thorns) {
      G.zombies.damage(zombie, {
        damage: s.def.thorns, part: 1, x: zombie.x, y: zombie.y + 1, z: zombie.z, dx: zombie.x - s.x, dy: 0, dz: zombie.z - s.z,
        stopping: 30, pen: 0, kind: 'melee', weapon: s.def.id,
      });
    }
    const frac = s.hp / s.maxHp;
    for (const p of s.pieces) {
      if (p.parent && p.userData.breakAt > 0 && frac <= p.userData.breakAt && !p.userData.broken) {
        p.userData.broken = true;
        this.detach(s, p, zombie);
      }
    }
    if (s.hp <= 0) this.destroy(s, zombie);
  }

  private detach(s: Structure, p: THREE.Mesh, zombie?: Zombie) {
    // convert a piece into a physics debris body
    p.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    p.matrixWorld.decompose(pos, q, scl);
    p.removeFromParent();
    p.position.copy(pos);
    p.quaternion.copy(q);
    p.scale.copy(scl);
    this.scene.add(p);
    this.wreck.push(p);
    while (this.wreck.length > 900) this.scene.remove(this.wreck.shift()!);
    const g = p.geometry as THREE.BufferGeometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox!;
    const hx = Math.max(0.02, ((bb.max.x - bb.min.x) / 2) * scl.x);
    const hy = Math.max(0.02, ((bb.max.y - bb.min.y) / 2) * scl.y);
    const hz = Math.max(0.02, ((bb.max.z - bb.min.z) / 2) * scl.z);
    const w = G.physics.world;
    let vx = rand(-1.5, 1.5);
    let vz = rand(-1.5, 1.5);
    if (zombie) {
      const dx = s.x - zombie.x;
      const dz = s.z - zombie.z;
      const l = Math.hypot(dx, dz) || 1;
      vx += (dx / l) * 2.5;
      vz += (dz / l) * 2.5;
    }
    const body = w.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation(q)
        .setLinvel(vx, rand(1, 3), vz)
        .setAngvel({ x: rand(-4, 4), y: rand(-4, 4), z: rand(-4, 4) }),
    );
    w.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setDensity(s.def.material === 'concrete' ? 2200 : s.def.material === 'sand' ? 1400 : 600).setCollisionGroups(GROUPS.debris).setFriction(0.8), body);
    this.debris.push({ mesh: p, body, t: 0, hx, hy, hz });
    const mat = s.def.material;
    const c = mat === 'wood' ? 0x8a5a30 : mat === 'concrete' ? 0x9a9a96 : mat === 'sand' ? 0xb8a878 : 0x6a7078;
    for (let i = 0; i < 6; i++) G.fx.splinters.spawn(pos.x, pos.y, pos.z, rand(-2, 2), rand(1, 4), rand(-2, 2), rand(0.02, 0.05), rand(0.02, 0.05), rand(0.05, 0.16), c);
    if (mat === 'sand' || mat === 'concrete') for (let i = 0; i < 6; i++) G.fx.dust.emit(pos.x, pos.y, pos.z, rand(-1, 1), rand(0, 1), rand(-1, 1), rand(0.8, 1.5), 0.3, 1.4, 0.6, 0.55, 0.45, 0.6, 0.6, 0.55, 0.45, 0, 1.5, -0.02);
    if (mat === 'metal') G.fx.sparks(pos.x, pos.y, pos.z, 0, 1, 0, 10);
    G.audio?.play('structBreak_' + mat, { x: pos.x, y: pos.y, z: pos.z });
    while (this.debris.length > 60) this.settleDebris(this.debris[0]);
  }

  private settleDebris(d: Debris) {
    try {
      G.physics.world.removeRigidBody(d.body);
    } catch {
      /* reset */
    }
    const i = this.debris.indexOf(d);
    if (i >= 0) this.debris.splice(i, 1);
    // the mesh stays where it landed (persistent wreckage)
  }

  destroy(s: Structure, zombie?: Zombie) {
    if (!s.alive) return;
    s.alive = false;
    for (const p of [...s.pieces]) if (p.parent && !p.userData.broken) {
      p.userData.broken = true;
      this.detach(s, p, zombie);
    }
    // everything else (non-piece meshes) also breaks off
    const rest: THREE.Mesh[] = [];
    s.mb.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) rest.push(o as THREE.Mesh);
    });
    for (const m of rest) this.detach(s, m, zombie);
    if (s.body) G.physics.world.removeRigidBody(s.body);
    s.body = null;
    this.scene.remove(s.group);
    if (s.def.kind === 'turret') G.explosions.explode(s.x, 1, s.z, 3, 25, { source: 'env', player: true, gore: 0.5 });
    if (s.def.trap?.type === 'explosive') this.detonate(s);
    this.list = this.list.filter((x) => x !== s);
    this.recompute();
    this.onDestroyed?.(s);
  }

  private detonate(s: Structure) {
    const t = s.def.trap!;
    s.alive = false;
    G.explosions.explode(s.x, 0.6, s.z, t.radius!, t.damage!, { source: 'player', player: true, gore: 1, big: true, fire: s.def.id === 'explosiveTrap', weapon: s.def.id, selfMul: 0.6 });
  }

  explosionDamage(x: number, z: number, radius: number, damage: number) {
    for (const s of [...this.list]) {
      const d = Math.max(0, s.dist(x, z));
      if (d > radius) continue;
      const f = 1 - d / radius;
      if (s.def.trap?.type === 'explosive' && s.alive) {
        this.list = this.list.filter((q) => q !== s);
        this.scene.remove(s.group);
        setTimeout(() => this.detonate(s), 120);
        continue;
      }
      this.damage(s, damage * f * 2.2);
    }
  }

  /** Ray check against shootable structures (explosive barrels). */
  shootables(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number) {
    let best: Structure | null = null;
    let bt = maxT;
    for (const s of this.list) {
      if (s.def.trap?.type !== 'explosive') continue;
      // sphere approx
      const cx = s.x - ox;
      const cy = 0.5 - oy;
      const cz = s.z - oz;
      const t = cx * dx + cy * dy + cz * dz;
      if (t < 0 || t > bt) continue;
      const px = cx - dx * t;
      const py = cy - dy * t;
      const pz = cz - dz * t;
      if (px * px + py * py + pz * pz < 0.7 * 0.7) {
        bt = t;
        best = s;
      }
    }
    return best ? { s: best, t: bt } : null;
  }

  triggerExplosive(s: Structure) {
    this.list = this.list.filter((q) => q !== s);
    this.scene.remove(s.group);
    this.detonate(s);
    this.recompute();
  }

  update(dt: number) {
    this.holoMat.uniforms.time.value = G.time;
    for (const s of [...this.list]) {
      if (!s.alive) continue;
      // wobble
      s.wobbleV += (-s.wobble * 220 - s.wobbleV * 9) * dt;
      s.wobble += s.wobbleV * dt;
      if (!s.turret) {
        s.group.rotation.x = s.wobble * 0.012;
        s.group.rotation.z = s.wobble * 0.008;
      }
      if (s.def.trap) this.updateTrap(s, dt);
      if (s.turret) this.updateTurret(s, dt);
    }
    // debris
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt;
      const t = d.body.translation();
      const r = d.body.rotation();
      d.mesh.position.set(t.x, t.y, t.z);
      d.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      if ((d.t > 2.5 && d.body.isSleeping()) || d.t > 7) this.settleDebris(d);
    }
  }

  private updateTrap(s: Structure, dt: number) {
    const t = s.def.trap!;
    s.trapCd -= dt;
    s.tick -= dt;
    if (t.type === 'beartrap') {
      const jawA = s.mb.parts.jawA;
      const jawB = s.mb.parts.jawB;
      const closed = s.held !== null || s.trapCd > 0;
      if (jawA && jawB) {
        jawA.rotation.x = closed ? -1.2 : 0;
        jawB.rotation.x = closed ? 1.2 : 0;
      }
      if (s.held) {
        s.heldT -= dt;
        if (!s.held.alive || s.heldT <= 0) {
          s.held = null;
          s.trapCd = 1.5;
          if (s.trapUses <= 0) this.destroy(s);
        } else {
          s.held.trappedT = Math.max(s.held.trappedT, 0.1);
          s.held.x = s.x;
        }
        return;
      }
      if (s.trapCd > 0) return;
    }
    if (s.tick > 0 && t.type !== 'mine' && t.type !== 'explosive' && t.type !== 'beartrap') return;
    const tick = 0.2;
    if (t.type !== 'mine' && t.type !== 'explosive' && t.type !== 'beartrap') s.tick = tick;
    G.zombies.queryRadius(s.x, s.z, Math.max(s.def.hw, s.def.hd) + 0.8, this.near);
    for (const z of this.near) {
      const r = z.type.body.radius * z.scale;
      const inside = s.dist(z.x, z.z) < r * 0.6;
      if (t.type === 'explosive') {
        if (s.dist(z.x, z.z) < 1.4) {
          this.triggerExplosive(s);
          return;
        }
        continue;
      }
      if (!inside) continue;
      if (t.type === 'mine') {
        this.list = this.list.filter((q) => q !== s);
        this.scene.remove(s.group);
        G.explosions.explode(s.x, 0.3, s.z, t.radius!, t.damage!, { source: 'player', player: true, gore: 1, big: false, weapon: 'landMine', selfMul: 0.6 });
        this.recompute();
        return;
      }
      if (t.type === 'beartrap') {
        if (z.type.id === 'boss' || z.type.id === 'brute') continue;
        s.held = z;
        s.heldT = t.hold!;
        s.trapUses--;
        z.trappedT = t.hold!;
        G.zombies.damage(z, { damage: t.damage!, part: 8, x: s.x, y: 0.2, z: s.z, dx: 0, dy: 1, dz: 0, stopping: 0, pen: 0, kind: 'melee', weapon: 'bearTrap' });
        G.audio?.play('bearTrap', { x: s.x, y: 0.2, z: s.z });
        return;
      }
      // spikes / wire
      if (t.slow) {
        z.slow = Math.min(z.slow, t.slow);
        z.slowT = 0.3;
      }
      if (t.dps) {
        G.zombies.damage(z, { damage: t.dps * tick, part: 8, x: z.x, y: 0.2, z: z.z, dx: 0, dy: 1, dz: 0, stopping: 0, pen: 0, kind: 'melee', weapon: s.def.id, noBlood: Math.random() < 0.6 });
      }
      if (t.wear) {
        s.hp -= t.wear * tick;
        if (s.hp <= 0) {
          this.destroy(s);
          return;
        }
      }
    }
  }

  private updateTurret(s: Structure, dt: number) {
    const tr = s.turret!;
    const tt = s.def.turret!;
    const st = tr.s;
    tr.cooldown -= dt;
    tr.retarget -= dt;
    tr.kick = Math.max(0, tr.kick - dt * 8);
    if (tr.reload > 0) {
      tr.reload -= dt;
      if (tr.reload <= 0) {
        tr.ammo = Math.round(st.mag * tt.magMul);
        G.audio?.play('magIn', { x: s.x, y: 1, z: s.z, volume: 0.6 });
      }
    }
    if (tr.retarget <= 0 || !tr.target || !tr.target.alive) {
      tr.retarget = 0.25;
      tr.target = G.zombies.nearest(s.x, s.z, tt.range, (z: Zombie) => z.state !== 'down');
    }
    const yawPart = s.mb.parts.yaw;
    const pitchPart = s.mb.parts.pitch;
    let aligned = false;
    if (tr.target) {
      const z = tr.target;
      const aimY = z.y + (z.type.body.id === 'dog' ? 0.5 : 1.15) * z.scale;
      const dx = z.x - s.x;
      const dz = z.z - s.z;
      const dy = aimY - 1.15;
      const desiredYaw = Math.atan2(-dx, -dz);
      const desiredPitch = Math.atan2(dy, Math.hypot(dx, dz));
      const turn = (tt.heavy ? 2.6 : 3.4) * dt;
      tr.yaw += clamp(wrapAngle(desiredYaw - tr.yaw), -turn, turn);
      tr.pitch += clamp(desiredPitch - tr.pitch, -turn, turn);
      aligned = Math.abs(wrapAngle(desiredYaw - tr.yaw)) < 0.07;
    }
    if (yawPart) yawPart.rotation.y = tr.yaw;
    if (pitchPart) pitchPart.rotation.x = tr.pitch;
    tr.model.position.z = 0.05 + tr.kick * 0.04;
    const spinPart = tr.model.getObjectByName('spin');
    if (spinPart) spinPart.rotation.z += dt * tr.spin * 60;
    const wantFire = aligned && tr.reload <= 0 && tr.target !== null;
    if (st.mode === 'spin' || st.mode === 'heat') tr.spin = clamp(tr.spin + (wantFire ? dt / 0.8 : -dt / 1.2), 0, 1);
    if (!wantFire) return;
    if ((st.mode === 'spin' || st.mode === 'heat') && tr.spin < 1) return;
    if (tr.cooldown > 0) return;
    if (tr.ammo <= 0) {
      tr.reload = st.reload * 1.4;
      G.audio?.play('magOut', { x: s.x, y: 1, z: s.z, volume: 0.6 });
      return;
    }
    const interval = 60 / (st.rpm * tt.rateMul);
    tr.cooldown = Math.max(interval, st.mode === 'semi' ? 0.12 : 0);
    tr.ammo--;
    tr.kick = 1;
    s.group.updateMatrixWorld(true);
    const mp = tr.muzzle.getWorldPosition(new THREE.Vector3());
    const z = tr.target!;
    const aim = new THREE.Vector3(z.x - mp.x, z.y + 1.1 * z.scale - mp.y, z.z - mp.z).normalize();
    const def = WEAPON_MAP[tr.weaponId];
    const laser = def.category === 'energy';
    if (st.pellets > 1) {
      G.ballistics.spread(mp.x, mp.y, mp.z, aim, st.pellets, st.spread * 1.1, {
        damage: st.damage, pen: st.pen, stopping: st.stopping, range: st.range, kind: 'pellet', weapon: def.id, falloffStart: 8, falloffMin: 0.35, tracer: true, from: mp,
      }, 2);
    } else {
      const d = randomCone(aim, st.spread * 1.3 + 0.5, new THREE.Vector3());
      G.ballistics.ray(mp.x, mp.y, mp.z, d.x, d.y, d.z, {
        damage: st.damage, pen: st.pen, stopping: st.stopping, range: laser ? 200 : st.range, kind: laser ? 'laser' : 'bullet', weapon: def.id,
        tracer: true, from: mp, tracerColor: laser ? 0x40e0ff : 0xffd27a, tracerWidth: laser ? 0.05 : 0.02, ignite: laser ? 2 : undefined,
      });
    }
    if (!laser) G.fx.worldMuzzleFlash(mp.x, mp.y, mp.z, def.id === 'm2' ? 0.8 : 0.45);
    G.audio?.play(def.sound, { x: mp.x, y: mp.y, z: mp.z, pitchVar: 0.05, volume: 0.8 });
    if (def.casing !== 'none' && Math.random() < 0.7) {
      const side = new THREE.Vector3(Math.cos(tr.yaw), 0, -Math.sin(tr.yaw));
      if (def.casing === 'shell') G.fx.shells.spawn(mp.x, mp.y - 0.05, mp.z, side.x * 2, 2, side.z * 2, 0.022, 0.058, 0.022);
      else G.fx.casings.spawn(mp.x, mp.y - 0.05, mp.z, side.x * 2, 2, side.z * 2, 0.011, 0.04, 0.011);
    }
  }

  /** Structure the player is looking at (for pick-up). */
  lookedAt(ox: number, oy: number, oz: number, dx: number, dz: number, maxT = 4) {
    let best: Structure | null = null;
    let bt = maxT;
    for (const s of this.list) {
      for (let t = 0.3; t < bt; t += 0.15) {
        const px = ox + dx * t;
        const pz = oz + dz * t;
        if (s.dist(px, pz) < 0.1) {
          bt = t;
          best = s;
          break;
        }
      }
    }
    void oy;
    return best;
  }

  /** Remove without destruction (pick-up / end of day). Returns hp fraction. */
  remove(s: Structure) {
    if (s.body) G.physics.world.removeRigidBody(s.body);
    s.body = null;
    this.scene.remove(s.group);
    s.alive = false;
    this.list = this.list.filter((x) => x !== s);
    this.recompute();
    return Math.max(0.05, s.hp / s.maxHp);
  }

  clear() {
    for (const s of [...this.list]) {
      if (s.body) {
        try {
          G.physics.world.removeRigidBody(s.body);
        } catch {
          /* reset */
        }
      }
      this.scene.remove(s.group);
    }
    for (const d of this.debris) {
      try {
        G.physics.world.removeRigidBody(d.body);
      } catch {
        /* reset */
      }
      this.scene.remove(d.mesh);
    }
    // also remove persistent wreckage meshes left in the scene
    for (const m of this.wreck) this.scene.remove(m);
    this.wreck = [];
    this.list = [];
    this.debris = [];
    this.maxZ = -100;
  }
  private wreck: THREE.Object3D[] = [];
}
