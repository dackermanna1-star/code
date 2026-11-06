// Throwables QA: molotov, pipe bomb, frag, flare, noise maker, firecrackers, smoke, bottle / brick lures (G),
// projectile hitting a zombie. Usage: node dev/qa-combat-throw.cjs [ids,comma]
const { boot } = require('./qa-combat-lib.cjs');
const ALL = ['molotov', 'pipe_bomb', 'frag_grenade', 'flare', 'noise_maker', 'firecrackers', 'smoke_grenade', 'glass_bottle', 'brick', 'zhit'];
(async () => {
  const ids = process.argv[2] ? process.argv[2].split(',') : ALL;
  const big = process.env.BIG === '1';
  const T = await boot({ fast: !big });
  const s = await T.openSpot();
  await T.tp(s.x, s.y, s.z, 0, 0);
  await T.wait(2000);
  await T.ev(async () => { const { B } = await import('/src/world/blocks.js'); window.game.__fireId = B.fire; });
  const killAll = () => T.ev(() => { const g = window.game; for (const z of g.zombies.zombies) if (!z.dead) z.die({}); g.zombies.zombies.length = 0; });
  for (const id of ids) {
    await killAll();
    await T.tp(s.x, s.y, s.z, 0, -0.12);
    await T.give('lighter');
    const item = id === 'zhit' ? 'frag_grenade' : id;
    await T.hold(item, { count: 2 });
    await T.wait(300);
    // a little crowd ~8 m ahead (frozen so they stay put), plus listeners further away
    const crowd = [];
    for (let k = 0; k < (id === 'zhit' ? 1 : 4); k++) crowd.push(await T.spawnFront(id === 'zhit' ? 3.2 : 7.5 + (k % 2) * 0.8, {}, (k - 1.5) * 0.9));
    const far = await T.spawnFront(24, {}, 6);
    await T.ev(([crowd, far, id]) => {
      const g = window.game;
      for (const zi of crowd) { const z = window.__zmap[zi]; z.hp = z.maxHp = 100; if (id !== 'molotov') { z.__u = z.update.bind(z); z.update = (dt) => { if (z.dead) z.__u(dt); }; } }
      const f = window.__zmap[far]; f.hp = 100; f.state = 'idle';
      window.__noises = [];
      if (!g.zombies.__nz) { g.zombies.__nz = g.zombies.noise.bind(g.zombies); g.zombies.noise = (n) => { window.__noises.push(n.type + ':' + Math.round(n.radius)); return g.zombies.__nz(n); }; }
    }, [crowd, far, id]);
    if (id === 'zhit') await T.aimAt(crowd[0], 'torso');
    await T.ev(([id]) => {
      const g = window.game, c = g.combat, P = g.player;
      c.cooldown = 0;
      if (id === 'glass_bottle' || id === 'brick') { const inp = { attack: false, attackPressed: false, aim: false, aimPressed: false, throwPressed: true }; c.update(0.016, inp); }
      else c.throwItem(P.inv.selectedStack, c.def);
    }, [id]);
    const rel = await T.ev(() => ({ pending: window.game.combat.pendingThrows.length, proj: window.game.combat.projectiles.length, vm: window.game.viewmodel.action?.type }));
    // follow the projectile
    const track = [];
    for (let k = 0; k < 8; k++) {
      await T.gwait(0.35);
      track.push(await T.ev(() => { const A = window.game.combat.projectiles, pr = A[A.length - 1]; return pr ? [pr.kind, +pr.pos.y.toFixed(2), +pr.pos.z.toFixed(1), pr.landed ? 'L' : 'F'] : null; }));
    }
    if (id === 'frag_grenade' || id === 'pipe_bomb') {
      // screenshot the blast
      await T.gwait(6, '!g.combat.projectiles.length');
      await T.wait(150);
      await T.shot('throw-' + id + '-blast');
    } else if (id === 'molotov') {
      await T.gwait(1.2);
      await T.shot('throw-molotov-fire');
      await T.gwait(14);
    } else if (id === 'smoke_grenade') {
      await T.gwait(5);
      await T.shot('throw-smoke');
    } else if (id === 'flare') {
      await T.ev(() => { const g = window.game; g.time = g.computeTime(Math.floor(g.time.totalHours / 24) * 24 + 23); });
      await T.gwait(2);
      await T.shot('throw-flare-night');
      await T.ev(() => { const g = window.game; g.time = g.computeTime(Math.floor(g.time.totalHours / 24) * 24 + 12); });
    } else await T.gwait(4);
    const res = await T.ev(([crowd, far]) => {
      const g = window.game, Z = g.zombies.zombies;
      const { B } = window.__blocks || {};
      let fire = 0;
      const P = g.player;
      for (let dx = -14; dx <= 14; dx++) for (let dz = -14; dz <= 4; dz++) for (let dy = -2; dy <= 2; dy++) if (g.world.get(Math.floor(P.x) + dx, Math.floor(P.y) + dy, Math.floor(P.z) + dz) === g.__fireId) fire++;
      return {
        crowd: crowd.map((zi) => (window.__zmap[zi].dead ? 'dead' : Math.round(window.__zmap[zi].hp) + (window.__zmap[zi].burning > 0 ? 'B' : ''))),
        far: window.__zmap[far].dead ? 'dead' : window.__zmap[far].state,
        proj: g.combat.projectiles.map((p) => p.kind + (p.landed ? ':landed' : ':flying') + '@' + p.pos.y.toFixed(2)),
        smokes: g.combat.smokes.length, fires: g.fires.length, fireBlocks: fire,
        noises: window.__noises.slice(0, 8), hp: +P.health.toFixed(1), items: g.groundItems.items ? g.groundItems.items.length : '?',
      };
    }, [crowd, far]);
    console.log(id, JSON.stringify({ rel, track, ...res }));
  }
  await T.done();
})();
