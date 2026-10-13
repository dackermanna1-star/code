// Zombie survival, Milestone 1.2: the economy (zeconomy.js). Start money and the pistol start,
// graded kill pay, specials, the boss bounty split by damage share, wave bonuses and 'earn'
// events, the money cap, the buy gate (guns in the break; mid-wave ammo, armour and medkits
// at the combat premium; Sandbox anything any time; hardcore; downed), the buy menu's states,
// ready-up (zm_ready / F1) and the HUD state, bots shopping on a budget in the breaks, the
// re-arm window after a respawn, the smaller wave heal.
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=2" tools/tests/zm1-economy.js /tmp/zm1econ
// Prints "[sim] PASS ..." / "[sim] FAIL ..." and saves a screenshot of the mid-wave buy menu
// and of the break HUD (outPrefix_0.png, _1.png).
/* global document, localStorage */
(() => {
  const g = window.__game;
  // (the records this test's waves would set are put back at the end)
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
  const E = () => g.zombies.economy;
  const bots = () => g.bots.bots.filter((b) => b.p.team === 'CT');
  // what the centre print said last (refusals)
  let said = '';
  const cp = g.hud.centerPrint.bind(g.hud);
  g.hud.centerPrint = (...a) => { said = String(a[0] || ''); return cp(...a); };
  // every event, copied (payloads are reused)
  let rec = [];
  Z().events.on('*', (e) => rec.push({ type: e.type, phase: e.phase, player: e.player, amount: e.amount, reason: e.reason, all: e.all, item: e.item, cost: e.cost, victim: e.victim, attacker: e.attacker, damage: e.damage }));
  const of = (type, f = () => true) => rec.filter((e) => e.type === type && f(e));
  const earned = (p, reason) => of('earn', (e) => e.player === p && (!reason || e.reason === reason)).reduce((n, e) => n + e.amount, 0);
  const near = (p) => { Z().spawnZombie({ near: p.pm.origin }); return Z().pool.find((z) => z.alive && !z.special && !z.isBoss); };
  const strip = (p) => { p.weapons[1] = null; p.weapons[4] = []; p.armor = 0; p.helmet = false; };

  /** A fresh zombie game like the menu's New Game (you on CT, bots filled in). */
  function newRun(opts = {}) {
    g.newGame({ mode: 'zombies', allies: 2, roles: Array(10).fill('rifleman'), ...opts }); // (riflemen: the economy's own shopping trip; the roles shop for themselves - zsquad.js, zm3-squad.js)
    g.joinTeam(g.local, 'CT');
    g.bots.fillTeams(opts.allies ?? 2);
    ticks(50);
    con('sv_cheats 1');
  }
  g.paused = true; // (the page's own loop renders but doesn't tick: the test drives the clock)

  const steps = [];

  // ---------------------------------------------------------------- the start
  steps.push(async () => {
    newRun();
    const p = g.local, d = Z().diff;
    check('normal start money', d.id === 'normal' && d.econ.startMoney === 2000 && p.money === 2000, `$${p.money}`);
    check('pistol start', p.weapons[2]?.id === 'usp' && !p.weapons[1] && p.weapons[3]?.id === 'knife');
    check('greeting', /\$2000 and a pistol/.test(said), said.split('\n')[0]);
    check('money cap 100000', (() => { p.money = 99990; g.rounds.addMoney(p, 500); const a = p.money; p.money = 2000; return a === 100000; })());
    // the bots shopped in the first break, on a budget: a better pistol and armour first
    const bs = bots();
    check('bots shop in the first break', bs.length === 2 && bs.every((b) => b.p.weapons[2]?.id === 'deagle' && b.p.armor === 100 && b.p.money < 2000), bs.map((b) => `${b.p.weapons[2]?.id}/${b.p.armor}/${b.p.weapons[1]?.id || '-'} $${b.p.money}`).join(' '));
    check('smaller wave heal', d.econ.waveHeal === 15 && d.econ.waveHeal < 25);
    return false;
  });

  // ---------------------------------------------------------------- the shop by phase
  steps.push(async () => {
    const p = g.local;
    p.money = 5000;
    rec = [];
    check('break: a gun at list price', g.rounds.buy(p, 'mp5') && p.money === 3500 && p.weapons[1]?.id === 'mp5', `$${p.money}`);
    const ms = E().menuState(p, 'ak47');
    check('break: menu sells guns', !ms.off && ms.price === 2500 && /BREAK/.test(E().menuBanner(p)), JSON.stringify(ms));
    con('zm_skip'); // wave 1
    check('wave 1 started', Z().state === 'wave' && Z().wave === 1);
    let m = p.money;
    said = '';
    check('mid-wave: no guns', !g.rounds.buy(p, 'ak47') && p.money === m && p.weapons[1].id === 'mp5', `$${p.money}`);
    check('refusal says why', /shut until the wave is over/.test(said) && /\+50%/.test(said), said.replace('\n', ' / '));
    check('mid-wave: no grenades or upgrades', !g.rounds.buy(p, 'hegrenade') && !g.rounds.buy(p, 'att_laser') && p.money === m);
    p.weapons[1].ammo = 0;
    const ammo = p.weapons[1].def.ammoBuy.cost, prem = Math.round(ammo * 1.5 / 5) * 5;
    check('menu: mid-wave ammo price', E().menuState(p, 'primammo').price === prem && !E().menuState(p, 'primammo').off, `${E().menuState(p, 'primammo').price} vs ${prem}`);
    check('mid-wave: ammo at +50%', g.rounds.buy(p, 'primammo') && m - p.money === prem && of('buy', (e) => e.item === 'primammo' && e.cost === prem).length === 1, `paid ${m - p.money} (list ${ammo})`);
    m = p.money; p.armor = 0; p.helmet = false;
    check('mid-wave: kevlar at +50%', g.rounds.buy(p, 'vest') && m - p.money === 975, `paid ${m - p.money}`);
    m = p.money;
    check('mid-wave: medkit at +50%', g.rounds.buy(p, 'medkit') && m - p.money === 1200, `paid ${m - p.money}`);
    const st = E().menuState(p, 'm4a1');
    check('menu: guns greyed mid-wave with the reason', st.off && st.closed && /shut/.test(st.why), JSON.stringify(st));
    check('menu: banner mid-wave', /MID-WAVE/.test(E().menuBanner(p)));
    // the buy menu itself: the rifle page all greyed, the banner along the bottom
    g.menus.showBuyMenu(p, { allWeapons: true, itemState: (id) => E().menuState(p, id), banner: E().menuBanner(p), upgradeTarget: () => 'MP5' });
    g.menus.buyCategory(4);
    const btns = [...document.querySelectorAll('.vg-panel .vg-btn')].filter((b) => !b.classList.contains('cancel'));
    const banner = [...document.querySelectorAll('.vg-panel .vg-money')].map((e) => e.textContent).join(' | ');
    check('buy menu greys the rifles', btns.length >= 6 && btns.every((b) => b.classList.contains('off')), `${btns.filter((b) => b.classList.contains('off')).length}/${btns.length} off`);
    check('buy menu banner', /MID-WAVE/.test(banner), banner);
    return { shot: true };
  });

  steps.push(async () => {
    g.menus.buyCategory(8); // equipment: what a wave does sell
    const btns = [...document.querySelectorAll('.vg-panel .vg-btn')].filter((b) => !b.classList.contains('cancel'));
    const txt = (b) => b.textContent;
    check('equipment page: mid-wave prices', btns.some((b) => /Medkit/.test(txt(b)) && /\$1200/.test(txt(b)) && !b.classList.contains('off')) && btns.some((b) => /HE Grenade/.test(txt(b)) && b.classList.contains('off')), btns.map(txt).join(', '));
    g.menus.hideAll?.();
    return false;
  });

  // ---------------------------------------------------------------- pay
  steps.push(async () => {
    const p = g.local, Zm = Z();
    rec = [];
    let m = p.money;
    let z = near(p);
    g.damagePlayer(z, p, 1e6, 2, 'usp', [1, 0, 0]);
    check('kill pay wave 1', p.money - m === 55 && earned(p, 'kill') === 55, `+${p.money - m}`);
    m = p.money; z = near(p);
    g.damagePlayer(z, p, 1e6, 1, 'usp', [1, 0, 0]);
    check('headshot +50%', p.money - m === 83, `+${p.money - m}`);
    con('zm_wave 12');
    m = p.money; z = near(p);
    g.damagePlayer(z, p, 1e6, 2, 'usp', [1, 0, 0]);
    const m2 = p.money; z = near(p);
    g.damagePlayer(z, p, 1e6, 1, 'usp', [1, 0, 0]);
    check('kill pay tops out', m2 - m === 100 && p.money - m2 === 150, `+${m2 - m} / head +${p.money - m2}`);
    // a bot's kill pays the bot
    const bot = bots()[0].p;
    const bm = bot.money; m = p.money; z = near(p);
    g.damagePlayer(z, bot, 1e6, 2, 'm4a1', [1, 0, 0]);
    check('a bot kill pays the bot', bot.money - bm === 100 && p.money === m, `bot +${bot.money - bm}`);
    // a special: the kill and its bounty
    rec = [];
    con('zm_special hunter near');
    const h = Zm.pool.find((q) => q.alive && q.special === 'hunter');
    m = p.money;
    g.damagePlayer(h, p, 1e6, 2, 'usp', [1, 0, 0]);
    check('special bounty', p.money - m === 400 && earned(p, 'special') === 300 && earned(p, 'kill') === 100, `+${p.money - m}`);
    // a cleared wave: the bonus, as an earn
    rec = [];
    p.health = 50;
    m = p.money;
    con('zm_skip');
    check('wave bonus earned', earned(p, 'wave') === Zm.stats.bonus && p.money - m === Zm.stats.bonus, `+${p.money - m} (${Zm.stats.bonus})`);
    check('wave heal', p.health === 65, `hp ${p.health}`);
    return false;
  });

  // ---------------------------------------------------------------- the boss bounty
  steps.push(async () => {
    const p = g.local, bot = bots()[0].p, bot2 = bots()[1].p;
    p.god = bot.god = bot2.god = true;
    con('zm_wave 5');
    // (Milestone 3: the cleared wave's perk draft may have dealt a money perk - Lucky Charm, Greed: none for this one)
    for (const q of [p, bot, bot2]) for (const x of g.zombies.perks.list(q)) g.zombies.perks.revoke(q, x.id);
    con('zm_boss butcher');
    const b = g.bosses.boss;
    rec = [];
    const H = b.health;
    g.damagePlayer(b, bot, H * 0.25, 2, 'm4a1', [1, 0, 0]);
    g.damagePlayer(b, p, H * 0.5, 2, 'm4a1', [1, 0, 0]);
    const mp = p.money, mb = bot.money, m2 = bot2.money;
    said = '';
    g.damagePlayer(b, p, 1e7, 2, 'm4a1', [1, 0, 0]);
    const dealt = (q) => of('hit', (e) => e.attacker === q && e.victim === b).reduce((n, e) => n + e.damage, 0);
    const tot = dealt(p) + dealt(bot);
    const want = Math.round(3000 * dealt(p) / tot / 10) * 10, wantB = Math.round(3000 * dealt(bot) / tot / 10) * 10;
    check('boss bounty split by damage', !b.alive && earned(p, 'boss') === want && earned(bot, 'boss') === wantB && Math.abs(want + wantB - 3000) <= 10 && want > wantB, `you ${earned(p, 'boss')} (${want}) bot ${earned(bot, 'boss')} (${wantB})`);
    check('boss pay in the money', p.money - mp === want + earned(p, 'kill') && bot.money - mb === wantB && bot2.money === m2, `you +${p.money - mp} bot +${bot.money - mb} idle bot +${bot2.money - m2}`);
    check('boss message has your cut', new RegExp(`\\+\\$${want} \\(\\d+% of the damage\\)`).test(said), said.replace('\n', ' / '));
    return false;
  });

  // ---------------------------------------------------------------- downed, re-arm after a respawn, bots mid-wave
  steps.push(async () => {
    const p = g.local, Zm = Z();
    con('zm_wave 6');
    p.money = 5000;
    p.downed = { t: g.time };
    said = '';
    check('downed: no buying', !g.rounds.buy(p, 'medkit') && /down/.test(said) && p.money === 5000, said);
    delete p.downed;
    // a bot with money mid-wave buys nothing but ammo once it runs dry
    const b = bots()[0], q = b.p;
    strip(q);
    q.money = 6000;
    b.buy();
    check('bots buy no guns mid-wave', !q.weapons[1] && q.money === 6000 && q.armor === 0);
    g.giveWeapon(q, 'ak47');
    q.weapons[1].clip = 0; q.weapons[1].ammo = 0;
    rec = [];
    ticks(150);
    const ak = q.weapons[1], prem = Math.round(ak.def.ammoBuy.cost * 1.5 / 5) * 5;
    const bought = of('buy', (e) => e.player === q);
    check('a dry bot tops up its ammo mid-wave', ak.clip + ak.ammo > 0 && bought.length >= 1 && bought.every((e) => e.item === 'primammo' && e.cost === prem), `ammo ${ak.clip}+${ak.ammo} buys ${bought.map((e) => `${e.item}:$${e.cost}`).join(' ')}`);
    // a bot that fell comes back next wave with its money, picks its gun up again, re-arms;
    // a cleared wave pays the fallen half its bonus
    const r = bots()[1], rp = r.p;
    rp.god = false;
    const gun = g.giveWeapon(rp, 'famas');
    ticks(1);
    g.killPlayer(rp, null, 'world', false);
    check('a falling bot drops its gun', !rp.alive && g.dropped.some((d) => d.weapon === gun));
    rp.money = 5000;
    con('zm_skip'); // cleared (it's still dead: no shopping)
    const half = Math.round(Zm.stats.bonus / 2);
    check('the fallen get half the wave bonus', rp.money === 5000 + half, `$${rp.money} (+${half})`);
    ticks(400);
    check('dead bots do not shop', !rp.alive && rp.money === 5000 + half);
    con('zm_skip'); // the next wave: it's back
    ticks(30);
    check('a respawned bot picks its own gun up', rp.alive && rp.weapons[1] === gun && !g.dropped.some((d) => d.weapon === gun && !d.taken), `${rp.weapons[1]?.id}`);
    check('respawned bot re-arms mid-wave', rp.alive && rp.armor === 100 && rp.money < 5000 + half && E().rearm(rp) > 0, `${rp.weapons[1]?.id} ar ${rp.armor} $${rp.money} rearm ${E().rearm(rp).toFixed(1)}`);
    check('re-arm: the whole shop', E().refusal(rp, 'ak47') === null && E().scale(rp, 'primammo') === 1);
    ticks(1050);
    check('re-arm window closes', E().rearm(rp) === 0 && (Z().state !== 'wave' || !!E().refusal(rp, 'ak47')), `${Z().state}`);
    void Zm;
    return false;
  });

  // ---------------------------------------------------------------- bot budgets
  const tierOf = (w) => (!w ? -1 : w.def.kind === 'smg' || w.def.kind === 'shotgun' ? 1 : w.def.kind === 'mg' ? 3 : w.def.kind === 'sniper' ? 0 : 2);
  steps.push(async () => {
    con('zm_skip'); // a break
    ticks(10);
    const b = bots()[0], q = b.p;
    const kit = (id, money) => { strip(q); q.weapons[2] = g.newWeapon(id, true); q.money = money; g.selectWeapon(q, q.weapons[2], true); };
    kit('usp', 2000);
    E().shop(b);
    check('budget $2000: pistol and armour first', q.weapons[2].id === 'deagle' && q.armor === 100 && q.helmet && !q.weapons[1] && q.money >= 0, `${q.weapons[2].id} ${q.armor} ${q.weapons[1]?.id || '-'} $${q.money}`);
    kit('deagle', 1800); q.armor = 100; q.helmet = true;
    E().shop(b);
    check('budget $1800: an SMG', q.weapons[1]?.id === 'mp5', `${q.weapons[1]?.id} $${q.money}`);
    q.money = 3500;
    E().shop(b);
    check('budget $3500: up to a rifle', tierOf(q.weapons[1]) === 2, `${q.weapons[1]?.id} $${q.money}`);
    const gun = q.weapons[1].id;
    q.money = 3500;
    E().shop(b);
    check('no sideways upgrades', q.weapons[1].id === gun, `${q.weapons[1].id} $${q.money}`);
    kit('usp', 12000);
    E().shop(b);
    check('a rich bot: armour, a primary, medkits', q.weapons[1] && q.armor === 100 && (q.weapons[4].find((x) => x.id === 'medkit')?.count ?? 0) >= 1, `${q.weapons[1]?.id} kits ${q.weapons[4].find((x) => x.id === 'medkit')?.count ?? 0} $${q.money}`);
    // bots go shopping on their own in the break
    const other = bots()[1].p;
    strip(other); other.money = 4000;
    const before = Z().nextWaveAt;
    con('zm_skip'); con('zm_skip'); // (a wave, cleared: a fresh break)
    ticks(400);
    check('bots shop in the break', other.weapons[1] && other.armor === 100 && other.money < 4000 && Z().state === 'break', `${other.weapons[1]?.id} ${other.armor} $${other.money}`);
    void before;
    return false;
  });

  // ---------------------------------------------------------------- ready-up
  steps.push(async () => {
    newRun({ allies: 2 });
    const Zm = Z(), p = g.local;
    rec = [];
    const t0 = g.time, end0 = Zm.nextWaveAt;
    check('break before wave 1', Zm.state === 'break' && end0 - t0 > 10);
    const { buildHudState } = await import('/src/game/hudstate.js');
    let s = buildHudState(g, {});
    check('hud: not ready', s.zmEcon && !s.zmEcon.ready && s.zmEcon.humans === 1 && s.zmEcon.bots === 2 && s.zmEcon.phase === 'break' && s.zmEcon.frac > 0.8, JSON.stringify(s.zmEcon));
    const r = con('zm_ready');
    check('zm_ready cuts the break to 3 s', Math.abs(Zm.nextWaveAt - g.time - 3) < 0.02 && r === '', `${(Zm.nextWaveAt - g.time).toFixed(2)}s "${r}"`);
    check('ready event', of('ready', (e) => e.player === p && e.all).length === 1);
    s = buildHudState(g, {});
    check('hud: ready, all', s.zmEcon.ready && s.zmEcon.all && s.zmEcon.readyN === 1);
    g.localCommand('autobuy'); // F1 again: not ready after all
    check('F1 un-readies: the break gets its time back', Math.abs(Zm.nextWaveAt - end0) < 0.02 && !buildHudState(g, {}).zmEcon.ready, `${(Zm.nextWaveAt - g.time).toFixed(2)}s`);
    g.localCommand('autobuy');
    check('F1 readies', Math.abs(Zm.nextWaveAt - g.time - 3) < 0.02);
    return { shot: true };
  });

  steps.push(async () => {
    const Zm = Z();
    ticks(310);
    check('the wave comes', Zm.state === 'wave' && Zm.wave === 1);
    said = '';
    const end = Zm.nextWaveAt;
    con('zm_ready');
    check('no readying mid-wave', /in the break/.test(said) && Zm.nextWaveAt === end && Zm.state === 'wave');
    con('zm_skip');
    const { buildHudState } = await import('/src/game/hudstate.js');
    const s = buildHudState(g, {});
    check('a new break: nobody is ready', Zm.state === 'break' && !s.zmEcon.ready && Math.abs(Zm.nextWaveAt - g.time - Zm.diff.breakLen) < 0.02);
    return false;
  });

  // ---------------------------------------------------------------- Sandbox and hardcore
  steps.push(async () => {
    newRun({ zdiff: 'sandbox' });
    const p = g.local;
    check('sandbox start', p.money === 16000 && Z().diff.sandbox, `$${p.money}`);
    con('zm_skip');
    let m = p.money;
    check('sandbox: guns mid-wave at list price', Z().state === 'wave' && g.rounds.buy(p, 'ak47') && m - p.money === 2500, `paid ${m - p.money}`);
    p.weapons[1].ammo = 0; m = p.money;
    check('sandbox: no premium', g.rounds.buy(p, 'primammo') && m - p.money === p.weapons[1].def.ammoBuy.cost);
    m = p.money;
    const z = near(p);
    g.damagePlayer(z, p, 1e6, 1, 'usp', [1, 0, 0]);
    check('sandbox: $300 a kill', p.money - m === 300 || (m + 300 > 16000 && p.money === 16000), `+${p.money - m}`);
    p.money = 15900; g.rounds.addMoney(p, 500);
    check('sandbox cap 16000', p.money === 16000);
    const bots0 = bots().map((b) => b.p);
    p.money = 1000; for (const q of bots0) q.money = 1000;
    con('zm_boss butcher');
    g.damagePlayer(g.bosses.boss, p, 1e7, 2, 'm4a1', [1, 0, 0]);
    check('sandbox: $5000 boss bounty each', bots0.every((q) => !q.alive || q.money === 6000) && p.money >= 6000, `you $${p.money} bots ${bots0.map((q) => q.money).join('/')}`);
    newRun({ zdiff: 'sandbox', hardcore: true });
    con('zm_skip');
    check('hardcore sandbox: no guns mid-wave', !g.rounds.buy(g.local, 'ak47') && /shut/.test(said));
    return false;
  });

  // ---------------------------------------------------------------- the real keys (main.js binds)
  steps.push(async () => {
    newRun();
    g.menus.hideAll?.();
    const Zm = Z(), end0 = Zm.nextWaveAt;
    const key = (code) => { g.input._fire(code, true); g.input._fire(code, false); };
    const banner = () => [...document.querySelectorAll('.vg-panel .vg-money')].map((e) => e.textContent).join(' | ');
    key('F1');
    check('the F1 key readies', Math.abs(Zm.nextWaveAt - g.time - 3) < 0.02, `${(Zm.nextWaveAt - g.time).toFixed(2)}s`);
    key('F1');
    check('the F1 key un-readies', Math.abs(Zm.nextWaveAt - end0) < 0.02);
    key('KeyB');
    check('B: the buy menu, the break banner', g.menus.vg?.kind === 'buy' && /BREAK/.test(banner()), banner());
    g.menus.hideAll?.();
    con('zm_skip');
    key('KeyB');
    g.menus.buyCategory(4);
    const off = [...document.querySelectorAll('.vg-panel .vg-btn')].filter((b) => !b.classList.contains('cancel'));
    check('B mid-wave: rifles greyed, the mid-wave banner', off.length >= 6 && off.every((b) => b.classList.contains('off')) && /MID-WAVE/.test(banner()), banner());
    g.menus.hideAll?.();
    return false;
  });

  // ---------------------------------------------------------------- the HUD in a break (screenshot)
  steps.push(async () => {
    newRun({ allies: 3 });
    ticks(200);
    return { shot: true };
  });

  steps.push(async () => {
    const { buildHudState } = await import('/src/game/hudstate.js');
    const s = buildHudState(g, {});
    check('hud: shop open icon in the break', s.inBuyZone === true && s.zmEcon.open);
    g.paused = true;
    con('zm_skip');
    const s2 = buildHudState(g, {});
    check('hud: no buy icon mid-wave', s2.inBuyZone === false && s2.zmEcon.combat);
    check('sounds', !!g.sound.bank.get('zm_ready') && !!g.sound.bank.get('zm_allready'));
    g.paused = false;
    return true;
  });

  let i = 0;
  window.__drive = async () => {
    out.length = 0;
    let r = false;
    try { r = await steps[i++](); } catch (e) { check('step ' + i + ' threw', false, e.stack); r = true; }
    const done = r === true || i >= steps.length;
    if (done) { restore(); out.push(`[sim] ${fail ? 'FAILED' : 'ALL PASSED'}: ${pass} passed, ${fail} failed`); }
    return { log: out.join('\n'), done, shot: !!r?.shot, wait: r?.wait };
  };
})();
