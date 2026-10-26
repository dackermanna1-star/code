// The in-game smartphone: home screen, apps, notifications, music & camera.
import * as THREE from 'three';
import { G } from '../game.js';
import { el, fmtMoney } from '../core/utils.js';
import { STORES, STORE_ORDER } from '../shop/stores.js';
import { MusicPlayer } from '../core/music.js';
import { LAYER_AVATAR } from '../core/engine.js';
import { APPS } from './apps/index.js';
import { queueSave } from '../core/state.js';

export const WALLPAPERS = [
  'linear-gradient(160deg,#ff9a8b 0%,#ff6a88 45%,#ff99ac 100%)',
  'linear-gradient(160deg,#4facfe 0%,#00f2fe 100%)',
  'linear-gradient(160deg,#2b5876 0%,#4e4376 100%)',
  'linear-gradient(160deg,#f6d365 0%,#fda085 100%)',
  'linear-gradient(160deg,#0f2027 0%,#203a43 50%,#2c5364 100%)',
  'linear-gradient(160deg,#a8edea 0%,#fed6e3 100%)',
  'linear-gradient(160deg,#c471f5 0%,#fa71cd 100%)',
  'linear-gradient(160deg,#11998e 0%,#38ef7d 100%)',
];

export class Phone {
  constructor() {
    this.open = false;
    this.stack = [];
    this.badges = {};
    this.music = null;
    this.build();
  }

  build() {
    const root = document.getElementById('ui');
    this.el = el('div', { id: 'phone', class: 'hidden' },
      el('div', { class: 'ph-device' },
        el('div', { class: 'ph-notch' }),
        el('div', { class: 'ph-status' }, el('span', { class: 'ph-time' }), el('span', { class: 'ph-icons' }, '📶 🔋')),
        el('div', { class: 'ph-screen' }),
        el('div', { class: 'ph-homebar', onclick: () => this.home() }),
      ),
    );
    this.screen = this.el.querySelector('.ph-screen');
    root.appendChild(this.el);
    this.el.addEventListener('mousedown', (e) => { if (e.target === this.el) this.close(); });
    this.banner = el('div', { id: 'ph-banner' });
    root.appendChild(this.banner);
    this.tick = setInterval(() => { const t = this.el.querySelector('.ph-time'); if (t && G.clock) t.textContent = G.clock.fmt(undefined, false); }, 500);
  }

  toggle() { this.open ? this.close() : this.show(); }
  show(appId = null, arg = null) {
    if (G.games?.active || G.computer?.open) return;
    G.ui.closeModal(true);
    this.open = true;
    G.input.unlock();
    this.el.classList.remove('hidden');
    requestAnimationFrame(() => this.el.classList.add('in'));
    this.el.querySelector('.ph-device').style.setProperty('--wall', WALLPAPERS[G.state.phone.wallpaper % WALLPAPERS.length]);
    G.audio.play('ui');
    if (appId) this.openApp(appId, arg); else if (!this.stack.length) this.home(); else this.render();
    G.events.emit('phone', true);
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove('in');
    setTimeout(() => { if (!this.open) this.el.classList.add('hidden'); }, 250);
    G.audio.play('uiBack');
    G.ui.relock();
    G.events.emit('phone', false);
    queueSave();
  }

  home() { this.stack = []; this.render(); }
  openApp(id, arg = null) {
    const app = APPS[id] || (STORES[id] ? APPS.store : null);
    if (!app) return;
    if (STORES[id] && STORES[id].unlock > G.state.level) { G.ui.toast(`${STORES[id].name} unlocks at level ${STORES[id].unlock}`, { icon: '🔒', kind: 'bad' }); G.audio.play('error'); return; }
    this.badges[id] = 0;
    this.stack = [{ id, arg: STORES[id] ? { store: id, ...(arg || {}) } : arg }];
    G.audio.play('click');
    this.render();
  }
  push(id, arg) { this.stack.push({ id, arg }); G.audio.play('click'); this.render(); }
  back() { if (this.stack.length > 1) { this.stack.pop(); G.audio.play('uiBack'); this.render(); } else this.home(); }
  refresh() { if (this.open) this.render(true); }

  render(keepScroll = false) {
    const prevScroll = keepScroll ? this.screen.querySelector('.app-body')?.scrollTop : 0;
    this.screen.innerHTML = '';
    if (!this.stack.length) { this.renderHome(); return; }
    const top = this.stack[this.stack.length - 1];
    const app = APPS[top.id] || APPS.store;
    const wrap = el('div', { class: 'app' });
    this.screen.appendChild(wrap);
    try { app.render(wrap, { phone: this, arg: top.arg || {}, desktop: false, back: () => this.back(), push: (id, a) => this.push(id, a), refresh: () => this.refresh() }); }
    catch (e) { console.error(e); wrap.appendChild(el('div', { class: 'empty' }, 'App crashed 😵')); }
    if (keepScroll) { const b = this.screen.querySelector('.app-body'); if (b) b.scrollTop = prevScroll; }
  }

  renderHome() {
    const lv = G.state.level;
    const grid = el('div', { class: 'ph-grid' });
    const icon = (id, label, glyph, bg, locked = false, sub = '') => {
      const b = el('button', { class: 'ph-app' + (locked ? ' locked' : ''), onclick: () => this.openApp(id) },
        el('div', { class: 'ph-ico', style: { background: bg } }, glyph, locked ? el('span', { class: 'lock' }, '🔒') : null, this.badges[id] ? el('span', { class: 'badge' }, String(this.badges[id])) : null),
        el('div', { class: 'ph-lbl' }, label), sub ? el('div', { class: 'ph-sub' }, sub) : null);
      grid.appendChild(b);
    };
    for (const id of STORE_ORDER) {
      const s = STORES[id];
      icon(id, s.name, s.logo, `linear-gradient(145deg, ${s.color}, ${shade(s.color, 0.7)})`, s.unlock > lv, s.unlock > lv ? `Lv ${s.unlock}` : '');
    }
    const sys = [['orders', 'Orders', '🚚', '#ff9f1c'], ['messages', 'Messages', '💬', '#34c759'], ['wallet', 'Wallet', '💳', '#1c1c1e'], ['goals', 'Goals', '🏆', '#ff2d55'], ['home', 'Home', '🏠', '#ff9500'], ['music', 'Music', '🎵', '#fc3c44'], ['weather', 'Weather', '🌤️', '#4facfe'], ['storage', 'Storage', '📦', '#8e8e93'], ['collection', 'Collection', '🗂️', '#5856d6'], ['camera', 'Camera', '📷', '#3a3a3c'], ['photos', 'Photos', '🖼️', '#ffcc00'], ['gigs', 'Gigs', '💼', '#0a84ff'], ['settings', 'Settings', '⚙️', '#636366']];
    for (const [id, label, glyph, bg] of sys) icon(id, label, glyph, bg);
    const unread = G.state.messages.unread || 0;
    if (unread) this.badges.messages = unread;
    const orders = G.orders.active().length;
    const head = el('div', { class: 'ph-homehead' },
      el('div', { class: 'ph-bigtime' }, G.clock.fmt()),
      el('div', { class: 'ph-date' }, `${G.clock.dayName}, Day ${G.clock.day} · ${G.weather.info.icon} ${G.weather.info.label}`),
      el('div', { class: 'ph-widgets' },
        el('div', { class: 'ph-widget', onclick: () => this.openApp('wallet') }, el('div', { class: 'w-k' }, 'Balance'), el('div', { class: 'w-v' }, fmtMoney(G.state.money))),
        el('div', { class: 'ph-widget', onclick: () => this.openApp('orders') }, el('div', { class: 'w-k' }, 'Deliveries'), el('div', { class: 'w-v' }, orders ? `${orders} on the way` : 'None')),
      ),
    );
    this.screen.append(el('div', { class: 'ph-home' }, head, grid));
  }

  // ------------------------------------------------------------ notifications
  notify({ app = null, title, body = '', quiet = false }) {
    const s = STORES[app];
    const icon = s ? s.logo : app === 'messages' ? '💬' : '🔔';
    if (app) this.badges[app] = (this.badges[app] || 0) + 1;
    if (!quiet) G.audio.play(app === 'messages' ? 'message' : 'notify');
    const n = el('div', { class: 'banner', onclick: () => { this.show(app); n.remove(); } }, el('div', { class: 'b-ico', style: { background: s ? s.color : '#333' } }, icon), el('div', { class: 'b-txt' }, el('div', { class: 'b-t' }, title), body ? el('div', { class: 'b-b' }, body) : null));
    this.banner.appendChild(n);
    while (this.banner.children.length > 3) this.banner.firstChild.remove();
    requestAnimationFrame(() => n.classList.add('in'));
    setTimeout(() => { n.classList.remove('in'); setTimeout(() => n.remove(), 400); }, 4500);
    if (this.open && !this.stack.length) this.render();
  }

  // ------------------------------------------------------------ music through the phone speaker
  toggleMusic(station = null) {
    if (this.music?.playing && !station) { this.music.stop(); G.state.phone.music.playing = false; return; }
    if (!this.music) this.music = new MusicPlayer({ station: station || G.state.phone.music.station, volume: 0.45 });
    if (station) { G.state.phone.music.station = station; this.music.setStation(station); }
    if (!this.music.playing) this.music.start();
    G.state.phone.music.playing = true;
    G.events.emit('act', 'music', { station: this.music.station });
  }
  stopMusic() { if (this.music?.playing) { this.music.stop(); G.state.phone.music.playing = false; } }

  // ------------------------------------------------------------ photos
  capturePhoto(filter = null, selfie = false) {
    const eng = G.engine;
    const cam = G.camera;
    const saved = { pos: cam.position.clone(), quat: cam.quaternion.clone(), layers: cam.layers.mask };
    G.hand.hidden = true; G.hand.anchor.visible = false;
    if (selfie) {
      const p = G.player;
      const f = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      const head = new THREE.Vector3(p.camPos.x, p.camPos.y - 0.02, p.camPos.z);
      cam.position.copy(head).addScaledVector(f, 0.95).add(new THREE.Vector3(0, 0.08, 0));
      cam.lookAt(head.clone().add(new THREE.Vector3(0, -0.12, 0)));
      cam.layers.enable(LAYER_AVATAR);
      G.avatar.pose = 'peace'; G.avatar.update(0);
    }
    cam.updateMatrixWorld(true);
    eng.setOutline([]);
    eng.composer.render(0);
    const src = eng.renderer.domElement;
    const c = document.createElement('canvas');
    const W = 480, H = Math.round(480 * src.height / src.width);
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    if (filter === 'vintage') ctx.filter = 'sepia(0.5) contrast(1.1) saturate(0.8)';
    else if (filter === 'noir') ctx.filter = 'grayscale(1) contrast(1.2)';
    else if (filter === 'vivid') ctx.filter = 'saturate(1.5) contrast(1.05)';
    ctx.drawImage(src, 0, 0, W, H);
    const url = c.toDataURL('image/jpeg', 0.82);
    cam.position.copy(saved.pos); cam.quaternion.copy(saved.quat); cam.layers.mask = saved.layers;
    G.hand.hidden = false;
    if (selfie) setTimeout(() => (G.avatar.pose = 'idle'), 600);
    const photos = G.state.photos;
    photos.unshift({ url, day: G.clock.day, time: G.clock.fmt(), selfie });
    if (photos.length > 24) photos.length = 24;
    G.ui.toast('Photo saved to Photos', { icon: '📸' });
    G.events.emit('act', selfie ? 'selfie' : 'photo');
    queueSave();
    return url;
  }
  mirrorSelfie() {
    G.audio.play('shutter'); G.ui.flash();
    setTimeout(() => this.capturePhoto(null, true), 50);
  }
}

function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }
export { shade };
