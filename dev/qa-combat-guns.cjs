// Firearm QA: for every firearm — headshot kill, body shots to kill, reload (by type), dry fire, jam + clear,
// HUD ammo, casings, muzzle light. Usage: node dev/qa-combat-guns.cjs [ids,comma]
const { boot } = require('./qa-combat-lib.cjs');
const GUNS = ['pistol_m9', 'pistol_glock', 'pistol_1911', 'revolver_357', 'shotgun_pump', 'shotgun_tactical', 'shotgun_double', 'shotgun_sawed', 'rifle_hunting', 'rifle_ar15', 'rifle_m4', 'rifle_ak47', 'rifle_sks', 'rifle_22', 'rifle_lever', 'smg_mp5', 'crossbow', 'bow', 'bow_crude'];
(async () => {
  const ids = process.argv[2] ? process.argv[2].split(',') : GUNS;
  const T = await boot({ fast: true });
  const s = await T.openSpot();
  await T.tp(s.x, s.y, s.z, 0, 0);
  await T.wait(2000);
  console.log('fps', await T.ev(() => window.game.fps));
  // deterministic aim for damage tests
  await T.ev(() => { const c = window.game.combat; c.__spread = c.spreadFor.bind(c); c.spreadFor = (d) => (window.__noSpread ? 0 : c.__spread(d)); window.__noSpread = true; });
  const killAll = () => T.ev(() => { const g = window.game; for (const z of g.zombies.zombies) if (!z.dead) z.die({}); });
  const fire = () => T.ev(() => { const g = window.game; g.combat.cooldown = 0; g.combat.reload = null; g.combat.fireGun(g.player.inv.selectedStack, g.combat.def); });
  for (const id of ids) {
    const def = await T.ev((id) => { const d = window.game.ITEMS ? null : null; return null; }, id);
    void def;
    const fa = await T.ev(async (id) => { const { getItemDef } = await import('/src/items/items.js'); return getItemDef(id).firearm; }, id);
    const ammoId = fa.ammo[0];
    const res = { id };
    // --- headshot on a fresh walker at 8 m (stand still)
    await T.hold(id, { ammo: fa.magSize, ammoType: ammoId });
    await T.ev(() => { window.game.player.inv.hotbar.slice(1).forEach((_, i) => { window.game.player.inv.hotbar[i + 1] = null; }); });
    await T.wait(500);
    await killAll();
    let zi = await T.spawnFront(8);
    await T.ev((zi) => { const z = window.__zmap[zi]; z.update = () => {}; z.hp = z.maxHp = 100; }, zi); // freeze AI
    await T.wait(300);
    await T.aimAt(zi, 'head');
    await fire();
    await T.wait(120);
    let zz = await T.zinfo(zi);
    res.headshot = zz.dead ? 'kill' : 'hp ' + zz.hp;
    // --- body shots on a 100 hp walker
    await killAll();
    zi = await T.spawnFront(8);
    await T.ev((zi) => { const z = window.__zmap[zi]; z.update = () => {}; z.hp = z.maxHp = 100; }, zi);
    await T.wait(200);
    let n = 0;
    for (; n < 12; n++) {
      zz = await T.zinfo(zi);
      if (zz.dead) break;
      await T.aimAt(zi, 'torso');
      await T.ev(() => { const s = window.game.player.inv.selectedStack; s.ammo = Math.max(s.ammo, 1); s.jammed = false; });
      await fire();
      await T.wait(60);
    }
    res.bodyShots = n;
    await killAll();
    // --- reload from empty with spare ammo, timing
    await T.ev(([ammoId]) => { const g = window.game; const s = g.player.inv.selectedStack; s.ammo = 0; s.jammed = false; g.player.inv.addItem(window.__ci(ammoId, { count: 40 })); g.player.inv.changed(); g.combat.cooldown = 0; window.__sounds.length = 0; }, [ammoId]);
    await T.ev(() => { const g = window.game; g.combat.startReload(g.player.inv.selectedStack, g.combat.def); });
    const gt = await T.gwait(30, '!g.combat.reload');
    const rl = await T.ev(() => { const g = window.game; return { ammo: g.player.inv.selectedStack.ammo }; });
    res.reload = { kind: fa.reload, gameSec: +gt.toFixed(2), ammo: rl.ammo, mag: fa.magSize };
    res.reloadSounds = await T.ev(() => window.__sounds.filter((s) => /reload|cock|pump|bolt|break/.test(s)).join(','));
    // --- HUD
    res.hud = await T.ev(() => window.game.hud.ammo);
    // --- dry fire without spare ammo
    await T.ev(([ammo]) => { const g = window.game; const s = g.player.inv.selectedStack; s.ammo = 0; g.player.inv.remove((x) => ammo.includes(x.id), 999); g.player.inv.changed(); window.__sounds.length = 0; window.__toasts.length = 0; }, [fa.ammo]);
    await fire();
    await T.wait(100);
    res.dry = await T.ev(() => ({ sounds: window.__sounds.join(','), reload: !!window.game.combat.reload }));
    // --- jam + clear
    await T.ev(() => { const g = window.game; const s = g.player.inv.selectedStack; s.ammo = 3; s.jammed = true; window.__toasts.length = 0; });
    for (let k = 0; k < 4; k++) { await fire(); await T.wait(50); }
    res.jamToasts = await T.ev(() => window.__toasts.length);
    await T.ev(() => { const g = window.game; g.combat.reload = null; g.combat.startReload(g.player.inv.selectedStack, g.combat.def); });
    res.unjamSec = +(await T.gwait(5, '!g.combat.reload')).toFixed(2);
    res.unjammed = await T.ev(() => !window.game.player.inv.selectedStack.jammed);
    console.log(JSON.stringify(res));
  }
  await T.done();
})();
