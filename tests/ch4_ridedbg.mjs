// Diagnose survivor positions right after the elevator ride.
import { boot } from './ch4_util.mjs';
export default async ({ page, evalg, wait }) => {
  await boot(page, evalg, wait);
  const r = await evalg(() => {
    const g = window.game, E = g.level.ch4.E, col = g.level.col; g.cheats.godAll = true; g.director.enabled = false;
    const out = [];
    const deaths = [];
    for (const s of g.survivors) { const od = s.die.bind(s); s.die = (c) => { deaths.push(s.name + ':' + c + '@' + s.pos.x.toFixed(1) + ',' + s.pos.y.toFixed(1) + ',' + s.pos.z.toFixed(1) + ' t=' + g.time.toFixed(1)); od(c); }; }
    g.survivors.forEach((s, i) => s.teleport(51 + i * 1.5, 12.05, 30, 0));
    g.advance(1, 1 / 30);
    E.callBtn.onUse(g.player); E.t = 75.5; g.advance(1.5, 1 / 30);
    g.player.teleport(54, 12.05, 22.5, 0); g.advance(1, 1 / 30);
    out.push('before ' + g.survivors.map((s) => s.name + ':' + s.pos.x.toFixed(1) + ',' + s.pos.y.toFixed(2) + ',' + s.pos.z.toFixed(1)).join(' '));
    E.closeBtn.onUse(g.player);
    for (let k = 0; k < 14; k++) {
      g.advance(1.5, 1 / 30);
      out.push(E.state.padEnd(8) + ' t=' + E.t.toFixed(1) + ' ' + g.survivors.map((s) => s.name[0] + ':' + s.pos.x.toFixed(1) + ',' + s.pos.y.toFixed(2) + ',' + s.pos.z.toFixed(1) + (s.phys.onGround ? 'g' : 'a') + (s.dead ? 'D' : s.incapped ? 'I' : '')).join(' '));
    }
    const hits = g.survivors.map((s) => { const h = col.raycast(s.pos.x, s.pos.y + 0.5, s.pos.z, 0, -1, 0, 3, 1); return s.name[0] + (h ? ' ground=' + (s.pos.y + 0.5 - h.t).toFixed(2) + ' box=' + h.box : ' none'); });
    out.push(hits.join(' | '));
    out.push('deaths ' + deaths.join(' ; '));
    return out;
  });
  console.log(r.join('\n'));
};
