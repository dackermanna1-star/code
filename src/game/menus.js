// DOM menus: title, chapter select, options, pause, loading, stats, credits.
import { canvasFor } from '../engine/textures.js';
import { DIFFICULTY } from './config.js';
import { SURVIVORS } from './characters.js';

const CSS = `
#ui .screen { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #e8e0cc; font-family: "Courier New", monospace; image-rendering: pixelated; }
#ui .bg { background: #0b0a09 center/cover no-repeat; }
#ui .shade { position:absolute; inset:0; background: radial-gradient(ellipse at center, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.85) 80%); pointer-events:none; }
#ui .title { position: relative; font-size: clamp(42px, 9vw, 104px); font-weight: 900; letter-spacing: 0.08em; color: #d8d0b8; text-shadow: 4px 4px 0 #400, 0 0 24px rgba(160,0,0,0.6); line-height: 0.95; text-align:center; }
#ui .title .red { color: #b81a10; }
#ui .subtitle { position: relative; margin-top: 10px; font-size: 14px; letter-spacing: 0.35em; color: #a89880; text-transform: uppercase; }
#ui .menu { position: relative; margin-top: 34px; display: flex; flex-direction: column; gap: 6px; min-width: 300px; }
#ui button.mi { background: rgba(20,16,12,0.7); border: 2px solid #3a2e22; color: #e8e0cc; font: bold 18px "Courier New", monospace; padding: 10px 18px; text-align: left; cursor: pointer; letter-spacing: 0.08em; }
#ui button.mi:hover, #ui button.mi:focus { background: #6a1208; border-color: #b81a10; color: #fff; outline: none; }
#ui button.mi.small { font-size: 14px; padding: 6px 12px; }
#ui .row { display:flex; gap: 8px; align-items: center; }
#ui .panel { position: relative; background: rgba(12,10,8,0.92); border: 2px solid #3a2e22; padding: 22px 28px; max-width: 92vw; max-height: 86vh; overflow: auto; }
#ui h2 { margin: 0 0 14px; font-size: 26px; letter-spacing: 0.1em; color: #e8d8b0; }
#ui .opt { display: grid; grid-template-columns: 220px 220px 60px; gap: 8px; align-items: center; margin: 6px 0; font-size: 15px; }
#ui input[type=range] { width: 210px; accent-color: #b81a10; }
#ui select { background:#1a1410; color:#e8e0cc; border:1px solid #5a4632; font: 15px "Courier New", monospace; padding:3px; }
#ui .chapters { display:grid; grid-template-columns: repeat(4, minmax(150px, 1fr)); gap: 12px; margin: 10px 0 18px; }
#ui .chap { border: 2px solid #3a2e22; background: #15110d; padding: 10px; cursor:pointer; text-align:center; }
#ui .chap:hover { border-color:#b81a10; }
#ui .chap .n { font-size: 34px; font-weight: 900; color:#b81a10; }
#ui .chap .t { font-size: 16px; font-weight: bold; letter-spacing: 0.1em; }
#ui .loading .bar { width: min(520px, 80vw); height: 10px; border: 2px solid #5a4632; margin-top: 18px; }
#ui .loading .bar > div { height: 100%; background: #b81a10; width: 0; }
#ui .loading .msg { margin-top: 8px; font-size: 13px; color: #a89880; letter-spacing: 0.15em; }
#ui .poster { position:relative; text-align:center; }
#ui .poster .camp { font-size: 16px; letter-spacing: 0.4em; color: #a89880; }
#ui .poster .chapname { font-size: clamp(36px, 7vw, 76px); font-weight: 900; letter-spacing: 0.06em; color: #e8e0cc; text-shadow: 3px 3px 0 #400; }
#ui .poster .tag { margin-top: 8px; font-style: italic; color: #c8a878; }
#ui table.stats { border-collapse: collapse; font-size: 15px; margin: 6px 0 16px; }
#ui table.stats td, #ui table.stats th { padding: 5px 14px; border-bottom: 1px solid #2a2218; text-align: right; }
#ui table.stats th:first-child, #ui table.stats td:first-child { text-align: left; }
#ui table.stats th { color: #c8a878; font-size: 13px; letter-spacing: 0.08em; }
#ui .click { margin-top: 22px; font-size: 18px; letter-spacing: 0.25em; animation: blink 1.2s steps(2) infinite; }
#ui .keys { font-size: 14px; line-height: 1.7; columns: 2; column-gap: 40px; }
#ui .keys b { color: #e8c888; display:inline-block; min-width: 110px; }
#ui .note { font-size: 12px; color: #8a7a64; margin-top: 12px; max-width: 640px; }
#ui .credits { text-align:center; font-size: 16px; line-height: 1.9; }
@keyframes blink { 50% { opacity: 0.2; } }
`;

export class Menus {
  constructor(root, game) {
    this.root = root; this.game = game;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.bgUrl = null;
    try {
      const c = canvasFor('skyline', { seed: 7, color: 'rgb(20,16,18)' });
      const sky = canvasFor('sky', { seed: 8, top: 0x1a1418, bottom: 0x8a3a18, cloud: '40,30,28' });
      const comp = document.createElement('canvas'); comp.width = 256; comp.height = 144;
      const ctx = comp.getContext('2d'); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sky, 0, 0, 256, 144); ctx.drawImage(c, 0, 80, 256, 64);
      this.bgUrl = comp.toDataURL();
    } catch (e) { /* ignore */ }
  }
  clear() { this.root.innerHTML = ''; this.onKey = null; }
  screen(cls = '') {
    this.clear();
    const d = document.createElement('div'); d.className = 'screen ' + cls;
    if (cls.includes('bg') && this.bgUrl) d.style.backgroundImage = `url(${this.bgUrl})`;
    if (cls.includes('bg')) { const sh = document.createElement('div'); sh.className = 'shade'; d.appendChild(sh); }
    this.root.appendChild(d);
    return d;
  }
  btn(parent, label, fn, cls = 'mi') {
    const b = document.createElement('button'); b.className = cls; b.textContent = label;
    b.addEventListener('click', (e) => { e.stopPropagation(); this.game.uiSound('ui_click'); fn(); });
    b.addEventListener('mouseenter', () => this.game.uiSound('ui_hover'));
    parent.appendChild(b);
    return b;
  }
  el(parent, tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; parent.appendChild(e); return e; }

  title() {
    const s = this.screen('bg');
    this.el(s, 'div', 'title', 'DEAD<br><span class="red">CENTER</span>');
    this.el(s, 'div', 'subtitle', 'a 32-bit survival horror tribute');
    const m = this.el(s, 'div', 'menu');
    const g = this.game;
    this.btn(m, '▶  PLAY CAMPAIGN', () => g.startCampaign(0));
    this.btn(m, '☰  CHAPTER SELECT', () => this.chapterSelect());
    const diff = this.btn(m, '', () => { const k = Object.keys(DIFFICULTY); const i = (k.indexOf(g.settings.get('difficulty')) + 1) % k.length; g.settings.set('difficulty', k[i]); diff.textContent = '☠  DIFFICULTY: ' + DIFFICULTY[k[i]].name.toUpperCase(); });
    diff.textContent = '☠  DIFFICULTY: ' + DIFFICULTY[g.settings.get('difficulty')].name.toUpperCase();
    this.btn(m, '⚙  OPTIONS', () => this.options(() => this.title()));
    this.btn(m, '⌨  CONTROLS', () => this.controls(() => this.title()));
    this.el(s, 'div', 'note', 'Fan-made, non-commercial tribute. All characters, models, textures, sounds and music are original and procedurally generated.');
    g.audio && g.audio.ready && g.playMenuMusic();
  }

  chapterSelect() {
    const s = this.screen('bg');
    const p = this.el(s, 'div', 'panel');
    this.el(p, 'h2', '', 'DEAD CENTER');
    const grid = this.el(p, 'div', 'chapters');
    this.game.chapters.forEach((c, i) => {
      const d = this.el(grid, 'div', 'chap', `<div class="n">${i + 1}</div><div class="t">${c.name.toUpperCase()}</div><div class="note">${c.blurb || ''}</div>`);
      d.addEventListener('click', () => { this.game.uiSound('ui_click'); this.game.startCampaign(i); });
    });
    this.btn(p, '◀  BACK', () => this.title(), 'mi small');
  }

  options(back) {
    const g = this.game, S = g.settings;
    const s = this.screen(g.world ? '' : 'bg');
    if (g.world) s.style.background = 'rgba(0,0,0,0.75)';
    const p = this.el(s, 'div', 'panel');
    this.el(p, 'h2', '', 'OPTIONS');
    const slider = (label, key, min, max, step, fmt = (v) => v) => {
      const row = this.el(p, 'div', 'opt'); this.el(row, 'div', '', label);
      const r = this.el(row, 'input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = S.get(key);
      const v = this.el(row, 'div', '', fmt(S.get(key)));
      r.addEventListener('input', () => { S.set(key, parseFloat(r.value)); v.textContent = fmt(parseFloat(r.value)); g.applySettings(); });
    };
    const toggle = (label, key) => {
      const row = this.el(p, 'div', 'opt'); this.el(row, 'div', '', label);
      const b = this.btn(row, S.get(key) ? 'ON' : 'OFF', () => { S.set(key, !S.get(key)); b.textContent = S.get(key) ? 'ON' : 'OFF'; g.applySettings(); }, 'mi small');
      this.el(row, 'div', '');
    };
    const select = (label, key, opts) => {
      const row = this.el(p, 'div', 'opt'); this.el(row, 'div', '', label);
      const sel = this.el(row, 'select');
      for (const [v, t] of opts) { const o = this.el(sel, 'option', '', t); o.value = v; if (String(S.get(key)) === String(v)) o.selected = true; }
      sel.addEventListener('change', () => { S.set(key, isNaN(+sel.value) ? sel.value : +sel.value); g.applySettings(); });
      this.el(row, 'div', '');
    };
    select('Internal resolution', 'resolution', [[240, '240p (authentic)'], [360, '360p'], [480, '480p']]);
    toggle('Vertex wobble', 'jitter');
    toggle('Affine textures', 'affine');
    toggle('Dithering / 15-bit colour', 'dither');
    slider('Brightness', 'brightness', 0.7, 1.6, 0.05, (v) => v.toFixed(2));
    slider('Field of view', 'fov', 60, 100, 1);
    slider('Mouse sensitivity', 'sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2));
    toggle('Invert mouse Y', 'invertY');
    toggle('View bob', 'viewBob');
    toggle('Crosshair', 'crosshair');
    slider('Master volume', 'masterVolume', 0, 1, 0.05, (v) => Math.round(v * 100));
    slider('Music volume', 'musicVolume', 0, 1, 0.05, (v) => Math.round(v * 100));
    slider('Effects volume', 'sfxVolume', 0, 1, 0.05, (v) => Math.round(v * 100));
    toggle('Subtitles', 'subtitles');
    toggle('Spoken callouts (TTS)', 'voiceTTS');
    toggle('Show FPS', 'showFps');
    this.btn(p, '◀  BACK', back, 'mi small');
  }

  controls(back) {
    const s = this.screen(this.game.world ? '' : 'bg');
    if (this.game.world) s.style.background = 'rgba(0,0,0,0.75)';
    const p = this.el(s, 'div', 'panel');
    this.el(p, 'h2', '', 'CONTROLS');
    this.el(p, 'div', 'keys', [
      ['W A S D', 'Move'], ['Mouse', 'Look'], ['Left click', 'Fire / use item'], ['Right click', 'Shove / give / heal teammate'],
      ['E', 'Use, pick up, revive (hold)'], ['R', 'Reload'], ['Space', 'Jump'], ['Ctrl / C', 'Crouch'], ['Shift', 'Walk (quiet)'],
      ['F', 'Flashlight'], ['1 - 5', 'Inventory slots'], ['Q', 'Last weapon'], ['Wheel', 'Cycle weapons'], ['Middle click', 'Scope (snipers)'],
      ['G', 'Drop carried item'], ['Esc / P', 'Pause'],
    ].map(([k, v]) => `<div><b>${k}</b>${v}</div>`).join(''));
    this.el(p, 'div', 'note', 'Tips: shove (right click) knocks back commons and frees teammates from Hunters, Smokers and Jockeys. Hold E on a downed teammate to revive them. Crouch to steady your aim. Don\'t startle the Witch — turn your flashlight off and go around.');
    this.btn(p, '◀  BACK', back, 'mi small');
  }

  loading(chapter) {
    const s = this.screen('bg loading');
    const post = this.el(s, 'div', 'poster');
    this.el(post, 'div', 'camp', 'DEAD CENTER — CHAPTER ' + chapter.chapter);
    this.el(post, 'div', 'chapname', chapter.name.toUpperCase());
    this.el(post, 'div', 'tag', chapter.tagline || '');
    const bar = this.el(s, 'div', 'bar'); const fill = this.el(bar, 'div');
    const msg = this.el(s, 'div', 'msg', 'LOADING');
    return { set: (p, m) => { fill.style.width = Math.round(p * 100) + '%'; if (m) msg.textContent = m.toUpperCase(); }, root: s };
  }

  clickToBegin(fn) {
    const s = this.root.querySelector('.screen');
    const c = this.el(s, 'div', 'click', 'CLICK TO BEGIN');
    const go = (e) => { e.preventDefault(); s.removeEventListener('click', go); fn(); };
    s.addEventListener('click', go);
  }

  pause() {
    const g = this.game;
    const s = this.screen('');
    s.style.background = 'rgba(0,0,0,0.65)';
    this.el(s, 'div', 'title', '<span style="font-size:48px">PAUSED</span>');
    const m = this.el(s, 'div', 'menu');
    this.btn(m, '▶  RESUME', () => g.resume());
    this.btn(m, '⚙  OPTIONS', () => this.options(() => this.pause()));
    this.btn(m, '⌨  CONTROLS', () => this.controls(() => this.pause()));
    this.btn(m, '↻  RESTART CHAPTER', () => g.restartChapter());
    this.btn(m, '✖  QUIT TO MENU', () => g.quitToMenu());
  }

  stats(title, world, buttons) {
    const s = this.screen('bg');
    const p = this.el(s, 'div', 'panel');
    this.el(p, 'h2', '', title);
    const t = this.el(p, 'table', 'stats');
    const rows = [['', ...world.survivors.map((x) => x.name.toUpperCase())]];
    const st = (k) => world.survivors.map((x) => Math.round(x.stats[k]));
    rows.push(['Common infected killed', ...st('commons')]);
    rows.push(['Special infected killed', ...st('specials')]);
    rows.push(['Headshots', ...st('headshots')]);
    rows.push(['Damage taken', ...st('dmgTaken')]);
    rows.push(['Friendly fire dealt', ...st('ffDealt')]);
    rows.push(['Incapacitations', ...st('incaps')]);
    rows.push(['Revives / heals', ...world.survivors.map((x) => `${x.stats.revives} / ${x.stats.heals}`)]);
    rows.push(['Teammates protected', ...st('protects')]);
    rows.push(['Accuracy', ...world.survivors.map((x) => x.stats.shots ? Math.round(100 * Math.min(1, x.stats.hits / x.stats.shots)) + '%' : '-')]);
    rows.forEach((r, i) => { const tr = this.el(t, 'tr'); r.forEach((c) => this.el(tr, i ? 'td' : 'th', '', String(c))); });
    const mins = Math.floor(world.stats.time / 60), secs = Math.floor(world.stats.time % 60);
    this.el(p, 'div', '', `Chapter time: ${mins}:${String(secs).padStart(2, '0')} &nbsp; &nbsp; Difficulty: ${DIFFICULTY[world.difficulty].name}`);
    // awards
    const best = (k, label) => { let b = null, bv = 0; for (const x of world.survivors) if (x.stats[k] > bv) { bv = x.stats[k]; b = x; } return b ? `<div>${label}: <b>${b.name}</b> (${Math.round(bv)})</div>` : ''; };
    this.el(p, 'div', 'note', best('commons', 'Most commons killed') + best('specials', 'Most special infected killed') + best('protects', 'Best protector') + best('ffDealt', 'Most friendly fire'));
    const m = this.el(p, 'div', 'row'); m.style.marginTop = '16px';
    for (const [label, fn] of buttons) this.btn(m, label, fn, 'mi small');
  }

  credits(world, onDone) {
    const s = this.screen('bg');
    const c = this.el(s, 'div', 'credits panel');
    c.innerHTML = `<h2>THE SURVIVORS ESCAPED</h2>
      <div>${world.survivors.map((x) => `${x.name} &mdash; ${x.state === 'dead' ? '<span style="color:#e55">did not make it</span>' : 'survived'}`).join('<br>')}</div>
      <br><div class="note">DEAD CENTER &mdash; a PS1-style tribute to the co-op zombie shooters of the late 2000s.<br>
      Engine, levels, characters, textures, sound and music: procedurally generated, original work.<br>Built with three.js.</div>`;
    this.btn(c, 'CONTINUE', onDone, 'mi small');
  }
}
