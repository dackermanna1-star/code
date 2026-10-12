// Fat seal ("Knubbs"): a huge round white seal that plods along with a slow
// heavy hump and stops now and then to rest (and regenerate).
//
// Authored in the walk pose. Bones:
//   body (ragdoll root) > rear (tail + hind flippers)
//   body > chest > head > eyes, head > jaw
//   chest > flipperL / flipperR
import * as THREE from 'three';
import {
  RigBuilder, addRoot, animator, blinker, blob, clamp, eye, loft, loftSplit, secAt, shade, wobble, type Sec,
} from './common';
import type { AnimInput, CreatureRig } from '../types';

const TOP = 0xf6f7f9;
const MID = 0xdfe3e8;
const UNDER = 0xa9b0bc;

const SPINE: Sec[] = [
  { x: -1.58, y: 0.11, w: 0.08, h: 0.05 },
  { x: -1.36, y: 0.18, w: 0.26, h: 0.15, hb: 0.13 },
  { x: -1.02, y: 0.34, w: 0.55, h: 0.32, hb: 0.29 },
  { x: -0.55, y: 0.57, w: 0.79, h: 0.53, hb: 0.53 },
  { x: -0.05, y: 0.76, w: 0.88, h: 0.69, hb: 0.72 },
  { x: 0.42, y: 0.93, w: 0.8, h: 0.62, hb: 0.68 },
  { x: 0.72, y: 1.06, w: 0.62, h: 0.5, hb: 0.54 },
  { x: 0.86, y: 1.13, w: 0.5, h: 0.41, hb: 0.43 },
  { x: 0.92, y: 1.16, w: 0.42, h: 0.35, hb: 0.36 },
];
const CUT_REAR = 2;
const CUT_CHEST = 5;
const HEAD_AT = 7;

export function createFatSeal(): CreatureRig {
  const rb = new RigBuilder('fatseal');
  const ventral = (_p: THREE.Vector3, n: THREE.Vector3) => -n.y * 1.1 + Math.max(0, n.x) * 0.15;
  const furFn = shade(TOP, UNDER, { mid: MID, bias: -0.05, sharp: 1.4, noise: 0.035, freq: 5, fn: ventral });

  const body = rb.bone('body', null, secAt(SPINE, 4));
  const rear = rb.bone('rear', body, rel(secAt(SPINE, CUT_REAR), secAt(SPINE, 4)));
  const chest = rb.bone('chest', body, rel(secAt(SPINE, CUT_CHEST), secAt(SPINE, 4)));
  const head = rb.bone('head', chest, rel(secAt(SPINE, HEAD_AT), secAt(SPINE, CUT_CHEST)));

  const [gRear, gBody, gChest] = loftSplit(SPINE, [CUT_REAR, CUT_CHEST], {
    radial: 18, sub: 3, cap0: 0.06, cap1: 0, bump: 0.012, bumpFreq: 4, overlap: 0,
  });
  const filler = (i: number) => {
    const c = SPINE[i];
    const r = (c.h + (c.hb ?? c.h)) * 0.46;
    return blob(r, r, c.w * 0.94, 12, 8).translate(c.x, c.y, 0);
  };
  rb.part(rear, (pb) => {
    addRoot(pb, rear, gRear, furFn);
    for (const s of [-1, 1]) {
      const fl = loft(
        [
          { x: 0, y: 0, w: 0.07, h: 0.035 },
          { x: -0.14, y: 0.0, w: 0.11, h: 0.025 },
          { x: -0.26, y: 0.02, w: 0.13, h: 0.016 },
        ],
        { radial: 8, sub: 1, cap0: 0.02, cap1: 0.04 },
      );
      fl.rotateZ(0.25);
      fl.rotateY(s * 0.5);
      fl.translate(-1.52, 0.1, s * 0.05);
      addRoot(pb, rear, fl, shade(0xe7eaee, 0xb3b9c3, { noise: 0.03 }), 'skin');
    }
  });
  rb.part(body, (pb) => {
    addRoot(pb, body, gBody, furFn);
    addRoot(pb, body, filler(CUT_REAR), furFn);
  });
  rb.part(chest, (pb) => {
    addRoot(pb, chest, gChest, furFn);
    addRoot(pb, chest, filler(CUT_CHEST), furFn);
  });

  // ---- head: big round face, blue eyes, pink nose, whisker pads
  const hx = SPINE[HEAD_AT].x;
  const hy = SPINE[HEAD_AT].y;
  rb.part(head, (pb) => {
    const headFn = shade(TOP, 0xc3c9d2, { mid: MID, bias: -0.2, sharp: 1.3, noise: 0.03, freq: 6 });
    addRoot(pb, head, blob(0.43, 0.41, 0.44, 18, 13).translate(hx + 0.13, hy + 0.08, 0), headFn);
    // muzzle and cheeks
    for (const s of [-1, 1]) {
      addRoot(pb, head, blob(0.17, 0.14, 0.15, 12, 9).translate(hx + 0.47, hy - 0.04, s * 0.11), headFn);
      // whisker dots
      for (let i = 0; i < 4; i++) {
        const a = (i % 2) * 0.06;
        const b = Math.floor(i / 2) * 0.045;
        addRoot(pb, head, blob(0.009, 0.009, 0.009, 4, 3).translate(hx + 0.6 - a * 0.6, hy - 0.02 - b, s * (0.17 + a)), () => new THREE.Color(0x8a909a), 'skin');
      }
    }
    // pink nose
    addRoot(pb, head, blob(0.07, 0.05, 0.085, 10, 8).translate(hx + 0.6, hy + 0.05, 0), shade(0xf6a4b0, 0xd9707f, { noise: 0.02 }), 'skin');
    // brow bumps above the eyes
    for (const s of [-1, 1]) addRoot(pb, head, blob(0.1, 0.06, 0.09, 8, 6).translate(hx + 0.33, hy + 0.27, s * 0.22), headFn);
  });
  const jaw = rb.bone('jaw', head, [0.38, -0.12, 0]);
  rb.part(jaw, (pb) => {
    addRoot(pb, jaw, blob(0.2, 0.09, 0.2, 12, 8).translate(hx + 0.42, hy - 0.15, 0), shade(MID, UNDER, { noise: 0.02 }));
  });
  const eyes = rb.bone('eyes', head, [0.39, 0.2, 0]);
  rb.part(eyes, (pb) => {
    for (const s of [-1, 1]) eye(pb, [0, 0, s * 0.27], 0.058, 0x2a6fbe, true, 0x153a66);
  });

  // ---- front flippers
  for (const [name, s] of [['flipperL', 1], ['flipperR', -1]] as const) {
    const f = rb.bone(name, chest, [0.08, -0.42, s * 0.66]);
    rb.part(f, (pb) => {
      pb.addShaded(
        loft(
          [
            { x: -0.04, y: 0.05, w: 0.1, h: 0.13 },
            { x: 0.02, y: -0.15, w: 0.065, h: 0.13 },
            { x: 0.12, y: -0.3, w: 0.045, h: 0.15 },
            { x: 0.26, y: -0.4, w: 0.03, h: 0.13 },
          ],
          { radial: 10, sub: 2, cap0: 0.04, cap1: 0.06 },
        ),
        shade(0xeef0f3, 0xaab1bb, { noise: 0.03 }),
        'fur',
      );
    });
  }

  // ---------------------------------------------------------------- ragdoll
  rb.spec.body = { shape: 'sphere', size: [0.72], offset: [-0.05, 0, 0], mass: 220 };
  rb.spec.rear = {
    shape: 'capsule', size: [0.3, 0.3], axis: 'x', offset: [-0.28, -0.15, 0], mass: 70,
    joint: { kind: 'cone', axis: [-1, 0, 0], cone: 0.5, twist: 0.2 },
  };
  rb.spec.chest = {
    shape: 'sphere', size: [0.58], offset: [0.18, 0.08, 0], mass: 70,
    joint: { kind: 'cone', axis: [1, 0.3, 0], cone: 0.45, twist: 0.2 },
  };
  rb.spec.head = {
    shape: 'sphere', size: [0.42], offset: [0.17, 0.06, 0], mass: 30,
    joint: { kind: 'cone', axis: [1, 0, 0], cone: 0.6, twist: 0.3 }, gib: true,
  };
  for (const n of ['flipperL', 'flipperR']) {
    rb.spec[n] = {
      shape: 'capsule', size: [0.08, 0.2], axis: 'y', offset: [0.08, -0.2, 0], mass: 5,
      joint: { kind: 'cone', axis: [0, -1, 0], cone: 0.8, twist: 0.3 }, gib: true,
    };
  }

  // ---------------------------------------------------------------- animation
  const blink = blinker();
  const fl = rb.get('flipperL');
  const fr = rb.get('flipperR');
  const seed = Math.random() * 10;

  const pose = (a: AnimInput) => {
    const time = a.time;
    eyes.scale.y = Math.max(0.06, blink(time));
    if (a.state === 'stopped') {
      // Resting: sinks down, head lowered, slow deep breaths, looks about.
      const t = clamp(a.stateTime / 0.6, 0, 1);
      const br = Math.sin(time * 1.6 + seed);
      body.position.y -= 0.06 * t;
      body.scale.set(1 + br * 0.012, 1 + br * 0.02, 1 + br * 0.016);
      chest.rotation.z = -0.1 * t + br * 0.015;
      head.rotation.z = -0.22 * t + br * 0.02;
      head.rotation.y = 0.35 * wobble(time * 0.25, seed) * t;
      head.rotation.x = 0.06 * wobble(time * 0.3, seed + 2) * t;
      rear.rotation.z = 0.04 * t;
      fl.rotation.z = fr.rotation.z = 0.1 * t;
      fl.rotation.x = -0.15 * t;
      fr.rotation.x = 0.15 * t;
      jaw.rotation.z = -0.04 * Math.max(0, br);
      eyes.scale.y = Math.min(eyes.scale.y, 1 - 0.35 * t);
      return;
    }
    // walk: slow heavy hump, bob matches the hit shapes (sin(distance * 2.4))
    const moving = clamp(a.speed / 1.0, 0, 1);
    const ph = a.distance * 2.4;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const amp = 0.3 + 0.7 * moving;
    body.position.y += 0.03 * amp * s;
    body.position.x += 0.04 * amp * c;
    body.rotation.z = 0.035 * amp * Math.sin(ph + 0.5);
    body.scale.y = 1 - 0.015 * amp * c;
    rear.rotation.z = -0.07 * amp * Math.sin(ph + 1.8) - body.rotation.z * 0.5;
    rear.rotation.y = 0.05 * amp * Math.sin(ph * 0.5);
    chest.rotation.z = 0.035 * amp * s - body.rotation.z * 0.3;
    head.rotation.z = -body.rotation.z - chest.rotation.z + 0.04 * amp * c + 0.03 * wobble(time * 0.6, seed);
    head.rotation.y = 0.1 * wobble(time * 0.3, seed + 4);
    const tot = body.rotation.z + chest.rotation.z;
    fl.rotation.z = -tot + 0.35 * amp * c;
    fr.rotation.z = -tot + 0.35 * amp * c;
    fl.rotation.x = -0.08;
    fr.rotation.x = 0.08;
  };

  return rb.finish('head', animator(rb.bones, pose, 0.35));
}

function rel(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
