import * as THREE from 'three';
import { HALF_D, HALF_W, paintQuad } from './arena';
import type { Arena, Obstacle } from './arena';
import type { BloodAtlas, FaceKind } from './bloodAtlas';
import type { Dressing } from './dressing';

// ============================================================================ canvas helpers
export function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}
export function tex(c: HTMLCanvasElement, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  else t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** What a map builder hands back to the Arena. */
export interface MapParts {
  moon: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  dust: THREE.Points;
  dressing: Dressing;
  update: (dt: number) => void;
}

/**
 * Overlay uv for a quad built by paintQuad: metres along (u, v) from `origin` mapped into the
 * overlay texture's rectangle (u0, v0, w, h in metres of the same face). Outside the rectangle the
 * uv runs off the texture (its border is transparent and clamped).
 */
export function setOverlayUv(geo: THREE.BufferGeometry, origin: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, rect: { u0: number; v0: number; w: number; h: number }) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const out = new Float32Array(pos.count * 2);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).sub(origin);
    out[i * 2] = (p.dot(u) - rect.u0) / rect.w;
    out[i * 2 + 1] = (p.dot(v) - rect.v0) / rect.h;
  }
  geo.setAttribute('ovUv', new THREE.BufferAttribute(out, 2));
  return geo;
}
/** A dummy overlay uv (off the texture) so a quad can merge with overlaid ones. */
export function noOverlayUv(geo: THREE.BufferGeometry) {
  const n = geo.attributes.position.count;
  geo.setAttribute('ovUv', new THREE.BufferAttribute(new Float32Array(n * 2).fill(-1), 2));
  return geo;
}

export interface LightSpec {
  p: THREE.Vector3;
  color: number;
  intensity: number;
  distance: number;
  decay?: number;
  /** Higher = kept on low presets first. */
  priority: number;
  /** Called with the created light (flicker etc.). */
  use?: (l: THREE.PointLight) => void;
}

/**
 * The toolbox the map builders share: paintable floors and walls (with an optional non-tiling
 * overlay for graffiti, signage and stains), obstacles, doors with gates, a light budget, a key
 * light with shadows, and a reflection probe of the finished room.
 */
export class MapKit {
  g: THREE.Group;
  floorDensity: number;
  wallDensity: number;
  propDensity: number;
  readonly up = new THREE.Vector3(0, 1, 0);
  private lights: LightSpec[] = [];
  constructor(public a: Arena, public blood: BloodAtlas, public pointLights: number, public shadowMapSize: number) {
    this.g = a.group;
    this.floorDensity = blood.size >= 4096 ? 96 : 52;
    this.wallDensity = this.floorDensity * 0.45;
    this.propDensity = this.floorDensity * 0.6;
  }

  add<T extends THREE.Object3D>(o: T, cast = true, recv = true) {
    o.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) {
        m.castShadow = cast;
        m.receiveShadow = recv;
      }
    });
    this.g.add(o);
    return o;
  }
  box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0, cast = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    return this.add(m, cast);
  }
  cyl(rTop: number, rBot: number, h: number, seg: number, mat: THREE.Material, x: number, y: number, z: number, cast = true) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
    m.position.set(x, y, z);
    return this.add(m, cast);
  }
  obstacle(minX: number, maxX: number, minZ: number, maxZ: number, h: number, kind: Obstacle['kind'], name: string, ghost = false) {
    const o: Obstacle = { minX, maxX, minZ, maxZ, h, kind, name };
    if (ghost) o.ghost = true;
    this.a.obstacles.push(o);
    return o;
  }
  /** Axis-aligned footprint centred on (x, z). */
  block(x: number, z: number, w: number, d: number, h: number, kind: Obstacle['kind'], name: string) {
    return this.obstacle(x - w / 2, x + w / 2, z - d / 2, z + d / 2, h, kind, name);
  }

  /** The paintable floor over the whole footprint (blood, paint, AO and an optional overlay). */
  floor(mat: THREE.MeshStandardMaterial, tile: [number, number], overlay = false) {
    const o = new THREE.Vector3(-HALF_W, 0, HALF_D), u = new THREE.Vector3(1, 0, 0), v = new THREE.Vector3(0, 0, -1);
    const geo = paintQuad(this.blood, o, u, v, HALF_W * 2, HALF_D * 2, tile, 'floor', this.floorDensity, 8, 8);
    // overlay canvas: x = world x, y = world z (row 0 at the north edge, flipY puts it at v = 1)
    if (overlay) setOverlayUv(geo, new THREE.Vector3(-HALF_W, 0, -HALF_D), u, new THREE.Vector3(0, 0, 1), { u0: 0, v0: HALF_D * 2, w: HALF_W * 2, h: -HALF_D * 2 });
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.name = 'floor';
    this.g.add(m);
    return m;
  }

  /**
   * One wall of the room: paintable quads up to `paintH` (with an overlay band `ov` if given),
   * plain ones above, gaps for doors. `origin` is the wall's left end at floor level seen from
   * inside, `u` runs along it. Returns the paintable and plain geometries (to merge by material).
   */
  wall(spec: { origin: THREE.Vector3; u: THREE.Vector3; len: number; height: number; paintH: number; tile: [number, number]; upperTile?: [number, number]; doors?: { at: number; w: number; h: number }[]; ov?: { h: number } | null; kind?: FaceKind }) {
    const { origin, u, len, height, paintH, tile } = spec;
    const up = this.up;
    const paint: THREE.BufferGeometry[] = [];
    const plain: THREE.BufferGeometry[] = [];
    const doors = (spec.doors ?? []).slice().sort((a, b) => a.at - b.at);
    // spans along the wall between doors; door tops filled above the opening
    const spans: [number, number, number, number][] = [];
    let cur = 0;
    for (const d of doors) {
      const d0 = d.at - d.w / 2, d1 = d.at + d.w / 2;
      if (d0 > cur) spans.push([cur, d0, 0, height]);
      spans.push([d0, d1, d.h, height]);
      cur = d1;
    }
    if (cur < len) spans.push([cur, len, 0, height]);
    for (const [u0, u1, v0, v1] of spans) {
      const w = u1 - u0;
      if (w <= 1e-3) continue;
      const pTop = Math.min(v1, paintH);
      if (pTop > v0 + 1e-3) {
        const o = origin.clone().addScaledVector(u, u0).setY(v0);
        const geo = paintQuad(this.blood, o, u, up, w, pTop - v0, tile, spec.kind ?? 'wall', this.wallDensity, Math.max(1, Math.round(w / 3)), 1);
        if (spec.ov) setOverlayUv(geo, origin.clone().setY(0), u, up, { u0: 0, v0: 0, w: len, h: spec.ov.h });
        else noOverlayUv(geo);
        // the tiling uv continues along the wall (no seams at the door jambs)
        const uv = geo.attributes.uv.array as Float32Array;
        for (let i = 0; i < uv.length; i += 2) {
          uv[i] += u0 / tile[0];
          uv[i + 1] += v0 / tile[1];
        }
        paint.push(geo);
      }
      const lo = Math.max(v0, paintH);
      if (v1 > lo + 1e-3) {
        const h = v1 - lo;
        const geo = new THREE.PlaneGeometry(w, h);
        const n = new THREE.Vector3().crossVectors(u, up);
        // PlaneGeometry faces +z: turn it to face the room (normal n), centre it on the span
        geo.applyMatrix4(new THREE.Matrix4().makeBasis(u, up, n));
        const c = origin.clone().addScaledVector(u, (u0 + u1) / 2).setY(lo + h / 2);
        geo.translate(c.x, c.y, c.z);
        const ut = spec.upperTile ?? tile;
        const uv = geo.attributes.uv.array as Float32Array;
        for (let i = 0; i < uv.length; i += 2) {
          uv[i] = (u0 + uv[i] * w) / ut[0];
          uv[i + 1] = (lo + uv[i + 1] * h) / ut[1];
        }
        plain.push(geo);
      }
    }
    return { paint, plain };
  }

  /**
   * A doorway: enemies spawn `outD` metres outside and walk in through it; an unseen gate across
   * the opening keeps fighters on foot in the room (entrants walk through it).
   */
  door(mid: THREE.Vector3, inward: THREE.Vector3, width: number, outD = 3.0, inD = 1.6, climb = 0) {
    const outP = mid.clone().addScaledVector(inward, -outD);
    const inP = mid.clone().addScaledVector(inward, inD);
    this.a.doors.push({ x: outP.x, z: outP.z, ix: inP.x, iz: inP.z, yaw: Math.atan2(inward.x, inward.z), width, ...(climb ? { climb } : {}) });
    const side = new THREE.Vector3(-inward.z, 0, inward.x);
    const p0 = mid.clone().addScaledVector(side, -width / 2).addScaledVector(inward, -0.3);
    const p1 = mid.clone().addScaledVector(side, width / 2);
    this.obstacle(Math.min(p0.x, p1.x), Math.max(p0.x, p1.x), Math.min(p0.z, p1.z), Math.max(p0.z, p1.z), 0.9, 'wall', 'gate', true);
  }

  /** Thick boxes behind the four walls (gaps where `openings` say), as the warehouse has. */
  roomWalls(h: number, openings: { side: 'n' | 's' | 'e' | 'w'; at: number; w: number }[]) {
    const T = 1.0;
    const sides: Record<string, [number, number, number, number, 'x' | 'z']> = {
      n: [-HALF_W - T, HALF_W + T, -HALF_D - T, -HALF_D, 'x'],
      s: [-HALF_W - T, HALF_W + T, HALF_D, HALF_D + T, 'x'],
      e: [HALF_W, HALF_W + T, -HALF_D - T, HALF_D + T, 'z'],
      w: [-HALF_W - T, -HALF_W, -HALF_D - T, HALF_D + T, 'z'],
    };
    for (const [k, [x0, x1, z0, z1, axis]] of Object.entries(sides)) {
      const gaps = openings.filter((o) => o.side === k).map((o) => [o.at - o.w / 2, o.at + o.w / 2] as [number, number]).sort((a, b) => a[0] - b[0]);
      let lo = axis === 'x' ? x0 : z0;
      const hi = axis === 'x' ? x1 : z1;
      for (const [g0, g1] of [...gaps, [hi, hi] as [number, number]]) {
        if (g0 > lo) {
          if (axis === 'x') this.obstacle(lo, g0, z0, z1, h, 'wall', 'wall-' + k);
          else this.obstacle(x0, x1, lo, g0, h, 'wall', 'wall-' + k);
        }
        lo = Math.max(lo, g1);
      }
    }
  }

  // ------------------------------------------------------------------ lighting
  light(spec: LightSpec) {
    this.lights.push(spec);
  }
  /** Create the most important point lights the quality preset allows. */
  commitLights() {
    const list = this.lights.sort((a, b) => b.priority - a.priority).slice(0, Math.max(1, this.pointLights));
    for (const s of list) {
      const l = new THREE.PointLight(s.color, s.intensity, s.distance, s.decay ?? 1.7);
      l.position.copy(s.p);
      this.g.add(l);
      s.use?.(l);
    }
    this.lights = [];
    return list.length;
  }
  hemi(sky: number, ground: number, intensity: number) {
    const h = new THREE.HemisphereLight(sky, ground, intensity);
    this.g.add(h);
    return h;
  }
  /** The shadow-casting key light (moon, sun through a skylight, a ceiling bank). */
  key(color: number, intensity: number, pos: THREE.Vector3, bounds = { x: 17, z: 15, far: 60 }) {
    const l = new THREE.DirectionalLight(color, intensity);
    l.position.copy(pos);
    l.target.position.set(0, 0, 0);
    l.castShadow = true;
    l.shadow.mapSize.set(this.shadowMapSize, this.shadowMapSize);
    const sc = l.shadow.camera as THREE.OrthographicCamera;
    sc.left = -bounds.x; sc.right = bounds.x; sc.top = bounds.z; sc.bottom = -bounds.z; sc.near = 1; sc.far = bounds.far;
    l.shadow.bias = -0.0006;
    l.shadow.normalBias = 0.03;
    this.g.add(l, l.target);
    return l;
  }
  noDust() {
    const d = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
    d.visible = false;
    return d;
  }
  /** Floating motes in the light (a few hundred additive points that drift). */
  motes(n: number, color: number, height: number, opacity = 0.4) {
    const geo = new THREE.BufferGeometry();
    const p: number[] = [];
    for (let i = 0; i < n; i++) p.push((Math.random() - 0.5) * HALF_W * 2, Math.random() * height, (Math.random() - 0.5) * HALF_D * 2);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const x = c.getContext('2d')!;
    const gr = x.createRadialGradient(8, 8, 0, 8, 8, 8);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 16, 16);
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.025, transparent: true, opacity, depthWrite: false, map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending }));
    this.g.add(pts);
    return pts;
  }

  /**
   * A reflection probe of the finished room: the arena group (lights included) rendered into a
   * prefiltered environment map, so glossy floors and glass reflect the actual space.
   */
  probe(background: THREE.Color | THREE.Texture, at = new THREE.Vector3(0, 1.6, 0), extra: THREE.Object3D[] = []) {
    const r = this.blood.renderer;
    if (!r) return;
    const sc = new THREE.Scene();
    sc.background = background;
    sc.fog = new THREE.FogExp2(this.a.fog.color, this.a.fog.density);
    sc.add(this.g);
    for (const e of extra) sc.add(e);
    const pm = new THREE.PMREMGenerator(r);
    const shadows = r.shadowMap.enabled;
    r.shadowMap.enabled = false;
    this.a.environment = pm.fromScene(sc, 0.02, 0.1, 150, { position: at }).texture;
    r.shadowMap.enabled = shadows;
    pm.dispose();
    sc.remove(this.g);
    for (const e of extra) sc.remove(e);
  }
}

/** Seeded colour helpers for canvas painting. */
export function shade(hex: string, k: number) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return '#' + c.getHexString();
}
export function rgba(hex: string, a: number) {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}

/**
 * Tangent-space normal map from a height canvas (white = high), for bricks that catch the light on
 * their edges, cracks that read as cracks.
 */
export function normalFromHeight(h: HTMLCanvasElement, strength = 2, repeat = true) {
  const W = h.width, H = h.height;
  const src = h.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data;
  const [c, x] = canvas(W, H);
  const out = x.createImageData(W, H);
  const at = (i: number, j: number) => src[((((j + H) % H) * W + ((i + W) % W)) << 2)] / 255;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const dx = (at(i + 1, j) - at(i - 1, j)) * strength;
      const dy = (at(i, j + 1) - at(i, j - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const o = (j * W + i) << 2;
      out.data[o] = ((-dx / l) * 0.5 + 0.5) * 255;
      out.data[o + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      out.data[o + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
  }
  x.putImageData(out, 0, 0);
  return tex(c, false, repeat);
}

/** Seeded value noise in [0,1] (tileable on a period). */
export function makeNoise(seed: number, period = 16) {
  const g: number[] = [];
  let s = seed >>> 0 || 1;
  for (let i = 0; i < period * period; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    g.push((s >>> 0) / 4294967296);
  }
  const at = (a: number, b: number) => g[(((b % period) + period) % period) * period + (((a % period) + period) % period)];
  return (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const tx = x - ix, ty = y - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
  };
}

/**
 * A fire (an oil drum, a hearth): licking flame sprites, rising embers and a breathing light.
 * Returns the per-frame update.
 */
export function addFire(k: MapKit, at: THREE.Vector3, opts: { size?: number; light?: number; priority?: number; width?: number } = {}) {
  const size = opts.size ?? 1;
  const width = opts.width ?? 0.3;
  const [c, x] = canvas(64, 128);
  const gr = x.createRadialGradient(32, 96, 2, 32, 80, 60);
  gr.addColorStop(0, 'rgba(255,240,180,1)');
  gr.addColorStop(0.25, 'rgba(255,170,60,0.9)');
  gr.addColorStop(0.6, 'rgba(220,60,10,0.45)');
  gr.addColorStop(1, 'rgba(120,20,0,0)');
  x.fillStyle = gr;
  x.beginPath();
  x.moveTo(32, 2);
  x.quadraticCurveTo(60, 70, 50, 110);
  x.quadraticCurveTo(32, 128, 14, 110);
  x.quadraticCurveTo(4, 70, 32, 2);
  x.fill();
  const flameTex = tex(c, true, false);
  const flames: { s: THREE.Sprite; ph: number; ox: number; oz: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    k.g.add(s);
    flames.push({ s, ph: Math.random() * 10, ox: (Math.random() - 0.5) * width, oz: (Math.random() - 0.5) * width * 0.6 });
  }
  const EMB = 30;
  const embP = new Float32Array(EMB * 3), embV = new Float32Array(EMB * 3), embT = new Float32Array(EMB);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(embP, 3));
  const [ec, ex] = canvas(16, 16);
  const eg = ex.createRadialGradient(8, 8, 0, 8, 8, 8);
  eg.addColorStop(0, 'rgba(255,255,255,1)');
  eg.addColorStop(1, 'rgba(255,255,255,0)');
  ex.fillStyle = eg;
  ex.fillRect(0, 0, 16, 16);
  const embers = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffa040, size: 0.035 * size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: tex(ec, true, false) }));
  embers.frustumCulled = false;
  k.g.add(embers);
  let light: THREE.PointLight | null = null;
  const base = opts.light ?? 30;
  k.light({ p: at.clone().setY(at.y + 0.5 * size), color: 0xff7a2a, intensity: base, distance: 10, decay: 1.6, priority: opts.priority ?? 10, use: (l) => (light = l) });
  let time = 0;
  return (dt: number) => {
    time += dt;
    for (const [i, f] of flames.entries()) {
      const t = time * (3 + i * 0.4) + f.ph;
      const h = (0.55 + Math.sin(t) * 0.18 + Math.sin(t * 2.3) * 0.08) * size;
      f.s.scale.set((0.35 + Math.sin(t * 1.7) * 0.06) * size, h, 1);
      f.s.position.set(at.x + f.ox + Math.sin(t * 0.9) * 0.05, at.y + h * 0.42, at.z + f.oz + Math.cos(t * 1.1) * 0.05);
      (f.s.material as THREE.SpriteMaterial).opacity = 0.75 + Math.sin(t * 3.1) * 0.2;
    }
    for (let i = 0; i < EMB; i++) {
      embT[i] -= dt;
      if (embT[i] <= 0) {
        embT[i] = 1 + Math.random() * 1.5;
        embP.set([at.x + (Math.random() - 0.5) * width, at.y + 0.05, at.z + (Math.random() - 0.5) * width * 0.6], i * 3);
        embV.set([(Math.random() - 0.5) * 0.4, (1.0 + Math.random() * 1.2) * size, (Math.random() - 0.5) * 0.4], i * 3);
      }
      embP[i * 3] += (embV[i * 3] + Math.sin(time * 3 + i) * 0.3) * dt;
      embP[i * 3 + 1] += embV[i * 3 + 1] * dt;
      embP[i * 3 + 2] += embV[i * 3 + 2] * dt;
    }
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    const l = light as THREE.PointLight | null;
    if (l) l.intensity = base * (0.8 + Math.sin(time * 11) * 0.08 + Math.sin(time * 23.7) * 0.07 + Math.sin(time * 5.3) * 0.08);
  };
}

