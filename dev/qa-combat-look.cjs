// Screenshot every held model in-game (hip, optionally ADS / swing). Usage: node dev/qa-combat-look.cjs [ids,comma] [mode]
const { boot } = require('./qa-combat-lib.cjs');
const DEFAULT = ['fists', 'pistol_m9', 'pistol_1911', 'revolver_357', 'shotgun_pump', 'shotgun_double', 'shotgun_sawed', 'rifle_hunting', 'rifle_ar15', 'rifle_ak47', 'rifle_22', 'smg_mp5', 'crossbow', 'bow',
  'kitchen_knife', 'hunting_knife', 'baseball_bat', 'nail_bat', 'crowbar', 'hammer', 'fire_axe', 'hatchet', 'machete', 'golf_club', 'frying_pan', 'lead_pipe', 'sledgehammer', 'shovel', 'katana', 'spear', 'police_baton', 'wrench', 'pitchfork', 'wooden_club', 'screwdriver',
  'flashlight', 'molotov', 'pipe_bomb', 'frag_grenade', 'flare', 'glass_bottle', 'canned_beans', 'bandage'];
(async () => {
  const ids = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',') : DEFAULT;
  const mode = process.argv[3] || 'hip';
  const T = await boot();
  const s = await T.openSpot();
  await T.tp(s.x, s.y, s.z, 0, 0);
  await T.wait(2500);
  for (const id of ids) {
    await T.hold(id === 'fists' ? null : id, { ammo: 5 });
    if (mode === 'ads') await T.ev(() => { window.__aim = true; });
    await T.wait(900);
    if (mode === 'ads') {
      // hold the aim through the real input path
      await T.ev(() => { const g = window.game; const ri = g.readInput.bind(g); if (!g.__riPatched) { g.__riPatched = true; g.readInput = () => { const i = ri(); if (window.__aim) i.aim = true; if (window.__heavy) i.heavy = true; return i; }; } });
      await T.wait(900);
    }
    if (mode === 'swing') {
      const hd = await T.ev(() => { const g = window.game; g.combat.cooldown = 0; return g.viewmodel.swing(false); });
      await T.wait(Math.max(0, hd * 1000 - 120));
    }
    await T.shot(`look-${mode}-${id}`);
    const st = await T.ev(() => { const vm = window.game.viewmodel; const R = vm.arms.R.root; return { model: vm.meta.id, armR: R.visible, armL: vm.arms.L.root.visible, pivot: vm.pivot.position.toArray().map((v) => +v.toFixed(3)), hand: vm._handR.toArray().map((v) => +v.toFixed(3)) }; });
    console.log(id, JSON.stringify(st));
    if (mode === 'ads') await T.ev(() => { window.__aim = false; });
  }
  await T.done();
})();
