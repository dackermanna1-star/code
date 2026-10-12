// Zombie survival, Milestone 2.5: the common roster (zroster.js) - the new looks (zombified
// CT, terrorist in a balaclava, scientist, fat and thin builds, riot, bloater, screamer), each
// with its own build and voice pitch; the COMMONS variants (runner, riot, crawler, bloater,
// burning) and their rules; the screamer special; the mix by difficulty; bodies per skin.
// Two lineup screenshots (the looks, the variants), and crawler hitboxes at knee height.
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=1" tools/tests/zm2-roster.js /tmp/zm2r
// Prints "[sim] PASS ..." / "[sim] FAIL ..." and a summary line.
(() => {
  const g = window.__game;
  const out = [];
  let pass = 0, fail = 0;
  const check = (name, ok, info = '') => { if (ok) pass++; else fail++; out.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
  const note = (s) => out.push(`[sim] ... ${s}`);
  const ticks = (n) => { for (let i = 0; i < n; i++) g.tick(); };
  const con = (line) => { const lines = []; const pr = g.console.menus.print; g.console.menus.print = (t) => lines.push(String(t)); try { g.console.exec(line); } finally { g.console.menus.print = pr; } return lines.join(' | '); };
  const Z = () => g.zombies;
  const R = () => g.zombies.roster;
  const me = () => g.local;
  const DEG = Math.PI / 180;
  const flat = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const rec = [];
  let busOff = null;
  const listen = () => { busOff?.(); rec.length = 0; busOff = Z().events.on('*', (e) => rec.push({ type: e.type, phase: e.phase, variant: e.variant, victim: e.victim, attacker: e.attacker, weapon: e.weapon, headshot: e.head })); };
  const of = (type, f = () => true) => rec.filter((e) => e.type === type && f(e));
  // every sound asked for, with its pitch
  const played = [];
  const play0 = g.sound.play;
  g.sound.play = function (name, o) { played.push({ name, pitch: o?.pitch ?? 1, pos: o?.pos }); return play0.call(this, name, o); };
  const heard = (name) => played.filter((p) => p.name === name).length;
  let M = null, ZD = null, CR = null, PM = null;

  function newRun(opts = {}) {
    g.newGame({ mode: 'zombies', allies: 1, ...opts });
    g.joinTeam(g.local, 'CT');
    g.bots.fillTeams(opts.allies ?? 1);
    ticks(50);
    me().god = true;
    con('sv_cheats 1');
    listen();
  }
  const think0 = g.bots.think;
  /** A quiet stretch of a wave: nothing spawns but what the test puts down; the bots hold fire. */
  function quiet(wave = 6) {
    con(`zm_wave ${wave}`);
    con('zm_god_squad');
    Z().clearHorde();
    Z().nextSpawn = 1e9;
    Z().spawned = 0; Z().stats = { ...Z().stats, count: 999 };
    g.bots.think = () => {};
    ticks(5);
  }
  /** Somewhere open and outdoors, facing down a clear stretch (the lineup shots). */
  function goOutside(p) {
    const nodes = g.nav.nodes;
    let best = null, bs = -1;
    for (let i = 0; i < 700; i++) {
      const n = nodes[Math.floor(Math.random() * nodes.length)];
      const e = [n.x, n.y, n.z + 64];
      if (!g.visible(e, [e[0], e[1], e[2] + 700])) continue;
      for (let a = 0; a < 360; a += 30) {
        const c = Math.cos(a * DEG), s = Math.sin(a * DEG);
        let ok = true;
        for (const r of [80, 160, 240]) for (const side of [-130, 0, 130]) if (ok && !g.visible(e, [e[0] + c * r - s * side, e[1] + s * r + c * side, e[2] - 50])) ok = false;
        if (!ok) continue;
        const sc = (g.visible([e[0] + c * 160, e[1] + s * 160, e[2]], [e[0] + c * 160, e[1] + s * 160, e[2] + 700]) ? 1 : 0) + Math.random() * 0.5;
        if (sc > bs) { bs = sc; best = { n, a }; }
      }
    }
    if (!best) return false;
    p.pm.origin = [best.n.x, best.n.y, best.n.z + 37]; p.prevOrigin = p.pm.origin.slice(); p.pm.velocity = [0, 0, 0];
    p.pm.angles[1] = best.a; p.pm.angles[0] = 6;
    return true;
  }
  /** Put a common (variant, look) dist ahead of you, side to your left; frozen: it stands there. */
  function put(variant, dist, side = 0, skin = null, frozen = true) {
    const p = me(), o = p.pm.origin, y = p.pm.angles[1] * DEG;
    const at = [o[0] + Math.cos(y) * dist - Math.sin(y) * side, o[1] + Math.sin(y) * dist + Math.cos(y) * side, o[2]];
    const r = R(), sk0 = r.skin;
    if (skin) r.skin = () => skin;
    const ok = Z().spawnZombie({ variant, at, extra: true });
    if (skin) delete r.skin;
    if (!ok) return null;
    let z = null, bd = 1e9;
    for (const q of Z().pool) { if (!q.alive || q.special) continue; const d = flat(q.pm.origin, at); if (d < bd) { bd = d; z = q; } }
    void sk0;
    z.pm.origin = at.slice(); z.prevOrigin = at.slice(); z.pm.velocity = [0, 0, 0];
    if (frozen) freeze(z);
    return z;
  }
  const freeze = (z) => { z.zSpeed = 0; z.nextAttack = 1e9; z.pm.speedCap = 0.001; z.progT = 1e9; };
  const chest = (q) => [q.pm.origin[0], q.pm.origin[1], q.pm.origin[2] + 14];
  const dirFrom = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l, (b[2] - a[2]) / l]; };
  const aim = (p, c) => { const e = p.eyePos(), dx = c[0] - e[0], dy = c[1] - e[1], dz = c[2] - e[2]; p.pm.angles[1] = Math.atan2(dy, dx) / DEG; p.pm.angles[0] = -Math.atan2(dz, Math.hypot(dx, dy)) / DEG; };
  /** A hitbox's centre in GoldSrc space (three.js x, y, z = GoldSrc x, z, -y). */
  const boxPos = (z, bone) => { const m = z.model.hitboxes.find((h) => h.name === 'hitbox_' + bone); m.updateWorldMatrix(true, false); const e = m.matrixWorld.elements; return [e[12], -e[14], e[13]]; };
  const pose = (n = 3) => { for (let i = 0; i < n; i++) g.frame(0.02); };
  const steps = [];

  // ---------------------------------------------------------------- tables, looks, sounds
  steps.push(async () => {
    M = await import('/src/game/zroster.js');
    ZD = await import('/src/game/zdiff.js');
    CR = await import('/src/game/combatrules.js');
    PM = await import('/src/assets/playermodels.js');
    const SP = await import('/src/game/specials.js');
    const BODY = await import('/src/assets/pm/body.js');
    newRun({ zdiff: 'sandbox' });
    const C = M.COMMONS, want = ['walker', 'runner', 'riot', 'crawler', 'bloater', 'burning'];
    check('COMMONS: the six variants', want.every((k) => C[k] && C[k].name && C[k].skins?.length && C[k].skins.includes(C[k].skin)));
    check('every variant past walker / runner is on', ['riot', 'crawler', 'bloater', 'burning'].every((k) => C[k].weight > 0), want.map((k) => `${k}:${C[k].weight}@${C[k].from}`).join(' '));
    check('runners are always thin', C.runner.skins.length === 1 && C.runner.skins[0] === 'zthin' && BODY.SKIN_BODY.zthin.thin > 0);
    const looks = ['zct', 'zterror', 'zsci', 'zfat', 'zthin', 'zriot', 'zbloat', 'screamer'];
    check('the new looks are zombie skins', looks.every((s) => PM.ZOMBIE_SKINS.includes(s)), looks.filter((s) => !PM.ZOMBIE_SKINS.includes(s)).join(' '));
    const made = [], bad = [];
    for (const s of looks) {
      try { const m = PM.createPlayerModel(s); made.push(m); if (m.getHitboxes().length !== 16 || !m.zombie) bad.push(s); } catch (e) { bad.push(`${s}: ${e.message}`); }
    }
    check('each look builds, 16 hitboxes', !bad.length && made.length === looks.length, bad.join(' '));
    // a body's build is its skin's: fat is wide, thin is narrow
    const width = (s) => { const geo = made[looks.indexOf(s)].mesh.geometry; geo.computeBoundingBox(); const b = geo.boundingBox; return { x: b.max.x - b.min.x, z: b.max.z - b.min.z }; };
    const wf = width('zfat'), wt = width('zthin'), wb = width('zbloat');
    check('fat and thin builds', wf.x > wt.x * 1.15 && wb.x > wf.x, `depth fat ${wf.x.toFixed(1)}, thin ${wt.x.toFixed(1)}, bloater ${wb.x.toFixed(1)}`);
    for (const m of made) m.dispose();
    const pitches = Object.values(M.VOICE);
    check('a voice pitch per look', new Set(pitches).size === pitches.length && M.VOICE.zfat < 0.9 && M.VOICE.zthin > 1.1 && M.VOICE.zbloat < M.VOICE.zfat, JSON.stringify(M.VOICE));
    check('the screamer is a special with its wail', !!SP.SPECIALS.screamer && SP.SPECIALS.screamer.from > 4);
    const R0 = ['casual', 'normal', 'hard', 'nightmare'].map((id) => ZD.ZDIFF[id].roster);
    check('diff.roster: the new fields, pressure up the presets', R0.every((r) => r.screamEvery?.length === 2 && r.screamCall > 0 && r.gasHurt > 0 && r.gasZombie > 0)
      && R0.every((r, i) => !i || (r.mix >= R0[i - 1].mix && r.riotCap >= R0[i - 1].riotCap && r.shift <= R0[i - 1].shift && r.screamEvery[0] <= R0[i - 1].screamEvery[0] && r.screamCall >= R0[i - 1].screamCall)), JSON.stringify(R0.map((r) => [r.mix, r.shift, r.riotCap, r.screamCall])));
    return false;
  });

  // ---------------------------------------------------------------- the lineups (screenshots)
  let lineup = [];
  const showLineup = (list, dist, gap) => {
    quiet(3);
    goOutside(me());
    ticks(3);
    const y = me().pm.angles[1] * DEG;
    lineup = list.map(([variant, skin], i) => {
      const side = (i - (list.length - 1) / 2) * gap;
      if (variant === 'screamer') {
        const o = me().pm.origin, at = [o[0] + Math.cos(y) * dist - Math.sin(y) * side, o[1] + Math.sin(y) * dist + Math.cos(y) * side, o[2]];
        Z().specials.spawn('screamer', { extra: true, near: at });
        const z = Z().pool.find((q) => q.alive && q.special === 'screamer');
        if (!z) return null;
        z.pm.origin = at.slice(); z.prevOrigin = at.slice(); freeze(z);
        z.sp.state = 'scream'; z.sp.until = 1e9; // (faces you, mid-shriek)
        return z;
      }
      return put(variant, dist, side, skin);
    });
    for (let i = 0; i < 70; i++) g.frame(0.02); // (the dust they came up in settles)
    g.paused = true;
    return lineup;
  };
  steps.push(async () => {
    const L = showLineup([['walker', 'zombie'], ['walker', 'zct'], ['walker', 'zterror'], ['walker', 'zsci'], ['walker', 'zfat'], ['runner', 'zthin']], 150, 38);
    check('lineup 1: every look up (right to left: civilian, CT, terrorist, scientist, fat, thin runner)', L.every((z) => z && z.alive), L.map((z) => z?.skin).join(' '));
    return { shot: true };
  });
  steps.push(async () => {
    g.paused = false;
    const L = showLineup([['riot', 'zriot'], ['bloater', 'zbloat'], ['crawler', 'zct'], ['burning', 'zterror'], ['screamer', null]], 150, 46);
    check('lineup 2: riot, bloater, crawler, burning, screamer', L.every((z) => z && z.alive) && L[0].variant === 'riot' && L[2].model.crawl && L[3].aflame && L[4].special === 'screamer', L.map((z) => z?.variant ?? z?.special).join(' '));
    return { shot: true };
  });

  // ---------------------------------------------------------------- crawlers: knee height, headshots work
  steps.push(async () => {
    g.paused = false;
    quiet(6);
    const p = me();
    const cr = put('crawler', 130, 0), wk = put('walker', 130, 90);
    pose(4);
    const feet = cr.pm.origin[2] - 36;
    const head = boxPos(cr, 'head'), wh = boxPos(wk, 'head');
    check('crawler: on its belly (variant, crawl pose, slower)', cr.variant === 'crawler' && cr.model.crawl === true);
    check('crawler head hitbox at knee height', head[2] - feet < 32 && head[2] - feet > 10 && wh[2] - (wk.pm.origin[2] - 36) > 55, `crawler head ${(head[2] - feet).toFixed(1)} u up, walker ${(wh[2] - (wk.pm.origin[2] - 36)).toFixed(1)}`);
    const e = p.eyePos();
    const far = (a, b) => [a[0] + (b[0] - a[0]) * 2, a[1] + (b[1] - a[1]) * 2, a[2] + (b[2] - a[2]) * 2];
    const tr = g.traceShot(e, far(e, head), p);
    check('a shot at its head is a headshot', tr.entity === cr && tr.hitgroup === CR.HITGROUP.HEAD, `hit ${tr.entity === cr ? 'crawler' : tr.entity?.name || 'nothing'} group ${tr.hitgroup}`);
    const tall = [cr.pm.origin[0], cr.pm.origin[1], feet + 64];
    const tr2 = g.traceShot(e, far(e, tall), p);
    check('a shot where a standing head would be goes over it', tr2.entity !== cr, tr2.entity ? `hit ${tr2.entity.name} ${tr2.hitgroup}` : 'missed');
    const BP = g.bots.bots[0]?.bodyPoints(cr);
    check('bots aim low at a crawler', !!BP && Math.abs(BP.head[2] - head[2]) < 9, BP ? `bot head point ${(BP.head[2] - feet).toFixed(1)} u up` : 'no bot');
    // real gunfire: a deagle at its head
    g.rounds.buy(p, 'deagle');
    if (p.weapons[2]?.id === 'deagle') g.selectWeapon(p, p.weapons[2], true);
    ticks(80);
    const build = g.buildLocalCmd;
    g.buildLocalCmd = () => ({ forwardmove: 0, sidemove: 0, upmove: 0, buttons: 0, wbuttons: (g.time * 4 | 0) % 2 ? 1 : 0 });
    for (let i = 0; i < 400 && cr.alive; i++) { aim(p, boxPos(cr, 'head')); g.frame(0.02); }
    g.buildLocalCmd = build;
    const k = of('kill', (x) => x.victim === cr)[0];
    check('real bullets: a crawler headshot kill', !cr.alive && !!k && k.headshot && k.variant === 'crawler', k ? `${k.weapon} headshot ${k.headshot}` : `alive ${cr.alive}, hp ${cr.health}`);
    // a leg knockdown makes any common a crawler (zstagger.js calls become)
    const w2 = put('walker', 160, -80);
    const ok = R().become(w2, 'crawler');
    check('become: a walker knocked down crawls on', ok && w2.variant === 'crawler' && w2.model.crawl && w2.zSpeed <= Z().stats.speed * M.COMMONS.crawler.speedK + 1e-6);
    const b2 = put('bloater', 160, -160);
    check('become: not a bloater, not twice', !R().become(b2, 'crawler') && !R().become(w2, 'crawler') && !R().become(w2, 'riot'));
    Z().clearHorde();
    return false;
  });

  // ---------------------------------------------------------------- riot: the vest, sparks, the soft head and flanks
  steps.push(async () => {
    quiet(12);
    const p = me();
    const r = put('riot', 160, 0);
    pose(2);
    check('riot: its look, its armour flag', r.variant === 'riot' && r.skin === 'zriot' && r.armored && r.name === 'Riot Zombie');
    r.pm.angles[1] = Math.atan2(p.pm.origin[1] - r.pm.origin[1], p.pm.origin[0] - r.pm.origin[0]) / DEG; // (facing you)
    const e = p.eyePos(), toR = dirFrom(e, chest(r));
    const yaw = r.pm.angles[1] * DEG, backDir = [Math.cos(yaw), Math.sin(yaw), 0]; // (a shot travelling the way it faces: in its back)
    const sideDir = [-Math.sin(yaw), Math.cos(yaw), 0];
    const hit = (hg, dir, w = 'ak47') => { r.health = r.maxHealth = 1e5; const h0 = r.health; g.damagePlayer(r, p, 40, hg, w, dir, chest(r)); return h0 - r.health; };
    const blood0 = g.effects.blood; let bled = 0;
    g.effects.blood = (...a) => { bled++; return blood0.apply(g.effects, a); };
    played.length = 0;
    const sparks0 = g.fire.fx ? g.fire.fx.add.n : 0;
    const front = hit(CR.HITGROUP.CHEST, toR);
    const frontBled = bled, frontSparks = (g.fire.fx ? g.fire.fx.add.n : 0) - sparks0;
    const back = hit(CR.HITGROUP.CHEST, backDir), side = hit(CR.HITGROUP.STOMACH, sideDir), head = hit(CR.HITGROUP.HEAD, toR), leg = hit(CR.HITGROUP.LEFTLEG, toR);
    const pistol = hit(CR.HITGROUP.CHEST, toR, 'glock18');
    g.effects.blood = blood0;
    check('riot: a body shot from the front mostly stops on the vest', front > 0 && front < back * 0.6, `front ${front}, back ${back}, flank ${side}`);
    check('riot: the vest sparks, no blood, kevlar sound', frontBled === 0 && frontSparks > 0 && heard('hit_kevlar') >= 1, `bled ${frontBled}, sparks ${frontSparks}, kevlar ${heard('hit_kevlar')}`);
    check('riot: soft in the flanks and the back', back >= 40 && side >= 40, `back ${back}, flank ${side}`);
    check('riot: weak to headshots', head >= 160 * 1.2, `head ${head}`);
    check('riot: legs unarmoured; armour-piercing guns do better', leg >= 29 && front > pistol, `leg ${leg}, ak front ${front} vs glock front ${pistol}`);
    check('riot: no helmet save, no armour left over', !r.helmet && r.armor >= 0);
    // the cap: a share of the wave's commons, later waves only
    const S0 = Z().stats, riots0 = R().riots;
    Z().stats = { ...ZD.waveStats(12, { diff: Z().diff }), count: 30 };
    const cap = R().riotCap();
    R().riots = 0;
    let n = 0;
    for (let i = 0; i < 3000; i++) if (R().pick(12, {}) === 'riot') { n++; R().riots++; }
    check('riot: capped per wave', n === cap && cap === Math.round(30 * Z().diff.roster.riotCap), `${n} picked, cap ${cap}`);
    R().riots = 0;
    let early = 0;
    for (let i = 0; i < 3000; i++) if (R().pick(M.COMMONS.riot.from + Z().diff.roster.shift - 1, {}) === 'riot') early++;
    check('riot: not before its wave', early === 0);
    Z().stats = S0; R().riots = riots0;
    Z().clearHorde();
    return false;
  });

  // ---------------------------------------------------------------- bloater: the gas cloud
  steps.push(async () => {
    quiet(8);
    const p = me();
    const b = put('bloater', 170, 0), w1 = put('walker', 190, 40), w2 = put('walker', 150, -40), dead = put('walker', 200, -10);
    pose(2);
    check('bloater: its look', b.variant === 'bloater' && b.skin === 'zbloat' && b.gassy && b.maxHealth > Z().stats.health);
    g.damagePlayer(dead, p, 1e4, CR.HITGROUP.CHEST, 'ak47', dirFrom(p.eyePos(), chest(dead)), chest(dead)); // (a body on the floor beside it)
    ticks(30);
    w1.health = w1.maxHealth = w2.maxHealth = 400; w2.health = 30; // (that one dies in it)
    played.length = 0;
    rec.length = 0;
    g.damagePlayer(b, p, 1e4, CR.HITGROUP.CHEST, 'ak47', dirFrom(p.eyePos(), chest(b)), chest(b));
    check('bloater: bursts (its own body), a cloud, the pop', !b.alive && b.gibbed && R().clouds.length === 1 && heard('bloater_pop') === 1, `clouds ${R().clouds.length}, pop ${heard('bloater_pop')}`);
    // you in the cloud: it hurts you too (godmode off for a moment)
    const c = R().clouds[0];
    p.god = false; p.health = 100; p.armor = 0;
    p.pm.origin = [c.pos[0] + 60, c.pos[1], p.pm.origin[2]]; p.prevOrigin = p.pm.origin.slice();
    for (let i = 0; i < 200; i++) { ticks(1); if (i % 10 === 0) g.frame(0.1); }
    const took = 100 - p.health;
    p.god = true; p.health = 100;
    check('the gas hurts the squad', took > 0 && took < 40, `you took ${took}`);
    check('the gas hurts the horde too', w1.alive && w1.health < 400 && !w2.alive, `walkers ${w1.alive ? w1.health | 0 : 'dead'} / ${w2.alive ? w2.health | 0 : 'dead'}`);
    const gasKills = of('kill', (k) => k.weapon === 'bloater');
    check('gas kills are the shooter\'s', gasKills.length >= 1 && gasKills.every((k) => k.attacker === p), `${gasKills.length} gas kills`);
    check('the gas never gibs a body', !dead.gibbed && !w1.gibbed && !w2.gibbed);
    ticks(500);
    check('the cloud clears', R().clouds.length === 0);
    Z().clearHorde();
    return false;
  });

  // ---------------------------------------------------------------- burning: alight for good, sets you alight
  steps.push(async () => {
    quiet(9);
    const p = me();
    const z = put('burning', 60, 0, null, false);
    z.pm.speedCap = null;
    pose(2);
    check('burning: on fire, charred', z.aflame && z.char === 0.5 && Math.abs(z.model.material.uniforms.uChar.value - 0.5) < 1e-6);
    const n0 = g.fire.fx ? g.fire.fx.add.n : 0;
    for (let i = 0; i < 5; i++) g.frame(0.05);
    check('burning: flames on it', !g.fire.fx || g.fire.fx.add.n > n0, g.fire.fx ? `${n0} -> ${g.fire.fx.add.n}` : 'no fx (headless)');
    p.burn = null;
    z.nextAttack = 0;
    for (let i = 0; i < 300 && !p.burn; i++) { ticks(1); if (i % 10 === 0) g.frame(0.1); }
    check('its claw sets you alight', !!p.burn && g.fire.burning.has(p), p.burn ? `${(p.burn.until - g.time).toFixed(1)} s at ${p.burn.dps.toFixed(1)}/s` : 'no burn');
    p.burn = null; g.fire.burning.delete(p);
    const fires = g.fire.patches.length;
    g.damagePlayer(z, p, 1e4, CR.HITGROUP.CHEST, 'ak47', dirFrom(p.eyePos(), chest(z)), chest(z));
    check('it leaves a little fire where it falls', g.fire.patches.length === fires + 1 && g.fire.patches[g.fire.patches.length - 1].radius < 60);
    Z().clearHorde();
    return false;
  });

  // ---------------------------------------------------------------- the screamer
  steps.push(async () => {
    quiet(9);
    const p = me();
    goOutside(p);
    ticks(2);
    const y = p.pm.angles[1] * DEG;
    const at = [p.pm.origin[0] + Math.cos(y) * 220, p.pm.origin[1] + Math.sin(y) * 220, p.pm.origin[2]];
    Z().specials.spawn('screamer', { extra: true, near: at });
    const s = Z().pool.find((q) => q.alive && q.special === 'screamer');
    check('screamer: a special in its own look', !!s && s.skin === 'screamer' && s.variant === null && Z().specials.idleSound(s) === 'screamer_wail');
    if (!s) return false;
    s.pm.origin = at.slice(); s.prevOrigin = at.slice();
    s.sp.scream = 1e9; s.sp.calls = 0; s.sp.seeT = 0; // (no call yet)
    const d0 = flat(s.pm.origin, p.pm.origin);
    for (let i = 0; i < 300; i++) { ticks(1); if (i % 10 === 0) g.frame(0.1); }
    const d1 = flat(s.pm.origin, p.pm.origin);
    check('screamer: hangs back (backs off when you come close)', d1 > d0 + 40, `${d0 | 0} -> ${d1 | 0} u`);
    // the call: the director's surge first
    const D = Z().director, surge0 = D.surge;
    const asked = [];
    D.surge = (src, o) => { asked.push({ src, by: o?.by }); return false; };
    // (integration: with the director in, a refused call queues a few of the wave's own from its front)
    const extras = () => D.pending.filter((q) => !q.kind).length;
    const e0 = extras();
    played.length = 0;
    s.sp.scream = g.time; s.sp.seeT = 0;
    s.pm.origin = [p.pm.origin[0] + Math.cos(y) * 600, p.pm.origin[1] + Math.sin(y) * 600, p.pm.origin[2]]; s.prevOrigin = s.pm.origin.slice();
    for (let i = 0; i < 5; i++) ticks(1);
    const R0 = Z().diff.roster;
    check('screamer: it shrieks, rooted', s.sp.state === 'scream' && heard('screamer_shriek') === 1 && s.sp.calls === 1, `state ${s.sp.state}, calls ${s.sp.calls}`);
    check('screamer: it asks the director for a surge', asked.length === 1 && asked[0].src === s && asked[0].by === 'screamer');
    check('screamer: no surge taken - a few of the wave come now (director.queue)', extras() - e0 > 0 && extras() - e0 <= R0.screamCall, `+${extras() - e0} (screamCall ${R0.screamCall})`);
    const next = s.sp.scream - g.time;
    check('screamer: calls again every screamEvery s', next >= R0.screamEvery[0] - 0.1 && next <= R0.screamEvery[1], `next in ${next.toFixed(1)} s`);
    // a director that takes the surge: no extras of its own
    D.surge = (src, o) => { asked.push({ src, by: o?.by }); return true; };
    ticks(200);
    const e1 = extras();
    s.sp.state = 'chase'; s.sp.scream = g.time; s.sp.seeT = 0;
    ticks(3);
    check('screamer: a surge taken - nothing extra', asked.length === 2 && extras() === e1, `asked ${asked.length}, extras ${e1} -> ${extras()}`);
    D.surge = surge0;
    // hoarse: after screamMax calls it comes for you (a wave never stalls on one hanging back)
    const calls0 = s.sp.calls, cmd = { forwardmove: 0, sidemove: 0, upmove: 0, buttons: 0, wbuttons: 0 };
    s.sp.state = 'chase'; s.sp.calls = R0.screamMax; s.sp.scream = g.time;
    const own = R().screamer(s, p, cmd, g.time);
    check('screamer: hoarse after screamMax calls, it comes for you', own === false && s.sp.state === 'chase', `screamMax ${R0.screamMax}`);
    s.sp.calls = calls0;
    // killed: the calls stop
    g.damagePlayer(s, p, 1e4, CR.HITGROUP.CHEST, 'ak47', dirFrom(p.eyePos(), chest(s)), chest(s));
    played.length = 0;
    ticks(2000);
    check('screamer: dead, no more calls', !s.alive && heard('screamer_shriek') === 0);
    Z().clearHorde();
    return false;
  });

  // ---------------------------------------------------------------- the mix by difficulty
  steps.push(async () => {
    const d0 = Z().diff, S0 = Z().stats, r0 = R().riots;
    const share = {};
    const mix = (id, wave, N = 4000) => {
      Z().diff = ZD.resolveDiff(ZD.zombieOptions({ zdiff: id }));
      Z().stats = ZD.waveStats(wave, { diff: Z().diff });
      R().riots = 0;
      const c = {};
      for (let i = 0; i < N; i++) { const v = R().pick(wave, {}); c[v] = (c[v] || 0) + 1; if (v === 'riot') R().riots++; }
      const other = N - (c.walker || 0) - (c.runner || 0);
      share[`${id}${wave}`] = other / Math.max(1, N - (c.runner || 0)); // (of the non-runners: runners are the wave's own share)
      return c;
    };
    const n3 = mix('normal', 3), nm3 = mix('nightmare', 3), c14 = mix('casual', 14), n14 = mix('normal', 14), h14 = mix('hard', 14), nm14 = mix('nightmare', 14);
    note(`normal w14 ${JSON.stringify(n14)}; nightmare w14 ${JSON.stringify(nm14)}`);
    check('normal wave 3: walkers and runners only', Object.keys(n3).every((k) => k === 'walker' || k === 'runner'), JSON.stringify(n3));
    check('nightmare: crawlers from wave 2 (shift)', (nm3.crawler || 0) > 0, JSON.stringify(nm3));
    check('wave 14: every variant in the mix', ['riot', 'crawler', 'bloater', 'burning'].every((k) => n14[k] > 0), JSON.stringify(n14));
    check('more variants up the difficulties (of the non-runners)', share.casual14 < share.normal14 && share.normal14 < share.hard14 && share.hard14 < share.nightmare14, Object.entries(share).map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`).join(' '));
    check('normal stays mostly walkers and runners', share.normal14 < 0.3, `${(share.normal14 * 100).toFixed(1)}% variants`);
    check('a boss\'s summons (own speed) are walkers', R().pick(14, { speed: 300 }) === 'walker');
    void c14; void h14;
    Z().diff = d0; Z().stats = S0; R().riots = r0;
    return false;
  });

  // ---------------------------------------------------------------- a real wave: looks, voices, bodies
  steps.push(async () => {
    g.bots.think = think0;
    newRun({ zdiff: 'nightmare', allies: 2 });
    const setups = [], setup0 = R().setup;
    R().setup = function (z, v, o) { const r = setup0.call(this, z, v, o); setups.push({ v: z.variant, skin: z.skin, voice: z.voice }); return r; };
    con('zm_wave 14');
    con('zm_god_squad');
    played.length = 0;
    const seen = (f) => new Set(setups.map(f)).size;
    // (you mow them down now and then: the wave keeps coming)
    for (let i = 0; i < 8000 && !(i >= 2500 && seen((s) => s.v) >= 4 && seen((s) => s.skin) >= 6); i++) {
      g.tick();
      if (i % 20 === 0) g.frame(0.2);
      if (i % 150 === 149) for (const z of Z().pool) if (z.alive && !z.special) g.damagePlayer(z, me(), 1e5, CR.HITGROUP.CHEST, 'ak47', [1, 0, 0], z.eyePos());
    }
    R().setup = setup0;
    const vs = new Set(setups.map((s) => s.v)), skins = new Set(setups.map((s) => s.skin));
    check('a late nightmare wave: a mixed crowd', vs.size >= 4 && skins.size >= 6, `${setups.length} spawns, variants ${[...vs].join(' ')}, looks ${[...skins].join(' ')}`);
    check('each wears its variant\'s look', setups.every((s) => M.COMMONS[s.v].skins.includes(s.skin)));
    check('runners are thin, riots in riot gear, bloaters bloated', setups.every((s) => (s.v !== 'runner' || s.skin === 'zthin') && (s.v !== 'riot' || s.skin === 'zriot') && (s.v !== 'bloater' || s.skin === 'zbloat')));
    const growls = played.filter((x) => x.name === 'zombie_idle' || x.name === 'zombie_attack' || x.name === 'zombie_die');
    const pit = new Set(growls.map((x) => x.pitch.toFixed(2)));
    check('voices: pitched by look', growls.length > 5 && pit.size > 3 && growls.every((x) => x.pitch > 0.6 && x.pitch < 1.3), `${growls.length} growls, ${pit.size} pitches`);
    const bodies = Z().pool.filter((q) => !q.special);
    check('bodies per look: the pool holds several looks', new Set(bodies.map((q) => q.skin)).size >= 5 && bodies.every((q) => q.model.skin === q.skin), `${bodies.length} bodies`);
    // reskin: a free body made over in another look; its last corpse stays where it fell
    const t = g.time;
    const victim = bodies.find((q) => q.alive && q.skin !== 'zriot');
    if (victim) g.damagePlayer(victim, me(), 1e5, CR.HITGROUP.CHEST, 'ak47', [1, 0, 0], victim.eyePos());
    const free = victim && !victim.alive ? victim : bodies.find((q) => !q.alive && q.skin !== 'zriot');
    if (free) {
      const recs0 = g.gore.records.length, model0 = free.model, wasDead = free.deathTime && !free.baked && !free.gibbed;
      const z = R().reskin(free, 'zriot');
      check('reskin: the body, remade in the look', z === free && free.skin === 'zriot' && free.model !== model0 && free.model.skin === 'zriot' && model0._disposed, `skin ${free.skin}`);
      check('reskin: its last corpse baked first', !wasDead || g.gore.records.length === recs0 + 1, `records ${recs0} -> ${g.gore.records.length}`);
    } else check('reskin: a free body to try it on', false, `t ${t}`);
    check('reskin: nothing to work with, nothing spawns', R().reskin(null, 'zriot') === null);
    return false;
  });

  // ---------------------------------------------------------------- the Abomination raises the new looks; the cheat
  steps.push(async () => {
    newRun({ zdiff: 'sandbox' });
    quiet(5);
    con('zm_boss abomination');
    const b = g.bosses.boss;
    check('an Abomination up', !!b && b.alive);
    if (b) {
      const o = b.pm.origin, ats = [];
      const recs = g.gore.records;
      const n0 = recs.length;
      recs.push({ skin: 'zct', center: [o[0] + 120, o[1], o[2] - 30], spheres: [], scale: 1 }, { skin: 'zbloat', center: [o[0] - 120, o[1], o[2] - 30], spheres: [], scale: 1 });
      const sp0 = Z().spawnZombie;
      Z().spawnZombie = function (opt) { if (opt?.at) ats.push(opt.at); return sp0.call(this, opt); };
      g.bosses.raiseDead(b);
      Z().spawnZombie = sp0;
      recs.splice(n0, 2);
      const beside = (c) => ats.some((a) => Math.hypot(a[0] - c[0], a[1] - c[1]) < 80);
      check('raise the dead: the new looks rise too', beside([o[0] + 120, o[1]]) || beside([o[0] - 120, o[1]]), `${ats.length} risen beside bodies`);
      g.bosses.despawn();
    }
    Z().clearHorde();
    const before = Z().pool.filter((q) => q.alive).length;
    con('sv_cheats 0');
    const no = con('zm_common riot near');
    con('sv_cheats 1');
    const yes = con('zm_common riot near');
    const r = Z().pool.find((q) => q.alive && q.variant === 'riot');
    check('zm_common: a cheat (sv_cheats), a common of your choosing', /sv_cheats/.test(no) && /Riot Zombie/.test(yes) && !!r && r.extra && Z().pool.filter((q) => q.alive).length === before + 1, `${no} | ${yes}`);
    check('zm_common: bad variant', /usage/.test(con('zm_common nope')));
    return false;
  });

  // ---------------------------------------------------------------- sounds (synthesized by now)
  steps.push(async () => {
    const RC = await import('/src/assets/snd/recipes.js');
    const names = ['screamer_wail', 'screamer_shriek', 'bloater_pop'];
    for (let i = 0; i < 40 && !names.every((n) => g.sound?.bank?.get(n)); i++) await new Promise((r) => window.setTimeout(r, 250));
    check('the new sounds: catalogued and synthesized', names.every((n) => RC.SOUND_NAMES.includes(n) && RC.DEFS[n] && g.sound?.bank?.get(n)), names.filter((n) => !g.sound?.bank?.get(n)).join(' '));
    return true;
  });

  let i = 0;
  window.__drive = async () => {
    out.length = 0;
    let r = false;
    try { r = await steps[i++](); } catch (e) { check('step ' + i + ' threw', false, e.stack); r = true; }
    const done = r === true || i >= steps.length;
    if (done) out.push(`[sim] ${fail ? 'FAILED' : 'ALL PASSED'}: ${pass} passed, ${fail} failed`);
    return { log: out.join('\n'), done, shot: !!(r && r.shot), wait: r && r.shot ? 300 : 0 };
  };
})();
