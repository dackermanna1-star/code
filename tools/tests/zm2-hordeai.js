// Zombie survival, Milestone 2.3 (horde AI, zhorde.js): side flow fields (crowding penalty,
// per-wave seeded noise, a field for life, about diff.ai.flank of the commons), ring slots round
// a survivor within diff.ai.surround (with the canWalk fallback in a corridor), the bigger crowd
// per difficulty (zdiff HORDE), zombies not getting stuck over a long run, and the cost: ms per
// tick / frame with 28 up and 3 bots, the horde AI on and off (A/B in the same page).
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=3" tools/tests/zm2-hordeai.js /tmp/zm2h
// Prints "[sim] PASS ..." / "[sim] FAIL ..." and "[sim] INFO ..." lines, and one screenshot
// (<outPrefix>_0.png: a ring of zombies round you, from above).
/* global performance */
(() => {
  const g = window.__game;
  const out = [];
  let pass = 0, fail = 0;
  const check = (name, ok, info = '') => { if (ok) pass++; else fail++; out.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
  const info = (s) => out.push(`[sim] INFO ${s}`);
  const ticks = (n) => { for (let i = 0; i < n; i++) g.tick(); };
  const con = (line) => { const lines = []; const pr = g.console.menus.print; g.console.menus.print = (t) => lines.push(String(t)); try { g.console.exec(line); } finally { g.console.menus.print = pr; } return lines.join(' | '); };
  const Z = () => g.zombies;
  const H = () => g.zombies.horde;
  const me = () => g.local;
  const flat = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function newRun(opts = {}) {
    g.newGame({ mode: 'zombies', allies: 3, ...opts });
    g.joinTeam(g.local, 'CT');
    g.bots.fillTeams(opts.allies ?? 3);
    ticks(50);
    me().god = true;
    con('sv_cheats 1');
  }
  /** The break holds (no wave): only the zombies a step places. */
  const holdBreak = () => { Z().nextWaveAt = 1e9; Z().clearHorde(); };
  const put = (p, n) => { p.pm.origin = [n.x, n.y, n.z + 37]; p.prevOrigin = p.pm.origin.slice(); p.pm.velocity = [0, 0, 0]; };
  /** A route down field f from node n (node ids), until the field's end or within stop of it. */
  function route(n, f, stop = 0) {
    const ids = [];
    for (let i = 0; i < 400 && n && f[n.id] > stop; i++) { ids.push(n.id); const h = Z().nextHop(n, f); n = h && h.node; }
    return ids;
  }
  const overlap = (a, set) => (a.length ? a.filter((id) => set.has(id)).length / a.length : 1);
  /** How many of the 8 ring points (r out) round node n can be walked to from it. */
  function ringOk(n, r) {
    const f = [n.x, n.y, n.z];
    let ok = 0;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if (g.nav.canWalk(f, [n.x + Math.cos(a) * r, n.y + Math.sin(a) * r, n.z])) ok++; }
    return ok;
  }
  /** A nav node ~d (path) from n, for a pack to come from. */
  function from(n, d) {
    const ring = g.nav.around(n, d + 80, 3000).filter((x) => x.dist > d - 60 && (x.node.support ?? 5) >= 3);
    return ring.length ? ring[0].node : null;
  }
  /** Bring k commons up at node f (a pack all from one side), and see where they stand after s seconds. */
  function pack(f, k) {
    const zs = [];
    for (let i = 0; i < k; i++) {
      const up = new Set(Z().pool.filter((q) => q.alive));
      Z().spawnZombie({ at: [f.x, f.y, f.z + 37], variant: 'walker' }); // (all on one spot: they walk through each other)
      const z = Z().pool.find((q) => q.alive && !up.has(q));
      z.health = z.maxHealth = 1e6; z.zDamage = 0;
      zs.push(z);
    }
    return zs;
  }
  /** How the pack stands round you: within 130 u, and how many of 8 bearing sectors (45 deg) they fill. */
  function spread(zs, p) {
    const sec = new Set();
    let near = 0;
    for (const z of zs) {
      if (!z.alive || flat(z.pm.origin, p.pm.origin) > 130) continue;
      near++;
      const a = Math.atan2(z.pm.origin[1] - p.pm.origin[1], z.pm.origin[0] - p.pm.origin[0]);
      sec.add(((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8);
    }
    return { near, sectors: sec.size };
  }
  const steps = [];
  let camUndo = null;

  // ---------------------------------------------------------------- the tables (zdiff.js)
  steps.push(async () => {
    const ZD = await import('/src/game/zdiff.js');
    const D = ZD.ZDIFF, ids = ['casual', 'normal', 'hard', 'nightmare'];
    const A = ids.map((id) => D[id].ai);
    check('ai group: flank about 30% on Normal, rising with the difficulty', Math.abs(D.normal.ai.flank - 0.3) < 0.051 && A.every((a, i) => !i || a.flank >= A[i - 1].flank) && A.every((a) => a.fields >= 1 && a.fields <= 2 && a.surround >= 200 && a.slots >= 6), A.map((a) => `${a.flank}/${a.fields}/${a.surround}/${a.slots}`).join(' '));
    const W = (id, n, c) => ZD.waveStats(n, { diff: D[id], crowd: c });
    // crowd: 1 = solo; 2.5 = you + 3 bots (the default); 6 = you + 10 bots (the most)
    let mono = true, capOk = true;
    for (let n = 1; n <= 60; n++) for (const c of [1, 2.5, 4, 6]) {
      const a = W('casual', n, c).maxAlive, b = W('normal', n, c).maxAlive, h = W('hard', n, c).maxAlive, m = W('nightmare', n, c).maxAlive;
      if (!(a <= b && b <= h && h <= m)) mono = false;
      if (m > ZD.MAX_ALIVE) capOk = false;
    }
    check('up at once rises casual -> nightmare, never past MAX_ALIVE', mono && capOk && ZD.MAX_ALIVE === 28);
    const late = W('normal', 30, 6).maxAlive, solo = W('normal', 20, 1).maxAlive, def = W('normal', 20, 2.5).maxAlive;
    check('Normal: up to about 28 late with a full squad, solo unchanged (fair)', late >= 25 && W('normal', 40, 6).maxAlive >= 27 && solo <= 10 && W('normal', 12, 1).maxAlive <= 10 && def <= 14, `normal w30 full ${late}, w40 full ${W('normal', 40, 6).maxAlive}, w20 default squad ${def}, w20 solo ${solo}`);
    check('Hard / Nightmare: the bigger crowd', W('hard', 20, 2.5).maxAlive > def && W('nightmare', 20, 2.5).maxAlive > W('hard', 20, 2.5).maxAlive && W('nightmare', 15, 6).maxAlive === 28 && W('hard', 12, 1).maxAlive >= 11, `w20 default squad hard ${W('hard', 20, 2.5).maxAlive} nightmare ${W('nightmare', 20, 2.5).maxAlive}; w12 solo hard ${W('hard', 12, 1).maxAlive}`);
    return false;
  });

  // ---------------------------------------------------------------- side fields on a real wave
  steps.push(async () => {
    newRun({ allies: 3, zdiff: 'normal' });
    con('zm_god_squad');
    con('zm_wave 8');
    Z().stats = { ...Z().stats, count: 400, maxAlive: 24, interval: 0.15, special: 0 };
    const life = new Map();
    const sp0 = H().spawned.bind(H());
    H().spawned = (z) => { sp0(z); life.set(z, z.field); };
    let changed = 0, flankNow = 0, sideFieldUse = 0;
    for (let i = 0; i < 2000; i++) {
      g.tick();
      if (i % 20 === 0) {
        for (const z of Z().pool) {
          if (!z.alive || !life.has(z)) continue;
          if (z.field !== life.get(z)) changed++;
          if (z.field) { flankNow++; if (H().field(z) !== Z().dist) sideFieldUse++; }
        }
      }
    }
    H().spawned = sp0;
    const c = H().counts, F = Z().diff.ai.fields;
    info(`normal w8: ${c.commons} commons, ${c.flank} flankers, ${c.builds} side builds, ${c.slots} slots taken, ${c.fallback} ring fallbacks, ${c.recycled} recycled`);
    check('side fields built while flankers are up', H().side.length === 2 && H().builtT.slice(0, F).every((x) => x > 0) && c.builds >= 10, `builds ${c.builds}`);
    const share = c.flank / Math.max(1, c.commons);
    check('diff.ai.flank of the commons flank (to the zombie)', c.commons >= 20 && Math.abs(c.flank - c.commons * Z().diff.ai.flank) <= 1, `${c.flank}/${c.commons} = ${share.toFixed(2)} (flank ${Z().diff.ai.flank})`);
    check('each zombie keeps its field for life', changed === 0 && flankNow > 0, `changes ${changed}`);
    check('flankers walk their side field (until close)', sideFieldUse > 0, `${sideFieldUse} side-field samples`);
    // a boss, a special, a main-field common and an unbuilt field: the main field
    const zc = Z().pool.find((z) => z.alive && !z.special && !z.field);
    check('horde.field: the main field for bosses, specials and field 0', H().field({ isBoss: true, field: 1, node: g.nav.nodes[0] }) === Z().dist && H().field({ special: 'hunter', field: 2, node: g.nav.nodes[0] }) === Z().dist && (!zc || H().field(zc) === Z().dist));
    // coverage and different routes, from far spawn spots
    const dist = Z().dist, cands = Z().spawnCandidates().filter((n) => dist[n.id] > 1600 && dist[n.id] < 6000);
    for (let k = 0; k < F; k++) {
      const f = H().side[k];
      let fin = 0, both = 0;
      for (let i = 0; i < dist.length; i++) if (dist[i] < Infinity) { both++; if (f[i] < Infinity) fin++; }
      const diffs = [], ratio = [];
      for (let s = 0; s < 60 && cands.length; s++) {
        const n = cands[(s * 7919) % cands.length];
        const m = route(n, dist, 450), sd = route(n, f, 0).filter((id) => dist[id] > 450);
        diffs.push(overlap(sd, new Set(m)));
        ratio.push(sd.length / Math.max(1, m.length));
      }
      diffs.sort((a, b) => a - b); ratio.sort((a, b) => a - b);
      const avg = diffs.reduce((a, b) => a + b, 0) / Math.max(1, diffs.length), apart = diffs.filter((x) => x < 0.5).length / Math.max(1, diffs.length);
      check(`side field ${k + 1} reaches everywhere the main one does`, fin >= both * 0.99, `${fin}/${both}`);
      check(`side field ${k + 1} takes other routes (but not absurd ones)`, avg < 0.75 && apart >= 0.2 && ratio[ratio.length >> 1] < 2.2, `mean overlap with the main route ${avg.toFixed(2)}, ${(apart * 100).toFixed(0)}% under half, median length x${ratio[ratio.length >> 1].toFixed(2)}`);
    }
    return false;
  });

  // ---------------------------------------------------------------- the noise (seeded per wave) and the crowding penalty
  steps.push(async () => {
    const h = H(), w = Z().wave;
    const a = Float32Array.from(h.noise(0));
    h.noiseKey[0] = -1;
    const b = Float32Array.from(h.noise(0));
    let same = true;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { same = false; break; }
    Z().wave = w + 1; h.noiseKey[0] = -1;
    const c = Float32Array.from(h.noise(0));
    const o = Float32Array.from(h.noise(1));
    Z().wave = w; h.noiseKey[0] = -1; h.noiseKey[1] = -1; h.noise(0); h.noise(1);
    let dc = 0, d1 = 0, lo = Infinity, hi = 0;
    for (let i = 0; i < a.length; i++) { if (Math.abs(a[i] - c[i]) > 0.05) dc++; if (Math.abs(c[i] - o[i]) > 0.05) d1++; lo = Math.min(lo, a[i]); hi = Math.max(hi, a[i]); }
    check('noise: the same all wave, new next wave, its own per field', same && dc > a.length * 0.3 && d1 > a.length * 0.3 && lo >= 1 && hi <= 2.61 && hi > 1.5, `range ${lo.toFixed(2)}..${hi.toFixed(2)}, ${dc} nodes differ next wave, ${d1} between fields`);
    // crowding: a heavy crowd on one route pushes the side field off it
    const dist = Z().dist, cands = Z().spawnCandidates().filter((n) => dist[n.id] > 1800 && dist[n.id] < 5000);
    const crowd0 = h.crowd;
    let better = 0, tried = 0, before = 0, after = 0;
    for (let s = 0; s < 12 && cands.length; s++) {
      const n = cands[(s * 104729) % cands.length];
      const m = route(n, dist, 450), set = new Set(m);
      h.crowd = () => { h.traffic.fill(0); return h.traffic; };
      h.build(0, g.time);
      const s0 = overlap(route(n, h.side[0], 0).filter((id) => dist[id] > 450), set);
      h.crowd = () => { const tr = h.traffic; tr.fill(0); for (const id of m) { tr[id] += 6; for (const e of g.nav.nodes[id].edges) tr[e.to] += 3; } return tr; };
      h.build(0, g.time);
      const s1 = overlap(route(n, h.side[0], 0).filter((id) => dist[id] > 450), set);
      tried++; before += s0; after += s1;
      if (s1 <= s0) better++;
    }
    h.crowd = crowd0;
    h.build(0, g.time);
    check('crowding penalty: the side field steers off a crowded route', tried && better >= tried * 0.75 && after < before, `overlap with the crowded route ${(before / tried).toFixed(2)} -> ${(after / tried).toFixed(2)} (${better}/${tried} no worse)`);
    // the real crowd: zombies heading somewhere load the traffic
    h.crowd(1);
    let load = 0;
    for (const x of h.traffic) load += x;
    check('crowding counts the zombies heading through', load > 0, `traffic ${load.toFixed(0)}`);
    return false;
  });

  // ---------------------------------------------------------------- ring slots in the open (and the same pack with the horde AI off)
  let ringSpot = null;
  const ringRun = (on) => {
    newRun({ allies: 0, zdiff: 'normal' });
    holdBreak();
    const p = me();
    put(p, ringSpot.n);
    g.frame(1 / 60);
    H().on = on;
    Z().buildFlow();
    const zs = pack(ringSpot.f, 8);
    const zs0 = zs.map((z) => Math.atan2(z.pm.origin[1] - p.pm.origin[1], z.pm.origin[0] - p.pm.origin[0]));
    let best = { near: 0, sectors: 0 }, dup = 0;
    for (let i = 0; i < 900; i++) {
      g.tick();
      p.pm.velocity[0] = p.pm.velocity[1] = 0;
      if (i > 400 && i % 25 === 0) {
        const s = spread(zs, p);
        if (s.sectors > best.sectors || (s.sectors === best.sectors && s.near > best.near)) best = s;
        const held = zs.filter((z) => z.slot >= 0 && z.slotOf === p).map((z) => z.slot);
        if (new Set(held).size !== held.length) dup++;
      }
    }
    H().on = true;
    return { best, dup, zs, from: Math.max(...zs0) - Math.min(...zs0) };
  };
  steps.push(async () => {
    newRun({ allies: 0, zdiff: 'normal' });
    // an open spot: every ring point and every point 160 u out walkable, lots of floor round it
    const nodes = g.nav.nodes;
    for (let i = 0; i < nodes.length && !ringSpot; i += 37) {
      const n = nodes[i];
      if ((n.support ?? 5) < 5 || n.edges.length < 8 || ringOk(n, 56) < 8 || ringOk(n, 160) < 8) continue;
      const f = from(n, 520);
      if (f && Z().spawnCandidates().length) ringSpot = { n, f };
    }
    check('found an open spot', !!ringSpot);
    if (!ringSpot) return false;
    const on = ringRun(true), off = ringRun(false);
    info(`8 zombies from one side (spread ${(on.from * 180 / Math.PI).toFixed(0)} deg): horde AI on ${on.best.near} close in ${on.best.sectors}/8 sectors, off ${off.best.near} in ${off.best.sectors}/8`);
    check('they spread into a ring round you', on.best.near >= 6 && on.best.sectors >= 5, `${on.best.near} within 130 u in ${on.best.sectors} sectors`);
    check('more of a ring than the straight rush', on.best.sectors > off.best.sectors, `${on.best.sectors} vs ${off.best.sectors}`);
    check('one zombie a slot', on.dup === 0);
    return false;
  });

  // ---------------------------------------------------------------- a picture of the ring (from above)
  steps.push(async () => {
    if (!ringSpot) return false;
    newRun({ allies: 0, zdiff: 'normal' });
    holdBreak();
    const p = me();
    put(p, ringSpot.n);
    Z().buildFlow();
    const zs = pack(ringSpot.f, 8);
    for (let i = 0; i < 1000; i++) { g.tick(); p.pm.velocity[0] = p.pm.velocity[1] = 0; if (i > 500 && spread(zs, p).sectors >= 6) break; }
    for (const z of zs) z.nextAttack = 1e9; // (no swipes: a still picture)
    const s = spread(zs, p);
    info(`picture: ${s.near} round you in ${s.sectors} sectors`);
    g.hud?.centerPrint?.('', 0); // (the prints of the runs before: out of the way)
    const o = p.pm.origin, eye = [o[0] - 105, o[1] - 20, o[2] + 150];
    const yaw = Math.atan2(o[1] - eye[1], o[0] - eye[0]) * 180 / Math.PI, pitch = Math.atan2(eye[2] - o[2] + 20, Math.hypot(o[0] - eye[0], o[1] - eye[1])) * 180 / Math.PI;
    const uc = g.updateCamera;
    g.updateCamera = function () { this.renderer.setView(eye, pitch, yaw, 0); this.camPos = eye; this.drawVm = false; };
    if (p.model) p.model.object3D.visible = true;
    camUndo = () => { g.updateCamera = uc; };
    return { shot: true, wait: 400 };
  });

  // ---------------------------------------------------------------- a corridor: slots behind walls are never given, and they still get to you
  steps.push(async () => {
    camUndo?.(); camUndo = null;
    newRun({ allies: 0, zdiff: 'normal' });
    holdBreak();
    const nodes = g.nav.nodes;
    let spot = null;
    for (let i = 0; i < nodes.length && !spot; i += 23) {
      const n = nodes[i];
      if ((n.support ?? 5) < 5) continue;
      const k = ringOk(n, 56);
      if (k < 2 || k > 4) continue;
      const f = from(n, 450);
      if (f) spot = { n, f };
    }
    check('found a corridor', !!spot);
    if (!spot) return false;
    const p = me();
    put(p, spot.n);
    Z().buildFlow();
    let claws = 0;
    const dp = g.damagePlayer;
    g.damagePlayer = function (v, a, ...r) { if (v === p && a?.isZombie) claws++; return dp.call(this, v, a, ...r); };
    const zs = pack(spot.f, 6);
    zs.forEach((z) => { z.zDamage = 1; });
    let near = 0;
    for (let i = 0; i < 1200; i++) {
      g.tick();
      p.pm.velocity[0] = p.pm.velocity[1] = 0;
      if (i % 50 === 0) near = Math.max(near, zs.filter((z) => flat(z.pm.origin, p.pm.origin) < 110).length);
    }
    g.damagePlayer = dp;
    const r = H().rings.get(p);
    const ok = r ? r.ok.slice(0, r.n).filter(Boolean).length : -1;
    const bad = zs.filter((z) => z.slot >= 0 && r && !r.ok[z.slot]).length;
    info(`corridor: ${ok}/${r?.n} slots walkable, ${H().counts.fallback} fallbacks, ${near} close, ${claws} claws`);
    check('slots behind walls are never given', r && ok < r.n && bad === 0, `${ok} of ${r?.n} usable, ${bad} zombies on a walled slot`);
    check('in a corridor they still get to you', near >= 4 && claws > 0 && zs.every((z) => !z.stuckSince), `${near} close, ${claws} claws`);
    return false;
  });

  // ---------------------------------------------------------------- a long run: nobody gets stuck
  let long = null, nextShot = 0;
  function turret() {
    const p = me();
    if (!p.alive || g.time < nextShot) return;
    nextShot = g.time + 0.15;
    const eye = p.eyePos();
    let best = null, bc = null, bd = 1400;
    for (const z of Z().pool) {
      if (!z.alive) continue;
      const c = [z.pm.origin[0], z.pm.origin[1], z.pm.origin[2] + 10], d = Math.hypot(c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]);
      if (d < bd && g.visible(eye, c)) { bd = d; best = z; bc = c; }
    }
    if (!best) return;
    const dir = [(bc[0] - eye[0]) / bd, (bc[1] - eye[1]) / bd, (bc[2] - eye[2]) / bd];
    g.damagePlayer(best, p, 36, 2, 'ak47', dir, [bc[0] - dir[0] * 10, bc[1] - dir[1] * 10, bc[2] - dir[2] * 10]);
  }
  const longRun = () => {
    if (!long) {
      newRun({ allies: 3, zdiff: 'hard' });
      con('zm_god_squad');
      con('zm_wave 6');
      long = { t0: g.time, w0: Z().wave, samples: 0, stuckSum: 0, stuckMax: 0, longStuck: 0, spawned: 0 };
      const sp0 = Z().spawnZombie.bind(Z());
      long.undo = () => { Z().spawnZombie = sp0; };
      Z().spawnZombie = (o) => { const r = sp0(o); if (r) long.spawned++; return r; };
    }
    // frames (the squad's bullets hit what the models show) and you on a turret (an AK on the nearest zombie in sight)
    for (let i = 0; i < 1200; i++) {
      g.frame(0.05);
      turret();
      if (i % 10 === 0) {
        let s = 0, ls = 0;
        for (const z of Z().pool) if (z.alive && z.stuckSince) { s++; if (g.time - z.stuckSince > 3) ls++; }
        long.samples++; long.stuckSum += s; long.stuckMax = Math.max(long.stuckMax, s); long.longStuck += ls;
      }
    }
    return g.time - long.t0 >= 240;
  };
  steps.push(async () => {
    if (!longRun()) { out.push(`[sim] INFO long run t=${(g.time - long.t0).toFixed(0)} s wave ${Z().wave} ${con('zm_horde')}`); return 'again'; }
    long.undo();
    const c = H().counts, waves = Z().wave - long.w0;
    info(`long run (hard, 3 bots, 240 s): waves ${long.w0}->${Z().wave}, ${long.spawned} spawned, stuck mean ${(long.stuckSum / long.samples).toFixed(2)} max ${long.stuckMax}, stuck 3 s+ samples ${long.longStuck}, recycled ${c.recycled}, flankers ${c.flank}/${c.commons}`);
    check('long run: waves go by', waves >= 2, `${waves}`);
    check('long run: zombies don\'t get stuck', long.stuckSum / long.samples < 1.5 && c.recycled <= 3 + long.spawned * 0.05, `stuck mean ${(long.stuckSum / long.samples).toFixed(2)}, recycled ${c.recycled} of ${long.spawned}`);
    check('zm_horde reports', /horde: \d+ up/.test(con('zm_horde')));
    return false;
  });

  // ---------------------------------------------------------------- the cost: 28 up and 3 bots, the horde AI on / off
  steps.push(async () => {
    newRun({ allies: 3, zdiff: 'normal' });
    con('zm_god_squad');
    con('zm_wave 12');
    Z().stats = { ...Z().stats, count: 5000, maxAlive: 28, interval: 0.02, special: 0 };
    const keep = () => { for (const z of Z().pool) if (z.alive) z.health = Math.max(z.health, 1e6); };
    for (let i = 0; i < 2500; i++) { g.tick(); if (i % 25 === 0) keep(); }
    const T = { on: [], off: [] }, F = { on: [], off: [] };
    for (const on of [true, false, false, true, true, false, false, true]) {
      H().on = on;
      let t0 = performance.now();
      for (let i = 0; i < 300; i++) { g.tick(); if (i % 30 === 0) keep(); }
      T[on ? 'on' : 'off'].push((performance.now() - t0) / 300);
      t0 = performance.now();
      for (let i = 0; i < 120; i++) { g.frame(1 / 60); if (i % 30 === 0) keep(); }
      F[on ? 'on' : 'off'].push((performance.now() - t0) / 120);
    }
    H().on = true;
    let up = 0;
    for (const z of Z().pool) if (z.alive) up++;
    const med = (a) => { const s = a.slice().sort((x, y) => x - y); return (s[1] + s[2]) / 2; };
    const t1 = med(T.on), t0 = med(T.off), f1 = med(F.on), f0 = med(F.off);
    info(`${up} up, 3 bots: ms/tick ${t1.toFixed(3)} on / ${t0.toFixed(3)} off (${((t1 / t0 - 1) * 100).toFixed(0)}%), ms/frame ${f1.toFixed(2)} on / ${f0.toFixed(2)} off (${((f1 / f0 - 1) * 100).toFixed(0)}%)`);
    let b0 = performance.now();
    for (let i = 0; i < 20; i++) Z().buildFlow();
    const mainMs = (performance.now() - b0) / 20;
    b0 = performance.now();
    for (let i = 0; i < 20; i++) H().build(i & 1, g.time);
    const sideMs = (performance.now() - b0) / 20;
    info(`one main field build ${mainMs.toFixed(2)} ms (every 0.4 s), one side field build with its crowd ${sideMs.toFixed(2)} ms (one every ~0.5 s, never on a main build's tick)`);
    check('28 up', up === 28, `${up}`);
    // (timings are machine dependent and noisy: only a gross regression fails)
    check('the horde AI costs little', f1 < f0 * 1.35 + 0.3 && t1 < t0 * 1.5 + 0.1, `frame x${(f1 / f0).toFixed(2)}, tick x${(t1 / t0).toFixed(2)}`);
    return true;
  });

  let i = 0;
  window.__drive = async () => {
    out.length = 0;
    let done = false, r = null;
    try { r = await steps[i++](); } catch (e) { check('step ' + i + ' threw', false, e.stack); r = true; }
    if (r === 'again') { i--; r = false; } // (a long step, a call at a time: the page stays responsive)
    done = r === true || i >= steps.length;
    if (done) out.push(`[sim] ${fail ? 'FAILED' : 'ALL PASSED'}: ${pass} passed, ${fail} failed`);
    const res = { log: out.join('\n'), done };
    if (r && typeof r === 'object') Object.assign(res, r, { done });
    return res;
  };
})();
