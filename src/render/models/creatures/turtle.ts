// Giant tortoise: dark slate domed shell with a light plate (scute) pattern and
// a pale rim; green head and stubby legs. Hides in its shell when hurt.
//
// Bones: shell (ragdoll root) > neck > head > eyes / jaw
//        shell > legFL/FR/RL/RR, shell > tail
import * as THREE from 'three';
import { cone } from '../kit';
import { RigBuilder, animator, blinker, blob, clamp, easeOut, footPath, loft, shade, smooth, snoise, wobble, TAU } from './common';
import type { AnimInput, CreatureRig } from '../types';

// Dome: upper half ellipsoid.
const DOME_C = new THREE.Vector3(-0.15, 0.46, 0);
const DOME_R = new THREE.Vector3(1.45, 1.36, 1.04);
const SHELL_PIVOT = new THREE.Vector3(-0.15, 0.9, 0);
const SLATE = 0x3a3f45;
const SEAM = 0x979b98;
const RIM = 0xd8d2b4;
const GREEN = 0x2f6a29;
const GREEN_D = 0x1d4419;
const GREEN_L = 0x5a9142;

/** Point on the dome for top-view unit-disk coordinates (x forward, z side). */
function domePoint(x: number, z: number, lift = 0): { p: THREE.Vector3; n: THREE.Vector3 } {
  const r2 = Math.min(0.9999, x * x + z * z);
  const y = Math.sqrt(1 - r2);
  const p = new THREE.Vector3(x * DOME_R.x, y * DOME_R.y, z * DOME_R.z).add(DOME_C);
  const n = new THREE.Vector3(x / DOME_R.x, y / DOME_R.y, z / DOME_R.z).normalize();
  p.addScaledVector(n, lift);
  return { p, n };
}

/** Raised ribbon following a top-view polyline on the dome. */
function seam(pts: Array<[number, number]>, width: number, out: number[][]): void {
  // densify
  const d: Array<[number, number]> = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.035));
    for (let k = 0; k < n; k++) d.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  d.push(pts[pts.length - 1]);
  const P = d.map(([x, z]) => domePoint(x, z, 0.012));
  const pos: number[] = [];
  const nor: number[] = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)].p;
    const b = P[Math.min(P.length - 1, i + 1)].p;
    const t = b.clone().sub(a).normalize();
    const s = new THREE.Vector3().crossVectors(t, P[i].n).normalize().multiplyScalar(width / 2);
    const l = P[i].p.clone().sub(s);
    const r = P[i].p.clone().add(s);
    pos.push(l.x, l.y, l.z, r.x, r.y, r.z);
    nor.push(P[i].n.x, P[i].n.y, P[i].n.z, P[i].n.x, P[i].n.y, P[i].n.z);
  }
  out.push(pos, nor);
}

function seamGeometry(lines: Array<Array<[number, number]>>, width: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (const ln of lines) {
    const buf: number[][] = [];
    seam(ln, width, buf);
    const base = pos.length / 3;
    const n = buf[0].length / 6;
    pos.push(...buf[0]);
    nor.push(...buf[1]);
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2;
      const b = a + 1;
      const c = a + 3;
      const dd = a + 2;
      idx.push(a, b, c, a, c, dd);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** Scute pattern in top-view unit-disk coordinates. */
function scuteLines(): Array<Array<[number, number]>> {
  const L: Array<Array<[number, number]>> = [];
  const xc = [-0.6, -0.3, 0, 0.3, 0.6];
  const xb = [-0.78, -0.45, -0.15, 0.15, 0.45, 0.78];
  const RM = 0.93; // marginal ring radius
  for (const s of [-1, 1]) {
    // vertebral column sides (hexagonal zig-zag)
    const side: Array<[number, number]> = [];
    for (let i = 0; i < xb.length; i++) {
      side.push([xb[i], s * 0.19]);
      if (i < xc.length) side.push([xc[i], s * 0.27]);
    }
    L.push(side);
    // costal seams from the vertebral vertices out to the marginal ring
    for (const x of [-0.3, 0, 0.3]) {
      const ang = Math.atan2(s * 0.75, x * 1.6);
      L.push([
        [x, s * 0.27],
        [x * 1.25, s * 0.55],
        [Math.cos(ang) * RM, Math.sin(ang) * RM],
      ]);
    }
    // marginal radial seams
    for (let k = 0; k <= 12; k++) {
      const a = (k / 12) * Math.PI;
      const ang = s > 0 ? a : -a;
      if (k === 0 || k === 12) continue;
      L.push([
        [Math.cos(ang) * RM, Math.sin(ang) * RM],
        [Math.cos(ang) * 0.997, Math.sin(ang) * 0.997],
      ]);
    }
  }
  // vertebral transverse seams
  for (const x of xb) L.push([[x, -0.19], [x, 0.19]]);
  // vertebral ends to the marginal ring
  L.push([[0.78, -0.19], [RM * 0.985, -0.17]]);
  L.push([[0.78, 0.19], [RM * 0.985, 0.17]]);
  L.push([[-0.78, -0.19], [-RM * 0.985, -0.17]]);
  L.push([[-0.78, 0.19], [-RM * 0.985, 0.17]]);
  // marginal ring
  const ring: Array<[number, number]> = [];
  for (let k = 0; k <= 64; k++) {
    const a = (k / 64) * TAU;
    ring.push([Math.cos(a) * RM, Math.sin(a) * RM]);
  }
  L.push(ring);
  return L;
}

export function createTurtle(): CreatureRig {
  const rb = new RigBuilder('turtle');
  const shell = rb.bone('shell', null, SHELL_PIVOT.toArray() as [number, number, number]);
  const off = SHELL_PIVOT.clone().negate();

  rb.part(shell, (pb) => {
    // dome
    const dome = new THREE.SphereGeometry(1, 48, 18, 0, TAU, 0, Math.PI / 2);
    dome.scale(DOME_R.x, DOME_R.y, DOME_R.z);
    dome.translate(DOME_C.x + off.x, DOME_C.y + off.y, DOME_C.z);
    const top = new THREE.Color(0x4d535a);
    const base = new THREE.Color(SLATE);
    const low = new THREE.Color(0x2b2f34);
    pb.addShaded(
      dome,
      (p) => {
        const h = (p.y - off.y - DOME_C.y) / DOME_R.y;
        const c = base.clone().lerp(top, smooth(h * 1.4 - 0.3)).lerp(low, smooth((0.3 - h) * 3));
        const k = 1 + snoise(p.x * 4.3, p.y * 4.3, p.z * 4.3) * 0.12 + snoise(p.x * 13, p.y * 13, p.z * 13) * 0.05;
        return c.multiplyScalar(k);
      },
      'shell',
    );
    // seams
    const seams = seamGeometry(scuteLines(), 0.045);
    seams.translate(off.x, off.y, 0);
    pb.addShaded(seams, (p) => new THREE.Color(SEAM).multiplyScalar(1 + snoise(p.x * 9, p.y * 9, p.z * 9) * 0.06), 'shell');
    // pale rim (lathe, flared lip around the dome base)
    const rim = new THREE.LatheGeometry(
      [
        [0.9, -0.14],
        [0.99, -0.12],
        [1.035, -0.05],
        [1.045, 0.02],
        [1.0, 0.08],
        [0.97, 0.1],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      40,
    );
    rim.scale(DOME_R.x, 1, DOME_R.z);
    rim.translate(DOME_C.x + off.x, DOME_C.y + off.y, 0);
    pb.addShaded(rim, shade(0xe6e0c4, 0xa8a283, { mid: RIM, bias: -0.1, noise: 0.06, freq: 8 }), 'shell');
    // plastron underneath
    pb.addShaded(blob(1.33, 0.12, 0.93, 20, 6).translate(DOME_C.x + off.x, DOME_C.y + off.y - 0.13, 0), shade(0xc8c2a4, 0x8d886f, { noise: 0.05 }), 'shell');
  });

  // ---- neck + head
  const neckFn = shade(GREEN_L, GREEN_D, { mid: GREEN, bias: -0.15, sharp: 1.3, noise: 0.14, freq: 26 });
  const neck = rb.bone('neck', shell, [1.02 - SHELL_PIVOT.x, 0.62 - SHELL_PIVOT.y, 0]);
  rb.part(neck, (pb) => {
    pb.addShaded(
      loft(
        [
          { x: -0.3, y: -0.04, w: 0.22, h: 0.2 },
          { x: 0.0, y: 0.0, w: 0.21, h: 0.19 },
          { x: 0.22, y: 0.07, w: 0.18, h: 0.17 },
          { x: 0.36, y: 0.13, w: 0.16, h: 0.15 },
        ],
        { radial: 12, sub: 2, bump: 0.08, bumpFreq: 30 },
      ),
      neckFn,
      'skin',
    );
  });
  const head = rb.bone('head', neck, [0.36, 0.13, 0]);
  const headFn = shade(0x3d7a32, GREEN_L, { mid: GREEN, bias: -0.1, sharp: 1.2, noise: 0.08, freq: 18 });
  rb.part(head, (pb) => {
    pb.addShaded(blob(0.27, 0.22, 0.2, 16, 12, 0.02, 14), headFn, 'skin', { p: [0.16, 0.04, 0] });
    pb.addShaded(blob(0.13, 0.12, 0.15, 10, 8), headFn, 'skin', { p: [0.36, 0.0, 0] });
    // mouth line + nostrils
    pb.add(blob(0.15, 0.012, 0.13, 10, 4), 0x16300f, 'skin', { p: [0.33, -0.05, 0], r: [0, 0, -0.08] });
    for (const s of [-1, 1]) pb.add(new THREE.SphereGeometry(0.013, 5, 4), 0x0d1a0a, 'skin', { p: [0.48, 0.04, s * 0.04] });
  });
  const eyes = rb.bone('eyes', head, [0.3, 0.1, 0]);
  rb.part(eyes, (pb) => {
    for (const s of [-1, 1]) {
      pb.add(new THREE.SphereGeometry(0.042, 10, 7), 0x070707, 'eye', { p: [0, 0, s * 0.13] });
      pb.add(new THREE.SphereGeometry(0.011, 4, 3), 0xffffff, 'eye', { p: [0.02, 0.02, s * 0.165] });
      // heavy brow
      pb.add(blob(0.06, 0.025, 0.04, 8, 5), GREEN_D, 'skin', { p: [0.0, 0.04, s * 0.13], r: [0, 0, -0.2] });
    }
  });

  // ---- legs
  const legFn = shade(GREEN_L, GREEN_D, { mid: GREEN, bias: -0.1, noise: 0.18, freq: 34 });
  const legPos: Array<[string, number, number]> = [
    ['legFL', 0.9, 1],
    ['legFR', 0.9, -1],
    ['legRL', -1.12, 1],
    ['legRR', -1.12, -1],
  ];
  const legs: THREE.Object3D[] = [];
  for (const [name, x, s] of legPos) {
    const front = x > 0;
    const lg = rb.bone(name, shell, [x - SHELL_PIVOT.x, 0.44 - SHELL_PIVOT.y, s * (front ? 0.5 : 0.52)]);
    rb.part(lg, (pb) => {
      pb.addShaded(
        loft(
          [
            { x: 0, y: 0.12, w: 0.2, h: 0.21 },
            { x: front ? 0.04 : -0.02, y: -0.16, w: 0.2, h: 0.21 },
            { x: front ? 0.06 : -0.02, y: -0.36, w: 0.19, h: 0.2 },
          ],
          { radial: 12, sub: 2, cap0: 0.06, bump: 0.1, bumpFreq: 28 },
        ),
        legFn,
        'skin',
      );
      pb.addShaded(blob(0.25, 0.08, 0.21, 12, 6, 0.06, 26), legFn, 'skin', { p: [front ? 0.1 : 0.0, -0.38, 0] });
      for (const t of [-1, 0, 1]) {
        pb.addShaded(cone(0.03, 0.08, 5), () => new THREE.Color(0xd9d3b0), 'plastic', {
          p: [(front ? 0.33 : 0.23), -0.41, t * 0.1],
          r: [0, 0, -Math.PI / 2],
        });
      }
    });
    legs.push(lg);
  }
  const tail = rb.bone('tail', shell, [-1.58 - SHELL_PIVOT.x, 0.46 - SHELL_PIVOT.y, 0]);
  rb.part(tail, (pb) => pb.addShaded(cone(0.08, 0.22, 8), legFn, 'skin', { r: [0, 0, 2.0], p: [-0.06, -0.04, 0] }));

  // ---------------------------------------------------------------- ragdoll
  rb.spec.shell = { shape: 'box', size: [1.28, 0.7, 0.9], offset: [0, 0.08, 0], mass: 250 };
  rb.spec.neck = {
    shape: 'capsule', size: [0.18, 0.14], axis: 'x', offset: [0.05, 0.04, 0], mass: 8,
    joint: { kind: 'cone', axis: [1, 0, 0], cone: 0.6, twist: 0.3 },
  };
  rb.spec.head = {
    shape: 'sphere', size: [0.24], offset: [0.2, 0.03, 0], mass: 7,
    joint: { kind: 'cone', axis: [1, 0, 0], cone: 0.6, twist: 0.3 }, gib: true,
  };
  for (const [name] of legPos) {
    rb.spec[name] = {
      shape: 'capsule', size: [0.19, 0.14], axis: 'y', offset: [0.03, -0.18, 0], mass: 8.75,
      joint: { kind: 'cone', axis: [0, -1, 0], cone: 0.5, twist: 0.2 }, gib: true,
    };
  }

  // ---------------------------------------------------------------- animation
  const blink = blinker();
  const seed = Math.random() * 10;
  /** 0 = out, 1 = fully withdrawn. */
  const tuck = (k: number) => {
    if (k <= 0) return;
    const e = smooth(k);
    shell.position.y -= 0.14 * e;
    neck.position.x -= 0.5 * e;
    neck.position.y -= 0.04 * e;
    neck.rotation.z -= 0.15 * e;
    head.position.x -= 0.18 * e;
    head.rotation.z -= 0.25 * e;
    eyes.scale.y = Math.min(eyes.scale.y, 1 - 0.85 * e);
    for (const lg of legs) {
      lg.position.y += 0.4 * e;
      lg.position.z *= 1 - 0.4 * e;
      lg.position.x *= 1 - 0.12 * e;
      lg.rotation.x *= 1 - e;
      lg.rotation.z *= 1 - e;
    }
    tail.position.x += 0.2 * e;
  };

  const pose = (a: AnimInput) => {
    const time = a.time;
    eyes.scale.y = Math.max(0.1, blink(time));
    // walking gait (also evaluated during transitions, scaled by `out`)
    const moving = clamp(a.speed / 0.6, 0, 1);
    const cycle = 0.75;
    const ph = (a.distance / cycle) * TAU;
    const pairs = [0, 0.5, 0.5, 0]; // FL, FR, RL, RR: diagonal pairs
    for (let i = 0; i < legs.length; i++) {
      const [dx, lift] = footPath(ph / TAU + pairs[i], 0.6, cycle * 0.6 * moving, 0.12 * moving);
      const lg = legs[i];
      lg.rotation.z = Math.asin(clamp(dx / 0.48, -0.9, 0.9));
      lg.position.y += lift * 0.7;
      lg.rotation.x = (i % 2 === 0 ? -1 : 1) * lift * 0.8;
    }
    shell.rotation.x = 0.03 * Math.sin(ph) * moving;
    shell.rotation.z = 0.012 * Math.sin(ph * 2) * moving;
    shell.position.y += 0.02 * Math.abs(Math.sin(ph)) * moving + 0.006 * Math.sin(time * 1.5 + seed);
    neck.rotation.z = 0.08 * Math.sin(ph * 2 + 0.6) * moving + 0.04 * wobble(time * 0.5, seed);
    neck.rotation.y = 0.18 * wobble(time * 0.3, seed + 2);
    neck.position.x += 0.04 * Math.sin(ph * 2) * moving;
    head.rotation.z = -neck.rotation.z * 0.6 + 0.04 * wobble(time * 0.8, seed + 3);
    head.rotation.y = 0.12 * wobble(time * 0.45, seed + 5);

    if (a.state === 'hide') tuck(easeOut(a.stateTime / 0.2));
    else if (a.state === 'hidden') {
      tuck(1);
      shell.position.y += 0.004 * Math.sin(time * 1.2 + seed);
    } else if (a.state === 'emerge') {
      const t = clamp(a.stateTime / 0.32, 0, 1);
      tuck(1 - easeOut(t));
      head.rotation.y += 0.25 * Math.sin(t * Math.PI * 2) * (1 - t);
    }
  };

  return rb.finish('head', animator(rb.bones, pose, 0.12));
}
