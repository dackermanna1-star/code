// Walrus (final boss): huge brown wrinkled body, massive head with a bristly
// whisker pad and long white tusks. Lunges in, scrapes its tusks on the ice
// (charge), rushes across with its mouth open, and chomps (eat).
//
// Bones: body (ragdoll root: rear body) > tail (hind flippers)
//        body > chest (front body) > head > jaw / eyes / tusks > tuskTipL/R
//        chest > flipperL / flipperR
// The `tusks` bone's origin sits between the two tusk tips (spark point);
// tuskTipL / tuskTipR mark each tip.
import * as THREE from 'three';
import {
  RigBuilder, addRoot, animator, blinker, blob, clamp, horn, jointFiller, loft, loftSplit, secAt, shade, smooth, snoise, wobble, TAU,
  type Sec,
} from './common';
import type { AnimInput, CreatureRig } from '../types';

const BROWN = 0x744a29;
const LIGHT = 0x93633a;
const DARK = 0x3a2412;

const SPINE: Sec[] = [
  { x: -1.82, y: 0.17, w: 0.14, h: 0.1, hb: 0.08 },
  { x: -1.52, y: 0.32, w: 0.5, h: 0.3, hb: 0.28 },
  { x: -1.06, y: 0.62, w: 0.95, h: 0.6, hb: 0.6 },
  { x: -0.46, y: 0.94, w: 1.14, h: 0.82, hb: 0.9 },
  { x: 0.1, y: 1.22, w: 1.14, h: 0.88, hb: 0.98 },
  { x: 0.52, y: 1.56, w: 0.98, h: 0.78, hb: 0.84 },
  { x: 0.76, y: 1.9, w: 0.8, h: 0.64, hb: 0.68 },
  { x: 0.86, y: 2.12, w: 0.64, h: 0.52, hb: 0.54 },
  { x: 0.9, y: 2.3, w: 0.55, h: 0.44, hb: 0.46 },
];
const CUT_CHEST = 4;
const HEAD_AT = 7;
const TUSK_TIP: [number, number, number] = [1.56, 0.86, 0];

export function createWalrus(): CreatureRig {
  const rb = new RigBuilder('walrus');
  // Wrinkled hide: darker crease bands across the neck and body.
  const base = shade(LIGHT, DARK, { mid: BROWN, bias: -0.12, sharp: 1.25, noise: 0.08, freq: 6 });
  const hide = (p: THREE.Vector3, n: THREE.Vector3) => {
    const c = base(p, n);
    const fold = Math.sin(p.x * 9 + p.y * 7 + snoise(p.x * 3, p.y * 3, p.z * 3) * 2.2);
    const k = 1 - 0.13 * smooth(fold * 2 - 1) * clamp((p.x + 0.6) * 1.2, 0.25, 1);
    return c.multiplyScalar(k);
  };

  const body = rb.bone('body', null, secAt(SPINE, 3));
  const chest = rb.bone('chest', body, rel(secAt(SPINE, CUT_CHEST), secAt(SPINE, 3)));
  const head = rb.bone('head', chest, rel(secAt(SPINE, HEAD_AT), secAt(SPINE, CUT_CHEST)));
  const tail = rb.bone('tail', body, rel([-1.62, 0.22, 0], secAt(SPINE, 3)));

  const [gBody, gChest] = loftSplit(SPINE, [CUT_CHEST], { radial: 20, sub: 3, cap0: 0.12, cap1: 0, bump: 0.025, bumpFreq: 7, overlap: 0 });
  rb.part(body, (pb) => addRoot(pb, body, gBody, hide));
  rb.part(chest, (pb) => {
    addRoot(pb, chest, gChest, hide);
    addRoot(pb, chest, jointFiller(SPINE, CUT_CHEST, 0.96, 14, 10), hide);
  });
  rb.part(tail, (pb) => {
    for (const s of [-1, 1]) {
      const fl = loft(
        [
          { x: 0, y: 0, w: 0.12, h: 0.06 },
          { x: -0.25, y: 0.0, w: 0.2, h: 0.045 },
          { x: -0.45, y: 0.02, w: 0.25, h: 0.03 },
        ],
        { radial: 10, sub: 2, cap0: 0.04, cap1: 0.07 },
      );
      fl.rotateZ(0.18);
      fl.rotateY(s * 0.42);
      fl.translate(-1.68, 0.12, s * 0.14);
      addRoot(pb, tail, fl, shade(0x7a4a2a, 0x4a2a16, { noise: 0.06 }), 'skin');
    }
  });

  // ---- head
  const hx = SPINE[HEAD_AT].x;
  const hy = SPINE[HEAD_AT].y;
  rb.part(head, (pb) => {
    const headFn = shade(0x9d6b40, 0x4a2e16, { mid: 0x7b5030, bias: -0.15, sharp: 1.2, noise: 0.07, freq: 8 });
    addRoot(pb, head, jointFiller(SPINE, HEAD_AT, 0.97, 14, 10), hide);
    addRoot(pb, head, blob(0.56, 0.5, 0.6, 16, 12, 0.02, 7).translate(hx + 0.12, hy + 0.2, 0), headFn);
    addRoot(pb, head, blob(0.44, 0.38, 0.52, 14, 10).translate(hx + 0.42, hy + 0.04, 0), headFn);
    // whisker pad: two big lobes, lighter, with bristles
    const padFn = shade(0xb88d60, 0x765232, { bias: -0.05, noise: 0.05, freq: 14 });
    for (const s of [-1, 1]) {
      addRoot(pb, head, blob(0.3, 0.29, 0.27, 14, 10).translate(hx + 0.62, hy - 0.08, s * 0.2), padFn);
      for (let i = 0; i < 14; i++) {
        const a = (i % 5) / 4;
        const b = Math.floor(i / 5) / 2;
        const g = new THREE.CylinderGeometry(0.008, 0.004, 0.07, 4);
        g.rotateZ(-Math.PI / 2 + 0.3);
        g.rotateY(-s * (0.4 + a * 0.9));
        g.translate(hx + 0.84 - a * 0.12, hy + 0.04 - b * 0.18, s * (0.12 + a * 0.2));
        addRoot(pb, head, g, () => new THREE.Color(0xeee3c8), 'skin');
      }
    }
    // nostrils
    for (const s of [-1, 1]) {
      addRoot(pb, head, blob(0.03, 0.02, 0.04, 6, 4).translate(hx + 0.83, hy + 0.17, s * 0.1), () => new THREE.Color(0x2a1a0e), 'skin');
    }
    // mouth interior (visible when the jaw opens)
    addRoot(pb, head, blob(0.3, 0.14, 0.3, 12, 8).translate(hx + 0.5, hy - 0.26, 0), () => new THREE.Color(0x6e1418), 'skin');
  });
  const eyes = rb.bone('eyes', head, [0.45, 0.42, 0]);
  rb.part(eyes, (pb) => {
    for (const s of [-1, 1]) {
      pb.add(new THREE.SphereGeometry(0.055, 10, 7), 0x1a0f08, 'eye', { p: [0, 0, s * 0.42] });
      pb.add(new THREE.SphereGeometry(0.014, 4, 3), 0xffffff, 'eye', { p: [0.025, 0.025, s * 0.465] });
      pb.add(blob(0.09, 0.04, 0.06, 8, 5), 0x5a391d, 'fur', { p: [0.0, 0.05, s * 0.41], r: [0, 0, -0.15] });
    }
  });
  const jaw = rb.bone('jaw', head, [0.32, -0.28, 0]);
  rb.part(jaw, (pb) => {
    addRoot(pb, jaw, blob(0.3, 0.13, 0.32, 12, 8).translate(hx + 0.5, hy - 0.42, 0), shade(0x8a5c34, 0x3e2612, { noise: 0.06 }));
    addRoot(pb, jaw, blob(0.24, 0.08, 0.24, 10, 6).translate(hx + 0.5, hy - 0.32, 0), () => new THREE.Color(0xa0303a), 'skin');
  });
  // tusks: bone origin at the midpoint between the tips
  const tusks = rb.bone('tusks', head, rel(TUSK_TIP, secAt(SPINE, HEAD_AT)));
  rb.part(tusks, (pb) => {
    const tuskFn = shade(0xfffcf2, 0xc9c0a8, { bias: -0.1, noise: 0.03 });
    for (const s of [-1, 1]) {
      // horn(): root at the origin, tip at (bend, -len); place the tip at TUSK_TIP
      const g = horn(1.08, 0.075, -0.1, 7, 10);
      g.translate(TUSK_TIP[0] + 0.1, TUSK_TIP[1] + 1.08, s * 0.14);
      addRoot(pb, tusks, g, tuskFn, 'plastic');
    }
  });
  rb.bone('tuskTipL', tusks, [0.02, 0, 0.12]);
  rb.bone('tuskTipR', tusks, [0.02, 0, -0.12]);

  // ---- front flippers
  for (const [name, s] of [['flipperL', 1], ['flipperR', -1]] as const) {
    const f = rb.bone(name, chest, [0.68 - SPINE[CUT_CHEST].x, 0.62 - SPINE[CUT_CHEST].y, s * 0.82]);
    rb.part(f, (pb) => {
      const ffn = shade(0x7a4e2b, 0x3a2210, { bias: -0.1, noise: 0.07, freq: 9 });
      pb.addShaded(
        loft(
          [
            { x: -0.05, y: 0.15, w: 0.17, h: 0.2 },
            { x: 0.02, y: -0.15, w: 0.15, h: 0.18 },
            { x: 0.1, y: -0.4, w: 0.12, h: 0.13 },
          ],
          { radial: 12, sub: 2, cap0: 0.08, cap1: 0.06, bump: 0.03, bumpFreq: 10 },
        ),
        ffn,
        'skin',
      );
      // paddle lying on the ice, pointing forward and out
      const pad = loft(
        [
          { x: 0.0, y: 0, w: 0.15, h: 0.06 },
          { x: 0.22, y: 0, w: 0.2, h: 0.045 },
          { x: 0.45, y: 0.01, w: 0.22, h: 0.03 },
        ],
        { radial: 10, sub: 2, cap0: 0.06, cap1: 0.08 },
      );
      pb.addShaded(pad, ffn, 'skin', { p: [0.08, -0.5, s * 0.04], r: [0, -s * 0.35, 0] });
    });
  }

  // ---------------------------------------------------------------- ragdoll
  rb.spec.body = { shape: 'capsule', size: [0.78, 0.6], axis: 'x', offset: [-0.25, -0.05, 0], mass: 450 };
  rb.spec.chest = {
    shape: 'sphere', size: [0.85], offset: [0.25, 0.25, 0], mass: 320,
    joint: { kind: 'cone', axis: [0.5, 0.85, 0], cone: 0.35, twist: 0.2 },
  };
  rb.spec.head = {
    shape: 'sphere', size: [0.55], offset: [0.22, 0.12, 0], mass: 150,
    joint: { kind: 'cone', axis: [0.3, 1, 0], cone: 0.5, twist: 0.3 }, gib: true,
  };
  for (const n of ['flipperL', 'flipperR']) {
    rb.spec[n] = {
      shape: 'box', size: [0.2, 0.3, 0.07], offset: [0.12, -0.25, 0], mass: 20,
      joint: { kind: 'cone', axis: [0, -1, 0], cone: 0.7, twist: 0.3 }, gib: true,
    };
  }
  rb.spec.tail = {
    shape: 'box', size: [0.25, 0.06, 0.35], offset: [-0.2, -0.08, 0], mass: 40,
    joint: { kind: 'cone', axis: [-1, 0, 0], cone: 0.5, twist: 0.2 }, gib: true,
  };

  // ---------------------------------------------------------------- animation
  const blink = blinker();
  const seed = Math.random() * 10;
  const fl = rb.get('flipperL');
  const fr = rb.get('flipperR');

  const pose = (a: AnimInput) => {
    const time = a.time;
    eyes.scale.y = Math.max(0.12, blink(time));
    const st = a.state;
    if (st === 'charge') {
      // Head down, tusks scraping the ice, body rocking.
      const t = smooth(a.stateTime / 0.35);
      const rock = Math.sin(a.stateTime * 9);
      const scrape = Math.sin(a.stateTime * 18);
      body.position.y -= 0.12 * t;
      body.rotation.x = 0.05 * rock * t;
      body.rotation.z = -0.03 * t;
      chest.rotation.z = (-0.3 + 0.04 * rock) * t;
      chest.rotation.x = 0.05 * rock * t;
      head.rotation.z = (-0.42 + 0.06 * scrape) * t;
      head.rotation.y = 0.1 * Math.sin(a.stateTime * 4.5) * t;
      jaw.rotation.z = -0.1 * t;
      fl.rotation.z = fr.rotation.z = (0.35 + 0.12 * rock) * t;
      tail.rotation.z = 0.15 * t;
      return;
    }
    if (st === 'rush') {
      // Head thrust forward, mouth wide open, fast undulation.
      const ph = time * TAU * 3.2;
      const s = Math.sin(ph);
      const c = Math.cos(ph);
      body.position.y += 0.05 * Math.abs(s) - 0.05;
      body.rotation.z = 0.05 * s;
      chest.rotation.z = -0.32 + 0.07 * Math.sin(ph + 0.8);
      head.rotation.z = 0.12 - 0.05 * c;
      head.position.x += 0.08;
      jaw.rotation.z = -0.65 - 0.08 * s;
      tail.rotation.z = 0.25 * Math.sin(ph + 2);
      fl.rotation.z = fr.rotation.z = 0.5 * c - 0.3;
      return;
    }
    if (st === 'eat') {
      // Chomping, head tossing.
      const ch = Math.max(0, Math.sin(a.stateTime * TAU * 2.6));
      jaw.rotation.z = -0.55 * ch;
      head.rotation.z = 0.12 * ch - 0.08 + 0.05 * Math.sin(a.stateTime * 7);
      head.rotation.y = 0.12 * Math.sin(a.stateTime * 3.3);
      chest.rotation.z = -0.1 + 0.05 * ch;
      body.rotation.x = 0.04 * Math.sin(a.stateTime * 5);
      fl.rotation.z = fr.rotation.z = 0.1 * ch;
      return;
    }
    // walk: lunging hump (one lunge per ~0.92 m, matching the logic's step rhythm)
    const moving = clamp(a.speed / 0.8, 0, 1);
    const ph = (a.distance / 0.92) * TAU;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const amp = 0.3 + 0.7 * moving;
    body.position.y += 0.06 * amp * Math.max(0, s);
    body.position.x += 0.06 * amp * c;
    body.rotation.z = 0.05 * amp * Math.sin(ph - 0.7);
    chest.rotation.z = -0.07 * amp * s;
    head.rotation.z = -body.rotation.z - chest.rotation.z * 0.5 + 0.06 * amp * c + 0.04 * wobble(time * 0.6, seed);
    head.rotation.y = 0.1 * wobble(time * 0.3, seed + 1);
    jaw.rotation.z = -0.03 - 0.03 * Math.max(0, Math.sin(time * 1.1));
    tail.rotation.z = 0.12 * amp * Math.sin(ph + 1.6) - body.rotation.z;
    tail.rotation.y = 0.06 * amp * Math.sin(ph * 0.5);
    const tot = body.rotation.z + chest.rotation.z;
    fl.rotation.z = fr.rotation.z = -tot + 0.4 * amp * c;
    fl.rotation.x = -0.08;
    fr.rotation.x = 0.08;
  };

  return rb.finish('head', animator(rb.bones, pose, 0.25));
}

function rel(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
