// Bot teammates' standing, top right under the money/kills counters:
// a coloured dot, name, kills and current weapon per teammate. Modern: small
// glass rows; classic: plain lines in the teammate's colour, in the original font.
import { fluidLayer, h } from './dom';
import type { HudTeammate } from './hudTypes';

interface Row {
  root: HTMLDivElement;
  dot: HTMLSpanElement;
  name: HTMLSpanElement;
  kills: HTMLSpanElement;
  weapon: HTMLSpanElement;
  key: string;
}

export class TeamList {
  private readonly root: HTMLDivElement;
  private rows: Row[] = [];
  private style: 'modern' | 'classic' = 'modern';

  constructor(view: HTMLElement) {
    this.root = fluidLayer(view, 'sh-team');
    this.root.style.display = 'none';
  }

  setStyle(style: 'modern' | 'classic'): void {
    if (style === this.style) return;
    this.style = style;
    this.root.classList.toggle('is-classic', style === 'classic');
    for (const r of this.rows) r.key = '';
  }

  update(team: HudTeammate[] | undefined, visible: boolean): void {
    const n = visible && team ? team.length : 0;
    this.root.style.display = n ? '' : 'none';
    if (!n) return;
    while (this.rows.length < n) this.rows.push(this.makeRow());
    for (let i = 0; i < this.rows.length; i++) {
      const r = this.rows[i];
      const t = team![i];
      r.root.style.display = t ? '' : 'none';
      if (!t) continue;
      const key = `${t.name}|${t.color}|${t.kills}|${t.weapon}|${t.alive ? 1 : 0}`;
      if (key === r.key) continue;
      r.key = key;
      r.dot.style.background = t.color;
      r.name.textContent = t.name;
      r.name.style.color = this.style === 'classic' ? t.color : '';
      r.kills.textContent = t.alive ? `${t.kills}` : '✕';
      r.weapon.textContent = t.alive ? t.weapon : 'down';
      r.root.classList.toggle('is-down', !t.alive);
    }
  }

  private makeRow(): Row {
    const root = h('div', 'sh-team-row');
    const dot = h('span', 'sh-team-dot');
    const name = h('span', 'sh-team-name');
    const kills = h('span', 'sh-team-kills');
    const weapon = h('span', 'sh-team-wpn');
    root.append(dot, name, kills, weapon);
    this.root.appendChild(root);
    return { root, dot, name, kills, weapon, key: '' };
  }
}
