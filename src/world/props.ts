import * as THREE from 'three';
import type { Game } from '../game';
import type { Fighter } from '../combat/fighter';
import { G, groups, RAPIER } from './physics';
import { rand } from '../core/math';
import { Shape } from './euphoria/engine.js';
import { PROP_KINDS, PropKindDef, PropMaterial, staticTexture } from './propLib';

/** A prop as the arena places it. */
export interface PropPlacement {
  kind: string;
  x: number;
  z: number;
  /** Height of the prop's base (0 = on the floor; on a counter, the counter's top). */
  y?: number;
  ry?: number;
  /** Tint (multiplies the prop's colours: oil drums in blue, red, green...). */
  tint?: number;
}

interface KindRT {
  def: PropKindDef;
  meshes: THREE.InstancedMesh[];
  used: number;
  dirty: boolean;
}

export interface Prop {
  kind: string;
  rt: KindRT;
  i: number;
  body: RAPIER.RigidBody;
  broken: boolean;
  lastHit: number;
  half: THREE.Vector3;
  /** Velocity last frame (a sudden change is an impact). */
  pv: THREE.Vector3;
  /** Settled props skip the matrix update. */
  still: number;
}

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

const FRICTION: Record<PropMaterial, number> = { wood: 0.7, metal: 0.5, glass: 0.4, ceramic: 0.6, plastic: 0.5, fabric: 0.9, paper: 0.8, electronics: 0.6, trash: 0.9, rubber: 1.0 };
const LAB_MAT: Record<PropMaterial, string> = { wood: 'wood', metal: 'metal', glass: 'metal', ceramic: 'concrete', plastic: 'wood', fabric: 'flesh', paper: 'wood', electronics: 'metal', trash: 'flesh', rubber: 'flesh' };
/** Kinds big enough that fighters on foot walk round them rather than through them. */
const SOLID = new Set(['armchair', 'coffeetable', 'tableframe', 'cart', 'pallet', 'drum', 'crate']);

/**
 * Dynamic props: anything a fight can knock about. One instanced draw call per kind and layer;
 * Rapier bodies (mirrored into the active-ragdoll world so bodies land on them and shove them);
 * impacts detected from sudden changes in velocity: they clatter, and breakables (glass, ceramic,
 * wood, screens, bags) shatter into lasting debris. Bodies stay, debris stays, nothing respawns.
 */
export class Props {
  list: Prop[] = [];
  private kinds = new Map<string, KindRT>();
  private time = 0;
  constructor(public game: Game) {
    const a = game.arena;
    const place: PropPlacement[] = [...a.propList];
    // (the warehouse and the rooftop place their oil drums and crates by spot)
    const tints = [0x3a5f9a, 0xa0382c, 0x4a7040];
    a.propSpots.drums.forEach(([x, z], i) => place.push({ kind: 'drum', x, z, ry: rand(0, Math.PI), tint: tints[i % 3] }));
    for (const [x, z, y] of a.propSpots.crates) place.push({ kind: 'crate', x, z, y, ry: rand(0, Math.PI) });
    // instance capacity: what's placed, plus room for what breakages leave behind
    const need = new Map<string, number>();
    for (const p of place) {
      need.set(p.kind, (need.get(p.kind) ?? 0) + 1);
      const r = PROP_KINDS[p.kind]?.remains;
      if (r) need.set(r, (need.get(r) ?? 0) + 1);
    }
    for (const [k, n] of need) this.kind(k, n);
    for (const p of place) this.spawn(p);
  }

  private kind(key: string, cap = 8): KindRT {
    let rt = this.kinds.get(key);
    if (rt) return rt;
    const def = PROP_KINDS[key];
    const meshes = def.layers().map((L) => {
      const geo = L.parts.length === 1 ? L.parts[0] : mergeParts(L.parts);
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: L.rough,
        metalness: L.metal ?? 0,
        map: L.map ? L.map() : null,
        transparent: L.opacity !== undefined,
        opacity: L.opacity ?? 1,
        depthWrite: L.opacity === undefined,
        emissive: L.emissive ?? 0x000000,
        emissiveIntensity: L.emissiveIntensity ?? 1,
        emissiveMap: L.emissive && L.map ? L.map() : null,
      });
      const im = new THREE.InstancedMesh(geo, mat, Math.max(1, cap));
      im.count = 0;
      im.castShadow = !L.noShadow;
      im.receiveShadow = true;
      im.frustumCulled = false;
      this.game.scene.add(im);
      return im;
    });
    rt = { def, meshes, used: 0, dirty: true };
    this.kinds.set(key, rt);
    return rt;
  }

  spawn(pl: PropPlacement, vel?: THREE.Vector3, rot?: THREE.Quaternion): Prop | null {
    const g = this.game;
    const def = PROP_KINDS[pl.kind];
    if (!def) return null;
    const rt = this.kind(pl.kind);
    if (rt.used >= rt.meshes[0].instanceMatrix.count) return null;
    const i = rt.used++;
    const half = new THREE.Vector3(...def.half);
    const y = (pl.y ?? 0) + half.y + 0.002;
    const q = rot ?? new THREE.Quaternion().setFromAxisAngle(_v.set(0, 1, 0), pl.ry ?? 0);
    const desc = RAPIER.RigidBodyDesc.dynamic().setTranslation(pl.x, y, pl.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setLinearDamping(0.3).setAngularDamping(0.5);
    if (vel) desc.setLinvel(vel.x, vel.y, vel.z);
    if (def.mass < 1) desc.setCcdEnabled(true);
    const body = g.physics.world.createRigidBody(desc);
    const cd = def.cyl ? RAPIER.ColliderDesc.cylinder(half.y, half.x) : RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z);
    cd.setMass(def.mass).setFriction(def.friction ?? FRICTION[def.material]).setRestitution(def.restitution ?? 0.12).setCollisionGroups(groups(G.PROP, G.STATIC | G.CORPSE | G.RAGDOLL | G.PROP));
    g.physics.world.createCollider(cd, body);
    if (!vel) body.sleep();
    const tint = new THREE.Color(pl.tint ?? 0xffffff);
    for (const im of rt.meshes) {
      im.count = rt.used;
      im.setColorAt(i, tint);
      im.instanceColor!.needsUpdate = true;
    }
    const prop: Prop = { kind: pl.kind, rt, i, body, broken: false, lastHit: -1, half, pv: new THREE.Vector3(), still: 0 };
    this.list.push(prop);
    this.sync(prop);
    // mirror into the active-ragdoll world: bodies land on / tumble over props and shove them back
    if (def.mass >= 1) {
      const r = Math.min(0.1, half.x * 0.4, half.y * 0.4, half.z * 0.4);
      const shape = Shape.box(half.x - r, half.y - r, half.z - r, { radius: r, friction: 0.6, restitution: 0.1, material: LAB_MAT[def.material] });
      const pose = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
      g.euphoria.addProxy(
        shape,
        def.mass,
        () => {
          if (prop.broken) return null;
          const t = body.translation(), bq = body.rotation();
          pose.p.set(t.x, t.y, t.z);
          pose.q.set(bq.x, bq.y, bq.z, bq.w);
          return pose;
        },
        (imp, at) => body.applyImpulseAtPoint({ x: imp.x, y: imp.y, z: imp.z }, { x: at.x, y: at.y, z: at.z }, true),
      );
    }
    return prop;
  }

  /** Show a prop where a replay had it (`shown` false: broken / gone by then). */
  replayPose(p: Prop, pos: THREE.Vector3, quat: THREE.Quaternion, shown: boolean) {
    if (shown) _m.compose(pos, quat, _s);
    for (const im of p.rt.meshes) {
      im.setMatrixAt(p.i, shown ? _m : ZERO);
      im.instanceMatrix.needsUpdate = true;
    }
  }
  /** Back to where the physics has every prop now (after a replay). */
  resyncAll() {
    for (const p of this.list) {
      if (p.broken) for (const im of p.rt.meshes) im.setMatrixAt(p.i, ZERO);
      else this.sync(p);
    }
    for (const rt of this.kinds.values()) for (const im of rt.meshes) im.instanceMatrix.needsUpdate = true;
  }

  private sync(p: Prop) {
    const t = p.body.translation(), r = p.body.rotation();
    _m.compose(_v.set(t.x, t.y, t.z), _q.set(r.x, r.y, r.z, r.w), _s);
    for (const im of p.rt.meshes) im.setMatrixAt(p.i, _m);
    p.rt.dirty = true;
  }

  update(dt: number) {
    const g = this.game;
    this.time += dt;
    // screens show snow
    const st = staticTexture();
    st.offset.set(Math.random(), Math.random());
    for (const p of this.list) {
      if (p.broken) continue;
      const t = p.body.translation();
      if (t.y < -6) {
        // over the rooftop's edge: gone
        this.remove(p);
        continue;
      }
      const lv = p.body.linvel();
      const moving = !p.body.isSleeping() && (Math.abs(lv.x) + Math.abs(lv.y) + Math.abs(lv.z) > 0.002 || p.still < 2);
      if (moving) this.sync(p);
      p.still = moving ? 0 : p.still + 1;
      // live fighters shove props they walk into (no physics bodies for live characters)
      const def = p.rt.def;
      const pr = Math.min(Math.max(p.half.x, p.half.z), 0.5);
      for (const f of g.fighters) {
        if (!f.alive) continue;
        const dx = t.x - f.x, dz = t.z - f.z;
        const d = Math.hypot(dx, dz);
        const minD = f.radius + pr + 0.05;
        if (d < minD && d > 1e-3 && t.y - p.half.y < 1.0) {
          const sp = Math.hypot(f.vx, f.vz);
          const k = ((minD - d) * 30 + sp * 6) * (def.shove ?? 1);
          p.body.applyImpulse({ x: (dx / d) * k * dt * 10, y: 0, z: (dz / d) * k * dt * 10 }, true);
        }
      }
      // impacts: a sudden change of velocity (gravity alone is a fraction of a m/s per frame)
      const dv = Math.hypot(lv.x - p.pv.x, lv.y - p.pv.y, lv.z - p.pv.z);
      p.pv.set(lv.x, lv.y, lv.z);
      if (dv > def.breakDv && this.time > 1) {
        this.shatter(p, dv);
        continue;
      }
      if (dv > 1.3 && this.time - p.lastHit > 0.12 && this.time > 1) {
        p.lastHit = this.time;
        this.clatter(def.material, _v.set(t.x, t.y, t.z), Math.min(1, dv / 6));
      }
    }
    for (const rt of this.kinds.values()) {
      if (!rt.dirty) continue;
      rt.dirty = false;
      for (const im of rt.meshes) im.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Keep a fighter on foot out of the big pieces (couches, carts, drums): they push, it gives a
   * little. `k` < 1 pushes only part of the way this frame (a body just out of a move).
   */
  collideFighter(f: Fighter, k = 1) {
    for (const p of this.list) {
      if (p.broken || !SOLID.has(p.kind)) continue;
      const t = p.body.translation();
      if (t.y - p.half.y > 0.8) continue;
      const pr = Math.min(Math.max(p.half.x, p.half.z), 0.62) * 0.85;
      const dx = f.x - t.x, dz = f.z - t.z;
      const d = Math.hypot(dx, dz);
      const minD = f.radius * 0.8 + pr;
      if (d >= minD || d < 1e-4) continue;
      const push = (minD - d) * 0.85 * Math.max(0.15, k);
      f.x += (dx / d) * push;
      f.z += (dz / d) * push;
    }
  }

  /** Thrown / falling bodies smash breakables they plough into. */
  checkBody(pos: THREE.Vector3, vel: number) {
    if (vel < 2.5) return;
    for (const p of this.list) {
      if (p.broken || p.rt.def.breakDv === Infinity) continue;
      const t = p.body.translation();
      const reach = Math.max(p.half.x, p.half.z) + 0.35;
      if (Math.hypot(t.x - pos.x, t.z - pos.z) < reach && pos.y < t.y + p.half.y + 0.6 && vel > p.rt.def.breakDv * 0.7) this.shatter(p, vel);
    }
  }

  /** Something hit hard near (x, z) at height y (a strike, a slam): knock the props there about. */
  blast(at: THREE.Vector3, radius: number, impulse: number) {
    for (const p of this.list) {
      if (p.broken) continue;
      const t = p.body.translation();
      const dx = t.x - at.x, dz = t.z - at.z;
      const d = Math.hypot(dx, dz);
      if (d > radius) continue;
      const k = impulse * (1 - d / radius) * Math.min(1, p.rt.def.mass / 4 + 0.3);
      p.body.applyImpulse({ x: (dx / (d || 1)) * k, y: k * 0.5, z: (dz / (d || 1)) * k }, true);
    }
  }

  private remove(p: Prop) {
    p.broken = true;
    this.game.physics.world.removeRigidBody(p.body);
    for (const im of p.rt.meshes) im.setMatrixAt(p.i, ZERO);
    p.rt.dirty = true;
  }

  /** Break it: debris that stays, the sound of it, and whatever's left standing. */
  shatter(p: Prop, force = 4) {
    const g = this.game;
    const def = p.rt.def;
    const t = p.body.translation(), r = p.body.rotation();
    const at = new THREE.Vector3(t.x, t.y, t.z);
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const lv = p.body.linvel();
    this.remove(p);
    const size = Math.max(p.half.x, p.half.y, p.half.z);
    const n = Math.round(10 + size * 40);
    g.fx.shatter(at, def.material, def.debris ?? [0x888888], n, size, Math.min(1.5, force / 5));
    g.audio.shatter(def.material, at, Math.min(1, 0.5 + force / 10));
    if (def.material === 'electronics') {
      g.fx.sparks(at, new THREE.Vector3(0, 1, 0), 20);
      g.audio.crack(at);
    }
    g.cam.addTrauma(Math.min(0.25, size * 0.3));
    if (def.remains) this.spawn({ kind: def.remains, x: at.x, z: at.z, y: Math.max(0, at.y - PROP_KINDS[def.remains].half[1] - 0.002) }, new THREE.Vector3(lv.x * 0.5, lv.y * 0.5, lv.z * 0.5), q);
  }

  /** A knock with no break: the material's sound. */
  private clatter(m: PropMaterial, at: THREE.Vector3, vol: number) {
    const a = this.game.audio;
    switch (m) {
      case 'metal':
      case 'electronics':
        a.play('metal_hit', { pos: at, vol: vol * 0.8, pitch: 1.1 });
        break;
      case 'wood':
      case 'paper':
        a.play('wood_break', { pos: at, vol: vol * 0.35, pitch: 1.3 });
        break;
      case 'glass':
      case 'ceramic':
        a.clink(at, vol);
        break;
      default:
        a.thudSoft(at, vol);
    }
  }
}

function mergeParts(parts: THREE.BufferGeometry[]) {
  // (propLib already hands out mergeable parts)
  let count = 0;
  for (const p of parts) count += p.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const size = parts[0].attributes[name].itemSize;
    const arr = new Float32Array(count * size);
    let o = 0;
    for (const p of parts) {
      arr.set(p.attributes[name].array as Float32Array, o);
      o += p.attributes[name].count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}
