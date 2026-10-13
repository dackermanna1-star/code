// Zombie survival, Milestone 3 foundation: the shared contracts the six M3 builders (perks,
// forge, squad, bosses, drops, arsenal) code against (m3-contracts) - the difficulty groups,
// the new events and modules, the modifier pipeline (damage dealt / taken, reload / draw /
// fire rate, magazine, max health, speed, prices, money, healing; stacking; timed and
// squad-wide sources; hooks; the run reset), the perks API (grant / has / buff / roll /
// offer), pickups (cash, ammo, health, power-up, airdrop, trophy, fading; weapons still drop
// and get picked up), the boss seams (order, health, arrival, posture, reward), squad roles
// and the Focus order, the forge routes, the run seed - and that with every scaffold idle
// the mode plays as before.
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=2" tools/tests/zm3-foundation.js /tmp/zm3
// Prints "[sim] PASS ..." / "[sim] FAIL ...". Builders: when your feature changes a scaffold
// default checked here (e.g. the fixed boss order, the full heal after a boss, riflemen only),
// replace that check with one for your behaviour.
/* global document, localStorage */
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
  const con = (line) => { const lines = []; const pr = g.console.menus.print; g.console.menus.print = (t) => lines.push(String(t)); try { g.console.exec(line); } finally { g.console.menus.print = pr; } return lines.join(' | '); };
  const Z = () => g.zombies;
  const M = () => g.zombies.mods;
  const P = () => g.zombies.perks;
  const me = () => g.local;
  const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
  const squad = () => g.players.filter((p) => p.team === 'CT' && !p.isZombie);
  const botPs = () => squad().filter((p) => p.isBot);
  let rec = [];
  const pick = (e) => ({ type: e.type, phase: e.phase, player: e.player, id: e.id, kind: e.kind, amount: e.amount, reason: e.reason, source: e.source, squad: e.squad, n: e.n, ids: e.ids ? e.ids.slice() : null, order: e.order, target: e.target, bots: e.bots, role: e.role, until: e.until });
  let busOff = null;
  const listen = () => { busOff?.(); rec = []; busOff = Z().events.on('*', (e) => rec.push(pick(e))); };
  const of = (type, f = () => true) => rec.filter((e) => e.type === type && f(e));
  let think0 = null;
  const freezeBots = () => { if (!think0) think0 = g.bots.think; g.bots.think = () => {}; };
  const thawBots = () => { if (think0) g.bots.think = think0; think0 = null; };
  function newRun(opts = {}) {
    thawBots();
    g.newGame({ mode: 'zombies', allies: 2, ...opts });
    g.joinTeam(g.local, 'CT');
    g.bots.fillTeams(opts.allies ?? 2);
    ticks(50);
    me().god = true;
    Z().nextWaveAt = g.time + 9999; // (hold the first break)
    listen();
  }
  let CR, WS;
  const walker = () => {
    Z().spawnZombie({ variant: 'walker', near: me().pm.origin.slice() });
    const z = Z().pool.filter((q) => q.alive && !q.special).pop();
    z.health = z.maxHealth = 100000; z.armor = 0;
    return z;
  };
  const hitZ = (z, dmg, hg, weapon = 'deagle', opts = {}) => { const h0 = z.health; g.damagePlayer(z, me(), dmg, hg, weapon, [1, 0, 0], z.eyePos(), opts); return h0 - z.health; };
  const steps = [];

  // ---------------------------------------------------------------- difficulty groups, events, modules
  steps.push(async () => {
    CR = await import('/src/game/combatrules.js');
    WS = await import('/src/game/weaponsys.js');
    const ZD = await import('/src/game/zdiff.js');
    const RS = await import('/src/game/runstats.js');
    const groups = { perks: ['choices', 'rareEvery', 'rerolls', 'curse', 'from'], forge: ['priceK', 'tiers', 'roundFrom', 'procK'], roles: ['focus', 'medicHeal', 'holdArc'], boss: ['hpWave', 'heal', 'armor', 'relics', 'posture', 'kneel', 'kneelK', 'phases', 'elitesFrom', 'eliteChance', 'eliteHp'], drops: ['budget', 'chance', 'powerup', 'life', 'powerupSecs', 'airdropFrom', 'airdropChance'] };
    const missing = [];
    for (const id of ZD.ZDIFF_ORDER) for (const [k, fields] of Object.entries(groups)) for (const f of fields) if (ZD.ZDIFF[id][k]?.[f] === undefined) missing.push(`${id}.${k}.${f}`);
    check('every preset has the M3 groups', !missing.length && Object.keys(groups).every((k) => ZD.ZDIFF_GROUPS.includes(k)), missing.join(' '));
    check('sandbox plays normal\'s M3 rows', Object.keys(groups).every((k) => JSON.stringify(ZD.ZDIFF.sandbox[k]) === JSON.stringify(ZD.ZDIFF.normal[k])));
    const four = ['casual', 'normal', 'hard', 'nightmare'];
    const mono = (get, up) => four.map((id) => get(ZD.ZDIFF[id])).every((v, i, a) => !i || (up ? v >= a[i - 1] : v <= a[i - 1]));
    const less = [['perks.choices', (d) => d.perks.choices], ['drops.budget', (d) => d.drops.budget[0]], ['drops.chance', (d) => d.drops.chance], ['drops.powerup', (d) => d.drops.powerup], ['boss.heal', (d) => d.boss.heal], ['boss.posture', (d) => d.boss.posture], ['roles.focus', (d) => d.roles.focus]].filter(([, f]) => !mono(f, false)).map(([n]) => n);
    const more = [['forge.priceK', (d) => d.forge.priceK], ['boss.eliteChance', (d) => d.boss.eliteChance], ['perks.curse', (d) => d.perks.curse]].filter(([, f]) => !mono(f, true)).map(([n]) => n);
    check('help shrinks, pressure grows casual -> nightmare', !less.length && !more.length, less.concat(more).join(' '));
    // bosses must not get tankier: Normal's HP-by-wave averages today's (1.0) over waves 5-25 and stays under 1.6 after
    const hw = ZD.ZDIFF.normal.boss.hpWave, k = (n) => hw[0] + hw[1] * (n / 5 - 1);
    const avg1 = [5, 10, 15, 20, 25].reduce((s, n) => s + k(n), 0) / 5, avg2 = [30, 35, 40, 45, 50].reduce((s, n) => s + k(n), 0) / 5;
    check('normal boss HP by wave is no tankier than today', avg1 <= 1.0001 && avg2 <= 1.6001, `${avg1.toFixed(2)} / ${avg2.toFixed(2)}`);
    const r = ZD.resolveDiff(ZD.zombieOptions({ zdiff: 'hard', seed: '77' }));
    check('resolveDiff carries the M3 groups, frozen; zombieOptions has a seed', r.boss.posture === ZD.ZDIFF.hard.boss.posture && Object.isFrozen(r.drops) && Object.isFrozen(r.drops.budget) && ZD.zombieOptions({ seed: '77' }).seed === 77 && ZD.zombieOptions({}).seed === null);
    const ev = ['perk', 'draft', 'synergy', 'forge', 'proc', 'role', 'order', 'posture', 'bossphase', 'trophy', 'elite', 'pickup', 'powerup', 'airdrop'];
    check('M3 events registered', ev.every((n) => RS.EVENT_TYPES.has(n)), ev.filter((n) => !RS.EVENT_TYPES.has(n)).join(' '));
    newRun();
    const mods = ['mods', 'perks', 'pickups', 'forge', 'squad'];
    const api = ['tick', 'hud', 'frame', 'command'];
    const lacking = mods.flatMap((m) => api.filter((f) => typeof Z()[m]?.[f] !== 'function').map((f) => `${m}.${f}`));
    check('M3 modules built with tick / hud / frame / command', !lacking.length, lacking.join(' '));
    const n = { tick: 0, hud: 0, frame: 0 };
    const spy = (o, f, key) => { const f0 = o[f].bind(o); o[f] = (...a) => { n[key]++; return f0(...a); }; return () => { o[f] = f0; }; };
    const undo = [spy(Z().squad, 'tick', 'tick'), spy(Z().pickups, 'hud', 'hud'), spy(Z().perks, 'frame', 'frame')];
    const HS = await import('/src/game/hudstate.js');
    ticks(20); g.frame(0.05); HS.buildHudState(g);
    undo.forEach((f) => f());
    check('M3 hooks reached (tick, hud, frame)', n.tick >= 20 && n.hud >= 1 && n.frame >= 1, JSON.stringify(n)); // (the page's own loop may add some)
    check('unclaimed commands still fall through', Z().command(me(), 'zm3_nothing', []) === false && /Unknown command/.test(con('zm3_nothing')));
    check('a run has a seed', Number.isInteger(Z().seed) && Z().seed >= 0);
    return false;
  });

  // ---------------------------------------------------------------- the pipeline idle: nothing changes
  steps.push(async () => {
    freezeBots();
    check('nobody has modifiers; max health 100', !M().live && squad().every((p) => p.zm === null || p.zm === undefined) && squad().every((p) => p.maxHealth === 100) && me().health === 100);
    const z = walker();
    const H = CR.HITGROUP;
    const d0 = hitZ(z, 40, H.CHEST);
    check('idle: damage dealt as before (computeDamage only)', near(d0, 40, 0.5), String(d0));
    check('idle: prices, money, speed, healing, timings untouched', M().price(me(), 'ak47') === 1 && M().money(me(), 123, 'kill') === 123 && M().speed(me()) === 1 && M().heal(me(), 20) === 20 && M().wk(me()) === null && M().damage(z, me(), 33, H.HEAD, 'ak47', {}) === 33);
    // ---- outgoing
    M().set(me(), 'test:dmg', { damage: 0.5 });
    const d1 = hitZ(z, 40, H.CHEST);
    check('damage +0.5: x1.5', near(d1 / d0, 1.5, 0.01), `${d0} -> ${d1}`);
    M().set(me(), 'test:dmg2', { damage: 0.2 });
    M().set(me(), 'test:dmg', { damage: 0.2 });
    const d2 = hitZ(z, 40, H.CHEST);
    check('within a stat bonuses add: +0.2 +0.2 = x1.4, not x1.44', near(d2 / d0, 1.4, 0.01), String(d2 / d0));
    M().remove(me(), 'test:dmg2');
    M().set(me(), 'test:head', { headDamage: 0.5 });
    const dh0 = (() => { M().remove(me(), 'test:dmg'); M().remove(me(), 'test:head'); return hitZ(z, 20, H.HEAD); })();
    M().set(me(), 'test:dmg', { damage: 0.2 }); M().set(me(), 'test:head', { headDamage: 0.5 });
    const dh1 = hitZ(z, 20, H.HEAD), db1 = hitZ(z, 40, H.CHEST);
    check('different stats multiply: head x1.2 x1.5, body x1.2 only', near(dh1 / dh0, 1.8, 0.02) && near(db1 / d0, 1.2, 0.01), `${(dh1 / dh0).toFixed(3)} ${(db1 / d0).toFixed(3)}`);
    M().remove(me(), 'test:dmg'); M().remove(me(), 'test:head');
    M().set(me(), 'test:fire', { fireDamage: 1, bulletDamage: -0.5, meleeDamage: 2 });
    const f0 = hitZ(z, 40, H.CHEST), f1 = hitZ(z, 20, 0, 'molotov', { blast: true, fire: true }), f2 = hitZ(z, 20, H.CHEST, 'knife');
    M().remove(me(), 'test:fire');
    const f1b = hitZ(z, 20, 0, 'molotov', { blast: true, fire: true }), f2b = hitZ(z, 20, H.CHEST, 'knife');
    check('damage kinds: bullet / fire / melee stats apply by kind', near(f0 / d0, 0.5, 0.01) && near(f1 / f1b, 2, 0.02) && near(f2 / f2b, 3, 0.02), `${(f0 / d0).toFixed(2)} ${(f1 / f1b).toFixed(2)} ${(f2 / f2b).toFixed(2)}`);
    // ---- incoming
    me().god = false; me().armor = 0; me().helmet = false;
    me().health = 100;
    g.damagePlayer(me(), z, 20, H.CHEST, 'zombie', [1, 0, 0], me().eyePos());
    const t0 = 100 - me().health;
    M().set(me(), 'test:in', { taken: -0.25, takenClaw: -0.2 });
    me().health = 100;
    g.damagePlayer(me(), z, 20, H.CHEST, 'zombie', [1, 0, 0], me().eyePos());
    const t1 = 100 - me().health;
    M().set(me(), 'test:in', { takenFire: -1 });
    me().health = 100;
    g.damagePlayer(me(), z, 20, 0, 'molotov', null, null, { blast: true, fire: true });
    const t2 = 100 - me().health;
    M().remove(me(), 'test:in');
    me().health = 100; me().god = true;
    check('damage taken: x0.75 x0.8 on a claw, fire immune with takenFire -1', t0 > 0 && near(t1 / t0, 0.6, 0.02) && t2 === 0, `${t0} -> ${t1}, fire ${t2}`);
    check('outgoing stats don\'t touch the squad, incoming don\'t touch zombies', (() => { M().set(me(), 'x', { taken: -0.5 }); const a = hitZ(z, 40, H.CHEST); M().remove(me(), 'x'); return near(a, d0, 0.5); })());
    // ---- boss and specials
    con('sv_cheats 1');
    con('zm_boss 0');
    const b = g.bosses.boss;
    b.health = b.maxHealth = 100000;
    const bh = () => { const h0 = b.health; g.damagePlayer(b, me(), 40, H.CHEST, 'deagle', [1, 0, 0], b.eyePos()); return h0 - b.health; };
    const bb0 = bh();
    M().set(me(), 'test:boss', { bossDamage: 1, specialDamage: 2 });
    const bb1 = bh(), zz = hitZ(z, 40, H.CHEST);
    M().remove(me(), 'test:boss');
    check('bossDamage on bosses only', near(bb1 / bb0, 2, 0.02) && near(zz, d0, 0.5), `${bb0} -> ${bb1}, common ${zz}`);
    g.bosses.despawn();
    // ---- hooks
    let calls = 0;
    const off = M().addHook('out', (a, v, dmg) => { calls++; return dmg * 2; });
    const hk = hitZ(z, 40, H.CHEST);
    off();
    check('an out hook runs on squad hits on zombies; its remover takes it off (all idle again)', calls === 1 && near(hk / d0, 2, 0.02) && !M().live, `${calls} ${hk}`);
    Z().despawn(z);
    return false;
  });

  // ---------------------------------------------------------------- the pipeline: you
  steps.push(async () => {
    const p = me();
    // ---- max health
    M().set(p, 'test:hp', { maxHealth: 25 });
    check('maxHealth +25: 125 max, the 25 given', p.maxHealth === 125 && p.health === 125, `${p.maxHealth} ${p.health}`);
    M().remove(p, 'test:hp');
    check('losing it brings health down to the max', p.maxHealth === 100 && p.health === 100 && !p.zm);
    // ---- reload / draw / fire rate / clip / speed
    const deagle = g.giveWeapon(p, 'deagle', { select: true, fullAmmo: true });
    ticks(120);
    deagle.clip = 0; deagle.ammo = 35;
    ticks(1);
    const r0 = deagle.nextAttack - g.time;
    ticks(300);
    M().set(p, 'test:rl', { reload: 1 });
    deagle.clip = 0;
    ticks(1);
    const r1 = deagle.nextAttack - g.time;
    check('reload +1: half the time', deagle.inReload && r0 > 1.9 && near(r1 / r0, 0.5, 0.03), `${r0.toFixed(3)} -> ${r1.toFixed(3)}`);
    ticks(300);
    M().remove(p, 'test:rl');
    const ak = g.giveWeapon(p, 'ak47', { select: true, fullAmmo: true });
    const dr0 = ak.nextAttack - g.time;
    g.selectWeapon(p, deagle, true);
    M().set(p, 'test:dr', { handling: 1 });
    g.selectWeapon(p, ak, true);
    const dr1 = ak.nextAttack - g.time;
    check('handling +1: draws in half the time', near(dr0, 0.75, 0.02) && near(dr1, 0.375, 0.02), `${dr0.toFixed(3)} -> ${dr1.toFixed(3)}`);
    M().remove(p, 'test:dr');
    ticks(120);
    const shoot = () => { const ctx = g.weaponCtx(p); WS.weaponFrame(ak, ctx, 1, 0); return ak.nextPrimary - g.time; };
    const c0 = shoot();
    ticks(100);
    M().set(p, 'test:rof', { fireRate: 1 });
    const c1 = shoot();
    M().remove(p, 'test:rof');
    check('fireRate +1: half the cycle', near(c0, 0.0955, 0.002) && near(c1, c0 / 2, 0.002), `${c0.toFixed(4)} -> ${c1.toFixed(4)}`);
    ticks(100);
    M().set(p, 'test:clip', { clip: 0.5, speed: 0.2 });
    ticks(1);
    const cs = WS.clipSize(ak), sp = p.pm.maxspeed;
    check('clip +0.5: 45 rounds; speed +0.2: x1.2', cs === 45 && near(sp, 221 * 1.2, 0.01), `${cs} ${sp}`);
    const ATT = await import('/src/game/attachments.js');
    ATT.fit(ak, 'extmag');
    ticks(1);
    check('layers multiply: an extended mag (45) x the perk (1.5) = 68', WS.clipSize(ak) === 68 && ak.mods.reload === 1 && ak.mods.handling === 1, String(WS.clipSize(ak)));
    M().remove(p, 'test:clip');
    ticks(1);
    check('and back: 45 and 221', WS.clipSize(ak) === 45 && near(p.pm.maxspeed, 221, 0.01));
    // ---- prices, money, healing
    const E = Z().economy;
    const pr0 = E.cost(p, 'm4a1');
    M().set(p, 'test:eco', { price: -0.1, money: 1, heal: 0.5 });
    const pr1 = E.cost(p, 'm4a1');
    p.money = 10000;
    const bought = g.rounds.buy(p, 'm4a1');
    const paid = 10000 - p.money;
    check('price -0.1: $3100 -> $2790, and that is what it costs', pr0 === 3100 && pr1 === 2790 && bought && paid === 2790, `${pr0} ${pr1} paid ${paid}`);
    rec = [];
    const m0 = p.money;
    E.pay(p, 100, 'kill');
    check('money +1: a $100 payout pays $200 (and says so)', p.money - m0 === 200 && of('earn').length === 1 && of('earn')[0].amount === 200, String(p.money - m0));
    p.health = 50;
    g.heal(p, p, 20);
    check('heal +0.5: a 20 HP patch gives 30', p.health === 80, String(p.health));
    M().remove(p, 'test:eco');
    p.health = 100;
    // ---- timed and squad-wide sources
    let doneN = 0;
    M().set(p, 'test:t', { speed: 0.1 }, { until: g.time + 0.3, done: () => doneN++ });
    const before = !!p.zm;
    ticks(40);
    check('a timed source runs out by itself (done called)', before && !p.zm && doneN === 1 && !M().live);
    const bot = botPs()[0];
    M().set('squad', 'test:aura', { damage: 0.1, maxHealth: 10 });
    const aura = squad().every((q) => q.zm && near(q.zm.damage, 1.1) && q.maxHealth === 110);
    M().remove('squad', 'test:aura');
    check('a squad-wide source is on everyone in it, and off again', aura && !bot.zm && bot.maxHealth === 100 && !me().zm);
    check('zm_mods prints your totals', /no modifiers/.test(con('zm_mods')));
    // ---- the run reset
    M().set(p, 'test:hp', { maxHealth: 50 });
    M().set('squad', 'test:aura', { damage: 0.1 });
    newRun();
    check('a new run: nothing left, max health 100', !M().live && squad().every((q) => !q.zm && q.maxHealth === 100) && M().keys('squad').length === 0);
    return false;
  });

  // ---------------------------------------------------------------- perks API
  steps.push(async () => {
    freezeBots();
    const p = me(), bot = botPs()[0];
    const PK = await import('/src/game/perks.js');
    check('rarity tiers; relics and buffs registered', ['common', 'uncommon', 'rare', 'relic', 'buff'].every((r) => PK.RARITY[r]) && PK.PERKS.ironheart?.rarity === 'relic' && PK.PERKS.doublecash?.rarity === 'buff');
    rec = [];
    const n1 = P().grant(p, 'toughness', { source: 'draft' });
    const n2 = P().grant(p, 'toughness');
    const n3 = P().grant(p, 'toughness');
    check('grant stacks up to max (toughness x2: +50 max health)', n1 === 1 && n2 === 2 && n3 === 0 && P().has(p, 'toughness') === 2 && p.maxHealth === 150 && p.health === 150, `${n1} ${n2} ${n3} ${p.maxHealth}`);
    check('perk events (grant, with source and stacks)', of('perk', (e) => e.phase === 'grant' && e.id === 'toughness').map((e) => e.n).join() === '1,2' && of('perk')[0].source === 'draft' && of('perk')[0].player === p);
    check('list / revoke', P().list(p).length === 1 && P().list(p)[0].n === 2 && P().revoke(p, 'toughness') && !P().has(p, 'toughness') && p.maxHealth === 100 && of('perk', (e) => e.phase === 'revoke').length === 1);
    check('unknown perks are refused', P().grant(p, 'nonsense') === 0 && !P().revoke(p, 'nonsense'));
    // buffs
    rec = [];
    const until = P().buff(p, 'doublecash', 0.3);
    const m0 = p.money;
    Z().economy.pay(p, 50, 'kill');
    check('a timed buff (Double Cash on you)', P().has(p, 'doublecash') === 1 && p.money - m0 === 100 && near(until, g.time + 0.3, 0.02));
    ticks(40);
    check('...runs out (expire event)', !P().has(p, 'doublecash') && of('perk', (e) => e.phase === 'expire' && e.id === 'doublecash').length === 1 && !p.zm);
    P().buff('squad', 'doublecash', 0.3);
    check('a squad-wide buff counts for everyone in it', P().has(bot, 'doublecash') === 1 && P().has(p, 'doublecash') === 1 && bot.zm?.money === 2 && of('perk', (e) => e.phase === 'grant' && e.squad && e.player === null).length === 1);
    ticks(40);
    check('...and runs out for everyone', !P().has(bot, 'doublecash') && !bot.zm);
    // roll
    const r3 = P().roll(3);
    const relics = P().roll(2, { rarity: 'relic' });
    const all = P().roll(99);
    check('roll: distinct ids of drafting tiers; rarity: relic gives relics', r3.length === 3 && new Set(r3).size === 3 && all.every((id) => PK.RARITY[PK.PERKS[id].rarity].weight > 0) && relics.length === 2 && relics.every((id) => PK.PERKS[id].rarity === 'relic'), `${r3} | ${relics}`);
    P().grant(p, 'deadeye');
    check('roll skips what you hold at its max', !P().roll(99, { p }).includes('deadeye') && P().roll(99).includes('deadeye'));
    // offers
    rec = [];
    const of1 = P().offer(p, ['quickhands', 'bulkorder'], { source: 'draft' });
    P().offer(p, ['ironheart', 'hunterseye'], { source: 'trophy', title: 'TROPHY' });
    check('an offer queues for a human; offerFor shows the open one', P().offerFor(p) === of1 && of1.ids.join() === 'quickhands,bulkorder' && of('draft', (e) => e.phase === 'offer').length === 2);
    g.frame(0.016);
    const id = P().choose(p, 1);
    check('choose picks from it (index or id); the next one opens', id === 'bulkorder' && P().has(p, 'bulkorder') === 1 && P().offerFor(p)?.source === 'trophy' && of('draft', (e) => e.phase === 'pick' && e.id === 'bulkorder').length === 1);
    check('perks feed the pipeline (Bulk Order: 10% off)', Z().economy.cost(p, 'm4a1') === 2790);
    P().offer(bot, ['quickhands', 'toughness'], { source: 'draft' });
    check('a bot picks at once', P().has(bot, 'quickhands') + P().has(bot, 'toughness') === 1 && !P().offerFor(bot));
    con('sv_cheats 1');
    con('zm_wave 1');
    check('an offer still open when the wave starts is picked at random', !P().offerFor(p) && (P().has(p, 'ironheart') || P().has(p, 'hunterseye')) > 0 && (p.maxHealth === 140 || p.maxHealth === 100));
    // console
    check('zm_perks lists yours', /deadeye/.test(con('zm_perks')) && /bulkorder/.test(con('zm_perks')));
    con('sv_cheats 0');
    check('zm_perk needs sv_cheats', /needs sv_cheats/.test(con('zm_perk toughness')) && !P().has(p, 'toughness'));
    con('sv_cheats 1');
    check('zm_perk grants', /Toughness/.test(con('zm_perk toughness')) && P().has(p, 'toughness') === 1);
    Z().clearHorde();
    return false;
  });

  // ---------------------------------------------------------------- pickups
  steps.push(async () => {
    newRun();
    freezeBots();
    const p = me(), PU = Z().pickups;
    const at = () => p.feet();
    // a weapon still drops and is picked up (kind 'weapon')
    p.weapons[1] = null;
    g.spawnDropped(WS.createWeapon('mp5'), at(), [0, 0, 0]);
    const wd = g.dropped.at(-1);
    check('weapon entries carry kind \'weapon\'', wd.kind === 'weapon');
    ticks(70);
    check('a dropped weapon is still picked up', p.weapons[1]?.id === 'mp5' && wd.taken && !g.dropped.includes(wd));
    // cash
    const m0 = p.money;
    const d = PU.spawn('cash', at(), { amount: 77, vel: [0, 0, 0] });
    check('spawn: on the floor list with its kind, a model in the world', g.dropped.includes(d) && d.kind === 'cash' && d.obj.parent && d.expire > g.time && of('pickup', (e) => e.phase === 'spawn' && e.kind === 'cash').length === 1);
    ticks(70);
    check('cash: walked over, paid ($77, an earn \'pickup\')', d.taken && !g.dropped.includes(d) && p.money - m0 === 77 && of('earn', (e) => e.reason === 'pickup' && e.amount === 77).length === 1 && of('pickup', (e) => e.phase === 'take' && e.player === p).length === 1);
    // health: not when full
    p.health = p.maxHealth;
    const h = PU.spawn('health', at(), { amount: 25, vel: [0, 0, 0] });
    ticks(70);
    const left = !h.taken;
    p.health = 60;
    ticks(5);
    check('health: left on the floor while you are full, taken when hurt (+25)', left && h.taken && p.health === 85, `${left} ${p.health}`);
    // ammo
    p.weapons[2].ammo = 0;
    PU.spawn('ammo', at(), { vel: [0, 0, 0] });
    ticks(70);
    check('ammo: a pack for each gun', p.weapons[2].ammo === p.weapons[2].def.ammoBuy.amount && p.weapons[1].ammo > 0, `${p.weapons[2].ammo}`);
    // power-up
    PU.spawn('powerup', at(), { id: 'doublecash', vel: [0, 0, 0] });
    ticks(70);
    check('power-up: Double Cash on the whole squad', P().has(botPs()[0], 'doublecash') === 1 && P().has(p, 'doublecash') === 1);
    // airdrop
    PU.spawn('airdrop', at(), { id: 'm249', vel: [0, 0, 0] });
    ticks(70);
    check('airdrop: the gun inside', p.weapons[1]?.id === 'm249');
    // trophy -> relic offer
    PU.spawn('trophy', at(), { data: { choices: ['ironheart', 'hunterseye'] }, vel: [0, 0, 0] });
    ticks(70);
    const offer = P().offerFor(p);
    check('trophy: an offer of its relics', offer?.source === 'trophy' && offer.ids.join() === 'ironheart,hunterseye');
    P().choose(p, 'ironheart');
    check('...a relic is a perk (+40 max health)', P().has(p, 'ironheart') === 1 && p.maxHealth === 140);
    // fading, zombies, the HUD
    const o = p.pm.origin;
    const far = PU.spawn('cash', [o[0] + 200, o[1], o[2] + 20], { amount: 5, life: 0.3, vel: [0, 0, 0] });
    ticks(40);
    check('loot fades after its life (expire event)', far.taken && !g.dropped.includes(far) && of('pickup', (e) => e.phase === 'expire').length === 1);
    const z = (() => { Z().spawnZombie({ variant: 'walker', near: o.slice() }); return Z().pool.find((q) => q.alive && !q.special); })();
    const zc = PU.spawn('cash', z.feet(), { amount: 5, vel: [0, 0, 0] });
    check('zombies never take loot', PU.take(z, zc) === false && !zc.taken);
    PU.remove(zc);
    Z().despawn(z);
    PU.spawn('health', [o[0] + 300, o[1], o[2]], { vel: [0, 0, 0] });
    const HS = await import('/src/game/hudstate.js');
    let ok = true;
    try { HS.buildHudState(g); g.frame(0.05); } catch (e) { ok = false; console.error(e); }
    check('the HUD and the frame cope with loot on the floor', ok && PU.count('health') === 1 && PU.list('health').length === 1);
    con('sv_cheats 1');
    check('zm_drop / zm_drops', /cash dropped/.test(con('zm_drop cash')) && /cash/.test(con('zm_drops')));
    g.clearDropped();
    check('clearDropped takes the loot too', !g.dropped.length && PU.count() === 0);
    return false;
  });

  // ---------------------------------------------------------------- bosses, squad, forge, seed
  steps.push(async () => {
    newRun();
    freezeBots();
    const B = g.bosses;
    const BS = await import('/src/game/bosses.js');
    const order = [5, 10, 15, 20, 25, 30].map((n) => B.pick(n));
    check('boss order: today\'s fixed one, then round again (pick)', order.map((x) => x.def.id).join() === 'butcher,spitter,banshee,inferno,abomination,butcher' && order[5].cycle === 1 && order[4].cycle === 0);
    const hp = B.healthFor(BS.BOSSES[0], 5, 0, 1);
    check('healthFor: today\'s formula', hp === Math.round(BS.BOSSES[0].health * BS.BOSS_NERF));
    check('arrive: 3 s', B.arrive(5) === 3);
    B.order = [4, 3, 2, 1, 0];
    con('sv_cheats 1');
    con('zm_boss 2');
    check('zm_boss names its boss whatever the order', B.boss?.boss.def.id === 'banshee');
    let posture = 0;
    const p0 = B.posture.bind(B);
    B.posture = (...a) => { posture++; return p0(...a); };
    g.damagePlayer(B.boss, me(), 30, CR.HITGROUP.CHEST, 'deagle', [1, 0, 0], B.boss.eyePos());
    B.posture = p0;
    const hi = B.hudInfo();
    check('adjust feeds posture; hudInfo has posture (null: no bar yet)', posture === 1 && hi.posture === null && hi.broken === false);
    me().health = 40; me().armor = 0;
    const bot = botPs()[0];
    bot.health = 30;
    B.boss.god = false;
    g.damagePlayer(B.boss, me(), 999999, CR.HITGROUP.CHEST, 'deagle', [1, 0, 0], B.boss.eyePos());
    check('the boss kill reward: today\'s full heal and armour', !B.alive() && me().health === me().maxHealth && me().armor === 100 && bot.health === 100);
    B.order = [0, 1, 2, 3, 4];
    Z().startWave(5);
    check('a boss wave: the boss comes arrive() s later', near(Z().bossAt - g.time, 3, 0.02));
    Z().clearHorde();
    // squad roles and Focus
    ticks(60);
    const bp = botPs();
    check('every bot in the squad gets a role (riflemen for now; role events)', bp.length >= 2 && bp.every((q) => q.role === 'rifleman') && /Rifleman/.test(con('zm_squad')));
    const SQ = await import('/src/game/zsquad.js');
    check('ROLES table (gunner, medic, demo, marksman, rifleman)', ['gunner', 'medic', 'demo', 'marksman', 'rifleman'].every((r) => SQ.ROLES[r]?.label) && SQ.ROLE_ORDER.length === 4);
    let z = null;
    for (let i = 0; i < 15 && !z; i++) {
      Z().spawnZombie({ variant: 'walker', near: me().pm.origin.slice() });
      const q = Z().pool.filter((x) => x.alive && !x.special).pop();
      if (g.visible(me().eyePos(), q.eyePos())) z = q; else Z().despawn(q);
    }
    if (z) {
      const e = me().eyePos(), c = z.eyePos();
      me().pm.angles[1] = Math.atan2(c[1] - e[1], c[0] - e[0]) * 180 / Math.PI;
      me().pm.angles[0] = -Math.atan2(c[2] - 10 - e[2], Math.hypot(c[0] - e[0], c[1] - e[1])) * 180 / Math.PI;
    }
    rec = [];
    const ZO = await import('/src/game/zorders.js');
    g.bots.onRadio(me(), ZO.FOCUS);
    const mates = g.bots.bots.filter((b) => b.p.team === 'CT' && b.p.alive);
    check('Focus target: every bot on what you aim at (order event)', !!z && mates.every((b) => b.focus?.target === z) && of('order', (x) => x.order === 'focus' && x.target === z && x.bots === mates.length).length === 1);
    check('a focused bot rates its target 0.35, the rest 1', !!z && Z().squad.targetWeight(mates[0], z, 100) === 0.35 && Z().squad.targetWeight(mates[0], me(), 100) === 1);
    g.bots.onRadio(me(), 'Hold this position.');
    check('the other orders go out as order events too', of('order', (x) => x.order === 'hold').length === 1);
    const RM = await import('/src/ui/radiomenu.js');
    const said = [];
    const rmZ = new RM.RadioMenu(document.createElement('div'), (t) => said.push(t), { zombie: () => true });
    const rmC = new RM.RadioMenu(document.createElement('div'), (t) => said.push(t));
    rmZ.show(1); rmZ.choose(7);
    check('the radio menu has Focus in zombie survival only', rmZ.items(1).includes('Focus My Target') && !rmC.items(1).includes('Focus My Target') && said[0] === ZO.FOCUS);
    Z().clearHorde();
    // forge routes
    me().money = 10000;
    // (the forge builder: the forge is open, break-only like the attachments - this runs mid-wave: the
    // economy's gate shuts it; the forge itself prices Tier I for the gun in hand and holds rounds for Tier III)
    const fw = (await import('/src/game/attachments.js')).forgeTarget(me()), fc = Z().forge.price(me(), 'tier_1');
    const shut = Z().state === 'wave' ? g.rounds.buy(me(), 'tier_1') === false && me().money === 10000 && Z().economy.menuState(me(), 'tier_1').closed === true : g.rounds.buy(me(), 'tier_1') === true && fw.tier === 1;
    check('forge items route to the forge (Tier I priced for the gun in hand, break-only; rounds from Tier III)', !!fw && fc > 0 && shut && Z().forge.menuState(me(), 'tier_1').off === false && Z().forge.menuState(me(), 'round_cryo').off === true && g.rounds.buy(me(), 'round_cryo') === false, `${fw?.id} $${fc} ${Z().state}`);
    // seed
    g.newGame({ mode: 'zombies', allies: 1, seed: 4242 });
    const R = await import('/src/game/zrng.js');
    const a = R.rng(4242, 'bosses'), b2 = R.rng(4242, 'bosses'), c = R.rng(4242, 'drops');
    const s1 = [a(), a(), a()], s2 = [b2(), b2(), b2()];
    check('the seed option sticks; rng streams are repeatable and distinct', Z().seed === 4242 && s1.join() === s2.join() && c() !== s1[0] && R.shuffle([0, 1, 2, 3, 4], R.rng(1, 'x')).slice().sort().join() === '0,1,2,3,4');
    return false;
  });

  // ---------------------------------------------------------------- the arsenal checklist (m3-contracts section 11), as a test
  steps.push(async () => {
    const VM = await import('/src/assets/viewmodels.js');
    const WW = await import('/src/assets/worldweapons.js');
    const IC = await import('/src/ui/icons.js');
    const BD = await import('/src/ui/menu/buydata.js');
    const SR = await import('/src/assets/snd/recipes.js');
    const snd = new Set(SR.SOUND_NAMES);
    const inMenu = new Set(Object.values(BD.MENU).flatMap((m) => [...(m.ALL || []), ...(m.T || []), ...(m.CT || [])]));
    const skull = IC.weaponShape('__none__');
    const bad = [];
    for (const id of WS.WEAPON_IDS) {
      const d = WS.WEAPON_DEFS[id];
      if (!d.buyable) continue;
      const miss = [];
      if (!d.sequences) miss.push('SEQ');
      if (d.ammoType && !WS.AMMO_TYPES[d.ammoType]) miss.push('AMMO_TYPES');
      if (!VM.VIEWMODEL_WEAPONS.includes(id)) miss.push('VIEWMODEL_WEAPONS');
      try { const vm = VM.createViewModel(id); vm.dispose?.(); } catch { miss.push('vm builder'); }
      if (!WW.WORLD_WEAPON_IDS.includes(id)) miss.push('world model');
      if (!IC.WEAPON_IDS.includes(id) || !IC.KILL_ICON_W[id] || !IC.WEAPON_AMMO[id] || IC.weaponShape(id) === skull) miss.push('icons');
      if (!BD.ITEMS[id] || !inMenu.has(id)) miss.push('buy menu');
      if (d.clip > 0 && !BD.ITEMS[id]?.stats) miss.push('buy menu stats');
      if (d.clip > 0 && d.sounds?.fire && !snd.has(d.sounds.fire)) miss.push(`sound ${d.sounds.fire}`);
      if (d.slot === 4 && !(id in BD.ITEM_ICON)) miss.push('ITEM_ICON');
      if (miss.length) bad.push(`${id}: ${miss.join(', ')}`);
    }
    check('every buyable weapon is registered everywhere (view / world model, icons, buy menu, sounds)', !bad.length, bad.join(' | '));
    const pages = Object.entries(BD.MENU).filter(([, m]) => Object.values(m).some((l) => l.length > 9)).map(([k]) => k);
    check('no buy page holds more than 9 items (keys 1-9)', !pages.length, pages.join(' '));
    return false;
  });

  // ---------------------------------------------------------------- scaffolds idle: the mode plays as before
  steps.push(async () => {
    newRun({ allies: 2 });
    Z().nextWaveAt = g.time + 1;
    con('sv_cheats 1');
    con('zm_wave 3');
    rec = [];
    const o = me().pm.origin.slice();
    let close = 0;
    for (let i = 0; i < 1500; i++) {
      g.tick();
      if (i % 25 === 0) g.frame(0.25);
      for (const z of Z().pool) if (z.alive && Math.hypot(z.pm.origin[0] - o[0], z.pm.origin[1] - o[1]) < 200) { close++; break; }
    }
    check('zombies still find you', close > 0 && Z().spawned > 5, `spawned ${Z().spawned}, close ${close}`);
    check('no perks, drops or drafts on their own', !of('perk').length && !of('pickup').length && !of('draft').length && !g.dropped.some((d) => d.kind !== 'weapon'));
    check('the pipeline stays idle; max health 100', !M().live && squad().every((p) => !p.zm && p.maxHealth === 100));
    con('zm_wave 4'); // (the bots may have cleared wave 3 by now)
    rec = [];
    con('zm_skip');
    const alive = squad().filter((p) => p.alive);
    const waves = of('earn', (e) => e.reason === 'wave');
    check('a cleared wave pays everyone standing once (through pay)', Z().state === 'break' && alive.every((p) => waves.filter((e) => e.player === p).length === 1) && waves.every((e) => e.amount === Z().stats.bonus || !alive.includes(e.player)), `${waves.length} wave earns for ${alive.length}`);
    thawBots();
    restore();
    return true;
  });

  let i = 0;
  window.__drive = async () => {
    out.length = 0;
    let done = false;
    try { done = await steps[i++](); } catch (e) { check('step ' + i + ' threw', false, e.stack); done = true; restore(); }
    if (i >= steps.length) done = true;
    if (done) out.push(`[sim] ${fail ? 'FAILED' : 'ALL PASSED'}: ${pass} passed, ${fail} failed`);
    return { log: out.join('\n'), done };
  };
})();
