/* ==========================================================================
   SPLEEN: SEPSIS — player.js
   Player cell: movement, dash, the four strain weapons & abilities,
   mutation stat rebuild + hooks, companions.
   ========================================================================== */
"use strict";

const DASH_SPEED = 16, DASH_TIME = 0.17, DASH_CD = 0.72;

function freshStats(def, run) {
  const perks = (window.META && META.perks) || {};
  return {
    maxHp: def.hp + (perks.hp || 0) - (run && run.fever >= 4 ? 1 : 0),
    dmgMult: 1, fireMult: 1, shotSpeedMult: 1, rangeMult: 1, speedMult: 1, sizeMult: 1,
    pierce: def.weapon === 'lance' ? 2 : 0, bounce: 0, homing: def.weapon === 'antibody' ? 0.6 : 0,
    parallel: 0, spread: 0, knock: 1, crit: def.crit || 0, critMult: 2,
    abilityCdMult: 1 - 0.08 * (perks.ability || 0), ironMult: 1, magnet: 2.4,
    burn: 0, poison: 0, slow: 0, stun: 0, chain: 0, shotBlast: 0, splitHit: 0, splitWall: false, hitboxMult: 1,
    dashCdMult: 1, dashClears: false, biofilm: false, adrenal: false, shieldPerFloor: 0, healOnClear: 0,
    execute: 0, opsonin: false, complement: 0, cytokine: false, phage: 0, deathBlast: false, contactAura: 0,
    noHeal: false, enemySpeedMult: 1, enemyHpMult: 1, warburg: false, oncogene: false, plateletPlug: false,
    plateletDrop: 0, speciesBonus: false, satellites: 0, helpers: 0, mastcells: 0, blastRadiusMult: 1,
    dotMult: 1, bounceDmg: 0, companionMult: 1, blastChain: false,
  };
}

function makePlayer(strainId, run) {
  const def = STRAINS[strainId];
  const P = {
    strain: def, x: 8.5, y: 5.5, vx: 0, vy: 0, color: def.color,
    hp: 0, shield: 0, iron: 0, mutations: [], counts: {}, st: null, hooks: null,
    fireT: 0, charge: 0, chargeHeld: false, lastFire: 0, dashT: 0, dashCd: 0, dashDX: 1, dashDY: 0,
    invulnT: 0, hurtFlash: 0, abilityT: 0, abilityMax: def.abilityCd, abilityReadyPlayed: true,
    aimAng: 0, node: null, vis: null, dead: false, revives: 0, reviveHp: [],
    volley: 0, adrenalShots: 0, cytokineStacks: 0, species: new Set(), synergies: {}, run,
    auraTick: 0, bioT: 0, engulf: null, walkT: 0, maxHpPaid: 0,
  };
  P.hitR = def.hitR;

  /* ---------------- stat rebuild ---------------- */
  P.recompute = function () {
    const st = freshStats(def, run);
    P.hooks = { onHit: [], onKill: [], onHurt: [], onRoomClear: [], onDash: [] };
    for (const id of P.mutations) { const m = MUT[id]; if (m && m.apply) m.apply(st, P); }
    // synergies
    const owned = new Set(P.mutations);
    for (const s of SYNERGIES) {
      if (s.req.every(r => owned.has(r))) {
        s.apply(st);
        if (!P.synergies[s.id]) { P.synergies[s.id] = true; Bus.emit('synergy', s); }
      }
    }
    st.maxHp = Math.max(1, st.maxHp - (P.maxHpPaid || 0));
    st.fireMult = Math.min(st.fireMult, 3.2);
    st.speedMult = Math.min(st.speedMult, 1.7);
    P.st = st;
    P.hitR = def.hitR * st.hitboxMult;
    P.hp = Math.min(P.hp, st.maxHp);
    P.abilityMax = def.abilityCd * st.abilityCdMult;
    // hooks
    if (st.phage) P.hooks.onKill.push((e) => {
      for (let k = 0; k < st.phage; k++) {
        const a = rnd(0, TAU);
        spawnPShot(e.x, e.y, a, { speed: 7, r: 0.12, dmg: P.baseDmg() * 0.7, life: 1.6, style: 'phage', homing: 1.4, knock: 0.3, owner: 'phage' });
      }
    });
    if (st.deathBlast) P.hooks.onKill.push((e, o) => {
      if (o && o.src === 'stormblast') return;
      const r = (1.3 + e.r) * st.blastRadiusMult;
      // defer so chain reactions resolve over a few frames (looks great, avoids recursion)
      after(0.06, () => { if (SIM.player === P && !P.dead) explodeStorm(e.x, e.y, r, P.baseDmg() * 1.6, st.blastChain); });
    });
    if (st.cytokine) P.hooks.onKill.push(() => { P.cytokineStacks = Math.min(10, P.cytokineStacks + 1); });
    if (st.plateletPlug) P.hooks.onHurt.push(() => {
      addRing(P.x, P.y, 3, '#ffc0d0', 0.4);
      for (const e of SIM.enemies) if (!e.dead && dist2(e.x, e.y, P.x, P.y) < 9) dealDamage(e, P.baseDmg() * 2, { x: P.x, y: P.y, vx: e.x - P.x, vy: e.y - P.y, knock: 3, src: 'plug' });
      clearNearbyShots(P.x, P.y, 2.2);
    });
    syncCompanions();
  };
  function explodeStorm(x, y, r, dmg, chain) {
    burst(x, y, '#ffd36b', 16, r * 4, { life: 0.35, size: 0.09 });
    addRing(x, y, r, '#ffd36b', 0.3);
    sfx('explosion', { vol: 0.5, rate: rnd(1.1, 1.4) });
    Gfx.addShake(0.2);
    for (const e of SIM.enemies) if (!e.dead && e.spawning <= 0 && dist2(e.x, e.y, x, y) < (r + e.r) ** 2) dealDamage(e, dmg, { x, y, vx: e.x - x, vy: e.y - y, knock: 1.2, src: 'stormblast', silent: true });
    if (chain) { const t = nearestEnemy(x, y, 4); if (t) chainLightning(t, dmg * 0.5, 2, new Set()); }
  }
  function clearNearbyShots(x, y, r) {
    for (let i = SIM.eshots.length - 1; i >= 0; i--) { const s = SIM.eshots[i]; if (dist2(s.x, s.y, x, y) < r * r) { burst(s.x, s.y, '#ffc0d0', 2, 2, { life: 0.2 }); SIM.eshots.splice(i, 1); } }
  }

  P.baseDmg = function () {
    let d = def.dmg * P.st.dmgMult;
    if (P.st.oncogene) d *= 1 + 0.04 * (run.stats.roomsCleared || 0);
    if (P.st.cytokine) d *= 1 + 0.04 * P.cytokineStacks;
    if (P.st.speciesBonus) d *= 1 + Math.min(0.4, 0.04 * P.species.size);
    return d;
  };
  P.memoryBonus = function (type) {
    const kills = (META.codex && META.codex[type]) || 0;
    const cap = META.perks && META.perks.memtcell ? 0.2 : 0.1;
    const per = META.perks && META.perks.memtcell ? 0.002 : 0.001;
    return Math.min(cap, kills * per);
  };
  P.fireRate = () => Math.min(12, def.fireRate * P.st.fireMult);
  P.shotSpeed = () => def.shotSpeed * P.st.shotSpeedMult;
  P.range = () => def.range * P.st.rangeMult;
  P.speed = () => def.speed * P.st.speedMult;

  P.heal = function (n) {
    if (P.st && P.st.noHeal && n < 50) return;
    const before = P.hp; P.hp = Math.min(P.st ? P.st.maxHp : def.hp, P.hp + n);
    if (P.hp > before) { sfx('heal'); Bus.emit('heal'); }
  };
  P.addShield = function (n) { P.shield = Math.min(6, P.shield + n); Bus.emit('shield'); };
  P.addIron = function (n, raw) { const v = raw ? n : Math.round(n * (P.st ? P.st.ironMult : 1) * 10) / 10; P.iron += v; run.stats.ironGained += v; Bus.emit('iron'); };

  /* ---------------- mutations ---------------- */
  P.addMutation = function (id, silent) {
    const m = MUT[id]; if (!m) return;
    P.mutations.push(id); P.counts[id] = (P.counts[id] || 0) + 1;
    if (m.cost) { P.maxHpPaid = (P.maxHpPaid || 0) + m.cost; }
    P.recompute();
    if (m.cost) { /* malignant: pay max HP via a permanent negative */ }
    if (m.onGain) m.onGain(P);
    if (!silent) Bus.emit('mutation', m);
  };
  P.canTake = function (id) { const m = MUT[id]; return m && (P.counts[id] || 0) < (m.stack || 1); };

  /* ---------------- per-frame update ---------------- */
  P.update = function (dt) {
    if (P.dead) return;
    const st = P.st, room = SIM.room;
    P.invulnT = Math.max(0, P.invulnT - dt);
    P.hurtFlash = Math.max(0, P.hurtFlash - dt);
    P.dashCd = Math.max(0, P.dashCd - dt);
    // ability cooldown
    if (P.abilityT > 0) { P.abilityT = Math.max(0, P.abilityT - dt); if (P.abilityT === 0 && !P.abilityReadyPlayed) { P.abilityReadyPlayed = true; sfx('ability_ready'); Bus.emit('abilityReady'); } }
    // --- aim
    const inp = Input;
    let aimX = inp.aim.x, aimY = inp.aim.y;
    if (inp.device === 'pad' && inp.aimActive) {
      // gentle aim assist toward the target closest to the stick direction
      let best = null, bs = 0.22;
      for (const e of SIM.enemies) {
        if (e.dead || e.spawning > 0) continue;
        const a = angleTo(P.x, P.y, e.x, e.y), d = Math.abs(angDiff(Math.atan2(aimY, aimX), a));
        if (d < bs && dist2(P.x, P.y, e.x, e.y) < 120) { bs = d; best = a; }
      }
      if (best != null) { const a0 = Math.atan2(aimY, aimX), a = a0 + angDiff(a0, best) * 0.6; aimX = Math.cos(a); aimY = Math.sin(a); }
    }
    if (inp.aimActive || inp.device === 'kbm') P.aimAng = Math.atan2(aimY, aimX);
    // --- engulf lunge overrides movement
    if (P.engulf) { updateEngulf(dt); }
    else if (P.dashT > 0) {
      P.dashT -= dt;
      P.vx = P.dashDX * DASH_SPEED; P.vy = P.dashDY * DASH_SPEED;
      if (st.biofilm) { P.bioT -= dt; if (P.bioT <= 0) { P.bioT = 0.045; spawnZone(P.x, P.y, 0.6, 2.4, 'bio', { owner: 'player', dps: P.baseDmg() * 1.1 }); } }
      if (Math.random() < 0.7) burst(P.x, P.y, P.color, 1, 0.5, { life: 0.3, size: 0.1, grav: 0, h: 0.5 });
    } else {
      const sp = P.speed() * (P.chargeHeld && def.weapon === 'lance' ? 0.78 : 1);
      const tx = inp.move.x * sp, ty = inp.move.y * sp;
      const k = damp(inp.move.x || inp.move.y ? 14 : 10, dt);
      P.vx = lerp(P.vx, tx, k); P.vy = lerp(P.vy, ty, k);
      // dash
      if (inp.dash && P.dashCd <= 0) startDash();
    }
    // move + collide
    applyFlow(P, dt, 0.55);
    P.x += P.vx * dt; P.y += P.vy * dt;
    World.collideCircle(room, P, P.hitR + 0.04, SIM.roomLocked ? MASK_PLAYER_LOCKED : MASK_PLAYER_OPEN);
    // acid floor
    if (World.tile(room, Math.floor(P.x), Math.floor(P.y)) === T_ACID && P.dashT <= 0) hurtPlayer(1, { kind: 'acid' });
    // --- shooting
    updateWeapon(dt);
    // --- ability
    if (inp.ability && SIM.combatAllowed) {
      if (P.abilityT <= 0) useAbility();
      else { sfx('ui_error', { vol: 0.4 }); }
    }
    // --- contact with enemies
    for (const e of SIM.enemies) {
      if (e.dead || e.spawning > 0 || e.harmless || e.burrowed) continue;
      const rr = e.r * 0.85 + P.hitR;
      if (dist2(e.x, e.y, P.x, P.y) < rr * rr) {
        if (!P.engulf) hurtPlayer(1, { x: e.x, y: e.y, kind: 'contact', enemy: e });
      }
    }
    if (st.contactAura) {
      P.auraTick += dt;
      if (P.auraTick >= 0.25) {
        P.auraTick = 0;
        for (const e of SIM.enemies) if (!e.dead && e.spawning <= 0 && dist2(e.x, e.y, P.x, P.y) < (e.r + P.hitR + 0.5) ** 2) dealDamage(e, P.baseDmg() * st.contactAura * 0.25, { dot: true, dotHex: '#c06bff', src: 'aura' });
      }
    }
    updateCompanions(dt);
  };

  function startDash() {
    let dx = Input.move.x, dy = Input.move.y; const l = Math.hypot(dx, dy);
    if (l < 0.2) { dx = Math.cos(P.aimAng); dy = Math.sin(P.aimAng); } else { dx /= l; dy /= l; }
    P.dashDX = dx; P.dashDY = dy; P.dashT = DASH_TIME; P.dashCd = DASH_CD * P.st.dashCdMult;
    sfx('dash', { rate: rnd(0.95, 1.05) });
    if (P.st.adrenal) P.adrenalShots = 3;
    for (const h of P.hooks.onDash) h();
    run.stats.dashes++;
  }

  /* ---------------- weapons ---------------- */
  function multishotK(n) { return Math.pow(n, 0.7) / n; }
  function critRoll() { return Math.random() < P.st.crit; }
  function shotFlags() {
    const st = P.st;
    return { burn: st.burn, poison: st.poison, slow: st.slow, stun: st.stun, chain: st.chain, blast: st.shotBlast, splitHit: st.splitHit, splitWall: st.splitWall, opsonin: st.opsonin };
  }
  function volleyDmgMult() {
    let k = 1;
    if (P.adrenalShots > 0) { k *= 1.7; P.adrenalShots--; }
    return k;
  }
  function muzzle(ang) { return { x: P.x + Math.cos(ang) * (P.hitR + 0.12), y: P.y + Math.sin(ang) * (P.hitR + 0.12) }; }

  function updateWeapon(dt) {
    P.fireT = Math.max(0, P.fireT - dt);
    const canFire = SIM.combatAllowed && !P.engulf;
    const firing = Input.firing && canFire;
    if (def.weapon === 'lance') {
      const rate = P.fireRate();
      if (firing) {
        P.chargeHeld = true;
        const before = P.charge;
        P.charge = Math.min(1, P.charge + rate * dt);
        if (before < 1 && P.charge >= 1) sfx('charge_tcell', { vol: 0.5, rate: 1.2 });
        if (P.charge >= 1 && P.fireT <= 0) { fireLance(1); P.charge = 0; }
      } else if (P.chargeHeld) {
        P.chargeHeld = false;
        if (P.fireT <= 0) fireLance(P.charge);
        P.charge = 0;
      }
      return;
    }
    if (firing && P.fireT <= 0) {
      P.fireT = 1 / P.fireRate();
      if (def.weapon === 'spray') fireSpray(); else fireStream();
    }
  }
  function fireStream() {
    const st = P.st, isAnti = def.weapon === 'antibody';
    const nPar = 1 + st.parallel, nSpr = 1 + st.spread, n = nPar * nSpr;
    const dmg = P.baseDmg() * multishotK(n) * volleyDmgMult();
    const spd = P.shotSpeed(), life = P.range() / spd;
    const fan = Math.min(0.85, 0.2 * (nSpr - 1));
    const flags = shotFlags();
    const r = 0.15 * def.shotSize * st.sizeMult;
    for (let si = 0; si < nSpr; si++) {
      const a = P.aimAng + (nSpr === 1 ? 0 : (si / (nSpr - 1) - 0.5) * fan) + (isAnti ? rnd(-0.06, 0.06) : 0);
      for (let pi = 0; pi < nPar; pi++) {
        const off = (pi - (nPar - 1) / 2) * 0.24;
        const m = muzzle(a);
        const crit = critRoll();
        spawnPShot(m.x - Math.sin(a) * off, m.y + Math.cos(a) * off, a, {
          speed: spd * (isAnti ? rnd(0.92, 1.05) : 1), r, dmg: dmg * (crit ? st.critMult : 1), life, style: isAnti ? 'anti' : 'neut',
          pierce: st.pierce, bounce: st.bounce, homing: st.homing, crit, flags, latch: isAnti, knock: isAnti ? 0.5 : 1,
        });
      }
    }
    complementShot(dmg / multishotK(n));
    sfx(isAnti ? 'shoot_bcell' : 'shoot_neutrophil', { vol: 0.55, rate: rnd(0.94, 1.06) });
    P.lastFire = SIM.time; P.recoil = 1;
    run.stats.shots++;
  }
  function fireSpray() {
    const st = P.st;
    const n = def.pellets + 2 * st.parallel + 2 * st.spread;
    const dmg = P.baseDmg() * (multishotK(n / def.pellets)) * volleyDmgMult();
    const spd = P.shotSpeed(), life = P.range() / spd;
    const cone = def.cone * (1 + 0.25 * st.spread);
    const flags = shotFlags();
    for (let i = 0; i < n; i++) {
      const a = P.aimAng + rnd(-cone / 2, cone / 2);
      const m = muzzle(a); const crit = critRoll();
      spawnPShot(m.x, m.y, a, {
        speed: spd * rnd(0.8, 1.12), r: 0.14 * st.sizeMult * rnd(0.85, 1.2), dmg: dmg * (crit ? st.critMult : 1), life: life * rnd(0.85, 1.1), style: 'spray',
        pierce: st.pierce, bounce: st.bounce, homing: st.homing, crit, flags, knock: 0.8, decel: 1.2,
      });
    }
    complementShot(dmg * 2);
    sfx('shoot_macrophage', { vol: 0.7, rate: rnd(0.94, 1.06) });
    Gfx.addShake(0.08);
    P.vx -= Math.cos(P.aimAng) * 1.5; P.vy -= Math.sin(P.aimAng) * 1.5;
    P.lastFire = SIM.time; P.recoil = 1; run.stats.shots++;
  }
  function fireLance(charge) {
    const st = P.st;
    const full = charge >= 0.98;
    const k = full ? 1 : Math.max(0.2, charge * 0.75);
    const nPar = 1 + st.parallel, nSpr = 1 + st.spread, n = nPar * nSpr;
    const dmg = P.baseDmg() * k * multishotK(n) * volleyDmgMult();
    const spd = P.shotSpeed() * (0.6 + 0.4 * Math.max(charge, 0.3));
    const life = P.range() / spd;
    const flags = shotFlags();
    const fan = Math.min(0.8, 0.18 * (nSpr - 1));
    for (let si = 0; si < nSpr; si++) {
      const a = P.aimAng + (nSpr === 1 ? 0 : (si / (nSpr - 1) - 0.5) * fan);
      for (let pi = 0; pi < nPar; pi++) {
        const off = (pi - (nPar - 1) / 2) * 0.26, m = muzzle(a), crit = critRoll();
        spawnPShot(m.x - Math.sin(a) * off, m.y + Math.cos(a) * off, a, {
          speed: spd, r: (full ? 0.17 : 0.12) * st.sizeMult, dmg: dmg * (crit ? st.critMult : 1), life, style: full ? 'lance' : 'lanceS',
          pierce: full ? st.pierce : Math.max(0, st.pierce - 2), bounce: st.bounce, homing: st.homing, crit, flags, knock: full ? 1.6 : 0.6,
        });
      }
    }
    if (full) { complementShot(dmg / multishotK(n)); Gfx.addShake(0.12); }
    sfx(full ? 'shoot_tcell_charged' : 'shoot_tcell', { vol: full ? 0.8 : 0.5, rate: rnd(0.95, 1.05) });
    P.fireT = full ? 0.08 : 0.26;
    P.lastFire = SIM.time; P.recoil = full ? 1.5 : 0.6; run.stats.shots++;
  }
  function complementShot(dmg) {
    const st = P.st; if (!st.complement) return;
    P.volley++;
    if (P.volley % st.complement !== 0) return;
    const m = muzzle(P.aimAng);
    spawnPShot(m.x, m.y, P.aimAng, { speed: P.shotSpeed() * 0.85, r: 0.3 * st.sizeMult, dmg: dmg * 3, life: P.range() * 1.2 / (P.shotSpeed() * 0.85), style: 'big', pierce: 99, homing: st.homing, flags: shotFlags(), knock: 2 });
  }

  /* ---------------- abilities ---------------- */
  function useAbility() {
    P.abilityT = P.abilityMax; P.abilityReadyPlayed = false;
    run.stats.abilities++;
    const a = def.ability;
    if (a === 'net') {
      const range = 6.5;
      let tx = P.x + Math.cos(P.aimAng) * range, ty = P.y + Math.sin(P.aimAng) * range;
      if (Input.device === 'kbm' && Input.mouseWorld && !Input.arrowAim) {
        const d = dist(P.x, P.y, Input.mouseWorld.x, Input.mouseWorld.y);
        if (d < range) { tx = Input.mouseWorld.x; ty = Input.mouseWorld.y; }
      }
      const land = World.nearestOpen(SIM.room, tx, ty);
      const lx = clamp(land.x, 1.5, SIM.room.W - 1.5), ly = clamp(land.y, 1.5, SIM.room.H - 1.5);
      sfx('ability_net');
      spawnLob(P.x, P.y, lx, ly, 0.32, { hex: '#bff8ff', size: 0.3, tele: false, peak: 1.8, onLand: (x, y) => {
        spawnZone(x, y, 2.5, 4.5, 'net', { owner: 'player', slow: 0.65, dps: P.baseDmg() * 1.5 });
        addRing(x, y, 2.5, '#bff8ff', 0.4);
        for (const e of SIM.enemies) if (!e.dead && dist2(e.x, e.y, x, y) < 2.5 * 2.5) dealDamage(e, P.baseDmg() * 1.2, { x, y, knock: 0.2, src: 'net' });
        sfx('acid', { vol: 0.5, rate: 1.4 });
      } });
    } else if (a === 'engulf') {
      sfx('ability_engulf');
      P.engulf = { t: 0, dur: 0.28, dx: Math.cos(P.aimAng), dy: Math.sin(P.aimAng), hit: new Set(), kills: 0 };
      P.invulnT = Math.max(P.invulnT, 0.4);
    } else if (a === 'mark') {
      sfx('ability_mark');
      let n = 0;
      for (const e of SIM.enemies) if (!e.dead && e.spawning <= 0) { e.markT = 6; n++; burst(e.x, e.y, '#9dff7a', 6, 2, { life: 0.4, size: 0.07, up: 3 }); }
      addRing(P.x, P.y, 6, '#9dff7a', 0.5);
      Gfx.caPulse = 0.4;
    } else if (a === 'swarm') {
      sfx('ability_swarm');
      for (let i = 0; i < 14; i++) {
        const ang = i / 14 * TAU;
        spawnPShot(P.x + Math.cos(ang) * 0.6, P.y + Math.sin(ang) * 0.6, ang, { speed: 6.5, r: 0.13, dmg: P.baseDmg() * 1.6, life: 6, style: 'anti', homing: 1.6, latch: true, knock: 0.4, pierce: 1 });
      }
      addRing(P.x, P.y, 2, '#c9bcff', 0.4);
    }
    Bus.emit('ability', a);
  }
  function updateEngulf(dt) {
    const E = P.engulf; E.t += dt;
    const sp = 15;
    P.vx = E.dx * sp; P.vy = E.dy * sp;
    if (Math.random() < 0.9) burst(P.x, P.y, P.color, 2, 1, { life: 0.3, size: 0.1, grav: 0, h: 0.5 });
    for (const e of SIM.enemies) {
      if (e.dead || e.spawning > 0 || E.hit.has(e.id)) continue;
      if (dist2(e.x, e.y, P.x, P.y) < (e.r + P.hitR + 0.55) ** 2) {
        E.hit.add(e.id);
        const dmg = P.baseDmg() * 16 * (e.isBoss ? 0.5 : 1);
        dealDamage(e, dmg, { x: P.x, y: P.y, vx: E.dx, vy: E.dy, knock: 2, src: 'engulf' });
        if (e.dead) { E.kills++; burst(e.x, e.y, e.color, 12, 3, { life: 0.4 }); }
        SIM.hitstop = Math.max(SIM.hitstop, 0.04);
      }
    }
    if (E.t >= E.dur) {
      if (E.kills >= 3) { P.heal(1); Gfx.floatText(P.x, P.y, 'DIGESTED +1', '#ffc27a', 14, { h: 1.8 }); }
      P.engulf = null; P.vx *= 0.3; P.vy *= 0.3;
    }
  }

  /* ---------------- death & revive ---------------- */
  P.die = function () {
    if (P.revives > 0) {
      P.revives--; const hp = P.reviveHp.shift() || 3;
      P.hp = Math.min(P.st.maxHp, hp); P.invulnT = 2.5;
      sfx('revive'); addRing(P.x, P.y, 5, '#ffffff', 0.6); Gfx.caPulse = 1;
      clearEShots(true);
      for (const e of SIM.enemies) if (!e.dead && dist2(e.x, e.y, P.x, P.y) < 25 && !e.isBoss) { e.kx += (e.x - P.x) * 3; e.ky += (e.y - P.y) * 3; }
      Bus.emit('revive');
      return;
    }
    P.dead = true; P.hp = 0;
    sfx('death');
    burst(P.x, P.y, P.color, 40, 6, { life: 0.9, size: 0.12, up: 4 });
    Gfx.splat(SIM.room, P.x, P.y, 1.2, P.color, 0.7);
    Gfx.addShake(0.8);
    Bus.emit('playerDied');
  };

  /* ---------------- killing ---------------- */
  P.onKill = function (e) {
    run.stats.kills++;
    if (e.isBoss) return;
    P.species.add(e.type);
    P.abilityT = Math.max(0, P.abilityT - (e.elite ? 0.8 : 0.4));
    run.killsByType[e.type] = (run.killsByType[e.type] || 0) + 1;
  };

  /* ---------------- companions ---------------- */
  function syncCompanions() {
    const st = P.st;
    const want = { satellite: st.satellites, helper: st.helpers, mast: st.mastcells };
    for (const kind in want) {
      const have = SIM.companions.filter(c => c.kind === kind);
      for (let i = have.length; i < want[kind]; i++) SIM.companions.push(makeCompanion(kind, i));
    }
  }
  function makeCompanion(kind, idx) {
    const c = { kind, idx, x: P.x, y: P.y, r: 0.22, t: rnd(0, 10), fireT: 0.5, blocks: kind === 'satellite', tick: 0, pulseT: 3 };
    c.node = buildCompanionVis(kind);
    return c;
  }
  P.respawnCompanions = function () {
    for (const c of SIM.companions) { c.node.dispose(); }
    SIM.companions.length = 0; syncCompanions();
    for (const c of SIM.companions) { c.x = P.x; c.y = P.y; }
  };
  function updateCompanions(dt) {
    const st = P.st, sats = SIM.companions.filter(c => c.kind === 'satellite');
    const others = SIM.companions.filter(c => c.kind !== 'satellite');
    for (const c of SIM.companions) {
      c.t += dt;
      if (c.kind === 'satellite') {
        const n = sats.length, a = SIM.time * 2.6 + (sats.indexOf(c) / n) * TAU;
        c.x = P.x + Math.cos(a) * 1.15; c.y = P.y + Math.sin(a) * 1.15;
        c.tick += dt;
        if (c.tick >= 0.25) {
          c.tick = 0;
          for (const e of SIM.enemies) if (!e.dead && e.spawning <= 0 && dist2(e.x, e.y, c.x, c.y) < (e.r + c.r + 0.1) ** 2) dealDamage(e, P.baseDmg() * 1.0 * st.companionMult, { x: c.x, y: c.y, knock: 0.6, src: 'satellite', silent: true });
        }
      } else {
        const i = others.indexOf(c), n = others.length;
        const behind = P.aimAng + Math.PI + (n > 1 ? (i / (n - 1) - 0.5) * 1.6 : 0);
        const tx = P.x + Math.cos(behind) * 1.1, ty = P.y + Math.sin(behind) * 1.1;
        const k = damp(5, dt); c.x = lerp(c.x, tx, k); c.y = lerp(c.y, ty, k);
        if (c.kind === 'helper' && SIM.combatAllowed) {
          c.fireT -= dt;
          const tgt = nearestEnemy(c.x, c.y, 9);
          if (tgt && c.fireT <= 0) {
            c.fireT = 0.5;
            const a = angleTo(c.x, c.y, tgt.x, tgt.y);
            spawnPShot(c.x, c.y, a, { speed: 11, r: 0.11, dmg: P.baseDmg() * 0.45 * st.companionMult, life: 0.8, style: 'helper', homing: 0.3, knock: 0.4, owner: 'helper' });
            sfx('shoot_helper', { vol: 0.35, rate: rnd(0.95, 1.1) });
          }
        } else if (c.kind === 'mast' && SIM.combatAllowed) {
          c.pulseT -= dt;
          if (c.pulseT <= 0) {
            c.pulseT = 3;
            const R = 2.7;
            addRing(c.x, c.y, R, '#ffd36b', 0.4);
            let any = false;
            for (const e of SIM.enemies) if (!e.dead && e.spawning <= 0 && dist2(e.x, e.y, c.x, c.y) < (R + e.r) ** 2) { any = true; dealDamage(e, P.baseDmg() * 2.6 * st.companionMult, { x: c.x, y: c.y, vx: e.x - c.x, vy: e.y - c.y, knock: 2.2, src: 'mast' }); }
            if (any) sfx('stun', { vol: 0.4, rate: 1.5 });
          }
        }
      }
      c.node.position.set(c.x, 0.55 + Math.sin(c.t * 3) * 0.08, -c.y);
      c.node.rotation.y += dt * 1.5;
    }
  }

  P.recompute();
  P.hp = P.st.maxHp;
  return P;
}

/* ---------------- visuals ---------------- */
function buildPlayerVis(def) {
  const root = Gfx.node('player');
  const body = Gfx.node('pbody'); body.parent = root;
  const id = def.id;
  const mem = Gfx.cellMat(def.color, { rim: 1.5, core: 0.32, glow: 0.45, dark: 0.55, alpha: 0.62, power: 1.6 });
  const nucMat = Gfx.cellMat(def.nucleus, { rim: 1.3, core: 0.55, glow: 0.4, dark: 0.7 });
  const R = id === 'macrophage' ? 0.46 : id === 'tcell' ? 0.36 : 0.4;
  const vis = { root, body, parts: {}, R };
  vis.parts.mem = Gfx.part('sphere', mem, body, 0, R, 0, R);
  // pseudopod toward aim (+X)
  vis.parts.pod = Gfx.part('sphere', mem, body, R * 0.7, R * 0.9, 0, R * 0.45);
  if (id === 'neutrophil') {
    vis.parts.nuc = [Gfx.part('sphere', nucMat, body, -0.08, R, 0.08, 0.13), Gfx.part('sphere', nucMat, body, 0.06, R, 0.1, 0.11), Gfx.part('sphere', nucMat, body, 0.02, R, -0.1, 0.12)];
    const gm = Gfx.glowMat('#e8ffff', { glow: 0.5 });
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; Gfx.part('sphereLo', gm, body, Math.cos(a) * R * 0.6, R + Math.sin(a * 2) * 0.1, Math.sin(a) * R * 0.6, 0.03); }
  } else if (id === 'macrophage') {
    vis.parts.nuc = [Gfx.part('sphere', nucMat, body, -0.05, R, 0, 0.18, 0.15, 0.22)];
    const lobe = Gfx.cellMat(def.color, { rim: 1.5, core: 0.32, glow: 0.4, dark: 0.55, alpha: 0.65 });
    vis.parts.lobes = [];
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.5; vis.parts.lobes.push(Gfx.part('sphere', lobe, body, Math.cos(a) * R * 0.75, R * 0.85, Math.sin(a) * R * 0.75, R * 0.38)); }
    const vac = Gfx.glowMat('#ffe7b0', { glow: 0.4, alpha: 0.8 });
    for (let i = 0; i < 4; i++) Gfx.part('sphereLo', vac, body, rnd(-0.2, 0.2), R + 0.05, rnd(-0.2, 0.2), 0.05);
  } else if (id === 'tcell') {
    vis.parts.nuc = [Gfx.part('sphere', nucMat, body, 0, R, 0, R * 0.62)];
    const sp = Gfx.glowMat('#d8ffe8', { glow: 0.6 });
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU, m = Gfx.part('cone', sp, body, Math.cos(a) * R * 0.98, R, Math.sin(a) * R * 0.98, 0.025, 0.07, 0.025);
      m.rotation.z = -Math.PI / 2; m.rotation.y = -a;
    }
  } else {
    vis.parts.nuc = [Gfx.part('sphere', nucMat, body, -0.03, R, 0, R * 0.55)];
    const ym = Gfx.glowMat('#e8e0ff', { glow: 0.55 });
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU, m = Gfx.part('box', ym, body, Math.cos(a) * R * 1.02, R, Math.sin(a) * R * 1.02, 0.07, 0.015, 0.015);
      m.rotation.y = -a;
    }
  }
  return vis;
}
function animatePlayerVis(P, dt) {
  const v = P.vis; if (!v) return;
  const t = SIM.time;
  v.root.position.set(P.x, 0, -P.y);
  v.body.rotation.y = P.aimAng;
  const sp = Math.hypot(P.vx, P.vy);
  P.recoil = Math.max(0, (P.recoil || 0) - dt * 8);
  const stretch = P.dashT > 0 || P.engulf ? 0.35 : Math.min(0.12, sp * 0.02);
  const wob = Math.sin(t * 7) * 0.03;
  // squash & stretch along move direction is approximated in aim space
  const mvA = Math.atan2(P.vy, P.vx) - P.aimAng;
  const sx = 1 + stretch * Math.abs(Math.cos(mvA)) + wob, sz = 1 + stretch * Math.abs(Math.sin(mvA)) - wob;
  v.parts.mem.scaling.set(v.R * sx, v.R * (1 - stretch * 0.4 + Math.sin(t * 5) * 0.03), v.R * sz);
  const podOut = 0.7 + P.recoil * 0.25 + (P.chargeHeld ? P.charge * 0.35 : 0);
  v.parts.pod.position.x = v.R * podOut;
  const ps = v.R * (0.42 + (P.chargeHeld ? P.charge * 0.18 : 0));
  v.parts.pod.scaling.set(ps, ps, ps);
  if (v.parts.nuc) v.parts.nuc.forEach((n, i) => { n.position.y = v.R + Math.sin(t * 2.3 + i * 2) * 0.03; });
  if (v.parts.lobes) v.parts.lobes.forEach((l, i) => { const s = v.R * (0.36 + Math.sin(t * 3 + i * 1.7) * 0.06); l.scaling.set(s, s, s); });
  // invulnerability blink + hurt flash
  const blink = P.invulnT > 0 && !P.engulf && P.dashT <= 0 && Math.floor(t * 18) % 2 === 0;
  v.root.setEnabled(!P.dead);
  if (!v.meshes) v.meshes = v.body.getChildMeshes();
  if (v.blink !== blink) { v.blink = blink; for (const m of v.meshes) m.visibility = blink ? 0.25 : 1; }
  if (P.hurtFlash > 0) { if (!v.flashing) { Gfx.setOverlay(v.body, true, '#ff2040', 0.7); v.flashing = true; } }
  else if (v.flashing) { Gfx.setOverlay(v.body, false); v.flashing = false; }
}
function buildCompanionVis(kind) {
  const root = Gfx.node('comp_' + kind);
  if (kind === 'satellite') {
    Gfx.part('sphere', Gfx.cellMat('#e8f8ff', { rim: 1.6, core: 0.4, glow: 0.5, dark: 0.6 }), root, 0, 0, 0, 0.22);
    Gfx.part('sphereLo', Gfx.glowMat('#7ff3ff', { glow: 0.6 }), root, 0, 0.02, 0, 0.09);
  } else if (kind === 'helper') {
    Gfx.part('sphere', Gfx.cellMat('#c8ffd0', { rim: 1.5, core: 0.35, glow: 0.45, dark: 0.55, alpha: 0.7 }), root, 0, 0, 0, 0.24);
    Gfx.part('sphere', Gfx.cellMat('#3a9a5a', { rim: 1.2, core: 0.6, glow: 0.3 }), root, 0, 0, 0, 0.14);
  } else {
    Gfx.part('sphere', Gfx.cellMat('#ffd36b', { rim: 1.5, core: 0.35, glow: 0.45, dark: 0.55, alpha: 0.7 }), root, 0, 0, 0, 0.26);
    const g = Gfx.glowMat('#ff9a3a', { glow: 0.6 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; Gfx.part('sphereLo', g, root, Math.cos(a) * 0.14, 0.04, Math.sin(a) * 0.14, 0.045); }
  }
  return root;
}
