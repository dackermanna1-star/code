/**
 * Blocks torn out by the tornado. Each piece first orbits the funnel kinematically (spiralling
 * up and out, tumbling, lagging the wind), then is flung out of the vortex: it becomes a Rapier
 * rigid body (or a simple ballistic body without physics) that flies, bounces and settles, then
 * shrinks away. A few full-cube pieces turn into falling-block entities instead and land as
 * real blocks, leaving a debris trail around the damage path.
 */
import * as THREE from 'three';
import type { Game } from '../../game';
import { BLOCKS, T_SOLID } from '../../../world/blocks/registry';
import { createBlockMesh } from '../../../render/blockMesh';
import { blockMaterial } from '../../../physics/materials';
import { GROUP, type PhysBody, type PhysicsWorld } from '../../../physics/rapierWorld';
import { FallingBlockEntity } from '../../../entity/fallingBlock';
import { Mat, matOf } from './materials';

export interface OrbitFrame {
  /** Seconds since the tornado started. */
  t: number;
  strength: number;
  rope: number;
  groundY: number;
  /** Cloud base height above ground. */
  H: number;
  /** Axis centre at height h above the ground. */
  axis(h: number, out: { x: number; z: number }): { x: number; z: number };
  /** Funnel radius at height h above the ground. */
  radius(h: number): number;
  /** Tangential wind at r for height h. */
  windT(r: number, h: number): number;
}

interface Piece {
  obj: THREE.Object3D;
  state: number;
  scale: number;
  flung: boolean;
  // orbit (cylindrical, relative to the funnel axis)
  ang: number;
  r: number;
  h: number;
  rise: number;
  orbitK: number;
  releaseH: number;
  spin: THREE.Vector3;
  spinRate: number;
  prev: THREE.Vector3;
  // flight
  body: PhysBody | null;
  vel: THREE.Vector3;
  age: number;
  life: number;
  shrink: number;
  resting: boolean;
  lost: boolean;
}

const tmp = { x: 0, z: 0 };

export class FlyingDebris {
  readonly scene = new THREE.Scene();
  private pieces: Piece[] = [];
  /** Max orbiting pieces / max flung pieces. */
  maxOrbit = 70;
  maxFlung = 55;
  /** Fraction of flung full cubes that land as real blocks. */
  landChance = 0.12;
  private landers: FallingBlockEntity[] = [];
  private orbiting = 0;

  constructor(private game: Game, private rnd: () => number = Math.random) {
    this.scene.matrixWorldAutoUpdate = true;
  }

  get count() {
    return this.pieces.length;
  }
  get orbitCount() {
    return this.orbiting;
  }
  get canTake() {
    return this.orbiting < this.maxOrbit && !!this.game.renderer;
  }

  /** A block torn out at world (x,y,z), at cylindrical coords (ang, r, h) around the axis. */
  add(state: number, x: number, y: number, z: number, ang: number, r: number, h: number) {
    if (!this.canTake) return false;
    const def = BLOCKS[state >>> 4];
    if (!def) return false;
    const rnd = this.rnd;
    let obj: THREE.Object3D;
    try {
      obj = createBlockMesh(this.game.renderer as any, state, { light: 15 << 12 });
    } catch {
      return false;
    }
    const m = matOf(state);
    const light = m === Mat.Leaves || m === Mat.Plant ? 1.5 : m === Mat.Wood || m === Mat.Built ? 1 : 0.75;
    const scale = m === Mat.Leaves ? 0.45 + rnd() * 0.4 : 0.55 + rnd() * 0.4;
    obj.scale.setScalar(scale);
    obj.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.scene.add(obj);
    const spin = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
    this.pieces.push({
      obj, state, scale, flung: false,
      ang, r: Math.max(0.5, r), h, rise: (2.5 + rnd() * 5) * light, orbitK: 1.2 + rnd() * 1.4, releaseH: 0,
      spin, spinRate: 3 + rnd() * 9, prev: obj.position.clone(),
      body: null, vel: new THREE.Vector3(), age: 0, life: 6 + rnd() * 5, shrink: 1, resting: false, lost: false,
    });
    this.pieces[this.pieces.length - 1].releaseH = 10 + rnd() * 45 * light;
    this.orbiting++;
    return true;
  }

  update(dt: number, f: OrbitFrame | null) {
    const rnd = this.rnd;
    let flung = 0;
    for (const p of this.pieces) if (p.flung) flung++;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      if (!p.flung) {
        if (!f || f.strength < 0.04) {
          this.release(p, f);
          flung++;
          continue;
        }
        // spiral up and out, lagging the wind; heavy pieces sink when the wind weakens
        p.h += p.rise * dt * (f.strength - 0.25) * 1.6;
        const target = f.radius(Math.max(0, p.h)) * p.orbitK + 1.2;
        p.r += (target - p.r) * (1 - Math.exp(-dt * 1.4));
        const vt = f.windT(p.r, p.h) * 0.5;
        p.ang += (vt / Math.max(0.8, p.r)) * dt;
        f.axis(Math.max(0, p.h), tmp);
        p.prev.copy(p.obj.position);
        p.obj.position.set(tmp.x + Math.cos(p.ang) * p.r, f.groundY + p.h, tmp.z + Math.sin(p.ang) * p.r);
        p.obj.rotateOnAxis(p.spin, p.spinRate * dt);
        if (dt > 0) p.vel.subVectors(p.obj.position, p.prev).divideScalar(dt);
        if (p.h > p.releaseH || p.h < -2 || (f.rope > 0.3 && rnd() < dt * 0.6)) {
          if (flung >= this.maxFlung) this.dropOldestFlung();
          this.release(p, f);
          flung++;
        }
        continue;
      }
      // ---- flung
      p.age += dt;
      if (p.body) {
        if (p.body.removed || p.lost) {
          this.kill(i);
          continue;
        }
        p.obj.position.copy(p.body.pos);
        p.obj.quaternion.copy(p.body.quat);
        if (p.body.sleeping) p.age += dt * 2;
      } else if (!p.resting) {
        p.vel.y -= 20 * dt;
        p.vel.multiplyScalar(Math.exp(-0.15 * dt));
        const o = p.obj.position;
        o.addScaledVector(p.vel, dt);
        p.obj.rotateOnAxis(p.spin, p.spinRate * dt);
        const w = this.game.world;
        if (w && T_SOLID[w.getBlock(Math.floor(o.x), Math.floor(o.y - 0.3 * p.scale), Math.floor(o.z)) >>> 4]) {
          o.y = Math.floor(o.y - 0.3 * p.scale) + 1 + 0.3 * p.scale;
          if (p.vel.lengthSq() > 16) {
            p.vel.y = Math.abs(p.vel.y) * 0.3;
            p.vel.x *= 0.5;
            p.vel.z *= 0.5;
          } else p.resting = true;
        }
      }
      if (p.age > p.life) p.shrink -= dt / 0.7;
      if (p.shrink <= 0) {
        this.kill(i);
        continue;
      }
      if (p.shrink < 1) p.obj.scale.setScalar(p.scale * Math.max(0.02, p.shrink * p.shrink));
    }
    // landers that finished
    if (this.landers.length) this.landers = this.landers.filter((e) => !e.removed);
  }

  private dropOldestFlung() {
    for (let i = 0; i < this.pieces.length; i++) {
      if (this.pieces[i].flung) {
        this.kill(i);
        return;
      }
    }
  }

  /** Throw a piece out of the vortex. */
  private release(p: Piece, f: OrbitFrame | null) {
    const rnd = this.rnd;
    p.flung = true;
    this.orbiting--;
    // outward + upward kick on top of the orbital velocity
    const ox = Math.cos(p.ang), oz = Math.sin(p.ang);
    const out = 5 + rnd() * 9;
    p.vel.x += ox * out;
    p.vel.z += oz * out;
    p.vel.y = Math.max(p.vel.y, 0) + 2 + rnd() * 6;
    const lim = 30;
    if (p.vel.length() > lim) p.vel.setLength(lim);
    const def = BLOCKS[p.state >>> 4];
    const g = this.game;
    // a few full cubes land as real blocks
    if (def?.fullCube && f && rnd() < this.landChance && this.landers.length < 24 && g.entities) {
      const e = new FallingBlockEntity(p.state);
      const o = p.obj.position;
      e.setPos(o.x, o.y - 0.49, o.z);
      e.vel.copy(p.vel);
      g.entities.add(e);
      this.landers.push(e);
      p.shrink = 0;
      p.life = 0;
      return;
    }
    const pw = g.physics as PhysicsWorld | null;
    if (pw && def) {
      const pm = blockMaterial(def);
      const h = 0.49 * p.scale;
      try {
        p.body = pw.addBody({
          kind: 'debris',
          position: p.obj.position,
          rotation: p.obj.quaternion,
          linvel: p.vel,
          angvel: { x: (rnd() - 0.5) * 14, y: (rnd() - 0.5) * 14, z: (rnd() - 0.5) * 14 },
          shape: { type: 'box', half: [h, h, h] },
          density: Math.min(pm.density, 1800),
          friction: pm.friction,
          restitution: Math.min(0.5, pm.restitution + 0.05),
          group: GROUP.DEBRIS,
          linearDamping: 0.12,
          angularDamping: 0.3,
          ccd: true,
          buoyancy: pm.density < 1000 ? 1.4 : 0.6,
          owner: { onPhysicsLost: () => (p.lost = true) },
        });
        p.body.userData.sound = def.sound;
        // keep the vortex from re-capturing it right away
        p.body.userData.tornadoIgnore = performance.now() + 2500;
      } catch {
        p.body = null;
      }
    }
  }

  /** Fling everything still orbiting (dissipation). */
  releaseAll() {
    for (const p of this.pieces) if (!p.flung) this.release(p, null);
  }

  private kill(i: number) {
    const p = this.pieces[i];
    this.pieces.splice(i, 1);
    if (!p.flung) this.orbiting--;
    p.obj.removeFromParent();
    if (p.body && !p.body.removed) (this.game.physics as PhysicsWorld | null)?.removeBody(p.body);
  }

  /** Is the body one of ours (and still protected from re-capture)? */
  static ignored(b: PhysBody) {
    const t = b.userData.tornadoIgnore;
    return t !== undefined && performance.now() < t;
  }

  dispose() {
    for (let i = this.pieces.length - 1; i >= 0; i--) this.kill(i);
    this.pieces.length = 0;
    this.orbiting = 0;
    this.scene.clear();
  }
}
