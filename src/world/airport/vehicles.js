// =============================================================================
// Ground support equipment: geometry builders (towbarless pushback tug,
// baggage tractor, baggage carts, belt loader, catering hi-loader, hydrant
// dispenser, GPU, vans, follow-me car), a Vehicle wrapper (shared geometry per
// type, shared materials) and a path Mover (smooth speed profile, forward or
// reverse legs, trailers following at an arc-length offset).
//
// Vehicle-local frame: origin on the ground between the axles, forward = -Z.
// =============================================================================
import * as THREE from 'three';
import { buildPath, samplePath } from '../layout.js';
import { GeoBuilder, PRIM, WHEEL, mat, clamp, clamp01, smoothstep } from './util.js';

export const LIVERY = {
  departure: { main: 0xe2a51d, second: 0x2e3338, stripe: 0xf2f2ee, van: 0xe8e8e4 },
  arrival: { main: 0xe8ebee, second: 0x1d4f8a, stripe: 0xf08a1c, van: 0xe8e8e4 },
};

const TYRE = 0x161616, RIM = 0x8a8c8e, BLACK = 0x1e1f21, STEEL = 0x74787c, CHROME = 0xb9bcbe;

function wheels(B, positions, r, w) {
  for (const [x, z] of positions) {
    B.dark.add(WHEEL, mat(x, r, z, 0, 0, 0, w, r * 2, r * 2), TYRE);
    B.metal.add(WHEEL, mat(x + Math.sign(x) * (w / 2 + 0.005), r, z, 0, 0, 0, 0.02, r * 1.1, r * 1.1), RIM);
  }
}
const mk = () => ({ paint: new GeoBuilder(), dark: new GeoBuilder(), metal: new GeoBuilder(), glass: new GeoBuilder(), lamp: new GeoBuilder() });

// ----------------------------------------------------------------------------- types
const BUILD = {
  tug(B, L) {
    // Towbarless tug (TLD/Goldhofer style): 8.2 x 3.6 x 1.55 m, nose-wheel cradle at the front (-z)
    const c = L.main;
    B.paint.add(PRIM.box, mat(0, 0.9, 1.3, 0, 0, 0, 3.6, 0.9, 5.4), c);                   // rear body
    for (const s of [-1, 1]) B.paint.add(PRIM.box, mat(s * 1.28, 0.9, -2.55, 0, 0, 0, 1.04, 0.9, 2.9), c); // cradle pods
    B.metal.add(PRIM.box, mat(0, 0.45, -2.3, 0, 0, 0, 1.4, 0.12, 2.6), STEEL);             // cradle floor / clamp
    B.dark.add(PRIM.box, mat(0, 0.75, -1.0, 0, 0, 0, 1.5, 0.6, 0.2), BLACK);               // clamp pusher
    B.dark.add(PRIM.box, mat(0, 0.62, 4.05, 0, 0, 0, 3.7, 0.35, 0.18), BLACK);             // bumpers
    for (const s of [-1, 1]) B.dark.add(PRIM.box, mat(s * 1.28, 0.62, -4.05, 0, 0, 0, 1.1, 0.35, 0.18), BLACK);
    B.paint.add(PRIM.box, mat(0, 1.36, 1.6, 0, 0, 0, 3.4, 0.04, 4.6), L.second);           // deck stripe
    for (const s of [-1, 1]) B.paint.add(PRIM.box, mat(s * 1.81, 0.95, 0.5, 0, 0, 0, 0.02, 0.18, 7.6), L.stripe);
    // low cab on the left rear
    B.paint.add(PRIM.box, mat(-0.95, 1.65, 2.75, 0, 0, 0, 1.5, 0.6, 1.9), c);
    B.glass.add(PRIM.box, mat(-0.95, 2.1, 2.75, 0, 0, 0, 1.42, 0.36, 1.82), 0xffffff);
    B.paint.add(PRIM.box, mat(-0.95, 2.32, 2.75, 0, 0, 0, 1.56, 0.08, 1.96), c);
    B.lamp.add(PRIM.cyl8, mat(-0.95, 2.43, 3.2, 0, 0, 0, 0.16, 0.14, 0.16), 0xffa020);
    wheels(B, [[-1.62, -2.55], [1.62, -2.55], [-1.62, 2.75], [1.62, 2.75]], 0.6, 0.55);
    for (const s of [-1, 1]) B.lamp.add(PRIM.box, mat(s * 1.4, 1.05, -4.0, 0, 0, 0, 0.3, 0.12, 0.04), 0xfff3dc);
  },
  tractor(B, L) {
    B.paint.add(PRIM.box, mat(0, 0.75, 0.15, 0, 0, 0, 1.45, 0.75, 2.7), L.main);
    B.paint.add(PRIM.box, mat(0, 1.0, -1.05, 0, 0, 0, 1.4, 0.45, 0.5), L.main);
    B.dark.add(PRIM.box, mat(0, 1.15, 0.6, 0, 0, 0, 1.0, 0.25, 0.6), BLACK);    // seat
    B.dark.add(PRIM.box, mat(0, 1.5, 0.95, 0, 0, 0, 1.0, 0.6, 0.12), BLACK);
    for (const [x, z] of [[-0.66, -0.75], [0.66, -0.75], [-0.66, 1.3], [0.66, 1.3]]) B.metal.add(PRIM.box, mat(x, 1.7, z, 0, 0, 0, 0.06, 1.2, 0.06), STEEL);
    B.paint.add(PRIM.box, mat(0, 2.3, 0.28, 0, 0, 0, 1.5, 0.06, 2.2), L.second);
    B.lamp.add(PRIM.cyl8, mat(0, 2.4, 0.2, 0, 0, 0, 0.14, 0.12, 0.14), 0xffa020);
    B.dark.add(PRIM.box, mat(0, 0.5, 1.55, 0, 0, 0, 0.3, 0.12, 0.3), BLACK);
    wheels(B, [[-0.62, -0.8], [0.62, -0.8], [-0.62, 0.95], [0.62, 0.95]], 0.32, 0.26);
    for (const s of [-1, 1]) B.lamp.add(PRIM.box, mat(s * 0.5, 1.05, -1.31, 0, 0, 0, 0.18, 0.1, 0.03), 0xfff3dc);
  },
  cart(B, L, seed = 0) {
    const covered = seed % 2 === 0;
    B.metal.add(PRIM.box, mat(0, 0.55, 0, 0, 0, 0, 1.5, 0.12, 2.7), STEEL);
    B.metal.add(PRIM.box, mat(0, 0.45, -1.75, 0, 0, 0, 0.08, 0.06, 1.0), STEEL);
    wheels(B, [[-0.62, -0.9], [0.62, -0.9], [-0.62, 0.9], [0.62, 0.9]], 0.2, 0.14);
    if (covered) {
      B.paint.add(PRIM.box, mat(0, 1.75, 0, 0, 0, 0, 1.56, 0.08, 2.76), L.second);
      for (const [x, z] of [[-0.74, -1.32], [0.74, -1.32], [-0.74, 1.32], [0.74, 1.32]]) B.metal.add(PRIM.box, mat(x, 1.15, z, 0, 0, 0, 0.05, 1.2, 0.05), STEEL);
      B.dark.add(PRIM.box, mat(-0.74, 1.2, 0, 0, 0, 0, 0.03, 1.1, 2.6), 0x2a3e5c);
    }
    // bags
    const cols = [0x262a30, 0x5b1f1f, 0x1f3f5b, 0x3d3d3d, 0x6b5a3a, 0x1c1c1c, 0x7a2f4f];
    let k = seed * 7;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const h = 0.25 + ((k * 37) % 10) / 40;
      B.dark.add(PRIM.box, mat(-0.38 + j * 0.74, 0.62 + h / 2, -0.9 + i * 0.85, 0, ((k * 13) % 7) * 0.05, 0, 0.62, h, 0.7), cols[k % cols.length]);
      k++;
    }
  },
  beltLoader(B, L) {
    B.paint.add(PRIM.box, mat(0, 0.6, 0, 0, 0, 0, 1.9, 0.5, 6.6), L.main);
    B.dark.add(PRIM.box, mat(-0.45, 1.05, 2.4, 0, 0, 0, 0.6, 0.4, 0.6), BLACK);     // driver seat
    B.metal.add(PRIM.box, mat(-0.45, 1.5, 2.2, 0, 0, 0.0, 0.5, 0.05, 0.4), STEEL);
    wheels(B, [[-0.9, -2.2], [0.9, -2.2], [-0.9, 2.2], [0.9, 2.2]], 0.36, 0.3);
    B.lamp.add(PRIM.cyl8, mat(0.6, 1.0, 2.9, 0, 0, 0, 0.14, 0.12, 0.14), 0xffa020);
  },
  belt(B, L) {
    // conveyor (separate part, pivots at the rear): 8.2 m long, frame + belt + rails; local +z is the low end
    const len = 8.2;
    B.metal.add(PRIM.box, mat(0, 0, -len / 2, 0, 0, 0, 0.95, 0.22, len), STEEL);
    B.dark.add(PRIM.box, mat(0, 0.12, -len / 2, 0, 0, 0, 0.8, 0.03, len), 0x1d1d1d);
    for (const s of [-1, 1]) {
      B.paint.add(PRIM.box, mat(s * 0.47, 0.32, -len / 2, 0, 0, 0, 0.05, 0.05, len), L.main);
      for (let i = 0; i < 6; i++) B.paint.add(PRIM.box, mat(s * 0.47, 0.2, -0.5 - i * 1.5, 0, 0, 0, 0.04, 0.3, 0.04), L.main);
    }
    B.dark.add(PRIM.box, mat(0, 0.06, -len + 0.1, 0, 0, 0, 1.0, 0.2, 0.25), BLACK);   // rubber bumper at the door
  },
  catering(B, L) {
    // chassis + cab (box body separate)
    B.paint.add(PRIM.box, mat(0, 0.75, 0.6, 0, 0, 0, 2.3, 0.4, 8.2), 0x404448);
    B.paint.add(PRIM.box, mat(0, 1.5, 4.1, 0, 0, 0, 2.4, 1.9, 1.7), 0xe6e6e2);
    B.glass.add(PRIM.box, mat(0, 1.95, 4.97, 0, 0, 0, 2.2, 0.8, 0.05), 0xffffff);
    for (const s of [-1, 1]) B.glass.add(PRIM.box, mat(s * 1.21, 1.95, 4.1, 0, 0, 0, 0.03, 0.7, 1.2), 0xffffff);
    B.lamp.add(PRIM.cyl8, mat(0, 2.52, 4.2, 0, 0, 0, 0.16, 0.14, 0.16), 0xffa020);
    wheels(B, [[-1.05, 3.8], [1.05, 3.8], [-1.05, -1.6], [1.05, -1.6], [-1.05, -2.7], [1.05, -2.7]], 0.48, 0.4);
    // stabiliser legs
    for (const s of [-1, 1]) B.metal.add(PRIM.box, mat(s * 1.25, 0.45, -3.3, 0, 0, 0, 0.18, 0.8, 0.18), STEEL);
  },
  cateringBox(B, L) {
    // insulated box body with a front platform (local origin = bottom centre of the body)
    B.paint.add(PRIM.box, mat(0, 1.3, 0, 0, 0, 0, 2.5, 2.6, 6.2), 0xf0f0ec);
    B.paint.add(PRIM.box, mat(-1.26, 1.0, 0, 0, 0, 0, 0.02, 0.35, 6.0), L.second);
    B.paint.add(PRIM.box, mat(1.26, 1.0, 0, 0, 0, 0, 0.02, 0.35, 6.0), L.second);
    B.metal.add(PRIM.box, mat(0, 0.05, -3.55, 0, 0, 0, 2.5, 0.1, 1.0), STEEL);
    for (const s of [-1, 1]) B.paint.add(PRIM.box, mat(s * 1.2, 0.55, -3.55, 0, 0, 0, 0.05, 1.0, 0.95), 0xe3b82a);
    B.dark.add(PRIM.box, mat(0, 0.12, -4.08, 0, 0, 0, 2.2, 0.18, 0.12), BLACK);
  },
  scissor(B) {
    // unit-height scissor (scaled in y)
    for (const s of [-1, 1]) for (const a of [0.9, -0.9]) B.metal.add(PRIM.box, mat(s * 0.9, 0.5, 0, a, 0, 0, 0.12, 0.08, 4.4), STEEL);
  },
  dispenser(B, L) {
    // hydrant dispenser truck with an elevating platform
    B.paint.add(PRIM.box, mat(0, 0.7, 0.3, 0, 0, 0, 2.2, 0.4, 7.0), 0x3a3e42);
    B.paint.add(PRIM.box, mat(0, 1.45, -2.6, 0, 0, 0, 2.3, 1.8, 1.6), 0xe8e8e4);
    B.glass.add(PRIM.box, mat(0, 1.85, -3.42, 0, 0, 0, 2.1, 0.75, 0.05), 0xffffff);
    B.paint.add(PRIM.box, mat(0, 1.35, 1.2, 0, 0, 0, 2.2, 1.1, 3.4), 0xd8d8d2);
    B.paint.add(PRIM.box, mat(0, 1.1, 1.2, 0, 0, 0, 2.22, 0.18, 3.42), 0xc22a20);
    B.metal.add(PRIM.cyl12, mat(0, 1.6, 3.2, 0, 0, Math.PI / 2, 0.9, 1.6, 0.9), STEEL);     // hose reel
    B.metal.add(PRIM.box, mat(0.3, 1.95, 1.2, 0, 0, 0, 1.6, 0.08, 2.0), STEEL);                 // platform
    for (const [x, z] of [[-0.5, 0.25], [1.1, 0.25], [-0.5, 2.15], [1.1, 2.15]]) B.paint.add(PRIM.box, mat(x, 2.35, z, 0, 0, 0, 0.05, 0.8, 0.05), 0xe3b82a);
    B.paint.add(PRIM.box, mat(0.3, 2.75, 0.25, 0, 0, 0, 1.6, 0.05, 0.05), 0xe3b82a);
    B.dark.add(PRIM.cyl8, mat(-0.9, 2.1, 0.6, 0, 0, 0.35, 0.09, 1.0, 0.09), 0x151515);            // hose up to the wing panel
    B.lamp.add(PRIM.cyl8, mat(0, 2.45, -2.6, 0, 0, 0, 0.16, 0.14, 0.16), 0xffa020);
    wheels(B, [[-1.0, -2.2], [1.0, -2.2], [-1.0, 2.6], [1.0, 2.6]], 0.45, 0.38);
  },
  gpu(B, L) {
    B.paint.add(PRIM.box, mat(0, 0.95, 0, 0, 0, 0, 1.3, 1.1, 2.3), L.main);
    B.dark.add(PRIM.box, mat(0, 1.0, 1.16, 0, 0, 0, 1.0, 0.7, 0.02), 0x2a2a2a);
    B.metal.add(PRIM.box, mat(0, 0.35, -1.5, 0, 0, 0, 0.08, 0.06, 1.0), STEEL);
    B.dark.add(PRIM.cyl8, mat(0.66, 1.1, 0.3, 0, 0, Math.PI / 2, 0.5, 0.15, 0.5), BLACK);
    wheels(B, [[-0.6, -0.75], [0.6, -0.75], [-0.6, 0.75], [0.6, 0.75]], 0.22, 0.16);
  },
  van(B, L) {
    B.paint.add(PRIM.box, mat(0, 0.95, 0.2, 0, 0, 0, 1.9, 1.3, 4.0), L.van);
    B.paint.add(PRIM.box, mat(0, 0.75, -2.05, 0, 0, 0, 1.86, 0.8, 0.6), L.van);
    B.glass.add(PRIM.box, mat(0, 1.4, -1.55, -0.45, 0, 0, 1.8, 0.05, 0.9), 0xffffff);
    for (const s of [-1, 1]) B.glass.add(PRIM.box, mat(s * 0.955, 1.35, 0.2, 0, 0, 0, 0.02, 0.45, 3.4), 0xffffff);
    B.paint.add(PRIM.box, mat(0, 0.9, 0.2, 0, 0, 0, 1.92, 0.12, 4.0), L.second);
    B.lamp.add(PRIM.box, mat(0, 1.66, 0.4, 0, 0, 0, 0.9, 0.1, 0.25), 0xffa020);
    wheels(B, [[-0.82, -1.45], [0.82, -1.45], [-0.82, 1.5], [0.82, 1.5]], 0.33, 0.22);
    for (const s of [-1, 1]) B.lamp.add(PRIM.box, mat(s * 0.7, 0.85, -2.36, 0, 0, 0, 0.3, 0.1, 0.02), 0xfff3dc);
  },
  followme(B, L) {
    B.paint.add(PRIM.box, mat(0, 0.75, 0, 0, 0, 0, 1.8, 0.7, 4.4), 0xe6c21a);
    B.paint.add(PRIM.box, mat(0, 1.3, 0.3, 0, 0, 0, 1.6, 0.55, 2.2), 0xe6c21a);
    B.glass.add(PRIM.box, mat(0, 1.3, 0.3, 0, 0, 0, 1.62, 0.42, 2.0), 0xffffff);
    B.paint.add(PRIM.box, mat(0, 1.85, 0.3, 0, 0, 0, 1.5, 0.45, 0.25), 0x1a1a1a);
    B.lamp.add(PRIM.box, mat(0, 1.86, 0.15, 0, 0, 0, 1.3, 0.32, 0.02), 0xffd000);
    wheels(B, [[-0.8, -1.4], [0.8, -1.4], [-0.8, 1.4], [0.8, 1.4]], 0.32, 0.22);
    void L;
  },
  stairs(B, L) {
    // passenger stair truck (parked equipment)
    B.paint.add(PRIM.box, mat(0, 0.7, 0, 0, 0, 0, 2.2, 0.5, 6.5), 0x3a3e42);
    B.paint.add(PRIM.box, mat(0, 1.5, -2.7, 0, 0, 0, 2.1, 1.6, 1.2), L.main);
    const steps = 14;
    for (let i = 0; i < steps; i++) B.metal.add(PRIM.box, mat(0, 1.0 + i * 0.18, 2.6 - i * 0.32, 0, 0, 0, 1.4, 0.04, 0.3), STEEL);
    for (const s of [-1, 1]) B.paint.add(PRIM.box, mat(s * 0.75, 2.5, 0.5, 0.51, 0, 0, 0.06, 1.0, 5.2), L.main);
    wheels(B, [[-1.0, -2.2], [1.0, -2.2], [-1.0, 2.2], [1.0, 2.2]], 0.4, 0.3);
  },
};

// ----------------------------------------------------------------------------- shared resources
export function createVehicleKit(livery) {
  const mats = {
    paint: new THREE.MeshStandardMaterial({ name: 'gse-paint', vertexColors: true, roughness: 0.48, metalness: 0.05 }),
    dark: new THREE.MeshStandardMaterial({ name: 'gse-dark', vertexColors: true, roughness: 0.85, metalness: 0.0 }),
    metal: new THREE.MeshStandardMaterial({ name: 'gse-metal', vertexColors: true, roughness: 0.42, metalness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ name: 'gse-glass', color: 0x0b0e11, roughness: 0.06, metalness: 0.2, envMapIntensity: 1.5 }),
    lamp: new THREE.MeshStandardMaterial({ name: 'gse-lamp', vertexColors: true, color: 0x222222, emissive: 0x000000, roughness: 0.3 }),
  };
  // lamp lenses: emissive = vertex colour via a tiny patch
  mats.lamp.onBeforeCompile = (sh) => {
    sh.uniforms.uLampOn = kit.lampOn;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLampOn;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance += vColor.rgb * uLampOn;\n#endif');
  };
  mats.lamp.customProgramCacheKey = () => 'gse-lamp';
  const cache = new Map();
  const kit = {
    mats, livery, lampOn: { value: 1 },
    geometry(type, seed = 0) {
      const key = `${type}|${seed}`;
      if (cache.has(key)) return cache.get(key);
      const B = mk();
      BUILD[type](B, livery, seed);
      const out = {};
      for (const k of Object.keys(B)) if (!B[k].empty) out[k] = B[k].build();
      cache.set(key, out);
      return out;
    },
    /** add a static (parked) vehicle into merged builders */
    addStatic(builders, type, matrix, seed = 0) {
      const B = mk();
      BUILD[type](B, livery, seed);
      for (const k of Object.keys(B)) {
        if (B[k].empty) continue;
        builders[k].add(B[k].build(), matrix, null);
      }
    },
  };
  return kit;
}

/** Merge static builders (from kit.addStatic) into meshes. */
export function staticMeshes(builders, kit, group) {
  for (const [k, b] of Object.entries(builders)) {
    if (b.empty) continue;
    const g = b.build();
    // vertex colours were baked by the inner builders; the outer builder multiplies by white
    const mesh = new THREE.Mesh(g, kit.mats[k]);
    mesh.castShadow = k !== 'lamp'; mesh.receiveShadow = true;
    mesh.name = `gse-static-${k}`;
    group.add(mesh);
  }
}

/** A movable vehicle made of shared per-type geometries. */
export class Vehicle {
  constructor(kit, type, { seed = 0 } = {}) {
    this.type = type;
    this.group = new THREE.Group();
    this.group.name = `gse-${type}`;
    const geos = kit.geometry(type, seed);
    for (const [k, g] of Object.entries(geos)) {
      const m = new THREE.Mesh(g, kit.mats[k]);
      m.castShadow = k !== 'lamp'; m.receiveShadow = true;
      this.group.add(m);
    }
    this.x = 0; this.z = 0; this.yaw = 0;
  }
  setPose(x, z, yaw, y = 0) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.group.position.set(x, y, z);
    this.group.rotation.set(0, yaw, 0);
  }
  addPart(kit, type, offset, seed = 0) {
    const g = new THREE.Group();
    const geos = kit.geometry(type, seed);
    for (const [k, geo] of Object.entries(geos)) {
      const m = new THREE.Mesh(geo, kit.mats[k]);
      m.castShadow = k !== 'lamp'; m.receiveShadow = true;
      g.add(m);
    }
    g.position.copy(offset);
    this.group.add(g);
    return g;
  }
}

/** heading (compass deg) of a path sample -> vehicle yaw (forward = -Z) */
export const yawOfHeading = (h) => -h * Math.PI / 180;

/**
 * Path mover: legs [{ points, reverse, vmax, radius }]. Speed profile with
 * acceleration a and deceleration at the end of each leg (vehicles stop to
 * change direction).
 */
export class Mover {
  constructor(legs, { accel = 1.2, decel = 1.4 } = {}) {
    this.legs = legs.map((l) => ({ ...l, path: buildPath(l.points, l.radius ?? 6, { reverse: !!l.reverse, step: 0.5 }) }));
    this.i = 0; this.s = 0; this.v = 0; this.done = false;
    this.accel = accel; this.decel = decel;
    this.pause = 0;
  }
  get leg() { return this.legs[this.i]; }
  update(dt) {
    if (this.done) return;
    if (this.pause > 0) { this.pause -= dt; return; }
    const L = this.leg;
    const rem = L.path.length - this.s;
    const vmax = L.vmax ?? 5;
    const vStop = Math.sqrt(Math.max(0, 2 * this.decel * rem));
    const vt = Math.min(vmax, vStop);
    this.v = this.v < vt ? Math.min(vt, this.v + this.accel * dt) : Math.max(vt, this.v - this.decel * 1.5 * dt);
    this.s += Math.max(this.v, rem > 0.05 ? 0.15 : 0) * dt;
    if (this.s >= L.path.length - 0.02) {
      this.s = L.path.length;
      if (this.i < this.legs.length - 1) { this.i++; this.s = 0; this.v = 0; this.pause = 0.8; } else this.done = true;
    }
  }
  /** sample pose at an arc-length offset behind the current position (trailers) */
  pose(back = 0, out = {}) {
    let i = this.i, s = this.s - back;
    while (s < 0 && i > 0) { i--; s += this.legs[i].path.length; }
    const p = samplePath(this.legs[i].path, Math.max(0, s));
    out.x = p.x; out.z = p.z; out.yaw = yawOfHeading(p.heading);
    return out;
  }
}

export { clamp, clamp01, smoothstep };
