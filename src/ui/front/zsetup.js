// Zombie Survival setup: difficulty cards (zdiff.js presets: label, blurb, start money, break),
// squad size (0-10 bots), bot skill, the bots' roles (zsquad.js: Auto, or a pick per bot),
// your look, map, break length, squad scaling, hardcore and first-run tips. Start hands onStart the New Game options (zdiff.js zombieOptions keys
// plus mode / map / allies / difficulty / skin / tips) on top of the previous ones.
// Keys: Enter starts, left / right pick the difficulty, Esc goes back (Menus._key).
//
//   const s = buildZombieSetup(d, { onStart, onBack, sound });  root.appendChild(s.el)
//   d: the previous options + maps [[id, label]], mapInfo(id), addFiles(FileList) (see Menus.showNewGame)
import { ZDIFF, ZDIFF_ORDER, DEFAULT_ZDIFF } from '../../game/zdiff.js';
import { CLASSES } from '../menu/text.js';
import { ROLES, ROLE_IDS, ROLE_ORDER } from '../../game/zsquad.js';

const PIPS = { casual: 1, normal: 2, hard: 3, nightmare: 4 };
const BREAKS = [0, 5, 8, 10, 12, 15, 20, 25, 30, 45, 60, 90, 120];
const SKILLS = [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard'], ['expert', 'Expert']];
const LOOKS = [['auto', 'Random'], ...CLASSES.CT.map((c) => [c.skin, c.name.replace('Seal Team 6', 'SEAL Team 6')])];

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
const money = (v) => '$' + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** A small standing figure (squad row): you (amber), a bot (bone), an empty slot. */
function figure(kind) {
  const fill = kind === 'you' ? '#f2a541' : kind === 'bot' ? '#e9dccb' : 'none';
  const stroke = kind === 'off' ? 'rgba(243,233,220,0.25)' : 'none';
  return `<svg viewBox="0 0 10 16"><g fill="${fill}" stroke="${stroke}" stroke-width="0.7"><circle cx="5" cy="2.6" r="2.1"/><path d="M1.6 6.2Q5 4.6 8.4 6.2L8 11H6.6L6.3 15.6H3.7L3.4 11H2Z"/></g></svg>`;
}

export function buildZombieSetup(d = {}, { onStart, onBack, sound } = {}) {
  const st = {
    zdiff: ZDIFF[d.zdiff] ? d.zdiff : DEFAULT_ZDIFF,
    allies: Math.max(0, Math.min(10, d.allies ?? 3)),
    difficulty: SKILLS.some(([k]) => k === d.difficulty) ? d.difficulty : 'normal',
    skin: LOOKS.some(([k]) => k === d.skin) ? d.skin : 'auto',
    breakLen: BREAKS.includes(+d.breakLen) ? +d.breakLen : 0,
    squadScaling: d.squadScaling !== false,
    hardcore: !!d.hardcore,
    tips: d.tips !== false,
    // the bots' roles: 'auto' (ROLE_ORDER, then riflemen) or a pick per bot slot (zsquad.js)
    roles: Array.from({ length: 10 }, (_, i) => (Array.isArray(d.roles) && ROLES[d.roles[i]] ? d.roles[i] : 'auto')),
    roleMode: Array.isArray(d.roles) && d.roles.some((r) => ROLES[r]) ? 'pick' : 'auto',
  };
  const click = (n = 'menu_click') => { try { sound?.(n); } catch { /* ignore */ } };
  const root = el('div', 'fe-screen fe fe-setup');
  const frame = el('div', 'fe-frame');
  root.appendChild(frame);

  // header
  const head = el('div', 'fe-head');
  const left = el('div');
  left.append(el('div', 'fe-kicker', 'Zombie survival'), el('h1', null, 'New run'));
  const back = el('div', 'fe-back', '&lsaquo;&nbsp; Back');
  back.addEventListener('click', () => { click(); onBack?.(); });
  head.append(left, back);
  frame.appendChild(head);

  // difficulty
  frame.appendChild(el('div', 'fe-label', 'Difficulty'));
  const cards = el('div', 'fe-cards');
  const cardEls = {};
  for (const id of ZDIFF_ORDER) {
    const P = ZDIFF[id];
    const c = el('div', 'fe-card');
    c.dataset.id = id;
    const pips = el('div', 'fe-pips' + (P.sandbox ? ' sandbox' : ''));
    for (let i = 0; i < 4; i++) pips.appendChild(el('i', i < (P.sandbox ? 4 : PIPS[id] || 2) ? 'lit' : ''));
    c.append(pips, el('div', 'name', P.label), el('div', 'blurb', P.blurb));
    c.appendChild(el('div', 'stats', `<div><b>${money(P.econ.startMoney)}</b><small>Start cash</small></div><div class="r"><b>${P.breakLen} s</b><small>Breaks</small></div>`));
    c.addEventListener('click', () => { click(); st.zdiff = id; refresh(); });
    cards.appendChild(c);
    cardEls[id] = c;
  }
  frame.appendChild(cards);

  // squad / rules
  const cols = el('div', 'fe-cols');
  const sq = el('div', 'fe-box');
  const ru = el('div', 'fe-box');
  sq.appendChild(el('div', 'fe-label', 'Squad'));
  ru.appendChild(el('div', 'fe-label', 'Rules'));
  const row = (box, k, v) => { const r = el('div', 'fe-row'); r.append(el('div', 'k', k), v); box.appendChild(r); return r; };
  // squad size
  const step = el('div', 'fe-step');
  const minus = el('button', null, '&minus;'), plus = el('button', null, '+'), num = el('span');
  step.append(minus, num, plus);
  minus.addEventListener('click', () => { click(); st.allies = Math.max(0, st.allies - 1); refresh(); });
  plus.addEventListener('click', () => { click(); st.allies = Math.min(10, st.allies + 1); refresh(); });
  const squadV = el('div', 'v');
  const figs = el('div', 'fe-squad');
  squadV.append(step, figs);
  row(sq, 'Bots', squadV);
  // bot skill / look
  const seg = (opts, key) => {
    const s = el('div', 'fe-seg');
    for (const [k, label] of opts) {
      const o = el('span', null, label);
      o.dataset.k = k;
      o.addEventListener('click', () => { click(); st[key] = k; refresh(); });
      s.appendChild(o);
    }
    return s;
  };
  const skill = seg(SKILLS, 'difficulty');
  const skillV = el('div', 'v');
  skillV.appendChild(skill);
  row(sq, 'Bot skill', skillV);
  // roles: Auto, or click a bot's chip to cycle its role
  const roleSeg = seg([['auto', 'Auto'], ['pick', 'Pick']], 'roleMode');
  const chips = el('div', 'fe-roles');
  const rolesV = el('div', 'v');
  rolesV.append(roleSeg, chips);
  row(sq, 'Roles', rolesV);
  const look = seg(LOOKS, 'skin');
  const lookV = el('div', 'v');
  lookV.appendChild(look);
  row(sq, 'Your look', lookV);
  const tips = toggle('First-run tips', 'Short hints during your first runs (buying, ready-up, revives, C4).', 'tips');
  sq.appendChild(tips);

  // map
  const maps = d.maps || [['de_dust2', 'de_dust2']];
  const map = el('select', 'fe-select');
  for (const [id, label] of maps) { const o = el('option', null); o.textContent = label; o.value = id; map.appendChild(o); }
  map.value = maps.some(([id]) => id === d.map) ? d.map : maps[0][0];
  map.addEventListener('keydown', (e) => e.stopPropagation());
  const mapV = el('div', 'v');
  mapV.appendChild(map);
  row(ru, 'Map', mapV);
  const mapInfo = el('div', 'fe-mapinfo');
  mapInfo.hidden = true;
  const info = el('div');
  const pick = el('input');
  pick.type = 'file';
  pick.multiple = true;
  pick.accept = '.bsp,.wad,.tga';
  mapInfo.append(info, pick);
  ru.appendChild(mapInfo);
  // break length
  const brk = el('input', 'fe-range');
  brk.type = 'range';
  brk.min = 0; brk.max = BREAKS.length - 1; brk.step = 1;
  brk.value = BREAKS.indexOf(st.breakLen);
  const brkVal = el('span', 'fe-val');
  brk.addEventListener('input', () => { st.breakLen = BREAKS[+brk.value]; refresh(); });
  brk.addEventListener('keydown', (e) => e.stopPropagation());
  const brkV = el('div', 'v');
  brkV.append(brk, brkVal);
  row(ru, 'Breaks', brkV);
  const scaling = toggle('Squad scaling', 'The horde grows with your squad: every bot adds to it.', 'squadScaling');
  const hard = toggle('Hardcore', 'No health back between waves, guns only in the breaks, radar pings only.', 'hardcore');
  ru.append(scaling, hard);
  cols.append(sq, ru);
  frame.appendChild(cols);

  // footer
  const foot = el('div', 'fe-foot2');
  const summary = el('div', 'fe-summary');
  const go = el('button', 'fe-go', 'Start run');
  go.addEventListener('click', start);
  foot.append(summary, go);
  frame.appendChild(foot);

  function toggle(title, text, key) {
    const t = el('div', 'fe-toggle', `<div class="sw"></div><div class="tx"><b>${title}</b><span>${text}</span></div>`);
    t.dataset.key = key;
    t.addEventListener('click', () => { click(); st[key] = !st[key]; refresh(); });
    return t;
  }

  function refresh() {
    const P = ZDIFF[st.zdiff];
    for (const id of ZDIFF_ORDER) cardEls[id].classList.toggle('on', id === st.zdiff);
    num.textContent = String(st.allies);
    figs.innerHTML = figure('you') + Array.from({ length: 10 }, (_, i) => figure(i < st.allies ? 'bot' : 'off')).join('');
    for (const o of skill.children) o.classList.toggle('on', o.dataset.k === st.difficulty);
    for (const o of look.children) o.classList.toggle('on', o.dataset.k === st.skin);
    for (const o of roleSeg.children) o.classList.toggle('on', o.dataset.k === st.roleMode);
    drawRoles();
    for (const t of [tips, scaling, hard]) t.classList.toggle('on', !!st[t.dataset.key]);
    brkVal.innerHTML = st.breakLen ? `${st.breakLen} s` : `Preset <small>(${P.breakLen} s)</small>`;
    const squad = st.allies ? `you + ${st.allies} bot${st.allies === 1 ? '' : 's'}` : 'solo';
    summary.innerHTML = `<b>${P.label}</b>${st.hardcore ? ' &middot; <b>Hardcore</b>' : ''} &middot; ${squad}${st.allies && st.roleMode === 'pick' ? ' (roles picked)' : ''} &middot; ${st.breakLen || P.breakLen} s breaks &middot; ${map.value}`;
  }

  /** The role each bot slot ends up with: its pick, else the next of ROLE_ORDER nobody picked, else Rifleman (as zsquad.js assign). */
  function effectiveRoles() {
    const pick = st.roleMode === 'pick', out = [], taken = new Set();
    for (let i = 0; i < st.allies; i++) if (pick && st.roles[i] !== 'auto') taken.add(st.roles[i]);
    for (let i = 0; i < st.allies; i++) {
      if (pick && st.roles[i] !== 'auto') { out.push(st.roles[i]); continue; }
      const r = ROLE_ORDER.find((x) => !taken.has(x)) || 'rifleman';
      taken.add(r);
      out.push(r);
    }
    return out;
  }
  function drawRoles() {
    chips.innerHTML = '';
    const eff = effectiveRoles(), pick = st.roleMode === 'pick';
    if (!st.allies) { chips.appendChild(el('small', 'fe-rolenote', 'Solo: no bots')); return; }
    eff.forEach((r, i) => {
      const R = ROLES[r], c = `rgb(${R.rgb.join(',')})`, set = pick && st.roles[i] !== 'auto';
      const ch = el('span', set ? 'set' : pick ? '' : 'off', R.short);
      ch.style.borderColor = c;
      if (set) ch.style.background = c; else ch.style.color = c;
      ch.title = `${R.label}${set ? '' : ' (auto)'}: ${R.text}${pick ? '\nClick: change' : ''}`;
      if (pick) ch.addEventListener('click', () => { click(); const k = ['auto', ...ROLE_IDS]; st.roles[i] = k[(k.indexOf(st.roles[i]) + 1) % k.length]; refresh(); });
      chips.appendChild(ch);
    });
  }

  let mapOk = true;
  async function refreshMap() {
    const id = map.value;
    refresh();
    if (!d.mapInfo || id === 'de_dust2') { mapInfo.hidden = true; mapOk = true; go.disabled = false; return; }
    mapInfo.hidden = false;
    const r = await d.mapInfo(id);
    if (map.value !== id) return;
    info.innerHTML = r.html;
    pick.hidden = !!r.bundled;
    mapOk = r.ok;
    go.disabled = !mapOk;
  }
  map.addEventListener('change', refreshMap);
  pick.addEventListener('change', async () => {
    if (!pick.files?.length || !d.addFiles) return;
    info.textContent = 'Storing files...';
    try { await d.addFiles(pick.files); } catch (e) { info.textContent = 'Could not store the files: ' + e.message; return; }
    pick.value = '';
    refreshMap();
  });

  function start() {
    if (!mapOk) return;
    click('menu_select');
    const prev = { ...d };
    delete prev.maps; delete prev.mapInfo; delete prev.addFiles;
    onStart?.({
      ...prev, mode: 'zombies', map: map.value, allies: st.allies, difficulty: st.difficulty, skin: st.skin,
      zdiff: st.zdiff, squadScaling: st.squadScaling, breakLen: st.breakLen, hardcore: st.hardcore, tips: st.tips,
      roles: st.roleMode === 'pick' && st.allies ? st.roles.slice(0, st.allies) : null,
    });
  }

  const onKey = (e) => {
    if (!root.isConnected) { window.removeEventListener('keydown', onKey); return; }
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT')) return;
    const i = ZDIFF_ORDER.indexOf(st.zdiff);
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); start(); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); click(); st.zdiff = ZDIFF_ORDER[Math.min(ZDIFF_ORDER.length - 1, i + 1)]; refresh(); }
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); click(); st.zdiff = ZDIFF_ORDER[Math.max(0, i - 1)]; refresh(); }
  };
  window.addEventListener('keydown', onKey);
  refreshMap();
  return { el: root, state: st, start, destroy: () => window.removeEventListener('keydown', onKey) };
}
