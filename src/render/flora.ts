/**
 * Procedural flora and rock geometry. Each living world gets its own small
 * set of plant species built from its seed: body plans depend on the
 * biosphere's complexity, sizes scale with gravity (taller in weak gravity),
 * colours come from the world's pigment palette. Geometry carries an `aPart`
 * attribute (0 = stem/trunk/rock, 1 = foliage) used for colouring and wind.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../core/rng';
import { noise3 } from '../core/noise';

export type PlantForm = 'conifer' | 'broadleaf' | 'frond' | 'fungal' | 'spire' | 'coral' | 'shrub' | 'tuft' | 'mound' | 'tubes' | 'bulb' | 'crystal';

export interface Species {
  form: PlantForm;
  geometry: THREE.BufferGeometry;
  /** typical height (m) */
  height: number;
  /** foliage colour (linear RGB) and stem colour */
  color: [number, number, number];
  stem: [number, number, number];
  /** relative abundance */
  weight: number;
  /** placed in the far (large) layer */
  large: boolean;
}

function part(g: THREE.BufferGeometry, p: number): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(p), 1));
  if (g.index === null) {
    const idx = Array.from({ length: n }, (_, i) => i);
    g.setIndex(idx);
  }
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'aPart') g.deleteAttribute(k);
  return g;
}

function lumpy(g: THREE.BufferGeometry, seed: number, amt: number, freq = 1.6) {
  // weld seams so displacement keeps the surface closed and normals smooth
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const f = 1 + amt * noise3(x * freq + seed, y * freq, z * freq, seed | 0);
    p.setXYZ(i, x * f, y * f, z * f);
  }
  g.computeVertexNormals();
  return g;
}

/** Three rock variants (unit size, base slightly below y = 0). */
export function rockGeometries(seed: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 3);
    g = lumpy(g, seed + k * 17.3, 0.38, 1.1);
    const p = g.attributes.position as THREE.BufferAttribute;
    const flat = [0.55, 0.75, 0.4][k];
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * flat + flat * 0.45);
    // a sharper secondary octave
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const f = 1 + 0.12 * noise3(x * 4.3, y * 4.3, z * 4.3, seed + k);
      p.setXYZ(i, x * f, y * f, z * f);
    }
    g.computeVertexNormals();
    out.push(part(g, 0));
  }
  return out;
}

function cyl(r0: number, r1: number, h: number, y0: number, seg = 7) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, true);
  g.translate(0, y0 + h / 2, 0);
  return g;
}

function blob(r: number, x: number, y: number, z: number, sy = 1, seed = 0, detail = 1) {
  const g = lumpy(new THREE.IcosahedronGeometry(r, detail), seed, 0.18, 1.4 / r);
  g.scale(1, sy, 1);
  g.translate(x, y, z);
  return g;
}

/** Build one plant geometry of unit height (scaled per instance). */
function plantGeometry(form: PlantForm, rng: Rng): THREE.BufferGeometry {
  const stems: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = []; // faceted, glossy biomineral (aPart = 2)
  const s = rng.range(0, 100);
  switch (form) {
    case 'conifer': {
      stems.push(cyl(0.035, 0.012, 0.35, 0));
      const tiers = rng.int(3, 5);
      for (let i = 0; i < tiers; i++) {
        const t = i / tiers;
        const c = new THREE.ConeGeometry(0.26 * (1 - t * 0.7), 0.42, 9, 1, true);
        c.translate(0, 0.25 + t * 0.62 + 0.21, 0);
        leaves.push(lumpy(c, s + i, 0.08, 6));
      }
      break;
    }
    case 'broadleaf': {
      stems.push(cyl(0.05, 0.03, 0.55, 0));
      // branches start on the trunk and end inside the crown
      for (let i = 0; i < 3; i++) stems.push(cyl(0.025, 0.012, 0.22, 0).rotateZ(0.55).rotateY(i * 2.1 + 0.4).translate(0, 0.5, 0));
      const n = rng.int(4, 7);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng.range(0, 0.6);
        leaves.push(blob(rng.range(0.16, 0.24), Math.cos(a) * 0.17, rng.range(0.62, 0.82), Math.sin(a) * 0.17, 0.75, s + i));
      }
      leaves.push(blob(0.22, 0, 0.85, 0, 0.8, s + 9));
      break;
    }
    case 'frond': {
      // tall stalk with drooping fronds (palm-like / alien)
      stems.push(cyl(0.03, 0.02, 0.85, 0, 6));
      const n = rng.int(5, 9);
      for (let i = 0; i < n; i++) {
        const f = new THREE.PlaneGeometry(0.06, 0.42, 1, 4);
        const p = f.attributes.position as THREE.BufferAttribute;
        for (let k = 0; k < p.count; k++) {
          const y = p.getY(k) + 0.21;
          p.setXYZ(k, p.getX(k), y * 0.6 - y * y * 0.9, y);
        }
        f.rotateY((i / n) * Math.PI * 2);
        f.translate(0, 0.84, 0);
        f.computeVertexNormals();
        leaves.push(f);
      }
      break;
    }
    case 'fungal': {
      // stalk and broad cap (gills underneath)
      stems.push(cyl(0.06, 0.045, 0.7, 0, 9));
      const cap = new THREE.SphereGeometry(0.42, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2.2);
      cap.scale(1, 0.45, 1);
      cap.translate(0, 0.68, 0);
      leaves.push(lumpy(cap, s, 0.06, 3));
      break;
    }
    case 'spire': {
      // tall ribbed column (cactus / alien spire) with side lobes
      const c = cyl(0.09, 0.03, 1, 0, 10);
      leaves.push(lumpy(c, s, 0.1, 5));
      for (let i = 0; i < rng.int(0, 3); i++) {
        const arm = cyl(0.05, 0.025, 0.3, 0, 7).rotateZ(Math.PI / 2.6).rotateY(rng.range(0, 6.28));
        arm.translate(0, rng.range(0.35, 0.65), 0);
        leaves.push(arm);
      }
      break;
    }
    case 'coral': {
      // branching tubes
      const branch = (x: number, y: number, z: number, len: number, rot: THREE.Euler, depth: number) => {
        const c = cyl(0.04 * len * 2, 0.025 * len * 2, len, 0, 6);
        c.rotateX(rot.x).rotateZ(rot.z);
        c.translate(x, y, z);
        leaves.push(c);
        if (depth <= 0) return;
        const tip = new THREE.Vector3(0, len, 0).applyEuler(rot).add(new THREE.Vector3(x, y, z));
        for (let i = 0; i < 2; i++) branch(tip.x, tip.y, tip.z, len * 0.7, new THREE.Euler(rot.x + rng.range(-0.6, 0.6), 0, rot.z + rng.range(-0.6, 0.6)), depth - 1);
      };
      branch(0, 0, 0, 0.42, new THREE.Euler(0, 0, 0), 2);
      break;
    }
    case 'tuft': {
      // grass-like tuft of thin curved blades
      const n = rng.int(7, 13);
      for (let i = 0; i < n; i++) {
        const f = new THREE.PlaneGeometry(0.05, 1, 1, 3);
        const p = f.attributes.position as THREE.BufferAttribute;
        const lean = rng.range(0.1, 0.5);
        for (let k = 0; k < p.count; k++) {
          const y = p.getY(k) + 0.5;
          p.setXYZ(k, p.getX(k) * (1 - y * 0.8), y * (1 - lean * 0.3), y * y * lean);
        }
        f.rotateY(rng.range(0, Math.PI * 2));
        f.translate(rng.range(-0.12, 0.12), 0, rng.range(-0.12, 0.12));
        f.computeVertexNormals();
        leaves.push(f);
      }
      break;
    }
    case 'shrub': {
      const n = rng.int(3, 6);
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, 6.28), r = rng.range(0, 0.3);
        leaves.push(blob(rng.range(0.25, 0.4), Math.cos(a) * r, rng.range(0.3, 0.55), Math.sin(a) * r, 0.8, s + i));
      }
      break;
    }
    case 'mound': {
      // microbial mat / stromatolite dome
      const d = new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      d.scale(1, 1.6, 1);
      leaves.push(lumpy(d, s, 0.15, 3));
      break;
    }
    case 'tubes': {
      const n = rng.int(5, 12);
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, 6.28), r = rng.range(0, 0.25), h = rng.range(0.4, 1);
        leaves.push(cyl(0.04, 0.03, h, 0, 6).translate(Math.cos(a) * r, 0, Math.sin(a) * r));
        leaves.push(blob(0.05, Math.cos(a) * r, h, Math.sin(a) * r, 1, s + i, 0));
      }
      break;
    }
    case 'bulb': {
      stems.push(cyl(0.03, 0.02, 0.5, 0, 6));
      leaves.push(blob(0.28, 0, 0.7, 0, 1.2, s));
      break;
    }
    case 'crystal': {
      // silica-shelled colony (a fictional "glass sponge" biology): clustered
      // hexagonal prisms with pyramidal tips, flat-shaded facets
      const n = rng.int(5, 11);
      for (let i = 0; i < n; i++) {
        const h = i === 0 ? 1 : rng.range(0.3, 0.8);
        const r = h * rng.range(0.07, 0.12);
        const prism = new THREE.CylinderGeometry(r, r * 1.15, h * 0.8, 6, 1, false).toNonIndexed();
        prism.translate(0, h * 0.4, 0);
        const tip = new THREE.ConeGeometry(r, h * 0.2, 6).toNonIndexed();
        tip.translate(0, h * 0.9, 0);
        const tilt = i === 0 ? rng.range(0, 0.1) : rng.range(0.2, 0.75), az = rng.range(0, Math.PI * 2);
        for (const g of [prism, tip]) {
          g.deleteAttribute('uv');
          g.rotateZ(tilt).rotateY(az);
          g.translate(rng.range(-0.04, 0.04), 0, rng.range(-0.04, 0.04));
          g.computeVertexNormals();
          glass.push(g);
        }
      }
      break;
    }
  }
  const all = [...stems.map((g) => part(g, 0)), ...leaves.map((g) => part(g, 1)), ...glass.map((g) => part(g, 2))];
  const merged = mergeGeometries(all, false)!;
  merged.computeBoundingSphere();
  return merged;
}

export interface FloraInput {
  seed: number;
  /** Earth: use familiar terrestrial forms */
  terrestrial?: boolean;
  life: 'none' | 'prebiotic' | 'microbial' | 'simple' | 'complex';
  gravity: number;
  veg1: [number, number, number];
  veg2: [number, number, number];
  rock: [number, number, number];
}

/** The plant species of a world (empty for sterile and microbial worlds). */
export function floraFor(inp: FloraInput): Species[] {
  if (inp.life !== 'simple' && inp.life !== 'complex') return [];
  const rng = new Rng(inp.seed ^ 0x7f10a);
  // size ∝ g^-0.5 (structural limits), clamped
  const gScale = Math.min(3, Math.max(0.45, Math.pow(9.81 / Math.max(inp.gravity, 0.5), 0.5)));
  const mix = (t: number): [number, number, number] => [
    inp.veg1[0] + (inp.veg2[0] - inp.veg1[0]) * t,
    inp.veg1[1] + (inp.veg2[1] - inp.veg1[1]) * t,
    inp.veg1[2] + (inp.veg2[2] - inp.veg1[2]) * t,
  ];
  const stem: [number, number, number] = [inp.rock[0] * 0.6 + 0.03, inp.rock[1] * 0.5 + 0.02, inp.rock[2] * 0.4 + 0.01];
  const out: Species[] = [];
  if (inp.life === 'complex' && inp.terrestrial) {
    out.push({ form: 'conifer', geometry: plantGeometry('conifer', rng), height: 18, color: [0.03, 0.07, 0.03], stem: [0.08, 0.05, 0.03], weight: 1, large: true });
    out.push({ form: 'broadleaf', geometry: plantGeometry('broadleaf', rng), height: 14, color: [0.05, 0.11, 0.025], stem: [0.09, 0.06, 0.04], weight: 1.4, large: true });
    out.push({ form: 'shrub', geometry: plantGeometry('shrub', rng), height: 1.4, color: [0.05, 0.1, 0.03], stem, weight: 1, large: false });
    out.push({ form: 'tuft', geometry: plantGeometry('tuft', rng), height: 0.5, color: [0.09, 0.14, 0.04], stem, weight: 3, large: false });
  } else if (inp.life === 'complex') {
    const tall: PlantForm[] = ['conifer', 'broadleaf', 'frond', 'fungal', 'spire', 'coral', 'crystal'];
    const n = rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const form = rng.pick(tall);
      const h = rng.range(6, 22) * gScale * (form === 'spire' || form === 'coral' ? 0.5 : form === 'crystal' ? 0.3 : 1);
      // biomineral shells: paler, glassier tints of the pigment
      const c = mix(rng.next());
      const color: [number, number, number] = form === 'crystal' ? [c[0] * 0.5 + 0.3, c[1] * 0.5 + 0.32, c[2] * 0.5 + 0.36] : c;
      out.push({ form, geometry: plantGeometry(form, rng), height: h, color, stem, weight: rng.range(0.5, 1.5), large: true });
    }
    out.push({ form: 'tuft', geometry: plantGeometry('tuft', rng), height: rng.range(0.3, 0.9) * gScale, color: mix(rng.next()), stem, weight: 3, large: false });
    const form: PlantForm = rng.pick(['bulb', 'tubes', 'shrub'] as PlantForm[]);
    out.push({ form, geometry: plantGeometry(form, rng), height: rng.range(0.6, 2.2) * gScale, color: mix(rng.next()), stem, weight: 1, large: false });
  } else {
    // simple multicellular life: mats, mounds, tube colonies
    for (const form of ['mound', 'tubes', 'bulb'] as PlantForm[]) {
      out.push({ form, geometry: plantGeometry(form, rng), height: rng.range(0.25, 1.4) * gScale, color: mix(rng.next()), stem, weight: rng.range(0.5, 1.5), large: false });
    }
  }
  return out;
}
