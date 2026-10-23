/* What Derry Keeps — menus, notebook, map hub, saves, settings, summary. */
(function () {
  'use strict';
  const E = window.ENGINE;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = E.esc, store = E.store, snd = E.snd;
  const UI = window.UI = {};
  let audioStarted = false;
  async function startAudio() {
    if (audioStarted) return;
    audioStarted = true;
    try { if (window.SND && SND.init) { await SND.init(); E.applyAudioSettings(); } } catch (e) { console.warn(e); }
  }

  /* ---------- screens ---------- */
  function open(id) { $$('.screen.on').forEach((s) => { if (s.id !== id && s.id !== 'title') s.classList.remove('on'); }); $('#' + id).classList.add('on'); snd('sfx', 'page', { volume: 0.5 }); }
  function close(id) { $('#' + id).classList.remove('on'); }
  UI.closeAll = (silent) => { $$('.screen.on').forEach((s) => { if (s.id !== 'title') s.classList.remove('on'); }); if (!silent) snd('sfx', 'page', { volume: 0.4 }); };
  UI.hideTitle = () => close('title');
  $$('[data-close]').forEach((b) => b.addEventListener('click', () => { const s = b.closest('.screen'); s.classList.remove('on'); snd('sfx', 'page', { volume: 0.4 }); }));

  UI.confirm = (msg, yes = 'OK', no = 'Cancel') => new Promise((resolve) => {
    const c = $('#confirm');
    $('#c-msg').textContent = msg; $('#c-yes').textContent = yes; $('#c-no').textContent = no;
    c.classList.add('on');
    const done = (v) => { c.classList.remove('on'); $('#c-yes').onclick = $('#c-no').onclick = null; resolve(v); };
    $('#c-yes').onclick = () => done(true); $('#c-no').onclick = () => done(false);
    setTimeout(() => $('#c-yes').focus(), 30);
  });

  /* ---------- title ---------- */
  UI.boot = function () {
    const art = $('#title .art');
    const r = window.KIT && (KIT.renderBg('title') || KIT.renderBg('standpipe', 'quiet') || KIT.renderBg('larch_ext', 'night'));
    art.innerHTML = r ? r.svg : '';
    const auto = store.get('save.auto', null);
    $('#t-continue').disabled = !auto;
    $('#t-chapters').hidden = !(store.get('chapters', []).length > 1);
    $('#t-new').onclick = async () => { await startAudio(); snd('sfx', 'select'); open('notes'); snd('music', 'title', { fade: 3 }); };
    $('#n-back').onclick = () => close('notes');
    $('#n-go').onclick = async () => {
      await startAudio();
      if (store.get('save.auto', null)) { const ok = await UI.confirm('Start over from the beginning? Your autosave will be replaced when you reach the next chapter.', 'Start over'); if (!ok) return; }
      close('notes'); close('title'); snd('music', null, { fade: 2 }); E.newGame();
    };
    $('#t-continue').onclick = async () => { await startAudio(); const d = store.get('save.auto', null); if (!d) return; E.ensureStory(); close('title'); E.restore(d); };
    $('#t-load').onclick = async () => { await startAudio(); E.ensureStory(); UI.openSaves('load'); };
    $('#t-chapters').onclick = async () => { await startAudio(); E.ensureStory(); UI.openChapters(); };
    $('#t-settings').onclick = () => { startAudio(); UI.openSettings(); };
    $('#b-journal').onclick = (e) => { e.stopPropagation(); UI.openJournal(); };
    $('#b-log').onclick = (e) => { e.stopPropagation(); UI.openLog(); };
    $('#b-save').onclick = (e) => { e.stopPropagation(); UI.openSaves('save'); };
    $('#b-menu').onclick = (e) => { e.stopPropagation(); UI.openSettings(); };
    $('#set-title').onclick = async () => { const ok = await UI.confirm('Quit to the title screen? Progress since your last save will be lost.', 'Quit'); if (!ok) return; UI.toTitle(); };
    $('#sum-title').onclick = () => UI.toTitle();
    $('#s-mode-save').onclick = () => UI.openSaves('save');
    $('#s-mode-load').onclick = () => UI.openSaves('load');
    $('#s-copy').onclick = () => {
      const box = $('#s-code');
      if (!E.story || !E.eng) { box.value = ''; return; }
      try { box.value = btoa(unescape(encodeURIComponent(JSON.stringify(E.serialize())))); } catch (e) { box.value = ''; }
      box.select();
      try { navigator.clipboard.writeText(box.value).then(() => E.toast('Save code copied'), () => {}); } catch (e) { /* selection fallback */ }
    };
    $('#s-paste').onclick = async () => {
      const v = $('#s-code').value.trim();
      if (!v) return;
      try { const d = JSON.parse(decodeURIComponent(escape(atob(v)))); E.ensureStory(); close('title'); UI.closeAll(true); E.restore(d); }
      catch (e) { E.toast('That code is not a save from this game.', 'remember'); }
    };
    setTimeout(() => $('#t-new').focus(), 50);
  };
  UI.toTitle = function () {
    E.runToken++;
    UI.closeAll(true);
    $('#hud').hidden = true; $('#dialogue').hidden = true; $('#choices').hidden = true; $('#freeform').hidden = true; $('#map').classList.remove('on');
    snd('music', 'title', { fade: 2 }); snd('ambience', null); snd('weather', null); snd('heartbeat', null); snd('tape', false);
    E.weather(null);
    $('#title').classList.add('on');
    UI.boot();
  };

  /* ---------- keys ---------- */
  UI.onKey = function (e) {
    const k = e.key;
    if (k === 'Escape') {
      if ($('#confirm.on')) { $('#c-no').click(); return true; }
      const on = $$('.screen.on').filter((s) => s.id !== 'title');
      if (on.length) { UI.closeAll(); return true; }
      if (!$('#title.on')) { UI.openSettings(); return true; }
      return false;
    }
    if ($('#title.on') || $('#confirm.on')) return false;
    if (k === 'j' || k === 'J') { if ($('#journal.on')) close('journal'); else UI.openJournal(); return true; }
    if (k === 'l' || k === 'L') { if ($('#log.on')) close('log'); else UI.openLog(); return true; }
    if (k === 's' || k === 'S') { if ($('#saves.on')) close('saves'); else UI.openSaves('save'); return true; }
    return false;
  };

  /* ---------- journal ---------- */
  const TABS = [['people', 'People'], ['clues', 'Clues'], ['tapes', 'Tapes'], ['theories', 'Theories'], ['self', 'Gus']];
  let jtab = 'people';
  const V = (n) => E.v(n);
  UI.openJournal = function (tab) {
    if (!E.eng) return;
    jtab = tab || jtab;
    const tabs = $('#journal .tabs');
    tabs.innerHTML = '';
    for (const [id, label] of TABS) {
      const b = document.createElement('button');
      b.textContent = label; b.setAttribute('role', 'tab'); b.className = id === jtab ? 'on' : '';
      b.setAttribute('aria-selected', id === jtab);
      b.onclick = () => { jtab = id; UI.openJournal(id); };
      tabs.appendChild(b);
    }
    const body = $('#j-body');
    body.innerHTML = renderTab(jtab);
    $$('.tape [data-play]', body).forEach((btn) => btn.addEventListener('click', () => playTape(btn.dataset.play, btn)));
    open('journal');
  };
  function renderTab(t) {
    const D = window.DATA || {};
    const eng = E.eng;
    if (t === 'people') {
      const met = eng.met.filter((id) => D.people && D.people[id] && id !== 'gus');
      if (!met.length) return '<p class="empty">You haven\'t met anyone yet.</p>';
      return '<div class="jgrid">' + met.map((id) => {
        const p = D.people[id];
        let desc = '';
        try { desc = p.describe ? p.describe(V, eng) : p.bio; } catch (e) { desc = p.bio || ''; }
        const mems = (eng.memories[id] || []).slice(-3);
        return `<div class="pcard"><div class="ph">${E.portraitSVG(p.sprite || id, 'neutral')}</div><div style="min-width:0"><h4>${esc(typeof p.name === 'function' ? p.name(V, eng) : p.name)}</h4><div class="role">${esc(p.role || '')}</div><p>${esc(desc)}</p>${mems.map((m) => `<p class="mem">“${esc(m)}”</p>`).join('')}</div></div>`;
      }).join('') + '</div>';
    }
    if (t === 'clues') {
      if (!eng.clues.length) return '<p class="empty">Nothing yet. Derry is good at hiding things.</p>';
      const cats = {};
      for (const id of eng.clues) { const c = (D.clues || {})[id]; if (!c) continue; (cats[c.cat || 'Notes'] = cats[c.cat || 'Notes'] || []).push(c); }
      let h = '';
      const links = (D.links || []).filter((l) => l.need.every((n) => eng.clues.includes(n)));
      if (links.length) h += '<h3 class="jsec">Connections</h3>' + links.map((l) => `<div class="link">${esc(l.text)}</div>`).join('');
      for (const cat of Object.keys(cats)) h += `<h3 class="jsec">${esc(cat)}</h3>` + cats[cat].map((c) => `<div class="clue"><h4>${esc(c.title)}</h4><p>${esc(c.text)}</p>${c.src ? `<div class="src">${esc(c.src)}</div>` : ''}</div>`).join('');
      const total = Object.keys(D.clues || {}).length;
      h += `<p class="empty" style="margin-top:2em">${eng.clues.length} of ${total} clues found.</p>`;
      return h;
    }
    if (t === 'tapes') {
      if (!eng.tapes.length) return '<p class="empty">No recordings yet. Your recorder is in your jacket pocket.</p>';
      return eng.tapes.map((id) => {
        const tp = (D.tapes || {})[id]; if (!tp) return '';
        return `<div class="tape"><div class="cas"></div><div class="tl"><h4>${esc(tp.title)}</h4><div class="td">${esc(tp.when || '')}</div><div class="tx" id="tx-${id}">${esc(tp.desc || '')}</div></div><button class="btn" data-play="${id}">Play</button></div>`;
      }).join('');
    }
    if (t === 'theories') {
      if (!eng.theories.length) return '<p class="empty">You haven\'t written down any theories yet.</p>';
      return eng.theories.map((id) => { const th = (D.theories || {})[id]; return th ? `<div class="theory"><div class="q">${esc(th.q)}</div><div class="a">${esc(th.a)}</div></div>` : ''; }).join('');
    }
    if (t === 'self') {
      let self = { summary: '', lines: [] };
      try { self = D.self ? D.self(V, eng) : self; } catch (e) { /* */ }
      const pair = (l, r, a, b) => {
        const x = (V(a) || 0), y = (V(b) || 0), k = x + y ? y / (x + y) : 0.5;
        return `<div class="traitbar"><span>${l}</span><span class="tb"><i style="left:${(k * 100).toFixed(0)}%"></i></span><span>${r}</span></div>`;
      };
      return `<div class="selfbox"><div class="ph">${(window.KIT && KIT.renderChar('gus', 'neutral')) || ''}</div><div class="txt"><h3 class="jsec">Augusta Marie Brennan</h3><p>${esc(self.summary)}</p>` +
        pair('Careful', 'Bold', 't_careful', 't_bold') + pair('Guarded', 'Warm', 't_careful', 't_warm') + pair('Serious', 'Funny', 't_curious', 't_funny') + pair('Sly', 'Honest', 't_sly', 't_honest') +
        (self.lines || []).map((l) => `<p class="mem">${esc(l)}</p>`).join('') +
        `<p class="empty" style="margin-top:1.2em">Time in Derry: ${Math.floor(E.eng.playtime / 60)} min</p></div></div>`;
    }
    return '';
  }
  async function playTape(id, btn) {
    const tp = (window.DATA.tapes || {})[id];
    const tx = $('#tx-' + id);
    if (!tp || !tx) return;
    btn.disabled = true;
    snd('sfx', 'tape_play');
    snd('tape', true);
    tx.textContent = '';
    for (const [who, line] of tp.lines || []) {
      if (!$('#journal.on')) break;
      if (who && who !== '-') snd('voice', Math.min(5, 1 + line.length / 18), who === 'june' ? 'girl' : who === 'memere' ? 'old' : who === 'wes' ? 'boy' : 'girl');
      tx.textContent += (who && who !== '-' ? '' : '') + line + '\n';
      await new Promise((r) => setTimeout(r, Math.min(4200, 900 + line.length * 38)));
    }
    snd('tape', false); snd('sfx', 'tape_stop');
    btn.disabled = false;
  }

  /* ---------- log ---------- */
  UI.openLog = function () {
    const b = $('#log-body');
    b.innerHTML = E.log.slice(-200).map((l) => `<div class="entry ${l.kind === 'choice' ? 'choice-made' : l.who ? '' : 'narr'}">${l.who ? `<div class="who">${esc(l.who)}</div>` : ''}<div class="what">${esc(l.text).replace(/\*(.+?)\*/g, '<em>$1</em>')}</div></div>`).join('') || '<p class="empty">Nothing yet.</p>';
    open('log');
    b.scrollTop = b.scrollHeight;
  };

  /* ---------- saves ---------- */
  const SLOTS = ['auto', '1', '2', '3', '4', '5', '6'];
  UI.openSaves = function (mode) {
    const canSave = !!(E.story && E.eng && E.snap && !$('#title.on'));
    if (mode === 'save' && !canSave) mode = 'load';
    $('#s-title').textContent = mode === 'save' ? 'Save' : 'Load';
    $('#s-mode-save').disabled = !canSave;
    $('#s-mode-save').classList.toggle('primary', mode === 'save');
    $('#s-mode-load').classList.toggle('primary', mode === 'load');
    const box = $('#s-slots');
    box.innerHTML = '';
    for (const k of SLOTS) {
      const d = store.get('save.' + k, null);
      if (mode === 'save' && k === 'auto') continue;
      const b = document.createElement('button');
      b.className = 'slot' + (d ? '' : ' empty-slot');
      const m = d && d.meta;
      const when = m ? new Date(m.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
      b.innerHTML = `<span class="sn">${k === 'auto' ? 'Autosave' : 'Slot ' + k}</span>` + (d ? `<span class="st">${esc(m.chapter ? (m.chapter.num ? m.chapter.num + ' · ' : '') + (m.chapter.title || '') : 'Prologue')}</span><span class="sd">${esc([m.location, when].filter(Boolean).join(' · '))}</span><span class="sx">${esc(m.snippet || '')}</span>` : `<span class="st">Empty</span>`);
      b.onclick = async () => {
        if (mode === 'save') {
          if (d && !(await UI.confirm('Overwrite this save?', 'Overwrite'))) return;
          const ok = store.set('save.' + k, E.serialize());
          E.toast(ok ? 'Saved' : 'Your browser refused to save. Use a save code instead.', ok ? '' : 'remember', 'save');
          UI.openSaves('save');
        } else if (d) {
          if (E.running && !(await UI.confirm('Load this save? Unsaved progress will be lost.', 'Load'))) return;
          close('saves'); close('title'); E.restore(d);
        }
      };
      box.appendChild(b);
    }
    $('#s-code').value = '';
    open('saves');
  };
  UI.openChapters = function () {
    const box = $('#ch-slots'); box.innerHTML = '';
    for (const n of store.get('chapters', [])) {
      const d = store.get('chapter.' + n, null); if (!d) continue;
      const m = d.meta || {};
      const b = document.createElement('button'); b.className = 'slot';
      b.innerHTML = `<span class="sn">${esc(m.chapter && m.chapter.num || 'Chapter ' + n)}</span><span class="st">${esc(m.chapter && m.chapter.title || '')}</span><span class="sd">${esc(m.chapter && m.chapter.when || '')}</span>`;
      b.onclick = () => { close('chapters'); close('title'); E.restore(d); };
      box.appendChild(b);
    }
    open('chapters');
  };

  /* ---------- settings ---------- */
  UI.openSettings = function () {
    const s = E.settings;
    const body = $('#set-body');
    const rng = (id, label, min, max, step, val, hint) => `<label for="${id}">${label}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">${hint ? `<div class="hint">${hint}</div>` : ''}`;
    body.innerHTML =
      rng('st-speed', 'Text speed', 10, 100, 5, s.textSpeed, 'All the way right shows text instantly.') +
      rng('st-auto', 'Auto-advance pause', 0.5, 2.5, 0.1, s.autoDelay) +
      rng('st-master', 'Volume', 0, 1, 0.05, s.master) +
      rng('st-music', 'Music', 0, 1, 0.05, s.music) +
      rng('st-amb', 'Ambience', 0, 1, 0.05, s.ambience) +
      rng('st-sfx', 'Sound effects', 0, 1, 0.05, s.sfx) +
      `<label for="st-fx">Screen effects</label><select id="st-fx"><option value="full">Full</option><option value="reduced">Reduced (no shaking or glitches)</option><option value="off">Off (no flashes)</option></select>` +
      `<label for="st-font">Text size</label><select id="st-font"><option value="0.9">Small</option><option value="1">Medium</option><option value="1.15">Large</option><option value="1.3">Extra large</option></select>` +
      `<label for="st-skip">Skip</label><select id="st-skip"><option value="0">Seen text only</option><option value="1">All text</option></select>` +
      `<label for="st-claude">Your own words</label><select id="st-claude"><option value="1">Characters answer in their own words (uses Claude when available)</option><option value="0">Match to the nearest scripted reply only</option></select>` +
      `<div class="hint" id="st-claude-hint">${window.FREE && FREE.status ? esc(FREE.status()) : ''}</div>`;
    $('#st-fx').value = s.fx; $('#st-font').value = String(s.fontScale); $('#st-skip').value = s.skipUnseen ? '1' : '0'; $('#st-claude').value = s.claude ? '1' : '0';
    const bind = (id, key, conv) => { $('#' + id).addEventListener('input', (e) => { s[key] = conv(e.target.value); E.saveSettings(); }); };
    bind('st-speed', 'textSpeed', Number); bind('st-auto', 'autoDelay', Number); bind('st-master', 'master', Number); bind('st-music', 'music', Number); bind('st-amb', 'ambience', Number); bind('st-sfx', 'sfx', Number);
    $('#st-fx').onchange = (e) => { s.fx = e.target.value; E.saveSettings(); };
    $('#st-font').onchange = (e) => { s.fontScale = Number(e.target.value); E.saveSettings(); };
    $('#st-skip').onchange = (e) => { s.skipUnseen = e.target.value === '1'; E.saveSettings(); };
    $('#st-claude').onchange = (e) => { s.claude = e.target.value === '1'; E.saveSettings(); };
    $('#set-title').hidden = !!$('#title.on');
    open('settings');
  };

  /* ---------- map hub ---------- */
  UI.mapChoose = function (opts, token) {
    return new Promise((resolve) => {
      const D = window.DATA || {};
      const m = $('#map');
      const r = window.KIT && KIT.renderBg('cg_map');
      m.innerHTML = (r ? r.svg : fallbackMap()) + `<div class="maphead">Derry</div><div class="mapsub">${esc(E.eng.mapNote || 'Where to?')}</div><div class="tip" id="map-tip">Choose where to go.</div><div class="other" id="map-other"></div>`;
      const tip = $('#map-tip', m);
      $('#toasts').innerHTML = '';
      let done = false;
      const pick = (o) => { if (done) return; done = true; snd('sfx', 'select'); m.classList.remove('on'); setTimeout(() => { m.innerHTML = ''; }, 600); resolve({ index: o.index }); };
      for (const o of opts) {
        const pl = o.map && D.places && D.places[o.map];
        if (pl && pl.xy) {
          const b = document.createElement('button');
          b.className = 'pin';
          b.style.left = pl.xy[0] + '%'; b.style.top = pl.xy[1] + '%';
          b.innerHTML = `<span class="lbl"></span><span class="dot"></span>`;
          b.querySelector('.lbl').textContent = pl.name;
          b.setAttribute('aria-label', pl.name + '. ' + o.text);
          b.addEventListener('mouseenter', () => { tip.textContent = o.text; snd('sfx', 'hover', { volume: 0.25 }); });
          b.addEventListener('focus', () => { tip.textContent = o.text; });
          b.addEventListener('click', () => pick(o));
          m.appendChild(b);
        } else {
          const b = document.createElement('button');
          b.className = 'btn primary';
          b.textContent = o.text.replace(/^\(|\)$/g, '');
          b.addEventListener('click', () => pick(o));
          $('#map-other', m).appendChild(b);
        }
      }
      $('#dialogue').hidden = true;
      requestAnimationFrame(() => m.classList.add('on'));
      setTimeout(() => { const f = $('.pin', m); if (f) f.focus({ preventScroll: true }); }, 100);
    });
  };
  function fallbackMap() {
    return `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice"><rect width="1600" height="900" fill="#e4d9bf"/><path d="M-20,520 C300,470 520,600 800,540 C1080,480 1300,560 1620,500" fill="none" stroke="#8fa3b0" stroke-width="38"/><path d="M0,300 H1600 M0,700 H1600 M400,0 V900 M900,0 V900 M1250,0 V900" stroke="#cbbd9c" stroke-width="14"/></svg>`;
  }

  /* ---------- summary ---------- */
  UI.summary = function () {
    const D = window.DATA || {};
    let s = { decisions: [], people: [], stats: [] };
    try { s = D.summary ? D.summary(V, E.eng) : s; } catch (e) { console.error(e); }
    const totalClues = Object.keys(D.clues || {}).length;
    $('#sum-body').innerHTML =
      `<div class="tbc">To be continued</div><div class="tbcs">Episode Two · ${esc(D.nextTitle || 'coming')}</div>` +
      `<h3>What you did</h3><div class="decisions">${(s.decisions || []).map((d) => `<div class="dec"><b>${esc(d[0])}</b>${esc(d[1])}</div>`).join('')}</div>` +
      `<h3>Who you are to them</h3><div class="decisions">${(s.people || []).map((d) => `<div class="dec"><b>${esc(d[0])}</b>${esc(d[1])}</div>`).join('')}</div>` +
      `<h3>What you found</h3><p>${E.eng.clues.length} of ${totalClues} clues · ${E.eng.tapes.length} recordings · ${E.eng.theories.length} theories · ${Math.round(E.eng.playtime / 60)} minutes in Derry.</p>` +
      `<p class="empty">Your choices are saved with your autosave and will carry into Episode Two.</p>`;
    store.set('save.auto', E.serialize());
    store.set('finished', true);
    $('#hud').hidden = true;
    open('summary');
    snd('music', 'end', { fade: 3 });
  };
})();
