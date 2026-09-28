// Crescendo visuals: west breach, vents, car arrival; and plenum drop check.
import { boot, snap } from './ch4_util.mjs';
export default async ({ page, shot, evalg, wait }) => {
  await boot(page, evalg, wait);
  await evalg(() => { const g = window.game; g.cheats.godAll = true; g.cheats.botsIdle = true; window.session.menu.clear(); g.hud.title.style.display = 'none';
    g.survivors.forEach((s, i) => s.teleport(60 + i, 12.05, 34.5, 0));
    g.player.teleport(52, 12.05, 30, Math.PI / 2 + 0.35); g.player.pitch = 0; g.advance(0.5, 1 / 30);
    const E = g.level.ch4.E; E.callBtn.onUse(g.player); E.t = 12.5; g.advance(1, 1 / 30); });
  // west wall bashing -> breach
  const r1 = await evalg(() => { const g = window.game, E = g.level.ch4.E; g.advance(5.5, 1 / 30); g.player.pitch = -0.05;
    return { t: E.t.toFixed(1), bw: g.level.ch4.S.breachW.broken, near: g.infected.commons.filter((c) => c.pos.x < 44 && c.pos.z < 30).length, breaking: g.infected.commons.filter((c) => c.state === 6).length }; });
  console.log('breachW', JSON.stringify(r1));
  await snap(page, evalg, wait, shot, 'ch4_v_breachW');
  // vents
  const r2 = await evalg(() => { const g = window.game, E = g.level.ch4.E; g.infected.cullFar(0); E.t = 53.3; E.ev.bangE = E.ev.be = true; g.level.ch4.S.breachE.breach();
    g.player.teleport(52.5, 12.05, 36.5, 0.5); g.player.pitch = 0.75; g.advance(0.4, 1 / 30);
    const a = g.infected.commons.filter((c) => c.pos.y > 14).length; g.advance(0.5, 1 / 30);
    return { vents: g.level.ch4.S.vents.map((v) => v.open).join(','), plenumAfter04: a, plenumNow: g.infected.commons.filter((c) => c.pos.y > 14).length, falling: g.infected.commons.filter((c) => c.falling).length, total: g.infected.commons.length }; });
  console.log('vents', JSON.stringify(r2));
  await snap(page, evalg, wait, shot, 'ch4_v_vents');
  const r3 = await evalg(() => { const g = window.game; g.advance(3, 1 / 30); return { plenum: g.infected.commons.filter((c) => c.pos.y > 14).length, floor: g.infected.commons.filter((c) => c.pos.y < 13).length }; });
  console.log('vents+3s', JSON.stringify(r3));
  // arrival
  await evalg(() => { const g = window.game, E = g.level.ch4.E; g.director.enabled = false; g.infected.cullFar(0); E.t = 75.9; g.advance(2.5, 1 / 30); g.player.teleport(54, 12.05, 29.5, 0); g.player.pitch = 0; g.advance(0.2, 1 / 30); });
  await snap(page, evalg, wait, shot, 'ch4_v_arrive');
  await evalg(() => { const g = window.game; g.player.teleport(54, 12.05, 21.4, Math.PI); g.player.pitch = 0.05; g.advance(0.2, 1 / 30); });
  await snap(page, evalg, wait, shot, 'ch4_v_carinside');
};
