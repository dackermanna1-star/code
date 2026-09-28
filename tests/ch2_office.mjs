// Bots following the player from the dock through the offices/alley/street into the pawn shop.
// Logs bot positions every step to locate navigation trouble spots; then completes the chapter.
const TY = -6.2;
const ROUTE = [[186, TY, 55], [193, -4.6, 55], [199, -0.4, 55], [203, 0, 55], [208, 0, 52.4], [215, 0, 52.4], [222.5, 0, 52.4], [222.5, 0, 59], [214, 0, 59.2], [214, 0, 61.5], [222, 0, 62], [228, 0, 64.6], [234, 0.15, 64.6], [235, 0.15, 69], [245, 0, 80], [253.5, 0.15, 86.8], [256, 0.15, 92.5]];
export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=1');
  for (let i = 0; i < 120; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg((TY) => {
    const g = window.game; g.cheats.godAll = true; g.director.enabled = !!window.__dir; g.cheats.botsIdle = false; g.hud.show(false); window.session.menu.clear();
    g.director.enabled = false;
    g.level.ch2Generator.gate.moveTo([0, 4.3, 0], 0.5); g.advance(1);
    g.survivors.forEach((s, i) => s.teleport(184 + i * 0.6, TY, 54 + i * 0.6, -Math.PI / 2));
    g.advance(1);
  }, TY);
  const step = +(process.env.STEP || 5);
  for (const [x, y, z] of ROUTE) {
    const r = await evalg(([x, y, z, step]) => {
      const g = window.game, p = g.player;
      { const nn = g.level.nav.nearestNode(x, y, z, 2); if (nn >= 0) y = g.level.nav.nodeY[nn]; }
      p.teleport(x, y, z, Math.atan2(-(x - p.pos.x), -(z - p.pos.z)));
      g.advance(step);
      return { at: [x, z], p: [+p.pos.x.toFixed(1), +p.pos.y.toFixed(1), +p.pos.z.toFixed(1)], bots: g.survivors.filter((s) => s !== p).map((s) => [+s.pos.x.toFixed(1), +s.pos.y.toFixed(1), +s.pos.z.toFixed(1), +s.brain?.stuckT?.toFixed(1)]) };
    }, [x, y, z, step]);
    console.log(JSON.stringify(r));
  }
  // wait until everybody is inside, then close the door
  const end = await evalg(() => {
    const g = window.game, L = g.level;
    let t = 0;
    const inside = () => g.survivors.filter((s) => !s.dead && L.inBox(L.endSafe, s.pos, 0.1)).length;
    while (inside() < 4 && t < 30) { g.advance(1); t++; }
    const n = inside();
    if (L.endDoor.open) L.endDoor.use(g.player);
    g.advance(4);
    return { waited: t, inside: n, doorOpen: L.endDoor.open, playerDead: g.player.dead, endTriggered: window.session.endTriggered, state: window.session.state };
  });
  console.log('END', JSON.stringify(end));
};
