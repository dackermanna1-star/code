import * as THREE from 'three';
import { damp } from '../core/math';
import type { Appearance } from './Appearance';
import { Geo } from '../world/Builder';

export interface Expression {
  browAngle: number; // + angry, - sad
  browRaise: number; // -1..1
  eyeOpen: number; // 0 closed .. 1 open (.. 1.2 wide)
  smile: number; // -1 frown .. 1 grin
  open: number; // 0..1 mouth open
  blush: number; // 0..1 extra blush
  happyEyes: number; // 0..1 "^^" squint
  asym: number; // -1..1 smirk
}

export const EXPRESSIONS: Record<string, Expression> = {
  neutral: { browAngle: 0, browRaise: 0, eyeOpen: 1, smile: 0.15, open: 0, blush: 0, happyEyes: 0, asym: 0 },
  content: { browAngle: -0.05, browRaise: 0.1, eyeOpen: 0.95, smile: 0.55, open: 0, blush: 0.1, happyEyes: 0, asym: 0 },
  happy: { browAngle: -0.1, browRaise: 0.35, eyeOpen: 0.95, smile: 1, open: 0.35, blush: 0.3, happyEyes: 0.2, asym: 0 },
  delighted: { browAngle: -0.15, browRaise: 0.6, eyeOpen: 1, smile: 1, open: 0.75, blush: 0.6, happyEyes: 1, asym: 0 },
  impatient: { browAngle: 0.3, browRaise: -0.1, eyeOpen: 0.78, smile: -0.35, open: 0, blush: 0, happyEyes: 0, asym: 0.4 },
  annoyed: { browAngle: 0.45, browRaise: -0.25, eyeOpen: 0.6, smile: -0.6, open: 0.05, blush: 0.1, happyEyes: 0, asym: -0.3 },
  angry: { browAngle: 0.75, browRaise: -0.35, eyeOpen: 0.85, smile: -0.9, open: 0.35, blush: 0.5, happyEyes: 0, asym: 0 },
  sad: { browAngle: -0.6, browRaise: 0.25, eyeOpen: 0.75, smile: -0.65, open: 0, blush: 0, happyEyes: 0, asym: 0 },
  surprised: { browAngle: -0.1, browRaise: 0.95, eyeOpen: 1.2, smile: 0, open: 0.85, blush: 0.1, happyEyes: 0, asym: 0 },
  disgusted: { browAngle: 0.5, browRaise: -0.1, eyeOpen: 0.55, smile: -0.75, open: 0.15, blush: 0, happyEyes: 0, asym: 0.7 },
  bored: { browAngle: 0.05, browRaise: -0.15, eyeOpen: 0.5, smile: -0.1, open: 0, blush: 0, happyEyes: 0, asym: 0.2 },
  hungry: { browAngle: -0.2, browRaise: 0.45, eyeOpen: 1.05, smile: 0.6, open: 0.2, blush: 0.2, happyEyes: 0, asym: 0 },
  chewing: { browAngle: -0.05, browRaise: 0.1, eyeOpen: 0.8, smile: 0.4, open: 0, blush: 0.25, happyEyes: 0.35, asym: 0 },
  terrified: { browAngle: -0.75, browRaise: 1, eyeOpen: 1.25, smile: -0.8, open: 0.9, blush: 0, happyEyes: 0, asym: 0.15 },
  dead: { browAngle: -0.1, browRaise: -0.2, eyeOpen: 0.32, smile: -0.25, open: 0.45, blush: 0, happyEyes: 0, asym: 0.35 },
};

const N = 14; // mouth samples

export class Face {
  readonly group = new THREE.Group();
  readonly R: number;
  private cur: Expression = { ...EXPRESSIONS.neutral };
  target: Expression = { ...EXPRESSIONS.neutral };
  private eyes: { root: THREE.Group; iris: THREE.Group; lid: THREE.Group; lower: THREE.Group; x: number }[] = [];
  private brows: THREE.Mesh[] = [];
  private mouthGeo: THREE.BufferGeometry;
  private teethGeo: THREE.BufferGeometry;
  private tongue: THREE.Mesh;
  private blushMeshes: THREE.Mesh[] = [];
  private blushMat: THREE.MeshBasicMaterial;
  private blinkT = 2 + Math.random() * 3;
  private blink = 0;
  talk = 0; // 0..1 talking amplitude (driven by voice)
  private talkPhase = Math.random() * 10;
  look = new THREE.Vector2(); // -1..1 eye look direction
  chew = 0;
  /** no blinking, eyes fixed (a body on the floor) */
  frozen = false;
  private baseBlush: number;
  private mouthY = -0.064;
  private mouthW = 0.042;

  constructor(app: Appearance, skin: THREE.Material, hairMat: THREE.Material, R = 0.17) {
    this.R = R;
    this.baseBlush = app.blush;
    const g = this.group;
    const surf = (x: number, y: number, off = 0) => Math.sqrt(Math.max(0, R * R - x * x - y * y)) + off;

    // ---- eyes
    const white = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 });
    const irisMat = new THREE.MeshPhysicalMaterial({ color: app.eyeColor, roughness: 0.25, clearcoat: 1 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x0c0a0a, roughness: 0.2 });
    const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lidMat = skin;
    const lashMat = new THREE.MeshStandardMaterial({ color: 0x1b1412, roughness: 0.6 });
    const es = app.eyeSize;
    for (const side of [1, -1]) {
      const ex = 0.058 * side * (0.95 + es * 0.05);
      const ey = 0.012;
      const root = new THREE.Group();
      root.position.set(ex, ey, surf(ex, ey) - 0.012);
      g.add(root);
      const ew = new THREE.Mesh(Geo.sphere(1, 24, 16), white);
      ew.scale.set(0.031 * es, 0.039 * es, 0.022);
      root.add(ew);
      const iris = new THREE.Group();
      root.add(iris);
      const ir = new THREE.Mesh(Geo.sphere(1, 20, 12), irisMat);
      ir.scale.set(0.019 * es, 0.022 * es, 0.008);
      ir.position.z = 0.0165;
      iris.add(ir);
      const pu = new THREE.Mesh(Geo.sphere(1, 16, 10), pupilMat);
      pu.scale.set(0.011 * es, 0.013 * es, 0.006);
      pu.position.z = 0.0215;
      iris.add(pu);
      const sh = new THREE.Mesh(Geo.sphere(1, 8, 6), shineMat);
      sh.scale.set(0.0048 * es, 0.0055 * es, 0.003);
      sh.position.set(0.006 * es, 0.009 * es, 0.0265);
      iris.add(sh);
      const sh2 = new THREE.Mesh(Geo.sphere(1, 6, 4), shineMat);
      sh2.scale.setScalar(0.0022 * es);
      sh2.position.set(-0.006 * es, -0.007 * es, 0.026);
      iris.add(sh2);
      // upper lid (top hemisphere cap)
      const lid = new THREE.Group();
      root.add(lid);
      const lidMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), lidMat);
      lidMesh.scale.set(0.0322 * es, 0.0405 * es, 0.0232);
      lid.add(lidMesh);
      // lash line along the lid rim
      const lash = new THREE.Mesh(Geo.torus(1, 0.09, 5, 20, Math.PI), lashMat);
      lash.scale.set(0.0322 * es, 0.0322 * es, 0.0232);
      lash.rotation.x = Math.PI / 2;
      lash.rotation.z = Math.PI;
      lash.position.y = -0.0005;
      lid.add(lash);
      if (app.lashes) {
        for (const k of [0, 1]) {
          const l = new THREE.Mesh(Geo.box(0.012, 0.003, 0.004), lashMat);
          l.position.set(side * (0.03 + k * 0.004) * es, 0.004 + k * 0.004, 0.012);
          l.rotation.z = side * (0.5 + k * 0.3);
          lid.add(l);
        }
      }
      // lower lid (for squints / happy eyes)
      const lower = new THREE.Group();
      root.add(lower);
      const lowMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), lidMat);
      lowMesh.scale.set(0.0318 * es, 0.04 * es, 0.023);
      lower.add(lowMesh);
      this.eyes.push({ root, iris, lid, lower, x: ex });
    }

    // ---- brows
    const browMat = hairMat;
    for (const side of [1, -1]) {
      const b = new THREE.Mesh(Geo.capsule(0.0065, 0.036, 3, 8), browMat);
      b.rotation.z = Math.PI / 2;
      const bx = 0.06 * side;
      const by = 0.072;
      b.position.set(bx, by, surf(bx, by) + 0.002);
      b.userData.base = b.position.clone();
      b.userData.side = side;
      b.scale.set(1, 1, 0.7);
      g.add(b);
      this.brows.push(b);
    }

    // ---- nose
    const noseMat = skin;
    let nose: THREE.Mesh;
    const nz = surf(0, -0.02);
    switch (app.nose) {
      case 'round':
        nose = new THREE.Mesh(Geo.sphere(0.03, 16, 12), noseMat);
        nose.position.set(0, -0.022, nz - 0.006);
        break;
      case 'long':
        nose = new THREE.Mesh(Geo.sphere(1, 16, 12), noseMat);
        nose.scale.set(0.02, 0.024, 0.042);
        nose.position.set(0, -0.02, nz + 0.004);
        nose.rotation.x = 0.35;
        break;
      case 'pointy':
        nose = new THREE.Mesh(Geo.cone(0.018, 0.05, 12), noseMat);
        nose.rotation.x = Math.PI / 2 + 0.3;
        nose.position.set(0, -0.022, nz + 0.012);
        break;
      case 'wide':
        nose = new THREE.Mesh(Geo.sphere(1, 16, 12), noseMat);
        nose.scale.set(0.036, 0.022, 0.024);
        nose.position.set(0, -0.024, nz);
        break;
      default:
        nose = new THREE.Mesh(Geo.sphere(0.021, 14, 10), noseMat);
        nose.position.set(0, -0.02, nz - 0.002);
    }
    g.add(nose);

    // ---- blush
    this.blushMat = new THREE.MeshBasicMaterial({ color: 0xff6f7f, transparent: true, opacity: 0, depthWrite: false });
    for (const side of [1, -1]) {
      const bx = 0.092 * side;
      const by = -0.038;
      const m = new THREE.Mesh(Geo.sphere(1, 14, 8), this.blushMat);
      m.scale.set(0.024, 0.014, 0.004);
      m.position.set(bx, by, surf(bx, by) - 0.0005);
      m.lookAt(new THREE.Vector3(bx * 3, by * 3, surf(bx, by) * 3));
      m.renderOrder = 2;
      g.add(m);
      this.blushMeshes.push(m);
    }
    if (app.freckles) {
      const fm = new THREE.MeshBasicMaterial({ color: 0x9a5a3a });
      for (let i = 0; i < 10; i++) {
        const side = i % 2 ? 1 : -1;
        const fx = side * (0.07 + Math.random() * 0.04);
        const fy = -0.025 - Math.random() * 0.025;
        const f = new THREE.Mesh(Geo.sphere(0.0022, 5, 4), fm);
        f.position.set(fx, fy, surf(fx, fy));
        g.add(f);
      }
    }

    // ---- mouth
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0x5a1a1f, roughness: 0.6, side: THREE.DoubleSide });
    this.mouthGeo = new THREE.BufferGeometry();
    this.mouthGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.mouthGeo.setIndex(idx);
    const mouth = new THREE.Mesh(this.mouthGeo, mouthMat);
    mouth.frustumCulled = false;
    g.add(mouth);
    this.teethGeo = new THREE.BufferGeometry();
    this.teethGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    this.teethGeo.setIndex(idx);
    const teeth = new THREE.Mesh(this.teethGeo, new THREE.MeshStandardMaterial({ color: 0xfaf8f2, roughness: 0.3, side: THREE.DoubleSide }));
    teeth.frustumCulled = false;
    teeth.renderOrder = 1;
    g.add(teeth);
    this.tongue = new THREE.Mesh(Geo.sphere(1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe06a78, roughness: 0.5 }));
    this.tongue.scale.set(0.016, 0.006, 0.003);
    g.add(this.tongue);
    this.updateMouth();
  }

  setExpression(name: keyof typeof EXPRESSIONS | Expression) {
    const e = typeof name === 'string' ? EXPRESSIONS[name] : name;
    Object.assign(this.target, e);
  }

  private updateMouth() {
    const R = this.R;
    const e = this.cur;
    const w = this.mouthW * (1 + e.smile * 0.12 + e.open * 0.05);
    const talkOpen = this.talk * (0.5 + 0.5 * Math.sin(this.talkPhase * 17)) * 0.55;
    const chewOpen = this.chew * (0.5 + 0.5 * Math.sin(this.talkPhase * 9)) * 0.35;
    const open = Math.min(1, e.open + talkOpen + chewOpen);
    const pos = this.mouthGeo.attributes.position as THREE.BufferAttribute;
    const tpos = this.teethGeo.attributes.position as THREE.BufferAttribute;
    const y0 = this.mouthY;
    for (let i = 0; i < N; i++) {
      const u = (i / (N - 1)) * 2 - 1; // -1..1
      const x = u * w;
      const edge = 1 - u * u;
      const curve = e.smile * 0.017 * (u * u - 0.35) + e.asym * 0.006 * u;
      const upper = y0 + curve + open * 0.007 * Math.pow(edge, 0.7) + 0.0018;
      const lower = y0 + curve - 0.0018 - open * 0.026 * Math.pow(edge, 0.8) - Math.max(0, e.smile) * open * 0.006 * edge;
      const zu = Math.sqrt(Math.max(0, R * R - x * x - upper * upper)) + 0.0012;
      const zl = Math.sqrt(Math.max(0, R * R - x * x - lower * lower)) + 0.0012;
      pos.setXYZ(i * 2, x, upper, zu);
      pos.setXYZ(i * 2 + 1, x, lower, zl);
      // teeth: band under the upper lip when smiling with an open mouth
      const th = Math.min(upper - lower, 0.006 + open * 0.004) * Math.max(0, Math.min(1, open * 3)) * (0.35 + Math.max(0, e.smile) * 0.65);
      const tx = x * 0.9;
      const tl = upper - th;
      tpos.setXYZ(i * 2, tx, upper - 0.0006, Math.sqrt(Math.max(0, R * R - tx * tx - upper * upper)) + 0.0016);
      tpos.setXYZ(i * 2 + 1, tx, tl, Math.sqrt(Math.max(0, R * R - tx * tx - tl * tl)) + 0.0016);
    }
    pos.needsUpdate = true;
    tpos.needsUpdate = true;
    this.mouthGeo.computeBoundingSphere();
    const ty = y0 + e.smile * -0.006 - open * 0.018;
    this.tongue.position.set(0, ty, Math.sqrt(Math.max(0, R * R - ty * ty)) + 0.0015);
    this.tongue.visible = open > 0.25;
    this.tongue.scale.set(0.014 + open * 0.004, 0.006 * open, 0.003);
  }

  update(dt: number) {
    const c = this.cur;
    const t = this.target;
    const k = 10;
    c.browAngle = damp(c.browAngle, t.browAngle, k, dt);
    c.browRaise = damp(c.browRaise, t.browRaise, k, dt);
    c.eyeOpen = damp(c.eyeOpen, t.eyeOpen, k, dt);
    c.smile = damp(c.smile, t.smile, k, dt);
    c.open = damp(c.open, t.open, k, dt);
    c.blush = damp(c.blush, t.blush, 4, dt);
    c.happyEyes = damp(c.happyEyes, t.happyEyes, k, dt);
    c.asym = damp(c.asym, t.asym, k, dt);
    this.talkPhase += dt;

    // blinking
    this.blinkT -= dt;
    if (this.frozen) this.blinkT = 1;
    if (this.blinkT <= 0) {
      this.blink = 1;
      this.blinkT = 1.8 + Math.random() * 3.5;
      if (Math.random() < 0.15) this.blinkT = 0.25; // double blink
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    const blinkAmt = Math.sin(this.blink * Math.PI);

    for (const [i, eye] of this.eyes.entries()) {
      const open = Math.max(0, Math.min(1.25, c.eyeOpen * (1 - blinkAmt) * (1 - c.happyEyes * 0.75)));
      // closed = +PI/2 (lid faces forward), open = -0.45
      eye.lid.rotation.x = THREE.MathUtils.lerp(Math.PI / 2 + 0.05, -1.05, Math.min(1, open)) - Math.max(0, open - 1) * 0.4;
      // lower lid rises for happy "^^" eyes and squints
      eye.lower.rotation.x = -THREE.MathUtils.lerp(-0.9, Math.PI / 2 - 0.3, c.happyEyes * 0.9 + (1 - Math.min(1, c.eyeOpen)) * 0.15);
      eye.iris.rotation.y = this.look.x * 0.45;
      eye.iris.rotation.x = -this.look.y * 0.3;
      const s = 1 + Math.max(0, c.eyeOpen - 1) * 0.6;
      eye.root.scale.setScalar(s);
      void i;
    }
    for (const b of this.brows) {
      const side = b.userData.side as number;
      const base = b.userData.base as THREE.Vector3;
      b.position.y = base.y + c.browRaise * 0.012 + blinkAmt * -0.002;
      b.rotation.z = Math.PI / 2 + side * c.browAngle * 0.45 + (side > 0 ? c.asym * 0.1 : 0);
      b.position.x = base.x - side * Math.max(0, c.browAngle) * 0.004;
    }
    this.blushMat.opacity = Math.min(0.75, this.baseBlush * 0.35 + c.blush * 0.5);
    this.updateMouth();
  }
}
