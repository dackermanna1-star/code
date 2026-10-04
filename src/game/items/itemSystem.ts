/**
 * Item system: installs item behaviours, `game.itemModels` (3D item models + icons), the HUD
 * icon provider, the first-person hand pass, inventory ticks (compass, clock, maps ...),
 * turtle helmet water breathing, spyglass zoom and debug URL hooks:
 *
 *   ?give=diamond_sword,stone*64,potion#healing   fill the hotbar (name[*count][#potion])
 *   &slot=0  &offhand=shield  &handpose=eat|drink|bow|crossbow|spear|block|swing  &handt=0..1
 */
import * as THREE from 'three';
import { T_FULL_CUBE } from '../../world/blocks/registry';
import type { Game } from '../game';
import type { GameSystem } from '../systems';
import { ITEMS, tryItem, stack as mkStack, itemBehavior, type ItemStack } from './index';
import { installItemBehaviors, ensureTotemLast } from './behaviors';
import { ItemModels } from '../../render/items/itemModels';
import { FirstPersonHand } from '../../render/items/hand';
import { setItemIconProvider } from '../../ui/hud';
import { OFFHAND, ARMOR } from '../inventory';
import '../../entity/thrown';

const tmpV = new THREE.Vector3();

/** Trilinearly interpolated packed light (sky, r, g, b in 0..1) at a world position. */
export function sampleLight(world: any, p: THREE.Vector3, out = new THREE.Vector4()): THREE.Vector4 {
  const x = p.x - 0.5, y = p.y - 0.5, z = p.z - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const fx = x - x0, fy = y - y0, fz = z - z0;
  out.set(0, 0, 0, 0);
  for (let i = 0; i < 8; i++) {
    const dx = i & 1, dy = (i >> 1) & 1, dz = (i >> 2) & 1;
    const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
    let L = world.getLight(x0 + dx, y0 + dy, z0 + dz);
    const st = world.getBlock(x0 + dx, y0 + dy, z0 + dz);
    // solid cells hold no light: borrow the cell's own max with a neighbour above to avoid black seams
    if (st && world.blockDef?.(st)?.fullCube) L = world.getLight(x0 + dx, y0 + dy + 1, z0 + dz);
    out.x += (((L >>> 12) & 15) / 15) * w;
    out.y += (((L >>> 8) & 15) / 15) * w;
    out.z += (((L >>> 4) & 15) / 15) * w;
    out.w += ((L & 15) / 15) * w;
  }
  return out;
}

export class ItemSystem implements GameSystem {
  readonly name = 'items';
  models: ItemModels | null = null;
  hand: FirstPersonHand | null = null;
  private game!: Game;
  private prewarmQueue: any[] = [];
  private zoom = 1;
  private hudT = 0;
  private hudKey = '';
  private spin = 0;

  init(game: Game) {
    this.game = game;
    installItemBehaviors();
    try {
      this.models = new ItemModels(game.renderer);
      game.itemModels = this.models;
      setItemIconProvider((s) => this.models!.icon(s));
      this.models.atlas.dynamicData = (s) => this.dynamicIconData(s);
      this.hand = new FirstPersonHand(this.models);
    } catch (e) {
      console.warn('item visuals unavailable', e);
    }
    const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
    if (q.has('handpose') && this.hand) this.hand.override = { pose: q.get('handpose')!, t: Number(q.get('handt') ?? 0.5) };
    let applied = false;
    game.events.on('worldReady', () => {
      if (!applied) {
        applied = true;
        this.applyDebugParams(q);
      }
      // icons for everything in the inventory first, then the whole registry in the background
      const inv = game.player.inventory;
      const first = inv.slots.filter(Boolean).map((s: ItemStack | null) => s!.item);
      this.prewarmQueue = [...first, ...ITEMS.filter((d) => !first.includes(d))];
    });
  }

  private applyDebugParams(q: URLSearchParams) {
    const p = this.game.player;
    if (!p) return;
    const parse = (spec: string): ItemStack | null => {
      const [nameCount, potion] = spec.split('#');
      const [name, count] = nameCount.split('*');
      const it = tryItem(name.trim());
      if (!it) return null;
      const s = mkStack(it, Math.min(it.maxStack, Number(count ?? 1) || 1));
      if (potion) s.data = { potion };
      return s;
    };
    if (q.has('give')) {
      const list = q.get('give')!.split(',');
      list.forEach((spec, i) => { if (i < 9) p.inventory.set(i, parse(spec)); });
    }
    if (q.has('offhand')) p.inventory.set(OFFHAND, parse(q.get('offhand')!));
    if (q.has('slot')) { p.inventory.selected = Math.max(0, Math.min(8, Number(q.get('slot')))); p.inventory.changed(); }
  }

  /** Compass needle / clock dial for icons (quantised to keep the cache small). */
  private dynamicIconData(s: ItemStack): Record<string, any> | undefined {
    const g = this.game;
    const n = s.item.name;
    if (n !== 'compass' && n !== 'clock' && n !== 'recovery_compass') return undefined;
    const p = g?.player;
    if (!p) return undefined;
    if (g.dimension !== 'overworld') return n === 'clock' ? { time: this.spin % 1 } : { angle: this.spin * Math.PI * 2 };
    if (n === 'clock') return { time: ((g.dayTime % 24000) / 24000 + 0.25) % 1 };
    const target = n === 'recovery_compass' ? (p.data.lastDeath as number[] | undefined) : undefined;
    const sp = p.spawnPoint ?? new THREE.Vector3(0, 0, 0);
    const tx = target ? target[0] : sp.x, tz = target ? target[2] : sp.z;
    // angle relative to the player's facing (needle up = straight ahead)
    const world = Math.atan2(tx - p.pos.x, -(tz - p.pos.z));
    const facing = -p.yaw;
    return { angle: world - facing };
  }

  tick(game: Game) {
    const p = game.player;
    if (!p) return;
    ensureTotemLast();
    this.hand?.tick(p);
    // inventory ticks (compass, clock, maps ...)
    const inv = p.inventory;
    for (let i = 0; i < inv.size; i++) {
      const s = inv.get(i);
      if (!s) continue;
      const b = itemBehavior(s.item);
      b?.inventoryTick?.(game, p, s, i);
    }
    // turtle shell: water breathing while out of water (counts down once submerged)
    if (inv.get(ARMOR + 3)?.item.name === 'turtle_helmet' && !p.eyesInWater) p.addEffect('water_breathing', 200, 0, true);
  }

  update(game: Game, dt: number) {
    const p = game.player;
    if (!p || !this.models) return;
    this.spin += dt * 0.7;
    this.models.mats.time.value = game.realTime;
    // icons in the background
    if (this.prewarmQueue.length && !game.loading) this.models.atlas.prewarm(this.prewarmQueue, 2.5);
    // live compass / clock icons in the hotbar
    this.hudT += dt;
    if (this.hudT > 0.25) {
      this.hudT = 0;
      const inv = p.inventory;
      let key = '';
      for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8, OFFHAND]) {
        const s = inv.get(i);
        if (s && (s.item.name === 'compass' || s.item.name === 'clock' || s.item.name === 'recovery_compass')) {
          const d = this.dynamicIconData(s);
          key += `${i}:${Math.round((d?.angle ?? 0) * 5)}:${Math.round((d?.time ?? 0) * 64)}|`;
        }
      }
      if (key && key !== this.hudKey) inv.changed();
      this.hudKey = key;
    }
    // spyglass zoom (Minecraft: 0.1 × FOV)
    const cam = game.cameraCtl.camera;
    const target = p.usingItem?.stack.item.name === 'spyglass' && game.cameraCtl.perspective === 'first' ? 0.1 : 1;
    this.zoom += (target - this.zoom) * (1 - Math.exp(-dt * 12));
    if (Math.abs(this.zoom - 1) > 1e-3) {
      cam.fov *= this.zoom;
      cam.updateProjectionMatrix();
    }
    // first-person hand
    if (this.hand) {
      const eye = game.cameraCtl.eyeWorld;
      tmpV.set(0.3, -0.35, -0.55).applyQuaternion(cam.quaternion).add(eye);
      // a hand reaching through a portal is lit by the other side; never sample inside a wall
      (game as any).portalMapPoint?.(eye, tmpV);
      const st = game.world.getBlock(Math.floor(tmpV.x), Math.floor(tmpV.y), Math.floor(tmpV.z));
      if (st && T_FULL_CUBE[st >>> 4]) tmpV.copy(eye);
      const L = sampleLight(game.world, tmpV);
      if (this.hand.update(game, dt, L)) game.renderExtras.hand = this.hand.extras;
      else delete (game.renderExtras as any).hand;
    }
  }
}
