// Ch2 diagnostic: bot brain state after the generator crescendo (why do bots stay behind?).
export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=1');
  for (let i = 0; i < 120; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const TY = -6.2;
  await evalg((TY) => {
    const g = window.game;
    g.cheats.godAll = true; g.director.enabled = true; g.cheats.botsIdle = false;
    g.hud.show(false); window.session.menu.clear();
    g.survivors.forEach((s, i) => s.teleport(164 + i * 0.8, TY, 46.5, Math.PI));
    g.advance(3);
    g.level.ch2Generator.usable.onUse(g.player);
    window.__dump = () => {
      const w = g.infected.specials.filter((s) => !s.dead).map((s) => [s.kind, +s.pos.x.toFixed(1), +s.pos.y.toFixed(1), +s.pos.z.toFixed(1), s.enraged ? 'E' : '']);
      return { t: +g.time.toFixed(1), specials: w, bots: g.survivors.filter((s) => s !== g.player).map((s) => {
        const b = s.brain;
        return { id: s.char.id, pos: [+s.pos.x.toFixed(1), +s.pos.y.toFixed(1), +s.pos.z.toFixed(1)], mode: b.mode, moving: b.moving, stuck: +b.stuckT.toFixed(1), item: b.itemGoal ? [b.itemGoal.type, +b.itemGoal.pos.x.toFixed(1), +b.itemGoal.pos.y.toFixed(1), +b.itemGoal.pos.z.toFixed(1)] : null,
          path: b.path ? [b.path.length, b.pathI, !!b.path.partial] : null, pg: [+b.pathGoal.x.toFixed(1), +b.pathGoal.y.toFixed(1), +b.pathGoal.z.toFixed(1)], act: s.action?.type, pinned: !!s.pinned, inc: s.incapped, hp: Math.round(s.totalHealth), tgt: b.target ? b.target.kind || 'common' : null, slot: s.slot, cmd: [+s.cmd.mx.toFixed(2), +s.cmd.my.toFixed(2)] };
      }) };
    };
  }, TY);
  for (let k = 0; k < 16; k++) {
    const r = await evalg(() => { const g = window.game; g.advance(5); return { open: g.level.ch2Generator.ev.open, ...window.__dump() }; });
    if (k % 3 === 0 || r.open) console.log(JSON.stringify(r));
    if (r && r.open) break;
  }
  for (const [x, y, z] of [[176, TY, 55], [186, TY, 55], [186, TY, 55], [194, -3.5, 55]]) {
    const r = await evalg(([x, y, z]) => { const g = window.game; g.player.teleport(x, y, z, -Math.PI / 2); g.advance(6); return { at: [x, z], ...window.__dump() }; }, [x, y, z]);
    console.log(JSON.stringify(r));
  }
};
