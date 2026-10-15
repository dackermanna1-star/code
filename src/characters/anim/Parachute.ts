// Ram-air parachute canopy visual: arched, cell-striped wing with suspension lines to the shoulders.
// Inflates with sky.chuteOpen, sways with steering, and collapses/fades after landing.
import * as THREE from 'three';
import { ctx } from '../../core/GameContext';
import { Assets } from '../../core/Assets';

/**
 * Authored canopy (public/assets/gear/parachute.glb, see its README): origin between the shoulder riser
 * attachments, canopy ~4.3 m above and 0.6 m ahead; nodes `canopy`, `lines`, `risers`. Loaded once and shared;
 * the procedural wing below is the fallback until/unless it is available.
 */
let chuteTemplate: THREE.Object3D | null = null;
let chuteRequested = false;
function requestChuteModel(): void {
  if (chuteRequested || !ctx.assets) return;
  chuteRequested = true;
  void ctx.assets.tryGltf('assets/gear/parachute.glb').then((g) => {
    if (g) chuteTemplate = g.scene;
  });
}

let canopyGeo: THREE.BufferGeometry | null = null;
let canopyMat: THREE.MeshStandardMaterial | null = null;
/** Canopy vertices the suspension lines attach to (4 per side). */
const LINE_PICKS = [0, 3, 6, 8, 10, 12, 15, 18].map((i) => i * 5 + 2);
const _inv = new THREE.Matrix4();
const _sl = new THREE.Vector3();
const _sr = new THREE.Vector3();
const _v = new THREE.Vector3();

function buildCanopy(): THREE.BufferGeometry {
  if (canopyGeo) return canopyGeo;
  const span = 7.2, chord = 2.7, arc = 1.9; // arc angle (rad) across the span
  const R = span / arc;
  const segs = 18, rows = 4;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const cA = new THREE.Color(0x3d4a6b), cB = new THREE.Color(0xd8d8d0);
  for (let i = 0; i <= segs; i++) {
    const a = -arc / 2 + (arc * i) / segs;
    const x = Math.sin(a) * R;
    const y = Math.cos(a) * R - R;
    for (let j = 0; j <= rows; j++) {
      const z = -chord / 2 + (chord * j) / rows;
      // airfoil thickness bump toward the leading edge (+Z)
      const t = j / rows;
      pos.push(x, y + Math.sin(t * Math.PI) * 0.18, z);
      const c = Math.floor(i / 3) % 2 ? cA : cB;
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j, b = a + rows + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  canopyGeo = g;
  return g;
}

export class ParachuteVisual {
  readonly group = new THREE.Group();
  private readonly canopy: THREE.Mesh;
  private readonly lines: THREE.LineSegments;
  private readonly linePos: Float32Array;
  private collapse = 0;
  private active = false;
  /** Authored model (clone of the shared GLB) and its slack-able parts. */
  private model: THREE.Object3D | null = null;
  private modelLines: THREE.Object3D[] = [];

  constructor() {
    if (!canopyMat) canopyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    this.canopy = new THREE.Mesh(buildCanopy(), canopyMat);
    this.canopy.castShadow = true;
    this.group.add(this.canopy);
    this.linePos = new Float32Array(8 * 2 * 3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.7 }));
    this.lines.frustumCulled = false;
    this.group.add(this.lines);
    this.group.visible = false;
    this.group.name = 'parachute';
    requestChuteModel();
  }

  /** Swap the procedural wing for the authored GLB once it has loaded. */
  private ensureModel(): void {
    if (this.model || !chuteTemplate) return;
    const m = Assets.cloneScene(chuteTemplate);
    m.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = o.name === 'canopy';
    });
    this.modelLines = ['lines', 'risers'].map((n) => m.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o);
    this.model = m;
    this.group.add(m);
    this.canopy.visible = false;
    this.lines.visible = false;
  }

  /**
   * @param deployed canopy out (skydive parachute phase); false starts the collapse (landing, death, water).
   * @param open 0..1 inflation; `root` = character visual root; shoulders in world space.
   */
  update(dt: number, deployed: boolean, open: number, root: THREE.Object3D, shoulderL: THREE.Vector3, shoulderR: THREE.Vector3, steer: number, pitch: number): void {
    if (deployed) {
      this.active = true;
      this.collapse = 0;
    } else if (this.active) {
      this.collapse += dt / 1.6;
      if (this.collapse >= 1) {
        this.active = false;
        this.group.visible = false;
        return;
      }
    }
    if (!this.active) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    const k = this.collapse;
    this.ensureModel();
    if (this.model) {
      this.updateModel(k, open, root, shoulderL, shoulderR, steer, pitch);
      return;
    }
    const lineMat = this.lines.material as THREE.LineBasicMaterial;
    if (k > 0) {
      // Released on landing: the canopy stays where it was and settles/fades (it no longer follows the
      // jumper, who is already running away); the lines go slack immediately.
      const o = THREE.MathUtils.smoothstep(open, 0, 1);
      const h = 4.6 * (0.35 + 0.65 * o) - k * 3.5;
      this.canopy.position.set(0, h + 1.0, 0.6 - k * 2.5);
      this.canopy.rotation.x = -0.12 + k * 1.2;
      this.canopy.scale.y = Math.max(0.05, 0.4 + 0.6 * o - k * 0.3);
      lineMat.opacity = 0.7 * Math.max(0, 1 - k * 4);
      this.lines.visible = lineMat.opacity > 0.01;
      return;
    }
    this.lines.visible = true;
    const o = THREE.MathUtils.smoothstep(open, 0, 1);
    // Canopy above and slightly in front of the jumper, in the character's frame.
    this.group.position.copy(root.position);
    this.group.quaternion.copy(root.quaternion);
    const h = 4.6 * (0.35 + 0.65 * o);
    this.canopy.position.set(0, h + 1.0, 0.6);
    this.canopy.rotation.set(-0.12 - pitch * 0.15, 0, -steer * 0.18);
    this.canopy.scale.set(0.25 + 0.75 * o, 0.4 + 0.6 * o, 0.6 + 0.4 * o);
    // Lines from canopy edge points to the shoulders (group space).
    this.group.updateMatrixWorld(true);
    _inv.copy(this.group.matrixWorld).invert();
    _sl.copy(shoulderL).applyMatrix4(_inv);
    _sr.copy(shoulderR).applyMatrix4(_inv);
    const geoPos = this.canopy.geometry.attributes.position as THREE.BufferAttribute;
    const lp = this.linePos;
    for (let n = 0; n < 8; n++) {
      _v.fromBufferAttribute(geoPos, LINE_PICKS[n]).applyMatrix4(this.canopy.matrix);
      const s = n < 4 ? _sr : _sl;
      const i = n * 6;
      lp[i] = _v.x;
      lp[i + 1] = _v.y;
      lp[i + 2] = _v.z;
      lp[i + 3] = s.x;
      lp[i + 4] = s.y;
      lp[i + 5] = s.z;
    }
    (this.lines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    lineMat.opacity = 0.7;
  }

  /** Authored canopy: hangs from the shoulders, inflates by scale, swings with steering, collapses on release. */
  private updateModel(k: number, open: number, root: THREE.Object3D, shoulderL: THREE.Vector3, shoulderR: THREE.Vector3, steer: number, pitch: number): void {
    const m = this.model!;
    const o = THREE.MathUtils.smoothstep(open, 0, 1);
    if (k > 0) {
      // Released: stays where it was, folds backwards and sinks; lines/risers go slack (hidden).
      for (const l of this.modelLines) l.visible = false;
      m.rotation.x = -0.06 + k * 1.15;
      m.scale.y = Math.max(0.05, (0.45 + 0.55 * o) * (1 - 0.8 * k));
      return;
    }
    for (const l of this.modelLines) l.visible = true;
    this.group.position.copy(root.position);
    this.group.quaternion.copy(root.quaternion);
    this.group.updateMatrixWorld(true);
    _inv.copy(this.group.matrixWorld).invert();
    _sl.copy(shoulderL).applyMatrix4(_inv);
    _sr.copy(shoulderR).applyMatrix4(_inv);
    // Origin between the riser attachments (a little above and behind the shoulder joints).
    m.position.copy(_sl).add(_sr).multiplyScalar(0.5);
    m.position.y += 0.05;
    m.position.z -= 0.03;
    m.rotation.set(-0.06 - pitch * 0.12, 0, -steer * 0.16);
    m.scale.set(0.3 + 0.7 * o, 0.45 + 0.55 * o, 0.6 + 0.4 * o);
  }

  /** Per-frame: keep a deployed canopy on the (interpolated) jumper even on frames the animation skips. */
  follow(root: THREE.Object3D, deployed: boolean): void {
    if (!deployed || !this.active || this.collapse > 0) return;
    this.group.position.copy(root.position);
    this.group.quaternion.copy(root.quaternion);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.lines.geometry.dispose();
    this.model = null;
  }
}
