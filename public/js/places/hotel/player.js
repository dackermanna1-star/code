// You: first person, mouse-look, walking, running (until you're out of
// breath), crouching, the flashlight in your hand (its batteries run down),
// using things, hiding in wardrobes and lockers and holding your breath.
// Every footstep makes a sound - softer on carpet, sharp on marble - and he
// is listening.
import * as THREE from 'three';
import { H } from './state.js';
import { bake, boxGeo, cylGeo, sphereGeo, M4 } from './kit.js';
import * as T from './textures.js';
import { GROUP } from '../../engine/Part.js';

export const EYE = 6.1;
const CROUCH = 2.5;
const SPEED = { walk: 10.5, run: 17.5, crouch: 5.4 };
const STRIDE = { walk: 4.2, run: 5.6, crouch: 2.9 };
const NOISE = { walk: 8, run: 24, crouch: 2.4 };
const SURF = { carpet: 0.65, wood: 1.05, marble: 1.25, tile: 1.2, concrete: 1.0, metal: 1.35, grass: 0.55, gravel: 1.15 };
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _a = new THREE.Vector3(), _b = new THREE.Vector3();

const SETTINGS = 'rbx2008:hotel:settings';
export function loadSettings() {
  try { return { sens: 1, invert: false, brightness: 1, volume: 0.8, quality: 2, ...JSON.parse(localStorage.getItem(SETTINGS) || '{}') }; } catch { return { sens: 1, invert: false, brightness: 1, volume: 0.8, quality: 2 }; }
}
export function saveSettings(s) { try { localStorage.setItem(SETTINGS, JSON.stringify(s)); } catch { /* private mode */ } }

export class Player {
  constructor(game) {
    this.game = game; this.world = game.world; this.canvas = game.canvas;
    this.settings = loadSettings();
    this.mode = 'intro';
    this.yaw = 0; this.pitch = 0;
    this.crouch = 0; this.stamina = 1; this.tired = false; this.battery = 1; this.flashOn = false; this.hasFlash = false;
    this.breath = 1; this.holding = false; this.adrenaline = false;
    this.eyeY = null; this.bobT = 0; this.bob = 0; this.stepAcc = 0; this.lastXZ = null; this.wasGrounded = true; this.fallFrom = 0;
    this.fear = 0; this.shakeAmt = 0; this.dip = 0; this.fov = 70;
    this.camPos = new THREE.Vector3(); this.camDir = new THREE.Vector3(0, 0, -1);
    this.holdT = 0; this.holdIt = null;
    this.override = null; // {pos, look, fov} for scripted moments
    this.spot = null;
    this.ePressed = false; this.jumpQueued = false;
    this._flashDir = new THREE.Vector3(0, 0, -1);
    this._makeFlashlight();
    this._makeHand();
    this._bind();
    H.player = this;
  }

  get ch() { return this.game.localPlayer?.character; }
  get feet() { const c = this.ch; return c ? _v.set(c.rootPosition.x, c.rootPosition.y - 3, c.rootPosition.z) : _v.set(0, 0, 0); }
  /** where his eyes look for you */
  get chest() { const c = this.ch; if (this.spot) return this.spot.inside.clone().setY(this.spot.inside.y - 2); return c ? new THREE.Vector3(c.rootPosition.x, c.rootPosition.y - 3 + 3.6 - this.crouch * 1.6, c.rootPosition.z) : new THREE.Vector3(); }
  get pos() { const c = this.ch; return c ? c.rootPosition.clone().setY(c.rootPosition.y - 3) : new THREE.Vector3(); }
  get hidden() { return this.mode === 'hide'; }

  // --- the flashlight ---------------------------------------------------------------------------------------------------------
  _makeFlashlight() {
    const s = new THREE.SpotLight(0xffeedd, 0, 95, 0.64, 0.75, 2);
    s.castShadow = true;
    s.shadow.mapSize.set(1024, 1024);
    s.shadow.bias = -0.0004; s.shadow.normalBias = 0.02;
    s.shadow.camera.near = 0.4; s.shadow.camera.far = 50;
    s.map = beamCookie();
    this.world.scene.add(s, s.target);
    this.spotLight = s;
    // a faint glow round you from the beam bouncing off whatever it hits
    this.bounce = new THREE.PointLight(0xffe0c0, 0, 14, 2);
    this.world.scene.add(this.bounce);
  }
  _makeHand() {
    const vm = H.post.vmCam, M = H.M;
    const metal = new THREE.MeshStandardMaterial({ color: 0x9a9890, metalness: 0.9, roughness: 0.3, envMap: M.chrome.envMap, envMapIntensity: 0.7 });
    const black = new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0.3, roughness: 0.65 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x241c17, roughness: 0.6 });
    const coat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.9 });
    const R = (x) => new THREE.Euler(x, 0, 0);
    const g = new THREE.Group();
    // the flashlight, pointing along -z
    const torch = new THREE.Mesh(bake([
      [cylGeo(0.062, 0.062, 0.46, 14), M4(0, 0, -0.14, Math.PI / 2, 0, 0)],
      [cylGeo(0.104, 0.068, 0.15, 16), M4(0, 0, -0.44, Math.PI / 2, 0, 0)],
      [cylGeo(0.108, 0.108, 0.035, 16), M4(0, 0, -0.52, Math.PI / 2, 0, 0)],
      [cylGeo(0.064, 0.064, 0.05, 12), M4(0, 0, 0.11, Math.PI / 2, 0, 0)],
    ]), metal);
    const grip = new THREE.Mesh(bake([[cylGeo(0.068, 0.068, 0.2, 14), M4(0, 0, -0.06, Math.PI / 2, 0, 0)], [boxGeo(0.03, 0.025, 0.06), M4(0, 0.07, -0.2)]]), black);
    this.lensMat = new THREE.MeshBasicMaterial({ color: 0x3a3630 });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.096, 18), this.lensMat); lens.position.z = -0.54; lens.rotation.y = Math.PI;
    // a gloved hand round the grip: the palm, four knuckles and fingers wrapped underneath, the thumb on top
    const parts = [[cylGeo(0.098, 0.105, 0.26, 12), M4(0.012, -0.012, -0.05, Math.PI / 2, 0, 0, [1.12, 1, 1])]];
    for (let i = 0; i < 4; i++) {
      const z = -0.15 + i * 0.07;
      parts.push([sphereGeo(0.036, 8), M4(-0.085, 0.045, z)]);
      parts.push([cylGeo(0.03, 0.028, 0.13, 8), M4(-0.06, -0.075, z, 0, 0, 1.2)]);
    }
    parts.push([cylGeo(0.034, 0.03, 0.17, 8), M4(0.05, 0.075, -0.13, Math.PI / 2 - 0.15, 0, -0.25)]);
    parts.push([cylGeo(0.088, 0.1, 0.18, 12), M4(0.02, -0.02, 0.15, Math.PI / 2 + 0.2, 0, 0)]);
    const hand = new THREE.Mesh(bake(parts), glove);
    const sleeve = new THREE.Mesh(bake([[cylGeo(0.12, 0.15, 0.9, 12), M4(0.06, -0.12, 0.62, Math.PI / 2 + 0.3, 0, 0)]]), coat);
    g.add(torch, grip, lens, hand, sleeve);
    g.scale.setScalar(0.92);
    vm.add(g);
    this.hand = g;
    this.handGlow = new THREE.PointLight(0xffe0c0, 0, 2.5, 2); this.handGlow.position.set(0.25, -0.05, -1.0); vm.add(this.handGlow);
    this.handAmb = new THREE.HemisphereLight(0x8a90a0, 0x201810, 0.05); H.post.vmScene.add(this.handAmb);
    this.handKey = new THREE.PointLight(0xffc890, 0, 6, 2); this.handKey.position.set(-0.6, 0.6, -0.4); vm.add(this.handKey);
    this.handPose = { x: 0, y: -0.6, swayX: 0, swayY: 0, show: 0 };
    void R;
  }
  setFlash(on, silent = false) {
    if (!this.hasFlash) return;
    if (on && this.battery <= 0.002) { H.ui?.toast('The flashlight is dead.' + (H.inv.has('battery') ? ' Press R to change the batteries.' : '')); on = false; }
    if (on === this.flashOn) return;
    this.flashOn = on;
    if (!silent) { H.audio?.click(); H.noise?.(this.pos, 2.5, 'click'); }
  }
  changeBatteries() {
    if (!H.inv.has('battery') || this.battery > 0.97) return;
    H.inv.remove('battery');
    this.battery = 1;
    H.audio?.batteries();
    H.ui?.toast('Fresh batteries.');
  }

  // --- input ------------------------------------------------------------------------------------------------------------------------------
  _bind() {
    const cv = this.canvas;
    this.onMouse = (e) => {
      if (document.pointerLockElement !== cv) return;
      const k = 0.0021 * this.settings.sens * (this.game.world.camera.fov / 70);
      this.yaw -= e.movementX * k;
      this.pitch -= e.movementY * k * (this.settings.invert ? -1 : 1);
      this.pitch = Math.max(-1.42, Math.min(1.42, this.pitch));
      this.handPose.swayX += e.movementX * 0.00025; this.handPose.swayY += e.movementY * 0.00025;
    };
    window.addEventListener('mousemove', this.onMouse);
    cv.addEventListener('mousedown', () => { if (this.wantLock()) this.lock(); });
    document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== cv && this.wantLock() && !H.ui?.overlayOpen()) H.ui?.pause(true); });
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'tab') { e.preventDefault(); H.ui?.showStatus(true); return; }
      if (e.repeat) return;
      if (H.ui?.onKey(k, e)) return;
      if (H.paused) return;
      if (k === 'e') this.ePressed = true;
      if (k === 'f' && this.mode === 'play') this.setFlash(!this.flashOn);
      if (k === 'r' && this.mode === 'play') this.changeBatteries();
      if (k === ' ') { e.preventDefault(); if (this.mode === 'play') this.jumpQueued = true; }
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'tab') H.ui?.showStatus(false);
      if (k === 'e') { this.holdT = 0; this.holdIt = null; }
    });
  }
  wantLock() { return this.mode !== 'intro' && this.mode !== 'end' && !H.paused && !H.ui?.overlayOpen(); }
  lock() { try { const p = this.canvas.requestPointerLock?.(); p?.catch?.(() => {}); } catch { /* not allowed yet */ } }

  /** Replaces the engine's input handling every frame. */
  updateInput(dt) {
    const ch = this.ch;
    if (!ch?.alive) return;
    const k = this.game.keys;
    ch.input.jump = false;
    if (this.mode !== 'play') { ch.input.move.set(0, 0, 0); ch.walkSpeed = 0; return; }
    let f = 0, r = 0;
    if (k.has('w') || k.has('arrowup')) f += 1;
    if (k.has('s') || k.has('arrowdown')) f -= 1;
    if (k.has('d') || k.has('arrowright')) r += 1;
    if (k.has('a') || k.has('arrowleft')) r -= 1;
    const fw = _v.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const mv = ch.input.move.set(0, 0, 0).addScaledVector(fw, f).add(new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(r));
    if (mv.lengthSq() > 1) mv.normalize();
    const moving = mv.lengthSq() > 0.01;
    const wantCrouch = k.has('c') || k.has('control');
    this.crouch += ((wantCrouch ? 1 : 0) - this.crouch) * Math.min(1, dt * 9);
    const wantRun = (k.has('shift')) && f > 0 && moving && this.crouch < 0.3;
    this.running = wantRun && (!this.tired || this.adrenaline);
    if (this.running && !this.adrenaline) { this.stamina -= dt / 6.5; if (this.stamina <= 0) { this.stamina = 0; this.tired = true; H.audio?.exhausted(); } }
    else this.stamina = Math.min(1, this.stamina + dt / (moving ? 11 : 6));
    if (this.tired && this.stamina > 0.35) this.tired = false;
    this.gait = this.running ? 'run' : this.crouch > 0.5 ? 'crouch' : 'walk';
    ch.walkSpeed = (SPEED[this.gait] * (this.tired && !this.running ? 0.9 : 1)) * (f < 0 && !this.running ? 0.8 : 1);
    if (this.jumpQueued) { ch.jumpPower = 30; ch.input.jump = this.crouch < 0.3; }
    this.jumpQueued = false;
  }

  // --- each frame -------------------------------------------------------------------------------------------------------------------------
  update(dt) {
    const ch = this.ch;
    if (!ch) return;
    ch.root.visible = false;
    this._steps(dt, ch);
    this._interact(dt);
    this._flashlight(dt);
    this._breath(dt);
    this._camera(dt, ch);
    this._hand(dt);
  }
  _steps(dt, ch) {
    const p = ch.rootPosition;
    if (!this.lastXZ) this.lastXZ = new THREE.Vector2(p.x, p.z);
    const d = Math.hypot(p.x - this.lastXZ.x, p.z - this.lastXZ.y);
    this.lastXZ.set(p.x, p.z);
    const grounded = ch.grounded || ch.state === 'Running' || ch.state === 'Standing';
    if (this.mode === 'play' && grounded && d > 0.001 && d < 3) {
      this.stepAcc += d;
      this.bobT += d / STRIDE[this.gait || 'walk'] * Math.PI;
      const stride = STRIDE[this.gait || 'walk'];
      if (this.stepAcc > stride) {
        this.stepAcc -= stride;
        const surf = ch.groundPart?.userData?.surface || 'wood';
        const vol = this.gait === 'run' ? 1 : this.gait === 'crouch' ? 0.28 : 0.55;
        H.audio?.step(surf, vol, this.gait);
        H.noise?.(this.pos, NOISE[this.gait] * (SURF[surf] ?? 1), 'step');
      }
    }
    const speed = d / Math.max(dt, 1e-3);
    this.bob += ((this.mode === 'play' && grounded ? Math.min(1, speed / 11) : 0) - this.bob) * Math.min(1, dt * 8);
    // landing
    if (!grounded && this.wasGrounded) this.fallFrom = p.y;
    if (grounded && !this.wasGrounded && this.fallFrom - p.y > 1.2) {
      this.dip = Math.min(1.2, (this.fallFrom - p.y) * 0.18);
      H.audio?.land(ch.groundPart?.userData?.surface || 'wood');
      H.noise?.(this.pos, 12, 'land');
    }
    this.wasGrounded = grounded;
  }
  _interact(dt) {
    let it = null;
    if (this.mode === 'play') it = H.interact.pick(this.camPos, this.camDir);
    if (it !== this.holdIt) { this.holdT = 0; this.holdIt = null; }
    let prog = 0;
    if (it && this.ePressed) {
      if (it.hold) { this.holdIt = it; }
      else it.act();
    }
    if (it && this.holdIt === it && this.game.keys.has('e')) {
      this.holdT += dt;
      prog = Math.min(1, this.holdT / it.hold);
      it.onHold?.(prog, dt);
      if (this.holdT >= it.hold) { this.holdT = 0; this.holdIt = null; it.act(); prog = 0; }
    }
    if (this.mode === 'hide' && this.ePressed && !this.spot?.locked) this.unhide();
    this.ePressed = false;
    H.ui?.prompt(this.mode === 'play' ? it : null, prog, this.mode === 'hide' ? this.spot : null);
  }
  _flashlight(dt) {
    const s = this.spotLight;
    if (this.flashOn) this.battery = Math.max(0, this.battery - dt / 600);
    if (this.flashOn && this.battery <= 0) { this.flashOn = false; H.audio?.click(); H.ui?.toast('The flashlight dies.' + (H.inv.has('battery') ? ' Press R to change the batteries.' : '')); }
    // it flickers when he's close, and when the batteries are low
    let k = this.flashOn ? 1 : 0;
    const md = H.monster?.active ? H.monster.pos.distanceTo(this.pos) : 99;
    const near = Math.max(0, Math.min(1, (16 - md) / 10));
    this._fl = (this._fl || 0) - dt;
    if (this._fl <= 0) { this._flk = 1; const lowB = this.battery < 0.15 ? (0.15 - this.battery) * 4 : 0; const p = near * 0.8 + lowB; if (Math.random() < p) { this._flk = Math.random() < 0.5 ? 0.05 : 0.4 + Math.random() * 0.4; this._fl = 0.03 + Math.random() * 0.12; } else this._fl = 0.05 + Math.random() * 0.25; }
    k *= this._flk * (0.55 + Math.min(1, this.battery * 4) * 0.45);
    // your eyes adjust: right up against something the beam doesn't burn it white
    const cam0 = this.world.camera;
    if (this._flashDir) {
      _a.copy(cam0.position).addScaledVector(this._flashDir, 14);
      const hit = this.world.raycast(cam0.position, _a, { mask: GROUP.WORLD });
      let d = hit ? hit.distance : 14;
      const M = H.monster;
      if (M?.visibleBody) for (const y of [0, 4.5]) { _b.copy(M.head).y -= y; const md = _b.distanceTo(cam0.position); if (md < d && _b.sub(cam0.position).normalize().dot(this._flashDir) > 0.88) d = md; }
      this._adWant = Math.max(0.03, Math.min(1, Math.pow(d / 10, 1.6)));
      this._adD = d;
    }
    // (it clamps down at once when something's suddenly close - and opens up again more slowly)
    const adW = this._adWant ?? 1, ad0 = this._ad ?? 1;
    this._ad = ad0 + (adW - ad0) * Math.min(1, dt * (adW < ad0 ? 30 : 5));
    s.intensity = 760 * k * this._ad;
    this.bounce.intensity = 0;
    this.lensMat.color.setRGB(0.25 + 3 * k, 0.24 + 2.8 * k, 0.2 + 2.4 * k);
    this.handGlow.intensity = 0.6 * k;
    // the beam lags a little behind your view
    const cam = this.world.camera;
    _v.set(0, 0, -1).applyQuaternion(cam.quaternion);
    this._flashDir.lerp(_v, Math.min(1, dt * 16)).normalize();
    const off = new THREE.Vector3(0.55, -0.55, -0.2).applyQuaternion(cam.quaternion);
    s.position.copy(cam.position).add(off);
    // (aimed at what you're looking at, so up close the beam still lands on it, not beside it)
    s.target.position.copy(cam.position).addScaledVector(this._flashDir, Math.max(1.2, Math.min(12, this._adD ?? 12)));
    s.target.updateMatrixWorld();
    s.visible = k > 0.01;
    // the light where you're standing (for how well he can see you)
    this.lit = (H.lights?.lightAt ? H.lights.lightAt(this.chest) : 0.2);
  }
  _breath(dt) {
    const hold = this.mode === 'hide' && this.game.keys.has(' ');
    if (hold && this.breath > 0) {
      if (!this.holding) { this.holding = true; H.audio?.breathIn(); }
      this.breath = Math.max(0, this.breath - dt / 7);
      if (this.breath <= 0) { this.holding = false; this.gasped = true; H.audio?.gasp(); H.noise?.(this.spot?.inside || this.pos, 16, 'gasp'); this.breathLock = 1.6; }
    } else {
      if (this.holding) { this.holding = false; H.audio?.breathOut(this.breath < 0.3); if (this.mode === 'hide') H.noise?.(this.spot?.inside || this.pos, this.breath < 0.3 ? 7 : 3, 'breath'); }
      this.breath = Math.min(1, this.breath + dt / (this.breathLock > 0 ? 3.5 : 2));
    }
    this.breathLock = Math.max(0, (this.breathLock || 0) - dt);
  }
  _camera(dt, ch) {
    const cam = this.world.camera;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.8);
    this.dip = Math.max(0, this.dip - dt * 3.5);
    let fovT = 70 + (this.running ? 4 : 0) + this.fear * 3 * Math.sin(this.world.time * 2.2);
    if (this.override) {
      const o = this.override;
      cam.position.copy(o.pos);
      if (o.look) cam.lookAt(o.look); else if (o.quat) cam.quaternion.copy(o.quat);
      if (o.fov) fovT = o.fov;
    } else if (this.mode === 'hide' && this.spot) {
      const sp = this.spot;
      this.hideT = Math.min(1, (this.hideT || 0) + dt * 2.2);
      const t = this.hideT * this.hideT * (3 - 2 * this.hideT);
      if (this.hideFrom) cam.position.lerpVectors(this.hideFrom, sp.inside, t); else cam.position.copy(sp.inside);
      // you can only turn your head so far in there
      let dy = this.yaw - sp.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      dy = Math.max(-0.75, Math.min(0.75, dy)); this.yaw = sp.yaw + dy;
      this.pitch = Math.max(-0.55, Math.min(0.45, this.pitch));
      const br = this.holding ? 0 : Math.sin(this.world.time * 1.8) * 0.02;
      cam.position.y += br;
      _e.set(this.pitch, this.yaw, 0); cam.quaternion.setFromEuler(_e);
    } else {
      const feet = ch.rootPosition.y - 3;
      const targetY = feet + EYE - this.crouch * CROUCH;
      if (this.eyeY == null || Math.abs(this.eyeY - targetY) > 4) this.eyeY = targetY;
      this.eyeY += (targetY - this.eyeY) * Math.min(1, dt * 16);
      const amp = this.bob * (this.gait === 'run' ? 1.5 : this.gait === 'crouch' ? 0.6 : 1);
      const by = Math.abs(Math.sin(this.bobT)) * 0.2 * amp - 0.1 * amp, bx = Math.cos(this.bobT) * 0.09 * amp;
      cam.position.set(ch.rootPosition.x, this.eyeY + by - this.dip, ch.rootPosition.z);
      cam.position.x += Math.cos(this.yaw) * bx; cam.position.z -= Math.sin(this.yaw) * bx;
      const roll = Math.cos(this.bobT) * 0.006 * amp + Math.sin(this.world.time * 0.9) * 0.01 * this.fear;
      _e.set(this.pitch + by * 0.02, this.yaw, roll); cam.quaternion.setFromEuler(_e);
    }
    if (this.shakeAmt > 0) {
      const s = this.shakeAmt * this.shakeAmt;
      cam.position.x += (Math.random() - 0.5) * s * 0.5; cam.position.y += (Math.random() - 0.5) * s * 0.5; cam.position.z += (Math.random() - 0.5) * s * 0.5;
      cam.rotateZ((Math.random() - 0.5) * s * 0.08); cam.rotateX((Math.random() - 0.5) * s * 0.05);
    }
    if (Math.abs(cam.fov - fovT) > 0.01) { cam.fov += (fovT - cam.fov) * Math.min(1, dt * 5); cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    this.camPos.copy(cam.position);
    this.camDir.set(0, 0, -1).applyQuaternion(cam.quaternion);
  }
  _hand(dt) {
    const hp = this.handPose, show = this.hasFlash && this.mode === 'play' && !this.override ? 1 : 0;
    hp.show += (show - hp.show) * Math.min(1, dt * 6);
    hp.swayX *= Math.pow(0.0005, dt); hp.swayY *= Math.pow(0.0005, dt);
    const amp = this.bob * (this.gait === 'run' ? 1.6 : 1);
    const bx = Math.cos(this.bobT) * 0.018 * amp, by = Math.abs(Math.sin(this.bobT)) * 0.022 * amp;
    this.hand.position.set(0.3 - hp.swayX * 0.6 + bx, -0.29 - by + hp.swayY * 0.6 - (1 - hp.show) * 0.6 - this.crouch * 0.02, -0.5);
    this.hand.rotation.set(0.05 + hp.swayY * 0.5 + (this.running ? -0.3 : 0) * 0.5, 0.1 + hp.swayX * 0.5, (this.running ? 0.25 : 0) + bx * 0.5 - 0.08);
    this.hand.visible = hp.show > 0.02;
    // light the hand with the light round you
    this.handAmb.intensity = 0.04 + Math.min(1.5, this.lit || 0) * 0.5;
    this.handKey.intensity = Math.min(2, (this.lit || 0)) * 0.8;
  }

  // --- hiding ------------------------------------------------------------------------------------------------------------------------
  hide(spot) {
    if (this.mode !== 'play' || spot.occupied) return;
    const ch = this.ch;
    this.mode = 'hide'; this.spot = spot; spot.occupied = true;
    this.hideFrom = this.world.camera.position.clone(); this.hideT = 0;
    this.yaw = spot.yaw; this.pitch = Math.max(-0.3, Math.min(0.2, this.pitch));
    this.flashWas = this.flashOn; this.setFlash(false, true);
    spot.setOpen(1, 5);
    H.audio?.wardrobe(spot.front, true, spot.kind);
    H.noise?.(spot.front, 7, 'hide');
    this.world.delay(0.42, () => { if (this.spot === spot) { spot.setOpen(0, 2.6); H.audio?.wardrobe(spot.front, false, spot.kind); } });
    ch?.freeze(true);
    this.breath = Math.max(this.breath, 0.6);
    H.story?.event('hide', spot);
    H.ui?.hint('hide');
  }
  unhide(force = false) {
    const spot = this.spot;
    if (!spot || (this.mode !== 'hide' && !force)) return;
    spot.setOpen(1, 4);
    H.audio?.wardrobe(spot.front, true, spot.kind);
    H.noise?.(spot.front, 6, 'unhide');
    const ch = this.ch;
    const out = spot.out;
    if (ch) {
      ch.freeze(false);
      ch.body.position.set(out.x, out.y + 3.05, out.z); ch.body.velocity.set(0, 0, 0);
      ch.root.position.set(out.x, out.y + 3.05, out.z);
    }
    this.eyeY = null;
    this.mode = 'play'; this.spot = null; spot.occupied = false;
    this.holding = false;
    this.world.delay(0.6, () => { if (!spot.occupied) { spot.setOpen(0, 2.2); H.audio?.wardrobe(spot.front, false, spot.kind); } });
    if (this.flashWas) this.setFlash(true, true);
    H.story?.event('unhide', spot);
  }

  /** Put you somewhere (a checkpoint). */
  teleport(p, yaw) {
    const ch = this.ch;
    if (!ch) return;
    if (this.spot) { this.spot.occupied = false; this.spot.setOpen(0, 4); this.spot = null; }
    ch.freeze(false);
    ch.body.position.set(p.x, p.y + 3.05, p.z); ch.body.velocity.set(0, 0, 0); ch.root.position.set(p.x, p.y + 3.05, p.z);
    this.yaw = yaw ?? this.yaw; this.pitch = 0; this.eyeY = null; this.lastXZ = null;
    this.mode = 'play'; this.crouch = 0; this.stamina = 1; this.tired = false; this.breath = 1; this.holding = false; this.override = null;
  }
  shake(amount) { this.shakeAmt = Math.max(this.shakeAmt, amount); }
}

/** The flashlight's beam: a hot centre, a ring, a soft fall-off, a few smudges on the lens. */
function beamCookie() {
  return T.canvasTex('beam2', 256, 256, (x, w, h) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.2, '#fbf8f2'); g.addColorStop(0.27, '#ffffff'); g.addColorStop(0.32, '#cfcac0');
    g.addColorStop(0.45, '#8c887e'); g.addColorStop(0.7, '#4a4842'); g.addColorStop(0.9, '#121110'); g.addColorStop(1, '#000000');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const r = T.rng(17);
    for (let i = 0; i < 10; i++) { x.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.03})`; x.beginPath(); x.arc(w / 2 + (r() - 0.5) * 140, h / 2 + (r() - 0.5) * 140, 8 + r() * 22, 0, 7); x.fill(); }
  }, { clamp: true });
}
