import { boot, snap } from './ch4_util.mjs';
// Bots follow the human along the whole route (director on, everyone godAll).
// The human is moved in <=5 m steps along the waypoint list; bots must keep up.
import { ROUTE } from './ch4_route.mjs';
export default async ({ page, shot, evalg, wait }) => {
  await boot(page, evalg, wait);
  await evalg(() => { const g = window.game; g.cheats.godAll = true; window.session.menu.clear(); g.player.giveWeapon('autoShotgun'); });
  const pts = ROUTE.filter((p) => p[0] !== 'upperCar');
  let worst = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [name, x0, y0, z0] = pts[i], [, x1, y1, z1] = pts[i + 1];
    if (name === 'lowerCar') {
      const r = await evalg(() => {
        const g = window.game, E = g.level.ch4.E;
        if (E.state === 'idle') E.callBtn.onUse(g.player);
        E.t = 75.5; g.advance(1.5, 1 / 30);
        g.player.teleport(54, 12.05, 22.5, 0); g.advance(1, 1 / 30);
        E.closeBtn.onUse(g.player); g.advance(22, 1 / 30);
        return { st: E.state, ys: g.survivors.map((s) => s.pos.y.toFixed(1)).join(',') };
      });
      console.log('ELEVATOR', JSON.stringify(r));
      continue;
    }
    const d = Math.hypot(x1 - x0, z1 - z0) + Math.abs(y1 - y0) * 2;
    const n = Math.max(1, Math.ceil(d / 4));
    const r = await evalg(([x0, y0, z0, x1, y1, z1, n]) => {
      const g = window.game;
      let far = 0;
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const yaw = Math.atan2(-(x1 - x0), -(z1 - z0));
        g.player.teleport(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + 0.05, z0 + (z1 - z0) * t, yaw);
        g.testCmd = { fire: g.infected.commons.length > 0 };
        g.advance(1.3, 1 / 30);
      }
      g.testCmd = null;
      g.advance(1.5, 1 / 30);
      const p = g.player.pos;
      const ds = g.survivors.slice(1).map((s) => Math.hypot(s.pos.x - p.x, s.pos.z - p.z) + Math.abs(s.pos.y - p.y) * 3);
      far = Math.max(...ds);
      return { far: far.toFixed(1), ds: ds.map((v) => v.toFixed(0)).join('/'), commons: g.infected.commons.length, sp: g.infected.specials.filter((s) => !s.dead).map((s) => s.kind[0]).join(''), hp: g.survivors.map((s) => (s.incapped ? 'I' : '') + Math.round(s.totalHealth)).join('/') };
    }, [x0, y0, z0, x1, y1, z1, n]);
    worst = Math.max(worst, +r.far);
    console.log(pts[i + 1][0].padEnd(12), JSON.stringify(r));
  }
  console.log('worst bot distance', worst.toFixed(1));
  const end = await evalg(() => { const g = window.game; return { session: window.session.state, endDoorOpen: g.level.endDoor.open, inSafe: g.survivors.map((s) => g.level.inBox(g.level.endSafe, s.pos, 0.1)).join(',') }; });
  console.log('END', JSON.stringify(end));
};
