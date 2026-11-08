import { CATALOG, CATEGORIES, PALETTE, OUTFITS } from '../wardrobe/catalog.js';
import { MATERIALS, PATTERNS } from '../wardrobe/fabric.js';
import { HAIR_COLORS } from '../character/hair.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

/**
 * Wardrobe panel: outfit presets, categories, item cards and a compact editor
 * (colour, fabric, pattern, sheerness) for whatever is selected.  Everything
 * applies instantly so she keeps walking while you dress her.
 */
export class WardrobeUI {
  constructor(app) {
    this.app = app;
    this.cat = 'tops';
    this.selected = null;    // slot being edited
    this.open = window.innerWidth > 900;
    this._build();
    this.render();
  }

  get wardrobe() { return this.app.wardrobe; }

  _build() {
    const root = el('div', 'ui');
    // header / help
    const help = el('div', 'help', `
      <div class="brand">Walk &amp; Wardrobe</div>
      <div class="keys"><b>WASD</b> / arrows walk · <b>Shift</b> brisk · <b>C</b> stroll · drag to orbit · wheel zoom · <b>1–5</b> camera · <b>G</b> floor grid · <b>Tab</b> wardrobe</div>`);
    root.appendChild(help);

    const speed = el('div', 'speed');
    speed.innerHTML = ['stroll', 'walk', 'brisk'].map((m) => `<button data-speed="${m}">${m}</button>`).join('');
    speed.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      this.app.speedMode = b.dataset.speed; this.renderSpeed(); b.blur();
    });
    root.appendChild(speed);
    this.speedEl = speed;

    const toggle = el('button', 'panel-toggle', 'Wardrobe');
    toggle.addEventListener('click', () => { this.setOpen(!this.open); toggle.blur(); });
    root.appendChild(toggle);
    this.toggleEl = toggle;

    const panel = el('div', 'panel');
    panel.innerHTML = `
      <div class="panel-head"><span>Wardrobe</span><button class="close" title="Close (Tab)">×</button></div>
      <div class="outfits"></div>
      <div class="tabs"></div>
      <div class="items"></div>
      <div class="editor"></div>
      <div class="foot"><button class="undress">Undress</button><span class="status"></span></div>`;
    panel.querySelector('.close').addEventListener('click', () => this.setOpen(false));
    panel.querySelector('.undress').addEventListener('click', (e) => { this.app.undress(); e.target.blur(); });
    root.appendChild(panel);
    this.panel = panel;
    // keep keyboard walking working while using the panel
    panel.addEventListener('mousedown', (e) => { if (e.target.tagName === 'BUTTON') e.preventDefault(); });

    const outfits = panel.querySelector('.outfits');
    for (const [id, o] of Object.entries(OUTFITS)) {
      const b = el('button', 'chip', o.label);
      b.addEventListener('click', () => this.app.applyOutfit(id));
      outfits.appendChild(b);
    }
    const tabs = panel.querySelector('.tabs');
    for (const c of [...CATEGORIES, { id: 'hair', label: 'Hair' }]) {
      const b = el('button', 'tab', c.label);
      b.dataset.cat = c.id;
      b.addEventListener('click', () => { this.cat = c.id; this.selected = null; this.render(); });
      tabs.appendChild(b);
    }
    document.body.appendChild(root);
    this.root = root;
    this.setOpen(this.open);
    this.renderSpeed();
  }

  setOpen(v) {
    this.open = v;
    this.panel.classList.toggle('open', v);
    this.toggleEl.classList.toggle('hidden', v);
    const wide = window.innerWidth > 700;
    this.app.cam && this.app.cam.setSideOffset(v && wide ? 170 : 0);
  }

  renderSpeed() {
    for (const b of this.speedEl.querySelectorAll('button')) b.classList.toggle('on', b.dataset.speed === this.app.speedMode);
  }

  setStatus(t) { this.panel.querySelector('.status').textContent = t || ''; }

  render() {
    const p = this.panel;
    for (const b of p.querySelectorAll('.tab')) b.classList.toggle('on', b.dataset.cat === this.cat);
    const items = p.querySelector('.items');
    items.innerHTML = '';
    if (this.cat === 'hair') { this._renderHair(items); p.querySelector('.editor').innerHTML = ''; return; }
    const cat = CATEGORIES.find((c) => c.id === this.cat);
    for (const def of Object.values(CATALOG)) {
      if (!cat.slots.includes(def.slot)) continue;
      const worn = this.wardrobe.isWorn(def.id);
      const card = el('button', 'card' + (worn ? ' worn' : ''));
      const w = this.wardrobe.get(def.slot);
      const col = worn && w ? w.opts.color : def.defaults.color;
      card.innerHTML = `<span class="sw" style="background:${col}"></span><span class="nm">${def.label}</span>`;
      card.addEventListener('click', () => {
        if (worn && !def.locked) {
          if (this.selected === def.slot) { this.app.removeSlot(def.slot); this.selected = null; }
          else this.selected = def.slot;
        } else {
          this.app.wearItem(def.id);
          this.selected = def.slot;
        }
        this.render();
      });
      items.appendChild(card);
    }
    this._renderEditor();
  }

  _renderHair(items) {
    const ch = this.app.character;
    for (const h of [{ id: 'none', label: 'Tied away' }, ...ch.meta.hair]) {
      const card = el('button', 'card' + (ch.hairId === h.id ? ' worn' : ''), `<span class="nm">${h.label}</span>`);
      card.addEventListener('click', async () => { await this.app.setHair(h.id); this.render(); });
      items.appendChild(card);
    }
    const sw = el('div', 'swatches hair');
    for (const [, c] of Object.entries(HAIR_COLORS)) {
      const b = el('button', 'swatch' + (this.app.hairColor === c.color ? ' on' : ''));
      b.style.background = c.color; b.title = c.label;
      b.addEventListener('click', () => { this.app.setHairColor(c.color); this.render(); });
      sw.appendChild(b);
    }
    const lab = el('div', 'label', 'Hair colour');
    items.appendChild(lab); items.appendChild(sw);
  }

  _renderEditor() {
    const ed = this.panel.querySelector('.editor');
    ed.innerHTML = '';
    const w = this.selected && this.wardrobe.get(this.selected);
    if (!w) { ed.innerHTML = '<div class="hint">Select an item to put it on. Click a worn item to edit it, click again to take it off.</div>'; return; }
    const def = w.def;
    ed.appendChild(el('div', 'label', `${def.label}${def.locked ? '' : ' <button class="mini remove">take off</button>'}`));
    const rm = ed.querySelector('.remove');
    rm && rm.addEventListener('click', () => { this.app.removeSlot(def.slot); this.selected = null; this.render(); });
    // colours
    const colors = def.colors || PALETTE;
    const sw = el('div', 'swatches');
    for (const c of colors) {
      const b = el('button', 'swatch' + (w.opts.color === c ? ' on' : ''));
      b.style.background = c;
      b.addEventListener('click', () => { this.app.restyle(def.slot, { color: c }); this.render(); });
      sw.appendChild(b);
    }
    const pick = el('input'); pick.type = 'color'; pick.value = w.opts.color || '#ffffff'; pick.className = 'picker'; pick.title = 'Custom colour';
    pick.addEventListener('input', () => this.app.restyle(def.slot, { color: pick.value }));
    sw.appendChild(pick);
    ed.appendChild(sw);
    // fabric
    if (def.materials && def.materials.length > 1) {
      ed.appendChild(el('div', 'label', 'Fabric'));
      const row = el('div', 'chips');
      for (const m of def.materials) {
        const b = el('button', 'chip' + (w.opts.material === m ? ' on' : ''), MATERIALS[m] ? MATERIALS[m].label : m);
        b.addEventListener('click', () => { this.app.restyle(def.slot, { material: m }); this.render(); });
        row.appendChild(b);
      }
      ed.appendChild(row);
    }
    // pattern
    if (def.patterns && def.patterns.length > 1) {
      ed.appendChild(el('div', 'label', 'Pattern'));
      const row = el('div', 'chips');
      for (const pt of def.patterns) {
        const b = el('button', 'chip' + ((w.opts.pattern || 'solid') === pt ? ' on' : ''), PATTERNS[pt].label);
        b.addEventListener('click', () => { this.app.restyle(def.slot, { pattern: pt }); this.render(); });
        row.appendChild(b);
      }
      ed.appendChild(row);
      if ((w.opts.pattern || 'solid') !== 'solid') {
        const row2 = el('div', 'swatches');
        row2.appendChild(el('span', 'tiny', 'Pattern colour'));
        for (const c of ['#1d2433', '#7a1f2b', '#f7f5f0', '#111114', '#d98b3a', '#3d6a9e', '#2f4a3a', '#e8a0a8']) {
          const b = el('button', 'swatch small' + (w.opts.color2 === c ? ' on' : ''));
          b.style.background = c;
          b.addEventListener('click', () => { this.app.restyle(def.slot, { color2: c }); this.render(); });
          row2.appendChild(b);
        }
        ed.appendChild(row2);
      }
    }
    // hosiery sheerness
    if (def.sheerOptions) {
      ed.appendChild(el('div', 'label', 'Denier'));
      const r = el('input'); r.type = 'range'; r.min = '0.08'; r.max = '0.95'; r.step = '0.01'; r.value = String(w.opts.density ?? 0.3); r.className = 'range';
      r.addEventListener('input', () => { w.material.userData.uniforms.uSheerDensity.value = parseFloat(r.value); w.opts.density = parseFloat(r.value); });
      ed.appendChild(r);
    }
  }
}
