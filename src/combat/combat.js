// Combat: hitscan bullets with penetration, surface impacts, friendly fire,
// shoves, melee sweeps, projectiles (molotov, pipe bomb, bile jar, grenades),
// explosions and fire areas. Emits noise so infected can hear gunfire.
import * as THREE from 'three';
import { F_SHOOT, F_SOLID } from '../world/collision.js';
import { coneSpread, rayCapsule, clamp, randRange, pick } from '../core/math.js';
import { DF } from '../render/decals.js';

const _dir = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _v = new THREE.Vector3();

const SURF_FX = {
  concrete: { dust: [0.45, 0.43, 0.4], chips: [0.3, 0.29, 0.27], decal: DF.HOLE_CONCRETE, sparks: 0, snd: 'impactConcrete' },
  plaster: { dust: [0.7, 0.68, 0.62], chips: [0.8, 0.78, 0.72], decal: DF.HOLE_CONCRETE, sparks: 0, snd: 'impactConcrete' },
  brick: { dust: [0.5, 0.3, 0.22], chips: [0.45, 0.22, 0.15], decal: DF.HOLE_CONCRETE, sparks: 0, snd: 'impactConcrete' },
  tile: { dust: [0.7, 0.7, 0.68], chips: [0.85, 0.85, 0.82], decal: DF.HOLE_CONCRETE, sparks: 0, snd: 'impactTile' },
  wood: { dust: [0.45, 0.35, 0.22], chips: [0.5, 0.36, 0.2], decal: DF.HOLE_WOOD, sparks: 0, snd: 'impactWood' },
  carpet: { dust: [0.3, 0.25, 0.22], chips: [0.3, 0.22, 0.2], decal: DF.HOLE_WOOD, sparks: 0, snd: 'impactSoft' },
  metal: { dust: [0.3, 0.3, 0.3], chips: [0.5, 0.5, 0.5], decal: DF.HOLE_METAL, sparks: 8, snd: 'impactMetal' },
  dirt: { dust: [0.3, 0.25, 0.18], chips: [0.25, 0.2, 0.14], decal: DF.HOLE_CONCRETE, sparks: 0, snd: 'impactSoft' },
  fabric: { dust: [0.4, 0.38, 0.36], chips: [0.3, 0.3, 0.3], decal: DF.HOLE_WOOD, sparks: 0, snd: 'impactSoft' },
  rubber: { dust: [0.1, 0.1, 0.1], chips: [0.1, 0.1, 0.1], decal: DF.HOLE_METAL, sparks: 0, snd: 'impactSoft' },
  glass: { dust: [0.8, 0.85, 0.85], chips: [0.8, 0.9, 0.9], decal: DF.HOLE_GLASS, sparks: 0, snd: 'impactGlass' },
  water: { dust: [0.4, 0.45, 0.4], chips: [0.4, 0.45, 0.4], decal: -1, sparks: 0, snd: 'impactWater' },
};

export class Combat {
  constructor(game) {
    this.game = game;
    this.projectiles = [];
    this.fires = []; // {x,y,z,r,t,life,owner}
    this.noises = []; // {x,y,z,r,t}
    this.hitsTmp = [];
  }

  reset() {
    for (const p of this.projectiles) if (p.mesh) p.mesh.parent?.remove(p.mesh);
    this.projectiles = [];
    for (const f of this.fires) if (f.light) f.light.on = false;
    this.fires = [];
    this.noises = [];
  }

  noise(x, y, z, r, source = 'gun') {
    this.noises.push({ x, y, z, r, source, t: this.game.time });
    if (this.noises.length > 24) this.noises.shift();
    this.game.infected?.hearNoise(x, y, z, r, source);
  }

  // --------------------------------------------------------------- bullets --
  fireWeapon(shooter, weapon) {
    const g = this.game;
    const d = weapon.def;
    shooter.eye(_eye);
    shooter.aimDir(_aim);
    shooter.stats.shots++;
    const spreadRad = THREE.MathUtils.degToRad(weapon.spread(shooter));
    const muzzle = shooter.muzzlePos ? shooter.muzzlePos(weapon) : _v.copy(_eye).addScaledVector(_aim, 0.6);
    const mx = muzzle.x, my = muzzle.y, mz = muzzle.z;
    // Recoil for the shooter
    const braced = shooter.usingMounted ? 0.12 : 1; // tripod soaks up most of the kick
    const kickP = THREE.MathUtils.degToRad(d.recoilPitch) * randRange(0.75, 1.15) * braced;
    const kickY = THREE.MathUtils.degToRad(d.recoilYaw) * randRange(-1, 1) * braced;
    shooter.aimPitchOff = clamp(shooter.aimPitchOff + kickP * (shooter.crouching ? 0.6 : 1), -0.4, 0.35);
    shooter.aimYawOff = clamp(shooter.aimYawOff + kickY, -0.2, 0.2);
    shooter.punchP += kickP * 0.6 * (d.viewKick ?? 1);
    shooter.punchY += kickY * 0.5;
    if (d.projectile) {
      this.launchGrenade(shooter, _eye, _aim);
      g.audio.play(d.sound, { pos: muzzle, vol: 1 });
      g.fx.muzzle(mx, my, mz, _aim.x, _aim.y, _aim.z, 1.4);
      this.noise(_eye.x, _eye.y, _eye.z, 40);
      return;
    }
    // Pellets
    const hitAgg = new Map(); // ent -> {dmg, part, zone, point, dir, n}
    for (let p = 0; p < d.pellets; p++) {
      coneSpread(_aim, spreadRad, _dir);
      this.traceBullet(shooter, weapon, _eye, _dir, hitAgg, mx, my, mz, p === 0 || Math.random() < 0.35);
    }
    for (const [ent, h] of hitAgg) {
      if (ent.takeHit) ent.takeHit(h);
    }
    if (shooter.isHuman && hitAgg.size) g.onPlayerHit?.();
    // Effects
    const flashScale = d.kind === 'shotgun' ? 1.6 : d.kind === 'heavy' || d.kind === 'minigun' ? 1.3 : d.kind === 'pistol' ? 0.9 : 1;
    if (!d.silenced) {
      g.fx.muzzle(mx, my, mz, _aim.x, _aim.y, _aim.z, flashScale);
      g.lights.flash(mx + _aim.x * 0.3, my + _aim.y * 0.3, mz + _aim.z * 0.3, 0xffb060, 6 * flashScale, 7, 0.05);
    }
    g.audio.play(d.sound, { pos: muzzle, vol: 1, owner: shooter, gun: true });
    if (shooter.onFired) shooter.onFired(weapon);
    this.noise(_eye.x, _eye.y, _eye.z, d.silenced ? 12 : d.kind === 'pistol' ? 28 : 38);
  }

  traceBullet(shooter, weapon, eye, dir, hitAgg, mx, my, mz, tracer) {
    const g = this.game;
    const d = weapon.def;
    const col = g.level.col;
    const range = d.range * 1.5;
    const wh = col.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, range, F_SHOOT);
    const wallT = wh ? wh.t : range;
    const wallHit = wh ? { x: wh.x, y: wh.y, z: wh.z, nx: wh.nx, ny: wh.ny, nz: wh.nz, surf: wh.surf, owner: wh.owner, dyn: wh.dyn } : null;
    // entity hits
    const hits = this.hitsTmp;
    hits.length = 0;
    g.infected.traceBodies(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, wallT, hits);
    // friendly fire candidates
    for (const s of g.survivors) {
      if (s === shooter || s.dead) continue;
      const top = s.pos.y + (s.incapped ? 0.5 : s.crouching ? 1.25 : 1.75);
      const t = rayCapsule(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, s.pos.x, s.pos.y + 0.25, s.pos.z, s.pos.x, top - 0.2, s.pos.z, s.incapped ? 0.35 : 0.28);
      if (t >= 0 && t < wallT) hits.push({ ent: s, t, part: -1, zone: 'torso', survivor: true });
    }
    // props
    g.props?.traceProps(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, wallT, hits);
    hits.sort((a, b) => a.t - b.t);
    let pen = d.penetration;
    let dmgMul = 1;
    let endT = wallT;
    for (const h of hits) {
      if (pen <= 0) { endT = h.t; break; }
      const dist = h.t;
      const fall = dist > d.range * 0.3 ? Math.max(d.falloff, 1 - (dist - d.range * 0.3) / (d.range * 1.2)) : 1;
      let dmg = d.damage * fall * dmgMul;
      const px = eye.x + dir.x * dist, py = eye.y + dir.y * dist, pz = eye.z + dir.z * dist;
      if (h.survivor) {
        const ff = g.difficulty.ff;
        if (ff > 0 && !(shooter.isBot)) {
          const amt = dmg * ff;
          h.ent.takeDamage(amt, shooter, 'ff');
          h.ent.stats.ffTaken += amt;
          shooter.stats.ffDealt += amt;
          g.onFriendlyFire?.(shooter, h.ent, amt);
          g.fx.blood(px, py, pz, -dir.x, -dir.y, -dir.z, 0.5);
        }
        pen--;
        endT = h.t;
        continue;
      }
      if (h.prop) {
        h.prop.onShot?.(px, py, pz, dir, shooter);
        pen = 0;
        endT = h.t;
        this.impactFx({ x: px, y: py, z: pz, nx: -dir.x, ny: -dir.y, nz: -dir.z, surf: h.prop.surf || 'metal' }, dir, true, false);
        break;
      }
      let a = hitAgg.get(h.ent);
      if (!a) {
        a = { damage: 0, part: h.part, zone: h.zone, x: px, y: py, z: pz, dir: dir.clone(), attacker: shooter, weapon, kind: 'bullet', knockback: 0, pellets: 0, headshot: false };
        hitAgg.set(h.ent, a);
      }
      a.damage += dmg;
      a.pellets++;
      a.knockback += d.knockback;
      if (h.zone === 'head') a.headshot = true;
      // keep most severe part (head > limbs)
      if (h.zone === 'head' || (a.zone === 'torso' && h.zone !== 'torso')) { a.part = h.part; a.zone = h.zone; a.x = px; a.y = py; a.z = pz; }
      shooter.stats.hits++;
      // blood per pellet
      g.fx.blood(px, py, pz, dir.x * 0.6, dir.y * 0.6 + 0.1, dir.z * 0.6, d.kind === 'shotgun' ? 0.6 : 1);
      // exit wound splatter onto nearby wall behind
      if (Math.random() < 0.45) this.bloodBehind(px, py, pz, dir, 0.25 + Math.random() * 0.3);
      if (h.ent.isCorpse) { pen = Math.max(0, pen - 0.5); continue; }
      pen -= h.ent.penCost ?? 1;
      dmgMul *= 0.75;
      if (pen <= 0) endT = h.t;
    }
    if (pen > 0 && wallHit) {
      this.impactFx(wallHit, dir, true, true);
      if (wallHit.owner && wallHit.owner.onShot) wallHit.owner.onShot(wallHit.x, wallHit.y, wallHit.z, dir, shooter);
      endT = wallT;
    }
    if (tracer && Math.random() < d.tracer + 0.15) {
      const len = endT;
      if (len > 2) {
        // tracer travels from muzzle towards end point
        const ex = eye.x + dir.x * endT, ey = eye.y + dir.y * endT, ez = eye.z + dir.z * endT;
        const tx = ex - mx, ty = ey - my, tz = ez - mz;
        const tl = Math.hypot(tx, ty, tz);
        g.fx.tracer(mx + tx / tl * 0.8, my + ty / tl * 0.8, mz + tz / tl * 0.8, tx / tl, ty / tl, tz / tl, Math.min(300, tl / 0.1), 0.04);
      }
    }
  }

  bloodBehind(x, y, z, dir, size) {
    const g = this.game;
    const h = g.level.col.raycast(x, y, z, dir.x, dir.y - 0.15, dir.z, 3.5, F_SOLID);
    if (h) {
      const frames = [DF.BLOOD1, DF.BLOOD2, DF.BLOOD3, DF.BLOOD4];
      g.decals.add(h.x, h.y, h.z, h.nx, h.ny, h.nz, size * (1 + h.t * 0.4), frames[Math.floor(Math.random() * 4)], { noRoll: Math.abs(h.ny) < 0.5 });
    }
  }

  impactFx(h, dir, decal = true, sound = true) {
    const g = this.game;
    const fx = SURF_FX[h.surf] || SURF_FX.concrete;
    // reflect-ish direction
    const nx = h.nx, ny = h.ny, nz = h.nz;
    g.fx.dust(h.x, h.y, h.z, nx, ny, nz, fx.dust.map((c) => c * g.ambientK), 3, 0.2);
    g.fx.chips(h.x, h.y, h.z, nx, ny, nz, fx.chips.map((c) => c * g.ambientK), 4);
    if (fx.sparks) g.fx.sparks(h.x, h.y, h.z, nx, ny, nz, fx.sparks);
    if (h.surf === 'water') g.fx.splash(h.x, h.y, h.z, 6);
    if (decal && fx.decal >= 0 && !h.dyn) g.decals.add(h.x, h.y, h.z, nx, ny, nz, 0.09 + Math.random() * 0.03, fx.decal);
    if (sound && Math.random() < 0.6) g.audio.play(fx.snd, { pos: _v.set(h.x, h.y, h.z), vol: 0.5 });
  }

  // ------------------------------------------------------------- shove --
  shove(s) {
    const g = this.game;
    s.eye(_eye);
    s.aimDir(_aim);
    const fx = _aim.x, fz = _aim.z;
    const fl = Math.hypot(fx, fz) || 1;
    let hit = false;
    g.infected.forEachNear(s.pos.x, s.pos.z, 2.2, (e) => {
      if (e.dead) {
        if (e.ragdoll) {
          const dx = e.pos.x - s.pos.x, dz = e.pos.z - s.pos.z;
          const dl = Math.hypot(dx, dz) || 1;
          if ((dx * fx + dz * fz) / (dl * fl) > 0.4 && dl < 1.7) e.ragdoll.impulseAll(fx / fl * 2.5, 1.5, fz / fl * 2.5);
        }
        return;
      }
      const dx = e.pos.x - s.pos.x, dz = e.pos.z - s.pos.z, dy = e.pos.y - s.pos.y;
      const dl = Math.hypot(dx, dz) || 1;
      if (Math.abs(dy) > 1.3) return;
      const range = e.special ? 1.9 : 1.7;
      if (dl > range) return;
      const dot = (dx * fx + dz * fz) / (dl * fl);
      if (dot < 0.25 && !(e.pinning && dl < 1.8)) return;
      hit = true;
      e.onShoved?.(s, fx / fl, fz / fl);
    });
    // Free pinned teammate: shove hits special pinning somebody nearby
    for (const o of g.survivors) {
      if (o === s || !o.pinned) continue;
      const d = o.pos.distanceTo(s.pos);
      if (d < 1.9 && o.pinned.shoveable) { o.pinned.onShoved(s, fx / fl, fz / fl); hit = true; }
    }
    g.props?.shoveProps(s, fx / fl, fz / fl);
    if (hit) g.audio.play('shoveHit', { pos: s.pos, vol: 0.8 });
    g.audio.play('shove', { pos: s.pos, vol: 0.5, owner: s });
  }

  // ------------------------------------------------------------- melee --
  melee(s, weapon) {
    const g = this.game;
    const d = weapon.def;
    s.eye(_eye);
    s.aimDir(_aim);
    const arc = Math.cos(THREE.MathUtils.degToRad(d.arc / 2));
    const cands = [];
    g.infected.forEachNear(s.pos.x, s.pos.z, d.range + 0.6, (e) => {
      if (e.dead && !e.ragdoll) return;
      const cx = e.pos.x, cy = e.pos.y + (e.special ? e.height * 0.6 : 1.2), cz = e.pos.z;
      const dx = cx - _eye.x, dy = cy - _eye.y, dz = cz - _eye.z;
      const dl = Math.hypot(dx, dy, dz) || 1;
      if (dl > d.range + (e.radius || 0.3)) return;
      const dot = (dx * _aim.x + dy * _aim.y * 0.5 + dz * _aim.z) / dl;
      if (dot < arc - 0.1) return;
      if (!g.level.col.lineOfSight(_eye.x, _eye.y, _eye.z, cx, cy, cz)) return;
      cands.push({ e, dl, dot });
    });
    cands.sort((a, b) => a.dl - b.dl);
    let n = 0;
    let hitAny = false;
    for (const c of cands) {
      if (c.e.dead) {
        c.e.ragdoll?.impulseAll(_aim.x * 3, 1, _aim.z * 3);
        continue;
      }
      if (n >= d.maxTargets) break;
      n++;
      hitAny = true;
      // choose part by aim height: headish if aiming up at head level
      const e = c.e;
      const headY = e.body ? e.body.jy(2) : e.pos.y + 1.6;
      const aimY = _eye.y + _aim.y * c.dl;
      const head = Math.abs(aimY - headY) < 0.35 && Math.random() < d.decap + 0.3;
      e.takeHit({
        damage: d.damage, part: head ? 1 : pick([0, 2, 4, 3, 5]), zone: head ? 'head' : 'torso',
        x: e.pos.x, y: aimY, z: e.pos.z, dir: _aim.clone(), attacker: s, weapon, kind: 'melee',
        knockback: d.knockback, decap: head || Math.random() < d.decap * 0.5, blunt: d.blunt,
      });
      g.fx.blood(e.pos.x, aimY, e.pos.z, _aim.x, 0.3, _aim.z, 1.6);
      this.bloodBehind(e.pos.x, aimY, e.pos.z, _aim, 0.5);
    }
    if (!hitAny) {
      // hit world?
      const h = g.level.col.raycast(_eye.x, _eye.y, _eye.z, _aim.x, _aim.y, _aim.z, d.range, F_SHOOT);
      if (h) {
        this.impactFx(h, _aim, false, false);
        g.audio.play(d.blunt ? 'meleeWall' : 'meleeWallSharp', { pos: _v.set(h.x, h.y, h.z), vol: 0.8 });
        s.punchP += 0.03;
      }
    } else {
      g.audio.play(d.blunt ? 'meleeHitBlunt' : 'meleeHit', { pos: s.pos, vol: 1 });
      s.punchY += (Math.random() - 0.5) * 0.04;
    }
    g.audio.play('swing', { pos: s.pos, vol: 0.6, owner: s });
    this.noise(s.pos.x, s.pos.y, s.pos.z, 6);
  }

  // ------------------------------------------------------ friendly helpers --
  lookedAtSurvivor(s, range = 2) {
    const g = this.game;
    s.eye(_eye);
    s.aimDir(_aim);
    let best = null, bd = 1e9;
    for (const o of g.survivors) {
      if (o === s || o.dead) continue;
      const t = rayCapsule(_eye.x, _eye.y, _eye.z, _aim.x, _aim.y, _aim.z, o.pos.x, o.pos.y + 0.1, o.pos.z, o.pos.x, o.pos.y + (o.incapped ? 0.6 : 1.7), o.pos.z, 0.45);
      if (t >= 0 && t < range && t < bd) { bd = t; best = o; }
    }
    return best;
  }

  // ---------------------------------------------------------- throwables --
  throwItem(s, type) {
    const g = this.game;
    s.eye(_eye);
    s.aimDir(_aim);
    const speed = type === 'pipebomb' ? 15 : 14;
    const p = {
      type, x: _eye.x + _aim.x * 0.5, y: _eye.y + _aim.y * 0.5 - 0.1, z: _eye.z + _aim.z * 0.5,
      vx: _aim.x * speed + s.phys.vx * 0.5, vy: _aim.y * speed + 3.2, vz: _aim.z * speed + s.phys.vz * 0.5,
      t: 0, fuse: type === 'pipebomb' ? 6 : 99, owner: s, bounces: 0, rest: false, spin: 0,
    };
    p.mesh = g.itemModels ? g.itemModels.throwableMesh(type) : null;
    if (p.mesh) g.scene.add(p.mesh);
    this.projectiles.push(p);
    g.audio.play('throw', { pos: s.pos, vol: 0.7 });
    if (type === 'pipebomb') p.beepT = 0;
    g.onThrow?.(s, type);
  }
  launchGrenade(s, eye, aim) {
    const g = this.game;
    const p = { type: 'grenade', x: eye.x + aim.x * 0.7, y: eye.y + aim.y * 0.7 - 0.1, z: eye.z + aim.z * 0.7, vx: aim.x * 38, vy: aim.y * 38 + 1.5, vz: aim.z * 38, t: 0, fuse: 5, owner: s, bounces: 0 };
    p.mesh = g.itemModels ? g.itemModels.throwableMesh('grenade') : null;
    if (p.mesh) g.scene.add(p.mesh);
    this.projectiles.push(p);
  }

  update(dt) {
    const g = this.game;
    const col = g.level.col;
    const client = !!g.net?.client; // co-op client: projectiles are visual; the host detonates them
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      if (client && p.t > 12) { if (p.mesh) p.mesh.parent?.remove(p.mesh); this.projectiles.splice(i, 1); continue; }
      if (!p.rest) {
        p.vy -= 16 * dt;
        const sp = Math.hypot(p.vx, p.vy, p.vz);
        const step = sp * dt;
        if (sp > 0.001) {
          const h = col.raycast(p.x, p.y, p.z, p.vx / sp, p.vy / sp, p.vz / sp, step + 0.06, F_SOLID);
          // direct hit on infected for grenade launcher / molotov
          let hitEnt = null;
          if (p.type === 'grenade' || p.type === 'molotov' || p.type === 'bile') {
            const hits = [];
            g.infected.traceBodies(p.x, p.y, p.z, p.vx / sp, p.vy / sp, p.vz / sp, step + 0.1, hits);
            if (hits.length && hits[0].t < (h ? h.t : 1e9) && !hits[0].ent.dead) hitEnt = hits[0];
          }
          if (hitEnt && !client) {
            p.x += p.vx / sp * hitEnt.t; p.y += p.vy / sp * hitEnt.t; p.z += p.vz / sp * hitEnt.t;
            this.detonate(p, { nx: 0, ny: 1, nz: 0 });
            this.projectiles.splice(i, 1);
            continue;
          }
          if (h) {
            p.x = h.x + h.nx * 0.05; p.y = h.y + h.ny * 0.05; p.z = h.z + h.nz * 0.05;
            if (p.type === 'molotov' || p.type === 'bile' || p.type === 'grenade') {
              if (client) { p.rest = true; p.vx = p.vy = p.vz = 0; continue; }
              this.detonate(p, h);
              this.projectiles.splice(i, 1);
              continue;
            }
            // bounce
            const vn = p.vx * h.nx + p.vy * h.ny + p.vz * h.nz;
            p.vx = (p.vx - 2 * vn * h.nx) * 0.45; p.vy = (p.vy - 2 * vn * h.ny) * 0.35; p.vz = (p.vz - 2 * vn * h.nz) * 0.45;
            p.bounces++;
            if (p.bounces < 5) g.audio.play('bounce', { pos: _v.set(p.x, p.y, p.z), vol: 0.5 });
            if (h.ny > 0.6 && Math.hypot(p.vx, p.vy, p.vz) < 1.2) { p.rest = true; p.vx = p.vy = p.vz = 0; }
          } else {
            p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          }
        }
        p.spin += dt * 12;
      }
      if (p.mesh) {
        p.mesh.position.set(p.x, p.y, p.z);
        p.mesh.rotation.set(p.spin, p.spin * 0.7, 0);
      }
      if (p.type === 'pipebomb') {
        // beeping + blinking; lure infected
        p.beepT -= dt;
        const rate = p.fuse - p.t < 1.5 ? 0.12 : p.fuse - p.t < 3 ? 0.25 : 0.5;
        if (p.beepT <= 0) {
          p.beepT = rate;
          if (!client) g.audio.play('beep', { pos: _v.set(p.x, p.y, p.z), vol: 0.8 });
          g.lights.flash(p.x, p.y + 0.1, p.z, 0xff2010, 2, 3, 0.08);
        }
        if (!client) g.infected.lure(p.x, p.y, p.z, 35);
      }
      if (p.t >= p.fuse && !client) {
        this.detonate(p, { nx: 0, ny: 1, nz: 0 });
        this.projectiles.splice(i, 1);
      }
    }
    // fire areas
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t += dt;
      const k = 1 - f.t / f.life;
      if (k <= 0) {
        if (f.light) f.light.on = false;
        this.fires.splice(i, 1);
        continue;
      }
      // particles
      const n = Math.ceil(f.r * 2 * g.quality.particles);
      for (let q = 0; q < n; q++) {
        const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * f.r;
        const fx = f.x + Math.cos(a) * d, fz = f.z + Math.sin(a) * d;
        if (Math.random() < 0.5 * k + 0.2) g.fx.fire(fx, f.y + 0.05, fz, 0.8 + Math.random() * 0.6);
      }
      if (f.light) f.light.intensity = 14 * Math.min(1, k * 3) * (0.8 + Math.random() * 0.4);
      // damage
      f.tick = (f.tick || 0) - dt;
      if (f.tick <= 0 && !client) {
        f.tick = 0.2;
        g.infected.forEachNear(f.x, f.z, f.r + 0.5, (e) => {
          if (e.dead) return;
          const d = Math.hypot(e.pos.x - f.x, e.pos.z - f.z);
          if (d < f.r && Math.abs(e.pos.y - f.y) < 1.5) e.ignite?.(f.owner);
        });
        for (const s of g.survivors) {
          if (s.dead) continue;
          const d = Math.hypot(s.pos.x - f.x, s.pos.z - f.z);
          if (d < f.r && Math.abs(s.pos.y - f.y) < 1.5) {
            s.takeDamage(g.difficulty.fireDmg * 0.2, f.owner, 'fire');
          }
        }
      }
    }
  }

  detonate(p, h) {
    const g = this.game;
    const x = p.x, y = p.y, z = p.z;
    if (p.mesh) p.mesh.parent?.remove(p.mesh);
    if (p.type === 'molotov') {
      this.startFire(x, y, z, 4.2, 15, p.owner);
      g.audio.play('molotov', { pos: _v.set(x, y, z), vol: 1 });
      g.fx.explosion(x, y + 0.2, z, 0.35);
      this.noise(x, y, z, 20);
    } else if (p.type === 'bile') {
      g.audio.play('glass', { pos: _v.set(x, y, z), vol: 1 });
      g.fx.cloud(x, y, z, 2.5, [0.35, 0.45, 0.08], 25, 4);
      g.decals.add(x, y + 0.02, z, 0, 1, 0, 3, DF.BILE);
      g.infected.bileAt(x, y, z, 4.5, 20);
    } else {
      this.explode(x, y, z, p.type === 'grenade' ? 5 : 6.5, p.type === 'grenade' ? 500 : 1200, p.owner);
    }
  }

  startFire(x, y, z, r, life, owner) {
    const g = this.game;
    const gy = g.level.col.groundHeight(x, y + 0.5, z, 4);
    const fy = gy > -1e8 ? gy : y;
    const light = g.level.light(x, fy + 1, z, 0xff7a30, 14, 12, { flicker: 0.4, priority: 2, dynamic: true });
    this.fires.push({ x, y: fy, z, r, t: 0, life, owner, light });
    g.decals.add(x, fy + 0.01, z, 0, 1, 0, r * 2.2, DF.SCORCH, { alpha: 0.8 });
  }

  explode(x, y, z, radius, damage, owner, opts = {}) {
    const g = this.game;
    g.fx.explosion(x, y + 0.3, z, opts.scale ?? 1);
    g.fx.shockwave(x, y + 0.2, z, radius);
    g.lights.flash(x, y + 1, z, 0xffa050, 60, radius * 5, 0.35);
    g.audio.play('explosion', { pos: _v.set(x, y, z), vol: 1.2 });
    const gh = g.level.col.groundHeight(x, y + 0.5, z, 3);
    if (gh > -1e8) g.decals.add(x, gh + 0.01, z, 0, 1, 0, radius * 1.1, DF.SCORCH);
    this.noise(x, y, z, 60);
    // infected
    g.infected.forEachNear(x, z, radius * 1.6, (e) => {
      const ey = e.pos.y + 1;
      const d = Math.hypot(e.pos.x - x, ey - y, e.pos.z - z);
      if (d > radius * 1.5) return;
      const k = clamp(1 - d / (radius * 1.5), 0, 1);
      const dx = (e.pos.x - x) / (d || 1), dz = (e.pos.z - z) / (d || 1);
      if (!g.level.col.lineOfSight(x, y + 0.5, z, e.pos.x, ey, e.pos.z)) return;
      if (e.dead) { e.ragdoll?.impulseAll(dx * 12 * k, 8 * k, dz * 12 * k); return; }
      e.takeHit({
        damage: damage * (0.3 + 0.7 * k) * (e.special ? (e.explosiveMult ?? 0.5) : 1), part: 0, zone: 'torso', x: e.pos.x, y: ey, z: e.pos.z,
        dir: new THREE.Vector3(dx, 0.6, dz).normalize(), attacker: owner, kind: 'explosion', knockback: 14 * k, gib: k > 0.45, explosion: true,
      });
    });
    // survivors: knock & damage (friendly)
    for (const s of g.survivors) {
      if (s.dead) continue;
      const d = Math.hypot(s.pos.x - x, s.pos.y + 1 - y, s.pos.z - z);
      if (d > radius) continue;
      const k = 1 - d / radius;
      if (!g.level.col.lineOfSight(x, y + 0.5, z, s.pos.x, s.pos.y + 1, s.pos.z)) continue;
      if (!opts.noSurvivorDamage) s.takeDamage((opts.survivorDamage ?? 25) * k * (owner && owner.isHuman !== undefined ? g.difficulty.ff * 2 + 0.2 : 1), owner, 'explosion');
      s.knock = { x: (s.pos.x - x) / (d || 1) * 5 * k, y: 3 * k, z: (s.pos.z - z) / (d || 1) * 5 * k };
      if (s.isHuman) g.shake(0.6 * k + 0.2);
    }
    g.props?.explosionImpulse(x, y, z, radius * 1.6, 18);
    g.infected.corpseImpulse?.(x, y, z, radius * 2, 12);
    const pd = g.player ? Math.hypot(g.player.pos.x - x, g.player.pos.z - z) : 99;
    if (pd < radius * 5) g.shake(Math.max(0.15, 1 - pd / (radius * 5)));
  }
}
