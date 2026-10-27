/**
 * Right-hand information panel for the selected object, with actions
 * (travel, look at, scan, bookmark) and a scan progress bar. Sections that
 * need a scientific scan are shown greyed out until scanned.
 */
import type { Description } from './describe';

export interface InfoActions {
  goTo: () => void;
  lookAt: () => void;
  scan: () => void;
  bookmark: () => void;
  close: () => void;
  extra?: { label: string; title: string; run: () => void }[];
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class InfoPanel {
  readonly root: HTMLElement;
  private body: HTMLElement;
  private scanBar: HTMLElement;
  private scanFill: HTMLElement;
  private scanLabel: HTMLElement;
  private actions: InfoActions | null = null;
  private lastKey = '';
  visible = true;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'panel info-panel';
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-label', 'Object information');
    this.root.innerHTML = `
      <div class="info-body"></div>
      <div class="scan-bar" hidden><div class="scan-fill"></div><span class="scan-label">Scanning…</span></div>`;
    this.body = this.root.querySelector('.info-body')!;
    this.scanBar = this.root.querySelector('.scan-bar')!;
    this.scanFill = this.root.querySelector('.scan-fill')!;
    this.scanLabel = this.root.querySelector('.scan-label')!;
    this.root.style.display = 'none';
    this.root.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!a || !this.actions) return;
      const act = a.dataset.act!;
      if (act.startsWith('x')) this.actions.extra?.[+act.slice(1)]?.run();
      else (this.actions as unknown as Record<string, () => void>)[act]?.();
    });
    parent.appendChild(this.root);
  }

  hide() {
    this.root.style.display = 'none';
    this.lastKey = '';
  }

  /**
   * Show a description. Rebuilds the DOM only when the content changes
   * (distance strings change continuously, so they're patched in place).
   */
  show(d: Description, actions: InfoActions, scanState: { inRange: boolean; range: string; progress: number | null }) {
    this.actions = actions;
    if (!this.visible) {
      this.root.style.display = 'none';
      return;
    }
    this.root.style.display = '';
    const key = JSON.stringify([d.title, d.subtitle, d.sections.map((s) => [s.title, s.locked, s.rows.length]), scanState.inRange, actions.extra?.map((x) => x.label)]);
    if (key !== this.lastKey) {
      this.lastKey = key;
      const prov = { catalogued: 'Catalogued', procedural: 'Procedural', hypothetical: 'Hypothetical', mixed: 'Catalogued + modelled' }[d.provenance];
      let html = `<div class="info-head">
          <div><div class="info-title">${esc(d.title)}</div><div class="info-sub">${esc(d.subtitle)}</div></div>
          <button class="icon-btn" data-act="close" aria-label="Deselect" title="Deselect">✕</button>
        </div>
        <div class="prov prov-${d.provenance}" title="${esc(d.provenanceNote)}">${prov}</div>
        <div class="info-actions">
          <button data-act="goTo" title="Travel to (G)">Go to</button>
          <button data-act="lookAt" title="Look at (H)">Look</button>
          ${d.needsScan ? `<button data-act="scan" class="${scanState.inRange ? 'primary' : ''}" title="Scientific scan (F7) — range ${esc(scanState.range)}">Scan</button>` : ''}
          <button data-act="bookmark" title="Bookmark this location (F5)">★</button>
          ${(actions.extra ?? []).map((x, i) => `<button data-act="x${i}" title="${esc(x.title)}">${esc(x.label)}</button>`).join('')}
        </div>
        <div class="info-sections">`;
      for (const s of d.sections) {
        html += `<section class="${s.locked ? 'locked' : ''}"><h4>${esc(s.title)}${s.locked ? ' <span class="lock">scan required</span>' : ''}</h4>`;
        if (!s.locked) {
          html += '<dl>';
          for (const [k, v] of s.rows) html += `<dt>${esc(k)}</dt><dd data-k="${esc(k)}">${esc(v)}</dd>`;
          html += '</dl>';
          if (s.text) html += `<p>${esc(s.text)}</p>`;
        }
        html += '</section>';
      }
      html += `</div><div class="info-foot dim">${esc(d.provenanceNote)}</div>`;
      this.body.innerHTML = html;
    } else {
      // patch live values (distance etc.)
      for (const s of d.sections) {
        if (s.locked) continue;
        for (const [k, v] of s.rows) {
          const el = this.body.querySelector(`dd[data-k="${CSS.escape(k)}"]`);
          if (el && el.textContent !== v) el.textContent = v;
        }
      }
    }
    if (scanState.progress !== null) {
      this.scanBar.hidden = false;
      this.scanFill.style.width = `${(scanState.progress * 100).toFixed(1)}%`;
      this.scanLabel.textContent = `Scanning… ${(scanState.progress * 100).toFixed(0)}%`;
    } else this.scanBar.hidden = true;
  }
}
