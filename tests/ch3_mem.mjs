import { stubOthers } from './ch3_stub.mjs';
// Memory probe during the chapter 3 lift crescendo.
export default async ({ page, evalg, wait }) => {
  const cdp = await page.context().newCDPSession(page);
  await stubOthers(page);
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=2');
  for (let i = 0; i < 200; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const probe = async (label) => {
    const r = await evalg(() => {
      const g = window.game, L = g.level;
      const m = performance.memory;
      const cnt = (o) => (o ? (Array.isArray(o) ? o.length : o.size ?? Object.keys(o).length) : -1);
      return `heap=${(m.usedJSHeapSize / 1e6).toFixed(0)}MB lights=${L.lights.length} dyn=${L.dynamics.length} timers=${L.timers.length} commons=${g.infected.commons.length} corpses=${cnt(g.infected.corpses)} specials=${g.infected.specials.length} fires=${g.combat.fires.length} proj=${g.combat.projectiles.length} props=${g.props.props.length} colDyn=${L.col.dynamic.length} sceneKids=${g.scene.children.length} levelKids=${L.root.children.length}`;
    });
    const pm = await cdp.send('Performance.getMetrics').catch(() => null);
    const jsh = pm ? pm.metrics.find((m) => m.name === 'JSHeapTotalSize')?.value : 0;
    console.log(label, r, 'jsTotal=' + (jsh / 1e6).toFixed(0) + 'MB');
  };
  await cdp.send('Performance.enable');
  await probe('loaded');
  await evalg(() => { const g = window.game; g.cheats.god = true; window.session.menu.clear(); g.player.teleport(109.0, 0.45, 93.0, 0.3); g.survivors.forEach((s, i) => { if (s !== g.player) s.teleport(104.5 + i * 0.5, 0, 89.5, Math.PI); }); g.advance(1); g.level.lift.ctrl.onUse(g.player); });
  for (let i = 0; i < 16; i++) {
    await evalg(() => window.game.advance(4));
    await probe('t' + (i + 1) * 4);
  }
};
