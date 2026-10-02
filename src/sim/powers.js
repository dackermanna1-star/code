// The viewer's powers: grab and fling bodies, shoot, call down lightning,
// throw grenades, blast a shockwave, drop in new enemies. Everything acts
// through the same physics and damage as the fight itself, so a body you
// throw bowls people over and a grenade you lob sends the hero running.

import { clamp, segPointDist2 } from '../core/math.js';
import { HEAD, NECK, PELVIS, ELB_A, HAND_A, ELB_B, HAND_B, KNEE_A, FOOT_A, KNEE_B, FOOT_B, NJ } from '../fighter/skeleton.js';
import { Box } from '../world/props.js';

const BONES = [
  [NECK, PELVIS], [NECK, ELB_A], [ELB_A, HAND_A], [NECK, ELB_B], [ELB_B, HAND_B],
  [PELVIS, KNEE_A], [KNEE_A, FOOT_A], [PELVIS, KNEE_B], [KNEE_B, FOOT_B],
];
const near = [];

export class Powers {
  constructor(sim) {
    this.sim = sim;
    this.drag = null; // { f, idx, x, y }
    this.kills = 0;
  }

  // The hero is off limits unless the viewer says otherwise.
  spared(f) {
    return f.isHero && !this.sim.settings.powersHurtHero;
  }

  playerKnock(f, kind) {
    const sim = this.sim;
    f.knock = { by: null, chainId: sim.newChain(null), depth: 0, time: sim.time, kind, player: true };
    f.playerT = sim.time;
  }

  // ------------------------------------------------------------ picking
  // Closest fighter body part to (x, y): bones as capsules, head as a disc.
  // With opts.reach, a near miss still catches the closest joint within
  // that distance (grabbing a moving stickman should not take a sniper).
  pick(x, y, slack, opts = {}) {
    const sim = this.sim;
    let best = null;
    let bd = Infinity;
    let close = null;
    let cd = opts.reach || 0;
    for (const f of sim.fighters) {
      if (f.removed || f.fading) continue;
      if (opts.alive && f.dead) continue;
      if (this.spared(f)) continue;
      const p = f.rag.p;
      const pel = p[PELVIS];
      if (Math.abs(pel.x - x) > 160 || Math.abs(pel.y - y) > 200) continue;
      const lw = f.dims.lw * 0.5 + slack;
      const hr = f.dims.headR + slack;
      const dh = Math.hypot(p[HEAD].x - x, p[HEAD].y - y) - hr;
      if (dh < 0 && dh < bd) {
        bd = dh;
        best = { f, idx: HEAD, head: true };
      }
      for (const [a, b] of BONES) {
        const d = Math.sqrt(segPointDist2(p[a].x, p[a].y, p[b].x, p[b].y, x, y)) - lw;
        if (d < 0 && d < bd) {
          bd = d;
          // the nearer end of the bone is the part that gets hold of
          const da = Math.hypot(p[a].x - x, p[a].y - y);
          const db = Math.hypot(p[b].x - x, p[b].y - y);
          best = { f, idx: da < db ? a : b, head: false, bone: [a, b] };
        }
      }
      if (!best && cd > 0) {
        for (let i = 0; i < NJ; i++) {
          const d = Math.hypot(p[i].x - x, p[i].y - y);
          if (d < cd) {
            cd = d;
            close = { f, idx: i, head: i === HEAD };
          }
        }
      }
    }
    return best || close;
  }

  // ------------------------------------------------------------- grab
  grab(x, y, slack, reach = 0) {
    const hit = this.pick(x, y, slack, { reach });
    if (!hit) return null;
    const f = hit.f;
    const sim = this.sim;
    f.baked = false;
    f.fading = 0;
    if (!f.ragdolled) f.knockdown(0, -40);
    f.rag.sleeping = false;
    f.rag.sleepT = 0;
    f.playerHeld = true;
    f.restT = 0;
    if (f.state === 'down') f.setState('ragdoll');
    this.playerKnock(f, 'player');
    this.drag = { f, idx: hit.idx, x, y };
    sim.emit({ t: 'pgrab', f, x, y });
    return f;
  }

  moveDrag(x, y) {
    if (!this.drag) return;
    this.drag.x = x;
    this.drag.y = y;
  }

  release() {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const f = d.f;
    f.playerHeld = false;
    f.restT = 0;
    f.playerT = this.sim.time;
    if (f.knock) f.knock.time = this.sim.time; // a fresh missile for chain reactions
    const p = f.rag.p[d.idx];
    const sp = Math.hypot(p.x - p.px, p.y - p.py) / this.sim.h;
    this.sim.emit({ t: 'pthrow', f, x: p.x, y: p.y, power: sp / 900 });
  }

  // Each physics substep: the grabbed part chases the cursor (with a cap so
  // the solver never explodes); the rest of the body hangs off it.
  applyDrag() {
    const d = this.drag;
    if (!d) return;
    const f = d.f;
    if (f.removed) {
      this.drag = null;
      return;
    }
    const p = f.rag.p[d.idx];
    let dx = (d.x - p.x) * 0.45;
    let dy = (d.y - p.y) * 0.45;
    const l = Math.hypot(dx, dy);
    const cap = 22;
    if (l > cap) {
      dx *= cap / l;
      dy *= cap / l;
    }
    p.x += dx;
    p.y += dy;
    f.rag.sleeping = false;
    f.playerT = this.sim.time;
  }

  // -------------------------------------------------------------- gun
  // A hitscan shot at (x, y), fired from (ox, oy) off screen: hits whatever
  // is under the cursor. Bodies take the round, glass shatters, canisters
  // go up, crates jump, walls take a bullet hole.
  shoot(ox, oy, x, y, slack) {
    const sim = this.sim;
    const h = sim.h;
    let dx = x - ox;
    let dy = y - oy;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const rv = sim.settings.physicsIntensity;
    const hit = this.pick(x, y, slack);
    const ev = { t: 'shot', ox, oy, x, y, dx, dy, kind: 'air' };
    if (hit) {
      const f = hit.f;
      const part = hit.idx;
      const head = part === HEAD;
      const legs = part === KNEE_A || part === KNEE_B || part === FOOT_A || part === FOOT_B;
      const dmg = (head ? 80 : legs ? 18 : 32) * sim.rng.range(0.9, 1.1);
      f.baked = false;
      f.rag.sleeping = false;
      f.headshot = head;
      f.playerT = sim.time;
      const wasDead = f.dead;
      if (!wasDead) {
        this.playerKnock(f, 'shot');
        if (legs && f.hp > dmg && !f.ragdolled) {
          // a round to the leg: the knee goes, he stays up for now
          f.damage(dmg, null, 'shot');
          f.hitstun(0.55, dx * 160, 0, true, 'leg', true);
        } else {
          f.pendingDeath = false;
          f.damage(dmg, null, 'shot');
          if (!f.ragdolled) f.knockdown(dx * 260 * rv, (dy * 260 - 140) * rv, { joint: part, jx: dx * 650 * rv, jy: dy * 650 * rv });
          else f.rag.addVelAt(part, dx * 700 * rv, dy * 700 * rv, h, 0.4);
        }
      } else f.rag.addVelAt(part, dx * 600 * rv, dy * 600 * rv, h, 0.4);
      f.flash = 1;
      const pp = f.rag.p[part];
      ev.kind = 'flesh';
      ev.f = f;
      ev.head = head;
      ev.x = pp.x;
      ev.y = pp.y;
      ev.kill = !wasDead && f.dead;
      sim.emit(ev);
      return ev;
    }
    // props under the cursor
    for (const b of sim.props.boxes) {
      const [cx, cy] = b.center();
      if (Math.abs(cx - x) > b.w / 2 + 3 || Math.abs(cy - y) > b.h / 2 + 3) continue;
      b.addVel(dx * 260, dy * 260 - 60, h);
      b.playerT = sim.time;
      if (b.k.explosive) {
        b.player = true;
        b.lastThrower = null;
      }
      sim.props.damageBox(b, b.k.explosive ? 999 : 30, null);
      if (b.k.explosive && b.fuse > 0.15) b.fuse = 0.12; // a round in a gas tank
      ev.kind = 'metal';
      sim.emit(ev);
      return ev;
    }
    // glass
    const L = sim.level;
    const s = L.isSolidAt(x, y);
    if (s && s.breakable && !s.broken) {
      sim.breakSolid(s, x, y, 900);
      ev.kind = 'glass';
      sim.emit(ev);
      return ev;
    }
    if (s) ev.kind = 'solid';
    else if (!L.outdoor && x > 0 && x < L.width && y < 0 && y > L.bounds.top + 30) ev.kind = 'wall';
    sim.emit(ev);
    return ev;
  }

  // -------------------------------------------------------- lightning
  // A bolt from the ceiling (or the sky) to (x, y). Everyone near the strike
  // is electrocuted; the current jumps on to the next people along.
  lightning(x, y) {
    const sim = this.sim;
    const L = sim.level;
    // snap onto a body under the cursor, else to the ground below it
    let tx = x;
    let ty = y;
    const hit = this.pick(x, y, 18, { alive: true });
    if (hit) {
      tx = hit.f.rag.p[HEAD].x;
      ty = hit.f.rag.p[HEAD].y;
    } else {
      const g = L.groundUnder(x - 2, x + 2, y - 4, 420, true, false);
      if (g) ty = g.y;
    }
    const up = L.raycast(tx, ty - 24, tx, L.bounds.top - 600);
    const ox = up ? up.x : tx + sim.rng.range(-80, 80);
    const oy = up ? up.y : L.bounds.top - 400;
    const zapped = new Set();
    const chain = [];
    const zap = (f, dur, dmg) => {
      zapped.add(f);
      f.baked = false;
      if (this.spared(f)) return;
      if (!f.dead) {
        this.playerKnock(f, 'lightning');
        f.zapCause = 'lightning';
        f.zapT = 0;
        f.electrocute(dur, dmg);
      } else {
        f.rag.sleeping = false;
        f.playerT = sim.time;
        f.rag.addVel(sim.rng.range(-60, 60), -220, sim.h);
      }
    };
    sim.fighterHash.query(tx, ty, 80, near);
    const first = [];
    for (const f of near) {
      if (f.removed || this.spared(f)) continue;
      for (let i = 0; i < NJ; i++) {
        const p = f.rag.p[i];
        if (Math.hypot(p.x - tx, p.y - ty) < 62) {
          first.push(f);
          break;
        }
      }
    }
    for (const f of first) zap(f, 1.1, 85);
    // the current jumps on, up to a handful of links
    let frontier = first.slice();
    let links = 0;
    while (frontier.length && links < 5) {
      const next = [];
      for (const a of frontier) {
        if (links >= 5) break;
        sim.fighterHash.query(a.rag.p[NECK].x, a.rag.p[NECK].y, 190, near);
        let best = null;
        let bd = 190;
        for (const b of near) {
          if (zapped.has(b) || b.removed || b.dead || this.spared(b)) continue;
          const d = Math.hypot(b.rag.p[NECK].x - a.rag.p[NECK].x, b.rag.p[NECK].y - a.rag.p[NECK].y);
          if (d < bd) {
            bd = d;
            best = b;
          }
        }
        if (!best) continue;
        chain.push([a.rag.p[NECK].x, a.rag.p[NECK].y, best.rag.p[NECK].x, best.rag.p[NECK].y]);
        zap(best, 0.8, 45);
        next.push(best);
        links++;
      }
      frontier = next;
    }
    // wet floors carry it to everyone standing nearby
    if (L.condition === 'wet') {
      sim.fighterHash.query(tx, ty, 240, near);
      for (const f of near) {
        if (zapped.has(f) || f.removed || f.dead || !f.grounded || Math.abs(f.y - ty) > 14 || this.spared(f)) continue;
        chain.push([tx, ty, f.x, f.y - 10]);
        zap(f, 0.5, 26);
      }
    }
    // canisters and glass in the strike take it too
    for (const b of sim.props.boxes) {
      const [cx, cy] = b.center();
      if (!b.k.explosive || Math.hypot(cx - tx, cy - ty) >= 90) continue;
      b.player = true;
      b.lastThrower = null;
      sim.props.damageBox(b, 999, null);
    }
    const s = L.isSolidAt(tx, ty + 2);
    if (s && s.breakable && !s.broken) sim.breakSolid(s, tx, ty, 900);
    sim.emit({ t: 'lightning', x: tx, y: ty, ox, oy, chain, n: zapped.size });
    return zapped.size;
  }

  // ---------------------------------------------------------- grenade
  grenade(x, y, vx, vy) {
    const sim = this.sim;
    const b = new Box('grenade', x, y);
    const h = sim.h;
    const spin = clamp(vx * 0.02, -9, 9);
    const [cx, cy] = [x, y];
    for (const q of b.p) q.setVel(vx - (q.y - cy) * spin, vy + (q.x - cx) * spin, h);
    b.fuse = 2.1;
    b.fuseT = sim.time;
    b.player = true;
    sim.props.boxes.push(b);
    sim.emit({ t: 'grenade', x, y, box: b });
    return b;
  }

  // -------------------------------------------------------- shockwave
  push(x, y) {
    const sim = this.sim;
    const R = 300;
    const h = sim.h;
    const rv = sim.settings.physicsIntensity;
    let n = 0;
    for (const f of sim.fighters) {
      if (f.removed || this.spared(f)) continue;
      const cx = f.ragdolled ? f.rag.p[PELVIS].x : f.x;
      const cy = f.ragdolled ? f.rag.p[PELVIS].y : f.y - 45;
      const d = Math.hypot(cx - x, cy - y);
      if (d > R) continue;
      const k = 1 - d / R;
      const nx = (cx - x) / (d || 1);
      const ny = (cy - y) / (d || 1) - 0.45;
      const v = 1250 * k * rv;
      f.baked = false;
      if (!f.dead) {
        n++;
        this.playerKnock(f, 'push');
        if (!f.ragdolled) f.knockdown(nx * v, ny * v, { spin: sim.rng.sign() * 7 * k });
        else f.rag.addVel(nx * v, ny * v, h);
        f.damage(8 * k, null, 'push');
      } else {
        f.playerT = sim.time;
        f.rag.addVel(nx * v, ny * v, h);
      }
    }
    sim.props.blast(x, y, R, 0.9, null);
    for (const w of sim.level.windows) {
      if (w.broken) continue;
      if (Math.hypot(w.x + w.w / 2 - x, w.y + w.h / 2 - y) < R * 0.55) sim.breakSolid(w, w.x + w.w / 2, w.y + w.h / 2, 900);
    }
    sim.emit({ t: 'push', x, y, R, n });
    return n;
  }

  // ------------------------------------------------------------ spawn
  spawn(x, y) {
    const sim = this.sim;
    const f = sim.director.spawnOne({ type: 'drop', x, y });
    if (f) {
      f.playerT = sim.time; // dropped on Onyx's head, it does not count
      sim.emit({ t: 'pspawn', x, y, f });
    }
    return f;
  }
}
