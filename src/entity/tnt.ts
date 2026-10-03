/**
 * TNT: block behaviour (flint and steel / fire charge, adjacent fire, redstone power,
 * `fireIgnite` events via ExplosionSystem) and the primed TNT entity — a Rapier rigid body
 * (pushed by players and explosions, tumbles and rolls) with Minecraft's 80-tick fuse, white
 * flashing every 5 ticks and the swell before detonation (power 4).
 */
import * as THREE from 'three';
import { Entity } from './entity';
import { registerEntity } from './manager';
import { BLOCKS, BLOCK_BY_NAME, T_SOLID } from '../world/blocks/registry';
import { addBehavior, behaviorOf } from '../world/blocks/behaviors';
import type { World } from '../world/world';
import { createFragmentGeometry } from '../physics/debris';
import { GROUP, type PhysBody, type PhysicsWorld } from '../physics/rapierWorld';
import { blockMaterial } from '../physics/materials';

const FLASH_VERT = /* glsl */ `
precision highp float;
in vec3 position;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FLASH_FRAG = /* glsl */ `
precision highp float;
uniform float u_flash;
out vec4 o;
void main() { o = vec4(vec3(1.0, 0.97, 0.92) * u_flash, 1.0); }`;
const FLASH_GEO = new THREE.BoxGeometry(1.012, 1.012, 1.012);

export class PrimedTntEntity extends Entity {
  readonly type = 'tnt';
  fuse = 80;
  igniter: Entity | null = null;
  body: PhysBody | null = null;
  readonly quat = new THREE.Quaternion();
  readonly prevQuat = new THREE.Quaternion();
  private flashMesh: THREE.Mesh | null = null;
  private flashMat: THREE.RawShaderMaterial | null = null;
  private partial = 0;

  constructor() {
    super();
    this.width = 0.98;
    this.height = 0.98;
    this.mass = 140;
  }

  override init(game: any, world: World) {
    super.init(game, world);
    const r = game.renderer;
    const st = (BLOCK_BY_NAME.get('tnt')?.id ?? 0) << 4;
    if (r) {
      const g = new THREE.Group();
      const light = world.getLight(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.5), Math.floor(this.pos.z));
      const mesh = new THREE.Mesh(createFragmentGeometry(st, 0, 0, 0, 1, 1, 1, { light }), r.blockMaterials().opaque);
      mesh.frustumCulled = false;
      g.add(mesh);
      this.model = g;
      this.flashMat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: FLASH_VERT, fragmentShader: FLASH_FRAG,
        uniforms: { u_flash: { value: 0 } }, transparent: true, depthWrite: false, depthTest: true,
        blending: THREE.AdditiveBlending,
      });
      this.flashMesh = new THREE.Mesh(FLASH_GEO, this.flashMat);
      this.flashMesh.frustumCulled = false;
      game.entities?.forwardScene?.add(this.flashMesh);
    }
    this.createBody();
  }

  private pw(): PhysicsWorld | null {
    return ((this.game as any)?.physics as PhysicsWorld | null) ?? null;
  }

  private createBody() {
    const pw = this.pw();
    if (!pw || this.body) return;
    const m = blockMaterial(BLOCK_BY_NAME.get('tnt')!);
    this.body = pw.addBody({
      kind: 'tnt', owner: this,
      position: { x: this.pos.x, y: this.pos.y + 0.49, z: this.pos.z },
      linvel: this.vel,
      angvel: { x: (Math.random() - 0.5) * 0.6, y: (Math.random() - 0.5) * 0.6, z: (Math.random() - 0.5) * 0.6 },
      shape: { type: 'box', half: [0.49, 0.49, 0.49] },
      mass: this.mass, friction: m.friction, restitution: m.restitution,
      group: GROUP.TNT, buoyancy: 1.15, angularDamping: 0.4,
    });
    this.body.userData.sound = 'grass';
  }

  onPhysicsLost() {
    this.remove();
  }

  override remove() {
    super.remove();
    if (this.body) {
      this.pw()?.removeBody(this.body);
      this.body = null;
    }
    this.flashMesh?.removeFromParent();
  }

  override tick() {
    super.tick();
    this.fuse--;
    if (this.fuse <= 0) {
      this.remove();
      const ex = (this.game as any).explosions;
      const c = this.body ? this.body.pos : new THREE.Vector3(this.pos.x, this.pos.y + 0.49, this.pos.z);
      ex?.explode(new THREE.Vector3(c.x, c.y - 0.43, c.z), 4, { source: this, attacker: this.igniter });
    }
  }

  override physicsStep(dt: number) {
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    if (!this.body && this.pw()) this.createBody();
    const b = this.body;
    if (b && !b.removed) {
      this.pos.set(b.pos.x, b.pos.y - 0.49, b.pos.z);
      this.quat.copy(b.quat);
      b.linvel(this.vel);
      this.updateBox();
      this.updateEnvironment();
      return;
    }
    // Minecraft TNT motion fallback
    this.updateEnvironment();
    this.vel.y -= 0.04 * 400 * dt;
    this.vel.multiplyScalar(Math.exp(Math.log(0.98) * 20 * dt));
    this.move(this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
    if (this.onGround) {
      this.vel.x *= Math.exp(Math.log(0.7) * 20 * dt);
      this.vel.z *= Math.exp(Math.log(0.7) * 20 * dt);
    }
  }

  override updateVisual(alpha: number, dt: number) {
    if (!this.model) return;
    this.partial = alpha;
    const p = this.renderPos(alpha);
    this.model.position.set(p.x, p.y + 0.49, p.z);
    this.model.quaternion.copy(this.prevQuat).slerp(this.quat, alpha);
    // Minecraft swell in the last 10 ticks
    const left = this.fuse - alpha / 3 + 1;
    let s = 1;
    if (left < 10) {
      let h = Math.max(0, Math.min(1, 1 - left / 10));
      h *= h; h *= h;
      s = 1 + h * 0.3;
    }
    this.model.scale.setScalar(s);
    if (this.flashMesh && this.flashMat) {
      this.flashMesh.position.copy(this.model.position);
      this.flashMesh.quaternion.copy(this.model.quaternion);
      this.flashMesh.scale.setScalar(s);
      const on = Math.floor(this.fuse / 5) % 2 === 0;
      const sky = (this.world.getLight(Math.floor(p.x), Math.floor(p.y + 0.5), Math.floor(p.z)) >>> 12) & 15;
      this.flashMat.uniforms.u_flash.value = on ? 0.35 + (sky / 15) * 2.2 : 0;
    }
    void dt;
  }

  override serialize() {
    return { ...super.serialize(), fuse: this.fuse };
  }
  override deserialize(o: any) {
    super.deserialize(o);
    this.fuse = o.fuse ?? 80;
  }
}

registerEntity('tnt', PrimedTntEntity, 'misc');

/** Set by the ExplosionSystem: prime the TNT block at a position of the active world. */
export const tntHooks: { prime: ((w: World, x: number, y: number, z: number, igniter: Entity | null, fuse?: number) => void) | null } = { prime: null };

const D6: [number, number, number][] = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];

/** Is the block at (x,y,z) receiving redstone power (best effort through block behaviours)? */
export function isBlockPowered(w: World, x: number, y: number, z: number): boolean {
  const rs = (w.systems as any).redstone;
  if (rs?.isPowered) return !!rs.isPowered(x, y, z);
  if (rs?.powerAt) return rs.powerAt(x, y, z) > 0;
  for (let d = 0; d < 6; d++) {
    const [dx, dy, dz] = D6[d];
    const nx = x + dx, ny = y + dy, nz = z + dz;
    const st = w.getBlock(nx, ny, nz);
    if (!st) continue;
    const beh = behaviorOf(st >>> 4);
    const toward = d ^ 1; // Dir from the neighbour back to us
    if ((beh?.getWeakPower?.(w, nx, ny, nz, st, toward) ?? 0) > 0) return true;
    if ((beh?.getStrongPower?.(w, nx, ny, nz, st, toward) ?? 0) > 0) return true;
    // strongly powered solid neighbour conducts
    if (T_SOLID[st >>> 4] && BLOCKS[st >>> 4].fullCube) {
      for (let e = 0; e < 6; e++) {
        if (e === toward) continue;
        const [ex, ey, ez] = D6[e];
        const s2 = w.getBlock(nx + ex, ny + ey, nz + ez);
        if (!s2) continue;
        if ((behaviorOf(s2 >>> 4)?.getStrongPower?.(w, nx + ex, ny + ey, nz + ez, s2, e ^ 1) ?? 0) > 0) return true;
      }
    }
  }
  return false;
}

let installed = false;
export function installTntBehavior() {
  if (installed || !BLOCK_BY_NAME.has('tnt')) return;
  installed = true;
  const fireIds = new Set(['fire', 'soul_fire'].map((n) => BLOCK_BY_NAME.get(n)?.id).filter((v) => v !== undefined));
  const check = (w: World, x: number, y: number, z: number) => {
    if (isBlockPowered(w, x, y, z)) {
      tntHooks.prime?.(w, x, y, z, null);
      return;
    }
    for (const [dx, dy, dz] of D6) {
      if (fireIds.has(w.getBlock(x + dx, y + dy, z + dz) >>> 4)) {
        tntHooks.prime?.(w, x, y, z, null);
        return;
      }
    }
  };
  addBehavior('tnt', {
    onPlace: (w, x, y, z) => check(w, x, y, z),
    onNeighborChange: (w, x, y, z) => check(w, x, y, z),
    onUse(w, x, y, z, _st, player) {
      const held = player?.mainHand ?? player?.inventory?.held;
      const n = held?.item?.name;
      if (n !== 'flint_and_steel' && n !== 'fire_charge') return false;
      tntHooks.prime?.(w, x, y, z, player);
      const g = player.game;
      g?.audio?.play?.(n === 'fire_charge' ? 'fire.ignite' : 'item.flintandsteel.use', { pos: { x: x + 0.5, y: y + 0.5, z: z + 0.5 } });
      if (!player.creative) {
        if (n === 'flint_and_steel') player.damageItem?.(player.inventory.selected, 1);
        else player.inventory?.consumeHeld?.(1);
      }
      return true;
    },
  });
}
