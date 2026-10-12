// Zombie survival, Milestone 1.4 (game side): the wave curve sized to the difficulty and the
// squad (zdiff.js waveStats), the specials rate and per-kind cap, the 32-body pool, records per
// map / difficulty / squad size (zrecords.js), and the level of detail for far zombies.
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=2" tools/tests/zm1-scaling.js /tmp/zm1s
// Prints "[sim] PASS ..." / "[sim] FAIL ..." and "[sim] INFO ..." (timings: not checked).
// Leaves localStorage's record as it found it.
/* global localStorage, performance */
(() => {
  const g = window.__game;
  const out = [];
  let pass = 0, fail = 0;
  const check = (name, ok, info = '') => { if (ok) pass++; else fail++; out.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
  const info = (s) => out.push(`[sim] INFO ${s}`);
  const ticks = (n) => { for (let i = 0; i < n; i++) g.tick(); };
  const con = (line) => { const lines = []; const pr = g.console.menus.print; g.console.menus.print = (t) => lines.push(String(t)); try { g.console.exec(line); } finally { g.console.menus.print = pr; } return lines.join(' | '); };
  const Z = () => g.zombies;
  const squad = () => g.players.filter((p) => p.team === 'CT' && !p.isZombie);
  const KEY = 'cs16-zombies-best';
  const saved = (() => { try { return localStorage.getItem(KEY); } catch { return null; } })();
  const restore = () => { try { if (saved == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, saved); } catch { /* blocked */ } };

  /** A fresh zombie game like the menu's New Game (you on CT, bots filled in). */
  function newRun(opts) {
    g.newGame({ mode: 'zombies', allies: 2, ...opts });
    g.joinTeam(g.local, 'CT');
    g.bots.fillTeams(opts.allies ?? 2);
    ticks(50);
  }
  const wipe = () => { for (const q of [...squad().filter((q) => q.isBot), g.local]) { q.god = false; if (q.alive) g.killPlayer(q, null, 'world', false); } };
  const stored = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };

  const steps = [];

  // ---------------------------------------------------------------- the curve (zdiff.js)
  steps.push(async () => {
    const ZD = await import('/src/game/zdiff.js');
    const D = ZD.ZDIFF;
    const W = (id, n, crowd = 1) => ZD.waveStats(n, { diff: D[id], crowd });
    const ids = ['casual', 'normal', 'hard', 'nightmare'];
    const s = W('normal', 1);
    check('waveStats fields', ['count', 'maxAlive', 'health', 'speed', 'runners', 'damage', 'interval', 'bonus', 'special', 'perKind'].every((k) => Number.isFinite(s[k])), JSON.stringify(s));
    // Normal's new curve, solo and with 8 bots (crowd 5)
    const snap = (n, c) => { const w = W('normal', n, c); return `${w.count}/${w.maxAlive}/${w.health}/${w.damage}`; };
    const want = { '1,1': '4/5/80/12', '3,1': '8/7/120/15', '10,1': '23/9/190/22', '20,1': '44/10/230/24', '10,5': '30/14/190/22', '20,5': '58/16/230/24', '30,6': '91/18/270/26' };
    const got = Object.keys(want).map((k) => `${k}=${snap(...k.split(',').map(Number))}`);
    check('normal curve (solo and squads)', Object.keys(want).every((k) => snap(...k.split(',').map(Number)) === want[k]), got.join(' '));
    // the squad: more of them, more up at once, coming faster; each one no tougher
    let crowdOk = true;
    for (const id of ids) for (const n of [1, 5, 12, 25]) {
      const a = W(id, n, 1), b = W(id, n, 3), c = W(id, n, 6);
      if (!(a.count <= b.count && b.count <= c.count && a.count < c.count && a.maxAlive <= b.maxAlive && b.maxAlive <= c.maxAlive && a.maxAlive < c.maxAlive && c.interval < a.interval && a.health === c.health && a.damage === c.damage && a.speed === c.speed)) crowdOk = false;
    }
    check('squad scaling', crowdOk, `normal w10 count ${[1, 2, 3, 5, 6].map((c) => W('normal', 10, c).count).join('/')} up ${[1, 2, 3, 5, 6].map((c) => W('normal', 10, c).maxAlive).join('/')}`);
    // up at once: never past 28 (the pool has 32); a big squad on the harder presets gets there
    let maxUp = 0;
    for (const id of ids) for (let n = 1; n <= 120; n++) for (const c of [1, 3, 6, 7]) maxUp = Math.max(maxUp, W(id, n, c).maxAlive);
    check('maxAlive cap', maxUp === ZD.MAX_ALIVE && ZD.MAX_ALIVE === 28 && W('nightmare', 20, 7).maxAlive === 28 && W('hard', 30, 6).maxAlive >= 24 && W('normal', 40, 6).maxAlive >= 18 && W('normal', 12, 1).maxAlive <= 10, `max ${maxUp}, w40 big squad normal ${W('normal', 40, 6).maxAlive}, w30 hard ${W('hard', 30, 6).maxAlive}, w20 nightmare ${W('nightmare', 20, 7).maxAlive}`);
    // past wave 10 the caps keep climbing (slowly), forever
    let lateOk = true;
    for (const id of ids) {
      const a = W(id, 11, 3), b = W(id, 30, 3), c = W(id, 300, 3);
      if (!(b.health > a.health && b.damage > a.damage && b.runners > a.runners && b.special > a.special && b.count > a.count && c.health > b.health && c.damage > b.damage)) lateOk = false;
      if (!(c.speed <= ZD.SPEED_MAX && c.runners <= 0.45 && c.maxAlive <= 28 && Number.isFinite(c.interval) && c.interval > 0)) lateOk = false;
    }
    check('endless late growth', lateOk, `normal w11/w30/w300 claw ${[11, 30, 300].map((n) => W('normal', n).damage).join('/')} runners ${[11, 30, 300].map((n) => Math.round(W('normal', n).runners * 100)).join('/')}% hp ${[11, 30, 300].map((n) => W('normal', n).health).join('/')}`);
    // the presets stay in order at every squad size
    let orderOk = true;
    for (const c of [1, 5]) for (const n of [3, 10, 20]) for (let i = 1; i < ids.length; i++) {
      const a = W(ids[i - 1], n, c), b = W(ids[i], n, c);
      if (!(a.count < b.count && a.health < b.health && a.damage <= b.damage && a.special < b.special)) orderOk = false;
    }
    check('presets in order', orderOk, `w10 solo hp ${ids.map((id) => W(id, 10).health).join('/')} count ${ids.map((id) => W(id, 10).count).join('/')}`);
    // solo: fewer commons, a few more specials; big squads: more of a kind
    check('solo specials', W('normal', 8, 1).special > W('normal', 8, 2).special && Math.abs(W('normal', 8, 2).special - W('normal', 8, 5).special) < 1e-9 && ZD.specialChance(8, D.normal, 1) === W('normal', 8, 1).special, `w8 ${[1, 1.5, 2, 5].map((c) => (W('normal', 8, c).special * 100).toFixed(1)).join('/')}%`);
    check('per-kind cap grows with the squad', W('normal', 10, 1).perKind === 1 && W('normal', 10, 6).perKind === 2 && W('nightmare', 10, 1).perKind === 2 && W('nightmare', 10, 7).perKind > 2, ids.map((id) => `${id} ${W(id, 10, 1).perKind}/${W(id, 10, 6).perKind}`).join(' '));
    // the opening waves: a starting pistol can hold them
    check('pistol waves', W('normal', 1).health === 80 && W('normal', 2).health === 99 && W('normal', 3).runners === 0 && W('normal', 4).runners > 0 && W('normal', 1, 5).count <= 6, `hp ${[1, 2, 3].map((n) => W('normal', n).health).join('/')}`);
    check('sandbox plays the normal horde', D.sandbox.horde === D.normal.horde && D.sandbox.specials === D.normal.specials);
    return false;
  });

  // ---------------------------------------------------------------- squad scaling in the mode
  steps.push(async () => {
    const ZD = await import('/src/game/zdiff.js');
    newRun({ allies: 4, zdiff: 'normal' });
    const o = Z().waveOpts();
    check('crowd = you + botCrowd x bots', o.crowd === 1 + 4 * Z().diff.horde.botCrowd && squad().length === 5, `crowd ${o.crowd} squad ${squad().length}`);
    con('sv_cheats 1');
    con('zm_wave 6');
    const want = ZD.waveStats(6, o);
    check('the wave follows the squad', Z().stats.count === want.count && Z().stats.maxAlive === want.maxAlive && Z().stats.count > ZD.waveStats(6, { diff: Z().diff }).count, `count ${Z().stats.count} up ${Z().stats.maxAlive}`);
    newRun({ allies: 4, squadScaling: false });
    check('squad scaling off: the solo horde', Z().waveOpts().crowd === 1 && Z().stats.count === ZD.waveStats(1, { diff: Z().diff }).count);
    newRun({ allies: 1, hardcore: true });
    check('g.zombies.hardcore', Z().hardcore === true && Z().diff.econ.waveHeal === 0);
    newRun({ allies: 1 });
    check('not hardcore by default', Z().hardcore === false);
    return false;
  });

  // ---------------------------------------------------------------- specials: rate and per-kind cap
  steps.push(async () => {
    newRun({ allies: 1, zdiff: 'sandbox' });
    con('sv_cheats 1');
    con('zm_god_squad');
    con('zm_wave 8');
    Z().nextSpawn = 1e9; // (nothing else comes up)
    Z().stats = { ...Z().stats, special: 1, perKind: 1 };
    const n = Z().specials.spawn('charger', { extra: true });
    const picks = {};
    for (let i = 0; i < 300; i++) { const k = Z().specials.pick(8); picks[k] = (picks[k] || 0) + 1; }
    check('a full kind is not picked', n === 1 && !picks.charger && !picks.null && Object.keys(picks).length >= 3, JSON.stringify(picks));
    Z().stats = { ...Z().stats, special: 1, perKind: 2 };
    let chargers = 0;
    for (let i = 0; i < 300; i++) if (Z().specials.pick(8) === 'charger') chargers++;
    check('a bigger per-kind cap lets a second one in', chargers > 0, `${chargers} of 300`);
    Z().stats = { ...Z().stats, special: 0 };
    let any = 0;
    for (let i = 0; i < 300; i++) if (Z().specials.pick(8)) any++;
    check('no specials at rate 0', any === 0);
    return false;
  });

  // ---------------------------------------------------------------- 28 up at once, 32 bodies
  steps.push(async () => {
    newRun({ allies: 4, zdiff: 'sandbox' });
    con('sv_cheats 1');
    con('zm_god_squad');
    con('zm_wave 12');
    Z().stats = { ...Z().stats, count: 500, maxAlive: 28, interval: 0.02, special: 0 };
    let most = 0;
    for (let i = 0; i < 1200; i++) {
      g.tick();
      if (i % 25 === 0) {
        let up = 0;
        for (const z of Z().pool) if (z.alive) { up++; z.health = Math.max(z.health, 1e5); }
        most = Math.max(most, up);
        if (up >= 28 && i > 300) break;
      }
    }
    const commons = Z().pool.filter((z) => !z.special).length;
    check('28 up at once', most === 28, `most ${most}`);
    check('pool of 32 common bodies', commons >= 28 && commons <= 32, `${commons} bodies`);
    // ms per tick with 28 up and 4 bots shooting, the level of detail on and off (machine dependent: not checked)
    const time = (lod) => {
      Z().lod = lod;
      const t0 = performance.now();
      for (let i = 0; i < 300; i++) { g.frame(1 / 60); if (i % 30 === 0) for (const z of Z().pool) if (z.alive) z.health = Math.max(z.health, 1e5); }
      return (performance.now() - t0) / 300;
    };
    const a = [time(false), time(true), time(false), time(true)];
    Z().lod = true;
    info(`28 up, 4 bots: ${((a[0] + a[2]) / 2).toFixed(2)} ms a 60 Hz frame (simulation + models) with the LOD off, ${((a[1] + a[3]) / 2).toFixed(2)} on`);
    return false;
  });

  // ---------------------------------------------------------------- level of detail
  steps.push(async () => {
    newRun({ allies: 0, zdiff: 'sandbox' });
    con('sv_cheats 1');
    con('zm_god_squad');
    Z().nextWaveAt = 1e9; // (stay in the first break: only the zombies placed here)
    const me = g.local, eye = me.eyePos();
    g.frame(1 / 60); // (the camera)
    const nodes = g.nav.nodes;
    const d = (n) => Math.hypot(n.x - me.pm.origin[0], n.y - me.pm.origin[1], n.z - me.pm.origin[2]);
    const farN = nodes.find((n) => d(n) > 1800 && (n.support ?? 5) >= 3 && n.edges.length >= 6 && !g.visible(eye, [n.x, n.y, n.z + 56]) && Z().dist?.[n.id] < Infinity);
    const nearN = nodes.find((n) => d(n) > 350 && d(n) < 600 && n.edges.length >= 6);
    const place = (n) => { const before = new Set(Z().pool.filter((z) => z.alive)); Z().spawnZombie({ at: [n.x, n.y, n.z + 37] }); return Z().pool.find((z) => z.alive && !before.has(z)); };
    const zf = farN && place(farN), zn = nearN && place(nearN);
    check('test zombies placed', !!(zf && zn), `far node ${!!farN} near node ${!!nearN}`);
    if (!zf || !zn) return false;
    const count = (n) => {
      const c = { far: 0, near: 0 };
      let pf = zf.cmd, pn = zn.cmd;
      for (let i = 0; i < n; i++) { g.tick(); if (zf.cmd !== pf) c.far++; if (zn.cmd !== pn) c.near++; pf = zf.cmd; pn = zn.cmd; }
      return c;
    };
    const p0 = zf.pm.origin.slice();
    const c1 = count(100);
    const moved = Math.hypot(zf.pm.origin[0] - p0[0], zf.pm.origin[1] - p0[1]);
    check('far and unseen: thinks at ~20 Hz', c1.far >= 12 && c1.far <= 30 && zf.lodNext > 0, `${c1.far} thinks in 100 ticks`);
    check('it keeps walking in between', moved > 60, `${moved.toFixed(0)} units in 1 s`);
    check('near: thinks every tick', c1.near === 100, `${c1.near} thinks in 100 ticks`);
    Z().lod = false;
    const c2 = count(50);
    Z().lod = true;
    check('LOD off: every tick', c2.far === 50 && zf.lodK === 1, `${c2.far} thinks in 50 ticks`);
    // posing (game.updateModels): every frame in front of the camera, every few frames behind it or far off
    g.frame(1 / 60);
    const yaw = me.pm.angles[1] * Math.PI / 180, o = me.pm.origin;
    const at = (dist, ang) => [o[0] + Math.cos(yaw + ang) * dist, o[1] + Math.sin(yaw + ang) * dist, o[2]];
    const poses = (z, pos, n = 12) => { const keep = z.pm.origin; z.pm.origin = pos; z.poseDt = 0; let k = 0; for (let i = 0; i < n; i++) if (Z().modelDt(z, 1 / 60) >= 0) k++; z.pm.origin = keep; return k; };
    const front = poses(zn, at(500, 0)), behind = poses(zn, at(500, Math.PI)), far = poses(zn, at(2500, 0)), close = poses(zn, at(100, Math.PI));
    const fov = me.fov; me.fov = 40;
    const scoped = poses(zn, at(2500, 0));
    me.fov = fov;
    check('posed every frame in front of you', front === 12 && close === 12, `${front}/12 in front, ${close}/12 right behind`);
    check('posed at ~20 Hz behind you or far off', behind >= 3 && behind <= 5 && far >= 3 && far <= 5, `${behind}/12 behind, ${far}/12 far`);
    check('scoped in: every frame', scoped === 12, `${scoped}/12`);
    let dt = 0; zn.poseDt = 0;
    const keep = zn.pm.origin; zn.pm.origin = at(500, Math.PI);
    for (let i = 0; i < 6; i++) { const r = Z().modelDt(zn, 1 / 60); if (r >= 0) dt += r; }
    zn.pm.origin = keep;
    check('a skipped pose catches up the time', Math.abs(dt - 6 / 60) < 0.02, `${dt.toFixed(3)} s of 0.100`);
    return false;
  });

  // ---------------------------------------------------------------- records
  steps.push(async () => {
    const R = await import('/src/game/zrecords.js');
    const map = g.W?.mapDef?.id || g.map?.name;
    // the old single number: kept, and it stands as the Sandbox best
    localStorage.setItem(KEY, '7');
    newRun({ allies: 2, zdiff: 'sandbox' });
    check('old record migrated', stored()?.legacy === 7 && Z().best === 7 && Z().bestBefore === 7, `${localStorage.getItem(KEY)} best ${Z().best}`);
    newRun({ allies: 2 });
    check('record key', Z().recordKey() === `${map}|normal|2-3` && R.squadBucket(1) === '1' && R.squadBucket(4) === '4-6' && R.squadBucket(11) === '7+', Z().recordKey());
    check('other difficulties start from nothing', Z().best === 0 && Z().bestBefore === 0);
    con('sv_cheats 1');
    con('zm_wave 4');
    con('zm_skip');
    const recs = stored();
    check('a cleared wave saves the record for this setup', Z().best === 4 && recs[`${map}|normal|2-3`] === 4 && recs.legacy === 7, JSON.stringify(recs));
    newRun({ allies: 5 });
    check('another squad size, another record', Z().recordKey() === `${map}|normal|4-6` && Z().best === 0);
    newRun({ allies: 2, hardcore: true });
    check('hardcore keeps its own', Z().recordKey() === `${map}|normal+hc|2-3` && Z().best === 0);
    newRun({ allies: 2, squadScaling: false });
    check('fixed horde keeps its own', Z().recordKey() === `${map}|normal+fixed|2-3` && Z().best === 0);
    newRun({ allies: 2, zdiff: 'hard' });
    check('hard keeps its own', Z().recordKey() === `${map}|hard|2-3` && Z().best === 0);
    // back to normal with 2 bots: the record is there; dying mid-wave 4 isn't a new best
    newRun({ allies: 2 });
    check('the record comes back', Z().best === 4 && Z().bestBefore === 4);
    con('sv_cheats 1');
    con('zm_wave 4');
    wipe();
    check('3 waves is not a new best', Z().state === 'over' && Z().survived === 3 && !Z().isNewBest() && Z().best === 4);
    // the squad fills up after the run is set up (the menu adds the bots after New Game): the record follows until wave 1
    g.newGame({ mode: 'zombies', allies: 0 });
    g.joinTeam(g.local, 'CT');
    ticks(5);
    const k1 = Z().recordKey();
    g.bots.fillTeams(2);
    ticks(5);
    const k2 = Z().recordKey();
    check('the record follows the squad before wave 1', k1 === `${map}|normal|1` && k2 === `${map}|normal|2-3` && Z().best === 4, `${k1} -> ${k2}`);
    // Sandbox: beating the old record keeps the new one there; the old one stays for other squads
    newRun({ allies: 2, zdiff: 'sandbox' });
    con('sv_cheats 1');
    con('zm_wave 8');
    con('zm_skip');
    newRun({ allies: 5, zdiff: 'sandbox' });
    const sb = stored();
    check('beating the old record on Sandbox', sb[`${map}|sandbox|2-3`] === 8 && sb.legacy === 7 && Z().best === 7, JSON.stringify(sb));
    // junk in storage: no record, no crash
    localStorage.setItem(KEY, '{nonsense');
    newRun({ allies: 1 });
    check('junk storage', Z().best === 0);
    restore();
    return true;
  });

  let i = 0;
  window.__drive = async () => {
    out.length = 0;
    let done = false;
    try { done = await steps[i++](); } catch (e) { check('step ' + i + ' threw', false, e.stack); done = true; }
    if (i >= steps.length) done = true;
    if (done) { restore(); out.push(`[sim] ${fail ? 'FAILED' : 'ALL PASSED'}: ${pass} passed, ${fail} failed`); }
    return { log: out.join('\n'), done };
  };
})();
