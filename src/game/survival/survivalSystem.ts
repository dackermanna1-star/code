/**
 * Core survival rules not covered by the entity classes:
 *  - player death: inventory + XP drops (keepInventory aware); mob death XP (`xpReward`)
 *  - fire / soul fire blocks: entity damage, ignition, simple burn-out
 *  - status-effect visuals: night vision (flicker), blindness fog, nausea camera wobble,
 *    invisibility, plus the portal / sleep overlays requested by other survival systems
 *    through `screenFx`.
 */
import * as THREE from 'three';
import type { Game } from '../game';
import type { GameSystem } from '../systems';
import { LivingEntity } from '../../entity/living';
import { addBehavior } from '../../world/blocks/behaviors';
import { BLOCKS, T_FULL_CUBE } from '../../world/blocks/registry';
import { SetFlags } from '../../world/world';
import { deathXp } from './food';
import { gameFor, setSurvivalGame, blockName } from './context';
import { installEating } from './eating';

/** Overlay contributions (0..1) that other survival systems set each frame. */
export const screenFx = {
  /** Nether portal warp intensity. */
  portal: 0,
  /** Sleep fade to black. */
  sleep: 0,
  /** White lightning flash. */
  flash: 0,
};

const FOG_VERT = /* glsl */ `
precision highp float;
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FOG_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D u_linDepth;
uniform vec2 u_res;
uniform float u_amount;
uniform float u_far;
out vec4 o;
void main() {
  float d = texture(u_linDepth, gl_FragCoord.xy / u_res).r;
  float a = smoothstep(u_far * 0.2, u_far, d) * u_amount;
  o = vec4(0.0, 0.0, 0.0, a);
}`;

const INFINIBURN = new Set(['netherrack', 'magma_block']);
const SOUL_BASE = new Set(['soul_sand', 'soul_soil']);

function flammableAround(world: any, x: number, y: number, z: number) {
  for (const [dx, dy, dz] of [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]]) {
    const s = world.getBlock(x + dx, y + dy, z + dz);
    if (s && BLOCKS[s >>> 4].fireEncouragement > 0) return true;
  }
  return false;
}

export class SurvivalSystem implements GameSystem {
  readonly name = 'survival';
  private fog!: THREE.Mesh;
  private fogMat!: THREE.RawShaderMaterial;
  private overlay = new THREE.Vector4();
  private hidden = new Set<LivingEntity>();
  private wobble = 0;

  init(game: Game) {
    setSurvivalGame(game);
    installEating();
    this.installFire();
    const ev = game.events;
    ev.on('entityDeath', ({ entity, source }: any) => {
      if (entity === game.player) this.onPlayerDeath(game);
      else if (entity instanceof LivingEntity) {
        const reward = typeof (entity as any).xpReward === 'function' ? (entity as any).xpReward() : (entity as any).xpReward;
        const byPlayer = source?.attacker === game.player || (entity.lastAttacker === game.player && entity.age - entity.lastHurtByTick < 100);
        if (reward > 0 && byPlayer && !(entity as any).data?.xpDropped) {
          (entity as any).data.xpDropped = true;
          game.spawnXp(entity.pos.clone().setY(entity.pos.y + 0.5), reward);
        }
      }
    });
    // blindness fog drawn in the post-TAA overlay pass
    this.fogMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: FOG_VERT, fragmentShader: FOG_FRAG, transparent: true, depthTest: false, depthWrite: false,
      uniforms: { u_linDepth: { value: null }, u_res: { value: new THREE.Vector2(1, 1) }, u_amount: { value: 0 }, u_far: { value: 5 } },
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.fog = new THREE.Mesh(geo, this.fogMat);
    this.fog.frustumCulled = false;
    this.fog.renderOrder = -10;
    this.fog.visible = false;
  }

  private onPlayerDeath(game: Game) {
    const p = game.player;
    if (game.gamerules.keepInventory) return;
    const inv = p.inventory;
    for (let i = 0; i < inv.size; i++) {
      const s = inv.get(i);
      if (!s) continue;
      if (s.ench?.vanishing_curse) { inv.set(i, null); continue; }
      const a = Math.random() * Math.PI * 2, sp = Math.random() * 0.5 * 20;
      game.dropItem(s, p.pos.clone().setY(p.pos.y + 1.2), new THREE.Vector3(Math.cos(a) * sp, 0.2 * 20, Math.sin(a) * sp), 40);
      inv.set(i, null);
    }
    const xp = p.creative || p.spectator ? 0 : deathXp(p.xpLevel);
    if (xp > 0) game.spawnXp(p.pos.clone().setY(p.pos.y + 0.5), xp);
    p.xpLevel = 0;
    p.xpProgress = 0;
    p.xpTotal = 0;
  }

  private installFire() {
    for (const name of ['fire', 'soul_fire']) {
      const soul = name === 'soul_fire';
      const survives = (world: any, x: number, y: number, z: number) => {
        const below = world.getBlock(x, y - 1, z);
        if (soul) return SOUL_BASE.has(blockName(below));
        return T_FULL_CUBE[below >>> 4] === 1 || flammableAround(world, x, y, z);
      };
      addBehavior(name, {
        onEntityInside(_w, _x, _y, _z, _s, e) {
          if (!(e instanceof LivingEntity) || e.dead) {
            if (e.type === 'item' && !e.stack?.item?.fireResistant && e.age > 2) e.remove();
            return;
          }
          if (e.hasEffect('fire_resistance')) return;
          if (e.fireTicks < 160) e.fireTicks = 160;
          e.hurt({ type: 'fire', fire: true }, soul ? 2 : 1);
        },
        onPlace(world, x, y, z) {
          world.scheduleTick(x, y, z, 30 + Math.floor(Math.random() * 10));
        },
        onNeighborChange(world, x, y, z) {
          if (!survives(world, x, y, z)) world.setBlock(x, y, z, 0, SetFlags.ALL);
        },
        canSurvive: (world, x, y, z) => survives(world, x, y, z),
        onScheduledTick(world, x, y, z, state) {
          const g = gameFor(world);
          world.scheduleTick(x, y, z, 30 + Math.floor(Math.random() * 10));
          if (soul) return;
          const below = blockName(world.getBlock(x, y - 1, z));
          const infini = INFINIBURN.has(below) || (world.dimension === 'end' && below === 'bedrock');
          const age = state & 15;
          const raining = g && g.weather.raining && g.dimension === 'overworld' && y >= world.getHeight(x, z) - 1;
          if (!infini && raining && Math.random() < 0.2 + age * 0.03) { world.setBlock(x, y, z, 0, SetFlags.ALL); return; }
          const na = Math.min(15, age + (Math.floor(Math.random() * 3) >> 1));
          if (na !== age) world.setBlock(x, y, z, (state & ~15) | na, SetFlags.NONE);
          if (infini) return;
          if (!flammableAround(world, x, y, z)) {
            if (T_FULL_CUBE[world.getBlock(x, y - 1, z) >>> 4] !== 1 || age > 3) world.setBlock(x, y, z, 0, SetFlags.ALL);
            return;
          }
          if (age === 15 && Math.random() < 0.25) world.setBlock(x, y, z, 0, SetFlags.ALL);
        },
      });
    }
  }

  onWorldChange(game: Game) {
    this.hidden.clear();
    setSurvivalGame(game);
  }

  update(game: Game, dt: number) {
    const p = game.player;
    if (!p) return;
    // ---- invisibility
    for (const e of game.entities.list) {
      if (!(e instanceof LivingEntity) || !e.model || e === p) continue;
      const inv = e.hasEffect('invisibility');
      if (inv && !this.hidden.has(e)) { e.model.visible = false; this.hidden.add(e); }
      else if (!inv && this.hidden.has(e)) { e.model.visible = true; this.hidden.delete(e); }
    }
    for (const e of this.hidden) if (e.removed) this.hidden.delete(e);
    // ---- night vision (flickers during the last 10 seconds)
    const nv = p.effects.get('night_vision');
    let nvAmount = 0;
    if (nv) nvAmount = nv.duration < 0 || nv.duration > 200 ? 1 : 0.7 + Math.sin(nv.duration * Math.PI * 0.2) * 0.3;
    game.renderExtras.nightVision = nvAmount;
    // ---- blindness fog
    const bl = p.effects.get('blindness');
    const blAmount = bl ? (bl.duration >= 0 && bl.duration < 20 ? bl.duration / 20 : 1) : 0;
    this.fog.visible = blAmount > 0;
    if (blAmount > 0) {
      const r: any = game.renderer;
      this.fogMat.uniforms.u_linDepth.value = r.linDepth?.target?.texture ?? null;
      this.fogMat.uniforms.u_res.value.set(r.width, r.height);
      this.fogMat.uniforms.u_amount.value = blAmount;
      this.fogMat.uniforms.u_far.value = 5;
      const sc = game.renderExtras.overlayScene;
      if (sc && this.fog.parent !== sc) sc.add(this.fog);
    }
    // ---- nausea / portal camera wobble
    const nausea = p.hasEffect('nausea') ? 1 : 0;
    const warp = Math.max(nausea, screenFx.portal);
    if (warp > 0.001) {
      this.wobble += dt;
      const cam = game.cameraCtl.camera;
      const t = this.wobble;
      cam.rotation.z += Math.sin(t * 1.7) * 0.12 * warp;
      cam.rotation.x += Math.sin(t * 2.3) * 0.03 * warp;
      cam.fov *= 1 + Math.sin(t * 2.9) * 0.12 * warp;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
    }
    // ---- overlay colour: lightning flash > sleep fade > portal purple
    let o: THREE.Vector4 | undefined;
    if (screenFx.flash > 0.01) o = this.overlay.set(1, 1, 1, Math.min(0.8, screenFx.flash));
    else if (screenFx.sleep > 0.01) o = this.overlay.set(0, 0, 0, Math.min(1, screenFx.sleep));
    else if (screenFx.portal > 0.01) o = this.overlay.set(0.45, 0.1, 0.85, screenFx.portal * 0.55);
    else if (blAmount > 0) o = this.overlay.set(0, 0, 0, 0.25 * blAmount);
    if (o) game.renderExtras.overlay = o;
    else if (game.renderExtras.overlay === this.overlay) game.renderExtras.overlay = undefined;
    screenFx.flash *= Math.exp(-dt * 6);
  }
}
