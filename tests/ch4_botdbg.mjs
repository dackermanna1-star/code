// Diagnose bots leaving the start safe room.
import { boot } from './ch4_util.mjs';
export default async ({ page, evalg, wait }) => {
  await boot(page, evalg, wait);
  const r = await evalg(() => {
    const g = window.game; g.director.enabled = false; g.cheats.godAll = true;
    const out = [];
    const snap = (tag) => out.push(tag + ' ' + g.survivors.map((s) => `${s.name}:${s.pos.x.toFixed(1)},${s.pos.z.toFixed(1)} m=${s.brain?.mode} p=${s.brain?.path ? s.brain.path.length + (s.brain.path.partial ? 'P' : '') : '-'} st=${s.brain?.stuckT?.toFixed(1)}`).join(' | ') + ' door=' + g.level.doors.filter((d) => Math.hypot(d.cx - 72, d.cz - 55.4) < 1).map((d) => d.open + '/' + d.angle.toFixed(2)).join(','));
    snap('t0');
    g.player.teleport(66, 0, 55.4, Math.PI / 2); g.advance(3, 1 / 30); snap('t3');
    g.advance(4, 1 / 30); snap('t7');
    g.player.teleport(56, 0, 47, Math.PI / 2); g.advance(5, 1 / 30); snap('t12');
    const nav = g.level.nav; const b = g.survivors[1];
    const path = nav.findPath(b.pos.x, b.pos.y, b.pos.z, 56, 0, 47, 12000);
    out.push('path ' + (path ? path.length + ' partial=' + path.partial + ' last=' + nav.nodeX(path[path.length - 1]).toFixed(1) + ',' + nav.nodeZ(path[path.length - 1]).toFixed(1) : 'null'));
    return out;
  });
  console.log(r.join('\n'));
};
