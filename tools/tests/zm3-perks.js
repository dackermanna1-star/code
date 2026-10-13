// Zombie survival, Milestone 3.1: the perk draft. The catalogue (about 20 perks, the
// boon-and-curse gambles, the synergies, rarity tiers, glyphs, sounds, the zdiff group); every
// perk's effect measured through the modifier pipeline (damage dealt by family and kind, damage
// taken, max health, reload / draw / fire rate / magazine, speed, prices, money, healing, revive
// speed, and the hooked ones: Scavenger, Butcher, Bloodthirst, Adrenaline, Last Stand, Live Wire,
// Bounty Hunter, and the synergies Plasma Arc, Napalm, Executioner, Guardian Angel, Black Market,
// Hit and Run); the draft at every break (cards, rarer every 5th wave, the curse slot, keys,
// rerolls free then paid, the auto-pick at the wave start, offers made mid-wave wait for the
// break, bots drafting by their guns and roles, a seeded run deals the same); the overlay, the
// HUD strip, the synergy card and the run report.
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=2" tools/tests/zm3-perks.js /tmp/zm3-perks
// Prints "[sim] PASS ..." / "[sim] FAIL ..." and a closing ALL PASSED / FAILED line; shots of the
// draft, the synergy card and the run report.
/* global document, localStorage, MouseEvent, KeyboardEvent */
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
  const frames = (n, dt = 0.016) => { for (let i = 0; i < n; i++) g.frame(dt); };
  const con = (line) => { const lines = []; const pr = g.console.menus.print; g.console.menus.print = (t) => lines.push(String(t)); try { g.console.exec(line); } finally { g.console.menus.print = pr; } return lines.join(' | '); };
  const Z = () => g.zombies;
  const M = () => g.zombies.mods;
  const P = () => g.zombies.perks;
  const me = () => g.local;
  const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
  const squad = () => g.players.filter((p) => p.team === 'CT' && !p.isZombie);
  const botPs = () => squad().filter((p) => p.isBot);
  let rec = [];
  const pick = (e) => ({ type: e.type, phase: e.phase, player: e.player, id: e.id, ids: e.ids ? e.ids.slice() : null, source: e.source, reroll: e.reroll, n: e.n, victim: e.victim, attacker: e.attacker, weapon: e.weapon });
  let busOff = null;
  const listen = () => { busOff?.(); rec = []; busOff = Z().events.on('*', (e) => rec.push(pick(e))); };
  const of = (type, f = () => true) => rec.filter((e) => e.type === type && f(e));
  let think0 = null;
  const freezeBots = () => { if (!think0) think0 = g.bots.think; g.bots.think = () => {}; };
  const thawBots = () => { if (think0) g.bots.think = think0; think0 = null; };
  // the local player's buttons (wbuttons: 1 attack, 8 use)
  const input = { wb: 0 };
  const build0 = g.buildLocalCmd;
  g.buildLocalCmd = () => ({ forwardmove: 0, sidemove: 0, upmove: 0, buttons: 0, wbuttons: input.wb });
  function newRun(opts = {}) {
    thawBots();
    g.newGame({ mode: 'zombies', allies: 2, ...opts });
    g.joinTeam(g.local, 'CT');
    g.bots.fillTeams(opts.allies ?? 2);
    ticks(50);
    me().god = true;
    Z().nextWaveAt = g.time + 9999; // (hold the first break)
    listen();
    con('sv_cheats 1');
  }
  /** Wave n with nobody on the map and nothing more coming (it doesn't clear on its own). */
  const quietWave = (n) => { con(`zm_wave ${n}`); Z().clearHorde(); Z().spawned = Z().stats.count; Z().bossAt = 1e9; };
  let CR, WS, PK, H;
  const walker = () => {
    Z().spawnZombie({ variant: 'walker', near: me().pm.origin.slice() });
    const z = Z().pool.filter((q) => q.alive && !q.special && !q.isBoss).pop();
    z.health = z.maxHealth = 1e6; z.armor = 0;
    return z;
  };
  const hitZ = (z, dmg, hg, weapon = 'deagle', opts = {}) => { const h0 = z.health; g.damagePlayer(z, me(), dmg, hg, weapon, [1, 0, 0], z.eyePos(), opts); return h0 - z.health; };
  /** Hold perks ids while f runs (granted, then revoked). */
  const holding = (ids, f) => { for (const id of ids) P().grant(me(), id, { source: 'test' }); try { return f(); } finally { for (const id of ids) P().revoke(me(), id); } };
  /** Damage dealt with ids held / without, on z with weapon at hitgroup hg. */
  const dealt = (z, ids, weapon, hg = H.CHEST, opts = {}) => { const a = hitZ(z, 400, hg, weapon, opts); const b = holding(ids, () => hitZ(z, 400, hg, weapon, opts)); return b / a; }; // (big hits: the damage is rounded)
  /** Damage you take (a claw by default) with ids held / without; at hp health. */
  const taken = (ids, { attacker = null, weapon = 'zombie', opts = {}, hp = 100 } = {}) => {
    const p = me(), z = attacker;
    const once = () => { p.god = false; p.armor = 0; p.helmet = false; p.health = hp; g.damagePlayer(p, z, 20, H.CHEST, weapon, [1, 0, 0], p.eyePos(), opts); const d = hp - p.health; p.god = true; p.health = p.maxHealth; return d; };
    const a = once();
    const b = holding(ids, once);
    return b / a;
  };
  /** Kill z with weapon (a headshot or not): it was left with 1 HP. */
  const kill = (z, weapon, head = false) => { z.health = 1; g.damagePlayer(z, me(), 50, head ? H.HEAD : H.CHEST, weapon, [1, 0, 0], z.eyePos()); return !z.alive; };
  const steps = [];
  const spy = { on: false, seen: [], spr0: null };

  // ---------------------------------------------------------------- the catalogue
  steps.push(async () => {
    CR = await import('/src/game/combatrules.js');
    WS = await import('/src/game/weaponsys.js');
    PK = await import('/src/game/perks.js');
    H = CR.HITGROUP;
    const PI = await import('/src/ui/perkicons.js');
    const ZM = await import('/src/game/zmods.js');
    const ZD = await import('/src/game/zdiff.js');
    const RC = await import('/src/assets/snd/recipes.js');
    const T = PK.PERKS, R = PK.RARITY;
    const ours = Object.keys(T).filter((id) => ['common', 'uncommon', 'rare'].includes(T[id].rarity));
    const drafted = ours.filter((id) => !T[id].curse), curses = ours.filter((id) => T[id].curse);
    const syn = Object.keys(PK.SYNERGIES);
    check(`about 20 perks drafted at breaks (${drafted.length})`, drafted.length >= 20 && ['common', 'uncommon', 'rare'].every((r) => drafted.some((id) => T[id].rarity === r)), drafted.join(' '));
    check(`boon-and-curse gambles (${curses.length}), each with a boon and a downside`, curses.length >= 4 && curses.every((id) => T[id].text && T[id].bane && Object.keys(T[id].stats || {}).length >= 2), curses.join(' '));
    const tagsOf = (t) => drafted.filter((id) => T[id].tags.includes(t));
    check(`synergies on tag pairs (${syn.length}), each pair held by different drafted perks`, syn.length >= 5 && syn.every((s) => { const [a, b] = PK.SYNERGIES[s].pair; const A = tagsOf(a), B = tagsOf(b); return A.length && B.length && (A.length > 1 || B.length > 1 || A[0] !== B[0]); }), syn.join(' '));
    const bad = ours.concat(syn).filter((id) => { const r = T[id]; return !r.name || !r.text || !R[r.rarity] || !Array.isArray(r.tags) || Object.keys(r.stats || {}).some((k) => !ZM.STATS[k]); });
    check('every row complete: name, text, a rarity tier, tags, known stats', !bad.length, bad.join(' '));
    check('synergies, relics and power-ups are never drafted; the drafting tiers are', R.synergy.weight === 0 && R.relic.weight === 0 && R.buff.weight === 0 && R.common.weight > R.uncommon.weight && R.uncommon.weight > R.rare.weight && syn.every((id) => T[id].rarity === 'synergy'));
    check('stats of our own: weapon-family damage and revive speed', ['pistolDamage', 'shotgunDamage', 'smgDamage', 'rifleDamage', 'sniperDamage', 'mgDamage', 'teslaDamage'].every((s) => ZM.STATS[s]?.kind === 'mul') && ZM.STATS.revive?.kind === 'rate');
    // glyphs: each of ours draws its own
    const glyphs = ours.concat(syn, Object.keys(PK.PERK_BUFFS)).filter((id) => {
      if (PI.glyphFor(id, T[id]) !== id && !PK.PERK_BUFFS[id]) return true;
      const c = PI.perkIcon(PI.glyphFor(id, T[id]), 24), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let a = 0;
      for (let i = 3; i < d.length; i += 4) a += d[i];
      return a / 255 < 40 || a / 255 > 24 * 24 * 0.92; // (blank, or a filled square)
    });
    check('every perk, synergy and perk buff has its own glyph, and it draws', !glyphs.length, glyphs.join(' '));
    // the difficulty group
    const four = ['casual', 'normal', 'hard', 'nightmare'].map((id) => ZD.ZDIFF[id].perks);
    const mono = (f, up) => four.map(f).every((v, i, a) => !i || (up ? v >= a[i - 1] : v <= a[i - 1]));
    check('zdiff perks: rerollCost everywhere; choices and free rerolls shrink, curse odds and reroll prices grow', four.every((d) => Array.isArray(d.rerollCost) && d.rerollCost.length === 2) && mono((d) => d.choices, false) && mono((d) => d.rerolls, false) && mono((d) => d.curse, true) && mono((d) => d.rerollCost[0], true) && JSON.stringify(ZD.ZDIFF.sandbox.perks) === JSON.stringify(ZD.ZDIFF.normal.perks));
    // sounds
    const names = RC.SOUND_GROUPS.Perks || [];
    const bank = g.sound?.bank;
    check(`perk sounds catalogued and in the bank (${names.length})`, names.length >= 8 && !!bank && names.every((n) => RC.DEFS[n] && bank.get(n)), bank ? names.filter((n) => !bank.get(n)).join(' ') : 'no bank');
    newRun();
    return false;
  });

  // ---------------------------------------------------------------- every perk's stats feed the pipeline
  steps.push(async () => {
    freezeBots();
    const p = me(), T = PK.PERKS, bad = [];
    const ids = Object.keys(T).filter((id) => ['common', 'uncommon', 'rare', 'synergy'].includes(T[id].rarity) && T[id].stats);
    for (const id of ids) {
      P().grant(p, id, { source: 'test' });
      const on = Object.entries(T[id].stats).every(([s, v]) => near(M().stat(p, s), v, 1e-9));
      P().revoke(p, id);
      const off = Object.keys(T[id].stats).every((s) => M().stat(p, s) === 0);
      if (!on || !off) bad.push(id);
    }
    check(`every perk with stats (${ids.length}) feeds the pipeline: its bonuses summed, gone when revoked`, !bad.length && !M().live, bad.join(' '));
    for (const id of Object.keys(PK.PERK_BUFFS)) {
      P().buff(p, id, 0.2, { source: 'test' });
      const on = Object.entries(T[id].stats).every(([s, v]) => near(M().stat(p, s), v, 1e-9));
      ticks(30);
      if (!on || P().has(p, id) || p.zm) bad.push(id);
    }
    check('the perks\' timed buffs feed it for their time, then run out', !bad.length, bad.join(' '));
    // ---- max health
    P().grant(p, 'toughness');
    const h1 = [p.maxHealth, p.health];
    P().grant(p, 'toughness');
    const h2 = [p.maxHealth, p.health];
    P().revoke(p, 'toughness');
    check('Toughness: +25 max health a stack (125, then 150), and the health with it', h1.join() === '125,125' && h2.join() === '150,150' && p.maxHealth === 100 && p.health === 100, `${h1} ${h2}`);
    P().grant(p, 'bloodpact');
    const bp = [p.maxHealth, p.health];
    P().revoke(p, 'bloodpact');
    check('Blood Pact: max health 75 (health down to it)', bp.join() === '75,75', String(bp));
    // ---- reload / draw / fire rate / magazine / speed
    const deagle = g.giveWeapon(p, 'deagle', { select: true, fullAmmo: true });
    ticks(120);
    const reload = () => { deagle.clip = 0; deagle.ammo = 35; ticks(1); const r = deagle.nextAttack - g.time; ticks(300); return r; };
    const r0 = reload();
    const r1 = holding(['quickhands'], reload);
    check('Quick Hands: a reload takes 1/1.25 as long', r0 > 1.9 && near(r1 / r0, 0.8, 0.02), `${r0.toFixed(3)} -> ${r1.toFixed(3)}`);
    const ak = g.giveWeapon(p, 'ak47', { select: true, fullAmmo: true });
    const draw = () => { g.selectWeapon(p, deagle, true); g.selectWeapon(p, ak, true); return ak.nextAttack - g.time; };
    const d0 = draw(), d1 = holding(['gunslinger'], draw);
    check('Gunslinger: any gun draws 25% faster (0.75 s -> 0.6 s)', near(d0, 0.75, 0.02) && near(d1, 0.6, 0.02), `${d0.toFixed(3)} -> ${d1.toFixed(3)}`);
    ticks(120);
    const cycle = () => { const ctx = g.weaponCtx(p); WS.weaponFrame(ak, ctx, 1, 0); const c = ak.nextPrimary - g.time; ticks(100); return c; };
    const c0 = cycle(), c1 = holding(['overclock'], cycle), c2 = holding(['hairtrigger'], cycle), c3 = holding(['overclock', 'hairtrigger'], cycle);
    check('Overclock / Hair Trigger: the cycle / 1.15, / 1.25, both / 1.4 (bonuses add)', near(c1, c0 / 1.15, 0.002) && near(c2, c0 / 1.25, 0.002) && near(c3, c0 / 1.4, 0.002), `${c0.toFixed(4)} ${c1.toFixed(4)} ${c2.toFixed(4)} ${c3.toFixed(4)}`);
    const mag = (ids) => holding(ids, () => { ticks(1); return WS.clipSize(ak); });
    const m0 = mag([]), m1 = mag(['deepmags']), m2 = mag(['hairtrigger']);
    ticks(1);
    check('Deep Mags: 39 rounds; Hair Trigger: 23 (and back to 30)', m0 === 30 && m1 === 39 && m2 === 23 && WS.clipSize(ak) === 30, `${m0} ${m1} ${m2}`);
    const speed = (ids) => holding(ids, () => { ticks(2); return p.pm.maxspeed; });
    const s0 = speed([]), s1 = speed(['fleetfoot']), s2 = speed(['juggernaut']);
    check('Fleet Foot: move x1.1; Juggernaut: x0.88', near(s1 / s0, 1.1, 0.002) && near(s2 / s0, 0.88, 0.002), `${s0} ${s1} ${s2}`);
    // ---- prices, money, healing
    const E = Z().economy;
    const price = (ids) => holding(ids, () => E.cost(p, 'm4a1'));
    check('Bulk Order: $3100 -> $2790', price([]) === 3100 && price(['bulkorder']) === 2790);
    const pay = (ids, amount, reason) => holding(ids, () => { const m0 = p.money; E.pay(p, amount, reason); return p.money - m0; });
    p.money = 1000;
    check('Lucky Charm: earn x1.1; Greed: x1.4', pay(['luckycharm'], 100, 'kill') === 110 && pay(['greed'], 100, 'kill') === 140 && pay([], 100, 'kill') === 100);
    check('Bounty Hunter: specials and bosses pay x1.5, kills as before', pay(['bountyhunter'], 300, 'special') === 450 && pay(['bountyhunter'], 1000, 'boss') === 1500 && pay(['bountyhunter'], 100, 'kill') === 100);
    check('...luck for the drops: Scavenger +0.25, Lucky Charm +0.6', holding(['scavenger'], () => M().factor(p, 'luck')) === 0.25 && holding(['luckycharm'], () => M().factor(p, 'luck')) === 0.6);
    const heal = (ids) => holding(ids, () => { p.health = 40; g.heal(p, p, 20); return p.health - 40; });
    check('Field Medic: a 20 HP medkit patch gives 30', heal([]) === 20 && heal(['fieldmedic']) === 30);
    p.health = p.maxHealth;
    Z().clearHorde();
    return false;
  });

  // ---------------------------------------------------------------- damage dealt and taken
  steps.push(async () => {
    freezeBots();
    const z = walker();
    const fam = [
      ['Hollow Points', ['hollowpoints'], 'deagle', 1.12], ['...not on a knife', ['hollowpoints'], 'knife', 1],
      ['Gunslinger', ['gunslinger'], 'deagle', 1.35], ['...pistols only', ['gunslinger'], 'ak47', 1],
      ['Close Quarters', ['closequarters'], 'm3', 1.25], ['Spray and Pray', ['sprayandpray'], 'mp5', 1.25],
      ['Trigger Discipline', ['discipline'], 'ak47', 1.2], ['...rifles only', ['discipline'], 'deagle', 1],
      ['Steady Aim', ['steadyaim'], 'awp', 1.3], ['Heavy Gunner', ['heavygunner'], 'm249', 1.25],
      ['Butcher', ['butcher'], 'knife', 1.6], ['Blood Pact', ['bloodpact'], 'ak47', 1.3],
    ];
    const bad = fam.filter(([, ids, w, k]) => !near(dealt(z, ids, w), k, 0.005)).map(([n, ids, w]) => `${n} ${w} ${dealt(z, ids, w).toFixed(3)}`);
    check('weapon families: pistol / shotgun / SMG / rifle / sniper / MG / melee perks x their bonus, other guns untouched', !bad.length, bad.join(', '));
    const kinds = [
      ['Live Wire: tesla x1.35', ['livewire'], 'tesla', H.CHEST, { blast: true }, 1.35],
      ['Pyromaniac: fire x1.4', ['pyromaniac'], 'molotov', 0, { blast: true, fire: true }, 1.4],
      ['Demolitions: explosives x1.35', ['demolitions'], 'hegrenade', 0, { blast: true }, 1.35],
      ['Deadeye: headshots x1.25', ['deadeye'], 'deagle', H.HEAD, {}, 1.25], ['...not the body', ['deadeye'], 'deagle', H.CHEST, {}, 1],
      ['Glass Cannon: headshots x1.6', ['glasscannon'], 'ak47', H.HEAD, {}, 1.6],
      ['Pyromaniac: bullets untouched', ['pyromaniac'], 'ak47', H.CHEST, {}, 1],
    ];
    const bad2 = kinds.filter(([, ids, w, hg, o, k]) => !near(dealt(z, ids, w, hg, o), k, 0.005)).map(([n]) => n);
    check('damage kinds: tesla, fire, explosives, headshots', !bad2.length, bad2.join(', '));
    Z().despawn(z);
    // synergies' damage (they unlock with the pair)
    const z2 = walker();
    check('Executioner (Deadeye + Gunslinger): a pistol headshot x1.25 x1.35 x1.5; a rifle one only x1.25', near(dealt(z2, ['deadeye', 'gunslinger'], 'deagle', H.HEAD), 1.25 * 1.35 * 1.5, 0.01) && near(dealt(z2, ['deadeye', 'gunslinger'], 'ak47', H.HEAD), 1.25, 0.005) && near(dealt(z2, ['deadeye', 'gunslinger'], 'deagle', H.CHEST), 1.35, 0.005));
    check('Plasma Arc (Pyromaniac + Live Wire): tesla x1.35 x... +15% (1.5), fire 1.4 + 0.15', near(dealt(z2, ['pyromaniac', 'livewire'], 'tesla', H.CHEST, { blast: true }), 1.5, 0.005) && near(dealt(z2, ['pyromaniac', 'livewire'], 'molotov', 0, { blast: true, fire: true }), 1.55, 0.005));
    z2.burn = null;
    check('Napalm (Pyromaniac + Demolitions): explosives 1.35 + 0.15', near(dealt(z2, ['pyromaniac', 'demolitions'], 'hegrenade', 0, { blast: true }), 1.5, 0.005));
    z2.burn = null;
    check('Hit and Run (Butcher + Fleet Foot): melee 1.6 + 0.2 (within a stat bonuses add)', near(dealt(z2, ['butcher', 'fleetfoot'], 'knife'), 1.8, 0.005));
    // Last Stand
    const p = me();
    const ls = (hp) => { p.health = hp; const k = dealt(z2, ['laststand'], 'deagle'); p.health = p.maxHealth; return k; };
    check('Last Stand: below 35% health you deal x1.4; above it nothing', near(ls(30), 1.4, 0.005) && near(ls(80), 1, 0.005));
    Z().despawn(z2);
    // specials and bosses
    con('zm_special hunter near');
    const sp = Z().pool.find((q) => q.alive && q.special === 'hunter');
    if (sp) { sp.health = sp.maxHealth = 1e6; sp.armor = 0; }
    check('Bounty Hunter / Steady Aim / Giant Slayer: specials take x1.15', !!sp && near(dealt(sp, ['bountyhunter'], 'ak47'), 1.15, 0.005) && near(dealt(sp, ['steadyaim'], 'ak47'), 1.15, 0.005) && near(dealt(sp, ['giantslayer'], 'ak47'), 1.15, 0.005));
    Z().clearHorde();
    con('zm_boss 0');
    const b = g.bosses.boss;
    if (b) { b.health = b.maxHealth = 1e6; }
    const bk = b ? dealt(b, ['giantslayer'], 'ak47') : 0;
    g.bosses.despawn();
    check('Giant Slayer: bosses take x1.25', near(bk, 1.25, 0.005), bk.toFixed(3));
    // damage taken
    const zc = walker();
    const claw = (ids, o = {}) => taken(ids, { attacker: zc, ...o });
    const tk = [
      ['Thick Skin x0.85', claw(['thickskin']), 0.85], ['Heavy Gunner x0.9', claw(['heavygunner']), 0.9], ['Juggernaut x0.75', claw(['juggernaut']), 0.75],
      ['Glass Cannon x1.25', claw(['glasscannon']), 1.25], ['Greed x1.15', claw(['greed']), 1.15],
      ['Pyromaniac: fire x0.5', claw(['pyromaniac'], { weapon: 'molotov', opts: { blast: true, fire: true } }), 0.5],
      ['Demolitions: blasts x0.5', claw(['demolitions'], { weapon: 'hegrenade', opts: { blast: true } }), 0.5],
      ['Pyromaniac: claws untouched', claw(['pyromaniac']), 1],
      ['Last Stand at 30 HP x0.8', claw(['laststand'], { hp: 30 }), 0.8], ['Last Stand at 90 HP x1', claw(['laststand'], { hp: 90 }), 1],
    ];
    const badT = tk.filter(([, v, k]) => !near(v, k, 0.03)).map(([n, v]) => `${n}: ${v.toFixed(3)}`);
    check('damage taken: claws, fire, blasts, Glass Cannon / Greed\'s price, Last Stand', !badT.length, badT.join(', '));
    const ts2 = claw(['thickskin', 'thickskin']);
    check('Thick Skin x2: claws x0.7', near(ts2, 0.7, 0.03), ts2.toFixed(3));
    Z().despawn(zc);
    return false;
  });

  // ---------------------------------------------------------------- the hooked perks: kills, hits, revives
  steps.push(async () => {
    freezeBots();
    const p = me();
    p.money = 5000;
    // Scavenger
    const ak = g.giveWeapon(p, 'ak47', { select: true, fullAmmo: true });
    ak.ammo = 10;
    const scav = (head) => { const a0 = ak.ammo; kill(walker(), 'ak47', head); return ak.ammo - a0; };
    const sv = holding(['scavenger'], () => [scav(false), scav(true)]), sv0 = scav(false);
    check('Scavenger: a kill puts a tenth of a magazine back in the reserve (3), a headshot a fifth (6); without it nothing', sv.join() === '3,6' && sv0 === 0, `${sv} ${sv0}`);
    // Bloodthirst, Butcher
    const healK = (ids, weapon, head) => holding(ids, () => { p.health = 50; kill(walker(), weapon, head); const d = p.health - 50; p.health = p.maxHealth; return d; });
    check('Bloodthirst: a kill heals 2, a headshot kill 5', healK(['bloodthirst'], 'ak47', false) === 2 && healK(['bloodthirst'], 'ak47', true) === 5 && healK([], 'ak47', true) === 0);
    check('Butcher: a melee kill heals 5 (a gun kill nothing)', healK(['butcher'], 'knife', false) === 5 && healK(['butcher'], 'ak47', false) === 0);
    p.health = 99; P().grant(p, 'bloodthirst'); kill(walker(), 'ak47', true); P().revoke(p, 'bloodthirst');
    check('...never past max health', p.health === p.maxHealth);
    // Adrenaline
    ticks(2);
    const s0 = p.pm.maxspeed;
    P().grant(p, 'adrenaline');
    kill(walker(), 'ak47');
    ticks(2);
    const s1 = p.pm.maxspeed, on = P().has(p, 'adrenalinerush');
    ticks(200);
    const mid = P().has(p, 'adrenalinerush');
    ticks(150);
    const s2 = p.pm.maxspeed;
    P().revoke(p, 'adrenaline');
    check('Adrenaline: a kill gives 3 s of +15% speed (and fire rate), then it runs out', on === 1 && mid === 1 && near(s1 / s0, 1.15, 0.002) && !P().has(p, 'adrenalinerush') && near(s2, s0, 0.01), `${s0} ${s1} ${s2}`);
    // Hit and Run (Butcher + Fleet Foot)
    rec = [];
    P().grant(p, 'butcher'); P().grant(p, 'fleetfoot');
    const hr = P().has(p, 'hitandrun');
    kill(walker(), 'ak47');
    const gunKill = P().has(p, 'hitandrunrush');
    kill(walker(), 'knife');
    const rush = P().has(p, 'hitandrunrush'), mz = M().factor(p, 'taken');
    P().revoke(p, 'butcher');
    const broken = !P().has(p, 'hitandrun');
    P().revoke(p, 'fleetfoot');
    ticks(320);
    check('Hit and Run: unlocks (a synergy event), a melee kill gives 3 s of +20% speed and 30% less damage taken, a gun kill doesn\'t', hr === 1 && !gunKill && rush === 1 && near(mz, 0.7, 1e-9) && of('synergy', (e) => e.id === 'hitandrun' && e.player === p).length === 1);
    check('...losing one of the pair takes the synergy away', broken);
    // Black Market (Scavenger + Bounty Hunter)
    P().grant(p, 'scavenger'); P().grant(p, 'bountyhunter');
    const E = Z().economy;
    const m0 = p.money; E.pay(p, 60, 'kill'); const bm = p.money - m0;
    const pr = E.cost(p, 'm4a1');
    P().revoke(p, 'scavenger'); P().revoke(p, 'bountyhunter');
    check('Black Market (Scavenger + Bounty Hunter): kills pay $10 more, another 10% off', bm === 70 && pr === 2790, `${bm} ${pr}`);
    // Live Wire: a clawing zombie gets a jolt
    const z = walker();
    P().grant(p, 'livewire');
    rec = [];
    const h0 = z.health;
    p.god = false; p.armor = 0;
    g.damagePlayer(p, z, 10, H.CHEST, 'zombie', [1, 0, 0], p.eyePos());
    p.god = true; p.health = p.maxHealth;
    ticks(1);
    const jolt = h0 - z.health, jh = of('hit', (e) => e.victim === z && e.attacker === p && e.weapon === 'tesla').length;
    const st = Z().staggers?.st?.(z) || z.stag || null;
    p.god = false; g.damagePlayer(p, z, 10, H.CHEST, 'zombie', [1, 0, 0], p.eyePos()); p.god = true; p.health = p.maxHealth;
    ticks(1);
    const again = h0 - z.health;
    P().revoke(p, 'livewire');
    check('Live Wire: a zombie that claws you takes a 15 (x1.35 tesla) jolt; once in 0.6 s', near(jolt, 15 * 1.35, 0.6) && jh === 1 && near(again, jolt, 0.01), `${jolt.toFixed(2)} hits ${jh} again ${again.toFixed(2)} ${st ? 'staggered' : ''}`);
    Z().despawn(z);
    // Plasma Arc / Napalm: hits set zombies alight
    const z2 = walker();
    P().grant(p, 'pyromaniac'); P().grant(p, 'livewire');
    hitZ(z2, 20, H.CHEST, 'tesla', { blast: true });
    const pa = z2.burn ? z2.burn.weapon : null;
    P().revoke(p, 'livewire');
    z2.burn = null;
    hitZ(z2, 20, H.CHEST, 'tesla', { blast: true });
    const pa0 = !!z2.burn;
    P().grant(p, 'demolitions');
    hitZ(z2, 20, 0, 'hegrenade', { blast: true });
    const na = z2.burn ? z2.burn.weapon : null;
    P().revoke(p, 'demolitions'); P().revoke(p, 'pyromaniac');
    z2.burn = null;
    hitZ(z2, 20, 0, 'hegrenade', { blast: true });
    check('Plasma Arc: a tesla hit sets a zombie alight (not without it)', pa === 'tesla' && !pa0, `${pa} ${pa0}`);
    check('Napalm: an explosion sets a zombie alight (not without it)', na === 'hegrenade' && !z2.burn, String(na));
    Z().despawn(z2);
    // Rally Cry: an aura on the whole squad
    const bot = botPs()[0];
    P().grant(p, 'rally');
    const a1 = [M().factor(bot, 'damage'), M().factor(p, 'damage'), M().factor(bot, 'reload')];
    P().grant(bot, 'rally');
    const a2 = M().factor(bot, 'damage');
    P().revoke(bot, 'rally'); P().revoke(p, 'rally');
    check('Rally Cry: the whole squad deals x1.1 and reloads x1.1 faster; a second rally doesn\'t stack; off with the last holder', near(a1[0], 1.1) && near(a1[1], 1.1) && near(a1[2], 1 / 1.1) && near(a2, 1.1) && !bot.zm && !M().keys('squad').length, a1.map((x) => x.toFixed(3)).join(' '));
    return false;
  });

  // ---------------------------------------------------------------- revives: Field Medic and Guardian Angel
  steps.push(async () => {
    newRun({ allies: 2 });
    freezeBots();
    const p = me(), S = Z().diff.squad;
    quietWave(4);
    const b1 = botPs()[0];
    for (const b of botPs()) { b.god = true; if (b.bot) b.bot.reviveClock = 1e9; }
    const C = await import('/src/engine/collision.js'), PM = await import('/src/engine/pmove.js');
    const tr = new C.TraceResult();
    const place = (q) => {
      const o = p.pm.origin, Hh = PM.HULL_STAND, y0 = p.pm.angles[1];
      for (let a = 0; a < 360; a += 20) {
        const r = (y0 + a) * Math.PI / 180, e = [o[0] + Math.cos(r) * 50, o[1] + Math.sin(r) * 50, o[2]];
        g.collision.trace(o, e, Hh.mins, Hh.maxs, C.MASK_WORLD_PLAYER, tr);
        if (tr.fraction < 1 || tr.startsolid) continue;
        q.pm.origin = e.slice(); q.prevOrigin = e.slice(); q.pm.velocity = [0, 0, 0];
        p.pm.angles[1] = y0 + a; p.pm.angles[0] = 8;
        return true;
      }
      return false;
    };
    const reviveTicks = () => {
      b1.god = false; g.damagePlayer(b1, null, 500, H.CHEST, 'zombie', [1, 0, 0]); b1.god = true;
      if (!b1.downed || !place(b1)) return -1;
      ticks(2);
      input.wb = 8;
      let n = 0;
      while (b1.downed && n < 1500) { g.tick(); n++; }
      input.wb = 0;
      ticks(3);
      return b1.downed ? -1 : n;
    };
    const n0 = reviveTicks();
    const hp0 = b1.health;
    P().grant(p, 'fieldmedic');
    const n1 = reviveTicks();
    check('Field Medic: you revive 40% faster (the time / 1.4)', n0 > 100 && n1 > 0 && near(n1 / n0, 1 / 1.4, 0.04) && hp0 === S.reviveHealth, `${n0} -> ${n1} ticks`);
    rec = [];
    P().grant(p, 'toughness');
    const ga = P().has(p, 'guardianangel');
    const n2 = reviveTicks();
    const gHp = b1.health, guarded = P().has(b1, 'guardianangel') || P().has(b1, 'guarded'), gk = M().factor(b1, 'taken');
    check('Guardian Angel (Field Medic + Toughness): revive time / 1.65, the teammate up with +40 health and half damage for 3 s', ga === 1 && near(n2 / n0, 1 / 1.65, 0.04) && gHp === Math.min(b1.maxHealth, S.reviveHealth + 40) && guarded > 0 && near(gk, 0.5), `${n2} ticks, hp ${gHp}, taken ${gk}`);
    ticks(320);
    check('...and the half damage runs out', !P().has(b1, 'guarded') && M().factor(b1, 'taken') === 1);
    P().revoke(p, 'fieldmedic'); P().revoke(p, 'toughness');
    Z().clearHorde();
    return false;
  });

  // ---------------------------------------------------------------- the draft at every break
  steps.push(async () => {
    newRun({ allies: 3 });
    freezeBots();
    const p = me(), D = Z().diff.perks, T = PK.PERKS;
    p.money = 3000;
    quietWave(1);
    rec = [];
    con('zm_skip');
    const offers = of('draft', (e) => e.phase === 'offer');
    const picks = of('draft', (e) => e.phase === 'pick');
    const mine = P().offerFor(p);
    check('wave cleared: everyone in the squad is dealt a draft', offers.length === squad().length && squad().every((q) => offers.some((e) => e.player === q)), `${offers.length} offers for ${squad().length}`);
    check('bots pick at once (by their tags); yours waits for you', botPs().every((b) => picks.some((e) => e.player === b && e.source === 'draft') && P().list(b).length >= 1) && !!mine && !picks.some((e) => e.player === p));
    check(`your cards: ${D.choices}, distinct, drafting tiers only`, mine && mine.ids.length === D.choices && new Set(mine.ids).size === D.choices && mine.ids.every((id) => PK.RARITY[T[id].rarity].weight > 0) && mine.title === 'PERK DRAFT', mine?.ids.join(' '));
    // the overlay
    frames(3);
    const cards = [...document.querySelectorAll('.zp-card')];
    check('the overlay deals your cards: name, rarity, effect, key', cards.length === D.choices && cards.every((c, i) => c.querySelector('.zp-name')?.textContent === T[mine.ids[i]].name && c.querySelector('.zp-key')?.textContent === String(i + 1) && c.querySelector('.zp-text')?.textContent.length > 5), cards.map((c) => c.querySelector('.zp-name')?.textContent).join(' / '));
    check('...with a reroll button (free) and the clock', /free/i.test(document.querySelector('.zp-roll')?.textContent || '') && /random pick in \d+ s/.test(document.querySelector('.zp-hint')?.textContent || ''), document.querySelector('.zp-roll')?.textContent);
    return { wait: 900 };
  });
  steps.push(async () => {
    frames(2);
    return { shot: true };
  });
  steps.push(async () => {
    const p = me(), D = Z().diff.perks;
    // reroll: the first is free (normal: 1 a run), once a draft, new cards
    const ids0 = P().offerFor(p).ids.slice(), m0 = p.money;
    rec = [];
    const k = P().key(`slot${D.choices + 1}`);
    const of1 = P().offerFor(p);
    check('the key after the cards rerolls: a free one, new cards', k && of1.rerolled && of1.ids.length === D.choices && of1.ids.every((id) => !ids0.includes(id)) && p.money === m0 && of('draft', (e) => e.phase === 'offer' && e.reroll).length === 1, `${ids0} -> ${of1.ids}`);
    check('...once a draft', !P().reroll(p) && P().offerFor(p) === of1);
    frames(3);
    check('the overlay shows the new cards, the button spent', [...document.querySelectorAll('.zp-card .zp-name')].map((e) => e.textContent).join() === of1.ids.map((id) => PK.PERKS[id].name).join() && document.querySelector('.zp-roll')?.classList.contains('off'));
    // pick with a key
    const want = of1.ids[1];
    const took = P().key('slot2');
    check('key 2 picks the second card', took && P().has(p, want) >= 1 && !P().offerFor(p) && of('draft', (e) => e.phase === 'pick' && e.id === want && e.player === p).length === 1, want);
    check('number keys are weapons again with no card open', P().key('slot1') === false);
    // the next break: a paid reroll
    quietWave(2);
    con('zm_skip');
    const price = P().rerollPrice(p), m1 = p.money;
    check(`the second reroll of the run costs money ($${price} at wave 2)`, P().freeRerolls(p) === 0 && price === Math.round((D.rerollCost[0] + D.rerollCost[1] * 2) / 5) * 5 && P().reroll(p) && m1 - p.money === price, `${m1} -> ${p.money}`);
    // can't afford it
    quietWave(3);
    con('zm_skip');
    p.money = 10;
    const ids3 = P().offerFor(p).ids.slice();
    check('...refused when you can\'t afford it', !P().reroll(p) && P().offerFor(p).ids.join() === ids3.join() && p.money === 10);
    // clicking a card picks it
    frames(3);
    const c = document.querySelectorAll('.zp-card')[0];
    c?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    check('a click on a card picks it', !!c && P().has(p, ids3[0]) >= 1 && !P().offerFor(p), ids3[0]);
    return false;
  });

  steps.push(async () => {
    const p = me(), T = PK.PERKS;
    // the auto-pick: an open draft at the wave start is picked at random, never the curse when there's another card
    let safe = 0, n = 0;
    for (let i = 0; i < 12; i++) {
      quietWave(4 + i);
      con('zm_skip');
      const of0 = P().offerFor(p);
      if (!of0) continue;
      of0.ids[0] = 'bloodpact'; // (a curse in the draft)
      const before = new Set(P().list(p).map((x) => `${x.id}:${x.n}`));
      con(`zm_wave ${5 + i}`);
      const got = P().list(p).filter((x) => !before.has(`${x.id}:${x.n}`) && !x.until && T[x.id].rarity !== 'synergy');
      n++;
      if (got.length === 1 && got[0].id !== 'bloodpact' && of0.ids.includes(got[0].id) && !P().offerFor(p)) safe++;
      Z().clearHorde(); Z().spawned = Z().stats.count; Z().bossAt = 1e9;
    }
    check(`an open draft at the wave start is picked at random, never the curse when there is another card (${safe}/${n})`, n >= 10 && safe === n);
    // offers made mid-wave wait for the break
    const w = Z().wave;
    P().offer(p, ['ironheart', 'hunterseye'], { source: 'trophy', title: 'TROPHY: TEST' });
    check('an offer made mid-wave waits: no card open, number keys stay weapons', !P().offerFor(p) && !!P().waiting(p) && P().key('slot1') === false);
    con(`zm_wave ${w + 1}`);
    check('...not auto-picked by the next wave start either', !!P().waiting(p) && !P().has(p, 'ironheart') && !P().has(p, 'hunterseye'));
    rec = [];
    con('zm_skip');
    const q = P().offers.get(p) || [];
    check('...the break opens it, ahead of the break\'s draft', P().offerFor(p)?.source === 'trophy' && q.length === 2 && q[1].source === 'draft');
    P().choose(p, 'ironheart');
    check('...picked; the draft is next', P().has(p, 'ironheart') === 1 && P().offerFor(p)?.source === 'draft');
    P().choose(p, 0);
    return false;
  });

  steps.push(async () => {
    const p = me(), T = PK.PERKS, D = Z().diff.perks;
    // the curse slot: about diff.perks.curse of the drafts hold one gamble, never two
    let withCurse = 0, two = 0, rareIn5 = 0, rare1 = 0, n = 400;
    for (let i = 0; i < n; i++) {
      const c = P().deal(p, 1 + (i % 4)).ids.filter((id) => T[id].curse).length;
      if (c) withCurse++;
      if (c > 1) two++;
      const r5 = P().deal(p, 5);
      if (r5.rare && r5.ids.some((id) => T[id].rarity === 'rare')) rareIn5++;
      rare1 += P().deal(p, 3).ids.filter((id) => T[id].rarity === 'rare').length;
    }
    const share = withCurse / n;
    check(`the curse slot: ${(share * 100).toFixed(0)}% of drafts hold a gamble (diff ${D.curse * 100}%), never two`, share > D.curse * 0.5 && share < D.curse * 1.6 && !two);
    check(`rarer cards every ${D.rareEvery}th wave: a rare card in every wave-5 draft (${rareIn5}/${n}); fewer otherwise (${(rare1 / n).toFixed(2)} a draft)`, rareIn5 === n && rare1 / n < 0.9);
    // a seeded run deals the same
    newRun({ seed: 4242 });
    freezeBots();
    const a = P().deal(me(), 1).ids.join();
    P().reset();
    const b = P().deal(me(), 1).ids.join();
    newRun({ seed: 4243 });
    const c = [P().deal(me(), 1).ids.join(), P().deal(me(), 2).ids.join(), P().deal(me(), 3).ids.join()];
    check('a seeded run deals the same cards (rng(seed, \'perks\'))', a === b && c.some((x) => x !== a), `${a} | ${b}`);
    // bots draft by their guns and their role
    const bot = botPs()[0];
    const pickFor = (setup, ids) => { setup(); let ok = 0; for (let i = 0; i < 20; i++) if (P().botPick(bot, ids) === ids[0]) ok++; return ok; };
    const gun = (id) => () => { bot.weapons[1] = WS.createWeapon(id); bot.role = 'rifleman'; };
    const r = [
      pickFor(gun('m249'), ['heavygunner', 'gunslinger', 'closequarters']),
      pickFor(gun('awp'), ['steadyaim', 'sprayandpray', 'closequarters']),
      pickFor(gun('m3'), ['closequarters', 'sprayandpray', 'discipline']),
      pickFor(gun('flamethrower'), ['pyromaniac', 'hollowpoints', 'gunslinger']),
      pickFor(() => { bot.weapons[1] = WS.createWeapon('ak47'); bot.role = 'medic'; }, ['fieldmedic', 'sprayandpray', 'closequarters']),
      pickFor(gun('ak47'), ['toughness', 'bloodpact']),
    ];
    bot.role = null;
    check('bots draft by tags: an MG gunner Heavy Gunner, a sniper Steady Aim, a shotgunner Close Quarters, the flamethrower Pyromaniac, a medic Field Medic; they pass on a curse', r.every((x) => x === 20), r.join(' '));
    P().grant(bot, 'pyromaniac');
    bot.weapons[1] = WS.createWeapon('ak47');
    const sy = pickFor(() => {}, ['livewire', 'gunslinger', 'closequarters']);
    check('...and go for a synergy they can complete', sy === 20, String(sy));
    return false;
  });

  // ---------------------------------------------------------------- the HUD strip, the synergy card, the run report
  steps.push(async () => {
    newRun({ allies: 2 });
    freezeBots();
    const p = me();
    rec = [];
    P().grant(p, 'toughness'); P().grant(p, 'toughness');
    P().grant(p, 'fieldmedic');
    P().grant(p, 'pyromaniac');
    P().grant(p, 'livewire');
    P().grant(p, 'bloodpact');
    P().buff(p, 'adrenalinerush', 3, { source: 'perk' });
    check('a synergy unlocks: the event, the perk', of('synergy', (e) => e.player === p && e.id === 'guardianangel').length === 1 && of('synergy', (e) => e.id === 'plasmaarc').length === 1 && P().has(p, 'plasmaarc') === 1);
    frames(2);
    const toast = document.querySelector('.zp-toast');
    check('...and its card: the name, the pair, what it does', !!toast && /synergy unlocked/i.test(toast.textContent) && /Plasma Arc/i.test(toast.textContent) && /Pyromaniac \+ Live Wire/.test(toast.textContent), toast?.textContent);
    // the strip: one icon per perk (synergies and the timed buff too), drawn by the page's own frame
    spy.seen = []; spy.spr0 = g.hud.spr;
    g.hud.spr = function (s, x, y, rgb, a) { if (spy.on) spy.seen.push([s.width, Math.round(x), Math.round(y), rgb.join()]); return spy.spr0.call(this, s, x, y, rgb, a); };
    spy.on = true;
    return { wait: 400 };
  });
  steps.push(async () => {
    const p = me();
    spy.on = false; g.hud.spr = spy.spr0;
    const seen = spy.seen.slice(-200);
    const sz = Math.round(PK.STRIP_PX * g.hud.k);
    const want = P().list(p).length;
    const icons = seen.filter((e) => e[0] === sz && e[1] < g.hud.vw / 2 && e[2] > g.hud.vh * 0.6).slice(-want);
    check(`the HUD strip: an icon for each of your ${want} perks, rarity coloured (a curse red, a synergy pink)`, icons.length === want && icons.some((e) => e[3] === PK.CURSE_RGB.join()) && icons.some((e) => e[3] === PK.RARITY.synergy.rgb.join()), `${icons.length} icons`);
    // the report
    const rep = P().report(p);
    check('the run report: your perks (not the timed buff), stacks, rarity, glyph', rep.length === want - 1 && rep.find((x) => x.id === 'toughness')?.n === 2 && rep.find((x) => x.id === 'bloodpact')?.curse && rep.find((x) => x.id === 'plasmaarc')?.synergy && rep.every((x) => x.name && x.icon && x.rgb), rep.map((x) => x.id).join(' '));
    // the scoreboard (Tab): everyone's build
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', bubbles: true }));
    return { wait: 400 };
  });
  steps.push(async () => {
    const p = me();
    const imgs = document.querySelectorAll('.zs-panel tr.me .zs-perks img').length;
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Tab', bubbles: true }));
    check('the scoreboard (Tab) shows each one\'s build', imgs === P().badges(p).length && imgs > 0, `${imgs} of ${P().badges(p).length}`);
    // a draft open over it all
    quietWave(5);
    con('zm_skip');
    frames(3);
    const of5 = P().offerFor(p);
    check('the wave 5 draft is a rare draft (the title says so)', of5?.rare && of5.title === 'RARE DRAFT' && /rare/.test(document.querySelector('.zp-draft')?.className || ''));
    return { wait: 900 };
  });
  steps.push(async () => {
    frames(2);
    const top = P().ui?.top;
    check('the centre prints keep above the cards', top > 0.3 && top < 0.75 && g.hud.centerAvoid <= top * g.hud.vh, `top ${top?.toFixed(3)} avoid ${g.hud.centerAvoid}`);
    return { shot: true };
  });
  steps.push(async () => {
    // a card that completes a synergy says so
    const p = me();
    const of0 = P().offerFor(p);
    P().revoke(p, 'livewire');
    of0.ids[0] = 'livewire'; of0.rev++;
    frames(3);
    const meta = document.querySelector('.zp-card .zp-meta');
    check('a card that would complete a synergy says which', /Pyromaniac = Plasma Arc/i.test(meta?.textContent || '') && document.querySelector('.zp-card')?.classList.contains('syn'), meta?.textContent);
    P().choose(p, 0);
    frames(40);
    check('picked: the overlay goes', !document.querySelector('.zp-draft:not(.out) .zp-card:not(.picked):not(.gone)'));
    // the run is over: the report screen lists your build
    Z().gameOver();
    ticks(450);
    return { wait: 1500 };
  });
  steps.push(async () => {
    const chips = [...document.querySelectorAll('.fe-perk')];
    const rep = P().report(me());
    check('the run-over screen shows your build', chips.length === rep.length && chips.some((c) => /Plasma Arc/.test(c.textContent)), `${chips.length} of ${rep.length}`);
    return { shot: true };
  });
  steps.push(async () => {
    newRun({ allies: 2 });
    check('a new run: no perks, no hooks, the pipeline idle', !P().held.size && !P().unhook && !M().live && squad().every((q) => !q.perks && q.maxHealth === 100));
    thawBots();
    g.buildLocalCmd = build0;
    restore();
    return true;
  });

  let i = 0;
  window.__drive = async () => {
    out.length = 0;
    let r = null;
    try { r = await steps[i++](); } catch (e) { check('step ' + i + ' threw', false, e.stack); r = true; restore(); g.buildLocalCmd = build0; }
    const done = r === true || i >= steps.length;
    if (done) out.push(`[sim] ${fail ? 'FAILED' : 'ALL PASSED'}: ${pass} passed, ${fail} failed`);
    return { log: out.join('\n'), done, ...(r && typeof r === 'object' ? r : {}) };
  };
})();
