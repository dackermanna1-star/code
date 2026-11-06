// First-person view model: blocky hands + held item, rendered in its own scene on top of the world.
//
//   const vm = new Viewmodel();
//   vm.setItem(stack);                       // whenever the selected hotbar stack changes (same object => no-op)
//   vm.update(dt, {moving01, sprinting, aiming, crouching, grounded, lookDX, lookDY, light:{sky, block}, time, camera});
//   ... render world ...
//   vm.render(renderer);                     // clears depth and draws the hands on top (keep the HDR target bound)
//
// See docs in the final report / ARCHITECTURE.md "Viewmodel" for the full contract.
import * as THREE from 'three';
import { globalUniforms } from '../render/materials.js';
import { getItemDef } from '../items/items.js';
import { getItemIcon } from '../items/icons.js';
import { createViewmodelMaterial } from './viewmodel/material.js';
import { buildViewModel, MODEL_BUILDERS } from './viewmodel/models.js';
import { Arms } from './viewmodel/arms.js';
import { ViewmodelFX } from './viewmodel/fx.js';
import { AnimOut, SAMPLERS, SWINGS, clamp01, easeOutBack, bump } from './viewmodel/anims.js';
import { disposeObject } from './viewmodel/builder.js';

export { MODEL_IDS } from './viewmodel/models.js';

const RIG_PIVOT = new THREE.Vector3(0.08, -0.12, -0.32);
const SHOULDER_R = [0.36, -0.4, 0.04];
const SHOULDER_L = [-0.2, -0.44, 0.0];
const FREE_L = [-0.2, -0.27, -0.38];
const EQUIP_DUR = 0.4;
const HOLD_RELOADS = new Set(['reloadShell', 'reloadRevolver', 'reloadBolt']);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

class Spring3 {
  constructor(k, zeta) {
    this.x = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.set(k, zeta);
  }
  set(k, zeta) {
    this.k = k;
    this.c = 2 * zeta * Math.sqrt(k);
  }
  step(h, tx = 0, ty = 0, tz = 0) {
    const { x, v, k, c } = this;
    v.x += (-(x.x - tx) * k - v.x * c) * h;
    v.y += (-(x.y - ty) * k - v.y * c) * h;
    v.z += (-(x.z - tz) * k - v.z * c) * h;
    x.addScaledVector(v, h);
  }
  reset() { this.x.set(0, 0, 0); this.v.set(0, 0, 0); }
}

/** critically damped scalar spring: s = {x, v} */
function crit(s, target, w, h) {
  s.v += ((target - s.x) * w * w - 2 * w * s.v) * h;
  s.x += s.v * h;
}

const _v = new THREE.Vector3();
const _t = new THREE.Vector3();
const _hR = new THREE.Vector3();
const _hL = new THREE.Vector3();
const _sR = new THREE.Vector3();
const _sL = new THREE.Vector3();
const _up = new THREE.Vector3();
const _upR = new THREE.Vector3();
const _rigUp = new THREE.Vector3();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _X = new THREE.Vector3(1, 0, 0);
const _size = new THREE.Vector2();
const _ndc = new THREE.Vector3();
const _cp = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _fw = new THREE.Vector3();

export class Viewmodel {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.name = 'viewmodel';
    this.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.01, 20);
    this.scene.add(this.camera);
    this.material = createViewmodelMaterial();

    this.rig = new THREE.Group();
    this.rig.rotation.order = 'YXZ';
    this.rig.position.copy(RIG_PIVOT);
    this.scene.add(this.rig);
    this.rigInner = new THREE.Group();
    this.rigInner.position.copy(RIG_PIVOT).negate();
    this.rig.add(this.rigInner);
    this.pivot = new THREE.Group();
    this.pivot.rotation.order = 'YXZ';
    this.rigInner.add(this.pivot);
    this.freeL = new THREE.Object3D();
    this.shoulderR = new THREE.Object3D();
    this.shoulderL = new THREE.Object3D();
    this.shoulderR.position.fromArray(SHOULDER_R);
    this.shoulderL.position.fromArray(SHOULDER_L);
    this.rigInner.add(this.freeL, this.shoulderR, this.shoulderL);

    this.arms = new Arms(this.material, this.scene);
    this.fx = new ViewmodelFX(this.scene, this.material);
    this.out = new AnimOut();

    this._cache = new Map();
    this.item = null;   // model of the equipped item
    this.model = null;  // model currently displayed (differs during use() with a temporary item)
    this.meta = null;
    this._stack = null;
    this._def = null;

    this.time = 0;
    this._aim = { x: 0, v: 0 };
    this._spr = { x: 0, v: 0 };
    this._cr = { x: 0, v: 0 };
    this._drawS = { x: 0, v: 0 };
    this.move01 = 0;
    this.phase = 0;
    this._wasGrounded = true;
    this._airT = 0;
    this.swayRot = new Spring3(110, 0.55);
    this.swayPos = new Spring3(110, 0.6);
    this.recoilRot = new Spring3(260, 0.6);
    this.recoilPos = new Spring3(300, 0.62);
    this.offPos = new Spring3(140, 0.42);
    this.offRot = new Spring3(120, 0.4);
    this.action = null;
    this.fireT = 9;
    this.equipT = 9;
    this._muzzleLight = 0;
    this._sky = 1;
    this._block = 0;
    this._lightInit = false;
    this._swingAlt = false;
    this._lastSwingEnd = -9;
    this._insertDriven = false;
    this._lastInsertT = 0;
    this._fireHideT = 9;
    this.state = { cylRot: 0, cylRotTarget: 0, slideLocked: false, cock: 1, arrow: true, chambers: true };
    this._residual = { w: 0, pos: new THREE.Vector3(), rot: new THREE.Vector3(), ch: {}, hR: new THREE.Vector3(), hL: new THREE.Vector3() };
    this._actPos = new THREE.Vector3();
    this._actRot = new THREE.Vector3();
    this._lastCh = {};
    this._handR = new THREE.Vector3();
    this._handL = new THREE.Vector3();
    this._base = { pos: new THREE.Vector3(), rot: new THREE.Vector3() };
    this.freeLPos = FREE_L.slice();
    this.mainCamera = null;
    /** set false if the game spawns world-space casings itself (FX.shell) */
    this.ejectShells = true;
    /** optional (def) => 16x16 canvas override for extruded 'generic' items (defaults to getItemIcon) */
    this.iconProvider = null;
    this.setItem(null);
  }

  // =========================================================================================== items
  _modelIdFor(stack) {
    if (!stack || stack.id === 'fists') return 'fists';
    const def = getItemDef(stack.id);
    const m = def && def.model;
    if (m === 'fists') return 'fists';
    if (m && MODEL_BUILDERS[m]) return m;
    return 'generic';
  }

  _getModel(stack, id = this._modelIdFor(stack)) {
    const key = id === 'generic' ? 'generic:' + (stack ? stack.id : '?') : id;
    let m = this._cache.get(key);
    if (!m) {
      let icon = null;
      if (id === 'generic') {
        try {
          const def = getItemDef(stack.id);
          icon = (this.iconProvider && this.iconProvider(def)) || getItemIcon(def);
        } catch (e) { icon = null; }
      }
      m = buildViewModel(id, this.material, icon);
      m.key = key;
      this._cache.set(key, m);
    }
    return m;
  }

  _display(model) {
    if (this.model === model) return;
    if (this.model) this.pivot.remove(this.model.group);
    this.model = model;
    this.meta = model.meta;
    this.pivot.add(model.group);
    model.group.visible = true;
    this.fx.attachMuzzle(model.points.muzzle || null);
    this.fx.attachFlame(model.meta.flame ? model.points[model.meta.flame] : null, model.meta.flameKind || 'fire');
    this.freeLPos = (this.meta.freeL && this.meta.freeL.pos) ? this.meta.freeL.pos.slice() : FREE_L.slice();
  }

  /** Equip a stack (or null = bare hands). Calling again with the same stack object is a no-op. */
  setItem(stack) {
    const id = this._modelIdFor(stack);
    const key = id === 'generic' ? 'generic:' + stack.id : id;
    const same = this.item && stack === this._stack && this.item.key === key;
    this._stack = stack || null;
    this._def = stack ? getItemDef(stack.id) : getItemDef('fists');
    if (same) return;
    if (this.action) this._endAction(true);
    this._residual.w = 0;
    this.item = this._getModel(stack, id);
    this._display(this.item);
    this.equipT = 0;
    this.fireT = 9;
    this.recoilRot.reset();
    this.recoilPos.reset();
    const ammo = stack && typeof stack.ammo === 'number' ? stack.ammo : null;
    this.state.arrow = ammo == null ? true : ammo > 0;
    this.state.cock = this.state.arrow ? 1 : 0;
    this.state.chambers = ammo == null ? true : ammo > 0;
    this.state.cylRot = this.state.cylRotTarget = 0;
    this._drawS.x = this._drawS.v = 0;
    this.fx.clearShells();
  }

  /** {skin, sleeve, glove}: hex numbers or '#rrggbb'. sleeve/glove null = bare skin. */
  setArmsAppearance(ap = {}) {
    const conv = (c) => (c == null ? null : typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c);
    const o = {};
    if ('skin' in ap) o.skin = conv(ap.skin) ?? 0xc69c7b;
    if ('sleeve' in ap) o.sleeve = conv(ap.sleeve);
    if ('glove' in ap) o.glove = conv(ap.glove);
    this.arms.setAppearance(o);
  }

  /** Optional: main camera (used to light the hands with the world sun direction / flashlight / point lights). */
  setMainCamera(cam) { this.mainCamera = cam; }

  // =========================================================================================== actions
  _start(type, dur, data = {}) {
    if (this.action) this._snapshotResidual();
    if (this.action) this._endAction(false);
    this.action = { type, t: 0, dur: Math.max(0.05, dur), data, fired: new Set(), phase: 'main', pt: 0, hold: false, ins: false, it: 0, idur: 0.45, insN: 0 };
    return this.action;
  }

  _snapshotResidual() {
    const r = this._residual;
    r.w = 1;
    r.pos.copy(this._actPos);
    r.rot.copy(this._actRot);
    r.ch = { ...this._lastCh };
    r.hR.copy(this._handR);
    r.hL.copy(this._handL);
  }

  _endAction(snap) {
    if (snap && this.action) this._snapshotResidual();
    const a = this.action;
    this.action = null;
    if (a && a.type === 'swing') this._lastSwingEnd = this.time;
    if (this.item && this.model !== this.item) this._display(this.item);
  }

  /** Stop any action animation (blends back to rest). */
  cancel() {
    if (this.action) this._endAction(true);
  }

  fire(recoilScale = 1) {
    const meta = this.meta;
    if (this.action && this.action.type !== 'pump' && this.action.type !== 'bolt') this._endAction(true);
    this.fireT = 0;
    const r = meta.recoil;
    const ads = this._aim.x;
    const k = recoilScale * (1 - 0.4 * ads);
    this.recoilRot.v.x += r.pitch * 30 * k * (1 - 0.3 * ads);
    this.recoilRot.v.y += (Math.random() * 2 - 1) * r.yaw * 30 * k;
    this.recoilRot.v.z += (Math.random() * 2 - 0.7) * r.roll * 30 * k * (1 - 0.6 * ads);
    this.recoilPos.v.z += r.back * 32 * k * (1 + 0.3 * ads);
    this.recoilPos.v.y += r.up * 30 * k * (1 - 0.8 * ads);
    this.recoilPos.v.x += (Math.random() - 0.5) * r.back * 5 * k;
    const sup = !!(this._def?.firearm?.suppressed || this._stack?.data?.suppressor);
    if (meta.flash) {
      this.fx.muzzleFlash(meta.flash * (sup ? 0.3 : 1));
      this._muzzleLight = sup ? 0.3 : 1;
    }
    if (meta.ejectOnFire && this.ejectShells) this.ejectAt('eject', meta.shell, [1, 0.55, 0.25]);
    if (meta.fireAnim === 'revolver') this.state.cylRotTarget += Math.PI / 3;
    if (meta.fireAnim === 'crossbow') { this.state.cock = 0; this.state.arrow = false; this._fireHideT = 0; }
    if (meta.fireAnim === 'bow') { this.state.arrow = false; this._fireHideT = 0; this._drawS.x = 0; this._drawS.v = 0; }
    if (meta.chamberShells) this._fireHideT = 0;
  }

  /** Melee swing. Returns seconds until the impact moment. */
  swing(heavy = false) {
    const meta = this.meta;
    const mel = this._def && this._def.melee;
    const alt = this.time - this._lastSwingEnd < 0.6 ? !this._swingAlt : false;
    this._swingAlt = alt;
    let style;
    if (meta.kind === 'gun') style = 'gunbash';
    else if (meta.kind === 'fists') style = heavy ? 'hook' : alt ? 'jabL' : 'jabR';
    else {
      const two = !!meta.twoHanded;
      let type = (mel && mel.type) || meta.swing || 'blunt';
      if (type === 'stab') style = two ? 'stab2' : 'stab1';
      else if (type === 'heavy') style = two ? 'heavy2' : 'heavy1';
      else if (type === 'blade') style = two ? (heavy ? 'heavy2' : alt ? 'blade2b' : 'blade2') : heavy ? 'heavy1' : alt ? 'blade1b' : 'blade1';
      else style = two ? (heavy ? 'heavy2' : alt ? 'blunt2b' : 'blunt2') : heavy ? 'heavy1' : alt ? 'blunt1b' : 'blunt1';
    }
    const speed = (mel && mel.speed) || (meta.kind === 'fists' ? 2.2 : 1.4 - (meta.weight || 0.3) * 0.6);
    let D = clamp(1 / speed, 0.32, 1.6) * (heavy ? 1.45 : 1);
    if (style === 'gunbash') D = 0.62;
    this._start('swing', D, { style, heavy });
    return SWINGS[style].hit * D;
  }

  shove() {
    this._start('shove', 0.48, {});
  }

  /** kind: 'mag' | 'shell' | 'single' | 'break'. duration in seconds (whole reload for mag/break; see report). */
  reloadStart(kind = 'mag', duration = 2) {
    const meta = this.meta;
    const st = meta.reload && meta.reload.style;
    if (this.action) this._endAction(true);
    let type;
    if (meta.kind !== 'gun') type = 'reloadGeneric';
    else if (st === 'crossbow') type = 'reloadCrossbow';
    else if (st === 'bow') type = 'reloadBow';
    else if (st === 'break') type = 'reloadBreak';
    else if (kind === 'mag' && meta.mag) type = 'reloadMag';
    else if (st === 'revolver') type = 'reloadRevolver';
    else if (st === 'shotgun') type = 'reloadShell';
    else if (st === 'bolt') type = 'reloadBolt';
    else if (meta.mag) type = 'reloadMag';
    else type = 'reloadGeneric';
    const a = this._start(type, duration, {});
    const ammo = this._stack && typeof this._stack.ammo === 'number' ? this._stack.ammo : null;
    if (HOLD_RELOADS.has(type)) {
      a.hold = true;
      a.phase = 'enter';
      a.data.enter = clamp(duration * 0.3, 0.25, 0.45);
      a.data.exit = 0.38;
      a.data.spent = true;
    }
    if (type === 'reloadMag') {
      a.data.charge = meta.reload?.charge !== 'none' && !(ammo != null && ammo > 0);
      a.data.locked = this.state.slideLocked;
    }
    if (type === 'reloadCrossbow') a.data.wasCocked = this.state.cock > 0.5;
  }

  /** One shell / round goes in (shell & single reloads). Optional duration of the insert motion. */
  reloadInsert(duration) {
    const a = this.action;
    if (!a || !a.type.startsWith('reload')) return;
    if (!a.hold) {
      if (a.type === 'reloadCrossbow' || a.type === 'reloadBow') this.state.arrow = true;
      return;
    }
    this._insertDriven = true;
    const est = this._lastInsertT > 0 && this.time - this._lastInsertT < 1.2 ? clamp(this.time - this._lastInsertT, 0.25, 0.9) : 0.45;
    this._lastInsertT = this.time;
    a.ins = true;
    a.it = 0;
    a.idur = duration != null ? Math.max(0.15, duration) : est * 0.95;
    a.insN++;
  }

  reloadEnd() {
    const a = this.action;
    if (!a || !a.type.startsWith('reload')) return;
    if (a.hold) {
      if (a.phase !== 'exit') {
        a.phase = 'exit';
        a.pt = 0;
        a.ins = false;
      }
    } else if (a.dur - a.t > 0.12) this._endAction(true);
    this.state.arrow = true;
    this.state.cock = 1;
    this.state.chambers = true;
    this.state.slideLocked = false;
  }

  pump(duration = 0.55) {
    if (this.action && this.action.type !== 'pump') this._endAction(true);
    this._start('pump', duration, {});
  }

  bolt(duration = 0.85) {
    if (this.action && this.action.type !== 'bolt') this._endAction(true);
    this._start('bolt', duration, {});
  }

  /**
   * kind: 'eat'|'drink'|'bandage'|'pills'|'read'|'inject'|'craft'.
   * Optional stack: item being used if it is not the held one (held item is lowered and swapped for it).
   */
  use(kind = 'eat', duration = 2, stack = null) {
    let temp = null;
    if (stack && stack !== this._stack) {
      const id = this._modelIdFor(stack);
      const m = this._getModel(stack, id);
      if (m !== this.item) temp = m;
    }
    this._start('use', Math.max(0.3, duration), { kind, temp });
  }

  /** Overarm throw. Returns seconds until release (spawn the projectile then). */
  throwItem(duration = 0.8) {
    this._start('throw', duration, { reshow: true });
    return 0.47 * duration;
  }

  /** small impulse on the recoil springs (mag seated, bolt closed, melee hit...) */
  kick(scale = 0.3, melee = false) {
    if (melee) {
      this.recoilRot.v.x -= 0.9 * scale;
      this.recoilPos.v.z += 0.12 * scale;
      this.recoilRot.v.z += (Math.random() - 0.5) * 0.6 * scale;
    } else {
      this.recoilRot.v.x += 0.45 * scale;
      this.recoilPos.v.y += 0.06 * scale;
      this.recoilPos.v.z += 0.05 * scale;
    }
  }

  /** eject a casing from a model point; dir in model axes (x right, y up, z back) */
  ejectAt(pointName, kind, dir) {
    if (!kind || !this.model) return;
    const p = this.model.points[pointName];
    if (!p) return;
    p.getWorldPosition(_v);
    _t.set(dir[0], dir[1], dir[2]);
    this.pivot.getWorldQuaternion(_q);
    _t.applyQuaternion(_q);
    this.fx.ejectShell(kind, _v, _t);
  }

  /** current base pose (without action) as [x,y,z,pitch,yaw,roll] */
  getBase6(out) {
    const b = this._base;
    out[0] = b.pos.x; out[1] = b.pos.y; out[2] = b.pos.z;
    out[3] = b.rot.x; out[4] = b.rot.y; out[5] = b.rot.z;
    return out;
  }

  /** {aim01, scoped, busy, action, model} – handy for UI (scope overlay when scoped). */
  getState() {
    return {
      aim01: this._aim.x,
      scoped: !!(this.meta.scope && this._aim.x > 0.94),
      busy: !!this.action,
      action: this.action ? this.action.type : null,
      model: this.meta.id,
    };
  }

  _advanceAction(dt) {
    const a = this.action;
    if (!a) return;
    a.t += dt;
    if (a.hold) {
      if (a.phase === 'enter' && a.t >= a.data.enter) a.phase = 'hold';
      if (a.ins) {
        a.it += dt;
        if (a.it >= a.idur) a.ins = false;
      }
      if (!a.ins && a.phase === 'hold' && !this._insertDriven && a.t > a.data.enter + 0.6) {
        a.ins = true; a.it = 0; a.idur = 0.5; a.insN++;
      }
      if (a.phase === 'exit') {
        a.pt += dt;
        if (a.pt >= a.data.exit) this._endAction(false);
      } else if (a.t > 60) this._endAction(true);
      return;
    }
    if (a.type === 'use' && a.data.temp) {
      const sw = Math.min(0.15, 0.12 / a.dur);
      const u = a.t / a.dur;
      const want = u > sw && u < 1 - sw ? a.data.temp : this.item;
      if (this.model !== want) this._display(want);
    }
    if (a.t >= a.dur) this._endAction(false);
  }

  // =========================================================================================== update
  update(dt, s = {}) {
    dt = clamp(dt || 0, 0, 0.1);
    this.time = s.time != null ? s.time : this.time + dt;
    if (s.camera) this.mainCamera = s.camera;
    if (this.equipT < 9) this.equipT += dt;
    this.fireT += dt;
    this._fireHideT += dt;
    this._advanceAction(dt);
    const meta = this.meta;
    const act = this.action;
    const out = this.out;
    out.reset();

    // ---- live state from the stack
    const stack = this._stack;
    const ammo = stack && typeof stack.ammo === 'number' ? stack.ammo : null;
    const reloading = act && act.type.startsWith('reload');
    if (meta.slideLockEmpty) this.state.slideLocked = ammo === 0 && !reloading && this.fireT > 0.06;
    else this.state.slideLocked = false;
    if (ammo != null && !reloading && this._fireHideT > 0.3) {
      this.state.arrow = ammo > 0;
      this.state.cock = ammo > 0 ? 1 : 0;
      this.state.chambers = ammo > 0;
    }
    this.state.cylRot += (this.state.cylRotTarget - this.state.cylRot) * (1 - Math.exp(-dt * 30));

    // ---- targets
    const actBlocksAim = act && act.type !== 'pump' && act.type !== 'bolt';
    const canAim = meta.kind === 'gun' && !actBlocksAim;
    const aimT = s.aiming && canAim ? 1 : 0;
    const sprT = s.sprinting && !(s.aiming && canAim) && !act ? 1 : 0;
    const crT = s.crouching ? 1 : 0;
    const grounded = s.grounded !== false;
    const weight = meta.weight ?? 0.3;
    const wAim = 15 - 6 * weight;

    // ---- look sway targets (lookDX/lookDY = camera yaw / pitch change this frame, radians; +x right, +y up)
    const inv = dt > 1e-4 ? 1 / dt : 0;
    const wx = clamp((s.lookDX || 0) * inv, -12, 12);
    const wy = clamp((s.lookDY || 0) * inv, -12, 12);
    const aim0 = this._aim.x;
    const g = (0.011 + 0.012 * weight) * (1 - 0.7 * aim0);
    const tRotX = clamp(-wy * g, -0.14, 0.14);
    const tRotY = clamp(wx * g, -0.16, 0.16);
    const tRotZ = clamp(wx * g * 0.9, -0.16, 0.16);
    const tPosX = clamp(-wx * g * 0.07, -0.02, 0.02);
    const tPosY = clamp(-wy * g * 0.06, -0.02, 0.02);
    this.swayRot.set(115 - 55 * weight, 0.5);
    this.swayPos.set(115 - 55 * weight, 0.55);

    // ---- landing / jumping
    if (grounded && !this._wasGrounded) {
      const k = Math.min(1.2, 0.3 + this._airT);
      this.offPos.v.y -= 0.5 * k;
      this.offRot.v.x -= 1.6 * k;
      this.offPos.v.z += 0.08 * k;
    }
    if (!grounded && this._wasGrounded) {
      this.offPos.v.y -= 0.16;
      this.offRot.v.x += 0.35;
    }
    this._airT = grounded ? 0 : this._airT + dt;
    this._wasGrounded = grounded;

    // ---- integrate springs (substeps for stability)
    const n = Math.max(1, Math.ceil(dt / 0.0083));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      crit(this._aim, aimT, wAim, h);
      crit(this._spr, sprT, 8.5, h);
      crit(this._cr, crT, 9, h);
      this.swayRot.step(h, tRotX, tRotY, tRotZ);
      this.swayPos.step(h, tPosX, tPosY, 0);
      this.recoilRot.step(h);
      this.recoilPos.step(h);
      this.offPos.step(h);
      this.offRot.step(h);
    }
    const aim01 = clamp01(this._aim.x);
    const spr01 = clamp01(this._spr.x);
    const cr01 = clamp01(this._cr.x);

    // ---- movement bob (figure-8)
    const moveT = clamp01(s.moving01 || 0) * (grounded ? 1 : 0);
    this.move01 += (moveT - this.move01) * (1 - Math.exp(-dt * 7));
    const stepRate = lerp(lerp(1.8, 1.3, cr01), 2.7, spr01);
    this.phase += dt * Math.PI * stepRate * Math.min(1, this.move01 * 2.5);
    const ph = this.phase;
    const A = this.move01 * (1 - 0.82 * aim01);
    const SA = 1 + 1.3 * spr01;
    const bobPx = Math.sin(ph) * 0.0085 * A * SA;
    const bobPy = Math.sin(2 * ph) * 0.0055 * A * SA - 0.002 * A;
    const bobRx = Math.sin(2 * ph) * 0.011 * A * SA;
    const bobRy = Math.sin(ph) * 0.012 * A * SA;
    const bobRz = Math.sin(ph) * 0.022 * A * SA;
    // idle breathing
    const t = this.time;
    const br = 1 - 0.55 * aim01;
    const breY = Math.sin(t * 1.35) * 0.0016 * br;
    const breRx = Math.sin(t * 1.35 - 0.7) * 0.005 * br;
    const breRy = Math.sin(t * 0.83) * 0.004 * br;

    // ---- base pose (hip / ads / sprint / crouch)
    const hip = meta.hip, ads = meta.ads, spr = meta.sprint;
    const sprW = spr01 * (1 - aim01);
    const B = this._base;
    B.pos.set(lerp(hip.pos[0], ads.pos[0], aim01), lerp(hip.pos[1], ads.pos[1], aim01), lerp(hip.pos[2], ads.pos[2], aim01));
    B.rot.set(lerp(hip.rot[0], ads.rot[0], aim01), lerp(hip.rot[1], ads.rot[1], aim01), lerp(hip.rot[2], ads.rot[2], aim01));
    B.pos.x = lerp(B.pos.x, spr.pos[0], sprW);
    B.pos.y = lerp(B.pos.y, spr.pos[1], sprW);
    B.pos.z = lerp(B.pos.z, spr.pos[2], sprW);
    B.rot.x = lerp(B.rot.x, spr.rot[0], sprW);
    B.rot.y = lerp(B.rot.y, spr.rot[1], sprW);
    B.rot.z = lerp(B.rot.z, spr.rot[2], sprW);
    const crW = cr01 * (1 - aim01);
    B.pos.x -= 0.01 * crW;
    B.pos.y -= 0.01 * crW;
    B.pos.z += 0.012 * crW;
    B.rot.y += 0.02 * crW;
    B.rot.z -= 0.07 * crW;
    // sprint rocking for long guns / pumping fists
    const fistPump = meta.kind === 'fists' ? Math.sin(ph) * 0.04 * spr01 * this.move01 : 0;
    B.pos.y += fistPump;
    B.pos.z -= fistPump * 0.6;
    if (meta.kind === 'gun') {
      B.rot.z += Math.sin(ph) * 0.05 * spr01 * this.move01;
      B.rot.x += Math.sin(2 * ph) * 0.03 * spr01 * this.move01;
    }

    // ---- action
    if (act) SAMPLERS[act.type](act, out, this);

    // ---- compose pivot
    const P = _v.copy(B.pos);
    const R = _t.copy(B.rot);
    if (out.absW > 0) {
      P.lerp(out.absPos, out.absW);
      R.lerp(out.absRot, out.absW);
    }
    P.add(out.pos);
    R.add(out.rot);
    this._actPos.subVectors(P, B.pos);
    this._actRot.subVectors(R, B.rot);
    const res = this._residual;
    if (res.w > 0.001) {
      P.addScaledVector(res.pos, res.w);
      R.addScaledVector(res.rot, res.w);
    }
    // equip raise
    const eu = clamp01(this.equipT / EQUIP_DUR);
    const drop = this.equipT < EQUIP_DUR ? 1 - easeOutBack(eu, 1.3) : 0;
    R.x -= 0.85 * drop;
    P.addScaledVector(this.recoilPos.x, 1);
    R.add(this.recoilRot.x);
    this.pivot.position.copy(P);
    this.pivot.rotation.set(R.x, R.y, R.z, 'YXZ');

    // ---- rig (shared by both hands)
    this.rig.position.set(
      RIG_PIVOT.x + this.swayPos.x.x + bobPx + this.offPos.x.x + out.rigPos.x,
      RIG_PIVOT.y + this.swayPos.x.y + bobPy + this.offPos.x.y + out.rigPos.y + breY - 0.28 * drop,
      RIG_PIVOT.z + this.swayPos.x.z + this.offPos.x.z + out.rigPos.z + 0.03 * drop,
    );
    this.rig.rotation.set(
      this.swayRot.x.x + bobRx + this.offRot.x.x + breRx + out.rigRot.x,
      this.swayRot.x.y + bobRy + breRy + out.rigRot.y,
      this.swayRot.x.z + bobRz + out.rigRot.z,
      'YXZ',
    );
    const fl = this.freeLPos;
    this.freeL.position.set(fl[0] - 0.01 * crW, fl[1] - fistPump - 0.1 * sprW * (meta.kind === 'fists' ? 0 : 1), fl[2] + fistPump * 0.6);

    // ---- parts / strings / hands
    this.scene.updateMatrixWorld(true);
    this._applyParts(out, dt);
    this._updateStrings(out, dt, aim01);
    this.model.group.updateMatrixWorld(true);
    this._updateHands(out);

    // ---- visibility, lighting, fx
    this.model.group.visible = !out.hide;
    const opacity = meta.scope ? 1 - clamp01((aim01 - 0.8) / 0.16) : 1;
    this.material.uniforms.uOpacity.value = opacity;
    const hiddenAll = opacity <= 0.001;
    this.arms.R.root.visible = !hiddenAll;
    this.arms.L.root.visible = !hiddenAll;
    this.model.group.visible = this.model.group.visible && !hiddenAll;
    res.w *= Math.exp(-dt * 14);
    this._updateLighting(dt, s);
    const lit = !!(stack && stack.data && stack.data.lit);
    this.fx.setFlameVisible(out.flame || lit);
    this.fx.update(dt);
  }

  _applyParts(out, dt) {
    const meta = this.meta;
    const parts = this.model.parts;
    const ft = this.fireT;
    const pulse = ft < 0.02 ? ft / 0.02 : Math.max(0, 1 - (ft - 0.02) / 0.065);
    const v = this._chVals || (this._chVals = {});
    for (const k in v) v[k] = 0;
    if (meta.fireAnim === 'slide') {
      v.slide = Math.max(pulse, this.state.slideLocked ? 1 : 0);
      v.hammer = v.slide;
    } else if (meta.fireAnim === 'revolver') {
      v.hammer = bump(ft, 0, 0.12);
    } else if (meta.fireAnim === 'carrier') {
      v.charge = pulse;
    }
    v.trigger = bump(ft, 0, 0.1);
    v.cylinderRot = this.state.cylRot;
    for (const k in out.ch) v[k] = out.ch[k];
    const res = this._residual;
    if (res.w > 0.001) for (const k in res.ch) v[k] = lerp(v[k] || 0, res.ch[k], res.w);
    this._lastCh = { ...v };
    const ch = meta.channels;
    for (const name in ch) {
      for (const e of ch[name]) {
        const p = parts[e.part];
        if (p) { p.position.copy(p.userData.restPos); p.quaternion.copy(p.userData.restQuat); }
      }
    }
    for (const name in ch) {
      const val = v[name] || 0;
      if (!val) continue;
      for (const e of ch[name]) {
        const p = parts[e.part];
        if (!p) continue;
        if (e.t) { p.position.x += e.t[0] * val; p.position.y += e.t[1] * val; p.position.z += e.t[2] * val; }
        if (e.r) {
          _e.set(e.r[0] * val, e.r[1] * val, e.r[2] * val, 'XYZ');
          _q.setFromEuler(_e);
          p.quaternion.multiply(_q);
        }
      }
    }
    if (meta.mag && parts[meta.mag.part]) {
      const mp = parts[meta.mag.part];
      mp.position.copy(mp.userData.restPos);
      mp.visible = true;
      if (out.mag) {
        const ax = meta.mag.axis;
        mp.position.x += ax[0] * out.mag.d;
        mp.position.y += ax[1] * out.mag.d;
        mp.position.z += ax[2] * out.mag.d;
        mp.visible = out.mag.vis;
      }
    }
    if (meta.chamberShells) {
      const vis = out.chambers != null ? out.chambers : this.state.chambers;
      for (const n of meta.chamberShells) if (parts[n]) parts[n].visible = vis;
    }
  }

  _updateStrings(out, dt, aim01) {
    const meta = this.meta;
    const st = meta.string;
    if (!st) return;
    const pts = this.model.points, parts = this.model.parts;
    const nock = pts[st.nock];
    if (!nock.userData.rest) nock.userData.rest = nock.position.clone();
    const rest = nock.userData.rest;
    const arrow = parts[meta.ammoProp];
    const arrowVis = out.arrowVis != null ? out.arrowVis : this.state.arrow;
    if (st.bow) {
      const target = out.draw != null ? out.draw : arrowVis ? 0.12 + 0.88 * aim01 : 0;
      crit(this._drawS, target, out.draw != null ? 14 : 10, dt);
      const draw = clamp01(this._drawS.x);
      nock.position.z = st.restZ + (st.drawZ - st.restZ) * draw;
      const rel = this._fireHideT < 0.4 ? Math.sin(this._fireHideT * 60) * Math.exp(-this._fireHideT * 12) * 0.6 : 0;
      nock.position.z += rel;
      if (parts.limbU) parts.limbU.rotation.x = -0.14 * draw;
      if (parts.limbD) parts.limbD.rotation.x = 0.14 * draw;
      if (arrow) {
        arrow.position.copy(arrow.userData.restPos);
        arrow.position.z += nock.position.z - rest.z;
      }
    } else {
      const cock = out.cock != null ? out.cock : this.state.cock;
      nock.position.z = lerp(st.restZ, rest.z, cock);
      const kick = this._fireHideT < 0.5 ? Math.sin(this._fireHideT * 45) * Math.exp(-this._fireHideT * 9) * 0.05 : 0;
      if (parts.limbL) parts.limbL.rotation.y = -(1 - cock) * 0.12 + kick;
      if (parts.limbR) parts.limbR.rotation.y = (1 - cock) * 0.12 - kick;
      if (arrow) arrow.position.copy(arrow.userData.restPos);
    }
    if (arrow) {
      arrow.visible = arrowVis;
      if (out.arrowOff) { arrow.position.x += out.arrowOff[0]; arrow.position.y += out.arrowOff[1]; arrow.position.z += out.arrowOff[2]; }
    }
    const body = parts.body;
    this.model.group.updateMatrixWorld(true);
    const A = _hR, Bv = _hL, N = _sR;
    nock.getWorldPosition(N);
    body.worldToLocal(N);
    for (let i = 0; i < 2; i++) {
      const seg = parts[st.parts[i]];
      pts[st.tips[i]].getWorldPosition(A);
      body.worldToLocal(A);
      Bv.subVectors(N, A);
      const len = Bv.length();
      seg.position.copy(A);
      seg.quaternion.setFromUnitVectors(_X, Bv.multiplyScalar(1 / Math.max(len, 1e-4)));
      seg.scale.set(len, 1, 1);
    }
  }

  _evalDesc(target, d) {
    if (!(d.w > 0.0001)) return;
    const pts = this.model.points;
    if (d.point) {
      const p = pts[d.point];
      if (!p) return;
      p.getWorldPosition(_hR.set(0, 0, 0));
      _cp.copy(_hR);
    } else if (d.rig) {
      _cp.set(d.rig[0], d.rig[1], d.rig[2]);
      this.rigInner.localToWorld(_cp);
    } else if (d.model) {
      _cp.set(d.model[0], d.model[1], d.model[2]);
      this.model.group.localToWorld(_cp);
    } else return;
    if (d.off) { _cp.x += d.off[0]; _cp.y += d.off[1]; _cp.z += d.off[2]; }
    target.lerp(_cp, Math.min(1, d.w));
  }

  _updateHands(out) {
    const meta = this.meta;
    const pts = this.model.points;
    _up.setFromMatrixColumn(this.pivot.matrixWorld, 1).normalize();
    _rigUp.setFromMatrixColumn(this.rigInner.matrixWorld, 1).normalize();
    const hR = _dir, hL = _fw;
    const pR = pts[meta.hands.R];
    if (pR) pR.getWorldPosition(hR);
    else this.pivot.getWorldPosition(hR);
    for (const d of out.handR) this._evalDesc(hR, d);
    let upL = _up;
    const pL = meta.hands.L ? pts[meta.hands.L] : null;
    if (pL) pL.getWorldPosition(hL);
    else {
      this.freeL.getWorldPosition(hL);
      upL = _rigUp;
    }
    for (const d of out.handL) this._evalDesc(hL, d);
    const res = this._residual;
    if (res.w > 0.001) {
      hR.lerp(res.hR, res.w);
      hL.lerp(res.hL, res.w);
    }
    this._handR.copy(hR);
    this._handL.copy(hL);
    this.shoulderR.getWorldPosition(_sR);
    this.shoulderL.getWorldPosition(_sL);
    if (out.shL) {
      _t.set(out.shL.rig[0], out.shL.rig[1], out.shL.rig[2]);
      this.rigInner.localToWorld(_t);
      _sL.lerp(_t, out.shL.w);
    }
    if (out.shR) {
      _t.set(out.shR.rig[0], out.shR.rig[1], out.shR.rig[2]);
      this.rigInner.localToWorld(_t);
      _sR.lerp(_t, out.shR.w);
    }
    _upR.copy(_up);
    if (meta.kind === 'fists' || meta.hold === 'bow') _upR.copy(_rigUp).lerp(_up, 0.5).normalize();
    this.arms.place(this.arms.R, hR, _sR, _upR);
    this.arms.place(this.arms.L, hL, _sL, upL);
    this.arms.R.finger.visible = meta.kind === 'gun' && meta.hold !== 'bow' && out.finger !== false && !out.handR.length;
    this.arms.setProp(this.arms.L, out.propL);
    this.arms.setProp(this.arms.R, out.propR);
  }

  _updateLighting(dt, s) {
    let sky = s.light && s.light.sky != null ? s.light.sky : 1;
    let block = s.light && s.light.block != null ? s.light.block : 0;
    if (sky > 1.001) sky /= 15;
    if (block > 1.001) block /= 15;
    if (!this._lightInit) { this._sky = sky; this._block = block; this._lightInit = true; }
    const k = 1 - Math.exp(-dt * 7);
    this._sky += (sky - this._sky) * k;
    this._block += (block - this._block) * k;
    const u = this.material.uniforms;
    u.uEntityLight.value.set(this._sky, this._block);
    u.uSelfLight.value = (globalUniforms.uFlashOn.value || 0) * 0.32;
    const cam = this.mainCamera;
    if (cam) {
      cam.updateMatrixWorld();
      u.uVMRot.value.setFromMatrix4(cam.matrixWorld);
    }
    // muzzle flash light (~2 frames)
    if (this._muzzleLight > 0) {
      const mp = this.model.points.muzzle;
      if (mp) mp.getWorldPosition(_v);
      u.uMuzzle.value.set(_v.x, _v.y, _v.z, this._muzzleLight * Math.min(1.5, this.meta.flash || 1));
      this._muzzleLight = Math.max(0, this._muzzleLight - dt / 0.05);
    } else u.uMuzzle.value.w = 0;
  }

  // =========================================================================================== output
  /** Muzzle tip in the main camera's world space (matches the on-screen position of the viewmodel muzzle). */
  getMuzzleWorldPosition(mainCamera, out = new THREE.Vector3()) {
    if (mainCamera) this.mainCamera = mainCamera;
    const mp = this.model && this.model.points.muzzle;
    this.scene.updateMatrixWorld(true);
    if (mp) mp.getWorldPosition(_v);
    else {
      this.pivot.getWorldPosition(_v);
      _v.z -= 0.15;
    }
    if (!mainCamera) return out.copy(_v);
    const depth = Math.max(0.05, -_v.z);
    this.camera.updateMatrixWorld();
    _ndc.copy(_v).project(this.camera);
    mainCamera.updateMatrixWorld();
    _ndc.z = 0.5;
    _ndc.unproject(mainCamera);
    mainCamera.getWorldPosition(_cp);
    _dir.subVectors(_ndc, _cp).normalize();
    mainCamera.getWorldDirection(_fw);
    const tt = depth / Math.max(0.1, _dir.dot(_fw));
    return out.copy(_cp).addScaledVector(_dir, tt);
  }

  /** Draw on top of the already rendered world (clears depth only). */
  render(renderer) {
    renderer.getSize(_size);
    const aspect = _size.x / Math.max(1, _size.y);
    if (Math.abs(aspect - this.camera.aspect) > 1e-4) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = ac;
  }

  dispose() {
    for (const m of this._cache.values()) disposeObject(m.group);
    this._cache.clear();
    this.material.dispose();
  }
}
