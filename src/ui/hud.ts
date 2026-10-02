/**
 * In-game HUD: crosshair + attack indicator, hotbar, health/hunger/armor/air, XP bar,
 * held item name, chat lines, F3 debug overlay.
 */
import type { UI } from './ui';
import { h } from './ui';
import type { Game } from '../game/game';
import { ICONS } from './icons';
import type { ItemStack } from '../game/items/registry';
import { BLOCK_BY_NAME, BLOCKS } from '../world/blocks/registry';
import { BIOMES } from '../world/biomes';

/** Item icon provider: returns an <img> src (data URL) or null. Installed by the items module. */
export let itemIconProvider: ((stack: ItemStack) => string | null) | null = null;
export function setItemIconProvider(f: (stack: ItemStack) => string | null) {
  itemIconProvider = f;
}

export function itemIconElement(stack: ItemStack): HTMLElement {
  const src = itemIconProvider?.(stack);
  if (src) return h('img', { src, draggable: 'false' });
  const b = stack.item.block ? BLOCK_BY_NAME.get(stack.item.block) : undefined;
  const col = b ? '#' + b.mapColor.toString(16).padStart(6, '0') : '#8a8a8a';
  const initials = stack.item.displayName.split(' ').map((w) => w[0]).join('').slice(0, 2);
  return h('div', { class: 'swatch', style: { background: col } }, initials);
}

export function durabilityBar(stack: ItemStack): HTMLElement | null {
  if (!stack.item.durability || !stack.damage) return null;
  const f = 1 - stack.damage / stack.item.durability;
  const hue = Math.round(f * 120);
  return h('div', { class: 'dur' }, h('div', { style: { width: `${f * 100}%`, background: `hsl(${hue},100%,45%)` } }));
}

export class Hud {
  readonly el: HTMLElement;
  private game: Game | null = null;
  private hotbar: HTMLElement;
  private slots: HTMLElement[] = [];
  private hearts: HTMLElement;
  private food: HTMLElement;
  private armor: HTMLElement;
  private air: HTMLElement;
  private xpFill: HTMLElement;
  private xpLevel: HTMLElement;
  private heldName: HTMLElement;
  private chat: HTMLElement;
  private debugL: HTMLElement;
  private debugR: HTMLElement;
  private fpsEl: HTMLElement;
  private attack: HTMLElement;
  private attackFill: HTMLElement;
  private invVersion = -1;
  private lastSel = -1;
  private heldTimer = 0;
  private statsKey = '';
  private debugOn = false;
  private acc = 0;
  private title: HTMLElement;
  private titleTimer = 0;

  constructor(readonly ui: UI) {
    this.el = h('div', { class: 'hud' });
    this.el.append(h('div', { class: 'crosshair' }));
    this.attackFill = h('div');
    this.attack = h('div', { class: 'attack-indicator hidden' }, this.attackFill);
    this.el.append(this.attack);
    this.hearts = h('div', { class: 'icons' });
    this.food = h('div', { class: 'icons right' });
    this.armor = h('div', { class: 'icons' });
    this.air = h('div', { class: 'icons right' });
    this.xpFill = h('div');
    this.xpLevel = h('div', { class: 'xplevel' });
    this.hotbar = h('div', { class: 'hotbar' });
    for (let i = 0; i < 9; i++) {
      const s = h('div', { class: 'slot' });
      this.slots.push(s);
      this.hotbar.append(s);
    }
    const left = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } }, this.armor, this.hearts);
    const right = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' } }, this.air, this.food);
    this.el.append(
      h('div', { class: 'hotbar-wrap' },
        h('div', { class: 'stats-row' }, left, right),
        h('div', { class: 'xpbar' }, this.xpFill, this.xpLevel),
        this.hotbar,
      ),
    );
    this.heldName = h('div', { class: 'held-name mc-text' });
    this.chat = h('div', { class: 'chat mc-text' });
    this.debugL = h('div', { class: 'debug hidden' });
    this.debugR = h('div', { class: 'debug right hidden' });
    this.fpsEl = h('div', { class: 'fps hidden' });
    this.title = h('div', { class: 'title-text mc-text hidden' });
    this.el.append(this.heldName, this.chat, this.debugL, this.debugR, this.fpsEl, this.title);
  }

  attach(game: Game) {
    this.game = game;
    game.events.on('chat', ({ text, color }: any) => this.addChat(text, color));
    game.events.on('title', ({ title, subtitle, time }: any) => this.showTitle(title, subtitle, time));
  }

  toggleDebug() {
    this.debugOn = !this.debugOn;
    this.debugL.classList.toggle('hidden', !this.debugOn);
    this.debugR.classList.toggle('hidden', !this.debugOn);
  }

  addChat(text: string, color = '#fff') {
    const line = h('div', { class: 'line', style: { color } }, text);
    this.chat.append(line);
    while (this.chat.children.length > 10) this.chat.firstElementChild!.remove();
    setTimeout(() => { line.style.opacity = '0'; }, 9000);
    setTimeout(() => line.remove(), 10000);
  }

  showTitle(title: string, subtitle = '', time = 3) {
    this.title.innerHTML = '';
    this.title.append(h('div', { class: 't' }, title), h('div', { class: 's' }, subtitle));
    this.title.classList.remove('hidden');
    this.titleTimer = time;
  }

  private renderIcons(el: HTMLElement, full: string, half: string, empty: string, value: number, max: number, extraFull = 0, extraIcons?: [string, string]) {
    const n = Math.ceil(max / 2);
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const v = value - i * 2;
      parts.push(v >= 2 ? full : v === 1 ? half : empty);
    }
    if (extraFull > 0 && extraIcons) {
      const m = Math.ceil(extraFull / 2);
      for (let i = 0; i < m; i++) {
        const v = extraFull - i * 2;
        parts.push(v >= 2 ? extraIcons[0] : extraIcons[1]);
      }
    }
    el.innerHTML = parts.map((src) => `<div class="icon" style="background-image:url('${src}')"></div>`).join('');
  }

  update(dt: number) {
    const g = this.game;
    if (!g || !g.player) return;
    const p = g.player;
    this.acc += dt;
    if (this.titleTimer > 0) {
      this.titleTimer -= dt;
      if (this.titleTimer <= 0) this.title.classList.add('hidden');
    }
    // hotbar (on change)
    const inv = p.inventory;
    if (inv.version !== this.invVersion || inv.selected !== this.lastSel) {
      this.invVersion = inv.version;
      for (let i = 0; i < 9; i++) {
        const s = this.slots[i];
        s.classList.toggle('sel', i === inv.selected);
        s.innerHTML = '';
        const st = inv.get(i);
        if (st) {
          s.append(itemIconElement(st));
          if (st.count > 1) s.append(h('div', { class: 'count' }, String(st.count)));
          const d = durabilityBar(st);
          if (d) s.append(d);
        }
      }
      if (inv.selected !== this.lastSel) {
        this.lastSel = inv.selected;
        const st = inv.held;
        this.heldName.textContent = st ? (st.data?.name ?? st.item.displayName) : '';
        this.heldTimer = 2.5;
      }
    }
    this.heldTimer -= dt;
    this.heldName.style.opacity = this.heldTimer > 0 ? String(Math.min(1, this.heldTimer)) : '0';
    // stats (throttled to changes)
    const survival = !p.creative && !p.spectator;
    const key = `${survival}|${Math.ceil(p.health)}|${Math.ceil(p.absorption)}|${p.food}|${p.armorValue}|${p.air}|${p.eyesInWater}|${p.hasEffect('poison')}|${p.hasEffect('hunger')}|${p.xpLevel}|${p.xpProgress.toFixed(3)}`;
    if (key !== this.statsKey) {
      this.statsKey = key;
      [this.hearts, this.food, this.armor, this.air].forEach((e) => e.classList.toggle('hidden', !survival));
      if (survival) {
        const poison = p.hasEffect('poison');
        this.renderIcons(this.hearts, poison ? ICONS.heartPoison : ICONS.heart, poison ? ICONS.heartPoisonHalf : ICONS.heartHalf, ICONS.heartEmpty, Math.ceil(p.health), p.maxHealth, Math.ceil(p.absorption), [ICONS.heartAbsorb, ICONS.heartAbsorbHalf]);
        const hunger = p.hasEffect('hunger');
        this.renderIcons(this.food, hunger ? ICONS.foodHunger : ICONS.food, hunger ? ICONS.foodHungerHalf : ICONS.foodHalf, ICONS.foodEmpty, p.food, 20);
        const a = p.armorValue;
        this.armor.classList.toggle('hidden', a <= 0);
        if (a > 0) this.renderIcons(this.armor, ICONS.armor, ICONS.armorHalf, ICONS.armorEmpty, a, 20);
        const showAir = p.eyesInWater || p.air < p.maxAir;
        this.air.classList.toggle('hidden', !showAir);
        if (showAir) {
          const bubbles = Math.max(0, Math.ceil((p.air * 10) / p.maxAir));
          this.air.innerHTML = Array.from({ length: bubbles }, () => `<div class="icon" style="background-image:url('${ICONS.bubble}')"></div>`).join('');
        }
      }
      this.xpFill.style.width = `${Math.min(1, p.xpProgress) * 100}%`;
      this.xpLevel.textContent = p.xpLevel > 0 ? String(p.xpLevel) : '';
      (this.xpFill.parentElement as HTMLElement).classList.toggle('hidden', !survival);
    }
    // health shake when low
    if (survival && p.health <= 4) this.hearts.style.transform = `translateY(${Math.sin(g.realTime * 30) * 1.2}px)`;
    else this.hearts.style.transform = '';
    // attack indicator
    const str = p.attackStrength(0);
    const showAtk = str < 1 && survival;
    this.attack.classList.toggle('hidden', !showAtk);
    if (showAtk) this.attackFill.style.width = `${str * 100}%`;
    // fps
    this.fpsEl.classList.toggle('hidden', !g.settings.showFps || this.debugOn);
    if (this.acc > 0.25) {
      this.acc = 0;
      this.fpsEl.textContent = `${g.fps} fps`;
      if (this.debugOn) this.updateDebug(g);
    }
  }

  private updateDebug(g: Game) {
    const p = g.player;
    const x = p.pos.x, y = p.pos.y, z = p.pos.z;
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    const L = g.world.getLight(bx, by, bz);
    const facing = ['south', 'west', 'north', 'east'][Math.round(((-p.yaw * 180) / Math.PI + 180) / 90) & 3];
    const biome = BIOMES[g.world.getBiome(bx, bz)]?.name ?? '?';
    const r = g.renderer;
    const t = g.interaction.target;
    const left = [
      `Minecraft: Photorealistic Physics Edition (fan recreation)`,
      `${g.fps} fps  ${r.stats.drawCalls} draws  ${(r.stats.triangles / 1e6).toFixed(2)}M tris  ${r.width}x${r.height}`,
      `C: ${g.chunks.stats.chunks} chunks, ${r.chunks.sectionCount} sections, ${(r.chunks.vertexCount / 1e6).toFixed(2)}M verts  gen ${g.chunks.stats.gen} mesh ${g.chunks.stats.mesh} dirty ${g.chunks.stats.dirty}`,
      `E: ${g.entities.list.length}`,
      `Dimension: ${g.dimension}`,
      ``,
      `XYZ: ${x.toFixed(3)} / ${y.toFixed(5)} / ${z.toFixed(3)}`,
      `Block: ${bx} ${by} ${bz}  Chunk: ${bx & 15} ${by & 15} ${bz & 15} in ${bx >> 4} ${by >> 4} ${bz >> 4}`,
      `Facing: ${facing} (${((-p.yaw * 180) / Math.PI).toFixed(1)} / ${((-p.pitch * 180) / Math.PI).toFixed(1)})`,
      `Light: sky ${(L >>> 12) & 15}, block R${(L >>> 8) & 15} G${(L >>> 4) & 15} B${L & 15}`,
      `Biome: ${biome}`,
      `Day ${Math.floor((g.ticks + g.dayTime) / 24000)}  time ${g.dayTime % 24000}  rain ${g.weather.rain.toFixed(2)}`,
      `Speed: ${(Math.hypot(p.vel.x, p.vel.z)).toFixed(2)} b/s  ground ${p.onGround}  fall ${p.fallDistance.toFixed(2)}`,
    ];
    const right: string[] = [`Seed: ${g.info.seed}`, `${navigator.userAgent.split(') ')[0].split(' (')[0]}`, `Quality: ${g.settings.quality}`];
    if (t) {
      const d = BLOCKS[t.state >>> 4];
      right.push('', `Targeted Block: ${t.x}, ${t.y}, ${t.z}`, `${d.name} [meta ${t.state & 15}]`, ...d.tags.map((tg) => `#${tg}`));
    }
    if (g.interaction.targetEntity) right.push('', `Targeted Entity: ${g.interaction.targetEntity.type}`);
    this.debugL.textContent = left.join('\n');
    this.debugR.textContent = right.join('\n');
  }
}
