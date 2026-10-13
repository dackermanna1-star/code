// Zombie survival, Milestone 3.5: drops, power-ups and airdrops (pickups.js, powerups.js,
// airdrop.js, drophud.js, dropmodels.js, snd/drops.js) - the registrations (sounds, buffs, the
// difficulty group), loot from kills (only the squad's, mid-wave, never a boss's, within the
// wave's budget; elites always), the loot itself (cash, ammo, vials), the five power-ups (Max
// Ammo, Insta-Kill not on bosses, Double Cash, Nuke not on bosses, Fire Sale opening the shop),
// their timers running out, fading and the floor cap, the airdrop (flare, chute, landing, hold E
// to open, what's inside, fading unopened, planned into a wave), bots fetching loot when it's
// safe (and never a launcher from a crate), the HUD, the console, and a look at it all.
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=2" tools/tests/zm3-drops.js /tmp/zm3drops
// Prints "[sim] PASS ..." / "[sim] FAIL ..." and "ALL PASSED" at the end; writes screenshots.
/* global localStorage */
(() => {
  const g = window.__game;
  // (records this test's waves could set are put back at the end)
  const saved = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/zombies/.test(k)) saved[k] = localStorage.getItem(k); }
  const restore = () => {
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (/zombies/.test(k) && !(k in saved)) localStorage.removeItem(k); }
    for (const k in saved) localStorage.setItem(k, saved[k]);
  };
  const out = [];
  let pass = 0, fail = 0;
  const check = (name, ok, info = '') => { if (ok) pass++; else fail++; out.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
  const ticks = (n) => { for (let i = 0; i < n; i++) g.tick(); };
  const frames = (n, dt = 0.05) => { for (let i = 0; i < n; i++) g.frame(dt); };
  const con = (line) => { const lines = []; const pr = g.console.menus.print; g.console.menus.print = (t) => lines.push(String(t)); try { g.console.exec(line); } finally { g.console.menus.print = pr; } return lines.join(' | '); };
  const Z = () => g.zombies;
  const PU = () => g.zombies.pickups;
  const me = () => g.local;
  const squad = () => g.players.filter((p) => p.team === 'CT' && !p.isZombie);
  const botPs = () => squad().filter((p) => p.isBot);
  let rec = [];
  const pick = (e) => ({ type: e.type, phase: e.phase, player: e.player, id: e.id, kind: e.kind, amount: e.amount, reason: e.reason, until: e.until, pos: e.pos ? e.pos.slice() : null, squad: e.squad });
  let busOff = null;
  const listen = () => { busOff?.(); rec = []; busOff = Z().events.on('*', (e) => rec.push(pick(e))); };
  const of = (type, f = () => true) => rec.filter((e) => e.type === type && f(e));
  // sounds played (names), through a spy on g.sound.play / loop
  let played = [];
  const sp = g.sound.play.bind(g.sound), sl = g.sound.loop.bind(g.sound);
  g.sound.play = (n, o) => { played.push(n); return sp(n, o); };
  g.sound.loop = (n, o) => { played.push('loop:' + n); return sl(n, o); };
  let think0 = null;
  const freezeBots = () => { if (!think0) think0 = g.bots.think; g.bots.think = () => {}; };
  const thawBots = () => { if (think0) g.bots.think = think0; think0 = null; };
  let hold = false;
  const bl = g.buildLocalCmd.bind(g);
  g.buildLocalCmd = () => { const c = bl(); if (hold) c.wbuttons |= 8; return c; };
  function newRun(opts = {}) {
    thawBots();
    hold = false;
    g.newGame({ mode: 'zombies', allies: 2, ...opts });
    g.joinTeam(g.local, 'CT');
    g.bots.fillTeams(opts.allies ?? 2);
    ticks(50);
    me().god = true;
    Z().nextWaveAt = g.time + 9999; // (hold the first break)
    listen();
    played = [];
  }
  /** A wave on, with nothing spawning by itself (the test spawns what it needs). */
  function quietWave(n = 6) {
    con('sv_cheats 1');
    con(`zm_wave ${n}`);
    Z().clearHorde();
    Z().spawned = 0; Z().stats.count = 999; Z().nextSpawn = 1e12; // (nothing spawns, and it's never cleared while we work)
    for (const q of squad()) { const s = Z().economy.ps.get(q); if (s) s.spawnT = 0; } // (no re-arm window: the shop's shut mid-wave)
    rec = [];
  }
  const walker = (near = me().pm.origin, hp = 100) => {
    Z().spawnZombie({ variant: 'walker', near: near.slice(), extra: false });
    const z = Z().pool.filter((q) => q.alive && !q.special).pop();
    z.health = z.maxHealth = hp; z.armor = 0;
    z.cmd = null;
    return z;
  };
  const kill = (z, by = me(), dmg = 99999) => g.damagePlayer(z, by, dmg, 2, 'deagle', [1, 0, 0], z.eyePos());
  const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };
  const atMe = (fw = 0, rt = 0) => { const o = me().pm.origin, y = me().pm.angles[1] * Math.PI / 180; return [o[0] + Math.cos(y) * fw + Math.sin(y) * rt, o[1] + Math.sin(y) * fw - Math.cos(y) * rt, o[2] - 30]; };
  const feet = (p) => p.feet();
  /** A floor spot (a nav node) 250-700 units from you and 200+ from everyone in the squad: loot left there lies untouched. */
  const freeSpot = () => {
    const o = me().pm.origin;
    for (const n of g.nav.nodes) {
      const d = Math.hypot(n.x - o[0], n.y - o[1]);
      if (d < 250 || d > 700 || Math.abs(n.z - (o[2] - 36)) > 60) continue;
      if (squad().some((q) => Math.hypot(n.x - q.pm.origin[0], n.y - q.pm.origin[1]) < 200)) continue;
      return [n.x, n.y, n.z + 10];
    }
    return atMe(400);
  };
  const steps = [];
  let WS, ZD, PW, R;

  // ---------------------------------------------------------------- registrations
  steps.push(async () => {
    WS = await import('/src/game/weaponsys.js');
    ZD = await import('/src/game/zdiff.js');
    PW = await import('/src/game/powerups.js');
    R = await import('/src/assets/snd/recipes.js');
    const PK = await import('/src/game/perks.js');
    const P = await import('/src/game/pickups.js');
    const names = R.SOUND_GROUPS.Drops;
    check('20 drop sounds catalogued, every one in the bank', names.length === 20 && names.every((n) => g.sound.bank.get(n)), names.filter((n) => !g.sound.bank.get(n)).join(','));
    check('five power-ups, each with a colour, a stinger and a banner line', ['maxammo', 'instakill', 'doublecash', 'nuke', 'firesale'].every((id) => PW.POWERUPS[id] && PW.POWERUPS[id].rgb && names.includes(PW.POWERUPS[id].sound) && PW.POWERUPS[id].sub));
    check('the timed ones are buffs (rarity buff, never drafted)', ['doublecash', 'instakill', 'firesale'].every((id) => PK.PERKS[id]?.rarity === 'buff') && !PK.PERKS.instakill.stats);
    const D = ZD.ZDIFF, order = ['casual', 'normal', 'hard', 'nightmare'];
    const fields = ['budget', 'chance', 'powerup', 'pity', 'life', 'powerupSecs', 'airdropFrom', 'airdropChance', 'crateLife', 'vial', 'cash', 'nukePay', 'fireSale', 'floor'];
    check('the drops group has its fields on every preset', order.every((id) => fields.every((f) => D[id].drops[f] != null)) && D.sandbox.drops.vial === D.normal.drops.vial);
    const down = (f) => order.every((id, i) => !i || f(D[id]) <= f(D[order[i - 1]]));
    check('help shrinks from Casual to Nightmare (pity, vial, cash, nuke pay, crate life, floor; the sale shallower)', down((d) => d.drops.pity) && down((d) => d.drops.vial) && down((d) => d.drops.cash) && down((d) => d.drops.nukePay) && down((d) => d.drops.crateLife) && down((d) => d.drops.floor) && down((d) => -d.drops.fireSale));
    check('Normal: loot lasts 30 s, a timed power-up 15 s', D.normal.drops.life === 30 && D.normal.drops.powerupSecs === 15);
    let built = 0;
    for (const k of ['cash', 'ammo', 'health', 'airdrop']) built += P.MODELS[k]({ id: null, data: null }).length > 0;
    for (const id of Object.keys(PW.POWERUPS)) built += P.MODELS.powerup({ id, data: null }).length > 0;
    check('every loot model builds', built === 9);
    return false;
  });

  // ---------------------------------------------------------------- loot from kills
  steps.push(async () => {
    newRun();
    freezeBots();
    quietWave(6);
    const pk = PU(), D = Z().diff.drops;
    check('a wave sets its loot budget (base + perWave x wave, more for the squad)', pk.budget >= Math.round(D.budget[0] + D.budget[1] * 6) && pk.spent === 0, `${pk.budget}`);
    // a lucky kill drops cash (chance passes, no power-up, cash)
    pk.rnd = seq(0, 0.99, 0);
    let z = walker(atMe(150));
    kill(z);
    let d = g.dropped.find((q) => q.kind === 'cash');
    check('a squad kill can drop loot (cash, popping out of the body)', !!d && pk.spent === 1 && of('pickup', (e) => e.phase === 'spawn' && e.kind === 'cash').length === 1 && played.includes('loot_drop'));
    check('cash is worth about a kill and a half', d && d.amount >= Z().economy.killValue(false) * D.cash * 0.75 && d.amount <= Z().economy.killValue(false) * D.cash * 1.3, `${d?.amount}`);
    // an unlucky one drops nothing
    pk.rnd = seq(0.99);
    kill(walker(atMe(150)));
    check('...an unlucky one nothing', pk.spent === 1 && g.dropped.filter((q) => q.kind !== 'weapon').length === 1);
    // not the zombies' own deaths, not in a break, not from a boss
    pk.rnd = seq(0, 0.99, 0);
    kill(walker(atMe(150)), null);
    check('a death the squad didn\'t cause drops nothing', pk.spent === 1);
    con('zm_boss 0');
    const B = g.bosses.boss;
    pk.rnd = seq(0, 0, 0);
    if (B) g.damagePlayer(B, me(), 1e7, 2, 'deagle', [1, 0, 0], B.eyePos());
    check('a boss never drops loot', B && !B.alive && pk.spent === 1 && !g.dropped.some((q) => q.kind === 'powerup'), `${B?.alive} spent ${pk.spent}`);
    g.bosses.despawn?.();
    // the budget runs out
    pk.spent = 0; pk.budget = 3;
    let n0 = pk.stats.drops;
    for (let i = 0; i < 6; i++) { pk.rnd = seq(0, 0.99, 0); kill(walker(atMe(150, i * 30))); }
    check('the wave\'s budget caps it (3 of 6 lucky kills)', pk.stats.drops - n0 === 3 && pk.spent === 3);
    // an elite drops something whatever the budget: a power-up
    const els = Z().specials;
    els.spawn('hunter', { extra: true, near: me().pm.origin.slice(), elite: 2 });
    const el = Z().pool.find((q) => q.alive && q.elite);
    pk.rnd = seq(0.99, 0.99, 0.2, 0.5);
    n0 = pk.stats.drops;
    if (el) kill(el);
    check('an elite always drops (a power-up), budget or not', el && pk.stats.drops - n0 === 1 && g.dropped.some((q) => q.kind === 'powerup' && !q.taken), el ? '' : 'no elite spawned');
    // power-ups: pity raises the odds
    pk.sincePU = 0;
    const p0 = Math.min(0.6, D.powerup + D.pity * 0), p10 = Math.min(0.6, D.powerup + D.pity * 10);
    check('pity: ten drops without a power-up raise its odds a lot', p10 > p0 * 3, `${p0} -> ${p10}`);
    // what kind: by need (hurt squad -> vials)
    const need0 = pk.need();
    for (const q of squad()) q.health = 20;
    const need1 = pk.need();
    check('need: a hurt squad wants vials', need1.hp > need0.hp + 0.5);
    for (const q of squad()) q.health = q.maxHealth;
    // in a break: nothing
    con('zm_skip');
    pk.rnd = seq(0, 0, 0);
    n0 = pk.stats.drops;
    const zb = walker(atMe(150));
    kill(zb);
    check('no loot in a break', pk.stats.drops === n0 && Z().state === 'break');
    g.clearDropped();
    return false;
  });

  // ---------------------------------------------------------------- the loot itself
  steps.push(async () => {
    newRun();
    freezeBots();
    quietWave(6);
    const p = me(), pk = PU();
    const m0 = p.money;
    pk.spawn('cash', feet(p), { amount: 85, vel: [0, 0, 0] });
    ticks(70);
    check('cash: walked over, paid', p.money - m0 === 85 && played.includes('loot_cash'));
    check('...a line under the crosshair (+$85)', pk.ui.toasts.some((t) => t.text === '+$85'));
    p.health = 40;
    pk.spawn('health', feet(p), { vel: [0, 0, 0] });
    ticks(70);
    check(`health vial: +${Z().diff.drops.vial} (the difficulty's)`, p.health === 40 + Z().diff.drops.vial && played.includes('loot_health'), `${p.health}`);
    p.weapons[2].ammo = 0;
    pk.spawn('ammo', feet(p), { vel: [0, 0, 0] });
    ticks(70);
    check('ammo: a pack for the pistol', p.weapons[2].ammo > 0 && played.includes('loot_ammo'));
    // fading: blinks over the last seconds, then goes
    const d = pk.spawn('cash', freeSpot(), { amount: 5, life: 8, vel: [0, 0, 0] });
    ticks(150);
    const vis0 = d.obj.visible;
    let blinked = false;
    for (let i = 0; i < 800; i++) { g.tick(); if (!d.obj.visible) blinked = true; }
    check('loot blinks through its last seconds and fades (expire event)', vis0 && blinked && d.taken && of('pickup', (e) => e.phase === 'expire').length >= 1, `${vis0} ${blinked} ${d.taken} ${of('pickup', (e) => e.phase === 'expire').length} ${d.pos.map(Math.round)}`);
    // the floor cap: the oldest small loot fades first
    g.clearDropped();
    const cap = Z().diff.drops.floor;
    pk.rnd = seq(0.99, 0);
    for (let i = 0; i < cap + 2; i++) { pk.rnd = seq(0.99, 0); pk.drop(atMe(200 + i * 4, 0), { hp: 0, ammo: 0 }); }
    ticks(200);
    const left = pk.count('cash') + pk.count('ammo') + pk.count('health');
    check(`no more than diff.drops.floor (${cap}) bits of loot lie about`, left <= cap, `${left}`);
    g.clearDropped();
    return false;
  });

  // ---------------------------------------------------------------- power-ups
  steps.push(async () => {
    newRun();
    freezeBots();
    quietWave(6);
    const p = me(), pk = PU(), M = Z().mods;
    check('no power-up taken yet: the pipeline is idle', !M.live);
    const take = (id) => { played = []; pk.spawn('powerup', feet(p), { id, vel: [0, 0, 0] }); ticks(70); };
    // Max Ammo
    for (const q of squad()) for (const s of [1, 2]) if (q.weapons[s]) q.weapons[s].ammo = 0;
    take('maxammo');
    check('Max Ammo: every gun in the squad full', squad().every((q) => [1, 2].every((s) => !q.weapons[s] || q.weapons[s].ammo === q.weapons[s].def.maxAmmo)) && played.includes('powerup_grab') && played.includes('pu_maxammo'));
    check('...the banner, the powerup event', pk.ui.bn?.id === 'maxammo' && of('powerup', (e) => e.phase === 'on' && e.id === 'maxammo').length === 1);
    // Double Cash
    take('doublecash');
    const m0 = p.money;
    Z().economy.pay(p, 100, 'kill');
    check('Double Cash: the squad earns double', p.money - m0 === 200 && Z().perks.has(botPs()[0], 'doublecash') === 1);
    // Insta-Kill
    take('instakill');
    const z = walker(atMe(150), 50000);
    g.damagePlayer(z, p, 10, 2, 'glock', [1, 0, 0], z.eyePos());
    check('Insta-Kill: a 50000 HP zombie dies to a pistol round', !z.alive);
    con('zm_boss 1');
    const B = g.bosses.boss;
    const h0 = B?.health;
    if (B) g.damagePlayer(B, p, 10, 2, 'glock', [1, 0, 0], B.eyePos());
    check('...not a boss', B && B.alive && h0 - B.health < 200, `${h0 - B?.health}`);
    g.bosses.despawn?.();
    const s = {};
    pk.hud(s);
    check('the HUD lists the running ones with their clocks', s.drops.buffs.map((b) => b.id).sort().join() === 'doublecash,instakill' && s.drops.buffs.every((b) => b.left > 10 && b.frac > 0.6));
    // Fire Sale: the shop opens mid-wave, half price
    const E = Z().economy;
    check('mid-wave the gun shop is shut', !E.open(p) && E.refusal(p, 'ak47'));
    take('firesale');
    const cost = E.cost(p, 'ak47'), base = WS.WEAPON_DEFS.ak47.price;
    p.money = 10000;
    const ok = g.rounds.buy(p, 'ak47');
    check('Fire Sale: the whole shop opens mid-wave, at half price', E.open(p) && cost === Math.round(base * Z().diff.drops.fireSale / 5) * 5 && ok !== false && p.weapons[1]?.id === 'ak47', `cost ${cost}`);
    check('...the buy menu says so', /FIRE SALE/.test(E.menuBanner(p)));
    // the clocks run out
    played = [];
    ticks(Math.round((Z().diff.drops.powerupSecs + 1) * 100));
    check('timed power-ups run out (off events, the power-down sound, gone from the HUD)', !Z().perks.has(p, 'instakill') && !Z().perks.has(p, 'firesale') && !E.open(p) && of('powerup', (e) => e.phase === 'off').length === 3 && played.includes('powerup_fade') && pk.active.size === 0);
    const z2 = walker(atMe(150), 50000);
    g.damagePlayer(z2, p, 10, 2, 'glock', [1, 0, 0], z2.eyePos());
    check('...Insta-Kill is over, and the pipeline idles again', z2.alive && !M.live);
    Z().clearHorde();
    return false;
  });

  steps.push(async () => {
    newRun();
    freezeBots();
    quietWave(6);
    const p = me(), pk = PU();
    // the Nuke: every zombie gone, bosses untouched, a flat pay, no loot from it
    const zs = [];
    for (let i = 0; i < 6; i++) zs.push(walker(atMe(300 + i * 60, (i % 3 - 1) * 80), 500));
    con('zm_boss 2');
    const B = g.bosses.boss, bh = B?.health;
    const m0 = p.money, n0 = pk.stats.drops, k0 = Z().killed;
    pk.spawn('powerup', feet(p), { id: 'nuke', vel: [0, 0, 0] });
    played = [];
    ticks(250);
    check('Nuke: every zombie on the map dies (charred), in a rolling wave', zs.every((z) => !z.alive) && Z().killed - k0 === 6 && played.includes('pu_nuke'), `${zs.filter((z) => z.alive).length} alive`);
    check('...not the boss', B && B.alive && B.health === bh);
    check(`...everyone standing gets $${Z().diff.drops.nukePay}, no kill money, no loot`, p.money - m0 === Z().diff.drops.nukePay && pk.stats.drops === n0, `${p.money - m0}`);
    check('...the screen flashes white', pk.ui.flashT > -99);
    g.bosses.despawn?.();
    // a power-up left on the floor hums, and the hum stops when it goes
    played = [];
    const d = pk.spawn('powerup', freeSpot(), { id: 'maxammo', vel: [0, 0, 0], life: 3 });
    ticks(80);
    const hum = pk.hums.has(d);
    ticks(300);
    check('a power-up on the floor hums (a positional loop) until it fades (with a poof)', hum && played.includes('loop:powerup_loop') && played.includes('powerup_vanish') && !pk.hums.has(d));
    // the rolls: never twice running, the mid-wave ones only in a wave, by first wave
    pk.lastPU = 'maxammo';
    let twice = false, early = false;
    for (let i = 0; i < 200; i++) { const id = pk.rollPowerup(); if (id === 'maxammo') twice = true; pk.lastPU = 'maxammo'; }
    Z().wave = 1;
    for (let i = 0; i < 200; i++) { pk.lastPU = null; const id = pk.rollPowerup(); if (id !== 'maxammo') early = true; }
    Z().wave = 6;
    check('power-up rolls: never the same twice running; wave 1 only Max Ammo', !twice && !early);
    return false;
  });

  // ---------------------------------------------------------------- airdrops
  steps.push(async () => {
    newRun();
    freezeBots();
    quietWave(6);
    const p = me(), pk = PU(), A = pk.air;
    played = [];
    const ok = A.call(true);
    check('an airdrop: a flare on open ground away from you, smoke, a call event', ok && A.state === 'flare' && A.flare && of('airdrop', (e) => e.phase === 'call').length === 1 && played.includes('airdrop_flare') && played.includes('loop:flare_loop'));
    const fp = A.flare.pos, dd = Math.hypot(fp[0] - p.pm.origin[0], fp[1] - p.pm.origin[1]);
    check('...400+ units off', dd > 400, `${dd | 0}`);
    ticks(650);
    check('the crate shows up overhead on a parachute (the plane passes)', A.state === 'falling' && A.crate && A.crate.pos[2] > fp[2] + 100 && A.crate.obj.userData.chute?.visible && played.includes('airdrop_plane'));
    let maxFall = 0, prevZ = A.crate.pos[2];
    for (let i = 0; i < 2000 && A.state === 'falling'; i++) { g.tick(); maxFall = Math.max(maxFall, (prevZ - A.crate.pos[2]) * 100); prevZ = A.crate.pos[2]; }
    check('...comes down at a parachute\'s speed and lands (event, thud)', A.state === 'landed' && maxFall < 200 && maxFall > 60 && of('airdrop', (e) => e.phase === 'land').length === 1 && played.includes('airdrop_land'), `${maxFall | 0} u/s`);
    const d = A.crate;
    check(`...where the flare is; it waits ${Z().diff.drops.crateLife} s`, Math.hypot(d.pos[0] - fp[0], d.pos[1] - fp[1]) < 40 && Math.abs(d.expire - g.time - Z().diff.drops.crateLife) < 0.5);
    // walking over it does nothing; holding E beside it opens it
    p.pm.origin[0] = d.pos[0] - 40; p.pm.origin[1] = d.pos[1]; p.pm.origin[2] = d.pos[2] + 37;
    p.pm.velocity[0] = p.pm.velocity[1] = p.pm.velocity[2] = 0;
    ticks(80);
    check('walking up to it doesn\'t open it', A.state === 'landed' && !d.taken);
    const s = {};
    pk.hud(s);
    check('...the HUD offers it (hold E)', s.drops.prompt && s.drops.crate?.state === 'landed');
    hold = true;
    ticks(60);
    const mid = A.prog;
    hold = false;
    ticks(30);
    check('letting go of E loses the progress', mid > 0.2 && A.prog < mid);
    hold = true;
    const prim0 = p.weapons[1]?.id;
    ticks(200);
    hold = false;
    const w = p.weapons[1];
    check('holding E opens it: a heavy gun (full) or a weapon kit, and armour', A.state === 'opened' && d.opened && p.armor === 100 && w && ((w.id !== prim0 && w.ammo === w.def.maxAmmo) || w.skin === 'gold'), `${w?.id} ${w?.skin}`);
    check('...open event, the lid, a banner', of('airdrop', (e) => e.phase === 'open').length === 1 && played.includes('crate_open') && pk.ui.bn?.id === 'crate');
    ticks(300);
    check('...an opened crate goes after a moment, the flare with it', !A.state && !A.flare && d.taken && !g.dropped.includes(d));
    // unopened: it fades
    A.call(true);
    for (let i = 0; i < 3000 && A.state !== 'landed'; i++) g.tick();
    const d2 = A.crate;
    ticks(Math.round((Z().diff.drops.crateLife + 1) * 100));
    check('an unopened crate fades after crateLife (and the flare goes)', d2 && d2.taken && !d2.opened && !A.state && !A.flare);
    // its contents: never one you hold; a bot never gets a launcher
    let launcher = false, same = false;
    const b = botPs()[0];
    for (let i = 0; i < 300; i++) { const id = A.heavy(b); if (WS.WEAPON_DEFS[id].kind === 'launcher') launcher = true; }
    p.weapons[1] = WS.createWeapon('m249');
    Z().wave = 20;
    for (let i = 0; i < 300; i++) if (A.heavy(p) === 'm249') same = true;
    check('a crate never holds a gun you have; a bot never gets a launcher', !launcher && !same);
    // a kit: every attachment that fits, and gold
    const ak = WS.createWeapon('ak47');
    p.weapons[1] = ak; g.selectWeapon(p, ak, true);
    pk.rnd = seq(0.1);
    const got = A.reward(p, { id: null });
    check('a weapon kit: every attachment that fits the gun in your hands, gold plated', got.kind === 'kit' && ak.skin === 'gold' && Object.keys(ak.att || {}).length >= 4, JSON.stringify(ak.att));
    return false;
  });

  steps.push(async () => {
    // planned into a wave: from airdropFrom, partway through, mid-wave
    newRun();
    freezeBots();
    const pk = PU(), A = pk.air;
    pk.rnd = seq(0);
    con('sv_cheats 1');
    con(`zm_wave ${Z().diff.drops.airdropFrom}`);
    check('a wave from airdropFrom plans an airdrop (airdropChance)', !!A.planned);
    const P0 = A.planned;
    Z().killed = Math.ceil(P0.frac * Z().stats.count) + 1;
    ticks(1100);
    check('...called once the wave is far enough in', A.state && A.state !== null && !A.planned, `${A.state}`);
    A.cleanup();
    pk.rnd = seq(0);
    con('zm_wave 10');
    check('a boss wave never has one', !A.planned);
    pk.rnd = seq(0);
    con('zm_wave 2');
    check('nor one before airdropFrom', !A.planned);
    Z().clearHorde();
    return false;
  });

  // ---------------------------------------------------------------- bots
  steps.push(async () => {
    newRun({ allies: 1 });
    quietWave(6);
    const pk = PU(), b = botPs()[0], p = me();
    // you far off: a bot fetches cash lying close to it
    p.pm.origin[0] += 4000;
    p.god = true;
    b.health = b.maxHealth;
    const bo = b.pm.origin;
    const near = () => { for (const n of g.nav.nodes) { const d = Math.hypot(n.x - bo[0], n.y - bo[1]); if (d > 150 && d < 260 && Math.abs(n.z - (bo[2] - 36)) < 20) return n; } return null; };
    let spot = near();
    const d = spot && pk.spawn('cash', [spot.x, spot.y, spot.z + 10], { amount: 50, vel: [0, 0, 0] });
    const m0 = b.money;
    for (let i = 0; i < 800 && d && !d.taken; i++) g.tick();
    check('a bot goes for loot close by when it\'s quiet', d && d.taken && b.money > m0, spot ? `${d.taken}` : 'no spot');
    // with a zombie on the loot it leaves it
    spot = near() || spot; // (somewhere new: it's standing where the cash was)
    const d2 = spot && pk.spawn('cash', [spot.x, spot.y, spot.z + 10], { amount: 50, vel: [0, 0, 0] });
    const z = walker([spot.x + 30, spot.y, spot.z + 40], 1e6);
    z.god = true;
    const zthink = Z().think;
    Z().think = () => {};
    let went = false;
    for (let i = 0; i < 200; i++) { g.tick(); z.pm.origin[0] = spot.x + 30; z.pm.origin[1] = spot.y; if (b.bot?.loot === d2 || (g.bots.bots.find((x) => x.p === b)?.loot === d2)) went = true; }
    Z().think = zthink;
    check('...not with a zombie on it', d2 && !went, `${went} ${d2?.taken}`);
    Z().despawn(z);
    if (!d2.taken) pk.remove(d2);
    // a power-up by you: yours, not the bot's
    p.pm.origin[0] -= 4000;
    ticks(5);
    const bot = g.bots.bots.find((x) => x.p === b);
    const pu = pk.spawn('powerup', [spot.x, spot.y, spot.z + 10], { id: 'maxammo', vel: [0, 0, 0] });
    ticks(30);
    const it = {};
    bot.lootT = 0;
    const goes = pk.botLoot(bot, it);
    check('a power-up near you is left to you', !goes || bot.loot !== pu);
    pk.remove(pu);
    return false;
  });

  // ---------------------------------------------------------------- console, HUD, a look
  steps.push(async () => {
    newRun();
    freezeBots();
    quietWave(6);
    con('sv_cheats 1');
    check('zm_drop powerup <id> / zm_drops', /powerup nuke dropped/.test(con('zm_drop powerup nuke')) && /powerup:nuke/.test(con('zm_drops')) && /loot this wave/.test(con('zm_drops')));
    check('zm_drop rejects a bad power-up', /zm_drop powerup </.test(con('zm_drop powerup bogus')));
    g.clearDropped();
    check('zm_airdrop puts a flare up', /flare is up/.test(con('zm_airdrop')) && PU().air.state === 'flare');
    PU().air.cleanup();
    // everything on screen at once: loot and power-ups in front, two running, the banner
    const p = me(), pk = PU();
    p.pm.angles[0] = 12;
    const ids = ['maxammo', 'instakill', 'doublecash', 'nuke', 'firesale'];
    ids.forEach((id, i) => pk.spawn('powerup', atMe(260, (i - 2) * 56), { id, vel: [0, 0, 0] }));
    pk.spawn('cash', atMe(140, -40), { amount: 80, vel: [0, 0, 0] });
    pk.spawn('ammo', atMe(140, 0), { vel: [0, 0, 0] });
    pk.spawn('health', atMe(140, 40), { vel: [0, 0, 0] });
    pk.spawn('powerup', feet(p), { id: 'instakill', vel: [0, 0, 0] });
    pk.spawn('powerup', feet(p), { id: 'doublecash', vel: [0, 0, 0] });
    ticks(80);
    let ok = true;
    try { frames(12); } catch (e) { ok = false; console.error(e); }
    check('the HUD and the frame cope with it all', ok);
    return { shot: true };
  });

  steps.push(async () => {
    // the crate, landed, from close by
    const pk = PU(), A = pk.air, p = me();
    g.clearDropped();
    A.call(true);
    for (let i = 0; i < 3000 && A.state !== 'landed'; i++) { g.tick(); if (i % 10 === 0) g.frame(0.1); }
    const c = A.crate.pos;
    p.pm.origin[0] = c[0] - 150; p.pm.origin[1] = c[1] - 60; p.pm.origin[2] = c[2] + 37;
    const e = p.eyePos();
    p.pm.angles[1] = Math.atan2(c[1] - e[1], c[0] - e[0]) * 180 / Math.PI;
    p.pm.angles[0] = 8;
    ticks(5);
    let ok = true;
    try { frames(20, 0.1); } catch (er) { ok = false; console.error(er); }
    check('a landed crate draws (smoke, beacon, marker)', ok && A.state === 'landed');
    return { shot: true };
  });

  steps.push(async () => {
    thawBots();
    restore();
    g.sound.play = sp; g.sound.loop = sl;
    g.buildLocalCmd = bl;
    return true;
  });

  let i = 0;
  window.__drive = async () => {
    out.length = 0;
    let done = false, r = null;
    try { r = await steps[i++](); done = r === true; } catch (e) { check('step ' + i + ' threw', false, e.stack); done = true; restore(); }
    if (i >= steps.length) done = true;
    if (done) out.push(`[sim] ${fail ? 'FAILED' : 'ALL PASSED'}: ${pass} passed, ${fail} failed`);
    return { log: out.join('\n'), done, shot: !!(r && r.shot) };
  };
})();
