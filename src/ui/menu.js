// Menu screens (DOM). All callbacks are provided by the session.
import { CHARACTERS, ORDER } from '../entities/characters.js';
import { DIFFICULTY, QUALITY } from '../config.js';
import { defaultRelayUrl } from '../net/link.js';

const escapeHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const h = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };

const TIPS = [
  'Stay together. Special infected hunt survivors who wander off alone.',
  'Shove (Right Mouse) knocks back infected and frees teammates from Hunters and Smokers.',
  'Crouch near a crying Witch, keep your flashlight off her, and walk wide — or be ready to kill her in seconds.',
  'Pain pills give temporary health that slowly wears off. First aid kits heal permanently.',
  'After being revived twice you go black and white. One more fall will kill you — heal up!',
  'Pipe bombs beep and lure the horde. Molotovs set whole crowds ablaze.',
  'Shooting a Boomer up close covers you in bile, which draws the horde. Shove it away first.',
  'The Tank is faster than you walking. Sprint, spread out and keep shooting.',
  'Car alarms and loud machinery attract hordes. Prepare before you set them off.',
  'Watch your fire. Friendly fire hurts your team more on higher difficulties.',
  'Close safe room doors behind the whole team to finish a chapter.',
];

export class Menu {
  constructor(root, session) {
    this.root = root;
    this.s = session;
    this.cur = null;
  }
  clear() { if (this.cur) { this.cur.remove(); this.cur = null; } }
  show(node) { this.clear(); this.cur = node; this.root.appendChild(node); return node; }
  btn(node, sel, fn) { const b = node.querySelector(sel); if (b) b.addEventListener('click', () => { this.s.uiClick(); fn(); }); }

  main() {
    const n = this.show(h(`<div class="menu">
      <h1>THE LAST FOUR<span>NO MERCY</span></h1>
      <div class="sub">A four-player co-op survival horror campaign</div>
      <button id="m-play">Play Campaign</button>
      <button id="m-chapter">Chapter Select</button>
      <button id="m-options">Options</button>
      <button id="m-controls">Controls</button>
      <button id="m-coop">Co-op <small style="opacity:.55;font-size:.55em;letter-spacing:2px">EXPERIMENTAL</small></button>
      <button id="m-about">About</button>
    </div>`));
    this.btn(n, '#m-play', () => this.survivorSelect(0));
    this.btn(n, '#m-chapter', () => this.chapterSelect());
    this.btn(n, '#m-options', () => this.options(() => this.main()));
    this.btn(n, '#m-controls', () => this.controls(() => this.main()));
    this.btn(n, '#m-coop', () => this.coop());
    this.btn(n, '#m-about', () => this.about());
  }
  survivorSelect(chapter) {
    const st = this.s.settings;
    const n = this.show(h(`<div class="menu">
      <h2>CHOOSE YOUR SURVIVOR</h2>
      <div class="cards">${ORDER.map((id) => {
        const c = CHARACTERS[id];
        return `<div class="card ${st.character === id ? 'sel' : ''}" data-id="${id}"><div class="cname" style="color:${c.color}">${c.name}</div><div class="cbio">${c.bio}</div><canvas width="190" height="150" data-sil="${id}"></canvas></div>`;
      }).join('')}</div>
      <h2 style="font-size:26px">DIFFICULTY</h2>
      <div class="diffs">${Object.entries(DIFFICULTY).map(([k, d]) => `<button class="btn ${st.difficulty === k ? 'sel' : ''}" data-d="${k}">${d.name}</button>`).join('')}</div>
      <button id="m-start">Start ${chapter > 0 ? 'Chapter ' + (chapter + 1) : 'Campaign'}</button>
      <button id="m-back">Back</button>
    </div>`));
    n.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => {
      this.s.uiClick();
      st.character = c.dataset.id;
      n.querySelectorAll('.card').forEach((x) => x.classList.toggle('sel', x === c));
      this.s.saveSettings();
    }));
    n.querySelectorAll('.diffs .btn').forEach((b) => b.addEventListener('click', () => {
      this.s.uiClick();
      st.difficulty = b.dataset.d;
      n.querySelectorAll('.diffs .btn').forEach((x) => x.classList.toggle('sel', x === b));
      this.s.saveSettings();
    }));
    n.querySelectorAll('canvas[data-sil]').forEach((cv) => drawSilhouette(cv, cv.dataset.sil));
    this.btn(n, '#m-start', () => this.s.startCampaign(chapter));
    this.btn(n, '#m-back', () => this.main());
  }
  chapterSelect() {
    const ch = this.s.chapters;
    const n = this.show(h(`<div class="menu">
      <h2>NO MERCY</h2>
      <div class="chapters">${ch.map((c, i) => `<button data-i="${i}">${i + 1}. ${c.title}</button>`).join('')}</div>
      <button id="m-back" style="margin-top:22px">Back</button>
    </div>`));
    n.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { this.s.uiClick(); this.survivorSelect(+b.dataset.i); }));
    this.btn(n, '#m-back', () => this.main());
  }
  options(back) {
    const st = this.s.settings;
    const n = this.show(h(`<div class="menu">
      <h2>OPTIONS</h2>
      <div class="row"><label>Mouse sensitivity</label><input type="range" min="0.2" max="3" step="0.05" id="o-sens" value="${st.sensitivity}"><span id="o-sens-v">${st.sensitivity}</span></div>
      <div class="row"><label>Invert mouse Y</label><input type="checkbox" id="o-inv" ${st.invertY ? 'checked' : ''}></div>
      <div class="row"><label>Field of view</label><input type="range" min="65" max="100" step="1" id="o-fov" value="${st.fov}"><span id="o-fov-v">${st.fov}</span></div>
      <div class="row"><label>Master volume</label><input type="range" min="0" max="1" step="0.05" id="o-master" value="${st.master}"></div>
      <div class="row"><label>Effects volume</label><input type="range" min="0" max="1" step="0.05" id="o-sfx" value="${st.sfx}"></div>
      <div class="row"><label>Music volume</label><input type="range" min="0" max="1" step="0.05" id="o-music" value="${st.music}"></div>
      <div class="row"><label>Voice volume</label><input type="range" min="0" max="1" step="0.05" id="o-voice" value="${st.voice}"></div>
      <div class="row"><label>Spoken dialogue (TTS)</label><input type="checkbox" id="o-tts" ${st.tts ? 'checked' : ''}></div>
      <div class="row"><label>Graphics quality</label><select id="o-q">${Object.entries(QUALITY).map(([k, q]) => `<option value="${k}" ${st.quality === k ? 'selected' : ''}>${q.name}</option>`).join('')}</select><span style="opacity:.6;font-size:13px">(applies on next chapter load)</span></div>
      <div class="row"><label>Show FPS</label><input type="checkbox" id="o-fps" ${st.showFps ? 'checked' : ''}></div>
      <button id="m-back" style="margin-top:18px">Back</button>
    </div>`));
    const bind = (id, key, conv = parseFloat, after) => {
      const e = n.querySelector(id);
      e.addEventListener('input', () => {
        st[key] = e.type === 'checkbox' ? e.checked : conv(e.value);
        const v = n.querySelector(id + '-v');
        if (v) v.textContent = st[key];
        after?.();
        this.s.applySettings();
      });
    };
    bind('#o-sens', 'sensitivity');
    bind('#o-inv', 'invertY');
    bind('#o-fov', 'fov');
    bind('#o-master', 'master');
    bind('#o-sfx', 'sfx');
    bind('#o-music', 'music');
    bind('#o-voice', 'voice');
    bind('#o-tts', 'tts');
    bind('#o-q', 'quality', (v) => v);
    bind('#o-fps', 'showFps');
    this.btn(n, '#m-back', () => { this.s.saveSettings(); back(); });
  }
  controls(back) {
    const n = this.show(h(`<div class="menu">
      <h2>CONTROLS</h2>
      <div class="help">
        <span class="key">W A S D</span> move &nbsp; <span class="key">Shift</span> sprint &nbsp; <span class="key">Ctrl</span>/<span class="key">C</span> crouch &nbsp; <span class="key">Space</span> jump<br>
        <span class="key">Left Mouse</span> fire / use item &nbsp; <span class="key">Right Mouse</span>/<span class="key">V</span> shove (heal or give pills to a teammate when holding them)<br>
        <span class="key">R</span> reload &nbsp; <span class="key">E</span> use / pick up / open doors / hold to revive &nbsp; <span class="key">F</span> flashlight<br>
        <span class="key">1</span> primary &nbsp; <span class="key">2</span> pistol / melee &nbsp; <span class="key">3</span> throwable &nbsp; <span class="key">4</span> first aid &nbsp; <span class="key">5</span> pills &nbsp; <span class="key">Q</span> last weapon &nbsp; <span class="key">Wheel</span> cycle<br>
        <span class="key">Middle Mouse</span>/<span class="key">Z</span> zoom (hunting rifle) &nbsp; <span class="key">Esc</span> pause<br><br>
        Gamepad: left stick move, right stick look, RT fire, LT shove, A jump, B crouch, X reload, RB use, LB shove, L3 sprint.<br><br>
        <b>Surviving:</b> hold <span class="key">4</span> + Left Mouse to heal yourself (5 s), or look at a teammate and hold Right Mouse to heal them.
        Hold <span class="key">E</span> on a downed teammate to revive them. Close the safe room door with everyone inside to end a chapter.
      </div>
      <button id="m-back" style="margin-top:18px">Back</button>
    </div>`));
    this.btn(n, '#m-back', back);
  }
  coop() {
    const st = this.s.settings;
    const inp = 'style="width:280px;background:#111;color:#ddd;border:1px solid #444;padding:5px"';
    const n = this.show(h(`<div class="menu">
      <h2>CO-OP <small style="opacity:.55;font-size:.45em;letter-spacing:3px">EXPERIMENTAL</small></h2>
      <div class="help">One player hosts the game; up to three friends join with the room code and take over AI survivors.
      Empty slots are always filled by bots, and a bot steps in if a player drops.<br>
      The relay runs inside <span class="key">npm run dev</span> / <span class="key">npm run preview</span>, or standalone with <span class="key">npm run server</span>.<br><br>
      <div class="row"><label>Your name</label><input id="c-name" ${inp} maxlength="24" value="${escapeHtml(st.netName || 'Survivor')}"></div>
      <div class="row"><label>Relay server</label><input id="c-url" ${inp} value="${escapeHtml(st.relay || defaultRelayUrl())}"></div>
      <div class="row"><label>Room code</label><input id="c-room" ${inp.replace('280px', '120px')} maxlength="4" placeholder="ABCD" style="text-transform:uppercase"></div>
      <div id="c-status" style="opacity:.85;min-height:1.4em;color:#e0b060"></div>
      </div>
      <button id="c-host">Host game</button>
      <button id="c-join">Join game</button>
      <button id="m-back">Back</button>
    </div>`));
    const status = n.querySelector('#c-status');
    const v = (id) => n.querySelector(id).value.trim();
    this.btn(n, '#c-host', () => this.s.coopHost(v('#c-url'), v('#c-name') || 'Host', (t) => (status.textContent = t)));
    this.btn(n, '#c-join', () => this.s.coopJoin(v('#c-url'), v('#c-room').toUpperCase(), v('#c-name') || 'Player', (t) => (status.textContent = t)));
    this.btn(n, '#m-back', () => this.main());
  }
  coopLobby(host) {
    const st = this.s.settings;
    let chapter = 0;
    const render = () => {
      if (this.s.net !== host || this.s.state !== 'menu') return;
      const players = [{ name: host.name + ' (host)', char: st.character }, ...[...host.peers.values()].map((p) => ({ name: p.name, char: p.char }))];
      const rows = ORDER.map((id) => {
        const pl = players.find((x) => x.char === id);
        const c = CHARACTERS[id];
        return `<tr><td style="color:${c.color}">${c.name}</td><td>${pl ? escapeHtml(pl.name) : '<span style="opacity:.5">AI bot</span>'}</td></tr>`;
      }).join('');
      const n = this.show(h(`<div class="menu">
        <h2>CO-OP LOBBY</h2>
        <div class="sub">Room code</div>
        <div style="font:bold 64px Impact,'Arial Black',sans-serif;letter-spacing:12px;color:#e8d8a0;margin:4px 0 10px">${host.code}</div>
        <table class="stats" style="width:420px">${rows}</table>
        <div class="chapters" style="margin-top:14px">${this.s.chapters.map((c, i) => `<button data-i="${i}" class="${i === chapter ? 'sel' : ''}">${i + 1}. ${c.title}</button>`).join('')}</div>
        <div class="diffs" style="margin-top:10px">${Object.entries(DIFFICULTY).map(([k, d]) => `<button class="btn ${st.difficulty === k ? 'sel' : ''}" data-d="${k}">${d.name}</button>`).join('')}</div>
        <button id="l-start">Start</button>
        <button id="l-leave" class="danger">Close room</button>
      </div>`));
      n.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { this.s.uiClick(); chapter = +b.dataset.i; render(); }));
      n.querySelectorAll('.diffs .btn').forEach((b) => b.addEventListener('click', () => { this.s.uiClick(); st.difficulty = b.dataset.d; this.s.saveSettings(); render(); }));
      this.btn(n, '#l-start', () => { host.onChange = null; this.s.coopStart(chapter); });
      this.btn(n, '#l-leave', () => { host.onChange = null; this.s.leaveNet(); this.coop(); });
    };
    host.onChange = render;
    render();
  }
  coopWaiting(client) {
    const draw = (info) => {
      if (this.s.net !== client || this.s.state !== 'menu') return;
      const c = client.char ? CHARACTERS[client.char] : null;
      const n = this.show(h(`<div class="menu">
        <h2>JOINED ${client.code}</h2>
        <div class="help" style="text-align:center">${c ? `You are playing as <b style="color:${c.color}">${c.name}</b>.<br>` : ''}Waiting for ${escapeHtml(info?.host || 'the host')} to start the game…</div>
        <button id="w-leave" class="danger">Leave</button>
      </div>`));
      this.btn(n, '#w-leave', () => { this.s.leaveNet(); this.coop(); });
    };
    client.onStatus = draw;
    draw(null);
  }
  notice(title, msg) {
    const n = this.show(h(`<div class="menu"><h2>${escapeHtml(title)}</h2><div class="help" style="text-align:center">${escapeHtml(msg || '')}</div><button id="n-ok">OK</button></div>`));
    this.btn(n, '#n-ok', () => this.main());
  }
  about() {
    const n = this.show(h(`<div class="menu">
      <h2>ABOUT</h2>
      <div class="help">An original, fan-made spiritual successor to the classic co-op zombie campaign structure:
      apartments → subway → sewer → hospital → rooftop rescue. All code, models, textures, sounds, music and dialogue
      are generated procedurally at runtime — no assets from any commercial game are used.<br><br>
      Not affiliated with or endorsed by Valve Corporation. "Left 4 Dead" is a trademark of Valve.</div>
      <button id="m-back" style="margin-top:18px">Back</button>
    </div>`));
    this.btn(n, '#m-back', () => this.main());
  }
  pause() {
    const n = this.show(h(`<div class="menu">
      <h2>PAUSED</h2>
      <button id="p-resume">Resume</button>
      <button id="p-options">Options</button>
      <button id="p-controls">Controls</button>
      ${this.s.net?.client ? '' : '<button id="p-restart">Restart Chapter</button>'}
      <button id="p-quit" class="danger">${this.s.net ? 'Leave co-op game' : 'Quit to Main Menu'}</button>
    </div>`));
    this.btn(n, '#p-resume', () => this.s.resume());
    this.btn(n, '#p-options', () => this.options(() => this.pause()));
    this.btn(n, '#p-controls', () => this.controls(() => this.pause()));
    this.btn(n, '#p-restart', () => this.s.restartChapter());
    this.btn(n, '#p-quit', () => this.s.quitToMenu());
  }
  loading(title, idx) {
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    const n = this.show(h(`<div class="loading"><div class="ls">No Mercy — Chapter ${idx + 1}</div><div class="lt">${title}</div><div class="tip">${tip}</div><div class="lbar"><div></div></div></div>`));
    return (f) => { const b = n.querySelector('.lbar div'); if (b) b.style.width = Math.round(f * 100) + '%'; };
  }
  clickToPlay(onClick) {
    const n = this.show(h(`<div class="menu center" style="background:rgba(0,0,0,0.25)"><div class="clickhint">CLICK TO PLAY</div></div>`));
    n.addEventListener('click', onClick);
  }
  statsTable(survivors) {
    return `<table class="stats"><tr><th>Survivor</th><th>Kills</th><th>Headshots</th><th>Specials</th><th>Friendly fire</th><th>Incaps</th><th>Revives</th><th>Accuracy</th></tr>
      ${survivors.map((s) => `<tr><td style="color:${s.char.color}">${s.name}${s.isHuman ? ' (you)' : s.netName ? ' (' + escapeHtml(s.netName) + ')' : ''}${s.dead ? ' †' : ''}</td><td>${s.stats.kills}</td><td>${s.stats.headshots}</td><td>${s.stats.specials}</td><td>${Math.round(s.stats.ffDealt)}</td><td>${s.stats.incaps}</td><td>${s.stats.revives}</td><td>${s.stats.shots ? Math.round(s.stats.hits / s.stats.shots * 100) : 0}%</td></tr>`).join('')}</table>`;
  }
  chapterComplete(title, survivors, time, onNext) {
    const n = this.show(h(`<div class="menu center">
      <h2>${title.toUpperCase()} — COMPLETE</h2>
      <div style="opacity:.75">Time: ${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}</div>
      ${this.statsTable(survivors)}
      ${onNext ? '<button id="n-next">Continue</button>' : '<div style="opacity:.7;margin-top:18px">Waiting for the host to continue…</div>'}
    </div>`));
    if (onNext) this.btn(n, '#n-next', onNext);
  }
  failed(onRetry, onQuit) {
    const n = this.show(h(`<div class="menu center">
      <h2 style="color:#c83a2a;font-size:64px">YOU HAVE FAILED</h2>
      <div style="opacity:.7;margin-bottom:26px">All survivors are down.</div>
      ${onRetry ? '<button id="f-retry">Try Again</button>' : '<div style="opacity:.7;margin-bottom:14px">Waiting for the host to retry…</div>'}
      <button id="f-quit" class="danger">Quit to Main Menu</button>
    </div>`));
    if (onRetry) this.btn(n, '#f-retry', onRetry);
    this.btn(n, '#f-quit', onQuit);
  }
  victory(survivors, time, onDone) {
    const escaped = survivors.filter((s) => !s.dead);
    const n = this.show(h(`<div class="menu center" style="overflow:hidden">
      <div class="credits">
        <h3>${escaped.length === 4 ? 'ALL SURVIVORS ESCAPED' : escaped.length + ' SURVIVOR' + (escaped.length === 1 ? '' : 'S') + ' ESCAPED'}</h3>
        <p>${escaped.map((s) => s.name).join(' · ')}</p>
        <p>Campaign time ${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}</p>
        ${this.statsTable(survivors)}
        <h3>THE LAST FOUR</h3><p>No Mercy</p>
        <h3>IN MEMORY OF</h3><p>Fairview, and everyone who didn't make it to the roof.</p>
        <h3>BUILT WITH</h3><p>Three.js · Web Audio · procedural everything</p>
        <p style="margin-top:60px;opacity:.5">An original fan tribute to the co-op survival genre.</p>
      </div>
      <button id="v-done" style="position:absolute;bottom:30px;right:40px;background:rgba(0,0,0,.75);padding:8px 18px">Main Menu</button>
    </div>`));
    this.btn(n, '#v-done', onDone);
  }
}

// Little painted silhouettes for the survivor cards.
function drawSilhouette(cv, id) {
  const g = cv.getContext('2d');
  const c = CHARACTERS[id];
  const W = cv.width, H = cv.height;
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  g.fillStyle = 'rgba(0,0,0,0)';
  g.clearRect(0, 0, W, H);
  const cx = W / 2;
  const sk = hex(c.skin);
  const body = c.body;
  // shoulders / torso
  g.fillStyle = hex(body.vest ?? body.shirt);
  g.beginPath(); g.moveTo(cx - 60 * (body.build ?? 1), H); g.quadraticCurveTo(cx - 62, 70, cx, 66); g.quadraticCurveTo(cx + 62, 70, cx + 60 * (body.build ?? 1), H); g.fill();
  if (body.bareArms) { g.fillStyle = sk; g.fillRect(cx - 64, 92, 16, 60); g.fillRect(cx + 48, 92, 16, 60); }
  if (body.tie) { g.fillStyle = hex(body.tie); g.fillRect(cx - 5, 76, 10, 70); }
  if (body.under) { g.fillStyle = hex(body.under); g.beginPath(); g.moveTo(cx - 16, 70); g.lineTo(cx, 110); g.lineTo(cx + 16, 70); g.fill(); }
  // neck & head
  g.fillStyle = sk;
  g.fillRect(cx - 10, 50, 20, 22);
  g.beginPath(); g.ellipse(cx, 38, 22, 27, 0, 0, 7); g.fill();
  if (body.hair != null && !body.bald) { g.fillStyle = hex(body.hair); g.beginPath(); g.ellipse(cx, 26, 23, 17, 0, Math.PI, 0); g.fill(); }
  if (body.ponytail) { g.fillStyle = hex(body.hair); g.beginPath(); g.ellipse(cx + 22, 44, 7, 20, 0.3, 0, 7); g.fill(); }
  if (body.hat === 'beret') { g.fillStyle = hex(body.hatColor); g.beginPath(); g.ellipse(cx + 4, 16, 26, 10, -0.2, 0, 7); g.fill(); }
  if (body.beard != null) { g.fillStyle = hex(body.beard); g.beginPath(); g.ellipse(cx, 55, 17, 12, 0, 0, Math.PI); g.fill(); }
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(cx - 12, 34, 7, 3); g.fillRect(cx + 5, 34, 7, 3);
}
