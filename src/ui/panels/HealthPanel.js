// Health panel: body silhouette with injured parts, wound list with treatments, vitals.
import { h, clear, setText, setStyle, setClass, clamp, PART_NAMES, WOUND_NAMES } from '../dom.js';
import { pixelImg } from '../pixel.js';
import { makeFigure, partCenter } from '../figure.js';

const FIG_PX = 8;

function normSev(s) {
  if (s == null || isNaN(s)) return 0.5;
  if (s <= 1) return s;
  if (s <= 3) return s / 3;
  if (s <= 10) return s / 10;
  return s / 100;
}
function sevLabel(v) {
  return v < 0.34 ? 'Minor' : v < 0.67 ? 'Moderate' : 'Severe';
}

export class HealthPanel {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.sig = '';
    this.pollT = 0;
    this.build();
  }

  build() {
    this.fig = makeFigure(FIG_PX, 'health-fig');
    this.markers = h('div.fig-markers');
    this.fig.el.appendChild(this.markers);
    this.overall = h('div.hb-overall');
    this.bodyCol = h('div.health-col.hc-body',
      h('div.col-head', h('span.col-title', 'Body'), this.overallSub = h('span.col-sub')),
      h('div.hb-stage', this.fig.el),
      this.overall,
      h('div.hb-legend',
        h('span', h('i.lg.lg-ok'), 'Healthy'), h('span', h('i.lg.lg-hurt'), 'Injured'),
        h('span', h('i.lg.lg-bleed'), 'Bleeding'), h('span', h('i.lg.lg-band'), 'Bandaged')));
    for (const [name, part] of Object.entries(this.fig.parts)) {
      part.addEventListener('pointerenter', () => this.highlightPart(name, true));
      part.addEventListener('pointerleave', () => this.highlightPart(name, false));
    }

    this.woundList = h('div.wound-list');
    this.woundCount = h('span.col-sub');
    this.woundCol = h('div.health-col.hc-wounds',
      h('div.col-head', h('span.col-title', 'Injuries'), this.woundCount), this.woundList);

    this.vitals = h('div.vitals-list');
    this.vitalCol = h('div.health-col.hc-vitals',
      h('div.col-head', h('span.col-title', 'Condition')), this.vitals);

    this.el = h('div.panel.health-panel', this.bodyCol, this.woundCol, this.vitalCol);
  }

  onShow() { this.render(true); }
  onHide() {}
  refresh() { this.render(true); }

  update(dt) {
    this.pollT -= dt;
    if (this.pollT <= 0) {
      this.pollT = 0.25;
      this.render(false);
    }
  }

  highlightPart(name, on) {
    for (const el of this.woundList.querySelectorAll(`.wound[data-part="${name}"]`)) el.classList.toggle('hl', on);
    this.fig.parts[name]?.classList.toggle('hl', on);
  }

  render(force) {
    const p = this.game.player;
    if (!p) return;
    const wounds = p.wounds || [];
    const wsig = JSON.stringify(wounds) + '|' + (p.inv?.version ?? '');
    if (force || wsig !== this.sig) {
      this.sig = wsig;
      this.renderBody(wounds);
      this.renderWounds(wounds);
    }
    this.renderVitals(p);
  }

  renderBody(wounds) {
    const byPart = {};
    for (const w of wounds) (byPart[w.part] ||= []).push(w);
    for (const [name, el] of Object.entries(this.fig.parts)) {
      const list = byPart[name] || [];
      let dmg = 0;
      for (const w of list) dmg = Math.max(dmg, normSev(w.severity) * (1 - clamp(w.heal || 0, 0, 1) * 0.8));
      const lvl = !list.length ? 0 : dmg < 0.34 ? 1 : dmg < 0.67 ? 2 : 3;
      el.dataset.lvl = String(lvl);
      setClass(el, 'bleeding', list.some((w) => w.bleeding));
      setClass(el, 'bandaged', list.length > 0 && list.every((w) => w.bandaged));
      setClass(el, 'infected', list.some((w) => w.infected));
      setClass(el, 'fractured', list.some((w) => w.type === 'fracture' && !w.splinted));
      setClass(el, 'splinted', list.some((w) => w.splinted));
    }
    clear(this.markers);
    for (const [part, list] of Object.entries(byPart)) {
      const c = partCenter(part, FIG_PX);
      list.forEach((w, k) => {
        const off = (k - (list.length - 1) / 2) * 18;
        const vertical = part !== 'torso' && part !== 'head';
        const x = c.x + (vertical ? 0 : off);
        const y = c.y + (vertical ? off : 0);
        const m = h('div.fig-marker' + (w.bleeding ? '.bleed' : '') + (w.bandaged ? '.band' : ''),
          { style: { left: `calc(var(--u) * ${x})`, top: `calc(var(--u) * ${y})` } },
          pixelImg('w_' + (w.type || 'scratch'), 'fm-ico'));
        this.markers.appendChild(m);
      });
    }
    const bleeding = wounds.filter((w) => w.bleeding).length;
    setText(this.overallSub, wounds.length ? `${wounds.length} wound${wounds.length > 1 ? 's' : ''}` : 'Unharmed');
    clear(this.overall);
    if (bleeding) this.overall.appendChild(h('div.hb-alert', pixelImg('bleeding', 'hb-alert-ico'), `Bleeding from ${bleeding} wound${bleeding > 1 ? 's' : ''}`));
    else if (wounds.length) this.overall.appendChild(h('div.hb-note', 'No active bleeding.'));
    else this.overall.appendChild(h('div.hb-note', 'No injuries. Keep it that way.'));
  }

  renderWounds(wounds) {
    const st = this.woundList.scrollTop;
    clear(this.woundList);
    setText(this.woundCount, wounds.length ? `${wounds.length}` : '');
    if (!wounds.length) {
      this.woundList.appendChild(h('div.inv-empty', 'You have no injuries.'));
      return;
    }
    wounds.forEach((w, i) => {
      const sev = normSev(w.severity);
      const tags = [];
      if (w.bleeding) tags.push(['Bleeding', 'bad']);
      if (w.type === 'fracture' && !w.splinted) tags.push(['Unsplinted', 'bad']);
      if (w.infected) tags.push(['Infected', 'bad']);
      if (w.bandaged && w.bandageDirty) tags.push(['Dirty bandage', 'warn']);
      else if (w.bandaged) tags.push(['Bandaged', 'good']);
      if (w.disinfected) tags.push(['Disinfected', 'good']);
      if (w.splinted) tags.push(['Splinted', 'good']);
      if (!w.bandaged && !w.splinted && w.type !== 'fracture' && !w.bleeding) tags.push(['Untreated', 'warn']);
      const heal = clamp(w.heal || 0, 0, 1);
      let treatments = [];
      try { treatments = this.game.getTreatments?.(i) || []; } catch (e) { console.warn('getTreatments failed', e); }
      const actions = h('div.wound-actions');
      for (const t of treatments) {
        const b = h('button.btn.btn-sm' + (t.disabled ? '.disabled' : ''), { type: 'button', text: t.label });
        b.disabled = !!t.disabled;
        if (!t.disabled) {
          b.addEventListener('click', () => {
            this.ui.sound('ui_click');
            try { t.run?.(); } catch (e) { console.error('treatment failed', e); }
            this.ui.refresh();
          });
          b.addEventListener('pointerenter', () => this.ui.sound('ui_hover', 0.25));
        }
        actions.appendChild(b);
      }
      if (!treatments.length) actions.appendChild(h('span.wound-none', 'No treatment available'));
      const row = h('div.wound.sev' + Math.min(3, 1 + Math.floor(sev * 2.99)) + (w.bleeding ? '.bleeding' : ''),
        { dataset: { part: w.part } },
        h('div.wound-ico', pixelImg('w_' + (w.type || 'scratch'), 'wi')),
        h('div.wound-main',
          h('div.wound-title',
            h('span.wound-type', WOUND_NAMES[w.type] || cap(w.type)),
            h('span.wound-part', PART_NAMES[w.part] || w.part),
            h('span.wound-sev', sevLabel(sev))),
          h('div.wound-tags', tags.map(([t, c]) => h('span.tag.' + c, t))),
          h('div.wound-heal', h('div.wh-bar', h('i', { style: { width: (heal * 100).toFixed(0) + '%' } })),
            h('span', heal >= 0.995 ? 'Healed' : `Healing ${Math.round(heal * 100)}%`)),
          actions));
      row.addEventListener('pointerenter', () => this.fig.parts[w.part]?.classList.add('hl'));
      row.addEventListener('pointerleave', () => this.fig.parts[w.part]?.classList.remove('hl'));
      this.woundList.appendChild(row);
    });
    this.woundList.scrollTop = st;
  }

  renderVitals(p) {
    if (!this.vrows) {
      this.vrows = {};
      const mk = (id, label, group) => {
        const val = h('span.vl-val');
        const fill = h('i');
        const row = h('div.vl.vl-' + id, h('div.vl-top', h('span.vl-label', label), val), h('div.vl-bar', fill));
        this.vrows[id] = { row, val, fill };
        group.appendChild(row);
      };
      const g1 = h('div.vl-group', h('div.vl-group-title', 'Vitals'));
      const g2 = h('div.vl-group', h('div.vl-group-title', 'Body'));
      const g3 = h('div.vl-group', h('div.vl-group-title', 'Mind'));
      mk('health', 'Health', g1); mk('pain', 'Pain', g1); mk('sickness', 'Sickness', g1); mk('infection', 'Infection', g1);
      mk('temp', 'Body temperature', g2); mk('wetness', 'Wetness', g2); mk('fatigue', 'Fatigue', g2);
      mk('hunger', 'Hunger', g2); mk('thirst', 'Thirst', g2);
      mk('panic', 'Panic', g3);
      this.armorEl = h('div.vl-armor');
      this.vitals.append(g1, g2, g3, h('div.vl-group', h('div.vl-group-title', 'Protection'), this.armorEl));
    }
    const set = (id, frac, text, tone) => {
      const r = this.vrows[id];
      setText(r.val, text);
      setStyle(r.fill, 'transform', `scaleX(${clamp(frac, 0, 1).toFixed(3)})`);
      r.row.dataset.tone = tone;
    };
    const lvl = (v, a, b, c) => (v >= c ? 'crit' : v >= b ? 'bad' : v >= a ? 'warn' : 'ok');
    const hp = (p.health ?? 100) / (p.maxHealth || 100);
    set('health', hp, `${Math.round(hp * 100)}%`, hp < 0.25 ? 'crit' : hp < 0.5 ? 'bad' : hp < 0.8 ? 'warn' : 'good');
    const pain = p.pain ?? 0;
    set('pain', pain / 100, word(pain, ['None', 'Mild', 'Moderate', 'Severe', 'Agonizing']), lvl(pain, 15, 45, 75));
    const sick = p.sickness ?? 0;
    set('sickness', sick / 100, word(sick, ['Healthy', 'Queasy', 'Nauseous', 'Sick', 'Fever']), lvl(sick, 15, 45, 75));
    const infRow = this.vrows.infection.row;
    setClass(infRow, 'hidden', !p.infectionKnown);
    if (p.infectionKnown) {
      const inf = p.infection ?? 0;
      set('infection', inf / 100, `Infected · ${Math.round(inf)}%`, 'crit');
    }
    const bt = p.bodyTemp ?? 37;
    const tw = bt < 35 ? 'Hypothermic' : bt < 36.2 ? 'Cold' : bt <= 37.5 ? 'Normal' : bt <= 38.5 ? 'Warm' : 'Overheating';
    set('temp', clamp((bt - 33) / 8, 0, 1), `${bt.toFixed(1)}°C · ${tw}`,
      bt < 35 || bt > 38.5 ? 'crit' : bt < 36.2 || bt > 37.5 ? 'warn' : 'good');
    this.vrows.temp.row.classList.toggle('cold', bt < 36.2);
    const wet = p.wetness ?? 0;
    set('wetness', wet / 100, word(wet, ['Dry', 'Damp', 'Wet', 'Soaked', 'Drenched']), lvl(wet, 25, 55, 85));
    // satiety-style stats: high = good
    const sat = (v, words, warn, bad, crit) => {
      const w = v > 70 ? words[0] : v > 45 ? words[1] : v > 25 ? words[2] : v > 10 ? words[3] : words[4];
      return [w, v <= crit ? 'crit' : v <= bad ? 'bad' : v <= warn ? 'warn' : 'ok'];
    };
    const en = p.energy ?? 100;
    const [fw, ft] = sat(en, ['Rested', 'Drowsy', 'Tired', 'Exhausted', 'Collapsing'], 45, 25, 10);
    set('fatigue', (100 - en) / 100, fw, ft);
    const hu = p.hunger ?? 100;
    const [hw, ht] = sat(hu, ['Well fed', 'Peckish', 'Hungry', 'Very hungry', 'Starving'], 45, 25, 10);
    set('hunger', hu / 100, hw, ht === 'ok' ? 'good' : ht);
    const th = p.thirst ?? 100;
    const [tw2, tt] = sat(th, ['Hydrated', 'Dry mouth', 'Thirsty', 'Parched', 'Dehydrated'], 45, 25, 10);
    set('thirst', th / 100, tw2, tt === 'ok' ? 'good' : tt);
    const pan = p.panic ?? 0;
    set('panic', pan / 100, word(pan, ['Calm', 'Uneasy', 'Scared', 'Panicked', 'Terrified']), lvl(pan, 20, 50, 80));
    const a = p.armor || {};
    const asig = `${a.bite}|${a.scratch}|${p.insulation}`;
    if (asig !== this.asig) {
      this.asig = asig;
      clear(this.armorEl);
      const chip = (label, v) => h('div.armor-chip', h('span', label), h('b', Math.round(clamp(v || 0, 0, 1) * 100) + '%'));
      this.armorEl.append(chip('Bite', a.bite), chip('Scratch', a.scratch), chip('Warmth', p.insulation));
    }
  }
}

function word(v, words) {
  const i = Math.min(words.length - 1, Math.floor(clamp(v, 0, 100) / (100 / (words.length - 0.0001))));
  return words[Math.max(0, i)];
}
function cap(s) { return String(s || '').replace(/\b\w/g, (c) => c.toUpperCase()); }
