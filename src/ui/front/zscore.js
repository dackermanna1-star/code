// Zombie survival scoreboard (Tab): no T / CT rows, no team scores. The wave and what it's
// doing, the run time, the difficulty and the squad's kills up top, then one row per squad
// member: kills, downs, revives, deaths, cash and status (alive / down / dead).
// SquadTally counts the downs and revives per player from the run's events (downed.js emits
// them), reset when a run starts.
//
//   const tally = new SquadTally(game.zombies.events);   tally.downs(p), tally.revives(p)
//   renderZombieScore(panel, data.zombie)  (main.js scoreData builds it)

export class SquadTally {
  constructor(events) {
    this.d = new Map(); // player -> downs
    this.r = new Map(); // player -> revives given
    if (!events) return;
    events.on('run', (e) => { if (e.phase === 'start') { this.d.clear(); this.r.clear(); } });
    events.on('down', (e) => { if (e.player) this.d.set(e.player, (this.d.get(e.player) || 0) + 1); });
    events.on('revive', (e) => { if (e.by) this.r.set(e.by, (this.r.get(e.by) || 0) + 1); });
  }

  downs(p) { return this.d.get(p) || 0; }
  revives(p) { return this.r.get(p) || 0; }
}

const mmss = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/**
 * z = { wave, state ('break' | 'wave' | 'over'), left, next (s), time (s), diff, hardcore, squadKills,
 *       kills (yours), best, map, players: [{ name, kills, deaths, downs, revives, money, status, isLocal, isBot }] }
 */
export function renderZombieScore(p, z) {
  p.className = 'zs-panel';
  p.textContent = '';
  const head = el('div', 'zs-head');
  const l = el('div');
  const kick = el('div', 'kick', `Dead of Dust · ${z.map || ''}`);
  if (z.hardcore) kick.appendChild(el('span', 'hc', 'Hardcore'));
  l.appendChild(kick);
  const w = el('div', 'wave', z.wave ? `Wave ${z.wave}` : 'Get ready');
  const sub = z.state === 'wave' ? `${z.left} left` : z.state === 'break' ? `next in ${Math.ceil(z.next || 0)} s` : 'run over';
  w.appendChild(el('small', null, sub));
  l.appendChild(w);
  const chips = el('div', 'zs-chips');
  const chip = (v, k) => { const c = el('div', 'zs-chip'); c.append(el('div', 'v', v), el('div', 'k', k)); chips.appendChild(c); };
  chip(mmss(z.time), 'Run time');
  chip(String(z.squadKills ?? 0), 'Squad kills');
  chip(z.diff, 'Difficulty');
  chip(String(z.best ?? 0), 'Best');
  head.append(l, chips);
  p.appendChild(head);

  const table = el('table');
  const cols = el('colgroup');
  for (const cw of ['34%', '10%', '10%', '11%', '10%', '12%', '13%']) { const c = el('col'); c.style.width = cw; cols.appendChild(c); }
  table.appendChild(cols);
  const hr = el('tr');
  for (const h of ['Survivor', 'Kills', 'Downs', 'Revives', 'Deaths', 'Cash', 'Status']) hr.appendChild(el('th', null, h));
  table.appendChild(hr);
  const list = (z.players || []).slice().sort((a, b) => (b.kills - a.kills) || (a.deaths - b.deaths));
  for (const q of list) {
    const r = el('tr', q.isLocal ? 'me' : '');
    const n = el('td', 'name');
    n.appendChild(el('b', null, q.name));
    if (q.isBot) n.appendChild(el('em', null, 'BOT'));
    const s = el('td');
    s.appendChild(el('span', 'zs-st ' + q.status, q.status));
    r.append(n, el('td', null, String(q.kills ?? 0)), el('td', null, String(q.downs ?? 0)), el('td', null, String(q.revives ?? 0)),
      el('td', null, String(q.deaths ?? 0)), el('td', null, '$' + (q.money ?? 0)), s);
    table.appendChild(r);
  }
  p.appendChild(table);
  const foot = el('div', 'zs-foot');
  foot.append(el('span', null, `Your kills: ${z.kills ?? 0}`), el('span', null, 'The run ends when the whole squad is down'));
  p.appendChild(foot);
}
