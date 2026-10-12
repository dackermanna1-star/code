// Penguin: black back and head, white belly, orange beak and feet. Waddles
// (rocking side to side, flippers out), then dives onto its belly and glides.
//
// Bones: body (ragdoll root, at the body centre) > head > eyes,
//        body > flipperL/R, body > footL/R.
import * as THREE from 'three';
import { cone } from '../kit';
import {
  RigBuilder, addRoot, animator, blinker, blob, clamp, easeOut, footPath, lerp, loft, shade, smooth, wobble, TAU, type Sec,
} from './common';
import type { AnimInput, CreatureRig } from '../types';

const BLACK = 0x15171d;
const BLACK_HI = 0x2c3038;
const WHITE = 0xf3f3f1;

// Body spine (vertical). h = back (-X) half-depth, hb = belly (+X) half-depth.
const SPINE: Sec[] = [
  { x: 0.0, y: 0.07, w: 0.12, h: 0.1, hb: 0.11 },
  { x: 0.0, y: 0.17, w: 0.245, h: 0.21, hb: 0.25 },
  { x: 0.0, y: 0.36, w: 0.3, h: 0.255, hb: 0.3 },
  { x: 0.0, y: 0.58, w: 0.295, h: 0.25, hb: 0.29 },
  { x: 0.01, y: 0.8, w: 0.235, h: 0.2, hb: 0.225 },
  { x: 0.025, y: 0.96, w: 0.165, h: 0.15, hb: 0.155 },
  { x: 0.04, y: 1.07, w: 0.13, h: 0.125, hb: 0.12 },
];
const BODY_Y = 0.58;
const FOOT_Y = 0.06;

export function createPenguin(): CreatureRig {
  const rb = new RigBuilder('penguin');
  // White belly: front-facing and lower sides; crisp boundary.
  const bellyT = (p: THREE.Vector3, n: THREE.Vector3) => {
    const low = clamp((0.75 - p.y) * 0.9, 0, 0.5);
    const high = clamp((p.y - 0.95) * 4, 0, 1);
    return n.x * 2.6 - 0.75 + low - high * 2;
  };
  const bodyFn = (() => {
    const b = new THREE.Color(BLACK);
    const bh = new THREE.Color(BLACK_HI);
    const w = new THREE.Color(WHITE);
    const ws = new THREE.Color(0xc9ccd2);
    return (p: THREE.Vector3, n: THREE.Vector3) => {
      const t = smooth(bellyT(p, n) * 3 + 0.5);
      const black = b.clone().lerp(bh, clamp(n.y * 0.6 + 0.2, 0, 1));
      const white = w.clone().lerp(ws, clamp(-n.y * 0.8 + 0.1, 0, 1));
      return black.lerp(white, t);
    };
  })();

  const body = rb.bone('body', null, [0, BODY_Y, 0]);
  rb.part(body, (pb) => {
    addRoot(pb, body, loft(SPINE, { radial: 18, sub: 3, cap0: 0.05, cap1: 0.02 }), bodyFn, 'skin');
    // short tail
    addRoot(pb, body, cone(0.06, 0.13, 6).scale(1, 1, 0.45).rotateZ(2.75).translate(-0.17, 0.06, 0), () => new THREE.Color(BLACK), 'skin');
  });

  // ---- head
  const head = rb.bone('head', body, [0.04, 1.05 - BODY_Y, 0]);
  rb.part(head, (pb) => {
    const hx = 0.04;
    const hy = 1.05;
    const headFn = shade(BLACK_HI, BLACK, { noise: 0.04, bias: 0.2 });
    addRoot(pb, head, blob(0.13, 0.12, 0.13, 10, 8).translate(hx, hy, 0), bodyFn, 'skin');
    addRoot(pb, head, blob(0.165, 0.155, 0.15, 16, 12).translate(hx + 0.04, hy + 0.15, 0), headFn, 'skin');
    // beak (upper + lower mandible)
    const beakFn = shade(0xffa83a, 0xc85f0e, { noise: 0.03 });
    addRoot(pb, head, cone(0.045, 0.17, 10).rotateZ(-Math.PI / 2 - 0.1).translate(hx + 0.26, hy + 0.135, 0), beakFn, 'plastic');
    addRoot(pb, head, cone(0.03, 0.13, 8).rotateZ(-Math.PI / 2 + 0.05).translate(hx + 0.235, hy + 0.105, 0), beakFn, 'plastic');
    // orange cheek patches
    for (const s of [-1, 1]) {
      addRoot(pb, head, blob(0.05, 0.035, 0.02, 8, 6).rotateZ(-0.6).translate(hx + 0.02, hy + 0.06, s * 0.125), () => new THREE.Color(0xf4a020), 'skin');
    }
  });
  const eyes = rb.bone('eyes', head, [0.12, 0.2, 0]);
  rb.part(eyes, (pb) => {
    for (const s of [-1, 1]) {
      pb.add(blob(0.034, 0.03, 0.012, 10, 6), 0xf2f2f2, 'skin', { p: [0, 0, s * 0.112], r: [0, s * -0.45, 0] });
      pb.add(new THREE.SphereGeometry(0.017, 8, 6), 0x050505, 'eye', { p: [0.006, 0, s * 0.12] });
      pb.add(new THREE.SphereGeometry(0.006, 4, 3), 0xffffff, 'eye', { p: [0.013, 0.007, s * 0.134] });
    }
  });

  // ---- flippers
  for (const [name, s] of [['flipperL', 1], ['flipperR', -1]] as const) {
    const f = rb.bone(name, body, [-0.01, 0.86 - BODY_Y, s * 0.255]);
    rb.part(f, (pb) => {
      const g = loft(
        [
          { x: 0, y: 0.02, w: 0.035, h: 0.07, hb: 0.06 },
          { x: -0.01, y: -0.14, w: 0.026, h: 0.075, hb: 0.07 },
          { x: -0.03, y: -0.3, w: 0.018, h: 0.06, hb: 0.05 },
          { x: -0.06, y: -0.42, w: 0.012, h: 0.035, hb: 0.03 },
        ],
        { radial: 10, sub: 2, cap0: 0.03, cap1: 0.03 },
      );
      const inner = new THREE.Color(0xd9dbe0);
      const outer = new THREE.Color(BLACK);
      pb.addShaded(g, (_p, n) => outer.clone().lerp(inner, smooth(-n.z * s * 2.5 - 0.6)), 'skin');
    });
  }

  // ---- feet
  for (const [name, s] of [['footL', 1], ['footR', -1]] as const) {
    const f = rb.bone(name, body, [0.03, FOOT_Y - BODY_Y, s * 0.12]);
    rb.part(f, (pb) => {
      const fFn = shade(0xffa640, 0xc9640e, { noise: 0.04 });
      pb.addShaded(blob(0.045, 0.06, 0.045, 8, 6), fFn, 'rubber', { p: [-0.01, 0.03, 0] });
      pb.addShaded(blob(0.12, 0.03, 0.075, 12, 6), fFn, 'rubber', { p: [0.07, -0.03, 0] });
      for (const t of [-1, 0, 1]) {
        pb.addShaded(blob(0.05, 0.022, 0.022, 6, 4), fFn, 'rubber', { p: [0.17, -0.045, t * 0.045], r: [0, -t * 0.4, 0] });
      }
    });
  }

  // ---------------------------------------------------------------- ragdoll
  rb.spec.body = { shape: 'capsule', size: [0.28, 0.27], axis: 'y', offset: [0.02, 0.03, 0], mass: 22 };
  rb.spec.head = {
    shape: 'sphere', size: [0.16], offset: [0.04, 0.15, 0], mass: 3,
    joint: { kind: 'cone', axis: [0, 1, 0], cone: 0.6, twist: 0.4 }, gib: true,
  };
  for (const n of ['flipperL', 'flipperR']) {
    rb.spec[n] = {
      shape: 'box', size: [0.065, 0.2, 0.025], offset: [-0.02, -0.19, 0], mass: 1.2,
      joint: { kind: 'cone', axis: [0, -1, 0], cone: 1.0, twist: 0.3 }, gib: true,
    };
  }
  for (const n of ['footL', 'footR']) {
    rb.spec[n] = {
      shape: 'box', size: [0.11, 0.035, 0.07], offset: [0.07, -0.02, 0], mass: 1.3,
      joint: { kind: 'cone', axis: [0, -1, 0], cone: 0.5, twist: 0.2 }, gib: true,
    };
  }

  // ---------------------------------------------------------------- animation
  const blink = blinker();
  const seed = Math.random() * 10;
  const fl = rb.get('flipperL');
  const fr = rb.get('flipperR');
  const ftL = rb.get('footL');
  const ftR = rb.get('footR');

  const waddle = (a: AnimInput, k: number) => {
    const moving = clamp(a.speed / 1.0, 0, 1) * k;
    const cycle = 0.8;
    const ph = (a.distance / cycle) * TAU;
    const s = Math.sin(ph);
    const roll = 0.13 * s * moving + 0.01 * wobble(a.time, seed);
    body.rotation.x = roll;
    body.rotation.y = 0.12 * Math.sin(ph + 0.4) * moving;
    body.rotation.z = -0.04 * moving + 0.02 * Math.sin(ph * 2) * moving;
    // keep the lower foot on the ice while rocking
    body.position.y += (BODY_Y - FOOT_Y) * (Math.cos(roll) - 1) + 0.12 * Math.abs(Math.sin(roll));
    body.position.x += 0.03 * Math.sin(a.distance * 3.4) * moving; // the hit-shape sway
    head.rotation.x = -roll * 0.7;
    head.rotation.z = 0.04 * Math.sin(ph * 2) * moving + 0.05 * wobble(a.time * 0.7, seed + 1);
    head.rotation.y = 0.15 * wobble(a.time * 0.4, seed + 2);
    // flippers held out, flapping with the rock
    fl.rotation.x = -(0.32 + 0.1 * s) * moving - 0.06;
    fr.rotation.x = (0.32 - 0.1 * s) * moving + 0.06;
    fl.rotation.z = fr.rotation.z = 0.1 * moving;
    // feet: alternate steps (left foot planted when rocking onto it)
    for (const [ft, off] of [[ftL, 0], [ftR, 0.5]] as const) {
      const [dx, lift] = footPath(ph / TAU + off, 0.55, 0.4 * moving, 0.09 * moving);
      ft.position.x += dx;
      ft.position.y += lift;
      ft.rotation.z = lift * 2.2;
      ft.rotation.x = -roll * 0.9;
    }
  };

  const pose = (a: AnimInput) => {
    eyes.scale.y = Math.max(0.1, blink(a.time));
    if (a.state === 'glide') {
      // Dive onto the belly over ~0.28 s, then slide flat.
      const t = clamp(a.stateTime / 0.28, 0, 1);
      const k = easeOut(t);
      waddle(a, 1 - k);
      const hop = Math.sin(t * Math.PI) * 0.12;
      const rock = Math.sin(a.time * 5 + seed) * 0.04 * k;
      body.rotation.z = lerp(body.rotation.z, -Math.PI / 2 + 0.06, k);
      body.rotation.x = lerp(body.rotation.x, rock, k);
      body.rotation.y = lerp(body.rotation.y, 0, k);
      body.position.x = lerp(body.position.x, -0.07, k);
      body.position.y = lerp(body.position.y, 0.285, k) + hop;
      head.rotation.z = lerp(head.rotation.z, 1.25, k);
      head.rotation.x = lerp(head.rotation.x, 0, k);
      head.rotation.y = lerp(head.rotation.y, 0.08 * wobble(a.time, seed), k);
      const flap = Math.max(0, Math.sin(a.stateTime * 3.1 + seed)) ** 8;
      fl.rotation.x = lerp(fl.rotation.x, -0.12 - 0.5 * flap, k);
      fr.rotation.x = lerp(fr.rotation.x, 0.12 + 0.5 * flap, k);
      fl.rotation.z = fr.rotation.z = lerp(0, -0.12, k);
      for (const ft of [ftL, ftR]) {
        ft.position.x = lerp(ft.position.x, 0.03, k);
        ft.position.y = lerp(ft.position.y, FOOT_Y - BODY_Y + 0.02, k);
        ft.rotation.z = lerp(ft.rotation.z, -1.35, k);
        ft.rotation.x = lerp(ft.rotation.x, 0, k);
      }
      ftL.rotation.y = 0.15 * Math.sin(a.time * 9) * k;
      ftR.rotation.y = -0.15 * Math.sin(a.time * 9 + 1) * k;
      return;
    }
    waddle(a, 1);
  };

  return rb.finish('head', animator(rb.bones, pose));
}
