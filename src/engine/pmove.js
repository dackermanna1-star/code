// Player movement: a port of Half-Life / Counter-Strike 1.6 pm_shared.c
// (walk/air move, friction, edge friction, step-up, ducking, jumping with
// CS's stamina penalty, punch-angle decay, fall velocity).

import { angleVectors } from './coords.js';
import { TraceResult, MASK_PLAYER, MASK_WORLD_PLAYER } from './collision.js';

export const MOVEVARS = {
  gravity: 800,
  stopspeed: 75,
  maxspeed: 320,
  accelerate: 5,
  airaccelerate: 10,
  friction: 4,
  edgefriction: 2,
  stepsize: 18,
  bounce: 1,
  maxvelocity: 2000,
};

export const HULL_STAND = { mins: [-16, -16, -36], maxs: [16, 16, 36] };
export const HULL_DUCK = { mins: [-16, -16, -18], maxs: [16, 16, 18] };
export const VEC_VIEW = 17;
export const VEC_DUCK_VIEW = 12;
const TIME_TO_DUCK = 0.4;
const DUCK_DIFF = 18; // VEC_DUCK_HULL_MIN - VEC_HULL_MIN
const PLAYER_DUCKING_MULTIPLIER = 0.333;
const STOP_EPSILON = 0.1;
const MAX_CLIP_PLANES = 5;
export const PLAYER_FALL_PUNCH_THRESHHOLD = 350;
export const PLAYER_MAX_SAFE_FALL_SPEED = 500;
export const PLAYER_FATAL_FALL_SPEED = 1100;

export const IN_JUMP = 1, IN_DUCK = 2, IN_WALK = 4, IN_ATTACK = 8, IN_ATTACK2 = 16, IN_USE = 32, IN_RELOAD = 64;

export function createPlayerMove() {
  return {
    origin: [0, 0, 0],
    velocity: [0, 0, 0],
    angles: [0, 0, 0], // pitch yaw roll (view angles)
    punch: [0, 0, 0],
    onground: false,
    groundNormal: [0, 0, 1],
    groundBrush: null,
    ducking: false, // FL_DUCKING (duck hull)
    inDuck: false,
    duckTime: 0, // ms
    viewOfs: VEC_VIEW,
    oldbuttons: 0,
    fuser2: 0, // jump stamina (ms)
    maxspeed: 250,
    velocityModifier: 1,
    fallVelocity: 0,
    stepTime: 0,
    frozen: false,
    dead: false,
    // events produced during the move (consumed by game code)
    events: [],
  };
}

const tr = new TraceResult();
const fwd = [0, 0, 0], rgt = [0, 0, 0], upv = [0, 0, 0];

export class PlayerMover {
  constructor(world) {
    this.world = world;
    this.vars = MOVEVARS;
    this.ignore = null;
  }

  hull(pm) { return pm.ducking ? HULL_DUCK : HULL_STAND; }

  traceHull(pm, start, end, out = tr) {
    const h = this.hull(pm);
    return this.world.trace(start, end, h.mins, h.maxs, MASK_PLAYER, out, this.ignore);
  }

  // cmd: { forwardmove, sidemove, upmove, buttons }, dt seconds (fixed 0.01 recommended)
  move(pm, cmd, dt) {
    const mv = this.vars;
    pm.frametime = dt;
    const msec = dt * 1000;
    // PM_ReduceTimers
    if (pm.duckTime > 0) pm.duckTime = Math.max(0, pm.duckTime - msec);
    if (pm.fuser2 > 0) pm.fuser2 = Math.max(0, pm.fuser2 - msec);

    dropPunchAngle(pm.punch, dt);

    let fmove = cmd.forwardmove, smove = cmd.sidemove, umove = cmd.upmove || 0;
    if (pm.frozen || pm.dead) { fmove = smove = umove = 0; }
    // PM_CheckParamters: clamp to maxspeed
    let maxspeed = Math.min(pm.maxspeed, mv.maxspeed) * (pm.velocityModifier ?? 1);
    if (pm.frozen) maxspeed = 0.001;
    if (cmd.buttons & IN_WALK) { fmove *= 0.52; smove *= 0.52; }
    const spd = Math.sqrt(fmove * fmove + smove * smove + umove * umove);
    if (spd !== 0 && spd > maxspeed) {
      const r = maxspeed / spd;
      fmove *= r; smove *= r; umove *= r;
    }
    pm.curMaxspeed = maxspeed;

    angleVectors(pm.angles[0], pm.angles[1], fwd, rgt, upv);

    this.categorizePosition(pm);
    this.updateStepSound(pm, msec);

    // PM_Duck
    const buttons = pm.dead ? 0 : cmd.buttons;
    const changed = pm.oldbuttons ^ buttons;
    const pressed = changed & buttons;
    if (buttons & IN_DUCK) pm.oldbuttons |= IN_DUCK; else pm.oldbuttons &= ~IN_DUCK;
    if ((buttons & IN_DUCK) || pm.inDuck || pm.ducking) {
      // CS applies the duck speed penalty as soon as duck is held
      fmove *= PLAYER_DUCKING_MULTIPLIER; smove *= PLAYER_DUCKING_MULTIPLIER;
      if (buttons & IN_DUCK) {
        if ((pressed & IN_DUCK) && !pm.ducking) {
          pm.duckTime = 1000;
          pm.inDuck = true;
        }
        const time = Math.max(0, 1 - pm.duckTime / 1000);
        if (pm.inDuck) {
          if (pm.duckTime / 1000 <= 1 - TIME_TO_DUCK || !pm.onground) {
            this.finishDuck(pm);
          } else {
            const f = splineFraction(time, 1 / TIME_TO_DUCK);
            pm.viewOfs = (VEC_DUCK_VIEW - DUCK_DIFF) * f + VEC_VIEW * (1 - f);
          }
        }
      } else {
        this.unDuck(pm);
      }
    }

    // MOVETYPE_WALK
    this.addCorrectGravity(pm);
    if (buttons & IN_JUMP) this.jump(pm);
    else pm.oldbuttons &= ~IN_JUMP;

    if (pm.onground) {
      pm.velocity[2] = 0;
      this.friction(pm);
    }
    this.checkVelocity(pm);
    if (pm.onground) this.walkMove(pm, fmove, smove);
    else this.airMove(pm, fmove, smove);

    this.categorizePosition(pm);
    this.fixupGravityVelocity(pm);
    if (pm.onground) pm.velocity[2] = 0;
    this.checkFalling(pm);
    if (!pm.onground) pm.fallVelocity = -pm.velocity[2];
  }

  // CS: footsteps only above 150 u/s (so walking and crouching are silent), every 300 ms.
  updateStepSound(pm, msec) {
    if (pm.stepTime > 0) { pm.stepTime -= msec; return; }
    if (pm.frozen || pm.dead) return;
    const v = pm.velocity;
    const speed = Math.hypot(v[0], v[1], v[2]);
    if (speed <= 150) { pm.stepTime = 400; return; }
    if (!pm.onground) return;
    pm.stepTime = 300;
    pm.events.push({ type: 'footstep', volume: 0.5 });
  }

  categorizePosition(pm) {
    const o = pm.origin;
    const point = [o[0], o[1], o[2] - 2];
    if (pm.velocity[2] > 180) {
      pm.onground = false;
      return;
    }
    this.traceHull(pm, o, point);
    if (tr.fraction === 1 || tr.normal[2] < 0.7) {
      pm.onground = false;
    } else {
      pm.onground = true;
      pm.groundNormal = tr.normal.slice();
      pm.groundBrush = tr.brush;
      if (!tr.startsolid && !tr.allsolid) { o[0] = tr.endpos[0]; o[1] = tr.endpos[1]; o[2] = tr.endpos[2]; }
    }
  }

  finishDuck(pm) {
    pm.viewOfs = VEC_DUCK_VIEW;
    pm.ducking = true;
    pm.inDuck = false;
    if (pm.onground) {
      pm.origin[2] -= DUCK_DIFF;
      this.categorizePosition(pm);
    }
  }

  unDuck(pm) {
    const newOrigin = pm.origin.slice();
    if (pm.onground) newOrigin[2] += DUCK_DIFF;
    const t = this.world.trace(newOrigin, newOrigin, HULL_STAND.mins, HULL_STAND.maxs, MASK_PLAYER, new TraceResult(), this.ignore);
    if (!t.startsolid) {
      pm.ducking = false;
      pm.inDuck = false;
      pm.viewOfs = VEC_VIEW;
      pm.duckTime = 0;
      pm.origin = newOrigin;
      this.categorizePosition(pm);
    }
  }

  jump(pm) {
    if (pm.dead) return;
    if (!pm.onground) { pm.oldbuttons |= IN_JUMP; return; }
    if (pm.oldbuttons & IN_JUMP) return; // no pogo-sticking
    pm.onground = false;
    preventMegaBunnyJumping(pm);
    pm.velocity[2] = Math.sqrt(2 * 800 * 45);
    if (pm.fuser2 > 0) {
      const ratio = (100 - pm.fuser2 * 0.001 * 19) * 0.01;
      pm.velocity[2] *= ratio;
    }
    pm.fuser2 = 1315.789429;
    this.fixupGravityVelocity(pm);
    pm.oldbuttons |= IN_JUMP;
    const v = pm.velocity;
    pm.events.push({ type: 'jump', footstep: Math.hypot(v[0], v[1], v[2]) >= 150 });
  }

  addCorrectGravity(pm) { pm.velocity[2] -= this.vars.gravity * 0.5 * pm.frametime; }
  fixupGravityVelocity(pm) { pm.velocity[2] -= this.vars.gravity * 0.5 * pm.frametime; }

  checkVelocity(pm) {
    const m = this.vars.maxvelocity;
    for (let i = 0; i < 3; i++) {
      if (pm.velocity[i] > m) pm.velocity[i] = m;
      else if (pm.velocity[i] < -m) pm.velocity[i] = -m;
    }
  }

  friction(pm) {
    const v = pm.velocity;
    const speed = Math.hypot(v[0], v[1], v[2]);
    if (speed < 0.1) return;
    let drop = 0;
    if (pm.onground) {
      // edge friction: is there ground 16 units ahead?
      const h = this.hull(pm);
      const sx = pm.origin[0] + v[0] / speed * 16, sy = pm.origin[1] + v[1] / speed * 16;
      const sz = pm.origin[2] + h.mins[2];
      const t = this.world.trace([sx, sy, sz], [sx, sy, sz - 34], [0, 0, 0], [0, 0, 0], MASK_WORLD_PLAYER, this._edgeTr || (this._edgeTr = new TraceResult()));
      let friction = this.vars.friction;
      if (t.fraction === 1) friction *= this.vars.edgefriction;
      const control = speed < this.vars.stopspeed ? this.vars.stopspeed : speed;
      drop += control * friction * pm.frametime;
    }
    let newspeed = speed - drop;
    if (newspeed < 0) newspeed = 0;
    newspeed /= speed;
    v[0] *= newspeed; v[1] *= newspeed; v[2] *= newspeed;
  }

  accelerate(pm, wishdir, wishspeed, accel) {
    const v = pm.velocity;
    const current = v[0] * wishdir[0] + v[1] * wishdir[1] + v[2] * wishdir[2];
    const add = wishspeed - current;
    if (add <= 0) return;
    let accelspeed = accel * pm.frametime * wishspeed;
    if (accelspeed > add) accelspeed = add;
    v[0] += accelspeed * wishdir[0]; v[1] += accelspeed * wishdir[1]; v[2] += accelspeed * wishdir[2];
  }

  airAccelerate(pm, wishdir, wishspeed, accel) {
    if (pm.dead) return;
    const wishspd = Math.min(wishspeed, 30);
    const v = pm.velocity;
    const current = v[0] * wishdir[0] + v[1] * wishdir[1] + v[2] * wishdir[2];
    const add = wishspd - current;
    if (add <= 0) return;
    let accelspeed = accel * wishspeed * pm.frametime;
    if (accelspeed > add) accelspeed = add;
    v[0] += accelspeed * wishdir[0]; v[1] += accelspeed * wishdir[1]; v[2] += accelspeed * wishdir[2];
  }

  wish(pm, fmove, smove) {
    const f = [fwd[0], fwd[1], 0], r = [rgt[0], rgt[1], 0];
    normalize(f); normalize(r);
    const wv = [f[0] * fmove + r[0] * smove, f[1] * fmove + r[1] * smove, 0];
    let wishspeed = Math.hypot(wv[0], wv[1]);
    const wishdir = wishspeed > 0 ? [wv[0] / wishspeed, wv[1] / wishspeed, 0] : [0, 0, 0];
    if (wishspeed > pm.curMaxspeed) wishspeed = pm.curMaxspeed;
    return { wishdir, wishspeed };
  }

  walkMove(pm, fmove, smove) {
    if (pm.fuser2 > 0) {
      const ratio = (100 - pm.fuser2 * 0.001 * 19) * 0.01;
      pm.velocity[0] *= ratio;
      pm.velocity[1] *= ratio;
    }
    const { wishdir, wishspeed } = this.wish(pm, fmove, smove);
    pm.velocity[2] = 0;
    this.accelerate(pm, wishdir, wishspeed, this.vars.accelerate);
    pm.velocity[2] = 0;
    const v = pm.velocity;
    const spd = Math.hypot(v[0], v[1], v[2]);
    if (spd < 1) { v[0] = v[1] = v[2] = 0; return; }

    const o = pm.origin;
    const dest = [o[0] + v[0] * pm.frametime, o[1] + v[1] * pm.frametime, o[2]];
    this.traceHull(pm, o, dest);
    if (tr.fraction === 1) {
      pm.origin = tr.endpos.slice();
      return;
    }
    const original = o.slice(), originalvel = v.slice();
    this.flyMove(pm);
    const down = pm.origin.slice(), downvel = pm.velocity.slice();
    pm.origin = original.slice();
    pm.velocity = originalvel.slice();
    // step up
    const up = [pm.origin[0], pm.origin[1], pm.origin[2] + this.vars.stepsize];
    this.traceHull(pm, pm.origin, up);
    if (!tr.startsolid && !tr.allsolid) pm.origin = tr.endpos.slice();
    this.flyMove(pm);
    const d2 = [pm.origin[0], pm.origin[1], pm.origin[2] - this.vars.stepsize];
    this.traceHull(pm, pm.origin, d2);
    if (tr.normal[2] < 0.7) {
      pm.origin = down; pm.velocity = downvel;
      return;
    }
    if (!tr.startsolid && !tr.allsolid) pm.origin = tr.endpos.slice();
    const upPos = pm.origin.slice();
    const downdist = (down[0] - original[0]) ** 2 + (down[1] - original[1]) ** 2;
    const updist = (upPos[0] - original[0]) ** 2 + (upPos[1] - original[1]) ** 2;
    if (downdist > updist) {
      pm.origin = down; pm.velocity = downvel;
    } else {
      pm.velocity[2] = downvel[2];
      if (upPos[2] - original[2] > 0.5) pm.events.push({ type: 'step', dz: upPos[2] - original[2] });
    }
  }

  airMove(pm, fmove, smove) {
    const { wishdir, wishspeed } = this.wish(pm, fmove, smove);
    this.airAccelerate(pm, wishdir, wishspeed, this.vars.airaccelerate);
    this.flyMove(pm);
  }

  flyMove(pm) {
    const planes = [];
    const v = pm.velocity;
    let original = v.slice();
    const primal = v.slice();
    let allFraction = 0;
    let timeLeft = pm.frametime;
    let blocked = 0;
    for (let bump = 0; bump < 4; bump++) {
      if (!v[0] && !v[1] && !v[2]) break;
      const o = pm.origin;
      const end = [o[0] + timeLeft * v[0], o[1] + timeLeft * v[1], o[2] + timeLeft * v[2]];
      this.traceHull(pm, o, end);
      allFraction += tr.fraction;
      if (tr.allsolid) { v[0] = v[1] = v[2] = 0; return 4; }
      if (tr.fraction > 0) {
        pm.origin = tr.endpos.slice();
        original = v.slice();
        planes.length = 0;
      }
      if (tr.fraction === 1) break;
      if (tr.normal[2] > 0.7) blocked |= 1;
      if (!tr.normal[2]) blocked |= 2;
      timeLeft -= timeLeft * tr.fraction;
      if (planes.length >= MAX_CLIP_PLANES) { v[0] = v[1] = v[2] = 0; break; }
      planes.push(tr.normal.slice());
      if (!pm.onground) {
        // reflect / slide (overbounce 1 since friction == 1)
        let nv = original;
        for (const p of planes) {
          nv = clipVelocity(nv, p, 1);
        }
        v[0] = nv[0]; v[1] = nv[1]; v[2] = nv[2];
        original = nv.slice();
      } else {
        let i;
        for (i = 0; i < planes.length; i++) {
          const cv = clipVelocity(original, planes[i], 1);
          v[0] = cv[0]; v[1] = cv[1]; v[2] = cv[2];
          let j;
          for (j = 0; j < planes.length; j++) {
            if (j !== i && v[0] * planes[j][0] + v[1] * planes[j][1] + v[2] * planes[j][2] < 0) break;
          }
          if (j === planes.length) break;
        }
        if (i === planes.length) {
          if (planes.length !== 2) { v[0] = v[1] = v[2] = 0; break; }
          const dir = cross(planes[0], planes[1]);
          const d = dir[0] * v[0] + dir[1] * v[1] + dir[2] * v[2];
          v[0] = dir[0] * d; v[1] = dir[1] * d; v[2] = dir[2] * d;
        }
        if (v[0] * primal[0] + v[1] * primal[1] + v[2] * primal[2] <= 0) { v[0] = v[1] = v[2] = 0; break; }
      }
    }
    if (allFraction === 0) { v[0] = v[1] = v[2] = 0; }
    return blocked;
  }

  checkFalling(pm) {
    if (pm.onground && !pm.dead && pm.fallVelocity >= PLAYER_FALL_PUNCH_THRESHHOLD) {
      pm.events.push({ type: 'land', fallVelocity: pm.fallVelocity });
      pm.punch[2] = pm.fallVelocity * 0.013;
      if (pm.punch[0] > 8) pm.punch[0] = 8;
    } else if (pm.onground && pm.fallVelocity > 100) {
      pm.events.push({ type: 'softland', fallVelocity: pm.fallVelocity });
    }
    if (pm.onground) pm.fallVelocity = 0;
  }
}

function preventMegaBunnyJumping(pm) {
  const maxscaled = 1.2 * pm.maxspeed;
  if (maxscaled <= 0) return;
  const v = pm.velocity;
  const spd = Math.hypot(v[0], v[1], v[2]);
  if (spd <= maxscaled) return;
  const fraction = (maxscaled / spd) * 0.8;
  v[0] *= fraction; v[1] *= fraction; v[2] *= fraction;
}

export function dropPunchAngle(p, dt) {
  let len = Math.hypot(p[0], p[1], p[2]);
  if (len === 0) return;
  const nx = p[0] / len, ny = p[1] / len, nz = p[2] / len;
  len -= (10 + len * 0.5) * dt;
  if (len < 0) len = 0;
  p[0] = nx * len; p[1] = ny * len; p[2] = nz * len;
}

function clipVelocity(inv, n, overbounce) {
  const backoff = (inv[0] * n[0] + inv[1] * n[1] + inv[2] * n[2]) * overbounce;
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    out[i] = inv[i] - n[i] * backoff;
    if (out[i] > -STOP_EPSILON && out[i] < STOP_EPSILON) out[i] = 0;
  }
  return out;
}

function splineFraction(value, scale) {
  value = scale * value;
  const v2 = value * value;
  return 3 * v2 - 2 * v2 * value;
}

function normalize(a) {
  const l = Math.hypot(a[0], a[1], a[2]);
  if (l) { a[0] /= l; a[1] /= l; a[2] /= l; }
  return l;
}

function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
