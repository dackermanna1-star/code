// Human player controller: input -> intent, cameras, and the first-person viewmodel.
import * as THREE from 'three';
import { SURVIVOR, WEAPONS, MELEE } from './config.js';
import { buildWeaponModel, buildItemModel } from './itemmodels.js';
import { MeshKit } from '../engine/meshkit.js';
import { createPS1Material, clonePS1 } from '../engine/ps1material.js';
import { charAtlas } from './rig.js';
import { currentSpread } from './weapons.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

export class PlayerController {
  constructor(game, survivor) {
    this.game = game; this.s = survivor;
    survivor.isPlayer = true; survivor.isBot = false; survivor.controller = this;
    this.yaw = survivor.yaw; this.pitch = 0;
    this.camYaw = this.yaw; this.camPitch = -0.2;
    this.spectate = 0;
    this.shake = 0;
    this.zoom = false;
    this.bobT = 0; this.sway = new THREE.Vector2(); this.lastYaw = this.yaw; this.lastPitch = 0;
    // viewmodel
    this.viewScene = new THREE.Scene();
    this.viewCam = new THREE.PerspectiveCamera(54, 1, 0.01, 10);
    this.viewGroup = new THREE.Group();
    this.viewScene.add(this.viewGroup);
    this.vmKey = null; this.vm = null;
    this.vmMats = [];
    this.arms = this.buildArms(survivor.def);
    {
      const fx = survivor.world ? survivor.world.effects : game.world.effects;
      const geo = new THREE.PlaneGeometry(1, 1);
      const at = fx.bbAtlas.muzzle;
      const uv = geo.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, at[0] + uv.getX(i) * at[2], at[1] + uv.getY(i) * at[3]);
      const mat = new THREE.MeshBasicMaterial({ map: fx.bbAtlas.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, color: 0xffd8a0 });
      this.flash = new THREE.Mesh(geo, mat); this.flash.visible = false; this.flash.renderOrder = 50;
      this.viewGroup.add(this.flash);
      this.flashLight = 0;
    }
    this.recoilKick = 0; this.recoilRot = 0;
    this.deployAnim = 0;
    this.useFocus = null;
    this.landDip = 0;
    this.wasGrounded = true;
    game.world.events.on('shake', (pos, amt) => {
      const d = pos.distanceTo(this.s.body.pos);
      this.shake = Math.max(this.shake, amt * Math.max(0, 1 - d / 25));
    });
    game.world.events.on('fired', (s, ws) => { if (s === this.s) { this.recoilKick = 1; this.muzzleFlashT = ws.def.quiet ? 0.02 : 0.05; this.flashSize = ws.def.kind === 'shotgun' ? 0.22 : ws.def.kind === 'pistol' ? 0.12 : 0.16; } });
    game.world.events.on('deploy', (s) => { if (s === this.s) this.deployAnim = 1; });
  }

  // ------------------------------------------------------------------ input
  think(dt, it) {
    const input = this.game.input;
    const s = this.s;
    const sens = 0.0022 * this.game.settings.get('sensitivity') * (this.zoom ? 0.35 : 1);
    const inv = this.game.settings.get('invertY') ? -1 : 1;
    const locked = input.locked || this.game.testMode;
    const mdx = locked ? input.mouseDX : 0, mdy = locked ? input.mouseDY : 0;
    if (s.state === 'dead' || s.pinnedBy || s.state === 'ledge') {
      this.camYaw -= mdx * sens; this.camPitch = Math.max(-1.2, Math.min(0.6, this.camPitch - mdy * sens * inv));
    } else {
      this.yaw -= mdx * sens; this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch - mdy * sens * inv));
      this.camYaw = this.yaw; this.camPitch = -0.25;
    }
    // incapped aim drift
    if (s.state === 'incap') { this.yaw += Math.sin(s.t * 0.8) * 0.0015; this.pitch += Math.cos(s.t * 0.6) * 0.0012; }
    it.yaw = this.yaw; it.pitch = this.pitch;
    const vmove = this.virtualMove;
    it.moveY = (input.down('forward') ? 1 : 0) - (input.down('back') ? 1 : 0) + (vmove ? vmove.y : 0);
    it.moveX = (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0) + (vmove ? vmove.x : 0);
    it.walk = input.down('walk'); it.crouch = input.down('crouch'); it.jump = input.hit('jump');
    const prevAttack = it.attack;
    it.attack = input.mouse(0) || input.virtual.has('attack');
    it.attackPressed = input.mouseHit(0) || (it.attack && !prevAttack && input.virtual.has('attack'));
    it.attackReleased = input.mouseUp(0);
    it.attack2 = input.mouse(2) || input.virtual.has('attack2');
    it.attack2Pressed = input.mouseHit(2) || input.virtual.has('attack2Once');
    input.virtual.delete('attack2Once');
    it.use = input.down('use'); it.usePressed = input.hit('use') || input.virtual.has('useOnce'); input.virtual.delete('useOnce');
    it.reload = input.hit('reload');
    it.slot = input.hit('slot1') ? 0 : input.hit('slot2') ? 1 : input.hit('slot3') ? 2 : input.hit('slot4') ? 3 : input.hit('slot5') ? 4 : -1;
    it.lastWeapon = input.hit('lastWeapon');
    it.cycle = input.wheel ? Math.sign(input.wheel) : 0;
    it.flashlight = input.hit('flashlight');
    it.drop = input.hit('drop');
    if (input.mouseHit(1)) this.toggleZoom();
    if (s.state === 'dead' && it.attackPressed) this.spectate++;
    // use focus for hints/glows
    this.useFocus = s.state === 'alive' && !s.pinnedBy ? this.game.world.findUseTarget(s) : null;
    s.useFocus = this.useFocus ? this.useFocus.target : null;
  }
  toggleZoom() {
    const w = this.s.activeWeapon;
    if (w && w.def.scope) this.zoom = !this.zoom; else this.zoom = false;
  }

  // ------------------------------------------------------------------ camera
  updateCamera(cam, dt) {
    const s = this.s, w = this.game.world;
    if (this.game.autopilot) { this.yaw = s.yaw; this.pitch = s.pitch; this.camYaw = s.yaw; }
    this.shake = Math.max(0, this.shake - dt * 1.5);
    const fovBase = this.game.settings.get('fov');
    let fov = fovBase;
    const ws = s.activeWeapon;
    if (this.zoom && (!ws || !ws.def.scope || s.state !== 'alive')) this.zoom = false;
    if (this.zoom) fov = fovBase / ws.def.scope;
    if (s.adrenaline > 0) fov *= 0.94;
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 12);
    cam.updateProjectionMatrix();
    if (s.state === 'dead') {
      const alive = w.survivors.filter((o) => o.state !== 'dead');
      const tgt = alive.length ? alive[this.spectate % alive.length] : s;
      this.orbit(cam, tgt.body.pos, 3.2);
      w.cameraMode = 'spectate'; this.specTarget = tgt;
      return;
    }
    if (s.pinnedBy || s.state === 'ledge') {
      this.orbit(cam, s.body.pos, s.state === 'ledge' ? 3.5 : 3.0);
      w.cameraMode = 'tp';
      return;
    }
    w.cameraMode = 'fp';
    // first person
    const b = s.body;
    // landing dip
    if (b.grounded && !this.wasGrounded) this.landDip = Math.min(0.12, (s.peakFallSpeedLast || 4) * 0.012);
    this.wasGrounded = b.grounded;
    this.landDip = Math.max(0, this.landDip - dt * 0.5);
    const speed = Math.hypot(b.vel.x, b.vel.z);
    if (b.grounded && speed > 0.5) this.bobT += dt * speed * 1.65;
    const bobOn = this.game.settings.get('viewBob');
    const bob = bobOn ? Math.min(1, speed / 5.5) : 0;
    let eyeY = s.state === 'incap' ? SURVIVOR.incapEye : s.eyeH;
    cam.position.set(b.pos.x, b.pos.y + eyeY - this.landDip * 0.5 + (bob ? -Math.abs(Math.sin(this.bobT)) * 0.025 * bob : 0), b.pos.z);
    const roll = s.state === 'incap' ? 0.35 : (bob ? Math.sin(this.bobT) * 0.004 * bob : 0);
    const sh = this.shake;
    const pitch = this.pitch + s.viewPunch.y + (sh ? (Math.random() - 0.5) * sh * 0.05 : 0);
    const yaw = this.yaw + s.viewPunch.x + (sh ? (Math.random() - 0.5) * sh * 0.05 : 0);
    cam.rotation.set(pitch, yaw, roll, 'YXZ');
    cam.updateMatrixWorld();
  }
  orbit(cam, target, dist) {
    const w = this.game.world;
    const c = _v.set(target.x, target.y + 1.3, target.z);
    const dir = _v2.set(Math.sin(this.camYaw) * Math.cos(this.camPitch), -Math.sin(this.camPitch), Math.cos(this.camYaw) * Math.cos(this.camPitch));
    const hit = w.collision.raycast(c, dir, dist, { move: true, dynamic: false });
    const d = hit ? Math.max(0.3, hit.distance - 0.25) : dist;
    cam.position.copy(c).addScaledVector(dir, d);
    cam.lookAt(c);
    cam.updateMatrixWorld();
  }

  muzzleWorld(out = new THREE.Vector3()) {
    if (this.vm && this.vm.userData.muzzle && this.game.world.cameraMode === 'fp') {
      this.viewGroup.updateMatrixWorld(true);
      return out.copy(this.vm.userData.muzzle).applyMatrix4(this.vm.matrixWorld);
    }
    const s = this.s;
    return s.eyePos(out).addScaledVector(s.aimDir(_v2), 0.6);
  }

  // ------------------------------------------------------------------ viewmodel
  buildArms(def) {
    const A = charAtlas();
    const sleeve = def.spec.jacket || def.spec.shirt || 0x777777;
    const skin = def.spec.gloves || def.spec.skin || 0xc89a78;
    const mk = (left) => {
      const k = new MeshKit(); k.defaultUV = A.cloth;
      // forearm along +z from the wrist (origin) to the elbow
      k.box([0, 0, 0.2], [0.085, 0.085, 0.36], def.spec.sleeves === 'short' || def.spec.sleeves === 'none' ? skin : sleeve, { taper: [1.1, 1.1] });
      if (def.spec.sleeves === 'short') k.box([0, 0, 0.42], [0.1, 0.1, 0.12], sleeve);
      // hand + thumb
      k.box([0, 0, -0.04], [0.075, 0.065, 0.1], skin);
      k.box([left ? 0.04 : -0.04, 0.02, -0.04], [0.025, 0.03, 0.06], skin);
      const mesh = new THREE.Mesh(k.toGeometry(), createPS1Material({ map: A.texture, tint: true }));
      return mesh;
    };
    const r = mk(false), l = mk(true);
    this.viewGroup.add(r); this.viewGroup.add(l);
    this.vmMats.push(r.material, l.material);
    return { r, l };
  }

  setViewmodel(key) {
    if (key === this.vmKey) return;
    if (this.vm) { this.viewGroup.remove(this.vm); this.vm = null; }
    this.vmKey = key;
    this.vmMats = [this.arms.r.material, this.arms.l.material];
    if (!key) return;
    const [kind, id] = key.split(':');
    let m;
    try { m = kind === 'weapon' ? buildWeaponModel(id, { viewmodel: true }) : buildItemModel(id, { viewmodel: true }); } catch (e) { m = new THREE.Group(); }
    m.traverse((o) => { if (o.isMesh && o.material && o.material.isShaderMaterial) { o.material = clonePS1(o.material); this.vmMats.push(o.material); } });
    this.vm = m;
    this.vmKind = kind === 'weapon' ? (m.userData.kind || 'rifle') : 'item';
    // hand-held items (kits, pills, throwables) are modelled at world size; shrink them in hand
    if (kind === 'item' && !this.s.inv.carry && /medkit|defib|upgrade/.test(id)) m.scale.setScalar(0.6);
    this.vmId = id;
    this.viewGroup.add(m);
    if (m.userData.mag) this.magHome = m.userData.mag.position.clone();
    if (m.userData.pump) this.pumpHome = m.userData.pump.position.clone();
  }

  updateViewmodel(dt, cam) {
    const s = this.s, w = this.game.world;
    const show = w.cameraMode === 'fp' && !this.zoom && s.state !== 'dead';
    this.viewGroup.visible = show;
    this.viewCam.position.copy(cam.position); this.viewCam.quaternion.copy(cam.quaternion);
    this.viewCam.aspect = cam.aspect; this.viewCam.updateProjectionMatrix(); this.viewCam.updateMatrixWorld();
    if (!show) return;
    // which model
    let key = null;
    const ws = s.state === 'incap' ? (s.inv.secondary.isMelee ? null : s.inv.secondary) : s.activeWeapon;
    if (s.inv.carry) key = 'item:' + s.inv.carry.type;
    else if (ws) key = 'weapon:' + (ws.id === 'dual_pistols' ? 'pistol' : ws.id);
    else if (s.activeItem) key = 'item:' + s.activeItem;
    if (s.state === 'incap' && !key) key = 'weapon:pistol';
    this.setViewmodel(key);
    // follow the camera
    this.viewGroup.position.copy(cam.position);
    this.viewGroup.quaternion.copy(cam.quaternion);
    // lighting
    const probe = w.probeAt(s.body.pos);
    for (const m of this.vmMats) if (m.uniforms && m.uniforms.uAmbient) m.uniforms.uAmbient.value.copy(probe).multiplyScalar(1.1);
    // sway from look movement
    const dyaw = Math.atan2(Math.sin(this.yaw - this.lastYaw), Math.cos(this.yaw - this.lastYaw)), dp = this.pitch - this.lastPitch;
    this.lastYaw = this.yaw; this.lastPitch = this.pitch;
    this.sway.x += (Math.max(-0.08, Math.min(0.08, dyaw * 1.5)) - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (Math.max(-0.08, Math.min(0.08, dp * 1.5)) - this.sway.y) * Math.min(1, dt * 10);
    this.recoilKick = Math.max(0, this.recoilKick - dt * 10);
    this.deployAnim = Math.max(0, this.deployAnim - dt * 2.4);
    const b = s.body;
    const speed = Math.hypot(b.vel.x, b.vel.z);
    const bobA = Math.min(1, speed / 5.5) * (b.grounded ? 1 : 0.2);
    const bx = Math.sin(this.bobT) * 0.012 * bobA, by = -Math.abs(Math.cos(this.bobT)) * 0.012 * bobA;
    const vm = this.vm;
    const kind = this.vmKind;
    const isLong = kind && ['rifle', 'smg', 'shotgun', 'sniper', 'launcher', 'mg'].includes(kind);
    // base pose per weapon type (camera space: x right, y up, -z forward)
    const base = _v.set(0, 0, 0); const rot = _e.set(0, 0, 0);
    if (s.inv.carry) { base.set(0.02, -0.32, -0.45); rot.set(0.2, 0, 0); }
    else if (isLong) { base.set(0.15, -0.17, -0.3); rot.set(0, 0, 0); }
    else if (kind === 'pistol') { base.set(0.13, -0.155, -0.4); }
    else if (kind === 'melee') { base.set(0.2, -0.22, -0.38); rot.set(0.55, 0.15, -0.25); }
    else if (kind === 'chainsaw') { base.set(0.15, -0.3, -0.35); rot.set(0.1, 0, 0); }
    else { base.set(0.13, -0.18, -0.4); rot.set(0.15, -0.35, 0); }
    // dual pistols: offset one, mirrored arm handled below
    // movement bob & sway
    base.x += bx - this.sway.x * 0.6; base.y += by + this.sway.y * 0.6;
    // recoil
    const k = this.recoilKick;
    const kickAmt = ws ? (ws.def.kick || 1) : 1;
    base.z += k * 0.035 * kickAmt; rot.x += k * 0.06 * kickAmt;
    // deploy (rise from below)
    const dpl = this.deployAnim;
    base.y -= dpl * dpl * 0.25; rot.x -= dpl * 0.7;
    // shove: swing to the side
    const sv = s.shoveT;
    if (sv > 0) { const e = Math.sin(sv * Math.PI); base.x -= e * 0.12; base.z -= e * 0.06; rot.y += e * 0.9; rot.z += e * 0.4; }
    // reload
    let reloadK = 0;
    if (ws && ws.reloading > 0) {
      const p = 1 - ws.reloading / Math.max(0.01, ws.reloadTotal);
      reloadK = ws.shellReload ? 1 : Math.sin(Math.min(1, p * 1.15) * Math.PI);
      base.y -= reloadK * 0.05; rot.z += reloadK * 0.5; rot.x += reloadK * 0.15;
    }
    // melee swing arc (right-high to left-low)
    if (kind === 'melee' && s.swingT > 0) {
      const t = s.swingT;
      const e = t < 0.15 ? -t / 0.15 : t < 0.55 ? -1 + (t - 0.15) / 0.4 * 2 : 1 - (t - 0.55) / 0.45;
      const dir = s.swingDir || 1;
      rot.z += -e * 1.1 * dir; rot.y += e * 0.9 * dir; rot.x += -Math.abs(e) * 0.4 + 0.2; base.x -= e * 0.12 * dir; base.y += Math.abs(e) * 0.05;
    }
    if (kind === 'chainsaw' && s.chainsawRun) { base.x += (Math.random() - 0.5) * 0.006; base.y += (Math.random() - 0.5) * 0.006; }
    // throwables wind-up
    if (s.throwT >= 0 && !s.inv.carry) { const t = Math.min(1, s.throwT * 3); base.set(0.18, -0.08 + t * 0.12, -0.28 + t * 0.12); rot.set(-0.6 * t, 0, -0.3 * t); }
    // healing / pills etc
    if (s.action && (s.action.type === 'heal_self' || s.action.type === 'deploy')) { base.y -= 0.18; rot.x -= 0.5; }
    if (s.action && (s.action.type === 'revive' || s.action.type === 'ledge' || s.action.type === 'use' || s.action.type === 'pour')) { base.y -= 0.25; rot.x -= 0.8; }
    if (s.state === 'incap') { base.y += 0.02; rot.z += 0.15; }
    if (vm) {
      vm.position.copy(base);
      vm.rotation.copy(rot);
      // moving sub-parts
      if (vm.userData.mag && this.magHome) {
        const mag = vm.userData.mag;
        mag.position.copy(this.magHome);
        if (ws && ws.reloading > 0 && !ws.shellReload) {
          const p = 1 - ws.reloading / Math.max(0.01, ws.reloadTotal);
          if (p > 0.15 && p < 0.65) { mag.position.y -= Math.min(0.3, (p - 0.15) * 1.5); mag.visible = p < 0.35 || p > 0.5; }
          else mag.visible = true;
        } else mag.visible = true;
      }
      if (vm.userData.pump && this.pumpHome) {
        const pump = vm.userData.pump;
        pump.position.copy(this.pumpHome);
        if (s.pumpT > 0) { s.pumpT += dt * 2.6; const e = s.pumpT < 0.5 ? 0 : Math.sin(Math.min(1, (s.pumpT - 0.5) * 2) * Math.PI); pump.position.z += e * 0.09; if (s.pumpT > 1) s.pumpT = 0; }
      }
      vm.updateMatrix(); vm.updateMatrixWorld(true);
      // muzzle flash on the viewmodel
      this.muzzleFlashT = Math.max(0, (this.muzzleFlashT || 0) - dt);
      if (this.muzzleFlashT > 0 && vm.userData.muzzle) {
        this.flash.visible = true;
        this.flash.position.copy(vm.userData.muzzle).applyEuler(rot).add(base);
        this.flash.scale.setScalar(this.flashSize * (0.8 + Math.random() * 0.4));
        this.flash.rotation.set(0, 0, Math.random() * 6.28);
      } else this.flash.visible = false;
    } else if (this.flash) this.flash.visible = false;
    // arms: right hand at the grip, left hand at the support point
    const showArms = !!vm;
    this.arms.r.visible = showArms; this.arms.l.visible = showArms;
    if (vm) {
      const grip = _v2.set(0, -0.02, 0.02).applyEuler(rot).add(base);
      placeArm(this.arms.r, grip, _v.set(0.32, -0.42, 0.18));
      let lh;
      if (vm.userData.leftHand && kind !== 'melee' && !(kind === 'pistol' && ws && ws.id !== 'dual_pistols' && false)) lh = vm.userData.leftHand.clone().applyEuler(rot).add(base);
      else if (kind === 'melee' || kind === 'chainsaw') lh = _v2.set(0, -0.02, -0.12).applyEuler(rot).add(base);
      else lh = new THREE.Vector3(-0.22, -0.32, -0.25);
      if (ws && ws.reloading > 0 && !ws.shellReload && vm.userData.mag) {
        // left hand goes to the magazine
        const mp = vm.userData.mag.position.clone().applyEuler(rot).add(base);
        lh.lerp(mp, reloadK);
      }
      if (ws && ws.shellReload) { const t = (s.t * 4) % 1; lh = (vm.userData.mag ? vm.userData.mag.position.clone() : new THREE.Vector3(0, -0.05, -0.15)).applyEuler(rot).add(base).add(_v2.set(-0.03, -0.05 + Math.sin(t * Math.PI) * 0.04, 0)); }
      if (s.inv.carry) lh = _v2.set(-0.12, -0.1, 0).add(base).clone();
      if (kind === 'item' && !s.inv.carry) lh = new THREE.Vector3(-0.25, -0.38, -0.2);
      placeArm(this.arms.l, lh, _v.set(-0.3, -0.45, 0.15));
      this.arms.l.visible = !(kind === 'item' && !s.inv.carry && !(s.action && s.action.type === 'heal_self'));
    }
  }
}

function placeArm(mesh, hand, elbow) {
  mesh.position.copy(hand);
  // forearm (+z local) should point from the hand towards the elbow
  const dir = _v2.copy(elbow).sub(hand).normalize();
  _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  mesh.quaternion.copy(_q);
}
