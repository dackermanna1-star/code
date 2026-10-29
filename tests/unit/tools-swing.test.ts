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
  MIN_AIM_REACH,
  AIM_STRETCH,
  aimVariants,
  makeAimVariant,
  MAX_AIM_VARIANTS,
  type PreparedCurve,
  type PreparedJab,
  type V3,
} from "../../src/player/tools/swing.ts";
import { TOOL_DEFS, TOOL_RIGS, TOOL_ORDER, TOOL_SHAFTS, sharpnessFor, isPainful, KICK, STOMP, PRY, SPRAY } from "../../src/player/tools/defs.ts";

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
  // the bar levers only within arm reach (upper arm 0.3 + forearm 0.27) + bar (0.5) of the shoulder,
  // and slips out a little beyond that
  assert.ok(PRY.reach <= 1.07 && PRY.slipDistance > PRY.reach && PRY.slipDistance <= PRY.reach + 0.1);
  assert.ok(PRY.rayLength >= PRY.reach + 0.3, "the crosshair ray reaches past the shoulder reach");
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
      const target = rig.kind === "curve" ? rig.contact : rig.contact[m.hand];
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

test("strike path: samples, travel at contact, handle ⊥ travel, hands within reach", () => {
  for (const id of TOOL_ORDER) {
    const rig = TOOL_RIGS[id];
    if (rig.kind !== "curve") continue;
    const prep = prepareRig(rig) as PreparedCurve;
    for (const c of [0, 1]) {
      const m = new SwingMachine(TOOL_DEFS[id], rig);
      m.forceStrike(c);
      const path = m.path;
      // cumulative length = sum of chords
      let acc = 0;
      for (let i = 1; i < path.s.length; i++) {
        const a = 3 * (i - 1),
          b = 3 * i;
        acc += Math.hypot(path.head[b] - path.head[a], path.head[b + 1] - path.head[a + 1], path.head[b + 2] - path.head[a + 2]);
        near(path.s[i], acc, 1e-9);
      }
      // direction of travel at contact = the rig's travel (strong forward component)
      const tan = path.tangentAtS(path.Lc, v3());
      near(tan.x * prep.travel.x + tan.y * prep.travel.y + tan.z * prep.travel.z, 1, 1e-6, `${id} travel at contact`);
      // nearly along the view at contact: a square blow delivers ≥ ~80 % of ½·m·v²
      assert.ok(tan.z >= 0.9, `${id} forward component ${tan.z}`);
      // at contact the striking face leads: face == travel, handle ⊥ travel
      const pose = makePose();
      const N = 60;
      for (let k = 0; k <= N; k++) {
        const t = (path.T * k) / N;
        m.t = t;
        m.poseAt(0, pose);
        // hands stay within reach of a shoulder and never come near the eye. A square blow puts
        // the hands at about the target's depth (handle ⊥ travel ≈ view), so the arms extend with
        // some torso lean/rotation: two-handed tools may reach from either shoulder.
        const sh = { x: 0.19, y: -0.24, z: -0.05 };
        const shL = { x: -0.19, y: -0.24, z: -0.05 };
        const reach = rig.offhand !== 0 ? Math.min(dist(pose.right.p, sh), dist(pose.right.p, shL)) : dist(pose.right.p, sh);
        assert.ok(reach < 0.88, `${id} c=${c} grip reach ${reach.toFixed(2)} at t=${t.toFixed(3)}`);
        assert.ok(mag(pose.right.p) > 0.12, `${id} c=${c} grip too close to the eye at t=${t.toFixed(3)}`);
        // head is one tool length up the handle from the grip
        near(dist(pose.head, pose.right.p), rig.toolLen, 1e-6);
      }
      m.t = path.tc;
      m.poseAt(0, pose);
      const face = frameFace(v3(), pose.right),
        axis = frameAxis(v3(), pose.right);
      near(face.x * prep.travel.x + face.y * prep.travel.y + face.z * prep.travel.z, 1, 1e-4, `${id} face leads at contact`);
      near(axis.x * prep.travel.x + axis.y * prep.travel.y + axis.z * prep.travel.z, 0, 1e-4, `${id} handle ⊥ travel`);
      assert.ok(dist(pose.right.p, prep.grip) < 1e-4, `${id} contact grip`);
    }
  }
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
  const prep = prepareRig(TOOL_RIGS.sledgehammer) as PreparedCurve;
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

test("aimStrike: re-targets the contact at the crosshair point at 0.4–0.8 m and squares up to the surface", () => {
  for (const id of TOOL_ORDER) {
    const def = TOOL_DEFS[id];
    for (const dz of [0.4, 0.6, 0.8]) {
      for (const n of [v3(0, 0, -1), v3(0, Math.SQRT1_2, -Math.SQRT1_2), v3(0.5, 0, -Math.sqrt(0.75))]) {
        const m = new SwingMachine(def, TOOL_RIGS[id]);
        m.forceStrike(0);
        const point = v3(0, 0, dz);
        assert.ok(m.aimStrike({ point, normal: n }), `${id} ${dz} aimed`);
        const path = m.path;
        const head = path.headAtS(path.Lc, v3());
        const maxD = def.reach + AIM_STRETCH;
        const expectD = Math.min(Math.max(dz - def.headRadius, MIN_AIM_REACH), maxD);
        // the head sphere centre at contact sits one head radius off the surface point (inside the reach shell)
        if (dz - def.headRadius <= maxD && dz - def.headRadius >= MIN_AIM_REACH) {
          assert.ok(dist(head, point) < def.headRadius + 0.012, `${id} dz=${dz} n=${JSON.stringify(n)} contact ${JSON.stringify(head)} vs point`);
        } else near(mag(head), expectD, 0.03, `${id} clamped contact`);
        // the travel at contact goes into the surface: ≥ 0.9 along −n (≥ 81 % of ½·m·v²)
        const tan = path.tangentAtS(path.Lc, v3());
        const into = -(tan.x * n.x + tan.y * n.y + tan.z * n.z);
        // (fists punch straight from the guard: a cramped close punch comes in at an angle, so only
        // the frontal case at a punching distance is checked for them)
        if (id !== "hands") assert.ok(into >= 0.89, `${id} dz=${dz} into-surface component ${into.toFixed(3)}`);
        else if (dz >= 0.6 && n.z < -0.99) assert.ok(into >= 0.75, `fist dz=${dz} into-surface component ${into.toFixed(3)}`);
        // speed: full at a comfortable distance, reduced (never below half) when cramped
        const vc = m.velocityAt(path.tc, v3());
        assert.ok(mag(vc) <= def.speed * 1.001 && mag(vc) >= def.speed * 0.5 - 1e-6, `${id} speed ${mag(vc)}`);
        if (id !== "hands" && dz >= 0.8 && def.reach >= 0.8) near(mag(vc), def.speed, def.speed * 0.15, `${id} full speed at ${dz}`);
        // the swept head reaches the point: closest approach ≤ head radius
        let best = Infinity;
        const o = v3();
        for (let k = 0; k <= 400; k++) best = Math.min(best, dist(m.headAt((path.T * k) / 400, o), point));
        // (only targets within reach: e.g. the extinguisher held across the chest reaches ~0.7 m)
        if (dz - def.headRadius <= maxD) assert.ok(best <= def.headRadius + 0.005, `${id} dz=${dz} closest approach ${best.toFixed(3)}`);
      }
    }
  }
});

test("aimStrike: out-of-reach targets leave the nominal path; the viewmodel pose follows the aimed path", () => {
  const def = TOOL_DEFS.bat;
  const m = new SwingMachine(def, TOOL_RIGS.bat);
  m.forceStrike(0);
  const T = m.path.T;
  assert.equal(m.aimStrike({ point: v3(0, 0, 2.5), normal: v3(0, 0, -1) }), false);
  near(m.path.T, T, 1e-12);
  assert.ok(m.aimStrike({ point: v3(0, 0, 0.5), normal: v3(0, 0, -1) }));
  const pose = makePose();
  m.t = m.path.tc;
  m.poseAt(0, pose);
  assert.ok(dist(pose.head, m.path.headAtS(m.path.Lc, v3())) < 1e-6, "pose head = path head at contact");
  // fists: the punching fist follows the re-aimed line
  const f = new SwingMachine(TOOL_DEFS.hands, TOOL_RIGS.hands);
  f.forceStrike(0);
  assert.ok(f.aimStrike({ point: v3(0, 0, 0.4), normal: v3(0, 0, -1) }));
  f.t = f.path.tc;
  f.poseAt(0, pose);
  const fist = f.hand === 1 ? pose.left.p : pose.right.p;
  assert.ok(dist(fist, v3(0, 0, 0.4)) < TOOL_DEFS.hands.headRadius + 0.01, `fist at contact ${JSON.stringify(fist)}`);
});

test("grazes do not use up the per-swing hit budget; shaft points lie on the tool axis", () => {
  const m = new SwingMachine(TOOL_DEFS.bat, TOOL_RIGS.bat);
  m.forceStrike(0);
  m.update(DT, false);
  m.hit("continue", m.t, 0.85, 1, false);
  m.hit("continue", m.t, 0.85, 1, false);
  assert.equal(m.hits, 0);
  m.hit("continue", m.t, 0.9);
  assert.equal(m.hits, 1);
  for (const id of Object.keys(TOOL_SHAFTS) as (keyof typeof TOOL_SHAFTS)[]) {
    const rig = TOOL_RIGS[id];
    assert.ok(rig.kind === "curve");
    const sm = new SwingMachine(TOOL_DEFS[id], rig);
    sm.forceStrike(0);
    const pose = makePose();
    for (const off of TOOL_SHAFTS[id]!.offsets) {
      assert.ok(off > 0 && off < rig.toolLen, `${id} shaft offset within the tool`);
      for (const t of [0, sm.path.tc, sm.path.T]) {
        sm.t = t;
        sm.poseAt(0, pose);
        const p = sm.toolPointAt(t, off, v3());
        near(dist(p, pose.head), off, 1e-6, `${id} shaft point distance from the head`);
        near(dist(p, pose.right.p), rig.toolLen - off, 1e-6, `${id} shaft point distance from the grip`);
      }
    }
  }
});

const variantsBuf = () => Array.from({ length: MAX_AIM_VARIANTS }, makeAimVariant);
const closestApproach = (m: SwingMachine, p: V3) => {
  let best = Infinity;
  const o = v3();
  for (let k = 0; k <= 400; k++) best = Math.min(best, dist(m.headAt((m.path.T * k) / 400, o), p));
  return best;
};

test("aimVariants: squared first, then down-tilts, side rolls, a level swing, the view; fists: overhand lifts", () => {
  const down = v3(0, -1, 0); // looking horizontally
  const out = variantsBuf();
  const front = { point: v3(0, 0, 0.6), normal: v3(0, 0, -1) };
  const n = aimVariants(TOOL_RIGS.sledgehammer, front, down, out);
  assert.ok(n >= 5 && n <= MAX_AIM_VARIANTS, `count ${n}`);
  assert.equal(out[0].into, null);
  assert.equal(out[0].roll, 0);
  assert.equal(out[0].level, null);
  // down-tilts: unit, turned towards down, still travelling away from the eye
  const tilts = out.slice(0, n).filter((x) => x.into && x.into.y < -0.1);
  assert.ok(tilts.length >= 1, "has down-tilted variants");
  for (const t of tilts) {
    near(mag(t.into!), 1, 1e-9);
    assert.ok(t.into!.z >= 0.25, `tilt forward ${t.into!.z}`);
  }
  assert.ok(out.slice(0, n).some((x) => x.roll > 0) && out.slice(0, n).some((x) => x.roll < 0), "rolled both ways");
  const lv = out.slice(0, n).find((x) => x.level);
  assert.ok(lv && Math.abs(lv.level!.y - 1) < 1e-9, "level variant carries world up");
  // looking straight down at a floor: no down-tilts (already straight down)
  const nd = aimVariants(TOOL_RIGS.axe, { point: v3(0, 0, 0.7), normal: v3(0, 0, -1) }, v3(0, 0, 1), out);
  assert.ok(out.slice(0, nd).every((x) => !x.into || x.into.z > 0.9), "no tilt when the view is already down");
  // fists
  const nj = aimVariants(TOOL_RIGS.hands, front, down, out);
  assert.deepEqual(out.slice(0, nj).map((x) => x.lift), [0, 0.15, 0.3, 0.45]);
  // degenerate aim
  assert.equal(aimVariants(TOOL_RIGS.bat, { point: v3(0, 0, 0), normal: v3(0, 0, -1) }, down, out), 0);
});

test("aim variants reach the aimed point at 0.4–0.8 m (or are rejected); level swings keep the handle level", () => {
  const out = variantsBuf();
  for (const pitch of [0, 0.5]) {
    // world down / up in camera space for a camera pitched down by `pitch`
    const down = v3(0, -Math.cos(pitch), Math.sin(pitch));
    const up = v3(0, Math.cos(pitch), -Math.sin(pitch));
    for (const id of TOOL_ORDER) {
      const def = TOOL_DEFS[id];
      for (const dz of [0.4, 0.6, 0.8]) {
        if (dz - def.headRadius > def.reach + AIM_STRETCH) continue;
        for (const normal of [v3(0, 0, -1), v3(up.x, up.y, up.z)]) {
          const aim = { point: v3(0, 0, dz), normal };
          const n = aimVariants(TOOL_RIGS[id], aim, down, out);
          let accepted = 0;
          for (let i = 0; i < n; i++) {
            const m = new SwingMachine(def, TOOL_RIGS[id]);
            m.forceStrike(0);
            if (!m.aimStrike(aim, out[i])) {
              assert.ok(i > 0, `${id} squared variant must be accepted`);
              continue;
            }
            accepted++;
            const tag = `${id} pitch=${pitch} dz=${dz} n=${normal.y.toFixed(2)} v#${i}`;
            // all samples finite, the head sweeps through the aimed point
            const best = closestApproach(m, aim.point);
            assert.ok(Number.isFinite(best) && best <= def.headRadius + 0.006, `${tag} closest approach ${best.toFixed(3)}`);
            // travels away from the eye at contact
            const tan = m.path.tangentAtS(m.path.Lc, v3());
            assert.ok(tan.z >= 0.049, `${tag} travel ${JSON.stringify(tan)}`);
            if (out[i].level) {
              // the handle is levelled by rolling about the travel: exact for side-on targets; for a
              // swing coming straight down onto a top face only as level as the roll allows
              const sq = new SwingMachine(def, TOOL_RIGS[id]);
              sq.forceStrike(0);
              sq.aimStrike(aim);
              const tilt = (q: { x: number; y: number; z: number; w: number }) => {
                const a = rotateQ(v3(), q, v3(0, 1, 0));
                return Math.abs(a.x * up.x + a.y * up.y + a.z * up.z);
              };
              assert.ok(tilt(m.path.qContact) <= tilt(sq.path.qContact) + 1e-6, `${tag} level handle no worse than squared`);
              if (normal.z < -0.99) near(tilt(m.path.qContact), 0, 0.02, `${tag} level handle`);
            }
            // speed never exceeds the rated speed
            assert.ok(mag(m.velocityAt(m.path.tc, v3())) <= def.speed * 1.001);
          }
          assert.ok(accepted >= 2, `${id} several ways to swing (${accepted})`);
        }
      }
    }
  }
});

test("overhand punch: starts at the guard, rises over the straight line, comes down onto the point", () => {
  const def = TOOL_DEFS.hands;
  const point = v3(0, 0, 0.5);
  const straight = new SwingMachine(def, TOOL_RIGS.hands);
  straight.forceStrike(0);
  const start = straight.headAt(0, v3());
  assert.ok(straight.aimStrike({ point, normal: v3(0, 0, -1) }));
  for (const lift of [0.15, 0.3, 0.45]) {
    const m = new SwingMachine(def, TOOL_RIGS.hands);
    m.forceStrike(0);
    const v = makeAimVariant();
    v.lift = lift;
    assert.ok(m.aimStrike({ point, normal: v3(0, 0, -1) }, v), `lift ${lift} accepted`);
    // continuous with the wound pose: same start as the straight punch
    assert.ok(dist(m.headAt(0, v3()), start) < 1e-9, "starts at the pulled-back guard");
    // the fist comes over: at mid-approach it is higher than the straight punch
    const ym = m.path.headAtS(m.path.Lc * 0.5, v3()).y;
    const ys = straight.path.headAtS(straight.path.Lc * 0.5, v3()).y;
    assert.ok(ym > ys + 0.3 * lift, `lift ${lift}: mid-approach height ${ym.toFixed(3)} vs ${ys.toFixed(3)}`);
    // reaches the point, travelling along the line from the raised guard
    assert.ok(closestApproach(m, point) <= def.headRadius + 0.005);
    const tan = m.path.tangentAtS(m.path.Lc, v3());
    const e = v3(point.x - start.x, point.y - start.y - lift, point.z - start.z);
    const el = mag(e);
    near((tan.x * e.x + tan.y * e.y + tan.z * e.z) / el, 1, 1e-3, `lift ${lift} travel ${JSON.stringify(tan)}`);
    // pose: the striking fist follows the path exactly, all finite
    const pose = makePose();
    for (const t of [0, m.path.tc * 0.5, m.path.tc, m.path.T]) {
      m.t = t;
      m.poseAt(0, pose);
      const fist = m.hand === 1 ? pose.left.p : pose.right.p;
      assert.ok(dist(fist, m.headAt(t, v3())) < 1e-9);
      assert.ok(Number.isFinite(pose.right.q.w) && Number.isFinite(pose.left.q.w));
    }
    // strike timing still reaches (at most) the rated speed at contact
    assert.ok(mag(m.velocityAt(m.path.tc, v3())) <= def.speed * 1.001);
  }
});
