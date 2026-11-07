// =============================================================================
// PHASE SCRIPT — what happens in each phase of the journey: guidance targets,
// configuration changes (flaps, gear, spoilers, reversers, lights), engine
// management and the cabin event script (announcements, signs, doors, bridge).
//
// Each phase: { anchor?(D) canonical state for jumps, enter(D), update(D, dt),
// progress(D) -> 0..1 }. `D` is the Director (director.js). All updates run at
// the physics sub-step rate; events go through D.emit (muted while jumping).
// =============================================================================
import { DEG, KT, FT, FPM, G } from '../core/constants.js';
import { clamp, clamp01, smoothstep, lerp, table, approach, follow, wrapPi, projectOnPath } from './fmath.js';
import { AERO, clFor, cdFor, engineThrust } from './aero.js';
import { gamFor, softMin } from './air.js';
import { planDescent, gsHeight, tasFor, GS_TAN, WHEEL_OFF } from './route.js';

export const FL360 = 36000 * FT;
export const VR_KT = 150;
const V2_15_KT = 165;
// climb vertical-speed schedules: [altitude ft, fpm]
const CLIMB_VS = {
  compressed: [[0, 2700], [1500, 2500], [3000, 5000], [9800, 5200], [10600, 4200], [12000, 6800], [27000, 7000], [31000, 5200], [34500, 2600]],
  realistic: [[0, 2600], [1500, 2300], [3000, 3200], [10000, 2600], [12000, 2600], [20000, 2200], [26000, 1800], [31000, 1300], [34500, 900]],
};
const GAMMA_MAX = { compressed: 9.5 * DEG, realistic: 8 * DEG };
const clbN1 = (h) => 88.5 + 4.5 * clamp01(h / 9500);
const _f = { x: 0, v: 0 };

function taxiControl(D, { vmaxCap, joints = 5 } = {}) {
  const c = D.gc;
  c.hold = false; c.stopAtEnd = true; c.stopDecel = 0.42; c.amax = 0.45; c.bmax = 1.1; c.jerk = 0.35; c.gain = 0.9;
  c.joints = joints; c.bump = 0.0016;
  if (vmaxCap != null) c.cap = vmaxCap;
}

// low-level / cloud turbulence helper (scripted part only; inCloud is added by the director)
function lowLevelTurb(D, hAgl, base = 0.06) {
  const hft = hAgl / FT;
  return base * smoothstep(40, 300, hft) + 0.1 * smoothstep(60, 400, hft) * (1 - smoothstep(900, 2500, hft));
}

export const SCRIPT = {
  // ------------------------------------------------------------------------------------------ gate
  gate: {
    anchor(D) { D.anchorGround('gate'); },
    enter(D) {
      const gm = Number(D.setting('gateMinutes')) || 0;
      D.pd.end = gm > 0 ? Math.max(100, gm * 60) : null;
    },
    update(D) {
      const t = D.st.phaseTime, pd = D.pd;
      D.gc.hold = true;
      const end = pd.end ?? Infinity;
      if (D.once('boarding_welcome', t >= 12)) D.announce('boarding_welcome', { maxDelay: 40 });
      if (D.once('captain_welcome', t >= 60 && end - t > 85)) D.announce('captain_welcome', { maxDelay: 30 });
      if (D.once('doors', t >= end - 75)) D.setDoors(true);
      if (D.once('doors_closed', t >= end - 71)) D.announce('doors_closed', { maxDelay: 45 });
      if (D.once('bright', t >= end - 60)) D.setLightsMode('bright');
      if (D.once('bridge', t >= end - 45)) { D.setBridge(false, 'departure'); D.setMusic(false); }
      if (D.once('beacon', t >= end - 12)) D.st.lights.beacon = true;
      if (t >= end) D.setPhase('pushback');
    },
    progress(D) { const t = D.st.phaseTime, e = D.pd.end; return e != null ? t / e : 0.8 * (1 - Math.exp(-t / 150)); },
  },

  // ------------------------------------------------------------------------------------------ pushback
  pushback: {
    anchor(D) { D.anchorGround('pushback'); },
    enter(D) {
      D.setArmed(true);
      D.announce('doors_armed', { maxDelay: 30, front: true });
      D.ground.setPath(D.paths.push, D.depOrigin, 0);
      D.ground.buildProfile({ vmax: 1.15, alat: 0.04 * G, decel: 0.12 });
      D.pd.tEnd = null; D.pd.pushing = false;
      D.st.lights.beacon = true;
    },
    update(D) {
      const t = D.st.phaseTime, pd = D.pd, g = D.ground, c = D.gc;
      if (D.once('push', t >= 4)) { D.emit('flight:pushback', { state: 'start' }); pd.pushing = true; }
      if (D.once('eng2', t >= 14)) D.startEngine(1);
      if (D.once('eng1', t >= 52 && D.eng.running(1))) D.startEngine(0);
      if (pd.pushing && pd.tEnd == null) {
        c.hold = false; c.stopAtEnd = true; c.stopDecel = 0.09; c.amax = 0.08; c.bmax = 0.3; c.jerk = 0.05; c.gain = 0.6;
        c.joints = 5; c.bump = 0.0008;
        if (g.stopped && g.remaining < 0.05 && t > 10) { pd.tEnd = t; D.emit('flight:pushback', { state: 'end' }); }
      } else c.hold = true;
      if (pd.tEnd != null && t >= pd.tEnd + 15 && D.eng.allRunning() && D.eng.int[0].t > 4) D.setPhase('taxi_out');
    },
    progress(D) {
      const g = D.ground, pd = D.pd;
      return 0.85 * (g.s / g.path.length) + 0.15 * (pd.tEnd != null ? clamp01((D.st.phaseTime - pd.tEnd) / 15) : 0);
    },
  },

  // ------------------------------------------------------------------------------------------ taxi out
  taxi_out: {
    anchor(D) { D.anchorGround('taxi_out'); },
    enter(D) {
      D.st.lights.taxi = true;
      D.ground.setPath(D.paths.taxiOut, D.depOrigin, 0);
      D.ground.buildProfile({ vmax: 10, alat: 0.1 * G, decel: 0.55 });
      D.pd.hold = null;
    },
    update(D) {
      const t = D.st.phaseTime, pd = D.pd, g = D.ground;
      if (D.once('safety', t >= 5)) D.announce('safety_demo', { maxDelay: 120 });
      if (D.once('flaps5', t >= 9)) D.setFlaps(5);
      if (pd.hold == null) {
        if (t < 2.5) D.gc.hold = true;
        else {
          taxiControl(D);
          if (g.stopped && g.remaining < 0.05) { pd.hold = t; D.emit('flight:holdShort', { duration: 45 }); }
        }
        D.groundThrust(t >= 2.5);
      } else {
        D.gc.hold = true;
        const th = t - pd.hold;
        if (D.once('dim', th >= 4)) { if (D.sunElev < 12 || D.st.timeOfDay > 18.2 || D.st.timeOfDay < 7) D.setLightsMode('dim'); }
        if (D.once('fa_takeoff', th >= 24)) D.announce('fa_takeoff', { maxDelay: 18, front: true });
        if (th >= 45) D.setPhase('lineup');
      }
    },
    progress(D) {
      const g = D.ground, pd = D.pd;
      return 0.8 * (g.s / g.path.length) + 0.2 * (pd.hold != null ? clamp01((D.st.phaseTime - pd.hold) / 45) : 0);
    },
  },

  // ------------------------------------------------------------------------------------------ line up
  lineup: {
    anchor(D) { D.anchorGround('lineup'); },
    enter(D) {
      const L = D.st.lights;
      L.strobe = true; L.landing = true; L.runwayTurnoff = true; L.taxi = true;
      D.ground.setPath(D.paths.lineUp, D.depOrigin, 0);
      D.ground.buildProfile({ vmax: 6.5, alat: 0.1 * G, decel: 0.5 });
      D.pd.stop = null;
    },
    update(D) {
      const t = D.st.phaseTime, pd = D.pd, g = D.ground;
      if (pd.stop == null) {
        if (t < 3) D.gc.hold = true;
        else {
          taxiControl(D, { joints: 7.5 });
          if (g.stopped && g.remaining < 0.05) pd.stop = t;
        }
        D.groundThrust(t >= 3);
      } else {
        D.gc.hold = true;
        if (t - pd.stop >= 5) D.setPhase('takeoff');
      }
    },
    progress(D) {
      const g = D.ground, pd = D.pd;
      return 0.85 * (g.s / g.path.length) + 0.15 * (pd.stop != null ? clamp01((D.st.phaseTime - pd.stop) / 5) : 0);
    },
  },

  // ------------------------------------------------------------------------------------------ takeoff
  takeoff: {
    anchor(D) { D.anchorGround('takeoff'); },
    enter(D) {
      D.ground.setPath(D.paths.runway, D.depOrigin, 0);
      D.pd.stage = 'set'; D.pd.vsPos = 0; D.pd.theta = 0; D.pd.thetaV = 0;
      D.setThrust('takeoff_set', 0.25);
    },
    update(D, dt) {
      const st = D.st, t = st.phaseTime, pd = D.pd, ad = D.ad;
      if (D.mode === 'ground') {
        const g = D.ground, c = D.gc;
        if (t < 3.5) { c.hold = true; D.n1Cmd = 40; return; }
        if (D.once('toga', true)) { D.setThrust('takeoff', 1); pd.stage = 'roll'; }
        D.n1Cmd = 95;
        const T = engineThrust(st.engines, ad.rho, ad.mach, 0);
        const CL = clFor(g.theta / DEG, st.flapsDeg, ad.mach, 0);
        const Lift = ad.q * AERO.S * CL;
        const Drag = ad.q * AERO.S * cdFor(CL, st.flapsDeg, st.gear, 0, true);
        c.hold = false;
        c.aExternal = (T - Drag - AERO.mu * Math.max(0, ad.W - Lift)) / ad.mass;
        c.liftFrac = clamp01(Lift / ad.W);
        c.joints = 15; c.bump = 0.0024;          // centreline lights every 15 m
        if (pd.stage === 'roll' && ad.iasKt >= VR_KT) pd.stage = 'rotate';
        if (pd.stage === 'rotate') {
          const want = 2.75 * DEG * (1 - smoothstep(12.5, 15, g.theta / DEG));
          g.thetaV = approach(g.thetaV, want, 4 * DEG * dt);
          g.theta += g.thetaV * dt;
          if (Lift >= ad.W) { pd.theta = g.theta; pd.thetaV = g.thetaV; D.liftoff(); }
        }
      }
      if (D.mode === 'air') {
        const a = D.air, ac = D.ac;
        D.n1Cmd = 95;
        pd.thetaV = approach(pd.thetaV, 2.75 * DEG * (1 - smoothstep(12.5, 15, pd.theta / DEG)), 4 * DEG * dt);
        pd.theta += pd.thetaV * dt;
        const alpha = pd.theta - a.gam;
        const CL = clFor(alpha / DEG, st.flapsDeg, ad.mach, 0);
        const Lift = ad.q * AERO.S * CL;
        const Drag = ad.q * AERO.S * cdFor(CL, st.flapsDeg, st.gear, 0, false);
        const T = engineThrust(st.engines, ad.rho, ad.mach, 0);
        ac.gamRate = (Lift * Math.cos(a.bank.x) - ad.W * Math.cos(a.gam)) / (ad.mass * Math.max(a.V, 40));
        ac.Vdot = (T - Drag) / ad.mass - G * Math.sin(a.gam);
        ac.bank = a.trackBank(90, 6 * DEG); ac.phiMax = 6 * DEG;
        a.windK = approach(a.windK, 1, dt / 8);
        if (a.vy > 1.5) pd.vsPos += dt;
        if (D.once('gearUp', pd.vsPos >= 3)) { D.setGear(false); pd.gearT = t; }
        if (D.wheelHeight() >= 400 * FT) D.setPhase('climb');
      }
    },
    progress(D) {
      if (D.mode === 'ground') return 0.75 * clamp01(D.ad.iasKt / 160);
      return 0.75 + 0.25 * clamp01(D.wheelHeight() / (400 * FT));
    },
  },

  // ------------------------------------------------------------------------------------------ climb
  climb: {
    enter(D) {
      const pd = D.pd;
      pd.h0 = D.air.y;
      pd.pace = D.setting('pacing') === 'realistic' ? 'realistic' : 'compressed';
      pd.levelT = 0; pd.turn = 0;
    },
    update(D, dt) {
      const st = D.st, a = D.air, ac = D.ac, pd = D.pd, ad = D.ad, h = a.y, hft = h / FT, t = st.phaseTime;
      const agl = D.wheelHeight();
      a.windK = approach(a.windK, 1, dt / 8);
      if (D.once('thrRed', agl >= 1500 * FT)) D.setThrust('climb', 0.9);
      D.n1Cmd = D.fired.has('thrRed') ? clbN1(h) : 95;
      if (D.once('taxiOff', t >= 4)) { st.lights.taxi = false; }
      // speed target: V2+15 to 1000 ft, 250 kt below FL100, 290 kt / M.78 above
      const ias = agl < 1000 * FT ? V2_15_KT : hft < 10000 ? 250 : 290;
      const tas = tasFor(ias, h, 0.78);
      // vertical speed schedule, traded against acceleration, altitude capture
      let vs = table(CLIMB_VS[pd.pace], hft) * FPM;
      vs *= lerp(1, 0.5, clamp01((tas - a.V) / 15));
      vs = Math.min(vs, (FL360 - h) * 0.055 + 0.1, a.V * Math.sin(GAMMA_MAX[pd.pace]));
      ac.gam = gamFor(Math.max(0, vs), a.V); ac.nMax = 0.07; ac.gamGain = 0.5;
      ac.V = tas; ac.accel = 0.75; ac.decel = 0.4;
      // scenic climbing turn: right 35° after 1800 ft, back to the route heading later
      if (pd.turn === 0 && agl >= 1800 * FT) pd.turn = 1;
      if (pd.turn === 1 && hft >= (pd.pace === 'realistic' ? 8500 : 7500)) pd.turn = 2;
      ac.bank = a.trackBank(pd.turn === 1 ? 125 : 90, 22 * DEG); ac.phiMax = 22 * DEG;
      // flap retraction with speed
      if (D.once('f1', agl >= 1000 * FT && ad.iasKt >= 180)) D.setFlaps(1);
      if (D.once('f0', D.fired.has('f1') && ad.iasKt >= 205 && st.flapsDeg < 1.5)) D.setFlaps(0);
      if (D.once('ll', hft >= 10000)) { st.lights.landing = false; st.lights.runwayTurnoff = false; }
      if (D.once('belt', hft >= (pd.pace === 'realistic' ? 11500 : 10800))) {
        D.setSeatbelt(false, true);
        D.announce('seatbelt_off', { maxDelay: 60 });
        D.setLightsMode('cruise');
      }
      // "a few bumps on the climb out"
      D.turbScript = lowLevelTurb(D, agl, 0.04) * 0.6 + 0.14 * smoothstep(3500, 4500, hft) * (1 - smoothstep(8500, 9800, hft));
      if (Math.abs(FL360 - h) < 8 && Math.abs(a.vy) < 0.4) pd.levelT += dt; else pd.levelT = 0;
      if (pd.levelT > 4) D.setPhase('cruise');
    },
    progress(D) { return clamp01((D.air.y - D.pd.h0) / (FL360 - D.pd.h0)); },
  },

  // ------------------------------------------------------------------------------------------ cruise
  cruise: {
    anchor(D) { D.anchorCruise(); },
    enter(D) {
      const dur = (Number(D.setting('cruiseMinutes')) || 0) * 60;
      const pd = D.pd;
      // scripted events scale with a short cruise
      const span = dur > 0 ? dur : 1e9;
      pd.tCaptain = Math.min(40, 0.15 * span);
      pd.tTurb = span >= 260 ? 115 : null;
      pd.tService = span >= 260 ? 205 : (span >= 120 ? 0.55 * span : null);
      D.setThrust('cruise', 0.8);
      D.st.region = 'enroute';
    },
    update(D, dt) {
      const st = D.st, a = D.air, ac = D.ac, pd = D.pd, t = st.phaseTime;
      a.windK = approach(a.windK, 1, dt / 8);
      ac.gam = gamFor(clamp((FL360 - a.y) * 0.04, -2.5, 2.5), a.V); ac.nMax = 0.04;
      ac.V = tasFor(300, a.y, 0.78); ac.accel = 0.3; ac.decel = 0.3;
      ac.bank = a.trackBank(90, 15 * DEG); ac.phiMax = 15 * DEG;
      D.autoThrust = true;
      if (D.once('captain_cruise', t >= pd.tCaptain)) D.announce('captain_cruise', { maxDelay: 60 });
      let turb = 0;
      if (pd.tTurb != null) {
        const t0 = pd.tTurb;
        if (D.once('turb_on', t >= t0)) {
          D.setSeatbelt(true, false);          // the PA carries the chime
          D.announce('turbulence', { maxDelay: 20, front: true });
        }
        if (D.once('turb_ev', t >= t0 + 6)) D.emit('flight:turbulence', { level: 0.45 });
        turb = 0.45 * smoothstep(t0 + 4, t0 + 12, t) * (1 - smoothstep(t0 + 58, t0 + 68, t));
        if (D.once('turb_off', t >= t0 + 72)) {
          D.emit('flight:turbulence', { level: 0.04 });
          D.setSeatbelt(false, false);
          D.announce('turbulence_over', { maxDelay: 30, front: true });
        }
      }
      if (pd.tService != null && D.once('service', t >= pd.tService)) D.announce('service', { maxDelay: 90 });
      D.turbScript = turb;
      const dur = (Number(D.setting('cruiseMinutes')) || 0) * 60;
      if ((dur > 0 && t >= dur) || D.descentRequested) D.setPhase('descent');
    },
    progress(D) {
      const dur = (Number(D.setting('cruiseMinutes')) || 0) * 60, t = D.st.phaseTime;
      return dur > 0 ? t / dur : 1 - Math.exp(-t / 900);
    },
  },

  // ------------------------------------------------------------------------------------------ descent
  descent: {
    anchor(D) { D.anchorCruise(); },
    enter(D) {
      D.descentRequested = false;
      const a = D.air;
      const pacing = D.setting('pacing') === 'realistic' ? 'realistic' : 'compressed';
      D.plan = planDescent({ x0: a.x, z0: a.z, h0: a.y, pacing });
      D.setArrivalOrigin(D.plan.origin);
      D.st.region = 'arrival';
      D.pd.s = 0;
      D.setThrust('idle', 0);
    },
    update(D, dt) {
      const st = D.st, a = D.air, ac = D.ac, pd = D.pd, plan = D.plan, ad = D.ad, t = st.phaseTime;
      a.windK = approach(a.windK, 1, dt / 8);
      const l1 = a.l1Bank(plan.route, pd.s, 25 * DEG);
      pd.s = l1.s; ac.bank = l1.bank; ac.phiMax = 25 * DEG;
      const ht = plan.hAt(pd.s), dh = plan.dhds(pd.s);
      const vs = clamp(dh * a.gs + 0.05 * (ht - a.y), -40, 6);
      ac.gam = gamFor(vs, a.V); ac.nMax = 0.06; ac.gamGain = 0.45;
      ac.V = tasFor(plan.iasKt(pd.s, a.y), a.y, 0.78); ac.accel = 0.5; ac.decel = 0.55;
      D.autoThrust = true;
      if (D.once('captain', t >= 4)) D.announce('descent_captain', { maxDelay: 60 });
      if (D.once('belt', t >= 40)) { D.setSeatbelt(true, true); D.announce('descent_purser', { maxDelay: 120 }); }
      if (D.once('dim', t >= 46)) D.setLightsMode('dim');
      if (D.once('sbOut', pd.s >= plan.sb0)) D.setSpeedbrake(0.4);
      if (D.once('sbIn', pd.s >= plan.sb1)) D.setSpeedbrake(0);
      if (D.once('ll', a.y < 10000 * FT)) { st.lights.landing = true; st.lights.runwayTurnoff = true; }
      const dtg = plan.sFAF - pd.s;
      if (D.once('f1', dtg < 17000 && ad.iasKt < 228)) D.setFlaps(1);
      if (D.once('f5', dtg < 9500 && ad.iasKt < 208)) D.setFlaps(5);
      D.turbScript = 0.05 * (1 - smoothstep(4000, 6000, a.y / FT)) + 0.03;
      if (pd.s >= plan.sFAF) D.setPhase('approach');
    },
    progress(D) { return D.plan ? D.pd.s / D.plan.sFAF : 0; },
  },

  // ------------------------------------------------------------------------------------------ approach
  approach: {
    anchor(D) { D.anchorApproach(); },
    enter(D) {
      const pd = D.pd, a = D.air;
      pd.s = projectOnPath(D.plan.route, a.x, a.z, 0, 100000);
      pd.s0 = pd.s;
      pd.hLevel = a.y;
      pd.cap = null;
    },
    update(D, dt) {
      const st = D.st, a = D.air, ac = D.ac, pd = D.pd, ad = D.ad, t = st.phaseTime;
      a.windK = approach(a.windK, 1, dt / 8);
      const l1 = a.l1Bank(D.plan.route, pd.s, 25 * DEG);
      pd.s = l1.s; ac.bank = l1.bank; ac.phiMax = 25 * DEG;
      const lx = a.x - D.arrOrigin.x;
      const sm = softMin(pd.hLevel, gsHeight(lx), 30);
      const vs = clamp(-a.gs * GS_TAN * sm.wb + 0.12 * (sm.v - a.y), -10, 4);
      ac.gam = gamFor(vs, a.V); ac.nMax = 0.07; ac.gamGain = 0.6;
      if (pd.cap == null && sm.wb > 0.5) pd.cap = t;
      const hAgl = a.y - WHEEL_OFF;
      // configuration & speed
      if (D.once('f5', ad.iasKt < 206)) D.setFlaps(Math.max(5, D.cfg.flapsLever));
      if (D.once('f15', pd.cap != null && t - pd.cap >= 3)) D.setFlaps(15);
      if (D.once('gear', hAgl < 2000 * FT)) D.setGear(true);
      if (D.once('f25', D.cfg.gearDown && hAgl < 1850 * FT)) D.setFlaps(25);
      if (D.once('f30', D.cfg.gearDown && hAgl < 1680 * FT)) D.setFlaps(30);
      if (D.once('fa_landing', hAgl < 1500 * FT)) D.announce('fa_landing', { maxDelay: 20, front: true });
      if (D.once('belt', true) && !st.cabin.seatbelt) D.setSeatbelt(true, true);
      st.lights.landing = true; st.lights.runwayTurnoff = true;
      let ias = pd.cap == null ? 185 : 175;
      if (D.cfg.flapsLever >= 15) ias = 162;
      if (D.cfg.gearDown) ias = 152;
      if (D.cfg.flapsLever >= 30) ias = 145;
      ac.V = tasFor(ias, a.y); ac.accel = 0.4; ac.decel = 0.45;
      D.autoThrust = true;
      D.turbScript = lowLevelTurb(D, hAgl);
      if (D.wheelHeight() <= 50 * FT) D.setPhase('landing');
    },
    progress(D) {
      const pd = D.pd, end = D.plan.sThr - 10;
      return clamp01((pd.s - pd.s0) / Math.max(1, end - pd.s0));
    },
  },

  // ------------------------------------------------------------------------------------------ landing
  landing: {
    enter(D) { D.pd.flare = false; D.pd.td = null; D.pd.ab = 0; },
    update(D, dt) {
      const st = D.st, pd = D.pd, ad = D.ad, t = st.phaseTime;
      if (D.mode === 'air') {
        const a = D.air, ac = D.ac;
        const l1 = a.l1Bank(D.plan.route, pd.s ?? 0, 10 * DEG);
        pd.s = l1.s; ac.bank = l1.bank; ac.phiMax = 10 * DEG;
        const hw = D.wheelHeight();
        if (!pd.flare && hw <= 9.0) {
          pd.flare = true; pd.flareT = t;
          const s0 = Math.max(-a.vy, 1.6);
          pd.tau = hw / Math.max(0.5, s0 - 1.15);
          pd.hoff = 1.15 * pd.tau;
        }
        if (pd.flare) {
          const vy = -(Math.max(0, hw) + pd.hoff) / pd.tau;
          ac.gam = gamFor(vy, a.V); ac.nMax = 0.16; ac.gamGain = 1.6; ac.gamTau = 0.5;
          // de-crab with rudder: align the nose with the runway
          const want = wrapPi(Math.PI / 2 - a.psi);
          _f.x = a.decrab; _f.v = a.decrabV;
          follow(_f, want, dt, 1.6, 2.5 * DEG, 3 * DEG);
          a.decrab = _f.x; a.decrabV = _f.v;
        } else {
          const lx = a.x - D.arrOrigin.x;
          const vs = clamp(-a.gs * GS_TAN + 0.12 * (gsHeight(lx) - a.y), -8, 2);
          ac.gam = gamFor(vs, a.V); ac.nMax = 0.07;
        }
        if (D.once('retard', hw < 6.1)) D.setThrust('idle', 0);
        if (D.fired.has('retard')) {
          const T = engineThrust(st.engines, ad.rho, ad.mach, 0);
          const CL = ad.W / Math.max(1, ad.q * AERO.S);
          const Drag = ad.q * AERO.S * cdFor(CL, st.flapsDeg, st.gear, st.spoilers, false);
          ac.Vdot = clamp((T - Drag) / ad.mass - G * Math.sin(a.gam), -1.6, 0.2);
          D.n1Cmd = 0;
        } else { ac.V = tasFor(145, a.y); ac.accel = 0.3; ac.decel = 0.4; D.autoThrust = true; }
        D.turbScript = lowLevelTurb(D, hw);
        if (hw <= 0) { D.touchdown(); pd.td = t; }
        return;
      }
      // ---- on the runway
      const g = D.ground, c = D.gc, tt = t - (pd.td ?? t);
      // nose gear lowered over ~3 s
      if (tt > 0.7 && g.theta > 0) {
        _f.x = g.theta; _f.v = g.thetaV;
        follow(_f, -0.01, dt, 1.25, 2.6 * DEG, 2.2 * DEG);
        g.theta = _f.x; g.thetaV = _f.v;
        if (g.theta <= 0) {
          g.theta = 0;
          if (D.once('noseOn', true)) { g.pitchS.v -= 0.02 * clamp01(-g.thetaV / (2 * DEG)) + 0.004; g.bumpCount++; }
          g.thetaV = 0;
        }
      } else if (g.theta > 0) { g.thetaV = approach(g.thetaV, 0, 2 * DEG * dt); g.theta = Math.max(0, g.theta + g.thetaV * dt); }
      if (D.once('gsp', tt >= 0.35)) D.setGroundSpoilers(true);
      if (D.once('rev', tt >= 1.0)) D.setReverser(true);
      if (D.once('revIdle', ad.iasKt < 70)) D.setThrust('reverse_idle', 0.1);
      if (D.once('revStow', ad.iasKt < 60)) D.setReverser(false);
      if (D.fired.has('rev') && !D.fired.has('revIdle') && st.reverser > 0.85) { if (D.once('revThr', true)) D.setThrust('reverse', 0.7); D.n1Cmd = 70; }
      else D.n1Cmd = 0;
      if (tt >= 1.3) pd.ab = approach(pd.ab, 2.2, 0.9 * dt);
      c.hold = false; c.stopAtEnd = false; c.amax = 0.3; c.bmax = 3.0; c.jerk = 1.2; c.gain = 1.2;
      c.aMinBrake = g.v > 17.5 ? pd.ab : null;
      const CL = clFor(g.theta / DEG, st.flapsDeg, ad.mach, st.spoilers);
      c.liftFrac = clamp01(ad.q * AERO.S * CL / ad.W);
      c.joints = 15; c.bump = 0.0024;
      if (D.once('landing_welcome', ad.iasKt < 30)) D.announce('landing_welcome', { maxDelay: 30 });
      if (g.s >= D.paths.rolloutEnd - 1 || (g.v < 9 && g.s > D.paths.exitStart + 40)) D.setPhase('taxi_in');
    },
    progress(D) {
      if (D.mode === 'air') return 0.25 * clamp01(1 - D.wheelHeight() / (50 * FT));
      return 0.25 + 0.75 * clamp01(D.ground.s / Math.max(1, D.paths.exitStart + 40));
    },
  },

  // ------------------------------------------------------------------------------------------ taxi in
  taxi_in: {
    anchor(D) { D.anchorTaxiIn(); },
    enter(D) {
      const st = D.st, L = st.lights;
      D.setFlaps(0);
      if (D.cfg.groundSpoilers) D.setGroundSpoilers(false);
      if (D.cfg.reverser) D.setReverser(false);
      L.strobe = false; L.landing = false; L.taxi = true;
      const end = D.paths.rolloutEnd;
      D.ground.buildProfile({ vmax: (s) => (s < end ? 16 : 10), alat: 0.11 * G, decel: 0.6 });
      D.pd.park = null; D.pd.s0 = D.ground.s;
    },
    update(D) {
      const st = D.st, pd = D.pd, g = D.ground, t = st.phaseTime;
      if (pd.park == null) {
        taxiControl(D);
        D.gc.capFn = creepCap;
        D.groundThrust(true);
        if (D.once('apu', t >= 30)) D.setApu(true);
        if (D.once('turnoff', g.s > D.paths.rolloutEnd + 60)) st.lights.runwayTurnoff = false;
        if (g.stopped && g.remaining < 0.05) pd.park = t;
        return;
      }
      D.gc.hold = true;
      const tp = t - pd.park;
      if (D.once('taxiOff', tp >= 1)) st.lights.taxi = false;
      if (D.once('cutoff', tp >= 3)) D.shutdownEngines();
      if (D.once('beltOff', tp >= 4.5)) D.setSeatbelt(false, true);
      if (D.once('disarm', tp >= 6.5)) { D.announce('doors_disarm', { maxDelay: 30, front: true }); D.setArmed(false); }
      if (D.once('beacon', tp >= 16)) st.lights.beacon = false;
      if (D.once('bridge', tp >= 20)) D.setBridge(true, 'arrival');
      if (D.once('door', tp >= 52)) { D.setDoors(false); D.setLightsMode('bright'); }
      if (D.once('farewell', tp >= 56)) D.announce('farewell', { maxDelay: 60 });
      if (tp >= 62) D.setPhase('arrived');
    },
    progress(D) {
      const g = D.ground, pd = D.pd;
      const f = (g.s - pd.s0) / Math.max(1, g.path.length - pd.s0);
      return 0.8 * clamp01(f) + 0.2 * (pd.park != null ? clamp01((D.st.phaseTime - pd.park) / 62) : 0);
    },
  },

  // ------------------------------------------------------------------------------------------ arrived
  arrived: {
    anchor(D) { D.anchorArrived(); },
    enter(D) { D.setLightsMode('boarding'); D.setMusic(true); D.setApu(true); },
    update(D) { D.gc.hold = true; },
    progress(D) { return clamp01(D.st.phaseTime / 120); },
  },
};

// creep to the stand: slow final turn, 1-2 m/s over the last metres (marshaller / docking guidance)
function creepCap(dEnd) {
  if (dEnd > 140) return Infinity;
  return lerp(1.25, 4.2, smoothstep(8, 140, dEnd));
}

/** Which canonical anchor a jump to `phase` starts from (then fast-forwarded). */
export const ANCHOR_OF = {
  gate: 'gate', pushback: 'pushback', taxi_out: 'taxi_out', lineup: 'lineup', takeoff: 'takeoff', climb: 'takeoff',
  cruise: 'cruise', descent: 'descent', approach: 'approach', landing: 'approach', taxi_in: 'taxi_in', arrived: 'arrived',
};
