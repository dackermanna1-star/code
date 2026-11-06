// Tabbed frame hosting the in-game panels (inventory, crafting, health, skills, map).
import { h, setClass } from '../dom.js';
import { InventoryPanel } from './InventoryPanel.js';
import { CraftingPanel } from './CraftingPanel.js';
import { HealthPanel } from './HealthPanel.js';
import { SkillsPanel } from './SkillsPanel.js';
import { MapPanel } from './MapPanel.js';

export const PANEL_TABS = [
  { id: 'inventory', label: 'Inventory', key: 'Tab' },
  { id: 'crafting', label: 'Crafting', key: 'X' },
  { id: 'health', label: 'Health', key: 'H' },
  { id: 'skills', label: 'Character', key: 'K' },
  { id: 'map', label: 'Map', key: 'M' },
];

export class PanelHost {
  constructor(ui) {
    this.ui = ui;
    this.current = null;
    this.panels = {
      inventory: new InventoryPanel(ui),
      crafting: new CraftingPanel(ui),
      health: new HealthPanel(ui),
      skills: new SkillsPanel(ui),
      map: new MapPanel(ui),
    };
    this.tabs = {};
    const tabBar = h('div.frame-tabs');
    for (const t of PANEL_TABS) {
      const b = h('button.frame-tab', { type: 'button' }, h('span.ft-label', t.label), h('span.key.sm', t.key));
      b.addEventListener('click', () => { if (this.current !== t.id) { this.ui.sound('ui_click'); this.open(t.id); } });
      b.addEventListener('pointerenter', () => this.ui.sound('ui_hover', 0.2));
      this.tabs[t.id] = b;
      tabBar.appendChild(b);
    }
    const close = h('button.frame-close', { type: 'button', title: 'Close (Esc)' }, h('span', 'Close'), h('span.key.sm', 'Esc'));
    close.addEventListener('click', () => this.ui.closeAll());
    tabBar.appendChild(h('div.ft-spacer'));
    tabBar.appendChild(close);
    this.body = h('div.frame-body');
    this.frame = h('div.frame', tabBar, this.body);
    this.el = h('div.screen.hidden', this.frame);
    // click on the dim backdrop closes (but not while dragging items: inventory handles drops itself)
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el && this.current !== 'inventory') this.ui.closeAll();
    });
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get isOpen() { return !!this.current; }

  open(id, arg) {
    const p = this.panels[id];
    if (!p) return;
    const wasOpen = !!this.current;
    if (this.current && this.current !== id) {
      this.panels[this.current].onHide?.();
      this.body.removeChild(this.panels[this.current].el);
    }
    const same = this.current === id;
    this.current = id;
    if (!same) this.body.appendChild(p.el);
    for (const [tid, b] of Object.entries(this.tabs)) setClass(b, 'on', tid === id);
    setClass(this.el, 'hidden', false);
    this.el.dataset.panel = id;
    if (!wasOpen) {
      this.frame.getAnimations?.().forEach((a) => a.cancel());
      this.frame.animate?.([{ opacity: 0, transform: 'translateY(6px) scale(0.99)' }, { opacity: 1, transform: 'none' }],
        { duration: 140, easing: 'ease-out' });
    }
    p.onShow?.(arg);
  }

  close() {
    if (!this.current) return;
    const p = this.panels[this.current];
    p.onHide?.();
    this.body.removeChild(p.el);
    this.current = null;
    setClass(this.el, 'hidden', true);
  }

  update(dt) {
    if (this.current) this.panels[this.current].update?.(dt);
  }

  refresh() {
    if (this.current) this.panels[this.current].refresh?.();
  }

  handleKey(e) {
    if (this.current) return this.panels[this.current].handleKey?.(e) || false;
    return false;
  }

  onResize() {
    for (const p of Object.values(this.panels)) p.onResize?.();
  }
}
