// Chapter 4 visual tour. env SPOTS=a,b (index range) to limit.
export const SPOTS = [
  ['a01_safe_cctv', 74.5, 0, 55, -Math.PI / 2, -0.05], ['a02_safe_door', 79, 0, 56, Math.PI / 2, -0.05], ['a03_lobby_from_safe', 70, 0, 55.4, 1.3, 0.05],
  ['a04_lobby_north', 54, 0, 57, 0, 0.18], ['a05_lobby_wide', 38.5, 0, 57.5, -0.75, 0.12], ['a06_er_west', 34, 0, 45.5, Math.PI / 2, -0.05],
  ['a07_er_bays', 20, 0, 46, 0.2, -0.05], ['a08_f1corr', 1.8, 0, 28.5, 0, -0.03], ['a09_stairA', 1.9, 0, 8.4, 0, 0.1],
  ['b01_f2corr', 7.5, 4, 10.6, -Math.PI / 2, -0.03], ['b02_f2block', 18.8, 4, 10.6, -Math.PI / 2, -0.03], ['b03_f2room', 19.5, 4, 17, -Math.PI / 2, -0.05],
  ['b04_hub', 41, 4, 10.6, -Math.PI / 2, -0.05], ['b05_balcony', 44, 4, 32.5, -2.3, -0.3], ['b06_icu', 74, 4, 42.4, -Math.PI / 2, -0.03],
  ['c01_or', 91.3, 8, 41, 0.96, -0.12], ['c02_f3north', 62, 8, 13.6, Math.PI / 2, -0.03], ['c03_pharmacy', 70.5, 8, 16.2, Math.PI, -0.1],
  ['c04_isolation', 52, 8, 11.2, 0, -0.1], ['c05_maint', 41, 8, 10.5, Math.PI / 2, -0.05],
  ['d01_admin', 9, 12, 13.6, -Math.PI / 2, -0.03], ['d02_farm', 15, 12, 31, -1.2, -0.05], ['d03_elev_lobby', 54, 12, 35, 0, 0.02], ['d04_elev_from_w', 38.5, 12, 32.4, -Math.PI / 2, 0],
  ['e01_car_top', 54, 108, 21.2, Math.PI, 0], ['e02_f28_south', 54, 108, 28.5, Math.PI, -0.02], ['e03_f28_edge', 50, 108, 39.5, Math.PI, -0.3], ['e04_f28_east', 64, 108, 27, -Math.PI / 2, -0.05],
  ['e05_scaffold', 77.3, 108, 29, 0, -0.05], ['e06_scaffold_out', 77.3, 108, 17, -Math.PI / 2 + 0.3, -0.35], ['e07_ne_room', 74, 108, 15, Math.PI / 2 + 0.3, -0.05],
  ['e08_f29_ledge', 61.5, 112, 25, Math.PI / 2, -0.05], ['e09_f29_view', 45, 112, 25.4, -2.6, -0.35], ['e10_endsafe', 41, 112, 7, Math.PI / 2, -0.05],
];
import { boot, snap } from './ch4_util.mjs';
export default async ({ page, shot, evalg, wait }) => {
  await boot(page, evalg, wait);
  await evalg(() => { const g = window.game; g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.god = true; window.session.menu.clear(); g.hud.title.style.display = 'none'; g.hud.subs.style.display = 'none'; g.advance(1, 1 / 20); });
  const [a, b] = (process.env.SPOTS || '0,99').split(',').map(Number);
  for (const [name, x, y, z, yaw, pitch] of SPOTS.slice(a, b + 1)) {
    await evalg(([x, y, z, yaw, pitch, top]) => {
      const g = window.game;
      if (top && !g._ch4top) { g._ch4top = true; g.level.ch4.S.onTop(); }
      g.player.teleport(x, y, z, yaw); g.player.pitch = pitch; g.advance(0.3); g.player.pitch = pitch;
    }, [x, y, z, yaw, pitch, y > 100]);
    const ms = await snap(page, evalg, wait, shot, name); console.log('render ms', name, ms);
  }
  console.log(JSON.stringify(await evalg(() => ({ fps: window.game.fps, calls: window.game.renderer.r.info.render.calls, tris: window.game.renderer.r.info.render.triangles }))));
};
