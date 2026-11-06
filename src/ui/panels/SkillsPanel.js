// Character / skills panel: profession card, survival stats, skill levels with XP bars.
import { h, clear, clamp, fmtDays } from '../dom.js';
import { pixelImg, PIXEL_ICONS } from '../pixel.js';

const MAX_LEVEL = 10;

export class SkillsPanel {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.sig = '';
    this.pollT = 0;
    this.el = h('div.panel.skills-panel');
  }

  onShow() { this.render(true); }
  onHide() {}
  refresh() { this.render(true); }
  update(dt) {
    this.pollT -= dt;
    if (this.pollT <= 0) { this.pollT = 0.5; this.render(false); }
  }

  render(force) {
    const g = this.game;
    const p = g.player;
    if (!p) return;
    const sig = JSON.stringify([p.skills, p.kills, Math.floor((p.daysSurvived || 0) * 24), p.name, p.profession]);
    if (!force && sig === this.sig) return;
    this.sig = sig;
    clear(this.el);
    const prof = (g.PROFESSIONS || []).find((x) => x.id === p.profession) || null;
    const profName = p.professionName || prof?.name || p.profession || 'Survivor';
    const iconName = PIXEL_ICONS['p_' + p.profession] ? 'p_' + p.profession : 'p_unemployed';

    const card = h('div.skills-col.sk-card',
      h('div.col-head', h('span.col-title', 'Character')),
      h('div.char-top',
        h('div.char-portrait', pixelImg(iconName, 'char-ico')),
        h('div.char-names', h('div.char-name', p.name || 'Unknown'), h('div.char-prof', profName))),
      prof?.desc ? h('div.char-desc', prof.desc) : null,
      prof?.perks?.length ? h('div.char-perks', h('div.cd-sec-title', 'Traits'), prof.perks.map((t) => h('div.perk', h('i'), t))) : null,
      h('div.char-stats',
        stat('Days survived', fmtDays(p.daysSurvived ?? (g.time?.day ? g.time.day - 1 : 0)), 'wide'),
        stat('Zombies killed', String(p.kills ?? 0)),
        stat('Day', String(g.time?.day ?? 1)),
        stat('Carry limit', `${Math.round(p.maxWeight || p.inv?.maxWeight || 0)} kg`)));

    const defs = g.SKILLS || {};
    const ids = Object.keys(defs).length ? Object.keys(defs) : Object.keys(p.skills || {});
    const list = h('div.skill-list');
    for (const id of ids) {
      const s = (p.skills || {})[id] || { level: 0, xp: 0, next: 1 };
      const lvl = clamp(s.level | 0, 0, MAX_LEVEL);
      const frac = lvl >= MAX_LEVEL ? 1 : clamp((s.xp || 0) / (s.next || 1), 0, 1);
      const pips = h('div.sk-pips');
      for (let i = 0; i < MAX_LEVEL; i++) pips.appendChild(h('i' + (i < lvl ? '.on' : i === lvl ? '.next' : '')));
      list.appendChild(h('div.skill',
        h('div.sk-top', h('span.sk-name', defs[id]?.name || id), h('span.sk-lvl', lvl >= MAX_LEVEL ? 'MAX' : `Lv ${lvl}`)),
        pips,
        h('div.sk-xp', h('div.sk-xp-bar', h('i', { style: { width: (frac * 100).toFixed(1) + '%' } })),
          h('span.sk-xp-txt', lvl >= MAX_LEVEL ? 'Mastered' : `${Math.floor(s.xp || 0)} / ${Math.ceil(s.next || 0)} xp`)),
        defs[id]?.desc ? h('div.sk-desc', defs[id].desc) : null));
    }
    const skillsCol = h('div.skills-col.sk-list', h('div.col-head', h('span.col-title', 'Skills'),
      h('span.col-sub', 'Practice makes perfect')), list);
    this.el.append(card, skillsCol);
  }
}

function stat(label, value, cls) {
  return h('div.cstat' + (cls ? '.' + cls : ''), h('span', label), h('b', value));
}
