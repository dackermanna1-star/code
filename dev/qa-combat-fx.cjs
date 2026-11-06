// FX / visual QA: impacts per material, blood on walls, suppressor (attach via item actions, noise), ADS + scope,
// bow one-handed, muzzle flash frame. Usage: node dev/qa-combat-fx.cjs [sections]
const { boot } = require('./qa-combat-lib.cjs');
(async () => {
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  const want = (s) => !only || only.includes(s);
  const T = await boot();
  const s = await T.openSpot();
  await T.tp(s.x, s.y, s.z, 0, 0);
  await T.wait(2000);
  const aimInput = () => T.ev(() => { const g = window.game; if (g.__riPatched) return; g.__riPatched = true; const ri = g.readInput.bind(g); g.readInput = () => { const i = ri(); if (window.__aim) i.aim = true; return i; }; });
  await aimInput();
  const fire = () => T.ev(() => { const g = window.game; g.combat.cooldown = 0; g.combat.fireGun(g.player.inv.selectedStack, g.combat.def); });
  if (want('impacts')) {
    // a test wall 4 m ahead: brick | planks | metal | glass | dirt columns
    await T.ev(async () => {
      const g = window.game, P = g.player, w = g.world;
      const { B } = await import('/src/world/blocks.js');
      P.yaw = 0; P.pitch = 0;
      const bx = Math.floor(P.x), bz = Math.floor(P.z) - 5, by = Math.floor(P.y);
      const cols = [B.brick_red, B.planks_oak, B.metal_wall, B.glass, B.dirt];
      window.__wall = { bx, bz, by };
      for (let c = 0; c < 5; c++) for (let dy = 0; dy < 4; dy++) w.setBlock(bx - 2 + c, by + dy, bz, cols[c] || B.brick_red, 0);
    });
    await T.wait(1500);
    await T.hold('pistol_m9', { ammo: 10 });
    await T.wait(400);
    for (let c = 0; c < 5; c++) {
      await T.ev((c) => {
        const g = window.game, P = g.player, W = window.__wall;
        const cam = g.renderer.camera.position;
        for (let k = 0; k < 3; k++) {
          const tx = W.bx - 2 + c + 0.5 + (k - 1) * 0.22, ty = W.by + 1.6 + (k % 2) * 0.3, tz = W.bz + 1;
          const dx = tx - cam.x, dy = ty - cam.y, dz = tz - cam.z;
          P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
          window.__noSpread = true;
          g.combat.cooldown = 0; g.combat.reload = null;
          const st = g.player.inv.selectedStack; st.ammo = 10;
          g.combat.spreadFor = () => 0;
          g.combat.fireGun(st, g.combat.def);
        }
      }, c);
      await T.wait(200);
    }
    await T.ev(() => { const P = window.game.player; P.yaw = 0; P.pitch = 0.05; });
    await T.wait(500);
    await T.shot('fx-impacts');
    // blood on the wall behind a zombie
    const zi = await T.spawnFront(2.2);
    await T.ev((zi) => { const z = window.__zmap[zi]; z.update = () => {}; z.hp = 999; }, zi);
    await T.wait(300);
    for (let k = 0; k < 3; k++) { await T.aimAt(zi, k === 2 ? 'head' : 'torso'); await fire(); await T.wait(120); }
    await T.ev((zi) => { const z = window.__zmap[zi]; z.die({}); z.visual.root.visible = false; }, zi);
    await T.ev(() => { const P = window.game.player; P.yaw = 0; P.pitch = 0.05; });
    await T.wait(1500);
    await T.shot('fx-blood-wall');
    const st = await T.ev(() => ({ decals: window.game.fx.decals.count ?? window.game.fx.decals.n ?? '?', cubes: window.game.fx.cubes.n }));
    console.log('fx', JSON.stringify(st));
  }
  if (want('suppressor')) {
    await T.hold('pistol_m9', { ammo: 15 });
    await T.give('suppressor');
    await T.wait(500);
    const r = await T.ev(async () => {
      const g = window.game, P = g.player;
      const gun = P.inv.selectedStack;
      const sup = P.inv.find('suppressor')[0];
      // via the real item actions menu entry
      const desc = P.inv.hotbarDesc();
      const acts = g.getItemActions(desc, P.inv.selected).map((a) => a.label);
      const supDesc = P.inv.allDescs().find((d) => d.slots.includes(sup.stack));
      const sacts = g.getItemActions(supDesc, supDesc.slots.indexOf(sup.stack));
      const att = sacts.find((a) => /attach|fit|suppress/i.test(a.label)) || g.getItemActions(desc, P.inv.selected).find((a) => /suppress/i.test(a.label));
      if (att) att.run();
      return { gunActs: acts, supActs: sacts.map((a) => a.label), attached: gun.data?.suppressor || null };
    });
    console.log('suppressor attach', JSON.stringify(r));
    await T.ev(() => { const P = window.game.player; P.yaw = 0.0; P.pitch = 0.0; });
    await T.wait(600);
    await T.shot('fx-suppressor-hip');
    const n = await T.ev(() => {
      const g = window.game;
      window.__sounds.length = 0; const noises = [];
      const nz = g.zombies.noise.bind(g.zombies); g.zombies.noise = (o) => { noises.push(o.type + ':' + o.radius); return nz(o); };
      g.combat.cooldown = 0; g.combat.fireGun(g.player.inv.selectedStack, g.combat.def);
      g.zombies.noise = nz;
      return { sounds: window.__sounds.slice(), noises };
    });
    console.log('suppressed shot', JSON.stringify(n));
    await T.ev(() => { window.__aim = true; });
    await T.gwait(0.8);
    await T.shot('fx-suppressor-ads');
    await T.ev(() => { window.__aim = false; });
  }
  if (want('scope')) {
    await T.hold('rifle_hunting', { ammo: 5 });
    await T.wait(500);
    await T.ev(() => { window.__aim = true; });
    await T.gwait(1.0);
    const sc = await T.ev(() => ({ scope: window.game.player.scopeActive, fov: window.game.renderer.camera.fov.toFixed(1), aimT: window.game.combat.aimT }));
    console.log('scope', JSON.stringify(sc));
    await T.shot('fx-scope');
    await T.ev(() => { window.__aim = false; });
    await T.gwait(0.6);
  }
  if (want('bow')) {
    await T.hold('bow', { ammo: 1, ammoType: 'arrow' });
    await T.wait(700);
    await T.shot('fx-bow-hip');
    await T.ev(() => { window.__aim = true; });
    await T.gwait(1.0);
    await T.shot('fx-bow-aim');
    await T.ev(() => { window.__aim = false; });
  }
  if (want('flash')) {
    await T.ev(() => { const g = window.game; g.time = g.computeTime(Math.floor(g.time.totalHours / 24) * 24 + 23.5); });
    await T.hold('rifle_ak47', { ammo: 30 });
    await T.wait(800);
    await fire();
    await T.wait(16);
    await T.shot('fx-muzzle-night');
    await T.ev(() => { const g = window.game; g.time = g.computeTime(Math.floor(g.time.totalHours / 24) * 24 + 12); });
  }
  await T.done();
})();
