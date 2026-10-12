// Zombie survival is over: waves survived, a new-best badge, the run's numbers (runstats.js),
// kills per wave as small bars, and Play again / Change setup / Main menu.
// Keys: Enter plays again (Esc closes it: Menus._key, then the main menu).
//
//   const o = buildRunOver(r, { onAgain, onSetup, onMenu });  r as Menus.showZombieOver gets it:
//   { waves, kills, best, newBest, diff (label), stats (runStats), hardcore? }
import { escapeHtml } from './mainmenu.js';

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
const mmss = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '-');

export function buildRunOver(r = {}, { onAgain, onSetup, onMenu, sound } = {}) {
  const click = (n = 'menu_select') => { try { sound?.(n); } catch { /* ignore */ } };
  const root = el('div', 'fe-screen fe fe-over');
  const f = el('div', 'fe-frame');
  root.appendChild(f);
  const waves = r.waves | 0;
  f.appendChild(el('div', 'fe-kicker', 'The squad has fallen'));
  f.appendChild(el('div', 'fe-big', `<div class="n">${waves}</div><div class="l">wave${waves === 1 ? '' : 's'}<br>survived</div>`));
  const badges = el('div', 'fe-badges');
  if (r.newBest) badges.appendChild(el('span', 'fe-badge hot', 'New best'));
  else badges.appendChild(el('span', 'fe-badge', `Best: ${r.best | 0} wave${r.best === 1 ? '' : 's'}`));
  if (r.diff) badges.appendChild(el('span', 'fe-badge red', escapeHtml(r.diff)));
  if (r.hardcore) badges.appendChild(el('span', 'fe-badge red', 'Hardcore'));
  f.appendChild(badges);

  const S = r.stats, M = S?.me;
  const grid = el('div', 'fe-statgrid');
  const stat = (v, k) => grid.appendChild(el('div', 'fe-stat', `<div class="v">${v}</div><div class="k">${k}</div>`));
  stat(r.kills | 0, 'Your kills');
  stat(M ? pct(M.headKills, M.kills) : '-', 'Headshot kills');
  stat(S && M?.shots ? Math.round(S.accuracy() * 100) + '%' : '-', 'Accuracy');
  stat(S ? mmss((S.endT || 0) - (S.startT || 0)) : '-', 'Run time');
  stat(M ? Math.round(M.dealt).toLocaleString('en-US') : '-', 'Damage dealt');
  stat(M ? Math.round(M.taken).toLocaleString('en-US') : '-', 'Damage taken');
  stat(M ? `${M.specials | 0} / ${M.bosses | 0}` : '-', 'Specials / bosses');
  stat(S ? S.squad.kills | 0 : '-', 'Squad kills');
  f.appendChild(grid);

  // kills per wave
  const rows = S?.waves || [];
  if (rows.length > 1) {
    const max = Math.max(1, ...rows.map((w) => w.squadKills || 0));
    const bars = el('div', 'fe-bars');
    for (const w of rows.slice(-30)) {
      const b = el('i');
      b.style.height = Math.max(4, (100 * (w.squadKills || 0)) / max) + '%';
      b.title = `Wave ${w.wave}: ${w.squadKills || 0} kills`;
      bars.appendChild(b);
    }
    f.append(bars, el('div', 'fe-bars-k', 'Squad kills per wave'));
  }

  const act = el('div', 'fe-actions');
  const again = el('button', 'fe-go', 'Play again');
  const setup = el('button', 'fe-btn2', 'Change setup');
  const menu = el('button', 'fe-btn2', 'Main menu');
  again.addEventListener('click', () => { click(); onAgain?.(); });
  setup.addEventListener('click', () => { click(); onSetup?.(); });
  menu.addEventListener('click', () => { click('menu_click'); onMenu?.(); });
  act.append(again, setup, menu);
  f.appendChild(act);
  const onKey = (e) => {
    if (!root.isConnected) { window.removeEventListener('keydown', onKey); return; }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); again.click(); }
  };
  window.addEventListener('keydown', onKey);
  return { el: root, again, setup, menu, destroy: () => window.removeEventListener('keydown', onKey) };
}
