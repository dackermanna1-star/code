// Brown seal ("Bruns"): galumphs with its chest and head raised; when badly
// hurt it collapses and drags itself along flat on the ice.
//
// The body is authored in the upright walk pose as one continuous loft along
// an S-shaped spine, split across bones. Bones:
//   body (ragdoll root) > rear (hind body + hind flippers)
//   body > chest > head > eyes
//   chest > flipperL / flipperR
import * as THREE from 'three';
import {
  RigBuilder, addRoot, animator, blinker, blob, clamp, easeOut, eye, lerp, loft, loftSplit, secAt, shade, smooth, wobble, TAU,
  type Sec,
} from './common';
import type { AnimInput, CreatureRig } from '../types';

const BACK = 0x46230c;
const BROWN = 0x74401c;
const BELLY = 0xb58758;
const MUZZLE = 0xa47b52;

// Spine in the walk pose (root space). h = dorsal half-height, hb = ventral.
const SPINE: Sec[] = [
  { x: -0.63, y: 0.075, w: 0.04, h: 0.03 },
  { x: -0.53, y: 0.095, w: 0.09, h: 0.065, hb: 0.06 },
  { x: -0.38, y: 0.145, w: 0.17, h: 0.125, hb: 0.12 },
  { x: -0.21, y: 0.215, w: 0.235, h: 0.185, hb: 0.18 },
  { x: -0.04, y: 0.3, w: 0.265, h: 0.21, hb: 0.215 },
  { x: 0.09, y: 0.42, w: 0.255, h: 0.2, hb: 0.215 },
  { x: 0.17, y: 0.57, w: 0.215, h: 0.165, hb: 0.19 },
  { x: 0.215, y: 0.71, w: 0.17, h: 0.13, hb: 0.155 },
  { x: 0.245, y: 0.83, w: 0.14, h: 0.11, hb: 0.12 },
  { x: 0.26, y: 0.9, w: 0.12, h: 0.09, hb: 0.1 },
];
const CUT_REAR = 2;
const CUT_CHEST = 5;
const HEAD_AT = 8;

export function createSeal(): CreatureRig {
  const rb = new RigBuilder('seal');
  const ventral = (_p: THREE.Vector3, n: THREE.Vector3) => Math.max(-n.y, n.x * 0.75 - 0.05);
  const furFn = shade(BACK, BELLY, { mid: BROWN, bias: -0.12, sharp: 1.5, noise: 0.08, fn: ventral });

  const body = rb.bone('body', null, secAt(SPINE, 4));
  const rear = rb.bone('rear', body, sub3(secAt(SPINE, CUT_REAR), secAt(SPINE, 4)));
  const chest = rb.bone('chest', body, sub3(secAt(SPINE, CUT_CHEST), secAt(SPINE, 4)));
  const head = rb.bone('head', chest, sub3(secAt(SPINE, HEAD_AT), secAt(SPINE, CUT_CHEST)));

  const [gRear, gBody, gChest] = loftSplit(SPINE, [CUT_REAR, CUT_CHEST], { radial: 16, sub: 3, cap0: 0.03, cap1: 0, bump: 0.012, overlap: 0 });
  rb.part(rear, (pb) => {
    addRoot(pb, rear, gRear, furFn);
    // Hind flippers: two flat fans, splayed and tipped up a little.
    for (const s of [-1, 1]) {
      const fl = loft(
        [
          { x: 0, y: 0, w: 0.035, h: 0.016 },
          { x: -0.07, y: 0.0, w: 0.055, h: 0.012 },
          { x: -0.13, y: 0.008, w: 0.07, h: 0.008 },
        ],
        { radial: 10, sub: 2, cap0: 0.01, cap1: 0.025 },
      );
      fl.rotateZ(0.2);
      fl.rotateY(s * 0.45);
      fl.translate(-0.6, 0.07, s * 0.025);
      addRoot(pb, rear, fl, shade(0x2c1608, 0x5c3c22, { noise: 0.05 }), 'skin');
    }
  });
  rb.part(body, (pb) => {
    addRoot(pb, body, gBody, furFn);
    // joint fillers (only visible when the crawl pose straightens the spine)
    const r = SPINE[CUT_REAR];
    addRoot(pb, body, blob((r.h + (r.hb ?? r.h)) * 0.48, (r.h + (r.hb ?? r.h)) * 0.48, r.w * 0.97, 12, 9).translate(r.x, r.y, 0), furFn);
  });
  rb.part(chest, (pb) => {
    addRoot(pb, chest, gChest, furFn);
    const c = SPINE[CUT_CHEST];
    addRoot(pb, chest, blob((c.h + (c.hb ?? c.h)) * 0.48, (c.h + (c.hb ?? c.h)) * 0.48, c.w * 0.97, 12, 9).translate(c.x, c.y, 0), furFn);
  });

  // ---- head (authored facing +X, skull centre ~ (0.36, 0.95))
  rb.part(head, (pb) => {
    const headFn = shade(BACK, 0x9a744c, { mid: BROWN, bias: -0.25, sharp: 1.4, noise: 0.06 });
    const hx = SPINE[HEAD_AT].x;
    const hy = SPINE[HEAD_AT].y;
    addRoot(pb, head, blob(0.135, 0.12, 0.13, 12, 9).translate(hx, hy, 0), furFn);
    addRoot(pb, head, blob(0.165, 0.15, 0.15, 16, 12).translate(hx + 0.1, hy + 0.115, 0), headFn);
    addRoot(
      pb,
      head,
      loft(
        [
          { x: 0.08, y: 0.025, w: 0.105, h: 0.09 },
          { x: 0.18, y: 0.005, w: 0.088, h: 0.072 },
          { x: 0.255, y: -0.005, w: 0.072, h: 0.06 },
        ],
        { radial: 14, sub: 2, cap1: 0.045 },
      ).translate(hx + 0.02, hy + 0.07, 0),
      shade(0x6a3f1e, MUZZLE, { bias: -0.15, noise: 0.05 }),
    );
    for (const s of [-1, 1]) {
      addRoot(pb, head, blob(0.05, 0.04, 0.045, 8, 6).translate(hx + 0.255, hy + 0.058, s * 0.04), shade(0xb08a60, 0x8a6440, { noise: 0.05 }));
    }
    addRoot(pb, head, blob(0.026, 0.02, 0.034, 8, 6).translate(hx + 0.325, hy + 0.084, 0), () => new THREE.Color(0x120a06), 'skin');
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const g = new THREE.CylinderGeometry(0.0025, 0.0012, 0.12, 4);
        g.translate(0, 0.06, 0);
        g.rotateX(s * (0.9 + i * 0.12));
        g.rotateZ(-1.45 + i * 0.12);
        g.translate(hx + 0.27, hy + 0.05 - i * 0.012, s * 0.07);
        addRoot(pb, head, g, () => new THREE.Color(0xe0d6c4), 'skin');
      }
    }
  });
  const eyes = rb.bone('eyes', head, [0.16, 0.165, 0]);
  rb.part(eyes, (pb) => {
    for (const s of [-1, 1]) eye(pb, [0.0, 0, s * 0.108], 0.032, 0x060403);
  });

  // ---- front flippers: from the lower chest down to the ice
  for (const [name, s] of [['flipperL', 1], ['flipperR', -1]] as const) {
    const f = rb.bone(name, chest, [0.13, -0.06, s * 0.19]);
    rb.part(f, (pb) => {
      pb.addShaded(
        loft(
          [
            { x: 0, y: 0.03, w: 0.045, h: 0.06 },
            { x: 0.02, y: -0.1, w: 0.026, h: 0.065 },
            { x: 0.05, y: -0.22, w: 0.015, h: 0.075 },
            { x: 0.08, y: -0.3, w: 0.01, h: 0.065 },
          ],
          { radial: 10, sub: 2, cap0: 0.02, cap1: 0.03 },
        ),
        shade(0x3c1e0b, 0x5a331b, { noise: 0.05 }),
        'fur',
      );
    });
  }

  // ---------------------------------------------------------------- ragdoll
  rb.spec.body = { shape: 'capsule', size: [0.2, 0.15], axis: 'x', offset: [-0.03, -0.02, 0], mass: 38 };
  rb.spec.rear = {
    shape: 'capsule', size: [0.12, 0.13], axis: 'x', offset: [-0.12, -0.04, 0], mass: 16,
    joint: { kind: 'cone', axis: [-1, 0, 0], cone: 0.6, twist: 0.25 }, gib: true,
  };
  rb.spec.chest = {
    shape: 'capsule', size: [0.16, 0.14], axis: 'y', offset: [0.06, 0.18, 0], mass: 16,
    joint: { kind: 'cone', axis: [0.4, 0.9, 0], cone: 0.7, twist: 0.3 },
  };
  rb.spec.head = {
    shape: 'sphere', size: [0.16], offset: [0.12, 0.1, 0], mass: 6,
    joint: { kind: 'cone', axis: [0, 1, 0], cone: 0.8, twist: 0.4 }, gib: true,
  };
  for (const n of ['flipperL', 'flipperR']) {
    rb.spec[n] = {
      shape: 'capsule', size: [0.035, 0.11], axis: 'y', offset: [0.04, -0.13, 0], mass: 2,
      joint: { kind: 'cone', axis: [0, -1, 0], cone: 0.9, twist: 0.3 }, gib: true,
    };
  }

  // ---------------------------------------------------------------- animation
  const blink = blinker();
  const fl = rb.get('flipperL');
  const fr = rb.get('flipperR');
  const seed = Math.random() * 10;

  /** Galumph (rest pose = mid-stride upright). */
  const walk = (ph: number, amp: number, time: number) => {
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    // Hump travels tail -> chest; chest/head bob like the hit shapes.
    body.rotation.z = 0.07 * amp * Math.sin(ph + 0.6);
    body.position.y += 0.035 * amp * s;
    body.position.x += 0.03 * amp * c;
    rear.rotation.z = -0.12 * amp * Math.sin(ph + 1.9) - body.rotation.z * 0.6;
    rear.rotation.y = 0.06 * amp * Math.sin(ph * 0.5);
    chest.rotation.z = -0.07 * amp * Math.sin(ph + 0.6);
    head.rotation.z = -body.rotation.z - chest.rotation.z + 0.06 * amp * c + 0.05 * wobble(time * 0.7, seed);
    head.rotation.y = 0.14 * wobble(time * 0.35, seed + 3);
    const tot = body.rotation.z + chest.rotation.z;
    const push = 0.38 * amp * c;
    fl.rotation.z = -tot + push;
    fr.rotation.z = -tot + push;
    fl.rotation.x = -0.18;
    fr.rotation.x = 0.18;
  };

  /** Flat crawl pose, dragging with the front flippers. */
  const CR = { body: -0.5, bodyY: -0.17, bodyX: 0.0, rear: 0.32, chest: -0.72, head: 1.16, neckX: -0.07, neckY: -0.15 };
  const crawl = (ph: number, amp: number, time: number) => {
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    body.rotation.z = CR.body + 0.03 * amp * Math.max(0, c);
    body.position.y += CR.bodyY;
    body.position.x += CR.bodyX + 0.035 * amp * s;
    rear.rotation.z = CR.rear - 0.04 * amp * Math.max(0, -s);
    rear.rotation.y = 0.12 * amp * Math.sin(ph * 0.5);
    chest.rotation.z = CR.chest + 0.07 * amp * Math.max(0, s);
    head.position.x += CR.neckX;
    head.position.y += CR.neckY;
    head.rotation.z = CR.head + 0.07 * amp * Math.sin(ph + 0.6) + 0.03 * wobble(time, seed);
    head.rotation.y = 0.12 * wobble(time * 0.5, seed + 1);
    const reach = 0.6 * amp * c;
    const tot = body.rotation.z + chest.rotation.z;
    fl.rotation.z = -tot - 1.05 + reach;
    fr.rotation.z = -tot - 1.05 + reach;
    fl.rotation.x = -0.85;
    fr.rotation.x = 0.85;
  };

  const snap = () => [body.rotation.z, body.position.x, body.position.y, rear.rotation.z, chest.rotation.z, head.rotation.z, head.position.x, head.position.y, fl.rotation.z, fl.rotation.x];
  const bodyRest = body.position.clone();
  const headRest = head.position.clone();

  const pose = (a: AnimInput) => {
    const time = a.time;
    eyes.scale.y = Math.max(0.08, blink(time));
    if (a.state === 'crawl') {
      crawl(a.distance * (TAU / 0.45), 1, time);
      eyes.scale.y = Math.min(eyes.scale.y, 0.55);
      return;
    }
    if (a.state === 'startcrawl') {
      // Flinch from the hit, then slump forward onto the belly over ~0.8 s.
      const t = clamp(a.stateTime / 0.8, 0, 1);
      const k = smooth(easeOut(t));
      const flinch = Math.sin(Math.min(1, a.stateTime / 0.22) * Math.PI) * 0.16;
      walk(0, 0, time);
      const A = snap();
      body.position.copy(bodyRest);
      head.position.copy(headRest);
      crawl(0, 0, time);
      const B = snap();
      const v = A.map((x, i) => lerp(x, B[i], k));
      body.rotation.z = v[0] - flinch * 0.3;
      body.position.x = v[1];
      body.position.y = v[2];
      rear.rotation.z = v[3];
      chest.rotation.z = v[4] + flinch;
      head.rotation.z = v[5] - flinch * 1.2 + Math.sin(a.stateTime * 17) * 0.07 * (1 - k);
      head.position.x = v[6];
      head.position.y = v[7];
      fl.rotation.z = fr.rotation.z = v[8];
      fl.rotation.x = v[9];
      fr.rotation.x = -v[9];
      eyes.scale.y = Math.min(eyes.scale.y, lerp(1, 0.55, t));
      return;
    }
    // walk (default): galumph driven by distance so it does not skate
    const moving = clamp(a.speed / 1.2, 0, 1);
    walk(a.distance * 4.2, 0.3 + 0.7 * moving, time);
    chest.rotation.z += (1 - moving) * Math.sin(time * 2.2 + seed) * 0.02;
  };

  return rb.finish('head', animator(rb.bones, pose));
}

function sub3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
