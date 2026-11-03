import * as THREE from 'three';
import type { LevelKit } from './kit';
import { boxGeo } from './kit';
import type { Materials } from './materials';
import { canvas, tex } from '../mapKit';
import { neonTexture } from '../city';

/**
 * The levels' set pieces, built from the kit: street lamps, wall lamps and neon, shipping
 * containers, chain-link, crates, pallets, barriers, dumpsters, parked cars, AC units, pipes,
 * fire escapes - each drawn into the level's merged statics and stood in the world as what it is
 * (something to stop at, vault, climb, stand on).
 */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const Y = new THREE.Vector3(0, 1, 0);

/** Place a geometry at (x, y, z) turned by ry. */
export function put(k: LevelKit, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, cast = true) {
  _m.compose(new THREE.Vector3(x, y, z), _q.setFromAxisAngle(Y, ry), _s);
  k.mesh(geo, mat, _m, cast);
}

// ------------------------------------------------------------------ lights
/** A sodium street lamp on a pole, bent over the road (its glow, its light). */
export function lampPost(k: LevelKit, M: Materials, x: number, z: number, o: { ry?: number; h?: number; color?: number; intensity?: number; flicker?: number; reach?: number } = {}) {
  const h = o.h ?? 6.2, ry = o.ry ?? 0;
  const color = o.color ?? 0xffb060;
  const arm = 1.4;
  const dx = Math.sin(ry) * arm, dz = Math.cos(ry) * arm;
  put(k, new THREE.CylinderGeometry(0.07, 0.11, h, 8), M.iron(), x, h / 2, z);
  const armG = new THREE.BoxGeometry(0.08, 0.08, arm + 0.1);
  armG.translate(0, 0, (arm + 0.1) / 2);
  put(k, armG, M.iron(), x, h - 0.05, z, ry);
  const head = new THREE.BoxGeometry(0.34, 0.12, 0.62);
  put(k, head, M.iron(), x + dx, h - 0.12, z + dz, ry);
  const lens = new THREE.BoxGeometry(0.26, 0.03, 0.5);
  put(k, lens, M.glow(color, 1.6), x + dx, h - 0.19, z + dz, ry, false);
  k.block([x - 0.14, x + 0.14, 0, h, z - 0.14, z + 0.14], 'pillar', 'lamp post');
  return k.spot([x + dx, h - 0.45, z + dz], color, o.intensity ?? 65, o.reach ?? 21, { flicker: o.flicker ?? 0, decay: 1.6 });
}
/** A caged bulb over a door. */
export function wallLamp(k: LevelKit, M: Materials, x: number, y: number, z: number, ry: number, o: { color?: number; intensity?: number; flicker?: number; reach?: number } = {}) {
  const color = o.color ?? 0xffd090;
  const f = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
  put(k, new THREE.BoxGeometry(0.22, 0.12, 0.3), M.iron(), x + f.x * 0.15, y + 0.08, z + f.z * 0.15, ry);
  put(k, new THREE.SphereGeometry(0.07, 8, 6), M.glow(color, 1.8), x + f.x * 0.2, y - 0.04, z + f.z * 0.2, 0, false);
  return k.spot([x + f.x * 0.45, y - 0.1, z + f.z * 0.45], color, o.intensity ?? 22, o.reach ?? 9, { flicker: o.flicker ?? 0 });
}
/**
 * A neon sign on a wall (its box, its glow) facing `ry`: the light it throws the colour of the
 * tubes. Returns the spot (switch it off, flicker it).
 */
export function neonSign(k: LevelKit, lines: string[], color: string, x: number, y: number, z: number, ry: number, w = 3.2, h = 1.0, o: { intensity?: number; flicker?: number } = {}) {
  const t = neonTexture(lines, color, 1024, Math.round((1024 * h) / w));
  const mat = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  plane.position.set(x, y, z);
  plane.rotation.y = ry;
  k.g.add(plane);
  const f = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
  return k.spot([x + f.x * 1.2, y - 0.3, z + f.z * 1.2], new THREE.Color(color).getHex(), o.intensity ?? 34, 12, { flicker: o.flicker ?? 0 });
}

// ------------------------------------------------------------------ the docks
const CONT_L = 6.06, CONT_W = 2.44, CONT_H = 2.59;
/**
 * A 20-foot shipping container at (x, z) turned by ry (0: long along x), standing on the floor
 * (or on another, at `y`): its top is a floor; its doors at the +x end.
 */
export function container(k: LevelKit, M: Materials, x: number, z: number, ry: number, color: Parameters<Materials['container']>[0], y = 0) {
  const along = Math.abs(Math.sin(ry)) < 0.5;
  const hx = (along ? CONT_L : CONT_W) / 2, hz = (along ? CONT_W : CONT_L) / 2;
  const mat = M.container(color);
  k.solid([x - hx, x + hx, y, y + CONT_H, z - hz, z + hz], mat, { kind: 'crate', name: 'container', walk: true, tile: 2.4, material: 'metal' });
  // the corner posts and rails (darker), the door bars
  const post = M.iron();
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) k.geo(boxGeo([x + sx * hx - (sx > 0 ? 0.12 : -0.0), x + sx * hx + (sx > 0 ? 0 : 0.12), y, y + CONT_H, z + sz * hz - (sz > 0 ? 0.12 : 0), z + sz * hz + (sz > 0 ? 0 : 0.12)]), post, false);
  const endX = along ? x + hx + 0.005 : x;
  const endZ = along ? z : z + hz + 0.005;
  for (let i = -1; i <= 1; i += 2)
    for (const off of [0.35, 0.8]) {
      const bar = new THREE.CylinderGeometry(0.025, 0.025, CONT_H - 0.25, 6);
      const px = along ? endX + 0.03 : x + i * off;
      const pz = along ? z + i * off : endZ + 0.03;
      put(k, bar, post, px, y + CONT_H / 2, pz, 0, false);
    }
}
/** A stack of crates by something to climb: `n` high (0.9 m each), a step up. */
export function crateStack(k: LevelKit, M: Materials, x: number, z: number, n = 1, size = 1.2) {
  const h = 0.9;
  for (let i = 0; i < n; i++) {
    const s = size * (1 - i * 0.08);
    k.solid([x - s / 2, x + s / 2, i * h, (i + 1) * h, z - s / 2, z + s / 2], M.crate(), { kind: 'crate', name: 'crates', walk: true, tile: 0.9, material: 'wood' });
  }
}
/** A wooden pallet on the floor (scenery: a step's height). */
export function pallet(k: LevelKit, M: Materials, x: number, z: number, ry = 0, y = 0) {
  const g = new THREE.BoxGeometry(1.2, 0.14, 1.0);
  put(k, g, M.wood(), x, y + 0.07, z, ry, true);
}
/**
 * Chain-link on posts from (x0, z0) to (x1, z1), `h` high (vaulted under 1.3 m, climbed under
 * 2.6), with a top rail.
 */
export function chainFence(k: LevelKit, M: Materials, x0: number, z0: number, x1: number, z1: number, h = 2.2, o: { gaps?: [number, number][] } = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
  const ry = Math.atan2(ux, uz) - Math.PI / 2;
  const spans: [number, number][] = [];
  let cur = 0;
  for (const [a, b] of (o.gaps ?? []).slice().sort((p, q) => p[0] - q[0])) {
    if (a > cur) spans.push([cur, a]);
    cur = b;
  }
  if (cur < len) spans.push([cur, len]);
  for (const [a, b] of spans) {
    const l = b - a;
    const cx = x0 + ux * (a + l / 2), cz = z0 + uz * (a + l / 2);
    const mesh = new THREE.PlaneGeometry(l, h);
    // (uv in metres: the links stay link-sized)
    const uv = mesh.attributes.uv.array as Float32Array;
    for (let i = 0; i < uv.length; i += 2) {
      uv[i] *= l / 0.5;
      uv[i + 1] *= h / 0.5;
    }
    put(k, mesh, M.chainLink(), cx, h / 2, cz, ry, false);
    const rail = new THREE.CylinderGeometry(0.03, 0.03, l, 6);
    rail.rotateZ(Math.PI / 2);
    put(k, rail, M.steel(), cx, h, cz, ry, false);
    for (let t = a; t <= b + 0.01; t += Math.max(0.5, l / Math.max(1, Math.round(l / 2.5)))) {
      put(k, new THREE.CylinderGeometry(0.035, 0.035, h + 0.05, 6), M.steel(), x0 + ux * t, (h + 0.05) / 2, z0 + uz * t, 0, true);
    }
    // the stop: thin, the fence's height
    const px0 = x0 + ux * a, pz0 = z0 + uz * a, px1 = x0 + ux * b, pz1 = z0 + uz * b;
    const ob = k.block([Math.min(px0, px1) - (Math.abs(uz) > 0.5 ? 0.06 : 0), Math.max(px0, px1) + (Math.abs(uz) > 0.5 ? 0.06 : 0), 0, h, Math.min(pz0, pz1) - (Math.abs(ux) > 0.5 ? 0.06 : 0), Math.max(pz0, pz1) + (Math.abs(ux) > 0.5 ? 0.06 : 0)], 'wall', 'fence');
    if (ob) ob.seeThrough = true;
  }
}
/** A concrete jersey barrier (vaulted). */
export function barrier(k: LevelKit, M: Materials, x: number, z: number, ry = 0, len = 3) {
  const along = Math.abs(Math.sin(ry)) < 0.5;
  const sh = new THREE.Shape();
  sh.moveTo(-0.3, 0);
  sh.lineTo(0.3, 0);
  sh.lineTo(0.12, 0.3);
  sh.lineTo(0.09, 0.82);
  sh.lineTo(-0.09, 0.82);
  sh.lineTo(-0.12, 0.3);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  // (extruded along z: turn so it runs along x when ry = 0)
  g.rotateY(Math.PI / 2);
  put(k, g, M.concrete(0xb0aca4), x, 0, z, ry, true);
  const hx = along ? len / 2 : 0.3, hz = along ? 0.3 : len / 2;
  k.block([x - hx, x + hx, 0, 0.82, z - hz, z + hz], 'crate', 'barrier');
}
/** A stack of tyres, a drum, a cone: small scenery (no stop under 0.4 m). */
export function cone(k: LevelKit, M: Materials, x: number, z: number) {
  put(k, new THREE.ConeGeometry(0.16, 0.6, 10), M.paint(0xd85a10, 0.5), x, 0.3, z, 0, true);
  put(k, new THREE.BoxGeometry(0.4, 0.04, 0.4), M.paint(0xd85a10, 0.5), x, 0.02, z, 0, false);
}

// ------------------------------------------------------------------ the city
/** A wall-mounted AC unit (grille, fan box) at height y facing ry. */
export function acUnit(k: LevelKit, M: Materials, x: number, y: number, z: number, ry: number) {
  put(k, new THREE.BoxGeometry(0.8, 0.55, 0.5), M.paint(0x9a9c98, 0.6, 0.3), x, y, z, ry, true);
  const f = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
  put(k, new THREE.CylinderGeometry(0.2, 0.2, 0.02, 14).rotateX(Math.PI / 2), M.iron(), x + f.x * 0.26, y, z + f.z * 0.26, ry, false);
}
/** A pipe run between two points (a gutter, a gas line). */
export function pipe(k: LevelKit, M: Materials, a: THREE.Vector3, b: THREE.Vector3, r = 0.05, mat?: THREE.Material) {
  const d = b.clone().sub(a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, 8);
  const q = new THREE.Quaternion().setFromUnitVectors(Y, d.normalize());
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, _s);
  k.mesh(g, mat ?? M.iron(), m, true);
}
/** A sagging power line between two points (scenery). */
export function wire(k: LevelKit, M: Materials, a: THREE.Vector3, b: THREE.Vector3, sag = 0.8) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    pts.push(a.clone().lerp(b, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * sag, 0)));
  }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.012, 4);
  k.geo(g, M.dark(), false);
}
/** A painted sign on a canvas (a shop's name, a warning) as a plane facing ry. */
export function signBoard(k: LevelKit, text: string, x: number, y: number, z: number, ry: number, w: number, h: number, o: { bg?: string; fg?: string; font?: string; lit?: boolean } = {}) {
  const [c, cx] = canvas(Math.round(256 * (w / h)), 256);
  cx.fillStyle = o.bg ?? '#1a1a1a';
  cx.fillRect(0, 0, c.width, c.height);
  cx.fillStyle = o.fg ?? '#e8e0d0';
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  let fs = 150;
  cx.font = `700 ${fs}px ${o.font ?? '"Oswald", "Arial Narrow", sans-serif'}`;
  const tw = cx.measureText(text).width;
  if (tw > c.width * 0.9) fs *= (c.width * 0.9) / tw;
  cx.font = `700 ${fs}px ${o.font ?? '"Oswald", "Arial Narrow", sans-serif'}`;
  cx.fillText(text, c.width / 2, c.height / 2 + 6);
  const mat = o.lit ? new THREE.MeshBasicMaterial({ map: tex(c, true, false) }) : new THREE.MeshStandardMaterial({ map: tex(c, true, false), roughness: 0.6 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  k.g.add(m);
  return m;
}
