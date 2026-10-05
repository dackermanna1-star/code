// DOM-based HUD and menus: health/stamina/xp, belt, minimap, prompts, item tooltips with
// comparisons, boss bars, floating enemy health bars, toasts/banners and all overlay screens.
import * as THREE from 'three';
import { RARITY, RELICS, CLASSES, ABILITIES, CONSUMABLES, WEAPONS, ARMORS } from '../items/data.js';
import { describe, itemColor } from '../items/loot.js';
import { computeStats } from '../items/stats.js';
import { C, TILE } from '../world/constants.js';
import { F } from '../world/dungeon-gen.js';

const _v = new THREE.Vector3();

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

const fmtPct = (v) => `${Math.round(v * 100)}%`;
const fmtTime = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.overlay = h('div', { id: 'overlay' });
    document.body.appendChild(this.overlay);
    this.overlay.addEventListener('mousedown', (e) => e.stopPropagation());
    this._buildHUD();
    this.bars = [];
    this.bossTarget = null;
    this.mapT = 0;
    this.menuFx = null;
  }

  // ------------------------------------------------------------ HUD construction
  _buildHUD() {
    const hud = (this.hud = h('div', { id: 'hud', class: 'hidden' }));
    this.depthEl = h('div', { class: 'depth' });
    this.goldEl = h('span', { class: 'gold' }, '0');
    this.keysEl = h('span', { class: 'keys' }, '0');
    hud.append(h('div', { class: 'hud-tl' }, this.depthEl, h('div', { class: 'purse' }, h('span', { class: 'ico coin' }), this.goldEl, h('span', { class: 'ico key' }), this.keysEl)));

    this.hpFill = h('div', { class: 'fill' });
    this.hpLag = h('div', { class: 'lag' });
    this.hpText = h('div', { class: 'bar-text' });
    this.stFill = h('div', { class: 'fill' });
    this.xpFill = h('div', { class: 'fill' });
    this.lvlEl = h('div', { class: 'lvl' }, '1');
    this.buffsEl = h('div', { class: 'buffs' });
    this.lvlUpEl = h('div', { class: 'lvlup hidden' }, 'LEVEL UP! ', h('kbd', {}, 'L'), ' or leave combat');
    hud.append(h('div', { class: 'hud-bl' },
      this.lvlUpEl,
      this.buffsEl,
      h('div', { class: 'bar hp' }, this.hpLag, this.hpFill, this.hpText),
      h('div', { class: 'bar st' }, this.stFill),
      h('div', { class: 'xprow' }, this.lvlEl, h('div', { class: 'bar xp' }, this.xpFill)),
    ));

    const slot = (key, cls) => {
      const count = h('div', { class: 'count' });
      const cd = h('div', { class: 'cd' });
      const icon = h('div', { class: 'icon ' + cls });
      const el = h('div', { class: 'slot ' + cls }, icon, cd, count, h('div', { class: 'key' }, key));
      return { el, count, cd, icon };
    };
    this.slots = { potion: slot('Q', 'potion'), bomb: slot('G', 'bomb'), elixir: slot('3', 'elixir'), ability: slot('R', 'ability') };
    hud.append(h('div', { class: 'hud-bc' }, ...Object.values(this.slots).map((s) => s.el)));

    this.weaponEl = h('div', { class: 'weapon-main' });
    this.weapon2El = h('div', { class: 'weapon-alt' });
    hud.append(h('div', { class: 'hud-br' }, this.weapon2El, this.weaponEl));

    this.minimap = h('canvas', { class: 'minimap', width: 200, height: 200 });
    this.relicsEl = h('div', { class: 'relics' });
    hud.append(h('div', { class: 'hud-tr' }, this.minimap, this.relicsEl));

    this.crosshair = h('div', { class: 'crosshair' });
    this.prompt = h('div', { class: 'prompt hidden' });
    this.tooltip = h('div', { class: 'tooltip hidden' });
    this.bossBar = h('div', { class: 'bossbar hidden' }, h('div', { class: 'name' }), h('div', { class: 'bar' }, h('div', { class: 'lag' }), h('div', { class: 'fill' })));
    this.toasts = h('div', { class: 'toasts' });
    this.bannerEl = h('div', { class: 'banner hidden' }, h('div', { class: 'title' }), h('div', { class: 'sub' }));
    this.multiEl = h('div', { class: 'multikill hidden' });
    this.introEl = h('div', { class: 'floor-intro hidden' }, h('div', { class: 'depthnum' }), h('div', { class: 'name' }));
    this.barsEl = h('div', { class: 'enemy-bars' });
    this.fade = h('div', { class: 'fade' });
    this.hurtEl = h('div', { class: 'hurt' });
    this.bigMap = h('canvas', { class: 'bigmap hidden', width: 900, height: 900 });
    hud.append(this.barsEl, this.crosshair, this.prompt, this.tooltip, this.bossBar, this.toasts, this.bannerEl, this.multiEl, this.introEl, this.hurtEl, this.bigMap);
    this.root.append(hud, this.fade);
  }

  // ------------------------------------------------------------ menus
  _menuBackdrop() {
    if (this.menuFx) return;
    const c = h('canvas', { class: 'embers' });
    this.overlay.prepend(c);
    const ctx = c.getContext('2d');
    const parts = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 2 + 0.5, v: Math.random() * 0.03 + 0.01, w: Math.random() * 6 }));
    let run = true;
    const tick = () => {
      if (!run) return;
      c.width = window.innerWidth;
      c.height = window.innerHeight;
      ctx.clearRect(0, 0, c.width, c.height);
      const t = performance.now() / 1000;
      for (const p of parts) {
        p.y -= p.v / 60;
        if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
        const x = (p.x + Math.sin(t * 0.5 + p.w) * 0.01) * c.width, y = p.y * c.height;
        const a = 0.3 + Math.sin(t * 3 + p.w) * 0.25;
        ctx.fillStyle = `rgba(255,${120 + p.s * 30},60,${a})`;
        ctx.beginPath();
        ctx.arc(x, y, p.s, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(tick);
    };
    tick();
    this.menuFx = { stop: () => { run = false; c.remove(); this.menuFx = null; } };
  }

  _open(cls, ...children) {
    this.overlay.innerHTML = '';
    this.overlay.className = 'open ' + cls;
    const panel = h('div', { class: 'panel ' + cls }, ...children);
    this.overlay.append(panel);
    if (this.menuFx) { this.menuFx.stop(); }
    return panel;
  }

  hideOverlay() {
    this.overlay.className = '';
    this.overlay.innerHTML = '';
    if (this.menuFx) this.menuFx.stop();
  }

  showMenu() {
    const g = this.game;
    this.hud.classList.add('hidden');
    this.setBoss(null);
    const m = g.meta;
    let selected = CLASSES[m.lastClass] && this._unlocked(m.lastClass) ? m.lastClass : 'wanderer';
    const seedInput = h('input', { class: 'seed', placeholder: 'random', maxlength: '12', spellcheck: 'false' });
    const cards = h('div', { class: 'classes' });
    const renderCards = () => {
      cards.innerHTML = '';
      for (const [id, c] of Object.entries(CLASSES)) {
        const unlocked = this._unlocked(id);
        const card = h('button', { class: `class-card ${selected === id ? 'sel' : ''} ${unlocked ? '' : 'locked'}`, onclick: () => { if (!unlocked) { g.audio.ui('deny'); return; } selected = id; g.audio.ui('click'); renderCards(); } },
          h('div', { class: 'cname' }, c.name),
          h('div', { class: 'cdesc' }, unlocked ? c.desc : `Locked — ${c.unlock.text}`));
        cards.append(card);
      }
    };
    renderCards();
    const start = () => {
      g.audio.init();
      g.audio.ui('click');
      this.hideOverlay();
      g.startRun(selected, seedInput.value.trim() || null);
    };
    const daily = () => {
      const d = new Date();
      seedInput.value = `DAY${d.getUTCFullYear() % 100}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
      g.audio.ui('click');
    };
    this._open('menu',
      h('div', { class: 'title-wrap' }, h('h1', { class: 'title' }, 'DELVE'), h('div', { class: 'subtitle' }, 'a roguelike descent')),
      h('div', { class: 'menu-cols' },
        h('div', { class: 'col' },
          h('h3', {}, 'Choose your wanderer'), cards,
          h('div', { class: 'seed-row' }, h('label', {}, 'Seed'), seedInput, h('button', { class: 'btn small', onclick: daily }, 'Daily')),
          h('button', { class: 'btn primary big', onclick: start }, 'Begin the descent')),
        h('div', { class: 'col side' },
          h('h3', {}, 'Controls'),
          this._controls(),
          h('h3', {}, 'Records'),
          h('div', { class: 'records' },
            h('div', {}, `Runs: ${m.runs}`), h('div', {}, `Deepest: ${m.bestFloor || '—'}`), h('div', {}, `Slain: ${m.totalKills}`),
            h('div', {}, `Guardians: ${m.bossKills}`), h('div', {}, `Escapes: ${m.wins}`), h('div', {}, `Secrets: ${m.secrets}`)),
          h('button', { class: 'btn', onclick: () => this.showSettings(() => this.showMenu()) }, 'Settings'))),
    );
    this._menuBackdrop();
  }

  _unlocked(id) {
    const c = CLASSES[id];
    return !c.unlock || c.unlock.check(this.game.meta);
  }

  _controls() {
    const rows = [
      ['WASD', 'Move'], ['Mouse', 'Look'], ['LMB', 'Attack (hold: heavy)'], ['RMB', 'Block (tap on hit: parry)'],
      ['Shift', 'Dodge'], ['Space', 'Jump'], ['F', 'Kick'], ['E', 'Interact / pick up'], ['Q', 'Drink potion'], ['G', 'Throw bomb'],
      ['3', 'Elixir'], ['R', 'Ability'], ['L', 'Level-up choice'], ['X / Wheel', 'Swap weapon'], ['Tab', 'Character'], ['M', 'Map'], ['Esc', 'Pause'],
    ];
    return h('div', { class: 'controls' }, ...rows.map(([k, v]) => h('div', { class: 'ctl' }, h('kbd', {}, k), h('span', {}, v))));
  }

  showSettings(back) {
    const g = this.game;
    const s = g.settings;
    const slider = (label, key, min, max, step, fmt = (v) => v) => {
      const val = h('span', { class: 'val' }, fmt(s[key]));
      const input = h('input', { type: 'range', min, max, step, value: s[key] });
      input.addEventListener('input', () => { s[key] = Number(input.value); val.textContent = fmt(s[key]); g.saveSettings(); });
      return h('div', { class: 'setting' }, h('label', {}, label), input, val);
    };
    const choice = (label, key, options) => {
      const wrap = h('div', { class: 'choices' });
      const render = () => {
        wrap.innerHTML = '';
        for (const [v, name] of options) wrap.append(h('button', { class: `btn small ${s[key] === v ? 'sel' : ''}`, onclick: () => { s[key] = v; g.saveSettings(); g.audio.ui('click'); render(); } }, name));
      };
      render();
      return h('div', { class: 'setting' }, h('label', {}, label), wrap);
    };
    this._open('settings',
      h('h2', {}, 'Settings'),
      slider('Master volume', 'master', 0, 1, 0.05, fmtPct),
      slider('Effects volume', 'sfx', 0, 1, 0.05, fmtPct),
      slider('Music volume', 'music', 0, 1, 0.05, fmtPct),
      slider('Mouse sensitivity', 'sens', 0.2, 3, 0.05, (v) => v.toFixed(2)),
      slider('Field of view', 'fov', 60, 105, 1, (v) => `${v}°`),
      slider('Screen shake', 'shake', 0, 1.5, 0.05, fmtPct),
      slider('Brightness', 'brightness', 0.7, 2, 0.05, (v) => v.toFixed(2)),
      choice('Gore', 'gore', [[0, 'Off'], [1, 'On'], [1.6, 'Extra']]),
      choice('Graphics', 'quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]),
      choice('Invert Y', 'invertY', [[false, 'Off'], [true, 'On']]),
      h('button', { class: 'btn primary', onclick: () => { g.audio.ui('click'); back(); } }, 'Back'),
    );
  }

  showPause() {
    const g = this.game;
    this._open('pause',
      h('h2', {}, 'Paused'),
      h('div', { class: 'seedline' }, `Depth ${g.floor} · Seed ${g.seed}`),
      h('button', { class: 'btn primary big', onclick: () => { g.audio.ui('click'); g.resume(); } }, 'Resume'),
      h('button', { class: 'btn', onclick: () => this.showSettings(() => this.showPause()) }, 'Settings'),
      h('button', { class: 'btn', onclick: () => { g.state = 'inventory'; this.showInventory(); } }, 'Character'),
      h('button', { class: 'btn danger', onclick: () => { g.audio.ui('click'); g.quitToMenu(); } }, 'Abandon run'),
      this._controls(),
    );
  }

  showLevelUp() {
    const g = this.game;
    const choices = g.boonChoices();
    this.levelChoices = choices;
    const cards = choices.map((b, i) => h('button', { class: 'boon', onclick: () => this.pickLevelUp(i) },
      h('div', { class: 'num' }, String(i + 1)),
      h('div', { class: 'bname' }, b.name),
      h('div', { class: 'bdesc' }, b.desc)));
    this._open('levelup', h('h2', {}, `Level ${g.player.level}`), h('div', { class: 'sub' }, 'Choose a boon'), h('div', { class: 'boons' }, ...cards));
  }

  pickLevelUp(i) {
    if (!this.levelChoices || !this.levelChoices[i]) return;
    const b = this.levelChoices[i];
    this.levelChoices = null;
    this.game.chooseBoon(b);
    this.toast(`${b.name}: ${b.desc}`, 'buff');
  }

  showInventory() {
    const g = this.game;
    const p = g.player;
    const s = p.stats;
    const itemCard = (item, label) => {
      if (!item) return h('div', { class: 'equip empty' }, h('div', { class: 'elabel' }, label), h('div', { class: 'ename' }, '—'));
      return h('div', { class: 'equip', style: `border-color:${itemColor(item)}` }, h('div', { class: 'elabel' }, label), h('div', { class: 'ename', style: `color:${itemColor(item)}` }, item.name), ...describe(item).map((l) => h('div', { class: 'line ' + l.c }, l.t)));
    };
    const statRows = [
      ['Health', `${Math.ceil(p.hp)} / ${s.maxHp}`], ['Stamina', `${s.maxStamina}`], ['Weapon damage', `${s.weaponDamage}`], ['Damage bonus', `+${fmtPct(s.damage - 1)}`],
      ['Attack speed', `${s.attackSpeed.toFixed(2)}x`], ['Critical chance', fmtPct(s.crit)], ['Critical damage', `${s.critMult.toFixed(1)}x`],
      ['Damage reduction', fmtPct(s.armor)], ['Move speed', `${s.moveSpeed.toFixed(1)} m/s`], ['Life steal', fmtPct(s.lifesteal)],
      ['Parry window', `${Math.round(s.parryWindow * 1000)} ms`], ['Kick power', `${s.kickPower.toFixed(1)}x`], ['Luck', `+${fmtPct(s.luck)}`],
    ];
    if (s.burn) statRows.push(['Ignite chance', fmtPct(Math.min(1, s.burn))]);
    if (s.chill) statRows.push(['Chill chance', fmtPct(Math.min(1, s.chill))]);
    if (s.shock) statRows.push(['Lightning chance', fmtPct(s.shock)]);
    if (s.poison) statRows.push(['Poison chance', fmtPct(s.poison)]);
    if (s.bleed) statRows.push(['Bleed chance', fmtPct(s.bleed)]);
    const relics = p.relicOrder.filter((id) => p.relics[id]).map((id) => {
      const R = RELICS[id];
      return h('div', { class: `relic-row ${R.cursed ? 'cursed' : ''}` }, h('span', { class: 'ricon', style: `color:${RARITY[R.rarity + 1].color}` }, R.icon), h('div', {}, h('div', { class: 'rname' }, `${R.name}${p.relics[id] > 1 ? ` x${p.relics[id]}` : ''}`), h('div', { class: 'rdesc' }, R.desc)));
    });
    const boons = p.boons.map((b) => h('span', { class: 'boon-chip' }, b.name));
    this._open('inventory',
      h('div', { class: 'inv-head' }, h('h2', {}, `Level ${p.level} ${CLASSES[p.classId].name}`), h('div', { class: 'seedline' }, `Depth ${g.floor} · ${g.level.theme.name} · Seed ${g.seed} · ${fmtTime(performance.now() - g.stats.startTime)}`)),
      h('div', { class: 'inv-cols' },
        h('div', { class: 'col' }, h('h3', {}, 'Equipment'),
          itemCard(p.weapons[p.weaponIdx], 'Weapon (in hand)'), itemCard(p.weapons[1 - p.weaponIdx], 'Weapon (sheathed)'), itemCard(p.armor, 'Armor'), itemCard(p.trinkets[0], 'Trinket'), itemCard(p.trinkets[1], 'Trinket'),
          p.ability ? h('div', { class: 'equip' }, h('div', { class: 'elabel' }, 'Ability [R]'), h('div', { class: 'ename' }, ABILITIES[p.ability.id].name), h('div', { class: 'line affix' }, ABILITIES[p.ability.id].desc)) : null),
        h('div', { class: 'col' }, h('h3', {}, 'Attributes'), h('div', { class: 'stats' }, ...statRows.map(([k, v]) => h('div', { class: 'srow' }, h('span', {}, k), h('b', {}, v)))),
          h('h3', {}, 'Boons'), h('div', { class: 'boon-chips' }, ...(boons.length ? boons : [h('span', { class: 'muted' }, 'None yet — level up by slaying foes')])),
          h('h3', {}, 'Supplies'), h('div', { class: 'supplies' }, `${p.potions} potions · ${p.bombs} bombs · ${p.elixirs.length} elixirs · ${p.keys} keys · ${p.gold} gold`)),
        h('div', { class: 'col' }, h('h3', {}, `Relics (${relics.length})`), h('div', { class: 'relic-list' }, ...(relics.length ? relics : [h('div', { class: 'muted' }, 'No relics yet. Search chests, secrets and shrines.')])))),
      h('button', { class: 'btn primary', onclick: () => { g.audio.ui('click'); g.resume(); } }, 'Close [Tab]'),
    );
  }

  showDeath() {
    const g = this.game;
    const st = g.stats;
    this.hud.classList.add('hidden');
    this.setBoss(null);
    const newly = Object.entries(CLASSES).filter(([id, c]) => c.unlock && c.unlock.check(g.meta) && !(g.meta.seenUnlocks || []).includes(id));
    g.meta.seenUnlocks = [...(g.meta.seenUnlocks || []), ...newly.map(([id]) => id)];
    g.saveMeta();
    const row = (k, v) => h('div', { class: 'srow' }, h('span', {}, k), h('b', {}, v));
    this._open('death',
      h('h1', { class: 'died' }, 'YOU HAVE FALLEN'),
      h('div', { class: 'sub' }, `Depth ${g.floor} — ${g.level ? g.level.theme.name : ''}`),
      h('div', { class: 'stats two' },
        row('Time', fmtTime(performance.now() - st.startTime)), row('Level', g.player.level), row('Enemies slain', st.kills), row('Elites slain', st.elites),
        row('Damage dealt', Math.round(st.damageDealt)), row('Damage taken', Math.round(st.damageTaken)), row('Gold gathered', st.gold), row('Items found', st.itemsFound),
        row('Secrets found', st.secrets), row('Perfect parries', st.parries), row('Hazard kills', st.environmentKills), row('Best multi-kill', st.maxMulti),
        row('Relics', Object.keys(g.player.relics).length), row('Seed', g.seed)),
      newly.length ? h('div', { class: 'unlocks' }, ...newly.map(([, c]) => h('div', {}, `New wanderer unlocked: ${c.name}`))) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary big', onclick: () => { this.hideOverlay(); g.startRun(g.classId, null); } }, 'Descend again'),
        h('button', { class: 'btn', onclick: () => { this.hideOverlay(); g.startRun(g.classId, g.seed); } }, 'Retry seed'),
        h('button', { class: 'btn', onclick: () => g.quitToMenu() }, 'Main menu')),
    );
  }

  showVictory() {
    const g = this.game;
    const st = g.stats;
    this.hud.classList.add('hidden');
    const row = (k, v) => h('div', { class: 'srow' }, h('span', {}, k), h('b', {}, v));
    this._open('victory',
      h('h1', { class: 'won' }, 'THE ABYSS IS CONQUERED'),
      h('div', { class: 'sub' }, 'You climb out into the light... but the depths still call.'),
      h('div', { class: 'stats two' },
        row('Time', fmtTime(performance.now() - st.startTime)), row('Level', g.player.level), row('Enemies slain', st.kills), row('Guardians slain', st.bosses),
        row('Damage dealt', Math.round(st.damageDealt)), row('Gold gathered', st.gold), row('Secrets found', st.secrets), row('Seed', g.seed)),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary big', onclick: () => { this.hideOverlay(); g.continueEndless(); } }, 'Go deeper (endless)'),
        h('button', { class: 'btn', onclick: () => g.quitToMenu() }, 'Main menu')),
    );
  }

  // ------------------------------------------------------------ HUD helpers
  showHUD() {
    this.hud.classList.remove('hidden');
    this.hideOverlay();
  }

  onFloorLoaded() {
    this.toasts.innerHTML = '';
    for (const b of this.bars) b.el.remove();
    this.bars = [];
  }

  floorIntro(name, n) {
    const el = this.introEl;
    el.querySelector('.depthnum').textContent = `DEPTH ${n}`;
    el.querySelector('.name').textContent = name;
    el.classList.remove('hidden');
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this._introT);
    this._introT = setTimeout(() => el.classList.add('hidden'), 4200);
  }

  fadeOut(cb) {
    this.fade.classList.add('on');
    setTimeout(cb, 650);
  }

  fadeIn() {
    setTimeout(() => this.fade.classList.remove('on'), 100);
  }

  toast(text, kind = 'info') {
    const el = h('div', { class: 'toast ' + kind }, text);
    this.toasts.append(el);
    while (this.toasts.children.length > 6) this.toasts.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3800);
  }

  banner(title, sub = '', dur = 2.6) {
    const el = this.bannerEl;
    el.querySelector('.title').textContent = title;
    el.querySelector('.sub').textContent = sub;
    el.classList.remove('hidden', 'show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => el.classList.add('hidden'), dur * 1000);
  }

  relicBanner(id) {
    const R = RELICS[id];
    this.banner(`${R.icon}  ${R.name}`, R.desc, 3.2);
    this.game.audio.relic();
  }

  bossIntro(name, title) {
    this.banner(name.toUpperCase(), title, 3.5);
  }

  multiKill(n) {
    const words = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'QUAD KILL', 5: 'MASSACRE' };
    const el = this.multiEl;
    el.textContent = words[n] || `CARNAGE x${n}`;
    el.classList.remove('hidden', 'show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this._multiT);
    this._multiT = setTimeout(() => el.classList.add('hidden'), 1400);
  }

  goldPulse() {
    this.goldEl.classList.remove('pulse');
    void this.goldEl.offsetWidth;
    this.goldEl.classList.add('pulse');
  }

  hurt() {
    this.hurtEl.classList.remove('on');
    void this.hurtEl.offsetWidth;
    this.hurtEl.classList.add('on');
  }

  setBoss(enemy, mini = false) {
    this.bossTarget = enemy;
    this.bossMini = mini;
    if (!enemy) { this.bossBar.classList.add('hidden'); return; }
    this.bossBar.classList.remove('hidden');
    this.bossBar.classList.toggle('mini', mini);
    this.bossBar.querySelector('.name').textContent = enemy.displayName;
    this.bossLag = 1;
  }

  showMap(on) {
    this.bigMap.classList.toggle('hidden', !on);
    if (on) this._drawMap(this.bigMap, true);
  }

  // ------------------------------------------------------------ per-frame
  update(dt) {
    const g = this.game;
    const p = g.player;
    if (!p || this.hud.classList.contains('hidden')) return;
    const s = p.stats;
    this.depthEl.textContent = `Depth ${g.floor}${g.endless ? ' (endless)' : ''} · ${g.level ? g.level.theme.name : ''}`;
    this.goldEl.textContent = p.gold;
    this.keysEl.textContent = p.keys;
    const hpF = Math.max(0, p.hp / s.maxHp);
    this.hpFill.style.width = `${hpF * 100}%`;
    this._hpLag = this._hpLag == null ? hpF : Math.max(hpF, this._hpLag - dt * 0.4);
    this.hpLag.style.width = `${this._hpLag * 100}%`;
    this.hpText.textContent = `${Math.ceil(Math.max(0, p.hp))} / ${s.maxHp}`;
    this.hpFill.parentElement.classList.toggle('low', hpF < 0.3);
    this.stFill.style.width = `${Math.max(0, p.stamina / s.maxStamina) * 100}%`;
    this.stFill.parentElement.classList.toggle('empty', p.stamina < 15);
    this.xpFill.style.width = `${(p.xp / p.xpNext) * 100}%`;
    this.lvlEl.textContent = p.level;
    this.lvlUpEl.classList.toggle('hidden', !(g.pendingLevelUps > 0));

    // belt
    this.slots.potion.count.textContent = p.potions;
    this.slots.potion.el.classList.toggle('dim', p.potions <= 0);
    this.slots.bomb.count.textContent = p.bombs;
    this.slots.bomb.el.classList.toggle('dim', p.bombs <= 0);
    this.slots.elixir.count.textContent = p.elixirs.length;
    this.slots.elixir.el.classList.toggle('dim', !p.elixirs.length);
    if (p.ability) {
      const A = ABILITIES[p.ability.id];
      this.slots.ability.el.classList.remove('hidden');
      this.slots.ability.icon.textContent = A.icon;
      const f = p.ability.cd / (A.cd * (1 - s.cooldown));
      this.slots.ability.cd.style.height = `${Math.max(0, f) * 100}%`;
      this.slots.ability.count.textContent = p.ability.cd > 0 ? Math.ceil(p.ability.cd) : '';
      this.slots.ability.el.title = A.name;
    } else this.slots.ability.el.classList.add('hidden');

    // weapons
    const w = p.weapon, w2 = p.weapons[1 - p.weaponIdx];
    if (this._wKey !== (w && w.uid) + ':' + (w2 && w2.uid) + ':' + (w && w.upgrades)) {
      this._wKey = (w && w.uid) + ':' + (w2 && w2.uid) + ':' + (w && w.upgrades);
      this.weaponEl.innerHTML = '';
      if (w) this.weaponEl.append(h('div', { class: 'wname', style: `color:${itemColor(w)}` }, w.name + (w.upgrades ? ` +${w.upgrades}` : '')), h('div', { class: 'wsub' }, `${WEAPONS[w.base].name} · ${w.dmg} dmg`));
      this.weapon2El.innerHTML = '';
      if (w2) this.weapon2El.append(h('span', { style: `color:${itemColor(w2)}` }, w2.name), h('kbd', {}, 'X'));
    }

    // buffs
    const bk = Object.keys(p.buffs).map((k) => k + Math.ceil(p.buffs[k].t)).join();
    if (bk !== this._bk) {
      this._bk = bk;
      this.buffsEl.innerHTML = '';
      const names = { rage: 'Rage', iron: 'Ironskin', swift: 'Quicksilver', frenzy: 'Frenzy', haste: 'Haste', blessing: 'Blessed', curse: 'Cursed', blessed: 'Regeneration', chilled: 'Chilled', burning: 'Burning' };
      for (const [k, b] of Object.entries(p.buffs)) this.buffsEl.append(h('span', { class: 'buff ' + k }, `${names[k] || k}${b.stacks > 1 ? ' x' + b.stacks : ''} ${Math.ceil(b.t)}s`));
    }

    // relic row
    const rk = p.relicOrder.map((id) => id + (p.relics[id] || 0)).join();
    if (rk !== this._rk) {
      this._rk = rk;
      this.relicsEl.innerHTML = '';
      for (const id of p.relicOrder) {
        if (!p.relics[id]) continue;
        const R = RELICS[id];
        this.relicsEl.append(h('div', { class: 'relic', title: `${R.name}: ${R.desc}`, style: `color:${RARITY[R.rarity + 1].color}` }, R.icon, p.relics[id] > 1 ? h('sub', {}, p.relics[id]) : null));
      }
    }

    // interaction prompt / tooltip
    const f = g.focus;
    if (f && g.state === 'playing') {
      this.prompt.classList.remove('hidden');
      this.prompt.innerHTML = '';
      this.prompt.append(h('kbd', {}, 'E'), ' ', f.label);
      const item = f.target.lootItem ? f.target.lootItem.item : f.target.tooltipItem ? f.target.tooltipItem() : null;
      if (item && item.kind !== 'consumable') this._tooltip(item);
      else this.tooltip.classList.add('hidden');
    } else {
      this.prompt.classList.add('hidden');
      this.tooltip.classList.add('hidden');
    }

    // crosshair feedback
    this.crosshair.classList.toggle('charge', p.atk.state === 'charge');
    this.crosshair.style.setProperty('--charge', p.atk.charge || 0);
    this.crosshair.classList.toggle('block', p.blocking);

    // boss bar
    const b = this.bossTarget;
    if (b) {
      const fr = Math.max(0, b.hp / b.maxHp);
      this.bossLag = Math.max(fr, (this.bossLag ?? 1) - dt * 0.25);
      this.bossBar.querySelector('.fill').style.width = `${fr * 100}%`;
      this.bossBar.querySelector('.lag').style.width = `${this.bossLag * 100}%`;
      if (b.boss && b.phase === 1 && fr < 0.5) {
        b.phase = 2;
        this.banner('ENRAGED', `${b.def.name} grows furious`, 2);
        g.audio.voice(b.pos, b.def.voice, 'roar');
        g.audio.bossIntro();
        g.player.addTrauma(0.4);
        g.fx.ring(b.pos, b.auraColor || 0xff3300, 6, 0.7, 1);
      }
      if (b.dead) this.setBoss(null);
    }

    this._enemyBars(dt);
    this.mapT -= dt;
    if (this.mapT <= 0) {
      this.mapT = 0.08;
      this._drawMap(this.minimap, false);
      if (g.state === 'map') this._drawMap(this.bigMap, true);
    }
  }

  _tooltip(item) {
    const g = this.game;
    const p = g.player;
    const key = item.uid;
    if (this._ttKey === key) { this.tooltip.classList.remove('hidden'); return; }
    this._ttKey = key;
    const el = this.tooltip;
    el.innerHTML = '';
    el.style.borderColor = itemColor(item);
    el.append(h('div', { class: 'tname', style: `color:${itemColor(item)}` }, item.name), h('div', { class: 'trarity', style: `color:${itemColor(item)}` }, RARITY[Math.min(4, item.rarity)].name));
    for (const l of describe(item)) el.append(h('div', { class: 'line ' + l.c }, l.t));
    // comparison with what you'd replace
    let cur = null;
    if (item.kind === 'weapon') cur = p.weapons[1] ? p.weapon : null;
    else if (item.kind === 'armor') cur = p.armor;
    else if (item.kind === 'trinket') cur = p.trinkets[0] && p.trinkets[1] ? p.trinkets[0] : null;
    if (item.kind === 'weapon' || item.kind === 'armor' || item.kind === 'trinket') {
      const after = this._simulateEquip(item);
      const before = p.stats;
      const cmp = [];
      const add = (label, a, b, fmt, invert = false) => {
        const d = b - a;
        if (Math.abs(d) < 1e-3) return;
        const good = invert ? d < 0 : d > 0;
        cmp.push(h('div', { class: 'cmp ' + (good ? 'up' : 'down') }, `${good ? '▲' : '▼'} ${label} ${fmt(a)} → ${fmt(b)}`));
      };
      const dps = (st) => st.weaponDamage * st.damage * st.attackSpeed * (1 + st.crit * (st.critMult - 1));
      add('Damage/sec', dps(before), dps(after), (v) => v.toFixed(1));
      add('Weapon damage', before.weaponDamage, after.weaponDamage, (v) => Math.round(v));
      add('Attack speed', before.attackSpeed, after.attackSpeed, (v) => v.toFixed(2));
      add('Crit chance', before.crit, after.crit, fmtPct);
      add('Damage reduction', before.armor, after.armor, fmtPct);
      add('Max health', before.maxHp, after.maxHp, (v) => Math.round(v));
      add('Move speed', before.moveSpeed, after.moveSpeed, (v) => v.toFixed(1));
      add('Life steal', before.lifesteal, after.lifesteal, fmtPct);
      if (cmp.length || cur) {
        el.append(h('div', { class: 'cmp-head' }, cur ? `Replaces: ${cur.name}` : item.kind === 'weapon' ? 'Fills your empty weapon slot' : 'Fills an empty slot'), ...cmp);
      }
    }
    el.classList.remove('hidden');
  }

  _simulateEquip(item) {
    const p = this.game.player;
    const fake = { ...p, weapons: [...p.weapons], trinkets: [...p.trinkets], buffs: p.buffs, relics: p.relics, boons: p.boons, hpMod: p.hpMod };
    if (item.kind === 'weapon') {
      if (!fake.weapons[1]) { fake.weapons[1] = item; fake.weaponIdx = 1; }
      else fake.weapons[fake.weaponIdx] = item;
      Object.defineProperty(fake, 'weapon', { value: fake.weapons[fake.weaponIdx] });
    } else {
      Object.defineProperty(fake, 'weapon', { value: p.weapon });
      if (item.kind === 'armor') fake.armor = item;
      if (item.kind === 'trinket') { const slot = fake.trinkets[0] ? (fake.trinkets[1] ? 0 : 1) : 0; fake.trinkets[slot] = item; }
    }
    return computeStats(fake);
  }

  _enemyBars(dt) {
    const g = this.game;
    const cam = g.renderer.camera;
    const W = window.innerWidth, H = window.innerHeight;
    const list = g.level ? g.level.enemies.filter((e) => !e.dead && e !== this.bossTarget && (e.lastHurt < 5 || e.elite || e.miniboss) && e.pos.distanceToSquared(g.player.pos) < 22 * 22) : [];
    while (this.bars.length < list.length) {
      const el = h('div', { class: 'ebar' }, h('div', { class: 'ename' }), h('div', { class: 'ebar-bg' }, h('div', { class: 'efill' })));
      this.barsEl.append(el);
      this.bars.push({ el });
    }
    for (let i = 0; i < this.bars.length; i++) {
      const b = this.bars[i];
      const e = list[i];
      if (!e) { b.el.style.display = 'none'; continue; }
      e.headPos(_v);
      _v.y += 0.15;
      _v.project(cam);
      if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) { b.el.style.display = 'none'; continue; }
      b.el.style.display = '';
      const x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
      b.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      b.el.querySelector('.efill').style.width = `${Math.max(0, e.hp / e.maxHp) * 100}%`;
      const name = e.elite || e.miniboss ? e.displayName : '';
      const ne = b.el.querySelector('.ename');
      if (ne.textContent !== name) ne.textContent = name;
      b.el.classList.toggle('elite', !!(e.elite || e.miniboss));
      b.el.classList.toggle('vuln', e.vulnerable > 0);
    }
    void dt;
  }

  _drawMap(canvas, big) {
    const g = this.game;
    const p = g.player;
    const world = g.world;
    if (!world || !p) return;
    const ctx = canvas.getContext('2d');
    const Wc = canvas.width, Hc = canvas.height;
    ctx.clearRect(0, 0, Wc, Hc);
    const cell = big ? Math.min(Wc / world.W, Hc / world.H) : 7;
    ctx.save();
    if (big) {
      ctx.translate((Wc - world.W * cell) / 2, (Hc - world.H * cell) / 2);
    } else {
      ctx.beginPath();
      ctx.arc(Wc / 2, Hc / 2, Wc / 2 - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(8,8,12,0.75)';
      ctx.fillRect(0, 0, Wc, Hc);
      ctx.translate(Wc / 2, Hc / 2);
      ctx.rotate(p.yaw);
      ctx.translate(-(p.pos.x / TILE) * cell, -(p.pos.z / TILE) * cell);
    }
    const pcx = Math.floor(p.pos.x / TILE), pcz = Math.floor(p.pos.z / TILE);
    const range = big ? 999 : 16;
    for (let y = Math.max(0, pcz - range); y < Math.min(world.H, pcz + range); y++) {
      for (let x = Math.max(0, pcx - range); x < Math.min(world.W, pcx + range); x++) {
        const i = y * world.W + x;
        if (!world.seen[i]) continue;
        const c = world.cells[i];
        if (c === C.SOLID) {
          const secret = g.level.secretWalls.find((s) => s.cx === x && s.cy === y && !s.broken);
          ctx.fillStyle = '#2a2622';
          if (!secret) {
            // only draw walls bordering open space
            ctx.fillRect(x * cell, y * cell, cell, cell);
          }
          continue;
        }
        if (world.flags[i] & F.SECRET && world.blocked[i]) { ctx.fillStyle = '#2a2622'; ctx.fillRect(x * cell, y * cell, cell, cell); continue; }
        ctx.fillStyle = c === C.PIT ? '#120c0a' : c === C.LAVA ? '#a83a10' : world.flags[i] & F.WATER ? '#2e5a62' : world.roomOf[i] >= 0 ? '#6e655a' : '#57504a';
        ctx.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
        if (world.mapMark[i] || world.blocked[i]) { ctx.fillStyle = '#b07a3a'; ctx.fillRect(x * cell + cell * 0.2, y * cell + cell * 0.2, cell * 0.6, cell * 0.6); }
      }
    }
    // room icons
    ctx.font = `${Math.max(10, cell * 1.6)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const r of world.rooms) {
      if (!r.revealed && !(r.mapHint && big)) continue;
      const icon = { shop: ['$', '#ffd166'], shrine: ['✦', '#c39bff'], boss: ['☠', '#ff5544'], vault: ['◆', '#ffaa33'], secret: ['✧', '#99ccff'], miniboss: ['⚔', '#ffaa55'], arena: ['⚔', '#dd8866'], start: ['⌂', '#aaaaaa'] }[r.type];
      if (!icon) continue;
      const x = (r.cx + 0.5) * cell, y = (r.cy + 0.5) * cell;
      ctx.save();
      ctx.translate(x, y);
      if (!big) ctx.rotate(-p.yaw);
      ctx.fillStyle = icon[1];
      ctx.fillText(icon[0], 0, 0);
      ctx.restore();
    }
    // exit
    if (g.level.exit && g.level.exit.active) {
      ctx.fillStyle = '#88aaff';
      ctx.beginPath();
      ctx.arc(g.level.exit.pos.x / TILE * cell, g.level.exit.pos.z / TILE * cell, cell * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // loot
    for (const it of g.loot.items) {
      const pos = g.loot.itemPos(it);
      if (!world.seen[Math.floor(pos.z / TILE) * world.W + Math.floor(pos.x / TILE)]) continue;
      ctx.fillStyle = itemColor(it.item);
      ctx.fillRect(pos.x / TILE * cell - 2, pos.z / TILE * cell - 2, 4, 4);
    }
    // enemies that are aware or close
    for (const e of g.level.enemies) {
      if (e.dead || e.state === 'dormant') continue;
      if (!e.alerted && e.pos.distanceTo(p.pos) > 10) continue;
      ctx.fillStyle = e.boss || e.miniboss ? '#ff9933' : e.elite ? '#ffcc44' : '#e04444';
      ctx.beginPath();
      ctx.arc(e.pos.x / TILE * cell, e.pos.z / TILE * cell, e.boss ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // player arrow
    const px = p.pos.x / TILE * cell, pz = p.pos.z / TILE * cell;
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-p.yaw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    if (!big) {
      ctx.strokeStyle = 'rgba(200,170,120,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(Wc / 2, Hc / 2, Wc / 2 - 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(220,200,160,0.8)';
      ctx.font = '11px serif';
      ctx.textAlign = 'center';
      // north marker (world -Z) rotates with the map
      const r = Wc / 2 - 11;
      ctx.fillText('N', Wc / 2 + Math.sin(p.yaw) * r, Hc / 2 - Math.cos(p.yaw) * r + 4);
    }
  }
}

export { CONSUMABLES, ARMORS };
