// Title / main menu: the zombie mode's title art over the live dusk backdrop (ui/titlescene.js),
// Zombie Survival as the headline entry (with a one-click quick start of the last setup),
// Classic, Options, and Resume / Leave game while a game is up; a "What's new" panel
// (dismissed per update, remembered in localStorage) and the best run.
// Keys: up / down (or W / S) move, Enter picks; Esc is Menus._key's (resume in game).
//
//   const mm = buildMainMenu({ inGame, info, onCommand, sound });  root.appendChild(mm.el); ... mm.destroy();
//   info: { best, bestDiff, quick (text: the last setup) | null, map } (all optional)
import { titleSVG } from './titleart.js';

export const UPDATE_ID = 'zm1'; // bump to show the What's new panel again
const NEWS_KEY = 'cs16-whatsnew-seen';

export const WHATS_NEW = {
  title: 'The Dead of Dust update',
  items: [
    ['Every dollar counts', 'Start with a pistol and earn your arsenal. Buy between waves; Sandbox keeps the old $16000 buy-anything run.'],
    ['Down, not out', 'At zero health you go down. Teammates and bots hold E to pick you up. The run ends when the whole squad falls.'],
    ['Five difficulties, squad scaling', 'Casual to Nightmare. The horde grows with your squad, and late waves keep climbing.'],
    ['Feel every hit', 'Hit markers, headshot pings, kill streaks, and a kill feed that only shows what matters.'],
    ['Bots that follow orders', 'Radio commands work in zombie mode: hold, follow me, fall back.'],
  ],
};

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export function buildMainMenu({ inGame = false, info = {}, onCommand, sound } = {}) {
  const root = el('div', 'mm mm-front fe' + (inGame ? ' ingame' : ''));
  root.appendChild(el('div', 'fe-shade'));
  const click = (n = 'menu_click') => { try { sound?.(n); } catch { /* ignore */ } };

  // title
  const brand = el('div', 'fe-brand');
  brand.append(el('div', 'fe-kicker', 'Counter-Strike 1.6 &middot; browser remake'));
  const title = el('div', 'fe-title', titleSVG('DEAD OF DUST', { id: 'mm' }));
  brand.append(title, el('div', 'fe-sub', 'Zombie survival'));
  root.appendChild(brand);

  // entries
  const menu = el('div', 'fe-menu');
  const entries = [];
  const entry = (label, desc, cmd, { primary = false, tag = null } = {}) => {
    const e = el('div', 'fe-entry' + (primary ? ' primary' : ''));
    e.tabIndex = -1;
    e.dataset.cmd = cmd;
    const t = el('div', 't');
    t.textContent = label;
    if (tag) t.appendChild(el('span', 'tag', tag));
    e.appendChild(t);
    if (desc) e.appendChild(el('div', 'd', desc));
    e.addEventListener('mouseenter', () => focus(entries.indexOf(e), true));
    e.addEventListener('click', () => { click('menu_select'); onCommand?.(cmd); });
    menu.appendChild(e);
    entries.push(e);
    return e;
  };
  if (inGame) entry('Resume', 'Back to the fight', 'resume');
  entry('Zombie Survival', 'Hold out against endless waves with your squad', 'zsetup', { primary: !inGame, tag: inGame ? null : 'New' });
  if (info.quick && !inGame) {
    const q = el('div', 'fe-quick', `<b>Quick start</b> ${escapeHtml(info.quick)}`);
    q.dataset.cmd = 'zquick';
    q.addEventListener('mouseenter', () => focus(entries.indexOf(q), true));
    q.addEventListener('click', () => { click('menu_select'); onCommand?.('zquick'); });
    menu.appendChild(q);
    entries.push(q);
  }
  entry('Classic', 'Bomb defusal and hostage rescue against bots', 'newgame classic');
  entry('Options', 'Controls, video, audio and crosshair', 'options');
  if (inGame) {
    menu.appendChild(el('div', 'fe-gap'));
    entry('Leave game', 'Back to the title screen', 'quit');
  }
  root.appendChild(menu);

  // what's new (or a pill to bring it back)
  const news = el('div', 'fe-news');
  news.append(el('div', 'fe-kicker', "What's new"), el('h3', null, WHATS_NEW.title));
  const ul = el('ul');
  for (const [b, s] of WHATS_NEW.items) ul.appendChild(el('li', null, `<b>${b}</b><span>${s}</span>`));
  news.appendChild(ul);
  const x = el('div', 'x', '&times;');
  x.title = 'Hide';
  news.appendChild(x);
  const pill = el('div', 'fe-news-pill', "What's new");
  const showNews = (on) => { news.hidden = !on; pill.hidden = on; };
  x.addEventListener('click', () => { click(); lsSet(NEWS_KEY, UPDATE_ID); showNews(false); });
  pill.addEventListener('click', () => { click(); showNews(true); });
  showNews(!inGame && lsGet(NEWS_KEY) !== UPDATE_ID);
  root.append(news, pill);

  // best run
  if (info.best > 0) {
    const r = el('div', 'fe-record', `<div class="n">${info.best | 0}</div><div class="l">Best run, waves<br><b>${escapeHtml(info.bestDiff || '')}</b>${info.map ? ' &middot; ' + escapeHtml(info.map) : ''}</div>`);
    root.appendChild(r);
  }

  root.appendChild(el('div', 'fe-foot', '<span><kbd>&uarr;</kbd><kbd>&darr;</kbd> choose &nbsp; <kbd>Enter</kbd> select &nbsp; <kbd>`</kbd> console</span>'
    + '<span>Everything you see and hear is generated in your browser. No original game files.</span>'));

  // keyboard
  let cur = -1;
  function focus(i, fromMouse = false) {
    if (i === cur || i < 0) return;
    if (cur >= 0) entries[cur]?.classList.remove('focus');
    cur = i;
    entries[cur].classList.add('focus');
    if (!fromMouse) click();
  }
  const onKey = (e) => {
    if (!root.isConnected || root.closest('.cs-menus')?.querySelector(':scope > .st-win:not([hidden]):not(.st-loading), :scope > .fe-screen')) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); focus(cur < 0 ? 0 : (cur + 1) % entries.length); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); focus(cur < 0 ? entries.length - 1 : (cur - 1 + entries.length) % entries.length); }
    else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && cur >= 0) { e.preventDefault(); click('menu_select'); onCommand?.(entries[cur].dataset.cmd); }
  };
  window.addEventListener('keydown', onKey);
  return { el: root, destroy: () => window.removeEventListener('keydown', onKey), entries };
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
