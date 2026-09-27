// First-person viewmodel: character-specific arms (2-bone IK) holding the
// active weapon/item, with procedural sway, bob, sprint pose, recoil springs
// and animated reloads (magazine swap / shell-by-shell / pump / bolt), shoves,
// melee swings, throws, healing and pills. Rendered on layer 1 (no clipping).
import * as THREE from 'three';
import { buildModel } from './weaponModels.js';
import { solveIK } from '../entities/body.js';
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

function makeArm(char, side) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: char.skin, roughness: 0.62, side: THREE.DoubleSide });
  const sleeveMat = new THREE.MeshStandardMaterial({ color: char.sleeve, roughness: 0.88, side: THREE.DoubleSide });
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 1, 10).translate(0, 0.5, 0), sleeveMat);
  const lower = new THREE.Group();
  const bare = char.bareArms || char.rolledSleeves;
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.034, 1, 12).translate(0, 0.5, 0), bare ? skin : sleeveMat);
  lower.add(fore);
  if (char.rolledSleeves) {
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.08, 12).translate(0, 0.12, 0), sleeveMat);
    lower.add(cuff);
  } else if (!char.bareArms) {
    // cuff edge + visible wrist skin
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.06, 10).translate(0, 0.97, 0), skin);
    lower.add(wrist);
  }
  if (char.stripe) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.8, 0.01).translate(0, 0.45, 0.034), new THREE.MeshStandardMaterial({ color: char.stripe, roughness: 0.8 }));
    lower.add(st);
  }
  if (char.tattoo) {
    const tat = new THREE.Mesh(new THREE.CylinderGeometry(0.0272, 0.0385, 0.45, 12, 1, true).translate(0, 0.45, 0), new THREE.MeshStandardMaterial({ color: 0x1a2838, roughness: 0.7, transparent: true, opacity: 0.6 }));
    lower.add(tat);
  }
  // Hand in a gripping pose (local Y = grip axis, -Z = front of grip). Left hand is mirrored.
  const hand = new THREE.Group();
  const gloveMat = char.gloves ? new THREE.MeshStandardMaterial({ color: char.gloves, roughness: 0.7, side: THREE.DoubleSide }) : skin;
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.09, 0.062), gloveMat);
  palm.position.set(0.024, -0.008, 0.014);
  palm.rotation.y = 0.45;
  hand.add(palm);
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), gloveMat);
  back.scale.set(0.55, 1.25, 0.9);
  back.position.set(0.03, -0.01, 0.02);
  hand.add(back);
  for (let f = 0; f < 4; f++) {
    const fg = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0085, 5, 10, Math.PI * 1.15), char.fingerless ? skin : gloveMat);
    fg.rotation.x = -Math.PI / 2;
    fg.rotation.z = 0; 
    fg.position.set(0.0, 0.03 - f * 0.019, -0.001);
    fg.scale.set(1 + f * 0.02, 1, 1);
    hand.add(fg);
  }
  const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.04, 3, 6), skin);
  th.position.set(-0.012, 0.035, 0.012);
  th.rotation.set(-0.5, 0, 0.9);
  hand.add(th);
  if (side < 0) hand.scale.x = -1;
  g.add(upper); g.add(lower); g.add(hand);
  g.userData = { upper, lower, hand };
  g.traverse((o) => { o.layers.set(1); o.frustumCulled = false; });
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
    this.model = mt ? buildModel(mt) : null;
    if (this.model) {
      this.model.traverse((o) => { o.layers.set(1); o.castShadow = false; o.frustumCulled = false; });
      this.holder.add(this.model);
      // muzzle flash billboard
      const fm = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffc080 }));
      fm.layers.set(1);
      fm.visible = false;
      this.flashMesh = fm;
      const mz = this.model.userData.muzzle;
      if (mz) mz.add(fm);
      const fm2 = fm.clone();
      fm2.rotation.y = Math.PI / 2;
      fm.add(fm2);
    }
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
    // right hand
    this.placeHand(this.armR, H.R, 1, hq, null);
    // left hand
    let lspec = H.L;
    if (lspec === 'gripL') {
      const gl = this.model.userData.gripL;
      lspec = gl ? [gl.position.x, gl.position.y - 0.03, gl.position.z, 0, 0, 0, true] : [-0.02, -0.03, -0.25, 0, 0, 0, true];
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
    // wrist point (below/behind the grip)
    const wrist = _w.set(0.018 * side, -0.06, 0.028).applyQuaternion(hand.quaternion).add(hand.position);
    const elbow = _tmpE.set(wrist.x + side * 0.08, wrist.y - 0.2, wrist.z + 0.2);
    if (spec[6]) elbow.set(wrist.x - 0.16, wrist.y - 0.2, wrist.z + 0.26);
    const d = _tmpD.subVectors(wrist, elbow);
    const len = d.length();
    d.normalize();
    lower.position.copy(elbow);
    lower.quaternion.setFromUnitVectors(_yAxis, d);
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
