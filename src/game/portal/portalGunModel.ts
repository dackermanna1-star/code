/**
 * The portal device: procedural 3D model (glossy white shell with a bulbous rear, black
 * under-housing and grip, panel seams, a glass core tube on top with a glowing filament, a dark
 * emitter collar with a glowing core and three curved white prongs), registered as the item
 * model `portal_gun`, plus its 2D icon painter.
 *
 * Gun space: forward -Z, up +Y, right +X, metres (about 0.95 m long). Item space (where item
 * models live): the muzzle points along the (1, 1) diagonal like a held tool, the gun's right
 * side faces +Z. `GUN_TO_ITEM` maps gun space to item space.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ModelPart } from '../../render/items/toolModels';
import { Painter as P, rgba, lin, rad, darken, lighten, rrect, circle, poly, ellipse, METAL, GLASS, type Ctx } from '../../render/items/paint/kit';

/** Scale from gun metres to item units. */
export const GUN_ITEM_SCALE = 0.86;

/** Gun space → item space (rotation + scale). */
export const GUN_TO_ITEM = (() => {
  const f = new THREE.Vector3(1, 1, 0).normalize();
  const u = new THREE.Vector3(-1, 1, 0).normalize();
  const r = new THREE.Vector3().crossVectors(f, u);
  // columns: gun +X → r, gun +Y → u, gun +Z (backwards) → -f
  return new THREE.Matrix4().makeBasis(r, u, f.clone().negate()).multiply(new THREE.Matrix4().makeScale(GUN_ITEM_SCALE, GUN_ITEM_SCALE, GUN_ITEM_SCALE));
})();

const Z = new THREE.Vector3(0, 0, 1);

/** Geometry with its long axis (Y) laid along Z. */
const alongZ = (g: THREE.BufferGeometry) => g.rotateX(Math.PI / 2);

function prong(angle: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const at = (r: number, z: number) => new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r, z);
  pts.push(at(0.07, -0.28), at(0.104, -0.37), at(0.114, -0.46), at(0.094, -0.55), at(0.058, -0.62));
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, 18, 0.017, 8, false);
  // flatten the claw a little (wider than deep) and taper the tip
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const z = v.z;
    const t = THREE.MathUtils.clamp((-z - 0.28) / 0.34, 0, 1);
    const c = curve.getPoint(t);
    const k = 1 - t * 0.55;
    v.sub(c).multiplyScalar(k).add(c);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // a rounded cap at the tip
  const tip = new THREE.SphereGeometry(0.0085, 8, 6).translate(at(0.058, -0.62).x, at(0.058, -0.62).y, -0.62);
  return mergeGeometries([g.toNonIndexed(), tip.toNonIndexed()])!;
}

function shellRear(): THREE.BufferGeometry {
  // lathe profile (radius, z): rounded back, swelling bulb, tapering into the barrel
  const prof: [number, number][] = [
    [0.0, 0.34], [0.045, 0.336], [0.08, 0.322], [0.108, 0.296], [0.126, 0.26], [0.136, 0.215], [0.138, 0.16],
    [0.133, 0.1], [0.122, 0.04], [0.108, -0.03], [0.096, -0.1], [0.087, -0.17], [0.082, -0.23], [0.08, -0.27],
  ];
  // lathe faces point outward when the profile runs bottom → top (increasing z here)
  const pts = prof.map(([r, z]) => new THREE.Vector2(r, z)).reverse();
  const g = new THREE.LatheGeometry(pts, 40);
  // lathe spins around Y with the profile's y = our z: rotate so the axis is Z (y → z)
  g.rotateX(Math.PI / 2);
  // slightly taller than wide; flatten the underside where the housing sits
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let y = pos.getY(i);
    y *= 1.06;
    if (y < -0.07) y = -0.07 + (y + 0.07) * 0.35;
    pos.setY(i, y);
  }
  g.computeVertexNormals();
  return g;
}

/** Gun-space parts (before the item transform). */
function gunParts(): { geo: THREE.BufferGeometry; spec: ModelPart['spec'] }[] {
  const white = { color: 0xf1f2f0, roughness: 0.24, metalness: 0, key: 'pg_white' };
  const black = { color: 0x16171a, roughness: 0.6, metalness: 0, key: 'pg_black' };
  const metal = { color: 0x50555c, roughness: 0.32, metalness: 0.9, key: 'pg_metal' };
  const glass = { color: 0x3c4650, roughness: 0.04, metalness: 0.25, key: 'pg_glass' };
  const glow = { color: 0x5fc0ff, roughness: 0.3, metalness: 0, emissive: 2.4, key: 'portal_gun_glow' };
  const W: THREE.BufferGeometry[] = [], B: THREE.BufferGeometry[] = [], M: THREE.BufferGeometry[] = [], G: THREE.BufferGeometry[] = [], L: THREE.BufferGeometry[] = [];
  // white shell + prongs
  W.push(shellRear());
  for (const a of [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3]) W.push(prong(a));
  // white top fairing behind the glass tube
  W.push(new RoundedBoxGeometry(0.1, 0.05, 0.12, 3, 0.02).translate(0, 0.13, 0.17));
  // black under-housing, grip and the rear pad
  B.push(new RoundedBoxGeometry(0.17, 0.085, 0.4, 4, 0.03).translate(0, -0.085, 0.05));
  B.push(new RoundedBoxGeometry(0.062, 0.2, 0.085, 3, 0.025).rotateX(0.32).translate(0, -0.2, 0.14));
  B.push(new RoundedBoxGeometry(0.1, 0.1, 0.03, 3, 0.012).translate(0, 0.0, 0.352));
  // emitter collar + barrel throat
  M.push(new THREE.TorusGeometry(0.072, 0.024, 12, 40).translate(0, 0, -0.29));
  M.push(alongZ(new THREE.CylinderGeometry(0.06, 0.066, 0.07, 32, 1, true)).translate(0, 0, -0.31));
  B.push(new THREE.CircleGeometry(0.062, 32).translate(0, 0, -0.278).applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI)).translate(0, 0, -0.556));
  // glass core tube on top with clamps
  L.push(alongZ(new THREE.CylinderGeometry(0.03, 0.03, 0.27, 24)).translate(0, 0.142, -0.03));
  G.push(alongZ(new THREE.CylinderGeometry(0.036, 0.036, 0.05, 24, 1, true)).translate(0, 0.142, -0.03));
  M.push(new THREE.TorusGeometry(0.037, 0.009, 8, 24).translate(0, 0.142, 0.1));
  M.push(new THREE.TorusGeometry(0.037, 0.009, 8, 24).translate(0, 0.142, -0.16));
  M.push(new RoundedBoxGeometry(0.03, 0.06, 0.03, 2, 0.008).translate(0, 0.105, 0.1));
  M.push(new RoundedBoxGeometry(0.03, 0.06, 0.03, 2, 0.008).translate(0, 0.105, -0.16));
  // glowing parts: the filament in the tube, the core in the throat, a side indicator
  L.push(new THREE.SphereGeometry(0.042, 20, 14).translate(0, 0, -0.345));
  L.push(new RoundedBoxGeometry(0.008, 0.02, 0.07, 2, 0.003).translate(0.137, 0.0, 0.16));
  const merge = (list: THREE.BufferGeometry[]) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => {
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    return g;
  }))!;
  return [
    { geo: merge(W), spec: white },
    { geo: merge(B), spec: black },
    { geo: merge(M), spec: metal },
    { geo: merge(G), spec: glass },
    { geo: merge(L), spec: glow },
  ];
}

let cached: ModelPart[] | null = null;

/** Item-space model parts (registered with `registerToolModel('portal_gun', ...)`). */
export function portalGunParts(): ModelPart[] {
  if (cached) return cached;
  cached = gunParts().map(({ geo, spec }) => {
    geo.applyMatrix4(GUN_TO_ITEM);
    geo.computeBoundingSphere();
    return { geometry: geo, spec };
  });
  return cached;
}

// ------------------------------------------------------------------------------- icon
/** 16×16 icon: the device in profile, muzzle to the upper right. */
export function portalGunIcon(p: P) {
  const rot = (g: Ctx) => {
    g.translate(8, 8);
    g.rotate(-Math.PI / 4);
    g.translate(-8, -8);
  };
  const part = (path: (g: Ctx) => void, fill: number, shade?: (g: Ctx) => void, mat?: { metal?: number; rough?: number; emissive?: number }) =>
    p.part((g) => { g.save(); rot(g); path(g); g.restore(); g.fillStyle = rgba(fill); g.fill(); }, shade ? (g) => { g.save(); rot(g); shade(g); g.restore(); } : undefined, mat);
  const white = 0xeef0ee, black = 0x1a1b1e, blue = 0x58c0ff;
  // black grip + under-housing
  part((g) => { rrect(g, 5.6, 10.0, 1.3, 3.0, 0.5); }, black, undefined, { rough: 0.6 });
  part((g) => { rrect(g, 1.6, 9.2, 8.2, 1.8, 0.7); }, black, undefined, { rough: 0.6 });
  // white shell: rear bulb tapering to the collar
  part((g) => { ellipse(g, 4.2, 8.0, 3.2, 2.5); g.moveTo(5.0, 5.7); g.lineTo(11.2, 6.9); g.lineTo(11.2, 9.4); g.lineTo(5.0, 10.3); g.closePath(); }, white, (g) => {
    g.fillStyle = lin(g, 0, 5.4, 0, 10.6, [[0, lighten(white, 0.4)], [0.45, white], [1, darken(white, 0.35)]]);
    g.fillRect(0, 0, 16, 16);
    g.strokeStyle = rgba(darken(white, 0.45), 0.8);
    g.lineWidth = 0.18;
    g.beginPath(); g.moveTo(3.4, 5.7); g.lineTo(3.4, 10.4); g.moveTo(7.6, 6.2); g.lineTo(7.6, 10.0); g.stroke();
  }, { rough: 0.25 });
  // glass core tube on top
  part((g) => { rrect(g, 4.6, 4.7, 5.0, 1.3, 0.6); }, 0x3c4650, (g) => {
    g.fillStyle = lin(g, 0, 4.7, 0, 6.0, [[0, 0x8fa4b4], [1, 0x2a3036]]);
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = rgba(blue);
    g.fillRect(4.9, 5.2, 4.4, 0.35);
  }, GLASS);
  part((g) => { rrect(g, 4.5, 4.5, 0.6, 1.7, 0.2); rrect(g, 8.9, 4.5, 0.6, 1.7, 0.2, false); }, 0x4a4f56, undefined, METAL);
  // emitter collar
  part((g) => { rrect(g, 10.9, 6.4, 1.2, 3.4, 0.5); }, 0x40444a, (g) => {
    g.fillStyle = lin(g, 10.9, 0, 12.1, 0, [[0, 0x6a7078], [1, 0x202226]]);
    g.fillRect(0, 0, 16, 16);
  }, METAL);
  // prongs
  part((g) => { poly(g, [11.8, 6.5, 14.4, 5.6, 15.4, 6.4, 15.0, 6.9, 12.2, 7.4]); }, white, undefined, { rough: 0.25 });
  part((g) => { poly(g, [11.8, 9.7, 14.4, 10.6, 15.4, 9.8, 15.0, 9.3, 12.2, 8.8]); }, white, undefined, { rough: 0.25 });
  part((g) => { poly(g, [12.0, 7.7, 14.6, 7.8, 15.2, 8.1, 14.6, 8.4, 12.0, 8.5]); }, darken(white, 0.12), undefined, { rough: 0.25 });
  // glowing core
  part((g) => { circle(g, 12.6, 8.1, 0.95); }, blue, (g) => {
    g.fillStyle = rad(g, 12.6, 8.1, 0, 12.6, 8.1, 0.95, [[0, 0xffffff], [0.4, lighten(blue, 0.4)], [1, blue]]);
    g.fillRect(0, 0, 16, 16);
  }, { emissive: 1, rough: 0.3 });
}
