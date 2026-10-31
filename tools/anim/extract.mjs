// Bakes the zombie animation set onto the ragdoll skeleton: src/tower/anim/clips.js.
//
//   node tools/anim/extract.mjs [--ual1 <zip|glb>] [--ual2 <zip|glb>] [--out <file>] [--verbose]
//
// Sources (CC0 1.0): Quaternius "Universal Animation Library" 1 & 2, Standard editions. Pass the
// downloaded zips (or the .glb inside) once; the .glb files are cached in tools/anim/cache/
// (gitignored). The archives are parsed as data only (tools/anim/zip.mjs, glb.mjs).
//
// Pipeline per clip: sample at 30 fps -> retarget (retarget.mjs) -> zombie styling (style.mjs) ->
// clamp into the ragdoll's joint limits -> ground alignment, stance contacts, ground speed and
// footstep events (analyze.mjs) -> quantise and write. Procedural clips (crawl, climb, limps) are
// authored in procedural.mjs on the same skeleton.
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGlb } from './glb.mjs';
import { readZipMember } from './zip.mjs';
import { SourceRig } from './rig.mjs';
import { Retargeter } from './retarget.mjs';
import { SK, N, clampPose, limitExcess, getQ, setQ, clonePose } from './target.mjs';
import { analyzeGround, liftOutOfGround, seamError } from './analyze.mjs';
import { slerpQ } from './edit.mjs';
import { STYLES } from './style.mjs';
import { PROCEDURAL } from './procedural.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const VERBOSE = args.includes('--verbose');
const OUT = resolve(ROOT, opt('out', 'src/tower/anim/clips.js'));
const FPS = 30;

const CACHE = {
  ual1: resolve(HERE, 'cache/ual1/AnimationLibrary_Godot_Standard.glb'),
  ual2: resolve(HERE, 'cache/ual2/UAL2_Standard.glb'),
};
const MEMBER = { ual1: 'Godot/AnimationLibrary_Godot_Standard.glb', ual2: 'Unreal-Godot/UAL2_Standard.glb' };

function loadSource(key) {
  const given = opt(key);
  if (given && given.endsWith('.zip')) {
    const bytes = readZipMember(given, MEMBER[key]);
    mkdirSync(dirname(CACHE[key]), { recursive: true });
    writeFileSync(CACHE[key], bytes);
  }
  const path = given && given.endsWith('.glb') ? given : CACHE[key];
  if (!existsSync(path)) throw new Error(`missing ${key}: pass --${key} <zip|glb> (see the header of this file)`);
  return new SourceRig(parseGlb(readFileSync(path), path));
}

/** Clip table: name -> source and treatment. */
const SPECS = [
  { name: 'walk', src: 'ual2', clip: 'Zombie_Walk_Fwd_Loop', loop: true, ground: true, style: 'zombieWalk' },
  { name: 'idle', src: 'ual2', clip: 'Zombie_Idle_Loop', loop: true, ground: true, speed: 0 },
  { name: 'attack', src: 'ual2', clip: 'Zombie_Scratch', loop: true, ground: true, speed: 0, events: 'scratch' },
  { name: 'push', src: 'ual1', clip: 'Push_Loop', loop: true, ground: true, style: 'push' },
  // the jog and sprint sweep their stance feet back at ~5.3 and ~8.6 m/s (very long strides for
  // their cadence); the reported speeds are the ones they look right at with the player's stance
  // foot locking (cadence x a natural step length)
  { name: 'jog', src: 'ual1', clip: 'Jog_Fwd_Loop', loop: true, ground: true, style: 'feralJog', designSpeed: 3.0 },
  { name: 'sprint', src: 'ual1', clip: 'Sprint_Loop', loop: true, ground: true, style: 'feralSprint', designSpeed: 4.4 },
  { name: 'walk2', src: 'ual1', clip: 'Walk_Loop', loop: true, ground: true, style: 'shamble' },
  { name: 'vault', src: 'ual2', clip: 'ClimbUp_1m_RM', loop: false, ground: false, rootMotion: true },
  { name: 'getup', src: 'ual2', clip: 'LayToIdle', loop: false, ground: true, getup: true },
];

function sampleClip(rig, rt, spec) {
  const anim = rig.g.animation(spec.clip);
  const F = Math.round(anim.duration * FPS);
  const count = spec.loop ? F : F + 1;
  const poses = [];
  for (let i = 0; i < count; i++) {
    const src = rig.pose(anim, (i / F) * anim.duration);
    const p = rt.retarget(src);
    // the source never bends at spine_01: share the trunk bend between our lumbar and thoracic joints
    setQ(p, SK.index.abdomen, slerpQ(getQ(p, SK.index.pelvis), getQ(p, SK.index.chest), 0.42));
    poses.push(p);
  }
  return { poses, duration: anim.duration, F };
}

function processClip(spec, poses, duration) {
  const F = poses.length;
  const info = { name: spec.name, loop: !!spec.loop, ground: !!spec.ground, duration, frames: F, fps: FPS, speed: 0, rootMotion: null, events: [] };
  // root motion -> per-frame root track relative to the start (pose stays relative to the root)
  if (spec.rootMotion) {
    const r0 = poses[0].root;
    info.root = poses.map((p) => [p.root[0] - r0[0], p.root[1] - r0[1], p.root[2] - r0[2]]);
    const last = info.root[info.root.length - 1];
    info.rootMotion = { dx: last[0], dy: last[1], dz: last[2] };
  }
  if (spec.style && STYLES[spec.style]) poses.forEach((p, i) => STYLES[spec.style](p, i / (spec.loop ? F : F - 1), info));
  let worst = 0;
  for (const p of poses) {
    const ex = limitExcess(p);
    for (const k in ex) worst = Math.max(worst, ex[k]);
    clampPose(p);
  }
  info.preClampExcessDeg = +(worst * 57.2958).toFixed(1);
  if (spec.ground) {
    let g;
    if (spec.getup) {
      // stand the end of the clip on the ground, then lift the lying part out of it
      const tail = poses.slice(Math.floor(F * 0.8));
      const ga = analyzeGround(tail, FPS, { loop: false, speed: 0 });
      for (const p of poses.slice(0, Math.floor(F * 0.8))) p.pelvis[1] += ga.dy;
      info.lift = +liftOutOfGround(poses, 0.0).toFixed(3);
      g = analyzeGround(poses, FPS, { loop: false, speed: 0, noShift: true });
    } else {
      g = analyzeGround(poses, FPS, { loop: spec.loop, speed: spec.speed, byHeight: !!spec.designSpeed });
    }
    for (const p of poses) clampPose(p);
    info.measuredSpeed = +g.speed.toFixed(3);
    info.speed = +(spec.designSpeed ?? g.speed).toFixed(3);
    info.contact = g.contact;
    info.events.push(...g.events);
    info.dy = +g.dy.toFixed(3);
  }
  if (spec.events === 'scratch') info.events.push(...scratchEvents(poses));
  if (spec.loop) {
    const s = seamError(poses);
    info.seamDeg = +(s.seam * 57.2958).toFixed(2);
    info.maxStepDeg = +(s.maxStep * 57.2958).toFixed(2);
  }
  return info;
}

/** Attack contact: the frame where a hand moves fastest forward-down (the swipe). */
function scratchEvents(poses) {
  const F = poses.length;
  const hands = ['handL', 'handR'].map((n) => SK.index[n]);
  let best = { v: 0, i: 0, h: 'L' };
  const pos = poses.map((p) => {
    const J = new Float64Array(N * 3), P = new Float64Array(N * 3);
    fkPose(p, J, P);
    return P;
  });
  for (let i = 0; i < F; i++) {
    hands.forEach((hi, k) => {
      const a = pos[(i - 1 + F) % F], b = pos[(i + 1) % F];
      const vz = (b[hi * 3 + 2] - a[hi * 3 + 2]) * FPS / 2, vy = (b[hi * 3 + 1] - a[hi * 3 + 1]) * FPS / 2;
      const v = vz - 0.5 * vy;
      if (v > best.v) best = { v, i, h: k ? 'R' : 'L' };
    });
  }
  return [{ t: best.i / FPS, type: 'hit', hand: best.h }];
}

import { fk } from '../../src/tower/anim/skeleton.js';
function fkPose(p, J, P) {
  fk(SK, p.rot, p.pelvis[0], p.pelvis[1], p.pelvis[2], SK.bind, J, P);
}

// ------------------------------------------------------------------------------------------------
// quantisation / output
const Q_ROT = 32767, Q_POS = 4000; // 0.25 mm

function encode(poses, info) {
  const F = poses.length;
  const stride = N * 4 + 3 + (info.root ? 3 : 0);
  const a = new Int16Array(F * stride);
  poses.forEach((p, f) => {
    let o = f * stride;
    for (let i = 0; i < N; i++) {
      let q = getQ(p, i);
      if (q[3] < 0) q = q.map((v) => -v);
      for (let c = 0; c < 4; c++) a[o++] = Math.round(q[c] * Q_ROT);
    }
    for (let c = 0; c < 3; c++) a[o++] = Math.round(p.pelvis[c] * Q_POS);
    if (info.root) for (let c = 0; c < 3; c++) a[o++] = Math.round(info.root[f][c] * Q_POS);
  });
  const contact = new Uint8Array(F * 2);
  if (info.contact) {
    for (let f = 0; f < F; f++) {
      contact[f * 2] = Math.round(info.contact.L[f] * 255);
      contact[f * 2 + 1] = Math.round(info.contact.R[f] * 255);
    }
  }
  return { data: Buffer.from(a.buffer).toString('base64'), contact: Buffer.from(contact.buffer).toString('base64') };
}

function main() {
  const rigs = { ual1: loadSource('ual1'), ual2: loadSource('ual2') };
  const rts = { ual1: new Retargeter(rigs.ual1), ual2: new Retargeter(rigs.ual2) };
  const out = {};
  const report = [];
  for (const spec of SPECS) {
    const { poses, duration } = sampleClip(rigs[spec.src], rts[spec.src], spec);
    const raw = poses.map(clonePose);
    const info = processClip(spec, poses, duration);
    out[spec.name] = { info, poses, raw };
    report.push(info);
  }
  // procedural clips get the retargeted ones as material (e.g. a limp starts from a walk)
  for (const [name, make] of Object.entries(PROCEDURAL)) {
    const r = make({ clips: out, FPS });
    const info = { name, loop: r.loop, ground: r.ground, duration: r.poses.length / FPS, frames: r.poses.length, fps: FPS, speed: 0, rootMotion: r.rootMotion || null, events: [], procedural: true, ...r.info };
    let worst = 0;
    for (const p of r.poses) {
      const ex = limitExcess(p);
      for (const k in ex) worst = Math.max(worst, ex[k]);
      clampPose(p);
    }
    info.preClampExcessDeg = +(worst * 57.2958).toFixed(1);
    if (r.ground) {
      const g = analyzeGround(r.poses, FPS, { loop: r.loop, speed: r.speed, noShift: r.noShift, contactH: r.contactH, noCleanup: r.noCleanup });
      for (const p of r.poses) clampPose(p);
      info.speed = +g.speed.toFixed(3);
      info.contact = g.contact;
      info.events.push(...g.events);
    } else if (r.speed !== undefined) info.speed = r.speed;
    if (r.contact) info.contact = r.contact;
    if (r.events) info.events.push(...r.events);
    if (r.loop) {
      const s = seamError(r.poses);
      info.seamDeg = +(s.seam * 57.2958).toFixed(2);
      info.maxStepDeg = +(s.maxStep * 57.2958).toFixed(2);
    }
    if (!info.duration) info.duration = r.poses.length / FPS;
    out[name] = { info, poses: r.poses };
    report.push(info);
  }
  writeClips(out);
  for (const r of report) {
    const { contact, root, lows, ...rest } = r;
    console.log(r.name.padEnd(7), JSON.stringify({ ...rest, events: r.events.length }));
    if (VERBOSE) console.log('   events', JSON.stringify(r.events));
  }
}

function writeClips(out) {
  const lines = [];
  lines.push('// LAST LOOKOUT - zombie animation clips, retargeted onto the ragdoll skeleton and baked by');
  lines.push('// tools/anim/extract.mjs. Generated file: do not edit by hand.');
  lines.push('//');
  lines.push('// Animations: Quaternius, Universal Animation Library 1 & 2 (CC0)');
  lines.push('//   (https://quaternius.com - CC0 1.0 Universal, public domain dedication). crawl, climb, limpL');
  lines.push('//   and limpR are authored procedurally in tools/anim/procedural.mjs.');
  lines.push('//');
  lines.push('// Per clip: fps, frames, loop, duration (s), speed (m/s of ground travel at rate 1; vertical for');
  lines.push('// climb), ground (feet are planted on the root height), rootMotion ({dx,dy,dz} over the clip,');
  lines.push('// with a per-frame root track), events, and base64 data: per frame 17 segment rotations');
  lines.push(`// (x,y,z,w int16 /${Q_ROT}) in SEGMENTS order, the pelvis body position (int16 /${Q_POS} m), then the`);
  lines.push('// root track (same units) for root-motion clips. contact: per frame, stance weight of the left and');
  lines.push('// right foot (uint8 /255).');
  lines.push(`export const SEGMENTS = ${JSON.stringify(SK.names)};`);
  lines.push(`export const Q_ROT = ${Q_ROT};`);
  lines.push(`export const Q_POS = ${Q_POS};`);
  lines.push('export const CLIPS = {');
  for (const [name, { info, poses }] of Object.entries(out)) {
    const enc = encode(poses, info);
    const meta = {
      fps: FPS, frames: poses.length, loop: info.loop, duration: +info.duration.toFixed(4), speed: info.speed,
      ground: info.ground, rootMotion: info.rootMotion ? { dx: +info.rootMotion.dx.toFixed(3), dy: +info.rootMotion.dy.toFixed(3), dz: +info.rootMotion.dz.toFixed(3) } : null,
      events: info.events.map((e) => ({ ...e, t: +e.t.toFixed(4) })),
    };
    if (info.extra) Object.assign(meta, info.extra);
    const m = JSON.stringify(meta).slice(1, -1);
    lines.push(`  ${name}: { ${m},`);
    lines.push(`    contact: '${enc.contact}',`);
    lines.push(`    data: '${enc.data}' },`);
  }
  lines.push('};');
  writeFileSync(OUT, lines.join('\n') + '\n');
  console.log('wrote', OUT, (lines.join('\n').length / 1024).toFixed(1) + ' KB');
}

main();
