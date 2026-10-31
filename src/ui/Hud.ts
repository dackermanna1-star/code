import type { CalloutOpts, FeedLine, HudFighter, HudState, IHud, ScreenSide } from './types';
import { el, fmtClock, prepareRoot, rgba, setFighterColors, SLOT_COLORS, statusColor, mix } from './dom';

/**
 * In-fight HUD: mirrored fighter plates, clock/phase/win-probability, combo counters, callouts,
 * narration feed, ultimate cut-ins, struggle meter and finisher title cards.
 *
 * update() runs every frame: every value is cached and the DOM is only touched when the
 * (quantised) value changes; bar widths use transform: scaleX so nothing triggers layout.
 */

interface AbilityRefs {
  root: HTMLElement;
  glyph: HTMLElement;
  name: string;
  slot: string;
  glyphText: string;
  cd: number;
  ready: boolean | null;
  visible: boolean;
}

interface PlateRefs {
  side: ScreenSide;
  root: HTMLElement;
  name: HTMLElement;
  title: HTMLElement;
  meta: HTMLElement;
  hpWrap: HTMLElement;
  hpFill: HTMLElement;
  hpGhost: HTMLElement;
  hpNum: HTMLElement;
  enFill: HTMLElement;
  guardWrap: HTMLElement;
  guardFill: HTMLElement;
  wrathWrap: HTMLElement;
  wrathFill: HTMLElement;
  wrathLabel: HTMLElement;
  abilities: AbilityRefs[];
  status: HTMLElement;
  intent: HTMLElement;
  combo: HTMLElement;
  comboN: HTMLElement;
  comboD: HTMLElement;
  comboTimer: number;
  c: {
    name?: string; title?: string; meta?: string; color?: string; cl?: string; hp?: number; hpInt?: number; low?: boolean;
    en?: number; guard?: number; guardLow?: boolean; wrath?: number; ult?: boolean; status?: string; intent?: string;
    combo?: number; comboDmg?: number; lastHp?: number;
  };
}

const q = (v: number, steps: number) => Math.round(Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0)) * steps) / steps;

const PHASE_CLASS: [RegExp, string][] = [
  [/JUDG/i, 'gl-ph-final'],
  [/COLLAPSE/i, 'gl-ph-late'],
  [/CLIMAX/i, 'gl-ph-climax'],
];

export class Hud implements IHud {
  private root!: HTMLElement;
  private hud!: HTMLElement;
  private plates!: [PlateRefs, PlateRefs];
  private clock!: HTMLElement;
  private phase!: HTMLElement;
  private wpLeft!: HTMLElement;
  private wpLabelL!: HTMLElement;
  private wpLabelR!: HTMLElement;
  private wpBar!: HTMLElement;
  private feedEl!: HTMLElement;
  private coCols!: Record<'left' | 'center' | 'right', HTMLElement>;
  private cutLayer!: HTMLElement;
  private finLayer!: HTMLElement;
  private struggleEl!: HTMLElement;
  private stFill!: HTMLElement;
  private stMark!: HTMLElement;
  private stLabel!: HTMLElement;
  private stShown = false;
  private stCache = { v: NaN, l: '', r: '', label: '' };
  private center = { clock: '', phase: '', phaseCls: '', wp: -1, wpColors: '' };
  private mounted = false;

  mount(root: HTMLElement): void {
    if (this.mounted) return;
    this.mounted = true;
    prepareRoot(root);
    this.root = root;
    const hud = el('div', 'gl-hud', root);
    this.hud = hud;

    const top = el('div', 'gl-top', hud);
    const left = this.buildPlate(top, 'left');
    const center = el('div', 'gl-center', top);
    const right = this.buildPlate(top, 'right');
    this.plates = [left, right];

    this.clock = el('div', 'gl-clock', center, '00:00');
    this.phase = el('div', 'gl-phase', center, 'OPENING');
    const wp = el('div', 'gl-wp', center);
    this.wpLabelL = el('span', 'gl-wp-n gl-wp-nl', wp, '50%');
    this.wpBar = el('div', 'gl-wp-bar', wp);
    el('div', 'gl-wp-right', this.wpBar);
    this.wpLeft = el('div', 'gl-wp-left', this.wpBar);
    el('div', 'gl-wp-mid', this.wpBar);
    this.wpLabelR = el('span', 'gl-wp-n gl-wp-nr', wp, '50%');
    el('div', 'gl-wp-cap', center, 'WIN PROBABILITY');

    // Combos live outside the plates (near each side, mid-height).
    for (const p of this.plates) {
      p.combo = el('div', `gl-combo gl-${p.side}`, hud);
      p.comboN = el('div', 'gl-combo-n', p.combo, '0');
      el('div', 'gl-combo-l', p.combo, 'HITS');
      p.comboD = el('div', 'gl-combo-d', p.combo, '');
    }

    // Struggle meter.
    this.struggleEl = el('div', 'gl-struggle', hud);
    this.stLabel = el('div', 'gl-st-label', this.struggleEl, 'CLASH');
    const barWrap = el('div', 'gl-st-barwrap', this.struggleEl);
    const bar = el('div', 'gl-st-bar', barWrap);
    this.stFill = el('div', 'gl-st-fill', bar);
    const markWrap = el('div', 'gl-st-markwrap', barWrap);
    this.stMark = el('div', 'gl-st-mark', markWrap);

    this.feedEl = el('div', 'gl-feed', hud);

    const co = el('div', 'gl-callouts', root);
    this.coCols = {
      left: el('div', 'gl-co-col gl-co-left', co),
      center: el('div', 'gl-co-col gl-co-center', co),
      right: el('div', 'gl-co-col gl-co-right', co),
    };
    this.cutLayer = el('div', 'gl-cutin-layer', root);
    this.finLayer = el('div', 'gl-fin-layer', root);
  }

  private buildPlate(parent: HTMLElement, side: ScreenSide): PlateRefs {
    const root = el('div', `gl-plate gl-${side}`, parent);
    const head = el('div', 'gl-plate-head', root);
    const name = el('div', 'gl-name', head, '—');
    const title = el('div', 'gl-ptitle', head, '');
    const meta = el('div', 'gl-meta', root, '');
    const hpWrap = el('div', 'gl-hp', root);
    el('div', 'gl-hp-back', hpWrap);
    const hpGhost = el('div', 'gl-hp-ghost', hpWrap);
    const hpFill = el('div', 'gl-hp-fill', hpWrap);
    el('div', 'gl-hp-ticks', hpWrap);
    el('div', 'gl-hp-shine', hpWrap);
    const hpNum = el('div', 'gl-hp-num', hpWrap, '');
    const sub = el('div', 'gl-sub', root);
    const en = el('div', 'gl-en', sub);
    const enFill = el('div', 'gl-en-fill', en);
    const guardWrap = el('div', 'gl-guard', sub);
    const guardFill = el('div', 'gl-guard-fill', guardWrap);
    const row = el('div', 'gl-row', root);
    const wrathWrap = el('div', 'gl-wrath', row);
    el('div', 'gl-wrath-back', wrathWrap);
    const wrathFill = el('div', 'gl-wrath-fill', wrathWrap);
    const wrathLabel = el('div', 'gl-wrath-label', wrathWrap, 'WRATH');
    const abWrap = el('div', 'gl-abs', row);
    const abilities: AbilityRefs[] = [];
    for (let i = 0; i < 5; i++) {
      const a = el('div', 'gl-ab', abWrap);
      el('div', 'gl-ab-cd', a);
      const glyph = el('span', 'gl-ab-g', a, '·');
      abilities.push({ root: a, glyph, name: '', slot: '', glyphText: '', cd: -1, ready: null, visible: true });
    }
    const row3 = el('div', 'gl-row3', root);
    const status = el('div', 'gl-status', row3);
    const intent = el('div', 'gl-intent', row3, '');
    return {
      side, root, name, title, meta, hpWrap, hpFill, hpGhost, hpNum, enFill, guardWrap, guardFill, wrathWrap, wrathFill, wrathLabel,
      abilities, status, intent, combo: root, comboN: root, comboD: root, comboTimer: 0, c: {},
    };
  }

  /* ------------------------------------------------------------------ */

  update(s: HudState): void {
    if (!this.mounted) return;
    this.updatePlate(this.plates[0], s.left);
    this.updatePlate(this.plates[1], s.right);
    const clock = fmtClock(s.time);
    if (clock !== this.center.clock) {
      this.center.clock = clock;
      this.clock.textContent = clock;
    }
    const phase = (s.phase || '').toUpperCase();
    if (phase !== this.center.phase) {
      this.center.phase = phase;
      this.phase.textContent = phase;
      let cls = '';
      for (const [re, c] of PHASE_CLASS) if (re.test(phase)) { cls = c; break; }
      if (cls !== this.center.phaseCls) {
        if (this.center.phaseCls) this.phase.classList.remove(this.center.phaseCls);
        if (cls) this.phase.classList.add(cls);
        this.center.phaseCls = cls;
      }
      this.phase.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'ease-out' });
    }
    const colors = `${s.left.color}|${s.right.color}`;
    if (colors !== this.center.wpColors) {
      this.center.wpColors = colors;
      this.wpBar.style.setProperty('--lc', s.left.color);
      this.wpBar.style.setProperty('--rc', s.right.color);
      this.wpLabelL.style.color = mix(s.left.color, '#ffffff', 0.35);
      this.wpLabelR.style.color = mix(s.right.color, '#ffffff', 0.35);
    }
    const wp = q(s.winProbLeft, 400);
    if (wp !== this.center.wp) {
      const prevPct = Math.round(this.center.wp * 100);
      this.center.wp = wp;
      this.wpLeft.style.transform = `scaleX(${wp})`;
      const pct = Math.round(wp * 100);
      if (pct !== prevPct) {
        this.wpLabelL.textContent = `${pct}%`;
        this.wpLabelR.textContent = `${100 - pct}%`;
      }
    }
  }

  private updatePlate(p: PlateRefs, f: HudFighter): void {
    const c = p.c;
    if (c.name !== f.name) {
      c.name = f.name;
      p.name.textContent = f.name;
    }
    if (c.title !== f.title) {
      c.title = f.title;
      p.title.textContent = f.title;
    }
    const meta = `${f.aspectName} · ${f.weaponName} · ${f.personalityName}`;
    if (c.meta !== meta) {
      c.meta = meta;
      p.meta.textContent = meta;
    }
    if (c.color !== f.color || c.cl !== f.colorLight) {
      c.color = f.color;
      c.cl = f.colorLight;
      setFighterColors(p.root, f.color, f.colorLight);
      setFighterColors(p.combo, f.color, f.colorLight);
      c.status = undefined; // chips use the colour
    }
    // Health.
    const hp = q(f.hp / Math.max(1, f.maxHp), 1000);
    if (c.hp !== hp) {
      const prev = c.lastHp ?? hp;
      c.hp = hp;
      p.hpFill.style.transform = `scaleX(${hp})`;
      p.hpGhost.style.transform = `scaleX(${Math.max(hp, 0)})`;
      if (prev - hp > 0.025) {
        p.hpWrap.animate(
          [{ filter: 'brightness(2.2)', transform: 'translateX(0)' }, { filter: 'brightness(1)', transform: `translateX(${p.side === 'left' ? -3 : 3}px)`, offset: 0.25 }, { filter: 'brightness(1)', transform: 'translateX(0)' }],
          { duration: 260, easing: 'ease-out' },
        );
      }
      c.lastHp = hp;
      const low = hp < 0.25;
      if (low !== c.low) {
        c.low = low;
        p.root.classList.toggle('gl-low', low);
      }
    }
    const hpInt = Math.max(0, Math.ceil(f.hp));
    if (hpInt !== c.hpInt) {
      c.hpInt = hpInt;
      p.hpNum.textContent = String(hpInt);
    }
    const en = q(f.energy / Math.max(1, f.maxEnergy), 200);
    if (c.en !== en) {
      c.en = en;
      p.enFill.style.transform = `scaleX(${en})`;
    }
    const g = q(f.guard / Math.max(1, f.maxGuard), 200);
    if (c.guard !== g) {
      c.guard = g;
      p.guardFill.style.transform = `scaleX(${g})`;
      const gl = g < 0.3;
      if (gl !== c.guardLow) {
        c.guardLow = gl;
        p.guardWrap.classList.toggle('gl-guard-low', gl);
      }
    }
    const w = q(f.wrath / Math.max(1, f.maxWrath), 200);
    if (c.wrath !== w) {
      c.wrath = w;
      p.wrathFill.style.transform = `scaleX(${w})`;
    }
    if (c.ult !== f.ultimateReady) {
      c.ult = f.ultimateReady;
      p.wrathWrap.classList.toggle('gl-ult', f.ultimateReady);
      p.wrathLabel.textContent = f.ultimateReady ? 'ULTIMATE READY' : 'WRATH';
      if (f.ultimateReady) p.wrathWrap.animate([{ transform: 'scale(1.12)', filter: 'brightness(2)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 500, easing: 'ease-out' });
    }
    // Abilities.
    for (let i = 0; i < p.abilities.length; i++) {
      const r = p.abilities[i];
      const a = f.abilities[i];
      if (!a) {
        if (r.visible) {
          r.visible = false;
          r.root.style.display = 'none';
        }
        continue;
      }
      if (!r.visible) {
        r.visible = true;
        r.root.style.display = '';
      }
      if (r.slot !== a.slot) {
        r.slot = a.slot;
        r.root.dataset.slot = a.slot;
        r.root.style.setProperty('--sc', SLOT_COLORS[a.slot] ?? '#ffffff');
      }
      if (r.glyphText !== a.glyph) {
        r.glyphText = a.glyph;
        r.glyph.textContent = a.glyph;
      }
      if (r.name !== a.name) {
        r.name = a.name;
        r.root.title = a.name;
      }
      const cd = q(a.cooldown, 60);
      if (cd !== r.cd) {
        const wasCooling = r.cd > 0;
        r.cd = cd;
        r.root.style.setProperty('--cdf', String(cd));
        if (wasCooling && cd === 0) {
          r.root.animate([{ boxShadow: '0 0 0 0 var(--sc)', transform: 'scale(1.25)' }, { boxShadow: '0 0 18px 4px transparent', transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
        }
      }
      if (r.ready !== a.ready) {
        r.ready = a.ready;
        r.root.classList.toggle('gl-ab-off', !a.ready);
      }
    }
    // Status chips.
    const st = f.status.join('|');
    if (c.status !== st) {
      c.status = st;
      p.status.textContent = '';
      for (const tag of f.status) {
        const chip = el('span', 'gl-chip', p.status, tag);
        chip.style.setProperty('--chip', statusColor(tag, f.color));
      }
    }
    const intent = f.intent ? `◆ ${f.intent}` : '';
    if (c.intent !== intent) {
      c.intent = intent;
      p.intent.textContent = intent;
      if (intent) p.intent.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380 });
    }
    // Combo counter.
    if (c.combo !== f.combo || c.comboDmg !== Math.round(f.comboDamage)) {
      const prevCombo = c.combo ?? 0;
      c.combo = f.combo;
      c.comboDmg = Math.round(f.comboDamage);
      if (f.combo >= 2) {
        if (p.comboTimer) {
          clearTimeout(p.comboTimer);
          p.comboTimer = 0;
        }
        p.combo.classList.add('gl-on');
        p.combo.classList.remove('gl-out');
        p.comboN.textContent = String(f.combo);
        p.comboD.textContent = `${c.comboDmg} DMG`;
        if (f.combo !== prevCombo) {
          p.comboN.animate(
            [{ transform: 'scale(1.55) rotate(-4deg)', filter: 'brightness(2.4)' }, { transform: 'scale(0.94)', offset: 0.45 }, { transform: 'scale(1)', filter: 'brightness(1)' }],
            { duration: 240, easing: 'ease-out' },
          );
        }
      } else if (prevCombo >= 2 && !p.comboTimer) {
        p.comboTimer = window.setTimeout(() => {
          p.comboTimer = 0;
          p.combo.classList.add('gl-out');
          p.combo.classList.remove('gl-on');
        }, 700);
      }
    }
  }

  /* ------------------------------------------------------------------ */

  callout(text: string, opts: CalloutOpts = {}): void {
    if (!this.mounted) return;
    const side = opts.side ?? 'center';
    const col = this.coCols[side];
    const size = opts.size ?? 'md';
    const dur = Math.max(0.5, opts.duration ?? 1.2);
    const color = opts.color ?? '#ffffff';
    const node = el('div', `gl-co gl-co-${size}`);
    node.style.setProperty('--c', color);
    node.style.setProperty('--cg', rgba(color, 0.75));
    node.style.animationDuration = `${dur}s`;
    const t = el('div', 'gl-co-text', node, text);
    t.dataset.text = text;
    if (opts.sub) el('div', 'gl-co-sub', node, opts.sub);
    col.appendChild(node);
    // Keep at most three per column.
    while (col.children.length > 3) col.firstElementChild?.remove();
    const kill = () => node.remove();
    node.addEventListener('animationend', (e) => {
      if (e.target === node) kill();
    });
    window.setTimeout(kill, dur * 1000 + 400);
  }

  feed(line: FeedLine): void {
    if (!this.mounted) return;
    const row = el('div', `gl-fl${line.important ? ' gl-fl-imp' : ''}`, this.feedEl);
    if (line.color) row.style.setProperty('--c', line.color);
    el('span', 'gl-fl-t', row, line.time);
    el('span', 'gl-fl-x', row, line.text);
    while (this.feedEl.children.length > 6) this.feedEl.firstElementChild?.remove();
  }

  clearFeed(): void {
    if (this.feedEl) this.feedEl.textContent = '';
  }

  ultimateCutIn(side: ScreenSide, fighterName: string, abilityName: string, color: string): void {
    if (!this.mounted) return;
    const wrap = el('div', `gl-cutin gl-cutin-${side}`, this.cutLayer);
    setFighterColors(wrap, color);
    const band = el('div', 'gl-cutin-band', wrap);
    el('div', 'gl-cutin-lines', band);
    const txt = el('div', 'gl-cutin-text', band);
    el('div', 'gl-cutin-who', txt, `${fighterName.toUpperCase()} · ULTIMATE`);
    const ab = el('div', 'gl-cutin-ab', txt, abilityName.toUpperCase());
    ab.dataset.text = abilityName.toUpperCase();
    window.setTimeout(() => wrap.remove(), 1650);
  }

  struggle(v: number | null, leftColor: string, rightColor: string, label?: string): void {
    if (!this.mounted) return;
    if (v === null || !Number.isFinite(v)) {
      if (this.stShown) {
        this.stShown = false;
        this.struggleEl.classList.remove('gl-on');
      }
      return;
    }
    if (!this.stShown) {
      this.stShown = true;
      this.struggleEl.classList.add('gl-on');
    }
    if (this.stCache.l !== leftColor || this.stCache.r !== rightColor) {
      this.stCache.l = leftColor;
      this.stCache.r = rightColor;
      this.struggleEl.style.setProperty('--lc', leftColor);
      this.struggleEl.style.setProperty('--rc', rightColor);
    }
    const lab = (label ?? 'CLASH').toUpperCase();
    if (this.stCache.label !== lab) {
      this.stCache.label = lab;
      this.stLabel.textContent = lab;
    }
    const k = Math.round(((1 - Math.max(-1, Math.min(1, v))) / 2) * 500) / 500;
    if (k !== this.stCache.v) {
      this.stCache.v = k;
      this.stFill.style.transform = `scaleX(${k})`;
      this.stMark.style.transform = `translateX(${(k * 100).toFixed(1)}%)`;
    }
  }

  finisherTitle(name: string, color: string): void {
    if (!this.mounted) return;
    this.finLayer.textContent = '';
    const card = el('div', 'gl-fin', this.finLayer);
    setFighterColors(card, color);
    el('div', 'gl-fin-flash', card);
    el('div', 'gl-fin-kicker', card, 'FINISHER');
    const t = el('div', 'gl-fin-name', card, name.toUpperCase());
    t.dataset.text = name.toUpperCase();
    el('div', 'gl-fin-line', card);
    window.setTimeout(() => card.remove(), 2600);
  }

  setVisible(v: boolean): void {
    if (this.hud) this.hud.classList.toggle('gl-hidden', !v);
  }

  setFeedVisible(v: boolean): void {
    if (this.feedEl) this.feedEl.classList.toggle('gl-hidden', !v);
  }
}
