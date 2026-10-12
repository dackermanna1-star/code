// World inspection tooltip: stats of the wand/spell/perk under the crosshair, compared with the held wand.
import type { Pickup } from '../entities/pickups';
import type { Wand } from '../magic/casting';
import { SPELLS } from '../magic/spells';
import { PERK_BY_ID } from '../game/perks';
import { spellIconUrl } from './icons';

const sec = (f: number) => (f / 60).toFixed(2);

export class InspectPanel {
  readonly el: HTMLDivElement;
  private key = '';
  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'inspect noita-panel';
    parent.appendChild(this.el);
  }

  update(pk: Pickup | null, held: Wand | null): void {
    const key = pk ? `${pk.id}:${held ? held.stats.spriteSeed : 0}` : '';
    if (key === this.key) return;
    this.key = key;
    if (!pk) {
      this.el.style.display = 'none';
      return;
    }
    let html = '';
    if (pk.kind === 'wand' && pk.wand) {
      const s = pk.wand.stats;
      const h = held?.stats;
      // better = green, worse = red (lower is better for delays and spread)
      const cmp = (v: number, hv: number | undefined, lowerBetter = false, fmt = (x: number) => String(Math.round(x))) => {
        if (hv === undefined || Math.abs(v - hv) < 1e-6) return `<b>${fmt(v)}</b>`;
        const better = lowerBetter ? v < hv : v > hv;
        return `<b class="${better ? 'cmp-up' : 'cmp-down'}">${fmt(v)}</b>`;
      };
      html = `<div class="tt-title">${s.name}</div><div class="tt-stats">
        <div><span>Shuffle</span><b class="${h && s.shuffle !== h.shuffle ? (s.shuffle ? 'cmp-down' : 'cmp-up') : ''}">${s.shuffle ? 'Yes' : 'No'}</b></div>
        <div><span>Spells/Cast</span>${cmp(s.actionsPerRound, h?.actionsPerRound)}</div>
        <div><span>Cast delay</span>${cmp(s.castDelay, h?.castDelay, true, (x) => sec(x) + ' s')}</div>
        <div><span>Rech. Time</span>${cmp(s.rechargeTime, h?.rechargeTime, true, (x) => sec(x) + ' s')}</div>
        <div><span>Mana max</span>${cmp(s.manaMax, h?.manaMax)}</div>
        <div><span>Mana chg. Spd</span>${cmp(s.manaChargeSpeed, h?.manaChargeSpeed)}</div>
        <div><span>Capacity</span>${cmp(s.capacity, h?.capacity)}</div>
        <div><span>Spread</span>${cmp(s.spread, h?.spread, true, (x) => x.toFixed(1) + '°')}</div></div>
        <div class="sp">${pk.wand.spells.map((x) => (x ? `<img src="${spellIconUrl(x.id)}" title="${SPELLS[x.id]?.name}">` : '')).join('')}</div>
        ${held ? '<div class="tt-type">compared with your held wand</div>' : ''}`;
    } else if (pk.kind === 'spell' && pk.spell) {
      const d = SPELLS[pk.spell.id];
      if (d) html = `<div class="tt-title">${d.name}</div><div class="tt-type">${d.type}</div><div class="tt-desc">${d.description}</div>
        <div class="tt-stats"><div><span>Mana drain</span><b>${d.mana}</b></div>${pk.spell.uses >= 0 ? `<div><span>Uses</span><b>${pk.spell.uses}</b></div>` : ''}
        ${Object.entries(d.stats).slice(0, 6).map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
    } else if (pk.kind === 'perk' && pk.perk) {
      const d = PERK_BY_ID[pk.perk];
      if (d) html = `<div class="tt-title">${d.name}</div><div class="tt-desc">${d.description}</div>`;
    }
    this.el.innerHTML = html;
    this.el.style.display = html ? 'block' : 'none';
  }
}
