import * as THREE from 'three';
import { canvas, tex } from '../world/mapKit';
import { clamp, damp } from '../core/math';

/**
 * Cars for the chase: a body that drives (throttle, brake, steering, a handbrake that lets the tail
 * out), kept on a road between its barriers, knocking into the other cars; and the shapes to draw
 * them - Viper's black saloon, the escorts' black SUVs, the refrigerated trucks, the night's
 * traffic.
 */
export type CarKind = 'saloon' | 'suv' | 'truck' | 'civic' | 'van';

export interface RoadPoint {
  x: number;
  z: number;
  /** Tangent (unit). */
  tx: number;
  tz: number;
  /** Distance along the road. */
  s: number;
}

/** The road as a polyline every few metres: where a point is along it and across it. */
export class Road {
  readonly pts: RoadPoint[];
  readonly length: number;
  constructor(pts: RoadPoint[], public half: number) {
    this.pts = pts;
    this.length = pts[pts.length - 1].s;
  }
  /** The road's point at distance s (and its tangent). */
  at(s: number): RoadPoint {
    const p = this.pts;
    s = clamp(s, 0, this.length);
    let lo = 0, hi = p.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (p[m].s <= s) lo = m;
      else hi = m;
    }
    const a = p[lo], b = p[hi];
    const k = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
    const tx = a.tx + (b.tx - a.tx) * k, tz = a.tz + (b.tz - a.tz) * k;
    const tl = Math.hypot(tx, tz) || 1;
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, tx: tx / tl, tz: tz / tl, s };
  }
  /** Point at s, `d` metres to the right of the centre line. */
  pos(s: number, d: number) {
    const p = this.at(s);
    // right of the travel direction (x east, z south, travelling along +t): (-tz, tx)... the road's right
    return { x: p.x - p.tz * d, z: p.z + p.tx * d, tx: p.tx, tz: p.tz };
  }
  /** Where (x, z) is: distance along, signed offset across (right +), from a hint index for speed. */
  project(x: number, z: number, hint = -1): { i: number; s: number; d: number; tx: number; tz: number } {
    const p = this.pts;
    let best = 0, bd = Infinity;
    const lo = hint >= 0 ? Math.max(0, hint - 12) : 0;
    const hi = hint >= 0 ? Math.min(p.length - 2, hint + 12) : p.length - 2;
    for (let i = lo; i <= hi; i++) {
      const a = p[i], b = p[i + 1];
      const ex = b.x - a.x, ez = b.z - a.z;
      const L2 = ex * ex + ez * ez || 1;
      const t = clamp(((x - a.x) * ex + (z - a.z) * ez) / L2, 0, 1);
      const qx = a.x + ex * t, qz = a.z + ez * t;
      const dd = (x - qx) ** 2 + (z - qz) ** 2;
      if (dd < bd) {
        bd = dd;
        best = i + t;
      }
    }
    const i = Math.floor(best), t = best - i;
    const a = p[i], b = p[Math.min(p.length - 1, i + 1)];
    const qx = a.x + (b.x - a.x) * t, qz = a.z + (b.z - a.z) * t;
    const tx = b.x - a.x, tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    const ux = tx / tl, uz = tz / tl;
    // right of travel: (-uz, ux)
    const d = (x - qx) * -uz + (z - qz) * ux;
    return { i, s: a.s + (b.s - a.s) * t, d, tx: ux, tz: uz };
  }
}

const SPEC: Record<CarKind, { len: number; wid: number; h: number; mass: number; vmax: number; accel: number; color: number }> = {
  saloon: { len: 4.7, wid: 1.9, h: 1.4, mass: 1.6, vmax: 47, accel: 11, color: 0x0c0c0e },
  suv: { len: 4.9, wid: 2.0, h: 1.8, mass: 2.4, vmax: 44, accel: 9, color: 0x0a0a0c },
  truck: { len: 12.5, wid: 2.5, h: 3.8, mass: 9, vmax: 32, accel: 5, color: 0xe8e8e4 },
  civic: { len: 4.3, wid: 1.8, h: 1.45, mass: 1.3, vmax: 34, accel: 6, color: 0x8a2a2a },
  van: { len: 5.2, wid: 2.0, h: 2.2, mass: 2.0, vmax: 30, accel: 5, color: 0xd8d8d0 },
};

export class Car {
  readonly kind: CarKind;
  readonly len: number;
  readonly wid: number;
  readonly mass: number;
  vmax: number;
  accel: number;
  x = 0;
  z = 0;
  yaw = 0;
  /** Forward speed (m/s) and sideways slip. */
  speed = 0;
  slip = 0;
  steer = 0;
  hp = 100;
  maxHp = 100;
  /** Out of it (wrecked): coasting to a stop, smoking. */
  dead = false;
  /** Its place on the road (for the AI and the barriers). */
  ri = -1;
  rs = 0;
  rd = 0;
  readonly group: THREE.Group;
  private wheels: THREE.Object3D[] = [];
  private brakeMat: THREE.MeshBasicMaterial;
  smoke = 0;
  /** Last frame's knocks (for sounds, sparks, the camera). */
  hitBarrier = 0;
  hitCar = 0;
  constructor(kind: CarKind, color?: number) {
    this.kind = kind;
    const sp = SPEC[kind];
    this.len = sp.len;
    this.wid = sp.wid;
    this.mass = sp.mass;
    this.vmax = sp.vmax;
    this.accel = sp.accel;
    const m = carModel(kind, color ?? sp.color);
    this.group = m.group;
    this.wheels = m.wheels;
    this.brakeMat = m.brake;
  }
  get fx() {
    return Math.sin(this.yaw);
  }
  get fz() {
    return Math.cos(this.yaw);
  }

  /** One step of driving: throttle -1..1 (negative brakes, then reverses), steer -1..1 (left +). */
  drive(dt: number, throttle: number, steerIn: number, handbrake: boolean) {
    if (this.dead) {
      throttle = 0;
      steerIn *= 0.3;
    }
    // the wheel turns at a rate, and less far at speed
    const sp = Math.abs(this.speed);
    const lock = 0.55 / (1 + sp * 0.045);
    this.steer = damp(this.steer, steerIn * lock, 7, dt);
    // engine, brakes, drag
    if (throttle > 0.01) {
      if (this.speed < -0.5) this.speed += 14 * throttle * dt;
      else this.speed += this.accel * throttle * (1 - clamp(this.speed / this.vmax, 0, 1)) * dt;
    } else if (throttle < -0.01) {
      if (this.speed > 0.5) this.speed -= 16 * -throttle * dt;
      else this.speed = Math.max(-9, this.speed - 5 * -throttle * dt);
    }
    // (rolling and air: at full throttle each kind settles near its top speed - her car about 38 m/s,
    // an SUV 35, a loaded truck 25 - and off the throttle a car coasts down gently)
    this.speed -= this.speed * (0.012 + Math.abs(this.speed) * 0.0011) * dt;
    if (handbrake) this.speed = damp(this.speed, 0, 0.5, dt);
    if (Math.abs(this.speed) < 0.05 && Math.abs(throttle) < 0.01) this.speed = 0;
    // turning: the bicycle's rate, then what the tyres will hold (past it, the tail slides)
    const wheelbase = this.len * 0.6;
    let yawRate = (this.speed * Math.tan(this.steer)) / wheelbase;
    const grip = handbrake ? 5 : 11;
    const latA = Math.abs(yawRate * this.speed);
    if (latA > grip) {
      const k = grip / latA;
      this.slip += -Math.sign(yawRate) * Math.sign(this.speed) * (latA - grip) * 0.14 * dt * (handbrake ? 3 : 1);
      yawRate *= k + (1 - k) * (handbrake ? 0.9 : 0.45);
    }
    this.yaw += yawRate * dt;
    this.slip *= Math.exp(-dt * (handbrake ? 1.2 : 4.5));
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    this.x += (this.fx * this.speed + rx * this.slip) * dt;
    this.z += (this.fz * this.speed + rz * this.slip) * dt;
    // the look: wheels spin and steer, the brake lights
    const spin = (this.speed * dt) / 0.34;
    this.wheels.forEach((w, i) => {
      w.rotation.x += spin;
      if (i < 2) w.parent!.rotation.y = this.steer;
    });
    this.brakeMat.color.setScalar(throttle < -0.05 || handbrake ? 1 : 0.35);
  }

  /** Between the barriers: off the road's edge, it scrapes back along it. */
  keepOnRoad(road: Road) {
    const r = road.project(this.x, this.z, this.ri);
    this.ri = r.i;
    this.rs = r.s;
    this.rd = r.d;
    this.hitBarrier = 0;
    const lim = road.half - this.wid / 2 - 0.15;
    if (Math.abs(r.d) > lim) {
      const side = Math.sign(r.d);
      const over = Math.abs(r.d) - lim;
      // push back across (the road's right is (-tz, tx))
      this.x -= -r.tz * side * over;
      this.z -= r.tx * side * over;
      // the velocity: the part into the barrier bounces off, the rest scrapes on
      const vx = this.fx * this.speed, vz = this.fz * this.speed;
      const nx = -r.tz * side, nz = r.tx * side;
      const vn = vx * nx + vz * nz;
      if (vn > 0) {
        const tvx = vx - nx * vn, tvz = vz - nz * vn;
        const tSpeed = Math.hypot(tvx, tvz) * 0.94;
        // the nose swings back along the barrier
        const along = Math.atan2(r.tx, r.tz);
        const back = this.speed >= 0 ? along : along + Math.PI;
        const diff = Math.atan2(Math.sin(back - this.yaw), Math.cos(back - this.yaw));
        this.yaw += diff * 0.35;
        this.speed = Math.sign(this.speed || 1) * tSpeed;
        this.slip = -side * Math.min(4, vn * 0.4);
        this.hitBarrier = vn;
        this.hp -= vn * vn * 0.08 + vn * 0.6;
      }
    }
  }

  /** Place the model where the car is. */
  sync(y = 0) {
    this.group.position.set(this.x, y, this.z);
    this.group.rotation.y = this.yaw;
    // a lean into the turn and onto the brakes
    this.group.rotation.z = clamp(-this.steer * this.speed * 0.012, -0.08, 0.08);
  }
}

/** Two cars touching: pushed apart, a share of the knock each by its weight; their damage. */
export function collideCars(a: Car, b: Car) {
  // three circles down each car's length
  const ra = a.wid * 0.55, rb = b.wid * 0.55;
  let hit = false;
  for (let i = -1; i <= 1; i++) {
    const ax = a.x + a.fx * i * (a.len / 2 - ra), az = a.z + a.fz * i * (a.len / 2 - ra);
    for (let j = -1; j <= 1; j++) {
      const bx = b.x + b.fx * j * (b.len / 2 - rb), bz = b.z + b.fz * j * (b.len / 2 - rb);
      const dx = bx - ax, dz = bz - az;
      const d = Math.hypot(dx, dz);
      if (d >= ra + rb || d < 1e-4) continue;
      const nx = dx / d, nz = dz / d;
      const over = ra + rb - d;
      const wa = b.mass / (a.mass + b.mass), wb = 1 - wa;
      a.x -= nx * over * wa;
      a.z -= nz * over * wa;
      b.x += nx * over * wb;
      b.z += nz * over * wb;
      // closing speed along the normal
      const vax = a.fx * a.speed + Math.cos(a.yaw) * a.slip, vaz = a.fz * a.speed - Math.sin(a.yaw) * a.slip;
      const vbx = b.fx * b.speed + Math.cos(b.yaw) * b.slip, vbz = b.fz * b.speed - Math.sin(b.yaw) * b.slip;
      const vn = (vax - vbx) * nx + (vaz - vbz) * nz;
      if (vn > 0) {
        const imp = vn * 1.25;
        // each loses (or gains) speed along its own heading; the sideways part becomes slip
        const ia = -imp * wa, ib = imp * wb;
        a.speed += ia * (nx * a.fx + nz * a.fz);
        a.slip += ia * (nx * Math.cos(a.yaw) - nz * Math.sin(a.yaw));
        b.speed += ib * (nx * b.fx + nz * b.fz);
        b.slip += ib * (nx * Math.cos(b.yaw) - nz * Math.sin(b.yaw));
        // a spin from an off-centre knock
        a.yaw += clamp(i * 0.02 * vn * wa, -0.15, 0.15);
        b.yaw -= clamp(j * 0.02 * vn * wb, -0.15, 0.15);
        const dmg = vn * vn * 0.12 + vn;
        a.hp -= dmg * wa * 1.4;
        b.hp -= dmg * wb * 1.4;
        a.hitCar = Math.max(a.hitCar, vn);
        b.hitCar = Math.max(b.hitCar, vn);
      }
      hit = true;
    }
  }
  return hit;
}

// ============================================================================ the models
function sideText(text: string, bg: string, fg: string) {
  const [c, x] = canvas(1024, 256);
  x.fillStyle = bg;
  x.fillRect(0, 0, 1024, 256);
  x.fillStyle = fg;
  x.font = 'bold 120px "Oswald", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 512, 120);
  x.font = '36px "Oswald", sans-serif';
  x.fillText('COLD CHAIN LOGISTICS · KX FREIGHT', 512, 210);
  return tex(c, true, false);
}

/** A car's shape: body, glasshouse, wheels (the front pair can steer), lamps. Faces +z. */
export function carModel(kind: CarKind, color: number) {
  const g = new THREE.Group();
  const sp = SPEC[kind];
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.32, envMapIntensity: 1.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a0e14, metalness: 0.4, roughness: 0.08, envMapIntensity: 1.6 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.85 });
  const rim = new THREE.MeshStandardMaterial({ color: 0x8a8a90, metalness: 0.8, roughness: 0.3 });
  const head = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
  const brake = new THREE.MeshBasicMaterial({ color: 0xff2010 });
  brake.color.setScalar(0.35);
  brake.color.r = 1;
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.castShadow = true;
    g.add(o);
    return o;
  };
  const L = sp.len, W = sp.wid;
  const wheelR = kind === 'truck' ? 0.5 : 0.34;
  const wheels: THREE.Object3D[] = [];
  const wheel = (x: number, z: number, steerable: boolean) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, wheelR, z);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, 0.26, 14).rotateZ(Math.PI / 2), tyre);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.6, wheelR * 0.6, 0.27, 10).rotateZ(Math.PI / 2), rim);
    const spinner = new THREE.Group();
    spinner.add(w, r);
    pivot.add(spinner);
    g.add(pivot);
    if (steerable) wheels.unshift(spinner);
    else wheels.push(spinner);
  };
  if (kind === 'truck') {
    // the cab, the reefer box behind it
    const cabZ = L / 2 - 1.3;
    box(W, 2.0, 2.4, new THREE.MeshStandardMaterial({ color: 0x1a2a4a, metalness: 0.5, roughness: 0.4 }), 0, 1.6, cabZ);
    box(W - 0.1, 0.9, 0.05, glass, 0, 2.1, cabZ + 1.21);
    const side = new THREE.MeshStandardMaterial({ map: sideText('NORDFROST', '#e8e8e4', '#1a3a6a'), roughness: 0.6 });
    const trailer = new THREE.Mesh(new THREE.BoxGeometry(W, 2.9, L - 2.8), [side, side, paint, paint, paint, paint]);
    trailer.position.set(0, 2.1, -1.3);
    trailer.castShadow = true;
    g.add(trailer);
    box(W - 0.2, 0.6, L - 2.6, new THREE.MeshStandardMaterial({ color: 0x1a1a1a }), 0, 0.55, -1.0);
    for (const z of [cabZ + 0.4, -L / 2 + 1.0, -L / 2 + 2.2]) for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) wheel(x, z, z === cabZ + 0.4);
    box(0.3, 0.2, 0.05, head, -W / 2 + 0.35, 1.0, L / 2 + 0.01);
    box(0.3, 0.2, 0.05, head, W / 2 - 0.35, 1.0, L / 2 + 0.01);
    box(0.25, 0.18, 0.05, brake, -W / 2 + 0.3, 1.0, -L / 2 - 0.01);
    box(0.25, 0.18, 0.05, brake, W / 2 - 0.3, 1.0, -L / 2 - 0.01);
  } else {
    const bodyH = kind === 'suv' || kind === 'van' ? 0.85 : 0.62;
    const roofH = kind === 'suv' || kind === 'van' ? 0.75 : 0.55;
    box(W, bodyH, L, paint, 0, 0.32 + bodyH / 2, 0);
    const cabL = kind === 'van' ? L * 0.75 : L * 0.5;
    const cabZ = kind === 'van' ? -L * 0.08 : -L * 0.06;
    box(W - 0.12, roofH, cabL, glass, 0, 0.32 + bodyH + roofH / 2, cabZ);
    box(W - 0.1, 0.06, cabL - 0.3, paint, 0, 0.32 + bodyH + roofH + 0.02, cabZ);
    for (const z of [L / 2 - 0.85, -L / 2 + 0.8]) for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) wheel(x, z, z > 0);
    box(0.4, 0.12, 0.05, head, -W / 2 + 0.35, 0.32 + bodyH * 0.65, L / 2 + 0.01);
    box(0.4, 0.12, 0.05, head, W / 2 - 0.35, 0.32 + bodyH * 0.65, L / 2 + 0.01);
    box(0.36, 0.1, 0.05, brake, -W / 2 + 0.3, 0.32 + bodyH * 0.7, -L / 2 - 0.01);
    box(0.36, 0.1, 0.05, brake, W / 2 - 0.3, 0.32 + bodyH * 0.7, -L / 2 - 0.01);
  }
  // the headlights' glow and the tail lights' (sprites: cheap, and they read at a distance)
  const glow = (c: number, s: number, x: number, y: number, z: number) => {
    const sp2 = new THREE.Sprite(new THREE.SpriteMaterial({ color: c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp2.scale.set(s, s, 1);
    sp2.position.set(x, y, z);
    g.add(sp2);
  };
  const ly = kind === 'truck' ? 1.0 : kind === 'suv' || kind === 'van' ? 0.88 : 0.72;
  for (const sx of [-1, 1]) {
    glow(0xfff2d8, 0.9, sx * (W / 2 - 0.35), ly, L / 2 + 0.2);
    glow(0xff2010, 0.5, sx * (W / 2 - 0.3), ly, -L / 2 - 0.15);
  }
  return { group: g, wheels, brake };
}
