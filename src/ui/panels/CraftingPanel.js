// Crafting panel: categories | recipe list (craftable highlighted) | details + craft button.
import { getItemDef } from '../../items/items.js';
import { getItemIconURL } from '../../items/icons.js';
import { h, clear, setText, setStyle, setClass, clamp } from '../dom.js';
import { pixelImg } from '../pixel.js';

const CAT_ICON = {
  all: 'star', medical: 'injured', medicine: 'injured', health: 'injured', weapons: 'hammer', weapon: 'hammer',
  melee: 'hammer', food: 'food', cooking: 'food', survival: 'hot', fire: 'hot', camping: 'hot', building: 'box',
  construction: 'box', carpentry: 'box', barricades: 'box', tools: 'hammer', tool: 'hammer', clothing: 'bag', tailoring: 'bag',
  ammo: 'bolt', ammunition: 'bolt', firearms: 'bolt', electronics: 'radio', explosives: 'pain', traps: 'pain',
  water: 'drop', drink: 'drop', misc: 'unknown', other: 'unknown', repair: 'hammer', farming: 'food',
};

const cap = (s) => String(s || 'misc').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export class CraftingPanel {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.cat = 'all';
    this.selected = null;
    this.query = '';
    this.recipes = [];
    this.version = -1;
    this.pollT = 0;
    this.build();
  }

  build() {
    this.cats = h('div.craft-cats');
    this.search = h('input.craft-search', { type: 'text', placeholder: 'Search recipes…', spellcheck: false });
    this.search.addEventListener('input', () => { this.query = this.search.value.trim().toLowerCase(); this.renderList(); });
    this.list = h('div.craft-list');
    this.onlyCraftable = false;
    this.toggle = h('button.chip-toggle', { type: 'button', text: 'Craftable only' });
    this.toggle.addEventListener('click', () => {
      this.onlyCraftable = !this.onlyCraftable;
      setClass(this.toggle, 'on', this.onlyCraftable);
      this.ui.sound('ui_click');
      this.renderList();
    });
    this.detail = h('div.craft-detail');
    this.el = h('div.panel.craft-panel',
      h('div.craft-col.cc-cats', h('div.col-head', h('span.col-title', 'Categories')), this.cats),
      h('div.craft-col.cc-list', h('div.col-head', h('span.col-title', 'Recipes'), this.countEl = h('span.col-sub')),
        h('div.craft-tools', this.search, this.toggle), this.list),
      h('div.craft-col.cc-detail', this.detail));
  }

  onShow() {
    this.fetch();
    this.renderAll();
  }
  onHide() { this.search.blur(); }

  fetch() {
    try { this.recipes = this.game.getRecipes?.() || []; } catch (e) { console.warn('getRecipes failed', e); this.recipes = []; }
    this.version = this.game.player?.inv?.version;
  }

  renderAll() {
    this.renderCats();
    this.renderList();
    this.renderDetail();
  }

  categories() {
    const map = new Map();
    for (const r of this.recipes) {
      const c = r.recipe.category || 'misc';
      if (!map.has(c)) map.set(c, { total: 0, ok: 0 });
      const m = map.get(c);
      m.total++;
      if (r.canCraft) m.ok++;
    }
    return map;
  }

  renderCats() {
    clear(this.cats);
    const map = this.categories();
    const all = { total: this.recipes.length, ok: this.recipes.filter((r) => r.canCraft).length };
    const entries = [['all', all], ...[...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))];
    if (this.cat !== 'all' && !map.has(this.cat)) this.cat = 'all';
    for (const [c, m] of entries) {
      const b = h('button.cat-btn' + (c === this.cat ? '.on' : '') + (m.ok ? '.has' : ''), { type: 'button' },
        pixelImg(CAT_ICON[c.toLowerCase()] || 'unknown', 'cat-ico'),
        h('span.cat-name', c === 'all' ? 'All' : cap(c)),
        h('span.cat-count', `${m.ok}/${m.total}`));
      b.addEventListener('click', () => {
        this.cat = c;
        this.ui.sound('ui_click');
        this.renderCats();
        this.renderList();
      });
      b.addEventListener('pointerenter', () => this.ui.sound('ui_hover', 0.2));
      this.cats.appendChild(b);
    }
  }

  filtered() {
    let list = this.recipes.filter((r) => this.cat === 'all' || (r.recipe.category || 'misc') === this.cat);
    if (this.onlyCraftable) list = list.filter((r) => r.canCraft);
    if (this.query) list = list.filter((r) => (r.recipe.name || '').toLowerCase().includes(this.query)
      || (r.recipe.desc || '').toLowerCase().includes(this.query));
    return list.slice().sort((a, b) => (b.canCraft - a.canCraft) || (a.recipe.name || '').localeCompare(b.recipe.name || ''));
  }

  renderList() {
    const st = this.list.scrollTop;
    clear(this.list);
    const list = this.filtered();
    setText(this.countEl, `${list.filter((r) => r.canCraft).length} craftable`);
    if (!this.selected || !this.recipes.find((r) => r.recipe.id === this.selected)) this.selected = list[0]?.recipe.id || null;
    for (const r of list) {
      const res = r.recipe.result || {};
      const def = getItemDef(res.id);
      const row = h('div.recipe' + (r.canCraft ? '.ok' : '') + (r.recipe.id === this.selected ? '.sel' : ''),
        h('div.recipe-icon', h('img.px', { src: getItemIconURL(def), draggable: false, alt: '' })),
        h('div.recipe-text',
          h('div.recipe-name', r.recipe.name || def.name),
          h('div.recipe-sub', r.canCraft ? 'Ready to craft' : missingText(r))),
        (res.count || 1) > 1 ? h('span.recipe-count', '×' + res.count) : null);
      row.addEventListener('click', () => {
        this.selected = r.recipe.id;
        this.ui.sound('ui_click', 0.6);
        for (const el of this.list.querySelectorAll('.recipe.sel')) el.classList.remove('sel');
        row.classList.add('sel');
        this.renderDetail();
      });
      row.addEventListener('dblclick', () => { if (r.canCraft) this.craft(r); });
      this.list.appendChild(row);
    }
    if (!list.length) this.list.appendChild(h('div.inv-empty', this.query ? 'No recipe matches your search.' : 'No recipes here.'));
    this.list.scrollTop = st;
    this.renderDetail();
  }

  renderDetail() {
    clear(this.detail);
    const r = this.recipes.find((x) => x.recipe.id === this.selected);
    if (!r) {
      this.detail.appendChild(h('div.inv-empty', 'Select a recipe.'));
      return;
    }
    const rec = r.recipe;
    const res = rec.result || {};
    const def = getItemDef(res.id);
    const row = (ok, label, value) => h('div.req' + (ok ? '.ok' : '.no'),
      h('i.req-mark', ok ? '✔' : '✖'), h('span.req-label', label), value != null ? h('span.req-val', value) : null);

    const inputs = r.inputs || [];
    const tools = r.tools || [];
    this.progLabel = h('span');
    this.progFill = h('i');
    this.prog = h('div.craft-prog.hidden', this.progLabel, h('div.progress-bar', this.progFill));
    this.craftBtn = h('button.btn.btn-primary.craft-btn' + (r.canCraft ? '' : '.disabled'), { type: 'button' },
      r.canCraft ? 'Craft' : 'Missing requirements');
    this.craftBtn.disabled = !r.canCraft;
    this.craftBtn.addEventListener('click', () => this.craft(r));
    this.craftBtn.addEventListener('pointerenter', () => this.ui.sound('ui_hover', 0.3));

    this.detail.append(
      h('div.cd-head',
        h('div.cd-icon', h('img.px', { src: getItemIconURL(def), draggable: false, alt: '' }),
          (res.count || 1) > 1 ? h('span.slot-count', String(res.count)) : null),
        h('div.cd-titles',
          h('div.cd-name', rec.name || def.name),
          h('div.cd-sub', `${cap(rec.category)}${rec.time ? ` · ${fmtTime(rec.time)}` : ''}`))),
      h('div.cd-desc', rec.desc || def.desc || ''),
      h('div.cd-sec', h('div.cd-sec-title', 'Ingredients'),
        inputs.length ? inputs.map((i) => row(i.ok ?? i.have >= i.need, i.label, `${Math.min(i.have ?? 0, 999)}/${i.need ?? 1}`))
          : h('div.req.none', 'None')),
      tools.length ? h('div.cd-sec', h('div.cd-sec-title', 'Tools'), tools.map((t) => row(t.ok, t.label, t.ok ? 'have' : 'need'))) : null,
      r.station ? h('div.cd-sec', h('div.cd-sec-title', 'Station'), row(r.station.ok, r.station.label, r.station.ok ? 'nearby' : 'not near')) : null,
      h('div.cd-spacer'),
      this.prog,
      this.craftBtn,
    );
    this.updateProgress();
  }

  craft(r) {
    if (!r.canCraft) return;
    this.ui.sound('ui_click');
    try { this.game.craft?.(r.recipe.id); } catch (e) { console.error('craft failed', e); }
    this.fetch();
    this.renderAll();
  }

  updateProgress() {
    if (!this.prog) return;
    const pr = this.game.hud?.progress;
    setClass(this.prog, 'hidden', !pr);
    if (pr) {
      setText(this.progLabel, pr.label || 'Crafting…');
      setStyle(this.progFill, 'transform', `scaleX(${clamp(pr.t || 0, 0, 1).toFixed(3)})`);
    }
  }

  update(dt) {
    this.updateProgress();
    this.pollT -= dt;
    const v = this.game.player?.inv?.version;
    if (v !== this.version || this.pollT <= 0) {
      this.pollT = 1;
      const before = sig(this.recipes);
      this.fetch();
      if (sig(this.recipes) !== before) this.renderAll();
    }
  }

  refresh() { this.fetch(); this.renderAll(); }
}

function sig(list) {
  let s = '';
  for (const r of list) {
    s += r.recipe.id + (r.canCraft ? '1' : '0');
    for (const i of r.inputs || []) s += i.have;
    for (const t of r.tools || []) s += t.ok ? 't' : 'f';
    if (r.station) s += r.station.ok ? 'S' : 's';
    s += ';';
  }
  return s;
}

function missingText(r) {
  const m = r.missing || [];
  if (!m.length) {
    const st = r.station && !r.station.ok ? r.station.label : null;
    return st ? `Needs ${st}` : 'Missing requirements';
  }
  const first = m[0];
  const more = m.length > 1 ? ` +${m.length - 1}` : '';
  return `Need ${first.label}${first.need > 1 ? ` (${first.have ?? 0}/${first.need})` : ''}${more}`;
}

function fmtTime(t) {
  // recipe.time in seconds of real time (game logic decides), show compact
  if (t >= 60) return `${Math.round(t / 60)} min`;
  return `${Math.round(t)} s`;
}
