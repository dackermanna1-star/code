/**
 * Realistic bodies: a scanned-quality, textured human model fitted onto a fighter's skeleton when
 * the character library is built - Microsoft Rocketbox avatars (MIT licence,
 * https://github.com/microsoft/Microsoft-Rocketbox), converted by tools/models/rocketbox.mjs (an
 * indexed mesh, the fingers curled into a fist, skinned to the game's 22 bones, plus the avatar's
 * joint positions). Scarlet is Female_Adult_07 re-dressed by tools/models/scarlet_textures.py; the
 * enemies are the avatars in tools/models/avatars.json as they're dressed
 * (tools/models/build_avatars.py), each fighter varying its avatar's clothes by a tint (RealLook).
 *
 * Fitting: the torso keeps its shape (placed by the hip joints, its height matched to the
 * skeleton's neck); each limb segment is turned and stretched from the avatar's joints onto the
 * skeleton's; the head and neck are placed on their own joints; the boots only turn to point
 * straight ahead (their soles stay flat). The fighter's spec (variants.ts) is fitted to the avatar
 * so these corrections stay small. The torso is then re-weighted by height between the hips, spine
 * and chest, as the procedural bodies are.
 *
 * A leather mini skirt is built over the hips from the fitted body's tights (the avatar wears
 * jeans, which become sheer black tights).
 */
import * as THREE from 'three';
import { B, BodySpec, BONE_COUNT, SkeletonDef } from '../anim/skeleton';
import { CHAR_TEX_SIZE, PaintedLayer } from './texture';
import scarletMesh from './models/scarlet/mesh.json';
import scarletBody from './models/scarlet/body.jpg';
import scarletBodyN from './models/scarlet/body_n.jpg';
import scarletBodyF from './models/scarlet/body_f.png';
import scarletHead from './models/scarlet/head.jpg';
import scarletHeadN from './models/scarlet/head_n.jpg';
import scarletHeadF from './models/scarlet/head_f.png';
import scarletHair from './models/scarlet/hair.webp';
import { AVATARS } from './models/avatars';

interface MeshAsset {
  source: string;
  count: number;
  /** positions quantised to 1/posQ m (Int16) and uvs to 1/65535 (Uint16); absent: Float32 */
  posQ?: number;
  groups: { start: number; count: number; mat: string }[];
  joints: Record<string, number[]>;
  pos: string;
  nrm: string;
  uv: string;
  skin: string;
  /** The face rig (rocketbox.mjs): per-vertex jaw, upper lip, mouth corners, 1 - upper eyelid. */
  face?: string;
  index: string;
}

/** An enemy's avatar, as tools/models/build_avatars.py indexes it (models/avatars.ts). */
export interface AvatarAsset {
  src: string;
  mesh: MeshAsset;
  body: string;
  bodyN: string;
  bodyF: string;
  head: string;
  headF: string;
  hair: string | null;
}

type TexName = 'body' | 'bodyN' | 'bodyF' | 'head' | 'headN' | 'headF' | 'hair';

/**
 * How one fighter wears an avatar: its clothes re-coloured (the top and the trousers, as the
 * avatar's finish map marks them; rgb over the cloth's own light and shade, a = how much), its
 * skin tinted (multiplied), its build bulkier across (girth: the torso and limbs, not the head).
 */
export interface RealLook {
  top?: [number, number, number, number];
  bottom?: [number, number, number, number];
  skin?: [number, number, number, number];
  girth?: number;
}

interface SkirtSpec {
  /** The waistband's and the hem's heights relative to the hip joints (m, unscaled). */
  top: number;
  hem: number;
  /** The jacket is cut off below this height (relative to the hip joints, m unscaled): it ends at the high hip, over the skirt. */
  jacketCut?: number;
  /** Where on the body texture its leather comes from: u0, v0, du, dv. */
  uv: [number, number, number, number];
}

interface RealModel {
  mesh: MeshAsset;
  /** The avatar's size in the game: its metres times this (a fitted spec - fitSpec - sets its own). */
  scale: number;
  urls: Partial<Record<TexName, string>>;
  skirt?: SkirtSpec;
}

const MODELS: Record<string, RealModel> = {
  scarlet: {
    mesh: scarletMesh as unknown as MeshAsset,
    scale: 1.02,
    urls: { body: scarletBody, bodyN: scarletBodyN, bodyF: scarletBodyF, head: scarletHead, headN: scarletHeadN, headF: scarletHeadF, hair: scarletHair },
    skirt: { top: 0.075, hem: -0.2, jacketCut: 0.035, uv: [0.36, 0.77, 0.27, 0.15] },
  },
};
for (const [id, a] of Object.entries(AVATARS)) {
  MODELS[id] = { mesh: a.mesh, scale: 1, urls: { body: a.body, bodyN: a.bodyN, bodyF: a.bodyF, head: a.head, headF: a.headF, ...(a.hair ? { hair: a.hair } : {}) } };
}

/** Material slots of a real model's geometry groups. */
export const REAL_SLOTS = ['body', 'head', 'hair'] as const;
export type RealSlot = (typeof REAL_SLOTS)[number];

const images = new Map<string, HTMLImageElement>();
const finishPx = new Map<string, ImageData>();

function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  return img.decode().then(() => img);
}

/** Load (and decode) every real model's textures. Call before building a character library. */
export async function preloadRealModels(): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const [name, m] of Object.entries(MODELS)) {
    for (const [t, url] of Object.entries(m.urls)) {
      if (!url) continue;
      const key = name + ':' + t;
      if (images.has(key)) continue;
      jobs.push(
        loadImage(url).then(
          (img) => void images.set(key, img),
          (e) => console.warn('real model texture failed', key, e),
        ),
      );
    }
  }
  await Promise.all(jobs);
}

export const isRealModel = (name: string) => name in MODELS;
/** Is the model there to build (its textures loaded)? Otherwise the procedural body stands in. */
export function realModelReady(name: string) {
  const m = MODELS[name];
  return !!m && (Object.keys(m.urls) as TexName[]).every((t) => images.has(name + ':' + t));
}
/** Does the model have hair cards (an alpha-tested third material)? */
export const realHasCards = (name: string) => !!MODELS[name]?.urls.hair;

function finishData(name: string, which: 'bodyF' | 'headF') {
  const key = name + ':' + which;
  let d = finishPx.get(key);
  if (!d) {
    const img = images.get(key)!;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    d = ctx.getImageData(0, 0, c.width, c.height);
    finishPx.set(key, d);
  }
  return d;
}

/** The finish map at a uv: [finish code (the atlas alpha's), bare skin, clothes region], all 0..1. */
function finishAt(d: ImageData, u: number, v: number): [number, number, number] {
  const x = Math.min(d.width - 1, Math.max(0, Math.floor(u * d.width)));
  const y = Math.min(d.height - 1, Math.max(0, Math.floor((1 - v) * d.height)));
  const o = (y * d.width + x) * 4;
  return [d.data[o] / 255, d.data[o + 1] / 255, d.data[o + 2] / 255];
}

/** The model's own height (the top of its head, hair on the scalp included) and its joints. */
function modelStature(A: MeshAsset) {
  const pos = decodePos(A);
  const idx = new Uint16Array(b64(A.index));
  const head = A.groups.find((g) => g.mat === 'head');
  let top = 0;
  if (head) for (let i = head.start; i < head.start + head.count; i++) top = Math.max(top, pos[idx[i] * 3 + 1]);
  return top || 1.75;
}
/** The skeleton's head top over its height unit (s = 1, flat feet): see buildSkeletonDef. */
const UNIT_STATURE = 1.83;

/**
 * A skeleton spec fitted to a model's joints for a fighter of height s (base.height; the model's
 * own height when not given): every proportion measured off the model, scaled by s over the
 * model's own size. base's other fields (bulk, fem...) are kept.
 */
export function fitSpec(name: string, base: Partial<BodySpec> = {}, girth = 1): Partial<BodySpec> {
  const A = MODELS[name].mesh;
  const natS = modelStature(A) / UNIT_STATURE;
  const s = base.height ?? natS;
  const k = s / natS;
  const hip0 = new THREE.Vector3().fromArray(A.joints.thighL).add(new THREE.Vector3().fromArray(A.joints.thighR)).multiplyScalar(0.5 * k);
  // (a bulkier build is wider and deeper about the hips: so are its shoulder and hip joints)
  const J = (j: string) => {
    const v = new THREE.Vector3().fromArray(A.joints[j]).multiplyScalar(k);
    if (girth !== 1 && !j.startsWith('farm') && !j.startsWith('hand') && !j.startsWith('knuckle') && !j.startsWith('shin') && !j.startsWith('foot') && !j.startsWith('toe')) {
      v.x = hip0.x + (v.x - hip0.x) * girth;
      v.z = hip0.z + (v.z - hip0.z) * girth;
    }
    return v;
  };
  const len = (a: string, b: string) => J(a).distanceTo(J(b));
  const hip = J('thighL').add(J('thighR')).multiplyScalar(0.5);
  // the heel: the ankle's height for the boots' (bisect: flat feet stand the ankle at 0.075 s)
  const ankle = J('footL').y;
  const ankleAt = (heel: number) => {
    if (heel <= 0) return 0.075 * s;
    const a = Math.asin(Math.min(0.75, heel / 0.17));
    return (0.13 * Math.sin(a) + 0.075 * Math.cos(a) + 0.008) * s;
  };
  let heel = 0;
  if (ankle > ankleAt(0.001)) {
    let lo = 0.001, hi = 0.127;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (ankleAt(mid) < ankle) lo = mid;
      else hi = mid;
    }
    heel = (lo + hi) / 2;
  }
  const uarm = J('uarmL'), neck = J('neck');
  return {
    ...base,
    height: s,
    heel,
    legs: (len('thighL', 'shinL') + len('shinL', 'footL')) / (0.85 * s),
    arms: (len('uarmL', 'farmL') + len('farmL', 'handL')) / (0.55 * s),
    hipsW: Math.abs(J('thighL').x) / (0.092 * s),
    torso: (neck.y - hip.y - 0.06 * s) / (0.555 * s),
    neckLen: (J('head').y - neck.y) / (0.09 * s),
    neckBack: Math.max(0, -((neck.z - hip.z) / s + 0.017)),
    shoulders: (Math.abs(uarm.x) / s - 0.03) / 0.152,
    shoulderBack: Math.max(0, -((uarm.z - hip.z) / s + 0.018)),
    headSize: ((modelStature(A) * k - J('head').y) / (0.2 * s)) * (base.headSize ?? 1),
  };
}

// ------------------------------------------------------------------ textures
const texCache = new Map<string, Partial<Record<TexName, THREE.Texture>>>();
export function realTextures(name: string): Partial<Record<TexName, THREE.Texture>> {
  let t = texCache.get(name);
  if (t) return t;
  const mk = (n: TexName, srgb: boolean) => {
    const img = images.get(name + ':' + n);
    if (!img) return undefined;
    const tex = new THREE.Texture(img);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  };
  t = {
    body: mk('body', true), bodyN: mk('bodyN', false), bodyF: mk('bodyF', false),
    head: mk('head', true), headN: mk('headN', false), headF: mk('headF', false), hair: mk('hair', true),
  };
  texCache.set(name, t);
  return t;
}

/** The model's body and head, small, for the shared atlas (a body laid down as a corpse samples it). */
export function realAtlasLayers(name: string): PaintedLayer[] {
  const S = CHAR_TEX_SIZE;
  const draw = (img: HTMLImageElement) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, S, S);
    return c;
  };
  const im = (t: TexName) => images.get(name + ':' + t)!;
  return [
    { color: draw(im('body')), mask: draw(im('bodyF')) },
    { color: draw(im('head')), mask: draw(im('headF')) },
  ];
}

// ------------------------------------------------------------------ geometry
function decodePos(A: MeshAsset): Float32Array {
  if (!A.posQ) return new Float32Array(b64(A.pos));
  const q = new Int16Array(b64(A.pos));
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = q[i] / A.posQ;
  return out;
}
function decodeUv(A: MeshAsset): Float32Array {
  if (!A.posQ) return new Float32Array(b64(A.uv));
  const q = new Uint16Array(b64(A.uv));
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = q[i] / 65535;
  return out;
}

function b64(s: string): ArrayBuffer {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Hips / spine / chest shares by height on the torso (as the procedural bodies weight theirs): f is
 * the height above the hips bone as a share of the hips-to-neck span.
 */
const TORSO_PROFILE: [number, number, number, number][] = [
  [0, 0.85, 0.15, 0],
  [0.126, 0.35, 0.65, 0],
  [0.252, 0, 0.85, 0.15],
  [0.378, 0, 0.5, 0.5],
  [0.523, 0, 0.15, 0.85],
  [0.649, 0, 0, 1],
];
function torsoShares(f: number): [number, number, number] {
  const P = TORSO_PROFILE;
  if (f <= P[0][0]) {
    // below the hips bone: all hips by the hip joints
    const k = smooth(-0.11, 0, f);
    return [1 - 0.15 * k, 0.15 * k, 0];
  }
  for (let i = 1; i < P.length; i++) {
    if (f <= P[i][0]) {
      const t = (f - P[i - 1][0]) / (P[i][0] - P[i - 1][0]);
      return [P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t, P[i - 1][2] + (P[i][2] - P[i - 1][2]) * t, P[i - 1][3] + (P[i][3] - P[i - 1][3]) * t];
    }
  }
  return [0, 0, 1];
}

/**
 * Matrices taking the avatar's rest pose onto the skeleton's, one per bone. girth: the torso and
 * limbs that much bulkier across; head: the head's own scale about its joint (a giant's head
 * doesn't grow as much as he does).
 */
function boneFits(def: SkeletonDef, J: (n: string) => THREE.Vector3, girth = 1, head = 1): THREE.Matrix4[] {
  const R = def.rest;
  const T = (v: THREE.Vector3) => new THREE.Matrix4().makeTranslation(v.x, v.y, v.z);
  const hipRB = J('thighL').add(J('thighR')).multiplyScalar(0.5);
  const hipO = R[B.thighL].clone().add(R[B.thighR]).multiplyScalar(0.5);
  const ky = (R[B.neck].y - hipO.y) / (J('neck').y - hipRB.y);
  const torso = T(hipO).multiply(new THREE.Matrix4().makeScale(girth, ky, girth)).multiply(T(hipRB.clone().negate()));
  const at = (from: THREE.Vector3, to: THREE.Vector3, sx = 1, sy = 1) => T(to).multiply(new THREE.Matrix4().makeScale(sx, sy, sx)).multiply(T(from.clone().negate()));
  /** a segment a0->a1 turned and stretched along itself onto b0->b1 (axial: a fixed stretch), girth across */
  const seg = (a0: THREE.Vector3, a1: THREE.Vector3, b0: THREE.Vector3, b1: THREE.Vector3, axial?: number, across = girth) => {
    const da = a1.clone().sub(a0);
    const la = da.length();
    da.divideScalar(la);
    const db = b1.clone().sub(b0);
    const lb = db.length();
    db.divideScalar(lb);
    const g = (axial ?? lb / la) - across;
    const S = new THREE.Matrix4().set(
      across + g * da.x * da.x, g * da.x * da.y, g * da.x * da.z, 0,
      g * da.y * da.x, across + g * da.y * da.y, g * da.y * da.z, 0,
      g * da.z * da.x, g * da.z * da.y, across + g * da.z * da.z, 0,
      0, 0, 0, 1,
    );
    const Rm = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(da, db));
    return T(b0).multiply(Rm).multiply(S).multiply(T(a0.clone().negate()));
  };
  const m: THREE.Matrix4[] = [];
  for (let i = 0; i < BONE_COUNT; i++) m.push(torso);
  // (the neck half as much bulkier as the body)
  m[B.neck] = at(J('neck'), R[B.neck], 1 + (girth - 1) * 0.5, ky);
  m[B.head] = at(J('head'), R[B.head], head, head);
  const sides = [
    ['L', B.uarmL, B.farmL, B.handL, B.thighL, B.shinL, B.footL, B.toeL],
    ['R', B.uarmR, B.farmR, B.handR, B.thighR, B.shinR, B.footR, B.toeR],
  ] as const;
  for (const [sd, ua, fa, ha, th, sh, ft, to] of sides) {
    m[ua] = seg(J('uarm' + sd), J('farm' + sd), R[ua], R[fa]);
    m[fa] = seg(J('farm' + sd), J('hand' + sd), R[fa], R[ha]);
    const kl = J('knuckle' + sd).distanceTo(J('hand' + sd));
    m[ha] = seg(J('hand' + sd), J('knuckle' + sd), R[ha], R[ha].clone().addScaledVector(def.restDir[ha], kl), 1, 1 + (girth - 1) * 0.4);
    m[th] = seg(J('thigh' + sd), J('shin' + sd), R[th], R[sh]);
    m[sh] = seg(J('shin' + sd), J('foot' + sd), R[sh], R[ft]);
    // the boot: turned to point straight ahead about the ankle, its sole kept flat
    const d = J('toe' + sd).sub(J('foot' + sd));
    const yaw = Math.atan2(d.x, d.z);
    m[ft] = T(R[ft]).multiply(new THREE.Matrix4().makeRotationY(-yaw)).multiply(T(J('foot' + sd).negate()));
    m[to] = m[ft];
  }
  return m;
}

/** The fitted geometry of a real model for a skeleton (bind pose = the skeleton's rest), as `look` wears it. */
export function buildRealGeometry(name: string, def: SkeletonDef, look: RealLook = {}): THREE.BufferGeometry {
  const M = MODELS[name];
  const A = M.mesh;
  const pos0 = decodePos(A);
  const nrm0 = new Int8Array(b64(A.nrm));
  const uv0 = decodeUv(A);
  const skin0 = new Uint8Array(b64(A.skin));
  const index0 = new Uint16Array(b64(A.index));
  const n = A.count;
  // (an avatar is sized to the fighter's height - fitSpec - Scarlet by her own scale)
  const k = M.scale || def.spec.height / (modelStature(A) / UNIT_STATURE);
  const J = (j: string) => new THREE.Vector3().fromArray(A.joints[j]).multiplyScalar(k);
  // a giant's head grows a third as much as he does
  const headScale = k > 1 ? (1 + (k - 1) * 0.35) / k : 1;
  const fits = boneFits(def, J, look.girth ?? 1, headScale);
  const tintTop = look.top ?? [0, 0, 0, 0], tintBottom = look.bottom ?? [0, 0, 0, 0], tintSkin = look.skin ?? [0, 0, 0, 0];
  const tint = new Float32Array(n * 4), tintS = new Float32Array(n * 4);
  const R = def.rest;
  const hipsY = R[B.hips].y;
  const span = R[B.neck].y - hipsY;
  const slotOf = new Uint8Array(n);
  for (const g of A.groups) {
    const slot = Math.max(0, REAL_SLOTS.indexOf(g.mat as RealSlot));
    for (let i = g.start; i < g.start + g.count; i++) slotOf[index0[i]] = slot;
  }

  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const skinF = new Float32Array(n);
  const sway = new Float32Array(n * 2);
  const uvA = new Float32Array(n * 2);
  const v = new THREE.Vector3(), q = new THREE.Vector3(), nn = new THREE.Vector3(), nq = new THREE.Vector3();
  const acc = new Float32Array(BONE_COUNT);
  const bodyF = finishData(name, 'bodyF'), headF = finishData(name, 'headF');
  const sheer = new Uint8Array(n);
  // the jacket's leather (finish code ~0.725: gloss 0.55), for its cut-off skirts
  const jacket = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    v.set(pos0[i * 3], pos0[i * 3 + 1], pos0[i * 3 + 2]).multiplyScalar(k);
    nn.set(nrm0[i * 3] / 127, nrm0[i * 3 + 1] / 127, nrm0[i * 3 + 2] / 127);
    const p = new THREE.Vector3(), no = new THREE.Vector3();
    for (let c = 0; c < 4; c++) {
      const w = skin0[i * 8 + 4 + c] / 255;
      if (w <= 0) continue;
      const m = fits[skin0[i * 8 + c]];
      p.addScaledVector(q.copy(v).applyMatrix4(m), w);
      no.addScaledVector(nq.copy(nn).transformDirection(m), w);
    }
    no.normalize();
    pos.set([p.x, p.y, p.z], i * 3);
    nrm.set([no.x, no.y, no.z], i * 3);
    // weights: the limbs keep the avatar's; the torso's share is spread by height
    acc.fill(0);
    for (let c = 0; c < 4; c++) acc[skin0[i * 8 + c]] += skin0[i * 8 + 4 + c] / 255;
    const tor = acc[B.hips] + acc[B.spine] + acc[B.chest] + acc[B.root];
    if (tor > 0) {
      const [h, s, c] = torsoShares((p.y - hipsY) / span);
      acc[B.root] = 0;
      acc[B.hips] = tor * h;
      acc[B.spine] = tor * s;
      acc[B.chest] = tor * c;
    }
    const top = Array.from(acc, (w, b) => [b, w] as [number, number]).filter((e) => e[1] > 0.004).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((a, e) => a + e[1], 0);
    top.forEach(([b, w], c) => {
      si[i * 4 + c] = b;
      sw[i * 4 + c] = w / sum;
    });
    const u = uv0[i * 2], vv = uv0[i * 2 + 1];
    const slot = slotOf[i];
    // the corpse atlas: the head on the layer after the body's (uv.x past 1)
    uvA[i * 2] = slot === 1 ? u + 1 : u;
    uvA[i * 2 + 1] = vv;
    if (slot === 2) {
      // hair cards: the strands hanging at the nape sway
      skinF[i] = 0;
      sway[i * 2] = 0.55 * smooth(R[B.head].y + 0.06, R[B.head].y - 0.05, p.y);
    } else {
      const [code, sk, region] = finishAt(slot === 1 ? headF : bodyF, u, vv);
      skinF[i] = sk;
      sheer[i] = slot === 0 && code >= 0.25 && code < 0.5 ? 1 : 0;
      jacket[i] = slot === 0 && code > 0.69 && code < 0.76 ? 1 : 0;
      // the clothes' tint for this vertex's region (the shader keeps it off bare skin), the skin's
      const t = slot === 0 && region > 0.75 ? tintTop : slot === 0 && region > 0.25 ? tintBottom : null;
      if (t) tint.set(t, i * 4);
      tintS.set(tintSkin, i * 4);
    }
  }

  // the face rig: where the jaw hinges and the eyes turn, on the fitted head
  const faceRig = A.face && A.joints.jaw
    ? {
        jaw: J('jaw').applyMatrix4(fits[B.head]),
        eyeL: J('eyeL').applyMatrix4(fits[B.head]),
        eyeR: J('eyeR').applyMatrix4(fits[B.head]),
        // (the head's own size: the lips and lids move this much further on a big head)
        k: k * headScale,
      }
    : null;
  const geo = new THREE.BufferGeometry();
  // (plain arrays only when a skirt is built onto them: fifty-odd fighters' worth would be a lot)
  const arr = <T extends ArrayLike<number>>(a: T) => (M.skirt ? Array.from(a) : a) as unknown as number[];
  const parts = {
    pos: arr(pos), nrm: arr(nrm), uv: arr(uv0), uvA: arr(uvA),
    si: arr(si), sw: arr(sw), skin: arr(skinF), sway: arr(sway),
    tint: arr(tint), tintS: arr(tintS),
  };
  // indices by slot (the body's group gets the skirt appended)
  const bySlot: number[][] = [[], [], []];
  const cutY = M.skirt?.jacketCut !== undefined ? R[B.thighL].y + M.skirt.jacketCut * def.scale : -1;
  const kneeY = R[B.shinL].y + 0.1;
  const cut = (i: number) => jacket[i] && pos[i * 3 + 1] < cutY && pos[i * 3 + 1] > kneeY && Math.abs(pos[i * 3]) < 0.3;
  for (const g of A.groups) {
    const slot = Math.max(0, REAL_SLOTS.indexOf(g.mat as RealSlot));
    for (let i = g.start; i < g.start + g.count; i += 3) {
      const a = index0[i], b = index0[i + 1], c = index0[i + 2];
      // (the jacket's skirts below the high hip: gone, the leather skirt shows from there)
      if (slot === 0 && cut(a) && cut(b) && cut(c)) continue;
      bySlot[slot].push(a, b, c);
    }
  }
  if (M.skirt) buildSkirt(parts, bySlot[0], def, pos, sheer, n, M.skirt);
  const nIdx = bySlot[0].length + bySlot[1].length + bySlot[2].length;
  const nv = parts.pos.length / 3;
  const index = nv > 65535 ? new Uint32Array(nIdx) : new Uint16Array(nIdx);
  index.set(bySlot[0], 0);
  index.set(bySlot[1], bySlot[0].length);
  index.set(bySlot[2], bySlot[0].length + bySlot[1].length);
  const f32 = (a: number[]) => (a instanceof Float32Array ? a : new Float32Array(a));
  const u8 = (a: number[]) => {
    const o = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) o[i] = Math.round(Math.min(1, Math.max(0, a[i])) * 255);
    return o;
  };
  geo.setAttribute('position', new THREE.BufferAttribute(f32(parts.pos), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(f32(parts.nrm), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(f32(parts.uv), 2));
  geo.setAttribute('uvAtlas', new THREE.BufferAttribute(f32(parts.uvA), 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(parts.si instanceof Uint16Array ? parts.si : new Uint16Array(parts.si), 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(f32(parts.sw), 4));
  geo.setAttribute('aSkin', new THREE.BufferAttribute(f32(parts.skin), 1));
  geo.setAttribute('aSway', new THREE.BufferAttribute(f32(parts.sway), 2));
  geo.setAttribute('aTint', new THREE.BufferAttribute(u8(parts.tint), 4, true));
  geo.setAttribute('aTintSkin', new THREE.BufferAttribute(u8(parts.tintS), 4, true));
  if (A.face) {
    // (a skirt's vertices carry no face: zeros, and the eyelid channel's "none" of 255)
    const f0 = new Uint8Array(b64(A.face));
    const face = new Uint8Array(nv * 4);
    face.set(f0.subarray(0, Math.min(f0.length, nv * 4)));
    for (let i = n; i < nv; i++) face[i * 4 + 3] = 255;
    geo.setAttribute('aFace', new THREE.BufferAttribute(face, 4, true));
  }
  if (faceRig) geo.userData.faceRig = faceRig;
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.addGroup(0, bySlot[0].length, 0);
  geo.addGroup(bySlot[0].length, bySlot[1].length, 1);
  geo.addGroup(bySlot[0].length + bySlot[1].length, bySlot[2].length, 2);
  // a body laid down as a corpse leaves the hair cards out (the corpses are drawn opaque)
  geo.userData.corpseIndex = new THREE.BufferAttribute(index.slice(0, bySlot[0].length + bySlot[1].length), 1);
  geo.computeBoundingSphere();
  return geo;
}

interface Parts {
  pos: number[];
  nrm: number[];
  uv: number[];
  uvA: number[];
  si: number[];
  sw: number[];
  skin: number[];
  sway: number[];
  tint: number[];
  tintS: number[];
}

/**
 * A leather mini skirt over the fitted body's tights: rings from the waistband (under the jacket's
 * hem) to the hem, each the convex outline of the tights at its height plus an easing that grows
 * towards the hem; weighted to the hips above the hip joints and onto each thigh below them, so it
 * rides up on a raised knee. A lining faces in (seen in a high kick) and the hem folds between them.
 */
function buildSkirt(parts: Parts, out: number[], def: SkeletonDef, pos: Float32Array, sheer: Uint8Array, n: number, sk: SkirtSpec) {
  const s = def.scale;
  const R = def.rest;
  const yJ = R[B.thighL].y;
  const hipsY = R[B.hips].y;
  const span = R[B.neck].y - hipsY;
  const yTop = yJ + sk.top * s, yHem = yJ + sk.hem * s;
  const RINGS = 13, SEG = 56;
  const rings: { c: THREE.Vector2; r: number[]; y: number }[] = [];
  for (let ri = 0; ri < RINGS; ri++) {
    const d = ri / (RINGS - 1);
    const y = yTop + (yHem - yTop) * d;
    // the tights' points near this height
    let pts: THREE.Vector2[] = [];
    for (let band = 0.012; pts.length < 24 && band < 0.06; band *= 1.6) {
      pts = [];
      for (let i = 0; i < n; i++) if (sheer[i] && Math.abs(pos[i * 3 + 1] - y) < band) pts.push(new THREE.Vector2(pos[i * 3], pos[i * 3 + 2]));
    }
    const hull = convexHull(pts);
    const c = new THREE.Vector2();
    for (const p of hull) c.add(p);
    c.divideScalar(Math.max(1, hull.length));
    c.x = 0;
    const r: number[] = [];
    for (let k = 0; k < SEG; k++) {
      const th = (k / SEG) * Math.PI * 2;
      r.push(rayHull(hull, c, Math.sin(th), Math.cos(th)));
    }
    rings.push({ c, r, y });
  }
  // smooth the outlines around and down (no kinks; never narrower above than below the hip line)
  for (let pass = 0; pass < 2; pass++)
    for (const g of rings) {
      const r = g.r.slice();
      for (let k = 0; k < SEG; k++) g.r[k] = (r[(k + SEG - 1) % SEG] + 2 * r[k] + r[(k + 1) % SEG]) / 4;
    }
  for (let ri = 1; ri < RINGS; ri++) {
    const a = rings[ri - 1], b = rings[ri];
    for (let k = 0; k < SEG; k++) b.r[k] = Math.max(b.r[k], a.r[k] * (b.y > yJ - 0.03 ? 0.985 : 0.94));
  }
  const emitRing = (inset: number, uvRow: (d: number) => number, flip: boolean) => {
    const first = parts.pos.length / 3;
    rings.forEach((g, ri) => {
      const d = ri / (RINGS - 1);
      const ease = (0.0045 + 0.0055 * d) * s - inset;
      const below = smooth(yJ + 0.1 * s, yJ - 0.08 * s, g.y);
      const f = 0.97 * below;
      const [h, sp, ch] = torsoShares((Math.max(g.y, hipsY - 0.12 * s) - hipsY) / span);
      for (let k = 0; k <= SEG; k++) {
        const th = (k / SEG) * Math.PI * 2;
        const rr = g.r[k % SEG] + ease;
        const x = g.c.x + Math.sin(th) * rr, z = g.c.y + Math.cos(th) * rr;
        parts.pos.push(x, g.y, z);
        parts.nrm.push(Math.sin(th) * (flip ? -1 : 1), 0, Math.cos(th) * (flip ? -1 : 1));
        // round the panel and back (mirrored: no seam)
        const uu = 1 - Math.abs((2 * k) / SEG - 1);
        const vv = uvRow(d);
        parts.uv.push(uu, vv);
        parts.uvA.push(uu, vv);
        // weights: the torso's at the top, onto the near thigh below the hip joints
        const b = smooth(-0.045 * s, 0.045 * s, x);
        const ws: [number, number][] = [[B.hips, h * (1 - f)], [B.spine, sp * (1 - f)], [B.chest, ch * (1 - f)], [B.thighL, f * b], [B.thighR, f * (1 - b)]];
        const top = ws.filter((e) => e[1] > 0.002).sort((a2, b2) => b2[1] - a2[1]).slice(0, 4);
        const sum = top.reduce((a2, e) => a2 + e[1], 0);
        for (let c2 = 0; c2 < 4; c2++) {
          parts.si.push(top[c2] ? top[c2][0] : 0);
          parts.sw.push(top[c2] ? top[c2][1] / sum : 0);
        }
        parts.skin.push(0);
        parts.sway.push(0, 0.55 * Math.pow(d, 1.6));
        parts.tint.push(0, 0, 0, 0);
        parts.tintS.push(0, 0, 0, 0);
      }
    });
    // quads
    for (let ri = 0; ri < RINGS - 1; ri++)
      for (let k = 0; k < SEG; k++) {
        const a = first + ri * (SEG + 1) + k, b = a + 1, c = a + SEG + 1, e = c + 1;
        if (flip) out.push(a, b, c, b, e, c);
        else out.push(a, c, b, b, c, e);
      }
    return first;
  };
  const [u0, v0, du, dv] = sk.uv;
  const remapUv = (from: number) => {
    // round the skirt across the leather panel and back, down it from the waistband
    for (let i = from; i < parts.pos.length / 3; i++) {
      parts.uv[i * 2] = u0 + parts.uv[i * 2] * du;
      parts.uvA[i * 2] = parts.uv[i * 2];
    }
  };
  const outer = emitRing(0, (d) => v0 + dv * (1 - d), false);
  remapUv(outer);
  const inner = emitRing(0.0035 * s, (d) => v0 + dv * (1 - d) * 0.5, true);
  remapUv(inner);
  // the hem's fold between the outer face and the lining
  const hemO = outer + (RINGS - 1) * (SEG + 1), hemI = inner + (RINGS - 1) * (SEG + 1);
  for (let k = 0; k < SEG; k++) {
    const a = hemO + k, b = hemO + k + 1, c = hemI + k, e = hemI + k + 1;
    out.push(a, c, b, b, c, e);
  }
  // shade the outer face's normals from its own shape (the rings' outlines are not round)
  smoothNormals(parts, out, outer, inner);
  smoothNormals(parts, out, inner, parts.pos.length / 3);
}

/** Recompute the normals of vertices [from, to) from the triangles that use them. */
function smoothNormals(parts: Parts, idx: number[], from: number, to: number) {
  const acc = new Float32Array((to - from) * 3);
  const p = parts.pos;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (a < from || a >= to || b < from || b >= to || c < from || c >= to) continue;
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) {
      acc[(i - from) * 3] += nx;
      acc[(i - from) * 3 + 1] += ny;
      acc[(i - from) * 3 + 2] += nz;
    }
  }
  for (let i = 0; i < to - from; i++) {
    const l = Math.hypot(acc[i * 3], acc[i * 3 + 1], acc[i * 3 + 2]) || 1;
    for (let c = 0; c < 3; c++) parts.nrm[(from + i) * 3 + c] = acc[i * 3 + c] / l;
  }
}

function convexHull(pts: THREE.Vector2[]): THREE.Vector2[] {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: THREE.Vector2[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: THREE.Vector2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Distance from c along (dx, dz) to the hull's edge. */
function rayHull(hull: THREE.Vector2[], c: THREE.Vector2, dx: number, dz: number): number {
  let best = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ex = b.x - a.x, ez = b.y - a.y;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a.x - c.x) * ez - (a.y - c.y) * ex) / den;
    const u = ((a.x - c.x) * dz - (a.y - c.y) * dx) / den;
    if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.max(best, t);
  }
  return best || 0.1;
}
