import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Quat, Vec3 } from '../src/physics/math.js';
import { World } from '../src/physics/world.js';
import { Ragdoll } from '../src/human/ragdoll.js';
import { decomposeSwingTwist } from '../src/physics/joints.js';
import { AnimPlayer, CLIP_INFO, _clipData } from '../src/tower/anim/animPlayer.js';
import { skeleton } from '../src/tower/anim/skeleton.js';

const world = new World();
const CLIPS = Object.keys(CLIP_INFO);
const GROUND = CLIPS.filter((c) => CLIP_INFO[c].ground);
const D2R = Math.PI / 180;

function makePlayer(seed = 1, clip = 'walk') {
  const rd = new Ragdoll(world);
  const player = new AnimPlayer(rd, { seed });
  player.play(clip, { fade: 0 });
  return { rd, player, root: { pos: { x: 0, y: 0, z: 0 }, yaw: 0 } };
}

/** Advance a zombie on `clip` for `seconds`, the root travelling at the clip's speed; cb per frame. */
function drive(z, clip, seconds, cb, dt = 1 / 60) {
  const info = CLIP_INFO[clip];
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    const v = info.speed * z.player.rate * z.player.var.rate;
    if (clip === 'climb') z.root.pos.y += v * dt;
    else if (!info.rootMotion) {
      z.root.pos.x += Math.sin(z.root.yaw) * v * dt;
      z.root.pos.z += Math.cos(z.root.yaw) * v * dt;
    }
    z.player.update(dt, z.root);
    if (cb) cb(i * dt);
  }
}

const _q = new Quat();
/** Largest joint-limit excess (rad) of a ragdoll's current pose, with the joint's name. */
function worstExcess(rd) {
  let worst = { e: 0, name: '' };
  for (const j of rd.jointList) {
    j.jointRotation(_q);
    const d = decomposeSwingTwist(_q.canonical(), j.swingInChildFrame, { twist: 0, sx: 0, sz: 0 });
    const L = j.limits;
    let e = Math.max(0, L.twist[0] - d.twist, d.twist - L.twist[1]);
    if (L.mode === 'box') e = Math.max(e, L.swingX[0] - d.sx, d.sx - L.swingX[1], L.swingZ[0] - d.sz, d.sz - L.swingZ[1]);
    else {
      const ex = d.sx / (d.sx >= 0 ? L.swingX[1] : -L.swingX[0]);
      const ez = d.sz / (d.sz >= 0 ? L.swingZ[1] : -L.swingZ[0]);
      const r = Math.hypot(ex, ez);
      if (r > 1) e = Math.max(e, Math.hypot(d.sx, d.sz) * (1 - 1 / r));
    }
    if (e > worst.e) worst = { e, name: j.name };
  }
  return worst;
}

const _v = new Vec3();
/** Lowest sole corner of a foot body (world y). */
function soleY(rd, side) {
  const sk = skeleton(rd);
  const b = rd.segments['foot' + side].body;
  const bp = rd.segments['foot' + side].bindPos;
  let low = Infinity;
  for (const c of sk.legs[side].sole) {
    _v.set(c[0] - bp.x, c[1] - bp.y, c[2] - bp.z).applyQuat(b.rot).add(b.pos);
    low = Math.min(low, _v.y);
  }
  return low;
}

/** Lowest point of any segment's collision shapes. */
function lowestBody(rd) {
  let low = Infinity;
  for (const b of rd.bodies) {
    for (const s of b.shapes) {
      s.updateWorld(b.pos, b.rot);
      low = Math.min(low, s.aabbMin.y);
    }
  }
  return low;
}

// ------------------------------------------------------------------------------------------------

test('every clip named in the contract is baked, with sane metadata', () => {
  for (const c of ['walk', 'idle', 'attack', 'push', 'jog', 'sprint', 'walk2', 'vault', 'getup', 'crawl', 'climb', 'limpL', 'limpR']) {
    const i = CLIP_INFO[c];
    assert.ok(i, `clip ${c}`);
    assert.ok(i.duration > 0.3 && i.duration < 4, `${c} duration ${i.duration}`);
    assert.equal(typeof i.loop, 'boolean');
  }
  assert.equal(CLIP_INFO.vault.loop, false);
  assert.equal(CLIP_INFO.getup.loop, false);
  assert.ok(CLIP_INFO.vault.rootMotion && CLIP_INFO.vault.rootMotion.dy > 0.8 && CLIP_INFO.vault.rootMotion.dz > 1);
});

test('root speeds are sane (m/s at rate 1)', () => {
  const range = {
    walk: [0.5, 1.4], walk2: [0.5, 1.4], limpL: [0.4, 1.3], limpR: [0.4, 1.3], push: [0.1, 0.7],
    jog: [1.5, 4], sprint: [2.5, 6], crawl: [0.2, 0.8], climb: [0.3, 1.0], idle: [0, 0], attack: [0, 0],
  };
  for (const [c, [lo, hi]] of Object.entries(range)) {
    const s = CLIP_INFO[c].speed;
    assert.ok(s >= lo && s <= hi, `${c} speed ${s} outside [${lo}, ${hi}]`);
  }
  const z = makePlayer(3, 'walk');
  assert.ok(Math.abs(z.player.rateFor('walk', CLIP_INFO.walk.speed * 1.2) - 1.2) < 1e-9);
});

test('looping clips wrap seamlessly', () => {
  const rd = new Ragdoll(world);
  const p = new AnimPlayer(rd, { seed: 1 });
  const sk = skeleton(rd);
  const n = sk.n;
  const a = new Float64Array(n * 4), b = new Float64Array(n * 4), pa = new Float64Array(3), pb = new Float64Array(3);
  const step = (clip, t0, t1) => {
    p.sampleClip(clip, t0, a, pa);
    p.sampleClip(clip, t1, b, pb);
    let m = 0;
    for (let i = 0; i < n; i++) {
      let d = 0;
      for (let k = 0; k < 4; k++) d += a[i * 4 + k] * b[i * 4 + k];
      m = Math.max(m, 2 * Math.acos(Math.min(1, Math.abs(d))));
    }
    return { rot: m, pos: Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]) };
  };
  for (const clip of CLIPS.filter((c) => CLIP_INFO[c].loop)) {
    const D = CLIP_INFO[clip].duration, h = 1 / 30;
    const seam = step(clip, D - h, D); // the clip's last key to its first, through the wrap
    const before = step(clip, D - 2 * h, D - h), after = step(clip, 0, h);
    const ref = Math.max(before.rot, after.rot);
    assert.ok(seam.rot <= ref * 1.6 + 2 * D2R, `${clip}: seam step ${(seam.rot / D2R).toFixed(1)} deg vs ${(ref / D2R).toFixed(1)} deg around it`);
    const refP = Math.max(before.pos, after.pos);
    assert.ok(seam.pos <= refP * 1.6 + 0.004, `${clip}: pelvis seam step ${(seam.pos * 100).toFixed(1)} cm vs ${(refP * 100).toFixed(1)} cm`);
    // and the wrap is continuous in time: sampling just before and just after the end agree
    const tiny = step(clip, D - 1e-4, 1e-4);
    assert.ok(tiny.rot < 3 * D2R, `${clip}: discontinuous at the wrap (${(tiny.rot / D2R).toFixed(1)} deg)`);
  }
});

test('poses stay inside the ragdoll joint limits (< 10 deg overshoot), with per-zombie variation', () => {
  let worst = { e: 0, name: '', clip: '' };
  for (const clip of CLIPS) {
    for (const seed of [1, 7, 23, 101]) {
      const z = makePlayer(seed, clip);
      drive(z, clip, Math.min(3, CLIP_INFO[clip].duration * 2), () => {
        const w = worstExcess(z.rd);
        if (w.e > worst.e) worst = { ...w, clip, seed };
      });
    }
  }
  assert.ok(worst.e < 10 * D2R, `worst joint overshoot ${(worst.e / D2R).toFixed(1)} deg at ${worst.name} (${worst.clip}, seed ${worst.seed})`);
});

test('stance feet are on the ground (±3 cm) and nothing sinks into it', () => {
  for (const clip of GROUND.filter((c) => c !== 'getup')) {
    for (const seed of [2, 9]) {
      const z = makePlayer(seed, clip);
      let worstStance = 0, lowest = Infinity, stanceFrames = 0;
      drive(z, clip, 2.5, (t) => {
        if (t < 0.3) return;
        for (const f of z.player.feet) {
          if (z.player.contact[f.k] < 0.9) continue;
          stanceFrames++;
          worstStance = Math.max(worstStance, Math.abs(soleY(z.rd, f.side)));
        }
        lowest = Math.min(lowest, lowestBody(z.rd));
      });
      assert.ok(stanceFrames > 12, `${clip}: stance detected (${stanceFrames} foot-frames)`);
      assert.ok(worstStance <= 0.03, `${clip} seed ${seed}: stance sole ${(worstStance * 100).toFixed(1)} cm off the ground`);
      assert.ok(lowest > -0.03, `${clip} seed ${seed}: body ${(-lowest * 100).toFixed(1)} cm under the ground`);
    }
  }
  // the prone crawl and the get-up rest on the ground, not in it
  for (const clip of ['crawl', 'getup']) {
    const z = makePlayer(4, clip);
    let lowest = Infinity;
    drive(z, clip, CLIP_INFO[clip].duration, () => (lowest = Math.min(lowest, lowestBody(z.rd))));
    assert.ok(lowest > -0.03, `${clip}: ${(-lowest * 100).toFixed(1)} cm under the ground`);
  }
});

test('locked stance feet do not slide while the root moves at the clip speed', () => {
  for (const clip of ['walk', 'walk2', 'jog', 'limpR', 'push']) {
    const z = makePlayer(5, clip);
    let worst = 0;
    const lock = [null, null];
    drive(z, clip, 3, () => {
      z.player.feet.forEach((f, k) => {
        if (!f.locked) {
          lock[k] = null;
          return;
        }
        const J = z.player.joint, a = z.player.sk.legs[f.side].foot * 3;
        if (!lock[k]) lock[k] = [J[a], J[a + 2]];
        worst = Math.max(worst, Math.hypot(J[a] - lock[k][0], J[a + 2] - lock[k][1]));
      });
    });
    assert.ok(worst < 0.01, `${clip}: a locked foot slid ${(worst * 100).toFixed(1)} cm`);
  }
});

test('no NaN; finite velocities for the physics hand-off, for any frame time', () => {
  for (const clip of CLIPS) {
    const z = makePlayer(11, clip);
    const dts = [0.0005, 1 / 120, 1 / 60, 1 / 30, 0.05, 0.002];
    for (let i = 0; i < 240; i++) {
      const dt = dts[i % dts.length];
      z.root.yaw += 0.01;
      z.root.pos.z += CLIP_INFO[clip].speed * dt;
      z.player.update(dt, z.root);
      for (const b of z.rd.bodies) {
        assert.ok(b.pos.isFinite() && b.rot.isFinite() && b.vel.isFinite() && b.angVel.isFinite(), `${clip}: non-finite body state`);
        assert.ok(b.vel.length() <= 25.001 && b.angVel.length() <= 40.001, `${clip}: velocity out of range`);
        assert.ok(Math.abs(b.rot.lengthSq() - 1) < 1e-6);
      }
    }
  }
});

test('velocities match the motion (finite differences of the posed bodies)', () => {
  const z = makePlayer(6, 'walk');
  drive(z, 'walk', 1);
  const prev = z.rd.bodies.map((b) => b.pos.clone());
  const dt = 1 / 60;
  z.root.pos.z += CLIP_INFO.walk.speed * dt;
  z.player.update(dt, z.root);
  z.rd.bodies.forEach((b, i) => {
    const v = b.pos.clone().sub(prev[i]).scale(1 / dt);
    assert.ok(v.distanceTo(b.vel) < 1e-6);
    assert.ok(b.framePos.distanceTo(prev[i]) < 1e-9, 'framePos holds the previous pose');
  });
  // the pelvis moves forward at about the walking speed
  const s = z.rd.pelvis.vel.z;
  assert.ok(s > 0.2 && s < 2.5, `pelvis velocity ${s}`);
});

test('blendFromPhysics eases a fallen body back into the clip and converges to it', () => {
  // a body lying on its back, as the physics might leave it
  const z = makePlayer(8, 'idle');
  const lying = new Ragdoll(world, { position: new Vec3(1.5, 0, -2), yaw: 0.7 });
  const q = new Quat().setFromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2);
  lying.segList.forEach((s, i) => {
    const b = lying.bodies[i];
    const p = b.pos.clone().sub(new Vec3(1.5, 0, -2)).applyQuat(q).add(new Vec3(1.5, 0.12, -2));
    z.rd.bodies[i].setPose(p, new Quat().multiplyQuats(q, b.rot));
  });
  const root = { pos: { x: 0, y: 0, z: 0 }, yaw: 0 };
  z.player.rootFromBodies(root, 'getup');
  assert.ok(Math.hypot(root.pos.x - 1.5, root.pos.z + 2) < 1.2, `root near the body (${root.pos.x.toFixed(2)}, ${root.pos.z.toFixed(2)})`);
  const before = z.rd.bodies.map((b) => b.pos.clone());
  z.player.play('getup', { fade: 0 });
  z.player.blendFromPhysics(0.5);
  z.player.update(1 / 60, root);
  // the first frame barely moves the body (it starts from what the physics left)
  const jump = Math.max(...z.rd.bodies.map((b, i) => b.pos.distanceTo(before[i])));
  assert.ok(jump < 0.08, `first blended frame jumps ${(jump * 100).toFixed(1)} cm`);
  for (let i = 0; i < 40; i++) z.player.update(1 / 60, root);
  // after the blend, the pose is the clip's own: compare with a zombie that never left it
  const ref = makePlayer(8, 'getup');
  ref.player.play('getup', { fade: 0, restart: true });
  ref.player.layers[0].t = z.player.time;
  ref.player.update(0, { pos: { ...root.pos }, yaw: root.yaw });
  let dp = 0, dq = 0;
  z.rd.bodies.forEach((b, i) => {
    dp = Math.max(dp, b.pos.distanceTo(ref.rd.bodies[i].pos));
    dq = Math.max(dq, 2 * Math.acos(Math.min(1, Math.abs(b.rot.dot(ref.rd.bodies[i].rot)))));
  });
  assert.ok(dp < 0.02 && dq < 2 * D2R, `converged to the clip (${(dp * 100).toFixed(1)} cm, ${(dq / D2R).toFixed(1)} deg)`);
});

test('rootFromBodies recovers the root of an animated pose', () => {
  for (const clip of ['walk', 'crawl', 'getup']) {
    const z = makePlayer(12, clip);
    z.root.pos.x = 3;
    z.root.pos.z = -4;
    z.root.yaw = 2.1;
    z.player.update(0, z.root);
    const out = { pos: { x: 0, y: 0, z: 0 }, yaw: 0 };
    z.player.rootFromBodies(out);
    const dyaw = Math.abs(Math.atan2(Math.sin(out.yaw - 2.1), Math.cos(out.yaw - 2.1)));
    assert.ok(dyaw < 0.05, `${clip}: yaw off by ${dyaw.toFixed(3)}`);
    assert.ok(Math.hypot(out.pos.x - 3, out.pos.z + 4) < 0.05, `${clip}: root off by ${Math.hypot(out.pos.x - 3, out.pos.z + 4).toFixed(3)} m`);
  }
});

test('events: footsteps while walking, a hit in the attack, root motion in the vault', () => {
  const z = makePlayer(1, 'walk');
  const seen = { L: 0, R: 0 };
  drive(z, 'walk', 4, () => {
    for (const e of z.player.events) if (e.type === 'footstep') seen[e.foot]++;
  });
  assert.ok(seen.L >= 2 && seen.R >= 2, `footsteps ${JSON.stringify(seen)}`);
  const a = makePlayer(1, 'attack');
  let hits = 0;
  drive(a, 'attack', CLIP_INFO.attack.duration * 2 + 0.05, () => (hits += a.player.events.filter((e) => e.type === 'hit').length));
  assert.equal(hits, 2);
  const v = makePlayer(1, 'vault');
  v.player.play('vault', { fade: 0 });
  drive(v, 'vault', CLIP_INFO.vault.duration + 0.2);
  assert.ok(v.player.finished);
  const rm = CLIP_INFO.vault.rootMotion;
  assert.ok(Math.abs(v.root.pos.y - rm.dy) < 0.02 && Math.abs(v.root.pos.z - rm.dz) < 0.02, `vault moved the root to ${v.root.pos.y.toFixed(2)}, ${v.root.pos.z.toFixed(2)}`);
});

test('cross-fades are smooth', () => {
  const maxStep = (clip, seconds) => {
    const z = makePlayer(3, clip);
    let m = 0;
    drive(z, clip, seconds, (t) => {
      if (t > 0.1) for (const b of z.rd.bodies) m = Math.max(m, b.pos.distanceTo(b.framePos));
    });
    return m;
  };
  const own = Math.max(maxStep('walk', 1.5), maxStep('jog', 1.5));
  const z = makePlayer(3, 'walk');
  drive(z, 'walk', 1);
  z.player.play('jog', { fade: 0.3 });
  let worst = 0;
  drive(z, 'jog', 0.6, () => {
    for (const b of z.rd.bodies) worst = Math.max(worst, b.pos.distanceTo(b.framePos));
  });
  assert.ok(worst < own * 1.15 + 0.01, `largest body step during the fade ${(worst * 100).toFixed(1)} cm per frame (clips alone: ${(own * 100).toFixed(1)})`);
  // interrupting a fade with another fade is fine too
  z.player.play('walk', { fade: 0.3 });
  drive(z, 'walk', 0.1);
  z.player.play('idle', { fade: 0.3 });
  let w2 = 0;
  drive(z, 'idle', 0.5, () => {
    for (const b of z.rd.bodies) w2 = Math.max(w2, b.pos.distanceTo(b.framePos));
  });
  assert.ok(w2 < own * 1.15 + 0.01, `largest step fading into idle ${(w2 * 100).toFixed(1)} cm`);
});

test('hand-off to physics: the posed bodies drop into the world joined and moving as they were', () => {
  for (const clip of ['walk', 'sprint', 'crawl']) {
    const w = new World({ substeps: 20 });
    const rd = new Ragdoll(w);
    const player = new AnimPlayer(rd, { seed: 4 });
    player.play(clip, { fade: 0 });
    const root = { pos: { x: 0, y: 0, z: 0 }, yaw: 0.4 };
    for (let i = 0; i < 60; i++) {
      root.pos.x += Math.sin(0.4) * CLIP_INFO[clip].speed * player.rate * player.var.rate / 60;
      root.pos.z += Math.cos(0.4) * CLIP_INFO[clip].speed * player.rate * player.var.rate / 60;
      player.update(1 / 60, root);
    }
    // joints are exactly connected in the animated pose
    let gap = 0;
    for (const j of rd.jointList) gap = Math.max(gap, j.worldAnchor(new Vec3()).distanceTo(j.child.localToWorld(j.anchorC, new Vec3())));
    assert.ok(gap < 1e-6, `${clip}: joint anchors apart by ${gap}`);
    const p0 = rd.computeCOMVelocity(new Vec3());
    rd.addToWorld();
    for (let i = 0; i < 30; i++) w.step(1 / 60);
    let vmax = 0;
    for (const b of rd.bodies) {
      assert.ok(b.pos.isFinite() && b.vel.isFinite(), `${clip}: physics blew up`);
      vmax = Math.max(vmax, b.vel.length());
    }
    assert.ok(vmax < 12, `${clip}: a body flies off at ${vmax.toFixed(1)} m/s`);
    // the body carried its momentum into the physics (it kept going the way it walked)
    const horiz = Math.hypot(p0.x, p0.z);
    if (horiz > 0.5) {
      const travelled = (rd.pelvis.pos.x - root.pos.x) * Math.sin(0.4) + (rd.pelvis.pos.z - root.pos.z) * Math.cos(0.4);
      assert.ok(travelled > 0, `${clip}: kept moving forward after the hand-off (${travelled.toFixed(2)} m)`);
    }
  }
});

test('performance: 80 animated zombies per frame', () => {
  const zs = [];
  const clips = ['walk', 'walk2', 'jog', 'sprint', 'idle', 'attack', 'crawl', 'climb', 'limpL', 'push'];
  for (let k = 0; k < 80; k++) {
    const z = makePlayer(k + 1, clips[k % clips.length]);
    z.root.pos.x = k;
    z.root.yaw = k * 0.37;
    zs.push(z);
  }
  const frame = () => {
    for (const z of zs) {
      z.root.pos.z += 0.015;
      z.player.update(1 / 60, z.root);
    }
  };
  for (let i = 0; i < 120; i++) frame();
  const t0 = performance.now();
  const N = 300;
  for (let i = 0; i < N; i++) frame();
  const ms = (performance.now() - t0) / N;
  console.log(`# 80 zombies: ${ms.toFixed(3)} ms per frame (${((ms / 80) * 1000).toFixed(1)} us each)`);
  assert.ok(ms < 2, `80 zombies take ${ms.toFixed(2)} ms per frame`);
});

test('clip data decodes to unit quaternions in ragdoll segment order', () => {
  const sk = skeleton(new Ragdoll(world));
  for (const [name, c] of Object.entries(_clipData)) {
    assert.equal(c.rot.length, c.F * sk.n * 4, name);
    for (let i = 0; i < c.F * sk.n; i++) {
      const l = Math.hypot(c.rot[i * 4], c.rot[i * 4 + 1], c.rot[i * 4 + 2], c.rot[i * 4 + 3]);
      assert.ok(Math.abs(l - 1) < 1e-3, `${name}: quaternion length ${l}`);
    }
  }
});
