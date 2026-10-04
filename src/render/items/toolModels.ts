/**
 * Modelled tools & weapons (bevelled extrusions, lathed grips, metallic PBR per tier).
 * Item space matches sprites: the model lies in the x/y plane within [-0.5, 0.5], handle at
 * the bottom-left, head at the top-right (Minecraft's diagonal), thickness along z.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ItemMatSpec } from './itemMaterials';
import { makeCanvas, ctx2d, seeded } from './paint/kit';

export interface ModelPart {
  geometry: THREE.BufferGeometry;
  spec: ItemMatSpec;
}

// ------------------------------------------------------------------------------ textures
let woodTex: THREE.Texture | null = null;
let stoneTex: THREE.Texture | null = null;
function canvasTex(draw: (g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, s: number) => void, size = 128): THREE.Texture {
  const c = makeCanvas(size);
  draw(ctx2d(c), size);
  const d = ctx2d(c).getImageData(0, 0, size, size).data;
  const t = new THREE.DataTexture(new Uint8Array(d), size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
/** Oak-stick wood: grain runs along v. */
export function woodTexture(): THREE.Texture {
  return (woodTex ??= canvasTex((g, s) => {
    const r = seeded('wood');
    g.fillStyle = '#8a6234';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      const x = r() * s, w = 0.6 + r() * 2.2;
      g.fillStyle = `rgba(${r() < 0.5 ? '60,38,16' : '170,128,74'},${0.15 + r() * 0.3})`;
      g.fillRect(x, 0, w, s);
    }
    for (let i = 0; i < 12; i++) {
      g.fillStyle = 'rgba(50,30,12,0.35)';
      g.beginPath();
      g.ellipse(r() * s, r() * s, 1.2, 4 + r() * 6, 0, 0, Math.PI * 2);
      g.fill();
    }
  }));
}
/** Cobblestone-ish grey. */
export function stoneTexture(): THREE.Texture {
  return (stoneTex ??= canvasTex((g, s) => {
    const r = seeded('stone');
    g.fillStyle = '#8c8c8c';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const v = 70 + Math.floor(r() * 110);
      g.fillStyle = `rgba(${v},${v},${v},0.5)`;
      g.fillRect(r() * s, r() * s, 1 + r() * 4, 1 + r() * 4);
    }
    g.strokeStyle = 'rgba(40,40,40,0.5)';
    for (let i = 0; i < 18; i++) {
      g.beginPath();
      g.arc(r() * s, r() * s, 6 + r() * 14, 0, Math.PI * 2);
      g.stroke();
    }
  }));
}

// ------------------------------------------------------------------------------ tiers
export function tierSpec(tier: string, part: 'head' | 'guard' = 'head'): ItemMatSpec {
  const dark = part === 'guard';
  switch (tier) {
    case 'wooden': return { map: woodTexture(), color: dark ? 0x9a8060 : 0xd8c0a0, roughness: 0.7, key: `wood${part}` };
    case 'stone': return { map: stoneTexture(), color: dark ? 0x8a8a8a : 0xd8d8d8, roughness: 0.82, key: `stone${part}` };
    case 'iron': return { color: dark ? 0x8a8a90 : 0xd6d6da, metalness: 1, roughness: dark ? 0.4 : 0.24, key: `iron${part}` };
    case 'golden': return { color: dark ? 0xc89a28 : 0xffd65a, metalness: 1, roughness: dark ? 0.3 : 0.18, key: `gold${part}` };
    case 'diamond': return { color: dark ? 0x1a8a80 : 0x5cf0de, metalness: dark ? 0.6 : 0.05, roughness: dark ? 0.3 : 0.08, sss: dark ? 0 : 0.25, key: `diamond${part}` };
    case 'netherite': return { color: dark ? 0x2a2428 : 0x4e464c, metalness: 1, roughness: dark ? 0.45 : 0.32, key: `netherite${part}` };
    default: return { color: 0xcccccc, metalness: 1, roughness: 0.3 };
  }
}
const handleSpec = (): ItemMatSpec => ({ map: woodTexture(), color: 0xffffff, roughness: 0.68, key: 'handle' });
const GRIP: ItemMatSpec = { color: 0x3a2618, roughness: 0.85, key: 'grip' };

// ------------------------------------------------------------------------------ helpers
function extrude(points: [number, number][], depth: number, bevel: number, bevelSize = bevel): THREE.BufferGeometry {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.002, depth - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize, bevelOffset: -bevelSize, bevelSegments: 3, curveSegments: 8, steps: 1 });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  g.computeVertexNormals();
  return g;
}
function extrudeShape(shape: THREE.Shape, depth: number, bevel: number, segs = 3): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.002, depth - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: segs, curveSegments: 16, steps: 1 });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  g.computeVertexNormals();
  return g;
}
function handle(y0: number, y1: number, r = 0.032): THREE.BufferGeometry {
  // slightly tapered wooden stick with rounded ends
  const pts: THREE.Vector2[] = [];
  const L = y1 - y0;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const end = Math.min(t, 1 - t) * L;
    const rr = r * (1 - 0.12 * t) * Math.min(1, 0.55 + end / (r * 1.6));
    pts.push(new THREE.Vector2(Math.max(0.004, rr), y0 + t * L));
  }
  const g = new THREE.LatheGeometry(pts, 14);
  return g;
}
function wrap(y0: number, y1: number, r: number, turns: number): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < turns; i++) {
    const t = new THREE.TorusGeometry(r, r * 0.22, 6, 16);
    t.rotateX(Math.PI / 2);
    t.translate(0, y0 + ((i + 0.5) / turns) * (y1 - y0), 0);
    geos.push(t);
  }
  return merge(geos);
}
function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of parts) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of parts) {
    const c = g.getAttribute('position').count;
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nrm.set(g.getAttribute('normal').array as Float32Array, o * 3);
    const u = g.getAttribute('uv');
    if (u) uv.set(u.array as Float32Array, o * 2);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
/** Rotate a part from the "along +Y" build frame onto the sprite diagonal. */
function diag(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.rotateZ(-Math.PI / 4);
  return g;
}

// ------------------------------------------------------------------------------ models
export function swordModel(tier: string): ModelPart[] {
  const blade = diag(extrude([[-0.1, -0.2], [0.1, -0.2], [0.088, 0.42], [0.0, 0.57], [-0.088, 0.42]], 0.05, 0.022, 0.05));
  const fuller = diag(extrude([[-0.018, -0.17], [0.018, -0.17], [0.012, 0.36], [-0.012, 0.36]], 0.054, 0.004));
  const guard = diag(new RoundedBoxGeometry(0.4, 0.06, 0.08, 2, 0.02).translate(0, -0.235, 0));
  const grip = diag(handle(-0.5, -0.25, 0.03));
  const gripWrap = diag(wrap(-0.48, -0.27, 0.031, 5));
  const pommel = diag(new THREE.SphereGeometry(0.048, 16, 10).scale(1, 0.8, 1).translate(0, -0.525, 0));
  const head = tierSpec(tier);
  return [
    { geometry: blade, spec: head },
    { geometry: fuller, spec: { ...tierSpec(tier, 'guard'), key: `fuller${tier}` } },
    { geometry: guard, spec: tierSpec(tier, 'guard') },
    { geometry: grip, spec: tier === 'wooden' ? handleSpec() : GRIP },
    { geometry: gripWrap, spec: tier === 'wooden' ? handleSpec() : { color: 0x5a3a22, roughness: 0.8, key: 'gripwrap' } },
    { geometry: pommel, spec: tierSpec(tier, 'guard') },
  ];
}

function crescent(cx: number, cy: number, R: number, r: number, a0: number, a1: number): THREE.Shape {
  const s = new THREE.Shape();
  const mid = (R + r) / 2;
  s.moveTo(cx + Math.cos(a0 - 0.06) * mid, cy + Math.sin(a0 - 0.06) * mid);
  s.absarc(cx, cy, R, a0, a1, false);
  s.lineTo(cx + Math.cos(a1 + 0.06) * mid, cy + Math.sin(a1 + 0.06) * mid);
  s.absarc(cx, cy, r, a1, a0, true);
  s.closePath();
  return s;
}

export function pickaxeModel(tier: string): ModelPart[] {
  const head = diag(extrudeShape(crescent(0, -0.36, 0.86, 0.72, THREE.MathUtils.degToRad(55), THREE.MathUtils.degToRad(125)), 0.075, 0.02));
  const collar = diag(new RoundedBoxGeometry(0.1, 0.1, 0.09, 2, 0.02).translate(0, 0.42, 0));
  return [
    { geometry: diag(handle(-0.56, 0.44)), spec: handleSpec() },
    { geometry: head, spec: tierSpec(tier) },
    { geometry: collar, spec: tierSpec(tier, 'guard') },
  ];
}

export function axeModel(tier: string): ModelPart[] {
  const blade = new THREE.Shape();
  blade.moveTo(0.04, 0.5);
  blade.lineTo(-0.1, 0.5);
  blade.quadraticCurveTo(-0.2, 0.48, -0.3, 0.56);
  blade.quadraticCurveTo(-0.36, 0.38, -0.3, 0.16);
  blade.quadraticCurveTo(-0.2, 0.22, -0.1, 0.24);
  blade.lineTo(0.04, 0.26);
  blade.lineTo(0.1, 0.3);
  blade.lineTo(0.1, 0.46);
  blade.closePath();
  return [
    { geometry: diag(handle(-0.56, 0.52)), spec: handleSpec() },
    { geometry: diag(extrudeShape(blade, 0.08, 0.026)), spec: tierSpec(tier) },
  ];
}

export function shovelModel(tier: string): ModelPart[] {
  const spade = new THREE.Shape();
  spade.moveTo(-0.13, 0.24);
  spade.lineTo(-0.13, 0.46);
  spade.quadraticCurveTo(-0.12, 0.62, 0, 0.66);
  spade.quadraticCurveTo(0.12, 0.62, 0.13, 0.46);
  spade.lineTo(0.13, 0.24);
  spade.quadraticCurveTo(0, 0.2, -0.13, 0.24);
  const g = extrudeShape(spade, 0.045, 0.016);
  // dish the blade slightly
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - p.getX(i) * p.getX(i) * 0.9);
  g.computeVertexNormals();
  return [
    { geometry: diag(handle(-0.56, 0.3)), spec: handleSpec() },
    { geometry: diag(g), spec: tierSpec(tier) },
    { geometry: diag(new THREE.CylinderGeometry(0.042, 0.05, 0.08, 12).translate(0, 0.24, 0)), spec: tierSpec(tier, 'guard') },
  ];
}

export function hoeModel(tier: string): ModelPart[] {
  const blade = new THREE.Shape();
  blade.moveTo(0.06, 0.53);
  blade.lineTo(-0.3, 0.55);
  blade.quadraticCurveTo(-0.36, 0.52, -0.34, 0.44);
  blade.lineTo(-0.3, 0.42);
  blade.lineTo(-0.02, 0.43);
  blade.lineTo(0.06, 0.4);
  blade.closePath();
  return [
    { geometry: diag(handle(-0.56, 0.52)), spec: handleSpec() },
    { geometry: diag(extrudeShape(blade, 0.06, 0.018)), spec: tierSpec(tier) },
  ];
}

export function tridentModel(): ModelPart[] {
  const metal: ItemMatSpec = { color: 0x6cc8b4, metalness: 0.85, roughness: 0.3, key: 'trident' };
  const dark: ItemMatSpec = { color: 0x2f7a6c, metalness: 0.8, roughness: 0.35, key: 'tridentdark' };
  const prong = (x: number, len: number) => {
    const s = new THREE.Shape();
    s.moveTo(x - 0.022, 0.3);
    s.lineTo(x + 0.022, 0.3);
    s.lineTo(x + 0.02, 0.3 + len - 0.06);
    s.lineTo(x, 0.3 + len);
    s.lineTo(x - 0.02, 0.3 + len - 0.06);
    s.closePath();
    return diag(extrudeShape(s, 0.04, 0.012, 2));
  };
  return [
    { geometry: diag(new THREE.CylinderGeometry(0.024, 0.024, 0.95, 10).translate(0, -0.15, 0)), spec: metal },
    { geometry: diag(new RoundedBoxGeometry(0.2, 0.05, 0.05, 2, 0.015).translate(0, 0.3, 0)), spec: dark },
    { geometry: prong(0, 0.3), spec: metal },
    { geometry: prong(-0.085, 0.22), spec: metal },
    { geometry: prong(0.085, 0.22), spec: metal },
  ];
}

/** Bow: curved limbs (tube), grip, string drawn back by `pull` (0..1) with a nocked arrow. */
export function bowModel(pull = 0): ModelPart[] {
  // icon-space coordinates (y up), limb bulging toward the top-right
  const P = (x: number, y: number) => new THREE.Vector3(x / 16 - 0.5, 0.5 - y / 16, 0);
  const t0 = P(2.6, 2.2), t1 = P(13.8, 13.4);
  const limb = new THREE.QuadraticBezierCurve3(t0, P(16.0 - pull * 1.5, 0.0 + pull * 1.5), t1);
  const limbGeo = new THREE.TubeGeometry(limb, 24, 0.028, 8, false);
  // taper the limb ends
  const p = limbGeo.getAttribute('position') as THREE.BufferAttribute;
  const n = limbGeo.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const seg = Math.floor(i / 9) / 24;
    const k = 0.55 + 0.45 * Math.sin(seg * Math.PI);
    const c = limb.getPoint(seg);
    p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k);
  }
  void n;
  limbGeo.computeVertexNormals();
  const mid = t0.clone().add(t1).multiplyScalar(0.5).add(new THREE.Vector3(-1, -1, 0).normalize().multiplyScalar(pull * 0.2));
  const str = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([t0, mid, t1], false, 'catmullrom', 0), 8, 0.005, 4, false);
  const gripC = limb.getPoint(0.5);
  const parts: ModelPart[] = [
    { geometry: limbGeo, spec: { map: woodTexture(), color: 0xb08860, roughness: 0.55, key: 'bow' } },
    { geometry: new THREE.CylinderGeometry(0.036, 0.036, 0.16, 10).rotateZ(Math.PI / 4).translate(gripC.x, gripC.y, 0), spec: { color: 0x4a3020, roughness: 0.85, key: 'bowgrip' } },
    { geometry: str, spec: { color: 0xeeeeee, roughness: 0.8, key: 'string' } },
  ];
  if (pull > 0.02) {
    const dir = new THREE.Vector3(1, 1, 0).normalize();
    const a0 = mid.clone(), a1 = mid.clone().addScaledVector(dir, 0.82);
    const shaft = new THREE.CylinderGeometry(0.012, 0.012, 0.8, 6);
    shaft.rotateZ(-Math.PI / 4).translate((a0.x + a1.x) / 2, (a0.y + a1.y) / 2, 0.01);
    const head = new THREE.ConeGeometry(0.03, 0.09, 4).rotateZ(-Math.PI / 4).translate(a1.x, a1.y, 0.01);
    parts.push({ geometry: shaft, spec: { color: 0x9a7444, roughness: 0.6, key: 'arrowshaft' } }, { geometry: head, spec: { color: 0x8a8a90, metalness: 0.7, roughness: 0.4, key: 'arrowhead' } });
  }
  return parts;
}

/** Shield (front faces +z): planked board, iron rim, boss. ~MC 12×22 px board. */
export function shieldModel(): ModelPart[] {
  const W = 0.75, H = 1.1, T = 0.07;
  const board = new RoundedBoxGeometry(W, H, T, 3, 0.03);
  // planks texture via uv (front face uses full uv)
  const rim: THREE.BufferGeometry[] = [];
  const rw = 0.045;
  rim.push(new RoundedBoxGeometry(W + 0.02, rw, T + 0.03, 2, 0.015).translate(0, H / 2 - rw / 2 + 0.005, 0));
  rim.push(new RoundedBoxGeometry(W + 0.02, rw, T + 0.03, 2, 0.015).translate(0, -H / 2 + rw / 2 - 0.005, 0));
  rim.push(new RoundedBoxGeometry(rw, H, T + 0.03, 2, 0.015).translate(W / 2 - rw / 2 + 0.005, 0, 0));
  rim.push(new RoundedBoxGeometry(rw, H, T + 0.03, 2, 0.015).translate(-W / 2 + rw / 2 - 0.005, 0, 0));
  const boss = new THREE.SphereGeometry(0.09, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.5).translate(0, 0, T / 2);
  const handleBar = new RoundedBoxGeometry(0.08, 0.32, 0.06, 2, 0.02).translate(0, 0, -T / 2 - 0.04);
  return [
    { geometry: board, spec: { map: plankTexture(), color: 0xffffff, roughness: 0.66, key: 'shieldboard' } },
    { geometry: merge(rim), spec: { color: 0x7a7a82, metalness: 1, roughness: 0.4, key: 'shieldrim' } },
    { geometry: boss, spec: { color: 0x8a8a92, metalness: 1, roughness: 0.3, key: 'shieldboss' } },
    { geometry: handleBar, spec: { color: 0x4a3020, roughness: 0.8, key: 'shieldhandle' } },
  ];
}
let plankTex: THREE.Texture | null = null;
function plankTexture(): THREE.Texture {
  return (plankTex ??= canvasTex((g, s) => {
    const r = seeded('planks');
    g.fillStyle = '#9a7040';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 80; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '70,46,20' : '180,140,90'},${0.1 + r() * 0.25})`;
      g.fillRect(r() * s, 0, 0.5 + r() * 2, s);
    }
    g.fillStyle = 'rgba(40,24,10,0.85)';
    for (const x of [0.25, 0.5, 0.75]) g.fillRect(x * s - 1, 0, 2, s);
  }));
}

/** Model parts for a `visual.kind === 'model'` id (null = not modelled, use the sprite). */
const CUSTOM_MODELS = new Map<string, (data?: Record<string, any>) => ModelPart[]>();
/** Register a modelled item (visual `{ kind: 'model', id }`) built outside this file. */
export function registerToolModel(id: string, build: (data?: Record<string, any>) => ModelPart[]) {
  CUSTOM_MODELS.set(id, build);
}

export function toolModel(id: string, itemName: string, data?: Record<string, any>): ModelPart[] | null {
  const tier = itemName.split('_')[0];
  const custom = CUSTOM_MODELS.get(id);
  if (custom) return custom(data);
  switch (id) {
    case 'sword': return swordModel(tier);
    case 'pickaxe': return pickaxeModel(tier);
    case 'axe': return axeModel(tier);
    case 'shovel': return shovelModel(tier);
    case 'hoe': return hoeModel(tier);
    case 'trident': return tridentModel();
    case 'bow': return bowModel(data?.pull ?? 0);
    case 'shield': return shieldModel();
    default: return null;
  }
}
