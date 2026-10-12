// Baby harp seal ("Vits"): white, fluffy, big black eyes. Wiggles along like
// an inch-worm, stops to sniff, and flails when dropped by an activist.
//
// Bones: body (ragdoll root) > rear (hind body + flippers), body > head > eyes,
// body > flipperL / flipperR.
import * as THREE from 'three';
import {
  RigBuilder, addRoot, animator, blinker, blob, clamp, eye, jointFiller, loft, loftSplit, secAt, shade, wobble, TAU, type Sec,
} from './common';
import type { AnimInput, CreatureRig } from '../types';

const WHITE = 0xfbfcfd;
const MID = 0xe6eef6;
const SHADOW = 0xb4c8dc;

const SPINE: Sec[] = [
  { x: -0.5, y: 0.075, w: 0.045, h: 0.035 },
  { x: -0.41, y: 0.105, w: 0.13, h: 0.085, hb: 0.08 },
  { x: -0.27, y: 0.16, w: 0.21, h: 0.15, hb: 0.145 },
  { x: -0.08, y: 0.205, w: 0.255, h: 0.2, hb: 0.195 },
  { x: 0.1, y: 0.22, w: 0.235, h: 0.185, hb: 0.19 },
  { x: 0.2, y: 0.235, w: 0.18, h: 0.145, hb: 0.15 },
];
const CUT_REAR = 2;
const HEAD_AT = 5;

interface CubBuild {
  rig: CreatureRig;
}

function build(name: string, lod = false): CubBuild {
  const rb = new RigBuilder(name);
  const R = lod ? 12 : 16;
  const fluff = (_p: THREE.Vector3, n: THREE.Vector3) => -n.y * 1.1 - n.x * 0.1;
  const furFn = shade(WHITE, SHADOW, { mid: MID, bias: -0.15, sharp: 1.5, noise: 0.05, freq: 14, fn: fluff });

  const body = rb.bone('body', null, secAt(SPINE, 3));
  const rear = rb.bone('rear', body, rel(secAt(SPINE, CUT_REAR), secAt(SPINE, 3)));
  const head = rb.bone('head', body, rel(secAt(SPINE, HEAD_AT), secAt(SPINE, 3)));

  const [gRear, gBody] = loftSplit(SPINE, [CUT_REAR], { radial: R, sub: lod ? 2 : 3, cap0: 0.03, cap1: 0.05, bump: 0.035, bumpFreq: 22, overlap: 0 });
  rb.part(rear, (pb) => {
    addRoot(pb, rear, gRear, furFn);
    for (const s of [-1, 1]) {
      const fl = loft(
        [
          { x: 0, y: 0, w: 0.025, h: 0.012 },
          { x: -0.05, y: 0.0, w: 0.04, h: 0.009 },
          { x: -0.09, y: 0.006, w: 0.048, h: 0.006 },
        ],
        { radial: 6, sub: 1, cap0: 0.008, cap1: 0.018 },
      );
      fl.rotateZ(0.25);
      fl.rotateY(s * 0.5);
      fl.translate(-0.48, 0.07, s * 0.02);
      addRoot(pb, rear, fl, shade(0xe9eef4, 0xb9c6d4, { noise: 0.03 }), 'skin');
    }
  });
  rb.part(body, (pb) => {
    addRoot(pb, body, gBody, furFn);
    addRoot(pb, body, jointFiller(SPINE, CUT_REAR), furFn);
  });

  // ---- head: round, big black eyes, black nose
  const hx = SPINE[HEAD_AT].x;
  const hy = SPINE[HEAD_AT].y;
  rb.part(head, (pb) => {
    const headFn = shade(WHITE, 0xc4d4e4, { mid: MID, bias: -0.25, sharp: 1.4, noise: 0.05, freq: 16 });
    addRoot(pb, head, blob(0.15, 0.135, 0.165, 10, 8, 0.03, 24).translate(hx, hy, 0), furFn);
    addRoot(pb, head, blob(0.165, 0.15, 0.155, R, lod ? 9 : 12, 0.03, 24).translate(hx + 0.11, hy + 0.05, 0), headFn);
    addRoot(pb, head, blob(0.085, 0.07, 0.085, 12, 9, 0.02, 24).translate(hx + 0.24, hy + 0.0, 0), headFn);
    addRoot(pb, head, blob(0.022, 0.018, 0.028, 8, 6).translate(hx + 0.32, hy + 0.012, 0), () => new THREE.Color(0x0b0b0d), 'skin');
    // mouth line
    addRoot(pb, head, blob(0.035, 0.006, 0.03, 6, 4).translate(hx + 0.29, hy - 0.035, 0), () => new THREE.Color(0x6b7380), 'skin');
  });
  const eyes = rb.bone('eyes', head, [0.19, 0.08, 0]);
  rb.part(eyes, (pb) => {
    for (const s of [-1, 1]) eye(pb, [0, 0, s * 0.112], 0.04, 0x050506);
  });

  // ---- small front flippers
  for (const [nm, s] of [['flipperL', 1], ['flipperR', -1]] as const) {
    const f = rb.bone(nm, body, [0.12, -0.1, s * 0.19]);
    rb.part(f, (pb) => {
      pb.addShaded(
        loft(
          [
            { x: 0, y: 0.02, w: 0.025, h: 0.035 },
            { x: -0.035, y: -0.04, w: 0.015, h: 0.036 },
            { x: -0.08, y: -0.075, w: 0.009, h: 0.03 },
          ],
          { radial: 7, sub: 1, cap0: 0.012, cap1: 0.02 },
        ),
        shade(0xf2f5f9, 0xb7c7d8, { noise: 0.03 }),
        'fur',
      );
    });
  }

  // ---------------------------------------------------------------- ragdoll
  rb.spec.body = { shape: 'capsule', size: [0.19, 0.1], axis: 'x', offset: [0.02, 0, 0], mass: 9 };
  rb.spec.rear = {
    shape: 'capsule', size: [0.11, 0.08], axis: 'x', offset: [-0.11, -0.04, 0], mass: 3.5,
    joint: { kind: 'cone', axis: [-1, 0, 0], cone: 0.6, twist: 0.25 },
  };
  rb.spec.head = {
    shape: 'sphere', size: [0.15], offset: [0.13, 0.04, 0], mass: 2.5,
    joint: { kind: 'cone', axis: [1, 0, 0], cone: 0.7, twist: 0.4 }, gib: true,
  };

  // ---------------------------------------------------------------- animation
  const blink = blinker();
  const fl = rb.get('flipperL');
  const fr = rb.get('flipperR');
  const seed = Math.random() * 10;

  const pose = (a: AnimInput) => {
    const time = a.time;
    eyes.scale.y = Math.max(0.08, blink(time));
    if (a.state === 'drop') {
      // Falling out of the activist's arms: flailing.
      const t = a.stateTime;
      const f = Math.sin(t * 34);
      body.rotation.z = 0.25 * Math.sin(t * 9) + 0.15;
      body.rotation.x = 0.15 * Math.sin(t * 7 + 1);
      head.rotation.z = 0.35 + 0.25 * Math.sin(t * 13);
      head.rotation.y = 0.3 * Math.sin(t * 11);
      rear.rotation.z = -0.4 * Math.sin(t * 15 + 0.5);
      fl.rotation.x = -0.9 - 0.6 * f;
      fr.rotation.x = 0.9 + 0.6 * f;
      fl.rotation.z = fr.rotation.z = 0.6 * Math.sin(t * 21);
      eyes.scale.y = 1.15;
      return;
    }
    if (a.state === 'sniff') {
      // Raise the head (hit shape lift: 0.06 * max(0, sin(ticks * 0.12))),
      // twitch the nose and look around (towards the viewer and back).
      const ticks = a.stateTime * 50;
      const lift = Math.max(0, Math.sin(ticks * 0.12));
      const twitch = Math.sin(time * 38) * 0.035 * lift;
      const look = Math.sin(clamp(a.stateTime / 2.96, 0, 1) * TAU) * 0.7;
      head.rotation.z = 0.32 * lift + twitch;
      head.position.y += 0.035 * lift;
      head.rotation.y = look + 0.1 * wobble(time, seed);
      head.rotation.x = -0.15 * look;
      body.rotation.z = 0.05 * lift;
      fl.rotation.z = fr.rotation.z = -0.1 * lift;
      return;
    }
    // walk: inch-worm wiggle; rear humps up and pulls forward, front pushes.
    const moving = clamp(a.speed / 0.6, 0, 1);
    const ph = a.distance * (TAU / 0.55);
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const amp = 0.25 + 0.75 * moving;
    body.rotation.z = 0.07 * amp * c;
    body.position.y += 0.015 * amp * Math.max(0, s);
    body.position.x += 0.03 * amp * s;
    rear.rotation.z = 0.28 * amp * Math.max(0, Math.sin(ph - 0.6)) - body.rotation.z;
    rear.rotation.y = 0.1 * amp * Math.sin(ph * 0.5);
    head.rotation.z = -body.rotation.z * 0.8 + 0.06 * amp * s + 0.04 * wobble(time * 0.8, seed);
    head.rotation.y = 0.12 * wobble(time * 0.4, seed + 2);
    fl.rotation.z = fr.rotation.z = -body.rotation.z - 0.5 * amp * c;
    fl.rotation.x = -0.35;
    fr.rotation.x = 0.35;
  };

  return { rig: rb.finish('head', animator(rb.bones, pose)) };
}

export function createCub(): CreatureRig {
  return build('cub').rig;
}

/** A static cub (rest pose), e.g. for a cub shot out of an activist's arms. */
export function createCorpseCub(): THREE.Group {
  const rig = build('cubCorpse').rig;
  rig.animate({ state: 'walk', stateTime: 0, time: 0, distance: 0, speed: 0, dt: 0, params: {} });
  return rig.root;
}

/** Cub rig used inside an activist's arms (same model, its own animation). */
export function createHeldCub(lod = true): CreatureRig {
  return build('heldCub', lod).rig;
}

function rel(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
