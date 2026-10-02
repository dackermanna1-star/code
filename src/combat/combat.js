// Combat resolution: swept strike tests against body capsules, block/parry,
// damage and knockback, grabs, and body-on-body chain reactions.

import { clamp, segSegDist2, segPointDist2 } from '../core/math.js';
import { HEAD, NECK, PELVIS, ELB_A, HAND_A, HAND_B, KNEE_A, FOOT_A, KNEE_B, FOOT_B } from '../fighter/skeleton.js';
import { WEAPON_TIP } from '../fighter/moves.js';

const near = [];
const PART_NAMES = { [HEAD]: 'head', [NECK]: 'body', [PELVIS]: 'body', [KNEE_A]: 'legs', [KNEE_B]: 'legs' };

function facingToward(a, b) {
  return Math.sign(b.x - a.x || 1) === a.facing;
}

function hostile(a, b) {
  if (a === b) return false;
  if (a.isHero) return !b.isHero;
  return true; // enemies can (accidentally) hit each other
}

// Returns the joint index that was struck, or -1.
function testHit(att, hit, tgt, sx0, sy0, sx1, sy1, r) {
  const p = tgt.rag.p;
  const d = tgt.dims;
  const ground = hit.height === 'ground';
  const low = hit.height === 'low';
  if (!low) {
    const rr = r + d.headR;
    if (segPointDist2(sx0, sy0, sx1, sy1, p[HEAD].x, p[HEAD].y) < rr * rr) return HEAD;
    const rt = r + d.lw * 0.95;
    if (segSegDist2(sx0, sy0, sx1, sy1, p[NECK].x, p[NECK].y, p[PELVIS].x, p[PELVIS].y) < rt * rt) return NECK;
  }
  if (low || hit.height === 'mid' || ground) {
    const rl = r + d.lw * 0.8;
    for (const [a, b, c] of [[PELVIS, KNEE_A, FOOT_A], [PELVIS, KNEE_B, FOOT_B]]) {
      if (low) {
        if (segSegDist2(sx0, sy0, sx1, sy1, p[b].x, p[b].y, p[c].x, p[c].y) < rl * rl) return b;
      } else if (segSegDist2(sx0, sy0, sx1, sy1, p[a].x, p[a].y, p[b].x, p[b].y) < rl * rl) return b;
    }
  }
  if (ground) {
    const rt = r + d.lw;
    if (segSegDist2(sx0, sy0, sx1, sy1, p[NECK].x, p[NECK].y, p[PELVIS].x, p[PELVIS].y) < rt * rt) return NECK;
    const rr = r + d.headR;
    if (segPointDist2(sx0, sy0, sx1, sy1, p[HEAD].x, p[HEAD].y) < rr * rr) return HEAD;
  }
  return -1;
}

export function processAttacks(sim) {
  const fighters = sim.fighters;
  for (let i = 0; i < fighters.length; i++) {
    const a = fighters[i];
    if (a.state !== 'move' || !a.move || a.frozen || a.removed) continue;
    const m = a.move;
    if (m.grab && a.mt >= m.grab[0] && a.mt <= m.grab[1] && !a.victim && !a.holdTarget) processGrab(sim, a);
    if (a.state !== 'move' || !a.move) continue;
    for (let h = 0; h < m.hits.length; h++) {
      const hit = m.hits[h];
      if (a.mt < hit.t0 || a.mt > hit.t1) continue;
      let sx0;
      let sy0;
      let sx1;
      let sy1;
      if (hit.joint === WEAPON_TIP) {
        const tip = a.weaponTip();
        if (!tip) continue;
        // sweep: previous tip -> current tip, plus the shaft itself
        sx1 = tip[0];
        sy1 = tip[1];
        sx0 = a.prevTip ? a.prevTip[0] : tip[2];
        sy0 = a.prevTip ? a.prevTip[1] : tip[3];
        a.prevTip = [sx1, sy1];
      } else {
        const p = a.rag.p[hit.joint];
        sx0 = p.ox;
        sy0 = p.oy;
        sx1 = p.x;
        sy1 = p.y;
      }
      const r = hit.r * a.scale;
      sim.fighterHash.query((sx0 + sx1) * 0.5, (sy0 + sy1) * 0.5, 90, near);
      for (let k = 0; k < near.length; k++) {
        const t = near[k];
        if (t === a || t.removed || a.hitSet.has(t.id)) continue;
        if (!hostile(a, t)) continue;
        if (t.dead) continue;
        const friendly = !a.isHero && !t.isHero;
        if (hit.ground) {
          // stomps are aimed: nobody stamps on a fallen ally by accident
          if (friendly || !(t.state === 'down' || t.state === 'ragdoll')) continue;
        } else if (t.ragdolled || t.state === 'grabbed') continue;
        if (t.iframe && t.state === 'move' && hit.height !== 'low') continue;
        if (t.invuln > 0) continue;
        if (hit.joint === WEAPON_TIP && !a.weapon) break;
        let part = testHit(a, hit, t, sx0, sy0, sx1, sy1, r);
        if (part < 0 && hit.joint === WEAPON_TIP) {
          const tip = a.weaponTip();
          if (tip) part = testHit(a, hit, t, tip[2], tip[3], tip[0], tip[1], r * 0.8);
        }
        if (part < 0) continue;
        a.hitSet.add(t.id);
        resolveHit(sim, a, t, hit, part, sx1, sy1);
        // an ally caught in the way absorbs the blow
        if (a.state !== 'move' || friendly) break;
      }
      // strikes also shove props around
      sim.props.strikeProps(a, hit, sx0, sy0, sx1, sy1, r);
    }
  }
}

export function resolveHit(sim, a, t, hit, part, hx, hy) {
  const S = sim.settings;
  const rv = S.physicsIntensity;
  const h = sim.h;
  const rng = sim.rng;
  const dirBase = hit.abs ? a.moveFacing : a.facing;
  const kdir = Math.sign(hit.kx) * dirBase || a.facing;
  const friendly = !a.isHero && !t.isHero;

  // --- parry (perfect timing turns the attack against the attacker)
  if (t.state === 'move' && t.move && t.move.parryWin && t.mt >= t.move.parryWin[0] && t.mt <= t.move.parryWin[1] && facingToward(t, a) && hit.height !== 'low' && !hit.tackle) {
    a.stumble(-kdir * 0.3 + (a.facing * 0.7), 0.55);
    a.vx = a.facing * 210;
    a.freeze = t.freeze = 5;
    t.stats.blocks++;
    sim.emit({ t: 'hit', kind: 'parry', x: hx, y: hy, power: 0.8, a, b: t });
    sim.emit({ t: 'parry', a: t, b: a, x: hx, y: hy });
    if (t.brain && t.brain.onParry) t.brain.onParry(a);
    return 'parry';
  }

  // --- the hero's guard: set in his stance and facing the attacker, he
  // catches many straight-on strikes on his arms (less so when tired)
  let guarded = false;
  if (t.isHero && t.grounded && facingToward(t, a) && hit.height !== 'low' && hit.height !== 'ground' && !hit.tackle && !friendly) {
    // in his stance, or already snapping back from his own strike
    let stance = 0;
    if (t.state === 'ground') stance = 1;
    else if (t.state === 'move' && t.move && t.move.type === 'strike' && t.move.hits.length && t.mt > t.move.hits[t.move.hits.length - 1].t1) stance = 0.6;
    if (stance > 0) {
      const chance = t.skill * 0.7 * stance * (1 - t.fatigue * 0.65) * (t.stamina > 10 ? 1 : 0.4) * (hit.kind === 'weapon' ? 0.5 : 1);
      guarded = rng.chance(chance);
    }
  }

  // --- block
  if ((guarded || t.state === 'block') && facingToward(t, a) && hit.height !== 'low' && hit.height !== 'ground' && !hit.tackle) {
    const chip = hit.dmg * a.strength * 0.1;
    t.damage(chip, a, 'beaten');
    t.stamina -= t.isHero ? hit.dmg * 1.1 + 2 : hit.dmg * 1.5 + 3;
    t.blockStun = 0.1 + hit.stun * 0.45;
    const mf = clamp(9.25 / t.mass, 0.55, 1.5);
    t.vx = kdir * Math.abs(hit.kx) * 0.38 * mf * rv;
    a.freeze = t.freeze = 3;
    t.stats.blocks++;
    a.moveHit = true;
    sim.emit({ t: 'hit', kind: 'block', x: hx, y: hy, power: hit.dmg / 10, a, b: t, weapon: hit.kind === 'weapon' });
    if (t.stamina < 0) {
      t.stamina = 0;
      t.stumble(kdir, 0.55);
      sim.emit({ t: 'guardbreak', a, b: t, x: hx, y: hy });
    }
    if (t.brain && t.brain.onBlocked) t.brain.onBlocked(a);
    return 'block';
  }

  // --- kicks at someone already on the floor: hurt, jolt, keep them down a little longer
  if (hit.ground && t.ragdolled) {
    const gd = hit.dmg * a.strength * rng.range(0.85, 1.1) * (friendly ? 0.6 : 1);
    t.damage(gd, a, 'beaten');
    t.rag.addVelAt(part, kdir * 260 * rv, -140, h, 0.4);
    if (t.state === 'down') t.downT = Math.min(t.downT + 0.18, 1.6);
    t.flash = 1;
    a.freeze = t.freeze = 2;
    a.moveHit = true;
    a.stats.hits++;
    sim.emit({ t: 'hit', kind: hit.kind, x: hx, y: hy, power: gd / 9, down: false, a, b: t, part: PART_NAMES[part] || 'body', friendly, ground: true });
    return 'ground';
  }

  // --- clean hit
  let dmg = hit.dmg * a.strength * rng.range(0.88, 1.12);
  if (hit.kind === 'weapon' && a.weapon) dmg *= a.weapon.dmg;
  if (a.isHero) dmg *= 1 + S.heroSkill * 0.08 - 0.08;
  if (friendly) dmg *= 0.65;
  if (t.state === 'held') dmg *= 1.15;
  if (t.staggered) dmg *= 1.2;
  if (part === HEAD) dmg *= 1.15;
  const mf = clamp(9.25 / t.mass, 0.5, 1.6);
  const sk = Math.sqrt(a.strength);
  let kvx = kdir * Math.abs(hit.kx) * sk * mf * rv * rng.range(0.9, 1.1);
  let kvy = hit.ky * mf * rv * (hit.ky < 0 ? sk : 1);
  if (hit.kind === 'weapon' && a.weapon) kvx *= 0.85 + a.weapon.dmg * 0.15;
  t.poise -= hit.poise * a.strength * (a.isHero ? 1.15 : 1);
  t.damage(dmg, a, 'beaten');
  t.stats.taken++;
  a.stats.hits++;
  a.moveHit = true;

  const brute = t.mass > 13;
  let down = t.dead || t.poise <= 0 || !t.grounded || hit.tackle || (hit.launch && t.mass < 14);
  if (hit.sweep) down = !brute || rng.chance(0.45);
  if (!down && Math.abs(kvx) > 380 && !brute) down = rng.chance(0.75);
  if (t.state === 'held') down = false;
  if (t.isHero && !t.dead && down && !hit.sweep && !hit.tackle && t.poise > -12 && rng.chance(0.3 * S.heroSkill)) {
    // elite balance: absorb and stay up
    down = false;
  }

  if (down) {
    t.poise = t.maxPoise * 0.65;
    const spin = hit.sweep ? -kdir * 10 : hit.launch ? -kdir * 3 : 0;
    t.knockdown(kvx, kvy, { joint: part, jx: kvx * 0.5, jy: kvy * 0.25 - 40, spin });
    t.knock = { by: a, chainId: sim.newChain(a), depth: 0, time: sim.time, kind: hit.kind };
  } else {
    t.hitstun(hit.stun * (1.25 - t.toughness * 0.25) * (t.isHero ? 0.75 : 1), kvx * 0.45, kvy * 0.25, part !== HEAD && hit.height !== 'high');
    t.rag.addVelAt(part, kvx * 0.9, kvy * 0.4 - 50, h, 0.45);
  }
  t.flash = 1;
  const stop = Math.round(clamp(dmg * 0.32, 2, 6));
  a.freeze = stop;
  t.freeze = stop;
  if (a.isHero && (down || dmg > 11)) sim.hitstop(down ? 4 : 2);
  if (hit.kind === 'weapon' && a.weapon) {
    a.weapon.durability -= 1;
    if (a.weapon.durability <= 0) sim.props.breakHeldWeapon(a);
  }
  if (hit.tackle && down) {
    // the tackler goes down with the target
    a.knockdown(a.facing * 160, -80);
  }
  sim.emit({ t: 'hit', kind: hit.kind, x: hx, y: hy, power: dmg / 9, down, a, b: t, part: PART_NAMES[part] || 'body', friendly, move: a.move ? a.move.id : null, weapon: a.weapon ? a.weapon.kind : null });
  if (t.brain && t.brain.onHit) t.brain.onHit(a, dmg, down);
  if (a.brain && a.brain.onLanded) a.brain.onLanded(t, dmg, down);
  return down ? 'down' : 'hit';
}

function processGrab(sim, a) {
  const s = a.scale;
  const ha = a.rag.p[HAND_A];
  const hb = a.rag.p[HAND_B];
  const hx = (ha.x + hb.x) * 0.5;
  const hy = (ha.y + hb.y) * 0.5;
  sim.fighterHash.query(hx, hy, 50 * s, near);
  let best = null;
  let bd = 1e9;
  for (const t of near) {
    if (t === a || t.removed || t.dead || !hostile(a, t)) continue;
    if (!a.isHero && !t.isHero) continue;
    if (t.ragdolled || t.state === 'grabbed' || t.state === 'held' || t.grabbedBy) continue;
    if (t.iframe) continue;
    if (!t.grounded) continue;
    const dx = t.rag.p[NECK].x - hx;
    const dy = t.rag.p[NECK].y - hy;
    const d = Math.abs(dx) + Math.abs(dy) * 0.5;
    const reach = 30 * s + t.dims.lw;
    if (d < reach && d < bd && Math.sign(t.x - a.x || 1) === a.facing) {
      bd = d;
      best = t;
    }
  }
  if (!best) return;
  const t = best;
  if (a.isHero) {
    const plan = (a.brain && a.brain.throwPlan) || 'hipthrow';
    a.attachVictim(t, plan);
  } else if (a.move.id === 'bearhug') {
    // the hero may slip out if he sees it coming
    const behind = t.facing === a.facing;
    const slip = t.isHero && !behind && sim.rng.chance(0.35 + t.skill * 0.3);
    if (slip) {
      a.stumble(a.facing, 0.4);
      sim.emit({ t: 'feed', text: `Onyx slips ${a.name}'s grab`, level: 1 });
      return;
    }
    a.beginHold(t);
  }
}

// Flying ragdolls slam into standing fighters and pass momentum on.
export function processBodyImpacts(sim) {
  const pairT = sim.pairT;
  const h = sim.h;
  const now = sim.time;
  const fighters = sim.fighters;
  for (let i = 0; i < fighters.length; i++) {
    const f = fighters[i];
    if (f.removed || !(f.ragdolled || f.state === 'grabbed') || f.rag.sleeping) continue;
    const pel = f.rag.p[PELVIS];
    let vx = (pel.x - pel.px) / h;
    let vy = (pel.y - pel.py) / h;
    const sp = Math.sqrt(vx * vx + vy * vy);
    if (sp < 280) continue;
    sim.fighterHash.query(pel.x, pel.y, 70, near);
    for (let k = 0; k < near.length; k++) {
      // each body it ploughs into in the same step takes momentum out of it
      if (vx * vx + vy * vy < 280 * 280) break;
      const t = near[k];
      if (t === f || t.removed || t.dead || t.ragdolled || t.state === 'grabbed') continue;
      if (f.grabbedBy === t || t.victim === f) continue;
      if (f.thrownBy === t && now - f.knockT < 0.6) continue;
      if (f.knock && f.knock.by === t && now - f.knock.time < 0.6) continue;
      if (t.passT > 0) continue;
      const key = f.id * 100000 + t.id;
      const last = pairT.get(key);
      if (last !== undefined && now - last < 0.6) continue;
      // contact test: any core particle inside t's vertical capsule
      const ts = t.scale;
      const top = t.y - 88 * ts;
      const bot = t.y - 6;
      let hit = false;
      for (const j of [HEAD, NECK, PELVIS, KNEE_A, KNEE_B]) {
        const p = f.rag.p[j];
        const cy = clamp(p.y, top, bot);
        const dx = p.x - t.x;
        const dy = p.y - cy;
        const rr = p.r + 11 * ts;
        if (dx * dx + dy * dy < rr * rr) {
          hit = true;
          break;
        }
      }
      if (!hit) continue;
      const dirx = Math.sign(t.x - pel.x) || Math.sign(vx) || 1;
      const rel = (vx - t.vx) * dirx;
      if (rel < 190 && Math.abs(vy) < 500) continue;
      if (t.isHero) {
        // he controls where his own victims fly; only hard, foreign impacts count
        const src = f.knock ? f.knock.by : f.thrownBy;
        if (src === t || rel < 260) continue;
      }
      pairT.set(key, now);
      const impact = Math.sqrt(rel * rel + vy * vy * 0.3);
      const mf = f.mass;
      const mt = t.mass;
      // a planted fighter is effectively heavier: his feet bleed momentum
      // into the floor, so chains lose energy at every link. A freshly
      // launched body is the exception: it ploughs on through the next man.
      const depth = f.knock ? f.knock.depth : 0;
      const fresh = depth === 0;
      const mtEff = mt * (!t.grounded ? 1 : fresh ? 1.15 : 1.6);
      const share = mf / (mf + mtEff);
      const tvx = dirx * Math.max(rel, 0) * share * 1.12 * sim.settings.physicsIntensity;
      let dmg = Math.max(0, impact - 160) * 0.014 * (mf / 9.25);
      let thresh = 300 * Math.sqrt(t.toughness * (mt / 9.25)) * (t.state === 'block' ? 1.4 : 1) * (1 + depth * 0.5);
      if (t.isHero) {
        // a trained fighter braces and rides the impact
        thresh *= t.state === 'block' ? 3.2 : 2.3;
        dmg *= 0.45;
      } else {
        // already reeling or worn down: easier to bowl over
        if (t.state === 'hitstun') thresh *= 0.8;
        if (t.poise < t.maxPoise * 0.3) thresh *= 0.82;
      }
      const by = f.knock ? f.knock.by : f.thrownBy || null;
      if (dmg > 0) t.damage(dmg, by, 'body');
      const ratio = impact / thresh;
      if (ratio > 1) {
        t.knockdown(tvx, -Math.min(260, impact * 0.25), { joint: PELVIS, jx: tvx * 0.3, jy: -60 });
        t.knock = { by, chainId: f.knock ? f.knock.chainId : sim.newChain(by), depth: depth + 1, time: now, kind: 'body', via: f };
        sim.onChain(t.knock, t, f);
      } else if (ratio > 0.5 || t.isHero) {
        t.hitstun(0.16 + ratio * 0.2, tvx * 0.7, 0, true);
        t.rag.addVelAt(PELVIS, tvx, -40, h, 0.5);
      } else {
        // a glancing bump: shoved aside, no stagger
        t.vx += tvx * 0.6;
      }
      t.flash = Math.max(t.flash, 0.6);
      // the flying body loses momentum (slightly inelastic exchange)
      const keep = clamp((mf - 0.12 * mtEff) / (mf + mtEff) + (fresh ? 0.22 : 0), 0.1, 0.9);
      for (const p of f.rag.p) {
        p.px = p.x - (p.x - p.px) * keep;
        p.py = p.y - (p.y - p.py) * (0.6 + keep * 0.4);
      }
      vx = (pel.x - pel.px) / h;
      vy = (pel.y - pel.py) / h;
      sim.emit({ t: 'thud', x: (pel.x + t.x) / 2, y: t.y - 50, power: impact / 500, body: true });
      if (by === t) continue;
      if (t.brain && t.brain.onHit) t.brain.onHit(by, dmg, true);
    }
  }
  if (pairT.size > 4000) {
    for (const [k, v] of pairT) if (now - v > 2) pairT.delete(k);
  }
}

// Fast-moving fighters can trip over bodies lying on the floor.
export function processTrips(sim) {
  const tripT = sim.tripT;
  const now = sim.time;
  for (const t of sim.fighters) {
    if (t.removed || t.dead || t.state !== 'ground' || !t.grounded) continue;
    const sp = Math.abs(t.vx);
    if (sp < 200 || now < (t.tripSafeT || 0)) continue;
    sim.bodyHash.query(t.x + Math.sign(t.vx) * 14, t.y - 8, 18, near);
    for (const b of near) {
      if (b === t || b.removed) continue;
      if (!(b.state === 'down' || b.state === 'ko')) continue;
      const key = t.id * 100000 + b.id;
      if (tripT.has(key) && now - tripT.get(key) < 4) continue;
      tripT.set(key, now);
      // is the body actually under the feet?
      let under = false;
      for (const p of b.rag.p) {
        if (Math.abs(p.x - t.x) < 16 * t.scale && t.y - p.y < 22 && t.y - p.y > -8) {
          under = true;
          break;
        }
      }
      if (!under) continue;
      const care = t.isHero ? 0.97 : t.intelligence * 0.55 + t.agility * 0.25;
      const pTrip = clamp(0.38 - care * 0.42, 0.02, 0.36) * clamp((sp - 180) / 200, 0.2, 1);
      // having stepped over one body he watches his feet for a moment
      t.tripSafeT = now + 1.1;
      if (sim.rng.chance(pTrip)) {
        // a trip sends you down more than forward
        t.knockdown(t.vx * 0.55, -130, { spin: t.facing * 5.5 });
        t.knock = { by: b.knock ? b.knock.by : null, chainId: b.knock ? b.knock.chainId : 0, depth: 2, time: now, kind: 'trip' };
        sim.emit({ t: 'trip', a: t, b, x: t.x, y: t.y });
      } else {
        t.hopT = 0.2; // brief lifted step over the body
      }
      break;
    }
  }
  if (tripT.size > 4000) for (const [k, v] of tripT) if (now - v > 6) tripT.delete(k);
}
