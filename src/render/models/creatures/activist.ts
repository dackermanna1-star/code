// Activist: orange messy hair, pale face, dark-green parka, jeans, dark boots.
// Runs zig-zag hugging a seal cub; when the cub is shot out of his arms he
// panics (arms flailing) and then flees, arms pumping.
//
// Bones: pelvis (ragdoll root) > chest > head > eyes / mouth
//        chest > upperArmL/R > foreArmL/R
//        pelvis > thighL/R > shinL/R
// rig.cub is the held cub (child of chest) — the game view may detach it.
import * as THREE from 'three';
import { cone } from '../kit';
import {
  RigBuilder, animator, blinker, blob, clamp, damp, footPath, ik2, loft, shade, speckle, wobble, TAU,
} from './common';
import { createHeldCub } from './cub';
import type { AnimInput, CreatureRig } from '../types';

const PARKA = 0x2e4c22;
const PARKA_DARK = 0x1b3014;
const PARKA_LIGHT = 0x48693a;
const JEANS = 0x34557c;
const JEANS_DARK = 0x223a58;
const BOOT = 0x221a15;
const SKIN = 0xf1c7a5;
const HAIR = 0xec6416;

const THIGH = 0.44;
const SHIN = 0.42;
const HIP_Y = 0.93;
const UPPER = 0.29;
const FORE = 0.27;

export function createActivist(): CreatureRig {
  const rb = new RigBuilder('activist');
  const parkaFn = shade(PARKA_LIGHT, PARKA_DARK, { mid: PARKA, bias: -0.1, sharp: 1.3, noise: 0.08, freq: 18 });
  const jeansFn = shade(0x4a6d96, JEANS_DARK, { mid: JEANS, bias: 0.0, sharp: 1.2, noise: 0.07, freq: 22 });
  const skinFn = shade(0xf7d6b8, 0xd9a585, { mid: SKIN, bias: -0.2, noise: 0.03 });

  // ---------------------------------------------------------------- pelvis + lower parka
  const pelvis = rb.bone('pelvis', null, [0, HIP_Y + 0.05, 0]);
  rb.part(pelvis, (pb) => {
    pb.addShaded(blob(0.13, 0.11, 0.18, 12, 9), jeansFn, 'cloth', { p: [0, -0.06, 0] });
    // parka hem / skirt (spine runs up: h = back, hb = front)
    pb.addShaded(
      loft(
        [
          { x: 0, y: -0.17, w: 0.205, h: 0.15, hb: 0.16 },
          { x: 0, y: -0.06, w: 0.2, h: 0.145, hb: 0.155 },
          { x: 0, y: 0.0, w: 0.195, h: 0.14, hb: 0.15 },
        ],
        { radial: 14, sub: 1 },
      ),
      parkaFn,
      'cloth',
    );
    // hem band
    pb.addShaded(
      loft(
        [
          { x: 0, y: -0.19, w: 0.212, h: 0.157, hb: 0.167 },
          { x: 0, y: -0.15, w: 0.212, h: 0.157, hb: 0.167 },
        ],
        { radial: 14, sub: 1 },
      ),
      speckle(PARKA_DARK, 0.05),
      'cloth',
    );
  });

  // ---------------------------------------------------------------- chest (parka torso)
  const chest = rb.bone('chest', pelvis, [0, 0.07, 0]);
  rb.part(chest, (pb) => {
    pb.addShaded(
      loft(
        [
          { x: 0, y: -0.17, w: 0.198, h: 0.142, hb: 0.152 },
          { x: 0, y: 0.0, w: 0.205, h: 0.142, hb: 0.155 },
          { x: 0, y: 0.15, w: 0.215, h: 0.14, hb: 0.16 },
          { x: 0, y: 0.32, w: 0.235, h: 0.14, hb: 0.155 },
          { x: 0, y: 0.43, w: 0.22, h: 0.125, hb: 0.13 },
          { x: 0, y: 0.5, w: 0.15, h: 0.1, hb: 0.1 },
        ],
        { radial: 14, sub: 2, cap1: 0.03 },
      ),
      parkaFn,
      'cloth',
    );
    // shoulders (puffy)
    for (const s of [-1, 1]) pb.addShaded(blob(0.085, 0.08, 0.085, 8, 6), parkaFn, 'cloth', { p: [0, 0.43, s * 0.2] });
    // collar + folded hood at the back
    pb.addShaded(blob(0.11, 0.06, 0.13, 10, 6), parkaFn, 'cloth', { p: [-0.01, 0.52, 0] });
    pb.addShaded(blob(0.07, 0.065, 0.12, 10, 7), parkaFn, 'cloth', { p: [-0.1, 0.47, 0] });
    // zipper + pockets
    pb.add(new THREE.BoxGeometry(0.012, 0.5, 0.02), 0x10180c, 'cloth', { p: [0.155, 0.2, 0], r: [0, 0, 0.02] });
    for (const s of [-1, 1]) {
      pb.add(new THREE.BoxGeometry(0.03, 0.03, 0.12), PARKA_DARK, 'cloth', { p: [0.14, 0.05, s * 0.11], r: [0, 0, -0.1] });
    }
  });

  // ---------------------------------------------------------------- head
  const head = rb.bone('head', chest, [0.015, 0.53, 0]);
  rb.part(head, (pb) => {
    pb.addShaded(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10), skinFn, 'skin', { p: [0, 0.03, 0] });
    pb.addShaded(blob(0.105, 0.125, 0.1, 14, 10), skinFn, 'skin', { p: [0.02, 0.15, 0] });
    pb.addShaded(blob(0.06, 0.05, 0.075, 8, 6), skinFn, 'skin', { p: [0.06, 0.08, 0] }); // jaw
    pb.addShaded(blob(0.03, 0.035, 0.022, 6, 5), skinFn, 'skin', { p: [0.125, 0.145, 0] }); // nose
    for (const s of [-1, 1]) pb.addShaded(blob(0.02, 0.035, 0.02, 6, 5), skinFn, 'skin', { p: [0.0, 0.14, s * 0.1] }); // ears
    // eyebrows
    for (const s of [-1, 1]) pb.add(new THREE.BoxGeometry(0.012, 0.012, 0.04), 0xb4470f, 'skin', { p: [0.105, 0.205, s * 0.042], r: [s * 0.25, 0, 0] });
    // messy orange hair: a cap plus tufts
    const hairFn = shade(0xff8a2c, 0xb5420c, { mid: HAIR, bias: -0.3, noise: 0.12, freq: 30 });
    pb.addShaded(blob(0.118, 0.085, 0.11, 12, 8), hairFn, 'fur', { p: [-0.01, 0.225, 0] });
    pb.addShaded(blob(0.08, 0.1, 0.1, 8, 6), hairFn, 'fur', { p: [-0.06, 0.15, 0] });
    // clumps: x, y, z, rotZ, rotX, length
    const tufts: Array<[number, number, number, number, number, number]> = [
      [0.08, 0.25, 0.0, -1.0, 0, 0.09],
      [0.05, 0.28, 0.05, -0.55, 0.45, 0.1],
      [0.05, 0.28, -0.05, -0.55, -0.45, 0.1],
      [-0.01, 0.29, 0.0, 0.05, 0, 0.11],
      [-0.05, 0.27, 0.06, 0.6, 0.6, 0.1],
      [-0.05, 0.27, -0.06, 0.6, -0.6, 0.1],
      [-0.09, 0.22, 0.0, 1.15, 0, 0.11],
      [-0.1, 0.15, 0.06, 1.7, 0.5, 0.09],
      [-0.1, 0.15, -0.06, 1.7, -0.5, 0.09],
      [0.02, 0.24, 0.09, 0.1, 1.15, 0.08],
      [0.02, 0.24, -0.09, 0.1, -1.15, 0.08],
    ];
    for (const [x, y, z, rz, rx, len] of tufts) {
      const g = blob(0.036, len * 0.6, 0.032, 6, 4);
      g.translate(0, len * 0.42, 0);
      pb.addShaded(g, hairFn, 'fur', { p: [x, y, z], r: [rx, 0, rz] });
    }
    for (const [x, y, z, rz, rx] of [[0.06, 0.27, 0.02, -0.7, 0.2], [-0.04, 0.29, -0.03, 0.4, -0.3], [-0.08, 0.25, 0.04, 0.9, 0.4]]) {
      const g = cone(0.022, 0.08, 5);
      g.translate(0, 0.07, 0);
      pb.addShaded(g, hairFn, 'fur', { p: [x, y, z], r: [rx, 0, rz] });
    }
  });
  const eyes = rb.bone('eyes', head, [0.095, 0.17, 0]);
  rb.part(eyes, (pb) => {
    for (const s of [-1, 1]) {
      pb.add(new THREE.SphereGeometry(0.014, 8, 6), 0x101010, 'eye', { p: [0, 0, s * 0.04] });
    }
  });
  const mouth = rb.bone('mouth', head, [0.105, 0.085, 0]);
  rb.part(mouth, (pb) => {
    pb.add(blob(0.012, 0.022, 0.03, 8, 6), 0x5a1410, 'skin');
  });

  // ---------------------------------------------------------------- arms
  const sleeveFn = parkaFn;
  for (const [side, s] of [['L', 1], ['R', -1]] as const) {
    const ua = rb.bone(`upperArm${side}`, chest, [0, 0.43, s * 0.24]);
    rb.part(ua, (pb) => {
      pb.addShaded(
        loft(
          [
            { x: 0, y: 0.02, w: 0.075, h: 0.075 },
            { x: 0, y: -0.14, w: 0.068, h: 0.07 },
            { x: 0, y: -UPPER, w: 0.06, h: 0.062 },
          ],
          { radial: 10, sub: 2, cap0: 0.05, cap1: 0.04 },
        ),
        sleeveFn,
        'cloth',
      );
    });
    const fa = rb.bone(`foreArm${side}`, ua, [0, -UPPER, 0]);
    rb.part(fa, (pb) => {
      pb.addShaded(blob(0.062, 0.062, 0.062, 8, 6), sleeveFn, 'cloth');
      pb.addShaded(
        loft(
          [
            { x: 0, y: 0, w: 0.06, h: 0.06 },
            { x: 0, y: -0.2, w: 0.055, h: 0.055 },
            { x: 0, y: -0.23, w: 0.058, h: 0.058 },
          ],
          { radial: 10, sub: 2 },
        ),
        sleeveFn,
        'cloth',
      );
      // hand (bare, pale)
      pb.addShaded(blob(0.04, 0.055, 0.03, 8, 6), skinFn, 'skin', { p: [0.01, -FORE - 0.02, 0] });
    });
  }

  // ---------------------------------------------------------------- legs
  for (const [side, s] of [['L', 1], ['R', -1]] as const) {
    const th = rb.bone(`thigh${side}`, pelvis, [0, -0.05 - 0.0, s * 0.1]);
    rb.part(th, (pb) => {
      pb.addShaded(
        loft(
          [
            { x: 0, y: 0.04, w: 0.09, h: 0.095 },
            { x: 0, y: -0.2, w: 0.08, h: 0.083 },
            { x: 0, y: -THIGH, w: 0.065, h: 0.068 },
          ],
          { radial: 12, sub: 2, cap0: 0.05 },
        ),
        jeansFn,
        'cloth',
      );
    });
    const sh = rb.bone(`shin${side}`, th, [0, -THIGH, 0]);
    rb.part(sh, (pb) => {
      pb.addShaded(blob(0.066, 0.066, 0.066, 8, 6), jeansFn, 'cloth');
      pb.addShaded(
        loft(
          [
            { x: 0, y: 0, w: 0.065, h: 0.065 },
            { x: 0, y: -0.2, w: 0.058, h: 0.058 },
            { x: 0, y: -0.3, w: 0.062, h: 0.062 },
          ],
          { radial: 12, sub: 2 },
        ),
        jeansFn,
        'cloth',
      );
      // boot
      const bootFn = shade(0x3a2e25, 0x120d0a, { mid: BOOT, noise: 0.05 });
      pb.addShaded(
        loft(
          [
            { x: 0, y: -0.27, w: 0.066, h: 0.068 },
            { x: 0, y: -0.36, w: 0.064, h: 0.07 },
            { x: 0.0, y: -SHIN + 0.02, w: 0.065, h: 0.075 },
          ],
          { radial: 12, sub: 1 },
        ),
        bootFn,
        'rubber',
      );
      pb.addShaded(blob(0.12, 0.055, 0.068, 12, 8), bootFn, 'rubber', { p: [0.05, -SHIN + 0.035, 0] });
      pb.add(new THREE.BoxGeometry(0.25, 0.022, 0.13), 0x0c0908, 'rubber', { p: [0.04, -SHIN - 0.008, 0] });
    });
  }

  // ---------------------------------------------------------------- held cub
  const cubRig = createHeldCub(true);
  const cub = cubRig.root;
  cub.name = 'heldCub';
  cub.scale.setScalar(0.85);
  chest.add(cub);
  const cubRest = new THREE.Vector3(0.3, -0.07, 0);
  cub.position.copy(cubRest);
  cub.rotation.z = 0.12;

  // ---------------------------------------------------------------- ragdoll
  rb.spec.pelvis = { shape: 'box', size: [0.14, 0.13, 0.19], offset: [0, -0.04, 0], mass: 15 };
  rb.spec.chest = {
    shape: 'box', size: [0.15, 0.26, 0.22], offset: [0.01, 0.24, 0], mass: 24,
    joint: { kind: 'cone', axis: [0, 1, 0], cone: 0.45, twist: 0.35 },
  };
  rb.spec.head = {
    shape: 'sphere', size: [0.13], offset: [0.02, 0.15, 0], mass: 5,
    joint: { kind: 'cone', axis: [0, 1, 0], cone: 0.6, twist: 0.6 }, gib: true,
  };
  for (const side of ['L', 'R']) {
    rb.spec[`upperArm${side}`] = {
      shape: 'capsule', size: [0.06, 0.12], axis: 'y', offset: [0, -UPPER / 2, 0], mass: 2.5,
      joint: { kind: 'cone', axis: [0, -1, 0], cone: 1.2, twist: 0.6 }, gib: true,
    };
    rb.spec[`foreArm${side}`] = {
      shape: 'capsule', size: [0.05, 0.12], axis: 'y', offset: [0, -FORE / 2 - 0.02, 0], mass: 1.5,
      joint: { kind: 'hinge', axis: [0, 0, 1] }, gib: true,
    };
    rb.spec[`thigh${side}`] = {
      shape: 'capsule', size: [0.075, 0.17], axis: 'y', offset: [0, -THIGH / 2, 0], mass: 8,
      joint: { kind: 'cone', axis: [0, -1, 0], cone: 0.8, twist: 0.3 }, gib: true,
    };
    rb.spec[`shin${side}`] = {
      shape: 'capsule', size: [0.06, 0.17], axis: 'y', offset: [0.02, -SHIN / 2 - 0.02, 0], mass: 4.5,
      joint: { kind: 'hinge', axis: [0, 0, 1] }, gib: true,
    };
  }

  // ---------------------------------------------------------------- animation
  const blink = blinker();
  const seed = Math.random() * 10;
  const B = (n: string) => rb.get(n);
  const thL = B('thighL');
  const thR = B('thighR');
  const shL = B('shinL');
  const shR = B('shinR');
  const uaL = B('upperArmL');
  const uaR = B('upperArmR');
  const faL = B('foreArmL');
  const faR = B('foreArmR');
  let panicK = 0;

  /** Running legs + pelvis bob; returns the gait phase. */
  const legs = (a: AnimInput, crouch: number, lean: number, strideK: number) => {
    const moving = clamp(a.speed / 1.5, 0, 1);
    const ph = a.distance * 2.6; // stride cycle 2.42 m; |sin| bob like the hit shapes
    const duty = 0.38;
    const stride = (TAU / 2.6) * duty * strideK;
    pelvis.position.y += -crouch + Math.abs(Math.sin(ph)) * 0.05 * moving;
    pelvis.rotation.z = -lean * 0.35;
    pelvis.rotation.y = 0.12 * Math.sin(ph) * moving;
    chest.rotation.z = -lean * 0.65;
    chest.rotation.y = -0.18 * Math.sin(ph) * moving;
    const pr = pelvis.rotation.z;
    // hip joint (pelvis-local (0, -0.05)) in root space
    const hx = pelvis.position.x + 0.05 * Math.sin(pr);
    const hy = pelvis.position.y - 0.05 * Math.cos(pr);
    const off = duty / 2;
    for (const [th, sh, ph0] of [[thL, shL, 0], [thR, shR, 0.5]] as const) {
      const p = ph / TAU + off + ph0;
      const [fx, lift] = footPath(p, duty, stride * moving, 0.28 * moving + 0.01);
      // IK effector = shin end + 0.04 (just under the boot sole)
      const tx = fx + 0.04 - hx;
      const ty = -0.02 + lift - hy;
      const lx = tx * Math.cos(-pr) - ty * Math.sin(-pr);
      const ly = tx * Math.sin(-pr) + ty * Math.cos(-pr);
      const [a1, a2] = ik2(THIGH, SHIN + 0.04, lx, ly, -1);
      th.rotation.z = a1;
      sh.rotation.z = a2;
    }
    return ph;
  };

  const pose = (a: AnimInput) => {
    const time = a.time;
    const hasCub = a.params.hasCub !== false;
    if (cub.parent === chest) cub.visible = hasCub;
    eyes.scale.y = Math.max(0.1, blink(time));
    head.rotation.z = 0.25;
    const panic = a.state === 'panic';
    const flee = a.state === 'flee' || (!hasCub && a.state === 'run');
    panicK = damp(panicK, panic ? 1 : 0, 10, a.dt);

    if (panic) {
      // Cub gone: slows down, arms flail above the head, looks about.
      const t = a.stateTime;
      legs(a, 0.06, 0.12, 0.8);
      const f = Math.sin(t * 15);
      const g = Math.sin(t * 11 + 1);
      uaL.rotation.z = 2.5 + 0.35 * f;
      uaR.rotation.z = 2.3 - 0.35 * g;
      uaL.rotation.x = -0.5 - 0.2 * g;
      uaR.rotation.x = 0.5 + 0.2 * f;
      faL.rotation.z = 0.5 + 0.4 * g;
      faR.rotation.z = 0.5 + 0.4 * f;
      head.rotation.z = 0.05 + 0.1 * f;
      head.rotation.y = 0.6 * Math.sin(t * 6);
      mouth.scale.set(1.3, 1.9, 1.2);
      return;
    }
    if (flee) {
      // Sprint, arms pumping opposite to the legs.
      const ph = legs(a, 0.08, 0.42, 1.1);
      const s = Math.sin(ph);
      uaL.rotation.z = -0.15 + 0.9 * s;
      uaR.rotation.z = -0.15 - 0.9 * s;
      uaL.rotation.x = -0.12;
      uaR.rotation.x = 0.12;
      faL.rotation.z = 1.45 + 0.25 * s;
      faR.rotation.z = 1.45 - 0.25 * s;
      head.rotation.z = 0.32;
      head.rotation.y = 0.1 * wobble(time * 2, seed);
      mouth.scale.set(1.2, 1.5, 1.1);
      return;
    }
    // run with the cub: deep lunging stride, leaning forward, cub hugged.
    const ph = legs(a, 0.1, 0.32, 1.1);
    const s = Math.sin(ph);
    uaL.rotation.z = uaR.rotation.z = 0.3 + 0.05 * s;
    uaL.rotation.x = 0.05;
    uaR.rotation.x = -0.05;
    faL.rotation.z = faR.rotation.z = 1.5;
    faL.rotation.y = -0.45;
    faR.rotation.y = 0.45;
    head.rotation.y = 0.12 * wobble(time * 0.8, seed);
    mouth.scale.set(1, 1 + 0.3 * Math.abs(s), 1);
    // held cub squirms a little
    if (hasCub && cub.parent === chest) {
      cub.position.copy(cubRest);
      cub.position.y += 0.015 * Math.abs(Math.cos(ph));
      cubRig.animate({ ...a, state: 'held', distance: time * 0.35, speed: 0.6 });
    }
  };

  return rb.finish('head', animator(rb.bones, pose, 0.18), { cub });
}
