import { boot, snap } from './ch4_util.mjs';
// End-to-end elevator crescendo + ride test (director + bots enabled, survivors godAll).
export default async ({ page, shot, evalg, wait, logs }) => {
  await boot(page, evalg, wait);
  const r0 = await evalg(() => {
    const g = window.game; g.cheats.godAll = true; window.session.menu.clear();
    g.survivors.forEach((s, i) => { s.teleport(50 + i * 1.5, 12.05, 31, 0); s.giveWeapon('rifle'); });
    g.advance(2, 1 / 30);
    const E = g.level.ch4.E;
    E.callBtn.onUse(g.player);
    return { state: E.state, commons: g.infected.commons.length };
  });
  console.log('call', JSON.stringify(r0));
  for (let k = 0; k < 17; k++) {
    const r = await evalg(() => {
      const g = window.game, E = g.level.ch4.E, S = g.level.ch4.S;
      try { g.testCmd = { fire: true }; g.advance(5, 1 / 30); } catch (e) { return { err: e.message + ' ' + e.stack.split('\n').slice(0, 4).join(' | ') }; }
      const inPlen = g.infected.commons.filter((c) => c.pos.y > 14).length;
      return { t: E.t.toFixed(1), st: E.state, floor: S.low.outside.floor, commons: g.infected.commons.length, plenum: inPlen, bw: S.breachW.broken, be: S.breachE.broken, vents: S.vents.map((v) => v.open).join(''), panic: !!g.director.panicState, wave: g.director.panicState?.wave, kills: g.survivors.map((s) => s.stats.kills).join('/'), specials: g.infected.specials.filter((s) => !s.dead).map((s) => s.kind).join(',') };
    });
    console.log(JSON.stringify(r));
    if (r && r.st === 'arrived') break;
    if (k === 3 || k === 11) await snap(page, evalg, wait, shot, 'ch4_cresc_' + k);
  }
  const r2 = await evalg(() => {
    const g = window.game, E = g.level.ch4.E;
    g.player.teleport(54, 12.05, 22.5, 0);
    g.advance(0.5, 1 / 30);
    E.closeBtn.onUse(g.player);
    const st1 = E.state;
    g.advance(3, 1 / 30);
    const st2 = E.state;
    g.advance(4, 1 / 30);
    const mid = { st: E.state, ys: g.survivors.map((s) => s.pos.y.toFixed(1)).join(',') };
    g.advance(12, 1 / 30);
    return { st1, st2, mid, st: E.state, ys: g.survivors.map((s) => s.pos.y.toFixed(1) + '@' + s.pos.x.toFixed(1) + ',' + s.pos.z.toFixed(1)).join(' '), dead: g.survivors.map((s) => s.dead).join(','), commons: g.infected.commons.length, lowCommons: g.infected.commons.filter((c) => c.pos.y < 60).length, upDoors: g.level.ch4.S.up.doors.k, prog: g.survivors.map((s) => g.level.progressAt(s.pos.x, s.pos.y, s.pos.z).toFixed(3)).join(',') };
  });
  console.log('ride', JSON.stringify(r2));
  await snap(page, evalg, wait, shot, 'ch4_top_arrive');
  const r3 = await evalg(() => {
    const g = window.game;
    g.testCmd = null; g.advance(20, 1 / 30);
    return { commons: g.infected.commons.length, lowCommons: g.infected.commons.filter((c) => c.pos.y < 60).length, pos: g.survivors.map((s) => s.pos.x.toFixed(1) + ',' + s.pos.y.toFixed(1) + ',' + s.pos.z.toFixed(1)).join(' '), dir: g.director.state };
  });
  console.log('after', JSON.stringify(r3));
};
