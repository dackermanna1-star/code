// Polar bear: big cream-white quadruped with a shoulder hump, long neck and
// small head. Walks (lateral-sequence gait) and, when enraged and fast
// (speed > 7.8 m/s), gallops. params.rage 0..3 lowers the head and snarls.
//
// Bones: body (ragdoll root: hindquarters) > chest (shoulders) > head > jaw / eyes
//        chest > legFL/FR > lowerFL/FR > pawFL/FR
//        body  > legRL/RR > lowerRL/RR > pawRL/RR
import * as THREE from 'three';
import {
  RigBuilder, addRoot, animator, blinker, blob, clamp, damp, footPath, horn, ik2, jointFiller, lerp, loft, loftSplit, secAt, shade, wobble, TAU,
  type Sec,
} from './common';
import { cone } from '../kit';
import type { AnimInput, CreatureRig } from '../types';

const CREAM = 0xf6f2e7;
const MID = 0xe2ddd0;
const GREY = 0xa9a69f;

const SPINE: Sec[] = [
  { x: -1.52, y: 1.22, w: 0.22, h: 0.24, hb: 0.22 },
  { x: -1.36, y: 1.31, w: 0.45, h: 0.46, hb: 0.44 },
  { x: -1.04, y: 1.36, w: 0.55, h: 0.52, hb: 0.56 },
  { x: -0.55, y: 1.3, w: 0.57, h: 0.5, hb: 0.6 },
  { x: -0.05, y: 1.32, w: 0.56, h: 0.53, hb: 0.58 },
  { x: 0.4, y: 1.4, w: 0.53, h: 0.6, hb: 0.55 },
  { x: 0.78, y: 1.35, w: 0.46, h: 0.5, hb: 0.52 },
  { x: 1.04, y: 1.3, w: 0.32, h: 0.32, hb: 0.35 },
];
const CUT_CHEST = 4;
const HEAD_AT = 7;

const F_L1 = 0.58;
const F_L2 = 0.55;
const H_L1 = 0.6;
const H_L2 = 0.55;
const PAW_H = 0.12;
const SHOULDER: [number, number] = [0.78, 1.18];
const HIP: [number, number] = [-1.06, 1.2];

export function createBear(): CreatureRig {
  const rb = new RigBuilder('bear');
  const furFn = shade(CREAM, GREY, { mid: MID, bias: -0.1, sharp: 1.25, noise: 0.05, freq: 7 });

  const body = rb.bone('body', null, [-0.5, 1.33, 0]);
  const chest = rb.bone('chest', body, rel(secAt(SPINE, CUT_CHEST), [-0.5, 1.33, 0]));
  const head = rb.bone('head', chest, rel(secAt(SPINE, HEAD_AT), secAt(SPINE, CUT_CHEST)));

  const [gBody, gChest] = loftSplit(SPINE, [CUT_CHEST], { radial: 18, sub: 3, cap0: 0.16, cap1: 0, bump: 0.02, bumpFreq: 6, overlap: 0 });
  rb.part(body, (pb) => {
    addRoot(pb, body, gBody, furFn);
    // stubby tail
    addRoot(pb, body, blob(0.08, 0.07, 0.07, 8, 6).translate(-1.6, 1.42, 0), furFn);
  });
  rb.part(chest, (pb) => {
    addRoot(pb, chest, gChest, furFn);
    addRoot(pb, chest, jointFiller(SPINE, CUT_CHEST, 0.96), furFn);
  });

  // ---- head + neck
  const hx = SPINE[HEAD_AT].x;
  const hy = SPINE[HEAD_AT].y;
  rb.part(head, (pb) => {
    const headFn = shade(CREAM, 0xb9b5ac, { mid: MID, bias: -0.15, sharp: 1.3, noise: 0.04, freq: 9 });
    addRoot(
      pb,
      head,
      loft(
        [
          { x: hx - 0.12, y: hy - 0.01, w: 0.32, h: 0.33, hb: 0.33 },
          { x: hx + 0.1, y: hy + 0.02, w: 0.28, h: 0.29, hb: 0.3 },
          { x: hx + 0.3, y: hy + 0.05, w: 0.24, h: 0.24, hb: 0.25 },
        ],
        { radial: 14, sub: 2, bump: 0.02, bumpFreq: 8 },
      ),
      headFn,
    );
    addRoot(pb, head, blob(0.26, 0.23, 0.22, 16, 11, 0.015, 9).translate(hx + 0.42, hy + 0.07, 0), headFn);
    // muzzle (long, narrow)
    addRoot(
      pb,
      head,
      loft(
        [
          { x: hx + 0.5, y: hy + 0.06, w: 0.15, h: 0.14, hb: 0.13 },
          { x: hx + 0.66, y: hy + 0.02, w: 0.11, h: 0.1, hb: 0.1 },
          { x: hx + 0.79, y: hy - 0.0, w: 0.085, h: 0.08, hb: 0.08 },
        ],
        { radial: 12, sub: 2, cap1: 0.05 },
      ),
      headFn,
    );
    addRoot(pb, head, blob(0.055, 0.045, 0.065, 8, 6).translate(hx + 0.83, hy + 0.025, 0), () => new THREE.Color(0x111111), 'skin');
    // lips line
    addRoot(pb, head, blob(0.16, 0.012, 0.075, 8, 4).translate(hx + 0.7, hy - 0.06, 0), () => new THREE.Color(0x3a3a3a), 'skin');
    // ears
    for (const s of [-1, 1]) {
      addRoot(pb, head, blob(0.06, 0.07, 0.035, 8, 6).rotateX(s * 0.4).translate(hx + 0.32, hy + 0.28, s * 0.15), headFn);
      addRoot(pb, head, blob(0.035, 0.045, 0.02, 6, 4).rotateX(s * 0.4).translate(hx + 0.345, hy + 0.28, s * 0.155), () => new THREE.Color(0x8d8a84), 'skin');
    }
    // upper teeth (visible when snarling)
    for (const s of [-1, 1]) {
      addRoot(pb, head, cone(0.014, 0.06, 5).rotateZ(Math.PI).translate(hx + 0.74, hy - 0.08, s * 0.05), () => new THREE.Color(0xf4f0e0), 'plastic');
    }
  });
  const eyes = rb.bone('eyes', head, [0.56, 0.12, 0]);
  rb.part(eyes, (pb) => {
    for (const s of [-1, 1]) {
      pb.add(new THREE.SphereGeometry(0.03, 8, 6), 0x0a0a0a, 'eye', { p: [0, 0, s * 0.16] });
      pb.add(new THREE.SphereGeometry(0.008, 4, 3), 0xffffff, 'eye', { p: [0.014, 0.012, s * 0.185] });
    }
  });
  const jaw = rb.bone('jaw', head, [0.5, -0.07, 0]);
  rb.part(jaw, (pb) => {
    addRoot(
      pb,
      jaw,
      loft(
        [
          { x: hx + 0.48, y: hy - 0.08, w: 0.12, h: 0.05 },
          { x: hx + 0.64, y: hy - 0.09, w: 0.085, h: 0.04 },
          { x: hx + 0.76, y: hy - 0.09, w: 0.06, h: 0.03 },
        ],
        { radial: 10, sub: 2, cap1: 0.03 },
      ),
      shade(MID, GREY, { noise: 0.03 }),
    );
    addRoot(pb, jaw, blob(0.13, 0.03, 0.07, 8, 5).translate(hx + 0.64, hy - 0.05, 0), () => new THREE.Color(0x8a2a2e), 'skin');
    for (const s of [-1, 1]) {
      addRoot(pb, jaw, cone(0.012, 0.05, 5).translate(hx + 0.73, hy - 0.04, s * 0.045), () => new THREE.Color(0xf4f0e0), 'plastic');
    }
  });

  // ---- legs
  type Leg = { up: THREE.Object3D; low: THREE.Object3D; paw: THREE.Object3D; front: boolean; side: number; l1: number; l2: number };
  const legs: Leg[] = [];
  const legFn = shade(MID, 0x97948e, { mid: 0xd6d1c4, bias: -0.2, sharp: 1.1, noise: 0.05, freq: 8 });
  for (const front of [true, false]) {
    for (const [sd, s] of [['L', 1], ['R', -1]] as const) {
      const k = front ? 'F' : 'R';
      const parent = front ? chest : body;
      const base = front ? SHOULDER : HIP;
      const pp = front ? [0, 1.34] : [-0.5, 1.33];
      const l1 = front ? F_L1 : H_L1;
      const l2 = front ? F_L2 : H_L2;
      const up = rb.bone(`leg${k}${sd}`, parent, [base[0] - pp[0], base[1] - pp[1], s * 0.3]);
      rb.part(up, (pb) => {
        const secs: Sec[] = front
          ? [
              { x: 0.0, y: 0.24, w: 0.17, h: 0.22, hb: 0.2 },
              { x: 0.02, y: 0.0, w: 0.22, h: 0.26, hb: 0.24 },
              { x: 0.0, y: -0.28, w: 0.2, h: 0.2, hb: 0.2 },
              { x: 0.0, y: -l1, w: 0.135, h: 0.135, hb: 0.135 },
            ]
          : [
              { x: 0.0, y: 0.3, w: 0.24, h: 0.36, hb: 0.3 },
              { x: 0.04, y: 0.0, w: 0.27, h: 0.36, hb: 0.32 },
              { x: 0.06, y: -0.3, w: 0.21, h: 0.24, hb: 0.22 },
              { x: 0.0, y: -l1, w: 0.135, h: 0.135, hb: 0.135 },
            ];
        pb.addShaded(loft(secs, { radial: 12, sub: 2, cap0: 0.16, cap1: 0.04 }), legFn, 'fur');
      });
      const low = rb.bone(`lower${k}${sd}`, up, [0, -l1, 0]);
      rb.part(low, (pb) => {
        pb.addShaded(blob(0.168, 0.168, 0.168, 12, 8), legFn, 'fur');
        pb.addShaded(
          loft(
            [
              { x: 0, y: 0, w: 0.135, h: 0.14 },
              { x: 0, y: -l2 * 0.6, w: 0.13, h: 0.13 },
              { x: 0, y: -l2, w: 0.125, h: 0.125 },
            ],
            { radial: 12, sub: 2 },
          ),
          legFn,
          'fur',
        );
      });
      const paw = rb.bone(`paw${k}${sd}`, low, [0, -l2, 0]);
      rb.part(paw, (pb) => {
        pb.addShaded(blob(0.16, 0.14, 0.16, 12, 8), legFn, 'fur', { p: [0.0, -0.02, 0] });
        pb.addShaded(blob(0.2, 0.08, 0.16, 12, 7), legFn, 'fur', { p: [0.06, -PAW_H + 0.075, 0] });
        for (const t of [-1.5, -0.5, 0.5, 1.5]) {
          pb.addShaded(horn(0.05, 0.012, 0.02, 2, 5), () => new THREE.Color(0x3b3833), 'plastic', {
            p: [0.24, -PAW_H + 0.055, t * 0.045],
            r: [0, 0, 1.2],
          });
        }
      });
      legs.push({ up, low, paw, front, side: s, l1, l2 });
    }
  }

  // ---------------------------------------------------------------- ragdoll
  rb.spec.body = { shape: 'capsule', size: [0.5, 0.45], axis: 'x', offset: [-0.42, 0.02, 0], mass: 170 };
  rb.spec.chest = {
    shape: 'capsule', size: [0.5, 0.32], axis: 'x', offset: [0.45, 0.03, 0], mass: 130,
    joint: { kind: 'cone', axis: [1, 0, 0], cone: 0.35, twist: 0.2 },
  };
  rb.spec.head = {
    shape: 'capsule', size: [0.24, 0.26], axis: 'x', offset: [0.42, 0.04, 0], mass: 40,
    joint: { kind: 'cone', axis: [1, 0, 0], cone: 0.6, twist: 0.3 }, gib: true,
  };
  for (const l of legs) {
    const k = l.front ? 'F' : 'R';
    const sd = l.side > 0 ? 'L' : 'R';
    rb.spec[`leg${k}${sd}`] = {
      shape: 'capsule', size: [l.front ? 0.17 : 0.2, l.l1 / 2 - 0.1], axis: 'y', offset: [0, -l.l1 / 2 + 0.02, 0], mass: 16,
      joint: { kind: 'cone', axis: [0, -1, 0], cone: 0.7, twist: 0.2 }, gib: true,
    };
    rb.spec[`lower${k}${sd}`] = {
      shape: 'capsule', size: [0.13, l.l2 / 2], axis: 'y', offset: [0.02, -l.l2 / 2 - 0.04, 0], mass: 11.5,
      joint: { kind: 'hinge', axis: [0, 0, 1] }, gib: true,
    };
  }

  // ---------------------------------------------------------------- animation
  const blink = blinker();
  const seed = Math.random() * 10;
  let runK = 0;
  let rageK = 0;
  let phase = 0;
  let lastDist = NaN;
  const WALK_OFF = { RL: 0, FL: 0.25, RR: 0.5, FR: 0.75 };
  const RUN_OFF = { RL: 0, FL: 0.55, RR: 0.1, FR: 0.45 };
  const rot = (x: number, y: number, t: number): [number, number] => [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];
  const restUp = legs.map((l) => l.up.position.clone());

  const pose = (a: AnimInput) => {
    const time = a.time;
    eyes.scale.y = Math.max(0.1, blink(time));
    const rage = typeof a.params.rage === 'number' ? (a.params.rage as number) : 0;
    rageK = damp(rageK, rage / 3, 3, a.dt);
    runK = damp(runK, a.speed > 7.8 ? 1 : 0, 6, a.dt);
    if (a.dt === 0) runK = a.speed > 7.8 ? 1 : 0;
    const moving = clamp(a.speed / 1.2, 0, 1);

    // gait parameters blended walk -> gallop
    const cycle = lerp(1.75, 3.93, runK);
    // integrate the phase so changing the cycle length does not make feet jump
    const dd = Number.isNaN(lastDist) ? a.distance : a.distance - lastDist;
    lastDist = a.distance;
    phase += (Math.abs(dd) < 5 ? dd : 0) / cycle;
    if (Number.isNaN(phase)) phase = 0;
    const ph = phase * TAU;
    const duty = lerp(0.62, 0.32, runK);
    const stride = cycle * duty * lerp(0.92, 1.25, runK);
    const lift = lerp(0.2, 0.24, runK);
    const bob = lerp(0.035 * Math.sin(ph * 2), 0.07 * Math.sin(ph + 1.2), runK) * moving;
    const crouch = lerp(0.03, -0.06, runK) + 0.03 * rageK;

    body.position.y += bob - crouch;
    // spine flex: galloping bears arch and stretch
    const flex = Math.sin(ph + 0.3) * runK;
    body.rotation.z = (0.012 * Math.sin(ph * 2) * (1 - runK) + 0.07 * flex) * moving;
    body.rotation.x = 0.03 * Math.sin(ph) * (1 - runK) * moving;
    chest.rotation.z = (-0.1 * flex + 0.02 * Math.sin(ph * 2 + 1) * (1 - runK)) * moving - 0.03 * rageK;
    chest.rotation.y = 0.04 * Math.sin(ph) * (1 - runK) * moving;
    // head: swings with the walk, lowered and snarling with rage
    head.rotation.z = -body.rotation.z - chest.rotation.z * 0.6 + 0.05 * Math.sin(ph * 2 + 0.5) * moving - 0.2 * rageK - 0.05 * runK;
    head.rotation.y = 0.07 * Math.sin(ph) * (1 - runK) * moving + 0.06 * wobble(time * 0.5, seed) * (1 - rageK);
    head.position.y -= 0.04 * rageK;
    const snarl = rageK > 0.05 ? 0.12 + 0.18 * rageK + 0.04 * Math.sin(time * 23) * rageK : 0.02 + 0.02 * Math.max(0, Math.sin(time * 1.3));
    jaw.rotation.z = -snarl;

    // legs: IK so planted paws do not slide
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i];
      const key = (l.front ? 'F' : 'R') + (l.side > 0 ? 'L' : 'R');
      const k2 = key as keyof typeof WALK_OFF;
      const off = lerp(WALK_OFF[k2], RUN_OFF[k2], runK);
      const [dx, ly] = footPath(ph / TAU + off, duty, stride * moving, lift * moving);
      // actual hip/shoulder position in root space after the spine pose
      let hp: [number, number];
      if (l.front) {
        const c = rot(restUp[i].x, restUp[i].y, chest.rotation.z);
        hp = rot(chest.position.x + c[0], chest.position.y + c[1], body.rotation.z);
      } else hp = rot(restUp[i].x, restUp[i].y, body.rotation.z);
      hp = [hp[0] + body.position.x, hp[1] + body.position.y];
      const base = l.front ? SHOULDER : HIP;
      const tx = base[0] + dx + (l.front ? 0.03 : 0.02) - hp[0];
      const ty = PAW_H + ly - hp[1];
      // express in the parent's frame (undo spine pitch)
      const pr = l.front ? body.rotation.z + chest.rotation.z : body.rotation.z;
      const cx = tx * Math.cos(-pr) - ty * Math.sin(-pr);
      const cy = tx * Math.sin(-pr) + ty * Math.cos(-pr);
      const [a1, a2] = ik2(l.l1, l.l2, cx, cy, l.front ? 1 : -1);
      l.up.position.copy(restUp[i]);
      l.up.rotation.z = a1;
      l.low.rotation.z = a2;
      // paws stay level on the ice, flex when lifting
      l.paw.rotation.z = -(pr + a1 + a2) + (ly > 0.01 ? (l.front ? -0.5 : 0.4) * Math.min(1, ly / 0.12) : 0);
    }
  };

  return rb.finish('head', animator(rb.bones, pose, 0.3));
}

function rel(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
