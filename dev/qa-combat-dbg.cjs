// Debug: why does the screen go black after a molotov / explosion?
const { boot } = require('./qa-combat-lib.cjs');
(async () => {
  const T = await boot({ fast: true });
  const s = await T.openSpot();
  await T.tp(s.x, s.y, s.z, 0, -0.12);
  await T.wait(1500);
  const probe = (label) => T.ev(async (label) => {
    const g = window.game;
    const { globalUniforms: U } = await import('/src/render/materials.js');
    const bad = [];
    for (const k of Object.keys(U)) {
      const v = U[k].value;
      const chk = (x, n) => { if (typeof x === 'number' && !Number.isFinite(x)) bad.push(n); };
      if (typeof v === 'number') chk(v, k);
      else if (Array.isArray(v)) v.forEach((e, i) => { if (e && e.toArray) e.toArray().forEach((x, j) => chk(x, k + '[' + i + '].' + j)); });
      else if (v && v.toArray) v.toArray().forEach((x, j) => chk(x, k + '.' + j));
    }
    const P = g.player, cam = g.renderer.camera.position;
    const L0 = g.fx.lights[0];
    const em = g.fx.emitters[0];
    return { L0: L0 ? { x: L0.x, y: L0.y, z: L0.z, r: L0.r, base: L0.base, k: L0.intensity, rad: L0.radius, emI: L0.emitter?.intensity } : null, em: em ? { x: em.x, y: em.y, z: em.z, I: em.intensity, R: em.radius } : null, fires: g.fires.map((f) => f.pos.toArray()), label, bad: bad.slice(0, 10), plc: U.uPLCount?.value, cam: cam.toArray().map((x) => +x.toFixed(2)), panic: Math.round(P.panic), fx: { lights: g.fx.lights.length, em: g.fx.emitters.length }, dyn: g.dynLights.length, post: Object.fromEntries(Object.entries(g.renderer.post || {}).filter(([k, v]) => v && typeof v.value === 'number').map(([k, v]) => [k, +v.value.toFixed(3)])) };
  }, label);
  console.log(JSON.stringify(await probe('before')));
  await T.shot('dbg-0-before');
  await T.give('lighter');
  await T.hold('molotov', { count: 2 });
  await T.wait(300);
  await T.ev(() => { const g = window.game; g.combat.cooldown = 0; g.combat.throwItem(g.player.inv.selectedStack, g.combat.def); });
  await T.gwait(0.25);
  console.log(JSON.stringify(await probe('released')));
  await T.gwait(1.2);
  console.log(JSON.stringify(await probe('fire')));
  await T.shot('dbg-1-fire');
  await T.ev(() => { window.game.player.panic = 0; });
  await T.gwait(0.3);
  await T.shot('dbg-2-nopanic');
  await T.ev(() => { window.game.fx.clear(); });
  await T.gwait(0.3);
  console.log(JSON.stringify(await probe('fxcleared')));
  await T.shot('dbg-3-fxclear');
  await T.done();
})();
