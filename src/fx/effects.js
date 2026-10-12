// Modern combat feedback layer: blood and impact particles, decals,
// sprite-chunk gibs, head pops, physics-driven corpses ("billboard
// ragdolls"), hit reactions, explosions, muzzle flashes, casings and
// dynamic lights. The simulation calls these hooks; with gore set to 0 the
// game plays and looks exactly like vanilla.

import { MF, pointToAngle, WP, TAU } from '../game/defs.js';
import { MT, S, stateNext, FRAMEMASK } from '../game/tables.js';
import { SPRNAMES } from '../game/info.js';
import { pointOnLineSide } from '../game/maputl.js';
import { mapState } from '../game/map.js';
import {
  Particles, P_GRAVITY, P_BOUNCE, P_FULLBRIGHT, P_FADE, P_SMOKE, P_BLOOD, P_CASING, P_FLOATY, P_NOCOLLIDE,
} from './particles.js';
import { Decals } from './decals.js';
import { ChunkCache, Gib } from './gibs.js';
import { buildFxImages } from './images.js';

const BLUE_BLOOD = new Set(['HEAD']);
const GREEN_BLOOD = new Set(['BOSS', 'BOS2']);
const NO_BLOOD_FIRE = new Set(['SKUL']);
const METAL_PARTS = new Set(['CYBR', 'SPID', 'BSPI']);
const HAS_HEAD = new Set(['POSS', 'SPOS', 'CPOS', 'SSWV', 'TROO', 'PLAY', 'BOSS', 'BOS2', 'SKEL', 'VILE']);
const METAL_TEX = /METAL|SUPPORT|DOOR|COMP|PIPE|PLAT|STEEL|TEK|BRONZE|SHAWN|LITE|EXIT|SW[12]|STEP|SILVER|GRAY|PANEL|MIDGRAT|MIDBARS|SPCDOOR|BIGDOOR|CRATE|TEKWALL/;
const LIQUID_FLAT = /NUKAGE|FWATER|SWATER|LAVA|BLOOD|SLIME/;

const PARTICLE_CAPS = [900, 2400, 5200];
const GIB_CAPS = [40, 110, 240];
const PART_SCALE = [0.45, 0.75, 1];

function sprName(mo) { return SPRNAMES[mo.sprite] || ''; }

export function createEffects(w, app) {
  return new Effects(w, app);
}

class Effects {
  constructor(w, app) {
    this.w = w;
    this.app = app;
    this.s = w.settings;
    const res = w.res;
    if (!res.fxImages) res.fxImages = buildFxImages(res);
    if (!res.chunkCache) res.chunkCache = new ChunkCache(res);
    this.img = res.fxImages;
    this.chunks = res.chunkCache;
    this.particles = new Particles(PARTICLE_CAPS[this.s.particles ?? 2]);
    this.decals = new Decals(w, this.s.maxDecals ?? 600);
    this.gibs = [];
    this.lights = [];
    this.tracked = new Set();
    this.soundBudget = 0;
    this.decalBudget = 0;
    this.particles.onWall = (i, hit) => this.particleWall(i, hit);
    this.particles.onLand = (i, hit) => this.particleLand(i, hit);
    this.collideResult = { wall: false, nx: 0, ny: 0, floor: 0, ceil: 0, light: 0, line: null, side: 0, sector: null };
  }

  get gore() { return this.s.gore ?? 2; }
  get pscale() { return PART_SCALE[this.s.particles ?? 2] * (this.gore === 1 ? 0.6 : 1); }

  ext(mo) {
    if (!mo.ext) mo.ext = {};
    this.tracked.add(mo);
    return mo.ext;
  }

  // --- Collision helper for particles and gibs ------------------------------

  collide(x0, y0, x1, y1, z) {
    const w = this.w;
    const out = this.collideResult;
    const sec = w.pointInSubsector(x1, y1).sector;
    out.sector = sec;
    out.floor = sec.floorheight;
    out.ceil = sec.ceilingheight;
    out.light = sec.lightlevel;
    out.wall = false;
    out.line = null;
    if (x0 === x1 && y0 === y1) return out;
    const bm = w.level.blockmap;
    const bx0 = Math.floor((x0 - bm.originx) / 128), by0 = Math.floor((y0 - bm.originy) / 128);
    const bx1 = Math.floor((x1 - bm.originx) / 128), by1 = Math.floor((y1 - bm.originy) / 128);
    let best = 2;
    const test = (bx, by) => {
      if (bx < 0 || by < 0 || bx >= bm.width || by >= bm.height) return;
      const list = bm.lists[by * bm.width + bx];
      for (let k = 0; k < list.length; k++) {
        const l = list[k];
        // Segment intersection (x0,y0)-(x1,y1) with the line.
        const rx = x1 - x0, ry = y1 - y0;
        const sx = l.dx, sy = l.dy;
        const den = rx * sy - ry * sx;
        if (den === 0) continue;
        const qx = l.v1.x - x0, qy = l.v1.y - y0;
        const t = (qx * sy - qy * sx) / den;
        const u = (qx * ry - qy * rx) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1 || t >= best) continue;
        let blocks = !l.backsector;
        if (!blocks) {
          const lo = Math.max(l.frontsector.floorheight, l.backsector.floorheight);
          const hi = Math.min(l.frontsector.ceilingheight, l.backsector.ceilingheight);
          blocks = z < lo || z > hi;
        }
        if (!blocks) continue;
        best = t;
        out.line = l;
        out.side = pointOnLineSide(x0, y0, l);
        out.hx = x0 + rx * t;
        out.hy = y0 + ry * t;
      }
    };
    // Every cell the segment's box touches: a diagonal step or a long probe
    // (wall blood) can cross cells that hold neither endpoint.
    for (let by = Math.min(by0, by1); by <= Math.max(by0, by1); by++) {
      for (let bx = Math.min(bx0, bx1); bx <= Math.max(bx0, bx1); bx++) test(bx, by);
    }
    if (out.line) {
      out.wall = true;
      const l = out.line;
      const len = l.length || 1;
      // Normal facing the origin side.
      let nx = l.dy / len, ny = -l.dx / len;
      if (out.side === 1) { nx = -nx; ny = -ny; }
      out.nx = nx;
      out.ny = ny;
      // The mover stays on its own side of the wall, so report that sector's
      // planes (the destination may be another room or a door's low ceiling).
      const ws = (out.side === 0 ? l.frontsector : l.backsector) || w.pointInSubsector(x0, y0).sector;
      out.sector = ws;
      out.floor = ws.floorheight;
      out.ceil = ws.ceilingheight;
      out.light = ws.lightlevel;
    }
    return out;
  }

  particleWall(i, hit) {
    const p = this.particles;
    if ((p.flags[i] & P_BLOOD) && this.decalBudget > 0 && Math.random() < 0.35) {
      this.decalBudget--;
      const blood = p.kind[i] === 1 ? 'green' : p.kind[i] === 2 ? 'blue' : 'red';
      const list = p.size[i] > 1.6 ? this.img.wallSplat[blood] : this.img.small[blood];
      const part = this.partAt(hit.line, hit.side, p.z[i]);
      this.decals.addWall(hit.line, hit.side, hit.hx, hit.hy, p.z[i], list[(Math.random() * list.length) | 0], part, 0.5 + Math.random() * 0.5);
      return true;
    }
    return false;
  }

  particleLand(i, hit) {
    const p = this.particles;
    if (p.flags[i] & P_CASING) {
      if (p.bounces[i] === 0 && this.soundBudget > 0 && Math.abs(p.vz[i]) > 1) {
        this.soundBudget--;
        const name = p.kind[i] === 3 ? 'x_shellcase' : p.kind[i] === 4 ? 'x_impact_metal' : (Math.random() < 0.5 ? 'x_casing' : 'x_casing2');
        this.w.sound({ x: p.x[i], y: p.y[i], z: hit.floor }, name, { channel: `casing${i & 3}`, volume: p.kind[i] === 4 ? 0.35 : 0.5 });
      }
      return false;
    }
    if ((p.flags[i] & P_BLOOD) && this.decalBudget > 0 && Math.random() < 0.1 && !LIQUID_FLAT.test(this.flatName(hit.sector.floorpic))) {
      this.decalBudget--;
      const blood = p.kind[i] === 1 ? 'green' : p.kind[i] === 2 ? 'blue' : 'red';
      const list = this.img.small[blood];
      this.decals.addFlat(p.x[i], p.y[i], list[(Math.random() * list.length) | 0], false, 0.6 + Math.random() * 0.6);
      return true;
    }
    return false;
  }

  partAt(line, side, z) {
    if (!line.backsector) return 'mid';
    const back = side === 0 ? line.backsector : line.frontsector;
    if (!back) return 'mid';
    if (z < back.floorheight) return 'lower';
    if (z > back.ceilingheight) return 'upper';
    return 'mid';
  }

  flatName(pic) { const f = this.w.res.flats[pic]; return f ? f.name : ''; }

  // --- Blood helpers ----------------------------------------------------------

  bloodOf(mo) {
    const n = sprName(mo);
    if (BLUE_BLOOD.has(n)) return 'blue';
    if (GREEN_BLOOD.has(n)) return 'green';
    if (NO_BLOOD_FIRE.has(n)) return 'fire';
    return 'red';
  }

  bloodColorFor(target) { return this.bloodOf(target); }

  bloodKind(blood) { return blood === 'green' ? 1 : blood === 'blue' ? 2 : 0; }

  spray(x, y, z, angle, pitch, count, speed, blood, opts = {}) {
    if (!this.gore) return;
    const p = this.particles;
    const ramp = blood === 'fire' ? this.img.ramps.fire : (this.img.ramps[blood] || this.img.ramps.red);
    const n = Math.max(1, Math.round(count * this.pscale));
    for (let k = 0; k < n; k++) {
      const a = angle + (Math.random() - 0.5) * (opts.cone ?? 0.9);
      const pt = pitch + (Math.random() - 0.4) * (opts.vcone ?? 0.8);
      const sp = speed * (0.35 + Math.random() * 0.9);
      const cp = Math.cos(pt);
      const c = ramp[(Math.random() * 3) | 0];
      const c2 = ramp[3 + ((Math.random() * 2) | 0)];
      const size = (opts.size ?? 1.3) * (0.6 + Math.random() * 0.9);
      if (blood === 'fire') {
        p.spawn(x, y, z, Math.cos(a) * cp * sp, Math.sin(a) * cp * sp, Math.sin(pt) * sp, 10 + Math.random() * 10, c, size, P_GRAVITY | P_FLOATY | P_FULLBRIGHT | P_FADE, { color2: c2 });
      } else {
        p.spawn(x, y, z, Math.cos(a) * cp * sp, Math.sin(a) * cp * sp, Math.sin(pt) * sp + 1, 30 + Math.random() * 30, c, size, P_GRAVITY | P_BLOOD, { color2: c2, kind: this.bloodKind(blood) });
      }
    }
    // Fine mist that hangs briefly.
    if (blood !== 'fire' && this.gore >= 2 && opts.mist !== false) {
      for (let k = 0; k < Math.round(n / 4); k++) {
        p.spawn(x, y, z, (Math.random() - 0.5) * 0.8 + Math.cos(angle) * 0.6, (Math.random() - 0.5) * 0.8 + Math.sin(angle) * 0.6, (Math.random() - 0.3) * 0.6,
          10 + Math.random() * 8, ramp[2], 2 + Math.random() * 2, P_FADE | P_FLOATY | P_GRAVITY, { color2: ramp[4], grow: 0.08 });
      }
    }
  }

  // --- Simulation hooks ---------------------------------------------------------

  playerSpawned() {}

  damage(target, inflictor, source, damage, hit) {
    const w = this.w;
    const e = this.ext(target);
    e.lastHitTic = w.leveltime;
    // Player feedback
    if (source && source.player && !target.player) {
      source.player.hitMarker = 6;
      source.player.hitMarkerKill = target.health <= 0;
    }
    if (target.player) return;
    // Direction the damage travels.
    let ang;
    if (hit && hit.angle !== undefined) ang = hit.angle;
    else if (inflictor) ang = pointToAngle(inflictor.x, inflictor.y, target.x, target.y);
    else ang = target.angle + Math.PI;
    e.hitAngle = ang;
    // Flinch: brief tilt away from the hit, scaled by damage relative to health.
    const rel = Math.min(1, damage / Math.max(20, target.info.spawnhealth * 0.5));
    const side = Math.sin(ang - target.angle) >= 0 ? 1 : -1;
    e.flinch = Math.min(0.32, (e.flinch || 0) + (0.05 + rel * 0.22) * side * (hit && hit.zone === 'head' ? 1.5 : 1));
    e.dmgAcc = (e.dmgAcc || 0) + damage;
    if (!this.gore) return;
    // Blood
    if (target.flags & MF.NOBLOOD) {
      if (hit && hit.x !== undefined) this.sparks(hit.x, hit.y, hit.z, ang + Math.PI, 6);
      if (target.type === MT.BARREL && hit && hit.x !== undefined) this.slime(hit.x, hit.y, hit.z, 6);
      return;
    }
    const blood = this.bloodOf(target);
    const hx = hit && hit.x !== undefined ? hit.x : target.x;
    const hy = hit && hit.y !== undefined ? hit.y : target.y;
    const hz = hit && hit.z !== undefined ? hit.z : target.z + target.height * 0.6;
    const amount = Math.min(22, 3 + damage * 0.45);
    // Exit spray in the shot direction, a little back-spatter toward the shooter.
    this.spray(hx, hy, hz, ang, 0.15, amount, 3 + Math.min(4, damage / 8), blood);
    this.spray(hx, hy, hz, ang + Math.PI, 0.3, amount * 0.3, 2, blood, { mist: false });
    if (METAL_PARTS.has(sprName(target)) && Math.random() < 0.5) this.sparks(hx, hy, hz, ang + Math.PI, 4);
    if (hit && hit.player && w.settings.extraSounds) {
      if (this.soundBudget > 0) {
        this.soundBudget--;
        w.sound({ x: hx, y: hy, z: hz }, Math.random() < 0.5 ? 'x_flesh' : 'x_flesh2', { channel: 'flesh', volume: 0.55 });
      }
    }
    // Blood on the wall behind.
    if (this.gore >= 2 && damage >= 10 && Math.random() < 0.35) this.wallBloodBehind(hx, hy, hz, ang, blood, damage);
  }

  wallBloodBehind(x, y, z, ang, blood, damage) {
    const dist = 64 + Math.min(96, damage * 2);
    const res = this.collide(x, y, x + Math.cos(ang) * dist, y + Math.sin(ang) * dist, z);
    if (res.wall && this.decalBudget > 0) {
      this.decalBudget--;
      const list = this.img.wallSplat[blood] || this.img.wallSplat.red;
      this.decals.addWall(res.line, res.side, res.hx, res.hy, z - 4, list[(Math.random() * list.length) | 0], this.partAt(res.line, res.side, z), 0.7 + Math.min(0.6, damage / 60));
    }
  }

  stagger(target, damage) {
    const e = this.ext(target);
    const w = this.w;
    if (!w.settings.modernAI) return false;
    if ((e.dmgAcc || 0) > target.info.spawnhealth * 0.45 && w.leveltime > (e.staggerCooldown || 0)) {
      e.staggerCooldown = w.leveltime + 50;
      e.dmgAcc = 0;
      return true;
    }
    return false;
  }

  kill(target, source, hit, xdeath) {
    const w = this.w;
    if (target.player) return;
    const e = this.ext(target);
    e.deathTic = w.leveltime;
    e.shootable = true;
    e.flinch = 0;
    if (!this.gore) return;
    const blood = this.bloodOf(target);
    let ang = e.hitAngle ?? (source ? pointToAngle(source.x, source.y, target.x, target.y) : target.angle + Math.PI);
    const overkill = -target.health;
    const sh = target.info.spawnhealth;
    const explosive = hit && (hit.radius || hit.bfg);
    const weapon = hit ? hit.weapon : undefined;
    const close = hit && hit.dist !== undefined && hit.dist < 160;
    if (explosive && hit.spot) ang = pointToAngle(hit.spot.x, hit.spot.y, target.x, target.y);
    // Decide on dismemberment.
    const canGib = this.s.dismemberment !== false;
    const hasX = target.info.xdeathstate !== S.S_NULL;
    let gib = canGib && (xdeath || (overkill > sh * 0.9 && (explosive || hit?.pellet || hit?.saw || hit?.berserk)) || (explosive && overkill > Math.min(60, sh * 0.5) && !hasX && sh < 500));
    if (sprName(target) === 'SKUL') gib = false;
    const headshot = canGib && !gib && hit && hit.zone === 'head' && HAS_HEAD.has(sprName(target))
      && (overkill >= 6 || weapon === WP.SHOTGUN || weapon === WP.SUPERSHOTGUN) && (!hit.pellet || close || overkill > 10);
    if (gib) {
      this.gibMobj(target, ang, explosive ? 9 : 6, blood, !hasX);
    } else if (headshot) {
      this.headPop(target, ang, blood);
    }
    // Launch the body (billboard ragdoll).
    if (this.s.physics !== false && !e.hidden) {
      let force = Math.min(14, 2 + overkill * 0.12);
      let up = 1 + overkill * 0.05;
      if (explosive) { force = Math.min(18, 5 + overkill * 0.1); up = Math.min(11, 3 + overkill * 0.08); }
      if (weapon === WP.SHOTGUN || weapon === WP.SUPERSHOTGUN) { force *= close ? 1.6 : 1.1; up += close ? 2.5 : 0.8; }
      if (hit && hit.melee) { force *= hit.berserk ? 2.2 : 0.6; up *= hit.berserk ? 2 : 0.5; }
      const massK = Math.min(1.6, Math.max(0.15, 100 / target.info.mass));
      force *= (this.s.knockback ?? 1.6) / 1.6 * massK;
      up *= massK;
      target.momx += Math.cos(ang) * force;
      target.momy += Math.sin(ang) * force;
      if (!(target.flags & MF.NOGRAVITY) && up > 1.5) {
        target.momz += up;
        e.airborne = true;
        e.spin = (Math.random() - 0.5) * 0.25 * Math.min(1, force / 8) * (Math.sin(ang - target.angle) >= 0 ? 1 : -1);
      }
    }
    // Pool of blood once settled is handled in tick().
    e.bloodPool = blood;
    if (hit && hit.x !== undefined) this.spray(hit.x, hit.y, hit.z, ang, 0.2, 12, 4, blood);
  }

  // Tear a mobj into chunks of its current sprite art.
  gibMobj(mo, ang, power, blood, hideBody) {
    const w = this.w;
    const e = this.ext(mo);
    const image = this.visibleImage(mo);
    const cap = GIB_CAPS[this.s.particles ?? 2];
    const chunks = image >= 0 ? this.chunks.chunks(image, mo.info.radius > 30 ? 14 : 10) : [];
    const cam = this.app.view ? this.lastCam : null;
    const camAng = cam ? Math.atan2(mo.y - cam.y, mo.x - cam.x) : ang;
    const rx = Math.sin(camAng), ry = -Math.cos(camAng);
    const z0 = mo.z;
    for (const c of chunks) {
      if (this.gibs.length >= cap) this.gibs.shift();
      const ox = c.ox, oz = c.oy;
      const x = mo.x + rx * ox, y = mo.y + ry * ox, z = z0 + oz;
      const out = Math.atan2(ry * ox, rx * ox);
      const sp = power * (0.4 + Math.random() * 0.8);
      const vx = Math.cos(ang) * sp * 0.8 + Math.cos(out) * Math.abs(ox) * 0.12 + (Math.random() - 0.5) * 3;
      const vy = Math.sin(ang) * sp * 0.8 + Math.sin(out) * Math.abs(ox) * 0.12 + (Math.random() - 0.5) * 3;
      const vz = 2 + Math.random() * power * 0.9 + (oz > 28 ? 2 : 0);
      this.gibs.push(new Gib(x, y, z, vx, vy, vz, c.id, blood, { radius: Math.max(c.w, c.h) / 2 }));
    }
    // Extra meat bits
    const meat = this.img.chunks[blood === 'fire' ? 'red' : blood] || this.img.chunks.red;
    const extra = Math.round((6 + power) * this.pscale);
    for (let k = 0; k < extra; k++) {
      if (this.gibs.length >= cap) this.gibs.shift();
      const a = ang + (Math.random() - 0.5) * 2.4;
      const sp = power * (0.3 + Math.random() * 0.9);
      this.gibs.push(new Gib(mo.x, mo.y, z0 + 10 + Math.random() * 30, Math.cos(a) * sp, Math.sin(a) * sp, 3 + Math.random() * 7,
        meat[(Math.random() * meat.length) | 0], blood, { radius: 2, trail: 10 }));
    }
    this.spray(mo.x, mo.y, z0 + 28, ang, 0.6, 30, 6, blood, { cone: 3.5, vcone: 1.2 });
    this.decals.addFlat(mo.x, mo.y, this.img.splat[blood === 'fire' ? 'red' : blood][(Math.random() * 6) | 0], false, 0.9 + Math.random() * 0.3);
    w.sound({ x: mo.x, y: mo.y, z: mo.z }, 'x_splat', { channel: 'gib', volume: 0.9 });
    w.sound({ x: mo.x, y: mo.y, z: mo.z }, 'x_bone', { channel: 'gib2', volume: 0.6 });
    e.gibbed = true;
    if (hideBody) e.hidden = true;
  }

  headPop(mo, ang, blood) {
    const e = this.ext(mo);
    const image = this.visibleImage(mo);
    if (image < 0) return;
    const head = this.chunks.head(image);
    if (!head) return;
    const cam = this.lastCam;
    const camAng = cam ? Math.atan2(mo.y - cam.y, mo.x - cam.x) : ang;
    const rx = Math.sin(camAng), ry = -Math.cos(camAng);
    const x = mo.x + rx * head.ox, y = mo.y + ry * head.ox, z = mo.z + head.oy;
    const sp = 4 + Math.random() * 3;
    this.gibs.push(new Gib(x, y, z, Math.cos(ang) * sp, Math.sin(ang) * sp, 5 + Math.random() * 3, head.id, blood, { isHead: true, trail: 30, radius: 5 }));
    e.clipRel = head.neck;
    e.fountain = 30;
    this.spray(x, y, z, ang, 0.3, 26, 5, blood);
    this.w.sound({ x, y, z }, 'x_splat', { channel: 'gib', volume: 0.7 });
  }

  // The sprite image the player currently sees for a mobj.
  visibleImage(mo) {
    const frames = this.w.res.sprites[mo.sprite];
    if (!frames) return -1;
    const fr = frames[mo.frame & FRAMEMASK];
    if (!fr) return -1;
    let rot = 0;
    const cam = this.lastCam;
    if (fr.rotate && cam) {
      const ang = Math.atan2(mo.y - cam.y, mo.x - cam.x);
      rot = Math.floor((((ang - mo.angle + (Math.PI / 8) * 9) % TAU) + TAU) % TAU / (Math.PI / 4)) & 7;
    }
    return fr.images[rot];
  }

  blocked(mo) {
    if (!(mo.flags & MF.CORPSE) || this.s.physics === false) return false;
    const line = mapState.blockline;
    const speed = Math.hypot(mo.momx, mo.momy);
    if (!line) { mo.momx *= -0.3; mo.momy *= -0.3; return true; }
    const len = line.length || 1;
    let nx = line.dy / len, ny = -line.dx / len;
    if (pointOnLineSide(mo.x, mo.y, line) === 1) { nx = -nx; ny = -ny; }
    const d = mo.momx * nx + mo.momy * ny;
    mo.momx = (mo.momx - 2 * d * nx) * 0.35;
    mo.momy = (mo.momy - 2 * d * ny) * 0.35;
    const e = this.ext(mo);
    if (speed > 5 && this.gore >= 2) {
      const blood = this.bloodOf(mo);
      if (blood !== 'fire') {
        const list = this.img.wallSplat[blood];
        const side = pointOnLineSide(mo.x, mo.y, line);
        // Point on the wall nearest the body.
        const t = Math.max(0, Math.min(len, ((mo.x - line.v1.x) * line.dx + (mo.y - line.v1.y) * line.dy) / len));
        const px = line.v1.x + line.dx / len * t, py = line.v1.y + line.dy / len * t;
        this.decals.addWall(line, side, px, py, mo.z + 20, list[(Math.random() * list.length) | 0], 'mid', 1);
        this.spray(px, py, mo.z + 20, Math.atan2(ny, nx), 0.2, 8, 2, blood);
      }
      this.w.sound(mo, 'x_body_fall', { channel: 'body', volume: Math.min(1, speed / 12) });
      e.spin = -(e.spin || 0) * 0.7;
    }
    return true;
  }

  playerLand(mo, momz) {
    const p = mo.player;
    if (!p) return;
    if (momz < -6) {
      p.landDip = Math.min(10, -momz * 0.8);
      if (momz > -8) this.w.sound(mo, 'x_land', { channel: 'body', volume: 0.5 });
    }
  }

  playerHurt(player, damage, inflictor, source) {
    const src = source || inflictor;
    if (src && player.mo) {
      player.damageDirs.push({ angle: pointToAngle(player.mo.x, player.mo.y, src.x, src.y), t: 35 });
      if (player.damageDirs.length > 6) player.damageDirs.shift();
    }
    player.mods.shake = Math.min(8, player.mods.shake + damage * 0.06);
    player.mods.kick += Math.min(10, damage * 0.25);
  }

  pickup() {}

  missileHitWall(mo, line) { this.ext(mo).hitLine = line; }
  missileHitPlane(mo, ceiling) { this.ext(mo).hitPlane = ceiling ? 'ceiling' : 'floor'; }
  missileHitThing(missile, thing) { this.ext(missile).hitThing = thing; }

  missileExplode(mo) {
    const t = mo.type;
    const e = mo.ext || {};
    const x = mo.x, y = mo.y, z = mo.z;
    const R = this.img.ramps;
    if (t === MT.ROCKET) {
      this.explosion(x, y, z, 1, e);
    } else if (t === MT.PLASMA) {
      this.light(x, y, z, 140, 7, 8);
      this.burst(x, y, z, 10, R.plasma, 3, true);
      if (e.hitLine) this.scorchWall(mo, e.hitLine, this.img.plasmaBurn, 0.8);
      else if (e.hitPlane === 'floor') this.decals.addFlat(x, y, this.img.plasmaBurn[0], false, 0.8);
    } else if (t === MT.BFG) {
      this.light(x, y, z, 520, 22, 30);
      this.burst(x, y, z, 70, R.bfg, 6, true);
      this.shakeNear(x, y, 9, 700);
      if (e.hitLine) this.scorchWall(mo, e.hitLine, this.img.scorch, 1.6);
      else if (e.hitPlane === 'floor') this.decals.addFlat(x, y, this.img.scorch[2], false, 1.6);
    } else if (t === MT.TROOPSHOT || t === MT.HEADSHOT) {
      this.light(x, y, z, 120, 6, 10);
      this.burst(x, y, z, 12, t === MT.HEADSHOT ? R.plasma : R.fire, 3, true);
    } else if (t === MT.BRUISERSHOT) {
      this.light(x, y, z, 130, 7, 10);
      this.burst(x, y, z, 14, R.bfg, 3, true);
    } else if (t === MT.ARACHPLAZ) {
      this.light(x, y, z, 110, 5, 8);
      this.burst(x, y, z, 8, R.bfg, 3, true);
    } else if (t === MT.FATSHOT || t === MT.TRACER) {
      this.explosion(x, y, z, 0.6, e);
    }
  }

  barrelOrRocketBlast(mo) {
    if (mo.type === MT.BARREL) {
      this.explosion(mo.x, mo.y, mo.z + 20, 1.15, {});
      this.slime(mo.x, mo.y, mo.z + 24, 30);
    }
  }

  explosion(x, y, z, size, e) {
    const R = this.img.ramps;
    this.light(x, y, z, 300 * size, 16 * size, 16);
    this.burst(x, y, z, 30 * size, R.spark, 6 * size, true);
    this.burst(x, y, z, 18 * size, R.fire, 3 * size, true, true);
    // Smoke
    const p = this.particles;
    const ns = Math.round(10 * size * this.pscale);
    for (let k = 0; k < ns; k++) {
      p.spawn(x + (Math.random() - 0.5) * 24, y + (Math.random() - 0.5) * 24, z + (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, Math.random() * 1.5, 40 + Math.random() * 30,
        R.smoke[(Math.random() * 2) | 0], 6 + Math.random() * 6, P_SMOKE | P_FADE, { color2: R.smoke[4], grow: 0.35 });
    }
    // Debris from the floor
    const sec = this.w.pointInSubsector(x, y).sector;
    if (z - sec.floorheight < 48) this.debris(x, y, sec.floorheight + 1, this.flatColor(sec.floorpic, x, y), Math.round(14 * size), 6);
    if (e.hitLine) this.scorchWall({ x, y, z }, e.hitLine, this.img.scorch, size);
    else if (z - sec.floorheight < 40) this.decals.addFlat(x, y, this.img.scorch[(Math.random() * 3) | 0], false, size);
    else if (e.hitPlane === 'ceiling') this.decals.addFlat(x, y, this.img.scorch[0], true, size);
    this.shakeNear(x, y, 6 * size, 520);
    // Blast nearby gibs
    for (const g of this.gibs) {
      const d = Math.hypot(g.x - x, g.y - y);
      if (d < 200 * size) {
        const f = (1 - d / (200 * size)) * 10 * size;
        const a = Math.atan2(g.y - y, g.x - x);
        g.vx += Math.cos(a) * f; g.vy += Math.sin(a) * f; g.vz += f * 0.7;
        g.resting = false;
      }
    }
  }

  scorchWall(mo, line, list, size) {
    const side = pointOnLineSide(mo.x, mo.y, line);
    const len = line.length || 1;
    const t = Math.max(0, Math.min(len, ((mo.x - line.v1.x) * line.dx + (mo.y - line.v1.y) * line.dy) / len));
    const px = line.v1.x + line.dx / len * t, py = line.v1.y + line.dy / len * t;
    this.decals.addWall(line, side, px, py, mo.z, list[(Math.random() * list.length) | 0], this.partAt(line, side, mo.z), size);
  }

  shakeNear(x, y, amount, radius) {
    const p = this.w.player;
    if (!p || !p.mo) return;
    const d = Math.hypot(p.mo.x - x, p.mo.y - y);
    if (d < radius) p.mods.shake = Math.min(9, p.mods.shake + amount * (1 - d / radius));
  }

  burst(x, y, z, count, ramp, speed, bright, floaty = false) {
    const p = this.particles;
    const n = Math.round(count * this.pscale);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU;
      const pt = (Math.random() - 0.3) * Math.PI * 0.8;
      const sp = speed * (0.3 + Math.random());
      p.spawn(x, y, z, Math.cos(a) * Math.cos(pt) * sp, Math.sin(a) * Math.cos(pt) * sp, Math.sin(pt) * sp,
        8 + Math.random() * 16, ramp[(Math.random() * 2) | 0], 1 + Math.random() * 1.5,
        P_GRAVITY | P_BOUNCE | P_FADE | (bright ? P_FULLBRIGHT : 0) | (floaty ? P_FLOATY : 0), { color2: ramp[Math.min(ramp.length - 1, 3 + ((Math.random() * 2) | 0))] });
    }
  }

  sparks(x, y, z, ang, count) {
    const p = this.particles;
    const R = this.img.ramps.spark;
    const n = Math.max(1, Math.round(count * this.pscale));
    for (let k = 0; k < n; k++) {
      const a = ang + (Math.random() - 0.5) * 1.8;
      const sp = 2 + Math.random() * 4;
      p.spawn(x, y, z, Math.cos(a) * sp, Math.sin(a) * sp, (Math.random() - 0.2) * 4, 6 + Math.random() * 10, R[(Math.random() * 2) | 0], 0.8 + Math.random() * 0.6,
        P_GRAVITY | P_BOUNCE | P_FULLBRIGHT | P_FADE, { color2: R[4] });
    }
  }

  slime(x, y, z, count) {
    const R = this.img.ramps.green;
    const p = this.particles;
    const n = Math.round(count * this.pscale);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, sp = 1 + Math.random() * 5;
      p.spawn(x, y, z, Math.cos(a) * sp, Math.sin(a) * sp, 2 + Math.random() * 5, 30 + Math.random() * 30, R[(Math.random() * 2) | 0], 1.2 + Math.random(),
        P_GRAVITY | P_BLOOD, { color2: R[3], kind: 1 });
    }
  }

  debris(x, y, z, color, count, speed, normal = null) {
    const p = this.particles;
    const n = Math.round(count * this.pscale);
    const R = this.img.ramps.dust;
    for (let k = 0; k < n; k++) {
      let a = Math.random() * TAU;
      if (normal) a = Math.atan2(normal[1], normal[0]) + (Math.random() - 0.5) * 2.2;
      const sp = speed * (0.2 + Math.random() * 0.8);
      p.spawn(x, y, z, Math.cos(a) * sp, Math.sin(a) * sp, 1 + Math.random() * speed * 0.8, 25 + Math.random() * 30,
        color >= 0 ? color : R[(Math.random() * 3) | 0], 0.8 + Math.random() * 0.9, P_GRAVITY | P_BOUNCE, { color2: color >= 0 ? color : R[3] });
    }
  }

  dust(x, y, z, color, count, normal) {
    const p = this.particles;
    const n = Math.max(1, Math.round(count * this.pscale));
    for (let k = 0; k < n; k++) {
      const nx = normal ? normal[0] : 0, ny = normal ? normal[1] : 0, nz = normal ? normal[2] || 0 : 0.5;
      p.spawn(x, y, z, nx * (0.4 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.5, ny * (0.4 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.5,
        nz * 0.6 + Math.random() * 0.4, 18 + Math.random() * 14, color, 2 + Math.random() * 2, P_SMOKE | P_FADE, { grow: 0.12 });
    }
  }

  light(x, y, z, radius, power, life) {
    if (this.s.dynamicLights === false) return;
    this.lights.push({ x, y, z, radius, power, life, max: life });
  }

  flatColor(pic, x, y) {
    const f = this.w.res.flats[pic];
    if (!f) return -1;
    return this.w.res.sampleImage(f.id, x, -y);
  }

  wallColor(line, side, part, x, y, z) {
    const sd = side === 0 ? line.front : line.back;
    if (!sd) return { color: -1, name: '' };
    const num = part === 'upper' ? sd.toptexture : part === 'lower' ? sd.bottomtexture : sd.midtexture;
    const tex = this.w.res.textures[num];
    if (!tex) return { color: -1, name: '' };
    const len = line.length || 1;
    const along = side === 0
      ? Math.hypot(x - line.v1.x, y - line.v1.y)
      : Math.hypot(x - line.v2.x, y - line.v2.y);
    const sec = sd.sector;
    const u = along + sd.textureoffset;
    const v = (sec.ceilingheight - z) + sd.rowoffset;
    let c = this.w.res.sampleImage(tex.id, u, v);
    if (c < 0) c = -1;
    return { color: c, name: tex.name, len };
  }

  // --- Player weapon feedback -----------------------------------------------

  muzzlePos(player, fwd = 20, right = 5, down = 7) {
    const mo = player.mo;
    const yaw = mo.angle, pitch = player.aimPitch();
    const cp = Math.cos(pitch);
    const fx = Math.cos(yaw) * cp, fy = Math.sin(yaw) * cp, fz = Math.sin(pitch);
    const rx = Math.sin(yaw), ry = -Math.cos(yaw);
    const ads = player.mods.ads;
    right *= 1 - ads;
    down *= 1 - 0.6 * ads;
    const z = mo.z + player.viewheight;
    return [mo.x + fx * fwd + rx * right, mo.y + fy * fwd + ry * right, z + fz * fwd - down];
  }

  muzzleFlash(player, power) {
    const [x, y, z] = this.muzzlePos(player, 28, 0, 0);
    this.light(x, y, z, 180 + power * 10, power, 3);
  }

  monsterFire(actor) {
    this.light(actor.x, actor.y, actor.z + 40, 200, 8, 3);
  }

  muzzleSmoke(player, amount = 1) {
    const R = this.img.ramps.smoke;
    const [x, y, z] = this.muzzlePos(player, 30, 3, 5);
    const n = Math.round(2 * amount * this.pscale + 0.5);
    const a = player.mo.angle;
    for (let k = 0; k < n; k++) {
      // Drifts forward and up, out of the line of sight.
      this.particles.spawn(x, y, z, Math.cos(a) * (1.2 + Math.random()) + (Math.random() - 0.5) * 0.4, Math.sin(a) * (1.2 + Math.random()) + (Math.random() - 0.5) * 0.4, 0.4,
        14 + Math.random() * 10, R[1], 1.2 + Math.random(), P_SMOKE | P_NOCOLLIDE, { color2: R[3], grow: 0.1 });
    }
  }

  ejectCasing(player, kind = 'brass') {
    if (this.s.shellCasings === false || !kind) return;
    const R = this.img.ramps;
    const mo = player.mo;
    const [x, y, z] = this.muzzlePos(player, 12, 8, 9);
    const rx = Math.sin(mo.angle), ry = -Math.cos(mo.angle);
    const sp = 2.2 + Math.random() * 1.2;
    const shell = kind === 'shell' || kind === 'shell2';
    const life = 35 * (this.s.corpseLifetime ? 10 : 20);
    const count = kind === 'shell2' ? 2 : 1;
    for (let k = 0; k < count; k++) {
      this.particles.spawn(x, y, z, rx * sp + mo.momx * 0.8 + Math.cos(mo.angle) * 0.4, ry * sp + mo.momy * 0.8 + Math.sin(mo.angle) * 0.4, 2.5 + Math.random() * 1.5,
        life, shell ? R.shell[0] : R.brass[0], shell ? 1.6 : 1.0, P_GRAVITY | P_BOUNCE | P_CASING, { color2: shell ? R.shell[1] : R.brass[1], kind: shell ? 3 : 0 });
    }
  }

  dropMagazine(player) {
    if (this.s.shellCasings === false) return;
    const R = this.img.ramps;
    const [x, y, z] = this.muzzlePos(player, 8, 2, 16);
    const mo = player.mo;
    this.particles.spawn(x, y, z, mo.momx * 0.8, mo.momy * 0.8, -0.5, 35 * 15, R.mag[0], 2.2, P_GRAVITY | P_BOUNCE | P_CASING, { color2: R.mag[1], kind: 4 });
  }

  bulletImpact(player, res, weapon, opts = {}) {
    if (!res || res.kind === 'none' || res.kind === 'sky' || res.kind === 'thing') return;
    const R = this.img.ramps;
    const w = this.w;
    const pellet = !!opts.pellet;
    if (res.kind === 'wall') {
      const l = res.line;
      const len = l.length || 1;
      let nx = l.dy / len, ny = -l.dx / len;
      if (res.side === 1) { nx = -nx; ny = -ny; }
      const wc = this.wallColor(l, res.side, res.part, res.x, res.y, res.z);
      const metal = METAL_TEX.test(wc.name);
      const col = wc.color >= 0 ? wc.color : R.dust[1];
      this.dust(res.x, res.y, res.z, R.dust[(Math.random() * 2) | 0], pellet ? 1 : 2, [nx, ny, 0.3]);
      this.debris(res.x, res.y, res.z, col, pellet ? 2 : 4, 3, [nx, ny]);
      if (metal) this.sparks(res.x, res.y, res.z, Math.atan2(ny, nx), pellet ? 2 : 5);
      if (this.decalBudget > 0 && (!pellet || Math.random() < 0.6)) {
        this.decalBudget--;
        this.decals.addWall(l, res.side, res.x, res.y, res.z, this.img.holes[(Math.random() * 4) | 0], res.part, 1);
      }
      if (this.soundBudget > 0 && Math.random() < (pellet ? 0.25 : 0.6)) {
        this.soundBudget--;
        const name = metal ? (Math.random() < 0.3 ? 'x_ricochet' : 'x_impact_metal') : 'x_impact_stone';
        w.sound({ x: res.x, y: res.y, z: res.z }, name, { channel: `imp${(Math.random() * 3) | 0}`, volume: 0.45 });
      }
    } else if (res.kind === 'floor' || res.kind === 'ceiling') {
      const sec = res.sector;
      const pic = res.kind === 'floor' ? sec.floorpic : sec.ceilingpic;
      const name = this.flatName(pic);
      const col = this.flatColor(pic, res.x, res.y);
      const up = res.kind === 'floor' ? 1 : -1;
      if (LIQUID_FLAT.test(name) && res.kind === 'floor') {
        for (let k = 0; k < (pellet ? 2 : 5); k++) {
          this.particles.spawn(res.x, res.y, res.z + 1, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, 2 + Math.random() * 3,
            20, col >= 0 ? col : R.dust[0], 1.2, P_GRAVITY);
        }
        return;
      }
      this.dust(res.x, res.y, res.z + up, R.dust[0], pellet ? 1 : 2, [0, 0, up]);
      this.debris(res.x, res.y, res.z + up * 2, col, pellet ? 2 : 4, 2.5);
      if (this.decalBudget > 0 && (!pellet || Math.random() < 0.5)) {
        this.decalBudget--;
        this.decals.addFlat(res.x, res.y, this.img.holes[(Math.random() * 4) | 0], res.kind === 'ceiling', 1);
      }
    }
  }

  meleeImpact(player, res, saw = false) {
    if (!res) return;
    if (res.kind === 'thing') {
      player.mods.shake = Math.min(6, player.mods.shake + (saw ? 0.6 : 1.8));
      return;
    }
    if (res.kind === 'wall' && saw) this.sparks(res.x, res.y, res.z, player.mo.angle + Math.PI, 4);
  }

  shootCorpse(corpse, angle, damage) {
    if (!this.gore || corpse.removed) return;
    const e = this.ext(corpse);
    if (e.hidden) return;
    const blood = this.bloodOf(corpse);
    if (this.s.physics !== false) {
      const k = Math.min(1.5, 100 / corpse.info.mass) * 0.35;
      corpse.momx += Math.cos(angle) * damage * k * 0.3;
      corpse.momy += Math.sin(angle) * damage * k * 0.3;
    }
    this.spray(corpse.x, corpse.y, corpse.z + 6, angle, 0.5, 4 + damage * 0.3, 2.5, blood);
    e.corpseDamage = (e.corpseDamage || 0) + damage;
    if (e.corpseDamage > corpse.info.spawnhealth * 0.8 + 40 && this.s.dismemberment !== false && !e.gibbed) {
      this.gibMobj(corpse, angle, 5, blood, true);
    }
  }

  blastCorpse(thing, spot, damage) {
    if (!(thing.flags & MF.CORPSE) || thing.player || this.s.physics === false) return;
    const e = this.ext(thing);
    if (e.hidden) return;
    const d = Math.max(Math.abs(thing.x - spot.x), Math.abs(thing.y - spot.y));
    if (d >= damage) return;
    const f = (damage - d) / damage;
    const a = pointToAngle(spot.x, spot.y, thing.x, thing.y);
    const massK = Math.min(1.6, Math.max(0.2, 100 / thing.info.mass));
    thing.momx += Math.cos(a) * f * 10 * massK;
    thing.momy += Math.sin(a) * f * 10 * massK;
    thing.momz += f * 7 * massK;
    e.airborne = true;
    e.spin = (Math.random() - 0.5) * 0.3;
    e.corpseDamage = (e.corpseDamage || 0) + damage * f;
    if (this.gore && e.corpseDamage > thing.info.spawnhealth * 0.8 + 40 && !e.gibbed && this.s.dismemberment !== false) {
      this.gibMobj(thing, a, 8, this.bloodOf(thing), true);
    }
  }

  crushCorpse(thing) {
    if (!this.gore) return;
    const blood = this.bloodOf(thing);
    if (blood === 'fire') return;
    this.spray(thing.x, thing.y, thing.z + 8, 0, 1, 20, 4, blood, { cone: TAU });
    this.decals.addFlat(thing.x, thing.y, this.img.splat[blood][(Math.random() * 6) | 0], false, 1.2);
    this.w.sound(thing, 'x_splat', { channel: 'gib' });
  }

  crushBleed(thing) {
    if (!this.gore) return;
    const blood = this.bloodOf(thing);
    this.spray(thing.x, thing.y, thing.z + thing.height / 2, Math.random() * TAU, 0.5, 6, 3, blood === 'fire' ? 'red' : blood);
  }

  resurrect(corpse) {
    if (corpse.ext) {
      const e = corpse.ext;
      e.roll = 0; e.spin = 0; e.airborne = false; e.clipRel = undefined; e.fountain = 0; e.landed = false;
      e.corpseDamage = 0; e.shootable = false; e.fade = undefined;
    }
  }

  teleported() {}

  // --- Per tic ----------------------------------------------------------------

  tick() {
    const w = this.w;
    this.soundBudget = 3;
    this.decalBudget = 6;
    this.decals.setMax(this.s.maxDecals ?? 600);
    const cap = PARTICLE_CAPS[this.s.particles ?? 2];
    if (cap !== this.particles.cap) this.particles.resize(cap);
    this.particles.tick(w, (x0, y0, x1, y1, z) => this.collide(x0, y0, x1, y1, z));
    this.tickGibs();
    for (const L of this.lights) L.life--;
    this.lights = this.lights.filter((L) => L.life > 0);
    const lifetime = (this.s.corpseLifetime || 0) * 35;
    for (const mo of this.tracked) {
      if (mo.removed) { this.tracked.delete(mo); continue; }
      const e = mo.ext;
      // Flinch recovery
      if (e.flinch) {
        e.flinch *= 0.72;
        if (Math.abs(e.flinch) < 0.004) e.flinch = 0;
      }
      if (e.dmgAcc) e.dmgAcc *= 0.92;
      if (mo.flags & MF.CORPSE) this.tickCorpse(mo, e, lifetime);
      e.roll = (e.physRoll || 0) + (e.flinch || 0);
      if (e.clipRel !== undefined) e.clipZ = mo.z + e.clipRel;
    }
  }

  tickCorpse(mo, e, lifetime) {
    const w = this.w;
    const onGround = mo.z <= mo.floorz + 0.5;
    if (e.airborne) {
      e.physRoll = (e.physRoll || 0) + (e.spin || 0);
      if (onGround && mo.momz <= 0 && w.leveltime - (e.deathTic || 0) > 2) {
        e.airborne = false;
        e.spin = 0;
        const speed = Math.hypot(mo.momx, mo.momy);
        w.sound(mo, 'x_body_fall', { channel: 'body', volume: Math.min(1, 0.4 + speed / 10) });
        if (this.gore && !e.hidden) {
          const blood = this.bloodOf(mo);
          if (blood !== 'fire') this.spray(mo.x, mo.y, mo.z + 4, Math.atan2(mo.momy, mo.momx), 0.4, 6, 2, blood);
        }
      }
    }
    if (!e.airborne && e.physRoll) {
      // Settle upright onto the original death frames.
      e.physRoll *= 0.6;
      if (Math.abs(e.physRoll) < 0.01) e.physRoll = 0;
    }
    // Neck fountain after a head pop.
    if (e.fountain > 0 && this.gore) {
      e.fountain--;
      const blood = this.bloodOf(mo);
      const neckZ = mo.z + Math.max(8, (e.clipRel || 40) * (mo.tics === -1 ? 0.2 : 0.9));
      this.spray(mo.x, mo.y, neckZ, Math.random() * TAU, 1.1, 1.5, 2.5, blood, { cone: 1.5, vcone: 0.5, mist: false });
    }
    // Blood pool once the body rests.
    if (!e.pooled && mo.tics === -1 && onGround && Math.hypot(mo.momx, mo.momy) < 0.5 && this.gore && !e.hidden) {
      e.pooled = true;
      const blood = e.bloodPool || this.bloodOf(mo);
      if (blood !== 'fire' && this.decals) {
        this.decals.addFlat(mo.x, mo.y, this.img.splat[blood][(Math.random() * 6) | 0], false, 0.8 + mo.info.radius / 40);
      }
    }
    // Corpse lifetime
    if (lifetime && e.deathTic !== undefined && w.leveltime - e.deathTic > lifetime && !mo.player) {
      e.fade = (e.fade ?? 1) - 0.03;
      if (e.fade <= 0) w.removeMobj(mo);
    }
  }

  tickGibs() {
    const w = this.w;
    const lifetime = (this.s.corpseLifetime || 0) * 35 || 35 * 120;
    const keep = [];
    for (const g of this.gibs) {
      g.px = g.x; g.py = g.y; g.pz = g.z; g.proll = g.roll;
      g.age++;
      if (g.age > lifetime) continue;
      if (!g.resting) {
        g.vz -= 1;
        const nx = g.x + g.vx, ny = g.y + g.vy;
        let nz = g.z + g.vz;
        const res = this.collide(g.x, g.y, nx, ny, nz);
        g.light = res.light;
        if (res.wall) {
          const d = g.vx * res.nx + g.vy * res.ny;
          g.vx = (g.vx - 2 * d * res.nx) * 0.4;
          g.vy = (g.vy - 2 * d * res.ny) * 0.4;
          g.spin *= -0.8;
          if (this.gore >= 2 && Math.abs(d) > 3 && this.decalBudget > 0 && g.blood !== 'fire') {
            this.decalBudget--;
            this.decals.addWall(res.line, res.side, res.hx, res.hy, g.z, this.img.small[g.blood][(Math.random() * 4) | 0], this.partAt(res.line, res.side, g.z), 1);
          }
        } else {
          g.x = nx; g.y = ny;
        }
        const floor = res.floor + g.radius * 0.5;
        if (nz <= floor) {
          nz = floor;
          if (g.vz < -2.5) {
            g.vz = -g.vz * 0.35;
            g.vx *= 0.6; g.vy *= 0.6;
            g.spin *= 0.6;
            g.bounces++;
            if (g.bounces <= 2 && this.gore && g.blood !== 'fire' && this.decalBudget > 0 && Math.random() < 0.6) {
              this.decalBudget--;
              this.decals.addFlat(g.x, g.y, this.img.small[g.blood][(Math.random() * 4) | 0], false, 0.8 + Math.random() * 0.6);
            }
            if (g.bounces === 1 && this.soundBudget > 0 && g.sound) {
              this.soundBudget--;
              w.sound({ x: g.x, y: g.y, z: nz }, g.isHead ? 'x_body_fall' : 'x_gibpart', { channel: `gib${(Math.random() * 4) | 0}`, volume: g.isHead ? 0.6 : 0.4 });
            }
          } else {
            g.vz = 0;
            g.vx *= 0.7; g.vy *= 0.7;
            if (Math.hypot(g.vx, g.vy) < 0.15) { g.resting = true; g.vx = g.vy = 0; }
          }
        } else if (nz >= res.ceil - 2) {
          nz = res.ceil - 2;
          if (g.vz > 0) g.vz = -g.vz * 0.3;
        }
        g.z = nz;
        g.roll += g.spin;
        if (g.resting) g.spin = 0;
        // Blood trail
        if (g.trail > 0 && this.gore >= 2 && g.blood !== 'fire' && (g.age & 1)) {
          g.trail--;
          const R = this.img.ramps[g.blood];
          this.particles.spawn(g.x, g.y, g.z, g.vx * 0.2, g.vy * 0.2, 0, 25, R[1], 1, P_GRAVITY | P_BLOOD, { color2: R[3], kind: this.bloodKind(g.blood) });
        }
      } else {
        // Resting gibs ride lifts/doors.
        const sec = w.pointInSubsector(g.x, g.y).sector;
        g.z = sec.floorheight + g.radius * 0.5;
        g.light = sec.lightlevel;
      }
      keep.push(g);
    }
    this.gibs = keep;
  }

  // --- Rendering ------------------------------------------------------------

  addLights(r, frac, cam) {
    this.lastCam = cam;
    if (this.s.dynamicLights === false) return;
    for (const L of this.lights) {
      const k = L.life / L.max;
      r.addLight(L.x, L.y, L.z, L.radius, L.power * (0.4 + 0.6 * k));
    }
    // Glowing projectiles
    for (const mo of this.w.mobjs) {
      if (!(mo.flags & MF.MISSILE)) continue;
      const t = mo.type;
      let rad = 0, pow = 0;
      if (t === MT.ROCKET) { rad = 150; pow = 6; } else if (t === MT.PLASMA) { rad = 110; pow = 5; } else if (t === MT.BFG) { rad = 300; pow = 12; } else if (t === MT.TROOPSHOT || t === MT.HEADSHOT || t === MT.BRUISERSHOT || t === MT.FATSHOT || t === MT.ARACHPLAZ || t === MT.TRACER) { rad = 110; pow = 5; }
      if (!rad) continue;
      const x = mo.px + (mo.x - mo.px) * frac, y = mo.py + (mo.y - mo.py) * frac, z = mo.pz + (mo.z - mo.pz) * frac;
      const d = Math.hypot(x - cam.x, y - cam.y);
      if (d > 1400) continue;
      r.addLight(x, y, z + 8, rad, pow);
    }
  }

  render(r, cam, frac) {
    this.lastCam = cam;
    this.particles.render(r, frac, (x, y) => this.w.pointInSubsector(x, y).sector.lightlevel);
    for (const g of this.gibs) {
      const x = g.px + (g.x - g.px) * frac, y = g.py + (g.y - g.py) * frac, z = g.pz + (g.z - g.pz) * frac;
      const roll = g.proll + (g.roll - g.proll) * frac;
      r.addSprite({ image: g.image, x, y, z, flip: g.flip, light: g.light, flags: 0, roll, cz: z, scale: g.scale });
    }
  }

  renderDecals(r, geo) {
    this.decals.render(r, geo);
  }

  // Keeps a launched body on its early death frames while airborne so it
  // flies as a body instead of finishing its collapse in mid-air.
  holdFrame(mo) {
    const e = mo.ext;
    if (!e || !e.airborne || e.hidden) return false;
    if (this.w.leveltime - (e.deathTic || 0) > 70) return false;
    return mo.tics <= 1 && stateNext[mo.state] !== mo.state && (e.heldFrames = (e.heldFrames || 0) + 1) < 60
      && this.w.leveltime - (e.deathTic || 0) > 6;
  }
}

