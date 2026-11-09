// HUD, announcements and menu screens (DOM).
function mkEl(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}
const fmt = (n) => Math.round(n).toLocaleString('en-US');

class Hud {
  constructor(game, director) {
    this.game = game;
    this.dir = director;
    const root = (this.root = mkEl('div', 'br hidden', document.body));
    root.innerHTML = `
      <div class="vig"></div><div class="sup"></div><div class="blast"></div><div class="scope"><svg viewBox="-100 -100 200 200" preserveAspectRatio="xMidYMid meet"><g stroke="#050505" fill="none"><line x1="-100" y1="0" x2="-6" y2="0" stroke-width="0.7"/><line x1="6" y1="0" x2="100" y2="0" stroke-width="0.7"/><line x1="0" y1="-100" x2="0" y2="-6" stroke-width="0.7"/><line x1="0" y1="6" x2="0" y2="100" stroke-width="0.7"/><line x1="-100" y1="0" x2="-55" y2="0" stroke-width="2.4"/><line x1="55" y1="0" x2="100" y2="0" stroke-width="2.4"/><line x1="0" y1="55" x2="0" y2="100" stroke-width="2.4"/></g><g fill="#050505"><circle cx="-40" cy="0" r="0.9"/><circle cx="-30" cy="0" r="0.9"/><circle cx="-20" cy="0" r="0.9"/><circle cx="-10" cy="0" r="0.9"/><circle cx="10" cy="0" r="0.9"/><circle cx="20" cy="0" r="0.9"/><circle cx="30" cy="0" r="0.9"/><circle cx="40" cy="0" r="0.9"/><circle cx="0" cy="-40" r="0.9"/><circle cx="0" cy="-30" r="0.9"/><circle cx="0" cy="-20" r="0.9"/><circle cx="0" cy="-10" r="0.9"/><circle cx="0" cy="10" r="0.9"/><circle cx="0" cy="20" r="0.9"/><circle cx="0" cy="30" r="0.9"/><circle cx="0" cy="40" r="0.9"/></g><circle cx="0" cy="0" r="0.8" fill="#d42"/></svg><i class="breath"></i></div>
      <div class="rec"><span class="dotr"></span><span class="rt"></span></div>
      <div class="cam">M.E.G. BODY CAM · UNIT 07 · LEVEL FEED</div>
      <div class="wave"><div class="lv"></div><div class="wn"></div><div class="left"><div class="vbar"><b></b></div><span class="timer"></span></div></div>
      <div class="cash"><div class="amt">0</div><div class="sc"></div><div class="feed"></div></div>
      <div class="xh"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><div class="dot"></div></div>
      <div class="hm"></div>
      <div class="dmg"></div>
      <div class="prompt"></div>
      <div class="ann"><div class="k"></div><div class="big"></div><div class="sub"></div></div>
      <div class="toast"></div>
      <div class="healfx"></div>
      <div class="vitals">
        <div class="vrow hp"><span class="ico">+</span><div class="vbar"><i></i><b></b></div><span class="num">100</span></div>
        <div class="vrow armor"><span class="ico">◆</span><div class="vbar"><b></b></div><span class="num">0</span></div>
        <div class="stam"><b></b></div>
      </div>
      <div class="weapon"><div class="name"></div><div class="ammo"></div><div class="meta"></div><div class="slots"></div><div class="hint"></div></div>
      <div class="fps"></div>`;
    const q = (s) => root.querySelector(s);
    this.e = {
      vig: q('.vig'), sup: q('.sup'), blast: q('.blast'), scope: q('.scope'), rt: q('.rt'),
      lv: q('.wave .lv'), wn: q('.wave .wn'), leftBar: q('.wave .left .vbar b'), timer: q('.wave .timer'),
      cash: q('.cash .amt'), score: q('.cash .sc'), feed: q('.feed'),
      xh: q('.xh'), hm: q('.hm'), dmg: q('.dmg'), prompt: q('.prompt'),
      ann: q('.ann'), annK: q('.ann .k'), annBig: q('.ann .big'), annSub: q('.ann .sub'), toast: q('.toast'),
      vitals: q('.vitals'), healfx: q('.healfx'), hpB: q('.vrow.hp .vbar b'), hpTrail: q('.vrow.hp .vbar i'), hpN: q('.vrow.hp .num'),
      arB: q('.vrow.armor .vbar b'), arN: q('.vrow.armor .num'), arRow: q('.vrow.armor'), st: q('.stam b'),
      wName: q('.weapon .name'), ammo: q('.weapon .ammo'), meta: q('.weapon .meta'), slots: q('.weapon .slots'), hint: q('.weapon .hint'),
      fps: q('.fps'),
    };
    this.arcs = [];
    for (let i = 0; i < 6; i++) this.arcs.push(mkEl('i', '', this.e.dmg));
    this.hurts = [];
    this.hmT = 0;
    this.annT = 0;
    this.fpsAcc = { n: 0, t: 0 };
    this.trail = 100;
    game.hooks.push(this);
  }

  show(on) { this.root.classList.toggle('hidden', !on); }

  announce(k, big, sub = '', danger = false, dur = 3) {
    const e = this.e;
    e.annK.textContent = k;
    e.annBig.textContent = big;
    e.annSub.textContent = sub;
    e.ann.classList.toggle('danger', danger);
    e.ann.classList.add('on');
    this.annT = dur;
  }

  // the warm rush of a medkit's injection
  healFlash(a) { if (this.e.healfx) this.e.healfx.style.opacity = a > 0.001 ? (0.55 * a).toFixed(3) : 0; }

  toast(text) {
    const d = mkEl('div', '', this.e.toast, text);
    setTimeout(() => d.remove(), 2700);
  }

  feed(text, cls = '', cash = 0) {
    const d = mkEl('div', cls, this.e.feed);
    d.innerHTML = text + (cash ? `<span class="c">+$${fmt(cash)}</span>` : '');
    while (this.e.feed.children.length > 6) this.e.feed.firstChild.remove();
    setTimeout(() => d.remove(), 4100);
  }

  hit(kind = 'hit') {
    const hm = this.e.hm;
    hm.className = 'hm' + (kind === 'kill' ? ' kill' : kind === 'head' ? ' head' : '');
    this.hmT = kind === 'hit' ? 0.12 : 0.32;
  }

  onPlayerDamaged(dmg, from) {
    if (!from) return;
    const P = this.game.player;
    const yaw = Math.atan2(-(from.x - P.pos.x), -(from.z - P.pos.z));
    this.hurts.push({ yaw, t: 0, amt: dmg });
    if (this.hurts.length > 6) this.hurts.shift();
  }

  onShot(paths, gun, hit) { if (hit) this.hit('hit'); }

  // ---- per frame ---------------------------------------------------------------------------------
  afterRender(dt) {
    const g = this.game, P = g.player, a = g.arsenal, d = this.dir, e = this.e;
    if (this.root.classList.contains('hidden')) return;
    // vitals
    const hp = Math.max(0, P.health), hpPct = (hp / P.maxHealth) * 100;
    e.hpB.style.width = hpPct + '%';
    this.trail = Math.max(hpPct, this.trail - dt * 25);
    e.hpTrail.style.width = this.trail + '%';
    e.hpN.textContent = Math.ceil(hp);
    e.vitals.classList.toggle('low', hp < 30);
    e.arB.style.width = (g.armor / g.maxArmor) * 100 + '%';
    e.arN.textContent = Math.ceil(g.armor);
    e.arRow.style.opacity = g.armor > 0 ? 1 : 0.35;
    e.st.style.width = P.stamina * 100 + '%';
    // weapon
    const w = a.gun;
    e.wName.textContent = w.def.name;
    e.ammo.innerHTML = `${w.ammo}<small>/ ${w.reserve}</small>`;
    e.ammo.classList.toggle('empty', w.ammo === 0);
    const att = [...w.attachments].map((x) => ({ suppressor: 'SUP', reddot: 'RDS', laser: 'LAS', extmag: 'EXT', grip: 'GRP' }[x])).join(' ');
    e.meta.innerHTML = `<span>${w.def.auto ? 'AUTO' : w.def.pump ? 'PUMP' : w.def.bolt ? 'BOLT' : 'SEMI'}</span>${att ? `<span>${att}</span>` : ''}<span>FRAG <b>${a.grenades}</b></span><span>MED <b>${a.medkits}</b></span>`;
    e.slots.innerHTML = a.slots.map((s, i) => `<span class="${i === a.index ? 'on' : ''} ${s ? '' : 'none'}">${i + 1} ${s ? s.def.short : '—'}</span>`).join('');
    const reloading = a.state === 'reload';
    const medHint = hp < P.maxHealth * 0.4 && a.medkits > 0 && a.state !== 'heal' && !(g.medkits && g.medkits.healing) ? 'H · MEDKIT' : '';
    e.hint.textContent = a.state === 'heal' ? 'PATCHING UP' : reloading ? 'RELOADING' : w.ammo === 0 && w.reserve === 0 ? 'NO AMMO' : w.ammo <= Math.ceil(w.magSize * 0.25) && w.reserve > 0 ? 'R · RELOAD' : medHint;
    // wave
    const th = g.level.theme;
    e.lv.textContent = `${th.code} · ${th.title}${g.level.loop ? ' · DEPTH ' + d.depth : ''}`;
    if (d.state === 'intermission' || d.state === 'countdown') e.wn.innerHTML = `INTERMISSION`;
    else e.wn.innerHTML = `WAVE ${Math.max(1, d.wave)}${d.mod ? `<em>${WAVE_MODS[d.mod].name}</em>` : d.spec && d.spec.boss ? '<em>BOSS</em>' : ''}`;
    if (d.state === 'wave' && d.spec) {
      const total = d.spec.kinds.length, left = d.remaining();
      e.leftBar.style.width = (left / Math.max(1, total)) * 100 + '%';
      e.timer.textContent = `${left} HOSTILE${left === 1 ? '' : 'S'}`;
    } else if (d.state === 'intro') { e.leftBar.style.width = '0%'; e.timer.textContent = `CONTACT IN ${Math.max(0, Math.ceil(5 - d.stateT))}`; }
    else { e.leftBar.style.width = '0%'; e.timer.textContent = ''; }
    e.cash.textContent = fmt(d.cash);
    e.score.textContent = `SCORE ${fmt(d.score)}`;
    // crosshair: spread ring, hidden while aiming
    const spread = (a.gun.def.adsSpread * 0 + a.spreadScale(P)) * 0.004;
    const px = clamp((spread / Math.tan((g.camera.fov * Math.PI) / 360)) * (innerHeight / 2), 3, 70) + 4;
    const xhVis = a.adsAmount < 0.4 && P.alive && g.state === 'play' && !g.settings.noCrosshair;
    e.xh.style.opacity = xhVis ? (P.sprinting ? 0.25 : 0.9) : 0;
    // the crosshair follows the gun's free-aim lag, so it always marks where rounds go
    const k = (innerHeight / 2) / Math.tan((g.camera.fov * Math.PI) / 360);
    e.xh.style.translate = `${(-Math.tan(g.vm.aimX * 0.6) * k).toFixed(1)}px ${(-Math.tan(g.vm.aimY * 0.6) * k).toFixed(1)}px`;
    const [t, b, l, r] = e.xh.children;
    t.style.top = -px - 7 + 'px'; b.style.top = px + 'px'; l.style.left = -px - 7 + 'px'; r.style.left = px + 'px';
    this.hmT -= dt;
    e.hm.style.opacity = this.hmT > 0 ? Math.min(1, this.hmT * 8) : 0;
    // damage direction arcs
    for (let i = 0; i < this.arcs.length; i++) {
      const h = this.hurts[i], arc = this.arcs[i];
      if (!h) { arc.style.opacity = 0; continue; }
      h.t += dt;
      const rel = h.yaw - P.yaw;
      arc.style.transform = `rotate(${(-rel * 180) / Math.PI}deg)`;
      arc.style.opacity = clamp(1 - h.t / 1.6, 0, 1) * clamp(h.amt / 12, 0.45, 1);
    }
    this.hurts = this.hurts.filter((h) => h.t < 1.6);
    // full screen states
    const lowHp = clamp(1 - hp / 45, 0, 1);
    const recent = clamp(1 - (P.time - P.lastHurt) / 0.6, 0, 1);
    e.vig.style.opacity = Math.max(lowHp * (0.55 + 0.25 * Math.sin(performance.now() / 260)), recent * 0.6, P.alive ? 0 : 1);
    g.suppression = Math.max(0, (g.suppression || 0) - dt * 0.6);
    e.sup.style.opacity = g.suppression;
    g.flashbang = Math.max(0, (g.flashbang || 0) - dt * 0.9);
    e.blast.style.opacity = g.flashbang;
    const scoped = a.gun.zoom > 2 && a.adsAmount > 0.92;
    e.scope.style.opacity = scoped ? 1 : 0;
    if (scoped) e.scope.classList.toggle('steady', !!g.holdingBreath);
    // bodycam clock
    const now = new Date();
    e.rt.textContent = `REC  ${now.toISOString().slice(0, 10)}  ${now.toTimeString().slice(0, 8)}  ·  W${String(Math.max(1, d.wave)).padStart(2, '0')}`;
    // announcements
    this.annT -= dt;
    if (this.annT <= 0) e.ann.classList.remove('on');
    // fps
    this.fpsAcc.n++; this.fpsAcc.t += dt;
    if (this.fpsAcc.t > 0.5) { e.fps.textContent = g.settings.showFps ? `${Math.round(this.fpsAcc.n / this.fpsAcc.t)} FPS · ${g.sb.people.length} BODIES` : ''; this.fpsAcc = { n: 0, t: 0 }; }
  }
}

// ---- menu screens ----------------------------------------------------------------------------------
class Screens {
  constructor(game, director, hud) {
    this.game = game;
    this.dir = director;
    this.hud = hud;
    this.s = {};
    const mk = (id, html) => { const d = mkEl('div', 'scr', document.body, `<div class="card">${html}</div>`); d.dataset.id = id; this.s[id] = d; return d; };
    mk('start', `
      <h2>ENDLESS DESCENT</h2>
      <h1>THE <span>BACKROOMS</span></h1>
      <p>You noclipped out of reality and into the yellow. Others got here first — scavengers, mercenaries, men with radios and rifles. Hold out. Get paid. Go deeper.</p>
      <div class="keys">
        <b>WASD</b><span>move</span><b>SHIFT</b><span>sprint</span>
        <b>MOUSE</b><span>aim · fire</span><b>RMB / E</b><span>aim down sights</span>
        <b>R</b><span>reload</span><b>1 2 3 · Q · WHEEL</b><span>weapons</span>
        <b>G</b><span>frag grenade</span><b>F</b><span>kick / shove</span>
        <b>C / CTRL</b><span>crouch</span><b>SPACE</b><span>jump · mantle</span>
        <b>T</b><span>weapon light</span><b>V</b><span>inspect weapon</span>
        <b>B</b><span>shop (intermission)</span><b>ESC</b><span>pause</span>
      </div>
      <div class="btns"><button data-a="play">Enter the Backrooms</button><button class="alt" data-a="settings">Settings</button><button class="alt" data-a="credits">Credits</button></div>
      <div class="loading"></div>`);
    mk('pause', `
      <h2>PAUSED</h2><h1>HOLD <span>STILL</span></h1>
      <p class="pinfo"></p>
      <div class="btns"><button data-a="resume">Resume</button><button class="alt" data-a="settings">Settings</button><button class="alt" data-a="restart">Restart run</button></div>`);
    mk('over', `
      <h2>SIGNAL LOST</h2><h1>YOU <span>DIED</span></h1>
      <p class="cause"></p>
      <div class="stats"></div>
      <div class="best"></div>
      <div class="btns"><button data-a="restart">Descend again</button><button class="alt" data-a="credits">Credits</button></div>`);
    mk('settings', `
      <h2>SETTINGS</h2><h1>CALI<span>BRATE</span></h1>
      <div class="set"></div>
      <div class="btns"><button data-a="back">Done</button></div>`);
    mk('credits', `
      <h2>CREDITS</h2><h1>WHO <span>MADE</span> THIS</h1>
      <div class="credits"></div>
      <div class="btns"><button data-a="back">Back</button></div>`);
    for (const scr of Object.values(this.s)) scr.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (b && b.dataset.a) this.action(b.dataset.a);
    });
    const cr = document.getElementById('credits');
    this.s.credits.querySelector('.credits').textContent = cr ? cr.textContent : '';
    this.back = 'start';
    this.buildSettings();
  }

  open(id) {
    for (const [k, s] of Object.entries(this.s)) s.classList.toggle('on', k === id);
    this.cur = id;
  }
  close() { for (const s of Object.values(this.s)) s.classList.remove('on'); this.cur = null; }

  action(a) {
    const g = this.game;
    g.audio.unlock();
    switch (a) {
      case 'play': this.close(); g.startRun(); break;
      case 'resume': this.close(); g.resume(); break;
      case 'restart': this.close(); g.startRun(); break;
      case 'settings': this.back = this.cur; this.open('settings'); break;
      case 'credits': this.back = this.cur; this.open('credits'); break;
      case 'back': this.open(this.back || 'start'); break;
    }
  }

  buildSettings() {
    const g = this.game, s = g.settings;
    const box = this.s.settings.querySelector('.set');
    const rows = [
      ['Mouse sensitivity', 'sensitivity', 0.2, 3, 0.05],
      ['Field of view', 'fov', 65, 105, 1],
      ['Weapon FOV (higher = smaller gun)', 'vmFov', 50, 80, 1],
      ['Master volume', 'volume', 0, 1, 0.05],
      ['Music', 'music', 0, 1, 0.05],
      ['Bodycam lens', 'bodycam', 0, 1, 0.05],
    ];
    for (const [label, key, mn, mx, step] of rows) {
      const l = mkEl('label', '', box, label);
      const i = mkEl('input', '', box);
      i.type = 'range'; i.min = mn; i.max = mx; i.step = step; i.value = s[key];
      const v = mkEl('span', 'v', box, String(s[key]));
      i.addEventListener('input', () => { s[key] = +i.value; v.textContent = (+i.value).toFixed(step < 1 ? 2 : 0); g.applySettings(); });
      void l;
    }
    const sel = (label, key, opts) => {
      mkEl('label', '', box, label);
      const i = mkEl('select', '', box);
      for (const [val, txt] of opts) { const o = mkEl('option', '', i, txt); o.value = val; if (String(s[key]) === String(val)) o.selected = true; }
      mkEl('span', 'v', box, '');
      i.addEventListener('change', () => { s[key] = i.value === 'true' ? true : i.value === 'false' ? false : i.value; g.applySettings(); });
    };
    sel('Graphics', 'quality', [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]);
    sel('Gore', 'gore', [[true, 'On'], [false, 'Off']]);
    sel('Sniper scope (right mouse)', 'adsHold', [[false, 'Toggle'], [true, 'Hold']]);
    sel('Minimap', 'minimap', [[true, 'On'], [false, 'Off']]);
    sel('Enemy movement', 'physicsEnemies', [[false, 'Motion capture + ragdoll'], [true, 'Full physics']]);
    sel('Invert mouse Y', 'invertY', [[false, 'Off'], [true, 'On']]);
    sel('Show FPS', 'showFps', [[false, 'Off'], [true, 'On']]);
  }

  gameOver() {
    const d = this.dir, st = d.stats, g = this.game;
    const acc = st.shots ? Math.round((100 * st.hits) / st.shots) : 0;
    const mins = Math.floor((performance.now() - st.startT) / 60000);
    this.s.over.querySelector('.cause').textContent = `${g.level.theme.code} — ${g.level.theme.title}. Wave ${d.wave}. ${g.deathCause || 'The Backrooms keep what they take.'}`;
    this.s.over.querySelector('.stats').innerHTML = [
      [d.wave, 'Wave reached'], [st.kills, 'Kills'], [st.headshots, 'Headshots'], [acc + '%', 'Accuracy'],
      [fmt(d.score), 'Score'], ['$' + fmt(st.cashEarned), 'Earned'], [Math.round(st.longest) + ' m', 'Longest kill'], [mins + ' min', 'Survived'],
    ].map(([v, k]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
    this.s.over.querySelector('.best').textContent = d.newBest ? 'NEW PERSONAL BEST' : `BEST ${fmt(d.best)}`;
    this.open('over');
  }
}
