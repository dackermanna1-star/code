/**
 * Box models for non-cube block shapes (Minecraft JSON-model style, units of 1/16 block)
 * plus collision/outline boxes. Worker-safe: used by the mesher and by physics.
 */
import { BLOCKS, T_FULL_CUBE, facesFor, type BlockDef, type Faces } from './registry';
import { Dir } from '../../core/dirs';

export type FaceKey = 'down' | 'up' | 'north' | 'south' | 'west' | 'east';
export const FACE_KEYS: FaceKey[] = ['down', 'up', 'north', 'south', 'west', 'east'];

export interface ModelFace {
  tex: string;
  /** uv rect in 1/16 units [u0,v0,u1,v1] (v up). Default: derived from the box position. */
  uv?: [number, number, number, number];
  /** Texture rotation in degrees (0/90/180/270). */
  rot?: number;
  /** Cull this face if the neighbour in that Dir is a full opaque cube. */
  cull?: number;
  /** Apply tint. Default true. */
  tint?: boolean;
}

export interface ModelBox {
  from: [number, number, number];
  to: [number, number, number];
  faces: Partial<Record<FaceKey, ModelFace>>;
  /** Element rotation about `origin` (1/16 units) around one axis, degrees (±22.5/45 ...). */
  rotation?: { axis: 'x' | 'y' | 'z'; angle: number; origin: [number, number, number] };
}

/** Returns a neighbouring state relative to the block (dx,dy,dz in -1..1). */
export type NeighborFn = (dx: number, dy: number, dz: number) => number;

// --------------------------------------------------------------------------------------
const isFull = (s: number) => T_FULL_CUBE[s >>> 4] === 1;
const nameOf = (s: number) => BLOCKS[s >>> 4].name;
const shapeOf = (s: number) => BLOCKS[s >>> 4].shape;
const tagsOf = (s: number) => BLOCKS[s >>> 4].tags;

function box(from: [number, number, number], to: [number, number, number], f: Faces | string, cullOuter = true, only?: FaceKey[]): ModelBox {
  const fx: Faces = typeof f === 'string' ? { up: f, down: f, north: f, south: f, west: f, east: f } : f;
  const faces: Partial<Record<FaceKey, ModelFace>> = {};
  for (const k of only ?? FACE_KEYS) {
    const mf: ModelFace = { tex: fx[k] };
    if (cullOuter) {
      if (k === 'down' && from[1] === 0) mf.cull = Dir.DOWN;
      if (k === 'up' && to[1] === 16) mf.cull = Dir.UP;
      if (k === 'north' && from[2] === 0) mf.cull = Dir.NORTH;
      if (k === 'south' && to[2] === 16) mf.cull = Dir.SOUTH;
      if (k === 'west' && from[0] === 0) mf.cull = Dir.WEST;
      if (k === 'east' && to[0] === 16) mf.cull = Dir.EAST;
    }
    faces[k] = mf;
  }
  return { from, to, faces };
}

/** Rotate a box model about the block's vertical axis by hfacing (0 south = identity, the model is authored facing SOUTH(+Z)). */
export function rotateBoxesY(boxes: ModelBox[], quarterTurns: number): ModelBox[] {
  const q = ((quarterTurns % 4) + 4) % 4;
  if (q === 0) return boxes;
  return boxes.map((b) => {
    let { from, to } = b;
    let faces = b.faces;
    for (let i = 0; i < q; i++) {
      // rotate 90° clockwise seen from above: (x,z) -> (16 - z, x)  (south -> west -> north -> east)
      const nf: [number, number, number] = [16 - to[2], from[1], from[0]];
      const nt: [number, number, number] = [16 - from[2], to[1], to[0]];
      from = nf;
      to = nt;
      const rf: Partial<Record<FaceKey, ModelFace>> = {};
      const map: Record<FaceKey, FaceKey> = { up: 'up', down: 'down', south: 'west', west: 'north', north: 'east', east: 'south' };
      for (const k of Object.keys(faces) as FaceKey[]) {
        const f = faces[k]!;
        const nk = map[k];
        const cullMap: Record<number, number> = { [Dir.SOUTH]: Dir.WEST, [Dir.WEST]: Dir.NORTH, [Dir.NORTH]: Dir.EAST, [Dir.EAST]: Dir.SOUTH, [Dir.UP]: Dir.UP, [Dir.DOWN]: Dir.DOWN };
        const nf2: ModelFace = { ...f, cull: f.cull === undefined ? undefined : cullMap[f.cull] };
        if (k === 'up' || k === 'down') nf2.rot = ((f.rot ?? 0) + (k === 'up' ? 90 : 270)) % 360;
        rf[nk] = nf2;
      }
      faces = rf;
    }
    let rotation = b.rotation;
    if (rotation) {
      let { axis, angle, origin } = rotation;
      for (let i = 0; i < q; i++) {
        origin = [16 - origin[2], origin[1], origin[0]];
        if (axis === 'x') { axis = 'z'; }
        else if (axis === 'z') { axis = 'x'; angle = -angle; }
      }
      rotation = { axis, angle, origin };
    }
    return { from, to, faces, rotation };
  });
}

/** hfacing (S=0,W=1,N=2,E=3) to quarter turns from SOUTH. */
const hq = (h: number) => h & 3;

// --------------------------------------------------------------------------------------
// Connection helpers
function connectsFence(self: number, other: number, dir: number): boolean {
  if (other === 0) return false;
  const sh = shapeOf(other);
  if (isFull(other)) return true;
  const sn = nameOf(self);
  const on = nameOf(other);
  if (sh === 'fence') {
    const selfNether = sn === 'nether_brick_fence', otherNether = on === 'nether_brick_fence';
    return selfNether === otherNether;
  }
  if (sh === 'fence_gate') {
    const facing = other & 3; // gate axis: facing S/N -> gate spans X axis, connects on W/E
    const spansX = facing === 0 || facing === 2;
    return spansX ? dir === Dir.WEST || dir === Dir.EAST : dir === Dir.NORTH || dir === Dir.SOUTH;
  }
  return false;
}
function connectsPane(other: number): boolean {
  if (other === 0) return false;
  if (isFull(other)) return true;
  const sh = shapeOf(other);
  return sh === 'pane' || sh === 'wall';
}
function connectsWall(other: number, dir: number): boolean {
  if (other === 0) return false;
  if (isFull(other)) return true;
  const sh = shapeOf(other);
  if (sh === 'wall' || sh === 'pane') return true;
  if (sh === 'fence_gate') {
    const facing = other & 3;
    const spansX = facing === 0 || facing === 2;
    return spansX ? dir === Dir.WEST || dir === Dir.EAST : dir === Dir.NORTH || dir === Dir.SOUTH;
  }
  return false;
}

const HDIRS: [number, number, number][] = [
  [0, 0, -1], // north
  [0, 0, 1], // south
  [-1, 0, 0], // west
  [1, 0, 0], // east
];

// --------------------------------------------------------------------------------------
// Stairs shape resolution (Minecraft logic)
// stairs meta: bits0-1 hfacing = the direction the stairs ascend TOWARD (the tall back side), bit2 upside down
const HF_DX = [0, -1, 0, 1]; // S, W, N, E
const HF_DZ = [1, 0, -1, 0];
const leftOf = (h: number) => (h + 1) & 3; // counter-clockwise from above: S->W? (S=0,W=1,N=2,E=3) facing S, left side is E...
export type StairShape = 'straight' | 'inner_left' | 'inner_right' | 'outer_left' | 'outer_right';

function isStairs(s: number) {
  return s !== 0 && shapeOf(s) === 'stairs';
}
/** Rotation helpers: clockwise (seen from above) of hfacing S->W->N->E. */
const cw = (h: number) => (h + 1) & 3;
const ccw = (h: number) => (h + 3) & 3;

export function stairShape(state: number, nb: NeighborFn): StairShape {
  const facing = state & 3;
  const half = (state >> 2) & 1;
  // block in front-of-back (in facing direction)
  const back = nb(HF_DX[facing], 0, HF_DZ[facing]);
  if (isStairs(back) && ((back >> 2) & 1) === half) {
    const bf = back & 3;
    if ((bf & 1) !== (facing & 1)) {
      // perpendicular
      const side = nb(-HF_DX[bf], 0, -HF_DZ[bf]);
      if (!isStairs(side) || (side & 3) !== facing || ((side >> 2) & 1) !== half) {
        return bf === ccw(facing) ? 'outer_left' : 'outer_right';
      }
    }
  }
  const front = nb(-HF_DX[facing], 0, -HF_DZ[facing]);
  if (isStairs(front) && ((front >> 2) & 1) === half) {
    const ff = front & 3;
    if ((ff & 1) !== (facing & 1)) {
      const side = nb(HF_DX[ff], 0, HF_DZ[ff]);
      if (!isStairs(side) || (side & 3) !== facing || ((side >> 2) & 1) !== half) {
        return ff === ccw(facing) ? 'inner_left' : 'inner_right';
      }
    }
  }
  return 'straight';
}

/** Stair boxes (authored ascending toward SOUTH = +Z), then rotated. */
function stairBoxes(def: BlockDef, state: number, nb: NeighborFn): ModelBox[] {
  const f = facesFor(def, state & 15);
  const facing = state & 3;
  const top = (state >> 2) & 1;
  const shape = stairShape(state, nb);
  const out: ModelBox[] = [];
  // base slab
  out.push(top ? box([0, 8, 0], [16, 16, 16], f) : box([0, 0, 0], [16, 8, 16], f));
  const y0 = top ? 0 : 8, y1 = top ? 8 : 16;
  // step pieces authored for facing SOUTH (back at +Z). left = east(+X) when facing south? Viewer looking toward +Z: left is +X.
  const pieces: [number, number, number, number][] = []; // x0,z0,x1,z1
  if (shape === 'straight') pieces.push([0, 8, 16, 16]);
  else if (shape === 'outer_left') pieces.push([8, 8, 16, 16]);
  else if (shape === 'outer_right') pieces.push([0, 8, 8, 16]);
  else if (shape === 'inner_left') { pieces.push([0, 8, 16, 16]); pieces.push([8, 0, 16, 8]); }
  else if (shape === 'inner_right') { pieces.push([0, 8, 16, 16]); pieces.push([0, 0, 8, 8]); }
  const steps = pieces.map((p) => box([p[0], y0, p[1]], [p[2], y1, p[3]], f));
  // rotate steps by facing (authored for SOUTH)
  out.push(...rotateBoxesY(steps, hq(facing)));
  void leftOf; void cw;
  return out;
}

// --------------------------------------------------------------------------------------
/**
 * Box model for a block state, or null if the shape is rendered specially by the mesher
 * (cube, grass_block, leaves, cross, crop, liquid, wire, rail, portal, fire, vine ...).
 */
export function getBoxModel(state: number, nb: NeighborFn): ModelBox[] | null {
  const def = BLOCKS[state >>> 4];
  const meta = state & 15;
  const f = facesFor(def, meta);
  switch (def.shape) {
    case 'slab': {
      if (meta === 2) return [box([0, 0, 0], [16, 16, 16], f)];
      return meta === 1 ? [box([0, 8, 0], [16, 16, 16], f)] : [box([0, 0, 0], [16, 8, 16], f)];
    }
    case 'stairs':
      return stairBoxes(def, state, nb);
    case 'fence': {
      const t = f.north;
      const out: ModelBox[] = [box([6, 0, 6], [10, 16, 10], t)];
      const [n, s, w, e] = HDIRS.map(([dx, dy, dz], i) => connectsFence(state, nb(dx, dy, dz), [Dir.NORTH, Dir.SOUTH, Dir.WEST, Dir.EAST][i]));
      const bars = (x0: number, z0: number, x1: number, z1: number) => {
        out.push(box([x0, 12, z0], [x1, 15, z1], t, false));
        out.push(box([x0, 6, z0], [x1, 9, z1], t, false));
      };
      if (n) bars(7, 0, 9, 6);
      if (s) bars(7, 10, 9, 16);
      if (w) bars(0, 7, 6, 9);
      if (e) bars(10, 7, 16, 9);
      return out;
    }
    case 'fence_gate': {
      const t = f.north;
      const facing = meta & 3, open = (meta >> 2) & 1;
      // authored facing SOUTH: gate spans X axis at z 7..9
      const parts: ModelBox[] = [box([0, 5, 7], [2, 16, 9], t, false), box([14, 5, 7], [16, 16, 9], t, false)];
      if (!open) {
        parts.push(box([2, 6, 7], [14, 9, 9], t, false), box([2, 12, 7], [14, 15, 9], t, false), box([6, 9, 7], [10, 12, 9], t, false));
      } else {
        parts.push(box([0, 6, 9], [2, 15, 16], t, false), box([14, 6, 9], [16, 15, 16], t, false));
      }
      return rotateBoxesY(parts, hq(facing));
    }
    case 'wall': {
      const t = f.north;
      const [n, s, w, e] = HDIRS.map(([dx, dy, dz], i) => connectsWall(nb(dx, dy, dz), [Dir.NORTH, Dir.SOUTH, Dir.WEST, Dir.EAST][i]));
      const above = nb(0, 1, 0);
      const straight = (n && s && !w && !e) || (w && e && !n && !s);
      const post = !straight || (above !== 0 && shapeOf(above) === 'wall');
      const out: ModelBox[] = [];
      if (post) out.push(box([4, 0, 4], [12, 16, 12], f));
      const h = 14;
      if (n) out.push(box([5, 0, 0], [11, h, post ? 4 : 8], t, true));
      if (s) out.push(box([5, 0, post ? 12 : 8], [11, h, 16], t, true));
      if (w) out.push(box([0, 0, 5], [post ? 4 : 8, h, 11], t, true));
      if (e) out.push(box([post ? 12 : 8, 0, 5], [16, h, 11], t, true));
      if (!post && straight && n) out[out.length - 1] = box([5, 0, 0], [11, h, 16], t, true);
      if (!post && straight && w) {
        out.length = 0;
        out.push(box([0, 0, 5], [16, h, 11], t, true));
      }
      return out;
    }
    case 'pane': {
      const t = f.north;
      const [n, s, w, e] = HDIRS.map(([dx, dy, dz]) => connectsPane(nb(dx, dy, dz)));
      const out: ModelBox[] = [box([7, 0, 7], [9, 16, 9], t)];
      if (n) out.push(box([7, 0, 0], [9, 16, 7], t));
      if (s) out.push(box([7, 0, 9], [9, 16, 16], t));
      if (w) out.push(box([0, 0, 7], [7, 16, 9], t));
      if (e) out.push(box([9, 0, 7], [16, 16, 9], t));
      if (!n && !s && !w && !e) {
        out.push(box([7, 0, 0], [9, 16, 7], t), box([7, 0, 9], [9, 16, 16], t), box([0, 0, 7], [7, 16, 9], t), box([9, 0, 7], [16, 16, 9], t));
      }
      return out;
    }
    case 'door': {
      // Determine facing/open/hinge from lower+upper halves
      const upper = (meta & 8) !== 0;
      const lower = upper ? nb(0, -1, 0) : state;
      const up = upper ? state : nb(0, 1, 0);
      const facing = lower & 3, open = (lower >> 2) & 1, hingeRight = up & 1;
      const tex = f.north;
      // closed door authored facing SOUTH: slab at z 13..16? Minecraft door: closed panel at the back (z 13..16) when facing south (player looks south)
      const df: Faces = { up: tex, down: tex, north: tex, south: tex, west: tex, east: tex };
      let b = box([0, 0, 13], [16, 16, 16], df, true);
      // edge faces use a thin strip of the texture
      b.faces.west = { tex, uv: [13, 0, 16, 16], cull: Dir.WEST };
      b.faces.east = { tex, uv: [13, 0, 16, 16], cull: Dir.EAST };
      b.faces.up = { tex, uv: [0, 13, 16, 16] };
      b.faces.down = { tex, uv: [0, 13, 16, 16] };
      b.faces.north = { tex, uv: [16, 0, 0, 16] };
      let turns = hq(facing);
      if (open) turns += hingeRight ? 3 : 1;
      return rotateBoxesY([b], turns);
    }
    case 'trapdoor': {
      const facing = meta & 3, open = (meta >> 2) & 1, topHalf = (meta >> 3) & 1;
      const tex = f.north;
      if (!open) return [topHalf ? box([0, 13, 0], [16, 16, 16], tex) : box([0, 0, 0], [16, 3, 16], tex)];
      // open: vertical panel against the side opposite to facing (authored facing SOUTH -> panel at z 0..3? Minecraft: open trapdoor sits at the block side the hinge is on)
      return rotateBoxesY([box([0, 0, 13], [16, 16, 16], tex)], hq(facing));
    }
    case 'torch': {
      const tex = f.north;
      const tf: Faces = { up: tex, down: tex, north: tex, south: tex, west: tex, east: tex };
      const b: ModelBox = {
        from: [7, 0, 7], to: [9, 10, 9],
        faces: {
          up: { tex, uv: [7, 6, 9, 8] }, down: { tex, uv: [7, 13, 9, 15] },
          north: { tex, uv: [7, 0, 9, 10] }, south: { tex, uv: [7, 0, 9, 10] }, west: { tex, uv: [7, 0, 9, 10] }, east: { tex, uv: [7, 0, 9, 10] },
        },
      };
      void tf;
      if (meta <= 1) return [b];
      // wall torch: authored leaning away from a wall to the NORTH, pointing SOUTH (meta = SOUTH = 3)
      const wall: ModelBox = {
        from: [-1, 3.5, 7], to: [1, 13.5, 9], faces: b.faces,
        rotation: { axis: 'z', angle: -22.5, origin: [0, 3.5, 8] },
      };
      // our authored wall torch leans toward +X (EAST) from a wall at x=0 -> facing EAST
      const turnsFromEast: Record<number, number> = { [Dir.EAST]: 0, [Dir.SOUTH]: 1, [Dir.WEST]: 2, [Dir.NORTH]: 3 };
      return rotateBoxesY([wall], (turnsFromEast[meta] ?? 0) + 3);
    }
    case 'ladder': {
      const tex = f.north;
      // ladder faces hfacing: attached to the wall behind it. authored facing SOUTH (wall at north): panel at z 0..1
      return rotateBoxesY([box([0, 0, 0], [16, 16, 1], tex, false, ['south', 'north'])], hq(meta) + 2);
    }
    case 'lever': {
      const attach = meta & 7, powered = (meta >> 3) & 1;
      const baseTex = 'cobblestone', handle = f.north;
      // authored on floor
      let base: ModelBox[] = [box([5, 0, 4], [11, 3, 12], baseTex, false)];
      const stick: ModelBox = {
        from: [7, 1, 7], to: [9, 11, 9],
        faces: { up: { tex: handle, uv: [7, 6, 9, 8] }, north: { tex: handle, uv: [7, 0, 9, 10] }, south: { tex: handle, uv: [7, 0, 9, 10] }, west: { tex: handle, uv: [7, 0, 9, 10] }, east: { tex: handle, uv: [7, 0, 9, 10] } },
        rotation: { axis: 'x', angle: powered ? -45 : 45, origin: [8, 1, 8] },
      };
      base.push(stick);
      if (attach === 1) return base;
      if (attach === 0) return base.map((b) => flipY(b));
      // wall: rotate the floor model so it sits on the wall
      const wallTurn: Record<number, number> = { 2: 2, 3: 0, 4: 1, 5: 3 };
      return rotateBoxesY(base.map((b) => floorToWall(b)), wallTurn[attach] ?? 0);
    }
    case 'button': {
      const attach = meta & 7, pressed = (meta >> 3) & 1;
      const tex = f.north;
      const d = pressed ? 1 : 2;
      const b = box([5, 0, 6], [11, d, 10], tex, false);
      if (attach === 1) return [b];
      if (attach === 0) return [flipY(b)];
      const wallTurn: Record<number, number> = { 2: 2, 3: 0, 4: 1, 5: 3 };
      return rotateBoxesY([floorToWall(b)], wallTurn[attach] ?? 0);
    }
    case 'pressure_plate':
      return [box([1, 0, 1], [15, meta ? 0.5 : 1, 15], f.north, false)];
    case 'carpet':
      return [box([0, 0, 0], [16, 1, 16], f)];
    case 'snow_layer': {
      const h = Math.min(16, ((meta & 7) + 1) * 2);
      return [box([0, 0, 0], [16, h, 16], f)];
    }
    case 'farmland':
    case 'path':
      return [box([0, 0, 0], [16, 15, 16], f)];
    case 'cactus': {
      const b = box([1, 0, 1], [15, 16, 15], f, false);
      b.faces.up!.cull = Dir.UP;
      b.faces.down!.cull = Dir.DOWN;
      return [b];
    }
    case 'repeater':
    case 'comparator': {
      const facing = meta & 3;
      const out: ModelBox[] = [box([0, 0, 0], [16, 2, 16], f)];
      const torchTex = def.name === 'powered_repeater' || (def.shape === 'comparator' && meta & 8) ? 'redstone_torch' : 'redstone_torch_off';
      const torch = (x: number, z: number, h = 5): ModelBox => ({
        from: [x - 1, 2, z - 1], to: [x + 1, 2 + h, z + 1],
        faces: { up: { tex: torchTex, uv: [7, 6, 9, 8] }, north: { tex: torchTex, uv: [7, 3, 9, 8] }, south: { tex: torchTex, uv: [7, 3, 9, 8] }, west: { tex: torchTex, uv: [7, 3, 9, 8] }, east: { tex: torchTex, uv: [7, 3, 9, 8] } },
      });
      if (def.shape === 'repeater') {
        const delay = (meta >> 2) & 3;
        out.push(torch(8, 2 + 2 * delay + 4 - 2), torch(8, 14 - 2));
        out[1].from[2] = 2 + 2 * delay + 1; out[1].to[2] = 2 + 2 * delay + 3;
        out[2].from[2] = 11; out[2].to[2] = 13;
      } else {
        out.push(torch(4, 11), torch(12, 11), torch(8, 3, meta & 4 ? 4 : 3));
      }
      // authored with output toward NORTH(-Z) = facing... repeater meta facing = output direction
      return [out[0], ...rotateBoxesY(out.slice(1), hq(facing) + 2)];
    }
    case 'piston': {
      const facing = meta & 7, extended = (meta >> 3) & 1;
      if (!extended) return null; // full cube
      return orientFacing([box([0, 0, 0], [16, 16, 12], f)], facing);
    }
    case 'piston_head': {
      const facing = meta & 7;
      const tex = f.north, side = 'piston_side';
      const plate = box([0, 0, 12], [16, 16, 16], { up: side, down: side, west: side, east: side, north: tex, south: tex });
      const arm = box([6, 6, -4], [10, 10, 12], side, false);
      return orientFacing([plate, arm], facing);
    }
    case 'bed': {
      const facing = meta & 3, head = (meta >> 3) & 1;
      const tex = f.north;
      const frame = 'oak_planks';
      const out: ModelBox[] = [box([0, 3, 0], [16, 9, 16], { up: tex, down: frame, north: tex, south: tex, west: tex, east: tex })];
      // legs at the outer corners
      if (head) out.push(box([0, 0, 13], [3, 3, 16], frame, false), box([13, 0, 13], [16, 3, 16], frame, false));
      else out.push(box([0, 0, 0], [3, 3, 3], frame, false), box([13, 0, 0], [16, 3, 3], frame, false));
      if (head) {
        const pillow = box([1, 9, 10], [15, 11, 15], 'wool', false);
        for (const k of FACE_KEYS) if (pillow.faces[k]) pillow.faces[k]!.tint = false;
        out.push(pillow);
      }
      // authored with head toward +Z (facing SOUTH)
      return rotateBoxesY(out, hq(facing));
    }
    case 'chest':
      return rotateBoxesY([box([1, 0, 1], [15, 14, 15], f.north, false), box([7, 7, 15], [9, 11, 16], 'iron_block', false)], hq(meta));
    case 'end_portal_frame': {
      const eye = (meta >> 2) & 1;
      const out = [box([0, 0, 0], [16, 13, 16], f)];
      if (eye) out.push(box([4, 13, 4], [12, 16, 12], 'end_portal', false));
      return out;
    }
    case 'enchanting_table':
      return [box([0, 0, 0], [16, 12, 16], f)];
    case 'daylight_detector':
      return [box([0, 0, 0], [16, 6, 16], f)];
    case 'lily_pad':
      return [box([0, 0.25, 0], [16, 0.25, 16], f.up, false, ['up', 'down'])];
    case 'cake': {
      const bites = meta & 7;
      return [box([1 + bites * 2, 0, 1], [15, 8, 15], f, false)];
    }
    case 'cauldron': {
      const t = f.north, out: ModelBox[] = [];
      out.push(box([0, 3, 0], [16, 16, 2], t, false), box([0, 3, 14], [16, 16, 16], t, false), box([0, 3, 2], [2, 16, 14], t, false), box([14, 3, 2], [16, 16, 14], t, false));
      out.push(box([2, 3, 2], [14, 4, 14], f.up, false));
      out.push(box([0, 0, 0], [4, 3, 2], t, false), box([0, 0, 2], [2, 3, 4], t, false), box([12, 0, 0], [16, 3, 2], t, false), box([14, 0, 2], [16, 3, 4], t, false));
      out.push(box([0, 0, 14], [4, 3, 16], t, false), box([0, 0, 12], [2, 3, 14], t, false), box([12, 0, 14], [16, 3, 16], t, false), box([14, 0, 12], [16, 3, 14], t, false));
      return out;
    }
    case 'brewing_stand':
      return [box([7, 0, 7], [9, 14, 9], 'brewing_stand', false), box([9, 0, 5], [15, 2, 11], 'brewing_stand_base', false), box([2, 0, 1], [8, 2, 7], 'brewing_stand_base', false), box([2, 0, 9], [8, 2, 15], 'brewing_stand_base', false)];
    case 'anvil': {
      const t = f.north;
      return rotateBoxesY([
        box([2, 0, 2], [14, 4, 14], t, false), box([4, 4, 3], [12, 5, 13], t, false), box([6, 5, 4], [10, 10, 12], t, false),
        box([3, 10, 0], [13, 16, 16], { up: f.up, down: t, north: t, south: t, west: t, east: t }, false),
      ], hq(meta) + 1);
    }
    case 'lantern': {
      const t = f.north, hanging = meta & 1;
      const y = hanging ? 1 : 0;
      return [box([5, y, 5], [11, y + 7, 11], t, false), box([6, y + 7, 6], [10, y + 9, 10], t, false)];
    }
    case 'campfire': {
      const t = 'campfire_log';
      return rotateBoxesY([box([1, 0, 0], [5, 4, 16], t, false), box([11, 0, 0], [15, 4, 16], t, false), box([0, 3, 1], [16, 7, 5], t, false), box([0, 3, 11], [16, 7, 15], t, false), box([5, 0, 4], [11, 1, 12], 'campfire_log', false)], hq(meta));
    }
    case 'hopper': {
      const t = f.north;
      const out = [
        box([0, 10, 0], [16, 11, 16], { up: f.up, down: t, north: t, south: t, west: t, east: t }, false),
        box([0, 11, 0], [2, 16, 16], t, false), box([14, 11, 0], [16, 16, 16], t, false), box([2, 11, 0], [14, 16, 2], t, false), box([2, 11, 14], [14, 16, 16], t, false),
        box([4, 4, 4], [12, 10, 12], t, false),
      ];
      const facing = meta & 7;
      if (facing === Dir.DOWN || facing > 5) out.push(box([6, 0, 6], [10, 4, 10], t, false));
      else {
        const spout: Record<number, ModelBox> = {
          [Dir.NORTH]: box([6, 4, 0], [10, 8, 4], t, false), [Dir.SOUTH]: box([6, 4, 12], [10, 8, 16], t, false),
          [Dir.WEST]: box([0, 4, 6], [4, 8, 10], t, false), [Dir.EAST]: box([12, 4, 6], [16, 8, 10], t, false),
        };
        out.push(spout[facing]);
      }
      return out;
    }
    case 'dragon_egg': {
      const t = f.north;
      return [box([6, 15, 6], [10, 16, 10], t, false), box([5, 14, 5], [11, 15, 11], t, false), box([4, 13, 4], [12, 14, 12], t, false), box([3, 11, 3], [13, 13, 13], t, false),
        box([2, 8, 2], [14, 11, 14], t, false), box([1, 3, 1], [15, 8, 15], t, false), box([2, 1, 2], [14, 3, 14], t, false), box([3, 0, 3], [13, 1, 13], t, false)];
    }
    case 'chain': {
      const t = f.north;
      const b = box([6.5, 0, 6.5], [9.5, 16, 9.5], t, false, ['north', 'south', 'west', 'east']);
      return orientAxis([b], meta & 3);
    }
    case 'end_rod': {
      const t = f.north;
      return orientFacing([box([7, 7, 0], [9, 9, 15], t, false), box([6, 6, 15], [10, 10, 16], t, false)], meta & 7);
    }
    case 'sea_pickle':
      return [box([6, 0, 6], [10, 6, 10], f, false)];
    case 'scaffolding':
      return [
        box([0, 14, 0], [16, 16, 16], f, false),
        box([0, 0, 0], [2, 14, 2], f.north, false), box([14, 0, 0], [16, 14, 2], f.north, false), box([0, 0, 14], [2, 14, 16], f.north, false), box([14, 0, 14], [16, 14, 16], f.north, false),
      ];
    case 'flower_pot':
      return [box([5, 0, 5], [11, 6, 11], 'terracotta', false)];
    default:
      return null;
  }
}

/** Mirror a box vertically (floor -> ceiling). */
function flipY(b: ModelBox): ModelBox {
  const out: ModelBox = { from: [b.from[0], 16 - b.to[1], b.from[2]], to: [b.to[0], 16 - b.from[1], b.to[2]], faces: { ...b.faces } };
  const up = b.faces.up, down = b.faces.down;
  out.faces.up = down;
  out.faces.down = up;
  if (b.rotation) out.rotation = { axis: b.rotation.axis, angle: -b.rotation.angle, origin: [b.rotation.origin[0], 16 - b.rotation.origin[1], b.rotation.origin[2]] };
  return out;
}

/** Floor-authored box (lying on y=0) -> mounted on the NORTH wall (z=0), facing SOUTH. */
function floorToWall(b: ModelBox): ModelBox {
  // map (x, y, z) -> (x, 16 - z, y)  : floor normal +Y becomes +Z
  const fy = [b.from[1], b.to[1]], fz = [b.from[2], b.to[2]];
  const out: ModelBox = {
    from: [b.from[0], 16 - fz[1], fy[0]],
    to: [b.to[0], 16 - fz[0], fy[1]],
    faces: { west: b.faces.west, east: b.faces.east, south: b.faces.up, north: b.faces.down, up: b.faces.north, down: b.faces.south },
  };
  if (b.rotation) {
    const o = b.rotation.origin;
    out.rotation = { axis: b.rotation.axis === 'x' ? 'x' : b.rotation.axis === 'y' ? 'z' : 'y', angle: b.rotation.angle, origin: [o[0], 16 - o[2], o[1]] };
  }
  return out;
}

/** Boxes authored pointing NORTH(-Z)... here authored pointing SOUTH(+Z) (piston/end rod along z 0..16 with head at +Z) -> orient to Dir. */
function orientFacing(boxes: ModelBox[], facing: number): ModelBox[] {
  if (facing === Dir.SOUTH) return boxes;
  if (facing === Dir.WEST) return rotateBoxesY(boxes, 1);
  if (facing === Dir.NORTH) return rotateBoxesY(boxes, 2);
  if (facing === Dir.EAST) return rotateBoxesY(boxes, 3);
  // UP / DOWN: map z -> y
  return boxes.map((b) => {
    const up = facing === Dir.UP;
    const tz = (z: number) => (up ? z : 16 - z);
    const z0 = tz(b.from[2]), z1 = tz(b.to[2]);
    return {
      from: [b.from[0], Math.min(z0, z1), 16 - b.to[1]],
      to: [b.to[0], Math.max(z0, z1), 16 - b.from[1]],
      faces: up
        ? { up: b.faces.south, down: b.faces.north, north: b.faces.up, south: b.faces.down, west: b.faces.west, east: b.faces.east }
        : { down: b.faces.south, up: b.faces.north, north: b.faces.down, south: b.faces.up, west: b.faces.west, east: b.faces.east },
    } as ModelBox;
  });
}

/** Boxes authored along Y -> along axis (0 y, 1 x, 2 z). */
function orientAxis(boxes: ModelBox[], axis: number): ModelBox[] {
  if (axis === 0) return boxes;
  return boxes.map((b) => {
    if (axis === 1) {
      return { from: [b.from[1], b.from[0], b.from[2]], to: [b.to[1], b.to[0], b.to[2]], faces: { west: b.faces.down ?? b.faces.north, east: b.faces.up ?? b.faces.north, up: b.faces.west, down: b.faces.east, north: b.faces.north, south: b.faces.south } } as ModelBox;
    }
    return { from: [b.from[0], b.from[2], b.from[1]], to: [b.to[0], b.to[2], b.to[1]], faces: { north: b.faces.down ?? b.faces.west, south: b.faces.up ?? b.faces.west, up: b.faces.north, down: b.faces.south, west: b.faces.west, east: b.faces.east } } as ModelBox;
  });
}

// --------------------------------------------------------------------------------------
// Collision & outline boxes, in block-local units (0..1), appended as [x0,y0,z0,x1,y1,z1]

export function getCollisionBoxes(state: number, nb: NeighborFn, out: number[]): void {
  const def = BLOCKS[state >>> 4];
  if (!def.solid) return;
  const meta = state & 15;
  switch (def.shape) {
    case 'cube': case 'grass_block': case 'leaves':
      out.push(0, 0, 0, 1, 1, 1); return;
    case 'fence': {
      out.push(0.375, 0, 0.375, 0.625, 1.5, 0.625);
      const conn = HDIRS.map(([dx, dy, dz], i) => connectsFence(state, nb(dx, dy, dz), [Dir.NORTH, Dir.SOUTH, Dir.WEST, Dir.EAST][i]));
      if (conn[0]) out.push(0.375, 0, 0, 0.625, 1.5, 0.375);
      if (conn[1]) out.push(0.375, 0, 0.625, 0.625, 1.5, 1);
      if (conn[2]) out.push(0, 0, 0.375, 0.375, 1.5, 0.625);
      if (conn[3]) out.push(0.625, 0, 0.375, 1, 1.5, 0.625);
      return;
    }
    case 'wall': {
      out.push(0.25, 0, 0.25, 0.75, 1.5, 0.75);
      const conn = HDIRS.map(([dx, dy, dz], i) => connectsWall(nb(dx, dy, dz), [Dir.NORTH, Dir.SOUTH, Dir.WEST, Dir.EAST][i]));
      if (conn[0]) out.push(0.3125, 0, 0, 0.6875, 1.5, 0.25);
      if (conn[1]) out.push(0.3125, 0, 0.75, 0.6875, 1.5, 1);
      if (conn[2]) out.push(0, 0, 0.3125, 0.25, 1.5, 0.6875);
      if (conn[3]) out.push(0.75, 0, 0.3125, 1, 1.5, 0.6875);
      return;
    }
    case 'fence_gate': {
      if ((meta >> 2) & 1) return;
      const facing = meta & 3;
      if (facing === 0 || facing === 2) out.push(0, 0, 0.375, 1, 1.5, 0.625);
      else out.push(0.375, 0, 0, 0.625, 1.5, 1);
      return;
    }
    case 'cactus':
      out.push(0.0625, 0, 0.0625, 0.9375, 0.9375, 0.9375); return;
    case 'lily_pad':
      out.push(0, 0, 0, 1, 0.09375, 1); return;
    case 'cobweb':
      return;
    case 'bamboo' as any:
      out.push(0.40625, 0, 0.40625, 0.59375, 1, 0.59375); return;
    default: {
      if (def.shape === 'cross') { if (def.name === 'bamboo') out.push(0.40625, 0, 0.40625, 0.59375, 1, 0.59375); return; }
      const boxes = getBoxModel(state, nb);
      if (!boxes) { out.push(0, 0, 0, 1, 1, 1); return; }
      if (def.shape === 'snow_layer') { const h = (meta & 7) * 2 / 16; if (h > 0) out.push(0, 0, 0, 1, h, 1); return; }
      for (const b of boxes) {
        if (b.rotation) continue;
        // skip tiny decorative parts
        const sx = b.to[0] - b.from[0], sy = b.to[1] - b.from[1], sz = b.to[2] - b.from[2];
        if (sx * sy * sz < 2 && def.shape !== 'carpet' && def.shape !== 'pressure_plate') continue;
        out.push(b.from[0] / 16, b.from[1] / 16, b.from[2] / 16, b.to[0] / 16, b.to[1] / 16, b.to[2] / 16);
      }
    }
  }
}

/** Selection outline/raycast boxes (block-local units). */
export function getOutlineBoxes(state: number, nb: NeighborFn, out: number[]): void {
  const def = BLOCKS[state >>> 4];
  const meta = state & 15;
  switch (def.shape) {
    case 'air': case 'liquid': return;
    case 'cube': case 'grass_block': case 'leaves':
      out.push(0, 0, 0, 1, 1, 1); return;
    case 'cross': case 'double_plant':
      out.push(0.125, 0, 0.125, 0.875, def.shape === 'double_plant' ? 1 : 0.8125, 0.875); return;
    case 'crop': case 'stem':
      out.push(0, 0, 0, 1, 0.25 + 0.75 * ((meta & 7) / 7), 1); return;
    case 'fire': case 'portal': case 'end_portal':
      out.push(0, 0, 0, 1, def.shape === 'end_portal' ? 0.75 : 1, 1); return;
    case 'wire': case 'rail':
      out.push(0, 0, 0, 1, 0.0625, 1); return;
    case 'vine':
      out.push(0, 0, 0, 1, 1, 1); return;
    case 'torch':
      if (meta <= 1) out.push(0.375, 0, 0.375, 0.625, 0.625, 0.625);
      else {
        const m: Record<number, number[]> = {
          [Dir.NORTH]: [0.34, 0.2, 0.69, 0.66, 0.8, 1], [Dir.SOUTH]: [0.34, 0.2, 0, 0.66, 0.8, 0.31],
          [Dir.WEST]: [0.69, 0.2, 0.34, 1, 0.8, 0.66], [Dir.EAST]: [0, 0.2, 0.34, 0.31, 0.8, 0.66],
        };
        out.push(...(m[meta] ?? [0.375, 0, 0.375, 0.625, 0.625, 0.625]));
      }
      return;
    default: {
      const boxes = getBoxModel(state, nb);
      if (!boxes) { out.push(0, 0, 0, 1, 1, 1); return; }
      let x0 = 16, y0 = 16, z0 = 16, x1 = 0, y1 = 0, z1 = 0;
      for (const b of boxes) {
        x0 = Math.min(x0, b.from[0]); y0 = Math.min(y0, b.from[1]); z0 = Math.min(z0, b.from[2]);
        x1 = Math.max(x1, b.to[0]); y1 = Math.max(y1, b.to[1]); z1 = Math.max(z1, b.to[2]);
      }
      if (def.shape === 'stairs' || def.shape === 'fence' || def.shape === 'wall' || def.shape === 'pane') {
        for (const b of boxes) out.push(Math.max(0, b.from[0] / 16), Math.max(0, b.from[1] / 16), Math.max(0, b.from[2] / 16), Math.min(1, b.to[0] / 16), Math.min(1, b.to[1] / 16), Math.min(1, b.to[2] / 16));
        return;
      }
      out.push(Math.max(0, x0 / 16), Math.max(0, y0 / 16), Math.max(0, z0 / 16), Math.min(1, x1 / 16), Math.min(1, Math.max(y1, 0.5) / 16), Math.min(1, z1 / 16));
    }
  }
}

export { isFull as isFullCubeState, tagsOf };
