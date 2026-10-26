// "Lumen OS" — the desktop computer: web shopping, WorkHub freelance gigs,
// Stockpile trading, PC games, music, photos and messages in windows.
import { G } from '../game.js';
import { el, fmtMoney } from '../core/utils.js';
import { STORES, STORE_ORDER } from '../shop/stores.js';
import { APPS } from './apps/index.js';
import { GAMES } from '../games/index.js';
import { WALLPAPERS } from './phone.js';

const DESK_APPS = [
  { id: 'browser', name: 'Browser', icon: '🌐', color: '#4f8cff' },
  { id: 'workhub', name: 'WorkHub', icon: '💼', color: '#14b8a6' },
  { id: 'stockpile', name: 'Stockpile Pro', icon: '📈', color: '#006340' },
  { id: 'games', name: 'Games', icon: '🎮', color: '#7b5cff' },
  { id: 'orders', name: 'Orders', icon: '🚚', color: '#ff9f1c' },
  { id: 'messages', name: 'Messages', icon: '💬', color: '#34c759' },
  { id: 'music', name: 'Music', icon: '🎵', color: '#fc3c44' },
  { id: 'photos', name: 'Photos', icon: '🖼️', color: '#ffcc00' },
  { id: 'home', name: 'Home', icon: '🏠', color: '#ff9500' },
  { id: 'goals', name: 'Goals', icon: '🏆', color: '#ff2d55' },
  { id: 'wallet', name: 'Bank', icon: '🏦', color: '#1c1c1e' },
  { id: 'settings', name: 'Settings', icon: '⚙️', color: '#636366' },
];

export class Computer {
  constructor() {
    this.open = false;
    this.stack = [];
    this.win = null;
  }

  show({ device = null } = {}) {
    if (this._open) return;
    G.phone?.close();
    this._open = true;
    this.open = true;
    this.device = device;
    G.input.unlock();
    const wall = WALLPAPERS[(G.state.phone.wallpaper + 2) % WALLPAPERS.length];
    this.el = el('div', { id: 'computer' },
      el('div', { class: 'pc-screen', style: { background: wall } },
        el('div', { class: 'pc-top' }, el('span', {}, '◉ Lumen OS'), el('span', { class: 'pc-clock' }), el('span', { class: 'pc-money' })),
        el('div', { class: 'pc-desk' }),
        el('div', { class: 'pc-dock' }),
      ),
    );
    document.getElementById('ui').appendChild(this.el);
    requestAnimationFrame(() => this.el.classList.add('in'));
    this.desk = this.el.querySelector('.pc-desk');
    const dock = this.el.querySelector('.pc-dock');
    for (const a of DESK_APPS) {
      const ic = el('button', { class: 'pc-ico', onclick: () => this.launch(a.id) }, el('div', { class: 'pi-g', style: { background: a.color } }, a.icon), el('div', { class: 'pi-n' }, a.name));
      this.desk.appendChild(ic);
      dock.appendChild(el('button', { class: 'pc-dk', title: a.name, style: { background: a.color }, onclick: () => this.launch(a.id) }, a.icon));
    }
    dock.appendChild(el('button', { class: 'pc-dk off', title: 'Log off', onclick: () => this.close() }, '⏻'));
    this.timer = setInterval(() => { this.el.querySelector('.pc-clock').textContent = `${G.clock.dayName} ${G.clock.fmt()}`; this.el.querySelector('.pc-money').textContent = fmtMoney(G.state.money); }, 300);
    this.onKey = (e) => { if (e.code === 'Escape' && !G.games.active && !G.ui.modal) { e.preventDefault(); if (this.win) this.closeWin(); else this.close(); } };
    window.addEventListener('keydown', this.onKey);
    G.audio.play('powerup');
    G.events.emit('act', 'computer');
  }

  close(silent = false) {
    if (!this._open) return;
    this._open = false;
    this.open = false;
    clearInterval(this.timer);
    window.removeEventListener('keydown', this.onKey);
    this.el.classList.remove('in');
    const e = this.el;
    setTimeout(() => e.remove(), 250);
    this.win = null; this.stack = [];
    if (G.player.occ?.label === 'At the computer') G.player.release();
    if (!silent) { G.audio.play('uiBack'); G.ui.relock(); }
  }

  launch(id) {
    G.audio.play('click');
    this.stack = [{ id: id === 'browser' ? 'browser' : id, arg: id === 'stockpile' ? { store: 'stockpile' } : {} }];
    if (id === 'stockpile') this.stack = [{ id: 'store', arg: { store: 'stockpile' } }];
    this.render();
  }
  push(id, arg) { this.stack.push({ id, arg }); this.render(); }
  back() { if (this.stack.length > 1) { this.stack.pop(); this.render(); } else this.closeWin(); }
  closeWin() { this.win?.remove(); this.win = null; this.stack = []; }

  render() {
    this.win?.remove();
    const top = this.stack[this.stack.length - 1];
    const title = top.id === 'store' || top.id === 'product' || top.id === 'cart' ? `${STORES[top.arg.store]?.name || 'Shop'}.com` : DESK_APPS.find((a) => a.id === top.id)?.name || top.id;
    const content = el('div', { class: 'pc-win-body' });
    this.win = el('div', { class: 'pc-win' },
      el('div', { class: 'pc-win-bar' }, el('div', { class: 'dots' }, el('span', { class: 'r', onclick: () => this.closeWin() }), el('span', { class: 'y', onclick: () => this.back() }), el('span', { class: 'g' })), el('div', { class: 'pc-url' }, top.id === 'browser' ? '🔒 shop.lumen' : `🔒 ${title.toLowerCase().replace(/\s/g, '')}`), el('div', {})),
      content,
    );
    this.el.querySelector('.pc-screen').appendChild(this.win);
    const ctx = { desktop: true, arg: top.arg || {}, back: () => this.back(), push: (id, a) => this.push(id, a), refresh: () => this.render(), phone: null };
    try {
      if (top.id === 'browser') this.renderBrowser(content, ctx);
      else if (top.id === 'workhub') this.renderWorkhub(content, ctx);
      else if (top.id === 'games') this.renderGames(content, ctx);
      else (APPS[top.id] || APPS.store).render(content, ctx);
    } catch (e) { console.error(e); content.appendChild(el('div', { class: 'empty' }, 'This page failed to load.')); }
    content.classList.add('app', 'desktop');
  }

  renderBrowser(root, ctx) {
    root.appendChild(el('div', { class: 'web-hero' }, el('div', { class: 'wh-t' }, 'Where do you want to shop today?'), el('div', { class: 'wh-s' }, 'Everything delivered to Unit 2403 in minutes.')));
    const grid = el('div', { class: 'web-grid' });
    for (const id of STORE_ORDER) {
      const s = STORES[id];
      const locked = s.unlock > G.state.level;
      grid.appendChild(el('button', { class: 'web-card' + (locked ? ' locked' : ''), style: { background: `linear-gradient(145deg, ${s.color}, ${s.color2})` }, onclick: () => { if (locked) { G.ui.toast(`${s.name} unlocks at level ${s.unlock}`, { icon: '🔒' }); return; } ctx.push('store', { store: id }); } },
        el('div', { class: 'wc-l' }, s.logo), el('div', { class: 'wc-n' }, s.name), el('div', { class: 'wc-t' }, locked ? `🔒 Level ${s.unlock}` : s.tagline)));
    }
    root.appendChild(grid);
  }

  renderWorkhub(root) {
    const gigs = Object.values(GAMES).filter((g) => g.gig);
    root.appendChild(el('div', { class: 'web-hero teal' }, el('div', { class: 'wh-t' }, '💼 WorkHub'), el('div', { class: 'wh-s' }, `Freelance from your couch. ${G.state.stats.gigs} gigs completed · mood bonus ×${G.needs.earnMult().toFixed(2)}`)));
    const list = el('div', { class: 'gig-list' });
    for (const g of gigs) {
      list.appendChild(el('div', { class: 'gig' }, el('div', { class: 'gg-i', style: { background: g.color || '#14b8a6' } }, g.icon || '💼'), el('div', { class: 'gg-b' }, el('div', { class: 'gg-t' }, g.title), el('div', { class: 'gg-d' }, g.desc || ''), el('div', { class: 'gg-p' }, g.payText || 'Pay based on performance')),
        el('button', { class: 'btn primary', onclick: () => G.games.launch(g.id, { source: this.device }) }, 'Start gig')));
    }
    if (!gigs.length) list.appendChild(el('div', { class: 'empty' }, 'No gigs available right now.'));
    root.appendChild(list);
    root.appendChild(el('div', { class: 'tip' }, 'Tip: being well-rested, caffeinated, inspired or stylish raises your pay.'));
  }

  renderGames(root) {
    const lib = G.games.library('pc');
    root.appendChild(el('div', { class: 'web-hero purple' }, el('div', { class: 'wh-t' }, '🎮 Game Library'), el('div', { class: 'wh-s' }, `${lib.length} games · ${G.games.canStream() ? (G.state.flags.streaming ? '🔴 Streaming ON' : 'Streaming available (Settings)') : 'Buy a webcam + mic to stream for tips'}`)));
    const grid = el('div', { class: 'game-lib' });
    for (const g of lib) grid.appendChild(el('div', { class: 'gl-card', style: { background: `linear-gradient(145deg, ${g.color || '#333'}, #111)` }, onclick: () => G.games.launch(g.id, { source: this.device }) }, el('div', { class: 'gl-ico' }, g.icon || '🎮'), el('div', { class: 'gl-t' }, g.title), el('div', { class: 'gl-g' }, g.genre || ''), el('div', { class: 'gl-b' }, `Best: ${G.state.flags.highscores?.[g.id] || 0}`)));
    if (!lib.length) grid.appendChild(el('div', { class: 'empty' }, 'No games yet.'));
    root.appendChild(grid);
  }
}
