import { tryItemDef } from '../../shared/data/items';
import type { InvMsg, PieceInfo, VitalsMsg } from '../../shared/net/protocol';
import { TIERS } from '../../shared/data/building';
import { MAX_CALORIES, MAX_HYDRATION } from '../../shared/sim/vitals';
import { iconURL } from './icons';

const $ = (id: string) => document.getElementById(id)!;

const STATUS_LABEL: Record<string, [string, string]> = {
  cold: ['Cold', 'cold'], hot: ['Overheating', 'bad'], starving: ['Starving', 'bad'], hungry: ['Hungry', ''], dehydrated: ['Dehydrated', 'bad'],
  thirsty: ['Thirsty', ''], bleeding: ['Bleeding', 'bad'], poisoned: ['Poisoned', 'bad'], radiation: ['Radiation', 'bad'], irradiated: ['Radiation poisoning', 'bad'],
  wet: ['Wet', 'cold'], god: ['God mode', 'good'], privilege: ['Building privilege', 'good'], blocked: ['Building blocked', 'bad'],
};

/** Heads-up display. Pure DOM updates; no game logic. */
export class Hud {
  private beltEls: HTMLDivElement[] = [];
  private lastBeltSig = '';
  private chatLog = $('chat-log');
  private hitTimer = 0;

  constructor() {
    const belt = $('belt');
    for (let i = 0; i < 6; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      belt.appendChild(s);
      this.beltEls.push(s);
    }
  }

  show(on: boolean) {
    $('hud').classList.toggle('hidden', !on);
  }

  vitals(v: VitalsMsg) {
    const set = (id: string, val: number, max: number, label: number) => {
      const el = $(id);
      (el.querySelector('.vbar div') as HTMLElement).style.width = `${Math.max(0, Math.min(100, (val / max) * 100))}%`;
      el.querySelector('b')!.textContent = String(Math.round(label));
    };
    set('v-hp', v.hp, 100, v.hp);
    $('v-hp').classList.toggle('low', v.hp < 30);
    set('v-food', v.cal, MAX_CALORIES, v.cal);
    set('v-water', v.hyd, MAX_HYDRATION, v.hyd);
    const chips = v.fx.filter((f) => STATUS_LABEL[f]).map((f) => {
      const [label, cls] = STATUS_LABEL[f];
      let extra = '';
      if (f === 'cold' || f === 'hot') extra = ` ${Math.round(v.temp)}°C`;
      if (f === 'radiation' || f === 'irradiated') extra = ` ${Math.round(v.rad)}`;
      return `<div class="chip ${cls}">${label}${extra}</div>`;
    });
    $('status').innerHTML = chips.join('');
    const bp = $('bp-indicator');
    bp.className = v.bp === 1 ? 'auth' : v.bp === 2 ? 'blocked' : '';
    bp.textContent = v.bp === 1 ? 'Building privilege' : v.bp === 2 ? 'Building blocked' : '';
  }

  belt(inv: InvMsg) {
    const sig = JSON.stringify(inv.belt) + inv.sel;
    if (sig === this.lastBeltSig) return;
    this.lastBeltSig = sig;
    inv.belt.forEach((s, i) => {
      const el = this.beltEls[i];
      el.className = 'slot' + (i === inv.sel ? ' sel' : '');
      el.innerHTML = `<span class="k">${i + 1}</span>` + slotInner(s);
    });
  }

  ammo(inv: InvMsg, countAmmo: (id: string) => number) {
    const held = inv.belt[inv.sel];
    const d = held && tryItemDef(held.id);
    const el = $('ammo');
    if (d?.weapon?.magazine && d.weapon.ammo && (d.weapon.reload ?? 0) > 0) {
      el.innerHTML = `${held!.ammo ?? 0}<small>/${countAmmo(held!.ammoType ?? d.weapon.ammo[0])}</small>`;
    } else if (d?.weapon?.kind === 'bow') {
      el.innerHTML = `<small>arrows</small> ${countAmmo('wooden_arrow')}`;
    } else el.textContent = '';
  }

  hint(text: string) {
    const el = $('hint');
    if (el.textContent !== text) el.textContent = text;
  }

  clock(text: string) {
    $('clock').textContent = text;
  }

  fps(text: string) {
    $('fps').textContent = text;
  }

  hitmarker(head = false, kill = false) {
    const el = $('hitmarker');
    el.classList.add('show');
    el.classList.toggle('head', head || kill);
    clearTimeout(this.hitTimer);
    this.hitTimer = window.setTimeout(() => el.classList.remove('show'), kill ? 400 : 120);
  }

  hurt(dirRad: number | undefined) {
    const d = $('damage');
    d.classList.add('hit');
    setTimeout(() => d.classList.remove('hit'), 60);
    if (dirRad !== undefined) {
      const h = $('hurtdir');
      h.style.transform = `rotate(${dirRad}rad)`;
      h.classList.add('show');
      setTimeout(() => h.classList.remove('show'), 80);
    }
  }

  toast(text: string, kind: 'info' | 'error' = 'info') {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = kind;
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild!.remove();
    setTimeout(() => el.remove(), 3600);
  }

  gather(item: string, n: number) {
    const feed = $('feed');
    const d = tryItemDef(item);
    const last = feed.lastElementChild as HTMLDivElement | null;
    if (last && last.dataset.item === item) {
      const total = Number(last.dataset.n) + n;
      last.dataset.n = String(total);
      last.textContent = `+${total} ${d?.name ?? item}`;
      last.style.animation = 'none';
      void last.offsetWidth;
      last.style.animation = '';
      return;
    }
    const el = document.createElement('div');
    el.dataset.item = item;
    el.dataset.n = String(n);
    el.textContent = `+${n} ${d?.name ?? item}`;
    feed.appendChild(el);
    while (feed.children.length > 5) feed.firstChild!.remove();
    setTimeout(() => el.remove(), 3000);
  }

  chat(text: string, kind: string, from?: string) {
    const el = document.createElement('div');
    el.className = kind;
    el.textContent = from ? `${kind === 'team' ? '[TEAM] ' : ''}${from}: ${text}` : text;
    this.chatLog.appendChild(el);
    while (this.chatLog.children.length > 60) this.chatLog.firstChild!.remove();
    setTimeout(() => el.classList.add('old'), 9000);
  }

  chatOpen(open: boolean) {
    $('chat').classList.toggle('open', open);
    const input = $('chat-input') as HTMLInputElement;
    if (open) setTimeout(() => input.focus(), 0);
    else {
      input.blur();
      input.value = '';
    }
  }

  buildHud(text: string) {
    $('buildhud').innerHTML = text;
  }

  pieceInfo(info: PieceInfo | null) {
    const el = $('pieceinfo');
    if (!info) {
      el.innerHTML = '';
      return;
    }
    const cost = (c?: Array<[string, number]>) => (c ? c.map(([k, n]) => `${n} ${tryItemDef(k)?.name ?? k}`).join(', ') : '');
    el.innerHTML = `<b>${TIERS[info.tier]?.name ?? ''} ${info.type}</b> — ${info.hp}/${info.maxHp} HP · stability ${Math.round(info.stability * 100)}%` +
      (info.upgradeCost ? `<br>RMB upgrade: ${cost(info.upgradeCost)}` : '') +
      (info.repairCost ? `<br>LMB repair: ${cost(info.repairCost)}` : '') +
      (info.canDemolish ? '<br>X demolish' : '') +
      (info.blocked ? `<br><span style="color:#f88">${info.blocked}</span>` : '') +
      `<br><span class="muted small">owner ${info.owner}</span>`;
  }

  progress(frac: number | null) {
    const el = $('progress');
    el.classList.toggle('show', frac !== null);
    if (frac !== null) (el.firstElementChild as HTMLElement).style.width = `${Math.round(frac * 100)}%`;
  }
}

export function slotInner(s: { id: string; n: number; dur?: number; ammo?: number } | null): string {
  if (!s) return '';
  const d = tryItemDef(s.id);
  const dur = d?.durability && s.dur !== undefined ? `<div class="dur"><div style="height:${Math.max(0, Math.min(100, (s.dur / d.durability) * 100))}%"></div></div>` : '';
  const n = s.n > 1 ? s.n : d?.weapon?.magazine && s.ammo !== undefined && (d.weapon.reload ?? 0) > 0 ? s.ammo : '';
  return `<img src="${iconURL(s.id)}" alt="" />${dur}<span class="n">${n}</span>`;
}
