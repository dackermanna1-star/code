import { itemDef, tryItemDef, WEAR_SLOTS } from '../../shared/data/items';
import { RECIPES, researchCost, type Recipe } from '../../shared/data/recipes';
import type { C2S, ContainerRef, InvMsg } from '../../shared/net/protocol';
import type { ItemStack } from '../../shared/sim/inventory';
import { slotInner } from './hud';
import { iconURL } from './icons';

const $ = (id: string) => document.getElementById(id)!;
const CATS: Recipe['category'][] = ['Tools', 'Weapons', 'Ammo', 'Construction', 'Items', 'Clothing', 'Medical', 'Resources', 'Explosives', 'Blocks'];

/**
 * Inventory, crafting and loot panels. All actions are sent to the server
 * as requests; the panel re-renders from authoritative `inv` messages.
 */
export class InventoryUI {
  open = false;
  private inv: InvMsg | null = null;
  private known = new Set<string>();
  private cat: Recipe['category'] = 'Tools';
  private chosen: string | null = null;
  private benchLevel = 0;
  private queue: Array<{ id: string; n: number; left: number; total: number }> = [];
  private drag: { ref: ContainerRef; slot: number; n?: number; ghost: HTMLImageElement } | null = null;
  private lastSig = '';

  constructor(private send: (m: C2S) => void, private sound: (k: 'click' | 'error') => void) {
    window.addEventListener('mousemove', (e) => {
      if (this.drag) {
        this.drag.ghost.style.left = `${e.clientX - 24}px`;
        this.drag.ghost.style.top = `${e.clientY - 24}px`;
      }
      const tt = $('tooltip');
      if (!tt.classList.contains('hidden')) {
        tt.style.left = `${Math.min(window.innerWidth - 270, e.clientX + 14)}px`;
        tt.style.top = `${Math.min(window.innerHeight - 120, e.clientY + 14)}px`;
      }
    });
    window.addEventListener('mouseup', (e) => this.endDrag(e));
    $('inventory').addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setOpen(open: boolean) {
    this.open = open;
    $('inventory').classList.toggle('hidden', !open);
    if (!open) {
      this.cancelDrag();
      $('tooltip').classList.add('hidden');
      this.send({ t: 'close' });
    } else this.render(true);
  }

  setInv(inv: InvMsg) {
    this.inv = inv;
    if (this.open) this.render();
  }

  setKnown(list: string[]) {
    this.known = new Set(list);
    if (this.open) this.render(true);
  }

  setQueue(q: Array<{ id: string; n: number; left: number; total: number }>) {
    this.queue = q;
    if (this.open) this.renderQueue();
  }

  setBench(level: number) {
    if (level !== this.benchLevel) {
      this.benchLevel = level;
      if (this.open) this.render(true);
    }
  }

  count(id: string): number {
    if (!this.inv) return 0;
    let n = 0;
    for (const c of [this.inv.main, this.inv.belt]) for (const s of c) if (s?.id === id) n += s.n;
    return n;
  }

  get lootOpen() {
    return !!this.inv?.loot;
  }

  // ------------------------------------------------------------ rendering
  render(force = false) {
    const inv = this.inv;
    if (!inv) return;
    const sig = JSON.stringify(inv) + this.cat + this.chosen + [...this.known].join() + this.benchLevel;
    if (!force && sig === this.lastSig) return;
    this.lastSig = sig;
    this.grid($('wear'), 'wear', inv.wear, WEAR_SLOTS.map((s) => s));
    this.grid($('main'), 'main', inv.main);
    this.grid($('beltinv'), 'belt', inv.belt);
    this.stats(inv);
    const loot = inv.loot;
    $('loot').classList.toggle('hidden', !loot);
    $('craft').classList.toggle('hidden', !!loot);
    if (loot) {
      $('loot-title').textContent = loot.title;
      this.lootExtra(loot.kind, loot.info ?? {});
      const placeholders = loot.kind === 'furnace' || loot.kind === 'campfire' ? ['fuel'] : loot.kind === 'research_table' ? ['item', 'scrap'] : [];
      this.grid($('lootgrid'), 'loot', loot.slots, placeholders);
    } else this.renderCraft();
  }

  private grid(el: HTMLElement, ref: ContainerRef, slots: (ItemStack | null)[], placeholders: string[] = []) {
    if (el.children.length !== slots.length) {
      el.innerHTML = '';
      slots.forEach((_, i) => {
        const s = document.createElement('div');
        s.className = 'slot';
        s.dataset.ref = ref;
        s.dataset.slot = String(i);
        s.addEventListener('mousedown', (e) => this.onSlotDown(e, ref, i));
        s.addEventListener('mouseenter', () => this.tooltip(ref, i));
        s.addEventListener('mouseleave', () => $('tooltip').classList.add('hidden'));
        el.appendChild(s);
      });
    }
    slots.forEach((st, i) => {
      const s = el.children[i] as HTMLElement;
      const ph = placeholders[i] ? `<span class="ph">${placeholders[i]}</span>` : '';
      s.innerHTML = st ? slotInner(st) : ph;
      s.classList.toggle('sel', ref === 'belt' && this.inv?.sel === i);
    });
  }

  private stack(ref: ContainerRef, i: number): ItemStack | null {
    const inv = this.inv;
    if (!inv) return null;
    const c = ref === 'loot' ? inv.loot?.slots : inv[ref];
    return c?.[i] ?? null;
  }

  private tooltip(ref: ContainerRef, i: number) {
    const s = this.stack(ref, i);
    const tt = $('tooltip');
    if (!s || this.drag) {
      tt.classList.add('hidden');
      return;
    }
    const d = itemDef(s.id);
    let extra = '';
    if (d.weapon && d.weapon.kind !== 'melee') extra += `<br>Damage ${d.weapon.damage}${d.weapon.pellets ? ` x${d.weapon.pellets}` : ''} · ${Math.round(60 / d.weapon.interval)} RPM`;
    if (d.weapon?.kind === 'melee') extra += `<br>Damage ${d.weapon.damage}`;
    if (d.tool) extra += `<br>Gather: ${Object.entries(d.tool.gather).filter(([, v]) => (v ?? 0) >= 0.9).map(([k, v]) => `${k} x${v}`).join(', ')}`;
    if (d.food) extra += `<br>+${d.food.calories} calories, +${d.food.hydration} water${d.food.poison ? ' · causes poisoning' : ''}`;
    if (d.medical) extra += `<br>Heals ${d.medical.heal}${d.medical.healOverTime ? ` +${d.medical.healOverTime} over time` : ''}${d.medical.stopBleed ? ' · stops bleeding' : ''}${d.medical.radRemove ? ` · -${d.medical.radRemove} rads` : ''}`;
    if (d.clothing) extra += `<br>${Object.entries(d.clothing.protection).map(([k, v]) => `${k} ${Math.round((v ?? 0) * 100)}%`).join(', ')} · warmth ${d.clothing.warmth}°${d.clothing.radiation ? ` · radiation ${Math.round(d.clothing.radiation * 100)}%` : ''}`;
    if (d.durability && s.dur !== undefined) extra += `<br>Condition ${Math.round((s.dur / d.durability) * 100)}%`;
    const rc = researchCost(s.id);
    if (rc !== null && !this.known.has(s.id)) extra += `<br><span class="muted">Researchable (${rc} scrap)</span>`;
    tt.innerHTML = `<b>${d.name}</b>${d.desc}${extra}`;
    tt.classList.remove('hidden');
  }

  private stats(inv: InvMsg) {
    let melee = 0, bullet = 0, rad = 0, warmth = 0;
    for (const s of inv.wear) {
      const c = s && tryItemDef(s.id)?.clothing;
      if (!c) continue;
      melee += c.protection.melee ?? 0;
      bullet += c.protection.bullet ?? 0;
      rad = Math.max(rad, c.radiation ?? 0);
      warmth += c.warmth;
    }
    $('charstats').innerHTML = `Melee <b>${Math.round(Math.min(0.8, melee) * 100)}%</b><br>Projectile <b>${Math.round(Math.min(0.8, bullet) * 100)}%</b><br>Radiation <b>${Math.round(rad * 100)}%</b><br>Warmth <b>${warmth}°</b>`;
  }

  private lootExtra(kind: string, info: Record<string, unknown>) {
    const el = $('loot-extra');
    let html = '';
    if (kind === 'furnace' || kind === 'campfire') {
      html = `<div>${kind === 'furnace' ? 'Smelts ore. Wood in the fuel slot.' : 'Cooks meat. Warms you nearby.'}</div><div class="row"><button id="lx-toggle" class="${info.lit ? '' : 'primary'}">${info.lit ? 'Extinguish' : 'Light'}</button></div>`;
    } else if (kind === 'claim_totem') {
      const up = (info.upkeep as Array<[string, number]> | undefined) ?? [];
      html = `<div>${info.authorized ? '<b style="color:#9fe08a">You are authorized</b>' : '<b style="color:#f88">Not authorized</b>'} · ${info.pieces ?? 0} pieces</div>` +
        `<div class="muted small">Authorized: ${((info.authList as string[]) ?? []).join(', ') || 'nobody'}</div>` +
        `<div class="small">Upkeep per day: ${up.map(([k, n]) => `${n} ${tryItemDef(k)?.name ?? k}`).join(', ') || 'none'}<br>Protected for <b>${info.hours ?? 0}h</b></div>` +
        `<div class="row"><button id="lx-auth" class="primary">Authorize</button><button id="lx-deauth">Deauthorize</button><button id="lx-clear">Clear list</button></div>`;
    } else if (kind === 'research_table') {
      const item = info.item as string | undefined;
      html = item ? `<div>${tryItemDef(item)?.name}: ${info.known ? 'already known' : info.cost === null ? 'cannot be researched' : `costs ${info.cost} scrap`}</div>` : '<div class="muted">Put an item in the first slot and scrap in the second.</div>';
      html += `<div class="row"><button id="lx-research" class="primary">Research</button></div>`;
    }
    el.innerHTML = html;
    $('lx-toggle')?.addEventListener('click', () => this.send({ t: 'toggle' }));
    $('lx-auth')?.addEventListener('click', () => this.send({ t: 'totem', op: 'auth' }));
    $('lx-deauth')?.addEventListener('click', () => this.send({ t: 'totem', op: 'deauth' }));
    $('lx-clear')?.addEventListener('click', () => this.send({ t: 'totem', op: 'clear' }));
    $('lx-research')?.addEventListener('click', () => this.send({ t: 'research' }));
  }

  // ------------------------------------------------------------ crafting
  private canCraft(r: Recipe, qty = 1): boolean {
    return r.ing.every(([k, n]) => this.count(k) >= n * qty);
  }

  private renderCraft() {
    $('bench-level').textContent = this.benchLevel ? `(workbench level ${this.benchLevel} nearby)` : '(no workbench nearby)';
    const cats = $('craft-cats');
    cats.innerHTML = '';
    for (const c of CATS) {
      const b = document.createElement('button');
      b.textContent = c;
      b.className = c === this.cat ? 'on' : '';
      b.onclick = () => {
        this.cat = c;
        this.chosen = null;
        this.sound('click');
        this.render(true);
      };
      cats.appendChild(b);
    }
    const list = $('craft-list');
    list.innerHTML = '';
    for (const r of RECIPES.filter((x) => x.category === this.cat)) {
      const s = document.createElement('div');
      const known = r.known || this.known.has(r.id);
      s.className = 'slot' + (known ? '' : ' locked') + (known && (!this.canCraft(r) || r.bench > this.benchLevel) ? ' cant' : '') + (this.chosen === r.id ? ' chosen' : '');
      s.innerHTML = `<img src="${iconURL(r.out)}" alt="" />${r.count > 1 ? `<span class="n">${r.count}</span>` : ''}`;
      s.title = itemDef(r.out).name;
      s.onclick = () => {
        this.chosen = r.id;
        this.sound('click');
        this.render(true);
      };
      list.appendChild(s);
    }
    this.renderDetail();
    this.renderQueue();
  }

  private renderDetail() {
    const el = $('craft-detail');
    const r = RECIPES.find((x) => x.id === this.chosen);
    if (!r) {
      el.innerHTML = '<div class="muted">Select a recipe.</div>';
      return;
    }
    const d = itemDef(r.out);
    const known = r.known || this.known.has(r.id);
    const ing = r.ing.map(([k, n]) => {
      const have = this.count(k);
      return `<div class="ing ${have < n ? 'miss' : ''}"><span>${tryItemDef(k)?.name ?? k}</span><span>${have} / ${n}</span></div>`;
    }).join('');
    const benchOk = r.bench <= this.benchLevel;
    el.innerHTML = `<b>${d.name}</b>${r.count > 1 ? ` x${r.count}` : ''} <span class="muted small">${r.time}s</span><div class="muted small">${d.desc}</div>${ing}` +
      (r.bench ? `<div class="${benchOk ? 'muted' : 'error'} small">Requires workbench level ${r.bench}</div>` : '') +
      (!known ? `<div class="error small">Blueprint unknown — research it (${researchCost(r.id)} scrap)</div>` : '') +
      `<div class="row"><input id="cd-qty" type="number" min="1" max="100" value="1" /><button id="cd-craft" class="primary" ${known && benchOk && this.canCraft(r) ? '' : 'disabled'}>Craft</button><button id="cd-max">Max</button></div>`;
    $('cd-craft').onclick = () => {
      const q = Math.max(1, Math.min(100, Number(($('cd-qty') as HTMLInputElement).value) || 1));
      this.send({ t: 'craft', id: r.id, qty: q });
      this.sound('click');
    };
    $('cd-max').onclick = () => {
      const max = Math.max(1, Math.min(100, ...r.ing.map(([k, n]) => Math.floor(this.count(k) / n))));
      ($('cd-qty') as HTMLInputElement).value = String(max);
    };
  }

  private renderQueue() {
    const el = $('craft-queue');
    el.innerHTML = '';
    this.queue.forEach((j, i) => {
      const s = document.createElement('div');
      s.className = 'slot';
      s.title = 'Click to cancel';
      const pct = j.total ? Math.max(0, Math.min(100, (1 - j.left / j.total) * 100)) : 0;
      s.innerHTML = `<img src="${iconURL(j.id)}" alt="" /><span class="n">${j.n}</span><div class="bar2" style="width:${i === 0 ? pct : 0}%"></div>`;
      s.onclick = () => this.send({ t: 'cancelCraft', idx: i });
      el.appendChild(s);
    });
    if (!this.queue.length) el.innerHTML = '<span class="muted small">Nothing queued</span>';
  }

  /** Called every frame while open so the progress bar animates. */
  tick(dt: number) {
    if (this.queue.length) {
      this.queue[0].left = Math.max(0, this.queue[0].left - dt);
      if (this.open && !this.lootOpen) {
        const bar = $('craft-queue').querySelector('.bar2') as HTMLElement | null;
        if (bar && this.queue[0].total) bar.style.width = `${Math.max(0, Math.min(100, (1 - this.queue[0].left / this.queue[0].total) * 100))}%`;
      }
    }
  }

  // ------------------------------------------------------------ drag & drop
  private onSlotDown(e: MouseEvent, ref: ContainerRef, slot: number) {
    e.preventDefault();
    const s = this.stack(ref, slot);
    if (!s) return;
    if (e.button === 0 && e.shiftKey) {
      this.send({ t: 'inv', op: 'quick', from: [ref, slot] });
      this.sound('click');
      return;
    }
    const n = e.button === 2 ? Math.ceil(s.n / 2) : undefined;
    const ghost = document.createElement('img');
    ghost.src = iconURL(s.id);
    ghost.className = 'drag-ghost';
    ghost.style.left = `${e.clientX - 24}px`;
    ghost.style.top = `${e.clientY - 24}px`;
    document.body.appendChild(ghost);
    this.drag = { ref, slot, n, ghost };
    $('tooltip').classList.add('hidden');
  }

  private endDrag(e: MouseEvent) {
    const d = this.drag;
    if (!d) return;
    this.cancelDrag();
    const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.slot') as HTMLElement | null;
    if (target?.dataset.ref) {
      const ref = target.dataset.ref as ContainerRef;
      const slot = Number(target.dataset.slot);
      if (ref === d.ref && slot === d.slot) return;
      this.send({ t: 'inv', op: 'move', from: [d.ref, d.slot], to: [ref, slot], n: d.n });
      this.sound('click');
      return;
    }
    const inPanel = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.inv-col');
    if (!inPanel) this.send({ t: 'inv', op: 'drop', from: [d.ref, d.slot], n: d.n });
  }

  private cancelDrag() {
    if (this.drag) this.drag.ghost.remove();
    this.drag = null;
  }
}
