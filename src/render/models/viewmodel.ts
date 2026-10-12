// First-person viewmodel: the hunter's forearms (blue parka sleeves, fur
// cuffs, mittens) holding the current weapon, drawn in a second pass over the
// world so it never clips into creatures and never shows in the ice mirror.
//
// Space: `root` follows the gameplay camera (its children live in camera
// space: x right, y up, -z forward). The viewmodel camera sits at the same
// place with a narrower field of view (guns look less stretched); points that
// effects need in the world (muzzles, ejection port, magazine) are mapped back
// through the gameplay camera so flashes and tracers line up on screen.
//
// The weapon models are the same ones the hunter carries (models/weapons.ts)
// and animate through their own hooks (slides, pump, bolt, minigun barrels,
// magazines). Arms reach the grips with two-bone IK; the support hand follows
// the hunter's reload keyframes (RELOAD_KEYS), so reloads read the same in
// both views.
import * as THREE from 'three';
import { MATERIALS, PartBuilder, capsule, ellipsoid, torus } from './kit';
import { createWeaponModel, kickCurve, type WeaponModel } from './weapons';
import { HUNTER_COLORS as COL, RELOAD_KEYS, furShade, parkaShade, type KeyPos } from './hunter';
import type { WeaponId } from '../../config/weapons';

/** Vertical field of view of the viewmodel pass, degrees. */
export const VIEWMODEL_FOV = 58;

export interface ViewmodelInput {
  weapon: WeaponId;
  /** Seconds since the last discharge (large when idle). */
  fireT: number;
  /** 0..1 reload progress, or -1. */
  reloadT: number;
  /** Minigun heat 0..1. */
  heat: number;
  /** Shotgun pump / punt-gun hammer cycle 0..1, or -1. */
  cock: number;
  /** Grenade throw progress 0..1, or -1. */
  throwT: number;
  /** The hunter can use the weapon (not sitting, getting up, tumbling or kicking). */
  ready: boolean;
  /** Ground speed, m/s, and gait distance, m (walk bob). */
  speed: number;
  distance: number;
  /** Height above the ice, m, and vertical speed (jump lift, landing dip). */
  height: number;
  vy: number;
  /** Change of view yaw / pitch this frame, rad (weapon lags behind the look). */
  lookYaw: number;
  lookPitch: number;
  dt: number;
  time: number;
}

/** Grip placement in camera space (m) and extra rotation (pitch, yaw, roll; rad). */
interface Hold {
  p: [number, number, number];
  r?: [number, number, number];
  /** Second gun (dual MAC-10), left hand. */
  p2?: [number, number, number];
  /** Model scale (very long guns are shortened a touch so they fit on screen). */
  s?: number;
  /** Support-hand grip in model space, overriding the model's support marker. */
  support?: [number, number, number];
}

const HOLD: Record<WeaponId, Hold> = {
  pistol: { p: [0.12, -0.185, -0.46], r: [-0.02, 0.05, 0.07] },
  magnum: { p: [0.12, -0.185, -0.45], r: [-0.02, 0.05, 0.07] },
  mp5: { p: [0.12, -0.225, -0.42], r: [0.03, 0.09, 0.06] },
  grenades: { p: [0.17, -0.2, -0.5], r: [0.1, 0.1, 0.2] },
  shotgun: { p: [0.12, -0.225, -0.44], r: [0.03, 0.09, 0.06] },
  mac10: { p: [0.16, -0.21, -0.56], p2: [-0.16, -0.21, -0.56], r: [0.04, 0.14, 0.1] },
  flunk: { p: [0.13, -0.25, -0.42], r: [0.04, 0.09, 0.06] },
  m4: { p: [0.12, -0.23, -0.44], r: [0.03, 0.09, 0.06] },
  awp: { p: [0.12, -0.225, -0.44], r: [0.03, 0.08, 0.05] },
  vintage: { p: [0.19, -0.34, -0.32], r: [0.05, 0.1, 0.06] },
  // left hand on the side of the barrel housing (the top handle would put the arm across the view)
  minigun: { p: [0.22, -0.43, -0.6], r: [0.08, 0.07, 0.03], support: [-0.3, 0.0, 0.1] },
};

/** Per-shot kick: back (m), muzzle climb (rad), roll (rad), up / down times (s). */
const KICK: Record<WeaponId, { back: number; rot: number; roll: number; up: number; down: number }> = {
  pistol: { back: 0.035, rot: 0.12, roll: 0.02, up: 0.02, down: 0.14 },
  magnum: { back: 0.06, rot: 0.32, roll: 0.05, up: 0.02, down: 0.24 },
  mp5: { back: 0.018, rot: 0.03, roll: 0.01, up: 0.015, down: 0.06 },
  grenades: { back: 0, rot: 0, roll: 0, up: 0.02, down: 0.05 },
  shotgun: { back: 0.085, rot: 0.2, roll: 0.04, up: 0.02, down: 0.26 },
  mac10: { back: 0.02, rot: 0.06, roll: 0.03, up: 0.012, down: 0.045 },
  flunk: { back: 0.06, rot: 0.16, roll: 0.03, up: 0.02, down: 0.22 },
  m4: { back: 0.02, rot: 0.035, roll: 0.01, up: 0.015, down: 0.06 },
  awp: { back: 0.1, rot: 0.2, roll: 0.03, up: 0.02, down: 0.34 },
  vintage: { back: 0.16, rot: 0.24, roll: 0.06, up: 0.03, down: 0.45 },
  minigun: { back: 0.01, rot: 0.012, roll: 0.0, up: 0.01, down: 0.03 },
};

/** Gun offset at the height of a reload: camera-space translation + rotation (pitch, yaw, roll). */
const RELOAD_TILT: Record<WeaponId, { d: [number, number, number]; r: [number, number, number] }> = {
  // magazine guns roll clockwise so the mag well turns toward the support hand
  pistol: { d: [-0.02, 0.0, 0.03], r: [0.2, 0.06, -0.4] },
  magnum: { d: [-0.05, 0.02, 0.04], r: [0.35, 0.2, 0.9] },
  mp5: { d: [-0.02, 0.0, 0.02], r: [0.15, 0.08, -0.45] },
  grenades: { d: [0, 0, 0], r: [0, 0, 0] },
  shotgun: { d: [-0.03, 0.0, 0.02], r: [0.12, 0.1, -0.6] },
  mac10: { d: [0.0, 0.02, 0.05], r: [0.45, 0.0, 0.0] },
  flunk: { d: [-0.04, 0.0, 0.02], r: [0.18, 0.12, 0.5] },
  m4: { d: [-0.02, 0.0, 0.02], r: [0.15, 0.08, -0.45] },
  awp: { d: [-0.02, 0.0, 0.02], r: [0.12, 0.06, -0.35] },
  vintage: { d: [-0.05, 0.03, 0.0], r: [0.35, 0.1, 0.15] },
  minigun: { d: [0.0, -0.04, 0.02], r: [-0.05, 0.05, 0.12] },
};

// Arms ----------------------------------------------------------------------
const UPPER = 0.34;
const FORE = 0.33;
const SHOULDER_R = new THREE.Vector3(0.22, -0.58, 0.1);
const SHOULDER_L = new THREE.Vector3(-0.42, -0.62, 0.06);
const POLE_R = new THREE.Vector3(0.75, -1, 0.15).normalize();
const POLE_L = new THREE.Vector3(-0.75, -1, 0.15).normalize();
/** Thumb direction of each mitten (camera space, before the hand turns with the gun). */
const THUMB_R = new THREE.Vector3(-0.8, 0.6, -0.4).normalize();
const THUMB_L = new THREE.Vector3(0.8, 0.6, -0.4).normalize();
/** Belt pouch for 'r' reload keys (camera space, out of view). */
const POUCH = new THREE.Vector3(-0.08, -0.62, -0.18);
/** Where the support hand waits when it has nothing to hold. */
const REST_L = new THREE.Vector3(-0.2, -0.55, -0.12);

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Frame-rate independent exponential approach factor. */
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _inv = new THREE.Matrix4();
const SHARED = new Set<THREE.Material>(Object.values(MATERIALS));
const BASE_ROT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));

interface Arm {
  upper: THREE.Object3D;
  lower: THREE.Object3D;
  shoulder: THREE.Vector3;
  pole: THREE.Vector3;
  thumb: THREE.Vector3;
  target: THREE.Vector3;
}

/** Muzzle flash billboard texture: hot core with soft spikes (drawn once). */
function flashTexture(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S * 2;
  c.height = S;
  const g = c.getContext('2d')!;
  // left cell: star (front view)
  const cx = S / 2;
  const cy = S / 2;
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const len = S * (0.32 + 0.16 * ((i * 37) % 5) / 5);
    g.save();
    g.translate(cx, cy);
    g.rotate(a);
    const gr = g.createLinearGradient(0, 0, len, 0);
    gr.addColorStop(0, 'rgba(255,240,200,0.9)');
    gr.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, -S * 0.05);
    g.lineTo(len, 0);
    g.lineTo(0, S * 0.05);
    g.fill();
    g.restore();
  }
  let gr = g.createRadialGradient(cx, cy, 0, cx, cy, S * 0.3);
  gr.addColorStop(0, 'rgba(255,255,240,1)');
  gr.addColorStop(0.35, 'rgba(255,220,140,0.85)');
  gr.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  // right cell: flame (side view, base at the left edge)
  gr = g.createRadialGradient(S + S * 0.12, cy, 0, S + S * 0.12, cy, S * 0.9);
  gr.addColorStop(0, 'rgba(255,250,220,1)');
  gr.addColorStop(0.25, 'rgba(255,200,110,0.8)');
  gr.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(S, cy - S * 0.2);
  g.quadraticCurveTo(S + S * 0.6, cy - S * 0.22, S * 2, cy);
  g.quadraticCurveTo(S + S * 0.6, cy + S * 0.22, S, cy + S * 0.2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function flashPlane(tex: THREE.Texture, cell: 0 | 1): THREE.Mesh {
  const g = new THREE.PlaneGeometry(1, 1);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (cell + uv.getX(i)) / 2);
  if (cell === 1) g.translate(0.5, 0, 0); // flame grows from its base
  const m = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  return mesh;
}

interface Flash {
  group: THREE.Group;
  star: THREE.Mesh;
  sideA: THREE.Mesh;
  sideB: THREE.Mesh;
}

export class Viewmodel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(VIEWMODEL_FOV, 16 / 9, 0.01, 30);
  /** Follows the gameplay camera; children are in camera space. */
  readonly root = new THREE.Group();
  readonly hemi = new THREE.HemisphereLight(0xd6dcf2, 0x7d8aa3, 2.2);
  readonly sun = new THREE.DirectionalLight(0xfff2e6, 2.3);
  private readonly flashLight = new THREE.PointLight(0xffc070, 0, 3, 2);
  private readonly mount = new THREE.Object3D();
  private readonly mount2 = new THREE.Object3D();
  private readonly armR: Arm;
  private readonly armL: Arm;
  private readonly models = new Map<WeaponId, WeaponModel>();
  private readonly mats = new Map<THREE.Material, THREE.Material>();
  private readonly flashes: Flash[] = [];
  private flashT = 0;
  private flashPeak = 0;
  private weapon: WeaponModel | null = null;
  private wanted: WeaponId | null = null;
  /** 0 = lowered out of view, 1 = up. */
  private raise = 0;
  private spin = 0;
  private swayX = 0;
  private swayY = 0;
  private swayVX = 0;
  private swayVY = 0;
  private bobW = 0;
  private notReady = 0;
  private land = 0;
  private lastVy = 0;
  private wasAir = false;
  private kickRoll = 1;
  private lastFireT = 99;
  private mainTan = Math.tan(((72 / 2) * Math.PI) / 180);
  private readonly vmTan = Math.tan(((VIEWMODEL_FOV / 2) * Math.PI) / 180);
  private readonly rootInv = new THREE.Matrix4();
  private readonly mainMatrix = new THREE.Matrix4();
  private readonly tex = flashTexture();
  visible = false;

  constructor() {
    this.scene.name = 'Viewmodel';
    this.scene.matrixWorldAutoUpdate = true;
    this.root.matrixAutoUpdate = false;
    this.scene.add(this.root, this.hemi, this.sun, this.sun.target);
    this.root.add(this.mount, this.mount2, this.flashLight);
    this.camera.matrixAutoUpdate = false;
    this.armR = this.buildArm(SHOULDER_R, POLE_R, THUMB_R);
    this.armL = this.buildArm(SHOULDER_L, POLE_L, THUMB_L);
    for (let i = 0; i < 2; i++) {
      const group = new THREE.Group();
      const star = flashPlane(this.tex, 0);
      star.rotation.y = Math.PI / 2; // faces along the barrel (model X)
      const sideA = flashPlane(this.tex, 1);
      sideA.rotation.y = Math.PI; // flame along model -X
      const sideB = flashPlane(this.tex, 1);
      sideB.rotation.set(Math.PI / 2, Math.PI, 0);
      group.add(star, sideA, sideB);
      group.visible = false;
      this.flashes.push({ group, star, sideA, sideB });
    }
  }

  /** Viewmodel copy of a shared material (the viewmodel scene has its own lights). */
  private material(m: THREE.Material): THREE.Material {
    // Only the shared kit materials are copied; per-model ones (minigun glow) animate in place.
    if (!SHARED.has(m)) return m;
    let c = this.mats.get(m);
    if (!c) {
      c = m.clone();
      this.mats.set(m, c);
    }
    return c;
  }

  private adopt(obj: THREE.Object3D): void {
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!Array.isArray(mesh.material)) mesh.material = this.material(mesh.material);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.layers.set(0);
    });
  }

  private buildArm(shoulder: THREE.Vector3, pole: THREE.Vector3, thumb: THREE.Vector3): Arm {
    const upper = new THREE.Object3D();
    const lower = new THREE.Object3D();
    const U = new PartBuilder();
    U.addShaded(capsule(0.07, UPPER + 0.08, 6, 14), parkaShade(0.85), 'cloth', { p: [0, -UPPER / 2, 0] });
    U.buildInto(upper);
    const L = new PartBuilder();
    // sleeve widens a little toward the cuff like a parka sleeve
    L.addShaded(capsule(0.058, FORE - 0.02, 6, 16), parkaShade(0.75), 'cloth', { p: [0, -(FORE - 0.02) / 2 + 0.02, 0], s: [1, 1, 1] });
    const cuff = torus(0.054, 0.015, 8, 20);
    cuff.rotateX(Math.PI / 2);
    L.addShaded(cuff, furShade, 'fur', { p: [0, -FORE + 0.075, 0] });
    // mitten: palm + thumb (thumb toward local -X)
    L.add(ellipsoid(0.05, 0.068, 0.054, 16, 12), COL.mitten, 'cloth', { p: [0, -FORE + 0.005, 0] });
    L.add(ellipsoid(0.022, 0.04, 0.024, 10, 8), COL.mittenDark, 'cloth', { p: [-0.042, -FORE + 0.02, 0], r: [0, 0, -0.35] });
    L.buildInto(lower);
    this.adopt(upper);
    this.adopt(lower);
    this.root.add(upper, lower);
    return { upper, lower, shoulder: shoulder.clone(), pole, thumb, target: new THREE.Vector3() };
  }

  private model(id: WeaponId): WeaponModel {
    let m = this.models.get(id);
    if (!m) {
      m = createWeaponModel(id);
      this.adopt(m.group);
      if (m.group2) this.adopt(m.group2);
      if (id === 'minigun') {
        // The carry strap runs over the shoulder: from the eye it would sweep across the view.
        m.group.traverse((o) => {
          if (o.userData.matClass === 'cloth' && o.parent === m!.group) o.visible = false;
        });
      }
      this.models.set(id, m);
    }
    return m;
  }

  /** The model currently in the hands (for effects anchors). */
  get current(): WeaponModel | null {
    return this.weapon;
  }

  private mountModel(id: WeaponId): void {
    if (this.weapon) {
      this.weapon.group.removeFromParent();
      this.weapon.group2?.removeFromParent();
      for (const f of this.flashes) f.group.removeFromParent();
    }
    const m = this.model(id);
    this.weapon = m;
    const s = HOLD[id].s ?? 1;
    m.group.position.set(0, 0, 0);
    m.group.quaternion.copy(BASE_ROT);
    m.group.scale.setScalar(s);
    this.mount.add(m.group);
    if (m.group2) {
      m.group2.position.set(0, 0, 0);
      m.group2.quaternion.copy(BASE_ROT);
      m.group2.scale.setScalar(s);
      this.mount2.add(m.group2);
    }
    m.muzzles.forEach((mz, i) => {
      const f = this.flashes[i];
      if (f) mz.add(f.group);
    });
    this.spin = 0;
  }

  /** Muzzle flash on the next frames (call on each discharge). */
  fire(kind: 'small' | 'big' | 'shotgun'): void {
    const size = kind === 'small' ? 0.1 : kind === 'big' ? 0.15 : 0.2;
    this.flashT = kind === 'small' ? 0.045 : 0.06;
    this.flashPeak = kind === 'small' ? 2.5 : kind === 'big' ? 4 : 5.5;
    for (const f of this.flashes) {
      const s = size * (0.85 + Math.random() * 0.3);
      f.star.scale.set(s * 1.1, s * 1.1, 1);
      f.star.rotation.x = Math.random() * Math.PI * 2;
      f.sideA.scale.set(s * 2.2, s * 0.9, 1);
      f.sideB.scale.set(s * 2.2, s * 0.9, 1);
      f.group.rotation.x = Math.random() * Math.PI;
    }
  }

  /** Copy the scene's key lights (direction, colour) and environment so the hands match the world. */
  syncLights(world: THREE.Scene, sun: THREE.DirectionalLight | null, hemi: THREE.HemisphereLight | null): void {
    this.scene.environment = world.environment;
    this.scene.environmentIntensity = world.environmentIntensity * 1.3;
    if (sun) {
      this.sun.color.copy(sun.color);
      this.sun.intensity = sun.intensity;
      _v.setFromMatrixPosition(sun.matrixWorld);
      _v2.setFromMatrixPosition(sun.target.matrixWorld);
      _v.sub(_v2).normalize();
      this.sun.target.position.setFromMatrixPosition(this.mainMatrix);
      this.sun.position.copy(this.sun.target.position).addScaledVector(_v, 10);
    }
    if (hemi) {
      this.hemi.color.copy(hemi.color);
      this.hemi.groundColor.copy(hemi.groundColor);
      this.hemi.intensity = hemi.intensity;
    }
  }

  /** Follow the gameplay camera (call after it is posed, before update()). */
  syncCamera(main: THREE.PerspectiveCamera): void {
    this.mainMatrix.copy(main.matrixWorld);
    this.mainTan = Math.tan(((main.fov / 2) * Math.PI) / 180);
    this.root.matrix.copy(main.matrixWorld);
    this.root.matrixWorldNeedsUpdate = true;
    this.rootInv.copy(main.matrixWorld).invert();
    this.camera.matrix.copy(main.matrixWorld);
    this.camera.matrixWorldNeedsUpdate = true;
    if (this.camera.aspect !== main.aspect) {
      this.camera.aspect = main.aspect;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Map a viewmodel point (world space of the viewmodel scene) to the world
   * point that appears at the same place on screen through the gameplay camera.
   */
  toWorld(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    out.copy(p).applyMatrix4(this.rootInv);
    const k = this.mainTan / this.vmTan;
    out.x *= k;
    out.y *= k;
    return out.applyMatrix4(this.mainMatrix);
  }

  /** World position of muzzle i (for flashes / tracers). */
  muzzleWorld(i: number, out: THREE.Vector3): THREE.Vector3 | null {
    const m = this.weapon;
    if (!m || !this.visible) return null;
    const mz = m.muzzles[i % m.muzzles.length];
    return this.toWorld(mz.getWorldPosition(_a), out);
  }

  get muzzleCount(): number {
    return this.weapon?.muzzles.length ?? 0;
  }

  ejectorWorld(out: THREE.Vector3): THREE.Vector3 | null {
    if (!this.weapon || !this.visible) return null;
    return this.toWorld(this.weapon.ejector.getWorldPosition(_a), out);
  }

  magazineWorld(out: THREE.Vector3): THREE.Vector3 | null {
    const mag = this.weapon?.magazine;
    if (!mag || !this.visible) return null;
    return this.toWorld(mag.getWorldPosition(_a), out);
  }

  /** Camera-space right / up / forward of the gameplay camera (world vectors). */
  basis(right: THREE.Vector3, up: THREE.Vector3, fwd: THREE.Vector3): void {
    this.mainMatrix.extractBasis(right, up, fwd);
    fwd.negate();
  }

  // ------------------------------------------------------------------ animation
  update(a: ViewmodelInput): void {
    const dt = Math.max(0, Math.min(0.1, a.dt));
    if (this.wanted !== a.weapon) this.wanted = a.weapon;
    if (!this.weapon) {
      this.mountModel(a.weapon);
      this.raise = 0;
    }
    // Weapon switch: lower the old gun, swap, raise the new one.
    if (this.weapon && this.weapon.id !== this.wanted) {
      this.raise = Math.max(0, this.raise - dt / 0.12);
      if (this.raise <= 0) this.mountModel(this.wanted);
    } else {
      this.raise = Math.min(1, this.raise + dt / 0.24);
    }
    const m = this.weapon!;
    const id = m.id;
    const hold = HOLD[id];
    const kick = KICK[id];

    // ---- springs: look sway, walk bob, not-ready lowering, landing dip
    const ky = dt > 0 ? a.lookYaw / dt : 0;
    const kp = dt > 0 ? a.lookPitch / dt : 0;
    // the gun lags behind the look: turning right (yaw decreasing) leaves it to the left
    const tx = Math.max(-0.035, Math.min(0.035, ky * 0.006));
    const ty = Math.max(-0.03, Math.min(0.03, -kp * 0.006));
    // critically damped-ish spring toward the lag target
    this.swayVX += ((tx - this.swayX) * 160 - this.swayVX * 22) * dt;
    this.swayVY += ((ty - this.swayY) * 160 - this.swayVY * 22) * dt;
    this.swayX += this.swayVX * dt;
    this.swayY += this.swayVY * dt;
    const walking = a.height <= 0.001 ? Math.min(1, a.speed / 3.2) : 0;
    this.bobW += (walking - this.bobW) * damp(8, dt);
    this.notReady += ((a.ready ? 0 : 1) - this.notReady) * damp(a.ready ? 7 : 10, dt);
    const air = a.height > 0.02;
    if (this.wasAir && !air) this.land = Math.min(1, Math.max(this.land, -this.lastVy / 9));
    this.wasAir = air;
    this.lastVy = a.vy;
    this.land = Math.max(0, this.land - dt * 3.5);

    const ph = (a.distance / 1.05) * Math.PI * 2;
    const bobX = Math.sin(ph) * 0.011 * this.bobW;
    const bobY = -Math.abs(Math.cos(ph)) * 0.012 * this.bobW + 0.006 * this.bobW;
    const breathe = Math.sin(a.time * 1.9) * 0.0035;
    const lift = air ? Math.max(-0.03, Math.min(0.03, -a.vy * 0.004)) : 0;
    const dip = -Math.sin(Math.min(1, this.land) * Math.PI) * 0.035;

    // ---- recoil
    if (a.fireT < this.lastFireT - 1e-4) this.kickRoll = Math.random() < 0.5 ? -1 : 1;
    this.lastFireT = a.fireT;
    const k = kickCurve(a.fireT, kick.up, kick.down);

    // ---- reload / switch / not-ready envelopes
    const r = a.reloadT;
    const env = r >= 0 && id !== 'grenades' ? smooth(0, 0.15, r) * (1 - smooth(0.85, 1, r)) : 0;
    const RT = RELOAD_TILT[id];
    const down = 1 - smooth(0, 1, this.raise);
    const low = Math.max(down, this.notReady);

    // ---- gun pose (camera space)
    const P = _v.set(hold.p[0], hold.p[1], hold.p[2]);
    P.x += bobX + this.swayX + RT.d[0] * env;
    P.y += bobY + this.swayY + breathe + lift + dip + RT.d[1] * env - 0.32 * low;
    P.z += kick.back * k + RT.d[2] * env + 0.05 * low;
    let pitch = (hold.r?.[0] ?? 0) + kick.rot * k + RT.r[0] * env - 0.7 * low + this.swayY * 2;
    const yaw = (hold.r?.[1] ?? 0) + RT.r[1] * env - this.swayX * 2.5;
    let roll = (hold.r?.[2] ?? 0) + kick.roll * k * this.kickRoll + RT.r[2] * env + 0.25 * low + bobX * 1.5;
    if (id === 'minigun' && a.fireT < 0.15) {
      P.x += (Math.random() - 0.5) * 0.006;
      P.y += (Math.random() - 0.5) * 0.006;
    }
    if (id === 'grenades') {
      const g = this.grenadePose(a.throwT, r, P);
      pitch += g.pitch;
      roll += g.roll;
    }
    // Shotgun pump / punt gun cocking: rock the gun a little.
    if (a.cock >= 0 && (id === 'shotgun' || id === 'vintage')) {
      const c = Math.sin(clamp01(a.cock) * Math.PI);
      pitch += 0.06 * c;
      P.z += 0.015 * c;
    }
    this.mount.position.copy(P);
    // Euler: +pitch lifts the muzzle, +yaw turns it left (inward), +roll tilts the top left.
    this.mount.quaternion.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ'));
    if (m.group2 && hold.p2) {
      // Left gun: mirrored placement, fires a beat later (alternating hands).
      const k2 = kickCurve(a.fireT - 0.025, kick.up, kick.down);
      this.mount2.position.set(
        hold.p2[0] + bobX + this.swayX - RT.d[0] * env,
        hold.p2[1] + bobY + this.swayY + breathe + lift + dip + RT.d[1] * env - 0.32 * low,
        hold.p2[2] + kick.back * k2 + RT.d[2] * env + 0.05 * low,
      );
      const pitch2 = (hold.r?.[0] ?? 0) + kick.rot * k2 + RT.r[0] * env - 0.7 * low + this.swayY * 2;
      const yaw2 = -(hold.r?.[1] ?? 0) - RT.r[1] * env - this.swayX * 2.5;
      const roll2 = -(hold.r?.[2] ?? 0) - kick.roll * k2 * this.kickRoll - RT.r[2] * env - 0.25 * low + bobX * 1.5;
      this.mount2.quaternion.setFromEuler(_e.set(pitch2, yaw2, roll2, 'YXZ'));
      this.mount2.visible = true;
    } else {
      this.mount2.visible = false;
    }

    // ---- weapon parts
    const spinTarget = a.fireT < 0.3 ? 1 : a.heat > 0.05 && a.fireT < 0.8 ? 0.6 : 0;
    this.spin += (spinTarget - this.spin) * Math.min(1, dt * (spinTarget > this.spin ? 5 : 1.1));
    m.animate({ fireT: a.fireT, reloadT: r, heat: a.heat, spin: id === 'minigun' ? this.spin : 0, cock: a.cock, dt, throwT: a.throwT });
    if (m.magazine && id !== 'mac10') m.magazine.visible = m.magazine.visible && !(r >= 0 && r > 0.2 && r < 0.55);

    this.root.updateMatrixWorld(true);
    this.rootInv.copy(this.root.matrixWorld).invert();

    // ---- arms
    const shoulderDrop = bobY * 0.6 + dip * 0.6 - 0.1 * low;
    this.armR.shoulder.copy(SHOULDER_R).setY(SHOULDER_R.y + shoulderDrop);
    this.armL.shoulder.copy(SHOULDER_L).setY(SHOULDER_L.y + shoulderDrop);
    // trigger hand on the grip
    this.local(m.group.getWorldPosition(this.armR.target));
    this.solve(this.armR);
    // support hand
    const tL = this.armL.target;
    if (m.group2) {
      this.local(m.group2.getWorldPosition(tL));
    } else if (id === 'grenades') {
      const th = a.throwT >= 0 ? smooth(0, 0.25, a.throwT) * (1 - smooth(0.7, 1, a.throwT)) : 0;
      // free hand points ahead while throwing, rests low otherwise
      tL.copy(REST_L).lerp(_b.set(-0.24, -0.26, -0.5), th);
    } else {
      this.supportTarget(m, r, tL);
    }
    this.solve(this.armL);

    // ---- muzzle flash
    const flashOn = this.flashT > 0;
    this.flashT -= dt;
    for (let i = 0; i < m.muzzles.length && i < this.flashes.length; i++) this.flashes[i].group.visible = flashOn;
    if (flashOn) {
      const mz = m.muzzles[0];
      this.flashLight.position.copy(this.local(mz.getWorldPosition(_b)));
      this.flashLight.intensity = this.flashPeak;
    } else {
      this.flashLight.intensity = 0;
    }
  }

  /** Grenade: hand path for the overhand throw and re-arming (moves P, returns extra rotation). */
  private grenadePose(throwT: number, reloadT: number, P: THREE.Vector3): { pitch: number; roll: number } {
    if (throwT >= 0) {
      const K: Array<[number, number, number, number]> = [
        [0, P.x, P.y, P.z],
        [0.3, 0.32, -0.02, -0.2],
        [0.45, 0.26, 0.06, -0.3],
        [0.58, 0.1, -0.06, -0.72],
        [1.0, 0.16, -0.5, -0.5],
      ];
      let i = 0;
      while (i < K.length - 2 && throwT >= K[i + 1][0]) i++;
      const u = smooth(K[i][0], K[i + 1][0], throwT);
      P.set(lerp(K[i][1], K[i + 1][1], u), lerp(K[i][2], K[i + 1][2], u), lerp(K[i][3], K[i + 1][3], u));
      const wind = smooth(0, 0.3, throwT) * (1 - smooth(0.35, 0.58, throwT));
      return { pitch: 1.1 * wind - 0.6 * smooth(0.45, 0.7, throwT), roll: 0.4 * wind };
    }
    if (reloadT >= 0) {
      // reach down for the next grenade and bring it up
      const d = reloadT < 0.4 ? smooth(0, 0.3, reloadT) : 1 - smooth(0.45, 1, reloadT);
      P.y -= 0.42 * d;
      P.z += 0.05 * d;
      return { pitch: -0.5 * d, roll: 0.2 * d };
    }
    return { pitch: 0, roll: 0 };
  }

  /** Camera-space position (root local) of a viewmodel-scene world point, in place. */
  private local(p: THREE.Vector3): THREE.Vector3 {
    return p.applyMatrix4(this.rootInv);
  }

  /** Support grip in camera space; markers on the far side of the gun are mirrored to the near (left) side. */
  private supportPoint(m: WeaponModel, out: THREE.Vector3): THREE.Vector3 {
    const o = HOLD[m.id].support;
    if (o) return this.local(out.set(o[0], o[1], o[2]).applyMatrix4(m.group.matrixWorld));
    if (!m.support) return out.copy(REST_L);
    m.support.getWorldPosition(out);
    _inv.copy(m.group.matrixWorld).invert();
    out.applyMatrix4(_inv);
    out.z = Math.abs(out.z);
    out.applyMatrix4(m.group.matrixWorld);
    return this.local(out);
  }

  private resolveKey(m: WeaponModel, k: KeyPos, out: THREE.Vector3): THREE.Vector3 {
    if (k === 'S') return this.supportPoint(m, out);
    if (k[0] === 'r') return out.copy(POUCH);
    out.set(k[1], k[2], k[3]).applyMatrix4(m.group.matrixWorld);
    return this.local(out);
  }

  private supportTarget(m: WeaponModel, reloadT: number, out: THREE.Vector3): void {
    const keys = reloadT >= 0 ? RELOAD_KEYS[m.id] : undefined;
    if (!keys) {
      this.supportPoint(m, out);
      return;
    }
    let i = 0;
    while (i < keys.length - 2 && reloadT >= keys[i + 1][0]) i++;
    const [t0, k0] = keys[i];
    const [t1, k1] = keys[i + 1];
    const u = smooth(t0, t1, reloadT);
    this.resolveKey(m, k0, _a);
    this.resolveKey(m, k1, _b);
    out.lerpVectors(_a, _b, u);
  }

  /** Two-bone IK from the shoulder to arm.target (camera space); bones look down their -Y. */
  private solve(arm: Arm): void {
    const S = arm.shoulder;
    const T = arm.target;
    _a.subVectors(T, S);
    let dist = _a.length();
    const reach = UPPER + FORE - 1e-3;
    if (dist > reach) {
      // Out of reach: the shoulder follows (the body leans in) so the hand stays on the gun.
      S.addScaledVector(_a, (dist - reach) / dist);
      _a.subVectors(T, S);
      dist = reach;
    }
    dist = Math.max(dist, Math.abs(UPPER - FORE) + 0.02);
    _a.normalize();
    const along = (UPPER * UPPER - FORE * FORE + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, UPPER * UPPER - along * along));
    _b.copy(arm.pole).addScaledVector(_a, -arm.pole.dot(_a)).normalize();
    const E = _v2.copy(S).addScaledVector(_a, along).addScaledVector(_b, h);
    this.orient(arm.upper, S, E, arm.pole);
    this.orient(arm.lower, E, T, arm.thumb);
  }

  /** Place `bone` at `from` with its -Y toward `to`; local -X turns toward `side`. */
  private orient(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, side: THREE.Vector3): void {
    _y.subVectors(from, to).normalize();
    _x.copy(side).negate().addScaledVector(_y, side.dot(_y)).normalize();
    if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
    _z.crossVectors(_x, _y);
    _m.makeBasis(_x, _y, _z);
    bone.quaternion.setFromRotationMatrix(_m);
    bone.position.copy(from);
  }

  /** Draw over the current frame (depth cleared first). */
  render(renderer: THREE.WebGLRenderer): void {
    if (!this.visible || !this.weapon) return;
    const autoClear = renderer.autoClear;
    const shadows = renderer.shadowMap.autoUpdate;
    renderer.autoClear = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
    renderer.shadowMap.autoUpdate = shadows;
  }

  /** Reset transient animation (new game, view switch). */
  reset(): void {
    this.raise = 0;
    this.swayX = this.swayY = this.swayVX = this.swayVY = 0;
    this.flashT = 0;
    this.land = 0;
    this.notReady = 0;
  }
}
