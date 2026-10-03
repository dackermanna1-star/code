/**
 * Pure portal geometry (no game imports, unit tested):
 *  - Nether portal frame detection, a port of Minecraft's PortalShape (obsidian frame, interior
 *    2..21 wide and 3..21 tall, corners optional).
 *  - End portal ring detection (12 frames with eyes around a 3x3 interior).
 */

export type GetState = (x: number, y: number, z: number) => number;

export interface PortalShape {
  /** Bottom-left interior block (the end opposite to `right`). */
  x: number;
  y: number;
  z: number;
  /** 0 = portal plane along X (thin in Z), 1 = along Z. */
  axis: 0 | 1;
  width: number;
  height: number;
  /** Existing portal blocks inside the frame. */
  portalBlocks: number;
  /** Unit step along the width (vanilla "rightDir": WEST for X, SOUTH for Z). */
  rx: number;
  rz: number;
}

export interface PortalPredicates {
  isFrame(state: number): boolean;
  /** air, fire or portal */
  isEmpty(state: number): boolean;
  isPortal(state: number): boolean;
}

const MAX = 21;

export function findPortalShape(get: GetState, p: PortalPredicates, x0: number, y0: number, z0: number, axis: 0 | 1): PortalShape | null {
  const rx = axis === 0 ? -1 : 0, rz = axis === 0 ? 0 : 1;
  const frame = (x: number, y: number, z: number) => p.isFrame(get(x, y, z));
  const empty = (x: number, y: number, z: number) => p.isEmpty(get(x, y, z));
  if (!empty(x0, y0, z0)) return null;
  // calculateBottomLeft
  let y = y0;
  const minY = Math.max(0, y0 - MAX);
  while (y > minY && empty(x0, y - 1, z0)) y--;
  const edge = (sx: number, sy: number, sz: number, dx: number, dz: number): number => {
    for (let i = 0; i <= MAX; i++) {
      const x = sx + dx * i, z = sz + dz * i;
      if (!empty(x, sy, z)) return frame(x, sy, z) ? i : 0;
      if (!frame(x, sy - 1, z)) return 0;
    }
    return 0;
  };
  const back = edge(x0, y, z0, -rx, -rz) - 1;
  if (back < 0) return null;
  const bx = x0 - rx * back, bz = z0 - rz * back;
  const width = edge(bx, y, bz, rx, rz);
  if (width < 2 || width > MAX) return null;
  // getDistanceUntilTop
  let portalBlocks = 0;
  let height = MAX;
  outer: for (let i = 0; i < MAX; i++) {
    const yy = y + i;
    if (!frame(bx - rx, yy, bz - rz) || !frame(bx + rx * width, yy, bz + rz * width)) { height = i; break; }
    for (let j = 0; j < width; j++) {
      const s = get(bx + rx * j, yy, bz + rz * j);
      if (!p.isEmpty(s)) { height = i; break outer; }
      if (p.isPortal(s)) portalBlocks++;
    }
  }
  if (height < 3 || height > MAX) return null;
  for (let j = 0; j < width; j++) if (!frame(bx + rx * j, y + height, bz + rz * j)) return null;
  return { x: bx, y, z: bz, axis, width, height, portalBlocks, rx, rz };
}

/** Try both axes (X first, like vanilla). `requireEmpty`: no existing portal blocks inside. */
export function findAnyPortalShape(get: GetState, p: PortalPredicates, x: number, y: number, z: number, requireEmpty = true): PortalShape | null {
  for (const axis of [0, 1] as const) {
    const s = findPortalShape(get, p, x, y, z, axis);
    if (s && (!requireEmpty || s.portalBlocks === 0)) return s;
  }
  return null;
}

/** Every interior position of a portal shape. */
export function portalInterior(s: PortalShape): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let h = 0; h < s.height; h++) for (let j = 0; j < s.width; j++) out.push([s.x + s.rx * j, s.y + h, s.z + s.rz * j]);
  return out;
}

/**
 * End portal: find the 3x3 interior (min corner x, z) whose 12-frame ring contains (x, z) and has
 * every frame filled with an eye. `hasEye(x, z)` tests the frame at the ring's height.
 */
export function findEndPortalInterior(hasEye: (x: number, z: number) => boolean, x: number, z: number): [number, number] | null {
  const cands: [number, number][] = [];
  for (let o = -2; o <= 0; o++) {
    cands.push([x + 1, z + o]); // frame on the west side
    cands.push([x - 3, z + o]); // east side
    cands.push([x + o, z + 1]); // north side
    cands.push([x + o, z - 3]); // south side
  }
  for (const [ix, iz] of cands) {
    let ok = true;
    for (let k = 0; k < 3 && ok; k++) {
      ok = hasEye(ix - 1, iz + k) && hasEye(ix + 3, iz + k) && hasEye(ix + k, iz - 1) && hasEye(ix + k, iz + 3);
    }
    if (ok) return [ix, iz];
  }
  return null;
}

/** Nether <-> overworld horizontal coordinate mapping (8:1). */
export function netherScale(x: number, z: number, toNether: boolean): [number, number] {
  return toNether ? [Math.floor(x / 8), Math.floor(z / 8)] : [Math.floor(x * 8), Math.floor(z * 8)];
}
