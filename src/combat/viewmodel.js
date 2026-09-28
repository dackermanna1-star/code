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

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _ik = new Float32Array(3);
const _yAxis = new THREE.Vector3(0, 1, 0);
const _tmpE = new THREE.Vector3(), _tmpD = new THREE.Vector3(), _e = new THREE.Euler();
const _bx = new THREE.Vector3(), _bz = new THREE.Vector3();

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
    this.kickZ = 0; this.kickVZ = 0; this.kickRX = 0; this.kickVRX = 0; this.kickRZ = 0;
    this.bobT = 0;
    this.sprintK = 0;
    this.drawK = 1;
    this.anim = null; // {type, t, dur}
    this.pumpT = 0;
    this.shoveT = 0;
    this.lowered = 0;
    this.visible = true;
    this.handLOverride = null;
    this.flashMesh = null;
    this.muzzleWorld = new THREE.Vector3();
    this.landDip = 0;
    this.spinSpeed = 0;
  }
  setCharacter(char) {
    if (this.char === char) return;
    this.char = char;
    if (this.armL) { this.root.remove(this.armL); this.root.remove(this.armR); }
    this.armL = makeArm(char, -1);
    this.armR = makeArm(char, 1);
    this.root.add(this.armL);
    this.root.add(this.armR);
  }
  setItem(type, dual = false) {
    const key = type + (dual ? ':dual' : '');
    if (this.type === key) return;
    this.type = key;
    if (this.model) this.holder.remove(this.model);
    this.model = null;
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
        this.modelCache.set(mt, m);
      }
    }
    this.model = m || null;
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
    switch (e) {
      case 'fire': {
        const d = w?.def;
        const k = d ? d.viewKick : 1;
        this.kickVZ += 1.6 * k + 0.4;
        this.kickVRX += (2.5 + Math.random()) * k;
        this.kickRZ = (Math.random() - 0.5) * 0.05 * k;
        if (this.flashMesh && !d?.silenced) {
          this.flashMesh.visible = true;
          this.flashMesh.rotation.z = Math.random() * TAU;
          const s = 0.7 + Math.random() * 0.6;
          this.flashMesh.scale.setScalar(d && d.kind === 'shotgun' ? s * 1.6 : s);
          this.flashT = 0.04;
          if (this.kind === 'dual' && this.model?.userData.left) {
            // alternate hands
            const side = w.dualSide ? this.model.userData.left : this.model.userData.right;
            const mz = side.userData.muzzle || side.children.find((c) => c.name === 'muzzle');
            if (mz) mz.add(this.flashMesh);
            this.dualKick = w.dualSide ? -1 : 1;
          }
        }
        if (this.model?.userData.slide) this.slideT = 0.07;
        this.ejectShell();
        break;
      }
      case 'reload': {
        const d = w?.def;
        if (!d) break;
        if (d.shellReload) this.anim = { type: 'shellReload', t: 0, dur: 1e9 };
        else this.anim = { type: 'reload', t: 0, dur: d.reload * (w.dual ? 1.35 : 1) };
        break;
      }
      case 'shell': this.shellPush = 0.3; break;
      case 'reloadEnd':
      case 'reloadCancel':
        if (this.anim && (this.anim.type === 'reload' || this.anim.type === 'shellReload')) {
          if (this.anim.type === 'shellReload' && e === 'reloadEnd') { this.anim = { type: 'pumpOnly', t: 0, dur: 0.4 }; this.pumpT = 0.4; }
          else this.anim = null;
        }
        break;
      case 'pump': this.pumpT = 0.5; break;
      case 'swing': this.anim = { type: 'swing', t: 0, dur: (w?.def.interval ?? 0.8) * 0.9, dir: Math.random() < 0.5 ? 1 : -1 }; break;
      case 'shove': this.anim = { type: 'shove', t: 0, dur: 0.38 }; break;
      case 'draw': this.drawK = 0; break;
      case 'throwWindup': this.anim = { type: 'windup', t: 0, dur: 1e9 }; break;
      case 'throw': this.anim = { type: 'throw', t: 0, dur: 0.35 }; break;
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
      case 'dry': this.kickVRX -= 0.5; break;
    }
  }
  ejectShell() {
    const m = this.model;
    const def = this.game.player?.weapon?.def;
    if (!m || !def || def.shellType === 'none' || def.melee) return;
    let ej = m.userData.eject;
    if (this.kind === 'dual' && m.userData.left) ej = (this.game.player.weapon.dualSide ? m.userData.left : m.userData.right).userData.eject || ej;
    if (!ej) return;
    ej.getWorldPosition(_v);
    // convert viewmodel space -> world approx: viewmodel is attached to camera with same transform so world pos is valid
    const cam = this.camera;
    const right = _w.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const pv = this.game.player.phys;
    const vx = right.x * 2.2 + up.x * 1.8 + pv.vx, vy = right.y * 2.2 + up.y * 1.8 + 0.5, vz = right.z * 2.2 + up.z * 1.8 + pv.vz;
    this.game.shells?.spawn(_v.x, _v.y, _v.z, vx, vy, vz, def.shellType);
  }

  update(dt, s, look) {
    if (!s) return;
    this.setCharacter(s.char);
    const item = s.activeItem;
    const dual = s.slot === 1 && s.inv.secondary.dual;
    this.setItem(s.usingMounted ? 'minigun' : item, dual);
    const kind = s.usingMounted ? 'minigun' : this.kind;
    this.root.visible = this.visible && !(s.weapon && s.weapon.zoomed) && !s.dead;
    if (!this.model || !kind) { if (this.armL) { this.armL.visible = this.armR.visible = false; } return; }
    this.armL.visible = this.armR.visible = true;
    const base = POSE[kind] || POSE.rifle;
    // springs
    this.kickVZ += (-120 * this.kickZ - 16 * this.kickVZ) * dt;
    this.kickZ += this.kickVZ * dt;
    this.kickVRX += (-140 * this.kickRX - 15 * this.kickVRX) * dt;
    this.kickRX += this.kickVRX * dt;
    this.kickRZ = damp(this.kickRZ, 0, 10, dt);
    this.drawK = Math.min(1, this.drawK + dt * 2.6);
    this.landDip = damp(this.landDip, 0, 8, dt);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0 && this.flashMesh) this.flashMesh.visible = false; }
    // sway (lag against look)
    this.swayX = damp(this.swayX + (look?.dx || 0) * 0.9, 0, 9, dt);
    this.swayY = damp(this.swayY + (look?.dy || 0) * 0.9, 0, 9, dt);
    this.swayX = clamp(this.swayX, -0.12, 0.12);
    this.swayY = clamp(this.swayY, -0.1, 0.1);
    // bob
    const sp = Math.hypot(s.phys.vx, s.phys.vz);
    const ground = s.phys.onGround ? 1 : 0;
    this.bobT += dt * sp * 1.9 * ground;
    const bobK = clamp(sp / 4.4, 0, 1.4) * ground;
    this.sprintK = damp(this.sprintK, s.sprinting ? 1 : 0, 8, dt);
    const inc = s.incapped ? 1 : 0;
    this.lowered = damp(this.lowered, inc, 6, dt);

    let px = base[0], py = base[1], pz = base[2], rx = base[3], ry = base[4], rz = base[5];
    // bob
    px += Math.sin(this.bobT) * 0.012 * bobK;
    py += -Math.abs(Math.cos(this.bobT)) * 0.012 * bobK + Math.sin(this.game.time * 1.6) * 0.003;
    rz += Math.sin(this.bobT) * 0.012 * bobK;
    // sway
    px += this.swayX * 0.12; py -= this.swayY * 0.12;
    ry += this.swayX * 0.8; rx += this.swayY * 0.8;
    // sprint
    const spK = this.sprintK * (kind === 'melee' ? 0.4 : 1);
    px -= 0.05 * spK; py -= 0.06 * spK; rx -= 0.35 * spK; ry += 0.75 * spK; rz += 0.25 * spK;
    // crouch
    py -= 0.015 * s.crouchT;
    // incap
    py -= 0.05 * this.lowered; rz += 0.35 * this.lowered;
    // draw
    const dk = easeOutCubic(this.drawK);
    py -= (1 - dk) * 0.3; rx -= (1 - dk) * 0.8;
    // recoil
    pz += this.kickZ * 0.05; rx += this.kickRX * 0.06; rz += this.kickRZ;
    if (this.dualKick && kind === 'dual') { px += this.dualKick * this.kickZ * 0.01; }
    // landing
    py -= this.landDip; rx -= this.landDip * 1.5;

    // Animations
    let handL = null; // left hand target override in holder space
    let magOff = 0; // magazine drop
    const a = this.anim;
    if (a) {
      a.t += dt;
      const k = clamp(a.t / a.dur, 0, 1);
      switch (a.type) {
        case 'reload': {
          // tilt in, mag out, mag in, tilt back
          const tilt = k < 0.15 ? easeInOutSine(k / 0.15) : k > 0.85 ? 1 - easeInOutSine((k - 0.85) / 0.15) : 1;
          if (kind === 'pistol' || kind === 'dual') { rx += 0.35 * tilt; rz -= 0.25 * tilt; py -= 0.03 * tilt; }
          else { rz += 0.55 * tilt; rx += 0.25 * tilt; px -= 0.04 * tilt; py -= 0.02 * tilt; }
          if (k > 0.18 && k < 0.45) magOff = easeInOutSine((k - 0.18) / 0.27) * 0.35;
          else if (k >= 0.45 && k < 0.72) magOff = (1 - easeInOutSine((k - 0.45) / 0.27)) * 0.2;
          // left hand follows magazine
          const mag = this.model.userData.mag;
          if (mag && k > 0.12 && k < 0.8) {
            const hk = k < 0.3 ? (k - 0.12) / 0.18 : k > 0.7 ? 1 - (k - 0.7) / 0.1 : 1;
            handL = { onMag: true, k: clamp(hk, 0, 1) };
          }
          if (k > 0.78 && k < 0.92 && (kind === 'rifle' || kind === 'smg' || kind === 'sniper')) { pz += Math.sin((k - 0.78) / 0.14 * Math.PI) * 0.03; }
          if (a.t >= a.dur) this.anim = null;
          break;
        }
        case 'shellReload': {
          const tk = Math.min(1, a.t / 0.25);
          rz += 0.5 * tk; rx += 0.2 * tk; py -= 0.02 * tk;
          handL = { shell: true, k: this.shellPush || 0 };
          break;
        }
        case 'pumpOnly': if (a.t >= a.dur) this.anim = null; break;
        case 'swing': {
          const d = a.dir;
          // wind (0-0.25) -> strike (0.25-0.55) -> recover
          let sw;
          if (k < 0.2) sw = -easeInOutSine(k / 0.2) * 0.6;
          else if (k < 0.5) sw = -0.6 + easeOutCubic((k - 0.2) / 0.3) * 2.0;
          else sw = 1.4 - easeInOutSine((k - 0.5) / 0.5) * 1.4;
          rz += -sw * 0.9 * d; ry += sw * 0.5 * d; px -= sw * 0.12 * d; rx += (k < 0.2 ? 0.4 * (k / 0.2) : 0.4 - sw * 0.35); py += (k < 0.2 ? 0.08 * k / 0.2 : 0.08 - (sw + 0.6) * 0.06);
          if (a.t >= a.dur) this.anim = null;
          break;
        }
        case 'shove': {
          const sk = k < 0.35 ? easeOutCubic(k / 0.35) : 1 - easeInOutSine((k - 0.35) / 0.65);
          px -= 0.14 * sk; pz -= 0.1 * sk; rz += 0.9 * sk; ry += 0.4 * sk; py += 0.04 * sk;
          if (a.t >= a.dur) this.anim = null;
          break;
        }
        case 'windup': {
          const wk = Math.min(1, a.t / 0.3);
          px += 0.05 * wk; py += 0.12 * wk; pz += 0.12 * wk; rx -= 0.6 * wk;
          break;
        }
        case 'throw': {
          const tk = easeOutCubic(k);
          py += 0.12 - tk * 0.3; pz += 0.12 - tk * 0.4; rx -= 0.6 - tk * 1.2;
          if (a.t >= a.dur) this.anim = null;
          break;
        }
        case 'heal': {
          const hk = Math.min(1, a.t / 0.4);
          py -= 0.08 * hk; rx += 0.5 * hk;
          px += Math.sin(a.t * 6) * 0.02 * hk; rz += Math.sin(a.t * 3.1) * 0.1 * hk;
          handL = { wiggle: a.t };
          break;
        }
        case 'pills': {
          const pk = k;
          rz += Math.sin(pk * 40) * 0.2 * (pk < 0.6 ? 1 : 0);
          py += pk > 0.6 ? (pk - 0.6) * 0.3 : 0; rx -= pk > 0.6 ? (pk - 0.6) * 2 : 0;
          if (a.t >= a.dur) this.anim = null;
          break;
        }
        case 'lower': {
          const lk = Math.min(1, a.t / 0.3);
          py -= 0.25 * lk; rx -= 0.5 * lk;
          break;
        }
      }
    }
    if (this.shellPush > 0) this.shellPush -= dt;
    // pump animation
    const pump = this.model.userData.pump;
    if (pump) {
      if (this.pumpT > 0) {
        this.pumpT -= dt;
        const pk = 1 - this.pumpT / 0.5;
        const off = Math.sin(clamp(pk, 0, 1) * Math.PI) * 0.09;
        pump.position.z = -0.3 + off;
        pz += off * 0.15;
      } else pump.position.z = -0.3;
    }
    const slide = this.model.userData.slide;
    if (slide) {
      if (this.slideT > 0) { this.slideT -= dt; slide.position.z = -0.06 + 0.03; }
      else slide.position.z = damp(slide.position.z, -0.06, 30, dt);
      if (s.weapon && s.weapon.clip === 0) slide.position.z = -0.03;
    }
    const mag = this.model.userData.mag;
    if (mag) {
      if (mag.userData.baseY == null) mag.userData.baseY = mag.position.y;
      mag.position.y = mag.userData.baseY - magOff;
    }
    // minigun spin
    const spin = this.model.userData.spin;
    if (spin) {
      this.spinSpeed = damp(this.spinSpeed, s.cmd.fire ? 40 : 0, 3, dt);
      spin.rotation.z += this.spinSpeed * dt;
    }
    if (this.model.userData.flame) this.model.userData.flame.scale.setScalar(0.8 + Math.random() * 0.5);

    this.holder.position.set(px, py, pz);
    this.holder.rotation.set(rx, ry, rz, 'YXZ');
    this.holder.updateMatrix();
    this.root.updateMatrixWorld(true);

    // ------------------------------------------------ hands & forearms
    const H = HANDS[kind] || HANDS.rifle;
    const hq = this.holder.quaternion;
    // right hand (models carry their own grip placement)
    const hr = this.model.userData.handR;
    const rspec = hr && kind !== 'minigun' ? hr : H.R;
    this.placeHand(this.armR, rspec, 1, hq, null);
    // left hand
    let lspec = H.L;
    if (kind === 'dual' && hr) lspec = [hr[0] - 0.3, hr[1], hr[2], hr[3], hr[4], hr[5]];
    if (lspec === 'gripL') {
      const gl = this.model.userData.gripL;
      if (gl) {
        _w.copy(gl.position);
        if (gl.parent && gl.parent !== this.model) _w.applyMatrix4(gl.parent.matrix); // rides on the pump
        lspec = [_w.x, _w.y - 0.03, _w.z, 0, 0, 0, true];
      } else lspec = [-0.02, -0.03, -0.25, 0, 0, 0, true];
    }
    if (handL && lspec) {
      lspec = lspec.slice();
      if (handL.onMag && mag) {
        const mp = mag.position;
        const t = handL.k;
        lspec[0] = lerp(lspec[0], mp.x - 0.01, t); lspec[1] = lerp(lspec[1], mp.y - 0.07, t); lspec[2] = lerp(lspec[2], mp.z + 0.01, t);
        lspec[6] = t < 0.5 && lspec[6];
        if (t >= 0.5) { lspec[3] = 0.3; lspec[4] = 0; lspec[5] = 0; }
      } else if (handL.shell) {
        const k2 = clamp(handL.k / 0.3, 0, 1);
        lspec[0] = lerp(-0.1, 0.01, k2); lspec[1] = lerp(-0.2, -0.04, k2); lspec[2] = lerp(0.0, -0.06, k2);
      } else if (handL.wiggle != null) {
        lspec[0] += Math.sin(handL.wiggle * 9) * 0.02; lspec[1] += Math.cos(handL.wiggle * 7) * 0.015;
      }
    }
    if (lspec) { this.armL.visible = true; this.placeHand(this.armL, lspec, -1, hq, null); }
    else this.armL.visible = false;
  }

  // Place a hand (holder space spec) and stretch its forearm to an off-screen elbow.
  placeHand(arm, spec, side, hq) {
    const { upper, lower, hand } = arm.userData;
    upper.visible = false;
    _v.set(spec[0], spec[1], spec[2]).applyMatrix4(this.holder.matrix);
    hand.position.copy(_v);
    _q.setFromEuler(spec[6] ? FOREGRIP_ROT : _e.set(spec[3], spec[4], spec[5]));
    hand.quaternion.copy(hq).multiply(_q);
    // wrist point (behind the grip, at the heel of the palm)
    const wrist = _w.set(WRIST[0] * side, WRIST[1], WRIST[2]).applyQuaternion(hand.quaternion).add(hand.position);
    const elbow = _tmpE.set(wrist.x + side * 0.08, wrist.y - 0.2, wrist.z + 0.2);
    if (spec[6]) elbow.set(wrist.x - 0.16, wrist.y - 0.2, wrist.z + 0.26);
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
      const side = this.game.player.weapon?.dualSide ? m.userData.left : m.userData.right;
      mz = side.userData.muzzle || mz;
    }
    mz.getWorldPosition(out);
    // viewmodel FOV differs from world FOV; pull muzzle towards the camera axis a bit
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
