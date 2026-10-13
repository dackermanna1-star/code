// Zombie survival console cheats (sv_cheats 1, like god): jump to a wave, call in a special
// or a boss, skip ahead, make the whole squad invulnerable. For tuning and screenshot tests.
//   zm_wave <n>                   start wave n now (whatever is up goes away, uncounted)
//   zm_special <kind> [near]      a special now (outside the wave's count); near: close to you
//   zm_boss <0-4 | id>            a boss now (5+: the next round of bosses, tougher)
//   zm_skip                       end the break now, or clear the wave now (bonus and all)
//   zm_god_squad                  godmode for you and every bot teammate (toggle)
//   zm_status                     difficulty, wave and horde numbers (no cheats needed)
// Every cheat but zm_status taints the run (ZombieMode.taint): it can't set a record.
import { TEAM_CT } from './player.js';
import { SPECIALS } from './specials.js';
import { BOSSES } from './bosses.js';

export const ZM_COMMANDS = ['zm_wave', 'zm_special', 'zm_boss', 'zm_skip', 'zm_god_squad', 'zm_status'];
export const ZM_FREE = new Set(['zm_status']); // (no sv_cheats needed)

/** Run one; returns the line to print. */
export function zombieCheat(g, cmd, args = []) {
  const Z = g.zombies;
  if (!Z.enabled) return `${cmd}: zombie survival only`;
  if (cmd === 'zm_status') return status(g);
  if (cmd === 'zm_god_squad') {
    const squad = g.players.filter((p) => p.team === TEAM_CT && !p.isZombie);
    const on = !squad.every((p) => p.god);
    for (const p of squad) p.god = on;
    Z.taint();
    return `squad godmode ${on ? 'ON' : 'OFF'} (${squad.length})`;
  }
  if (Z.state === 'over') return `${cmd}: the run is over (mp_restartgame)`;
  switch (cmd) {
    case 'zm_wave': {
      const n = Math.floor(+args[0]);
      if (!(n >= 1)) return 'usage: zm_wave <n>';
      Z.taint();
      Z.clearHorde();
      Z.startWave(Math.min(n, 999));
      return `wave ${Z.wave}${Z.bossWave ? ' (boss)' : ''}: ${Z.stats.count} zombies, ${Z.stats.health} hp`;
    }
    case 'zm_special': {
      const kind = String(args[0] || '').toLowerCase();
      if (!SPECIALS[kind]) return `usage: zm_special <${Object.keys(SPECIALS).join('|')}> [near]`;
      const me = g.local;
      const near = args[1] === 'near' && me?.alive ? me.pm.origin.slice() : null;
      Z.taint();
      const n = Z.specials.spawn(kind, { extra: true, near });
      return n ? `${SPECIALS[kind].name}${n > 1 ? ` x${n}` : ''} incoming` : `zm_special: no room for a ${kind}`;
    }
    case 'zm_boss': {
      const a = String(args[0] ?? '0').toLowerCase();
      let k = BOSSES.findIndex((b) => b.id === a || b.id === a.replace(/^the_?/, ''));
      if (k < 0) k = Math.floor(+a);
      if (!(k >= 0)) return `usage: zm_boss <0-${BOSSES.length - 1} | ${BOSSES.map((b) => b.id).join('|')}>`;
      Z.taint();
      g.bosses.despawn();
      Z.bossAt = 0;
      if (!g.bosses.spawn((k + 1) * 5, { def: BOSSES[k % BOSSES.length], cycle: Math.floor(k / BOSSES.length) })) return 'zm_boss: no spawn spot found, try again'; // (that boss, whatever the run's order)
      const b = g.bosses.boss;
      return `${b.boss.def.name}: ${Math.round(b.health)} hp`;
    }
    case 'zm_skip': {
      Z.taint();
      if (Z.state === 'break') { Z.startWave(Z.wave + 1); return `wave ${Z.wave}`; }
      // mid-wave: whatever is left goes away and the wave counts as cleared
      Z.clearHorde();
      Z.spawned = Z.killed = Z.stats.count;
      Z.waveCleared();
      return `wave ${Z.wave} cleared`;
    }
    default: return `Unknown command: ${cmd}`;
  }
}

function status(g) {
  const Z = g.zombies, S = Z.stats, d = Z.diff;
  let up = 0;
  for (const z of Z.pool) if (z.alive) up++;
  const opt = [d.hardcore && 'hardcore', !d.squadScaling && 'no squad scaling', `${d.breakLen}s breaks`].filter(Boolean).join(', ');
  return `${d.label} (${opt}) | ${Z.state} wave ${Z.wave} | ${S.count} zombies, ${S.health} hp, claw ${S.damage}, speed ${Math.round(S.speed)}, runners ${Math.round(S.runners * 100)}%, ${S.maxAlive} at once | up ${up}${g.bosses.alive() ? ' + boss' : ''} | kills ${Z.kills} (squad ${Z.squadKills}) | best ${Z.best}`;
}
