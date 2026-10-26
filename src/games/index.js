// Video game framework: a registry of canvas minigames plus the full-screen
// launcher used by consoles, the PC, handhelds, arcade cabinets and VR.
//
// defineGame({ id, title, genre, desc, color, icon, platforms: ['console','pc','handheld','arcade','vr','tabletop'],
//   create(api) -> { update(dt, input), draw(ctx, w, h), destroy?() } })
//
// api: { w, h, ctx, canvas, score, addScore(n), setScore(n), gameOver(), sfx(name, opts), best, rand(a,b), time,
//        music(station) }   — the game reads `input` each frame:
// input: { left, right, up, down, a (Space/Z/Enter), b (X/Shift), pressed: Set<'left'|'right'|'up'|'down'|'a'|'b'>,
//          mouse: { x, y, down, clicked } (canvas coords), keys: Set<KeyboardEvent.code>, typed: [chars this frame] }
import { G } from '../game.js';
import { el, fmtMoney, clamp } from '../core/utils.js';
import { MusicPlayer } from '../core/music.js';
import { addXP } from '../progression/progress.js';

export const GAMES = {};
export function defineGame(def) { GAMES[def.id] = { platforms: ['console', 'pc', 'handheld', 'arcade', 'vr', 'tabletop'], ...def }; }

const W = 640, H = 400;
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'a', KeyZ: 'a', Enter: 'a', KeyJ: 'a', KeyX: 'b', ShiftLeft: 'b', KeyK: 'b',
};

export class GameLauncher {
  constructor() {
    this.active = null;
    this.canvas = null;
    this.keys = new Set();
    this.pressed = new Set();
    this.typed = [];
    this.mouse = { x: 0, y: 0, down: false, clicked: false };
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.quit(); return; }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) { const k = KEYMAP[e.code]; if (k) this.pressed.add(k); }
      this.keys.add(e.code);
      if (e.key.length === 1) this.typed.push(e.key);
      else if (e.key === 'Backspace') this.typed.push('\b');
      e.stopImmediatePropagation();
    }, true);
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
  }

  library(platform) {
    const owned = new Set(G.state.games);
    return Object.values(GAMES).filter((g) => !g.hidden && (owned.has(g.id) || g.free) && (!platform || g.platforms.includes(platform)));
  }

  launch(id, { source = null, arcade = false, vr = false } = {}) {
    const def = GAMES[id];
    if (!def) { G.ui.toast('That game isn\'t installed (yet!)', { kind: 'bad', icon: '🎮' }); return; }
    if (this.active) this.quit(true);
    G.input.unlock();
    G.phone?.close?.();
    const streaming = this.canStream() && G.state.flags.streaming;
    const frame = el('div', { class: 'game-frame' + (vr ? ' vr' : '') + (arcade ? ' arcade' : '') });
    const canvas = el('canvas', { width: W, height: H, class: 'game-canvas' });
    const hud = el('div', { class: 'game-hud' },
      el('div', { class: 'gh-title' }, `${def.icon || '🎮'} ${def.title}`),
      el('div', { class: 'gh-score' }, 'Score 0'),
      el('div', { class: 'gh-best' }, `Best ${G.state.flags.highscores?.[id] || 0}`),
      streaming ? el('div', { class: 'gh-live' }, '● LIVE') : null,
      el('div', { class: 'gh-esc' }, 'Esc to quit'),
    );
    const help = el('div', { class: 'game-help' }, def.help || 'Arrows / WASD to move · Space to act');
    const chat = streaming ? el('div', { class: 'game-chat' }) : null;
    frame.append(hud, el('div', { class: 'game-screen' }, canvas, chat), help);
    document.getElementById('ui').appendChild(frame);
    requestAnimationFrame(() => frame.classList.add('in'));
    canvas.addEventListener('mousemove', (e) => { const r = canvas.getBoundingClientRect(); this.mouse.x = (e.clientX - r.left) / r.width * W; this.mouse.y = (e.clientY - r.top) / r.height * H; });
    canvas.addEventListener('mousedown', () => { this.mouse.down = true; this.mouse.clicked = true; });
    // one shared listener (re-adding the same function is a no-op)
    this._onMouseUp ||= () => { this.mouse.down = false; };
    window.addEventListener('mouseup', this._onMouseUp);
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    const self = this;
    const api = {
      w: W, h: H, ctx, canvas, score: 0, time: 0, best: G.state.flags.highscores?.[id] || 0,
      addScore(n) { api.score += n; },
      setScore(n) { api.score = n; },
      // a late timer from a game that was already quit must not end the next one
      gameOver() { if (self.active?.api === api) self.finish(); },
      sfx(name, opts = {}) { G.audio.play(name, opts); },
      rand: (a = 0, b = 1) => a + Math.random() * (b - a),
      music(station) { self.music?.stop(); self.music = new MusicPlayer({ station, volume: 0.4 }); self.music.start(); },
    };
    let inst;
    try { inst = def.create(api); } catch (e) { console.error(e); G.ui.toast('Game crashed on launch :(', { kind: 'bad' }); frame.remove(); return; }
    this.active = { id, def, api, inst, frame, hud, chat, source, streaming, t: 0, over: false, chatT: 0 };
    G.state.stats.gamesPlayed++;
    G.audio.play('powerup');
    G.events.emit('gameStart', id);
    this.off = G.engine.onUpdate((dt) => this.tick(dt), 50);
  }

  canStream() {
    const has = (t) => G.items.owned().some((i) => i.def.tags.includes(t));
    return has('webcam') && has('microphone');
  }

  tick(dt) {
    const a = this.active;
    if (!a) return;
    a.t += dt; a.api.time = a.t;
    const input = {
      left: this.keys.has('ArrowLeft') || this.keys.has('KeyA'), right: this.keys.has('ArrowRight') || this.keys.has('KeyD'),
      up: this.keys.has('ArrowUp') || this.keys.has('KeyW'), down: this.keys.has('ArrowDown') || this.keys.has('KeyS'),
      a: this.keys.has('Space') || this.keys.has('KeyZ') || this.keys.has('Enter') || this.keys.has('KeyJ'), b: this.keys.has('KeyX') || this.keys.has('ShiftLeft') || this.keys.has('KeyK'),
      pressed: this.pressed, mouse: this.mouse, keys: this.keys, typed: this.typed,
    };
    if (!a.over) {
      try { a.inst.update(Math.min(dt, 0.05), input); a.inst.draw(a.api.ctx, W, H); } catch (e) { console.error('game error', e); this.finish(); }
    }
    this.pressed.clear(); this.typed.length = 0; this.mouse.clicked = false;
    a.hud.querySelector('.gh-score').textContent = `Score ${Math.floor(a.api.score)}`;
    if (a.streaming && !a.over) {
      a.chatT -= dt;
      if (a.chatT <= 0) {
        a.chatT = 1.2 + Math.random() * 2.5;
        const names = ['pixelpanda', 'cozygamer', 'xX_snack_Xx', 'momwatching', 'nightowl88', 'plantdad', 'jules_irl', 'bubbletea4life'];
        const msgs = ['lets gooo', 'W', 'that was clean', 'lol', 'first time here, love the apartment', 'how is the score so high', 'POG', 'chat is this real', 'drop the playlist pls', 'gg'];
        const line = el('div', { class: 'gc-line' }, el('b', {}, names[Math.floor(Math.random() * names.length)] + ': '), msgs[Math.floor(Math.random() * msgs.length)]);
        if (Math.random() < 0.15) { const tip = Math.round((1 + Math.random() * 4) * 100) / 100; line.appendChild(el('span', { class: 'gc-tip' }, ` tipped ${fmtMoney(tip)}!`)); G.wallet.earn(tip, 'Stream tip', { quiet: true }); G.audio.play('coin'); }
        a.chat.appendChild(line);
        while (a.chat.children.length > 9) a.chat.firstChild.remove();
      }
    }
  }

  finish() {
    const a = this.active;
    if (!a || a.over) return;
    a.over = true;
    const score = Math.floor(a.api.score);
    const hs = (G.state.flags.highscores ||= {});
    const best = hs[a.id] || 0;
    const record = score > best;
    if (record) hs[a.id] = score;
    const fun = a.def.gig ? 2 : clamp(6 + a.t * 0.35, 6, 30);
    G.needs.add(a.def.gig ? { fun, energy: -4 } : { fun });
    let earned = 0;
    if (a.streaming) { earned = Math.round(Math.min(150, score * 0.03 + a.t * 0.2) * G.needs.earnMult() * 100) / 100; if (earned > 0) G.wallet.earn(earned, 'Stream revenue', { quiet: true }); }
    addXP(Math.min(50, 5 + Math.floor(score / 100)), 'Game');
    if (a.def.gig) {
      const pay = Math.round(Math.max(0, a.def.pay ? a.def.pay(score) : score * 0.1) * G.needs.earnMult() * 100) / 100;
      earned += pay;
      if (pay > 0) { G.wallet.earn(pay, `WorkHub: ${a.def.title}`, { quiet: true }); G.state.stats.gigs++; G.events.emit('act', 'gig', { game: a.id, pay }); addXP(20, 'Gig done'); }
    } else G.events.emit('act', 'gameOver', { game: a.id, score, record });
    G.audio.play(record ? 'levelup' : 'success');
    const card = el('div', { class: 'game-over' },
      el('div', { class: 'go-k' }, record ? '🏆 NEW HIGH SCORE' : 'GAME OVER'),
      el('div', { class: 'go-s' }, String(score)),
      el('div', { class: 'go-b' }, `Best: ${Math.max(best, score)}`),
      earned ? el('div', { class: 'go-e' }, `${a.def.gig ? 'You earned' : 'Stream earned'} ${fmtMoney(earned)}`) : null,
      el('div', { class: 'go-btns' },
        el('button', { onclick: () => { const id = a.id; const src = a.source; this.quit(true); this.launch(id, { source: src }); } }, 'Play again'),
        el('button', { onclick: () => this.quit() }, 'Quit'),
      ),
    );
    a.frame.querySelector('.game-screen').appendChild(card);
  }

  quit(silent = false) {
    const a = this.active;
    if (!a) return;
    if (!a.over && a.t > 3 && !a.def.gig) { const fun = clamp(4 + a.t * 0.3, 4, 25); G.needs.add({ fun }); G.events.emit('act', 'gameOver', { game: a.id, score: Math.floor(a.api.score) }); }
    try { a.inst.destroy?.(); } catch { /* noop */ }
    this.music?.stop(); this.music = null;
    this.off?.();
    a.frame.classList.remove('in');
    setTimeout(() => a.frame.remove(), 300);
    this.active = null;
    this.keys.clear();
    if (!silent) { G.audio.play('uiBack'); G.ui.relock(); }
  }
}
