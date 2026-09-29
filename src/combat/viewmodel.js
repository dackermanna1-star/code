// First-person viewmodel: the survivor's articulated arms (fpHands.js: one
// skinned mesh per arm, grips solved against each weapon in gripPoses.js,
// driven by fpArms.js) holding the active weapon/item, with procedural sway,
// bob, sprint pose, recoil springs and animated reloads (magazine swap;
// empty: pistol slide stop, rifle bolt-catch slap, SMG/SCAR/sniper handle or
// bolt pull; shell-by-shell with pump / bolt), shoves, melee swings, throws,
// healing and pills. Rendered on layer 1 (no clipping).
import * as THREE from 'three';
import { buildModel } from './weaponModels.js';
import { FPArms } from './fpArms.js';
import { damp, clamp, lerp, easeOutCubic, easeInOutSine, TAU } from '../core/math.js';

const TYPE_MODEL = {
  pistol: 'pistol', magnum: 'magnum', smg: 'smg', silencedSmg: 'silencedSmg', pumpShotgun: 'pumpShotgun', chromeShotgun: 'chromeShotgun',
  autoShotgun: 'autoShotgun', rifle: 'rifle', scar: 'scar', huntingRifle: 'huntingRifle', m60: 'm60', grenadeLauncher: 'grenadeLauncher',
  fireaxe: 'fireaxe', crowbar: 'crowbar', machete: 'machete', molotov: 'molotov', pipebomb: 'pipebomb', bile: 'bile',
  medkit: 'medkit', pills: 'pills', adrenaline: 'adrenaline', minigun: 'minigun',
  katana: 'katana', baseballBat: 'baseballBat', fryingPan: 'fryingPan', chainsaw: 'chainsaw',
  defib: 'defib', upgradeIncendiary: 'upgradeIncendiary', upgradeExplosive: 'upgradeExplosive',
};
// turn a model about its own handle axis in first person (shows a blade's flat / the pan's face)
const VM_TWIST = { katana: 1.2, fryingPan: -0.9 };
// Hip pose per kind: [x,y,z, rx,ry,rz]
const POSE = {
  pistol: [0.075, -0.105, -0.36, 0, 0.02, 0],
  dual: [0.15, -0.13, -0.33, 0, 0, 0],
  smg: [0.1, -0.11, -0.3, 0, 0.03, 0],
  shotgun: [0.11, -0.12, -0.27, 0, 0.03, 0],
  rifle: [0.105, -0.115, -0.26, 0, 0.03, 0],
  sniper: [0.105, -0.12, -0.26, 0, 0.03, 0],
  heavy: [0.12, -0.15, -0.26, 0, 0.04, 0],
  launcher: [0.12, -0.135, -0.27, 0, 0.03, 0],
  melee: [0.19, -0.23, -0.36, -0.32, 0.22, -0.32],
  melee1: [0.16, -0.17, -0.34, -0.55, 0.25, -0.4], // one-handed melee: the hand stays in view
  throwable: [0.15, -0.165, -0.3, 0, 0, 0],
  medkit: [0.06, -0.19, -0.36, 0.25, 0, 0],
  pills: [0.11, -0.16, -0.3, 0, 0, 0.1],
  minigun: [0.0, -0.28, -0.25, 0, 0, 0],
  saw: [0.13, -0.2, -0.3, 0.12, 0.1, 0.05], // chainsaw: low right, bar angled in and up
};

// ------------------------------------------------------------------ hands --
// Each hand holds its solved grip (fpArms / gripPoses): the right hand is
// anchored to the weapon (or to each gun of the dual pistols), the off hand to
// its fore-end / support grip. Animations below move the off hand in HOLDER
// space using the legacy grip-hand frame (grip axis +Y, front -Z; restP/restQ
// are the solved grip in that frame), and this.grip names what each hand is
// doing so the fingers can take the matching shape:
//   R 'pistolGrip' | 'melee' | 'item' | 'minigun' | 'dualGrip'
//   L 'fore' | 'support' | 'mag' | 'belt' | 'charge' | 'shell' | 'port' | 'round' | 'item' | 'hidden'
// HANDS[kind] is the fallback placement for items without a solved grip.
const OFF_POSE = { mag: 'mag', belt: 'relax', charge: 'pinch', shell: 'shell', port: 'shell', round: 'mag', bandage: 'pinch' };
const OFF_ACTION = { mag: 'mag', charge: 'charge', port: 'port', round: 'round' };
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
  rifle: { part: 'charge', p: [0, 0.018, 0.012], e: [0, 0, Math.PI / 2], pull: [0, 0, 0.07], slap: true }, // bolt catch slap
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
    this.grip = { R: 'pistolGrip', L: 'fore' }; // what each hand holds this frame (see 'hands' above)
    this.arms = new FPArms(this.root);
    this.trigK = 1; // index finger on the trigger (0 = resting along the frame)
    this.shell = shellMesh();
    this.shell.visible = false;
  }
  setCharacter(char) {
    if (this.char === char) return;
    this.char = char;
    this.arms.setCharacter(char);
    this.armR = this.arms.R.root; this.armL = this.arms.L.root;
    this.arms.attachToLeft(this.shell);
    if (this.model) this.arms.setModel(this.model, this.modelKey);
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
    const m = mt ? this.getModel(mt) : null;
    this.model = m || null;
    this.modelType = type;
    this.modelKey = mt;
    if (this.model) {
      this.model.rotation.y = VM_TWIST[type] || 0;
      this.holder.add(this.model);
      this.arms.setModel(this.model, mt);
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
  // models are built once per type and reused (they are fairly detailed)
  getModel(mt) {
    if (!this.modelCache) this.modelCache = new Map();
    let m = this.modelCache.get(mt);
    if (!m) {
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
    return m || null;
  }
  // Build models and solve grips for what the survivor carries, one per idle
  // slot, so switching weapons never stalls a frame.
  prewarm(s) {
    const now = performance.now();
    if (this._pwBusy || now < (this._pwNext || 0) || !this.arms.R) return;
    this._pwNext = now + 700;
    const inv = s.inv || {};
    const want = [];
    if (inv.primary?.type) want.push(TYPE_MODEL[inv.primary.type]);
    if (inv.secondary?.type) want.push(inv.secondary.type === 'pistol' && inv.secondary.dual ? 'dualPistols' : TYPE_MODEL[inv.secondary.type]);
    if (inv.throwable) want.push(TYPE_MODEL[inv.throwable]);
    if (inv.medkit) want.push(TYPE_MODEL[inv.medkit === true ? 'medkit' : inv.medkit]);
    if (inv.pills) want.push(TYPE_MODEL[inv.pills]);
    const key = this.arms.lookId;
    const mt = want.find((t) => t && !(this.modelCache?.get(t)?.userData.fpGrips && key in this.modelCache.get(t).userData.fpGrips));
    if (!mt) return;
    this._pwBusy = true;
    const run = () => {
      this._pwBusy = false;
      try { const m = this.getModel(mt); if (m && m !== this.model) this.arms.prewarm(m, mt); } catch (e) { console.warn('viewmodel prewarm', mt, e); }
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 3000 }); else setTimeout(run, 50);
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
      if (type === 'medkit' || type === 'defib' || type === 'upgradeIncendiary' || type === 'upgradeExplosive') return 'medkit';
      if (type === 'pills' || type === 'adrenaline') return 'pills';
      return 'throwable';
    }
    if (def.chainsaw) return 'saw';
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
        this.arms.squeeze();
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
    if (mag === this.model?.userData.mag && this.arms.actionHolderLegacy('mag', this.holder, outP, outQ)) return;
    const I = this.magInfo(mag);
    this.toHolder(mag, I.cx, I.bot + 0.03, I.cz + 0.004, outP);
    this.quatToHolder(mag, outQ).multiply(qe(_qT, 0.12, 0, 0));
  }
  partGrip(spec, outP, outQ) {
    const part = this.model.userData[spec.part];
    if (!part) return false;
    if (this.arms.actionHolderLegacy('charge', this.holder, outP, outQ)) return true;
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
    this.prewarm(s);
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
    const base = POSE[kind === 'melee' && this.modelType !== 'fireaxe' ? 'melee1' : kind] || POSE.rifle;
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
    const solved = this.arms.grips && kind !== 'dual';
    if (solved) {
      lVis = this.arms.gripHolderLegacy('L', this.holder, restP, restQ);
      lFG = this.arms.grips.L?.reach || 0;
      lspec = !lVis ? null : lFG ? 'gripL' : 'solved';
    } else if (lspec === 'gripL') {
      const gl = ud.gripL;
      if (gl) { this.toHolder(gl, 0, -0.03, 0, restP); restQ.copy(FOREGRIP_Q); }
      else { restP.set(-0.02, -0.06, -0.25); restQ.copy(FOREGRIP_Q); }
      lFG = 1;
    } else if (lspec) { restP.set(lspec[0], lspec[1], lspec[2]); qe(restQ, lspec[3], lspec[4], lspec[5]); }
    else lVis = false;
    const LP = _hp.copy(restP), LQ = _hq.copy(restQ);
    let fgK = lFG;
    const GR = this.grip;
    GR.R = kind === 'dual' ? 'dualGrip' : kind === 'melee' ? 'melee' : kind === 'minigun' ? 'minigun' : kind === 'throwable' || kind === 'medkit' || kind === 'pills' ? 'item' : 'pistolGrip';
    GR.L = !lVis ? 'hidden' : lspec === 'gripL' ? 'fore' : kind === 'pistol' ? 'support' : 'item';
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
          // kit comes in toward the chest and tips its face to the eye; the right
          // hand holds it while the left pulls a bandage out and wraps, over and over
          const hk = eo(a.t, 0, 0.45);
          T[0] -= 0.035 * hk; T[1] += 0.07 * hk; T[2] += 0.05 * hk; T[3] += 0.2 * hk;
          T[5] += Math.sin(a.t * 1.9) * 0.05 * hk; T[1] += Math.sin(a.t * 2.6) * 0.004 * hk;
          const c = Math.max(0, a.t - 0.25) / 1.1, ph = c % 1;
          const reach = ss(a.t, 0.1, 0.4);
          // in (dip into the kit) -> pull up and out -> loop around (wrap) -> back
          const dip = bump(ph, 0.12, 0.12), pull = ss(ph, 0.2, 0.5) * (1 - ss(ph, 0.8, 1));
          const wrap = ph * Math.PI * 2;
          const hp = _pE.set(-0.03 + 0.06 * pull + 0.025 * Math.sin(wrap) * pull, 0.03 - 0.03 * dip + 0.07 * pull + 0.02 * Math.cos(wrap) * pull, 0.1 + 0.05 * pull);
          const hq = qe(_qD, -0.7 + 0.5 * pull, 0.2 * Math.sin(wrap) * pull, -1.35 - 0.5 * pull);
          Viewmodel.blend(LP, LQ, hp, hq, reach, LP, LQ);
          this.grip.L = reach > 0.3 ? 'bandage' : this.grip.L;
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
    // chainsaw: engine shake (hard while cutting, pushing into the target) + running chain
    if (ud.chainTop) {
      const cut = !!(w && w.cutting), on = !!w && w.fuel > 0;
      const amp = on ? (cut ? 1 : 0.3) : 0;
      this.sawCut = damp(this.sawCut || 0, cut ? 1 : 0, 10, dt);
      const j = () => (Math.random() - 0.5) * 2;
      px += j() * 0.0022 * amp; py += j() * 0.0022 * amp - 0.012 * this.sawCut; pz -= 0.05 * this.sawCut;
      rx += j() * 0.008 * amp + 0.06 * this.sawCut; rz += j() * 0.006 * amp;
      const pc = ud.chainTop.userData.pitch || 0.0175;
      this.chainPh = ((this.chainPh || 0) + dt * (cut ? 14 : on ? 1.5 : 0)) % pc;
      ud.chainTop.position.z = -this.chainPh; ud.chainBot.position.z = this.chainPh;
    }
    // laser sight: module under the muzzle + a fading beam
    this.updateLaser(ud, w);
    if (ud.flame) { const f = ud.flame, r = Math.random(); f.scale.set(0.85 + 0.2 * r, 0.75 + 0.5 * Math.random(), 0.85 + 0.2 * r); f.rotation.y += dt * 3; f.rotation.z = Math.sin(t * 9) * 0.08; }

    // smooth the animation pose (eases blends into and out of every anim, incl. interrupts)
    const fast = a && (a.type === 'swing' || a.type === 'shove') && this.anim === a;
    const O = this.ofs, sk = 1 - Math.exp(-(fast ? 80 : 26) * dt);
    for (let i = 0; i < 6; i++) O[i] += (T[i] - O[i]) * sk;
    this.holder.position.set(px + O[0], py + O[1], pz + O[2]);
    this.holder.rotation.set(rx + O[3], ry + O[4], rz + O[5], 'YXZ');
    this.holder.updateMatrix();
    this.root.updateMatrixWorld(true);

    // ------------------------------------------------ hands & forearms
    // off hand: smoothed in holder space so it glides between grips
    if (lVis && kind !== 'dual') {
      if (!this.lhInit) { this.lhP.copy(LP); this.lhQ.copy(LQ); this.lhFG = fgK; this.lhInit = true; }
      const hk = 1 - Math.exp(-(a ? 30 : 20) * dt);
      this.lhP.lerp(LP, hk); this.lhQ.slerp(LQ, hk); this.lhFG += (fgK - this.lhFG) * hk;
    }
    // trigger discipline: the index leaves the trigger to reload, sprint, draw or lower the gun
    const reloading = a && (a.type === 'reload' || a.type === 'dualReload' || a.type === 'launcherReload' || a.type === 'shells' || a.type === 'lower');
    const offTrig = Math.max(reloading ? 1 : 0, clamp(this.sprintK * 1.4 - 0.2, 0, 1), this.lowered, 1 - this.drawK, this.holsterT >= 0 ? 1 : 0);
    this.trigK = 1 - offTrig;
    let rP = null, rQ = null;
    if (!this.arms.hasGrip('R')) { // no solved grip: legacy placement
      const hr = ud.handR, rspec = hr && kind !== 'minigun' ? hr : H.R;
      rP = _pA.set(rspec[0], rspec[1], rspec[2]); rQ = qe(_qA, rspec[3], rspec[4], rspec[5]);
    }
    const offK = lVis && kind !== 'dual' ? clamp(this.lhP.distanceTo(restP) / 0.03, 0, 1) : 0;
    this.arms.update({
      holder: this.holder, dt, trig: this.trigK, rP, rQ, fast: !!a,
      offP: lVis && kind !== 'dual' ? this.lhP : null, offQ: this.lhQ,
      offPose: OFF_POSE[this.grip.L] || 'relax', offAction: OFF_ACTION[this.grip.L], offK, hideL: !lVis && kind !== 'dual',
      thumbK: (a && a.thumbK) || 0,
    });
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
    a.thumbK = 0;
    const isSlide = empty && ch.part === 'slide';
    if (isSlide) {
      // empty pistol: the slide stays locked back until the right thumb drops
      // the slide stop at 84 % (after the mag seats); the gun jolts as it slams home
      a.slideLock = k < 0.84 ? 1 : 0;
      a.thumbK = ss(k, 0.72, 0.8) * (1 - ss(k, 0.86, 0.94));
      T[1] += 0.008 * bump(k, 0.855, 0.04); T[3] += 0.05 * bump(k, 0.86, 0.05); T[5] -= 0.03 * bump(k, 0.86, 0.06);
    } else if (empty && ch.slap) {
      // empty rifle: the palm slaps the bolt catch at 84 %, the gun rocks right
      T[0] += 0.008 * bump(k, 0.85, 0.04); T[5] -= 0.05 * bump(k, 0.86, 0.06); T[1] -= 0.004 * bump(k, 0.85, 0.04);
    } else if (empty) {
      // empty long gun: pull the charging handle / bolt, let it fly home at 84 %
      const part = ud[ch.part];
      const pull = ss(k, 0.66, 0.8) * (1 - ei(k, 0.8, 0.84));
      const lift = ch.lift ? ss(k, 0.6, 0.67) * (1 - ss(k, 0.84, 0.88)) : 0;
      this.setPart(part, 0, 0, pull * ch.pull[2], lift * (ch.lift || 0));
      T[5] += 0.08 * bump(k, 0.78, 0.08); T[1] -= 0.01 * bump(k, 0.84, 0.04);
      // the gun goes out and down a little so the hand on the handle stays off the eye
      const ck = ss(k, 0.5, 0.62) * (1 - ss(k, 0.86, 0.97));
      T[1] -= 0.02 * ck; T[2] -= 0.05 * ck;
    }
    const G = this.grip;
    G.L = k < 0.03 ? G.L : k < 0.3 ? (pistol || k > 0.2 ? 'belt' : 'mag') : k < 0.58 ? 'mag' : empty && !isSlide && k < 0.9 ? 'charge' : G.L;
    if (k < 0.3) {
      if (pistol) Viewmodel.blend(RP, RQ, belt, beltQ, ss(k, 0.04, 0.22), LP, LQ);
      else if (k < 0.15) Viewmodel.blend(RP, RQ, mP, mQ, ss(k, 0.04, 0.12), LP, LQ);
      else Viewmodel.blend(mP, mQ, belt, beltQ, ss(k, 0.15, 0.28), LP, LQ);
    } else if (k < 0.5) Viewmodel.blend(belt, beltQ, mP, mQ, ss(k, 0.27, 0.34), LP, LQ);
    else if (empty && !isSlide) {
      const cP = _pC, cQ = _qC;
      this.partGrip(ch, cP, cQ);
      if (ch.slap) { // hover beside the catch, strike, return to the fore-end
        const hv = _pE.copy(cP).add(_v.set(-0.04, 0.012, 0.02));
        if (k < 0.77) Viewmodel.blend(mP, mQ, hv, cQ, ss(k, 0.5, 0.66), LP, LQ);
        else if (k < 0.845) Viewmodel.blend(hv, cQ, cP, cQ, ei(k, 0.77, 0.845), LP, LQ);
        else Viewmodel.blend(cP, cQ, RP, RQ, ss(k, 0.86, 0.98), LP, LQ);
      } else if (k < 0.84) Viewmodel.blend(mP, mQ, cP, cQ, ss(k, 0.5, 0.64), LP, LQ);
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
    // out, down and rolled left so the loading hand works beside the breach, not in front of the eye
    T[1] -= 0.03 * tilt; T[2] -= 0.12 * tilt; T[3] -= 0.25 * tilt; T[4] -= 0.15 * tilt; T[5] += 0.6 * tilt;
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
    this.grip.L = k < 0.14 ? 'fore' : k < 0.38 ? 'belt' : k < 0.66 ? 'round' : 'fore';
    // the fore-end grip rides the barrel (solved grip anchored to the breach); legacy fallback below it
    const solvedFore = this.arms.hasGrip('L');
    const foreEnd = solvedFore ? _pB.copy(RP) : this.toHolder(br, 0, -0.03, -0.17, _pB);
    const feQ = solvedFore ? _qB.copy(RQ) : _qB.copy(FOREGRIP_Q);
    const roundGrip = (outP, outQ) => { if (!this.arms.actionHolderLegacy('round', this.holder, outP, outQ)) { outP.copy(rd.position).add(_v.set(0.0, -0.04, 0.06)); qe(outQ, 0.3, 0, 0); } };
    if (k < 0.34) Viewmodel.blend(RP, RQ, belt, qe(_qC, 0.4, 0, 0.3), ss(k, 0.14, 0.3), LP, LQ);
    else if (k < 0.62) {
      roundGrip(_pE, _qD);
      Viewmodel.blend(belt, qe(_qC, 0.4, 0, 0.3), _pE, _qD, ss(k, 0.3, 0.4), LP, LQ);
    } else if (k < 0.86) { roundGrip(_pE, _qD); Viewmodel.blend(_pE, _qD, foreEnd, feQ, ss(k, 0.62, 0.74), LP, LQ); }
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
    // canted clockwise, muzzle up: the loading port turns toward the left hand and the eye
    T[0] -= 0.05 * tilt; T[1] += 0.05 * tilt; T[3] += 0.3 * tilt; T[4] -= 0.1 * tilt; T[5] -= 0.6 * tilt;
    const jb = bump(a.jolt, 0.03, 0.05); T[1] += 0.006 * jb; T[2] -= 0.006 * jb;
    const port = ud.port;
    const pIn = _pA, pEntry = _pB, pFetch = _pC, qPort = _qA, qFetch = _qC;
    if (port) this.toHolder(port, 0.0, -0.012, -0.012, pIn); else pIn.set(0, -0.012, -0.08);
    qe(qPort, 1.35, 0, 0);
    this.arms.actionHolderLegacy('port', this.holder, pIn, qPort); // solved shell-in-hand pose at the port
    pEntry.copy(pIn).add(_v.set(0, -0.04, 0.045));
    pFetch.copy(pIn).add(_v.set(0.03, -0.24, 0.12));
    qe(qFetch, 0.6, 0, 0.3);
    this.grip.L = a.phase === 0 ? (a.t > a.start * 0.5 ? 'shell' : 'fore') : a.phase === 1 ? (this.shell.visible || a.cyc / a.period < 0.5 ? 'shell' : 'port') : a.rack && ud.bolt && a.endT < 0.36 ? 'charge' : a.endT > 0.12 ? 'fore' : 'port';
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

  // Laser sight on the first-person gun: a small module under the muzzle and a
  // thin additive beam (layer 1) that fades out ahead of the gun.
  updateLaser(ud, w) {
    const want = !!(w && w.laser && ud.muzzle && !w.def.melee);
    if (!this.laser) {
      if (!want) return;
      const grp = new THREE.Group();
      const mod = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.02, 0.05), new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.55, metalness: 0.4 }));
      mod.position.set(0, 0, 0.03);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.005, 12), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
      lens.position.set(0, 0, 0.0045); lens.rotation.y = Math.PI;
      const beamG = new THREE.CylinderGeometry(0.0009, 0.0016, 3, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, -1.5);
      const col = new Float32Array(beamG.attributes.position.count * 3);
      for (let i = 0; i < beamG.attributes.position.count; i++) { const k = Math.max(0, 1 + beamG.attributes.position.getZ(i) / 3); col[i * 3] = k; col[i * 3 + 1] = k * 0.12; col[i * 3 + 2] = k * 0.08; }
      beamG.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const beam = new THREE.Mesh(beamG, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      grp.add(mod, lens, beam);
      grp.traverse((o) => { o.layers.set(1); o.frustumCulled = false; });
      this.laser = grp;
    }
    const L = this.laser;
    if (!want) { L.visible = false; return; }
    if (L.parent !== ud.muzzle) ud.muzzle.add(L);
    // sit under the barrel, a little behind the muzzle (undo any model scale)
    const sc = ud.muzzle.parent?.scale?.x || 1;
    L.position.set(0.0, -0.026 / sc, 0.1 / sc);
    L.visible = true;
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
export { POSE };
