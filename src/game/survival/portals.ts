/**
 * Dimension travel (Minecraft Java 1.20):
 *  - Nether portals: lit by fire (flint and steel / fire charge) inside an obsidian frame
 *    (2x3 .. 21x21 interior), break when the frame breaks. Standing inside for 4 s (instantly in
 *    creative) travels between Overworld and Nether at 8:1, reusing a known portal near the target
 *    (128 blocks in the Overworld, 16 in the Nether) or building a new one on safe ground.
 *  - End portals: an eye of ender in each of the 12 frames creates the 3x3 portal; entering it goes
 *    to the obsidian platform at (100, 49, 0) (built if missing); the End's exit portal returns to
 *    the player's spawn.
 * Events: `portalLit {x,y,z,axis,width,height}`, `endPortalOpened {x,y,z}`,
 * `portalTravel {from, to, kind}`.
 */
import * as THREE from 'three';
import type { Game } from '../game';
import type { GameSystem } from '../systems';
import { addBehavior } from '../../world/blocks/behaviors';
import { BLOCKS, BLOCK_BY_NAME, T_AIR, T_SOLID, T_LIQUID, stateOf } from '../../world/blocks/registry';
import { SetFlags, type World } from '../../world/world';
import { addItemBehavior, tryItem, type ItemUseContext } from '../items/registry';
import type { DimensionId } from '../../world/gen/generator';
import { findAnyPortalShape, findPortalShape, portalInterior, findEndPortalInterior, netherScale, type PortalPredicates } from './portalShape';
import { gameFor, play, consumeUsed, damageUsed } from './context';
import { screenFx } from './survivalSystem';

const bid = (n: string) => BLOCK_BY_NAME.get(n)!.id;
const OBSIDIAN = bid('obsidian');
const PORTAL = bid('nether_portal');
const FIRE = bid('fire');
const SOUL_FIRE = bid('soul_fire');
const FRAME = bid('end_portal_frame');
const END_PORTAL = bid('end_portal');

export const NETHER_PREDICATES: PortalPredicates = {
  isFrame: (s) => s >>> 4 === OBSIDIAN,
  isEmpty: (s) => T_AIR[s >>> 4] === 1 || s >>> 4 === FIRE || s >>> 4 === SOUL_FIRE || s >>> 4 === PORTAL,
  isPortal: (s) => s >>> 4 === PORTAL,
};

interface PortalRecord { x: number; y: number; z: number }

/** Try to light a Nether portal from an empty position inside a frame. */
export function tryLightPortal(world: World, x: number, y: number, z: number): boolean {
  if (world.dimension !== 'overworld' && world.dimension !== 'nether') return false;
  const get = (a: number, b: number, c: number) => world.getBlock(a, b, c);
  const s = findAnyPortalShape(get, NETHER_PREDICATES, x, y, z, true);
  if (!s) return false;
  const st = stateOf(PORTAL, s.axis);
  for (const [a, b, c] of portalInterior(s)) world.setBlock(a, b, c, st, SetFlags.HOOKS | SetFlags.MODIFY);
  for (const [a, b, c] of portalInterior(s)) world.notifyNeighbors(a, b, c);
  const g = gameFor(world);
  g?.events.emit('portalLit', { x: s.x, y: s.y, z: s.z, axis: s.axis, width: s.width, height: s.height });
  play(g, 'portal.trigger', x + 0.5, y + 0.5, z + 0.5, 0.6);
  return true;
}

/** Place fire against the clicked face (flint and steel / fire charge). */
function igniteAt(ctx: ItemUseContext): boolean {
  const h = ctx.hit;
  if (!h) return false;
  const w = ctx.game.world as World;
  const n = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]][h.face];
  const x = h.x + n[0], y = h.y + n[1], z = h.z + n[2];
  const cur = w.getBlock(x, y, z);
  if (cur !== 0 && !T_AIR[cur >>> 4]) return false;
  if (tryLightPortal(w, x, y, z)) return true;
  const below = BLOCKS[w.getBlock(x, y - 1, z) >>> 4].name;
  const soul = below === 'soul_sand' || below === 'soul_soil';
  const fire = stateOf(soul ? SOUL_FIRE : FIRE, 0);
  // fire needs a solid block below or a flammable neighbour
  let ok = T_SOLID[w.getBlock(x, y - 1, z) >>> 4] === 1;
  if (!ok) for (const [dx, dy, dz] of [[0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]]) if (BLOCKS[w.getBlock(x + dx, y + dy, z + dz) >>> 4].fireEncouragement > 0) ok = true;
  if (!ok) return false;
  w.setBlock(x, y, z, fire, SetFlags.ALL);
  return true;
}

export class PortalSystem implements GameSystem {
  readonly name = 'portals';
  /** Known nether portals per dimension (bottom interior block). */
  private known: Record<string, PortalRecord[]> = { overworld: [], nether: [] };
  private insideTick = -10;
  private armed = true;
  private ticks = 0;
  private cooldown = 0;
  private arrival: { kind: 'nether' | 'end' | 'exit'; x: number; y: number; z: number; record?: PortalRecord } | null = null;
  private travelling = false;

  init(game: Game) {
    const self = this;
    addBehavior('nether_portal', {
      onEntityInside(world, x, y, z, _s, e) {
        const g = gameFor(world);
        if (g && e === g.player) self.insideTick = g.ticks;
      },
      onNeighborChange(world, x, y, z, st, fx, fy, fz) {
        const axis = (st & 1) as 0 | 1;
        // changes along the thin axis don't matter
        if ((axis === 0 && fz !== z) || (axis === 1 && fx !== x)) return;
        if (world.getBlock(fx, fy, fz) >>> 4 === PORTAL) return;
        const s = findPortalShape((a, b, c) => world.getBlock(a, b, c), NETHER_PREDICATES, x, y, z, axis);
        if (!s || s.portalBlocks !== s.width * s.height) world.setBlock(x, y, z, 0, SetFlags.ALL);
      },
      onPlace(world, x, y, z) {
        self.remember(world.dimension, x, y, z);
      },
    });
    addBehavior(['fire', 'soul_fire'], {
      onPlace(world, x, y, z) {
        tryLightPortal(world, x, y, z);
      },
    });
    for (const name of ['flint_and_steel', 'fire_charge']) {
      if (!tryItem(name)) continue;
      addItemBehavior(name, {
        useOnBlock(ctx) {
          if (!igniteAt(ctx)) return false;
          const p = ctx.hit!;
          if (name === 'flint_and_steel') {
            play(ctx.game, 'item.flintandsteel.use', p.x + 0.5, p.y + 0.5, p.z + 0.5);
            damageUsed(ctx.player, ctx.hand);
          } else {
            play(ctx.game, 'fire.ignite', p.x + 0.5, p.y + 0.5, p.z + 0.5);
            consumeUsed(ctx.player, ctx.stack, ctx.hand);
          }
          return true;
        },
      });
    }
    // End portal frames
    addBehavior('end_portal_frame', {
      onUse(world, x, y, z, st, player) {
        const held = player.mainHand;
        if ((st & 4) || held?.item.name !== 'ender_eye') return false;
        const g = gameFor(world);
        world.setBlock(x, y, z, st | 4, SetFlags.ALL);
        if (!player.creative) player.inventory.consumeHeld(1);
        play(g, 'entity.ender_eye.death', x + 0.5, y + 1, z + 0.5);
        const hasEye = (a: number, c: number) => {
          const s = world.getBlock(a, y, c);
          return s >>> 4 === FRAME && (s & 4) !== 0;
        };
        const inner = findEndPortalInterior(hasEye, x, z);
        if (inner) {
          for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) world.setBlock(inner[0] + dx, y, inner[1] + dz, stateOf(END_PORTAL, 0), SetFlags.ALL);
          g?.events.emit('endPortalOpened', { x: inner[0] + 1, y, z: inner[1] + 1 });
          play(g, 'portal.travel', inner[0] + 1.5, y, inner[1] + 1.5, 1.5);
          g?.message('The End portal has opened', '#c9f');
        }
        return true;
      },
    });
    addBehavior(['end_portal', 'end_gateway'], {
      onEntityInside(world, _x, _y, _z, _s, e) {
        const g = gameFor(world);
        if (!g || e !== g.player || self.travelling || self.cooldown > 0) return;
        if (world.dimension === 'end') void self.travel(g, 'overworld', 'exit');
        else void self.travel(g, 'end', 'end');
      },
    });
    game.events.on('worldReady', () => this.onArrive(game));
  }

  private remember(dim: string, x: number, y: number, z: number) {
    const list = (this.known[dim] ??= []);
    // one record per portal: skip if one within 3 blocks
    if (list.some((r) => Math.abs(r.x - x) <= 3 && Math.abs(r.y - y) <= 3 && Math.abs(r.z - z) <= 3)) return;
    list.push({ x, y, z });
    if (list.length > 256) list.shift();
  }

  tick(g: Game) {
    this.ticks++;
    if (this.cooldown > 0) this.cooldown--;
    const p = g.player;
    if (!p || p.dead || this.travelling) { screenFx.portal = 0; return; }
    const inside = this.insideTick >= g.ticks - 1 && (g.dimension === 'overworld' || g.dimension === 'nether');
    if (!inside) {
      this.armed = true;
      p.portalTicks = Math.max(0, p.portalTicks - 4);
    } else if (this.armed && this.cooldown === 0) {
      if (p.portalTicks === 0) play(g, 'portal.trigger', p.pos.x, p.pos.y, p.pos.z, 0.25);
      p.portalTicks++;
      const wait = p.creative ? 1 : 80;
      if (p.portalTicks >= wait) {
        p.portalTicks = 0;
        void this.travel(g, g.dimension === 'nether' ? 'overworld' : 'nether', 'nether');
      }
    }
    screenFx.portal = Math.min(1, p.portalTicks / 80);
  }

  /** Teleport the player to another dimension. */
  async travel(g: Game, to: DimensionId, kind: 'nether' | 'end' | 'exit') {
    if (this.travelling) return;
    this.travelling = true;
    const from = g.dimension;
    const p = g.player;
    try {
      let target: THREE.Vector3 | null;
      if (kind === 'nether') {
        const [tx, tz] = netherScale(p.pos.x, p.pos.z, to === 'nether');
        const range = to === 'nether' ? 16 : 128;
        let best: PortalRecord | undefined, bd = Infinity;
        for (const r of this.known[to] ?? []) {
          const d = Math.max(Math.abs(r.x - tx), Math.abs(r.z - tz));
          if (d <= range && d < bd) { bd = d; best = r; }
        }
        const y = best ? best.y : to === 'nether' ? Math.max(32, Math.min(110, Math.floor(p.pos.y))) : Math.max(64, Math.floor(p.pos.y));
        this.arrival = { kind, x: best ? best.x : tx, y, z: best ? best.z : tz, record: best };
        target = new THREE.Vector3(this.arrival.x + 0.5, y, this.arrival.z + 0.5);
      } else if (kind === 'end') {
        this.arrival = { kind, x: 100, y: 49, z: 0 };
        target = new THREE.Vector3(100.5, 49, 0.5);
      } else {
        this.arrival = null;
        target = p.spawnDimension === 'overworld' && p.spawnPoint ? p.spawnPoint.clone() : null;
      }
      play(g, 'portal.travel', p.pos.x, p.pos.y, p.pos.z, 0.6);
      g.events.emit('portalTravel', { from, to, kind });
      p.fallDistance = 0;
      await g.enterDimension(to, target);
    } finally {
      this.travelling = false;
      this.armed = false;
      this.cooldown = 10;
      screenFx.portal = 0;
    }
  }

  /** After the destination terrain loaded: find/build the portal or platform and place the player. */
  private onArrive(g: Game) {
    const a = this.arrival;
    if (!a) return;
    this.arrival = null;
    const w = g.world;
    const p = g.player;
    if (a.kind === 'end') {
      buildEndPlatform(w);
      p.setPos(100.5, 49, 0.5);
      p.vel.set(0, 0, 0);
      p.yaw = Math.PI / 2;
      return;
    }
    if (a.kind !== 'nether') return;
    let spot = a.record && portalExistsNear(w, a.record.x, a.record.y, a.record.z, 2);
    if (!spot) {
      if (a.record) this.known[w.dimension] = (this.known[w.dimension] ?? []).filter((r) => r !== a.record);
      spot = scanForPortal(w, a.x, a.z, w.dimension === 'nether' ? 16 : 32);
    }
    if (!spot) spot = buildPortal(w, a.x, a.y, a.z);
    this.remember(w.dimension, spot[0], spot[1], spot[2]);
    const [x, y, z] = spot;
    // stand on the portal's bottom row, centred on its width
    const axisZ = (w.getBlock(x, y, z) & 1) === 1;
    const twoWide = w.getBlock(x + (axisZ ? 0 : 1), y, z + (axisZ ? 1 : 0)) >>> 4 === PORTAL;
    const px = x + (axisZ ? 0.5 : twoWide ? 1 : 0.5), pz = z + (axisZ ? (twoWide ? 1 : 0.5) : 0.5);
    p.setPos(px, y, pz);
    p.vel.set(0, 0, 0);
    p.fallDistance = 0;
  }

  onWorldChange() {
    this.insideTick = -10;
  }

  save() {
    return { known: this.known };
  }
  load(_g: Game, d: any) {
    if (d?.known) this.known = d.known;
  }
}

/** Lowest portal block of a portal near (x,y,z), if it still exists. */
function portalExistsNear(w: World, x: number, y: number, z: number, r: number): [number, number, number] | null {
  for (let dy = -r; dy <= r; dy++)
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) if (w.getBlock(x + dx, y + dy, z + dz) >>> 4 === PORTAL) return bottomOf(w, x + dx, y + dy, z + dz);
  return null;
}

function bottomOf(w: World, x: number, y: number, z: number): [number, number, number] {
  while (y > 0 && w.getBlock(x, y - 1, z) >>> 4 === PORTAL) y--;
  const axisZ = (w.getBlock(x, y, z) & 1) === 1;
  // walk to the low end along the width so the arrival is centred consistently
  if (!axisZ) while (w.getBlock(x - 1, y, z) >>> 4 === PORTAL) x--;
  else while (w.getBlock(x, y, z - 1) >>> 4 === PORTAL) z--;
  return [x, y, z];
}

/** Search loaded columns around (x, z) for existing portal blocks. */
function scanForPortal(w: World, x: number, z: number, r: number): [number, number, number] | null {
  let best: [number, number, number] | null = null, bd = Infinity;
  for (let dz = -r; dz <= r; dz++)
    for (let dx = -r; dx <= r; dx++) {
      const cx = x + dx, cz = z + dz;
      if (!w.isLoaded(cx, cz)) continue;
      for (let y = 1; y < 255; y++) {
        if (w.getBlock(cx, y, cz) >>> 4 !== PORTAL) continue;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = bottomOf(w, cx, y, cz); }
        break;
      }
    }
  return best;
}

/** Find safe ground near (x, z) and build a 2x3 portal (axis X). Returns its bottom-left interior block. */
export function buildPortal(w: World, x: number, y: number, z: number): [number, number, number] {
  const nether = w.dimension === 'nether';
  const yMax = nether ? 120 : 250, yMin = nether ? 32 : 2;
  const fits = (bx: number, by: number, bz: number) => {
    for (let dx = -1; dx <= 2; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        if (!w.isLoaded(bx + dx, bz + dz)) return false;
        const g = w.getBlock(bx + dx, by - 1, bz + dz);
        if (!T_SOLID[g >>> 4] || T_LIQUID[g >>> 4]) return false;
        for (let h = 0; h < 4; h++) {
          const s = w.getBlock(bx + dx, by + h, bz + dz);
          if (s && (T_SOLID[s >>> 4] || T_LIQUID[s >>> 4])) return false;
        }
      }
    return true;
  };
  let found: [number, number, number] | null = null;
  outer: for (let r = 0; r <= 16; r++)
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const bx = x + dx, bz = z + dz;
        if (!w.isLoaded(bx, bz)) continue;
        // prefer heights close to the requested y
        for (let k = 0; k <= yMax - yMin; k++) {
          const by = k % 2 === 0 ? y + (k >> 1) : y - ((k + 1) >> 1);
          if (by < yMin || by > yMax - 4) continue;
          if (fits(bx, by, bz)) { found = [bx, by, bz]; break outer; }
        }
      }
  const obs = stateOf(OBSIDIAN, 0);
  if (!found) {
    // forced placement with an obsidian platform (vanilla PortalForcer fallback)
    const by = Math.max(nether ? 70 : Math.max(70, y), Math.min(yMax - 10, y));
    found = [x, by, z];
    for (let dx = -1; dx <= 2; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        w.setBlock(x + dx, by - 1, z + dz, obs, SetFlags.ALL);
        for (let h = 0; h < 4; h++) w.setBlock(x + dx, by + h, z + dz, 0, SetFlags.ALL);
      }
  }
  const [bx, by, bz] = found;
  for (let dx = -1; dx <= 2; dx++) {
    w.setBlock(bx + dx, by - 1, bz, obs, SetFlags.ALL);
    w.setBlock(bx + dx, by + 3, bz, obs, SetFlags.ALL);
  }
  for (let h = 0; h < 3; h++) {
    w.setBlock(bx - 1, by + h, bz, obs, SetFlags.ALL);
    w.setBlock(bx + 2, by + h, bz, obs, SetFlags.ALL);
  }
  const portal = stateOf(PORTAL, 0);
  for (let h = 0; h < 3; h++) for (let dx = 0; dx < 2; dx++) w.setBlock(bx + dx, by + h, bz, portal, SetFlags.HOOKS | SetFlags.MODIFY);
  return found;
}

/** The End arrival platform: 5x5 obsidian at y = 48 around (100, 0) with air above. */
export function buildEndPlatform(w: World) {
  const obs = stateOf(OBSIDIAN, 0);
  for (let dz = -2; dz <= 2; dz++)
    for (let dx = -2; dx <= 2; dx++) {
      w.setBlock(100 + dx, 48, dz, obs, SetFlags.ALL);
      for (let h = 1; h <= 3; h++) w.setBlock(100 + dx, 48 + h, dz, 0, SetFlags.ALL);
    }
}
