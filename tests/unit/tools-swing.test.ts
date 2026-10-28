// Unit tests for the pure tool modules: swing rigs, strike timing, state machine, pose math,
// tool definitions. Run: node --test tests/unit/tools-*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SwingMachine,
  StrikePath,
  prepareRig,
  makePose,
  blendPose,
  quatFromAxisFace,
  rotateQ,
  slerpQ,
  frameAxis,
  frameFace,
  chargedSpeed,
  v3,
  q4,
  EV_STRIKE_START,
  EV_STRIKE_STEP,
  EV_STRIKE_END,
  MAX_CHARGE_HOLD,
  RECOVER_INTERRUPT,
  type PreparedArc,
  type PreparedJab,
  type V3,
} from "../../src/player/tools/swing.ts";
import { TOOL_DEFS, TOOL_RIGS, TOOL_ORDER, sharpnessFor, isPainful, KICK, STOMP, PRY, SPRAY } from "../../src/player/tools/defs.ts";

const DT = 1 / 60;
const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const mag = (a: V3) => Math.hypot(a.x, a.y, a.z);
const near = (a: number, b: number, tol: number, msg?: string) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} expected ${b} ± ${tol}, got ${a}`);

test("tool defs: brief parameters, finite derived strike windows", () => {
  const d = TOOL_DEFS;
  assert.deepEqual([...TOOL_ORDER], ["hands", "hammer", "sledgehammer", "crowbar", "bat", "axe", "extinguisher"]);
  near(d.hands.mass, 1.5, 1e-9);
  assert.ok(d.hands.speed >= 8 && d.hands.speed <= 9);
  near(d.hammer.mass, 0.9, 1e-9);
  near(d.hammer.speed, 11, 1e-9);
  near(d.hammer.contactRadius, 0.015, 1e-9);
  near(d.sledgehammer.mass, 6, 1e-9);
  near(d.sledgehammer.speed, 6.5, 1e-9);
  near(d.sledgehammer.contactRadius, 0.03, 1e-9);
  near(d.crowbar.mass, 1.2, 1e-9);
  near(d.crowbar.speed, 9, 1e-9);
  assert.equal(d.crowbar.alt, "pry");
  near(d.bat.mass, 0.8, 1e-9);
  near(d.bat.speed, 17, 1e-9);
  near(d.bat.contactRadius, 0.03, 1e-9);
  near(d.axe.mass, 1.8, 1e-9);
  near(d.axe.speed, 11, 1e-9);
  near(d.axe.sharpness, 2.2, 1e-9);
  near(d.extinguisher.mass, 4, 1e-9);
  assert.equal(d.extinguisher.alt, "spray");
  for (const id of TOOL_ORDER) {
    const t = d[id];
    assert.equal(t.id, id);
    for (const k of ["mass", "speed", "chargeSpeedMul", "chargeTime", "windup", "strike", "recover", "reach", "headRadius", "contactRadius", "sharpness"] as const) {
      assert.ok(Number.isFinite(t[k]) && t[k] > 0, `${id}.${k} = ${t[k]}`);
    }
    assert.ok(t.chargeSpeedMul > 1 && t.chargeSpeedMul < 2, `${id} charge multiplier`);
    assert.ok(t.strike > 0.05 && t.strike < 1.2, `${id} strike window ${t.strike}`);
    assert.ok(t.contactRadius <= t.headRadius + 1e-9, `${id} contact radius ≤ head radius`);
  }
  // heavier slower tools take longer
  assert.ok(d.sledgehammer.windup > d.hammer.windup && d.sledgehammer.strike > d.hammer.strike);
  // body actions per brief
  near(KICK.mass, 6, 1e-9);
  near(KICK.speed, 7.5, 1e-9);
  near(STOMP.mass, 20, 1e-9);
  near(STOMP.speed, 4, 1e-9);
  near(PRY.force, 3000, 1e-9);
  assert.ok(SPRAY.duration > 5 && SPRAY.thrust > 0);
});

test("tool defs: material-dependent sharpness and pain", () => {
  assert.equal(sharpnessFor("axe", "softwood"), 2.2);
  assert.equal(sharpnessFor("axe", "fabric"), 2.2);
  assert.equal(sharpnessFor("axe", "steelSheet"), 0.6);
  assert.ok(sharpnessFor("axe", "concrete") < 1);
  assert.equal(sharpnessFor("hammer", "softwood"), 1);
  assert.equal(sharpnessFor("sledgehammer", "glass"), 1);
  assert.ok(sharpnessFor("crowbar", "gypsum") > 1);
  assert.ok(isPainful("concrete") && isPainful("steel"));
  assert.ok(!isPainful("gypsum") && !isPainful("fabric") && !isPainful(null));
});

test("strike path: speed at the nominal contact equals the (charged) tool speed, contact at the rig contact point", () => {
  for (const id of TOOL_ORDER) {
    const def = TOOL_DEFS[id];
    for (const c of [0, 0.5, 1]) {
      const m = new SwingMachine(def, TOOL_RIGS[id]);
      m.forceStrike(c);
      const p = m.path;
      const vel = m.velocityAt(p.tc, v3());
      near(mag(vel), chargedSpeed(def, c), chargedSpeed(def, c) * 0.01, `${id} c=${c} speed@contact`);
      // speed profile peaks at contact
      assert.ok(p.speedAt(p.tc * 0.5) < p.v && p.speedAt(p.tc + (p.T - p.tc) * 0.5) < p.v);
      const head = m.headAt(p.tc, v3());
      const rig = TOOL_RIGS[id];
      const target = rig.kind === "arc" ? rig.head : rig.contact[m.hand];
      assert.ok(dist(head, target) < 0.015, `${id} c=${c} contact point ${JSON.stringify(head)} vs ${JSON.stringify(target)}`);
      // nominal contact point lies near the crosshair line at roughly the tool's reach
      near(Math.hypot(target.x, target.y, target.z), def.reach, 0.08, `${id} reach`);
      assert.ok(Math.hypot(target.x, target.y) < 0.15, `${id} contact near the crosshair`);
    }
  }
});

test("strike path: s(t) monotonic, continuous, ends at L; T = tc + tf", () => {
  for (const id of TOOL_ORDER) {
    const m = new SwingMachine(TOOL_DEFS[id], TOOL_RIGS[id]);
    m.forceStrike(0.3);
    const p = m.path;
    near(p.T, p.tc + p.tf, 1e-12);
    let prev = -1;
    const N = 400;
    for (let i = 0; i <= N; i++) {
      const t = (p.T * i) / N;
      const s = p.sAt(t);
      assert.ok(s >= prev - 1e-12, `${id} monotonic`);
      assert.ok(p.speedAt(t) >= 0);
      if (i > 0) {
        // numerical derivative matches the analytic speed
        const dsdt = (s - prev) / (p.T / N);
        const sp = 0.5 * (p.speedAt(t) + p.speedAt((p.T * (i - 1)) / N));
        near(dsdt, sp, 0.03 * p.v + 1e-6, `${id} ds/dt`);
      }
      prev = s;
    }
    near(p.sAt(p.T), p.L, 1e-9);
    near(p.sAt(p.tc), p.Lc, 1e-9);
  }
});

test("strike path: head position samples match the analytic rig", () => {
  const prep = prepareRig(TOOL_RIGS.sledgehammer) as PreparedArc;
  const path = new StrikePath();
  path.buildArc(prep, prep.rig.wind, prep.rig.follow, 6.5);
  // consecutive samples are evenly spread in angle; path length is the sum of chords
  let acc = 0;
  for (let i = 1; i < path.s.length; i++) {
    const a = 3 * (i - 1),
      b = 3 * i;
    acc += Math.hypot(path.head[b] - path.head[a], path.head[b + 1] - path.head[a + 1], path.head[b + 2] - path.head[a + 2]);
    near(path.s[i], acc, 1e-9);
  }
  // a tangent at contact is perpendicular-ish to the lever and points along the requested travel (down)
  const tan = path.tangentAtS(path.Lc, v3());
  assert.ok(tan.y < -0.9, `sledge travels down at contact: ${JSON.stringify(tan)}`);
  const jab = prepareRig(TOOL_RIGS.hands) as PreparedJab;
  const jp = new StrikePath();
  jp.buildJab(jab, 0, 0.25, 8.5);
  const t0 = jp.tangentAtS(0, v3());
  assert.ok(t0.z > 0.8, "jab goes forward");
});

test("state machine: quick tap = normal swing; hold = charge; release mid-charge", () => {
  const def = TOOL_DEFS.hammer;
  // quick tap: press, release next step
  let m = new SwingMachine(def, TOOL_RIGS.hammer);
  assert.ok(m.press());
  assert.equal(m.phase, "windup");
  let ev = m.update(DT, false);
  let steps = 1;
  let started = (ev & EV_STRIKE_START) !== 0;
  while (!started && steps < 100) {
    ev = m.update(DT, false);
    started = (ev & EV_STRIKE_START) !== 0;
    steps++;
  }
  assert.ok(started, "strike started after windup");
  near(steps * DT, def.windup, DT + 1e-9, "tap strikes right after the windup");
  assert.equal(m.charge, 0);
  // the strike carries the remainder of the step past the windup (time-exact)
  near(m.sweepTo, steps * DT - def.windup, 1e-9);
  assert.ok((ev & EV_STRIKE_STEP) !== 0 || m.sweepTo === 0);

  // hold: charges to 1 in chargeTime, auto-releases after MAX_CHARGE_HOLD
  m = new SwingMachine(def, TOOL_RIGS.hammer);
  m.press();
  let t = 0;
  let strikeAt = -1;
  for (let i = 0; i < 400 && strikeAt < 0; i++) {
    const e = m.update(DT, true);
    t += DT;
    if (e & EV_STRIKE_START) strikeAt = t;
  }
  near(strikeAt, def.windup + def.chargeTime + MAX_CHARGE_HOLD, 2 * DT + 1e-9, "auto release at full charge");
  assert.equal(m.charge, 1);

  // release mid-charge
  m = new SwingMachine(def, TOOL_RIGS.hammer);
  m.press();
  const holdSteps = Math.round((def.windup + def.chargeTime * 0.5) / DT);
  for (let i = 0; i < holdSteps; i++) m.update(DT, true);
  assert.equal(m.phase, "charge");
  assert.ok(m.release(), "release in charge starts the strike");
  assert.equal(m.phase, "strike");
  assert.ok(m.charge > 0.35 && m.charge < 0.65, `charge ${m.charge}`);
});

test("state machine: strike → recover → idle; presses during recovery queue / interrupt", () => {
  const def = TOOL_DEFS.crowbar;
  const m = new SwingMachine(def, TOOL_RIGS.crowbar);
  m.forceStrike(0);
  let ended = false;
  for (let i = 0; i < 200 && !ended; i++) ended = (m.update(DT, false) & EV_STRIKE_END) !== 0;
  assert.ok(ended);
  assert.equal(m.phase, "recover");
  // early press is queued, starts the windup at RECOVER_INTERRUPT
  assert.equal(m.press(), false);
  let windupAt = -1;
  for (let i = 1; i < 100 && windupAt < 0; i++) {
    m.update(DT, true);
    if (m.phase === "windup") windupAt = i * DT;
  }
  assert.ok(windupAt > 0, "queued swing started");
  near(windupAt, RECOVER_INTERRUPT * def.recover, DT + 1e-9);
  // and eventually everything returns to idle
  for (let i = 0; i < 400; i++) m.update(DT, false);
  assert.equal(m.phase, "idle");
  assert.equal(m.busy, false);
});

test("state machine: hit resolution (recoil, stop, continue)", () => {
  const def = TOOL_DEFS.sledgehammer;
  const m = new SwingMachine(def, TOOL_RIGS.sledgehammer);
  m.forceStrike(0);
  for (let i = 0; i < 10; i++) m.update(DT, false);
  m.hit("continue", m.t, 0.5);
  near(m.rate, 0.5, 1e-9);
  assert.equal(m.phase, "strike");
  const v1 = mag(m.velocityAt(m.t, v3()));
  near(v1, m.path.speedAt(m.t) * 0.5, 1e-9);
  m.hit("recoil", m.t, 1, 1);
  assert.equal(m.phase, "recoil");
  for (let i = 0; i < 12; i++) m.update(DT, false);
  assert.equal(m.phase, "recover");
  for (let i = 0; i < 100; i++) m.update(DT, false);
  assert.equal(m.phase, "idle");

  const m2 = new SwingMachine(def, TOOL_RIGS.sledgehammer);
  m2.forceStrike(1);
  m2.update(DT, false);
  m2.hit("stop", m2.t);
  assert.equal(m2.phase, "recover");
  // the pose right after a stop is the hit pose (stuck), not the idle pose
  const pose = m2.poseAt(0, makePose());
  const hitHead = m2.headAt(m2.path.T * 0, v3());
  assert.ok(dist(pose.head, m2.idle.head) > 0.05);
  assert.ok(Number.isFinite(hitHead.x));
});

test("state machine: hit in the step where the strike ended is still resolved", () => {
  const m = new SwingMachine(TOOL_DEFS.hands, TOOL_RIGS.hands);
  m.forceStrike(0);
  let ev = 0;
  for (let i = 0; i < 50; i++) {
    ev = m.update(DT, false);
    if (ev & EV_STRIKE_END) break;
  }
  assert.ok(ev & EV_STRIKE_END);
  m.hit("recoil", m.sweepTo * 0.99, 1, 1);
  assert.equal(m.phase, "recoil");
});

test("fists alternate hands; charged punch keeps the windup hand", () => {
  const m = new SwingMachine(TOOL_DEFS.hands, TOOL_RIGS.hands);
  const hands: number[] = [];
  for (let k = 0; k < 4; k++) {
    m.press();
    hands.push(m.hand);
    for (let i = 0; i < 60; i++) m.update(DT, false);
  }
  assert.deepEqual(hands, [0, 1, 0, 1]);
  // a strike of the left hand reaches the left contact point
  m.press();
  const hand = m.hand;
  let started = false;
  for (let i = 0; i < 60 && !started; i++) started = (m.update(DT, false) & EV_STRIKE_START) !== 0;
  const head = m.headAt(m.path.tc, v3());
  assert.ok(dist(head, TOOL_RIGS.hands.kind === "jab" ? TOOL_RIGS.hands.contact[hand] : v3()) < 0.015);
});

test("pose continuity: wound pose == strike start pose; windup ends at the wound pose", () => {
  for (const id of TOOL_ORDER) {
    const m = new SwingMachine(TOOL_DEFS[id], TOOL_RIGS[id]);
    m.press();
    // advance to just before the windup ends (holding fire)
    const n = Math.floor(TOOL_DEFS[id].windup / DT);
    for (let i = 0; i < n; i++) m.update(DT, true);
    const nearEnd = m.poseAt(TOOL_DEFS[id].windup - n * DT - 1e-6, makePose());
    // now in charge (or still windup); release at charge ~0 and compare
    for (let i = 0; i < 2; i++) m.update(DT, true);
    const charge = m.poseAt(0, makePose());
    assert.ok(dist(nearEnd.head, charge.head) < 0.06, `${id} windup end ≈ wound pose`);
    m.release();
    assert.equal(m.phase, "strike");
    const strike0 = m.poseAt(0, makePose());
    assert.ok(dist(strike0.head, charge.head) < 0.02, `${id} strike starts at the wound pose`);
    // strike head equals the path head
    const ph = m.headAt(0, v3());
    assert.ok(dist(ph, strike0.head) < 1e-6, `${id} pose head == path head`);
  }
});

test("quaternion helpers", () => {
  const q = quatFromAxisFace(q4(), { x: 0.3, y: 0.9, z: 0.2 }, { x: -0.1, y: 0.1, z: 1 });
  const ax = rotateQ(v3(), q, { x: 0, y: 1, z: 0 });
  const fa = rotateQ(v3(), q, { x: 0, y: 0, z: 1 });
  const n = Math.hypot(0.3, 0.9, 0.2);
  near(ax.x, 0.3 / n, 1e-9);
  near(ax.y, 0.9 / n, 1e-9);
  near(ax.z, 0.2 / n, 1e-9);
  near(ax.x * fa.x + ax.y * fa.y + ax.z * fa.z, 0, 1e-9);
  assert.ok(fa.z > 0.9);
  // proper rotation: X = Y × Z
  const xx = rotateQ(v3(), q, { x: 1, y: 0, z: 0 });
  near(xx.x, ax.y * fa.z - ax.z * fa.y, 1e-9);
  // degenerate face ∥ axis does not produce NaN
  const qd = quatFromAxisFace(q4(), { x: 0, y: 1, z: 0 }, { x: 0, y: 2, z: 0 });
  assert.ok([qd.x, qd.y, qd.z, qd.w].every(Number.isFinite));
  // slerp endpoints + midpoint unit length
  const a = quatFromAxisFace(q4(), { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });
  const b = quatFromAxisFace(q4(), { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  const m = slerpQ(q4(), a, b, 0.5);
  near(Math.hypot(m.x, m.y, m.z, m.w), 1, 1e-9);
  const mAx = rotateQ(v3(), m, { x: 0, y: 1, z: 0 });
  near(mAx.x, Math.SQRT1_2, 1e-6);
  near(mAx.y, Math.SQRT1_2, 1e-6);
});

test("pose blending keeps tools away from the eye and the head on the handle", () => {
  const prep = prepareRig(TOOL_RIGS.sledgehammer) as PreparedArc;
  const a = makePose(),
    b = makePose(),
    o = makePose();
  // two poses on opposite sides of the eye
  a.right.p = { x: 0.3, y: -0.1, z: 0.05 };
  b.right.p = { x: -0.3, y: 0.1, z: -0.05 };
  quatFromAxisFace(a.right.q, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });
  quatFromAxisFace(b.right.q, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });
  Object.assign(a.left, { p: { ...a.right.p }, q: { ...a.right.q } });
  Object.assign(b.left, { p: { ...b.right.p }, q: { ...b.right.q } });
  blendPose(a, b, 0.5, prep.toolLen, prep.rig.offhand, o, 0.24);
  assert.ok(mag(o.right.p) >= 0.24 - 1e-9, `bulged mid pose ${JSON.stringify(o.right.p)}`);
  const ax = frameAxis(v3(), o.right);
  near(dist(o.head, o.right.p), prep.toolLen, 1e-9);
  near(dist(o.left.p, o.right.p), prep.rig.offhand, 1e-9);
  assert.ok(Math.abs(ax.y - 1) < 1e-6);
  const face = frameFace(v3(), o.right);
  assert.ok(face.z > 0.99);
});

test("idle poses keep the tools in view and in front of the camera", () => {
  for (const id of TOOL_ORDER) {
    const m = new SwingMachine(TOOL_DEFS[id], TOOL_RIGS[id]);
    const p = m.poseAt(0, makePose());
    for (const pt of [p.right.p, p.head]) {
      assert.ok(pt.z > 0.15, `${id} idle in front of the eye ${JSON.stringify(pt)}`);
      assert.ok(mag(pt) > 0.25 && mag(pt) < 1.3, `${id} idle distance`);
    }
    for (const k of ["x", "y", "z"] as const) assert.ok(Number.isFinite(p.head[k]) && Number.isFinite(p.right.q.w));
  }
});
