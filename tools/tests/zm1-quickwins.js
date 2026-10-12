// Zombie survival, Milestone 1 quick wins: radio orders the bots obey (zorders.js), the
// specials' warning call from the special itself (specials.js warn), no NVGs for sale, and
// the baked bodies bucketed by area for bullet hits (corpsegrid.js, gore.corpseHit).
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=3" tools/tests/zm1-quickwins.js /tmp/zq
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&team=t&bots=5&freeze=2" tools/tests/zm1-quickwins.js /tmp/zq   (classic: unchanged)
// Prints "[sim] PASS ..." / "[sim] FAIL ..." and the corpse-hit timings ("[sim] corpseHit ...").
/* global performance */
(() => {
  const g = window.__game;
  const out = [];
  let pass = 0, fail = 0;
  const check = (name, ok, info = '') => { if (ok) pass++; else fail++; out.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
  const ticks = (n) => { for (let i = 0; i < n; i++) g.tick(); };
  const flat = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const Z = () => g.zombies;
  const me = () => g.local;
  const bots = () => g.bots.bots.filter((b) => b.p.alive && b.p.team === me().team);
  const radio = (text) => { g.rounds.radio(me(), text); g.bots.onRadio(me(), text); };
  const tp = (p, n) => { p.pm.origin = [n.x, n.y, n.z + 37]; p.pm.velocity = [0, 0, 0]; };
  // a fixed pseudo-random sequence (the corpse test is the same every run)
  let seed = 12345;
  const rr = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  /** Tick until f() holds (or s seconds went by); the seconds it took, or -1. */
  const until = (f, s, fr = false) => { const t0 = g.time; while (g.time - t0 < s) { if (fr) fticks(10); else ticks(10); if (f()) return g.time - t0; } return -1; };
  // ticks with a frame now and then (the bots' bullets need the hitboxes to follow the models)
  const fticks = (n) => { for (let i = 0; i < n; i++) { g.tick(); if (i % 5 === 4) g.frame(0.05); } };
  const steps = [];

  // ================================================================ classic: unchanged
  if (!Z()?.enabled) {
    steps.push(() => {
      for (let i = 0; i < 300; i++) g.tick();
      const p = me();
      p.money = 5000;
      const okBuy = g.rounds.buy(p, 'nvgs');
      check('classic: nvgs still sold', okBuy && p.money === 3750, `ok=${okBuy} $${p.money}`);
      const mates = bots().filter((b) => b.p !== p);
      radio('Hold this position.');
      const held = mates.filter((b) => b.holdHere);
      const near = mates.filter((b) => flat(b.p.pm.origin, p.pm.origin) < 700);
      check('classic: hold uses the stock rule (bots within 700)', held.length === near.length, `${held.length}/${near.length}`);
      radio('Follow me.');
      // the stock rule: two close by follow, and the hold isn't lifted (follow outranks it in Bot.objective)
      check('classic: follow me takes at most 2, holds stay', mates.filter((b) => b.follow).length <= 2 && mates.filter((b) => b.holdHere).length === held.length && mates.every((b) => !b.fallback));
      return true;
    });
  } else {
    // ================================================================ setup
    steps.push(() => {
      g.console.exec('sv_cheats 1');
      for (const p of g.players) if (p.team === 'CT') p.god = true;
      Z().nextWaveAt = g.time + 1e6; // a long quiet break
      ticks(200);
      for (const b of bots()) if (!b.p.weapons[1]) g.giveWeapon(b.p, 'ak47', { select: true }); // (whatever the economy let them buy)
      check('setup: squad', bots().length >= 1 && me().alive && Z().state === 'break', `${bots().length} bots, ${Z().state}`);
      return true;
    });

    // ================================================================ NVGs
    steps.push(async () => {
      const p = me(), m0 = p.money;
      const ok = g.rounds.buy(p, 'nvgs');
      check('nvgs not sold in zombie mode', !ok && p.money === m0, `ok=${ok} $${m0}->${p.money}`);
      const B = await import('/src/ui/menu/buydata.js');
      const listed = Object.keys(B.MENU).filter((c) => B.itemsFor(c, 'ALL').includes('nvgs'));
      check('nvgs not in the zombie buy menu', !listed.length, listed.join());
      return true;
    });

    // ================================================================ radio orders (quiet)
    let home = null, far = null;
    steps.push(() => {
      const p = me();
      home = g.nav.nearest(p.feet(), 300);
      // a spot 850-1100 units away along the floor, well apart in a straight line too
      const cands = g.nav.around(home, 1100, 6000).filter((e) => e.dist > 850 && flat([e.node.x, e.node.y], [home.x, home.y]) > 650 && Math.abs(e.node.z - home.z) < 150);
      cands.sort((a, b) => a.node.id - b.node.id);
      far = cands.length ? cands[Math.floor(cands.length / 2)].node : null;
      check('test spots', !!home && !!far, `${cands.length} candidates`);
      if (!far) return 'skip';
      // the default: they stick with you
      const t = until(() => bots().every((b) => flat(b.p.pm.origin, p.pm.origin) < 320), 15);
      check('default: bots stick with you', t >= 0, `${t.toFixed(1)}s`);
      return true;
    });
    let holdPos = null;
    steps.push(() => {
      const p = me();
      const pend = () => bots().some((b) => b.pendingRadio.some((r) => r.text === 'Affirmative.'));
      radio('Hold this position.');
      check('hold: a bot answers', pend());
      holdPos = new Map(bots().map((b) => [b, b.p.feet()]));
      check('hold: every bot close by holds', bots().every((b) => b.holdHere), bots().map((b) => !!b.holdHere).join());
      tp(p, far);
      ticks(600);
      const drift = bots().map((b) => flat(b.p.pm.origin, holdPos.get(b)) | 0);
      const away = bots().map((b) => flat(b.p.pm.origin, p.pm.origin) | 0);
      check('hold: they stay put while you walk off', drift.every((d) => d < 90) && away.every((d) => d > 500), `drift ${drift} away ${away}`);
      return true;
    });
    steps.push(() => {
      const p = me();
      radio('Follow me.');
      check('follow: the hold is over', bots().every((b) => b.follow && !b.holdHere));
      const t = until(() => bots().every((b) => flat(b.p.pm.origin, p.pm.origin) < 300), 20);
      check('follow: they come to you', t >= 0, `${t.toFixed(1)}s, at ${bots().map((b) => flat(b.p.pm.origin, p.pm.origin) | 0)}`);
      return true;
    });
    steps.push(() => {
      const p = me();
      // a hold given while following replaces it (it used to lose to the 25 s follow)
      radio('Hold this position.');
      holdPos = new Map(bots().map((b) => [b, b.p.feet()]));
      tp(p, home);
      ticks(500);
      const drift = bots().map((b) => flat(b.p.pm.origin, holdPos.get(b)) | 0);
      check('hold after follow: they hold', drift.every((d) => d < 90), `drift ${drift}`);
      radio('Team, fall back!');
      check('fall back: everybody', bots().every((b) => b.fallback && b.fallback.p === p && !b.holdHere && !b.follow));
      const t = until(() => bots().every((b) => !b.fallback), 20);
      const d = bots().map((b) => flat(b.p.pm.origin, p.pm.origin) | 0);
      check('fall back: back to you, then the order is over', t >= 0 && d.every((x) => x < 300), `${t.toFixed(1)}s, at ${d}`);
      return true;
    });
    steps.push(() => {
      const p = me();
      // orders run out: then they stick with you again
      radio('Hold this position.');
      holdPos = new Map(bots().map((b) => [b, b.p.feet()]));
      tp(p, far);
      ticks(2500);
      const drift = bots().map((b) => flat(b.p.pm.origin, holdPos.get(b)) | 0);
      check('hold: still holding at 25 s', drift.every((d) => d < 90), `drift ${drift}`);
      const t = until(() => bots().every((b) => flat(b.p.pm.origin, p.pm.origin) < 320), 25);
      check('hold runs out: back with you', t >= 0 && bots().every((b) => !b.holdHere || g.bots.time >= b.holdHere.until), `${t.toFixed(1)}s after 25 s`);
      return true;
    });

    // ================================================================ radio orders (in a fight)
    steps.push(() => {
      const p = me();
      tp(p, home);
      until(() => bots().every((b) => flat(b.p.pm.origin, p.pm.origin) < 320), 15);
      const pick0 = Z().specials.pick;
      Z().specials.pick = () => null; // (commons only: nothing pins or drags a bot off)
      g.console.exec('zm_wave 8');
      Z().nextWaveAt = g.time + 1e6;
      fticks(300);
      radio('Hold this position.');
      holdPos = new Map(bots().map((b) => [b, b.p.feet()]));
      tp(p, far);
      let fights = 0, worst = 0;
      for (let i = 0; i < 80; i++) {
        fticks(10);
        for (const b of bots()) { if (b.mode === 'combat') fights++; worst = Math.max(worst, flat(b.p.pm.origin, holdPos.get(b))); }
      }
      const end = bots().map((b) => flat(b.p.pm.origin, holdPos.get(b)) | 0);
      check('fight: hold keeps them near the spot', fights > 0 && end.every((d) => d < 300), `combat ticks ${fights}, worst ${worst | 0}, end ${end}`);
      radio('Follow me.');
      const t = until(() => bots().every((b) => flat(b.p.pm.origin, p.pm.origin) < 420), 20, true);
      check('fight: follow me brings them over, fighting', t >= 0, `${t.toFixed(1)}s (combat ticks ${bots().filter((b) => b.mode === 'combat').length}), at ${bots().map((b) => flat(b.p.pm.origin, p.pm.origin) | 0)} alive zombies ${Z().pool.filter((z) => z.alive).length}`);
      Z().specials.pick = pick0;
      Z().clearHorde();
      g.console.exec('zm_skip');
      Z().nextWaveAt = g.time + 1e6;
      return true;
    });

    // ================================================================ specials' warning call
    steps.push(async () => {
      const S = await import('/src/game/specials.js');
      const calls = [];
      const play0 = g.sound.play;
      g.sound.play = function (name, o = {}) { calls.push({ name, pos: o.pos ? o.pos.slice() : null, volume: o.volume, attn: o.attenuation, t: g.time }); return play0.call(this, name, o); };
      try {
        const idle = { boomer: 'boomer_idle', smoker: 'smoker_cough', hunter: 'hunter_scream', sprinter: 'sprinter_shriek', charger: 'boss_growl' };
        check('warning sounds exist', Object.values(idle).every((n) => g.sound.bank?.get(n)), Object.values(idle).filter((n) => !g.sound.bank?.get(n)).join());
        tp(me(), home);
        ticks(50);
        for (const kind of Object.keys(S.SPECIALS)) {
          calls.length = 0;
          const n = Z().specials.spawn(kind, { extra: true });
          const zs = Z().pool.filter((z) => z.alive && z.special === kind);
          const w = calls.filter((c) => c.name === idle[kind]);
          const z = zs[0];
          const at = w[0] && z ? Math.hypot(w[0].pos?.[0] - z.pm.origin[0], w[0].pos?.[1] - z.pm.origin[1]) : -1;
          check(`${kind}: warning from where it came in`, n > 0 && w.length === 1 && w[0].pos && at < 60 && w[0].volume >= 0.85 && w[0].attn === 'loud', `n=${n} calls=${w.length} at ${at | 0}u vol ${w[0]?.volume}`);
          Z().clearHorde();
        }
        // one coming at you: it calls once close (before it can act), and its trick waits
        for (const kind of ['hunter', 'charger', 'smoker', 'boomer']) {
          Z().clearHorde();
          calls.length = 0;
          Z().specials.spawn(kind, { extra: true });
          const z = Z().pool.find((q) => q.alive && q.special === kind);
          if (!z) { check(`${kind}: spawned`, false); continue; }
          // others leave it alone
          for (const b of bots()) b.p.god = true;
          let warnT = -1, actT = -1, warnD = 0;
          const t0 = g.time;
          while (g.time - t0 < 30 && z.alive && actT < 0) {
            g.tick();
            if (warnT < 0 && z.sp.warned) { warnT = g.time; warnD = flat(z.pm.origin, z.target?.pm.origin || me().pm.origin); }
            if (z.sp.state !== 'chase') actT = g.time;
          }
          const close = calls.filter((c) => c.name === idle[kind] && c.t > t0 + 0.005);
          check(`${kind}: warns as it closes in, then acts`, warnT > 0 && (actT < 0 || actT - warnT >= 0.85) && close.length >= 1 && close.every((c) => c.pos && c.volume >= 0.85),
            `warned at ${warnD | 0}u ${warnT > 0 ? (warnT - t0).toFixed(2) : '-'}s, acted ${actT > 0 ? (actT - t0).toFixed(2) : '-'}s, calls ${close.length}`);
        }
        // close in already: the arrival call counts, the trick waits
        Z().clearHorde();
        calls.length = 0;
        Z().specials.spawn('hunter', { extra: true, near: me().pm.origin.slice() });
        const h = Z().pool.find((q) => q.alive && q.special === 'hunter');
        check('near spawn: warned at once, pounce held back', h && h.sp.warned && h.sp.cd.pounce >= g.time + 0.85 && calls.filter((c) => c.name === 'hunter_scream').length === 1);
        // a sprinter pack calls once
        Z().clearHorde();
        calls.length = 0;
        const n = Z().specials.spawn('sprinter', { extra: true, near: me().pm.origin.slice() });
        check('sprinter pack: one call', n >= 2 && calls.filter((c) => c.name === 'sprinter_shriek').length === 1 && Z().pool.filter((q) => q.alive && q.special === 'sprinter').every((q) => q.sp.warned), `pack ${n}, calls ${calls.filter((c) => c.name === 'sprinter_shriek').length}`);
        Z().clearHorde();
      } finally { g.sound.play = play0; }
      return true;
    });

    // ================================================================ corpse hits by area
    steps.push(async () => {
      const G = g.gore;
      const pool = Z().pool;
      // a real body to copy (shot dead, settled a little, baked)
      g.console.exec('zm_wave 3');
      Z().nextWaveAt = g.time + 1e6;
      ticks(400);
      const z = pool.find((q) => q.alive && !q.special);
      if (!z) { check('corpses: a zombie to kill', false); return true; }
      g.killPlayer(z, me(), 'ak47', false);
      for (let i = 0; i < 60; i++) { g.tick(); g.frame(0.01); }
      G.bakePlayer(z); // (unless it settled and got baked already)
      Z().clearHorde();
      const base = G.records[G.records.length - 1];
      if (!base) { check('corpses: a body baked', false); return true; }
      const nodes = g.nav.nodes;
      for (let i = 0; i < 300; i++) {
        const n = nodes[Math.floor(rr() * nodes.length)];
        const sc = i % 25 === 0 ? 1.65 : 1; // (some boss-sized)
        const off = [n.x - base.center[0], n.y - base.center[1], n.z + 8 - base.center[2]];
        G.addRecord({ skin: base.skin, center: [base.center[0] + off[0], base.center[1] + off[1], base.center[2] + off[2]], spheres: base.spheres.map((q) => [q[0] + off[0], q[1] + off[1], q[2] + off[2], q[3] * sc]), scale: sc });
      }
      // the old full scan, as it was (the reference)
      const scan = (a, b, live) => {
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        const L2 = dx * dx + dy * dy + dz * dz;
        if (L2 < 1e-6) return null;
        let best = null;
        const test = (sph, owner) => {
          for (const q of sph) {
            const fx = a[0] - q[0], fy = a[1] - q[1], fz = a[2] - q[2];
            const B = fx * dx + fy * dy + fz * dz, Cc = fx * fx + fy * fy + fz * fz - q[3] * q[3];
            const disc = B * B - L2 * Cc;
            if (disc < 0) continue;
            const t = (-B - Math.sqrt(disc)) / L2;
            if (t < 0 || t > 1 || (best && t >= best.t)) continue;
            best = { ...owner, t, point: [a[0] + dx * t, a[1] + dy * t, a[2] + dz * t] };
          }
        };
        for (const r of G.records) {
          const c = r.center;
          const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy + (c[2] - a[2]) * dz) / L2));
          const ex = a[0] + dx * t - c[0], ey = a[1] + dy * t - c[1], ez = a[2] + dz * t - c[2];
          if (ex * ex + ey * ey + ez * ez > 3600 * r.scale * r.scale) continue;
          test(r.spheres, { rec: r });
        }
        for (const p of live) {
          if (p.alive || p.baked || p.gibbed || !p.deathTime || !p.model?.object3D.visible) continue;
          const o = p.pm.origin;
          const t = Math.max(0, Math.min(1, ((o[0] - a[0]) * dx + (o[1] - a[1]) * dy + (o[2] - a[2]) * dz) / L2));
          const ex = a[0] + dx * t - o[0], ey = a[1] + dy * t - o[1], ez = a[2] + dz * t - o[2];
          if (ex * ex + ey * ey + ez * ez > 9000) continue;
          test(G.liveSpheres(p), { player: p });
        }
        return best;
      };
      // bullets: from head height at nav spots, every way, mostly down a little, to the wall they hit;
      // plus ones aimed right at bodies (and grazing them), and straight down / along an axis
      const { TraceResult, MASK_SHOT } = await import('/src/engine/collision.js');
      const tr = new TraceResult();
      const segs = [];
      while (segs.length < 3000) {
        const n = nodes[Math.floor(rr() * nodes.length)];
        const a = [n.x, n.y, n.z + 64];
        const yaw = rr() * Math.PI * 2, pitch = -(0.02 + rr() * 0.4);
        const b = [a[0] + Math.cos(yaw) * Math.cos(pitch) * 8192, a[1] + Math.sin(yaw) * Math.cos(pitch) * 8192, a[2] + Math.sin(pitch) * 8192];
        g.collision.trace(a, b, [0, 0, 0], [0, 0, 0], MASK_SHOT, tr);
        segs.push([a, tr.endpos.slice()]);
      }
      for (let i = 0; i < 1000; i++) {
        const r = G.records[1 + Math.floor(rr() * (G.records.length - 1))];
        const c = r.center, ang = rr() * Math.PI * 2, d = 150 + rr() * 900, side = (rr() - 0.5) * 140 * r.scale;
        const a = [c[0] + Math.cos(ang) * d, c[1] + Math.sin(ang) * d, c[2] + 40 + rr() * 30];
        const tgt = [c[0] - Math.sin(ang) * side, c[1] + Math.cos(ang) * side, c[2] + (rr() - 0.5) * 20];
        const b = [a[0] + (tgt[0] - a[0]) * 2, a[1] + (tgt[1] - a[1]) * 2, a[2] + (tgt[2] - a[2]) * 2];
        segs.push([a, b]);
      }
      const c0 = G.records[5].center;
      segs.push([[c0[0], c0[1], c0[2] + 200], [c0[0], c0[1], c0[2] - 50]]); // straight down
      segs.push([[c0[0] - 2000, c0[1], c0[2]], [c0[0] + 2000, c0[1], c0[2]]]); // along x
      segs.push([[c0[0], c0[1] - 2000, c0[2] + 5], [c0[0], c0[1] + 2000, c0[2] + 5]]); // along y
      let same = 0, hits = 0;
      const diffs = [];
      for (const [a, b] of segs) {
        const x = G.corpseHit(a, b, pool), y = scan(a, b, pool);
        if (y) hits++;
        if ((!x && !y) || (x && y && x.rec === y.rec && x.player === y.player && x.t === y.t)) same++;
        else if (diffs.length < 3) diffs.push(`${JSON.stringify(a.map(Math.round))}->${JSON.stringify(b.map(Math.round))} grid ${x?.t} scan ${y?.t}`);
      }
      check('corpse hits: the same as the full scan', same === segs.length && hits > 200, `${same}/${segs.length} same, ${hits} hit ${diffs.join(' ; ')}`);
      // timing, per bullet, with ~300 bodies down (the world-hit segments only: what bullets do)
      const world = segs.slice(0, 3000);
      const R = 10;
      let t0 = performance.now();
      for (let k = 0; k < R; k++) for (const [a, b] of world) scan(a, b, pool);
      const usScan = (performance.now() - t0) * 1000 / (R * world.length);
      t0 = performance.now();
      for (let k = 0; k < R; k++) for (const [a, b] of world) G.corpseHit(a, b, pool);
      const usGrid = (performance.now() - t0) * 1000 / (R * world.length);
      out.push(`[sim] corpseHit with ${G.records.length} bodies: full scan ${usScan.toFixed(2)} us/bullet, by area ${usGrid.toFixed(2)} us/bullet (x${(usScan / usGrid).toFixed(1)})`);
      check('corpse hits: faster than the full scan', usGrid < usScan, `${usGrid.toFixed(2)} vs ${usScan.toFixed(2)} us`);
      // a real bullet into the wall behind a body: the body takes it
      let took = 0;
      const hc = G.hitCorpse;
      G.hitCorpse = function (...args) { took++; return hc.apply(this, args); };
      try {
        const r = G.records[7], c = r.center;
        const a = [c[0] + 300, c[1], c[2] + 30];
        me().pm.origin = [a[0], a[1], a[2] - 28]; // (eye 28 above origin when standing)
        const e = me().eyePos();
        const dir = [c[0] - e[0], c[1] - e[1], c[2] - e[2]], l = Math.hypot(...dir);
        const point = [e[0] + dir[0] / l * 600, e[1] + dir[1] / l * 600, e[2] + dir[2] / l * 600];
        g.onBulletImpact(me(), { point, normal: [0, 0, 1], dir: [dir[0] / l, dir[1] / l, dir[2] / l], damage: 30, surface: 'sand' }, {});
      } finally { G.hitCorpse = hc; }
      check('corpse hits: a bullet past a body hits it', took === 1);
      // a new game clears them
      G.clear();
      check('corpse hits: cleared with the bodies', G.grid.cells.size === 0 && !G.corpseHit(segs[3000][0], segs[3000][1], []));
      return true;
    });
  }

  let i = 0;
  window.__drive = async () => {
    if (i < steps.length) {
      let r;
      try { r = await steps[i++](); } catch (e) { check(`step ${i} threw`, false, `${e.message} ${e.stack?.split('\n')[1] || ''}`); }
      if (r === 'skip') i = steps.length;
      const log = out.splice(0).join('\n');
      return { log: log || undefined };
    }
    return { log: `[sim] quickwins: ${pass} passed, ${fail} failed`, done: true };
  };
})();
