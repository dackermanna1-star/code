// Lean in-game character check: crowd (all outfit sets), shotgun gore +
// ragdolls, every special infected alive and killed, survivors on screen and
// first-person arms; few screenshots. TAG=x QUALITY=low node tests/play.mjs tests/scen_charingame.mjs
export default async ({ page, evalg, wait, shot, logs }) => {
  const TAG = process.env.TAG || 'ig';
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=0', { timeout: 180000 });
  for (let i = 0; i < 240; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const snap = async (n) => { await evalg(() => { window.game.hud.root.style.display = 'none'; }); await wait(200); await shot(`${TAG}_${n}`); };
  const r1 = await evalg(() => {
    const g = window.game;
    g.cheats.godAll = true; g.cheats.botsIdle = true; g.director.enabled = false;
    for (const c of [...g.infected.commons]) c.hp = 0;
    g.advance(0.5);
    const P = [40, 0.15, 30];
    g.player.teleport(P[0], P[1], P[2], 0); g.player.pitch = -0.08;
    g.survivors.forEach((s, i) => { if (s !== g.player) s.teleport(P[0] - 2.2 + i * 0.35, P[1], P[2] - 1.2 - (i % 2) * 0.3, 0.4); });
    const outfits = ['civilian', 'hospital', 'worker', 'police', 'subway', 'airport', 'office'];
    const nav = g.level.nav; let n = 0;
    for (let row = 0; row < 3; row++) for (let i = 0; i < 7; i++) {
      const x = P[0] - 2.6 + i * 0.85 + (row % 2) * 0.4, z = P[2] - 3.4 - row * 1.2;
      const node = nav.nearestNode(x, P[1], z, 3);
      if (node < 0) continue;
      const c = g.infected.spawnCommon(nav.nodeX(node), nav.nodeY[node], nav.nodeZ(node), { outfit: outfits[(i + row) % 7], idle: 'stand' });
      if (c) { c.yaw = (i - 3) * 0.05; n++; }
    }
    g.player.giveWeapon('rifle');
    g.advance(0.6);
    return { spawned: n, commons: g.infected.commons.length, slots: g.infected.crowd.geo.instanceCount };
  });
  console.log('CROWD', JSON.stringify(r1));
  await snap('crowd');
  const r2 = await evalg(() => {
    const g = window.game;
    g.player.giveWeapon('autoShotgun');
    for (let k = 0; k < 9; k++) { g.testCmd = { fire: true, firePressed: true }; g.player.yaw = Math.sin(k * 1.3) * 0.3; g.player.pitch = -0.15 + (k % 3) * 0.1; g.advance(0.3); }
    g.testCmd = null; g.player.yaw = 0; g.player.pitch = -0.4; g.advance(1.2);
    const sev = g.infected.corpses.filter((c) => c.body.severed).length;
    return { corpses: g.infected.corpses.length, severed: sev, ragdolls: g.infected.corpses.filter((c) => c.ragdoll).length, alive: g.infected.commons.length };
  });
  console.log('GORE', JSON.stringify(r2));
  await snap('gore');
  const r3 = await evalg(() => {
    const g = window.game; const out = [];
    const P = g.player.pos; const nav = g.level.nav;
    for (const kind of ['hunter', 'smoker', 'boomer', 'witch', 'tank']) {
      const node = nav.nearestNode(P.x + 6, P.y, P.z - 4, 6);
      const sp = g.director.spawnSpecial(kind, { node });
      g.advance(1.5);
      const alive = sp && !sp.dead;
      if (sp && !sp.dead) sp.takeHit({ damage: 1e6, dir: { x: 0, y: 0, z: -1 }, zone: 'torso', kind: 'bullet', x: sp.pos.x, y: sp.pos.y + 1, z: sp.pos.z, attacker: g.player });
      g.advance(1.0);
      out.push(kind + ':' + (alive ? 'ok' : 'none') + (sp?.dead ? '/dead' : ''));
    }
    g.advance(1);
    return out;
  });
  console.log('SPECIALS', JSON.stringify(r3));
  // specials lined up for a picture
  await evalg(() => {
    const g = window.game; const P = [40, 0.15, 30];
    for (const s of [...g.infected.specials]) s.remove();
    g.infected.specials.length = 0;
    for (const c of [...g.infected.corpses]) c.body.visible = false;
    g.player.teleport(P[0], P[1], P[2], 0); g.player.pitch = -0.05;
    const nav = g.level.nav;
    ['hunter', 'smoker', 'boomer', 'tank', 'witch'].forEach((kind, i) => {
      const x = P[0] - 3 + i * 1.5, z = P[2] - 5.5;
      const node = nav.nearestNode(x, P[1], z, 3);
      const sp = g.director.spawnSpecial(kind, { node });
      if (sp) { sp.think = () => { sp.curSpeed = 0; }; sp.placeAt(x, nav.nodeY[node], z); sp.yaw = Math.PI * 0 + (i - 2) * 0.15; if (kind === 'witch') sp.state = 'sit'; }
    });
    g.advance(0.5);
  });
  await snap('specials');
  const r4 = await evalg(() => {
    const g = window.game;
    for (const s of [...g.infected.specials]) s.remove();
    g.infected.specials.length = 0;
    g.player.teleport(40, 0.15, 30, 0); g.player.pitch = 0.05;
    g.player.giveWeapon('pumpShotgun'); g.advance(1.2);
    return { errs: g.errCount || 0 };
  });
  console.log('VM', JSON.stringify(r4));
  await snap('vm');
  console.log('errors', logs.filter((l) => /error/i.test(l)).length);
};
