/* ==========================================================================
   SPLEEN: SEPSIS — ui.js
   DOM HUD + menus. Every menu is navigable by mouse, keyboard, gamepad, touch.
   ========================================================================== */
"use strict";

const UI = (function () {
  const U = {};
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const icon = (name, cls = '') => `<span class="ms ${cls}">${name}</span>`;
  let screenEl, modalEl, hudEl, fadeEl, toastsEl, bannerEl, bossEl, promptEl, mmCanvas, mmCtx, touchEl;
  let current = null;       // current screen name
  let backAction = null;    // function for back/escape
  let focusIdx = 0;
  let openedAt = 0, lockFor = 0; // brief confirm lock on freshly opened menus (anti double-tap)
  let hudCache = {};

  U.init = function () {
    screenEl = $('#screen'); modalEl = $('#modal'); hudEl = $('#hud'); fadeEl = $('#fade');
    toastsEl = $('#toasts'); bannerEl = $('#banner'); bossEl = $('#bossbar'); promptEl = $('#prompt');
    mmCanvas = $('#minimap'); mmCtx = mmCanvas.getContext('2d'); touchEl = $('#touch');
    // global UI sounds
    document.addEventListener('mouseover', (e) => { const b = e.target.closest && e.target.closest('.btn,.card,.chip'); if (b && !b._hov) { b._hov = true; sfx('ui_hover', { vol: 0.5 }); setFocusEl(b); } });
    document.addEventListener('mouseout', (e) => { const b = e.target.closest && e.target.closest('.btn,.card,.chip'); if (b && !(e.relatedTarget && b.contains(e.relatedTarget))) b._hov = false; });
    // touch buttons
    for (const b of touchEl.querySelectorAll('[data-t]')) {
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); Input.touchButton(b.dataset.t); b.classList.add('down'); }, { passive: false });
      b.addEventListener('touchend', () => b.classList.remove('down'));
      b.addEventListener('touchcancel', () => b.classList.remove('down'));
    }
    // fonts fallback for icons
    // no face (stylesheet failed) or a failed face (woff2 failed) -> dot fallback
    if (document.fonts && document.fonts.load) {
      const noIcons = () => document.body.classList.add('no-icons');
      try {
        document.fonts.load('24px "Material Symbols Rounded"', 'home')
          .then((faces) => { if (!faces.length || faces.some(f => f.status !== 'loaded')) noIcons(); }, noIcons);
        // safeguard for a request that hangs forever
        setTimeout(() => { try { if (![...document.fonts].some(f => f.family.replace(/["']/g, '') === 'Material Symbols Rounded' && f.status === 'loaded')) noIcons(); } catch (e) { } }, 8000);
      } catch (e) { noIcons(); }
    }
    $('#mutlist').addEventListener('mouseover', (e) => { const t = e.target.closest('.mchip'); if (t) showTip(t); });
    $('#mutlist').addEventListener('mouseout', () => hideTip());
  };
  U.fatal = function (msg) { const l = $('#loading'); l.innerHTML = '<div class="fatal">' + msg + '</div>'; l.classList.remove('gone'); };

  /* ======================================================================
     generic screen / focus handling
     ====================================================================== */
  function focusables() { const root = modalEl.classList.contains('on') ? modalEl : screenEl; return [...root.querySelectorAll('.btn:not(.disabled),.card:not(.disabled),.chip:not(.disabled),input[type=range]')].filter(e => e.offsetParent !== null); }
  function setFocusEl(e) { const f = focusables(); const i = f.indexOf(e); if (i >= 0) { focusIdx = i; applyFocus(); } }
  function applyFocus() { const f = focusables(); f.forEach((e, i) => e.classList.toggle('focus', i === focusIdx)); }
  function moveFocus(dx, dy) {
    const f = focusables(); if (!f.length) return;
    const cur = f[focusIdx] || f[0];
    if (cur && cur.type === 'range' && dx) { cur.value = clamp(+cur.value + dx * (+cur.step || 0.05) * ((+cur.max - +cur.min) > 2 ? 1 : 1), +cur.min, +cur.max); cur.dispatchEvent(new Event('input')); return; }
    const r0 = cur.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = -1, bs = Infinity;
    f.forEach((e, i) => {
      if (i === focusIdx) return;
      const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const ddx = x - cx, ddy = y - cy;
      const along = dx ? ddx * dx : ddy * dy; if (along <= 4) return;
      const across = dx ? Math.abs(ddy) : Math.abs(ddx);
      const s = along + across * 2.2; if (s < bs) { bs = s; best = i; }
    });
    if (best < 0) { // wrap within list
      if (dy) best = (focusIdx + (dy > 0 ? 1 : f.length - 1)) % f.length; else return;
    }
    focusIdx = best; applyFocus(); sfx('ui_hover', { vol: 0.5 });
    f[focusIdx].scrollIntoView && f[focusIdx].scrollIntoView({ block: 'nearest' });
  }
  U.menuFrame = function () {
    const N = Input.nav;
    if (!screenEl || (!current && !modalEl.classList.contains('on'))) return;
    if (N.up) moveFocus(0, -1); if (N.down) moveFocus(0, 1); if (N.left) moveFocus(-1, 0); if (N.right) moveFocus(1, 0);
    const locked = performance.now() - openedAt < lockFor;
    if (N.confirm && !locked) { const f = focusables()[focusIdx]; if (f && f.type !== 'range') f.click(); }
    if (N.back && backAction) { sfx('ui_back'); backAction(); }
    if (U.keyHandler && !locked) U.keyHandler();
  };
  function btn(label, onClick, cls = '', ic = null) {
    const b = el('button', 'btn ui-interactive ' + cls, (ic ? icon(ic) : '') + '<span>' + label + '</span>');
    b.addEventListener('click', (e) => { e.stopPropagation(); if (b.classList.contains('disabled')) { sfx('ui_error'); return; } sfx('ui_click'); onClick && onClick(); b.blur(); });
    return b;
  }
  function show(name, build, back) {
    current = name; backAction = back || null; focusIdx = 0; Input.resetNav && Input.resetNav(name === 'summary' ? 0.9 : 0.2);
    openedAt = performance.now(); lockFor = name === 'summary' ? 700 : 150;
    screenEl.innerHTML = ''; screenEl.className = 'screen on s-' + name;
    build(screenEl);
    requestAnimationFrame(applyFocus);
  }
  U.showScreen = function (name) { if (!name) { current = null; screenEl.className = 'screen'; screenEl.innerHTML = ''; backAction = null; } };
  U.showHUD = function (on) {
    hudEl.classList.toggle('on', on); touchEl.classList.toggle('on', on && Input.touchEnabled); hudCache = {};
    if (!on) { // overlays that live outside #hud: clear so they don't linger over summary/title
      $('#lowhp').classList.remove('on'); $('#hurt').style.opacity = 0;
      promptEl.classList.remove('on'); hideTip();
      bannerEl.className = 'banner'; document.body.classList.remove('letterbox');
    }
  };
  U.setFade = function (v) { fadeEl.style.opacity = v; };

  /* ======================================================================
     TITLE
     ====================================================================== */
  U.title = function () {
    U.closeModal();
    if (window.setupTitleScene && (!TitleScene.room || SIM.room !== TitleScene.room)) setupTitleScene();
    show('title', (s) => {
      const wrap = el('div', 'title-wrap');
      wrap.appendChild(el('div', 'logo', '<div class="logo-main">SPLEEN</div><div class="logo-sub">: SEPSIS</div><div class="logo-tag">an immune-system roguelite</div>'));
      const menu = el('div', 'menu');
      menu.appendChild(btn('Play', () => U.strainSelect(), 'big', 'play_arrow'));
      menu.appendChild(btn('The Spleen', () => U.spleen(), '', 'psychology'));
      menu.appendChild(btn('Immune Memory', () => U.codex(), '', 'menu_book'));
      menu.appendChild(btn('How to Play', () => U.howTo(), '', 'help'));
      menu.appendChild(btn('Options', () => U.options(() => U.title()), '', 'settings'));
      wrap.appendChild(menu);
      const st = META.stats;
      wrap.appendChild(el('div', 'title-foot', `<span>${icon('diamond')} ${META.memory} memory</span><span>runs ${st.runs}</span><span>wins ${st.wins}</span><span>best ${st.bestFloor ? REGIONS[Math.min(5, st.bestFloor - 1)].name.toLowerCase() : '—'}</span><span class="ver">v${VERSION}</span>`));
      s.appendChild(wrap);
    }, null);
  };

  /* ======================================================================
     STRAIN SELECT
     ====================================================================== */
  let selFever = 0;
  U.strainSelect = function () {
    selFever = Math.min(META.lastFever || 0, META.feverMax);
    show('strains', (s) => {
      s.appendChild(el('div', 'hdr', '<h2>Choose your cell</h2><p>Each strain fights differently. Unlock more by pushing deeper.</p>'));
      const row = el('div', 'cards strains');
      for (const id of STRAIN_ORDER) {
        const d = STRAINS[id], locked = !isUnlocked(d.unlock);
        const c = el('div', 'card strain ui-interactive' + (locked ? ' locked disabled' : '') + (META.lastStrain === id ? ' last' : ''));
        c.style.setProperty('--c', d.color);
        const bars = Object.entries(d.statLine).map(([k, v]) => `<div class="sbar"><span>${k}</span><i>${'<b></b>'.repeat(v)}${'<em></em>'.repeat(5 - v)}</i></div>`).join('');
        c.innerHTML = `<div class="cell-ico" style="--c:${d.color};--n:${d.nucleus}"><div class="nuc"></div></div>
          <div class="sname">${d.name}</div><div class="stitle">${d.title}</div>
          ${locked ? `<div class="lockmsg">${icon('lock')}<span>${UNLOCKS[d.unlock].how}</span></div>` : `<div class="sdesc">${d.desc}</div>${bars}<div class="sabil"><b>${icon('bolt')} ${d.abilityName}</b><span>${d.abilityDesc}</span></div>`}`;
        c.addEventListener('click', () => { if (locked) { sfx('ui_error'); return; } sfx('select'); if (!META.tutorialSeen) U.briefing(() => startRun(id, selFever)); else startRun(id, selFever); });
        row.appendChild(c);
      }
      s.appendChild(row);
      if (isUnlocked('fever') && META.feverMax > 0) {
        const fv = el('div', 'fever');
        const render = () => { fv.innerHTML = ''; fv.appendChild(btn('', () => { selFever = Math.max(0, selFever - 1); render(); }, 'chip arrow', 'chevron_left')); fv.appendChild(el('div', 'fever-lbl', `<b>${FEVER[selFever].name}</b><span>${FEVER[selFever].desc}</span><span class="dim">memory x${(1 + 0.25 * selFever).toFixed(2)}</span>`)); fv.appendChild(btn('', () => { selFever = Math.min(META.feverMax, selFever + 1); render(); }, 'chip arrow', 'chevron_right')); if (fv.isConnected) applyFocus(); };
        render(); s.appendChild(fv);
      }
      s.appendChild(el('div', 'foot')).appendChild(btn('Back', () => U.title(), 'ghost', 'arrow_back'));
    }, () => U.title());
    // default focus to last strain
    requestAnimationFrame(() => { const f = focusables(); const i = f.findIndex(x => x.classList.contains('last')); if (i >= 0) { focusIdx = i; applyFocus(); } });
  };

  U.briefing = function (go) {
    show('briefing', (s) => {
      const box = el('div', 'brief');
      box.innerHTML = `<div class="b-num">PATIENT FILE · DAY 3</div>
        <h2>The Host is dying.</h2>
        <p>A rot has entered the blood. Fever, failing organs, the infection spreading toward the brain. The doctors call it <b class="hot">sepsis</b>.</p>
        <p>The body has one armory left: <b class="accent">the Spleen</b>. It builds you — a single white cell — and sends you in.</p>
        <p>Clear the infection region by region. Choose your mutations well. When you die, and you will, the Spleen <b class="gold">remembers</b> what you learned and builds the next cell stronger.</p>`;
      s.appendChild(box);
      s.appendChild(el('div', 'foot')).appendChild(btn('Begin', () => { META.tutorialSeen = true; saveMeta(); go(); }, 'big', 'play_arrow'));
    }, () => U.strainSelect());
  };

  /* ======================================================================
     THE SPLEEN (meta perks)
     ====================================================================== */
  U.spleen = function () {
    show('spleen', (s) => {
      s.appendChild(el('div', 'hdr', `<h2>The Spleen</h2><p>Every cell that dies here is remembered. Spend <b class="mem">${icon('diamond')} ${META.memory} memory</b> to strengthen the next.</p>`));
      const grid = el('div', 'cards perks');
      for (const p of PERKS) {
        const lvl = META.perks[p.id] || 0, max = p.cost.length, cost = p.cost[lvl];
        const c = el('div', 'card perk ui-interactive' + (lvl >= max ? ' maxed' : '') + (lvl < max && META.memory < cost ? ' poor' : ''));
        c.innerHTML = `<div class="pico">${icon(p.icon)}</div><div class="pname">${p.name}</div><div class="pdesc">${p.desc}</div>
          <div class="plvl">${'<b></b>'.repeat(lvl)}${'<em></em>'.repeat(max - lvl)}</div>
          <div class="pcost">${lvl >= max ? 'MAXED' : icon('diamond') + ' ' + cost}</div>`;
        c.addEventListener('click', () => {
          if (lvl >= max || META.memory < cost) { sfx('ui_error'); return; }
          META.memory -= cost; META.perks[p.id] = lvl + 1; saveMeta(); sfx('unlock'); const fi = focusIdx; U.spleen(); focusIdx = fi; applyFocus();
        });
        grid.appendChild(c);
      }
      s.appendChild(grid);
      s.appendChild(el('div', 'foot')).appendChild(btn('Back', () => U.title(), 'ghost', 'arrow_back'));
    }, () => U.title());
  };

  /* ======================================================================
     CODEX (Immune Memory)
     ====================================================================== */
  let codexTab = 'pathogens';
  U.codex = function () {
    show('codex', (s) => {
      s.appendChild(el('div', 'hdr', `<h2>Immune Memory</h2><p>The body learns. Every pathogen you kill makes all future cells deal a little more damage to its kind (up to +${META.perks.memtcell ? 20 : 10}%).</p>`));
      const tabs = el('div', 'tabs');
      tabs.appendChild(btn('Pathogens', () => { codexTab = 'pathogens'; const fi = focusIdx; U.codex(); focusIdx = fi; applyFocus(); }, 'chip' + (codexTab === 'pathogens' ? ' sel' : '')));
      tabs.appendChild(btn('Mutations', () => { codexTab = 'mutations'; const fi = focusIdx; U.codex(); focusIdx = fi; applyFocus(); }, 'chip' + (codexTab === 'mutations' ? ' sel' : '')));
      s.appendChild(tabs);
      const grid = el('div', 'codex-grid');
      if (codexTab === 'pathogens') {
        for (const id in ENEMIES) {
          const d = ENEMIES[id], k = META.codex[id] || 0;
          const known = k > 0;
          const bonus = Math.round(Math.min(META.perks.memtcell ? 0.2 : 0.1, k * (META.perks.memtcell ? 0.002 : 0.001)) * 1000) / 10;
          grid.appendChild(el('div', 'centry' + (known ? '' : ' unknown'), known
            ? `<div class="cdot" style="--c:${d.color}"></div><div><b>${d.name}</b><span class="dim">${k} killed · +${bonus}% dmg</span><p>${d.lore}</p></div>`
            : `<div class="cdot"></div><div><b>???</b><span class="dim">not yet encountered</span></div>`));
        }
        for (const id in BOSSES) {
          const b = BOSSES[id], known = !!(META.seenBoss && META.seenBoss[id]) || (META.stats.bestFloor || 0) > Object.keys(BOSSES).indexOf(id) + 1;
          grid.appendChild(el('div', 'centry boss' + (known ? '' : ' unknown'), known ? `<div class="cdot" style="--c:${b.color}"></div><div><b>${b.name}</b><span class="dim">boss</span><p>${b.title}.</p></div>` : `<div class="cdot"></div><div><b>???</b><span class="dim">boss</span></div>`));
        }
      } else {
        for (const m of MUTATIONS) {
          const seen = META.seenMut[m.id];
          grid.appendChild(el('div', 'centry mut' + (seen ? '' : ' unknown'), seen
            ? `<div class="mico" style="--r:${RARITY[m.rarity].color}">${icon(m.icon)}</div><div><b style="color:${RARITY[m.rarity].color}">${m.name}</b><span class="dim">${RARITY[m.rarity].name.toLowerCase()}</span><p>${m.desc}</p></div>`
            : `<div class="mico">${icon('help')}</div><div><b>???</b><span class="dim">${RARITY[m.rarity].name.toLowerCase()}</span></div>`));
        }
      }
      s.appendChild(grid);
      s.appendChild(el('div', 'foot')).appendChild(btn('Back', () => U.title(), 'ghost', 'arrow_back'));
    }, () => U.title());
  };

  /* ======================================================================
     HOW TO PLAY
     ====================================================================== */
  U.howTo = function () {
    show('howto', (s) => {
      s.appendChild(el('div', 'hdr', '<h2>How to play</h2>'));
      s.appendChild(el('div', 'howto', `
        <div class="hcol"><h3>The goal</h3><p>Fight from the Veins to the Wound and destroy <b>SEPSIS</b>. Every region ends with a boss. Doors lock until a room is clean.</p>
        <h3>Mutations</h3><p>Mutation cysts let you <b>choose 1 of 3</b> upgrades. They stack and combine — some pairs trigger named <b class="gold">synergies</b>.</p>
        <p><b class="mal">Tumors</b> offer malignant mutations: huge power, paid with max HP.</p>
        <h3>Supplies</h3><p><b class="iron">Iron</b> drops from pathogens — spend it at the <b class="green">Lymph Node</b>. <b>Platelets</b> heal. <b class="blue">Mucus</b> blocks one hit.</p></div>
        <div class="hcol"><h3>Controls</h3>
        <table class="ctl"><tr><th></th><th>${icon('keyboard')}</th><th>${icon('sports_esports')}</th></tr>
        <tr><td>Move</td><td>WASD</td><td>Left stick</td></tr>
        <tr><td>Aim / fire</td><td>Mouse + LMB, or arrows</td><td>Right stick / RT</td></tr>
        <tr><td>Dash</td><td>Space / Shift / RMB</td><td>A / LB</td></tr>
        <tr><td>Ability</td><td>Q</td><td>RB / X</td></tr>
        <tr><td>Interact</td><td>E</td><td>Y</td></tr>
        <tr><td>Pause</td><td>Esc / P</td><td>Start</td></tr></table>
        <p class="dim">Dashing makes you briefly invulnerable. Every enemy attack has a tell — a shudder, a glow, or a marker on the floor.</p>
        <p class="dim">Dying is part of it. The Spleen remembers: spend memory on permanent upgrades between runs.</p></div>`));
      s.appendChild(el('div', 'foot')).appendChild(btn('Back', () => U.title(), 'ghost', 'arrow_back'));
    }, () => U.title());
  };

  /* ======================================================================
     OPTIONS
     ====================================================================== */
  // option resolution shared with boot (game.js may define resolveQuality/applyOptions; fall back to boot-identical rules)
  function resolveQ(q) {
    if (typeof resolveQuality === 'function') return resolveQuality(q);
    if (q === 'auto') q = (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4) ? 'medium' : 'high';
    return q;
  }
  function applyOpts(o, opt = {}) {
    if (typeof applyOptions === 'function') { applyOptions(o, opt); }
    else {
      SIM.opts.dmgNumbers = o.dmgNumbers; Gfx.shakeScale = o.shake; Gfx.reduceFlash = !o.flashes;
      const touchy = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      Input.touchEnabled = o.touch === 'on' || (o.touch === 'auto' && touchy && matchMedia('(pointer: coarse)').matches);
      document.body.classList.toggle('touch', Input.touchEnabled);
      if (opt.quality) { try { Gfx.setQuality(resolveQ(o.quality)); } catch (e) { } }
      try { if (window.AUDIO) { AUDIO.setVolume('master', o.master); AUDIO.setVolume('music', o.music); AUDIO.setVolume('sfx', o.sfx); } } catch (e) { }
    }
    touchEl.classList.toggle('on', Input.touchEnabled && hudEl.classList.contains('on'));
  }
  U.options = function (back, inModal, refresh) {
    const o = META.opts;
    const build = (s) => {
      s.appendChild(el('div', 'hdr', '<h2>Options</h2>'));
      const list = el('div', 'opts');
      const slider = (label, key, apply) => {
        const row = el('div', 'orow', `<label>${label}</label>`);
        const inp = el('input', 'ui-interactive'); inp.type = 'range'; inp.min = 0; inp.max = 1; inp.step = 0.05; inp.value = o[key];
        const val = el('span', 'oval', Math.round(o[key] * 100) + '%');
        inp.addEventListener('input', () => { o[key] = +inp.value; val.textContent = Math.round(o[key] * 100) + '%'; apply && apply(o[key]); saveMeta(); });
        inp.addEventListener('change', () => sfx('ui_click'));
        row.appendChild(inp); row.appendChild(val); list.appendChild(row);
      };
      const choice = (label, key, values, names, apply) => {
        const row = el('div', 'orow', `<label>${label}</label>`); const g = el('div', 'ochoices');
        values.forEach((v, i) => g.appendChild(btn(names[i], () => { o[key] = v; apply && apply(v); saveMeta(); const fi = focusIdx; U.options(back, inModal, true); focusIdx = fi; applyFocus(); }, 'chip' + (o[key] === v ? ' sel' : ''))));
        row.appendChild(g); list.appendChild(row);
      };
      slider('Master volume', 'master', (v) => { try { AUDIO.setVolume('master', v); } catch (e) { } });
      slider('Music', 'music', (v) => { try { AUDIO.setVolume('music', v); } catch (e) { } });
      slider('Sound effects', 'sfx', (v) => { try { AUDIO.setVolume('sfx', v); sfx('hit'); } catch (e) { } });
      slider('Screen shake', 'shake', (v) => { Gfx.shakeScale = v; });
      choice('Damage numbers', 'dmgNumbers', [true, false], ['On', 'Off'], (v) => { SIM.opts.dmgNumbers = v; });
      choice('Screen flashes', 'flashes', [true, false], ['On', 'Reduced'], (v) => { Gfx.reduceFlash = !v; });
      choice('Graphics', 'quality', ['auto', 'low', 'medium', 'high'], ['Auto', 'Low', 'Medium', 'High'], (v) => { try { Gfx.setQuality(resolveQ(v)); } catch (e) { } });
      choice('Touch controls', 'touch', ['auto', 'on', 'off'], ['Auto', 'On', 'Off'], () => applyOpts(o));
      const row = el('div', 'orow', '<label>Display</label>'); const g = el('div', 'ochoices');
      g.appendChild(btn('Fullscreen', () => { try { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); } catch (e) { } }, 'chip'));
      row.appendChild(g); list.appendChild(row);
      if (!inModal) {
        const r2 = el('div', 'orow', '<label>Save data</label>'); const g2 = el('div', 'ochoices');
        let armed = false;
        const rb = btn('Erase all progress', () => { if (!armed) { armed = true; rb.querySelector('span').textContent = 'Press again to confirm'; return; } META = defaultMeta(); window.META = META; if (window.__SPLEEN) window.__SPLEEN.META = META; saveMeta(); applyOpts(META.opts, { quality: true }); U.options(back); }, 'chip danger');
        g2.appendChild(rb); r2.appendChild(g2); list.appendChild(r2);
      }
      s.appendChild(list);
      s.appendChild(el('div', 'foot')).appendChild(btn('Back', back, 'ghost', 'arrow_back'));
    };
    if (inModal) openModal('options', build, back, refresh); else show('options', build, back);
  };

  /* ======================================================================
     MODALS (pause, choice, shop, tumor)
     ====================================================================== */
  // refresh: re-render of an already open modal (no pop animation / open sound / confirm lock reset)
  function openModal(name, build, back, refresh) {
    modalEl.innerHTML = ''; modalEl.className = 'modal on m-' + name + (refresh ? ' refresh' : '');
    const box = el('div', 'mbox'); if (refresh) box.style.animation = 'none';
    build(box); modalEl.appendChild(box);
    backAction = back || null; focusIdx = 0; current = current || null; Input.resetNav && Input.resetNav();
    if (!refresh) { openedAt = performance.now(); lockFor = (name === 'pause' || name === 'options') ? 0 : 350; }
    requestAnimationFrame(applyFocus);
    if (!refresh) sfx('ui_open', { vol: 0.6 });
  }
  U.closeModal = function () { if (!modalEl) return; modalEl.className = 'modal'; modalEl.innerHTML = ''; backAction = null; U.keyHandler = null; U.autoPick = null; hideTip(); };

  U.inPauseSubmenu = function () { return !!modalEl && modalEl.classList.contains('on') && !modalEl.classList.contains('m-pause'); };
  U.pause = function (on) {
    if (!on) { U.closeModal(); return; }
    const P = SIM.player, run = SIM.run;
    openModal('pause', (b) => {
      b.appendChild(el('div', 'hdr', `<h2>Paused</h2><p>${SIM.floor.region.name} · ${fmtTime((performance.now() - run.startTime) / 1000 - (run.pausedTime || 0))} · ${run.stats.kills} kills</p>`));
      const cols = el('div', 'pcols');
      const menu = el('div', 'menu');
      menu.appendChild(btn('Resume', () => togglePause(), 'big', 'play_arrow'));
      menu.appendChild(btn('Options', () => U.options(() => U.pause(true), true), '', 'settings'));
      let armed = false;
      const ab = btn('Abandon run', () => { if (!armed) { armed = true; ab.querySelector('span:not(.ms)').textContent = 'Confirm abandon'; return; } abandonRun(); }, 'danger', 'close');
      menu.appendChild(ab);
      cols.appendChild(menu);
      cols.appendChild(buildPanel(P));
      b.appendChild(cols);
    }, () => togglePause());
  };
  function buildPanel(P) {
    const st = P.st, d = P.strain;
    const wrap = el('div', 'build');
    const rate = P.fireRate();
    wrap.appendChild(el('div', 'bstats', `
      <div><span>Damage</span><b>${P.baseDmg().toFixed(1)}</b></div>
      <div><span>${d.weapon === 'lance' ? 'Charge/s' : 'Fire rate'}</span><b>${rate.toFixed(2)}</b></div>
      <div><span>Range</span><b>${P.range().toFixed(1)}</b></div>
      <div><span>Speed</span><b>${P.speed().toFixed(1)}</b></div>
      <div><span>Shot speed</span><b>${P.shotSpeed().toFixed(1)}</b></div>
      <div><span>Crit</span><b>${Math.round(st.crit * 100)}%</b></div>`));
    const list = el('div', 'blist');
    const counts = {};
    for (const id of P.mutations) counts[id] = (counts[id] || 0) + 1;
    if (!P.mutations.length) list.appendChild(el('div', 'dim', 'No mutations yet.'));
    for (const id in counts) {
      const m = MUT[id];
      list.appendChild(el('div', 'bitem', `<div class="mico" style="--r:${RARITY[m.rarity].color}">${icon(m.icon)}</div><div><b style="color:${RARITY[m.rarity].color}">${m.name}${counts[id] > 1 ? ' x' + counts[id] : ''}</b><p>${m.desc}</p></div>`));
    }
    const syn = Object.keys(P.synergies);
    for (const sid of syn) { const s = SYNERGIES.find(x => x.id === sid); list.appendChild(el('div', 'bitem syn', `<div class="mico" style="--r:#ffd36b">${icon('auto_awesome')}</div><div><b class="gold">${s.name}</b><p>${s.desc}</p></div>`)); }
    wrap.appendChild(list);
    return wrap;
  }
  function mutCard(m, extra = '') {
    const r = RARITY[m.rarity];
    return `<div class="rar" style="color:${r.color}">${r.name}</div><div class="mbig" style="--r:${r.color}">${icon(m.icon)}</div><div class="mname">${m.name}</div><div class="mdesc">${m.desc}</div>${extra}`;
  }
  U.choice = function (o) {
    openModal('choice', (b) => {
      b.appendChild(el('div', 'hdr', `<h2>${o.title}</h2><p>${o.sub}</p>`));
      const row = el('div', 'cards choice');
      o.options.forEach((m, i) => {
        const owned = SIM.player.counts[m.id] || 0;
        const c = el('div', 'card mcard ui-interactive', mutCard(m, `${owned ? `<div class="owned">owned x${owned}</div>` : ''}<div class="key">${i + 1}</div>`));
        c.style.setProperty('--r', RARITY[m.rarity].color);
        c.addEventListener('click', () => o.onPick(m.id));
        row.appendChild(c);
      });
      b.appendChild(row);
      const foot = el('div', 'foot');
      if (o.rerolls > 0) foot.appendChild(btn(`Reroll (${o.rerolls})`, () => o.onReroll(), 'ghost', 'casino'));
      foot.appendChild(btn(`Dissolve for ${o.skipIron} iron`, () => o.onSkip(), 'ghost', 'diamond'));
      b.appendChild(foot);
    }, null);
    U.keyHandler = () => { for (let i = 0; i < o.options.length; i++) if (Input.isDown('Digit' + (i + 1)) && !U._kd) { U._kd = true; o.onPick(o.options[i].id); return; } if (![1, 2, 3, 4].some(i => Input.isDown('Digit' + i))) U._kd = false; };
    U.autoPick = () => o.onPick(o.options[0].id);
  };
  U.shop = function (o) {
    const refresh = modalEl.classList.contains('on') && modalEl.classList.contains('m-shop');
    const keep = refresh ? focusIdx : 0;
    openModal('shop', (b) => {
      b.appendChild(el('div', 'hdr', `<h2>Lymph Node</h2><p>A friendly dendritic cell. It wants iron. <b class="iron">${icon('diamond')} ${Math.floor(o.iron)}</b></p>`));
      const row = el('div', 'cards shop');
      for (const it of o.stock) {
        let html, poor = o.iron < it.price, dis = it.sold || poor;
        if (it.kind === 'mutation') { const m = MUT[it.id]; html = mutCard(m); }
        else if (it.kind === 'heal') { dis = dis || o.hp >= o.maxHp || o.noHeal; html = `<div class="rar" style="color:#ffc0d0">SUPPLY</div><div class="mbig" style="--r:#ffc0d0">${icon('healing')}</div><div class="mname">PLATELET PACK</div><div class="mdesc">Restore 1 HP.${o.noHeal ? ' (Necrosis blocks healing.)' : ''}</div>`; }
        else { html = `<div class="rar" style="color:#9ad8ff">SUPPLY</div><div class="mbig" style="--r:#9ad8ff">${icon('water_drop')}</div><div class="mname">MUCUS GLAND</div><div class="mdesc">+1 Mucus. Absorbs one hit.</div>`; }
        const c = el('div', 'card mcard ui-interactive' + (it.sold ? ' sold' : '') + (dis && !it.sold ? ' poor' : ''), html + `<div class="price">${it.sold ? 'SOLD' : icon('diamond') + ' ' + it.price}</div>`);
        if (it.kind === 'mutation') c.style.setProperty('--r', RARITY[MUT[it.id].rarity].color);
        c.addEventListener('click', () => o.onBuy(it));
        row.appendChild(c);
      }
      b.appendChild(row);
      b.appendChild(el('div', 'foot')).appendChild(btn('Leave', () => o.onClose(), 'ghost', 'arrow_back'));
    }, () => o.onClose(), refresh);
    focusIdx = keep; requestAnimationFrame(applyFocus);
    U.autoPick = () => o.onClose();
  };
  U.tumor = function (o) {
    openModal('tumor', (b) => {
      b.appendChild(el('div', 'hdr', `<h2 class="mal">Tumor</h2><p>It offers growth without limits. It wants something back.</p>`));
      const row = el('div', 'cards choice');
      o.options.forEach((m) => {
        const can = o.maxHp - m.cost >= 1;
        const c = el('div', 'card mcard malig ui-interactive' + (can ? '' : ' poor disabled'), mutCard(m, `<div class="price cost">${icon('heart_broken')} −${m.cost} MAX HP</div>`));
        c.style.setProperty('--r', RARITY.malignant.color);
        c.addEventListener('click', () => o.onPick(m.id));
        row.appendChild(c);
      });
      b.appendChild(row);
      b.appendChild(el('div', 'foot')).appendChild(btn('Refuse', () => o.onClose(), 'ghost', 'close'));
    }, () => o.onClose());
    U.autoPick = () => o.onClose();
  };

  /* ======================================================================
     SUMMARY
     ====================================================================== */
  U.summary = function (run, won, abandoned) {
    U.closeModal();
    const P = SIM.player;
    show('summary', (s) => {
      const title = won ? 'SEPSIS CONTAINED' : abandoned ? 'RUN ABANDONED' : 'THE HOST WEAKENS';
      const sub = won ? 'The fever breaks. The body will live.' : 'Your cell is gone. The Spleen remembers.';
      s.appendChild(el('div', 'hdr big ' + (won ? 'won' : 'lost'), `<h1>${title}</h1><p>${sub}</p>`));
      const g = el('div', 'sumgrid');
      const d = STRAINS[run.strain];
      const stats = [
        ['Strain', d.name], ['Reached', REGIONS[run.floorIdx].name], ['Time', fmtTime(run.time || 0)], ['Kills', run.stats.kills],
        ['Rooms cleared', run.stats.roomsCleared], ['Bosses', run.stats.bossesKilled], ['Mutations', P ? P.mutations.length : 0], ['Hits taken', run.stats.hitsTaken],
      ];
      if (run.fever) stats.push(['Fever', FEVER[run.fever].name]);
      for (const [k, v] of stats) g.appendChild(el('div', 'sstat', `<span>${k}</span><b>${v}</b>`));
      s.appendChild(g);
      s.appendChild(el('div', 'memgain', `${icon('diamond')} <b>+${run.memory || 0}</b> memory <span class="dim">(${META.memory} total)</span>`));
      if (run.newUnlocks.length) s.appendChild(el('div', 'unlocks', run.newUnlocks.map(k => `<div>${icon('lock_open')} <b>${UNLOCKS[k].name}</b> unlocked</div>`).join('')));
      if (P && P.mutations.length) {
        const mrow = el('div', 'sum-muts');
        for (const id of P.mutations) { const m = MUT[id]; mrow.appendChild(el('div', 'mchip', icon(m.icon))).style.setProperty('--r', RARITY[m.rarity].color); }
        s.appendChild(mrow);
      }
      const foot = el('div', 'foot');
      foot.appendChild(btn('Again', () => startRun(run.strain, run.fever), 'big', 'refresh'));
      foot.appendChild(btn('Main menu', () => toTitle(), 'ghost', 'home'));
      s.appendChild(foot);
    }, () => toTitle());
  };

  /* ======================================================================
     HUD
     ====================================================================== */
  const ABILITY_ICON = { net: 'hub', engulf: 'blur_circular', mark: 'target', swarm: 'scatter_plot' };
  U.roomChanged = function () { hudCache.mm = null; drawMinimap(); };
  U.hudFrame = function (dt) {
    const P = SIM.player, run = SIM.run; if (!P) return;
    // HP pips
    const hpKey = P.hp + '/' + P.st.maxHp + '/' + P.shield + '/' + P.color;
    if (hudCache.hp !== hpKey) {
      hudCache.hp = hpKey;
      let h = '';
      for (let i = 0; i < P.st.maxHp; i++) h += `<i class="pip ${i < P.hp ? 'full' : 'empty'}" style="--c:${P.color}"></i>`;
      for (let i = 0; i < P.shield; i++) h += `<i class="pip shield"></i>`;
      $('#hp').innerHTML = h;
      $('#hp').classList.toggle('low', P.hp <= 1);
    }
    const ironKey = Math.floor(P.iron);
    if (hudCache.iron !== ironKey) { hudCache.iron = ironKey; $('#iron').textContent = ironKey; $('#ironbox').classList.remove('bump'); void $('#ironbox').offsetWidth; $('#ironbox').classList.add('bump'); }
    // ability
    const ab = P.strain.ability, frac = P.abilityT > 0 ? 1 - P.abilityT / P.abilityMax : 1;
    if (hudCache.ab !== ab) { hudCache.ab = ab; $('#abil-ico').innerHTML = icon(ABILITY_ICON[ab]); $('#abil-name').textContent = P.strain.abilityName; }
    const abEl = $('#abil');
    abEl.style.setProperty('--f', (frac * 360).toFixed(1) + 'deg');
    abEl.classList.toggle('ready', frac >= 1);
    const akey = Input.device === 'pad' ? 'RB' : Input.device === 'touch' ? '' : 'Q';
    if (hudCache.akey !== akey) { hudCache.akey = akey; $('#abil-key').textContent = akey; }
    // dash pip
    $('#dash').style.setProperty('--d', (1 - P.dashCd / (DASH_CD * P.st.dashCdMult)).toFixed(3));
    // charge bar for lance
    const cb = $('#charge'); if (P.strain.weapon === 'lance' && P.chargeHeld) { cb.classList.add('on'); cb.style.setProperty('--c', P.charge.toFixed(3)); cb.classList.toggle('full', P.charge >= 0.98); } else cb.classList.remove('on');
    // region
    const rk = SIM.floor.idx;
    if (hudCache.region !== rk) { hudCache.region = rk; $('#region').innerHTML = `<b>${SIM.floor.region.name}</b><span>${rk + 1} / ${REGIONS.length}${run.fever ? ' · ' + FEVER[run.fever].name : ''}</span>`; }
    // mutations
    const mk = P.mutations.join(',');
    if (hudCache.muts !== mk) {
      hudCache.muts = mk;
      const counts = {}; for (const id of P.mutations) counts[id] = (counts[id] || 0) + 1;
      $('#mutlist').innerHTML = Object.keys(counts).map(id => { const m = MUT[id]; return `<div class="mchip" data-id="${id}" style="--r:${RARITY[m.rarity].color}">${icon(m.icon)}${counts[id] > 1 ? `<i>${counts[id]}</i>` : ''}</div>`; }).join('');
    }
    // boss bar
    const B = SIM.boss;
    if (B && !B.dead && Game.sub !== 'intro') {
      bossEl.classList.add('on');
      const f = clamp(B.hp / B.maxHp, 0, 1);
      $('#boss-fill').style.width = (f * 100) + '%';
      hudCache.lag = hudCache.lag == null ? f : Math.max(f, hudCache.lag - dt * 0.35);
      $('#boss-lag').style.width = (hudCache.lag * 100) + '%';
      if (hudCache.bossName !== B.bossId) { hudCache.bossName = B.bossId; $('#boss-name').textContent = BOSSES[B.bossId].name; }
      // phase ticks
      const marks = (B.phaseMarks || []).join(',');
      if (hudCache.marks !== marks) { hudCache.marks = marks; $('#boss-marks').innerHTML = (B.phaseMarks || []).map(m => `<i style="left:${m * 100}%"></i>`).join(''); }
    } else bossEl.classList.remove('on');
    // interact prompt
    const near = SIM.nearInteract;
    let pr = '';
    if (near && Game.sub === 'room') {
      const key = Input.device === 'pad' ? 'Y' : Input.device === 'touch' ? 'TAP' : 'E';
      pr = `<b>${key}</b> ${near.kind === 'portal' ? 'enter' : near.kind === 'shop' ? 'trade' : 'open'}`;
    }
    if (hudCache.prompt !== pr) {
      hudCache.prompt = pr;
      if (pr) promptEl.innerHTML = pr; // keep old text while fading out
      promptEl.classList.toggle('on', !!pr);
      touchEl.querySelector('[data-t=interact]').classList.toggle('avail', !!pr);
    }
    // low hp vignette
    $('#lowhp').classList.toggle('on', P.hp <= 1 && !P.dead);
    $('#hurt').style.opacity = clamp(P.hurtFlash / 0.3, 0, 1) * (META.opts.flashes ? 0.8 : 0.35);
    // touch sticks
    if (Input.touchEnabled) drawTouch();
    if (!hudCache.mm) drawMinimap();
  };
  function drawTouch() {
    const T = Input.touch;
    const ms = $('#stick-l'), as = $('#stick-r');
    if (T.move) { ms.style.display = 'block'; ms.style.left = T.move.ox + 'px'; ms.style.top = T.move.oy + 'px'; ms.firstChild.style.transform = `translate(${clamp(T.moveVec.x, -60, 60)}px,${clamp(T.moveVec.y, -60, 60)}px)`; } else ms.style.display = 'none';
    if (T.aim) { as.style.display = 'block'; as.style.left = T.aim.ox + 'px'; as.style.top = T.aim.oy + 'px'; as.firstChild.style.transform = `translate(${clamp(T.aimVec.x, -60, 60)}px,${clamp(T.aimVec.y, -60, 60)}px)`; } else as.style.display = 'none';
  }
  function drawMinimap() {
    const floor = SIM.floor; if (!floor || !mmCtx) return;
    hudCache.mm = true;
    const c = mmCtx, W = mmCanvas.width, H = mmCanvas.height;
    c.clearRect(0, 0, W, H);
    // bounds of seen rooms
    let minx = 99, miny = 99, maxx = -99, maxy = -99;
    for (const r of floor.rooms) if (r.seen) for (const [x, y] of r.cells) { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); }
    const cs = Math.min(26, (W - 16) / (maxx - minx + 1), (H - 16) / (maxy - miny + 1));
    const ox = (W - (maxx - minx + 1) * cs) / 2 - minx * cs, oy = (H - (maxy - miny + 1) * cs) / 2 - miny * cs;
    const ICON = { boss: ['#ff3b4f', 'skull'], shop: ['#7dffb0', '$'], mutation: ['#ffd36b', '★'], tumor: ['#c06bff', '◆'], elite: ['#ff9a3a', '!'] };
    for (const r of floor.rooms) {
      if (!r.seen) continue;
      const x = ox + r.cx0 * cs + 2, y = oy + r.cy0 * cs + 2, w = r.cw * cs - 4, h = r.ch * cs - 4;
      const cur = r === SIM.room;
      c.fillStyle = cur ? 'rgba(255,255,255,0.92)' : r.visited ? (r.cleared ? 'rgba(200,190,210,0.55)' : 'rgba(255,90,110,0.55)') : 'rgba(80,70,90,0.45)';
      c.strokeStyle = cur ? '#ffffff' : 'rgba(255,255,255,0.25)'; c.lineWidth = 1.5;
      roundRectC(c, x, y, w, h, 4); c.fill(); c.stroke();
      const ic = ICON[r.type];
      if (ic) {
        c.fillStyle = cur ? '#000' : ic[0]; c.font = `bold ${Math.round(cs * 0.5)}px "JetBrains Mono", monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
        if (ic[1] === 'skull') { c.beginPath(); c.arc(x + w / 2, y + h / 2 - 1, cs * 0.18, 0, TAU); c.fill(); c.fillRect(x + w / 2 - cs * 0.1, y + h / 2, cs * 0.2, cs * 0.16); }
        else c.fillText(ic[1], x + w / 2, y + h / 2 + 1);
      }
    }
  }
  function roundRectC(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  // tooltip for HUD mutation chips
  function showTip(t) { const m = MUT[t.dataset.id]; if (!m) return; const tip = $('#tip'); tip.innerHTML = `<b style="color:${RARITY[m.rarity].color}">${m.name}</b><p>${m.desc}</p>`; const r = t.getBoundingClientRect(); tip.style.left = r.left + 'px'; tip.style.top = (r.top - 8) + 'px'; tip.classList.add('on'); }
  function hideTip() { const t = $('#tip'); if (t) t.classList.remove('on'); }

  /* ---------------- toasts, banners ---------------- */
  U.toast = function (title, desc, kind = '', hex) {
    const t = el('div', 'toast ' + kind, `<b ${hex ? `style="color:${hex}"` : ''}>${title}</b>${desc ? `<span>${desc}</span>` : ''}`);
    toastsEl.appendChild(t);
    while (toastsEl.children.length > 4) toastsEl.firstChild.remove();
    setTimeout(() => t.classList.add('out'), kind === 'clear' || kind === 'small' ? 1100 : 3200);
    setTimeout(() => t.remove(), kind === 'clear' || kind === 'small' ? 1500 : 3700);
  };
  U.floorBanner = function (region, idx) {
    bannerEl.innerHTML = `<div class="b-num">REGION ${ROMAN[idx]}</div><div class="b-name">${region.name}</div><div class="b-sub">${region.sub}</div>`;
    bannerEl.className = 'banner'; void bannerEl.offsetWidth; bannerEl.className = 'banner on';
  };
  U.bossIntro = function (def) {
    bannerEl.innerHTML = `<div class="b-num">${def.title.toUpperCase()}</div><div class="b-name boss">${def.name}</div>`;
    bannerEl.className = 'banner'; void bannerEl.offsetWidth; bannerEl.className = 'banner on boss';
    document.body.classList.add('letterbox'); setTimeout(() => document.body.classList.remove('letterbox'), 2300);
  };
  U.hideBoss = function () { bossEl.classList.remove('on'); hudCache.lag = null; };

  Bus.on('mutation', (m) => U.toast(m.name, m.desc, 'mut', RARITY[m.rarity].color));
  Bus.on('synergy', (s) => { U.toast('SYNERGY · ' + s.name, s.desc, 'syn', '#ffd36b'); sfx('unlock', { vol: 0.6 }); });
  Bus.on('playerHurt', () => { hudCache.hp = null; });
  Bus.on('revive', () => U.toast('REVIVED', 'A second chance. Do not waste it.', 'syn', '#ffffff'));
  return U;
})();

/* ==========================================================================
   TITLE SCENE (living background behind the menus)
   ========================================================================== */
const TitleScene = { room: null, decor: [], t: 0 };
function setupTitleScene() {
  clearTitleScene();
  clearWorld(true);
  const ridx = clamp((META.stats.bestFloor || 1) - 1, 0, 5);
  const region = REGIONS[ridx];
  const W = 17, H = 11, grid = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x === 0 || y === 0 || x === W - 1 || y === H - 1) grid[y * W + x] = T_WALL;
  const room = { id: -1, type: 'start', W, H, grid, doors: [], seed: 4242 + ridx, region, cells: [[0, 0]], clotHp: {} };
  room.floorCanvas = Gfx.paintFloor(room, region, room.seed);
  Gfx.setRegion(region); Gfx.buildRoom(room, region); Gfx.setCameraBounds(W, H, false);
  TitleScene.room = room; TitleScene.decor = []; TitleScene.region = region;
  SIM.room = room;
  const types = region.pool.map(p => p[0]).filter(t => ENEMY_VIS[t]).slice(0, 4);
  for (let i = 0; i < 7; i++) {
    const type = types[i % types.length];
    const def = ENEMIES[type];
    const e = { id: 9000 + i, type, r: def.r, color: def.color, core: def.core, data: { hist: [], size: 2, ph: 0 }, vx: 0, vy: 0, facing: 0, state: 0, t: 0, cd: 1, x: rnd(3, 14), y: rnd(2.5, 8.5), dead: false };
    const vis = ENEMY_VIS[type](e);
    e.vis = vis; e.node = vis.root;
    const a = rnd(0, TAU); e.vx = Math.cos(a) * 0.5; e.vy = Math.sin(a) * 0.5; e.facing = a;
    TitleScene.decor.push(e);
  }
  const strain = STRAINS[META.lastStrain] || STRAINS.neutrophil;
  TitleScene.hero = buildPlayerVis(strain); TitleScene.heroDef = strain;
  TitleScene.heroP = { x: 11.5, y: 5.8, vx: 0, vy: 0, aimAng: Math.PI, invulnT: 0, hurtFlash: 0, dead: false, dashT: 0, chargeHeld: false, charge: 0, vis: TitleScene.hero, recoil: 0 };
  Gfx.updateCamera(8.5, 5.5, 0, true);
}
function renderTitle(dt) {
  if (!TitleScene.room) return;
  TitleScene.t += dt; SIM.time += dt;
  const t = TitleScene.t, room = TitleScene.room;
  for (const e of TitleScene.decor) {
    e.x += e.vx * dt; e.y += e.vy * dt;
    if (e.x < 2 || e.x > 15) e.vx *= -1; if (e.y < 2 || e.y > 9) e.vy *= -1;
    e.facing = Math.atan2(e.vy, e.vx);
    e.node.position.set(e.x, 0, -e.y);
    if (e.vis.anim) e.vis.anim(e, SIM.time, dt);
  }
  const H = TitleScene.heroP;
  H.aimAng = Math.PI + Math.sin(t * 0.6) * 0.8; H.x = 11.5 + Math.sin(t * 0.4) * 0.6; H.y = 5.8 + Math.cos(t * 0.5) * 0.4;
  animatePlayerVis(H, dt);
  Gfx.setPlayerLight(H.x, H.y, TitleScene.heroDef.color, 1.2);
  Gfx.updateCamera(8.5 + Math.sin(t * 0.12) * 0.6, 5.5 + Math.cos(t * 0.1) * 0.3, dt, false);
  Gfx.beginPools();
  for (const e of TitleScene.decor) Gfx.pools.shadow.push(e.x, 0.01, -e.y, e.r * 1.3, 1, e.r * 1.3);
  Gfx.pools.shadow.push(H.x, 0.01, -H.y, 0.6, 1, 0.6);
  // drifting motes
  if (Math.random() < dt * 20) SIM.particles.push({ x: rnd(1, 16), y: rnd(1, 10), h: rnd(0.2, 1.5), vx: rnd(-0.3, 0.3), vy: rnd(-0.3, 0.3), vh: rnd(0.1, 0.4), life: rnd(2, 4), t: 0, size: rnd(0.02, 0.05), hex: TitleScene.region.pal.speck, grav: 0, drag: 0 });
  updateParticles(dt);
  for (const p of SIM.particles) { const k = 1 - p.t / p.life; Gfx.particlePool(p.hex).push(p.x, p.h, -p.y, p.size * k, p.size * k, p.size * k); }
  Gfx.endPools();
  Gfx.updateRoom(dt);
  Gfx.render(dt);
  Gfx.drawOverlay(dt);
}
function clearTitleScene() {
  for (const e of TitleScene.decor) { if (e.vis.dispose) e.vis.dispose(); e.node.dispose(); }
  TitleScene.decor = [];
  if (TitleScene.hero) { TitleScene.hero.root.dispose(); TitleScene.hero = null; }
  TitleScene.room = null;
}
