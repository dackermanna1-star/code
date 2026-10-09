// The screens: the title (the city behind it, filmed from the air at golden
// hour), the pause menu with tabs - Map (pan, zoom, click to set a waypoint),
// Stats, Settings, Controls - and Quit.
//
//   V.menus = new Menus(game.gui.root)
//   showTitle(hasSave)  openPause(tab?)  hideAll()  isOpen  update(dt)  dispose()
import * as THREE from 'three';
import { V } from '../state.js';
import { mapImage } from './mapimage.js';
import { PLACES } from '../world/layout.js';
import { ICONS } from './hud.js';

const LEGEND = [['safehouse', 'Safehouse'], ['hospital', 'Hospital'], ['police', 'Police'], ['gunshop', 'Ammu-Vice'], ['spray', "Pay 'n' Spray"], ['marina', 'Marina'], ['helipad', 'Helipad'], ['pier', 'Pier'], ['arena', 'Arena']];

const CSS = `
.vc-menu{position:absolute;inset:0;pointer-events:auto;display:none;color:#fff;font-family:Inter,"SF Pro Display","Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.vc-menu.show{display:block;animation:vc-fade .4s}
@keyframes vc-fade{from{opacity:0}}
.vc-title{background:linear-gradient(90deg,rgba(8,6,20,.82) 0%,rgba(8,6,20,.45) 38%,rgba(8,6,20,0) 62%)}
.vc-logo{position:absolute;left:7vw;top:16vh}
.vc-logo .a{font-size:clamp(64px,9vw,128px);font-weight:900;font-style:italic;letter-spacing:-2px;line-height:.9;background:linear-gradient(100deg,#ff3d9a 10%,#ff8a5c 45%,#ffd36b 60%,#4fd8ff 90%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 18px rgba(255,61,154,.45))}
.vc-logo .b{font-size:15px;letter-spacing:9px;margin-top:10px;opacity:.85;text-transform:uppercase}
.vc-btns{position:absolute;left:7vw;top:48vh;display:flex;flex-direction:column;gap:10px;min-width:280px}
.vc-btn{all:unset;cursor:pointer;font-size:20px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:10px 18px;border-radius:8px;transition:background .15s,padding .15s;color:rgba(255,255,255,.82)}
.vc-btn:hover,.vc-btn:focus{background:linear-gradient(90deg,rgba(255,61,154,.9),rgba(255,61,154,0));color:#fff;padding-left:26px}
.vc-btn.dim{opacity:.45;pointer-events:none}
.vc-foot{position:absolute;left:7vw;bottom:5vh;font-size:12px;opacity:.6;letter-spacing:1px}
.vc-pause{background:rgba(6,8,16,.66);backdrop-filter:blur(6px)}
.vc-tabs{position:absolute;left:50%;top:5vh;transform:translateX(-50%);display:flex;gap:4px}
.vc-tab{all:unset;cursor:pointer;padding:10px 20px;font-size:14px;font-weight:700;letter-spacing:3px;text-transform:uppercase;border-bottom:3px solid transparent;color:rgba(255,255,255,.65)}
.vc-tab.on{color:#fff;border-color:#ff3d9a}
.vc-panel{position:absolute;left:50%;top:13vh;transform:translateX(-50%);width:min(1100px,90vw);height:72vh;display:none}
.vc-panel.on{display:block}
.vc-map{width:100%;height:100%;border-radius:14px;cursor:grab;background:#0e2f45;box-shadow:0 10px 40px rgba(0,0,0,.5)}
.vc-maphint{position:absolute;right:14px;bottom:12px;font-size:12px;opacity:.75;background:rgba(0,0,0,.45);padding:6px 10px;border-radius:6px}
.vc-legend{position:absolute;left:14px;bottom:12px;display:grid;grid-template-columns:auto auto;gap:5px 16px;font-size:12px;background:rgba(6,10,20,.62);padding:10px 14px;border-radius:10px;backdrop-filter:blur(4px)}
.vc-legend span{display:flex;align-items:center;gap:7px;white-space:nowrap;opacity:.9}
.vc-legend i{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;font:800 10px Inter,Arial,sans-serif;font-style:normal;color:#111;box-shadow:0 0 0 1.5px rgba(0,0,0,.6)}
.vc-legend i.sq{border-radius:3px}.vc-legend i.you{background:none;box-shadow:none;color:#fff;font-size:13px}
.vc-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px 40px;font-size:15px}
.vc-cols div{display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.1);padding:8px 0}
.vc-cols b{font-weight:700}
.vc-set{display:flex;flex-direction:column;gap:14px;max-width:560px;font-size:15px}
.vc-set label{display:flex;justify-content:space-between;align-items:center;gap:20px}
.vc-set input[type=range]{width:240px;accent-color:#ff3d9a}
.vc-set select{background:#1b1f2c;color:#fff;border:1px solid #444;border-radius:6px;padding:4px 8px}
.vc-keys kbd{display:inline-block;min-width:24px;padding:2px 7px;margin-right:4px;border-radius:5px;background:#fff;color:#111;font:700 12px Inter,Arial,sans-serif;text-align:center}
.vc-close{position:absolute;right:4vw;top:5vh;font-size:13px;opacity:.7;letter-spacing:2px}
`;

const KEYS = [
  ['On foot', [['W A S D', 'move'], ['Shift', 'sprint'], ['Space', 'jump'], ['Mouse', 'look'], ['F', 'get in / out of a vehicle (and carjack)'], ['Right mouse / E', 'aim'], ['Left mouse', 'shoot / punch'], ['R', 'reload'], ['Tab (hold)', 'weapon wheel'], ['1-8 / wheel', 'switch weapon']]],
  ['Driving', [['W / S', 'accelerate / brake and reverse'], ['A / D', 'steer'], ['Space', 'handbrake'], ['H', 'horn (siren in police cars)'], ['Q / E', 'radio station'], ['Right mouse', 'drive-by aim']]],
  ['Flying', [['W / S', 'forward / back (helicopter), throttle (plane)'], ['A / D', 'bank'], ['Q / E', 'turn'], ['Shift / Ctrl', 'climb / descend'], ['R', 'radio station']]],
  ['Game', [['Esc / P', 'pause, map'], ['M', 'map']]],
];

export class Menus {
  constructor(root) {
    this.root = root;
    if (!document.getElementById('vc-menu-css')) { const s = document.createElement('style'); s.id = 'vc-menu-css'; s.textContent = CSS; document.head.appendChild(s); }
    const wrap = (this.el = document.createElement('div'));
    wrap.className = 'vc vc-menus';
    wrap.innerHTML = `
      <div class="vc-menu vc-title">
        <div class="vc-logo"><div class="a">VICE CITY</div><div class="b">sun &nbsp;·&nbsp; sand &nbsp;·&nbsp; neon &nbsp;·&nbsp; crime</div></div>
        <div class="vc-btns"><button class="vc-btn" data-a="continue">Continue</button><button class="vc-btn" data-a="new">New Game</button><button class="vc-btn" data-a="settings">Settings</button><button class="vc-btn" data-a="controls">Controls</button><button class="vc-btn" data-a="quit">Quit</button></div>
        <div class="vc-foot">A user-made place. Vice City and everyone in it are made up. Models: Kenney (CC0) · Textures: Poly Haven (CC0)</div>
      </div>
      <div class="vc-menu vc-pause">
        <div class="vc-tabs"><button class="vc-tab" data-t="map">Map</button><button class="vc-tab" data-t="stats">Stats</button><button class="vc-tab" data-t="settings">Settings</button><button class="vc-tab" data-t="controls">Controls</button><button class="vc-tab" data-t="quit">Quit</button></div>
        <div class="vc-close">ESC · RESUME</div>
        <div class="vc-panel" data-p="map"><canvas class="vc-map"></canvas><div class="vc-legend"></div><div class="vc-maphint">Drag to move · wheel to zoom · click: set waypoint · right-click: clear</div></div>
        <div class="vc-panel" data-p="stats"><div class="vc-cols"></div></div>
        <div class="vc-panel" data-p="settings"><div class="vc-set">
          <label>Mouse sensitivity <input type="range" min="0.3" max="2.5" step="0.05" data-k="mouse"></label>
          <label>Invert mouse Y <input type="checkbox" data-k="invertY"></label>
          <label>Aim assist (lock-on) <input type="checkbox" data-k="lockOn"></label>
          <label>Volume <input type="range" min="0" max="1.5" step="0.05" data-k="volume"></label>
          <label>Radio volume <input type="range" min="0" max="1.5" step="0.05" data-k="music"></label>
          <label>Graphics <select data-k="quality"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
        </div></div>
        <div class="vc-panel vc-keys" data-p="controls"></div>
        <div class="vc-panel" data-p="quit"><div class="vc-btns" style="position:static"><button class="vc-btn" data-a="resume">Resume</button><button class="vc-btn" data-a="save">Save game</button><button class="vc-btn" data-a="title">Quit to title</button><button class="vc-btn" data-a="quit">Back to ROBLOX</button></div></div>
      </div>`;
    root.appendChild(wrap);
    this.title = wrap.querySelector('.vc-title'); this.pause = wrap.querySelector('.vc-pause');
    this.mapCv = wrap.querySelector('.vc-map');
    // controls list (title and pause share it)
    const keysHtml = KEYS.map(([h, ks]) => `<h3 style="margin:14px 0 8px;letter-spacing:3px;font-size:13px;opacity:.7;text-transform:uppercase">${h}</h3><div class="vc-cols">${ks.map(([k, d]) => `<div><span><kbd>${k}</kbd></span><span>${d}</span></div>`).join('')}</div>`).join('');
    wrap.querySelector('[data-p=controls]').innerHTML = keysHtml;
    // the map's legend (the same icons as the radar)
    wrap.querySelector('.vc-legend').innerHTML = LEGEND.filter(([k]) => PLACES.some((p) => p.kind === k)).map(([k, n]) => `<span><i style="background:${ICONS[k][1]}">${ICONS[k][0]}</i>${n}</span>`).join('')
      + '<span><i class="sq" style="background:#d66bff"></i>Waypoint</span><span><i class="you">▲</i>You</span>';
    // buttons
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a],[data-t]');
      if (!b) return;
      import('../../../engine/Sound.js').then(({ sounds }) => sounds.unlock?.()).catch(() => {});
      if (b.dataset.t) return this.tab(b.dataset.t);
      const a = b.dataset.a, S = V.session;
      if (a === 'continue') S.start(true);
      else if (a === 'new') S.start(false);
      else if (a === 'settings') { this.openPause('settings', true); }
      else if (a === 'controls') { this.openPause('controls', true); }
      else if (a === 'resume') S.resume();
      else if (a === 'save') { S.save(); V.hud?.notify('Game saved.'); S.resume(); }
      else if (a === 'title') { S.save(); this.hideAll(); S.state = 'title'; this.showTitle(true); }
      else if (a === 'quit') { S.save(); V.game.emit('exit'); }
    });
    // settings
    const D = { mouse: 1, invertY: false, lockOn: true, volume: 1, music: 0.8, quality: 'high' };
    V.settings = Object.assign({}, D, V.settings || {});
    for (const inp of wrap.querySelectorAll('[data-k]')) {
      const k = inp.dataset.k;
      if (inp.type === 'checkbox') inp.checked = !!V.settings[k]; else inp.value = V.settings[k];
      inp.addEventListener('input', () => {
        V.settings[k] = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? +inp.value : inp.value;
        V.session?.store('vice.settings.v1', V.settings);
        this.apply();
      });
    }
    this.apply();
    // the map: pan, zoom, waypoints
    this.view = { x: 0, z: 0, k: 0.11 }; // k: CSS pixels per stud
    const cv = this.mapCv;
    let drag = null;
    cv.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vz: this.view.z, moved: false, btn: e.button }; cv.style.cursor = 'grabbing'; });
    window.addEventListener('mousemove', this._mm = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      this.view.x = drag.vx - dx / this.view.k; this.view.z = drag.vz - dy / this.view.k;
    });
    window.addEventListener('mouseup', this._mu = (e) => {
      if (!drag) return;
      if (!drag.moved) {
        const r = cv.getBoundingClientRect();
        const x = this.view.x + (e.clientX - r.left - r.width / 2) / this.view.k, z = this.view.z + (e.clientY - r.top - r.height / 2) / this.view.k;
        if (drag.btn === 2) V.hud?.clearWaypoint(); else V.hud?.setWaypoint(x, z);
      }
      drag = null; cv.style.cursor = 'grab';
    });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    // zoom about the cursor: a mouse wheel in steps, a trackpad (and pinch) smoothly
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const v = this.view, r = cv.getBoundingClientRect();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const k1 = Math.max(0.05, Math.min(1.6, v.k * Math.exp(-Math.max(-300, Math.min(300, dy)) * (e.ctrlKey ? 0.01 : 0.0016))));
      const mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
      v.x += mx / v.k - mx / k1; v.z += my / v.k - my / k1; v.k = k1;
    }, { passive: false });
    window.addEventListener('keydown', this._kd = (e) => {
      if (this.pause.classList.contains('show') && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) { e.preventDefault(); if (!this.fromTitle) V.session.resume(); else { this.hideAll(); this.showTitle(V.hasSave); } }
      if (e.key === 'm' || e.key === 'M') { if (V.session?.state === 'play') { V.session.pause(); this.tab('map'); } }
    });
  }

  get isOpen() { return this.title.classList.contains('show') || this.pause.classList.contains('show'); }

  showTitle(hasSave) {
    this.hideAll();
    this.title.classList.add('show');
    this.title.querySelector('[data-a=continue]').classList.toggle('dim', !hasSave);
    V.input.ui = true; V.input.unlock();
    V.hud?.show(false);
    // the city from the air while you choose
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const loop = () => V.cam.cinematic([
      { from: V3(3400, 140, 2300), to: V3(3300, 120, 900), look: V3(2600, 30, 1700), look2: V3(2500, 40, 600), secs: 18, fov: 50 },
      { from: V3(1500, 220, 400), to: V3(1200, 260, -300), look: V3(-100, 240, -900), look2: V3(-300, 200, -700), secs: 18, fov: 50 },
      { from: V3(2950, 30, -200), to: V3(2950, 40, 1400), look: V3(2700, 25, 300), look2: V3(2650, 20, 1700), secs: 16, fov: 55 },
    ], () => { if (this.title.classList.contains('show')) loop(); });
    loop();
    if (V.time.hour < 16 || V.time.hour > 19.6) V.time.hour = 18.4;
  }

  openPause(tab = 'map', fromTitle = false) {
    this.fromTitle = fromTitle;
    this.title.classList.remove('show');
    this.pause.classList.add('show');
    this.pause.querySelector('[data-t=quit]').style.display = fromTitle ? 'none' : '';
    V.input.ui = true;
    const P = V.player;
    if (P?.pos) { this.view.x = P.pos.x; this.view.z = P.pos.z; }
    this.tab(fromTitle && tab === 'map' ? 'settings' : tab);
  }

  tab(t) {
    for (const b of this.pause.querySelectorAll('.vc-tab')) b.classList.toggle('on', b.dataset.t === t);
    for (const p of this.pause.querySelectorAll('.vc-panel')) p.classList.toggle('on', p.dataset.p === t);
    this.tabName = t;
    if (t === 'stats') this._stats();
  }

  hideAll() {
    this.title.classList.remove('show'); this.pause.classList.remove('show');
    if (V.cam?.shots) V.cam.endCinematic?.();
    V.input.ui = false;
    V.hud?.show(true);
  }

  apply() {
    const s = V.settings;
    import('../../../engine/Sound.js').then(({ sounds }) => sounds.setVolume?.(s.volume)).catch(() => {});
    V.radio?.setVolume?.(s.music);
    const pr = s.quality === 'low' ? 0.75 : s.quality === 'medium' ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    if (V.world && Math.abs(V.world.renderer.getPixelRatio() - pr) > 0.01) { V.world.renderer.setPixelRatio(pr); V.game?.resize(window.innerWidth, window.innerHeight); V.post?.resize?.(); }
    V.events?.emit('settings', s);
  }

  _stats() {
    const st = V.stats || {}, P = V.player;
    const rows = [
      ['Money', '$' + Math.round(P?.money || 0).toLocaleString('en-US')], ['Time played', hms(st.played || 0)],
      ['People killed', st.kills || 0], ['Cops killed', st.copKills || 0], ['Cars stolen', st.stolen || 0], ['Cars destroyed', st.destroyed || 0],
      ['Shots fired', st.shots || 0], ['Headshots', st.headshots || 0], ['Times wasted', st.wasted || 0], ['Times busted', st.busted || 0],
      ['Highest wanted level', '★'.repeat(st.maxWanted || 0) || '-'], ['Top speed', (st.topSpeed || 0) + ' mph'],
      ['Distance driven', ((st.driven || 0) * 0.33 / 1609).toFixed(1) + ' mi'], ['Distance on foot', ((st.walked || 0) * 0.33 / 1609).toFixed(1) + ' mi'],
    ];
    this.pause.querySelector('[data-p=stats] .vc-cols').innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  }

  update(dt) {
    if (!this.pause.classList.contains('show') || this.tabName !== 'map') return;
    const cv = this.mapCv, dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = cv.clientWidth, ch = cv.clientHeight, w = Math.round(cw * dpr), h = Math.round(ch * dpr);
    if (!cw || !ch) return;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const g = cv.getContext('2d'), M = mapImage(V.plan, V.ground), v = this.view, k = v.k;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); // everything below in CSS pixels
    g.fillStyle = '#0e2f45'; g.fillRect(0, 0, cw, ch);
    g.save();
    g.translate(cw / 2, ch / 2); g.scale(k / M.scale, k / M.scale);
    const [cx, cy] = M.toPx(v.x, v.z); g.translate(-cx, -cy);
    g.imageSmoothingEnabled = true;
    g.drawImage(M.canvas, 0, 0);
    // GPS route
    const r = V.hud?.route;
    if (r) { g.strokeStyle = V.hud.waypoint ? '#d66bff' : '#ffcf4a'; g.lineWidth = (5 / k) * M.scale; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath(); r.pts.forEach((p, i) => { const q = M.toPx(p.x, p.z); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.stroke(); }
    g.restore();
    const S = (x, z) => [cw / 2 + (x - v.x) * k, ch / 2 + (z - v.z) * k];
    // labels never overlap each other or the icons, and stay inside the frame (most important first)
    const taken = [];
    const fits = (x0, y0, x1, y1) => { if (x0 < 4 || y0 < 4 || x1 > cw - 4 || y1 > ch - 4) return false; for (const q of taken) if (x0 < q[2] && x1 > q[0] && y0 < q[3] && y1 > q[1]) return false; return true; };
    const reserve = (x, y, r) => taken.push([x - r, y - r, x + r, y + r]);
    // the legend and the hint sit over the map: keep labels out from under them
    const cr = cv.getBoundingClientRect();
    for (const el of this.mapBoxes ||= [...this.pause.querySelectorAll('.vc-legend,.vc-maphint')]) { const b = el.getBoundingClientRect(); taken.push([b.left - cr.left - 4, b.top - cr.top - 4, b.right - cr.left + 4, b.bottom - cr.top + 4]); }
    const icons = [];
    for (const p of PLACES) { const I = ICONS[p.kind]; if (!I) continue; const [sx, sy] = S(p.x, p.z); icons.push([sx, sy, I[0], I[1], p]); reserve(sx, sy, 9); }
    const P = V.player, me = P?.pos ? S(P.pos.x, P.pos.z) : null;
    if (me) reserve(me[0], me[1], 13);
    const wp = V.hud?.waypoint, wps = wp ? S(wp.x, wp.z) : null;
    if (wps) reserve(wps[0], wps[1], 9);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const label = (text, x, y, px, weight, fill, offs) => {
      g.font = `${weight} ${px}px Inter,Arial,sans-serif`;
      const tw = g.measureText(text).width / 2 + 3, th = px / 2 + 2;
      for (const [ox, oy] of offs) {
        const lx = x + ox, ly = y + oy;
        if (!fits(lx - tw, ly - th, lx + tw, ly + th)) continue;
        taken.push([lx - tw, ly - th, lx + tw, ly + th]);
        g.lineWidth = Math.max(3, px / 4); g.strokeStyle = 'rgba(0,0,0,.65)'; g.strokeText(text, lx, ly);
        g.fillStyle = fill; g.fillText(text, lx, ly);
        return true;
      }
      return false;
    };
    const round = (o) => [[0, -o], [0, o], [o * 2.4, 0], [-o * 2.4, 0]];
    if (wps) {
      const len = r && V.hud.waypoint ? r.pts.reduce((a, p, i) => a + (i ? Math.hypot(p.x - r.pts[i - 1].x, p.z - r.pts[i - 1].z) : 0), 0) : 0;
      label(len ? `Waypoint · ${(len * 0.33 / 1609).toFixed(1)} mi` : 'Waypoint', wps[0], wps[1], 12, 700, '#f0c8ff', round(17));
    }
    if (k > 0.22) for (const [sx, sy, , , p] of icons) label(p.name, sx, sy, 11, 700, '#fff', round(17));
    // district names: one per name, at the middle of its biggest piece
    const big = new Map();
    for (const D of V.plan.districts) { const a = (D.rect[2] - D.rect[0]) * (D.rect[3] - D.rect[1]), b = big.get(D.name); if (!b || a > b.a) big.set(D.name, { D, a }); }
    const dpx = Math.round(Math.max(11, Math.min(24, k * 70)));
    for (const { D } of big.values()) {
      const [x, y] = S((D.rect[0] + D.rect[2]) / 2, (D.rect[1] + D.rect[3]) / 2);
      if (x < -200 || x > cw + 200 || y < -60 || y > ch + 60) continue;
      label(D.name.toUpperCase(), x, y, dpx, '800 italic', 'rgba(255,255,255,.9)', [[0, 0], [0, -dpx * 1.4], [0, dpx * 1.4], [0, -dpx * 2.8], [0, dpx * 2.8]]);
    }
    // icons (as on the radar), the waypoint and you on top
    const icon = (sx, sy, ch_, col, rr = 8, sq = false) => {
      g.beginPath(); if (sq) g.rect(sx - rr, sy - rr, rr * 2, rr * 2); else g.arc(sx, sy, rr, 0, Math.PI * 2);
      g.fillStyle = col; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,.7)'; g.stroke();
      if (ch_) { g.fillStyle = '#111'; g.font = `800 ${Math.round(rr * 1.2)}px Inter,Arial,sans-serif`; g.fillText(ch_, sx, sy + 1); }
    };
    for (const [sx, sy, c, col] of icons) icon(sx, sy, c, col);
    for (const b of V.hud?.blips?.values?.() || []) { const [sx, sy] = S(b.x, b.z); icon(sx, sy, b.label || '', b.color || '#ffcf4a', 8, b.shape === 'square'); }
    if (wps) icon(wps[0], wps[1], '', '#d66bff', 7, true);
    if (me) {
      const hd = P.vehicle ? P.vehicle.heading : P.heading, pulse = 14 + 4 * Math.sin(performance.now() / 260);
      g.beginPath(); g.arc(me[0], me[1], pulse, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.14)'; g.fill();
      g.save(); g.translate(me[0], me[1]); g.rotate(Math.PI - hd);
      g.beginPath(); g.moveTo(0, -12); g.lineTo(9, 9); g.lineTo(0, 4); g.lineTo(-9, 9); g.closePath();
      g.fillStyle = '#fff'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#000'; g.stroke(); g.restore();
    }
  }

  dispose() {
    window.removeEventListener('mousemove', this._mm); window.removeEventListener('mouseup', this._mu); window.removeEventListener('keydown', this._kd);
    this.el.remove();
  }
}

function hms(sec) { const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60; return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`; }
