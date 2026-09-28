// First-person viewmodel: character-specific arms (2-bone IK) holding the
// active weapon/item, with procedural sway, bob, sprint pose, recoil springs
// and animated reloads (magazine swap / shell-by-shell / pump / bolt), shoves,
// melee swings, throws, healing and pills. Rendered on layer 1 (no clipping).
import * as THREE from 'three';
import { buildModel } from './weaponModels.js';
import { solveIK } from '../entities/body.js';
import { Piece, tube, sweep, ellipsoid, limbPoint, farmBump, pieceGeometry, FARM_KEYS, RECT, REG } from '../entities/partgeo.js';
import { getCharacterAsset } from '../entities/charlooks.js';
import { damp, clamp, lerp, easeOutCubic, easeInOutSine, TAU } from '../core/math.js';

const TYPE_MODEL = {
  pistol: 'pistol', magnum: 'magnum', smg: 'smg', silencedSmg: 'silencedSmg', pumpShotgun: 'pumpShotgun', chromeShotgun: 'chromeShotgun',
  autoShotgun: 'autoShotgun', rifle: 'rifle', scar: 'scar', huntingRifle: 'huntingRifle', m60: 'm60', grenadeLauncher: 'grenadeLauncher',
  fireaxe: 'fireaxe', crowbar: 'crowbar', machete: 'machete', molotov: 'molotov', pipebomb: 'pipebomb', bile: 'bile',
  medkit: 'medkit', pills: 'pills', adrenaline: 'adrenaline', minigun: 'minigun',
};
// Hip pose per kind: [x,y,z, rx,ry,rz]
const POSE = {
  pistol: [0.13, -0.13, -0.32, 0, 0.03, 0],
  dual: [0.15, -0.14, -0.33, 0, 0, 0],
  smg: [0.12, -0.13, -0.3, 0, 0.02, 0],
  shotgun: [0.12, -0.14, -0.26, 0, 0.02, 0],
  rifle: [0.12, -0.13, -0.24, 0, 0.02, 0],
  sniper: [0.12, -0.135, -0.24, 0, 0.02, 0],
  heavy: [0.13, -0.17, -0.24, 0, 0.04, 0],
  launcher: [0.13, -0.15, -0.26, 0, 0.03, 0],
  melee: [0.2, -0.3, -0.35, -0.3, 0.2, -0.3],
  throwable: [0.16, -0.2, -0.32, 0, 0, 0],
  medkit: [0.08, -0.22, -0.36, 0.2, 0, 0],
  pills: [0.12, -0.2, -0.32, 0, 0, 0.1],
  minigun: [0.0, -0.28, -0.25, 0, 0, 0],
};

// ------------------------------------------------------------ arm meshes --
// Forearms and hands reuse the survivor's painted atlases (skin, tattoos,
// sleeves, nails) so first-person arms match the third-person model: Bill's
// field-jacket cuff, Zoey's red track-jacket sleeve with white stripes, Louis's
// rolled white shirt sleeve over a bare forearm, Francis's tattooed arms.
const WRIST = [0.021, -0.02, 0.072]; // wrist centre in hand (grip) space
const armGeoCache = new Map();
function forearmGeometry(bulk) {
  const key = 'fa' + bulk.toFixed(3);
  if (armGeoCache.has(key)) return armGeoCache.get(key);
  const P = new Piece({ region: REG.FARM });
  const k = bulk * 0.96 + 0.04;
  tube(P, { ts: [-0.06, 0.0, 0.06, 0.14, 0.24, 0.35, 0.47, 0.6, 0.72, 0.82, 0.9, 0.96, 1.0, 1.05], segs: 22, rect: RECT.farm, aOff: Math.PI / 2, tA: -0.15, tB: 1.04,
    fn: (t, a, o3) => { limbPoint(FARM_KEYS, t, a, k, k, farmBump(bulk), o3); o3[1] = t; } });
  const g = pieceGeometry([P]);
  armGeoCache.set(key, g);
  return g;
}
function sleeveGeometry(L, bulk) {
  const key = 'sl' + bulk.toFixed(3) + JSON.stringify([L.t0, L.t1, L.off, L.rect, L.hem]);
  if (armGeoCache.has(key)) return armGeoCache.get(key);
  const P = new Piece({ region: REG.FARM });
  const k = bulk * 0.96 + 0.04;
  const t0 = L.t0 ?? -0.12, t1 = L.t1 ?? 1.04;
  const ts = [];
  for (let i = 0; i <= 14; i++) ts.push(t0 + (t1 - t0) * (i / 14));
  if (L.hem) ts.push(t1 + 0.001);
  tube(P, { ts, segs: 22, rect: L.rect || RECT.farm, aOff: Math.PI / 2, tA: -0.15, tB: 1.04,
    fn: (t, a, o3) => { const tt = Math.min(t, t1); limbPoint(FARM_KEYS, tt, a, k, k, null, o3, (L.off ?? 0.01) + (L.bulge ? L.bulge(tt, a) : 0) - (t > t1 ? (L.off ?? 0.01) * 0.9 : 0)); o3[1] = tt; } });
  P.doubleSided = true;
  const g = pieceGeometry([P]);
  armGeoCache.set(key, g);
  return g;
}
// Right hand wrapped around a grip whose axis is local Y (front of the grip -Z):
// back of the hand faces +X, fingers curl around the front, thumb on the left.
function gripHandGeometry(scale = 1) {
  const key = 'hand' + scale.toFixed(3);
  if (armGeoCache.has(key)) return armGeoCache.get(key);
  const P = new Piece({ region: REG.HAND });
  const R = RECT.hand;
  const sub = (x0, w) => [R[0] + x0 * R[2], R[1], w * R[2], R[3]];
  // palm: wrist -> knuckles, flattened, widening towards the knuckle line
  sweep(P, [[WRIST[0], WRIST[1], WRIST[2] + 0.004], [0.023, -0.016, 0.05], [0.026, -0.009, 0.026], [0.028, -0.005, 0.008], [0.029, -0.005, -0.002]],
    [[0.019, 0.02], [0.016, 0.03], [0.0145, 0.037], [0.0135, 0.04], [0.012, 0.038]], 16, sub(0, 0.45), { up: [1, 0, 0], capStart: true });
  // thenar pad joining palm and thumb
  const k0 = P.count;
  ellipsoid(P, [0.004, -0.014, 0.04], [0.02, 0.024, 0.028], 10, 8, sub(0, 0.45));
  // fingers wrap around the grip in three phalanges
  const F = [{ y: 0.024, len: 0.074, r: 0.0098 }, { y: 0.004, len: 0.082, r: 0.0098 }, { y: -0.016, len: 0.077, r: 0.0092 }, { y: -0.035, len: 0.063, r: 0.0082 }];
  const Rg = 0.0265;
  F.forEach((f, fi) => {
    const Ls = [f.len * 0.46, f.len * 0.3, f.len * 0.24];
    let th = -0.12 - fi * 0.03;
    const pts = [[0.03 * Math.cos(th) + 0.004, f.y + 0.004, 0.03 * Math.sin(th) + 0.012]], rad = [[f.r * 1.05, f.r * 1.1]];
    let p = [Rg * 1.08 * Math.cos(th), f.y, Rg * 1.08 * Math.sin(th)];
    pts.push(p.slice()); rad.push([f.r, f.r * 1.05]);
    for (let s = 0; s < 3; s++) {
      const rr = Rg * (1.05 - s * 0.03);
      th -= Ls[s] / rr;
      const q = [rr * Math.cos(th), f.y - s * 0.002, rr * Math.sin(th)];
      // two samples per phalanx: straight chords give visible knuckles
      pts.push([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]);
      rad.push([f.r * (0.97 - s * 0.08), f.r * (1 - s * 0.08)]);
      pts.push(q); rad.push([f.r * (0.95 - s * 0.09), f.r * (0.98 - s * 0.09)]);
      p = q;
    }
    sweep(P, pts, rad, 10, sub(0.5 + fi * 0.1, 0.1), { up: [0, 1, 0], capEnd: true });
  });
  // thumb along the left side, tip forward
  sweep(P, [[0.006, -0.012, 0.046], [-0.008, -0.002, 0.034], [-0.019, 0.01, 0.016], [-0.023, 0.018, -0.004], [-0.022, 0.023, -0.022], [-0.019, 0.026, -0.034]],
    [0.0135, 0.013, 0.0118, 0.011, 0.0102, 0.0095], 10, sub(0.9, 0.1), { up: [-1, 0.6, 0], capEnd: true });
  if (scale !== 1) for (let i = 0; i < P.p.length; i++) P.p[i] *= scale;
  const g = pieceGeometry([P]);
  armGeoCache.set(key, g);
  return g;
}

function makeArm(char, side) {
  const g = new THREE.Group();
  const asset = getCharacterAsset({ id: char.look || char.id, skin: char.skin, shirt: char.sleeve, pants: char.body?.pants, hair: char.body?.hair });
  const [matA, matB] = asset.materials;
  const upper = new THREE.Group();
  const lower = new THREE.Group();
  lower.add(new THREE.Mesh(forearmGeometry(asset.armBulk), matA));
  for (const L of asset.viewSleeves) lower.add(new THREE.Mesh(sleeveGeometry(L, asset.armBulk), (L.mat ?? 1) === 1 ? matB : matA));
  const hand = new THREE.Group();
  hand.add(new THREE.Mesh(gripHandGeometry(asset.handScale), matA));
  if (side < 0) hand.scale.x = -1;
  g.add(upper); g.add(lower); g.add(hand);
  g.userData = { upper, lower, hand };
  g.traverse((o) => { o.layers.set(1); o.frustumCulled = false; if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

// Per-kind hand placement in holder space: [x,y,z, rx,ry,rz]
const HANDS = {
  pistol: { R: [0, -0.035, 0.005, 0.25, 0, 0], L: [-0.012, -0.055, 0.03, 0.35, -0.5, 0.25] },
  dual: { R: [0, -0.035, 0.005, 0.25, 0, 0], L: [-0.3, -0.035, 0.005, 0.25, 0, 0] },
  smg: { R: [0, -0.04, 0.0, 0.1, 0, 0], L: 'gripL' },
  shotgun: { R: [0, -0.035, 0.035, 0.25, 0, 0], L: 'gripL' },
  rifle: { R: [0, -0.045, 0.06, 0.3, 0, 0], L: 'gripL' },
  sniper: { R: [0, -0.03, 0.08, 0.3, 0, 0], L: 'gripL' },
  heavy: { R: [0, -0.055, 0.08, 0.3, 0, 0], L: 'gripL' },
  launcher: { R: [0, -0.045, 0.04, 0.3, 0, 0], L: 'gripL' },
  melee: { R: [0, 0.02, 0, 0, 0, 0], L: [0, 0.2, 0, 0, 0, 0] },
  throwable: { R: [0, -0.02, 0, 0, 0, 0], L: null },
  medkit: { R: [0.1, -0.02, 0.02, 0, 0, -1.3], L: [-0.1, -0.02, 0.02, 0, 0, 1.3] },
  pills: { R: [0, -0.01, 0, 0, 0, 0], L: null },
  minigun: { R: [0.14, -0.04, 0.32, 0, 0, 0], L: [-0.14, -0.04, 0.32, 0, 0, 0] },
};
const FOREGRIP_ROT = new THREE.Euler(-Math.PI / 2, 0, -Math.PI / 2, 'XYZ');
const FOREGRIP_Q = new THREE.Quaternion().setFromEuler(FOREGRIP_ROT);

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _tmpE = new THREE.Vector3(), _tmpD = new THREE.Vector3(), _e = new THREE.Euler();
const _bx = new THREE.Vector3(), _bz = new THREE.Vector3();
const _pA = new THREE.Vector3(), _pB = new THREE.Vector3(), _pC = new THREE.Vector3(), _pD = new THREE.Vector3(), _pR = new THREE.Vector3();
const _qA = new THREE.Quaternion(), _qB = new THREE.Quaternion(), _qC = new THREE.Quaternion(), _qD = new THREE.Quaternion(), _qR = new THREE.Quaternion();
const _hq = new THREE.Quaternion(), _hp = new THREE.Vector3(), _pE = new THREE.Vector3(), _qE = new THREE.Quaternion(), _qT = new THREE.Quaternion();
const _box = new THREE.Box3(), _box2 = new THREE.Box3();
const _up = new THREE.Vector3(), _right = new THREE.Vector3();

// easing helpers (k = normalised time)
const seg = (k, a, b) => clamp((k - a) / (b - a), 0, 1);
const ss = (k, a, b) => easeInOutSine(seg(k, a, b));
const eo = (k, a, b) => easeOutCubic(seg(k, a, b));
const ei = (k, a, b) => { const x = seg(k, a, b); return x * x * x; };
const bump = (k, c, w) => { const x = (k - c) / w; return x > -1 && x < 1 ? 0.5 + 0.5 * Math.cos(x * Math.PI) : 0; };
const qe = (out, x, y, z) => out.setFromEuler(_e.set(x, y, z));

// Melee arcs: key poses (deltas on the melee hip pose) [px,py,pz, rx,ry,rz].
// A = forehand, high right -> low left; B = backhand, left -> right.
const SWING = {
  A: { wind: [0.07, 0.13, 0.07, 0.55, -0.35, -0.7], hit: [-0.12, -0.02, -0.16, -0.55, 0.55, 0.75], end: [-0.34, -0.22, -0.02, -1.1, 0.95, 1.25] },
  B: { wind: [-0.2, 0.05, 0.02, 0.1, 0.65, 1.35], hit: [0.02, -0.04, -0.17, -0.35, -0.15, 0.25], end: [0.3, -0.16, 0.02, -0.65, -0.75, -0.75] },
};
// Where the off hand grabs each action part: [x,y,z] offset in the part's frame + hand euler.
const CHARGE_GRIP = {
  rifle: { part: 'charge', p: [0, 0.018, 0.012], e: [0, 0, Math.PI / 2], pull: [0, 0, 0.07] },
  scar: { part: 'charge', p: [-0.022, 0.0, 0.014], e: [0.1, 0, 0], pull: [0, 0, 0.085] },
  smg: { part: 'bolt', p: [0, 0.022, 0.016], e: [0.2, 0, 0], pull: [0, 0, 0.05] },
  silencedSmg: { part: 'bolt', p: [0, 0.022, 0.016], e: [0.2, 0, 0], pull: [0, 0, 0.05] },
  huntingRifle: { part: 'bolt', p: [0.035, 0.0, 0.016], e: [0.1, 0, 0.2], pull: [0, 0, 0.06], lift: 0.9 },
  autoShotgun: { part: 'bolt', p: [0.018, 0.0, 0.014], e: [0.1, 0, 0], pull: [0, 0, 0.045] },
  pistol: { part: 'slide', p: [0, 0.05, 0.07], e: [0, 0, Math.PI / 2], pull: [0, 0, 0.032] },
  magnum: { part: 'slide', p: [0, 0.05, 0.07], e: [0, 0, Math.PI / 2], pull: [0, 0, 0.032] },
};
const BLOWBACK = { pistol: ['slide', 0.03], magnum: ['slide', 0.034], smg: ['bolt', 0.022], silencedSmg: ['bolt', 0.022], huntingRifle: ['bolt', 0.035], autoShotgun: ['bolt', 0.03] };
const PARTS = ['slide', 'bolt', 'charge', 'pump', 'breach', 'round', 'mag'];

function shellMesh() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.0102, 0.0102, 0.052, 12), new THREE.MeshStandardMaterial({ color: 0x9a1a14, roughness: 0.55, metalness: 0.05 }));
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.0112, 0.0108, 0.014, 12), new THREE.MeshStandardMaterial({ color: 0xc49a4c, roughness: 0.3, metalness: 1 }));
  hull.position.y = 0.019; head.position.y = -0.013;
  g.add(hull, head);
  g.traverse((o) => { o.layers.set(1); o.frustumCulled = false; });
  return g;
}

export class Viewmodel {
  constructor(game, camera) {
    this.game = game;
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.name = 'viewmodel';
    camera.add(this.root);
    this.holder = new THREE.Group(); // weapon transform
    this.root.add(this.holder);
    this.model = null;
    this.type = null;
    this.char = null;
    this.armL = null; this.armR = null;
    this.swayX = 0; this.swayY = 0;
    this.kickZ = 0; this.kickVZ = 0; this.kickRX = 0; this.kickVRX = 0; this.kickRZ = 0; this.kickRY = 0; this.kickVRY = 0;
    this.bobT = 0;
    this.sprintK = 0;
    this.drawK = 1;
    this.holsterT = -1;
    this.pending = null;
    this.anim = null; // {type, t, dur, ...}
    this.pumpA = -1; // pump stroke timer
    this.blowT = [1, 1]; // time since each gun cycled (dual: [right,left])
    this.lowered = 0;
    this.visible = true;
    this.flashMesh = null;
    this.muzzleWorld = new THREE.Vector3();
    this.landDip = 0;
    this.spinSpeed = 0;
    this.swingDir = 1;
    this.ofs = new Float32Array(6); // smoothed animation pose delta
    this.tgt = new Float32Array(6);
    this.lhP = new THREE.Vector3(); this.lhQ = new THREE.Quaternion(); this.lhFG = 1; this.lhInit = false;
    this.shell = shellMesh();
    this.shell.visible = false;
  }
  setCharacter(char) {
    if (this.char === char) return;
    this.char = char;
    if (this.armL) { this.root.remove(this.armL); this.root.remove(this.armR); }
    this.armL = makeArm(char, -1);
    this.armR = makeArm(char, 1);
    this.root.add(this.armL);
    this.root.add(this.armR);
    this.armL.userData.hand.add(this.shell);
    this.shell.position.set(0.0, 0.012, -0.004);
  }
  setItem(type, dual = false) {
    const key = type + (dual ? ':dual' : '');
    if (this.type === key) return;
    this.type = key;
    if (this.model) { this.resetParts(this.model); this.holder.remove(this.model); }
    this.model = null;
    this.lhInit = false;
    if (!type) return;
    const mt = type === 'pistol' && dual ? 'dualPistols' : TYPE_MODEL[type];
    // models are built once per type and reused (they are fairly detailed)
    if (!this.modelCache) this.modelCache = new Map();
    let m = mt ? this.modelCache.get(mt) : null;
    if (mt && !m) {
      m = buildModel(mt);
      if (m) {
        m.traverse((o) => { o.layers.set(1); o.castShadow = false; o.frustumCulled = false; });
        // muzzle flash billboard (two crossed planes)
        const fm = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffc080 }));
        fm.layers.set(1);
        const fm2 = fm.clone();
        fm2.rotation.y = Math.PI / 2;
        fm.add(fm2);
        m.userData.muzzle?.add(fm);
        m.userData._flash = fm;
        this.recordBases(m);
        if (m.userData.left) { this.recordBases(m.userData.left); this.recordBases(m.userData.right); }
        this.modelCache.set(mt, m);
      }
    }
    this.model = m || null;
    this.modelType = type;
    if (this.model) {
      this.holder.add(this.model);
      this.flashMesh = this.model.userData._flash || null;
      if (this.flashMesh) {
        this.flashMesh.visible = false;
        if (this.model.userData.muzzle && this.flashMesh.parent !== this.model.userData.muzzle) this.model.userData.muzzle.add(this.flashMesh);
      }
    } else this.flashMesh = null;
    this.kind = this.kindOf(type, dual);
    this.drawK = 0;
    this.anim = null;
    this.pumpA = -1;
    this.shell.visible = false;
  }
  recordBases(m) {
    const ud = m.userData;
    for (const k of PARTS) {
      const o = ud[k];
      if (o && !o.userData.base) o.userData.base = { p: o.position.clone(), r: o.rotation.clone() };
    }
    if (ud.left) { ud.left.userData.base = { p: ud.left.position.clone(), r: ud.left.rotation.clone() }; ud.right.userData.base = { p: ud.right.position.clone(), r: ud.right.rotation.clone() }; }
  }
  resetParts(m) {
    const list = m.userData.left ? [m, m.userData.left, m.userData.right] : [m];
    for (const g of list) {
      for (const k of PARTS) {
        const o = g.userData[k];
        const b = o?.userData.base;
        if (!b) continue;
        o.position.copy(b.p); o.rotation.copy(b.r);
        if (k === 'round') o.visible = false; else o.visible = true;
      }
      if (g !== m && g.userData.base) { g.position.copy(g.userData.base.p); g.rotation.copy(g.userData.base.r); }
    }
  }
  kindOf(type, dual) {
    const def = this.game.weaponDef(type);
    if (!def) {
      if (type === 'medkit') return 'medkit';
      if (type === 'pills' || type === 'adrenaline') return 'pills';
      return 'throwable';
    }
    if (def.melee) return 'melee';
    if (def.kind === 'pistol') return dual ? 'dual' : 'pistol';
    return def.kind;
  }
  // events from weapon / survivor
  event(e, data) {
    const w = this.game.player?.weapon;
    const d = w?.def;
    const a = this.anim;
    switch (e) {
      case 'fire': {
        const k = d ? d.viewKick : 1;
        const shotgun = d && d.kind === 'shotgun';
        this.kickVZ += (1.6 * k + 0.4) * (shotgun ? 1.25 : 1);
        this.kickVRX += (2.5 + Math.random()) * k * (shotgun ? 1.2 : 1);
        this.kickVRY += (Math.random() - 0.5) * 1.6 * k;
        this.kickRZ = (Math.random() - 0.5) * 0.05 * k;
        if (this.flashMesh && !d?.silenced) {
          this.flashMesh.visible = true;
          this.flashMesh.rotation.z = Math.random() * TAU;
          const s = 0.7 + Math.random() * 0.6;
          this.flashMesh.scale.setScalar(shotgun ? s * 1.6 : s);
          this.flashT = 0.04;
        }
        if (this.kind === 'dual' && this.model?.userData.left) {
          // alternate hands: w.dualSide was toggled by the shot (1 = right just fired)
          const side = w.dualSide ? this.model.userData.right : this.model.userData.left;
          const mz = side.userData.muzzle || side.children.find((c) => c.name === 'muzzle');
          if (mz && this.flashMesh && !d?.silenced) mz.add(this.flashMesh);
          this.dualKick = w.dualSide ? 1 : -1;
          this.blowT[w.dualSide ? 0 : 1] = 0;
        } else this.blowT[0] = 0;
        this.ejectShell();
        break;
      }
      case 'reload': {
        if (!d) break;
        const empty = w.clip === 0;
        if (d.shellReload) this.anim = { type: 'shells', t: 0, dur: 1e9, phase: 0, cyc: 0, endT: 0, empty, period: d.reload, start: d.reloadStart || 0.35 };
        else if (this.kind === 'dual') this.anim = { type: 'dualReload', t: 0, dur: d.reload * 1.35, R: d.reload, empty };
        else this.anim = { type: d.kind === 'launcher' ? 'launcherReload' : 'reload', t: 0, dur: d.reload, empty };
        break;
      }
      case 'shellStart': if (a?.type === 'shells') { a.phase = 1; a.cyc = 0; } break;
      case 'shell': if (a?.type === 'shells') { a.cyc = 0; a.jolt = 0; } break;
      case 'reloadEnd':
        if (a?.type === 'shells') {
          if (a.phase === 2) break; // end phase already running
          // natural end (weapon went through its end phase) vs. interrupted to fire
          const interrupted = a.phase === 1 && (w?.reloadPhase ?? 1) === 1;
          a.phase = 2; a.endT = 0; a.interrupted = interrupted;
          a.rack = a.empty && !interrupted;
        } else if (a && (a.type === 'reload' || a.type === 'dualReload' || a.type === 'launcherReload')) a.done = true;
        break;
      case 'reloadCancel':
        if (a && ['reload', 'dualReload', 'launcherReload', 'shells'].includes(a.type)) this.anim = null;
        break;
      case 'pump': this.pumpA = 0; break;
      case 'swing': {
        this.swingDir = -this.swingDir;
        this.anim = { type: 'swing', t: 0, dur: (d?.interval ?? 0.8) * 0.95, hit: d?.windup ?? 0.12, arc: this.swingDir > 0 ? SWING.A : SWING.B };
        break;
      }
      case 'shove': this.anim = { type: 'shove', t: 0, dur: 0.4 }; break;
      case 'draw': this.drawK = 0; break;
      case 'throwWindup': this.anim = { type: 'windup', t: 0, dur: 1e9 }; break;
      case 'throw': this.anim = { type: 'throw', t: 0, dur: 0.38 }; break;
      case 'actionStart':
        if (data.type === 'heal') this.anim = { type: 'heal', t: 0, dur: data.dur };
        else if (data.type === 'pills') this.anim = { type: 'pills', t: 0, dur: data.dur };
        else if (data.type === 'revive' || data.type === 'use') this.anim = { type: 'lower', t: 0, dur: 1e9 };
        break;
      case 'actionCancel':
      case 'actionDone':
        if (this.anim && ['heal', 'pills', 'lower'].includes(this.anim.type)) this.anim = null;
        break;
      case 'land': this.landDip = Math.min(0.08, 0.02 + (data || 0) * 0.015); break;
      case 'dry': this.kickVRX -= 0.5; this.kickVZ -= 0.3; break;
    }
  }
  ejectShell() {
    const m = this.model;
    const def = this.game.player?.weapon?.def;
    if (!m || !def || def.shellType === 'none' || def.melee) return;
    let ej = m.userData.eject;
    if (this.kind === 'dual' && m.userData.left) ej = (this.game.player.weapon.dualSide ? m.userData.right : m.userData.left).userData.eject || ej;
    if (!ej) return;
    ej.getWorldPosition(_v);
    const cam = this.camera;
    const right = _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const pv = this.game.player.phys;
    const vx = right.x * 2.2 + up.x * 1.8 + pv.vx, vy = right.y * 2.2 + up.y * 1.8 + 0.5, vz = right.z * 2.2 + up.z * 1.8 + pv.vz;
    this.game.shells?.spawn(_v.x, _v.y, _v.z, vx, vy, vz, def.shellType);
  }
  sound(name) {
    const p = this.game.player;
    this.game.audio?.play?.(name, { pos: p?.pos, owner: p, vol: 0.6 });
  }

  // ------------------------------------------------------------ helpers --
  // point in an object's local frame -> holder space
  toHolder(obj, x, y, z, out) {
    out.set(x, y, z);
    for (let o = obj; o && o !== this.holder; o = o.parent) { o.updateMatrix(); out.applyMatrix4(o.matrix); }
    return out;
  }
  quatToHolder(obj, out) {
    out.identity();
    for (let o = obj; o && o !== this.holder; o = o.parent) out.premultiply(o.quaternion);
    return out;
  }
  // magazine: bottom-centre in its local frame + axis
  magInfo(mag) {
    let I = mag.userData.info;
    if (!I) {
      _box.makeEmpty();
      mag.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); _box2.copy(o.geometry.boundingBox).applyMatrix4(o.matrix); _box.union(_box2); } });
      I = mag.userData.info = { bot: _box.min.y, top: _box.max.y, cx: (_box.min.x + _box.max.x) / 2, cz: (_box.min.z + _box.max.z) / 2 };
    }
    return I;
  }
  // magazine offset along its own axis (d > 0 = out of the well) + tumble
  setMag(mag, d, tumble = 0, vis = true) {
    const b = mag.userData.base;
    if (!b) return;
    _q.setFromEuler(b.r);
    _v.set(0, -d, 0).applyQuaternion(_q);
    mag.position.copy(b.p).add(_v);
    mag.rotation.set(b.r.x + tumble, b.r.y + tumble * 0.4, b.r.z - tumble * 0.3);
    mag.visible = vis;
  }
  // off-hand grab point on a magazine (holder space)
  magGrip(mag, outP, outQ) {
    const I = this.magInfo(mag);
    this.toHolder(mag, I.cx, I.bot + 0.03, I.cz + 0.004, outP);
    this.quatToHolder(mag, outQ).multiply(qe(_qT, 0.12, 0, 0));
  }
  partGrip(spec, outP, outQ) {
    const part = this.model.userData[spec.part];
    if (!part) return false;
    this.toHolder(part, spec.p[0], spec.p[1], spec.p[2], outP);
    this.quatToHolder(part.parent, outQ).multiply(qe(_qT, spec.e[0], spec.e[1], spec.e[2]));
    return true;
  }
  setPart(o, dx, dy, dz, rz = 0) {
    const b = o?.userData.base;
    if (!b) return;
    o.position.set(b.p.x + dx, b.p.y + dy, b.p.z + dz);
    o.rotation.set(b.r.x, b.r.y, b.r.z + rz);
  }
  // lerp/slerp the off-hand target between two holder-space poses
  static blend(pA, qA, pB, qB, t, outP, outQ) {
    outP.copy(pA).lerp(pB, t);
    outQ.copy(qA).slerp(qB, t);
  }

  update(dt, s, look) {
    if (!s) return;
    this.setCharacter(s.char);
    const item = s.usingMounted ? 'minigun' : s.activeItem;
    const dual = !s.usingMounted && s.slot === 1 && s.inv.secondary.dual;
    const key = item + (dual ? ':dual' : '');
    // holster the old item briefly before drawing the new one
    if (key !== this.type) {
      if (this.model && this.holsterT < 0 && !s.usingMounted && this.type && !this.type.startsWith('minigun')) this.holsterT = 0;
      if (this.holsterT >= 0) { this.holsterT += dt; if (this.holsterT >= 0.11) { this.holsterT = -1; this.setItem(item, dual); } }
      else this.setItem(item, dual);
    } else this.holsterT = -1;
    const kind = s.usingMounted ? 'minigun' : this.kind;
    this.root.visible = this.visible && !(s.weapon && s.weapon.zoomed) && !s.dead;
    if (!this.model || !kind) { if (this.armL) { this.armL.visible = this.armR.visible = false; } return; }
    this.armL.visible = this.armR.visible = true;
    const ud = this.model.userData;
    const w = s.weapon && s.weapon.type === this.modelType ? s.weapon : null;
    const def = w?.def;
    const base = POSE[kind] || POSE.rifle;
    const t = this.game.time;
    // springs
    this.kickVZ += (-120 * this.kickZ - 16 * this.kickVZ) * dt;
    this.kickZ += this.kickVZ * dt;
    this.kickVRX += (-140 * this.kickRX - 15 * this.kickVRX) * dt;
    this.kickRX += this.kickVRX * dt;
    this.kickVRY += (-160 * this.kickRY - 18 * this.kickVRY) * dt;
    this.kickRY += this.kickVRY * dt;
    this.kickRZ = damp(this.kickRZ, 0, 10, dt);
    this.drawK = Math.min(1, this.drawK + dt * 2.9);
    this.landDip = damp(this.landDip, 0, 8, dt);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0 && this.flashMesh) this.flashMesh.visible = false; }
    this.blowT[0] += dt; this.blowT[1] += dt;
    // sway (lag against look)
    this.swayX = clamp(damp(this.swayX + (look?.dx || 0) * 0.9, 0, 9, dt), -0.12, 0.12);
    this.swayY = clamp(damp(this.swayY + (look?.dy || 0) * 0.9, 0, 9, dt), -0.1, 0.1);
    // bob
    const sp = Math.hypot(s.phys.vx, s.phys.vz);
    const ground = s.phys.onGround ? 1 : 0;
    this.bobT += dt * sp * 1.9 * ground;
    const bobK = clamp(sp / 4.4, 0, 1.4) * ground;
    this.sprintK = damp(this.sprintK, s.sprinting ? 1 : 0, 8, dt);
    this.lowered = damp(this.lowered, s.incapped ? 1 : 0, 6, dt);

    let px = base[0], py = base[1], pz = base[2], rx = base[3], ry = base[4], rz = base[5];
    // idle breathing sway
    const idle = 1 - clamp(bobK, 0, 1) * 0.6;
    px += Math.sin(t * 0.83) * 0.0022 * idle; py += Math.sin(t * 1.37) * 0.0028 * idle;
    rz += Math.sin(t * 0.61) * 0.008 * idle; rx += Math.sin(t * 1.37 + 0.6) * 0.006 * idle;
    // walk bob: figure-8 with a dip on each footfall
    const bb = this.bobT, amp = 1 + this.sprintK * 0.6;
    px += Math.sin(bb) * 0.011 * bobK * amp;
    py += -Math.abs(Math.cos(bb)) * 0.012 * bobK * amp;
    rz += Math.sin(bb) * 0.014 * bobK * amp; ry += Math.sin(bb) * 0.01 * bobK;
    rx += (Math.abs(Math.cos(bb)) - 0.5) * 0.012 * bobK;
    // look sway
    px += this.swayX * 0.12; py -= this.swayY * 0.12;
    ry += this.swayX * 0.8; rx += this.swayY * 0.8; rz += this.swayX * 0.35;
    // sprint: gun rolled across the chest, muzzle low
    const spK = this.sprintK * (kind === 'melee' ? 0.4 : kind === 'pistol' || kind === 'dual' ? 0.6 : 1) * (this.anim && this.anim.type !== 'swing' ? 0.3 : 1);
    px -= 0.05 * spK; py -= 0.055 * spK; pz += 0.02 * spK; rx -= 0.38 * spK; ry += 0.78 * spK; rz += 0.3 * spK;
    // crouch / incap
    py -= 0.015 * s.crouchT;
    py -= 0.05 * this.lowered; rz += 0.35 * this.lowered;
    // draw (eased with a small settle) / holster
    const dk = this.drawK;
    const de = dk < 1 ? 1 - Math.pow(1 - dk, 3) + Math.sin(dk * Math.PI) * 0.06 : 1;
    py -= (1 - de) * 0.28; rx -= (1 - de) * 0.75; rz -= (1 - de) * 0.3; px += (1 - de) * 0.04;
    if (this.holsterT >= 0) { const h = easeInOutSine(Math.min(1, this.holsterT / 0.11)); py -= h * 0.26; rx -= h * 0.7; rz -= h * 0.2; }
    // recoil: kick back, muzzle rise, a little yaw
    pz += this.kickZ * 0.05; rx += this.kickRX * 0.06; rz += this.kickRZ; ry += this.kickRY * 0.03;
    if (this.dualKick && kind === 'dual') px += this.dualKick * this.kickZ * 0.008;
    // landing
    py -= this.landDip; rx -= this.landDip * 1.5;

    // ------------------------------------------------ animations
    const T = this.tgt; T.fill(0);
    this.shell.visible = false;
    for (const g of ud.left ? [ud.left, ud.right] : [this.model]) {
      // parts back to rest; animations below move them
      for (const k of PARTS) { const o = g.userData[k]; if (o?.userData.base && k !== 'mag' && k !== 'round') { o.position.copy(o.userData.base.p); o.rotation.copy(o.userData.base.r); } }
      if (g.userData.mag?.userData.base) this.setMag(g.userData.mag, 0);
      if (g !== this.model && g.userData.base) { g.position.copy(g.userData.base.p); g.rotation.copy(g.userData.base.r); }
    }
    if (ud.round) ud.round.visible = false;
    // pump stroke after a shot (the off hand rides the fore-end)
    if (ud.pump && this.pumpA >= 0) {
      this.pumpA += dt;
      const pt = this.pumpA;
      const off = pt < 0.08 ? 0 : pt < 0.25 ? eo(pt, 0.08, 0.25) : 1 - ei(pt, 0.25, 0.42);
      this.setPart(ud.pump, 0, 0, 0.085 * off);
      T[5] += 0.06 * off; T[1] -= 0.008 * off; T[2] += 0.012 * off; T[3] += 0.03 * off;
      if (pt > 0.45) this.pumpA = -1;
    }
    // rest off-hand pose (holder space)
    const H = HANDS[kind] || HANDS.rifle;
    const restP = _pR, restQ = _qR;
    let lVis = true, lFG = 0;
    let lspec = H.L;
    if (lspec === 'gripL') {
      const gl = ud.gripL;
      if (gl) { this.toHolder(gl, 0, -0.03, 0, restP); restQ.copy(FOREGRIP_Q); }
      else { restP.set(-0.02, -0.06, -0.25); restQ.copy(FOREGRIP_Q); }
      lFG = 1;
    } else if (lspec) { restP.set(lspec[0], lspec[1], lspec[2]); qe(restQ, lspec[3], lspec[4], lspec[5]); }
    else lVis = false;
    const LP = _hp.copy(restP), LQ = _hq.copy(restQ);
    let fgK = lFG;
    // fire blowback + slide lock on empty
    const bl = BLOWBACK[this.modelType];
    const blow = (bt) => (bt < 0.018 ? bt / 0.018 : Math.max(0, 1 - (bt - 0.018) / 0.05));
    const lockedEmpty = w && w.clip === 0 && !w.def.shellReload;
    let slideLock = lockedEmpty ? 1 : 0;
    const a = this.anim;
    if (a) {
      a.t += dt;
      const k = clamp(a.t / a.dur, 0, 1);
      switch (a.type) {
        case 'reload': this.animReload(a, k, T, LP, LQ, kind); slideLock = a.slideLock; break;
        case 'dualReload': slideLock = this.animDual(a, T); break;
        case 'launcherReload': this.animLauncher(a, k, T, LP, LQ, restP, restQ); break;
        case 'shells': this.animShells(a, dt, T, LP, LQ, restP, restQ); break;
        case 'swing': {
          const W = a.hit, A = a.arc, tt = a.t;
          const wK = ss(tt, 0, W * 0.8), hK = ei(tt, W * 0.8, W), eK = eo(tt, W, W + 0.13), rK = ss(tt, W + 0.2, a.dur);
          for (let i = 0; i < 6; i++) {
            let v = A.wind[i] * wK;
            v += (A.hit[i] - A.wind[i]) * hK;
            v += (A.end[i] - A.hit[i]) * eK;
            v -= A.end[i] * rK;
            T[i] += v;
          }
          if (tt >= a.dur) this.anim = null;
          break;
        }
        case 'shove': {
          const sk = k < 0.3 ? eo(k, 0, 0.3) : 1 - ss(k, 0.42, 1);
          T[0] -= 0.13 * sk; T[1] += 0.035 * sk; T[2] -= 0.12 * sk; T[3] -= 0.12 * sk; T[4] += 0.38 * sk; T[5] += 0.85 * sk;
          if (a.t >= a.dur) this.anim = null;
          break;
        }
        case 'windup': {
          const wk = eo(a.t, 0, 0.3);
          T[0] += 0.05 * wk; T[1] += 0.12 * wk; T[2] += 0.14 * wk; T[3] -= 0.7 * wk; T[5] -= 0.15 * wk;
          break;
        }
        case 'throw': {
          const tk = eo(k, 0, 0.6), rk = ss(k, 0.6, 1);
          T[1] += 0.12 - tk * 0.32 + rk * 0.2; T[2] += 0.14 - tk * 0.44 + rk * 0.3; T[3] += -0.7 + tk * 1.3 - rk * 0.6;
          if (a.t >= a.dur) this.anim = null;
          break;
        }
        case 'heal': {
          const hk = eo(a.t, 0, 0.4);
          T[1] -= 0.08 * hk; T[3] += 0.5 * hk;
          T[0] += Math.sin(a.t * 6) * 0.02 * hk; T[5] += Math.sin(a.t * 3.1) * 0.1 * hk;
          LP.x += Math.sin(a.t * 9) * 0.02; LP.y += Math.cos(a.t * 7) * 0.015;
          break;
        }
        case 'pills': {
          T[5] += Math.sin(k * 40) * 0.2 * (k < 0.6 ? 1 : 0);
          T[1] += k > 0.6 ? (k - 0.6) * 0.3 : 0; T[3] -= k > 0.6 ? (k - 0.6) * 2 : 0;
          if (a.t >= a.dur) this.anim = null;
          break;
        }
        case 'lower': {
          const lk = ss(a.t, 0, 0.3);
          T[1] -= 0.25 * lk; T[3] -= 0.5 * lk;
          break;
        }
      }
      if (a.done && this.anim === a && a.t >= a.dur - 0.02) this.anim = null;
      if (this.anim === a && a.t > a.dur + 0.3 && a.dur < 100) this.anim = null;
    }
    // elbow reach blends away from the fore-grip as the off hand leaves it
    fgK = lFG * clamp(1 - LP.distanceTo(restP) / 0.08, 0, 1);
    // blowback on fire (slide / bolt) and slide lock
    if (bl) {
      const gs = ud.left ? [ud.right, ud.left] : [this.model];
      gs.forEach((g, i) => {
        const o = g.userData[bl[0]];
        if (!o) return;
        const lock = typeof slideLock === 'number' ? slideLock : slideLock[i];
        const pulled = o.position.z - o.userData.base.p.z;
        const b = Math.max(blow(this.blowT[i]), bl[0] === 'slide' ? lock : 0);
        if (b * bl[1] > pulled) this.setPart(o, 0, 0, bl[1] * b);
      });
    }
    // minigun spin
    const spin = ud.spin;
    if (spin) {
      this.spinSpeed = damp(this.spinSpeed, s.cmd.fire ? 40 : 0, 3, dt);
      spin.rotation.z += this.spinSpeed * dt;
    }
    if (ud.flame) ud.flame.scale.setScalar(0.8 + Math.random() * 0.5);

    // smooth the animation pose (eases blends into and out of every anim, incl. interrupts)
    const fast = a && (a.type === 'swing' || a.type === 'shove') && this.anim === a;
    const O = this.ofs, sk = 1 - Math.exp(-(fast ? 80 : 26) * dt);
    for (let i = 0; i < 6; i++) O[i] += (T[i] - O[i]) * sk;
    this.holder.position.set(px + O[0], py + O[1], pz + O[2]);
    this.holder.rotation.set(rx + O[3], ry + O[4], rz + O[5], 'YXZ');
    this.holder.updateMatrix();
    this.root.updateMatrixWorld(true);

    // ------------------------------------------------ hands & forearms
    const hq = this.holder.quaternion;
    const hr = ud.handR;
    if (kind === 'dual' && ud.left && hr) {
      this.placeGunHand(this.armR, ud.right, hr, 1, hq);
      this.placeGunHand(this.armL, ud.left, hr, -1, hq);
      this.armL.visible = true;
      return;
    }
    const rspec = hr && kind !== 'minigun' ? hr : H.R;
    _pA.set(rspec[0], rspec[1], rspec[2]); qe(_qA, rspec[3], rspec[4], rspec[5]);
    this.placeHand(this.armR, _pA, _qA, 1, hq, 0);
    if (!lVis) { this.armL.visible = false; return; }
    // off hand: smoothed in holder space so it glides between grips
    if (!this.lhInit) { this.lhP.copy(LP); this.lhQ.copy(LQ); this.lhFG = fgK; this.lhInit = true; }
    const hk = 1 - Math.exp(-(a ? 30 : 20) * dt);
    this.lhP.lerp(LP, hk); this.lhQ.slerp(LQ, hk); this.lhFG += (fgK - this.lhFG) * hk;
    this.armL.visible = true;
    this.placeHand(this.armL, this.lhP, this.lhQ, -1, hq, this.lhFG);
  }

  // ------------------------------------------------ magazine reloads
  // Sound sync (session.js): magOut at 0, magIn at 45 %, slide/bolt at 85 %.
  animReload(a, k, T, LP, LQ, kind) {
    const ud = this.model.userData;
    const mag = ud.mag;
    const pistol = kind === 'pistol';
    const tilt = ss(k, 0, 0.13) * (1 - ss(k, 0.86, 1));
    if (pistol) { T[3] += 0.3 * tilt; T[5] -= 0.38 * tilt; T[0] -= 0.035 * tilt; T[1] += 0.015 * tilt; T[4] += 0.12 * tilt; }
    else { T[5] += 0.45 * tilt; T[3] += 0.2 * tilt; T[0] -= 0.045 * tilt; T[1] += 0.02 * tilt; T[4] -= 0.1 * tilt; }
    // seat jolt at magIn
    const j = bump(k, 0.465, 0.035);
    T[1] += 0.012 * j; T[3] += 0.05 * j;
    // magazine: release, drop (gravity), new one rises and seats
    if (mag) {
      let d = 0, tum = 0, vis = true;
      const rel = pistol ? 0.05 : 0.08;
      if (k < rel) d = 0;
      else if (k < rel + 0.08) d = 0.022 * ss(k, rel, rel + 0.08);
      else if (k < 0.3) { const f = seg(k, rel + 0.08, 0.3); d = 0.022 + 0.5 * f * f; tum = 0.7 * f * f; vis = f < 0.92; }
      else if (k < 0.41) { d = 0.3 * (1 - eo(k, 0.3, 0.41)) + 0.014; vis = true; }
      else if (k < 0.45) d = 0.014 * (1 - ei(k, 0.41, 0.45));
      this.setMag(mag, d, tum, vis);
    }
    // off hand
    const belt = _pC.set(pistol ? 0.0 : -0.04, -0.34, 0.1), beltQ = qe(_qC, 0.4, 0, 0.3);
    const mP = _pD, mQ = _qD;
    if (mag) this.magGrip(mag, mP, mQ); else { mP.set(0, -0.1, 0); mQ.identity(); }
    const RP = _pB.copy(LP), RQ = _qB.copy(LQ); // rest pose
    const ch = CHARGE_GRIP[this.modelType];
    const empty = a.empty && ch && this.model.userData[ch.part];
    a.slideLock = 0;
    // empty: pull the slide / charging handle / bolt and let it fly home at 85 %
    if (empty) {
      const part = ud[ch.part];
      const pull = ss(k, 0.66, 0.8) * (1 - ei(k, 0.8, 0.84));
      const lift = ch.lift ? ss(k, 0.6, 0.67) * (1 - ss(k, 0.84, 0.88)) : 0;
      const isSlide = ch.part === 'slide';
      if (isSlide) a.slideLock = k < 0.8 ? 1 : 0;
      this.setPart(part, 0, 0, Math.max(pull * ch.pull[2], isSlide && k < 0.8 ? 0.03 : 0), lift * (ch.lift || 0));
      T[5] += 0.08 * bump(k, 0.78, 0.08); T[1] -= 0.01 * bump(k, 0.84, 0.04);
    }
    if (k < 0.3) {
      if (pistol) Viewmodel.blend(RP, RQ, belt, beltQ, ss(k, 0.04, 0.22), LP, LQ);
      else if (k < 0.15) Viewmodel.blend(RP, RQ, mP, mQ, ss(k, 0.04, 0.12), LP, LQ);
      else Viewmodel.blend(mP, mQ, belt, beltQ, ss(k, 0.15, 0.28), LP, LQ);
    } else if (k < 0.5) Viewmodel.blend(belt, beltQ, mP, mQ, ss(k, 0.27, 0.34), LP, LQ);
    else if (empty) {
      const cP = _pC, cQ = _qC;
      this.partGrip(ch, cP, cQ);
      if (k < 0.84) Viewmodel.blend(mP, mQ, cP, cQ, ss(k, 0.5, 0.64), LP, LQ);
      else Viewmodel.blend(cP, cQ, RP, RQ, ss(k, 0.84, 0.97), LP, LQ);
    } else Viewmodel.blend(mP, mQ, RP, RQ, ss(k, 0.5, 0.68), LP, LQ);
  }
  // Dual pistols: mags drop one after the other, both guns dip to pick up
  // fresh mags, rise seated, then slides drop home one at a time.
  animDual(a, T) {
    const ud = this.model.userData, R = a.R, u = a.t / R;
    const gR = ud.right, gL = ud.left;
    const tilt = ss(u, 0, 0.12) * (1 - ss(u, 1.15, 1.35));
    for (const [g, sd] of [[gR, 1], [gL, -1]]) {
      const b = g.userData.base;
      g.rotation.set(b.r.x + 0.25 * tilt, b.r.y, b.r.z + 0.35 * tilt * sd);
      g.position.set(b.p.x - 0.02 * sd * tilt, b.p.y + 0.01 * tilt, b.p.z);
    }
    const dip = ss(u, 0.2, 0.3) * (1 - ss(u, 0.33, 0.45));
    T[1] -= 0.24 * dip; T[3] -= 0.5 * dip; T[2] += 0.05 * dip;
    const j = bump(u, 0.46, 0.04); T[1] += 0.01 * j;
    const drop = (g, r0) => {
      const mag = g.userData.mag; if (!mag) return;
      if (u < r0) return;
      if (u < r0 + 0.04) this.setMag(mag, 0.02 * ss(u, r0, r0 + 0.04));
      else if (u < 0.3) { const f = seg(u, r0 + 0.04, r0 + 0.2); this.setMag(mag, 0.02 + 0.5 * f * f, 0.6 * f * f, f < 0.92); }
    };
    drop(gR, 0.04); drop(gL, 0.1);
    const lock = [0, 0];
    if (a.empty) { lock[0] = u < 0.85 ? 1 : 0; lock[1] = u < 0.9 ? 1 : 0; }
    return lock;
  }
  // Grenade launcher: break open, spent case out, new round in, snap shut.
  animLauncher(a, k, T, LP, LQ, RP, RQ) {
    const ud = this.model.userData, br = ud.breach, rd = ud.round;
    const tilt = ss(k, 0, 0.14) * (1 - ss(k, 0.86, 1));
    T[3] -= 0.12 * tilt; T[5] += 0.35 * tilt; T[0] -= 0.04 * tilt; T[1] += 0.03 * tilt;
    const open = ss(k, 0.05, 0.16) * (1 - ei(k, 0.8, 0.84));
    if (br) br.rotation.x = br.userData.base.r.x - 0.62 * open;
    T[3] -= 0.06 * bump(k, 0.84, 0.04);
    if (!br || !rd) return;
    // the round pivot lives in model space at the chamber mouth; express the
    // barrel's chamber in model space so the round follows the tilted barrel
    const by = rd.userData.base.p.y, cz = rd.userData.base.p.z;
    const chamber = (dz, out) => { out.set(0, by, cz + dz); out.sub(br.position).applyAxisAngle(_right.set(1, 0, 0), br.rotation.x).add(br.position); return out; };
    const belt = _pC.set(0.02, -0.36, 0.14);
    let rp = null;
    if (k > 0.14 && k < 0.3) { // spent case slides out and falls
      const f = seg(k, 0.16, 0.3);
      rp = chamber(0.13 * eo(k, 0.16, 0.22), _pA);
      rp.y -= 0.4 * f * f;
      rd.rotation.set(-0.62 * open - 1.2 * f * f, 0, 0);
    } else if (k >= 0.34 && k < 0.84) { // fresh round: from the belt to the chamber
      const behind = chamber(0.13, _pD), seat = chamber(0, _pA);
      if (k < 0.5) rp = _pA.copy(belt).lerp(behind, eo(k, 0.34, 0.5));
      else rp = seat.lerp(behind, 1 - ss(k, 0.5, 0.6));
      rd.rotation.set(-0.62 * open, 0, 0);
    }
    if (rp) { rd.visible = true; rd.position.copy(rp); }
    // off hand: to the belt, carries the round in, then closes the barrel
    const foreEnd = this.toHolder(br, 0, -0.03, -0.17, _pB);
    const feQ = _qB.copy(FOREGRIP_Q);
    if (k < 0.34) Viewmodel.blend(RP, RQ, belt, qe(_qC, 0.4, 0, 0.3), ss(k, 0.14, 0.3), LP, LQ);
    else if (k < 0.62) {
      _pE.copy(rd.position).add(_v.set(0.0, -0.04, 0.06));
      Viewmodel.blend(belt, qe(_qC, 0.4, 0, 0.3), _pE, qe(_qD, 0.3, 0, 0), ss(k, 0.3, 0.4), LP, LQ);
    } else if (k < 0.86) Viewmodel.blend(_pE.copy(rd.position).add(_v.set(0.0, -0.04, 0.06)), qe(_qD, 0.3, 0, 0), foreEnd, feQ, ss(k, 0.62, 0.74), LP, LQ);
    else Viewmodel.blend(foreEnd, feQ, RP, RQ, ss(k, 0.86, 0.96), LP, LQ);
  }
  // Shotguns: roll to the loading port, one shell per cycle (pushed home on
  // the 'shell' event), then pump / rack if the gun was empty. Interruptible.
  animShells(a, dt, T, LP, LQ, RP, RQ) {
    const ud = this.model.userData;
    const w = this.game.player?.weapon;
    // last shell in: the weapon waits reloadEnd before finishing; start the end motion now
    if (a.phase === 1 && w?.reloading && w.reloadPhase === 2) { a.phase = 2; a.endT = 0; a.interrupted = false; a.rack = a.empty; }
    a.cyc += dt; a.jolt = (a.jolt ?? 1) + dt;
    let tilt;
    if (a.phase < 2) tilt = ss(a.t, 0, a.start * 0.9);
    else tilt = 1 - ss(a.endT, a.rack ? 0.35 : 0, (a.rack ? 0.35 : 0) + (a.interrupted ? 0.12 : 0.25));
    T[5] += 0.42 * tilt; T[3] += 0.18 * tilt; T[0] -= 0.035 * tilt; T[1] += 0.03 * tilt; T[4] -= 0.12 * tilt;
    const jb = bump(a.jolt, 0.03, 0.05); T[1] += 0.006 * jb; T[2] -= 0.006 * jb;
    const port = ud.port;
    const pIn = _pA, pEntry = _pB, pFetch = _pC, qPort = _qA, qFetch = _qC;
    if (port) this.toHolder(port, 0.0, -0.012, -0.012, pIn); else pIn.set(0, -0.012, -0.08);
    pEntry.copy(pIn).add(_v.set(0, -0.04, 0.045));
    pFetch.copy(pIn).add(_v.set(0.03, -0.24, 0.12));
    qe(qPort, 1.35, 0, 0); qe(qFetch, 0.6, 0, 0.3);
    if (a.phase === 0) Viewmodel.blend(RP, RQ, pFetch, qFetch, ss(a.t, 0, a.start), LP, LQ);
    else if (a.phase === 1) {
      const c = a.cyc / a.period;
      if (c < 0.3) Viewmodel.blend(pIn, qPort, pFetch, qFetch, ss(c, 0, 0.3), LP, LQ);
      else if (c < 0.7) Viewmodel.blend(pFetch, qFetch, pEntry, qPort, ss(c, 0.3, 0.7), LP, LQ);
      else Viewmodel.blend(pEntry, qPort, pIn, qPort, ss(c, 0.7, 0.95), LP, LQ);
      this.shell.visible = c > 0.22 && c < 0.97;
    } else {
      a.endT += dt;
      const e = a.endT;
      if (a.rack && ud.pump) {
        // back to the fore-end, then chamber a round
        Viewmodel.blend(pIn, qPort, RP, RQ, ss(e, 0, 0.16), LP, LQ);
        if (e >= 0.16 && !a.racked) { a.racked = true; this.pumpA = 0; this.sound('pump'); }
        if (e > 0.7) this.anim = null;
      } else if (a.rack && ud.bolt) {
        const ch = CHARGE_GRIP.autoShotgun, cP = _pD, cQ = _qD;
        this.partGrip(ch, cP, cQ);
        const pull = ss(e, 0.14, 0.26) * (1 - ei(e, 0.3, 0.33));
        this.setPart(ud.bolt, 0, 0, ch.pull[2] * pull);
        if (e < 0.33) Viewmodel.blend(pIn, qPort, cP.add(_v.set(0, 0, ch.pull[2] * pull)), cQ, ss(e, 0, 0.14), LP, LQ);
        else Viewmodel.blend(cP, cQ, RP, RQ, ss(e, 0.33, 0.5), LP, LQ);
        if (e >= 0.3 && !a.racked) { a.racked = true; this.sound('boltCycle'); }
        if (e > 0.6) this.anim = null;
      } else {
        Viewmodel.blend(pIn, qPort, RP, RQ, ss(e, 0, a.interrupted ? 0.1 : 0.2), LP, LQ);
        if (e > 0.3) this.anim = null;
      }
    }
  }

  // hand on one of the dual pistols (spec in that gun's frame)
  placeGunHand(arm, gun, spec, side, hq) {
    this.toHolder(gun, spec[0], spec[1], spec[2], _pA);
    this.quatToHolder(gun, _qA).multiply(qe(_qB, spec[3], spec[4], spec[5]));
    this.placeHand(arm, _pA, _qA, side, hq, 0);
  }
  // Place a hand (holder-space position + rotation) and stretch its forearm to
  // an off-screen elbow. fg blends the elbow towards a fore-grip reach.
  placeHand(arm, pos, quat, side, hq, fg = 0) {
    const { upper, lower, hand } = arm.userData;
    upper.visible = false;
    _v.copy(pos).applyMatrix4(this.holder.matrix);
    hand.position.copy(_v);
    hand.quaternion.copy(hq).multiply(quat);
    // wrist point (behind the grip, at the heel of the palm)
    const wrist = _w.set(WRIST[0] * side, WRIST[1], WRIST[2]).applyQuaternion(hand.quaternion).add(hand.position);
    const elbow = _tmpE.set(wrist.x + side * 0.08 * (1 - fg) - 0.16 * fg, wrist.y - 0.2, wrist.z + 0.2 + 0.06 * fg);
    const d = _tmpD.subVectors(wrist, elbow);
    const len = d.length();
    d.normalize();
    // forearm frame: Y along the forearm, X towards the back of the hand so the
    // flattened wrist, sleeve seams and tattoos line up with the hand
    _bx.set(side, 0, 0).applyQuaternion(hand.quaternion);
    _bx.addScaledVector(d, -_bx.dot(d)).normalize();
    _bz.crossVectors(_bx, d);
    _m.makeBasis(_bx, d, _bz);
    lower.position.copy(elbow);
    lower.quaternion.setFromRotationMatrix(_m);
    lower.scale.set(1, len + 0.01, 1);
  }

  muzzleWorldPos(out) {
    const m = this.model;
    if (!m || !m.userData.muzzle) return null;
    let mz = m.userData.muzzle;
    if (this.kind === 'dual' && m.userData.left) {
      const side = this.game.player.weapon?.dualSide ? m.userData.right : m.userData.left;
      mz = side.userData.muzzle || mz;
    }
    mz.getWorldPosition(out);
    return out;
  }
}

let _flashTex = null;
function flashTexture() {
  if (_flashTex) return _flashTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  for (let k = 0; k < 7; k++) {
    g.rotate((Math.PI * 2) / 7 + Math.random() * 0.2);
    const gr = g.createLinearGradient(0, 0, 60, 0);
    gr.addColorStop(0, 'rgba(255,255,230,1)');
    gr.addColorStop(1, 'rgba(255,160,60,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, -7); g.lineTo(40 + Math.random() * 22, 0); g.lineTo(0, 7); g.fill();
  }
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, 30);
  rg.addColorStop(0, 'rgba(255,255,240,1)');
  rg.addColorStop(1, 'rgba(255,180,80,0)');
  g.fillStyle = rg;
  g.fillRect(-64, -64, 128, 128);
  _flashTex = new THREE.CanvasTexture(c);
  _flashTex.colorSpace = THREE.SRGBColorSpace;
  return _flashTex;
}
