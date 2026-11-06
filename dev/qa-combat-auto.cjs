// Full-auto / sustained fire through the real input path: shots fired, hit rate at 15 m (hip vs ADS), climb.
const { boot } = require('./qa-combat-lib.cjs');
(async () => {
  const T = await boot({ fast: true });
  const s = await T.openSpot();
  await T.tp(s.x, s.y, s.z, 0, 0);
  await T.wait(1500);
  await T.ev(() => { const g = window.game; const ri = g.readInput.bind(g); g.readInput = () => { const i = ri(); if (window.__aim) i.aim = true; if (window.__fire) { i.attack = true; i.attackPressed = !window.__held; window.__held = true; } else window.__held = false; return i; }; });
  for (const [id, dist] of [['rifle_m4', 15], ['rifle_ak47', 15], ['smg_mp5', 12], ['pistol_glock', 12], ['shotgun_pump', 10]]) {
    for (const aim of [false, true]) {
      await T.hold(id, { ammo: 30 });
      await T.ev(() => { window.game.player.inv.addItem(window.__ci('ammo_9mm', { count: 50 })); });
      await T.wait(300);
      const zi = await T.spawnFront(dist);
      await T.ev((zi) => { const z = window.__zmap[zi]; z.update = () => {}; z.hp = z.maxHp = 99999; z.takeDamage = ((td) => (a, o) => { window.__dmg = (window.__dmg || 0) + a; window.__hits = (window.__hits || 0) + 1; return { killed: false }; })(z.takeDamage); }, zi);
      await T.aimAt(zi, 'torso');
      await T.ev(([aim]) => { window.__aim = aim; window.__dmg = 0; window.__hits = 0; window.game.combat.recoilAccum = 0; window.__p0 = window.game.player.pitch; }, [aim]);
      await T.gwait(0.5);
      await T.ev(() => { window.__fire = true; window.__a0 = window.game.player.inv.selectedStack.ammo; });
      const semi = id === 'pistol_glock' || id === 'shotgun_pump';
      if (semi) {
        // tap the trigger as fast as the gun allows
        for (let k = 0; k < 8; k++) { await T.ev(() => { window.__fire = true; window.__held = false; }); await T.gwait(id === 'shotgun_pump' ? 1.0 : 0.26); }
      } else await T.gwait(1.5);
      const r = await T.ev(() => { window.__fire = false; const g = window.game; const st = g.player.inv.selectedStack; return { shots: window.__a0 - st.ammo, hits: window.__hits, climbDeg: +((g.player.pitch - window.__p0) * 57.3).toFixed(1), accum: +g.combat.recoilAccum.toFixed(1) }; });
      await T.ev(() => { window.__aim = false; for (const z of Object.values(window.__zmap)) if (!z.dead) { z.dead = true; z.visual.root.visible = false; } window.game.zombies.zombies.length = 0; });
      console.log(id, aim ? 'ADS' : 'hip', JSON.stringify(r));
    }
  }
  await T.done();
})();
