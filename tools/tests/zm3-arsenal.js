// Zombie survival, Milestone 3 arsenal: the machete, fire axe, katana, crossbow, pipe bomb and
// cryo grenade - registered everywhere (defs, view / world models, icons, buy menu, sounds),
// bought (the blades take the knife's slot), and doing what they do in the world: blades that
// land late, cut two (katana), stagger (axe) and take heads; a silent crossbow whose bolt goes
// through one body and can be picked up again; a pipe bomb that draws the horde in and blows;
// a cryo grenade that freezes them solid, a frozen one shattering when a blade or blast kills it
// (a bullet: the ice cracks off, the body falls whole; never a corpse);
// bots throwing pipe bombs when swarmed; screenshots of every view model in game.
// usage (dev server running):
//   node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=2" tools/tests/zm3-arsenal.js /tmp/zm3a
// Prints "[sim] PASS ..." / "[sim] FAIL ...".
/* global localStorage, setTimeout */
(() => {
  const g = window.__game;
  const saved = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/zombies/.test(k)) saved[k] = localStorage.getItem(k); }
  const restore = () => {
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (/zombies/.test(k) && !(k in saved)) localStorage.removeItem(k); }
    for (const k in saved) localStorage.setItem(k, saved[k]);
  };
  const out = [];
  let pass = 0, fail = 0;
  const check = (name, ok, info = '') => { if (ok) pass++; else fail++; out.push(`[sim] ${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
  const DEG = Math.PI / 180;
  const Z = () => g.zombies;
  const A = () => g.zombies.arsenal;
  const me = () => g.local;
  const squad = () => g.players.filter((p) => p.team === 'CT' && !p.isZombie);
  const con = (line) => { const lines = []; const pr = g.console.menus.print; g.console.menus.print = (t) => lines.push(String(t)); try { g.console.exec(line); } finally { g.console.menus.print = pr; } return lines.join(' | '); };
  const input = { wb: 0, fwd: 0 };
  const build0 = g.buildLocalCmd;
  const hold = (wb) => { input.wb = wb; g.buildLocalCmd = () => ({ forwardmove: input.fwd, sidemove: 0, upmove: 0, buttons: 0, wbuttons: input.wb }); };
  const release = () => { input.wb = 0; };
  /** n ticks (0.01 s each), a zero-length frame every few so the hitboxes follow the models (bullets, blades need it). */
  const run = (n, every = 2) => { for (let i = 0; i < n; i++) { g.tick(); if (i % every === 0) g.frame(0); } };
  const chest = (q) => [q.pm.origin[0], q.pm.origin[1], q.pm.origin[2] + 14];
  /** A point on q's head as seen from p's eye (the ray that finds the head hitbox). */
  const headOf = (q, p = me()) => { const e = p.eyePos(), o = q.pm.origin; for (let dz = 16; dz <= 40; dz += 2) { const c = [o[0], o[1], o[2] + dz]; const r = g.traceShot(e, c.map((v, k) => e[k] + (v - e[k]) * 1.5), p); if (r.entity === q && r.hitgroup === 1) return c; } return [o[0], o[1], o[2] + 26]; };
  const aim = (p, c) => { const e = p.eyePos(), dx = c[0] - e[0], dy = c[1] - e[1], dz = c[2] - e[2]; p.pm.angles[1] = Math.atan2(dy, dx) / DEG; p.pm.angles[0] = -Math.atan2(dz, Math.hypot(dx, dy)) / DEG; p.pm.punch[0] = p.pm.punch[1] = p.pm.punch[2] = 0; };
  let think0 = null, zthink0 = null;
  const freezeBots = () => { if (!think0) think0 = g.bots.think; g.bots.think = () => {}; };
  const thawBots = () => { if (think0) g.bots.think = think0; think0 = null; };
  const freezeHorde = () => { if (!zthink0) zthink0 = Z().think; Z().think = () => {}; };
  const thawHorde = () => { if (zthink0) Z().think = zthink0; zthink0 = null; };
  let sounds = [];
  const play0 = g.sound.play.bind(g.sound);
  g.sound.play = (name, o) => { sounds.push(name); return play0(name, o); };
  const heard = (n) => sounds.filter((s) => s === n).length;

  function newRun(opts = {}) {
    thawBots(); thawHorde();
    g.newGame({ mode: 'zombies', allies: 2, ...opts });
    g.joinTeam(g.local, 'CT');
    g.bots.fillTeams(opts.allies ?? 2);
    run(50, 10);
    me().god = true;
    me().money = 16000;
    Z().nextWaveAt = g.time + 9999; // (hold the first break)
  }
  /** The open direction from me (yaw, free distance): the longest clear line among 16. */
  function openYaw() {
    const e = me().eyePos();
    let best = 0, bd = 0;
    for (let k = 0; k < 16; k++) {
      const y = k * 22.5, f = [Math.cos(y * DEG), Math.sin(y * DEG), 0];
      const r = g.traceShot(e, [e[0] + f[0] * 1500, e[1] + f[1] * 1500, e[2]], me());
      const d = r.fraction * 1500;
      if (d > bd) { bd = d; best = y; }
    }
    return { yaw: best, dist: bd };
  }
  const ahead = (yaw, d, side = 0) => { const o = me().pm.origin; return [o[0] + Math.cos(yaw * DEG) * d - Math.sin(yaw * DEG) * side, o[1] + Math.sin(yaw * DEG) * d + Math.cos(yaw * DEG) * side, o[2]]; };
  /** at, dropped onto the floor (raised first if it's inside a slope or a step): never spawned into solid. */
  function floorAt(at) {
    for (const up of [0, 18, 36, 54, 72]) {
      const s = [at[0], at[1], at[2] + up];
      const tr = g.collision.trace(s, [s[0], s[1], s[2] - 160], [-16, -16, -36], [16, 16, 36], CO.MASK_WORLD_PLAYER, new CO.TraceResult());
      if (!tr.startsolid && !tr.allsolid) return tr.endpos.slice();
    }
    const nd = g.nav.nearest(at, 200);
    return nd ? [nd.x, nd.y, nd.z + 37] : at;
  }
  function walker(at, health = 100000) {
    const up = new Set(Z().pool.filter((q) => q.alive));
    Z().spawnZombie({ variant: 'walker', at: floorAt(at), extra: true });
    const z = Z().pool.find((q) => q.alive && !q.special && !up.has(q)); // (the body it took: the pool reuses old ones)
    z.health = z.maxHealth = health; z.armor = 0;
    z.pm.velocity[0] = z.pm.velocity[1] = 0;
    return z;
  }
  const clear = () => { Z().clearHorde(); run(5); };
  const give = (id) => { const w = g.giveWeapon(me(), id, { select: true, fullAmmo: true }); run(110, 5); return w; };
  const steps = [];
  let WS, VM, WW, IC, BD, SR, CO;

  // ---------------------------------------------------------------- registration
  steps.push(async () => {
    WS = await import('/src/game/weaponsys.js');
    VM = await import('/src/assets/viewmodels.js');
    WW = await import('/src/assets/worldweapons.js');
    IC = await import('/src/ui/icons.js');
    BD = await import('/src/ui/menu/buydata.js');
    SR = await import('/src/assets/snd/recipes.js');
    CO = await import('/src/engine/collision.js');
    const AR = await import('/src/game/zarsenal.js');
    const ids = AR.ARSENAL_IDS;
    const bad = [];
    const skull = IC.weaponShape('__none__');
    const inMenu = new Set(Object.values(BD.MENU).flatMap((m) => [...(m.ALL || [])]));
    const animsOf = { machete: ['idle', 'draw', 'slash1', 'slash2'], fireaxe: ['idle', 'draw', 'chop'], katana: ['idle', 'draw', 'slash1', 'slash2', 'slash3'], crossbow: ['idle', 'draw', 'shoot1', 'reload'], pipebomb: ['idle', 'draw', 'pinpull', 'throw'], cryogrenade: ['idle', 'draw', 'pinpull', 'throw'] };
    for (const id of ids) {
      const d = WS.WEAPON_DEFS[id], miss = [];
      if (!d || !d.zombieOnly || !d.buyable) miss.push('def');
      try {
        const vm = VM.createViewModel(id);
        for (const a of animsOf[id]) if (!vm.animations.includes(a)) miss.push('anim ' + a);
        if (!vm.getMuzzle()) miss.push('muzzle');
        vm.dispose();
      } catch (e) { miss.push('vm ' + e.message); }
      try { WW.createWorldWeapon(id); } catch { miss.push('world model'); }
      if (!IC.WEAPON_IDS.includes(id) || IC.weaponShape(id) === skull || !IC.KILL_ICON_W[id] || !IC.WEAPON_AMMO[id]) miss.push('icons');
      if (!BD.ITEMS[id] || !inMenu.has(id)) miss.push('buy menu');
      if (miss.length) bad.push(`${id}: ${miss.join(', ')}`);
    }
    check('every arsenal weapon is registered (def, view model + animations, world model, icons, buy menu)', !bad.length, bad.join(' | '));
    check('the blades take the knife\'s slot; the crossbow is a primary; the throwables stack 2', ['machete', 'fireaxe', 'katana'].every((id) => WS.WEAPON_DEFS[id].slot === 3 && WS.WEAPON_DEFS[id].kind === 'knife') && WS.WEAPON_DEFS.crossbow.slot === 1 && ['pipebomb', 'cryogrenade'].every((id) => WS.WEAPON_DEFS[id].slot === 4 && WS.stackMax(id) === 2));
    const pages = Object.entries(BD.MENU).filter(([, m]) => Object.values(m).some((l) => l.length > 9)).map(([k]) => k);
    check('the arsenal pages hang off Equipment; no page over 9 items', BD.SUBPAGES.melee?.parent === 'equip' && BD.SUBPAGES.grenades?.parent === 'equip' && BD.itemsFor('equip', 'ALL').includes('melee') && BD.itemsFor('equip', 'ALL').includes('grenades') && !pages.length, pages.join(' '));
    const arsenal = SR.SOUND_GROUPS.Arsenal || [];
    check('the arsenal\'s sounds are catalogued', arsenal.length >= 20 && ['machete_slash', 'axe_hit', 'katana_draw', 'crossbow_fire', 'pipebomb_beep', 'pipebomb_explode', 'cryo_burst', 'ice_shatter'].every((n) => arsenal.includes(n)));
    // the bank renders in the background: wait for it
    for (let i = 0; i < 60 && !arsenal.every((n) => g.sound.bank?.get?.(n)); i++) await new Promise((r) => setTimeout(r, 500));
    const missing = arsenal.filter((n) => !g.sound.bank?.get?.(n));
    check('every arsenal sound is in the bank', !missing.length, missing.join(' '));
    return false;
  });

  // ---------------------------------------------------------------- buying
  steps.push(async () => {
    newRun({ allies: 2 });
    const p = me(), R = g.rounds;
    const knife = p.weapons[3];
    const ok1 = R.buy(p, 'machete');
    check('a machete bought replaces the knife (and is in hand)', ok1 && p.weapons[3]?.id === 'machete' && p.active === p.weapons[3] && knife.id === 'knife');
    const ok2 = R.buy(p, 'katana');
    check('a katana bought replaces the machete, nothing dropped', ok2 && p.weapons[3]?.id === 'katana' && !g.dropped.some((d) => d.weapon?.def.slot === 3));
    check('no second katana', !R.buy(p, 'katana'));
    R.buy(p, 'crossbow'); R.buy(p, 'primammo');
    for (let i = 0; i < 3; i++) R.buy(p, 'pipebomb');
    R.buy(p, 'cryogrenade');
    const pb = p.weapons[4].find((x) => x.id === 'pipebomb'), cr = p.weapons[4].find((x) => x.id === 'cryogrenade');
    check('crossbow, two pipe bombs (no third), a cryo grenade', p.weapons[1]?.id === 'crossbow' && p.weapons[1].ammo > 0 && pb?.count === 2 && cr?.count === 1, `pipes ${pb?.count}, bolts ${p.weapons[1]?.ammo}`);
    const st = Z().economy.menuState(p, 'katana');
    check('the buy menu knows a blade you carry', st.off && /have/.test(st.note || ''), JSON.stringify(st));
    // the blade is kept through a death (a bot: you are god-moded)
    const b = squad().find((q) => q.isBot);
    b.money = 16000;
    R.buy(b, 'fireaxe');
    run(10);
    const axe = b.weapons[3];
    g.killPlayer(b, null, 'world', false);
    g.spawnPlayer(b);
    Z().events.mode('respawn', { player: b, wave: Z().wave });
    check('a fallen squad member gets his blade back when he respawns', axe?.id === 'fireaxe' && b.weapons[3] === axe, `${b.weapons[3]?.id}`);
    return false;
  });

  // ---------------------------------------------------------------- blades
  steps.push(async () => {
    newRun({ allies: 1 });
    freezeBots(); freezeHorde();
    const { yaw, dist } = openYaw();
    check('an open line to test in', dist > 500, `${dist | 0} u`);
    // machete: a walker at arm's length, a slash lands ~0.09 s after the press
    give('machete');
    let z = walker(ahead(yaw, 46), 100000);
    run(4);
    aim(me(), chest(z));
    const h0 = z.health;
    sounds = [];
    hold(1); g.tick(); release();
    const at0 = A().counts.hits;
    g.tick(); g.tick(); g.frame(0);
    const early = A().counts.hits === at0;
    run(16);
    check('a machete slash lands a beat after the press (not at once)', early && A().counts.hits > at0 && z.health < h0, `dealt ${h0 - z.health}`);
    check('...with its sounds (whoosh, chop)', heard('machete_slash') >= 1 && heard('machete_hit') >= 1);
    // three body cuts drop a wave-5 walker (140 hp); a head cut kills and takes the head off
    z.health = 140;
    hold(1);
    for (let i = 0; i < 160 && z.alive; i++) { aim(me(), chest(z)); g.tick(); if (i % 2 === 0) g.frame(0); }
    release();
    check('the machete drops a wave-5 walker in three cuts or so', !z.alive && A().counts.swings <= 6, `${A().counts.swings} swings`);
    run(20);
    z = walker(ahead(yaw, 46), 200);
    run(4);
    sounds = [];
    hold(1);
    for (let i = 0; i < 100 && z.alive; i++) { aim(me(), headOf(z)); g.tick(); if (i % 2 === 0) g.frame(0); }
    release();
    const hb = z.model?.bones?.[z.model.rig.b.head.i];
    check('a machete head cut kills and takes the head off', !z.alive && (heard('headpop') >= 1 || (hb && hb.scale.x < 0.01)), `alive ${z.alive}, headpop ${heard('headpop')}`);
    run(30); clear();
    // katana: a sweep cuts two side by side
    give('katana');
    const z1 = walker(ahead(yaw, 50, -14)), z2 = walker(ahead(yaw, 52, 16));
    run(4);
    aim(me(), [(chest(z1)[0] + chest(z2)[0]) / 2, (chest(z1)[1] + chest(z2)[1]) / 2, chest(z1)[2]]);
    const a1 = z1.health, a2 = z2.health;
    hold(1); g.tick(); release();
    run(30);
    check('a katana sweep cuts two zombies at once', z1.health < a1 && z2.health < a2, `${a1 - z1.health} / ${a2 - z2.health}`);
    // the combo: third swing is the heavy one
    const s0 = A().counts.swings;
    hold(1); run(200); release(); run(40);
    check('the katana chains its combo (three swings in ~2 s)', A().counts.swings - s0 >= 3);
    clear();
    // fire axe: one chop, a stagger
    give('fireaxe');
    z = walker(ahead(yaw, 50));
    run(4);
    aim(me(), chest(z));
    const ah = z.health;
    hold(1); g.tick(); release();
    run(45);
    const dealt = ah - z.health;
    check('the fire axe chops hard and staggers what it hits', dealt >= 120 && z.staggerUntil > g.time, `dealt ${dealt}, held ${(z.staggerUntil - g.time).toFixed(2)} s`);
    check('...with its sounds', heard('axe_swing') >= 1 && heard('axe_hit') >= 1);
    // a swing at a wall: sparks, the clang
    clear();
    sounds = [];
    me().pm.angles[1] = yaw + 180; me().pm.angles[0] = 0;
    const back = g.traceShot(me().eyePos(), ahead(yaw + 180, 200), me());
    if (back.fraction * 200 < 60) { hold(1); run(80); release(); run(40); check('a blade on a wall clangs', heard('blade_wall') >= 1); } // (the axe's last chop is still in its cycle: held till it swings)
    thawHorde(); thawBots();
    return false;
  });

  // ---------------------------------------------------------------- crossbow
  steps.push(async () => {
    newRun({ allies: 1 });
    freezeBots(); freezeHorde();
    const { yaw } = openYaw();
    const w = give('crossbow');
    const z1 = walker(ahead(yaw, 260)), z2 = walker(ahead(yaw, 360));
    run(6);
    aim(me(), chest(z1));
    const a1 = z1.health, a2 = z2.health, loud0 = me().lastLoud ?? -99;
    sounds = [];
    hold(1); g.tick(); release();
    run(40);
    check('a bolt goes through the first zombie into the one behind', z1.health < a1 && z2.health < a2 && A().counts.pierced >= 1, `${a1 - z1.health} / ${a2 - z2.health}`);
    check('...high damage, less for the second', a1 - z1.health >= 200 && a2 - z2.health < a1 - z1.health);
    check('the crossbow is silent (the horde doesn\'t hear it)', (me().lastLoud ?? -99) === loud0 && heard('crossbow_fire') >= 1);
    run(220);
    check('it cranks the next bolt in', w.clip === 1 && heard('crossbow_crank') >= 1, `clip ${w.clip}`);
    clear();
    // a bolt into the wall: it stays there, and walking over it gives it back
    const stuck0 = A().stuck.length, got0 = A().counts.retrieved;
    aim(me(), [ahead(yaw, 400)[0], ahead(yaw, 400)[1], me().pm.origin[2] - 30]); // (into the floor out front)
    hold(1); g.tick(); release(); run(60);
    check('a bolt that misses sticks in the world', A().stuck.length === stuck0 + 1);
    const s = A().stuck[A().stuck.length - 1];
    const o = me().pm.origin;
    o[0] = s.pos[0]; o[1] = s.pos[1];
    run(30);
    check('walking over a stuck bolt picks it up', A().stuck.length === stuck0 && A().counts.retrieved === got0 + 1, `bolts ${w.ammo}`);
    thawHorde(); thawBots();
    return false;
  });

  // ---------------------------------------------------------------- pipe bomb
  let shotLure = null;
  steps.push(async () => {
    newRun({ allies: 1 });
    freezeBots();
    const { yaw } = openYaw();
    const zs = [];
    // (down the open line, where they can walk to it: nobody spawned into a wall)
    const feet = me().feet();
    for (let k = 0; k < 6; k++) {
      const at = ahead(yaw, 300 + k * 30, (k % 2 ? 1 : -1) * 20);
      const f = [at[0], at[1], feet[2]];
      zs.push(walker(g.nav.canWalk(feet, f) ? at : ahead(yaw, 300 + k * 30), 150));
    }
    // the bomb out in front, past them; the zombies are drawn to it, not to you
    const src = ahead(yaw, 520); src[2] += 10;
    freezeHorde(); // (they stand where they are till it beeps)
    const n = A().throw(me(), 'pipebomb', src, [0, 0, -50]);
    for (let i = 0; i < 200 && !n.boomAt; i++) run(1);
    run(30);
    thawHorde();
    check('the pipe bomb arms and beeps', n.boomAt > 0 && heard('pipebomb_beep') >= 1);
    check('the zombies near it are lured', zs.filter((z) => z.lure === n).length >= 4, `${zs.filter((z) => z.lure === n).length}/6`);
    const d0 = zs.map((z) => Math.hypot(z.pm.origin[0] - n.origin[0], z.pm.origin[1] - n.origin[1]));
    const me0 = zs.map((z) => Math.hypot(z.pm.origin[0] - me().pm.origin[0], z.pm.origin[1] - me().pm.origin[1]));
    run(150);
    const d1 = zs.map((z) => Math.hypot(z.pm.origin[0] - n.origin[0], z.pm.origin[1] - n.origin[1]));
    const closer = d1.filter((d, k) => d < d0[k] - 40 || d < 60).length;
    const toMe = zs.filter((z, k) => Math.hypot(z.pm.origin[0] - me().pm.origin[0], z.pm.origin[1] - me().pm.origin[1]) < me0[k] - 60).length;
    check('lured zombies walk to the bomb (and crowd round it), not to you', closer >= 4 && toMe <= 1, `${closer} at / closer to it, ${toMe} closer to you; from the bomb ${d1.map((d) => d | 0).join(',')}`);
    shotLure = true;
    aim(me(), [n.origin[0], n.origin[1], n.origin[2] + 10]); run(2); // (the shot: the crowd round the bomb)
    return { shot: true };
  });
  steps.push(async () => {
    const n = A().nades.find((q) => q.kind === 'pipebomb');
    const kills0 = Z().pool.filter((z) => !z.alive).length;
    sounds = [];
    run(250);
    check('...then it blows (and they come apart)', !A().nades.includes(n) && heard('pipebomb_explode') >= 1 && Z().pool.filter((z) => z.alive).length < 6, `alive ${Z().pool.filter((z) => z.alive).length}, gibbed ${Z().pool.filter((z) => z.gibbed).length}, dead before ${kills0}`);
    check('nobody stays lured after the blast', !Z().pool.some((z) => z.lure));
    thawBots();
    return false;
  });

  // ---------------------------------------------------------------- cryo
  steps.push(async () => {
    newRun({ allies: 1 });
    freezeBots();
    const { yaw } = openYaw();
    // a corpse lying there first: the cold never shatters a body
    const dead = walker(ahead(yaw, 240, -40), 50);
    g.damagePlayer(dead, me(), 500, 2, 'deagle', [1, 0, 0], chest(dead));
    run(10);
    const zs = [];
    freezeHorde(); // (they stand where they are till it bursts)
    for (let k = 0; k < 4; k++) zs.push(walker(ahead(yaw, 230 + k * 18, (k % 2 ? 1 : -1) * 24), 400));
    run(40); // (settled on the floor)
    const sh0 = A().counts.shattered;
    const src = [0, 1, 2].map((k) => zs.reduce((a, z) => a + z.pm.origin[k], 0) / zs.length); src[2] -= 20; // (in the middle of them)
    A().throw(me(), 'cryogrenade', src, [0, 0, -30]);
    sounds = [];
    run(175);
    thawHorde();
    run(5);
    const frozen = zs.filter((z) => z.frozenUntil > g.time);
    check('the cryo grenade bursts after its fuse and freezes the zombies in reach', heard('cryo_burst') >= 1 && frozen.length >= 3, `${frozen.length}/4 frozen`);
    check('a corpse is never shattered', !dead.alive && A().counts.shattered === sh0 && !dead.gibbed);
    const pos0 = frozen.map((z) => z.pm.origin.slice());
    run(80);
    const moved = frozen.map((z, k) => Math.hypot(z.pm.origin[0] - pos0[k][0], z.pm.origin[1] - pos0[k][1]));
    const still = moved.filter((d) => d < 2).length;
    check('frozen zombies stand stock still, frosted', still === frozen.length && frozen.every((z) => z.model.material.uniforms.uFrost.value > 0.5), `${still}/${frozen.length} still (moved ${moved.map((d) => d.toFixed(1)).join(',')}; frozen ${frozen.map((z) => (z.frozenUntil - g.time).toFixed(1)).join(',')})`);
    // kill one frozen with a bullet: the ice cracks off, the body falls whole (bullets never gib bodies)
    const v = frozen[0], cr0 = A().counts.cracked;
    g.damagePlayer(v, me(), 1000, 2, 'deagle', [1, 0, 0], chest(v));
    run(4);
    check('one a bullet kills while frozen cracks: ice bursts off, the body falls whole', !v.alive && A().counts.cracked === cr0 + 1 && A().counts.shattered === sh0 && !v.gibbed && v.model.object3D.visible && A().shards.length >= 5 && heard('ice_shatter') >= 1);
    // ...one a blade kills shatters into ice
    const v2 = frozen[1];
    if (v2) g.damagePlayer(v2, me(), 1000, 2, 'machete', [1, 0, 0], chest(v2));
    run(4);
    check('one a blade kills while frozen shatters (ice, no body left)', !!v2 && A().counts.shattered === sh0 + 1 && v2.gibbed && A().shards.length > 5);
    aim(me(), chest(v)); g.frame(0); // (the shot: the frozen ones and the ice)
    return { shot: true };
  });
  steps.push(async () => {
    const zs = Z().pool.filter((z) => z.alive);
    run(260);
    check('the frost wears off (3 s) and they come on again', zs.every((z) => !(z.frozenUntil > g.time)) && zs.every((z) => z.model.material.uniforms.uFrost.value === 0));
    const sh0 = A().counts.shattered;
    const v = zs[0];
    if (v) g.damagePlayer(v, me(), 1000, 2, 'deagle', [1, 0, 0], chest(v));
    run(4);
    check('...and one killed after the thaw falls as a body', !v || (A().counts.shattered === sh0 && !v.gibbed));
    // bosses are only chilled
    con('sv_cheats 1');
    con('zm_boss 0');
    run(20);
    const boss = g.bosses?.boss;
    if (boss?.alive) {
      const src = [boss.pm.origin[0], boss.pm.origin[1], boss.pm.origin[2] + 20];
      A().throw(me(), 'cryogrenade', src, [0, 0, -30]);
      run(170);
      check('a boss is chilled, not frozen', !(boss.frozenUntil > g.time));
    }
    g.bosses?.despawn();
    thawBots();
    return false;
  });

  // ---------------------------------------------------------------- bots
  steps.push(async () => {
    newRun({ allies: 2 });
    // (M3 integration: the squad's Demo carries the pipe bombs - zsquad.js; the other roles don't)
    const [b, r] = squad().filter((q) => q.isBot);
    b.god = true;
    b.role = 'demo'; r.role = 'rifleman';
    // a break with money to spare: the Demo buys a pipe bomb
    Z().state = 'break'; Z().wave = Math.max(1, Z().wave);
    for (const q of squad()) if (q.isBot) { q.money = 9000; if (!q.weapons[1]) g.giveWeapon(q, 'ak47', { select: true, fullAmmo: true }); }
    run(150, 10);
    check('the Demo with money to spare buys a pipe bomb in a break; a rifleman doesn\'t', b.weapons[4].some((x) => x.id === 'pipebomb') && !r.weapons[4].some((x) => x.id === 'pipebomb'));
    // swarmed: it throws it out past the crowd
    Z().nextWaveAt = g.time + 9999;
    const o = b.pm.origin;
    const thrown0 = A().counts.botPipes;
    for (let k = 0; k < 7; k++) { const a = k * (Math.PI * 2 / 7); walker([o[0] + Math.cos(a) * 140, o[1] + Math.sin(a) * 140, o[2]], 2000); }
    let ok = false;
    for (let i = 0; i < 600 && !ok; i++) { g.tick(); if (i % 4 === 0) g.frame(0); ok = A().counts.botPipes > thrown0 && A().nades.some((n) => n.kind === 'pipebomb' && n.owner?.isBot); }
    check('a swarmed Demo throws its pipe bomb', ok, `botPipes ${A().counts.botPipes - thrown0}`);
    return false;
  });

  // ---------------------------------------------------------------- the view models in game
  const shots = [['machete', 'slash1', 0.12], ['fireaxe', null, 0], ['katana', null, 0], ['crossbow', null, 0], ['pipebomb', 'pinpull', 0.6], ['cryogrenade', null, 0]];
  let si = 0;
  steps.push(async () => {
    if (si === 0) { newRun({ allies: 0 }); g.bosses?.despawn(); Z().clearHorde(); freezeBots(); const { yaw } = openYaw(); me().pm.angles[1] = yaw; me().pm.angles[0] = 0; walker(ahead(yaw, 120, 20), 1000); freezeHorde(); }
    const [id, anim, t] = shots[si++];
    const w = g.giveWeapon(me(), id, { select: true, fullAmmo: true }) || me().allWeapons().find((x) => x.id === id);
    g.selectWeapon(me(), w);
    for (let i = 0; i < 80; i++) g.frame(1 / 60); // (real frames: the draw plays out, the view model settles)
    if (anim) { g.vm.play(anim); g.vm.update(t * g.vm.duration(anim)); g.frame(0); }
    const ok = !!g.vm && g.vm.weaponId === id && g.vm.object3D.visible;
    check(`${id}: its view model in hand`, ok);
    if (si >= shots.length) { thawHorde(); thawBots(); }
    return { shot: true, done: false };
  });
  for (let k = 1; k < shots.length; k++) steps.push(steps[steps.length - 1]);

  // ---------------------------------------------------------------- the cheat, and the end
  steps.push(async () => {
    newRun({ allies: 0 });
    con('sv_cheats 1');
    con('zm_arsenal');
    const p = me();
    check('zm_arsenal (cheats) hands out the arsenal', p.weapons[3]?.id === 'katana' && p.weapons[1]?.id === 'crossbow' && p.weapons[4].some((x) => x.id === 'pipebomb') && p.weapons[4].some((x) => x.id === 'cryogrenade'));
    con('sv_cheats 0');
    g.buildLocalCmd = build0;
    g.sound.play = play0;
    restore();
    return true;
  });

  let i = 0;
  window.__drive = async () => {
    out.length = 0;
    let r = false;
    try { r = await steps[i++](); } catch (e) { check('step ' + i + ' threw', false, e.stack); r = true; restore(); }
    const shot = typeof r === 'object' && r?.shot;
    let done = typeof r === 'object' ? !!r.done : r;
    if (i >= steps.length) done = true;
    if (done) out.push(`[sim] ${fail ? 'FAILED' : 'ALL PASSED'}: ${pass} passed, ${fail} failed`);
    void shotLure;
    return { log: out.join('\n'), done, shot };
  };
})();
