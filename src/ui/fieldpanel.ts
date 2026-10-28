/**
 * Field instruments panel (left side): live local measurements while on a
 * surface — position, gravity, air, ground, fields, radiation, seismicity,
 * life detection and subsurface findings.
 */
import type { FieldReadout } from '../sim/fieldsurvey';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class FieldPanel {
  readonly root: HTMLElement;
  open = false;
  private last = '';

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'panel field-panel';
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-label', 'Field instruments');
    this.root.style.display = 'none';
    parent.appendChild(this.root);
  }

  toggle() {
    this.open = !this.open;
    if (!this.open) this.hide();
    return this.open;
  }

  hide() {
    this.root.style.display = 'none';
    this.last = '';
  }

  show(r: FieldReadout) {
    this.root.style.display = '';
    const html = `<div class="info-title">${esc(r.title)}</div><dl>${r.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl><div class="dim">F7 to close</div>`;
    if (html !== this.last) {
      this.last = html;
      this.root.innerHTML = html;
    }
  }
}
