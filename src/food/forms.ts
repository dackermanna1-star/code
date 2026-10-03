// Builds the 3D object for any FoodState: whole items, generic cut forms (halves, slices,
// wedges, coins, dice, sticks, strips, mince, shreds, mash, flat...) and assemblies
// (stacks like burgers & sandwiches, topped bases like pizza, piles).
//
// Everything is built in *model space* (metres, unscaled). FoodVisual scales and binds it.
// Assemblies tag sub-objects with userData.segmentState so each part keeps its own cooking look.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FoodState, Form, CutStyle } from './types';
import { getDef, hasDef } from './catalog';
import type { ModelDef } from '../models/types';
import { getModel } from '../models/registry';
import {
  type Rng,
  rng,
  foodMat,
  canvasTexture,
  latheGeometry,
  smoothProfile,
  profileRadiusAt,
  roundedBox,
  blobGeometry,
  leafGeometry,
  sweepGeometry,
  noisify,
  type Profile,
  fbm3,
} from '../models/kit';

export type LayoutMode = 'display' | 'layer' | 'scatter' | 'pile';
export interface FormOpts {
  /** display: natural presentation on a board/plate; layer: packed flat disc for stacking;
   *  scatter: spread thinly over a base (toppings); pile: compact heap. */
  layout?: LayoutMode;
  /** Target radius for layer / scatter / pile layouts (model space). */
  radius?: number;
}

// ---------------------------------------------------------------------------------------------
// Entry points

/** Build the unscaled, unbound object for a state. */
export function buildFoodObject(state: FoodState, opts: FormOpts = {}): THREE.Object3D {
  if (state.id === 'assembly') return buildAssembly(state, opts);
  const model = getModel(state.id);
  const r = rng(state.seed);
  const v = model.variant?.(state, r);
  if (v) return v;
  if (state.form === 'whole') return buildWhole(state, model, r);
  const custom = model.forms?.[state.form];
  if (custom) {
    const o = custom(r, state);
    return opts.layout && opts.layout !== 'display' ? relayout(o, opts) : o;
  }
  return buildForm(state, model, r, opts);
}

function buildWhole(state: FoodState, model: ModelDef, r: Rng): THREE.Object3D {
  if (state.peeled && hasDef(state.id) && getDef(state.id).peelable) {
    if (model.peeled) return model.peeled(r);
    const o = model.build(r);
    const pm = peeledMat(state.id);
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh && m.userData.part === 'skin') m.material = pm;
    });
    return o;
  }
  return model.build(r);
}

// ---------------------------------------------------------------------------------------------
// Materials

const matCache = new Map<string, THREE.Material>();
function cached(key: string, make: () => THREE.Material): THREE.Material {
  let m = matCache.get(key);
  if (!m) matCache.set(key, (m = make()));
  return m;
}

function colorsOf(id: string) {
  return hasDef(id)
    ? getDef(id).colors
    : { skin: '#cccccc', flesh: '#eeeeee', cooked: '#a86a2c', peeled: undefined as string | undefined, juice: undefined as string | undefined };
}

export function peeledMat(id: string): THREE.Material {
  return cached('peeled:' + id, () => {
    const c = colorsOf(id);
    return foodMat({ color: c.peeled ?? c.flesh, flesh: c.flesh, cookColor: c.cooked, roughness: 0.45 });
  });
}

function skinMat(state: FoodState, model: ModelDef): THREE.Material {
  if (state.peeled) return peeledMat(state.id);
  if (model.skin) return model.skin();
  return cached('skin:' + state.id, () => {
    const c = colorsOf(state.id);
    return foodMat({ color: c.skin, flesh: c.flesh, cookColor: c.cooked, roughness: 0.5 });
  });
}

function fleshMat(state: FoodState, model: ModelDef): THREE.Material {
  if (model.flesh) return model.flesh();
  return cached('flesh:' + state.id, () => {
    const c = colorsOf(state.id);
    return foodMat({ color: c.flesh, flesh: c.flesh, cookColor: c.cooked, roughness: 0.55 });
  });
}

function juicy(id: string): boolean {
  return hasDef(id) && ['juicy', 'liquid', 'creamy'].includes(getDef(id).texture);
}

/** Disc cross-section material (slices / coins). */
function sectionMat(state: FoodState, model: ModelDef): THREE.Material {
  const peeled = !!state.peeled;
  return cached(`sec:${state.id}:${peeled}`, () => {
    const c = colorsOf(state.id);
    const tex = canvasTexture(
      256,
      256,
      (ctx, w) => {
        if (model.section) model.section(ctx, w, { peeled });
        else defaultSection(ctx, w, c.flesh, peeled ? c.peeled ?? c.flesh : c.skin);
      },
      { key: `sectex:${state.id}:${peeled}` },
    );
    return foodMat({ color: '#ffffff', map: tex, flesh: c.flesh, cookColor: c.cooked, roughness: juicy(state.id) ? 0.32 : 0.6 });
  });
}

/** Lengthwise / wedge-side face material. Canvas aspect follows the face. */
function sectionVMat(state: FoodState, model: ModelDef, aspect: number): THREE.Material {
  const peeled = !!state.peeled;
  const h = Math.round(Math.max(64, Math.min(512, 256 * aspect)));
  return cached(`secv:${state.id}:${peeled}:${h}`, () => {
    const c = colorsOf(state.id);
    const tex = canvasTexture(
      256,
      h,
      (ctx, w, hh) => {
        if (model.sectionV) model.sectionV(ctx, w, hh, { peeled });
        else defaultSectionV(ctx, w, hh, c.flesh, peeled ? c.peeled ?? c.flesh : c.skin);
      },
      { key: `secvtex:${state.id}:${peeled}:${h}` },
    );
    return foodMat({ color: '#ffffff', map: tex, flesh: c.flesh, cookColor: c.cooked, roughness: juicy(state.id) ? 0.32 : 0.6 });
  });
}

/** Square face material for bread / block / slab slices (maps onto the slice bounds). */
function faceMat(state: FoodState, model: ModelDef): THREE.Material {
  const peeled = !!state.peeled;
  return cached(`face:${state.id}:${peeled}`, () => {
    const c = colorsOf(state.id);
    const tex = canvasTexture(
      256,
      256,
      (ctx, w) => {
        if (model.section) model.section(ctx, w, { peeled });
        else {
          ctx.fillStyle = c.flesh;
          ctx.fillRect(0, 0, w, w);
        }
      },
      { key: `facetex:${state.id}:${peeled}` },
    );
    return foodMat({ color: '#ffffff', map: tex, flesh: c.flesh, cookColor: c.cooked, roughness: juicy(state.id) ? 0.35 : 0.65 });
  });
}

function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l * f)));
  return '#' + c.getHexString();
}

function defaultSection(ctx: CanvasRenderingContext2D, s: number, flesh: string, skin: string) {
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.47);
  g.addColorStop(0, shade(flesh, 1.08));
  g.addColorStop(0.75, flesh);
  g.addColorStop(1, shade(flesh, 0.92));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.47, 0, Math.PI * 2);
  ctx.fill();
}

function defaultSectionV(ctx: CanvasRenderingContext2D, w: number, h: number, flesh: string, skin: string) {
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.5);
  g.addColorStop(0, shade(flesh, 1.07));
  g.addColorStop(0.8, flesh);
  g.addColorStop(1, shade(flesh, 0.93));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w * 0.48, h * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------------------------------------
// Profiles

interface BodyInfo {
  /** [r, y] profile in an upright frame (y up), starting at y = 0. */
  profile: Profile;
  /** True when the item's natural axis is X (long items). */
  long: boolean;
  height: number; // along the axis
  maxR: number;
  ring: boolean; // donut-like profile not touching the axis
}

const wholeBoxCache = new Map<string, THREE.Box3>();
function wholeBox(state: FoodState, model: ModelDef): THREE.Box3 {
  let b = wholeBoxCache.get(state.id);
  if (!b) {
    const o = model.build(rng(1));
    o.updateMatrixWorld(true);
    b = new THREE.Box3().setFromObject(o);
    if (b.isEmpty()) b.set(new THREE.Vector3(-0.04, 0, -0.04), new THREE.Vector3(0.04, 0.08, 0.04));
    wholeBoxCache.set(state.id, b);
  }
  return b;
}

function isLongStyle(cut: CutStyle) {
  return cut === 'long' || cut === 'potato' || cut === 'bread';
}

function bodyInfo(state: FoodState, model: ModelDef): BodyInfo {
  const cut = hasDef(state.id) ? getDef(state.id).cut : 'round';
  const long = isLongStyle(cut);
  let profile = model.profile;
  if (!profile || profile.length < 2) {
    // ellipsoid fallback from the whole model's bounds
    const b = wholeBox(state, model);
    const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
    const H = long ? sx : sy;
    const R = long ? Math.max(sy, sz) / 2 : Math.max(sx, sz) / 2;
    const pts: Profile = [];
    const flatDisc = cut === 'disc';
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      if (flatDisc) {
        // puck: rounded edge
        const y = t * H;
        const edge = Math.min(1, Math.sin(Math.PI * t) * 2.2);
        pts.push([Math.max(0.0001, R * (0.82 + 0.18 * edge)), y]);
      } else {
        const a = -Math.PI / 2 + Math.PI * t;
        pts.push([Math.max(0.0001, Math.cos(a) * R), (Math.sin(a) * 0.5 + 0.5) * H]);
      }
    }
    if (flatDisc) {
      pts.unshift([0.0001, 0]);
      pts.push([0.0001, H]);
    }
    profile = pts;
  }
  const y0 = profile[0][1];
  const prof: Profile = profile.map(([r, y]) => [Math.max(0.0001, r), y - y0]);
  const height = prof[prof.length - 1][1] - prof[0][1];
  const maxR = Math.max(...prof.map((p) => p[0]));
  const ring = prof[0][0] > maxR * 0.2 && prof[prof.length - 1][0] > maxR * 0.2;
  return { profile: prof, long, height: Math.max(height, ...prof.map((p) => p[1])), maxR, ring };
}

/** Shape (x = r, y) of a profile: full mirrored silhouette, or one half (axis to rim). */
function profileShapes(info: BodyInfo, mirrored: boolean): THREE.Shape[] {
  const p = info.profile;
  if (info.ring) {
    const loop = (sign: number) => {
      const s = new THREE.Shape();
      s.moveTo(sign * p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) s.lineTo(sign * p[i][0], p[i][1]);
      s.closePath();
      return s;
    };
    return mirrored ? [loop(1), loop(-1)] : [loop(1)];
  }
  const s = new THREE.Shape();
  if (mirrored) {
    s.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) s.lineTo(p[i][0], p[i][1]);
    for (let i = p.length - 1; i >= 0; i--) s.lineTo(-p[i][0], p[i][1]);
  } else {
    s.moveTo(0, p[0][1]);
    for (const [r, y] of p) s.lineTo(r, y);
    s.lineTo(0, p[p.length - 1][1]);
  }
  s.closePath();
  return [s];
}

/** A partial lathe gets u = 0..1 over its own arc; squeeze it to the arc's share of the full texture. */
function remapLatheU(g: THREE.BufferGeometry, start: number, span: number): THREE.BufferGeometry {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, start + uv.getX(i) * span);
  uv.needsUpdate = true;
  return g;
}

/** ShapeGeometry with UVs mapped to the profile frame: u = (x + R) / 2R, v = y / H. */
function faceGeometry(shapes: THREE.Shape[], info: BodyInfo): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(shapes, 6);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + info.maxR) / (2 * info.maxR), pos.getY(i) / info.height);
  }
  uv.needsUpdate = true;
  return g;
}

// ---------------------------------------------------------------------------------------------
// Generic forms

export function buildForm(state: FoodState, model: ModelDef, r: Rng, opts: FormOpts = {}): THREE.Object3D {
  const cut: CutStyle = hasDef(state.id) ? getDef(state.id).cut : 'round';
  const form = state.form;
  let out: THREE.Object3D;
  switch (form) {
    case 'halved':
      out = cut === 'disc' ? wedges(state, model, r, 2, opts) : halves(state, model, r, opts);
      break;
    case 'sliced':
      if (cut === 'disc') out = wedges(state, model, r, 6, opts);
      else if (cut === 'bread' || cut === 'block') out = slabSlices(state, model, r, opts);
      else if (cut === 'slab') out = strips(state, model, r, opts);
      else if (cut === 'leafy') out = leaves(state, model, r, opts);
      else if (cut === 'bunch') out = pieces(state, model, r, opts);
      else out = discSlices(state, model, r, opts);
      break;
    case 'sticks':
      out = sticks(state, model, r, opts);
      break;
    case 'strips':
      out = strips(state, model, r, opts);
      break;
    case 'diced':
      out = dice(state, model, r, opts);
      break;
    case 'minced':
      out = mince(state, model, r, opts, 'minced');
      break;
    case 'grated':
      out = shreds(state, model, r, opts, true);
      break;
    case 'shredded':
      out = shreds(state, model, r, opts, false);
      break;
    case 'leaves':
      out = leaves(state, model, r, opts);
      break;
    case 'pieces':
      out = cut === 'dough' ? doughBalls(state, model, r, opts) : pieces(state, model, r, opts);
      break;
    case 'mashed':
      out = mashMound(state, model, r);
      break;
    case 'flat':
      out = flat(state, model, r);
      break;
    case 'cracked':
      out = crackedEgg(state, r);
      break;
    case 'popped': {
      out = model.build(r);
      out.scale.multiplyScalar(1.35);
      break;
    }
    default:
      out = model.build(r);
  }
  return out;
}

/** Two lathe halves, cut faces showing. */
function halves(state: FoodState, model: ModelDef, r: Rng, opts: FormOpts): THREE.Object3D {
  const info = bodyInfo(state, model);
  const skin = skinMat(state, model);
  const face = sectionVMat(state, model, info.height / (2 * info.maxR));
  const g = new THREE.Group();
  const shapes = profileShapes(info, true);
  for (let k = 0; k < 2; k++) {
    // Built upright (axis = Y). Half k=0 occupies x >= 0 with its cut face at x = 0 facing -X;
    // k=1 is the mirror image.
    const half = new THREE.Group();
    const body = new THREE.Mesh(remapLatheU(latheGeometry(info.profile, 36, k * Math.PI, Math.PI), k * 0.5, 0.5), skin);
    const fg = faceGeometry(shapes, info);
    fg.rotateY(k === 0 ? -Math.PI / 2 : Math.PI / 2);
    half.add(body, new THREE.Mesh(fg, face));
    // Lay it down cut face up: rotating about Z turns the face normal to +Y and the axis to +-X.
    half.rotation.z = k === 0 ? -Math.PI / 2 : Math.PI / 2;
    half.position.set(k === 0 ? -info.height / 2 : info.height / 2, info.maxR, 0);
    const holder = new THREE.Group();
    holder.add(half);
    holder.position.z = (k === 0 ? -1 : 1) * info.maxR * 1.1;
    holder.rotation.y = (k === 0 ? 0.25 : -0.35) + r.range(-0.15, 0.15);
    g.add(holder);
  }
  return finish(g, opts, info.maxR * 2.2);
}

/** Round slices (round style, horizontal) or coins (long style, along X). */
function discSlices(state: FoodState, model: ModelDef, r: Rng, opts: FormOpts): THREE.Object3D {
  const info = bodyInfo(state, model);
  const skin = skinMat(state, model);
  const sec = sectionMat(state, model);
  const H = info.height;
  const long = info.long;
  const thickness = THREE.MathUtils.clamp(long ? H * 0.045 : H * 0.12, 0.004, 0.012);
  // choose slice positions where the radius is reasonable
  const n = THREE.MathUtils.clamp(Math.round((H * (long ? 0.85 : 0.8)) / (thickness * (long ? 1.6 : 1.25))), 4, long ? 9 : 7);
  const slices: THREE.Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const t = 0.12 + (0.76 * (i + 0.5)) / n;
    const rad = Math.max(info.maxR * 0.3, profileRadiusAt(info.profile, t * H)) * (info.ring ? 1 : 1);
    const geo = new THREE.CylinderGeometry(rad, rad, thickness, 36, 1);
    const m = new THREE.Mesh(geo, [skin, sec, sec]);
    slices.push(m);
  }
  const g = new THREE.Group();
  const mode = opts.layout ?? 'display';
  if (mode === 'display') {
    // shingled row, gently fanned
    let x = 0;
    const tilt = 0.32;
    slices.forEach((m, i) => {
      const rad = (m.geometry as THREE.CylinderGeometry).parameters.radiusTop;
      m.rotation.z = tilt;
      m.rotation.y = r.range(-0.08, 0.08);
      m.position.set(x, rad * Math.sin(tilt) + thickness * 0.6, r.range(-0.004, 0.004));
      x += rad * 0.62;
      m.renderOrder = i;
      g.add(m);
    });
    centerXZ(g);
  } else {
    packFlat(slices, g, r, opts.radius ?? info.maxR * 1.5, thickness, mode);
  }
  return mergeGroup(g);
}

/** Wedges of a disc-style item (pizza / cake / pancake slices); n = 2 makes halves. */
function wedges(state: FoodState, model: ModelDef, r: Rng, n: number, opts: FormOpts): THREE.Object3D {
  const info = bodyInfo(state, model);
  const skin = skinMat(state, model);
  const face = sectionVMat(state, model, info.height / (2 * info.maxR));
  const shapes = profileShapes(info, false);
  const g = new THREE.Group();
  const d = (Math.PI * 2) / n;
  const gap = Math.max(0.004, info.maxR * 0.05);
  for (let k = 0; k < n; k++) {
    const phi0 = k * d;
    const w = new THREE.Group();
    w.add(new THREE.Mesh(remapLatheU(latheGeometry(info.profile, Math.max(6, Math.round(48 / n) + 2), phi0, d), phi0 / (Math.PI * 2), d / (Math.PI * 2)), skin));
    // side faces (skip for rings? rings still have faces)
    const f0 = faceGeometry(shapes, info);
    f0.rotateY(phi0 - Math.PI / 2);
    const f1 = faceGeometry(shapes, info);
    f1.scale(1, 1, -1);
    f1.rotateY(phi0 + d - Math.PI / 2);
    w.add(new THREE.Mesh(f0, face), new THREE.Mesh(f1, face));
    const mid = phi0 + d / 2;
    const spread = opts.layout === 'scatter' || opts.layout === 'pile' ? gap * 3 : gap;
    w.position.set(Math.sin(mid) * spread, 0, Math.cos(mid) * spread);
    g.add(w);
  }
  return finish(g, opts, info.maxR * 2);
}

/** Extruded slices for loaves & blocks (bread slices, cheese slices, ham, tofu). */
function slabSlices(state: FoodState, model: ModelDef, r: Rng, opts: FormOpts): THREE.Object3D {
  const box = wholeBox(state, model);
  const cut = getDef(state.id).cut;
  const size = box.getSize(new THREE.Vector3());
  let shape: THREE.Shape;
  if (model.sliceShape) shape = model.sliceShape();
  else {
    // rounded rectangle (bread: domed top)
    const w = (cut === 'bread' ? Math.max(size.z, 0.06) : Math.max(size.x, size.z)) * 0.92;
    const h = Math.max(0.03, (cut === 'bread' ? size.y : Math.min(size.x, size.z)) * 0.92);
    shape = roundedRectShape(w, h, Math.min(w, h) * 0.18, cut === 'bread' ? h * 0.18 : 0);
  }
  const thickness = cut === 'bread' ? 0.011 : 0.006;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: thickness * 0.18, bevelSize: thickness * 0.18, bevelSegments: 2, curveSegments: 16 });
  remapCapUV(geo);
  // centre the slice: shape x/y centred, extrusion centred on z
  geo.computeBoundingBox();
  const sb = geo.boundingBox!;
  geo.translate(-(sb.min.x + sb.max.x) / 2, -(sb.min.y + sb.max.y) / 2, -(sb.min.z + sb.max.z) / 2);
  // lay flat: shape plane XY -> XZ with the face up (rotation x -90deg maps y -> -z, z -> y)
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  const fb = geo.boundingBox!;
  const sliceDepth = fb.max.z - fb.min.z; // along world z (the shape's height)
  const sliceThick = fb.max.y - fb.min.y;
  const face = faceMat(state, model);
  const side = cut === 'bread' ? skinMat(state, model) : fleshMat(state, model);
  const n = 4;
  const g = new THREE.Group();
  const mode = opts.layout ?? 'display';
  const make = () => {
    const m = new THREE.Mesh(geo, [face, side]);
    m.position.y = sliceThick / 2;
    const holder = new THREE.Group();
    holder.add(m);
    return holder;
  };
  if (mode === 'display') {
    // shingled, like a freshly cut loaf fanned on the board
    for (let i = 0; i < n; i++) {
      const h = make();
      h.position.set(r.range(-0.002, 0.002), i * sliceThick * 0.95, i * sliceDepth * 0.3);
      h.rotation.y = r.range(-0.06, 0.06);
      h.rotation.x = -0.05;
      g.add(h);
    }
    centerXZ(g);
  } else if (mode === 'layer') {
    // bread: one slice; cheese/ham: two crossed slices (corners poking out of a burger)
    const count = cut === 'bread' ? 1 : 2;
    for (let i = 0; i < count; i++) {
      const h = make();
      h.rotation.y = i * (Math.PI / 4) + r.range(-0.1, 0.1);
      h.position.y = i * sliceThick * 0.9;
      g.add(h);
    }
  } else {
    const R = opts.radius ?? 0.06;
    for (let i = 0; i < n; i++) {
      const h = make();
      const [dx, dz] = r.disc();
      h.position.set(dx * R * 0.55, i * 0.0012, dz * R * 0.55);
      h.rotation.y = r.range(0, Math.PI * 2);
      h.scale.setScalar(0.55);
      g.add(h);
    }
  }
  return mergeGroup(g);
}

function roundedRectShape(w: number, h: number, rad: number, dome: number): THREE.Shape {
  const s = new THREE.Shape();
  const x0 = -w / 2, x1 = w / 2, y0 = 0, y1 = h;
  s.moveTo(x0 + rad, y0);
  s.lineTo(x1 - rad, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + rad);
  s.lineTo(x1, y1 - rad - dome);
  if (dome > 0) s.bezierCurveTo(x1, y1 + dome * 0.6, x0, y1 + dome * 0.6, x0, y1 - rad - dome);
  else {
    s.quadraticCurveTo(x1, y1, x1 - rad, y1);
    s.lineTo(x0 + rad, y1);
    s.quadraticCurveTo(x0, y1, x0, y1 - rad);
  }
  s.lineTo(x0, y0 + rad);
  s.quadraticCurveTo(x0, y0, x0 + rad, y0);
  return s;
}

/** ExtrudeGeometry caps get raw shape coordinates as UVs; remap them to 0..1 over the bounds. */
function remapCapUV(geo: THREE.ExtrudeGeometry) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const box = new THREE.Box3().setFromBufferAttribute(pos);
  const group0 = geo.groups.find((g) => g.materialIndex === 0);
  const idx = geo.index;
  const touched = new Set<number>();
  if (group0) {
    for (let i = group0.start; i < group0.start + group0.count; i++) {
      const v = idx ? idx.getX(i) : i;
      if (touched.has(v)) continue;
      touched.add(v);
      uv.setXY(v, (pos.getX(v) - box.min.x) / (box.max.x - box.min.x), (pos.getY(v) - box.min.y) / (box.max.y - box.min.y));
    }
  }
  uv.needsUpdate = true;
}

/** Fries-style batons. */
function sticks(state: FoodState, model: ModelDef, r: Rng, opts: FormOpts): THREE.Object3D {
  const info = bodyInfo(state, model);
  const flesh = fleshMat(state, model);
  const skin = skinMat(state, model);
  const len = THREE.MathUtils.clamp(info.height * 0.75, 0.04, 0.11);
  const th = THREE.MathUtils.clamp(info.maxR * 0.22, 0.008, 0.014);
  const n = 14;
  const base = roundedBox(len, th, th, th * 0.3, 2);
  const g = new THREE.Group();
  const R = opts.radius ?? info.maxR * 1.3;
  for (let i = 0; i < n; i++) {
    const L = len * r.range(0.7, 1.05);
    const m = new THREE.Mesh(base, flesh);
    m.scale.set(L / len, 1, 1);
    const layer = i < 9 ? 0 : 1;
    const ang = r.range(-0.6, 0.6) + (i % 2 ? Math.PI / 2 : 0) * (opts.layout === 'pile' ? 1 : 0.3);
    m.rotation.y = ang;
    m.rotation.z = layer ? r.range(-0.2, 0.2) : 0;
    const [dx, dz] = r.disc();
    m.position.set(dx * R * 0.55, th / 2 + layer * th * 0.9, dz * R * 0.55);
    g.add(m);
    if (!state.peeled && i % 3 === 0) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(L * 0.9, th * 0.08, th * 0.8), skin);
      strip.position.copy(m.position).add(new THREE.Vector3(0, th * 0.5, 0));
      strip.rotation.copy(m.rotation);
      g.add(strip);
    }
  }
  return mergeGroup(g);
}

/** Long strips (meat, peppers). */
function strips(state: FoodState, model: ModelDef, r: Rng, opts: FormOpts): THREE.Object3D {
  const box = wholeBox(state, model);
  const size = box.getSize(new THREE.Vector3());
  const flesh = model.section ? faceMat(state, model) : fleshMat(state, model);
  const skin = skinMat(state, model);
  const len = THREE.MathUtils.clamp(Math.max(size.x, size.z) * 0.8, 0.05, 0.14);
  const w = THREE.MathUtils.clamp(Math.min(size.x, size.z) * 0.18, 0.012, 0.022);
  const th = THREE.MathUtils.clamp(size.y * 0.5, 0.007, 0.016);
  const n = 7;
  const g = new THREE.Group();
  const geo = roundedBox(len, th, w, Math.min(th, w) * 0.35, 2);
  const mode = opts.layout ?? 'display';
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, i % 2 === 0 ? flesh : skin);
    const L = r.range(0.75, 1.05);
    m.scale.set(L, 1, 1);
    if (mode === 'display') {
      m.position.set(r.range(-0.004, 0.004), th / 2, (i - (n - 1) / 2) * w * 1.15);
      m.rotation.y = (i - (n - 1) / 2) * 0.05 + r.range(-0.04, 0.04);
    } else {
      const [dx, dz] = r.disc();
      const R = opts.radius ?? len * 0.5;
      m.scale.multiplyScalar(mode === 'layer' ? 0.75 : 0.6);
      m.position.set(dx * R * 0.5, th / 2 + (i % 2) * th * 0.4, dz * R * 0.5);
      m.rotation.y = r.range(0, Math.PI * 2);
    }
    g.add(m);
  }
  return mergeGroup(g);
}

/** Cubes / chunks with a few skin bits. */
function dice(state: FoodState, model: ModelDef, r: Rng, opts: FormOpts): THREE.Object3D {
  const box = wholeBox(state, model);
  const size = box.getSize(new THREE.Vector3());
  const cut = getDef(state.id).cut;
  const maxDim = Math.max(size.x, size.y, size.z);
  const s = THREE.MathUtils.clamp(maxDim * 0.16, 0.007, 0.018);
  const vol = size.x * size.y * size.z * 0.5;
  const n = THREE.MathUtils.clamp(Math.round(vol / (s * s * s) * 0.35), 9, 22);
  const flesh = cut === 'leafy' ? skinMat(state, model) : fleshMat(state, model);
  const skin = skinMat(state, model);
  const geo = roundedBox(s, s, s, s * 0.22, 1);
  const chip = new THREE.BoxGeometry(s * 0.92, s * 0.12, s * 0.92);
  const g = new THREE.Group();
  const R = opts.radius ?? Math.max(0.03, maxDim * 0.42);
  const pts = scatterPoints(r, n, R * (opts.layout === 'scatter' ? 0.9 : 0.62), s * 0.8);
  pts.forEach(([x, z], i) => {
    const holder = new THREE.Group();
    const m = new THREE.Mesh(geo, flesh);
    const k = r.range(0.8, 1.15);
    m.scale.set(k * r.range(0.9, 1.1), k * r.range(0.85, 1.05), k);
    holder.add(m);
    if (i % 3 === 0 && !state.peeled && cut !== 'block') {
      const c = new THREE.Mesh(chip, skin);
      c.position.y = (s * k) / 2;
      holder.add(c);
    }
    const layer = opts.layout === 'scatter' ? 0 : i > n * 0.7 ? 1 : 0;
    holder.position.set(x, (s * k) / 2 + layer * s * 0.8, z);
    holder.rotation.set(r.range(-0.25, 0.25), r.range(0, Math.PI), r.range(-0.25, 0.25));
    g.add(holder);
  });
  return mergeGroup(g);
}

/** Tiny bits (ground meat, chopped herbs, minced garlic). */
function mince(state: FoodState, model: ModelDef, r: Rng, opts: FormOpts, _kind: string): THREE.Object3D {
  const box = wholeBox(state, model);
  const size = box.getSize(new THREE.Vector3());
  const cut = getDef(state.id).cut;
  const mat = cut === 'leafy' || state.id === 'basil' ? skinMat(state, model) : fleshMat(state, model);
  const s = THREE.MathUtils.clamp(Math.max(size.x, size.z) * 0.06, 0.004, 0.008);
  const n = 34;
  const base = new THREE.IcosahedronGeometry(s, 0);
  const g = new THREE.Group();
  const R = opts.radius ?? Math.max(0.025, Math.max(size.x, size.z) * 0.38);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(base, mat);
    const [dx, dz] = r.disc();
    const d = Math.sqrt(dx * dx + dz * dz);
    const heap = opts.layout === 'scatter' ? 0 : (1 - d) * R * 0.35;
    m.position.set(dx * R * (opts.layout === 'scatter' ? 0.9 : 0.7), s * 0.7 + heap * r.next(), dz * R * (opts.layout === 'scatter' ? 0.9 : 0.7));
    m.scale.set(r.range(0.7, 1.4), r.range(0.6, 1.1), r.range(0.7, 1.4));
    m.rotation.set(r.range(0, 3), r.range(0, 3), r.range(0, 3));
    g.add(m);
  }
  return mergeGroup(g);
}

/** Curly shreds (lettuce, cabbage, carrot) or short gratings (cheese). */
function shreds(state: FoodState, model: ModelDef, r: Rng, opts: FormOpts, grated: boolean): THREE.Object3D {
  const cut = getDef(state.id).cut;
  const mat = cut === 'leafy' ? skinMat(state, model) : fleshMat(state, model);
  const box = wholeBox(state, model);
  const size = box.getSize(new THREE.Vector3());
  const R = opts.radius ?? Math.max(0.03, Math.max(size.x, size.z) * 0.42);
  const n = grated ? 30 : 26;
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const len = grated ? r.range(0.012, 0.022) : r.range(0.03, 0.06);
    const pts: THREE.Vector3[] = [];
    const ax = r.range(0, Math.PI * 2);
    for (let k = 0; k < 5; k++) {
      const t = k / 4;
      pts.push(new THREE.Vector3(Math.cos(ax) * len * (t - 0.5), Math.sin(t * Math.PI * 2 + i) * 0.003, Math.sin(ax) * len * (t - 0.5) + Math.cos(t * 5 + i) * 0.004));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = sweepGeometry(curve, { radius: grated ? 0.0016 : 0.0022, radialSegments: 5, tubularSegments: grated ? 4 : 8, caps: 'flat', squash: grated ? [1, 1] : [2.2, 0.35] });
    const m = new THREE.Mesh(geo, mat);
    const [dx, dz] = r.disc();
    const d = Math.sqrt(dx * dx + dz * dz);
    const heap = opts.layout === 'scatter' ? 0 : (1 - d) * R * 0.3;
    m.position.set(dx * R * 0.75, 0.003 + heap * r.next(), dz * R * 0.75);
    m.rotation.y = r.range(0, Math.PI * 2);
    g.add(m);
  }
  return mergeGroup(g);
}

/** Separate leaves (lettuce, cabbage, basil). */
function leaves(state: FoodState, model: ModelDef, r: Rng, opts: FormOpts): THREE.Object3D {
  const mat = skinMat(state, model);
  const box = wholeBox(state, model);
  const size = box.getSize(new THREE.Vector3());
  const L = Math.max(0.04, Math.max(size.x, size.z) * 0.55);
  const n = state.id === 'basil' ? 6 : 5;
  const g = new THREE.Group();
  const mode = opts.layout ?? 'display';
  const R = opts.radius ?? L * 0.6;
  for (let i = 0; i < n; i++) {
    let leaf: THREE.Object3D;
    if (model.piece) leaf = model.piece(r, i);
    else leaf = new THREE.Mesh(leafGeometry({ length: L, width: L * 0.75, curl: 0.25, ruffle: 0.004, seed: i }), mat);
    const holder = new THREE.Group();
    holder.add(leaf);
    const a = (i / n) * Math.PI * 2 + r.range(-0.2, 0.2);
    if (mode === 'layer') {
      // a ring of leaves pointing outwards, overlapping (burger lettuce)
      leaf.position.z = -R * 0.15;
      holder.rotation.y = a;
      holder.position.y = 0.002 + (i % 2) * 0.002;
      const k = (R * 1.1) / L;
      holder.scale.set(k, 1, k);
    } else {
      holder.rotation.y = a;
      holder.position.set(Math.sin(a) * R * 0.15, 0.003 + i * 0.002, Math.cos(a) * R * 0.15);
    }
    g.add(holder);
  }
  return mergeGroup(g);
}

/** Natural sub-pieces of bunch items (grapes, florets, shrimp...). */
function pieces(state: FoodState, model: ModelDef, r: Rng, opts: FormOpts): THREE.Object3D {
  const box = wholeBox(state, model);
  const size = box.getSize(new THREE.Vector3());
  const counts: Record<string, number> = { grapes: 9, broccoli: 5, peas: 10, shrimp: 3, crab: 4, nuts: 8, beans: 10, marshmallow: 4, gummy: 6, cherry: 3, blueberry: 10 };
  const n = counts[state.id] ?? 5;
  const g = new THREE.Group();
  const R = opts.radius ?? Math.max(0.03, Math.max(size.x, size.z) * 0.45);
  const items: THREE.Object3D[] = [];
  for (let i = 0; i < n; i++) {
    const p = model.piece ? model.piece(r, i) : new THREE.Mesh(blobGeometry(Math.max(0.006, Math.max(size.x, size.z) * 0.12), { seed: i, detail: 2 }), skinMat(state, model));
    items.push(p);
  }
  const radii = items.map((o) => {
    const b = new THREE.Box3().setFromObject(o);
    return Math.max(0.004, (Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2) * 0.9);
  });
  const placed: [number, number, number][] = [];
  items.forEach((o, i) => {
    const holder = new THREE.Group();
    holder.add(o);
    let best: [number, number] = [0, 0];
    for (let tries = 0; tries < 30; tries++) {
      const [dx, dz] = r.disc();
      const x = dx * R * 0.75, z = dz * R * 0.75;
      if (placed.every(([px, pz, pr]) => Math.hypot(px - x, pz - z) > (pr + radii[i]) * 0.85)) {
        best = [x, z];
        break;
      }
      best = [x, z];
    }
    placed.push([best[0], best[1], radii[i]]);
    holder.position.set(best[0], 0, best[1]);
    holder.rotation.y = r.range(0, Math.PI * 2);
    g.add(holder);
  });
  return mergeGroup(g);
}

function doughBalls(state: FoodState, model: ModelDef, r: Rng, opts: FormOpts): THREE.Object3D {
  const mat = skinMat(state, model);
  const n = 5;
  const g = new THREE.Group();
  const R = opts.radius ?? 0.05;
  const pts = scatterPoints(r, n, R * 0.8, 0.026);
  pts.forEach(([x, z], i) => {
    const rad = 0.016 * r.range(0.9, 1.1);
    const m = new THREE.Mesh(blobGeometry(rad, { seed: i + state.seed, detail: 3, amp: rad * 0.08, scale: [1, 0.82, 1] }), mat);
    m.position.set(x, rad * 0.8, z);
    g.add(m);
  });
  return mergeGroup(g);
}

/** Soft mound of mash (potato, banana, avocado...). */
function mashMound(state: FoodState, model: ModelDef, r: Rng): THREE.Object3D {
  const c = colorsOf(state.id);
  const color = state.peeled || !c.peeled ? c.flesh : c.flesh;
  const mat = cached('mash:' + state.id, () => foodMat({ color, flesh: color, cookColor: c.cooked, roughness: 0.45 }));
  const R = 0.055;
  const prof: Profile = smoothProfile([
    [0.0001, 0],
    [R * 0.95, 0.002],
    [R, 0.01],
    [R * 0.85, 0.028],
    [R * 0.55, 0.042],
    [R * 0.18, 0.05],
    [0.0001, 0.052],
  ], 18);
  const geo = latheGeometry(prof, 40);
  // swirl ridges
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const rr = Math.hypot(x, z);
    const swirl = Math.sin(a * 3 + rr * 160) * 0.0025 * Math.min(1, y * 60);
    const k = (rr + swirl + fbm3(x * 80, y * 80, z * 80) * 0.002) / Math.max(rr, 1e-5);
    pos.setXYZ(i, x * k, y + Math.sin(a * 5 + rr * 90) * 0.0012, z * k);
  }
  geo.computeVertexNormals();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mat));
  if (!state.peeled && c.peeled && c.peeled !== c.skin) {
    // a few flecks of skin
    const fleck = new THREE.IcosahedronGeometry(0.0022, 0);
    const skin = skinMat(state, model);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(fleck, skin);
      const a = r.range(0, Math.PI * 2), rr = r.range(0.01, R * 0.8);
      m.position.set(Math.cos(a) * rr, profileRadiusAt(prof, 0.02) > rr ? 0.045 - rr * 0.5 : 0.01, Math.sin(a) * rr);
      m.scale.set(1.5, 0.4, 1);
      g.add(m);
    }
  }
  return mergeGroup(g);
}

/** Rolled flat: dough -> pizza base, anything else -> cartoon squash. */
function flat(state: FoodState, model: ModelDef, r: Rng): THREE.Object3D {
  const cut = hasDef(state.id) ? getDef(state.id).cut : 'none';
  if (cut === 'dough' || state.id === 'dough') {
    const c = colorsOf(state.id);
    const mat = skinMat(state, model);
    const R = 0.105;
    const prof: Profile = smoothProfile([
      [0.0001, 0],
      [R * 0.9, 0.0005],
      [R * 1.0, 0.004],
      [R * 0.99, 0.009],
      [R * 0.95, 0.011],
      [R * 0.9, 0.0085],
      [R * 0.6, 0.0065],
      [0.0001, 0.0065],
    ], 28);
    const geo = noisify(latheGeometry(prof, 56), 0.0012, 60, state.seed % 13);
    const m = new THREE.Mesh(geo, mat);
    void c;
    const g = new THREE.Group();
    g.add(m);
    return g;
  }
  const o = model.build(r);
  const wrap = new THREE.Group();
  wrap.add(o);
  o.scale.set(1.45, 0.28, 1.45);
  return wrap;
}

function crackedEgg(state: FoodState, r: Rng): THREE.Object3D {
  const white = cached('egg-white', () => foodMat({ color: '#f4f1e6', flesh: '#fbfbf5', cookColor: '#e8c890', roughness: 0.2, clearcoat: 0.8 }));
  const yolk = cached('egg-yolk', () => foodMat({ color: '#ffb21e', flesh: '#ffc040', cookColor: '#e09a2a', roughness: 0.2, clearcoat: 1 }));
  const g = new THREE.Group();
  const wp: Profile = smoothProfile([[0.0001, 0], [0.05, 0.001], [0.055, 0.004], [0.045, 0.008], [0.02, 0.01], [0.0001, 0.011]], 16);
  const wgeo = noisify(latheGeometry(wp, 40), 0.004, 40, r.range(0, 9));
  g.add(new THREE.Mesh(wgeo, white));
  const yg = new THREE.SphereGeometry(0.018, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const ym = new THREE.Mesh(yg, yolk);
  ym.scale.set(1, 0.75, 1);
  ym.position.set(r.range(-0.006, 0.006), 0.008, r.range(-0.006, 0.006));
  g.add(ym);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Layout helpers

function scatterPoints(r: Rng, n: number, R: number, minDist: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    let best: [number, number] = [0, 0];
    let bestD = -1;
    for (let k = 0; k < 18; k++) {
      const [dx, dz] = r.disc();
      const p: [number, number] = [dx * R, dz * R];
      const d = pts.length ? Math.min(...pts.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1]))) : 1;
      if (d > bestD) {
        bestD = d;
        best = p;
      }
      if (d > minDist) break;
    }
    pts.push(best);
  }
  return pts;
}

/** Lay round pieces flat in a disc (layer), sprinkled (scatter) or heaped (pile). */
function packFlat(pieces: THREE.Mesh[], g: THREE.Group, r: Rng, R: number, thickness: number, mode: LayoutMode) {
  const n = pieces.length;
  if (mode === 'layer') {
    // rosette: one in the middle, the rest around, overlapping
    pieces.forEach((m, i) => {
      if (i === 0) m.position.set(0, thickness / 2, 0);
      else {
        const a = (i / (n - 1)) * Math.PI * 2;
        const rad = (m.geometry as THREE.CylinderGeometry).parameters.radiusTop;
        const d = Math.max(0, R - rad);
        m.position.set(Math.cos(a) * d * 0.9, thickness * 0.5 + thickness * 0.6 * (i % 2), Math.sin(a) * d * 0.9);
        m.rotation.x = Math.sin(a) * 0.08;
        m.rotation.z = -Math.cos(a) * 0.08;
      }
      g.add(m);
    });
  } else {
    const pts = scatterPoints(r, n, R * (mode === 'scatter' ? 0.85 : 0.55), 0.01);
    pieces.forEach((m, i) => {
      m.position.set(pts[i][0], thickness / 2 + (mode === 'pile' ? (i % 3) * thickness : 0), pts[i][1]);
      m.rotation.set(r.range(-0.1, 0.1), r.range(0, 3), r.range(-0.1, 0.1));
      g.add(m);
    });
  }
}

/** Re-arrange a custom-built object for a non-display layout (scale it into the target radius). */
function relayout(o: THREE.Object3D, opts: FormOpts): THREE.Object3D {
  if (!opts.radius) return o;
  const g = new THREE.Group();
  g.add(o);
  g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o);
  const rad = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2;
  if (rad > opts.radius) o.scale.multiplyScalar(opts.radius / rad);
  return g;
}

function finish(g: THREE.Group, opts: FormOpts, natural: number): THREE.Object3D {
  if (opts.layout && opts.layout !== 'display' && opts.radius) {
    const k = Math.min(1, (opts.radius * 2) / natural);
    g.scale.multiplyScalar(k);
  }
  return mergeGroup(g);
}

function centerXZ(g: THREE.Group) {
  g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(g);
  const c = b.getCenter(new THREE.Vector3());
  for (const ch of g.children) {
    ch.position.x -= c.x;
    ch.position.z -= c.z;
  }
}

/**
 * Merge all meshes of a group by material into a few meshes (fewer draw calls).
 * Multi-material meshes (cylinders with groups) are split per group first.
 */
export function mergeGroup(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  // bake everything (including the root's own transform) relative to the root's parent frame
  const inv = root.parent ? new THREE.Matrix4().copy(root.parent.matrixWorld).invert() : new THREE.Matrix4();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const keep: THREE.Object3D[] = [];
  let meshCount = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshCount++;
    if (m.userData.noMerge) {
      keep.push(m);
      return;
    }
    const mat = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    const geo = m.geometry;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const add = (material: THREE.Material, g: THREE.BufferGeometry) => {
      let list = buckets.get(material);
      if (!list) buckets.set(material, (list = []));
      list.push(g);
    };
    if (Array.isArray(m.material) && geo.groups.length) {
      for (const grp of geo.groups) {
        const sub = extractGroup(geo, grp.start, grp.count);
        sub.applyMatrix4(mat);
        add(mats[grp.materialIndex ?? 0], sub);
      }
    } else {
      const g = (geo.index ? geo.toNonIndexed() : geo.clone()) as THREE.BufferGeometry;
      g.applyMatrix4(mat);
      add(mats[0], g);
    }
  });
  const out = new THREE.Group();
  if (meshCount <= 1 && keep.length === 0) {
    // nothing to gain; keep original hierarchy
    out.add(root);
    return out;
  }
  for (const [material, geos] of buckets) {
    const keepColor = geos.every((g) => !!g.attributes.color);
    const norm = geos.map((g) => normalizeAttrs(g, keepColor));
    const merged = mergeGeometries(norm, false);
    if (!merged) continue;
    merged.userData.disposable = true;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  for (const k of keep) {
    k.updateMatrixWorld(true);
    const m = new THREE.Matrix4().multiplyMatrices(inv, k.matrixWorld);
    k.removeFromParent();
    k.matrixAutoUpdate = false;
    k.matrix.copy(m);
    out.add(k);
  }
  return out;
}

function extractGroup(geo: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const a = src.attributes[name] as THREE.BufferAttribute | undefined;
    if (!a) continue;
    const arr = (a.array as Float32Array).slice(start * a.itemSize, (start + count) * a.itemSize);
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  return out;
}

function normalizeAttrs(g: THREE.BufferGeometry, keepColor: boolean): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  const keep = keepColor ? ['position', 'normal', 'uv', 'color'] : ['position', 'normal', 'uv'];
  for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
  g.morphAttributes = {};
  return g;
}

// ---------------------------------------------------------------------------------------------
// Assemblies

function partOpts(layout: LayoutMode, radius: number): FormOpts {
  return { layout, radius };
}

/** Is this part a split bread base (bun halves, bread slices) that wraps a sandwich? */
function isSandwichBase(p: FoodState): boolean {
  if (p.id === 'assembly' || !hasDef(p.id)) return false;
  const d = getDef(p.id);
  return (d.cut === 'bun' && p.form === 'halved') || (d.cut === 'bread' && p.form === 'sliced') || (p.id === 'baguette' && p.form === 'halved');
}

function tagSegment(o: THREE.Object3D, s: FoodState): THREE.Object3D {
  o.userData.segmentState = s;
  return o;
}

function measure(o: THREE.Object3D): THREE.Box3 {
  o.updateMatrixWorld(true);
  const b = new THREE.Box3();
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.computeBoundingBox();
      b.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld));
    }
  });
  if (b.isEmpty()) b.set(new THREE.Vector3(-0.02, 0, -0.02), new THREE.Vector3(0.02, 0.02, 0.02));
  return b;
}

/** Wrap an object so its footprint is centred and its bottom sits on y = 0. */
function grounded(o: THREE.Object3D): { obj: THREE.Group; box: THREE.Box3 } {
  const g = new THREE.Group();
  g.add(o);
  const b = measure(g);
  const c = b.getCenter(new THREE.Vector3());
  o.position.x -= c.x;
  o.position.z -= c.z;
  o.position.y -= b.min.y;
  const box = measure(g);
  return { obj: g, box };
}

/**
 * A bun/bread piece for sandwiches: the bottom or top half of the whole bun (cut with a clip
 * plane, with a crumb-coloured disc as the cut face) or one bread slice.
 * Returns the object (bottom at y = 0) and its visible height.
 */
function sandwichPiece(base: FoodState, which: 'bottom' | 'top'): { obj: THREE.Group; height: number; radius: number } {
  const model = getModel(base.id);
  const d = getDef(base.id);
  const r = rng(base.seed);
  if (d.cut === 'bun') {
    const whole = grounded(model.build(r));
    const h = whole.box.max.y - whole.box.min.y;
    const rad = Math.max(whole.box.max.x - whole.box.min.x, whole.box.max.z - whole.box.min.z) / 2;
    const cutY = h * 0.42;
    const g = new THREE.Group();
    g.add(whole.obj);
    const crumb = new THREE.Mesh(new THREE.CircleGeometry(rad * 0.94, 40), fleshMat(base, model));
    crumb.rotation.x = which === 'bottom' ? -Math.PI / 2 : Math.PI / 2;
    if (which === 'bottom') {
      crumb.position.y = cutY - 0.0005;
      g.add(crumb);
      g.userData.clipPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -cutY)];
      return { obj: g, height: cutY, radius: rad };
    }
    whole.obj.position.y = -cutY;
    crumb.position.y = 0.0005;
    g.add(crumb);
    g.userData.clipPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)];
    return { obj: g, height: h - cutY, radius: rad };
  }
  // bread / croissant / other: one flat slice
  const s: FoodState = { ...base, form: 'sliced' };
  const slice = grounded(d.cut === 'bread' ? slabSlices(s, model, r, { layout: 'layer', radius: 0.06 }) : model.build(r));
  if (d.cut !== 'bread') {
    // squash a non-bread base (e.g. croissant) into a half
    slice.obj.scale.set(1, 0.5, 1);
  }
  const b = measure(slice.obj);
  return { obj: slice.obj, height: b.max.y - b.min.y, radius: Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2 };
}

export function buildAssembly(state: FoodState, opts: FormOpts = {}): THREE.Object3D {
  const parts = state.parts ?? [];
  const layout = state.layout ?? 'pile';
  const root = new THREE.Group();
  if (!parts.length) return root;
  if (layout === 'stack') buildStack(parts, root);
  else if (layout === 'topped') buildTopped(parts, root);
  else buildPile(parts, root, opts.radius ?? 0.12);
  // cut assemblies (sandwich halves / pizza slices): split visually
  if (state.form === 'halved' || state.form === 'sliced') return splitAssembly(root, state.form === 'halved' ? 2 : 4, state.seed);
  return root;
}

function buildStack(parts: FoodState[], root: THREE.Group) {
  let y = 0;
  let radius = 0.06;
  let topBase: FoodState | null = null;
  const list = [...parts];
  if (isSandwichBase(list[0])) {
    topBase = list[0];
    const bottom = sandwichPiece(list[0], 'bottom');
    tagSegment(bottom.obj, list[0]);
    root.add(bottom.obj);
    y = bottom.height * 0.97;
    radius = Math.max(0.04, bottom.radius);
    list.shift();
  }
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const isTop = i === list.length - 1 && !topBase;
    const o = buildFoodObject(p, partOpts(isTop ? 'display' : 'layer', radius));
    const gnd = grounded(o);
    tagSegment(gnd.obj, p);
    // keep layers within the stack footprint
    const w = Math.max(gnd.box.max.x - gnd.box.min.x, gnd.box.max.z - gnd.box.min.z) / 2;
    if (w > radius * 1.35 && p.id !== 'assembly') gnd.obj.scale.multiplyScalar((radius * 1.3) / w);
    gnd.obj.position.y = y;
    gnd.obj.rotation.y = (p.seed % 628) / 100;
    root.add(gnd.obj);
    const h = (gnd.box.max.y - gnd.box.min.y) * gnd.obj.scale.y;
    y += Math.max(0.002, h * 0.85);
    if (i === 0 && !topBase) radius = Math.max(radius, Math.min(w, 0.09));
  }
  if (topBase) {
    const top = sandwichPiece(topBase, 'top');
    tagSegment(top.obj, topBase);
    top.obj.position.y = y - 0.001;
    root.add(top.obj);
  }
}

function buildTopped(parts: FoodState[], root: THREE.Group) {
  const base = grounded(buildFoodObject(parts[0]));
  tagSegment(base.obj, parts[0]);
  root.add(base.obj);
  const R = Math.max(0.03, Math.min(base.box.max.x - base.box.min.x, base.box.max.z - base.box.min.z) / 2);
  const topY = base.box.max.y;
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const o = buildFoodObject(p, partOpts('scatter', R * 0.78));
    const gnd = grounded(o);
    tagSegment(gnd.obj, p);
    const w = Math.max(gnd.box.max.x - gnd.box.min.x, gnd.box.max.z - gnd.box.min.z) / 2;
    if (w > R * 0.85) gnd.obj.scale.multiplyScalar((R * 0.85) / w);
    // whole items on top sit where they are; flat bases: slightly sink in so they read as "on" it
    gnd.obj.position.y = topY - 0.002 + (i - 1) * 0.0015;
    gnd.obj.rotation.y = (p.seed % 628) / 100;
    root.add(gnd.obj);
  }
}

function buildPile(parts: FoodState[], root: THREE.Group, maxR: number) {
  const items = parts.map((p) => {
    const g = grounded(buildFoodObject(p, partOpts('pile', 0.06)));
    tagSegment(g.obj, p);
    const rad = Math.max(0.015, Math.max(g.box.max.x - g.box.min.x, g.box.max.z - g.box.min.z) / 2);
    return { ...g, rad, p };
  });
  // biggest in the middle, others around it
  items.sort((a, b) => b.rad - a.rad);
  const placed: { x: number; z: number; rad: number }[] = [];
  const r = rng(parts.reduce((s, p) => s + p.seed, 0));
  items.forEach((it, i) => {
    let x = 0, z = 0;
    if (i > 0) {
      let best = { x: 0, z: 0, score: Infinity };
      for (let k = 0; k < 40; k++) {
        const a = r.range(0, Math.PI * 2);
        const d = r.range(0, maxR);
        const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
        const overlap = placed.reduce((s, q) => s + Math.max(0, q.rad + it.rad * 0.85 - Math.hypot(q.x - cx, q.z - cz)), 0);
        const score = overlap * 10 + d;
        if (score < best.score) best = { x: cx, z: cz, score };
      }
      x = best.x;
      z = best.z;
    }
    placed.push({ x, z, rad: it.rad });
    it.obj.position.set(x, 0, z);
    it.obj.rotation.y = r.range(0, Math.PI * 2);
    root.add(it.obj);
  });
  // centre the pile
  const b = measure(root);
  const c = b.getCenter(new THREE.Vector3());
  for (const ch of root.children) {
    ch.position.x -= c.x;
    ch.position.z -= c.z;
  }
}

/**
 * Visually cut an assembly into n pieces (sandwich halves, pizza quarters): n clipped copies
 * pulled slightly apart. Clip planes are in each copy's local frame (handled by FoodVisual).
 */
function splitAssembly(root: THREE.Group, n: number, seed: number): THREE.Object3D {
  const out = new THREE.Group();
  const b = measure(root);
  const rad = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2;
  const start = ((seed % 100) / 100) * Math.PI;
  for (let k = 0; k < n; k++) {
    const a0 = start + (k / n) * Math.PI * 2, a1 = start + ((k + 1) / n) * Math.PI * 2;
    const copy = root.clone(true);
    copy.userData.clipPlanes = [
      new THREE.Plane(new THREE.Vector3(Math.sin(a0), 0, -Math.cos(a0)), 0),
      new THREE.Plane(new THREE.Vector3(-Math.sin(a1), 0, Math.cos(a1)), 0),
    ];
    const mid = (a0 + a1) / 2;
    const g = new THREE.Group();
    g.add(copy);
    g.position.set(Math.cos(mid) * rad * 0.14, 0, Math.sin(mid) * rad * 0.14);
    out.add(g);
  }
  return out;
}
