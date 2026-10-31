import { Vec3 } from '../physics/math.js';

/**
 * Firearms with real ballistic figures (bullet mass, muzzle velocity, diameter). `pen` is the
 * soft-tissue penetration of the round (gelatin-equivalent metres); handgun FMJ goes deep but
 * narrow, rifle rounds yaw and fragment (energy dumped quickly, large temporary cavity).
 */
export const WEAPONS = {
  pistol: {
    label: 'Pistol', round: '9×19 mm FMJ', mass: 0.008, speed: 365, diameter: 0.009, pen: 0.6,
    pellets: 1, spread: 0.003, rpm: 420, auto: false, recoil: 1.0, kick: 0.05,
  },
  revolver: {
    label: 'Revolver', round: '.357 Magnum JHP', mass: 0.0102, speed: 440, diameter: 0.0091, pen: 0.36,
    pellets: 1, spread: 0.002, rpm: 160, auto: false, recoil: 1.8, kick: 0.09, expanding: true,
  },
  shotgun: {
    label: 'Shotgun', round: '12 ga 00 buckshot', mass: 0.0035, speed: 400, diameter: 0.0084, pen: 0.36,
    pellets: 9, spread: 0.028, rpm: 70, auto: false, recoil: 2.6, kick: 0.14,
  },
  smg: {
    label: 'SMG', round: '9×19 mm FMJ', mass: 0.008, speed: 390, diameter: 0.009, pen: 0.6,
    pellets: 1, spread: 0.009, rpm: 850, auto: true, recoil: 0.55, kick: 0.025,
  },
  rifle: {
    label: 'Assault rifle', round: '5.56×45 mm', mass: 0.004, speed: 940, diameter: 0.0057, pen: 0.36,
    pellets: 1, spread: 0.0022, rpm: 700, auto: true, recoil: 0.9, kick: 0.035, fragmenting: true,
  },
  sniper: {
    label: 'Sniper rifle', round: '.308 Win FMJ', mass: 0.0097, speed: 830, diameter: 0.0078, pen: 0.85,
    pellets: 1, spread: 0.0004, rpm: 45, auto: false, recoil: 3.2, kick: 0.16,
  },
};

export function makeProjectile(w) {
  const energy = 0.5 * w.mass * w.speed * w.speed;
  return {
    label: w.label,
    round: w.round,
    mass: w.mass,
    diameter: w.expanding ? w.diameter * 1.6 : w.diameter,
    speed: w.speed,
    speed0: w.speed,
    energy,
    energy0: energy,
    pen: w.pen,
    pen0: w.pen,
    fragmenting: !!w.fragmenting,
  };
}

// Penetration cost per metre of material relative to soft tissue, and how much of the collider
// thickness is solid (hollow objects).
const MATERIAL_PEN = {
  wood: { cost: 3.2, solid: 0.12 }, // a crate is mostly air: two plank walls
  metal: { cost: 30, solid: 1 },
  bowling: { cost: 2.8, solid: 1 },
  brick: { cost: 9, solid: 1 },
  glass: { cost: 1.5, solid: 0.15 },
  melon: { cost: 0.9, solid: 1 },
  rubber: { cost: 1.5, solid: 0.05 },
  baseball: { cost: 1.4, solid: 1 },
  default: { cost: 3, solid: 1 },
};

const _o = new Vec3();
const _d = new Vec3();
const _rec = { tIn: 0, tOut: 0 };

/**
 * Intersect a ray with the visible skin of every posed segment (sphere tracing the sculpted body
 * in each segment's frame). Returns [{person, body, seg, tIn, tOut}] unsorted.
 */
export function raycastPeople(people, shape, origin, dir, maxDist) {
  const hits = [];
  for (const person of people) {
    for (const body of person.rd.allBodies()) {
      if (!body.world) continue;
      // cheap reject against the collider bounds of the last step
      const pad = 0.04;
      let t0 = 0, t1 = maxDist;
      let miss = false;
      for (const ax of ['x', 'y', 'z']) {
        const inv = 1 / (Math.abs(dir[ax]) < 1e-12 ? 1e-12 : dir[ax]);
        let a = (body.aabbMin[ax] - pad - origin[ax]) * inv, b = (body.aabbMax[ax] + pad - origin[ax]) * inv;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
        if (t0 > t1) {
          miss = true;
          break;
        }
      }
      if (miss) continue;
      const seg = body.userData.segment;
      const segIndex = shape.segIndex[seg.name];
      const bindPos = body.userData.fragment ? body.userData.bindPos : seg.bindPos;
      // ray into the sculpt frame of this body
      body.worldToLocal(origin, _o).add(bindPos);
      body.worldDirToLocal(dir, _d);
      const mp = shape.modelPose[seg.name];
      _o.sub(mp.pivot).applyQuat(mp.q).add(mp.pivot);
      _d.applyQuat(mp.q);
      const r = shape.raySegment(segIndex, _o, _d, maxDist, _rec);
      if (!r) continue;
      // a broken limb: each fragment owns the tissue on its side of the break
      if (seg.fractured) {
        const fr = seg.fractured;
        const pe = new Vec3().copy(origin).addScaled(dir, r.tIn);
        body.worldToLocal(pe, pe).add(bindPos);
        const side = new Vec3().subVectors(pe, fr.pointBind).dot(fr.axis);
        if (body.userData.fragment ? side < -0.01 : side > 0.01) continue;
      }
      hits.push({ person, body, seg, tIn: r.tIn, tOut: r.tOut });
    }
  }
  return hits;
}

/**
 * Fire one projectile. ctx: { world, people, shape, forceScale, fx(event) }.
 * Processes every surface along the ray in order: people (wound channels through each segment),
 * props (penetration by material, breakage), the floor. Returns the path end point.
 */
export function traceProjectile(ctx, origin, dir, proj, maxDist = 120) {
  const { world, people, shape } = ctx;
  const fx = ctx.fx;
  const forceScale = ctx.forceScale ?? 1;
  const hits = raycastPeople(people, shape, origin, dir, maxDist).map((h) => ({ ...h, type: 'flesh' }));
  for (const h of world.raycastAll(origin, dir, maxDist, (b) => !(b.userData && b.userData.ragdoll))) {
    hits.push({ ...h, type: h.ground ? 'ground' : 'object' });
  }
  hits.sort((a, b) => a.tIn - b.tIn);
  let end = new Vec3().copy(origin).addScaled(dir, maxDist);
  const hitPeople = new Set();
  const hitList = []; // [{person, seg}] in the order the bullet went through them
  for (const h of hits) {
    if (proj.pen <= 0) break;
    if (h.type === 'flesh') {
      const entry = new Vec3().copy(origin).addScaled(dir, h.tIn);
      const exit = h.tOut > h.tIn + 0.004 ? new Vec3().copy(origin).addScaled(dir, h.tOut) : null;
      // armour (a boss's helmet stops the round, its vest takes most of the energy)
      const armor = h.person.injury.armorHit ? h.person.injury.armorHit(h.seg.name, proj) : null;
      if (armor === 'stopped') {
        h.body.applyImpulse(new Vec3().copy(dir).scale(proj.mass * proj.speed * forceScale), entry);
        hitPeople.add(h.person);
        hitList.push({ person: h.person, seg: h.seg.name, armor: true });
        fx({ type: 'armorHit', person: h.person, body: h.body, seg: h.seg, point: entry, dir: dir.clone(), energy: proj.energy });
        end = entry;
        proj.pen = 0;
        break;
      }
      const vIn = proj.speed;
      const res = h.person.injury.bulletThrough(h.body, entry, exit, dir, proj);
      const dv = Math.max(0, vIn - proj.speed);
      // momentum actually transferred to the body (the bullet's lost momentum)
      const J = new Vec3().copy(dir).scale(proj.mass * dv * forceScale * (h.person.knockback ?? 1));
      h.body.applyImpulse(J, entry);
      hitPeople.add(h.person);
      hitList.push({ person: h.person, seg: h.seg.name });
      fx({
        type: 'fleshHit', person: h.person, body: h.body, seg: h.seg, entry, exit: res.stopped ? null : exit, dir: dir.clone(),
        energy: res.deposited, highVelocity: proj.speed0 > 600, entryWound: res.entryWound, exitWound: res.exitWound,
        head: h.seg.name === 'head', bone: res.structures.some((x) => x.s.kind === 'bone' && x.direct),
        structures: res.structures.map((x) => x.s.kind), parts: res.structures.map((x) => x.s.name),
      });
      if (res.stopped) {
        end = res.endW;
        break;
      }
    } else if (h.type === 'object') {
      const b = h.body;
      const mat = h.shape.material || 'default';
      const mp = MATERIAL_PEN[mat] || MATERIAL_PEN.default;
      const thick = Math.max(0.002, h.tOut - h.tIn) * mp.solid;
      const cost = thick * mp.cost;
      const vIn = proj.speed;
      const entry = h.point.clone();
      let stopped = false;
      if (proj.pen <= cost) {
        stopped = true;
        proj.pen = 0;
        proj.speed = 0;
      } else {
        proj.pen -= cost;
        proj.energy = proj.energy0 * Math.pow(proj.pen / proj.pen0, 1.6);
        proj.speed = proj.speed0 * Math.sqrt(proj.energy / proj.energy0);
      }
      const dv = Math.max(0, vIn - proj.speed);
      b.applyImpulse(new Vec3().copy(dir).scale(proj.mass * dv * forceScale), entry);
      b.wake();
      fx({ type: 'objectHit', body: b, point: entry, normal: h.normal.clone(), dir: dir.clone(), material: mat, energy: 0.5 * proj.mass * (vIn * vIn - proj.speed * proj.speed) });
      if (stopped) {
        end = entry;
        break;
      }
    } else {
      // floor: the bullet stops (or ricochets off at a shallow angle, energy mostly spent)
      end = h.point.clone();
      fx({ type: 'groundHit', point: h.point.clone(), normal: new Vec3(0, 1, 0), dir: dir.clone(), energy: proj.energy });
      proj.pen = 0;
      break;
    }
  }
  return { end, hitPeople, hits: hitList };
}

/** Pellet / bullet directions with angular spread (radians, roughly Gaussian). */
export function spreadDirections(dir, spread, count, rng = Math.random) {
  const out = [];
  const up = Math.abs(dir.y) < 0.95 ? new Vec3(0, 1, 0) : new Vec3(1, 0, 0);
  const r = new Vec3().crossVectors(dir, up).normalize();
  const u = new Vec3().crossVectors(r, dir).normalize();
  for (let i = 0; i < count; i++) {
    // Box-Muller
    const a = Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-9)));
    const b = 2 * Math.PI * rng();
    const sx = a * Math.cos(b) * spread * 0.5, sy = a * Math.sin(b) * spread * 0.5;
    out.push(new Vec3().copy(dir).addScaled(r, sx).addScaled(u, sy).normalize());
  }
  return out;
}
