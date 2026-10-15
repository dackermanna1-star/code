// Ram-air parachute canopy visual: arched, cell-striped wing with suspension lines to the shoulders.
// Inflates with sky.chuteOpen, sways with steering, and collapses/fades after landing.
import * as THREE from 'three';

let canopyGeo: THREE.BufferGeometry | null = null;
let canopyMat: THREE.MeshStandardMaterial | null = null;

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
  }

  /**
   * @param open 0..1 inflation, `landed` starts the collapse; `rootPos/yaw` = character, shoulders world.
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
    const o = THREE.MathUtils.smoothstep(open, 0, 1);
    const k = this.collapse;
    // Canopy above and slightly in front of the jumper, in the character's frame.
    this.group.position.copy(root.position);
    this.group.quaternion.copy(root.quaternion);
    const h = 4.6 * (0.35 + 0.65 * o) - k * 3.5;
    this.canopy.position.set(0, h + 1.0, 0.6 - k * 2.5);
    this.canopy.rotation.set(-0.12 - pitch * 0.15 + k * 1.2, 0, -steer * 0.18);
    this.canopy.scale.set(0.25 + 0.75 * o, 0.4 + 0.6 * o - k * 0.3, 0.6 + 0.4 * o);
    // Lines from canopy edge points to the shoulders.
    this.canopy.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    const sl = shoulderL.clone().applyMatrix4(inv), sr = shoulderR.clone().applyMatrix4(inv);
    const geoPos = (this.canopy.geometry.attributes.position as THREE.BufferAttribute);
    const picks = [0, 3, 6, 8, 10, 12, 15, 18].map((i) => i * 5 + 2);
    for (let n = 0; n < 8; n++) {
      const v = new THREE.Vector3().fromBufferAttribute(geoPos, picks[n]).applyMatrix4(this.canopy.matrix);
      const s = n < 4 ? sr : sl;
      this.linePos.set([v.x, v.y, v.z, s.x, s.y, s.z], n * 6);
    }
    (this.lines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.lines.material as THREE.LineBasicMaterial).opacity = 0.7 * (1 - k);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.lines.geometry.dispose();
  }
}
