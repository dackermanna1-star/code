// The 2008 in-game interface. In 2008 the HUD was drawn by the C++ engine
// (no Lua GUI objects existed): top menu bar, chat log + chat bar, Player
// List, Health bar, Backpack, camera buttons, Report button, Safe Chat menu,
// Hint and Message objects, and name labels over heads. Plain DOM over the
// canvas; layout and colours follow docs/RESEARCH.md (client section).
import * as THREE from 'three';
import { nameColor } from './Game.js';
import { brickColorCss } from './BrickColor.js';
import { sounds } from './Sound.js';
import { SAFE_CHAT_TREE } from './SafeChat.js';
import { cursorArrow, cursorGun, cursorGunWait, cameraButton, chatBubble, reportFace } from './icons.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CHAT_LINES = 6;
const CHAT_TTL = 60000;

export class Gui {
  constructor(game, root, opts = {}) {
    this.game = game;
    this.root = root;
    this.chatFocused = false;
    this.nameTags = new Map();
    this.buildMode = !!opts.buildMode; // Tools/Insert enabled (your own place / solo)
    this._build();
    game.gui = this;
  }

  _build() {
    const r = this.root;
    r.classList.add('rbx-gui');
    r.innerHTML = `
      <div class="rbx-topbar">
        <a data-act="tools" class="${this.buildMode ? '' : 'disabled'}">&nbsp;&nbsp;Tools</a><a data-act="insert" class="${this.buildMode ? '' : 'disabled'}">&nbsp;&nbsp;Insert</a><a data-act="fullscreen">&nbsp;&nbsp;Fullscreen</a><a data-act="help">&nbsp;&nbsp;Help...</a><a data-act="exit">&nbsp;&nbsp;&nbsp;Exit</a>
      </div>
      <div class="rbx-chatlog"></div>
      <div class="rbx-labels"></div>
      <div class="rbx-playerlist"><div class="rbx-pl-inner"></div></div>
      <div class="rbx-health"><div class="rbx-health-bar"><div class="rbx-health-fill"></div></div><div class="rbx-health-label">Health</div></div>
      <div class="rbx-backpack"></div>
      <a class="rbx-safechat-btn" title="Chat"></a>
      <div class="rbx-safechat-menu"></div>
      <div class="rbx-report" title="Report Abuse"><span class="rbx-report-face"></span>Report</div>
      <div class="rbx-fp-tip">Zoom out (O Key)<br/>to free mouse</div>
      <div class="rbx-camctrl">
        <a class="rbx-cam tiltup" data-cam="tiltup" title="Tilt Up"></a><a class="rbx-cam zoomin" data-cam="zoomin" title="Zoom In"></a>
        <a class="rbx-cam tiltdown" data-cam="tiltdown" title="Tilt Down"></a><a class="rbx-cam zoomout" data-cam="zoomout" title="Zoom Out"></a>
      </div>
      <div class="rbx-message"><div class="rbx-message-text"></div></div>
      <div class="rbx-joinbox"><div class="rbx-joinbox-text"></div></div>
      <div class="rbx-hint"></div>
      <div class="rbx-chatbar"><input type="text" maxlength="128" spellcheck="false" autocomplete="off" placeholder='To chat click here or press the "/" key'></div>
      <div class="rbx-dialog"></div>
    `;
    const q = (sel) => r.querySelector(sel);
    this.chatlog = q('.rbx-chatlog');
    this.labels = q('.rbx-labels');
    this.playerListEl = q('.rbx-playerlist');
    this.playerList = q('.rbx-pl-inner');
    this.healthFill = q('.rbx-health-fill');
    this.backpack = q('.rbx-backpack');
    this.hint = q('.rbx-hint');
    this.message = q('.rbx-message');
    this.messageText = q('.rbx-message-text');
    this.joinbox = q('.rbx-joinbox');
    this.joinText = q('.rbx-joinbox-text');
    this.chatInput = q('.rbx-chatbar input');
    this.dialog = q('.rbx-dialog');
    this.fpTip = q('.rbx-fp-tip');
    this.scMenu = q('.rbx-safechat-menu');

    this.chatInput.addEventListener('focus', () => { this.chatFocused = true; r.classList.add('chatting'); });
    this.chatInput.addEventListener('blur', () => { this.chatFocused = false; r.classList.remove('chatting'); });
    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const t = this.chatInput.value;
        this.chatInput.value = '';
        this.chatInput.blur();
        if (t.trim() && this.game.localPlayer) this.game.chat(this.game.localPlayer, t);
      } else if (e.key === 'Escape') { this.chatInput.value = ''; this.chatInput.blur(); }
    });

    q('.rbx-topbar').addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a || a.classList.contains('disabled')) return;
      sounds.play('click', null, 0.6);
      this.menu(a.dataset.act, a);
    });
    q('.rbx-camctrl').addEventListener('mousedown', (e) => {
      const a = e.target.closest('[data-cam]');
      if (!a) return;
      e.preventDefault();
      const c = this.game.camera;
      ({ tiltup: () => c.tilt(1), tiltdown: () => c.tilt(-1), zoomin: () => c.zoom(-1), zoomout: () => c.zoom(1) })[a.dataset.cam]();
    });
    q('.rbx-report').addEventListener('click', () => this.showReport());
    this.game.camera.onFirstPerson = (fp) => { this.fpTip.style.display = fp ? 'block' : 'none'; };

    // Safe Chat: a column of white buttons, branches pop out to the right.
    q('.rbx-safechat-btn').addEventListener('click', () => {
      sounds.play('click', null, 0.6);
      if (this.scMenu.childElementCount) this.closeSafeChat(); else this.openSafeChat();
    });

    this.backpack.addEventListener('mousedown', (e) => {
      const slot = e.target.closest('.rbx-slot');
      if (slot && this.game.localPlayer) { e.preventDefault(); this.game.equip(this.game.localPlayer, Number(slot.dataset.index)); }
    });

    // redrawn button images with their hover / pressed states
    const states = (el, img) => {
      const set = (st) => { el.style.backgroundImage = `url(${img(st)})`; };
      set('up');
      el.addEventListener('mouseenter', () => set('ovr'));
      el.addEventListener('mouseleave', () => set('up'));
      el.addEventListener('mousedown', () => set('dn'));
      el.addEventListener('mouseup', () => set('ovr'));
    };
    r.querySelectorAll('.rbx-cam').forEach((b) => states(b, (st) => cameraButton(b.dataset.cam, st)));
    states(q('.rbx-safechat-btn'), chatBubble);
    q('.rbx-report-face').style.backgroundImage = `url(${reportFace()})`;

    this.setCursor('arrow');
  }

  /** Tools and Insert are only usable while building in your own place. */
  setBuildMode(on) {
    this.buildMode = !!on;
    for (const a of this.root.querySelectorAll('.rbx-topbar [data-act="tools"], .rbx-topbar [data-act="insert"]')) a.classList.toggle('disabled', !on);
  }

  // --- cursors ---------------------------------------------------------------------
  setCursor(kind) {
    if (this._cursor === kind) return;
    this._cursor = kind;
    const url = kind === 'gun' ? cursorGun() : kind === 'wait' ? cursorGunWait() : cursorArrow();
    const hot = kind === 'arrow' ? '1 1' : '32 32';
    this.game.canvas.style.cursor = `url(${url}) ${hot}, ${kind === 'arrow' ? 'default' : 'crosshair'}`;
  }

  // --- Safe Chat -------------------------------------------------------------------
  openSafeChat() {
    this.closeSafeChat();
    this._scColumn(SAFE_CHAT_TREE, 0, 0);
  }

  closeSafeChat() { this.scMenu.innerHTML = ''; }

  _scColumn(nodes, depth, top) {
    // remove deeper columns
    [...this.scMenu.querySelectorAll('.sc-col')].filter((c) => Number(c.dataset.depth) >= depth).forEach((c) => c.remove());
    const col = document.createElement('div');
    col.className = 'sc-col';
    col.dataset.depth = depth;
    col.style.left = depth * 145 + 'px';
    col.style.top = top + 'px';
    nodes.forEach((n, i) => {
      const b = document.createElement('div');
      b.className = 'sc-item' + (n.kids.length ? ' sc-branch' : '');
      b.textContent = n.text;
      b.addEventListener('mouseenter', () => {
        if (n.kids.length) this._scColumn(n.kids, depth + 1, top + i * 24);
        else [...this.scMenu.querySelectorAll('.sc-col')].filter((c) => Number(c.dataset.depth) > depth).forEach((c) => c.remove());
      });
      b.addEventListener('click', () => {
        sounds.play('click', null, 0.6);
        if (this.game.localPlayer) this.game.chat(this.game.localPlayer, n.text);
        this.closeSafeChat();
      });
      col.appendChild(b);
    });
    this.scMenu.appendChild(col);
    // keep the column on screen
    const overflow = col.getBoundingClientRect().bottom - this.root.getBoundingClientRect().bottom + 24;
    if (overflow > 0) col.style.top = Math.max(-this.scMenu.offsetTop, top - overflow) + 'px';
  }

  // --- top menu -----------------------------------------------------------------------
  menu(act, anchor) {
    switch (act) {
      case 'fullscreen': {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else document.documentElement.requestFullscreen?.();
        break;
      }
      case 'help': this.showHelp(); break;
      case 'exit': this.game.emit('exit'); break;
      case 'tools': this.game.emit('menuTools', anchor); break;
      case 'insert': this.game.emit('menuInsert', anchor); break;
    }
  }

  openDialog(title, html, buttons = [{ label: 'OK' }]) {
    const d = this.dialog;
    d.innerHTML = `<div class="rbx-win"><div class="rbx-win-title"><span>${esc(title)}</span><a class="rbx-win-x" title="Close">&#215;</a></div><div class="rbx-win-body">${html}</div>
      <div class="rbx-win-buttons">${buttons.map((b, i) => `<button data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
    d.style.display = 'block';
    const close = () => { d.style.display = 'none'; d.innerHTML = ''; };
    d.querySelector('.rbx-win-x').onclick = close;
    d.querySelectorAll('.rbx-win-buttons button').forEach((btn) => {
      btn.onclick = () => { const b = buttons[Number(btn.dataset.i)]; close(); b.action?.(); };
    });
    return d;
  }

  showHelp() {
    this.openDialog('ROBLOX Help', `
      <div class="rbx-help">
        <h3>Controls</h3>
        <table>
          <tr><td>Walk</td><td>W A S D, or the Up and Down arrow keys</td></tr>
          <tr><td>Jump</td><td>Space Bar</td></tr>
          <tr><td>Use a tool</td><td>Press its number (1-9, 0) or click it, then click to use. Press the number again to put it away.</td></tr>
          <tr><td>Rotate camera</td><td>Hold the right mouse button and drag, Left/Right arrow keys, or the , and . keys</td></tr>
          <tr><td>Zoom</td><td>Mouse wheel, or the I and O keys. Zoom all the way in for first person.</td></tr>
          <tr><td>Tilt camera</td><td>Page Up / Page Down, or the arrow buttons</td></tr>
          <tr><td>Chat</td><td>Click the chat bar or press the "/" key, type, then press Enter. Click the speech bubble for Safe Chat.</td></tr>
        </table>
        <p>Have fun, and remember: be nice to other Robloxians!</p>
      </div>`);
  }

  showReport() {
    sounds.play('click', null, 0.6);
    const names = this.game.players.filter((p) => !p.isLocal).map((p) => `<option>${esc(p.name)}</option>`).join('');
    this.openDialog('Report Abuse', `<p>Which player is breaking the rules?</p><p><select>${names || '<option>(nobody else is here)</option>'}</select></p>
      <p>What are they doing?</p><p><select><option>Bad language</option><option>Bullying</option><option>Scamming</option><option>Asking for personal information</option><option>Cheating/exploiting</option></select></p>`,
    [{ label: 'Send', action: () => this.game.systemChat('Your report has been sent. Thank you.') }, { label: 'Cancel' }]);
  }

  // --- chat ----------------------------------------------------------------------------
  focusChat() { this.chatInput.focus(); }
  blurChat() { this.chatInput.blur(); }

  addChat(player, text) {
    const line = document.createElement('div');
    line.className = 'rbx-chatline';
    if (player) {
      const color = player.team && this.game.teams.length ? brickColorCss(player.team.color) : nameColor(player.name);
      line.innerHTML = `<span class="rbx-chatname" style="color:${color}">${esc(player.name)};</span>&nbsp; ${esc(text)}`;
    } else {
      line.innerHTML = `<span class="rbx-chatsys">${esc(text)}</span>`;
    }
    line.dataset.t = Date.now();
    this.chatlog.appendChild(line);
    while (this.chatlog.children.length > CHAT_LINES) this.chatlog.removeChild(this.chatlog.firstChild);
  }

  // --- Hint / Message / join box -----------------------------------------------------------
  setHint(text) {
    this.hint.textContent = text || '';
    const on = text != null && text !== false;
    this.hint.style.display = on ? 'block' : 'none';
    this.root.classList.toggle('has-hint', on);
  }

  setMessage(text) {
    this.messageText.textContent = text || '';
    this.message.style.display = text ? 'flex' : 'none';
  }

  setJoinStatus(text) {
    this.joinText.textContent = text || '';
    this.joinbox.style.display = text ? 'flex' : 'none';
  }

  // --- player list -------------------------------------------------------------------------
  onPlayersChanged() { this._plDirty = true; }

  _renderPlayerList() {
    const g = this.game;
    const stats = g.stats;
    const teams = g.teams.length > 0;
    const sortKey = stats[0];
    const row = (p, color) => `<tr class="${p.isLocal ? 'me' : ''}" style="color:${color || nameColor(p.name)}"><td class="nm">${esc(p.name)}</td>${stats.map((s) => `<td class="st">${p.stats[s] ?? 0}</td>`).join('')}</tr>`;
    const sorted = (list) => [...list].sort((a, b) => (b.stats[sortKey] ?? 0) - (a.stats[sortKey] ?? 0));
    const header = teams ? 'Team' : stats.length ? 'Players' : 'Player List';
    let html = `<table><tr class="hdr"><th class="nm">${header}</th>${stats.map((s) => `<th class="st">${esc(s)}</th>`).join('')}</tr>`;
    if (teams) {
      for (const t of g.teams) {
        const members = g.players.filter((p) => p.team === t);
        const color = brickColorCss(t.color);
        const total = stats.map((s) => members.reduce((a, p) => a + (p.stats[s] ?? 0), 0));
        html += `<tr class="team" style="color:${color};border-bottom-color:${color}"><td class="nm">${esc(t.name)}</td>${total.map((v) => `<td class="st">${v}</td>`).join('')}</tr>`;
        html += sorted(members).map((p) => row(p, color)).join('');
      }
      const neutral = g.players.filter((p) => !p.team);
      if (neutral.length) html += sorted(neutral).map((p) => row(p, '#fff')).join('');
    } else {
      html += sorted(g.players).map((p) => row(p)).join('');
    }
    html += '</table>';
    this.playerList.innerHTML = html;
  }

  // --- backpack ------------------------------------------------------------------------------
  onBackpackChanged(player) {
    if (!player.isLocal) return;
    this.backpack.innerHTML = player.backpack.map((t, i) => `
      <div class="rbx-slot${player.equipped === i ? ' sel' : ''}" data-index="${i}" title="${esc(t.name)}">
        ${t.icon ? `<img src="${t.icon}" alt="" draggable="false">` : `<span class="rbx-slot-name">${esc(t.name)}</span>`}<span class="rbx-slot-num">${(i + 1) % 10}</span>
      </div>`).join('');
    this.backpack.style.display = player.backpack.length ? 'flex' : 'none';
  }

  // --- per frame -------------------------------------------------------------------------------
  update() {
    const g = this.game;
    if (this._plDirty || (this._plTick = (this._plTick || 0) + 1) % 30 === 0) { this._plDirty = false; this._renderPlayerList(); }
    const ch = g.localPlayer?.character;
    const hp = ch && ch.alive ? Math.max(0, ch.health / ch.maxHealth) : 0;
    this.healthFill.style.height = (hp * 100).toFixed(1) + '%';
    // cursor: gun rings while holding a weapon, "reloading" during its cooldown
    const tool = ch && ch.alive ? ch.tool : null;
    this.setCursor(tool ? (tool.enabled ? (tool.cursor || 'gun') : 'wait') : 'arrow');
    // expire chat lines
    const now = Date.now();
    for (const line of [...this.chatlog.children]) if (now - Number(line.dataset.t) > CHAT_TTL) line.remove();
    this._updateLabels();
  }

  _updateLabels() {
    const g = this.game;
    const cam = g.world.camera;
    const w = this.root.clientWidth, h = this.root.clientHeight;
    const seen = new Set();
    for (const p of g.players) {
      const c = p.character;
      if (!c || !c.alive || p.isLocal) continue;
      seen.add(c);
      let tag = this.nameTags.get(c);
      if (!tag) {
        tag = document.createElement('div');
        tag.className = 'rbx-nametag';
        tag.innerHTML = `<div class="n"></div><div class="hb"><div></div></div>`;
        this.labels.appendChild(tag);
        this.nameTags.set(c, tag);
      }
      const head = new THREE.Vector3(c.rootPosition.x, c.rootPosition.y + 3.6, c.rootPosition.z);
      const dist = cam.position.distanceTo(head);
      const v = head.project(cam);
      const visible = v.z < 1 && v.z > -1 && dist < 100;
      tag.style.display = visible ? 'block' : 'none';
      if (!visible) continue;
      const size = dist < 20 ? 24 : dist < 50 ? 18 : 12;
      const n = tag.firstChild;
      if (n.textContent !== p.name) n.textContent = p.name;
      n.style.fontSize = size + 'px';
      n.style.color = p.team && g.teams.length ? brickColorCss(p.team.color) : '#fff';
      tag.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * h).toFixed(1)}px) translate(-50%, -100%)`;
      const hb = tag.lastChild;
      const frac = c.health / c.maxHealth;
      hb.style.display = frac < 0.999 ? 'block' : 'none';
      hb.style.width = size * 4 + 'px';
      hb.style.height = Math.max(3, size / 2) + 'px';
      hb.firstChild.style.width = (frac * 100).toFixed(0) + '%';
    }
    for (const [c, tag] of this.nameTags) if (!seen.has(c)) { tag.remove(); this.nameTags.delete(c); }
  }
}
