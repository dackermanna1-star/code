// Your weapons: one per slot (melee, pistols, SMGs, shotguns, rifles, snipers,
// heavy, throwables), each with ammo in the magazine and in reserve. Hold the
// right mouse button to aim over the shoulder (a soft lock-on pulls the
// crosshair onto the nearest threat), left to shoot: the bullet goes from the
// muzzle to whatever is under the crosshair. Recoil kicks the camera and
// recovers; the spread grows with firing and moving. Fists, knuckles, the
// knife and the bat have a three-hit combo, a charged heavy hit (hold) and a
// stomp for anyone on the ground. Grenades and molotovs: hold to cook (with an
// arc showing where it lands), release to throw. In a vehicle, hold the right
// button to lean out with a pistol or an SMG (a drive-by). Hold Tab for the
// weapon wheel (the game slows down while it's open).
//
//   V.weapons = new Weapons()
//   update(dt, input)      (after the player: it poses the player's arms and fires from the gun's muzzle)
//   aiming, zoomFov, target (the ped under the crosshair or locked on), armPose {rs, ls, lean}, wheelOpen, ownCrosshair
//   current {id, name, icon, mag, reserve}   (for the HUD; mag null for melee)
//   give(id, ammo) -> bool   addAmmo(id, n)   has(id)   select(slot | id)   buy(id) / buyAmmo(id, rounds) -> bool (pays from V.player.money)
//   save() / load(data)   clear() (busted: you lose your guns)   suppress(k) (bullets whizzing past)
//   gunModel(id) -> Object3D  a third-person weapon (shared geometry) for NPCs: gun space, barrel along -Z, grip at the origin
// Also: V.settings.lockOn (default on).
import * as THREE from 'three';
import { V, K } from '../state.js';
import { WEAPONS, SLOTS, SLOT_NAMES } from './data.js';
import { gunModel, handModel, weaponIcon } from './models.js';
import { playMech } from '../../warzone/fx.js';

const DEG = Math.PI / 180;
const R = Math.random;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3(), _c = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _down = new THREE.Vector3(0, -1, 0), _mat = new THREE.Matrix4();
const key = (inp, code, k) => inp.keys?.has('code:' + code) || (k && inp.keys?.has(k));
const pressed = (inp, code, k) => inp.pressed?.has('code:' + code) || (k && inp.pressed?.has(k));
const isHostile = (p) => p && !p.dead && (p.hostile || p.aggro || p.target === V.player || p.enemy === V.player || ((p.team === 'cops' || p.kind === 'cop' || p.kind === 'swat') && (V.police?.wanted || 0) > 0));

const CSS = `
.vc-wpn{position:absolute;inset:0;pointer-events:none;z-index:6}
.vc-xh{position:absolute;left:50%;top:50%;width:0;height:0;opacity:0;transition:opacity .1s}
.vc-xh.on{opacity:1}
.vc-xh i{position:absolute;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.5);border-radius:1px;transition:background .08s}
.vc-xh .d{width:4px;height:4px;left:-2px;top:-2px;border-radius:50%}
.vc-xh .t,.vc-xh .b{width:2px;height:8px;left:-1px}
.vc-xh .l,.vc-xh .r{width:8px;height:2px;top:-1px}
.vc-xh.tg i{background:#ff3b3b}
.vc-xh.melee .t,.vc-xh.melee .b,.vc-xh.melee .l,.vc-xh.melee .r{display:none}
.vc-lock{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border:2px solid #ff4646;transform:rotate(45deg) scale(1.6);opacity:0;transition:opacity .12s,transform .15s;box-shadow:0 0 6px rgba(255,40,40,.6)}
.vc-lock.on{opacity:.9;transform:rotate(45deg) scale(1)}
.vc-rel{position:absolute;left:50%;top:50%;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;opacity:0;-webkit-mask:radial-gradient(circle,transparent 11px,#000 12px);mask:radial-gradient(circle,transparent 11px,#000 12px)}
.vc-rel.on{opacity:.85}
.vc-scope{position:absolute;inset:0;opacity:0;transition:opacity .15s;background:radial-gradient(circle at 50% 50%,transparent 0,transparent 31vh,rgba(0,0,0,.9) 31.3vh,#000 34vh)}
.vc-scope.on{opacity:1}
.vc-scope::before,.vc-scope::after{content:"";position:absolute;background:rgba(0,0,0,.85)}
.vc-scope::before{left:50%;top:calc(50% - 31vh);width:1px;height:62vh}
.vc-scope::after{top:50%;left:calc(50% - 31vh);height:1px;width:62vh}
.vc-wheel{position:absolute;left:50%;top:50%;width:460px;height:460px;margin:-230px 0 0 -230px;opacity:0;transform:scale(.9);transition:opacity .12s,transform .12s}
.vc-wheel.on{opacity:1;transform:none}
.vc-wheel svg{position:absolute;inset:0;overflow:visible}
.vc-wheel path{fill:rgba(10,14,24,.55);stroke:rgba(255,255,255,.1);stroke-width:1.5;transition:fill .08s,stroke .08s}
.vc-wheel path.has{fill:rgba(14,20,34,.74)}
.vc-wheel path.cur{stroke:rgba(79,216,255,.75)}
.vc-wheel path.sel{fill:rgba(255,79,163,.5);stroke:#ff4fa3}
.vc-ws{position:absolute;width:120px;margin:-40px 0 0 -60px;text-align:center;opacity:.28;text-shadow:0 1px 4px rgba(0,0,0,.8)}
.vc-ws.has{opacity:1}
.vc-ws img{display:block;width:92px;height:46px;margin:0 auto;object-fit:contain;filter:drop-shadow(0 2px 3px rgba(0,0,0,.7))}
.vc-ws .e{display:block;font-size:30px;line-height:46px}
.vc-ws b{display:block;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;opacity:.75;font-weight:600}
.vc-ws span{display:block;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}
.vc-wc{position:absolute;left:50%;top:50%;width:170px;margin:-40px 0 0 -85px;text-align:center}
.vc-wc .s{font-size:10px;letter-spacing:3px;opacity:.6;text-transform:uppercase}
.vc-wc .n{font-size:18px;font-weight:800;font-style:italic;margin:3px 0}
.vc-wc .a{font-size:14px;opacity:.85;font-variant-numeric:tabular-nums}
`;

export class Weapons {
  constructor() {
    this.slots = {};
    for (const s of SLOTS) this.slots[s] = null;
    this.slots.melee = { id: 'fists', mag: null, reserve: null };
    this.slots.handgun = { id: 'pistol', mag: 12, reserve: 24 }; // a pistol and three magazines
    this.slot = 'melee';
    this.current = { id: 'fists', name: 'Fists', icon: '✊', mag: null, reserve: null };
    this.aiming = false; this.zoomFov = null; this.target = null; this.armPose = null; this.wheelOpen = false; this.ownCrosshair = true;
    this.driveBy = false;
    this.t = 0;
    this.cool = 0; this.bloom = 0; this.aimHold = 0; this.recoilDebt = 0; this.gunKick = 0; this.switchT = 0;
    this.reload = null;             // {t, dur, shells}
    this.atk = null;                // a melee attack in progress {kind, step, u, dur, heavy, hit, held}
    this.combo = 0; this.comboT = 0; this.queued = false; this.charge = -1;
    this.cook = -1;                 // seconds a grenade has been held (-1: not)
    this.lock = null; this.lockT = 0; this.lockBreakT = 0;
    this.scopeFov = 12;
    this.sched = [];
    this.hand = null; this.handId = null; this.thrownT = 0;
    this.aimHit = null;
    this.ps = { fR: 0, ry: 0, fL: 0, ly: 0, rh: 0, lean: 0, wR: 0, wL: 0, wH: 0, wLean: 0 };
    this.wheel = { x: 0, y: 0, sel: null, t: 0 };
    this._ui();
  }

  // ---- the arsenal ---------------------------------------------------------------------------------------------------------------------
  get w() { return WEAPONS[this.slots[this.slot]?.id] || WEAPONS.fists; }
  has(id) { const w = WEAPONS[id]; return !!w && this.slots[w.slot]?.id === id; }
  /** Pick up / buy a weapon: it goes in its slot (replacing what's there, keeping that slot's ammo). */
  give(id, ammo = null) {
    const w = WEAPONS[id];
    if (!w) return false;
    const s = this.slots[w.slot];
    const extra = ammo ?? (w.melee ? 0 : (w.mag || 1) * (w.thrown ? 3 : 4));
    if (w.melee) { this.slots[w.slot] = { id, mag: null, reserve: null }; }
    else if (s && s.id === id) { s.reserve = Math.min(w.reserveMax || 999, s.reserve + extra); if (s.mag === 0 && s.reserve > 0) { const k = Math.min(w.mag, s.reserve); s.mag = k; s.reserve -= k; } }
    else {
      const total = (s ? (s.mag || 0) + (s.reserve || 0) : 0) + extra;
      const mag = Math.min(w.mag, total);
      this.slots[w.slot] = { id, mag, reserve: Math.min(w.reserveMax || 999, total - mag) };
    }
    if (this.slot === w.slot) this._equip(true);
    V.events?.emit('weapon:get', { id });
    return true;
  }
  addAmmo(id, n) { const w = WEAPONS[id] || null; const s = w ? this.slots[w.slot] : this.slots[id]; if (!s || s.mag == null) return false; const W = WEAPONS[s.id]; s.reserve = Math.min(W.reserveMax || 999, s.reserve + n); if (s.mag === 0) this._autoReloadSoon(); return true; }
  buy(id) { const w = WEAPONS[id], P = V.player; if (!w || !P || P.money < w.price) return false; P.money -= w.price; this.give(id); return true; }
  buyAmmo(id, rounds) { const w = WEAPONS[id], P = V.player; if (!w || !this.has(id)) return false; const cost = (w.ammoPrice || 2) * rounds; if (P.money < cost) return false; P.money -= cost; return this.addAmmo(id, rounds); }
  /** Switch to a slot (or a weapon's slot). */
  select(s) {
    const slot = WEAPONS[s] ? WEAPONS[s].slot : s;
    if (!this.slots[slot] || slot === this.slot) return false;
    this.slot = slot;
    this._equip();
    return true;
  }
  _equip(quiet = false) {
    this.reload = null; this.atk = null; this.cook = -1; this.charge = -1; this.combo = 0;
    this.switchT = quiet ? 0 : 0.32;
    this.cool = Math.max(this.cool, 0.15);
    const w = this.w;
    if (!quiet && !w.melee && !w.thrown) this._at(0.12, () => playMech(w.id === 'shotgun' ? 'pumpBack' : 'slide', null, 0.5));
    this.lock = null;
  }
  _cycle(dir) {
    const have = SLOTS.filter((s) => this.slots[s] && this._usable(s));
    if (!have.length) return;
    const i = have.indexOf(this.slot);
    this.select(have[(i + dir + have.length) % have.length]);
  }
  _usable(s) { const x = this.slots[s]; if (!x) return false; const w = WEAPONS[x.id]; if (V.player?.vehicle) return !!w.driveBy && x.mag + x.reserve > 0; return true; }
  clear() {
    for (const s of SLOTS) this.slots[s] = null;
    this.slots.melee = { id: 'fists', mag: null, reserve: null };
    this.slot = 'melee'; this._equip(true);
  }
  save() { const o = {}; for (const s of SLOTS) if (this.slots[s]) o[s] = [this.slots[s].id, this.slots[s].mag, this.slots[s].reserve]; return { slots: o, cur: this.slot }; }
  load(d) {
    if (!d?.slots) return;
    for (const s of SLOTS) { const x = d.slots[s]; this.slots[s] = x && WEAPONS[x[0]] ? { id: x[0], mag: x[1], reserve: x[2] } : null; }
    if (!this.slots.melee) this.slots.melee = { id: 'fists', mag: null, reserve: null };
    this.slot = this.slots[d.cur] ? d.cur : 'melee';
    this._equip(true);
  }
  gunModel(id) { return gunModel(id); }
  suppress(k = 0.4) { V.cam?.shake?.(0.12 * k); }
  _at(t, fn) { this.sched.push({ t, fn }); }
  _autoReloadSoon() { this._at(0.25, () => { const s = this.slots[this.slot]; if (s && s.mag === 0 && s.reserve > 0 && !this.reload) this._startReload(); }); }

  // ---- every frame ---------------------------------------------------------------------------------------------------------------------
  update(dt, inp) {
    const P = V.player;
    if (!P?.model || !inp) return;
    this.t += dt;
    for (let i = this.sched.length - 1; i >= 0; i--) { const s = this.sched[i]; s.t -= dt; if (s.t <= 0) { this.sched.splice(i, 1); s.fn(); } }
    const live = V.session?.state === 'play';
    if (!live || P.dead || P.ragdoll || P.knockT > 0 || P.stunT > 0.6) { this._still(dt, inp, live); return; }
    this._wheelInput(dt, inp);
    if (!this.wheelOpen) {
      for (let i = 0; i < SLOTS.length; i++) if (pressed(inp, 'Digit' + (i + 1))) { if (this._usable(SLOTS[i])) this.select(SLOTS[i]); else V.hud?.notify?.(`No ${SLOT_NAMES[SLOTS[i]].toLowerCase()}.`, 1.5); }
      const scoped = this.aiming && this.w.zoom;
      if (inp.wheel && !scoped) this._cycle(inp.wheel > 0 ? 1 : -1);
      if (inp.wheel && scoped) this.scopeFov = clamp(this.scopeFov * (inp.wheel > 0 ? 1.25 : 0.8), 5, 32);
    }
    this.switchT = Math.max(0, this.switchT - dt);
    this.gunKick = Math.max(0, this.gunKick - dt * 9);
    this.bloom = Math.max(0, this.bloom - dt * (this.w.auto ? 7 : 5));
    // recoil comes back down by itself (most of it)
    if (this.recoilDebt > 1e-4) { const r = this.recoilDebt * Math.min(1, dt * 9); V.cam?.kick?.(-r, 0); this.recoilDebt -= r; }
    const T = this._target0();
    if (P.vehicle) this._vehicle(dt, inp, T); else this._foot(dt, inp, T);
    this._applyPose(dt, T);
    this._hud(dt);
  }

  /** Dead, knocked down, paused: no aiming, nothing in the way. */
  _still(dt, inp, live) {
    this.aiming = false; this.target = null; this.zoomFov = null; this.lock = null; this.driveBy = false;
    this.atk = null; this.cook = -1; this.charge = -1;
    if (this.wheelOpen) this._closeWheel(false);
    const P = V.player;
    if (this.hand) this.hand.visible = !P.dead && !P.vehicle;
    this.ps.wR = this.ps.wL = this.ps.wH = this.ps.wLean = 0;
    this.armPose = null;
    const m = P.model;
    if (m) { m.rightShoulder.rotation.y = m.rightShoulder.rotation.z = 0; m.leftShoulder.rotation.y = m.leftShoulder.rotation.z = 0; }
    this._hud(dt);
  }

  _target0() { const T = this._T || (this._T = {}); T.fR = 0; T.ry = 0; T.rz = 0; T.fL = 0; T.ly = 0; T.rh = 0; T.lean = 0; T.tw = 0; T.gp = 0; T.useR = T.useL = T.useH = T.useLean = false; T.k = 16; T.show = false; return T; }

  // ---- on foot -------------------------------------------------------------------------------------------------------------------------
  _foot(dt, inp, T) {
    const w = this.w;
    this.driveBy = false;
    if (w.melee) return this._melee(dt, inp, T);
    if (w.thrown) return this._throw(dt, inp, T);
    return this._gun(dt, inp, T, false);
  }

  /** Guns (on foot, or out of a vehicle's window). */
  _gun(dt, inp, T, drive) {
    const P = V.player, w = this.w, s = this.slots[this.slot];
    const rmb = inp.buttons?.has(2) && !this.wheelOpen;
    this.aimHold = Math.max(0, this.aimHold - dt);
    this.aiming = drive ? true : (rmb || this.aimHold > 0) && !P.swimming;
    if (P.sprinting && !rmb) { this.aimHold = 0; this.aiming = false; }
    this.zoomFov = this.aiming && !drive ? (w.zoom && rmb ? this.scopeFov : rmb ? (w.twoHand ? 42 : 46) : 55) : null;
    if (V.cam) V.cam.zoom = this.zoomFov && w.zoom ? this.zoomFov / 48 : 1;
    // reloading
    if (pressed(inp, 'KeyR', 'r') && !this.reload && s.mag < w.mag && s.reserve > 0) this._startReload();
    if (this.reload) this._reloading(dt, inp);
    // what's under the crosshair
    const aim = this._aimTrace(w.max || 300, drive);
    this._lockOn(dt, inp, rmb && !drive);
    // fire
    this.cool -= dt;
    const trig = !this.wheelOpen && (w.auto ? inp.buttons?.has(0) : inp.clicked?.has(0));
    let fired = false;
    if (trig && this.cool <= 0 && this.switchT <= 0 && !(this.reload && !(w.shellReload && s.mag > 0))) {
      if (s.mag > 0) {
        if (this.reload) this.reload = null; // (a shotgun stops loading to fire)
        fired = true;
      } else if (inp.clicked?.has(0)) { playMech('dry', null, 0.6); this.cool = 0.25; if (s.reserve > 0) this._startReload(); }
    }
    // pose: the arm along the aim (the camera's pitch), the other hand on the gun
    const pitch = V.cam?.pitch ?? 0;
    T.show = this.switchT < 0.16;
    if (drive) { /* the drive-by pose is set in _vehicle */ }
    else if (this.aiming && this.switchT <= 0) {
      // a bladed stance: the body turned a little to the right, both arms on the gun, pointing where you aim
      const kick = this.gunKick * (w.recoil > 3 ? 0.5 : 0.18), tw = w.twoHand ? 0.42 : 0.2;
      T.useLean = true; T.lean = 0.04; T.tw = tw;
      // (the forearm dips a little below the line and the gun tilts back up: from behind you see the gun over the fist)
      const dip = w.twoHand ? 0.12 : 0.22;
      T.useR = true; T.fR = Math.PI / 2 + pitch + kick - dip; T.ry = tw + (w.twoHand ? -0.02 : 0.02); T.gp = dip;
      T.useL = true; T.fL = Math.PI / 2 + pitch * 0.95 + kick * 0.6 - (w.twoHand ? 0.1 : 0.06); T.ly = tw - (w.twoHand ? 0.6 : 0.62);
      if (this.reload) { T.fR -= 0.5; T.fL = 1.1; T.ly = tw - 0.5; }
      T.k = 22;
    } else {
      // carried: rifles across the body, pistols down by your side
      if (w.twoHand) { T.useLean = true; T.tw = 0.3; T.useR = true; T.fR = 0.55; T.ry = 0.5; T.useL = true; T.fL = 0.85; T.ly = -0.45; }
      else { T.useR = true; T.fR = 0.18; T.ry = 0; }
      if (this.reload) { T.fR = 0.75; T.useL = true; T.fL = 1.0; T.ly = -0.55; }
      if (this.switchT > 0) { T.fR = -0.2; T.useL = false; }
      T.k = 12;
    }
    if (fired) {
      // fire from this frame's pose
      this._applyPose(dt, T, true);
      this._shoot(aim, drive);
      if (!rmb && !drive) this.aimHold = 0.9;
    }
  }

  /** The point under the crosshair (a ray from the camera; things between the camera and you don't count). */
  _aimTrace(max, drive) {
    const P = V.player, cam = V.cam;
    if (!cam || !V.combat) { this.aimHit = null; return null; }
    const ray = cam.aimRay();
    // start level with the player (or the car)
    _c.set(P.pos.x, P.pos.y + 4, P.pos.z);
    const t0 = Math.max(0, _c.sub(ray.origin).dot(ray.dir) - (drive ? 0 : 1.5));
    _o.copy(ray.origin).addScaledVector(ray.dir, t0);
    const h = V.combat.trace(P, _o, ray.dir, max, { skipVeh: P.vehicle || null });
    h.d += t0;
    h.dir = ray.dir.clone();
    this.aimHit = h;
    this.target = this.lock || ((h.kind === 'ped') && !h.ped?.dead ? h.ped : null);
    return h;
  }

  /** Soft lock-on: aiming snaps to the nearest threat (or person) near the crosshair and follows them. */
  _lockOn(dt, inp, rmb) {
    this.lockBreakT = Math.max(0, this.lockBreakT - dt);
    if (!rmb || V.settings?.lockOn === false || !V.peds?.near) { this.lock = null; return; }
    const cam = V.world.camera.position;
    const justAimed = inp.clicked?.has(2);
    // a firm flick of the mouse breaks the lock
    if (this.lock && Math.abs(inp.mx || 0) + Math.abs(inp.my || 0) > 45) { this.lock = null; this.lockBreakT = 0.6; }
    if (this.lock && (this.lock.dead || this.lock.ragdoll || this.lock.removed || this.lock.pos.distanceTo(cam) > 220)) this.lock = null;
    this.lockT -= dt;
    if (justAimed || (!this.lock && this.lockBreakT <= 0 && this.lockT <= 0)) {
      this.lockT = 0.25;
      this.lock = this._findLock(justAimed ? 16 : 6) || this.lock;
    }
    if (this.lock) {
      const p = this.lock;
      _v.set(p.pos.x + (p.vel?.x || 0) * 0.05, p.pos.y + 3.3, p.pos.z + (p.vel?.z || 0) * 0.05).sub(cam);
      const yaw = Math.atan2(-_v.x, -_v.z), pitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
      let dy = yaw - V.cam.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const dp = pitch - V.cam.pitch;
      const k = justAimed ? 0.85 : Math.min(1, dt * 10);
      V.cam.kick(dp * k, dy * k);
      this.target = p;
    }
  }
  _findLock(coneDeg) {
    const cam = V.world.camera.position, ray = V.cam.aimRay();
    const list = V.peds.near(V.player.pos.x, V.player.pos.z, 160) || [];
    let best = null, bs = Infinity;
    const cosMax = Math.cos(coneDeg * DEG);
    for (const p of list) {
      if (!p?.pos || p.dead || p.ragdoll || p === V.player) continue;
      _v.set(p.pos.x, p.pos.y + 3.3, p.pos.z).sub(cam);
      const d = _v.length();
      if (d < 2 || d > 160) continue;
      const c = _v.dot(ray.dir) / d;
      if (c < cosMax) continue;
      const ang = Math.acos(Math.min(1, c));
      const s = ang * (isHostile(p) ? 0.35 : 1) + d * 0.0015;
      if (s >= bs) continue;
      if (!V.phys.sees(cam.x, cam.y, cam.z, p.pos.x, p.pos.y + 3.3, p.pos.z, { skip: (b) => b.vehicle || b.kerb || b.pole })) continue;
      bs = s; best = p;
    }
    return best;
  }

  /** One trigger pull. */
  _shoot(aim, drive) {
    const P = V.player, w = this.w, s = this.slots[this.slot];
    s.mag--;
    this.cool = 60 / (w.rpm || 300);
    const gun = this.hand?.userData?.gun;
    // the muzzle in the world
    if (gun) { _m.copy(gun.userData.muzzle); gun.localToWorld(_m); } else _m.set(P.pos.x, P.pos.y + 3.6, P.pos.z);
    // fire from the muzzle at the point under the crosshair (from the chest if the muzzle is through a wall)
    _c.set(P.pos.x, P.pos.y + 3.8, P.pos.z);
    _o.copy(_m);
    _v.subVectors(_m, _c); const ml = _v.length();
    if (ml > 0.1 && V.phys.ray(_c.x, _c.y, _c.z, _v.x / ml, _v.y / ml, _v.z / ml, ml, { skip: (b) => b.vehicle || b.kerb })) _o.copy(_c);
    const camDir = aim?.dir || V.cam.aimRay().dir;
    if (aim && aim.kind) _d.subVectors(aim.point, _o); else _d.copy(camDir).multiplyScalar(w.max || 300).add(V.cam.aimRay().origin).sub(_o);
    if (_d.lengthSq() < 4 || _d.normalize().dot(camDir) < 0.4) _d.copy(camDir);
    const spread = this._spread(drive);
    V.combat?.fire?.(P, _o, _d, w.id, { muzzle: _m, spread, skipVeh: P.vehicle || null });
    // the kick
    const pk = w.recoil * DEG * (this.aiming && !drive ? 0.75 : 1) * (0.8 + R() * 0.4);
    V.cam?.kick?.(pk, (R() - 0.5) * w.recoil * 0.5 * DEG);
    this.recoilDebt += pk * 0.62;
    this.bloom = Math.min(w.auto ? 4 : 3, this.bloom + w.recoil * (w.auto ? 0.35 : 0.5));
    this.gunKick = 1;
    V.cam?.shake?.(Math.min(0.4, w.recoil * 0.035));
    // a spent case
    if (gun && w.id !== 'rpg') { _v.copy(gun.userData.eject); gun.localToWorld(_v); V.fx?.brass?.(_v, _d, w.id === 'shotgun'); }
    if (w.pump) this._at(0.32, () => { playMech('pumpBack', null, 0.6); this._at(0.12, () => playMech('pumpFwd', null, 0.6)); });
    if (w.bolt) this._at(0.35, () => { playMech('boltUp', null, 0.6); this._at(0.15, () => playMech('boltBack', null, 0.6)); this._at(0.32, () => playMech('boltFwd', null, 0.6)); });
    if (s.mag === 0 && s.reserve > 0) this._autoReloadSoon();
    if (w.id === 'rpg') this.recoilDebt *= 0.5;
  }
  _spread(drive) {
    const P = V.player, w = this.w;
    const aimed = V.input?.buttons?.has(2) && !drive;
    let s = aimed ? w.cone[1] : w.cone[0];
    const mv = Math.hypot(P.vel.x, P.vel.z) / 14;
    s += mv * (w.twoHand ? 1.6 : 1.1) + (P.grounded || P.vehicle ? 0 : 2.5) + this.bloom + (drive ? 1.6 : 0);
    if (w.zoom && !aimed) s = Math.max(s, 6);
    return s;
  }
  _startReload() {
    const w = this.w, s = this.slots[this.slot];
    if (!s || s.mag == null || s.reserve <= 0 || s.mag >= w.mag) return;
    if (w.shellReload) { this.reload = { t: 0, dur: w.reload, shells: true }; return; }
    this.reload = { t: 0, dur: w.reload, shells: false, sIn: false, sRack: false };
    playMech('magOut', null, 0.6);
  }
  _reloading(dt) {
    const r = this.reload, w = this.w, s = this.slots[this.slot];
    r.t += dt;
    if (r.shells) {
      if (r.t >= r.dur) {
        s.mag++; s.reserve--; r.t = 0;
        playMech('shell', null, 0.6);
        if (s.mag >= w.mag || s.reserve <= 0) { this.reload = null; this._at(0.1, () => { playMech('pumpBack', null, 0.6); this._at(0.12, () => playMech('pumpFwd', null, 0.6)); }); }
      }
      return;
    }
    if (!r.sIn && r.t > r.dur * 0.62) { r.sIn = true; playMech('magIn', null, 0.6); }
    if (!r.sRack && r.t > r.dur * 0.85) { r.sRack = true; playMech(w.twoHand ? 'rack' : 'slide', null, 0.6); }
    if (r.t >= r.dur) {
      const k = Math.min(w.mag - s.mag, s.reserve);
      s.mag += k; s.reserve -= k;
      this.reload = null;
    }
  }

  // ---- melee: a combo, a charged heavy, a stomp ----------------------------------------------------------------------------------------
  _melee(dt, inp, T) {
    const P = V.player, w = this.w;
    this.aiming = false; this.zoomFov = null; this.lock = null;
    if (V.cam) V.cam.zoom = 1;
    const lmbDown = !this.wheelOpen && inp.buttons?.has(0), click = !this.wheelOpen && inp.clicked?.has(0), rel = inp.unclicked?.has(0);
    this.comboT -= dt;
    if (this.comboT <= 0 && !this.atk) this.combo = 0;
    this.target = null;
    const fwd = this._camFlat();
    // who's in front (for the crosshair and to turn toward)
    const tg = V.combat?.meleeTarget?.(P, w.id, fwd);
    if (tg && !tg.target.dead) this.target = tg.target;
    // charging a heavy hit
    if (this.charge >= 0) {
      this.charge += dt;
      if (!lmbDown || rel || this.charge > 1.6) { this._startAttack(this.charge > 0.25 ? 'heavy' : 'light', tg, fwd); this.charge = -1; }
    } else if (click && this.switchT <= 0) {
      if (!this.atk) this._startAttack('light', tg, fwd);
      else if (this.atk.u > 0.08) this.queued = true; // (buffered: the next blow follows this one)
    }
    if (this.atk) {
      const a = this.atk;
      if (a.stop > 0) a.stop -= dt; // (a moment's hit-stop when a blow lands)
      else a.u += dt / a.dur;
      // step in with the blow (up to a stud short of them)
      if (!a.hit && a.u > 0.12 && a.target && !a.target.dead && a.kind !== 'stomp') {
        const dx = a.target.pos.x - P.pos.x, dz = a.target.pos.z - P.pos.z, dd = Math.hypot(dx, dz);
        const step = Math.min(Math.max(0, dd - 2.7), dt * 9);
        if (step > 0) { P.pos.x += dx / dd * step; P.pos.z += dz / dd * step; }
      }
      // the blow lands
      if (!a.hit && a.u >= a.at) {
        a.hit = true;
        const r = V.combat?.melee?.(P, w.id, { heavy: a.heavy, finisher: a.fin, dir: a.dir, target: a.target || undefined });
        if (r && (r.target || r.veh || r.wall)) a.stop = a.heavy ? 0.09 : 0.05;
        if (r?.target && !r.target.dead && a.kind !== 'stomp') this._face(r.target.pos);
      }
      if (a.u >= 1) {
        const next = this.queued && a.kind !== 'heavy' && a.kind !== 'stomp';
        const held = a.kind === 'light' && lmbDown && !this.queued && a.step === 0;
        this.atk = null; this.queued = false;
        if (next) this._startAttack('light', V.combat?.meleeTarget?.(P, w.id, fwd), fwd);
        else if (held) this.charge = 0.3; // (still holding: wind up a heavy one)
        else this.comboT = 0.35;
      }
    }
    // the pose
    T.show = true;
    if (this.charge >= 0) this._poseWindup(T, w, Math.min(1, this.charge / 0.6));
    else if (this.atk) this._poseAttack(T, w, this.atk);
    else if (w.kind === 'blunt') { T.useR = true; T.fR = 0.35; T.ry = 0.15; T.useL = true; T.fL = 0.4; T.ly = -0.5; T.k = 10; }
    else if (w.kind === 'stab') { T.useR = true; T.fR = 0.4; T.k = 10; }
    else if (this.comboT > 0 || this.target) { T.useR = true; T.fR = 1.0; T.ry = 0.35; T.useL = true; T.fL = 1.1; T.ly = -0.35; T.k = 12; } // fists up
  }
  _camFlat() { const y = V.cam ? V.cam.yaw : V.player.heading + Math.PI; return { x: -Math.sin(y), z: -Math.cos(y) }; }
  _face(p) { const P = V.player; const h = Math.atan2(p.x - P.pos.x, p.z - P.pos.z); P.heading = h; }
  _startAttack(kind, tg, fwd) {
    const P = V.player, w = this.w;
    const down = !!tg?.down;
    let k = kind;
    if (down && tg.dist < (w.reach || 4.4) + 1) k = 'stomp';
    const step = k === 'light' ? this.combo % (w.combo || 3) : 0;
    const fin = k === 'light' && step === (w.combo || 3) - 1;
    const dur = (k === 'heavy' ? 1.45 : k === 'stomp' ? 1.2 : fin ? 1.25 : 1) / (w.speed || 2.5);
    // turn to face who we're hitting (or where the camera looks)
    const dir = tg?.target ? { x: tg.target.pos.x - P.pos.x, z: tg.target.pos.z - P.pos.z } : { x: fwd.x, z: fwd.z };
    const L = Math.hypot(dir.x, dir.z) || 1; dir.x /= L; dir.z /= L;
    P.heading = Math.atan2(dir.x, dir.z);
    this.atk = { kind: k, step, fin, heavy: k === 'heavy', dur, u: 0, at: k === 'heavy' ? 0.42 : k === 'stomp' ? 0.5 : 0.45, hit: false, stop: 0, dir, target: tg ? tg.target : null };
    if (k === 'light') { this.combo++; this.comboT = 0.6; }
  }
  /** The heavy wind-up: drawn back. */
  _poseWindup(T, w, k) {
    T.k = 14; T.useR = true; T.useLean = true; T.lean = -0.08 * k;
    if (w.kind === 'blunt') { T.fR = 1.2 + 1.6 * k; T.ry = -0.5 * k; T.useL = true; T.fL = 1.2 + 1.4 * k; T.ly = -0.9; }
    else { T.fR = -0.6 * k; T.ry = -0.4 * k; T.useL = true; T.fL = 1.1; T.ly = -0.35; }
  }
  /** Each attack is a curve over u (0..1): wind-up, the strike, then recover. */
  _poseAttack(T, w, a) {
    const u = a.u, strike = ease(clamp((u - 0.15) / (a.at - 0.15), 0, 1)), back = ease(clamp((u - a.at - 0.12) / (1 - a.at - 0.12), 0, 1));
    const ext = strike * (1 - back); // 0 -> 1 -> 0
    T.useR = true; T.useL = true; T.k = 40; T.useLean = true;
    if (a.kind === 'stomp') {
      T.useH = true; const lift = ease(clamp(u / 0.35, 0, 1)), slam = ease(clamp((u - 0.35) / 0.17, 0, 1));
      T.rh = (1.25 * lift - 1.15 * slam) * (1 - back); T.lean = 0.12 + 0.12 * slam * (1 - back);
      T.fR = -0.3; T.fL = 0.3; T.ly = 0; return;
    }
    if (w.kind === 'blunt') {
      if (a.heavy) { T.fR = 2.8 - 2.0 * strike + 0.4 * back; T.ry = -0.2; T.fL = 2.6 - 1.9 * strike + 0.4 * back; T.ly = -0.9; T.lean = 0.2 * ext; return; }
      // a flat swing across: right to left (or back again on the second hit)
      const s = a.step % 2 === 0 ? 1 : -1;
      T.fR = 1.25 + 0.15 * ext; T.ry = s * lerp(-1.4, 1.1, strike) * (1 - back * 0.7);
      T.fL = 1.2; T.ly = T.ry - 0.8; T.lean = 0.06 * ext; return;
    }
    if (w.kind === 'stab') {
      if (a.step % 2 === 0 && !a.heavy) { T.fR = 0.4 + 1.25 * ext; T.ry = 0.1; T.fL = 0.6; T.ly = -0.3; T.lean = 0.12 * ext; }
      else { T.fR = 1.35; T.ry = lerp(-1.2, 0.9, strike) * (1 - back); T.fL = 0.8; T.ly = -0.3; T.lean = 0.1 * ext; }
      return;
    }
    // fists: jab (right), cross (left), then an uppercut; heavy: a big haymaker
    if (a.heavy) { T.fR = -0.6 + 2.3 * strike - 1.3 * back; T.ry = lerp(-1.0, 0.45, strike) * (1 - back); T.fL = 1.1; T.ly = -0.35; T.lean = 0.18 * ext - 0.06; return; }
    if (a.fin) { T.fR = -0.2 + 2.6 * strike - 2.0 * back; T.ry = 0.3; T.fL = 1.1; T.ly = -0.35; T.lean = -0.12 * ext + 0.05; return; }
    if (a.step % 2 === 0) { T.fR = 0.9 + 0.75 * ext; T.ry = 0.35 - 0.3 * ext; T.fL = 1.1; T.ly = -0.35; T.lean = 0.08 * ext; }
    else { T.fL = 0.9 + 0.75 * ext; T.ly = -0.35 + 0.3 * ext; T.fR = 1.0; T.ry = 0.35; T.lean = 0.08 * ext; }
  }

  // ---- grenades and molotovs ---------------------------------------------------------------------------------------------------------
  _throw(dt, inp, T) {
    const P = V.player, w = this.w, s = this.slots[this.slot];
    this.aiming = false; this.zoomFov = null; this.lock = null; this.target = null;
    const lmb = !this.wheelOpen && inp.buttons?.has(0);
    T.show = this.switchT < 0.16 && s.mag > 0 && !this.thrownT;
    if (this.thrownT > 0) { this.thrownT -= dt; if (this.thrownT <= 0) { this.thrownT = 0; } }
    if (this.cook < 0 && lmb && inp.clicked?.has(0) && s.mag > 0 && this.switchT <= 0 && !this.thrownT) { this.cook = 0; if (w.projectile === 'grenade') playMech('boltUp', null, 0.5); }
    if (this.cook >= 0) {
      this.cook += dt;
      this.aiming = true; this.zoomFov = 56;
      // too long with the pin out
      if (w.projectile === 'grenade' && this.cook >= w.fuse) { this._release(true); return; }
      if (!lmb) this._release(false);
    }
    this._arc(this.cook >= 0);
    const pitch = V.cam?.pitch ?? 0;
    if (this.cook >= 0) { T.useR = true; T.fR = 3.5 + pitch * 0.3; T.ry = 0.2; T.useL = true; T.fL = 1.3; T.ly = -0.3; T.k = 14; }
    else if (this.thrownT > 0) { const k = this.thrownT / 0.35; T.useR = true; T.fR = 1.2 + 2.3 * (k * k) ; T.k = 40; }
  }
  _throwVel(out) {
    const P = V.player, w = this.w, cam = V.cam;
    const pitch = clamp((cam?.pitch ?? 0) + 0.32, -0.5, 1.2);
    const yaw = cam ? cam.yaw : P.heading + Math.PI;
    const sp = w.speed || 60;
    out.set(-Math.sin(yaw) * Math.cos(pitch) * sp, Math.sin(pitch) * sp, -Math.cos(yaw) * Math.cos(pitch) * sp);
    out.x += P.vel.x * 0.6; out.z += P.vel.z * 0.6;
    return out;
  }
  _release(inHand) {
    const P = V.player, w = this.w, s = this.slots[this.slot];
    const cooked = this.cook;
    this.cook = -1;
    const hand = this.hand?.userData?.gun;
    if (hand) { _m.set(0, 0, 0); hand.localToWorld(_m); } else _m.set(P.pos.x, P.pos.y + 5.5, P.pos.z);
    _m.y = Math.max(_m.y, P.pos.y + 4.6);
    if (inHand) V.combat?.explode?.(_m, w.radius, w.dmg, P);
    else V.combat?.launch?.(P, _m, this._throwVel(_v).clone().normalize(), w.id, { vel: this._throwVel(_w).clone(), cooked: w.projectile === 'grenade' ? cooked : 0 });
    s.mag--;
    this.thrownT = 0.35;
    V.audio?.play?.((c, out, t, K2) => { const n = K2.noise(c); const f = K2.filt(c, 'bandpass', 700, 1); const g = c.createGain(); K2.env(g, t, 0.02, 0.4, 0.15); K2.chain(n, f, g, out); n.start(t); n.stop(t + 0.25); }, null, 0.5);
    if (s.mag <= 0) {
      if (s.reserve > 0) { s.reserve--; s.mag = 1; }
      else { this.slots[this.slot] = null; this._at(0.4, () => { if (!this.slots[this.slot]) { this.slot = 'melee'; this._equip(true); } }); }
    }
  }
  /** The throw's path while cooking: a line and a ring where it comes down. */
  _arc(on) {
    if (!this.arcLine) {
      const N = 40;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      this.arcLine = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.75, depthWrite: false }));
      this.arcLine.frustumCulled = false; this.arcLine.renderOrder = 9;
      this.arcRing = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
      this.arcRing.renderOrder = 9;
      V.world.scene.add(this.arcLine); V.world.scene.add(this.arcRing);
    }
    this.arcLine.visible = this.arcRing.visible = on;
    if (!on) return;
    const P = V.player, pos = this.arcLine.geometry.attributes.position, N = pos.count;
    const hand = this.hand?.userData?.gun;
    if (hand) { _m.set(0, 0, 0); hand.localToWorld(_m); } else _m.set(P.pos.x, P.pos.y + 5.5, P.pos.z);
    _m.y = Math.max(_m.y, P.pos.y + 4.6);
    this._throwVel(_v);
    const h = 0.045;
    let n = 0, landed = false;
    _o.copy(_m);
    for (; n < N; n++) {
      pos.setXYZ(n, _o.x, _o.y, _o.z);
      if (landed) continue;
      _w.copy(_v).multiplyScalar(h);
      const L = _w.length();
      if (L > 1e-4) {
        const hit = V.phys.ray(_o.x, _o.y, _o.z, _w.x / L, _w.y / L, _w.z / L, L, { skip: (b) => b.vehicle && b.vehicle === P.vehicle });
        if (hit) { _o.set(hit.x, hit.y, hit.z); landed = true; this.arcRing.position.set(hit.x + hit.nx * 0.1, hit.y + hit.ny * 0.1, hit.z + hit.nz * 0.1); this.arcRing.quaternion.setFromUnitVectors(_c.set(0, 1, 0), _d.set(hit.nx, hit.ny, hit.nz)); continue; }
      }
      _o.add(_w); _v.y -= K.G * h;
    }
    pos.needsUpdate = true;
    this.arcRing.visible = landed;
    const r = (this.w.radius || 10) * (this.w.projectile === 'molotov' ? 1 : 0.35);
    this.arcRing.scale.setScalar(r / 1.5);
  }

  // ---- in a vehicle: drive-bys -----------------------------------------------------------------------------------------------------
  _vehicle(dt, inp, T) {
    const P = V.player, veh = P.vehicle;
    const rmb = inp.buttons?.has(2) && !this.wheelOpen;
    const can = veh && (veh.kind === 'car' || veh.kind === 'bike' || veh.kind === 'boat') && !veh.dead;
    this.lock = null; this.atk = null; this.cook = -1;
    if (!rmb || !can) { this.aiming = false; this.driveBy = false; this.zoomFov = null; this.target = null; this.reload && this._reloading(dt); return; }
    // a weapon you can use out of a window
    if (!this.w.driveBy || this.slots[this.slot].mag + this.slots[this.slot].reserve <= 0) {
      const alt = ['smg', 'handgun'].find((s) => this.slots[s] && WEAPONS[this.slots[s].id].driveBy && this.slots[s].mag + this.slots[s].reserve > 0);
      if (!alt) { this.aiming = false; this.driveBy = false; if (inp.clicked?.has(2)) V.hud?.notify?.('You need a pistol or an SMG for drive-bys.', 2); return; }
      this.slot = alt; this._equip(true);
    }
    this.driveBy = true;
    // the arm points out at what the crosshair was on (last frame's aim), then fire
    const m = P.model, aim = this.aimHit;
    if (m && aim) {
      _c.setFromMatrixPosition(m.rightShoulder.matrixWorld);
      _d.subVectors(aim.point, _c).normalize();
      // into the model's frame (the shoulder's parent is the root)
      _q.copy(m.root.quaternion).invert();
      _d.applyQuaternion(_q);
      _q2.setFromUnitVectors(_down, _d);
      _e.setFromQuaternion(_q2, 'YXZ');
      T.useR = true; T.fR = _e.x; T.ry = _e.y; T.rz = _e.z; T.k = 18;
    }
    this._gun(dt, inp, T, true);
    T.show = true;
  }

  // ---- the arms and the gun in your hand -----------------------------------------------------------------------------------------------
  _applyPose(dt, T, now = false) {
    const P = V.player, m = P.model, ps = this.ps;
    if (!m) return;
    // the gun in your hand
    const w = this.w;
    const mid = w.melee ? (w.model || null) : (w.gun || w.model || null);
    if (mid !== this.handId) {
      if (this.hand) this.hand.parent?.remove(this.hand);
      this.hand = mid ? handModel(w.id) : null;
      this.handId = mid;
      if (this.hand) P.handBone?.()?.add(this.hand);
    }
    if (this.hand) {
      const show = T.show && !P.swimming && (!P.vehicle || this.driveBy);
      this.hand.visible = show;
      // guns kick back in the hand when they fire
      const g = this.hand.userData.gun;
      ps.gp = (ps.gp || 0) + ((T.gp || 0) - (ps.gp || 0)) * Math.min(1, dt * 16);
      if (g) { g.position.z = this.gunKick * (w.recoil > 3 ? 0.35 : 0.12); g.rotation.x = ps.gp + this.gunKick * (w.recoil > 3 ? 0.25 : 0.06); }
    }
    if (now) return this._writePose(T, 1); // (firing: this frame's pose, exactly)
    // ease toward the target pose
    const k = Math.min(1, dt * (T.k || 16)), kw = Math.min(1, dt * 12);
    ps.wR += ((T.useR ? 1 : 0) - ps.wR) * kw; ps.wL += ((T.useL ? 1 : 0) - ps.wL) * kw;
    ps.wH += ((T.useH ? 1 : 0) - ps.wH) * Math.min(1, dt * 20); ps.wLean += ((T.useLean ? 1 : 0) - ps.wLean) * kw;
    if (T.useR) { ps.fR += (T.fR - ps.fR) * k; ps.ry += (T.ry - ps.ry) * k; ps.rz = (ps.rz || 0) + ((T.rz || 0) - (ps.rz || 0)) * k; }
    if (T.useL) { ps.fL += (T.fL - ps.fL) * k; ps.ly += (T.ly - ps.ly) * k; }
    if (T.useH) ps.rh += (T.rh - ps.rh) * Math.min(1, dt * 40);
    if (T.useLean) { ps.lean += (T.lean - ps.lean) * k; ps.tw = (ps.tw || 0) + ((T.tw || 0) - (ps.tw || 0)) * k; }
    this._writePose(T, 0);
  }
  _writePose(T, exact) {
    const P = V.player, m = P.model, ps = this.ps;
    if (exact) {
      if (T.useR) { ps.fR = T.fR; ps.ry = T.ry; ps.rz = T.rz || 0; ps.wR = 1; }
      if (T.useL) { ps.fL = T.fL; ps.ly = T.ly; ps.wL = 1; }
    }
    const rs = m.rightShoulder, ls = m.leftShoulder;
    rs.rotation.order = 'YXZ'; ls.rotation.order = 'YXZ';
    // blend with what the player's own animation set this frame
    if (ps.wR > 0.01) { rs.rotation.x = lerp(rs.rotation.x, ps.fR, ps.wR); rs.rotation.y = ps.ry * ps.wR; rs.rotation.z = (ps.rz || 0) * ps.wR; } else { rs.rotation.y = 0; rs.rotation.z = 0; }
    if (ps.wL > 0.01) { ls.rotation.x = lerp(ls.rotation.x, ps.fL, ps.wL); ls.rotation.y = ps.ly * ps.wL; ls.rotation.z = 0; } else { ls.rotation.y = 0; ls.rotation.z = 0; }
    if (ps.wH > 0.01) m.rightHip.rotation.x = lerp(m.rightHip.rotation.x, ps.rh, ps.wH);
    if (ps.wLean > 0.01 && !P.vehicle) { _e.set(ps.lean * ps.wLean, P.heading + Math.PI - (ps.tw || 0) * ps.wLean, 0, 'YXZ'); m.root.quaternion.setFromEuler(_e); }
    // for player.js (the next frame starts from this; ls in setAngles' sign)
    this.armPose = ps.wR > 0.98 || ps.wL > 0.98 ? { rs: ps.wR > 0.98 ? ps.fR : null, ls: ps.wL > 0.98 ? -ps.fL : null, lean: ps.wLean > 0.98 && !P.vehicle ? ps.lean : null } : null;
    m.root.updateMatrixWorld(true);
  }

  // ---- the weapon wheel ------------------------------------------------------------------------------------------------------------------
  _wheelInput(dt, inp) {
    const held = key(inp, 'Tab', 'tab');
    if (held && !this.wheelOpen) this._openWheel();
    if (!this.wheelOpen) return;
    // the mouse picks a segment (and doesn't turn the camera)
    const W = this.wheel;
    W.x += (inp.mx || 0); W.y += (inp.my || 0);
    const L = Math.hypot(W.x, W.y);
    if (L > 130) { W.x *= 130 / L; W.y *= 130 / L; }
    inp.mx = 0; inp.my = 0;
    if (L > 30) {
      const a = Math.atan2(W.y, W.x); // screen: 0 = right, +90 = down
      const i = ((Math.round((a + Math.PI / 2) / (Math.PI / 4)) % 8) + 8) % 8; // 0 = up, clockwise
      const s = SLOTS[i];
      if (this.slots[s] && this._usable(s)) W.sel = s;
    }
    if (inp.wheel) { this._cycle(inp.wheel > 0 ? 1 : -1); W.sel = this.slot; inp.wheel = 0; }
    this._drawWheel();
    if (!held) this._closeWheel(true);
  }
  _openWheel() {
    this.wheelOpen = true;
    this.wheel.x = 0; this.wheel.y = 0; this.wheel.sel = this.slot;
    this.$.wheel.classList.add('on');
    V.postFx = { ...(V.postFx || {}), blur: 0.35, desat: 0.35 };
    this._fillWheel();
    V.audio?.ui?.();
  }
  _closeWheel(pick) {
    this.wheelOpen = false;
    this.$.wheel.classList.remove('on');
    if (V.postFx) V.postFx = { ...V.postFx, blur: 0, desat: 0 };
    if (pick && this.wheel.sel && this.wheel.sel !== this.slot) this.select(this.wheel.sel);
  }
  _fillWheel() {
    const r = V.world?.renderer;
    SLOTS.forEach((s, i) => {
      const el = this.$.segs[i], x = this.slots[s], w = x ? WEAPONS[x.id] : null;
      const key = w ? w.id + '|' + x.mag + '|' + x.reserve + '|' + this._usable(s) : '-';
      if (el.dataset.k === key) return;
      el.dataset.k = key;
      el.classList.toggle('has', !!w && this._usable(s));
      this.$.paths[i].classList.toggle('has', !!w && this._usable(s));
      if (!w) { el.innerHTML = `<span class="e" style="opacity:.25">·</span><b>${SLOT_NAMES[s]}</b>`; return; }
      const url = weaponIcon(w.id, r);
      const ammo = w.melee ? '' : w.thrown ? `×${x.mag + x.reserve}` : `${x.mag} / ${x.reserve}`;
      el.innerHTML = (url ? `<img src="${url}">` : `<span class="e">${w.icon}</span>`) + `<b>${w.name}</b><span>${ammo}</span>`;
    });
  }
  _drawWheel() {
    const W = this.wheel;
    SLOTS.forEach((s, i) => { this.$.paths[i].classList.toggle('sel', W.sel === s); this.$.paths[i].classList.toggle('cur', this.slot === s); });
    const x = this.slots[W.sel], w = x ? WEAPONS[x.id] : null;
    const k = (w?.id || '') + (x ? x.mag + '/' + x.reserve : '');
    if (this.$.wc.dataset.k !== k) {
      this.$.wc.dataset.k = k;
      this.$.wc.innerHTML = w ? `<div class="s">${SLOT_NAMES[w.slot]}</div><div class="n">${w.name}</div><div class="a">${w.melee ? '' : w.thrown ? '×' + (x.mag + x.reserve) : x.mag + ' / ' + x.reserve}</div>` : '';
    }
  }

  // ---- the crosshair, scope and HUD weapon box -----------------------------------------------------------------------------------------
  _ui() {
    const root = V.game?.gui?.root;
    if (!document.getElementById('vc-wpn-css')) { const s = document.createElement('style'); s.id = 'vc-wpn-css'; s.textContent = CSS; document.head.appendChild(s); }
    const el = document.createElement('div');
    el.className = 'vc vc-wpn';
    // the wheel: 8 ring segments, top first, clockwise
    let paths = '';
    const r0 = 92, r1 = 222, gap = 1.6 * DEG;
    for (let i = 0; i < 8; i++) {
      const a0 = (-90 - 22.5 + i * 45) * DEG + gap, a1 = (-90 + 22.5 + i * 45) * DEG - gap;
      const p = (r, a) => `${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`;
      paths += `<path d="M${p(r0, a0)} L${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 0 0 ${p(r0, a0)}Z"/>`;
    }
    let segs = '';
    for (let i = 0; i < 8; i++) { const a = (-90 + i * 45) * DEG, rr = 158; segs += `<div class="vc-ws" style="left:${230 + Math.cos(a) * rr}px;top:${230 + Math.sin(a) * rr}px"></div>`; }
    el.innerHTML = `<div class="vc-scope"></div><div class="vc-xh"><i class="d"></i><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i></div><div class="vc-lock"></div><div class="vc-rel"></div>
      <div class="vc-wheel"><svg viewBox="-230 -230 460 460" width="460" height="460">${paths}</svg>${segs}<div class="vc-wc"></div></div>`;
    (root || document.body).appendChild(el);
    const q = (s) => el.querySelector(s);
    this.$ = { el, xh: q('.vc-xh'), t: q('.vc-xh .t'), b: q('.vc-xh .b'), l: q('.vc-xh .l'), r: q('.vc-xh .r'), lock: q('.vc-lock'), rel: q('.vc-rel'), scope: q('.vc-scope'), wheel: q('.vc-wheel'), paths: [...el.querySelectorAll('.vc-wheel path')], segs: [...el.querySelectorAll('.vc-ws')], wc: q('.vc-wc') };
    this.last = {};
  }
  _set(k, v, fn) { if (this.last[k] !== v) { this.last[k] = v; fn(v); } }
  _hud() {
    const s = this.slots[this.slot], w = this.w, c = this.current;
    c.id = w.id; c.name = w.name; c.icon = w.icon;
    c.mag = w.melee ? null : w.thrown ? s.mag + s.reserve : s.mag;
    c.reserve = w.melee ? null : w.thrown ? 0 : s.reserve;
    if (!this.$) return;
    const live = V.session?.state === 'play' && !V.player?.dead;
    const scoped = live && this.aiming && !!w.zoom && !!this.zoomFov && this.zoomFov < 30;
    const showX = live && ((this.aiming && !w.thrown && !scoped) || (w.melee && !!this.target && !V.player.vehicle));
    this._set('x', (showX ? 1 : 0) + (this.target ? 2 : 0) + (w.melee ? 4 : 0), (v) => { this.$.xh.className = 'vc-xh' + (v & 1 ? ' on' : '') + (v & 2 ? ' tg' : '') + (v & 4 ? ' melee' : ''); });
    // the spread, in pixels
    if (showX && !w.melee) {
      const fov = (V.world.camera.fov || 60) * DEG, H = window.innerHeight || 720;
      const px = Math.round(Math.tan(this._spread(this.driveBy) * DEG) / Math.tan(fov / 2) * H / 2) + 3;
      this._set('gap', Math.min(80, px), (g) => { this.$.t.style.top = (-g - 8) + 'px'; this.$.b.style.top = g + 'px'; this.$.l.style.left = (-g - 8) + 'px'; this.$.r.style.left = g + 'px'; });
    }
    this._set('lock', live && !!this.lock && this.aiming ? 1 : 0, (v) => this.$.lock.classList.toggle('on', !!v));
    this._set('scope', scoped ? 1 : 0, (v) => this.$.scope.classList.toggle('on', !!v));
    const rel = live && this.reload ? Math.round((this.reload.shells ? (s.mag / w.mag) : this.reload.t / this.reload.dur) * 40) : -1;
    this._set('rel', rel, (v) => { this.$.rel.classList.toggle('on', v >= 0); if (v >= 0) this.$.rel.style.background = `conic-gradient(#fff ${v * 9}deg, rgba(255,255,255,.18) 0)`; });
    if (this.wheelOpen) this._fillWheel();
  }

  dispose() { this.$?.el?.remove(); }
}
