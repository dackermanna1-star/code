import * as THREE from 'three';
import type { Game } from '../game/Game';
import { events } from '../game/events';
import { ctx } from '../game/ctx';
import type { Character } from '../characters/Character';
import type { Brain } from '../ai/Brain';
import { clamp } from '../core/math';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function div(cls: string, parent?: HTMLElement, text?: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  if (text !== undefined) d.textContent = text;
  parent?.appendChild(d);
  return d;
}

function fmtTime(s: number): string {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface Bubble {
  el: HTMLDivElement;
  brain: Brain | null;
  text: string;
}

interface Drip {
  x: number;
  y: number;
  vy: number;
  r: number;
  life: number;
}

const TIPS = [
  '<b>LMB</b> punch &nbsp;·&nbsp; hold <b>LMB</b> for a haymaker',
  '<b>RMB</b> block &nbsp;·&nbsp; block right before a hit to <b>parry</b>',
  '<b>Q</b> kick &nbsp;·&nbsp; look down + <b>Q</b> to stomp',
  '<b>E</b> pick up / grab people &nbsp;·&nbsp; <b>F</b> throw &nbsp;·&nbsp; <b>G</b> drop',
  '<b>V</b> or double-tap a direction to dodge',
  'Fill the bar with violence, then press <b>R</b> to <b>RAGE</b>',
  'Bottles, chairs, pool cues — anything not nailed down is a weapon',
  'A heavy blow on a staggered, beaten enemy is a <b>FINISHER</b>',
  'Grab someone with <b>E</b>, look down at a table and punch to <b>slam</b> them',
];

/** In-game heads-up display: vitals, weapon, objective, feedback and overlays. */
export class HUD {
  readonly root: HTMLDivElement;
  private fpsEl: HTMLDivElement;
  private objMain: HTMLDivElement;
  private objSub: HTMLDivElement;
  private objTimer: HTMLDivElement;
  private bossWrap: HTMLDivElement;
  private bossFill: HTMLDivElement;
  private bossTrail: HTMLDivElement;
  private bossName: HTMLDivElement;
  private feed: HTMLDivElement;
  private msgWrap: HTMLDivElement;
  private msgTitle: HTMLDivElement;
  private msgSub: HTMLDivElement;
  private cross: HTMLDivElement;
  private hitmark: HTMLDivElement;
  private ring: SVGCircleElement;
  private prompt: HTMLDivElement;
  private promptLabel: HTMLSpanElement;
  private promptKey: HTMLSpanElement;
  private comboWrap: HTMLDivElement;
  private comboN: HTMLDivElement;
  private comboLabel: HTMLDivElement;
  private vitals: HTMLDivElement;
  private hpFill: HTMLDivElement;
  private hpTrail: HTMLDivElement;
  private hpText: HTMLDivElement;
  private adrFill: HTMLDivElement;
  private adrLabel: HTMLDivElement;
  private adrWrap: HTMLDivElement;
  private wpnWrap: HTMLDivElement;
  private wpnName: HTMLDivElement;
  private wpnDur: HTMLDivElement;
  private wpnDurFill: HTMLDivElement;
  private wpnHint: HTMLDivElement;
  private hints: HTMLDivElement;
  private popups: HTMLDivElement;
  private bubbleLayer: HTMLDivElement;
  private markerLayer: HTMLDivElement;
  private scoreboard: HTMLDivElement;
  private blood: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private drips: Drip[] = [];
  private bloodAmount = 0;

  private bubbles: Bubble[] = [];
  private markers: HTMLDivElement[] = [];
  private losCache = new Map<Brain, { t: number; ok: boolean }>();

  private msgUntil = 0;
  private hitmarkT = 0;
  private lastCombo = 0;
  private comboShowT = 0;
  private tipI = 0;
  private tipT = 0;
  private hintTime = 0;
  private last: Record<string, string | number | boolean> = {};
  private bossTrailV = 1;
  private visible = false;
  /** screen effect drivers read by the post pass */
  damageFlash = 0;
  readonly damageDir = new THREE.Vector2();
  private heartbeat = 0;

  constructor(
    private game: Game,
    parent: HTMLElement,
  ) {
    const r = (this.root = div('hud hidden', parent));
    this.blood = document.createElement('canvas');
    this.blood.className = 'hud-blood';
    this.blood.width = 320;
    this.blood.height = 180;
    r.appendChild(this.blood);
    this.bctx = this.blood.getContext('2d')!;

    this.bubbleLayer = div('hud-bubbles', r);
    this.markerLayer = div('hud-markers', r);
    this.fpsEl = div('hud-fps', r);

    const obj = div('hud-objective', r);
    this.objMain = div('obj-main', obj);
    this.objSub = div('obj-sub', obj);
    this.objTimer = div('obj-timer', obj);

    this.bossWrap = div('hud-boss', r);
    this.bossName = div('boss-name', this.bossWrap, 'BIG EARL');
    const bb = div('boss-bar', this.bossWrap);
    this.bossTrail = div('boss-trail', bb);
    this.bossFill = div('boss-fill', bb);

    this.feed = div('hud-feed', r);

    this.msgWrap = div('hud-msg', r);
    this.msgTitle = div('msg-title', this.msgWrap);
    this.msgSub = div('msg-sub', this.msgWrap);

    this.cross = div('hud-cross', r);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.classList.add('cross-ring');
    this.ring = document.createElementNS(svgNS, 'circle');
    this.ring.setAttribute('cx', '32');
    this.ring.setAttribute('cy', '32');
    this.ring.setAttribute('r', '22');
    svg.appendChild(this.ring);
    this.cross.appendChild(svg);
    div('cross-dot', this.cross);
    this.hitmark = div('cross-hit', this.cross);
    for (let i = 0; i < 4; i++) div('hm hm' + i, this.hitmark);
    this.popups = div('hud-popups', r);

    this.prompt = div('hud-prompt', r);
    this.promptKey = document.createElement('span');
    this.promptKey.className = 'key';
    this.promptKey.textContent = 'E';
    this.promptLabel = document.createElement('span');
    this.promptLabel.className = 'label';
    this.prompt.append(this.promptKey, this.promptLabel);

    this.comboWrap = div('hud-combo', r);
    this.comboN = div('combo-n', this.comboWrap);
    this.comboLabel = div('combo-label', this.comboWrap, 'HIT COMBO');

    this.vitals = div('hud-vitals', r);
    div('vit-label', this.vitals, 'HEALTH');
    const hp = div('hp-bar', this.vitals);
    this.hpTrail = div('hp-trail', hp);
    this.hpFill = div('hp-fill', hp);
    this.hpText = div('hp-text', hp);
    this.adrWrap = div('adr', this.vitals);
    const ab = div('adr-bar', this.adrWrap);
    this.adrFill = div('adr-fill', ab);
    this.adrLabel = div('adr-label', this.adrWrap, 'ADRENALINE');

    this.wpnWrap = div('hud-weapon', r);
    this.wpnName = div('wpn-name', this.wpnWrap);
    this.wpnDur = div('wpn-dur', this.wpnWrap);
    this.wpnDurFill = div('wpn-dur-fill', this.wpnDur);
    this.wpnHint = div('wpn-hint', this.wpnWrap);

    this.hints = div('hud-hints', r);
    this.scoreboard = div('hud-score', r);

    this.subscribe();
  }

  private subscribe(): void {
    events.on('hit', ({ target, hit, result }) => {
      const p = this.game.player;
      if (!p || this.game.state !== 'playing') return;
      if (hit.attacker === p && target !== p) {
        if (result.blocked) {
          this.pop(result.parried ? 'PARRIED' : 'BLOCKED', 'pop-grey');
        } else if (result.damage > 0) {
          this.hitmarker(result.killed, result.damage);
          if (hit.crit) this.pop('CRITICAL', 'pop-crit');
          // close, heavy hits splash the screen
          const d = target.position.distanceTo(p.position);
          if (d < 1.9 && (result.damage > 16 || result.killed || result.severed >= 0) && ctx.fx.goreScale > 0) this.splatter(clamp(result.damage / 40, 0.25, 1));
        }
      }
      if (target === p && result.damage > 0) {
        this.damageFlash = Math.min(1, this.damageFlash + 0.25 + result.damage / 30);
        const att = hit.attacker;
        if (att) {
          // direction toward the attacker in screen space (x right, y up)
          const yaw = p.ctrl.yaw;
          const dx = att.position.x - p.position.x;
          const dz = att.position.z - p.position.z;
          const right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
          const fwd = -dx * Math.sin(yaw) - dz * Math.cos(yaw);
          this.damageDir.set(right, fwd).normalize();
        } else this.damageDir.set(0, 0);
      }
    });
    events.on('block', ({ target, parry }) => {
      if (target === this.game.player && this.game.state === 'playing') this.pop(parry ? 'PARRY!' : 'BLOCK', parry ? 'pop-parry' : 'pop-grey');
    });
    events.on('takedown', ({ attacker, kind }) => {
      if (attacker === this.game.player && this.game.state === 'playing') this.pop(kind, 'pop-kill');
    });
    events.on('headExplode', ({ point }) => {
      const p = this.game.player;
      if (p && this.game.state === 'playing' && point.distanceTo(p.position) < 2.8) this.splatter(1);
    });
    events.on('sever', ({ point }) => {
      const p = this.game.player;
      if (p && this.game.state === 'playing' && point.distanceTo(p.position) < 2.2) this.splatter(0.6);
    });
  }

  show(on: boolean): void {
    this.visible = on;
    this.root.classList.toggle('hidden', !on);
    if (on) this.hintTime = 0;
  }

  /** Reset per-round state. */
  reset(): void {
    this.feed.textContent = '';
    this.msgWrap.classList.remove('show');
    this.msgUntil = 0;
    this.damageFlash = 0;
    this.bloodAmount = 0;
    this.drips.length = 0;
    this.bctx.clearRect(0, 0, this.blood.width, this.blood.height);
    for (const b of this.bubbles) {
      b.brain = null;
      b.el.style.display = 'none';
    }
    this.losCache.clear();
    this.last = {};
    this.bossTrailV = 1;
    this.lastCombo = 0;
    this.hintTime = 0;
  }

  // ------------------------------------------------------------------ feedback
  message(title: string, sub = '', kind: 'info' | 'warn' | 'kill' | 'big' = 'info'): void {
    const now = performance.now() / 1000;
    // a combo shout shouldn't wipe an important announcement that just appeared
    if (kind === 'kill' && this.msgWrap.dataset.kind && this.msgWrap.dataset.kind !== 'kill' && now < this.msgUntil - 1.2) {
      this.pop(title, 'pop-kill');
      return;
    }
    this.msgTitle.textContent = title;
    this.msgSub.textContent = sub;
    this.msgWrap.dataset.kind = kind;
    this.msgWrap.classList.remove('show');
    void this.msgWrap.offsetWidth; // restart the CSS animation
    this.msgWrap.classList.add('show');
    this.msgUntil = now + (kind === 'big' ? 3.6 : kind === 'kill' ? 1.6 : 2.6);
  }

  killFeed(text: string, style = ''): void {
    const e = div('feed-item ' + (style === 'npc' ? 'feed-npc' : 'feed-player'), undefined, text);
    this.feed.prepend(e);
    while (this.feed.children.length > 6) this.feed.lastElementChild!.remove();
    setTimeout(() => e.classList.add('fade'), 4200);
    setTimeout(() => e.remove(), 5200);
  }

  private hitmarker(killed: boolean, dmg: number): void {
    this.hitmarkT = killed ? 0.45 : 0.22;
    this.hitmark.classList.toggle('kill', killed);
    this.hitmark.style.setProperty('--hm', String(clamp(0.7 + dmg / 40, 0.7, 1.6)));
    this.hitmark.classList.remove('on');
    void this.hitmark.offsetWidth;
    this.hitmark.classList.add('on');
  }

  pop(text: string, cls: string): void {
    if (this.popups.children.length > 3) this.popups.firstElementChild!.remove();
    const e = div('pop ' + cls, this.popups, text);
    e.style.setProperty('--dx', `${(Math.random() - 0.5) * 70}px`);
    setTimeout(() => e.remove(), 900);
  }

  /** Blood on the "lens" from close-up violence. */
  splatter(amount: number): void {
    const g = this.bctx;
    const W = this.blood.width,
      H = this.blood.height;
    const n = Math.floor(6 + amount * 16);
    // bias toward a random side of the screen
    const cx = W * (0.5 + (Math.random() - 0.5) * 0.9);
    const cy = H * (0.45 + (Math.random() - 0.5) * 0.6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.pow(Math.random(), 0.7) * (40 + amount * 70);
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d * 0.7;
      const s = Math.max(1, Math.round((1 - d / 140) * (2 + Math.random() * 6) * (0.6 + amount)));
      g.fillStyle = Math.random() < 0.5 ? '#7d0303' : Math.random() < 0.5 ? '#9e0808' : '#5a0202';
      g.globalAlpha = 0.75 + Math.random() * 0.25;
      g.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
      if (Math.random() < 0.25 && this.drips.length < 40) this.drips.push({ x, y, vy: 2 + Math.random() * 6, r: Math.max(1, Math.round(s * 0.45)), life: 1.5 + Math.random() * 2.5 });
    }
    g.globalAlpha = 1;
    this.bloodAmount = Math.min(1.5, this.bloodAmount + amount);
  }

  private updateBlood(dt: number): void {
    const g = this.bctx;
    const W = this.blood.width,
      H = this.blood.height;
    if (this.bloodAmount <= 0.001 && !this.drips.length) return;
    for (let i = this.drips.length - 1; i >= 0; i--) {
      const d = this.drips[i];
      d.y += d.vy * dt;
      d.vy *= 0.995;
      d.life -= dt;
      g.fillStyle = '#6e0303';
      g.fillRect(Math.round(d.x - d.r / 2), Math.round(d.y), d.r, Math.max(1, Math.round(d.vy * dt) + 1));
      if (d.life <= 0 || d.y > H) this.drips.splice(i, 1);
    }
    // fade
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = `rgba(0,0,0,${Math.min(1, dt * 0.45)})`;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    this.bloodAmount = Math.max(0, this.bloodAmount - dt * 0.2);
  }

  // ------------------------------------------------------------------ per frame
  private set(key: string, v: string | number | boolean, apply: () => void): void {
    if (this.last[key] === v) return;
    this.last[key] = v;
    apply();
  }

  update(dt: number, realDt: number): void {
    const g = this.game;
    const s = g.settings.value;
    const fpsOn = s.showFps;
    this.set('fpsOn', fpsOn, () => (this.fpsEl.style.display = fpsOn ? 'block' : 'none'));
    if (fpsOn) this.set('fps', Math.round(g.fps), () => (this.fpsEl.textContent = `${Math.round(g.fps)} FPS  ·  ${g.frameMs.toFixed(1)} ms`));

    this.damageFlash = Math.max(0, this.damageFlash - realDt * 1.6);
    this.updateBlood(realDt);
    if (!this.visible || !g.player) return;
    const p = g.player;
    const d = g.director;
    p.updateHud(realDt);

    // ---- vitals
    const hpK = clamp(p.health / p.maxHealth, 0, 1);
    const trailK = clamp(p.smoothHealth / p.maxHealth, 0, 1);
    this.set('hp', Math.round(hpK * 1000), () => {
      this.hpFill.style.transform = `scaleX(${hpK})`;
      this.hpText.textContent = String(Math.ceil(p.health));
    });
    this.set('hpTrail', Math.round(Math.max(trailK, hpK) * 500), () => (this.hpTrail.style.transform = `scaleX(${Math.max(trailK, hpK)})`));
    const low = hpK < 0.3 && p.alive;
    this.set('low', low, () => this.vitals.classList.toggle('low', low));
    const raging = p.raging;
    const adrK = raging ? p.rageTimer / p.rageDuration : p.adrenaline / 100;
    this.set('adr', Math.round(adrK * 400), () => (this.adrFill.style.transform = `scaleX(${adrK})`));
    const adrState = raging ? 'rage' : p.adrenaline >= 100 ? 'ready' : 'fill';
    this.set('adrState', adrState, () => {
      this.adrWrap.dataset.state = adrState;
      this.adrLabel.innerHTML = adrState === 'rage' ? 'RAGING' : adrState === 'ready' ? 'RAGE READY &nbsp;<span class="key sm">R</span>' : 'ADRENALINE';
    });

    // ---- weapon / grab state
    let wName = 'FISTS';
    let wHint = 'hold <b>LMB</b> haymaker · <b>Q</b> kick';
    let dur = -1;
    if (p.grabbed) {
      wName = `GRABBING ${p.grabbed.name.toUpperCase()}`;
      wHint = '<b>LMB</b> punch (look down at a table to slam) · <b>Q</b> knee · <b>F</b> throw · <b>E</b> let go';
    } else if (p.carryingBody) {
      wName = p.carryingBody.alive ? `CARRYING ${p.carryingBody.name.toUpperCase()}` : 'CARRYING A BODY';
      wHint = '<b>LMB</b> / <b>F</b> throw';
    } else if (p.weapon) {
      const w = p.weapon;
      wName = w.name.toUpperCase();
      dur = w.maxDurability > 0 && isFinite(w.maxDurability) ? clamp(w.durability / w.maxDurability, 0, 1) : -1;
      wHint = (w as any).carryOnly ? '<b>LMB</b> / <b>F</b> throw · <b>G</b> drop' : '<b>F</b> throw · <b>G</b> drop' + ((w as any).prop?.def?.interact === 'drink' && (w as any).prop?.full ? ' · <b>E</b> drink' : '');
    }
    this.set('wName', wName, () => (this.wpnName.textContent = wName));
    this.set('wHint', wHint, () => (this.wpnHint.innerHTML = wHint));
    this.set('wDur', Math.round(dur * 100), () => {
      this.wpnDur.style.display = dur < 0 ? 'none' : 'block';
      this.wpnDurFill.style.transform = `scaleX(${Math.max(0, dur)})`;
      this.wpnDur.classList.toggle('crit', dur >= 0 && dur < 0.25);
    });

    // ---- crosshair
    const charge = p.charging ? clamp(p.chargeT / 0.85, 0, 1) : 0;
    this.set('charge', Math.round(charge * 60), () => {
      this.ring.style.strokeDashoffset = String(138.2 * (1 - charge));
      this.cross.classList.toggle('charging', charge > 0);
      this.cross.classList.toggle('charged', charge >= 1);
    });
    this.set('blocking', p.blocking, () => this.cross.classList.toggle('blocking', p.blocking));
    this.hitmarkT = Math.max(0, this.hitmarkT - realDt);
    if (this.hitmarkT <= 0 && this.hitmark.classList.contains('on')) this.hitmark.classList.remove('on');

    // ---- interaction prompt
    const focus = g.interaction?.focus;
    const label = p.alive && focus && !p.grabbed && !p.carryingBody ? focus.label : '';
    this.set('prompt', label, () => {
      this.promptLabel.textContent = label;
      this.prompt.classList.toggle('show', !!label);
    });

    // ---- combo
    if (p.combo !== this.lastCombo) {
      if (p.combo > this.lastCombo && p.combo >= 2) {
        this.comboN.textContent = String(p.combo);
        this.comboLabel.textContent = p.combo >= 15 ? 'BRUTAL!' : p.combo >= 10 ? 'SAVAGE!' : p.combo >= 6 ? 'NASTY!' : 'HIT COMBO';
        this.comboWrap.classList.remove('bump');
        void this.comboWrap.offsetWidth;
        this.comboWrap.classList.add('bump', 'show');
        this.comboWrap.style.setProperty('--heat', String(clamp(p.combo / 15, 0, 1)));
      }
      this.lastCombo = p.combo;
    }
    if (p.combo < 2 && this.comboWrap.classList.contains('show')) this.comboWrap.classList.remove('show');

    // ---- objective
    let main = '';
    let sub = '';
    const t = d.state === 'playing' ? ctx.time.elapsed - d.startTime : d.endTime - d.startTime;
    if (d.mode === 'brawl') {
      const rem = d.remaining();
      if (!g.ai.brawlStarted) {
        main = 'LAST CALL';
        sub = 'Start a fight. Be the last one standing.';
      } else {
        main = `${rem} LEFT`;
        sub = 'LAST ONE STANDING WINS';
      }
    } else {
      const rem = d.waveRemaining();
      main = d.wave === 0 ? 'GET READY' : `WAVE ${d.wave}`;
      sub = d.waveInProgress ? `${rem} LEFT` : d.wave === 0 ? `First wave in ${Math.ceil(d.nextWaveIn)}` : `Next wave in ${Math.ceil(d.nextWaveIn)}`;
    }
    this.set('objMain', main, () => (this.objMain.textContent = main));
    this.set('objSub', sub, () => (this.objSub.textContent = sub));
    const tStr = fmtTime(t);
    this.set('objTimer', tStr, () => (this.objTimer.textContent = tStr));

    // ---- boss
    const boss = d.npcs.find((c) => c.isBoss);
    const bb = boss ? ((boss as any).brain as Brain | undefined) : undefined;
    const showBoss = !!boss && !!bb && boss.alive && bb.awakeBoss && (d.mode === 'survival' || g.ai.brawlStarted);
    this.set('boss', showBoss, () => this.bossWrap.classList.toggle('show', showBoss));
    if (showBoss && boss) {
      const k = clamp(boss.health / boss.stats.maxHealth, 0, 1);
      this.bossTrailV = Math.max(k, this.bossTrailV - realDt * 0.25);
      if (this.bossTrailV < k) this.bossTrailV = k;
      this.set('bossHp', Math.round(k * 500), () => (this.bossFill.style.transform = `scaleX(${k})`));
      this.set('bossTr', Math.round(this.bossTrailV * 500), () => (this.bossTrail.style.transform = `scaleX(${this.bossTrailV})`));
      this.set('bossName', boss.name, () => (this.bossName.textContent = boss.name.toUpperCase()));
    }

    // ---- message timeout
    if (this.msgUntil && performance.now() / 1000 > this.msgUntil) {
      this.msgWrap.classList.remove('show');
      this.msgUntil = 0;
    }

    // ---- hints
    this.hintTime += realDt;
    const hintsOn = s.hints && this.hintTime < 60 && d.state === 'playing';
    this.tipT -= realDt;
    if (hintsOn && this.tipT <= 0) {
      this.tipT = 6.5;
      this.hints.innerHTML = TIPS[this.tipI++ % TIPS.length];
      this.hints.classList.remove('show');
      void this.hints.offsetWidth;
      this.hints.classList.add('show');
    }
    if (!hintsOn && this.hints.classList.contains('show')) this.hints.classList.remove('show');

    // ---- scoreboard (Tab)
    const sb = ctx.input.isDown('scoreboard') && d.state === 'playing';
    this.set('sb', sb, () => {
      this.scoreboard.classList.toggle('show', sb);
      if (sb) this.fillScoreboard();
    });

    this.updateBubbles();
    this.updateMarkers();
    void dt;
  }

  private fillScoreboard(): void {
    const p = this.game.player;
    const st = p.stats;
    const acc = st.punches > 0 ? Math.round((st.hits / Math.max(1, st.punches)) * 100) : 0;
    const rows: [string, string | number][] = [
      ['Knockouts', st.kills],
      ['Hits landed', st.hits],
      ['Accuracy', acc + '%'],
      ['Best combo', st.bestCombo],
      ['Parries', st.parries],
      ['Heads popped', st.headExplosions],
      ['Damage dealt', Math.round(st.damageDealt)],
      ['Damage taken', Math.round(st.damageTaken)],
    ];
    this.scoreboard.innerHTML = '<div class="sb-title">TAB · STATS</div>' + rows.map(([k, v]) => `<div class="sb-row"><span>${k}</span><b>${v}</b></div>`).join('');
  }

  // ------------------------------------------------------------------ speech bubbles
  private updateBubbles(): void {
    const g = this.game;
    const cam = g.engine.camera;
    const W = g.engine.width,
      H = g.engine.height;
    const now = ctx.time.elapsed;
    const eye = cam.position;
    const cands: { b: Brain; d: number }[] = [];
    for (const b of g.ai.brains) {
      if (!b.bubble || !b.ch.alive || now > b.bubble.until) continue;
      const dd = b.ch.position.distanceTo(eye);
      if (dd > 15) continue;
      cands.push({ b, d: dd });
    }
    cands.sort((a, b) => a.d - b.d);
    let used = 0;
    for (const c of cands) {
      if (used >= 5) break;
      const b = c.b;
      const head = b.ch.headPosition(_v);
      head.y += 0.42;
      // occlusion check, cached
      let los = this.losCache.get(b);
      if (!los || now - los.t > 0.3) {
        los = { t: now, ok: ctx.physics.lineOfSight(eye, head) };
        this.losCache.set(b, los);
      }
      if (!los.ok) continue;
      _v2.copy(head).project(cam);
      if (_v2.z > 1 || _v2.z < -1 || Math.abs(_v2.x) > 1.1 || Math.abs(_v2.y) > 1.1) continue;
      let bub = this.bubbles[used];
      if (!bub) {
        bub = { el: div('bubble', this.bubbleLayer), brain: null, text: '' };
        this.bubbles.push(bub);
      }
      used++;
      if (bub.text !== b.bubble!.text || bub.brain !== b) {
        bub.text = b.bubble!.text;
        bub.brain = b;
        bub.el.textContent = bub.text;
        bub.el.classList.remove('in');
        void bub.el.offsetWidth;
        bub.el.classList.add('in');
      }
      const scale = clamp(5 / Math.max(1, c.d), 0.55, 1.25);
      const x = (_v2.x * 0.5 + 0.5) * W;
      const y = (-_v2.y * 0.5 + 0.5) * H;
      bub.el.style.display = 'block';
      bub.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
    }
    for (let i = used; i < this.bubbles.length; i++) {
      const bub = this.bubbles[i];
      if (bub.el.style.display !== 'none') bub.el.style.display = 'none';
      bub.brain = null;
    }
  }

  // ------------------------------------------------------------------ remaining-enemy markers
  private updateMarkers(): void {
    const g = this.game;
    const d = g.director;
    let list: Character[] = [];
    if (d.state === 'playing') {
      if (d.mode === 'brawl' && g.ai.brawlStarted && d.remaining() <= 3) list = d.remainingList();
      else if (d.mode === 'survival' && d.waveInProgress && d.waveRemaining() <= 3) list = d.waveRemainingList();
    }
    const cam = g.engine.camera;
    const W = g.engine.width,
      H = g.engine.height;
    let i = 0;
    for (const c of list) {
      let m = this.markers[i];
      if (!m) {
        m = div('marker', this.markerLayer);
        div('marker-arrow', m);
        this.markers.push(m);
      }
      i++;
      c.headPosition(_v);
      _v.y += 0.55;
      _v2.copy(_v).applyMatrix4(cam.matrixWorldInverse);
      const behind = _v2.z > 0;
      _v2.copy(_v).project(cam);
      let x = _v2.x,
        y = _v2.y;
      if (behind) {
        x = -x;
        y = -y;
      }
      const onScreen = !behind && Math.abs(x) < 0.94 && Math.abs(y) < 0.9;
      if (!onScreen) {
        // push to the screen edge along the direction from center
        const k = 1 / Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.86, 1e-3);
        x *= k;
        y *= k;
      }
      const px = (x * 0.5 + 0.5) * W;
      const py = (-y * 0.5 + 0.5) * H;
      m.style.display = 'block';
      m.classList.toggle('edge', !onScreen);
      const ang = Math.atan2(-y, x) * (180 / Math.PI) - 90;
      m.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -50%)`;
      (m.firstElementChild as HTMLElement).style.transform = onScreen ? '' : `rotate(${ang.toFixed(0)}deg)`;
    }
    for (; i < this.markers.length; i++) if (this.markers[i].style.display !== 'none') this.markers[i].style.display = 'none';
  }

  // ------------------------------------------------------------------ screen fx drivers
  /** Feed the post-processing pass. */
  driveScreenFx(realDt: number): void {
    const g = this.game;
    const st = g.post.state;
    const p = g.player;
    if (!p) return;
    const playing = g.state === 'playing' || g.state === 'paused' || g.state === 'over';
    const hpK = clamp(p.health / p.maxHealth, 0, 1);
    const lowTarget = playing && p.alive ? clamp((0.38 - hpK) / 0.3, 0, 1) : playing && !p.alive ? 0.8 : 0;
    st.lowHealth += (lowTarget - st.lowHealth) * Math.min(1, realDt * 3);
    // heartbeat: faster as health drops
    this.heartbeat += realDt * (1.1 + st.lowHealth * 1.4) * Math.PI * 2;
    const hb = Math.sin(this.heartbeat);
    st.pulse = Math.pow(Math.max(0, hb), 6) + 0.6 * Math.pow(Math.max(0, Math.sin(this.heartbeat - 0.9)), 8);
    st.damage = this.damageFlash;
    st.damageDir.copy(this.damageDir);
    const rageT = p.raging ? 1 : 0;
    st.rage += (rageT - st.rage) * Math.min(1, realDt * 4);
    st.drunk += (clamp(p.drunk * 1.2, 0, 1) - st.drunk) * Math.min(1, realDt * 2);
    st.slowMo = g.time.slowness;
    const c = p.ctrl;
    const speedBlur = c.sprinting ? clamp((c.horizSpeed - 5) / 3, 0, 1) * 0.35 : 0;
    const dodge = c.dodgeTimer > 0 ? 1 : 0;
    const rad = Math.max(speedBlur, dodge * 0.9, st.rage * 0.25, st.slowMo * 0.5);
    st.radial += (rad - st.radial) * Math.min(1, realDt * 10);
  }
}
