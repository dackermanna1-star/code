// How the people of Vice City behave. Each person is in one state at a time;
// think() (a few times a second) makes the decisions, act() (every frame)
// turns the state into a wanted velocity and a pose. The manager (peds.js)
// does the moving, the separation and the drawing.
//
// States: walk (the sidewalk graph) | wait (at a crosswalk) | idle | chat | sit | lie | wander (beach) |
//         flee | cower | film | handsup | fight | shoot | dodge | stagger | down (knocked over) | getup | dead | drive | brain
import * as THREE from 'three';
import { V } from '../state.js';
import { ITEM, GUN_ITEMS, handPoint } from './crowd.js';

export const WALK = 6.6, RUN = 14, SPRINT = 21;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _pt = { x: 0, y: 0, z: 0 };
const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---- lines (2008 chat bubbles) ---------------------------------------------------------------------------------------
export const LINES = {
  hey: ['Hey!', 'Watch it!', 'Excuse me!?', '¡Oye!', 'Rude!', 'Look where you\'re going!'],
  scared: ['Help!', 'Aaah!', 'Call the cops!', 'Run!', 'He\'s got a gun!', '¡Ayúdame!', 'Somebody help!', 'Oh my God!'],
  insult: ['You lost?', 'Wrong hood.', 'Keep walking.', 'This is our turf!', 'What you looking at?'],
  angry: ['You want some?!', 'Come on then!', 'Big mistake!', 'You\'re dead!', 'Get him!'],
  carjack: ['My car!', 'Thief!', 'That\'s my car!', 'Hey! Come back!'],
  hurt: ['Ow!', 'Argh!', 'My leg!', 'Ugh!'],
  chat: ['Nice day, huh?', 'Love this city.', 'Where\'s the party?', 'Ocean Drive tonight!', 'Did you see that?', 'Hot one today.', 'Ha ha ha!', 'No way!', 'Totally.'],
  film: ['I\'m getting this!', 'This is going online!', 'Woah woah woah...'],
  dodge: ['Whoa!', 'Learn to drive!', 'Maniac!', 'Are you crazy?!', 'Slow down!'],
  hostile: ['Get him!', 'Light him up!', 'You picked the wrong street!'],
  handsup: ['Don\'t shoot!', 'Take it easy!', 'Please!', 'OK, OK!'],
  cop: ['Freeze!', 'Police! Drop it!', 'Get on the ground!', 'Stop right there!', 'Hands where I can see them!', 'VCPD!'],
};

// ---- the brain --------------------------------------------------------------------------------------------------------
/** Decisions (called ~4 times a second). */
export function think(sys, p, dt) {
  const s = p.st;
  switch (p.state) {
    case 'walk': {
      // now and then: stop to look at the phone, take a call, have a drink
      if (sys.rand() < dt * 0.02 && !p.jogger && !p.gangster) setState(sys, p, 'idle', { secs: 4 + sys.rand() * 10, arms: pickIdle(sys, p) });
      break;
    }
    case 'wait': {
      if (sys.canCross(s.edge)) { p.nav.wait = false; setState(sys, p, 'walk'); }
      else if ((s.t || 0) > 28) { // gave up waiting: go another way
        sys.turnBack(p); setState(sys, p, 'walk');
      } else if (!s.arms && sys.rand() < 0.08) s.arms = sys.rand() < 0.5 ? 'text' : 'idle';
      break;
    }
    case 'idle': case 'chat': case 'sit': case 'lie': {
      if (s.secs != null && s.t > s.secs) {
        if (p.state === 'chat' && p.group) { for (const q of p.group.members) if (q !== p && q.state === 'chat') q.st.secs = q.st.t; }
        sys.leaveSpot(p);
        rejoin(sys, p);
      }
      if (p.state === 'chat' && sys.rand() < dt * 0.04) sys.say(p, 'chat', 2.2);
      if (p.gangster) gangLook(sys, p);
      break;
    }
    case 'wander': {
      const tx = s.tx, tz = s.tz;
      if (tx == null || Math.hypot(tx - p.pos.x, tz - p.pos.z) < 3 || s.t > 30) {
        if (sys.rand() < 0.35) setState(sys, p, 'idle', { secs: 3 + sys.rand() * 8, arms: pickIdle(sys, p), back: 'wander' });
        else { const a = sys.rand() * TAU, r = 20 + sys.rand() * 60; const q = sys.beachPoint(p.home?.x ?? p.pos.x, p.home?.z ?? p.pos.z, a, r); s.tx = q.x; s.tz = q.z; s.t = 0; }
      }
      break;
    }
    case 'flee': {
      // stop running when it's been quiet for a while and the danger is far
      const th = p.threat;
      const far = !th || Math.hypot(th.x - p.pos.x, th.z - p.pos.z) > 90;
      if (s.t > (s.secs || 8) && far) { p.threat = null; rejoin(sys, p); break; }
      if (p.onNav) break;
      // off the sidewalks: re-aim away from the threat now and then (around whatever we bumped into)
      if (s.stuck > 0.6) { s.ang = (s.ang ?? 0) + (sys.rand() < 0.5 ? 1 : -1) * (0.8 + sys.rand()); s.stuck = 0; }
      break;
    }
    case 'cower': if (s.t > s.secs) setState(sys, p, 'flee', { secs: 6 + sys.rand() * 6 }); break;
    case 'film': {
      const th = p.threat;
      if (s.t > s.secs || (th && Math.hypot(th.x - p.pos.x, th.z - p.pos.z) < 22)) setState(sys, p, 'flee', { secs: 6 + sys.rand() * 4 });
      break;
    }
    case 'handsup': {
      const W = V.weapons;
      if (!(W?.aiming && W.target === p) && s.t > 1.2) { setState(sys, p, 'flee', { secs: 8 }); sys.report(p, 'assault', V.player); }
      break;
    }
    case 'stagger': if (s.t > (s.secs || 0.35)) resume(sys, p); break;
    case 'dodge': if (s.t > 0.65) { if (sys.rand() < 0.5) { sys.say(p, 'dodge', 2); setState(sys, p, 'idle', { secs: 1.5, arms: 'wave', face: s.car?.pos }); } else setState(sys, p, 'flee', { secs: 3 + sys.rand() * 3 }); } break;
    case 'fight': fightThink(sys, p); break;
    case 'shoot': shootThink(sys, p, dt); break;
    default: break;
  }
}

function pickIdle(sys, p) {
  const it = p.fig.item;
  if (it === ITEM.phone) return sys.rand() < 0.5 ? 'phone' : 'text';
  if (it === ITEM.drink || it === ITEM.cup) return 'drink';
  if (it === ITEM.cigar) return 'drink';
  if (p.gangster) return sys.rand() < 0.5 ? 'fold' : 'idle';
  const r = sys.rand();
  return r < 0.25 ? 'text' : r < 0.4 ? 'phone' : r < 0.55 ? 'fold' : 'idle';
}

/** Back to everyday life: onto the nearest sidewalk (or wandering the sand). */
export function rejoin(sys, p) {
  if (p.beach && !p.onNav) { setState(sys, p, 'wander'); return; }
  if (sys.joinNav(p)) setState(sys, p, 'walk');
  else setState(sys, p, 'wander');
}

/** Pick up where we were (after a flinch). */
function resume(sys, p) {
  const b = p.st.back || (p.threat ? 'flee' : null);
  if (b === 'flee') setState(sys, p, 'flee', { secs: 6 });
  else if (b === 'fight' || b === 'shoot') setState(sys, p, b, { target: p.st.target });
  else if (b && b !== 'stagger') setState(sys, p, b, p.st.backSt || {});
  else rejoin(sys, p);
}

export function setState(sys, p, state, o = {}) {
  if (p.dead && state !== 'dead') return;
  const prev = p.state;
  p.state = state;
  p.st = { t: 0, ...o };
  if (state !== 'walk' && state !== 'wait') p.nav.wait = false;
  if (state === 'flee' && prev !== 'flee') p.st.ang = null;
  if (state !== 'idle' || !o.keepItem) sys.holdItem(p);
}

// ---- reactions --------------------------------------------------------------------------------------------------------
/** Something frightening happened at (x, z) (by: who did it). How scared depends on how close. */
export function scare(sys, p, x, z, by, level = 1) {
  if (p.dead || p.vehicle || p.brain || p.state === 'down' || p.state === 'getup') return;
  if (p.gangster || p.kind === 'cop' || p.kind === 'swat') {
    // gangs and cops don't run: they look for whoever's shooting
    if (by && by.isPlayer && p.gangster && Math.hypot(x - p.pos.x, z - p.pos.z) < 45) sys.angerGang(p, by);
    return;
  }
  if (p.state === 'fight' || p.state === 'shoot') return;
  const d = Math.hypot(x - p.pos.x, z - p.pos.z);
  p.threat = { x, z, by, t: sys.time };
  if (p.state === 'flee') { p.st.secs = Math.max(p.st.secs || 0, p.st.t + 5); return; }
  if (p.state === 'cower') return;
  const r = sys.rand();
  if (d < 14 * level && r < 0.3) { setState(sys, p, 'cower', { secs: 2 + sys.rand() * 3 }); scream(sys, p); return; }
  if (d > 35 && r < p.curious * 0.45 && level < 2) { setState(sys, p, 'film', { secs: 4 + sys.rand() * 6 }); if (sys.rand() < 0.3) sys.say(p, 'film', 2); return; }
  setState(sys, p, 'flee', { secs: 7 + sys.rand() * 7 });
  if (sys.rand() < 0.35 / Math.max(1, d / 30)) scream(sys, p);
  else if (sys.rand() < 0.15) sys.say(p, 'scared', 2);
}
function scream(sys, p) {
  if (sys.time - (sys.lastScream || 0) < 0.6) return;
  sys.lastScream = sys.time;
  V.audio?.scream?.(p.pos);
  if (sys.rand() < 0.5) sys.say(p, 'scared', 1.8);
}

/** Hurt but alive: flinch, then fight back, shoot back or run (and report it). */
export function hurt(sys, p, attacker, info) {
  if (p.dead || p.vehicle) return;
  if (p.brain) { p.brain.onHit?.(p, attacker, info); return; }
  const by = attacker && attacker.pos ? attacker : null;
  if (by) p.threat = { x: by.pos.x, z: by.pos.z, by, t: sys.time };
  if (p.state === 'down' || p.state === 'getup') { p.st.after = by && (p.tough > 0.7 || p.gangster) ? 'fight' : 'flee'; return; }
  if (p.gangster && by) { sys.angerGang(p, by); return; }
  if ((p.kind === 'cop' || p.kind === 'swat') && by) { setState(sys, p, p.weapon && p.weapon !== 'fists' ? 'shoot' : 'fight', { target: by }); return; }
  if (p.state === 'fight' || p.state === 'shoot') return;
  // tough people (and anyone with a gun) fight back; the rest run
  if (by && (p.armed() || (p.tough > 0.72 && info.melee))) {
    setState(sys, p, 'stagger', { secs: 0.3, back: p.armed() ? 'shoot' : 'fight', target: by, dir: info.dir });
    sys.say(p, 'angry', 2);
    return;
  }
  setState(sys, p, 'stagger', { secs: 0.3, back: 'flee', dir: info.dir });
  if (sys.rand() < 0.5) scream(sys, p); else sys.say(p, 'hurt', 1.6);
  if (by?.isPlayer && info.melee) sys.report(p, 'assault', by);
}

/** A car is coming: jump out of its way (side: +1 to the car's right). */
export function dodge(sys, p, car, side) {
  if (p.dead || p.vehicle || p.brain || p.state === 'dodge' || p.state === 'down' || p.state === 'getup' || p.state === 'sit' || p.state === 'lie') return;
  const h = car.heading ?? 0, rx = -Math.cos(h) * side, rz = Math.sin(h) * side;
  // (the car's right is (-cos h, sin h) for forward (sin h, cos h))
  setState(sys, p, 'dodge', { car, dx: rx, dz: rz });
  p.vel.x = rx * 19; p.vel.z = rz * 19; p.vel.y = 13;
  p.grounded = false;
  p.heading = Math.atan2(rx, rz);
  if (sys.rand() < 0.4) scream(sys, p);
}

// ---- gangs -------------------------------------------------------------------------------------------------------------
function gangLook(sys, p) {
  const P = V.player;
  if (!P || P.dead) return;
  const d = Math.hypot(P.pos.x - p.pos.x, P.pos.z - p.pos.z);
  if (d < 14 && !P.vehicle && sys.time - (p.insultT || -99) > 20 && sys.rand() < 0.5) { p.insultT = sys.time; sys.say(p, 'insult', 2.5); p.st.face = P.pos; }
}

// ---- fighting with fists ------------------------------------------------------------------------------------------------
function fightThink(sys, p) {
  const s = p.st, tg = s.target;
  if (!tg || tg.dead || (tg.vehicle && !tg.isPlayer) || s.t > 25 || (tg.pos && Math.hypot(tg.pos.x - p.pos.x, tg.pos.z - p.pos.z) > 70)) {
    p.threat = null; setState(sys, p, 'idle', { secs: 2 + sys.rand() * 3, arms: 'guard' }); return;
  }
  if (tg.vehicle) { // they drove off (or sat in a car): give up after a bit
    if (s.t > 4) { setState(sys, p, 'idle', { secs: 2, arms: 'wave', face: tg.pos }); sys.say(p, 'angry', 2); }
  }
  // armed people shoot instead
  if (p.armed() && GUN_ITEMS.has(sys.itemFor(p.weapon))) setState(sys, p, 'shoot', { target: tg });
}

// ---- shooting ------------------------------------------------------------------------------------------------------------
function shootThink(sys, p, dt) {
  const s = p.st, tg = s.target;
  if (!tg || tg.dead || s.t > 40 || Math.hypot(tg.pos.x - p.pos.x, tg.pos.z - p.pos.z) > 160) {
    p.threat = null; setState(sys, p, 'idle', { secs: 3, arms: p.weapon ? 'pistolLow' : 'idle' }); return;
  }
  // can we see them? (refresh a few times a second)
  s.sees = sys.lineOfSight(p, tg);
  if (s.sees) { s.lastSeen = sys.time; s.lx = tg.pos.x; s.lz = tg.pos.z; }
  // keep moving: strafe a little, close in when far or blind, back off when too close
  const d = Math.hypot(tg.pos.x - p.pos.x, tg.pos.z - p.pos.z);
  if (!s.strafeT || s.t > s.strafeT) { s.strafeT = s.t + 1 + sys.rand() * 2; s.strafe = sys.rand() < 0.5 ? (sys.rand() < 0.5 ? -1 : 1) : 0; }
  s.dist = d;
}

// ---- per frame -----------------------------------------------------------------------------------------------------------
/** The state as movement (p.want: x, z velocity; p.faceTo) and pose (p.P). */
export function act(sys, p, dt) {
  const s = p.st, P = p.P;
  s.t += dt;
  P.t = sys.time; P.arms = null; P.act = 0; P.crouch = 0; P.hipY = 2; P.legs = 0; P.lean = 0; P.lie = 0; P.roll = 0; P.look = 0; P.aimDir = null; P.aimPitch = 0; P.twist = 0; P.spread = 0; P.tilt = 0; P.legR = 0; P.legL = 0; P.headYaw = 0; P.fall = 0;
  const want = p.want;
  want.x = 0; want.z = 0; want.face = null; want.run = false;
  const spd = p.walkSpeed;
  switch (p.state) {
    case 'walk': {
      if (!p.onNav) { rejoin(sys, p); break; }
      sys.followNav(p, dt, p.jogger ? 12.5 : spd, want);
      P.arms = p.armsWalk;
      if (P.arms === 'drink' && sys.rand() < 0.002) P.arms = 'drink';
      break;
    }
    case 'wait': {
      want.face = s.face || null;
      P.arms = s.arms || 'idle';
      if (p.fig.item === ITEM.phone && P.arms === 'idle') P.arms = 'text';
      // keep to our spot at the kerb
      if (s.x != null) { const dx = s.x - p.pos.x, dz = s.z - p.pos.z, dd = Math.hypot(dx, dz); if (dd > 0.6) { want.x = dx / dd * Math.min(spd, dd * 3); want.z = dz / dd * Math.min(spd, dd * 3); } }
      break;
    }
    case 'idle': {
      want.face = s.face || null;
      P.arms = s.arms || 'idle';
      if (P.arms === 'phone' || P.arms === 'text') P.look = P.arms === 'text' ? 0.45 : 0.05;
      if (s.x != null) { const dx = s.x - p.pos.x, dz = s.z - p.pos.z, dd = Math.hypot(dx, dz); if (dd > 0.8) { want.x = dx / dd * Math.min(spd, dd * 2); want.z = dz / dd * Math.min(spd, dd * 2); } }
      P.headYaw = Math.sin(sys.time * 0.35 + p.seed * 7) * 0.45;
      break;
    }
    case 'chat': {
      want.face = s.center;
      P.arms = p.gangster && (p.seed * 10 | 0) % 3 === 0 ? 'fold' : 'talk';
      if (s.x != null) { const dx = s.x - p.pos.x, dz = s.z - p.pos.z, dd = Math.hypot(dx, dz); if (dd > 0.8) { want.x = dx / dd * Math.min(spd, dd * 2); want.z = dz / dd * Math.min(spd, dd * 2); } else if (dd < 0.3) { p.vel.x *= 0.5; p.vel.z *= 0.5; } }
      P.headYaw = Math.sin(sys.time * 0.5 + p.seed * 5) * 0.3;
      P.headTilt = Math.sin(sys.time * 1.3 + p.seed * 3) * 0.08;
      break;
    }
    case 'sit': {
      const sp = s.spot;
      if (sp) { p.pos.x += (sp.x - p.pos.x) * Math.min(1, dt * 6); p.pos.z += (sp.z - p.pos.z) * Math.min(1, dt * 6); p.heading = sp.heading; p.vel.set(0, 0, 0); }
      P.arms = p.fig.item === ITEM.phone ? 'text' : p.fig.item === ITEM.newspaper ? 'text' : p.fig.item === ITEM.drink ? 'drink' : 'sit';
      P.legs = Math.PI / 2 - 0.12; P.hipY = s.seatY ?? 1.9; P.lean = -0.06;
      if (P.arms === 'text') P.look = 0.4;
      p.pinned = true;
      break;
    }
    case 'lie': {
      const sp = s.spot;
      if (sp) { p.pos.x = sp.x; p.pos.z = sp.z; p.heading = sp.heading; p.vel.set(0, 0, 0); }
      P.lie = 1; P.arms = 'lie'; P.spread = 0.08;
      p.pinned = true;
      break;
    }
    case 'wander': {
      if (s.tx != null) steer(want, p, s.tx, s.tz, p.jogger ? 12 : spd * 0.85);
      P.arms = p.armsWalk;
      break;
    }
    case 'flee': {
      const th = p.threat;
      want.run = true;
      const sp = (p.limp ? RUN : SPRINT) * (0.85 + p.seed * 0.15);
      if (p.onNav && th) sys.fleeNav(p, dt, sp, want, th);
      else {
        let ax = th ? p.pos.x - th.x : Math.sin(p.heading), az = th ? p.pos.z - th.z : Math.cos(p.heading);
        let a = Math.atan2(ax, az);
        if (s.ang != null) a += s.ang;
        // not into the sea: run along the shore instead
        if (V.ground?.waterAt?.(p.pos.x + Math.sin(a) * 8, p.pos.z + Math.cos(a) * 8) === 0) {
          const l = a + Math.PI / 2, r = a - Math.PI / 2;
          const wl = V.ground.waterAt(p.pos.x + Math.sin(l) * 8, p.pos.z + Math.cos(l) * 8) === 0;
          s.ang = (s.ang || 0) + (wl ? -Math.PI / 2 : Math.PI / 2) * (wl && V.ground.waterAt(p.pos.x + Math.sin(r) * 8, p.pos.z + Math.cos(r) * 8) === 0 ? 2 : 1);
          a = Math.atan2(ax, az) + s.ang;
        }
        want.x = Math.sin(a) * sp; want.z = Math.cos(a) * sp;
        // stuck against something?
        const hs = Math.hypot(p.vel.x, p.vel.z);
        s.stuck = hs < sp * 0.3 && s.t > 0.5 ? (s.stuck || 0) + dt : 0;
        if (s.t > 1.5 && !p.beach && sys.rand() < dt * 0.6) sys.joinNav(p, 30);
      }
      P.arms = (p.seed * 100 | 0) % 3 === 0 ? 'flee' : null;
      break;
    }
    case 'cower': {
      want.face = p.threat ? _pt : null;
      if (p.threat) { _pt.x = p.threat.x; _pt.z = p.threat.z; }
      P.crouch = 1; P.arms = 'cower'; P.look = 0.5;
      P.tilt = Math.sin(sys.time * 22 + p.seed * 9) * 0.03; // trembling
      break;
    }
    case 'film': {
      if (p.threat) { _pt.x = p.threat.x; _pt.z = p.threat.z; want.face = _pt; }
      P.arms = 'film'; P.aimPitch = 0.05;
      break;
    }
    case 'handsup': {
      if (V.player) want.face = V.player.pos;
      P.arms = 'handsup'; P.tilt = Math.sin(sys.time * 20) * 0.02;
      break;
    }
    case 'stagger': {
      const d = s.dir;
      if (d) { want.x = d.x * 3; want.z = d.z * 3; }
      P.arms = 'idle'; P.lean = -0.35 * Math.max(0, 1 - s.t / 0.35); P.twist = 0.3 * Math.max(0, 1 - s.t / 0.35);
      want.face = null; p.keepHeading = true;
      break;
    }
    case 'dodge': {
      P.arms = 'flee'; P.roll = (p.st.dx * Math.cos(p.heading) - p.st.dz * Math.sin(p.heading)) * 0; P.lean = 0.5; P.legs = 0.4;
      p.keepHeading = true;
      break;
    }
    case 'fight': fightAct(sys, p, dt, want); break;
    case 'shoot': shootAct(sys, p, dt, want); break;
    default: break;
  }
  if (p.limp && (p.state === 'walk' || p.state === 'flee')) { P.legR = Math.sin(P.walk) * -0.3; P.tilt += Math.sin(P.walk) * 0.06; }
}

/** Steer the wanted velocity towards (x, z). */
export function steer(want, p, x, z, speed, slowR = 2) {
  const dx = x - p.pos.x, dz = z - p.pos.z, d = Math.hypot(dx, dz);
  if (d < 0.05) return d;
  const sp = Math.min(speed, d * (speed / slowR));
  want.x = dx / d * sp; want.z = dz / d * sp;
  return d;
}

function fightAct(sys, p, dt, want) {
  const s = p.st, tg = s.target, P = p.P;
  if (!tg || !tg.pos) return;
  const dx = tg.pos.x - p.pos.x, dz = tg.pos.z - p.pos.z, d = Math.hypot(dx, dz);
  want.face = tg.pos;
  P.arms = 'guard';
  s.swing = (s.swing ?? 0.6) - dt;
  if (s.atk != null) {
    // a punch (or a kick) in progress: the blow lands at 45%
    s.atk += dt / (s.kick ? 0.7 : 0.45);
    P.arms = s.kick ? 'kick' : p.melee() ? 'melee' : 'punch'; P.act = Math.min(1, s.atk); P.side = s.side;
    P.twist = (s.kick ? 0 : 0.35 * Math.sin(Math.min(1, s.atk) * Math.PI)) * -s.side;
    if (!s.landed && s.atk > 0.45) { s.landed = true; sys.meleeHit(p, tg, s.kick); }
    if (s.atk >= 1) { s.atk = null; s.swing = 0.35 + sys.rand() * 0.7; }
    return;
  }
  if (d > 2.6) { steer(want, p, tg.pos.x, tg.pos.z, d > 8 ? RUN : WALK * 1.2, 1); P.arms = d > 8 ? null : 'guard'; }
  else if (d < 1.6) { want.x = -dx / d * 3; want.z = -dz / d * 3; }
  else {
    // circle a little
    const side = Math.sin(sys.time * 0.7 + p.seed * 9);
    want.x = -dz / d * side * 2.5; want.z = dx / d * side * 2.5;
  }
  if (d < 3.4 && s.swing <= 0) { s.atk = 0; s.landed = false; s.kick = sys.rand() < 0.2 && !p.melee(); s.side = (s.side || 1) * -1; }
}

function shootAct(sys, p, dt, want) {
  const s = p.st, tg = s.target, P = p.P;
  if (!tg || !tg.pos) return;
  const dx = tg.pos.x - p.pos.x, dz = tg.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
  want.face = tg.pos;
  const item = sys.itemFor(p.weapon);
  const rifle = item === ITEM.rifle || item === ITEM.smg || item === ITEM.ak || item === ITEM.shotgun || item === ITEM.sniper;
  // move: close in when we can't see them or they're far, back off when close, strafe
  const sees = s.sees;
  if (!sees && s.lx != null) steer(want, p, s.lx, s.lz, RUN);
  else if (d > 38) steer(want, p, tg.pos.x, tg.pos.z, RUN);
  else if (d < 9) { want.x = -dx / d * WALK; want.z = -dz / d * WALK; }
  else if (s.strafe) { want.x = -dz / d * s.strafe * WALK * 0.8; want.z = dx / d * s.strafe * WALK * 0.8; }
  // aim (at the chest), and fire in bursts
  const ty = (tg.pos.y || 0) + (tg.isPlayer ? 3.2 : 3.0);
  handPoint(p.fig, _o);
  _d.set(tg.pos.x - _o.x, ty - _o.y, tg.pos.z - _o.z).normalize();
  P.arms = rifle ? 'rifle' : 'pistol';
  P.aimDir = _d; P.aimPitch = Math.asin(Math.max(-1, Math.min(1, _d.y)));
  P.twist = rifle ? 0.25 : 0.1;
  s.aimT = (s.aimT || 0) + dt;
  s.cool = (s.cool ?? 0.6 + sys.rand() * 0.5) - dt;
  if (sees && s.aimT > 0.45 && s.cool <= 0 && Math.abs(wrap(Math.atan2(dx, dz) - p.heading)) < 0.5) {
    sys.fire(p, tg, _o, _d);
    const w = sys.weaponStats(p.weapon);
    s.burst = (s.burst ?? (w.auto ? 3 + (sys.rand() * 4 | 0) : 1)) - 1;
    if (s.burst > 0) s.cool = 60 / (w.rpm || 400);
    else { s.burst = null; s.cool = (w.auto ? 0.6 : 0.45) + sys.rand() * (w.auto ? 0.9 : 0.6); }
  }
}

export { wrap };
