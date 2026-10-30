// Scenario helpers for the get-up benchmark and tests: lay a freshly spawned dummy on the floor in a
// given orientation (it then settles physically before deciding to get up), and summarise get-up
// attempts from the controller's events.
import { Vec3, Quat } from '../../src/physics/math.js';

/**
 * Pose `person` lying on the floor: 'prone' (face down), 'supine' (face up), 'sideL' (on the left
 * side) or 'sideR', head toward `yaw`. Must be called before the first simulation step (the
 * injury model ignores floor contacts during the first second, like the feet settling at spawn).
 */
export function layDown(person, kind = 'supine', yaw = 0) {
  const rd = person.rd;
  const qx = new Quat().setFromAxisAngle(new Vec3(1, 0, 0), kind === 'supine' ? -Math.PI / 2 : Math.PI / 2);
  const qz = new Quat().setFromAxisAngle(new Vec3(0, 0, 1), kind === 'sideL' ? -Math.PI / 2 : kind === 'sideR' ? Math.PI / 2 : 0);
  // supine is rotated about +X the other way: its head points to -Z, so turn it to face +Z too
  const qy = new Quat().setFromAxisAngle(new Vec3(0, 1, 0), yaw + (kind === 'supine' ? Math.PI : 0));
  const q = new Quat().multiplyQuats(qy, new Quat().multiplyQuats(qz, qx));
  const pivot = rd.segments.pelvis.bindPos.clone();
  for (const seg of rd.segList) {
    const p = seg.bindPos.clone().sub(pivot).applyQuat(q);
    seg.body.setPose(p, q);
    seg.body.vel.setZero();
    seg.body.angVel.setZero();
  }
  // rest the lowest point just above the floor
  let minY = Infinity;
  for (const seg of rd.segList) {
    seg.body.computeAABB(0, 0);
    minY = Math.min(minY, seg.body.aabbMin.y);
  }
  for (const seg of rd.segList) {
    const p = seg.body.pos.clone();
    p.y += rd.world.groundY - minY + 0.005;
    seg.body.setPose(p, seg.body.rot);
  }
  person.ctl.heading = yaw;
  person.ctl.setMode('ground');
}

/**
 * Follow one person's get-up attempts. Call `tick(t)` every frame; `summary()` afterwards.
 * attempts: get-up starts; firstOk: the first attempt reached standing; standAt: time standing
 * began (balance held for `holdS` seconds); falls: falls after having stood up; ko: knockouts after
 * the start. While getting up it also measures the helpers: the net external force and torque the
 * controller puts on the whole body (all muscle torques are equal and opposite pairs and cancel, so
 * what is left after its update is exactly the assistGain-scaled helper forces and torques).
 */
export function getUpTracker(person, holdS = 4) {
  const ctl = person.ctl, rd = person.rd;
  const st = { attempts: 0, fails: 0, firstOk: null, standAt: -1, stoodAt: -1, falls: 0, ko: 0, t0: -1, upTime: 0, helperLift: 0, maxTrunkW: 0, maxComV: 0, phases: [] };
  const help = { n: 0, f: 0, fmax: 0, t: 0, tmax: 0 };
  const com = new Vec3();
  const update = ctl.update.bind(ctl);
  ctl.update = (dt) => {
    update(dt);
    if (ctl.mode !== 'getup') return;
    let fx = 0, fy = 0, fz = 0, tx = 0, ty = 0, tz = 0;
    rd.computeCOM(com);
    for (const b of rd.allBodies()) {
      fx += b.force.x;
      fy += b.force.y;
      fz += b.force.z;
      const rx = b.pos.x - com.x, ry = b.pos.y - com.y, rz = b.pos.z - com.z;
      tx += b.torque.x + ry * b.force.z - rz * b.force.y;
      ty += b.torque.y + rz * b.force.x - rx * b.force.z;
      tz += b.torque.z + rx * b.force.y - ry * b.force.x;
    }
    const f = Math.hypot(fx, fy, fz) / (rd.totalMass * 9.81), tq = Math.hypot(tx, ty, tz);
    help.n++;
    help.f += f;
    help.t += tq;
    help.fmax = Math.max(help.fmax, f);
    help.tmax = Math.max(help.tmax, tq);
  };
  let prev = ctl.mode, standT = 0, hadStood = false, wasConscious = true;
  function tick(t) {
    const m = ctl.mode;
    for (const e of ctl.events) {
      if (e.type === 'getup' && st.phases.length < 40) st.phases.push(`${e.phase}@${t.toFixed(1)}`);
      if (e.type === 'getupFail') {
        st.fails++;
        if (st.firstOk === null) st.firstOk = false;
      }
    }
    if (m === 'getup' && prev !== 'getup') {
      st.attempts++;
      if (st.t0 < 0) st.t0 = t;
    }
    if (prev === 'getup' && m === 'balance' && st.firstOk === null) st.firstOk = st.fails === 0;
    if (m === 'getup') {
      st.upTime += 1 / 60;
      st.helperLift += ctl.guLog ? ctl.guLog.liftNow : 0;
      const ch = person.rd.segments.chest.body;
      st.maxTrunkW = Math.max(st.maxTrunkW, ch.angVel.length());
      st.maxComV = Math.max(st.maxComV, ctl.sens.comVel.length());
    }
    if (wasConscious && !ctl.conscious && t > 0.5) st.ko++;
    wasConscious = ctl.conscious;
    if (m === 'falling' && prev !== 'falling' && hadStood) st.falls++;
    if (m === 'balance' && st.t0 >= 0) {
      if (standT === 0) st.stoodAt = t;
      standT += 1 / 60;
      if (standT > holdS && st.standAt < 0) {
        st.standAt = st.stoodAt;
        hadStood = true;
      }
    } else standT = 0;
    if (m === 'balance' && st.t0 >= 0) hadStood = hadStood || standT > 0.5;
    prev = m;
  }
  function summary() {
    return {
      ...st,
      // mean upward helper lift (fraction of body weight) while getting up
      helperFrac: st.upTime > 0 ? st.helperLift / (st.upTime * 60) / (person.rd.totalMass * 9.81) : 0,
      // net external helper force (fraction of body weight) and torque (N*m): mean and peak
      helperF: help.n ? help.f / help.n : 0,
      helperFmax: help.fmax,
      helperT: help.n ? help.t / help.n : 0,
      helperTmax: help.tmax,
      duration: st.standAt >= 0 && st.t0 >= 0 ? st.standAt - st.t0 : null,
    };
  }
  return { tick, summary };
}
