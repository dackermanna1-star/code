// Dynamic props: Verlet boxes (crates, cardboard boxes, barrels, explosive
// canisters), sticks (weapons and plank debris) and small projectiles.

import { Particle, integrate, solveDistance } from '../physics/particles.js';
import { clamp, segSegDist2, segPointDist2 } from '../core/math.js';
import { HEAD, NECK, PELVIS } from '../fighter/skeleton.js';

export const WEAPONS = {
  pipe: { len: 52, dmg: 1.55, durability: 14, material: 'metal', mass: 1.4, label: 'steel pipe' },
  bat: { len: 48, dmg: 1.5, durability: 11, material: 'wood', mass: 1.1, label: 'baseball bat' },
  crowbar: { len: 40, dmg: 1.45, durability: 18, material: 'metal', mass: 1.2, label: 'crowbar' },
  plank: { len: 46, dmg: 1.3, durability: 4, material: 'wood', mass: 0.9, label: 'plank' },
};

const BOX_KINDS = {
  crate: { mass: 0.0021, hp: 70, material: 'wood', breakSpeed: 620, bounce: 0.15, mu: 0.7 },
  box: { mass: 0.0007, hp: 26, material: 'cardboard', breakSpeed: 520, bounce: 0.2, mu: 0.6, w: 40, h: 34 },
  barrel: { mass: 0.0034, hp: 9999, material: 'metal', breakSpeed: 99999, bounce: 0.25, mu: 0.5, w: 36, h: 52 },
  canister: { mass: 0.0024, hp: 34, material: 'metal', breakSpeed: 99999, bounce: 0.3, mu: 0.5, w: 26, h: 44, explosive: true },
};

const near = [];
const nearKin = [];
let nextId = 1;

export class Box {
  constructor(kind, x, y, w, h) {
    const k = BOX_KINDS[kind];
    this.id = nextId++;
    this.kind = kind;
    this.w = w || k.w;
    this.h = h || k.h;
    this.k = k;
    const m = Math.max(0.6, this.w * this.h * k.mass) / 4;
    const hw = this.w / 2;
    const hh = this.h / 2;
    this.p = [new Particle(x - hw, y - hh, 2, m), new Particle(x + hw, y - hh, 2, m), new Particle(x + hw, y + hh, 2, m), new Particle(x - hw, y + hh, 2, m)];
    const diag = Math.sqrt(this.w * this.w + this.h * this.h);
    this.c = [[0, 1, this.w], [1, 2, this.h], [2, 3, this.w], [3, 0, this.h], [0, 2, diag], [1, 3, diag]];
    this.mass = m * 4;
    this.hp = k.hp;
    this.sleeping = false;
    this.sleepT = 0;
    this.fuse = -1;
    this.broken = false;
    this.lastThrower = null;
    this.hitT = new Map();
  }

  center() {
    const p = this.p;
    return [(p[0].x + p[1].x + p[2].x + p[3].x) / 4, (p[0].y + p[1].y + p[2].y + p[3].y) / 4];
  }

  velocity(h) {
    let vx = 0;
    let vy = 0;
    for (const q of this.p) {
      vx += q.x - q.px;
      vy += q.y - q.py;
    }
    return [vx / (4 * h), vy / (4 * h)];
  }

  addVel(vx, vy, h) {
    for (const q of this.p) q.addVel(vx, vy, h);
    this.sleeping = false;
    this.sleepT = 0;
  }

  angle() {
    return Math.atan2(this.p[1].y - this.p[0].y, this.p[1].x - this.p[0].x);
  }
}

export class Stick {
  constructor(kind, x, y, ang, len, mass) {
    this.id = nextId++;
    this.kind = kind;
    this.len = len;
    const dx = (Math.cos(ang) * len) / 2;
    const dy = (Math.sin(ang) * len) / 2;
    this.p = [new Particle(x - dx, y - dy, 2.5, mass / 2), new Particle(x + dx, y + dy, 2.5, mass / 2)];
    this.mass = mass;
    this.weapon = WEAPONS[kind] ? { kind, ...WEAPONS[kind], durability: WEAPONS[kind].durability } : null;
    this.flying = 0;
    this.thrower = null;
    this.sleeping = false;
    this.sleepT = 0;
    this.life = Infinity;
    this.debris = false;
  }
}

export class Projectile {
  constructor(kind, x, y, vx, vy, h, thrower) {
    this.id = nextId++;
    this.kind = kind;
    this.p = new Particle(x, y, kind === 'brick' ? 4.5 : 3.5, 0.4);
    this.p.setVel(vx, vy, h);
    this.thrower = thrower;
    this.life = 3;
    this.spin = 0;
    this.dead = false;
  }
}

export class Props {
  constructor(sim) {
    this.sim = sim;
    this.boxes = [];
    this.sticks = [];
    this.projectiles = [];
  }

  makeWeapon(kind) {
    const w = WEAPONS[kind];
    return { kind, ...w, durability: w.durability };
  }

  spawnFromLevel(level) {
    for (const ps of level.propSpawns) {
      if (ps.kind in BOX_KINDS) this.boxes.push(new Box(ps.kind, ps.x, ps.y, ps.w, ps.h));
      else if (WEAPONS[ps.kind]) {
        const w = WEAPONS[ps.kind];
        this.sticks.push(new Stick(ps.kind, ps.x, ps.y - 3, this.sim.rng.range(-0.15, 0.15), w.len, w.mass));
      }
    }
  }

  // ---------------------------------------------------------------- physics
  substep(h, g) {
    const L = this.sim.level;
    const fr = L.friction;
    for (const b of this.boxes) {
      if (b.sleeping) continue;
      for (const q of b.p) {
        q.ground = false;
        integrate(q, h, g, 0.999, 30);
      }
      for (let it = 0; it < 3; it++) for (const c of b.c) solveDistance(b.p[c[0]], b.p[c[1]], c[2], 1);
      for (const q of b.p) L.collideParticle(q, b.k.bounce, b.k.mu * fr, h);
    }
    for (const s of this.sticks) {
      if (s.sleeping || s.held) continue;
      for (const q of s.p) {
        q.ground = false;
        integrate(q, h, g, 0.999, 30);
      }
      solveDistance(s.p[0], s.p[1], s.len, 1);
      for (const q of s.p) L.collideParticle(q, 0.3, 0.6 * fr, h);
    }
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      integrate(pr.p, h, g, 0.999, 40);
      L.collideParticle(pr.p, 0.3, 0.4, h);
    }
    this.collideBoxes(h);
  }

  collideBoxes(h) {
    const boxes = this.boxes;
    const sim = this.sim;
    for (let i = 0; i < boxes.length; i++) {
      const A = boxes[i];
      const [cx, cy] = A.center();
      const rad = Math.max(A.w, A.h) * 0.75 + 12;
      // box vs box (corners of B inside A)
      for (let j = 0; j < boxes.length; j++) {
        if (i === j) continue;
        const B = boxes[j];
        if (A.sleeping && B.sleeping) continue;
        const [bx, by] = B.center();
        if (Math.abs(bx - cx) > rad + B.w || Math.abs(by - cy) > rad + B.h) continue;
        for (const q of B.p) pushOutOfBox(A, q, q.w, true);
      }
      // body particles vs box. Walkers push with finite strength and feel
      // the weight (their controller slows down while shoving heavy boxes).
      sim.partHash.query(cx, cy, rad + 20, near);
      sim.kinHash.query(cx, cy, rad + 20, nearKin);
      for (let k = 0; k < nearKin.length; k++) near.push(nearKin[k]);
      for (let k = 0; k < near.length; k++) {
        const q = near[k];
        const o = q.owner;
        if (o && o.removed) continue;
        const wq = q.kin ? 0.9 / Math.max(0.5, o ? o.mass / 9.25 : 1) : q.w;
        const moved = pushOutOfBox(A, q, wq, false);
        if (!moved || !o) continue;
        if (q.kin) {
          if (A.mass > o.mass * 0.12) {
            o.boxPush = Math.max(o.boxPush || 0, A.mass / (o.mass * 0.12));
            o.boxPushDir = Math.sign(cx - o.x) || 1;
          }
        } else if (o.rag.sleeping) {
          o.rag.sleeping = false;
          o.rag.sleepT = 0;
        }
      }
    }
  }

  // ------------------------------------------------------------ per step
  postStep(dt) {
    const sim = this.sim;
    const h = sim.h;
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const b = this.boxes[i];
      // impacts damage boxes
      let imp = 0;
      for (const q of b.p) {
        if (q.impact > imp) imp = q.impact;
        q.impact = 0;
      }
      if (imp > 260) {
        if (imp > 420) sim.emit({ t: 'clatter', x: b.p[2].x, y: b.p[2].y, material: b.k.material, power: imp / 700 });
        this.damageBox(b, (imp - 260) * 0.12, b.lastThrower);
      }
      if (b.broken) continue;
      // canister fuse
      if (b.fuse >= 0) {
        b.fuse -= dt;
        if (b.fuse < 0) {
          const [x, y] = b.center();
          this.boxes.splice(i, 1);
          sim.explode(x, y, 1, b.lastThrower);
          continue;
        }
      }
      // sleeping
      const [vx, vy] = b.velocity(h);
      if (vx * vx + vy * vy < 400 && b.p.some((q) => q.ground)) {
        b.sleepT += dt;
        if (b.sleepT > 0.6) b.sleeping = true;
      } else {
        b.sleepT = 0;
        b.sleeping = false;
      }
      // fast boxes hit fighters
      if (vx * vx + vy * vy > 280 * 280) this.boxHitsFighters(b, vx, vy);
      if (b.center()[1] > sim.level.killY) this.boxes.splice(i, 1);
    }
    for (let i = this.sticks.length - 1; i >= 0; i--) {
      const s = this.sticks[i];
      if (s.held) continue;
      s.life -= dt;
      const mx = (s.p[0].x + s.p[1].x) / 2;
      const my = (s.p[0].y + s.p[1].y) / 2;
      if (s.life <= 0 || my > sim.level.killY) {
        this.sticks.splice(i, 1);
        continue;
      }
      const vx = (s.p[0].x - s.p[0].px + s.p[1].x - s.p[1].px) / (2 * h);
      const vy = (s.p[0].y - s.p[0].py + s.p[1].y - s.p[1].py) / (2 * h);
      const sp2 = vx * vx + vy * vy;
      if (s.flying > 0) {
        s.flying -= dt;
        if (sp2 > 250 * 250) this.stickHitsFighters(s, vx, vy);
      }
      let imp = Math.max(s.p[0].impact, s.p[1].impact);
      s.p[0].impact = s.p[1].impact = 0;
      if (imp > 300) sim.emit({ t: 'clatter', x: mx, y: my, material: s.weapon ? s.weapon.material : 'wood', power: imp / 800, small: true });
      if (sp2 < 100 && (s.p[0].ground || s.p[1].ground)) {
        s.sleepT += dt;
        if (s.sleepT > 0.5) s.sleeping = true;
      } else {
        s.sleepT = 0;
        s.sleeping = false;
      }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      pr.spin += dt * 18;
      if (pr.dead || pr.life <= 0 || pr.p.y > sim.level.killY) {
        this.projectiles.splice(i, 1);
        continue;
      }
      if (pr.p.impact > 120) {
        if (pr.kind === 'bottle') {
          sim.emit({ t: 'break', material: 'glass', x: pr.p.x, y: pr.p.y, power: 0.4, small: true });
          pr.dead = true;
          continue;
        }
        sim.emit({ t: 'clatter', x: pr.p.x, y: pr.p.y, material: 'stone', power: 0.5, small: true });
      }
      pr.p.impact = 0;
      this.projectileHits(pr);
    }
  }

  damageBox(b, amount, by) {
    if (b.broken) return;
    b.hp -= amount;
    if (b.k.explosive) {
      if (b.hp <= 0 && b.fuse < 0) {
        b.fuse = this.sim.rng.range(0.45, 1.0);
        b.fuseT = this.sim.time;
        b.sleeping = false;
        b.lastThrower = by || b.lastThrower;
        this.sim.emit({ t: 'fuse', x: b.center()[0], y: b.center()[1], box: b });
      }
      return;
    }
    if (b.hp <= 0) this.breakBox(b);
  }

  breakBox(b) {
    if (b.broken) return;
    b.broken = true;
    const i = this.boxes.indexOf(b);
    if (i >= 0) this.boxes.splice(i, 1);
    const [x, y] = b.center();
    const h = this.sim.h;
    const [vx, vy] = b.velocity(h);
    const rng = this.sim.rng;
    if (b.kind === 'crate') {
      const n = rng.int(2, 4);
      for (let k = 0; k < n; k++) {
        const s = new Stick('plank', x + rng.range(-b.w / 3, b.w / 3), y + rng.range(-b.h / 3, b.h / 3), rng.range(0, Math.PI), b.w * rng.range(0.7, 0.95), 0.7);
        s.weapon = k === 0 ? { kind: 'plank', ...WEAPONS.plank } : null;
        s.debris = k > 0;
        if (s.debris) s.life = rng.range(6, 10);
        for (const q of s.p) q.setVel(vx * 0.5 + rng.range(-160, 160), vy * 0.5 - rng.range(60, 260), h);
        this.sticks.push(s);
      }
    }
    this.sim.emit({ t: 'break', material: b.k.material, x, y, power: Math.min(1.5, b.w / 50), w: b.w, h: b.h, kind: b.kind });
  }

  boxHitsFighters(b, vx, vy) {
    const sim = this.sim;
    const [cx, cy] = b.center();
    const now = sim.time;
    sim.fighterHash.query(cx, cy, Math.max(b.w, b.h), near);
    for (const f of near) {
      if (f.removed || f.dead || f.ragdolled) continue;
      if (b.lastThrower === f && (f.isHero || now - (b.throwT || 0) < 0.4)) continue;
      const last = b.hitT.get(f.id);
      if (last !== undefined && now - last < 0.8) continue;
      const top = f.y - 88 * f.scale;
      if (cy < top - b.h / 2 || cy > f.y + b.h / 2) continue;
      if (Math.abs(cx - f.x) > b.w / 2 + 12 * f.scale) continue;
      // relative speed: a crate shoved along by the crowd is not a missile
      const rvx = vx - (f.ragdolled ? 0 : f.vx);
      const sp = Math.sqrt(rvx * rvx + vy * vy);
      if (sp < 280) continue;
      b.hitT.set(f.id, now);
      const dmg = sp * 0.012 * Math.min(2.2, b.mass / 2) * (f.isHero ? 0.5 : 1);
      const by = b.lastThrower && b.lastThrower !== f ? b.lastThrower : null;
      f.damage(dmg, by, 'object');
      const dir = Math.sign(vx) || 1;
      if (sp > 330 && sp * b.mass > 1350 * Math.sqrt(f.mass / 9.25)) {
        f.knockdown(dir * sp * 0.5, -160);
        f.knock = { by, chainId: sim.newChain(by), depth: 1, time: now, kind: 'object' };
        if (by) sim.onChain(f.knock, f, null);
      } else {
        f.hitstun(0.3, dir * sp * 0.3, 0, false);
      }
      sim.emit({ t: 'thud', x: cx, y: cy, power: sp / 600, object: true });
      b.addVel(-vx * 0.35, 0, sim.h);
    }
  }

  stickHitsFighters(s, vx, vy) {
    const sim = this.sim;
    const now = sim.time;
    const a = s.p[0];
    const b = s.p[1];
    sim.fighterHash.query((a.x + b.x) / 2, (a.y + b.y) / 2, 60, near);
    for (const f of near) {
      if (f.removed || f.dead || f.ragdolled || f === s.thrower) continue;
      if (s.thrower && !s.thrower.isHero && !f.isHero && sim.rng.chance(0.5)) continue;
      const p = f.rag.p;
      const r = 6 + f.dims.lw;
      const hitHead = segPointDist2(a.x, a.y, b.x, b.y, p[HEAD].x, p[HEAD].y) < (r + f.dims.headR) ** 2;
      const hitBody = segSegDist2(a.x, a.y, b.x, b.y, p[NECK].x, p[NECK].y, p[PELVIS].x, p[PELVIS].y) < r * r;
      if (!hitHead && !hitBody) continue;
      s.flying = 0;
      const sp = Math.sqrt(vx * vx + vy * vy);
      const dmg = sp * 0.022 * (s.weapon ? s.weapon.dmg : 0.6) * (hitHead ? 1.3 : 1);
      f.damage(dmg, s.thrower, 'object');
      const dir = Math.sign(vx) || 1;
      if (sp > 520 || f.poise < 10) {
        f.knockdown(dir * 260, -150, { joint: hitHead ? HEAD : NECK, jx: dir * 200, jy: -50 });
        f.knock = { by: s.thrower, chainId: sim.newChain(s.thrower), depth: 0, time: now, kind: 'thrown' };
      } else f.hitstun(0.4, dir * 160, 0, !hitHead);
      f.flash = 1;
      for (const q of s.p) q.setVel(-vx * 0.25, -120, sim.h);
      sim.emit({ t: 'hit', kind: 'weapon', x: p[hitHead ? HEAD : NECK].x, y: p[hitHead ? HEAD : NECK].y, power: dmg / 9, a: s.thrower, b: f, thrown: true, weapon: s.kind });
      break;
    }
  }

  projectileHits(pr) {
    const sim = this.sim;
    const q = pr.p;
    const sp = Math.sqrt((q.x - q.px) ** 2 + (q.y - q.py) ** 2) / sim.h;
    if (sp < 150) return;
    sim.fighterHash.query(q.x, q.y, 40, near);
    for (const f of near) {
      if (f.removed || f.dead || f.ragdolled || f === pr.thrower || f === pr.passed) continue;
      if (!f.isHero && sim.rng.chance(0.6)) continue;
      const p = f.rag.p;
      const r = q.r + f.dims.lw;
      const hitHead = (q.x - p[HEAD].x) ** 2 + (q.y - p[HEAD].y) ** 2 < (q.r + f.dims.headR) ** 2;
      const hitBody = segPointDist2(p[NECK].x, p[NECK].y, p[PELVIS].x, p[PELVIS].y, q.x, q.y) < r * r;
      if (!hitHead && !hitBody) continue;
      if (f.isHero && !pr.dodged) {
        // he tracks things thrown at him: a slip of the head, a lean back
        const facing = Math.sign(pr.thrower ? pr.thrower.x - f.x : -(q.x - q.px)) === f.facing;
        const ready = f.state === 'ground' ? 1 : f.state === 'block' ? 1 : f.state === 'move' ? 0.4 : 0;
        const chance = (facing ? f.skill * 0.7 : 0.12) * ready * (1 - f.fatigue * 0.6);
        pr.dodged = true;
        if (sim.rng.chance(chance)) {
          pr.passed = f;
          f.flinch = Math.max(f.flinch, 0.5);
          sim.emit({ t: 'whoosh', x: q.x, y: q.y, power: 0.4 });
          continue;
        }
      }
      if (f.state === 'block' && Math.sign(pr.thrower ? pr.thrower.x - f.x : 1) === f.facing) {
        sim.emit({ t: 'hit', kind: 'block', x: q.x, y: q.y, power: 0.3, a: pr.thrower, b: f });
      } else {
        const dmg = (pr.kind === 'brick' ? 9 : 6) * (hitHead ? 1.3 : 1);
        f.damage(dmg, pr.thrower, 'object');
        f.hitstun(0.35, Math.sign(q.x - q.px) * 120, 0, !hitHead);
        f.flash = 1;
        sim.emit({ t: 'hit', kind: 'punch', x: q.x, y: q.y, power: 0.6, a: pr.thrower, b: f, thrown: true });
      }
      if (pr.kind === 'bottle') sim.emit({ t: 'break', material: 'glass', x: q.x, y: q.y, power: 0.4, small: true });
      pr.dead = true;
      break;
    }
  }

  // -------------------------------------------------------- interactions
  strikeProps(a, hit, x0, y0, x1, y1, r) {
    const sim = this.sim;
    const dir = (hit.abs ? a.moveFacing : a.facing) * Math.sign(hit.kx || 1);
    for (const b of this.boxes) {
      const [cx, cy] = b.center();
      if (Math.abs(cx - x1) > b.w + 20 || Math.abs(cy - y1) > b.h + 20) continue;
      if (!pointInBox(b, x1, y1, r + 4)) continue;
      if (b.struckBy === a && b.struckMove === a.move) continue;
      b.struckBy = a;
      b.struckMove = a.move;
      const k = (Math.abs(hit.kx) * 1.4 + 120) * a.strength * sim.settings.physicsIntensity / Math.max(0.6, b.mass / 2.5);
      b.addVel(dir * k, -Math.min(260, k * 0.35), sim.h);
      b.lastThrower = a;
      b.throwT = sim.time;
      this.damageBox(b, hit.dmg * a.strength * (hit.kind === 'weapon' ? 3 : 1.6), a);
      sim.emit({ t: 'hit', kind: hit.kind, x: x1, y: y1, power: 0.6, prop: b.kind, material: b.k.material });
    }
  }

  dropWeapon(w, f, vx, vy) {
    const tip = f.weaponTip();
    const hx = tip ? tip[2] : f.x;
    const hy = tip ? tip[3] : f.y - 50;
    const tx = tip ? tip[0] : f.x + 30;
    const ty = tip ? tip[1] : f.y - 50;
    const s = new Stick(w.kind, (hx + tx) / 2, (hy + ty) / 2, Math.atan2(ty - hy, tx - hx), WEAPONS[w.kind].len, WEAPONS[w.kind].mass);
    s.weapon = w;
    for (const q of s.p) q.setVel(vx + this.sim.rng.range(-60, 60), vy, this.sim.h);
    s.lastOwner = f;
    this.sticks.push(s);
    return s;
  }

  breakHeldWeapon(f) {
    const w = f.weapon;
    if (!w) return;
    f.weapon = null;
    this.sim.emit({ t: 'break', material: w.material, x: f.rag.p[4].x, y: f.rag.p[4].y, power: 0.6, small: true, weaponBreak: true, f });
    if (w.material === 'wood') {
      const rng = this.sim.rng;
      for (let k = 0; k < 2; k++) {
        const s = new Stick('plank', f.rag.p[4].x, f.rag.p[4].y, rng.range(0, 3), w.len * 0.45, 0.3);
        s.weapon = null;
        s.debris = true;
        s.life = 5;
        for (const q of s.p) q.setVel(rng.range(-200, 200), rng.range(-260, -80), this.sim.h);
        this.sticks.push(s);
      }
    }
  }

  nearestWeapon(x, y, maxD) {
    let best = null;
    let bd = maxD * maxD;
    for (const s of this.sticks) {
      if (!s.weapon || s.held || s.flying > 0 || s.debris) continue;
      const mx = (s.p[0].x + s.p[1].x) / 2;
      const my = (s.p[0].y + s.p[1].y) / 2;
      const d = (mx - x) ** 2 + (my - y) ** 2 * 4;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  pickup(f) {
    const s = this.nearestWeapon(f.x, f.y - 6, 46 * f.scale);
    if (!s) return false;
    const i = this.sticks.indexOf(s);
    if (i >= 0) this.sticks.splice(i, 1);
    f.weapon = s.weapon;
    this.sim.emit({ t: 'pickup', f, weapon: s.weapon.kind, x: f.x, y: f.y - 40 });
    return true;
  }

  throwHeldWeapon(f, target) {
    const w = f.weapon;
    if (!w) return;
    f.weapon = null;
    const hx = f.rag.p[4].x;
    const hy = f.rag.p[4].y;
    const s = new Stick(w.kind, hx, hy, f.facing > 0 ? -0.4 : Math.PI + 0.4, WEAPONS[w.kind].len, WEAPONS[w.kind].mass);
    s.weapon = w;
    const [vx, vy] = aimBallistic(hx, hy, target ? target.x : hx + f.facing * 300, target ? target.y - 55 : hy, 720, this.sim.gravity);
    s.p[0].setVel(vx, vy - 60, this.sim.h);
    s.p[1].setVel(vx, vy + 60, this.sim.h);
    s.flying = 1.2;
    s.thrower = f;
    this.sticks.push(s);
    this.sim.emit({ t: 'whoosh', x: hx, y: hy, power: 1.2 });
  }

  throwObject(f, target) {
    const kind = this.sim.rng.chance(0.55) ? 'bottle' : 'brick';
    const hx = f.rag.p[6].x;
    const hy = f.rag.p[6].y;
    const tx = target ? target.x + target.vx * 0.35 : hx + f.facing * 300;
    const ty = target ? target.y - 60 : hy;
    const [vx, vy] = aimBallistic(hx, hy, tx, ty, 640 + this.sim.rng.range(-40, 80), this.sim.gravity);
    const pr = new Projectile(kind, hx, hy, vx + this.sim.rng.range(-30, 30), vy, this.sim.h, f);
    this.projectiles.push(pr);
    this.sim.emit({ t: 'whoosh', x: hx, y: hy, power: 0.7 });
  }

  // Radial impulse on every loose prop.
  blast(x, y, R, power, by) {
    const h = this.sim.h;
    for (const b of this.boxes.slice()) {
      const [cx, cy] = b.center();
      const d = Math.hypot(cx - x, cy - y);
      if (d > R) continue;
      const k = (1 - d / R) * power;
      const nx = (cx - x) / (d || 1);
      const ny = (cy - y) / (d || 1) - 0.5;
      b.addVel(nx * k * 900, ny * k * 900, h);
      b.lastThrower = by;
      this.damageBox(b, k * 120, by);
    }
    for (const s of this.sticks) {
      const mx = (s.p[0].x + s.p[1].x) / 2;
      const my = (s.p[0].y + s.p[1].y) / 2;
      const d = Math.hypot(mx - x, my - y);
      if (d > R) continue;
      const k = (1 - d / R) * power;
      for (const q of s.p) q.addVel(((mx - x) / (d || 1)) * k * 800, (((my - y) / (d || 1)) - 0.6) * k * 800, h);
      s.sleeping = false;
    }
  }
}

function pointInBox(b, x, y, r) {
  const p = b.p;
  for (let e = 0; e < 4; e++) {
    const a = p[e];
    const c = p[(e + 1) % 4];
    const ex = c.x - a.x;
    const ey = c.y - a.y;
    const l = Math.sqrt(ex * ex + ey * ey) || 1;
    const nx = ey / l;
    const ny = -ex / l;
    if ((x - a.x) * nx + (y - a.y) * ny > r) return false;
  }
  return true;
}

// Pushes particle q out of box A (point vs edge contact, PBD weighting).
// wq = particle inverse mass (0 = kinematic: only the box moves).
function pushOutOfBox(A, q, wq, isBox) {
  const p = A.p;
  let best = -1e9;
  let bn = 0;
  const r = isBox ? 1 : q.r;
  for (let e = 0; e < 4; e++) {
    const a = p[e];
    const c = p[(e + 1) % 4];
    const ex = c.x - a.x;
    const ey = c.y - a.y;
    const l = Math.sqrt(ex * ex + ey * ey) || 1;
    const d = ((q.x - a.x) * ey - (q.y - a.y) * ex) / l;
    if (d > r) return false;
    if (d > best) {
      best = d;
      bn = e;
    }
  }
  const a = p[bn];
  const c = p[(bn + 1) % 4];
  const ex = c.x - a.x;
  const ey = c.y - a.y;
  const l = Math.sqrt(ex * ex + ey * ey) || 1;
  const nx = ey / l;
  const ny = -ex / l;
  const pen = Math.min(r - best, 2.5);
  const t = clamp(((q.x - a.x) * ex + (q.y - a.y) * ey) / (l * l), 0, 1);
  const wsum = wq + a.w * (1 - t) * (1 - t) + c.w * t * t;
  if (wsum <= 0) return false;
  const lam = pen / wsum;
  // bodies resting against a box should not be shoved away violently
  const keep = isBox ? 0 : 0.7;
  q.x += nx * lam * wq;
  q.y += ny * lam * wq;
  q.px += nx * lam * wq * keep;
  q.py += ny * lam * wq * keep;
  a.x -= nx * lam * a.w * (1 - t);
  a.y -= ny * lam * a.w * (1 - t);
  c.x -= nx * lam * c.w * t;
  c.y -= ny * lam * c.w * t;
  A.sleeping = false;
  A.sleepT = 0;
  return true;
}

// Launch velocity to hit (tx,ty) from (x,y) at roughly the given speed.
export function aimBallistic(x, y, tx, ty, speed, g) {
  const dx = tx - x;
  const dy = ty - y;
  const T = clamp(Math.abs(dx) / speed, 0.18, 1.1);
  return [dx / T, dy / T - 0.5 * g * T];
}
