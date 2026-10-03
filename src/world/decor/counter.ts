// Counter run along the back wall: mint base cabinets (drawers + doors with butter-yellow pulls),
// a recessed toe kick, butcher-block worktops left/right of the free-standing range, and a
// mint & white tile backsplash with a bullnose trim.

import * as THREE from 'three';
import { PALETTE } from '../palette';
import { COUNTER, LAYOUT, BACK_WALL_Z } from '../layout';
import { part, grp, rbox, rboxB, softExtrude, roundedRectShape, planarUV, mergeGeo, mergeStatic, lacquer, enamel, textured } from '../props/util';
import { woodTex, tileTextures } from '../props/textures';

export const BACKSPLASH_TOP = COUNTER.topY + 0.6;

export interface Counters {
  root: THREE.Group;
  /** Both worktop slabs (one merged mesh). */
  counterTop: THREE.Mesh;
}

/** Dominant-axis planar UVs (u,v in metres * scale) for boxy wooden parts. */
export function boxUV(g: THREE.BufferGeometry, scale: number, offset: [number, number, number] = [0, 0, 0]): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + offset[0], y = p.getY(i) + offset[1], z = p.getZ(i) + offset[2];
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ay >= ax && ay >= az) [u, v] = [x, -z];
    else if (az >= ax) [u, v] = [x, y];
    else [u, v] = [z, y];
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export function butcherBlock(): THREE.MeshStandardMaterial {
  return textured('butcherBlock', woodTex('butcher', { strips: 10, w: 512, h: 512, rings: 7, base: '#f1cf9f', contrast: 0.85 }), { roughness: 0.5 });
}

function pull(parent: THREE.Object3D, x: number, y: number, z: number, len: number) {
  part(parent, new THREE.CapsuleGeometry(0.0095, len - 0.019, 6, 14).rotateZ(Math.PI / 2), lacquer(PALETTE.cabinetHandle, 0.3), { pos: [x, y, z + 0.03] });
  for (const s of [-1, 1]) part(parent, new THREE.CylinderGeometry(0.0065, 0.008, 0.03, 12).rotateX(Math.PI / 2), lacquer(PALETTE.butterDark, 0.32), { pos: [x + s * (len / 2 - 0.016), y, z + 0.015] });
}

/** One front (door or drawer): rounded slab + raised inner panel, front plane at z. */
function front(parent: THREE.Object3D, x: number, y0: number, y1: number, w: number, z: number, kind: 'door' | 'drawer') {
  const h = y1 - y0;
  const body = lacquer(PALETTE.cabinet, 0.36);
  part(parent, softExtrude(roundedRectShape(w, h, 0.035), 0.022, 0.008, { curveSegs: 6, bevelSegs: 3 }), body, { pos: [x, (y0 + y1) / 2, z] });
  const inset = kind === 'door' ? 0.055 : 0.032;
  part(parent, softExtrude(roundedRectShape(w - inset * 2, h - inset * 2, 0.022), 0.008, 0.0035, { curveSegs: 6, bevelSegs: 2 }), lacquer('#a3e0cf', 0.36), { pos: [x, (y0 + y1) / 2, z + 0.02] });
  if (kind === 'drawer') pull(parent, x, (y0 + y1) / 2, z + 0.028, 0.15);
  else pull(parent, x, y1 - 0.075, z + 0.028, 0.13);
}

function section(root: THREE.Object3D, x0: number, x1: number, columns: ('dd' | 'ddd')[]) {
  const g = grp(root, [0, 0, 0], 'cabinets');
  const top = COUNTER.topY - COUNTER.thickness;
  const zB = BACK_WALL_Z, zF = COUNTER.zFront - 0.045; // carcass front plane
  const kick = 0.1;
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  // carcass + toe kick
  part(g, rboxB(w, top - kick, zF - zB, 0.012, 2), lacquer(PALETTE.cabinetDark, 0.45), { pos: [cx, kick, (zB + zF) / 2] });
  part(g, rboxB(w - 0.02, kick, zF - zB - 0.06, 0.01, 2), enamel('#6a5250', 0.6), { pos: [cx, 0, (zB + zF) / 2 - 0.03] });
  // fronts
  const cw = w / columns.length;
  columns.forEach((kind, i) => {
    const fx = x0 + cw * (i + 0.5);
    const fw = cw - 0.012;
    const yTop = top - 0.012, yBot = kick + 0.012;
    if (kind === 'dd') {
      const split = yTop - 0.17;
      front(g, fx, split + 0.006, yTop, fw, zF, 'drawer');
      front(g, fx, yBot, split - 0.006, fw, zF, 'door');
    } else {
      const hh = (yTop - yBot) / 3;
      for (let k = 0; k < 3; k++) front(g, fx, yBot + hh * k + (k ? 0.006 : 0), yBot + hh * (k + 1) - (k < 2 ? 0.006 : 0), fw, zF, 'drawer');
    }
  });
  // end panels (slightly proud, rounded)
  for (const x of [x0, x1]) part(g, rboxB(0.024, top - 0.005, zF - zB + 0.028, 0.01, 3), lacquer(PALETTE.cabinet, 0.36), { pos: [x + (x === x0 ? 0.012 : -0.012), 0.005, (zB + zF) / 2 + 0.014] });
}

export function buildCounters(): Counters {
  const root = new THREE.Group();
  root.name = 'counters';
  const sx0 = LAYOUT.stove.pos.x - LAYOUT.stove.width / 2 - 0.004;
  const sx1 = LAYOUT.stove.pos.x + LAYOUT.stove.width / 2 + 0.004;
  section(root, COUNTER.x0, sx0, ['dd', 'dd', 'dd']);
  section(root, sx1, COUNTER.x1, ['dd', 'dd', 'ddd', 'dd']);

  // worktops (one merged mesh)
  const d = COUNTER.zFront - COUNTER.zBack;
  const slabs: THREE.BufferGeometry[] = [];
  for (const [a, b] of [[COUNTER.x0 - 0.01, sx0], [sx1, COUNTER.x1 + 0.01]]) {
    const g = rbox(b - a, COUNTER.thickness, d, 0.014, 3).translate((a + b) / 2, COUNTER.topY - COUNTER.thickness / 2, (COUNTER.zBack + COUNTER.zFront) / 2);
    slabs.push(boxUV(g, 1 / 0.9));
  }
  const counterTop = part(root, mergeGeo(slabs), butcherBlock(), { cast: true });
  counterTop.name = 'counterTop';

  // backsplash tiles (0.1 m tiles: 4 per texture repeat), bump for grout lines
  const { map, bump } = tileTextures(4);
  const tileMat = textured('backsplash', map, { roughness: 0.32, bumpMap: bump, bumpScale: 1.2 });
  const bw = COUNTER.x1 - COUNTER.x0;
  const bh = BACKSPLASH_TOP - COUNTER.topY;
  const tiles = planarUV(new THREE.PlaneGeometry(bw, bh).translate(COUNTER.x0 + bw / 2, COUNTER.topY + bh / 2, 0), 'xy', 1 / 0.4, [-COUNTER.x0 / 0.4, -COUNTER.topY / 0.4]);
  part(root, tiles, tileMat, { pos: [0, 0, BACK_WALL_Z + 0.004], cast: false });
  // bullnose trims: top and the open left end
  part(root, rbox(bw + 0.03, 0.026, 0.022, 0.011, 3), lacquer('#f7fcfa', 0.3), { pos: [COUNTER.x0 + bw / 2, BACKSPLASH_TOP + 0.01, BACK_WALL_Z + 0.012] });
  part(root, rbox(0.026, bh, 0.022, 0.011, 3), lacquer('#f7fcfa', 0.3), { pos: [COUNTER.x0 - 0.002, COUNTER.topY + bh / 2, BACK_WALL_Z + 0.012] });

  mergeStatic(root, [counterTop]);
  return { root, counterTop };
}
