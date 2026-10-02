/**
 * UI manager: HUD + modal screens. Screens release pointer lock and disable game input.
 */
import './style.css';
import type { Game } from '../game/game';
import { Hud } from './hud';

export interface Screen {
  el: HTMLElement;
  /** Pauses the game while open (single player menus). */
  pauses?: boolean;
  /** Keep the HUD visible underneath. */
  showHud?: boolean;
  onOpen?(): void;
  onClose?(): void;
  update?(dt: number): void;
  /** Return true if the key was consumed. */
  onKey?(code: string, down: boolean, e: KeyboardEvent): boolean;
}

export class UI {
  readonly root: HTMLElement;
  readonly hud: Hud;
  private stack: Screen[] = [];
  game: Game | null = null;
  hudHidden = false;
  /** Called to (re)open the main menu (set by main.ts). */
  onMainMenu: (() => void) | null = null;
  /** Factory for the pause screen (set by main.ts menus module). */
  pauseFactory: ((ui: UI) => Screen) | null = null;
  inventoryFactory: ((ui: UI) => Screen | null) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.hud = new Hud(this);
    root.appendChild(this.hud.el);
    this.hud.el.classList.add('hidden');
  }

  attach(game: Game) {
    this.game = game;
    game.ui = this;
    this.hud.attach(game);
    game.input.onKey = (code, down, e) => this.handleKey(code, down, e);
    game.canvas.addEventListener('click', () => {
      if (!this.top && !game.loading) game.input.requestLock();
    });
    document.addEventListener('pointerlockchange', () => {
      // lost pointer lock while playing -> pause menu (like Minecraft)
      if (!document.pointerLockElement && !this.top && this.game && !this.game.loading && this.game.running && this.pauseFactory && !this.game.player.dead) {
        this.open(this.pauseFactory(this));
      }
    });
  }

  get top(): Screen | null {
    return this.stack.length ? this.stack[this.stack.length - 1] : null;
  }

  open(s: Screen) {
    this.root.appendChild(s.el);
    this.stack.push(s);
    s.onOpen?.();
    this.sync();
  }

  close(s?: Screen) {
    const t = s ?? this.top;
    if (!t) return;
    const i = this.stack.indexOf(t);
    if (i < 0) return;
    this.stack.splice(i, 1);
    t.el.remove();
    t.onClose?.();
    this.sync();
  }

  closeAll() {
    while (this.stack.length) this.close();
  }

  private sync() {
    const g = this.game;
    const t = this.top;
    if (g) {
      g.input.enabled = !t;
      g.paused = !!t && !!t.pauses;
      if (t) {
        g.input.exitLock();
        g.input.releaseAll();
      }
    }
    this.hud.el.classList.toggle('hidden', !g || (!!t && !t.showHud) || this.hudHidden);
  }

  /** Resume play (re-lock pointer). */
  resume() {
    this.closeAll();
    this.game?.input.requestLock();
  }

  private handleKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    const t = this.top;
    if (t) {
      if (t.onKey?.(code, down, e)) return true;
      if (down && code === 'Escape') {
        this.close();
        if (!this.top) this.game?.input.requestLock();
        return true;
      }
      return true; // screens swallow keys
    }
    const g = this.game;
    if (!g || g.loading) return false;
    if (down && code === g.input.bindings.inventory && this.inventoryFactory) {
      const s = this.inventoryFactory(this);
      if (s) { this.open(s); return true; }
    }
    if (down && code === g.input.bindings.hideHud) {
      this.hudHidden = !this.hudHidden;
      this.sync();
      return true;
    }
    if (down && code === g.input.bindings.debug) {
      this.hud.toggleDebug();
      return true;
    }
    if (down && code === g.input.bindings.chat && (this as any).chatFactory) {
      this.open((this as any).chatFactory(this, ''));
      return true;
    }
    if (down && code === g.input.bindings.command && (this as any).chatFactory) {
      this.open((this as any).chatFactory(this, '/'));
      e.preventDefault();
      return true;
    }
    return false;
  }

  update(dt: number) {
    this.top?.update?.(dt);
    this.hud.update(dt);
  }
}

/** Tiny DOM helper */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...children: (Node | string | null | undefined)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
