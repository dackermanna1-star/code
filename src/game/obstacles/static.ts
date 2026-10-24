// Static obstacles: walls, crash barriers, poles, ramps, kickers, quarter
// pipes, the vertical loop, spike strips/walls, containers and barriers.

import * as THREE from 'three';
import { Obstacle, register, type ObstacleHost } from './base.ts';
import { Collider, CF_SPIKES, CF_SHARP } from '../../sim/colliders.ts';
import { Surface } from '../../sim/surfaces.ts';
import { MAT, texBox, mesh, wedgeGeometry, signTexture } from './assets.ts';

// ---------------------------------------------------------------------------

export class ConcreteWall extends Obstacle {
  readonly type = 'wall';
  build(): void {
    const { w, h, t } = this.params;
    this.staticBox(0, h / 2, 0, w / 2, h / 2, t / 2, { surface: Surface.CONCRETE, friction: 0.7, tag: 'concrete' });
    this.group.add(mesh(texBox(w, h, t, 2), MAT.concrete(), 0, h / 2, 0));
    const band = mesh(texBox(w + 0.02, 0.25, t + 0.02, 1), MAT.hazard(), 0, h - 0.125, 0);
    band.castShadow = false;
    this.group.add(band);
  }
}
register({
  id: 'wall',
  name: 'Concrete Wall',
  category: 'Barriers',
  description: 'Immovable reinforced concrete wall.',
  params: [
    { key: 'w', label: 'Width', min: 1, max: 40, step: 0.5, def: 8, unit: 'm' },
    { key: 'h', label: 'Height', min: 0.4, max: 8, step: 0.1, def: 2.5, unit: 'm' },
    { key: 't', label: 'Thickness', min: 0.3, max: 4, step: 0.1, def: 1, unit: 'm' },
  ],
  create: (h, x, z, yaw, p) => new ConcreteWall(h, x, z, yaw, p),
});

// ---------------------------------------------------------------------------

export class CrashBarrier extends Obstacle {
  readonly type = 'crashBarrier';
  build(): void {
    const { w, h, offset } = this.params;
    const t = 2.4;
    const cx = offset * w * 0.5;
    this.staticBox(cx, h / 2, 0, w / 2, h / 2, t / 2, { surface: Surface.CONCRETE, friction: 0.7, tag: 'concrete' });
    this.group.add(mesh(texBox(w, h, t, 2), MAT.concrete(), cx, h / 2, 0));
    // crash target face (faces -Z, toward approaching cars)
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, h * 0.9), MAT.checker());
    (face.material as THREE.MeshStandardMaterial).map!.repeat.set(w / 1.2, h / 1.2);
    face.position.set(cx, h / 2, -t / 2 - 0.01);
    face.rotation.y = Math.PI;
    this.group.add(face);
    // steel load plate
    const plate = mesh(new THREE.BoxGeometry(w * 0.9, h * 0.75, 0.06), MAT.plate(), cx, h / 2, -t / 2 - 0.04);
    this.group.add(plate);
    for (const sx of [-w / 2, w / 2]) {
      const post = mesh(texBox(0.3, h + 0.4, t + 0.3, 1), MAT.hazard(), cx + sx, (h + 0.4) / 2, 0);
      this.group.add(post);
    }
  }
}
register({
  id: 'crashBarrier',
  name: 'Crash Test Barrier',
  category: 'Barriers',
  description: 'Rigid instrumented barrier used for frontal impact tests. Offset shifts it for overlap tests.',
  params: [
    { key: 'w', label: 'Width', min: 1, max: 12, step: 0.5, def: 5, unit: 'm' },
    { key: 'h', label: 'Height', min: 0.8, max: 4, step: 0.1, def: 2, unit: 'm' },
    { key: 'offset', label: 'Offset', min: -1, max: 1, step: 0.05, def: 0 },
  ],
  create: (h, x, z, yaw, p) => new CrashBarrier(h, x, z, yaw, p),
});

// ---------------------------------------------------------------------------

export class Pole extends Obstacle {
  readonly type = 'pole';
  build(): void {
    const { r, h } = this.params;
    this.staticCollider(Collider.capsule(r, h / 2), 0, h / 2, 0, { surface: Surface.METAL, friction: 0.5, tag: 'metal' });
    const p = mesh(new THREE.CylinderGeometry(r, r * 1.05, h, 20), MAT.steel(), 0, h / 2, 0);
    this.group.add(p);
    const base = mesh(new THREE.CylinderGeometry(r * 2.2, r * 2.4, 0.25, 20), MAT.concreteDark(), 0, 0.12, 0);
    this.group.add(base);
    const band = mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.6, 20), MAT.hazard(), 0, 1.0, 0, false);
    this.group.add(band);
    if (h > 5) {
      const arm = mesh(new THREE.BoxGeometry(0.12, 0.12, 2.2), MAT.darkSteel(), 0, h - 0.2, 1.0);
      this.group.add(arm);
      const lamp = mesh(new THREE.BoxGeometry(0.4, 0.15, 0.7), MAT.glow(0xfff2d0), 0, h - 0.32, 2.0, false);
      this.group.add(lamp);
    }
  }
}
register({
  id: 'pole',
  name: 'Steel Pole',
  category: 'Barriers',
  description: 'Rigid steel pole for side and frontal pole impact tests.',
  params: [
    { key: 'r', label: 'Radius', min: 0.08, max: 1, step: 0.02, def: 0.17, unit: 'm' },
    { key: 'h', label: 'Height', min: 1, max: 12, step: 0.5, def: 7, unit: 'm' },
  ],
  create: (h, x, z, yaw, p) => new Pole(h, x, z, yaw, p),
});

// ---------------------------------------------------------------------------

export class Ramp extends Obstacle {
  readonly type = 'ramp';
  build(): void {
    const { w, l, h } = this.params;
    const c = Collider.wedge(w, l, h);
    this.staticCollider(c, 0, 0, -l / 2, { surface: Surface.METAL, friction: 0.8, tag: 'metal' });
    const g = wedgeGeometry(w, l, h);
    const ramp = mesh(g, MAT.plate(), 0, 0, -l / 2);
    this.group.add(ramp);
    // hazard edge on the lip
    const lip = mesh(new THREE.BoxGeometry(w, 0.06, 0.25), MAT.hazard(), 0, h + 0.01, l / 2 - 0.12, false);
    this.group.add(lip);
    // side rails
    for (const s of [-1, 1]) {
      const rail = mesh(new THREE.BoxGeometry(0.08, 0.08, Math.hypot(l, h)), MAT.yellowSteel(), s * (w / 2 - 0.04), h / 2 + 0.05, 0, false);
      rail.rotation.x = -Math.atan2(h, l);
      this.group.add(rail);
    }
  }
}
register({
  id: 'ramp',
  name: 'Jump Ramp',
  category: 'Ramps & Stunts',
  description: 'Straight steel launch ramp.',
  params: [
    { key: 'w', label: 'Width', min: 2, max: 20, step: 0.5, def: 5, unit: 'm' },
    { key: 'l', label: 'Length', min: 2, max: 40, step: 0.5, def: 10, unit: 'm' },
    { key: 'h', label: 'Height', min: 0.2, max: 15, step: 0.1, def: 2.2, unit: 'm' },
  ],
  create: (h, x, z, yaw, p) => new Ramp(h, x, z, yaw, p),
});

// ---------------------------------------------------------------------------
// Arc tracks (kickers, quarter pipes, loops)

interface ArcOpts {
  R: number;
  w: number;
  a0: number;
  a1: number;
  seg: number;
  thick: number;
  shift?: (a: number) => number;
  z0?: number;
}

function arcColliders(o: Obstacle, opts: ArcOpts, add: (c: Collider, x: number, y: number, z: number, pitch: number) => void): void {
  const { R, w, a0, a1, seg, thick } = opts;
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + ((a1 - a0) * i) / seg, t1 = a0 + ((a1 - a0) * (i + 1)) / seg;
    const tm = (t0 + t1) / 2;
    const len = (R + thick) * (t1 - t0) * 1.12;
    const sx = opts.shift ? opts.shift(tm) : 0;
    // surface point and inward normal
    const px = sx, py = R - R * Math.cos(tm), pz = R * Math.sin(tm) + (opts.z0 ?? 0);
    const nx = 0, ny = Math.cos(tm), nz = -Math.sin(tm);
    const c = Collider.box(w / 2, thick / 2, len / 2);
    add(c, px - nx * thick / 2, py - ny * thick / 2, pz - nz * thick / 2, -tm);
  }
  void o;
}

function arcMesh(opts: ArcOpts, steps: number): THREE.BufferGeometry {
  const { R, w, a0, a1, thick } = opts;
  const pos: number[] = [], uv: number[] = [];
  const idx: number[] = [];
  // profile corners (lateral x, depth d) going around: top surface (d=0) then bottom (d=thick)
  const prof: [number, number][] = [[-w / 2, 0], [w / 2, 0], [w / 2, thick], [-w / 2, thick]];
  const ring = prof.length;
  for (let k = 0; k <= steps; k++) {
    const a = a0 + ((a1 - a0) * k) / steps;
    const sx = opts.shift ? opts.shift(a) : 0;
    const py = R - R * Math.cos(a), pz = R * Math.sin(a) + (opts.z0 ?? 0);
    const ny = Math.cos(a), nz = -Math.sin(a);
    for (const [lx, d] of prof) {
      pos.push(sx + lx, py - ny * d, pz - nz * d);
      uv.push(lx / 2, (R * a) / 2);
    }
  }
  for (let k = 0; k < steps; k++) {
    for (let e = 0; e < ring; e++) {
      const a = k * ring + e, b = k * ring + ((e + 1) % ring);
      const c = a + ring, d = b + ring;
      idx.push(a, b, d, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class CurvedRamp extends Obstacle {
  readonly type: string = 'kicker';
  build(): void {
    const { R, w, angle } = this.params;
    const a1 = (angle * Math.PI) / 180;
    const thick = 0.5;
    const opts: ArcOpts = { R, w, a0: 0, a1, seg: Math.max(4, Math.ceil(angle / 6)), thick, z0: -R * Math.sin(a1) / 2 };
    arcColliders(this, opts, (c, x, y, z, pitch) => this.staticCollider(c, x, y, z, { pitch, surface: Surface.METAL, friction: 0.85, tag: 'metal' }));
    const g = arcMesh(opts, Math.max(8, Math.ceil(angle / 2)));
    const m = mesh(g, MAT.plate());
    this.group.add(m);
    // support structure under the curve
    const top = R - R * Math.cos(a1);
    const zEnd = R * Math.sin(a1) + opts.z0!;
    if (top > 0.6) {
      for (const s of [-1, 1]) {
        const leg = mesh(new THREE.BoxGeometry(0.2, top, 0.2), MAT.yellowSteel(), s * (w / 2 - 0.2), top / 2, zEnd - 0.3);
        this.group.add(leg);
      }
      const back = mesh(texBox(w, top, 0.15, 2), MAT.darkSteel(), 0, top / 2, zEnd);
      this.group.add(back);
    }
  }
}
register({
  id: 'kicker',
  name: 'Kicker',
  category: 'Ramps & Stunts',
  description: 'Curved launch kicker that throws cars into the air.',
  params: [
    { key: 'R', label: 'Radius', min: 2, max: 20, step: 0.5, def: 6, unit: 'm' },
    { key: 'w', label: 'Width', min: 2, max: 20, step: 0.5, def: 5, unit: 'm' },
    { key: 'angle', label: 'Lip angle', min: 10, max: 75, step: 1, def: 32, unit: '°' },
  ],
  create: (h, x, z, yaw, p) => new CurvedRamp(h, x, z, yaw, p),
});

export class QuarterPipe extends CurvedRamp {
  override readonly type = 'quarterPipe';
}
register({
  id: 'quarterPipe',
  name: 'Quarter Pipe',
  category: 'Ramps & Stunts',
  description: 'Curved wall ride that ends vertical.',
  params: [
    { key: 'R', label: 'Radius', min: 2, max: 20, step: 0.5, def: 7, unit: 'm' },
    { key: 'w', label: 'Width', min: 2, max: 30, step: 0.5, def: 10, unit: 'm' },
    { key: 'angle', label: 'Lip angle', min: 45, max: 95, step: 1, def: 88, unit: '°' },
  ],
  create: (h, x, z, yaw, p) => new QuarterPipe(h, x, z, yaw, p),
});

export class Loop extends Obstacle {
  readonly type = 'loop';
  build(): void {
    const { R, w } = this.params;
    const thick = 0.6;
    const shift = w + 0.6;
    const opts: ArcOpts = { R, w, a0: 0, a1: Math.PI * 2, seg: 64, thick, shift: (a) => (a / (Math.PI * 2)) * shift - shift / 2 };
    arcColliders(this, opts, (c, x, y, z, pitch) => this.staticCollider(c, x, y, z, { pitch, surface: Surface.METAL, friction: 0.9, tag: 'metal' }));
    const m = mesh(arcMesh(opts, 160), MAT.plate());
    this.group.add(m);
    // side rails as visual guides
    for (const side of [-1, 1]) {
      const rail = arcMesh({ ...opts, w: 0.12, thick: 0.25, shift: (a) => opts.shift!(a) + side * (w / 2 + 0.06) }, 160);
      const rm = mesh(rail, MAT.yellowSteel());
      rm.position.y = 0;
      this.group.add(rm);
    }
    // support towers
    for (const z of [-R * 0.7, R * 0.7]) {
      for (const s of [-1, 1]) {
        const tower = mesh(new THREE.BoxGeometry(0.5, R * 2 + 1, 0.5), MAT.darkSteel(), s * (shift / 2 + w / 2 + 1.2), R + 0.5, z);
        this.group.add(tower);
      }
    }
    const top = mesh(new THREE.BoxGeometry(shift + w + 3, 0.5, 0.5), MAT.darkSteel(), 0, R * 2 + 1, 0);
    this.group.add(top);
    // speed hint
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshStandardMaterial({ map: signTexture('LOOP', `min ${Math.ceil(Math.sqrt(5.2 * 9.81 * R) * 3.6)} km/h`, '#1d2733', '#fff', '#ff6ad5'), roughness: 0.6 }));
    sign.position.set(-shift / 2 - w / 2 - 3, 3, -R - 6);
    sign.rotation.y = Math.PI;
    this.group.add(sign);
  }
}
register({
  id: 'loop',
  name: 'Vertical Loop',
  category: 'Ramps & Stunts',
  description: 'Full 360° loop. Needs serious speed to stay on the track.',
  params: [
    { key: 'R', label: 'Radius', min: 4, max: 16, step: 0.5, def: 8, unit: 'm' },
    { key: 'w', label: 'Track width', min: 3, max: 10, step: 0.5, def: 5, unit: 'm' },
  ],
  create: (h, x, z, yaw, p) => new Loop(h, x, z, yaw, p),
});

// ---------------------------------------------------------------------------

export class SpikeStrip extends Obstacle {
  readonly type = 'spikeStrip';
  build(): void {
    const { l } = this.params;
    this.staticBox(0, 0.025, 0, l / 2, 0.03, 0.22, { flags: CF_SPIKES, surface: Surface.METAL, friction: 0.6, tag: 'spikes' });
    this.group.add(mesh(new THREE.BoxGeometry(l, 0.04, 0.42), MAT.darkSteel(), 0, 0.02, 0));
    const n = Math.floor(l / 0.12);
    const cone = new THREE.ConeGeometry(0.018, 0.09, 5);
    const inst = new THREE.InstancedMesh(cone, MAT.spike(), n * 3);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < n; i++) {
      for (let r = 0; r < 3; r++) {
        m4.makeTranslation(-l / 2 + (i + 0.5) * 0.12 + (r % 2) * 0.04, 0.085, -0.13 + r * 0.13);
        inst.setMatrixAt(k++, m4);
      }
    }
    inst.castShadow = true;
    this.group.add(inst);
  }
}
register({
  id: 'spikeStrip',
  name: 'Spike Strip',
  category: 'Hazards',
  description: 'Police stinger. Punctures any tire that rolls over it.',
  params: [{ key: 'l', label: 'Length', min: 1, max: 20, step: 0.5, def: 6, unit: 'm' }],
  create: (h, x, z, yaw, p) => new SpikeStrip(h, x, z, yaw, p),
});

export class SpikeWall extends Obstacle {
  readonly type = 'spikeWall';
  build(): void {
    const { w, h, len } = this.params;
    const t = 0.8;
    // wall body behind the spikes (spikes point toward -Z)
    this.staticBox(0, h / 2, t / 2, w / 2, h / 2, t / 2, { surface: Surface.CONCRETE, tag: 'concrete' });
    this.group.add(mesh(texBox(w, h, t, 2), MAT.rust(), 0, h / 2, t / 2));
    const spacing = 0.55;
    const nx = Math.max(1, Math.floor(w / spacing)), ny = Math.max(1, Math.floor((h - 0.2) / spacing));
    const cone = new THREE.ConeGeometry(0.07, len, 8);
    cone.rotateX(-Math.PI / 2);
    const inst = new THREE.InstancedMesh(cone, MAT.spike(), nx * ny);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const x = -w / 2 + (i + 0.5) * (w / nx) + (j % 2 ? spacing * 0.25 : -spacing * 0.25);
        const y = 0.35 + j * spacing;
        m4.makeTranslation(x, y, -len / 2);
        inst.setMatrixAt(k++, m4);
        // spike collider: thin capsule along Z (rotate Y-axis capsule to Z)
        this.staticCollider(Collider.capsule(0.045, len / 2 - 0.045), x, y, -len / 2 + 0.02, { pitch: Math.PI / 2, flags: CF_SHARP | CF_SPIKES, surface: Surface.METAL, harshness: 2.5, tag: 'spikes' });
      }
    }
    inst.castShadow = true;
    this.group.add(inst);
  }
}
register({
  id: 'spikeWall',
  name: 'Spike Wall',
  category: 'Hazards',
  description: 'Rusted wall bristling with steel spikes that pierce panels.',
  params: [
    { key: 'w', label: 'Width', min: 1, max: 20, step: 0.5, def: 6, unit: 'm' },
    { key: 'h', label: 'Height', min: 0.8, max: 5, step: 0.1, def: 2, unit: 'm' },
    { key: 'len', label: 'Spike length', min: 0.2, max: 1.5, step: 0.05, def: 0.7, unit: 'm' },
  ],
  create: (h, x, z, yaw, p) => new SpikeWall(h, x, z, yaw, p),
});

// ---------------------------------------------------------------------------

export class Container extends Obstacle {
  readonly type = 'container';
  build(): void {
    const { stack } = this.params;
    const colors = ['#b3261e', '#1e5aa8', '#2e7d32', '#e0a414', '#6d4c41'];
    for (let i = 0; i < stack; i++) {
      const y = 1.3 + i * 2.6;
      this.staticBox(0, y, 0, 1.22, 1.3, 3.05, { surface: Surface.METAL, tag: 'metal' });
      const mtl = MAT.corrugated(colors[(Math.abs(this.id * 7 + i * 3)) % colors.length]);
      this.group.add(mesh(texBox(2.44, 2.6, 6.1, 1.2), mtl, 0, y, 0));
    }
  }
}
register({
  id: 'container',
  name: 'Shipping Containers',
  category: 'Barriers',
  description: 'Stack of 20 ft steel shipping containers.',
  params: [{ key: 'stack', label: 'Stack height', min: 1, max: 4, step: 1, def: 1 }],
  create: (h, x, z, yaw, p) => new Container(h, x, z, yaw, p),
});

export class JerseyRow extends Obstacle {
  readonly type = 'jersey';
  build(): void {
    const { n } = this.params;
    const len = 3;
    const shape = new THREE.Shape();
    shape.moveTo(-0.3, 0);
    shape.lineTo(0.3, 0);
    shape.lineTo(0.22, 0.25);
    shape.lineTo(0.1, 0.8);
    shape.lineTo(-0.1, 0.8);
    shape.lineTo(-0.22, 0.25);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: len - 0.05, bevelEnabled: false });
    geo.translate(0, 0, -(len - 0.05) / 2);
    for (let i = 0; i < n; i++) {
      const z = (i - (n - 1) / 2) * len;
      this.staticBox(0, 0.4, z, 0.26, 0.4, len / 2, { surface: Surface.CONCRETE, tag: 'concrete' });
      const me = mesh(geo, i % 2 ? MAT.white() : MAT.red(), 0, 0, z);
      me.userData.sharedGeo = i > 0;
      this.group.add(me);
    }
  }
}
register({
  id: 'jersey',
  name: 'Jersey Barriers',
  category: 'Barriers',
  description: 'Row of fixed concrete road barriers.',
  params: [{ key: 'n', label: 'Segments', min: 1, max: 20, step: 1, def: 5 }],
  create: (h, x, z, yaw, p) => new JerseyRow(h, x, z, yaw, p),
});

export class TireWall extends Obstacle {
  readonly type = 'tireWall';
  build(): void {
    const { w, rows } = this.params;
    const h = rows * 0.25;
    this.staticBox(0, h / 2, 0, w / 2, h / 2, 0.4, { surface: Surface.RUBBER, friction: 1.0, restitution: 0.25, tag: 'rubber' });
    const torus = new THREE.TorusGeometry(0.28, 0.12, 8, 16);
    torus.rotateX(Math.PI / 2);
    const nx = Math.floor(w / 0.62);
    const inst = new THREE.InstancedMesh(torus, MAT.rubber(), nx * rows * 2);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < nx; i++) {
        for (let d = 0; d < 2; d++) {
          m4.makeTranslation(-w / 2 + 0.31 + i * 0.62 + (r % 2) * 0.1, 0.12 + r * 0.25, -0.2 + d * 0.4);
          inst.setMatrixAt(k++, m4);
        }
      }
    }
    inst.castShadow = true;
    inst.receiveShadow = true;
    this.group.add(inst);
  }
}
register({
  id: 'tireWall',
  name: 'Tire Wall',
  category: 'Barriers',
  description: 'Stacked tires: bouncier and softer than concrete.',
  params: [
    { key: 'w', label: 'Width', min: 1, max: 20, step: 0.5, def: 6, unit: 'm' },
    { key: 'rows', label: 'Rows', min: 2, max: 10, step: 1, def: 4 },
  ],
  create: (h, x, z, yaw, p) => new TireWall(h, x, z, yaw, p),
});

export class Platform extends Obstacle {
  readonly type = 'platform';
  build(): void {
    const { w, l, h, rampL } = this.params;
    // raised deck with a ramp up at -Z and a drop at +Z
    this.staticBox(0, h / 2, 0, w / 2, h / 2, l / 2, { surface: Surface.CONCRETE, tag: 'concrete' });
    this.group.add(mesh(texBox(w, h, l, 2), MAT.concrete(), 0, h / 2, 0));
    if (rampL > 0.5) {
      const c = Collider.wedge(w, rampL, h);
      this.staticCollider(c, 0, 0, -l / 2 - rampL, { surface: Surface.CONCRETE, tag: 'concrete' });
      this.group.add(mesh(wedgeGeometry(w, rampL, h), MAT.concrete(), 0, 0, -l / 2 - rampL));
    }
    const edge = mesh(new THREE.BoxGeometry(w, 0.05, 0.3), MAT.hazard(), 0, h + 0.03, l / 2 - 0.15, false);
    this.group.add(edge);
  }
}
register({
  id: 'platform',
  name: 'Drop Platform',
  category: 'Ramps & Stunts',
  description: 'Raised deck with an access ramp and a sheer drop off the end.',
  params: [
    { key: 'w', label: 'Width', min: 3, max: 20, step: 0.5, def: 6, unit: 'm' },
    { key: 'l', label: 'Deck length', min: 2, max: 40, step: 0.5, def: 10, unit: 'm' },
    { key: 'h', label: 'Height', min: 0.5, max: 25, step: 0.5, def: 5, unit: 'm' },
    { key: 'rampL', label: 'Ramp length', min: 0, max: 60, step: 0.5, def: 22, unit: 'm' },
  ],
  create: (h, x, z, yaw, p) => new Platform(h, x, z, yaw, p),
});

export type { ObstacleHost };
