/* ==========================================================================
   SPLEEN: SEPSIS — combat.js
   Shared simulation state + projectiles, damage, status effects, hazards,
   telegraphs, explosions, particles and pickups.
   ========================================================================== */
"use strict";

const SIM = {
  room: null, floor: null, run: null, player: null,
  enemies: [], pshots: [], eshots: [], zones: [], teles: [], beams: [], lobs: [], pickups: [], particles: [], rings: [],
  companions: [], interact: [], arcs: [],
  time: 0, roomTime: 0, hitstop: 0, slowmo: 0, uid: 1,
  opts: { dmgNumbers: true, shake: 1, flashes: true },
};
const nextId = () => SIM.uid++;
/* sim-time scheduler (respects pause, slow-mo, hitstop; dropped on room change) */
SIM.timers = [];
function after(sec, fn) { SIM.timers.push({ t: sec, fn, room: SIM.room }); }
function updateTimers(dt) {
  for (let i = SIM.timers.length - 1; i >= 0; i--) {
    const T = SIM.timers[i]; T.t -= dt;
    if (T.room !== SIM.room) { SIM.timers.splice(i, 1); continue; }
    if (T.t <= 0) { SIM.timers.splice(i, 1); T.fn(); }
  }
}

/* ---------------- projectile styles ---------------- */
const SHOT_STYLES = {
  neut: { hex: '#c8faff', sx: 2.4, sy: 0.9 },
  spray: { hex: '#ffe2bf', sx: 1.5, sy: 0.85 },
  lance: { hex: '#d8ffe8', sx: 4.2, sy: 0.5 },
  lanceS: { hex: '#b8f0cc', sx: 2.2, sy: 0.6 },
  anti: { hex: '#c9bcff', sx: 1.6, sy: 0.8 },
  big: { hex: '#ffe58a', sx: 1.4, sy: 1.0 },
  phage: { hex: '#e0a8ff', sx: 1.4, sy: 0.8 },
  helper: { hex: '#c8ffd0', sx: 1.7, sy: 0.75 },
  frag: { hex: '#ffd0f0', sx: 1.4, sy: 0.8 },
  turn: { hex: '#ff7ad8', sx: 1.8, sy: 0.8 },   // turncoat (enemy) streak
};
const ESHOT_STYLES = {
  pink: '#ff3d7f', acid: '#d6ff3a', volt: '#fff27a', spore: '#9affc8', orange: '#ff8a2a', violet: '#d07aff', red: '#ff3b2f',
};

/* ==========================================================================
   PLAYER PROJECTILES
   ========================================================================== */
function spawnPShot(x, y, ang, o) {
  const spd = o.speed || 12;
  const s = {
    id: nextId(), x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, spd,
    r: o.r || 0.16, dmg: o.dmg || 1, life: o.life || 0.6, t: 0,
    pierce: o.pierce || 0, bounce: o.bounce || 0, homing: o.homing || 0,
    style: o.style || 'neut', crit: !!o.crit, knock: o.knock != null ? o.knock : 1,
    hit: null, owner: o.owner || 'player', flags: o.flags || {}, h: o.h || 0.62,
    spectral: !!o.spectral, latch: !!o.latch, decel: o.decel || 0, grow: o.grow || 0,
  };
  SIM.pshots.push(s);
  return s;
}

function updatePShots(dt) {
  const room = SIM.room;
  for (let i = SIM.pshots.length - 1; i >= 0; i--) {
    const s = SIM.pshots[i];
    s.t += dt;
    if (s.t >= s.life || s.dead) { if (!s.dead) shotFizzle(s); SIM.pshots.splice(i, 1); continue; }
    // homing: steer toward nearest valid enemy in front
    if (s.homing > 0) {
      const tgt = nearestEnemy(s.x, s.y, 7, s.hit);
      if (tgt) {
        const want = angleTo(s.x, s.y, tgt.x, tgt.y), cur = Math.atan2(s.vy, s.vx);
        const turn = clamp(angDiff(cur, want), -1, 1) * s.homing * 9 * dt;
        const a = cur + turn, sp = Math.hypot(s.vx, s.vy);
        s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp;
      }
    }
    if (s.decel) { const k = Math.max(0, 1 - s.decel * dt); s.vx *= k; s.vy *= k; }
    if (s.grow) s.r += s.grow * dt;
    applyFlow(s, dt, 0.5);
    const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt;
    // walls / obstacles
    const mask = s.spectral ? MASK_SHOT_SPECTRAL : MASK_SHOT;
    const tx = Math.floor(nx), ty = Math.floor(ny);
    if (World.blocked(room, tx, ty, mask)) {
      const t = World.tile(room, tx, ty);
      if (t === T_CLOT) damageClot(tx, ty, s.dmg);
      if (s.bounce > 0) {
        s.bounce--;
        const bx = World.blocked(room, Math.floor(nx), Math.floor(s.y), mask);
        const by = World.blocked(room, Math.floor(s.x), Math.floor(ny), mask);
        if (bx || !by) s.vx = -s.vx; if (by || !bx) s.vy = -s.vy;
        if (SIM.player.st.bounceDmg) s.dmg *= 1 + SIM.player.st.bounceDmg;
        if (s.hit) s.hit.clear();
        burst(s.x, s.y, SHOT_STYLES[s.style].hex, 3, 2, { life: 0.2, size: 0.05 });
        continue;
      }
      if (s.flags.splitWall && !s.split) splitShot(s, Math.atan2(s.vy, s.vx) + Math.PI, 2, 0.5, 0.9);
      if (s.flags.blast) shotBlast(s);
      shotFizzle(s, true);
      SIM.pshots.splice(i, 1);
      continue;
    }
    s.x = nx; s.y = ny;
    // enemies
    for (const e of SIM.enemies) {
      if (e.dead || e.spawning > 0 || e.untargetable) continue;
      if (s.hit && s.hit.has(e.id)) continue;
      const rr = e.r + s.r;
      if (dist2(s.x, s.y, e.x, e.y) > rr * rr) continue;
      // frontal armour (waxback, bosses with shells)
      if (e.shieldArc && !e.shieldBroken) {
        const incoming = Math.atan2(-s.vy, -s.vx);
        if (Math.abs(angDiff(e.facing, incoming)) < e.shieldArc) {
          sfx('hit_armor', { rate: rnd(0.9, 1.1) });
          burst(s.x, s.y, '#ffffff', 4, 3, { life: 0.18, size: 0.05 });
          // deflect
          s.dead = true; break;
        }
      }
      shotHitEnemy(s, e);
      if (!s.hit) s.hit = new Set();
      s.hit.add(e.id);
      if (s.pierce > 0) { s.pierce--; continue; }
      s.dead = true; break;
    }
    if (s.dead) { SIM.pshots.splice(i, 1); }
  }
}
function shotFizzle(s, wall) {
  const hex = SHOT_STYLES[s.style] ? SHOT_STYLES[s.style].hex : '#ffffff';
  burst(s.x, s.y, hex, wall ? 4 : 2, wall ? 2.4 : 1.2, { life: 0.22, size: 0.05, h: s.h });
  if (wall && Math.random() < 0.3) sfx('shot_wall', { vol: 0.5, rate: rnd(0.9, 1.2) });
}
function splitShot(s, baseAng, n, dmgK, spread) {
  for (let k = 0; k < n; k++) {
    const a = baseAng + (n === 1 ? 0 : (k / (n - 1) - 0.5) * spread);
    const c = spawnPShot(s.x + Math.cos(a) * 0.1, s.y + Math.sin(a) * 0.1, a, { speed: s.spd * 0.85, r: s.r * 0.7, dmg: s.dmg * dmgK, life: 0.35, style: 'frag', knock: 0.4, owner: s.owner });
    c.split = true;
  }
}
function shotBlast(s) {
  const P = SIM.player, rad = s.flags.blast * (P.st.blastRadiusMult || 1);
  explode(s.x, s.y, rad, s.dmg * 0.6, { byPlayer: true, hex: SHOT_STYLES[s.style].hex, small: true, noSelf: true });
}

function shotHitEnemy(s, e) {
  const P = SIM.player, st = P.st;
  let dmg = s.dmg;
  const isPlayer = s.owner === 'player';
  // status procs (player shots only; companions get a weaker share)
  const procK = isPlayer ? 1 : 0.4;
  const f = s.flags;
  dealDamage(e, dmg, { x: s.x, y: s.y, vx: s.vx, vy: s.vy, crit: s.crit, knock: s.knock, src: s.owner, shot: s });
  if (e.dead) { /* still allow split/chain from killing blows */ }
  if (f.burn && Math.random() < f.burn * procK) applyBurn(e, dmg * 0.4);
  if (f.poison && Math.random() < f.poison * procK) applyPoison(e, dmg * 0.25);
  if (f.slow && Math.random() < f.slow * procK) applySlow(e, 2, 0.6);
  if (f.stun && Math.random() < f.stun * procK) applyStun(e, 0.6);
  if (f.opsonin) e.opsT = 3;
  if (s.latch) applyLatch(e, dmg * 0.35);
  if (f.chain && Math.random() < f.chain * procK) chainLightning(e, dmg * 0.5, 2);
  if (f.splitHit && !s.split) {
    for (let k = 0; k < f.splitHit; k++) {
      const a = rnd(0, TAU);
      const c = spawnPShot(e.x + Math.cos(a) * (e.r + 0.15), e.y + Math.sin(a) * (e.r + 0.15), a, { speed: 9, r: 0.11, dmg: dmg * 0.4, life: 0.7, style: 'frag', homing: 0.9, knock: 0.3, owner: s.owner });
      c.split = true; c.hit = new Set([e.id]);
    }
  }
  if (f.blast) shotBlast(s);
}

/* ==========================================================================
   DAMAGE PIPELINE (player -> enemy)
   ========================================================================== */
function enemyDamageMult(e) {
  let m = 1;
  if (e.opsT > 0) m *= 1.2;
  if (e.markT > 0) m *= 1.5;
  const P = SIM.player;
  if (P) {
    m *= 1 + P.memoryBonus(e.type);
    if (P.st.execute && e.isBoss && e.hp < e.maxHp * P.st.execute) m *= 1.15;
  }
  return m;
}
/**
 * dealDamage(e, amount, o) — o: {x,y,vx,vy,crit,knock,src,dot,silent,pure}
 */
function dealDamage(e, amount, o = {}) {
  if (!e || e.dead || e.spawning > 0 || e.invuln) return 0;
  let dmg = amount * (o.pure ? 1 : enemyDamageMult(e));
  // encapsulated elites: capsule soaks half
  if (e.capsule > 0) { const absorbed = Math.min(e.capsule, dmg * 0.5); e.capsule -= absorbed; dmg -= absorbed; if (e.capsule <= 0) { sfx('shield_break', { vol: 0.7 }); burst(e.x, e.y, '#9ad8ff', 14, 5, { life: 0.4 }); } }
  if (e.dmgTakenMult) dmg *= e.dmgTakenMult;
  e.hp -= dmg;
  e.hurtT = 0.09;
  const P = SIM.player;
  // execute
  if (P && P.st.execute && !e.isBoss && e.hp > 0 && e.hp < e.maxHp * P.st.execute && !o.dot) { dmg += e.hp; e.hp = 0; Gfx.floatText(e.x, e.y, 'APOPTOSIS', '#ff9af0', 12, { h: 1.6 }); }
  if (SIM.opts.dmgNumbers && !o.silent) {
    const big = dmg >= 10;
    Gfx.floatText(e.x + rnd(-0.2, 0.2), e.y, Math.max(1, Math.round(dmg)).toString(), o.crit ? '#ffe066' : o.dot ? (o.dotHex || '#ffa060') : '#ffffff', o.crit ? 19 : big ? 16 : 13, { crit: o.crit, h: 1.0 + e.r });
  }
  if (!o.dot) {
    sfx(o.crit ? 'crit' : 'hit', { vol: o.src === 'player' ? 0.75 : 0.4, rate: rnd(0.85, 1.15) });
    const a = o.vx !== undefined ? Math.atan2(o.vy, o.vx) : angleTo(P.x, P.y, e.x, e.y);
    burst(o.x != null ? o.x : e.x, o.y != null ? o.y : e.y, e.color, o.crit ? 6 : 3, 3.2, { dir: a, cone: 1.2, life: 0.35, size: 0.07 });
    // knockback
    if (!e.isBoss && !e.anchored && o.knock) {
      const kb = 3.2 * o.knock * (P ? P.st.knock : 1) / Math.max(0.6, e.mass || 1);
      e.kx += Math.cos(a) * kb; e.ky += Math.sin(a) * kb;
    }
  }
  if (e.isBoss) Bus.emit('bossHurt', e);
  if (P && !o.dot) { for (const h of P.hooks.onHit) h(e, dmg, o); }
  if (e.hp <= 0) killEnemy(e, o);
  return dmg;
}

function killEnemy(e, o = {}) {
  if (e.dead) return;
  e.dead = true;
  const P = SIM.player;
  const big = e.r >= 0.6 || e.isBoss;
  if (!e.noDeathFx) {
    burst(e.x, e.y, e.color, big ? 26 : 14, big ? 6 : 4.5, { life: 0.55, size: big ? 0.13 : 0.09, up: 3 });
    burst(e.x, e.y, e.core || '#ffffff', big ? 10 : 5, 3, { life: 0.4, size: 0.07 });
    Gfx.splat(SIM.room, e.x, e.y, e.r * (big ? 1.5 : 1.25), e.color, 0.55);
    sfx(e.elite ? 'kill_elite' : big ? 'kill_big' : 'kill_small', { rate: rnd(0.9, 1.1) });
    Gfx.addShake(e.elite ? 0.35 : big ? 0.25 : 0.12);
    if (e.elite || big) SIM.hitstop = Math.max(SIM.hitstop, e.elite ? 0.06 : 0.03);
  }
  if (e.onDeath) e.onDeath(e);
  // elite volatile
  if (e.elite === 'volatile') enemyRing(e.x, e.y, 10, 4.2, { style: 'acid', delay: 0.05 });
  // marked targets burst
  if (e.markT > 0 && P) explode(e.x, e.y, 1.8, P.baseDmg() * 2.2, { byPlayer: true, hex: '#9dff7a' });
  if (P && !e.isBoss && !e.summoned) {
    // drops
    const ironChance = (e.elite ? 1 : 0.32) * (e.cost || 1) * 0.5 + (e.elite ? 0.5 : 0);
    if (Math.random() < Math.min(0.95, ironChance)) {
      const n = e.elite ? rndi(3, 5) : 1 + (Math.random() < 0.25 ? 1 : 0);
      for (let k = 0; k < n; k++) spawnPickup('iron', e.x + rnd(-0.3, 0.3), e.y + rnd(-0.3, 0.3), 1);
    }
    if (P.st.plateletDrop && Math.random() < P.st.plateletDrop) spawnPickup('platelet', e.x, e.y);
  }
  if (P) {
    P.onKill(e);
    for (const h of P.hooks.onKill) h(e, o);
  }
  Bus.emit('enemyKilled', e);
}

/* ---------------- status effects ---------------- */
function applyBurn(e, dps) {
  if (e.dead) return;
  const k = SIM.player ? SIM.player.st.dotMult : 1;
  e.burnT = 3; e.burnDps = Math.max(e.burnDps || 0, dps * k);
}
function applyPoison(e, dps) {
  if (e.dead) return;
  const k = SIM.player ? SIM.player.st.dotMult : 1;
  e.poisonT = 4; e.poisonStacks = Math.min(5, (e.poisonStacks || 0) + 1); e.poisonDps = Math.max(e.poisonDps || 0, dps * k);
}
function applyLatch(e, dps) {
  if (e.dead) return;
  if (!e.latches) e.latches = [];
  if (e.latches.length >= 6) e.latches.shift();
  e.latches.push({ t: 2.5, dps, a: rnd(0, TAU) });
}
function applySlow(e, t, k) { e.slowT = Math.max(e.slowT || 0, t * (e.isBoss ? 0.5 : 1)); e.slowK = k; }
function applyStun(e, t) { if (e.isBoss || e.stunImmune) return; e.stunT = Math.max(e.stunT || 0, t); sfx('stun', { vol: 0.5 }); }

function updateStatus(e, dt) {
  e.hurtT = Math.max(0, (e.hurtT || 0) - dt);
  if (e.opsT > 0) e.opsT -= dt;
  if (e.markT > 0) e.markT -= dt;
  if (e.slowT > 0) e.slowT -= dt;
  if (e.stunT > 0) e.stunT -= dt;
  let dot = 0, hex = '#ffa060';
  if (e.burnT > 0) { e.burnT -= dt; dot += e.burnDps; if (Math.random() < dt * 8) burst(e.x, e.y, '#ff8a2a', 1, 1.2, { life: 0.4, size: 0.06, up: 2.5 }); }
  if (e.poisonT > 0) { e.poisonT -= dt; dot += e.poisonDps * e.poisonStacks; hex = '#9aff5a'; if (Math.random() < dt * 6) burst(e.x, e.y, '#9aff5a', 1, 1, { life: 0.4, size: 0.05, up: 1.5 }); }
  else e.poisonStacks = 0;
  if (e.latches && e.latches.length) {
    for (let i = e.latches.length - 1; i >= 0; i--) { const L = e.latches[i]; L.t -= dt; dot += L.dps; if (L.t <= 0) e.latches.splice(i, 1); }
    hex = '#c9bcff';
  }
  if (dot > 0) {
    e.dotAcc = (e.dotAcc || 0) + dot * dt;
    e.dotTick = (e.dotTick || 0) + dt;
    if (e.dotTick >= 0.5) { e.dotTick = 0; const d = e.dotAcc; e.dotAcc = 0; dealDamage(e, d, { dot: true, dotHex: hex, src: 'dot' }); }
  }
}

function chainLightning(from, dmg, n, visited) {
  visited = visited || new Set([from.id]);
  let src = from;
  for (let k = 0; k < n; k++) {
    let best = null, bd = 4.5 * 4.5;
    for (const e of SIM.enemies) { if (e.dead || visited.has(e.id) || e.spawning > 0) continue; const d = dist2(src.x, src.y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
    if (!best) break;
    visited.add(best.id);
    SIM.arcs.push({ x0: src.x, y0: src.y, x1: best.x, y1: best.y, t: 0, life: 0.16, hex: '#bfe8ff' });
    dealDamage(best, dmg, { src: 'chain', knock: 0.2, silent: false });
    src = best;
  }
  sfx('chain', { vol: 0.5, rate: rnd(0.9, 1.2) });
}

/* ==========================================================================
   ENEMY PROJECTILES
   ========================================================================== */
const ESHOT_SPEED_MULT = () => (1 + (SIM.floor ? SIM.floor.idx : 0) * 0.035) * (SIM.run && SIM.run.fever >= 2 ? 1.12 : 1);
function spawnEShot(x, y, ang, speed, o = {}) {
  const sp = speed * (o.raw ? 1 : ESHOT_SPEED_MULT());
  const s = {
    id: nextId(), x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: o.r || 0.17, life: o.life || 8, t: 0,
    style: o.style || 'pink', accel: o.accel || 0, curve: o.curve || 0, delay: o.delay || 0, h: o.h || 0.55,
    onExpire: o.onExpire || null, spectral: !!o.spectral, maxSpeed: o.maxSpeed || 99, streak: !!o.streak, dmg: o.dmg || 1,
    gravityTo: o.gravityTo || null, homing: o.homing || 0,
  };
  SIM.eshots.push(s);
  return s;
}
function enemyRing(x, y, n, speed, o = {}) {
  const a0 = o.a0 != null ? o.a0 : rnd(0, TAU);
  const gap = o.gap; // {a, w} gap angle to leave open
  for (let i = 0; i < n; i++) {
    const a = a0 + i / n * TAU;
    if (gap && Math.abs(angDiff(a, gap.a)) < gap.w) continue;
    spawnEShot(x, y, a, speed, o);
  }
}
function enemyFan(x, y, ang, n, spread, speed, o = {}) {
  for (let i = 0; i < n; i++) { const a = ang + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread); spawnEShot(x, y, a, speed, o); }
}
function updateEShots(dt) {
  const room = SIM.room, P = SIM.player;
  for (let i = SIM.eshots.length - 1; i >= 0; i--) {
    const s = SIM.eshots[i];
    if (s.delay > 0) { s.delay -= dt; continue; }
    s.t += dt;
    if (s.t >= s.life || s.dead) { if (s.onExpire && !s.dead) s.onExpire(s); SIM.eshots.splice(i, 1); continue; }
    if (s.accel) { const sp = Math.hypot(s.vx, s.vy), ns = clamp(sp + s.accel * dt, 0.3, s.maxSpeed), k = ns / Math.max(0.001, sp); s.vx *= k; s.vy *= k; }
    if (s.curve) { const a = Math.atan2(s.vy, s.vx) + s.curve * dt, sp = Math.hypot(s.vx, s.vy); s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp; }
    if (s.homing && P) { const a = Math.atan2(s.vy, s.vx), w = angleTo(s.x, s.y, P.x, P.y), sp = Math.hypot(s.vx, s.vy); const na = a + clamp(angDiff(a, w), -1, 1) * s.homing * dt; s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp; }
    applyFlow(s, dt, 0.5);
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (!s.spectral && World.blockedAt(room, s.x, s.y, MASK_SHOT)) {
      burst(s.x, s.y, ESHOT_STYLES[s.style] || '#ff3d7f', 3, 1.6, { life: 0.2, size: 0.05 });
      if (s.onExpire) s.onExpire(s);
      SIM.eshots.splice(i, 1); continue;
    }
    if (s.spectral && (s.x < -2 || s.y < -2 || s.x > room.W + 2 || s.y > room.H + 2)) { SIM.eshots.splice(i, 1); continue; }
    // companions / satellites block
    let blocked = false;
    for (const c of SIM.companions) {
      if (!c.blocks) continue;
      const rr = c.r + s.r; if (dist2(s.x, s.y, c.x, c.y) < rr * rr) { blocked = true; burst(s.x, s.y, '#ffffff', 4, 2, { life: 0.2, size: 0.05 }); break; }
    }
    if (blocked) { SIM.eshots.splice(i, 1); continue; }
    // player dash pump
    if (P && P.dashT > 0 && P.st.dashClears && dist2(s.x, s.y, P.x, P.y) < (P.hitR + s.r + 0.35) ** 2) {
      burst(s.x, s.y, '#bff8ff', 5, 2.5, { life: 0.25, size: 0.05 }); SIM.eshots.splice(i, 1); continue;
    }
    if (P && !P.dead) {
      const rr = P.hitR + s.r * 0.85;
      if (dist2(s.x, s.y, P.x, P.y) < rr * rr) {
        if (hurtPlayer(s.dmg, { x: s.x, y: s.y, kind: 'shot' })) { SIM.eshots.splice(i, 1); continue; }
      }
    }
  }
}
function clearEShots(fx) {
  if (fx) for (const s of SIM.eshots) burst(s.x, s.y, ESHOT_STYLES[s.style] || '#ff3d7f', 2, 1.5, { life: 0.3, size: 0.05 });
  SIM.eshots.length = 0;
}

/* ==========================================================================
   HAZARDS: zones, telegraphs, beams, lobs
   ========================================================================== */
/** zone kinds: spore (hurts player), acid (hurts player), rot (hurts player), net/bio (hurt enemies), pull (cosmetic) */
function spawnZone(x, y, r, life, kind, o = {}) {
  const z = { x, y, r, life, t: 0, kind, dps: o.dps || 0, slow: o.slow || 0, grow: o.grow || 0, owner: o.owner || 'enemy', tick: 0, delay: o.delay || 0 };
  SIM.zones.push(z);
  return z;
}
function updateZones(dt) {
  const P = SIM.player;
  for (let i = SIM.zones.length - 1; i >= 0; i--) {
    const z = SIM.zones[i];
    if (z.delay > 0) { z.delay -= dt; continue; }
    z.t += dt;
    if (z.t >= z.life) { SIM.zones.splice(i, 1); continue; }
    if (z.grow) z.r += z.grow * dt;
    const rr = z.r * (z.t < 0.2 ? z.t / 0.2 : 1);
    if (z.owner === 'enemy') {
      if (P && !P.dead && z.t > 0.25 && dist2(P.x, P.y, z.x, z.y) < (rr * 0.85 + P.hitR) ** 2) hurtPlayer(1, { x: z.x, y: z.y, kind: 'zone' });
    } else {
      z.tick += dt;
      const doTick = z.tick >= 0.25; if (doTick) z.tick = 0;
      for (const e of SIM.enemies) {
        if (e.dead || e.spawning > 0) continue;
        if (dist2(e.x, e.y, z.x, z.y) < (rr + e.r) ** 2) {
          if (z.slow) e.zoneSlow = Math.min(e.zoneSlow || 1, 1 - z.slow);
          if (doTick && z.dps) dealDamage(e, z.dps * 0.25, { dot: true, dotHex: z.kind === 'net' ? '#bff8ff' : '#6aff9a', src: 'zone', silent: true });
        }
      }
    }
  }
}
/** Telegraph then callback. kind: disc {r} | line {ang,len,w} */
function telegraph(o) {
  const t = Object.assign({ t: 0, dur: 0.8, kind: 'disc', r: 1, ang: 0, len: 6, w: 0.5, warm: false }, o);
  SIM.teles.push(t);
  return t;
}
function updateTeles(dt) {
  for (let i = SIM.teles.length - 1; i >= 0; i--) {
    const t = SIM.teles[i];
    if (t.owner && t.owner.dead && !t.persist) { SIM.teles.splice(i, 1); continue; }
    if (t.follow) t.follow(t);
    t.t += dt;
    if (t.t >= t.dur) { SIM.teles.splice(i, 1); if (t.then) t.then(t); }
  }
}
/** damaging beam (line segment) active for dur */
function spawnBeam(x, y, ang, len, w, dur, o = {}) {
  const b = { x, y, ang, len, w, dur, t: 0, owner: o.owner || null, spin: o.spin || 0, follow: o.follow || null, hex: o.hex || '#ff5ad1', dmg: o.dmg || 1 };
  SIM.beams.push(b);
  return b;
}
function updateBeams(dt) {
  const P = SIM.player;
  for (let i = SIM.beams.length - 1; i >= 0; i--) {
    const b = SIM.beams[i];
    b.t += dt;
    if (b.t >= b.dur || (b.owner && b.owner.dead)) { SIM.beams.splice(i, 1); continue; }
    if (b.follow) b.follow(b, dt);
    if (b.spin) b.ang += b.spin * dt;
    if (P && !P.dead) {
      const d = pointSegDist(P.x, P.y, b.x, b.y, b.x + Math.cos(b.ang) * b.len, b.y + Math.sin(b.ang) * b.len);
      if (d < b.w * 0.5 + P.hitR * 0.8) hurtPlayer(b.dmg, { x: P.x, y: P.y, kind: 'beam' });
    }
  }
}
function pointSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = clamp(t, 0, 1);
  return dist(px, py, ax + dx * t, ay + dy * t);
}
/** lobbed glob: flies in an arc, then onLand(x,y) */
function spawnLob(x0, y0, x1, y1, dur, o = {}) {
  const l = { x0, y0, x1, y1, dur, t: 0, hex: o.hex || '#d6ff3a', size: o.size || 0.28, onLand: o.onLand || null, peak: o.peak || 3 };
  SIM.lobs.push(l);
  if (o.tele !== false) telegraph({ kind: 'disc', x: x1, y: y1, r: o.r || 1, dur, warm: true });
  return l;
}
function updateLobs(dt) {
  for (let i = SIM.lobs.length - 1; i >= 0; i--) {
    const l = SIM.lobs[i]; l.t += dt;
    if (l.t >= l.dur) { SIM.lobs.splice(i, 1); if (l.onLand) l.onLand(l.x1, l.y1); }
  }
}

/* ==========================================================================
   EXPLOSIONS + PARTICLES + RINGS
   ========================================================================== */
function explode(x, y, r, dmg, o = {}) {
  const hex = o.hex || '#ffb04a';
  burst(x, y, hex, o.small ? 10 : 26, r * (o.small ? 4 : 5), { life: 0.4, size: o.small ? 0.07 : 0.12, up: 2 });
  burst(x, y, '#ffffff', o.small ? 3 : 8, r * 3, { life: 0.25, size: 0.08 });
  addRing(x, y, r, hex, 0.3);
  if (!o.small) { Gfx.scorch(SIM.room, x, y, r * 0.9); Gfx.addShake(0.4); sfx('explosion', { rate: rnd(0.9, 1.1) }); }
  else if (Math.random() < 0.5) sfx('explosion', { vol: 0.35, rate: rnd(1.3, 1.6) });
  if (o.byPlayer) {
    for (const e of SIM.enemies) {
      if (e.dead || e.spawning > 0 || (o.exclude && o.exclude === e)) continue;
      if (dist2(e.x, e.y, x, y) < (r + e.r) ** 2) dealDamage(e, dmg, { x, y, vx: e.x - x, vy: e.y - y, knock: 1.4, src: 'blast', silent: o.small });
    }
    if (o.chain) for (const e of SIM.enemies) if (!e.dead && dist2(e.x, e.y, x, y) < (r + 2) ** 2) { chainLightning(e, dmg * 0.4, 1); break; }
    // explosions break clots
    const room = SIM.room;
    for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      if (World.tile(room, tx, ty) === T_CLOT && dist2(tx + 0.5, ty + 0.5, x, y) < r * r) damageClot(tx, ty, 999);
    }
  } else {
    const P = SIM.player;
    if (P && dist2(P.x, P.y, x, y) < (r + P.hitR) ** 2) hurtPlayer(1, { x, y, kind: 'blast' });
  }
}
function burst(x, y, hex, n, spd, o = {}) {
  if (SIM.particles.length > 900) n = Math.min(n, 2);
  for (let i = 0; i < n; i++) {
    const a = o.dir != null ? o.dir + rnd(-o.cone, o.cone) * 0.5 : rnd(0, TAU);
    const sp = spd * rnd(0.35, 1);
    SIM.particles.push({
      x, y, h: o.h != null ? o.h : 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vh: (o.up || 1.5) * rnd(0.3, 1.2),
      life: (o.life || 0.5) * rnd(0.6, 1.2), t: 0, size: (o.size || 0.08) * rnd(0.6, 1.4), hex, grav: o.grav != null ? o.grav : 9, drag: o.drag || 2.5,
    });
  }
}
function updateParticles(dt) {
  const arr = SIM.particles;
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i]; p.t += dt;
    if (p.t >= p.life) { arr[i] = arr[arr.length - 1]; arr.pop(); continue; }
    const k = Math.max(0, 1 - p.drag * dt);
    p.vx *= k; p.vy *= k; p.vh -= p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.h += p.vh * dt;
    if (p.h < 0.03) { p.h = 0.03; p.vh = -p.vh * 0.3; p.vx *= 0.6; p.vy *= 0.6; }
  }
  for (let i = SIM.arcs.length - 1; i >= 0; i--) { const a = SIM.arcs[i]; a.t += dt; if (a.t >= a.life) SIM.arcs.splice(i, 1); }
  for (let i = SIM.rings.length - 1; i >= 0; i--) { const r = SIM.rings[i]; r.t += dt; if (r.t >= r.life) SIM.rings.splice(i, 1); }
}
function addRing(x, y, r, hex, life = 0.35) { SIM.rings.push({ x, y, r, hex, life, t: 0 }); }

/* ==========================================================================
   CLOTS (destructible obstacles)
   ========================================================================== */
function damageClot(tx, ty, dmg) {
  const room = SIM.room, idx = ty * room.W + tx;
  if (room.grid[idx] !== T_CLOT) return;
  const max = 10 + (SIM.floor ? SIM.floor.idx * 3 : 0);
  room.clotHp[idx] = (room.clotHp[idx] == null ? max : room.clotHp[idx]) - dmg;
  if (room.clotHp[idx] <= 0) {
    room.grid[idx] = T_FLOOR; room.flowDirty = true;
    Gfx.removeClot(tx, ty);
    burst(tx + 0.5, ty + 0.5, '#c81a2a', 14, 4, { life: 0.5, size: 0.1, up: 3 });
    Gfx.splat(room, tx + 0.5, ty + 0.5, 0.7, '#a81a2a', 0.6);
    sfx('kill_small', { rate: 0.8 });
    if (Math.random() < 0.22) spawnPickup('iron', tx + 0.5, ty + 0.5, 1);
    else if (Math.random() < 0.04) spawnPickup('platelet', tx + 0.5, ty + 0.5);
  } else {
    Gfx.damageClot(tx, ty, room.clotHp[idx] / max);
    burst(tx + 0.5, ty + 0.5, '#c81a2a', 2, 2, { life: 0.25, size: 0.06 });
  }
}

/* ==========================================================================
   PICKUPS
   ========================================================================== */
const PICKUP_DEF = {
  iron: { hex: '#ff8a3a', r: 0.18, glow: 0.9 },
  platelet: { hex: '#ffd0dc', r: 0.26, glow: 0.7 },
  mucus: { hex: '#9ad8ff', r: 0.26, glow: 0.8 },
};
function spawnPickup(kind, x, y, value) {
  const a = rnd(0, TAU), sp = rnd(1.5, 3.5);
  const p = { id: nextId(), kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, value: value || 1, node: null, h: 0.3, vh: 3 };
  p.node = buildPickupVis(kind);
  SIM.pickups.push(p);
  return p;
}
function buildPickupVis(kind) {
  const root = Gfx.node('pk_' + kind);
  if (kind === 'iron') {
    const m = Gfx.part('octa', Gfx.cellMat('#ff8a3a', { rim: 1.6, core: 0.6, glow: 0.7, dark: 0.8 }), root, 0, 0, 0, 0.17);
  } else if (kind === 'platelet') {
    const mat = Gfx.cellMat('#ffc0d0', { rim: 1.4, core: 0.5, glow: 0.55, dark: 0.9 });
    Gfx.part('sphere', mat, root, 0, 0, 0, 0.26, 0.11, 0.26);
    const cm = Gfx.glowMat('#ff3b5c', { glow: 0.6 });
    Gfx.part('box', cm, root, 0, 0.1, 0, 0.14, 0.02, 0.04); Gfx.part('box', cm, root, 0, 0.1, 0, 0.04, 0.02, 0.14);
  } else if (kind === 'mucus') {
    Gfx.part('sphere', Gfx.cellMat('#9ad8ff', { rim: 1.6, core: 0.4, glow: 0.6, dark: 0.6, alpha: 0.75 }), root, 0, 0, 0, 0.24);
    Gfx.part('sphereLo', Gfx.glowMat('#e8f8ff', { glow: 0.5 }), root, 0.06, 0.06, -0.06, 0.06);
  }
  return root;
}
function updatePickups(dt) {
  const P = SIM.player, room = SIM.room;
  for (let i = SIM.pickups.length - 1; i >= 0; i--) {
    const p = SIM.pickups[i]; p.t += dt;
    // pop-out physics
    p.vh -= 14 * dt; p.h += p.vh * dt; if (p.h < 0.28) { p.h = 0.28; p.vh = Math.abs(p.vh) > 1 ? -p.vh * 0.35 : 0; }
    const k = Math.max(0, 1 - 4 * dt); p.vx *= k; p.vy *= k;
    // magnet (iron always; heals only if useful)
    if (P && !P.dead && p.t > 0.35) {
      const want = p.kind === 'iron' || (p.kind === 'platelet' && P.hp < P.st.maxHp && !P.st.noHeal) || (p.kind === 'mucus');
      const mag = P.st.magnet * (p.kind === 'iron' ? 1 : 0.6);
      const d = dist(p.x, p.y, P.x, P.y);
      if (want && d < mag) { const a = angleTo(p.x, p.y, P.x, P.y), f = (1 - d / mag) * 26 + 4; p.vx += Math.cos(a) * f * dt; p.vy += Math.sin(a) * f * dt; }
      if (want && d < P.hitR + 0.35) { collectPickup(p); p.node.dispose(); SIM.pickups.splice(i, 1); continue; }
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    const pr = { x: p.x, y: p.y, vx: p.vx, vy: p.vy };
    World.collideCircle(room, pr, 0.2, MASK_PLAYER_LOCKED);
    p.x = pr.x; p.y = pr.y; p.vx = pr.vx; p.vy = pr.vy;
    p.node.position.set(p.x, p.h + Math.sin(p.t * 3 + p.id) * 0.06, -p.y);
    p.node.rotation.y += dt * 2;
  }
}
function collectPickup(p) {
  const P = SIM.player;
  if (p.kind === 'iron') { P.addIron(p.value); sfx('pickup_iron', { rate: rnd(0.95, 1.15) }); burst(p.x, p.y, '#ff8a3a', 4, 2, { life: 0.25, size: 0.05 }); }
  else if (p.kind === 'platelet') { P.heal(1); sfx('pickup_health'); burst(p.x, p.y, '#ffc0d0', 10, 3, { life: 0.4, size: 0.07 }); }
  else if (p.kind === 'mucus') { P.addShield(1); sfx('shield_gain'); burst(p.x, p.y, '#9ad8ff', 10, 3, { life: 0.4, size: 0.07 }); }
}
function clearPickups() { for (const p of SIM.pickups) p.node.dispose(); SIM.pickups.length = 0; }

/* ==========================================================================
   PLAYER DAMAGE
   ========================================================================== */
function hurtPlayer(amount, src = {}) {
  const P = SIM.player;
  if (!P || P.dead || P.invulnT > 0 || P.dashT > 0 || SIM.godMode) return false;
  if (P.shield > 0) { P.shield -= 1; amount = 0; sfx('shield_break'); burst(P.x, P.y, '#9ad8ff', 14, 4, { life: 0.4, size: 0.08 }); }
  else { P.hp -= amount; sfx('hurt'); }
  P.invulnT = 1.0 + (P.st.plateletPlug ? 0.5 : 0);
  P.hurtFlash = 0.3;
  SIM.hitstop = Math.max(SIM.hitstop, 0.08);
  Gfx.addShake(0.55); Gfx.caPulse = 1; Gfx.punch(1);
  burst(P.x, P.y, P.color, 16, 4.5, { life: 0.45, size: 0.08 });
  try { if (window.AUDIO) AUDIO.duck(0.5, 0.4); } catch (e) { }
  Bus.emit('playerHurt', amount);
  for (const h of P.hooks.onHurt) h(src);
  SIM.run.stats.hitsTaken++;
  if (P.hp <= 0) P.die();
  return true;
}

/* ==========================================================================
   QUERIES & REGION FORCES
   ========================================================================== */
function nearestEnemy(x, y, maxD, exclude) {
  let best = null, bd = maxD * maxD;
  for (const e of SIM.enemies) {
    if (e.dead || e.spawning > 0 || e.untargetable) continue;
    if (exclude && exclude.has(e.id)) continue;
    const d = dist2(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; }
  }
  return best;
}
/** room flow field (veins currents / lung breath). k scales the push */
function applyFlow(o, dt, k) {
  const f = SIM.room && SIM.room.force; if (!f) return;
  o.x += f.x * dt * k; o.y += f.y * dt * k;
}
