/** Discovery catalogue and bookmarks browser (F4). */
import { Modal } from './modal';
import type { Discoveries, Discovery, Bookmark } from '../sim/discoveries';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface CatalogActions {
  visitDiscovery: (d: Discovery) => void;
  visitBookmark: (b: Bookmark) => void;
}

export class CatalogPanel {
  readonly modal: Modal;
  private tab: 'discoveries' | 'bookmarks' = 'discoveries';
  private filter = '';
  private kind = 'all';

  constructor(parent: HTMLElement, private data: Discoveries, private actions: CatalogActions) {
    this.modal = new Modal(parent, 'Catalogue', 'catalog-modal');
    this.modal.header.innerHTML = `<div class="tabs" role="tablist">
        <button role="tab" data-tab="discoveries">Discoveries</button>
        <button role="tab" data-tab="bookmarks">Bookmarks</button></div>`;
    this.modal.header.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
      if (t) { this.tab = t.dataset.tab as 'discoveries' | 'bookmarks'; this.render(); }
    });
    this.modal.onOpen = () => this.render();
    data.onChange = () => { if (this.modal.isOpen) this.render(); };
    this.modal.content.addEventListener('click', (e) => this.onClick(e));
    this.modal.content.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.name === 'filter') { this.filter = el.value; this.renderList(); }
    });
    this.modal.content.addEventListener('change', (e) => {
      const el = e.target as HTMLSelectElement;
      if (el.name === 'kind') { this.kind = el.value; this.renderList(); }
    });
  }

  toggle(tab?: 'discoveries' | 'bookmarks') {
    if (tab) this.tab = tab;
    this.modal.toggle();
  }

  private render() {
    for (const b of this.modal.header.querySelectorAll('[data-tab]')) b.classList.toggle('active', (b as HTMLElement).dataset.tab === this.tab);
    const st = this.data.stats();
    const head = this.tab === 'discoveries'
      ? `<div class="cat-stats">
          <span><b>${st.total}</b> discovered</span><span><b>${st.scanned}</b> scanned</span>
          <span><b>${st.system ?? 0}</b> systems</span><span><b>${(st.planet ?? 0) + (st.moon ?? 0) + (st.dwarf ?? 0)}</b> worlds</span>
          <span><b>${st.life}</b> with life</span><span><b>${st.galaxy ?? 0}</b> galaxies</span></div>
        <div class="cat-filter"><input name="filter" type="search" placeholder="Filter…" value="${esc(this.filter)}" />
          <select name="kind">${['all', 'system', 'star', 'planet', 'moon', 'dwarf', 'small', 'nebula', 'galaxy', 'event', 'life'].map((k) => `<option ${k === this.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></div>`
      : `<div class="cat-stats"><span><b>${this.data.bookmarks.length}</b> bookmarks</span><span class="dim">Press F5 anywhere to bookmark your location.</span></div>`;
    this.modal.content.innerHTML = `${head}<div class="cat-list"></div>`;
    this.renderList();
  }

  private renderList() {
    const list = this.modal.content.querySelector('.cat-list');
    if (!list) return;
    const f = this.filter.toLowerCase();
    if (this.tab === 'bookmarks') {
      const items = this.data.bookmarks.filter((b) => !f || b.name.toLowerCase().includes(f));
      list.innerHTML = items.map((b) => `<div class="cat-item" data-id="${esc(b.id)}">
          ${b.thumb ? `<img src="${b.thumb}" alt="" />` : '<div class="thumb-ph">★</div>'}
          <div class="ci-main"><div class="ci-name">${esc(b.name)}</div><div class="ci-sub dim">${esc(b.place)} · ${new Date(b.created).toLocaleString()}</div></div>
          <div class="ci-act"><button data-bm-go="${esc(b.id)}">Go</button><button data-bm-ren="${esc(b.id)}" title="Rename">✎</button><button data-bm-del="${esc(b.id)}" title="Delete">🗑</button></div></div>`).join('')
        || '<p class="dim">No bookmarks yet.</p>';
      return;
    }
    let items = [...this.data.entries.values()].sort((a, b) => b.firstSeen - a.firstSeen);
    if (this.kind === 'life') items = items.filter((d) => d.life && d.life !== 'none');
    else if (this.kind !== 'all') items = items.filter((d) => d.kind === this.kind);
    if (f) items = items.filter((d) => d.name.toLowerCase().includes(f) || d.subtitle.toLowerCase().includes(f) || d.place.toLowerCase().includes(f));
    list.innerHTML = items.slice(0, 400).map((d) => `<div class="cat-item">
        ${d.thumb ? `<img src="${d.thumb}" alt="" />` : `<div class="thumb-ph">${d.kind === 'galaxy' ? '✺' : d.kind === 'nebula' ? '☁' : d.kind === 'event' ? '✸' : d.kind === 'system' || d.kind === 'star' ? '✷' : '●'}</div>`}
        <div class="ci-main"><div class="ci-name">${esc(d.name)} ${d.scanned ? '<span class="badge ok">scanned</span>' : ''}${d.life && d.life !== 'none' ? `<span class="badge life">${esc(d.life)} life</span>` : ''}</div>
          <div class="ci-sub dim">${esc(d.subtitle)} · ${esc(d.place)}</div>
          <div class="ci-sub dim">${new Date(d.firstSeen).toLocaleString()}</div></div>
        <div class="ci-act">${d.location || d.systemId ? `<button data-d-go="${esc(d.id)}">Go</button>` : ''}</div></div>`).join('')
      || '<p class="dim">Nothing yet. Fly close to stars, planets and galaxies to record them.</p>';
  }

  private onClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    const ds = t.dataset;
    if (ds.dGo) {
      const d = this.data.get(ds.dGo);
      if (d) { this.modal.close(); this.actions.visitDiscovery(d); }
    } else if (ds.bmGo) {
      const b = this.data.bookmarks.find((x) => x.id === ds.bmGo);
      if (b) { this.modal.close(); this.actions.visitBookmark(b); }
    } else if (ds.bmDel) {
      this.data.removeBookmark(ds.bmDel);
    } else if (ds.bmRen) {
      const b = this.data.bookmarks.find((x) => x.id === ds.bmRen);
      const name = b && window.prompt('Bookmark name', b.name);
      if (b && name) this.data.renameBookmark(b.id, name);
    }
  }
}
