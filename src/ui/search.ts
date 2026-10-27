/**
 * Search box (F3): bodies of the current system, catalogued stars,
 * galaxies, procedural star designations, discoveries and bookmarks.
 */
export interface SearchResult {
  label: string;
  sub: string;
  kind: string;
  score: number;
  run: (travel: boolean) => void;
}

export type SearchProvider = (q: string) => SearchResult[];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Fuzzy-ish score: prefix > word prefix > substring > subsequence. Lower is better; Infinity = no match. */
export function matchScore(name: string, q: string): number {
  const n = name.toLowerCase(), s = q.toLowerCase().trim();
  if (!s) return Infinity;
  if (n === s) return 0;
  if (n.startsWith(s)) return 1 + n.length * 0.01;
  if (n.split(/[\s\-·]+/).some((w) => w.startsWith(s))) return 2 + n.length * 0.01;
  const i = n.indexOf(s);
  if (i >= 0) return 3 + i * 0.05;
  let j = 0;
  for (const c of n) if (c === s[j]) j++;
  return j === s.length ? 5 + n.length * 0.02 : Infinity;
}

export class SearchBox {
  readonly root: HTMLElement;
  private input: HTMLInputElement;
  private list: HTMLElement;
  private results: SearchResult[] = [];
  private sel = 0;
  isOpen = false;
  onClose: () => void = () => {};

  constructor(parent: HTMLElement, private provider: SearchProvider) {
    this.root = document.createElement('div');
    this.root.className = 'panel search';
    this.root.innerHTML = `<input type="search" placeholder="Search planets, stars, galaxies, designations, bookmarks…" aria-label="Search" spellcheck="false" />
      <div class="search-results" role="listbox"></div>
      <div class="search-hint dim">Enter: select · Shift+Enter: select and travel · Esc: close</div>`;
    this.input = this.root.querySelector('input')!;
    this.list = this.root.querySelector('.search-results')!;
    this.root.style.display = 'none';
    this.input.addEventListener('input', () => this.refresh());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { this.sel = Math.min(this.results.length - 1, this.sel + 1); this.render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { this.sel = Math.max(0, this.sel - 1); this.render(); e.preventDefault(); }
      else if (e.key === 'Enter') { this.choose(this.sel, e.shiftKey); e.preventDefault(); }
      else if (e.key === 'Escape') { this.close(); e.preventDefault(); }
      e.stopPropagation();
    });
    this.list.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null;
      if (el) this.choose(+el.dataset.i!, e.shiftKey);
    });
    parent.appendChild(this.root);
  }

  open() {
    this.isOpen = true;
    this.root.style.display = '';
    this.input.value = '';
    this.results = [];
    this.render();
    setTimeout(() => this.input.focus(), 0);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.style.display = 'none';
    this.input.blur();
    this.onClose();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Run a query programmatically (tests, deep links). */
  query(q: string): SearchResult[] {
    return this.provider(q).sort((a, b) => a.score - b.score).slice(0, 40);
  }

  private refresh() {
    this.results = this.query(this.input.value);
    this.sel = 0;
    this.render();
  }

  private render() {
    this.list.innerHTML = this.results
      .map((r, i) => `<div class="sr${i === this.sel ? ' sel' : ''}" data-i="${i}" role="option" aria-selected="${i === this.sel}">
          <span class="sr-kind k-${esc(r.kind)}">${esc(r.kind)}</span><span class="sr-label">${esc(r.label)}</span><span class="sr-sub dim">${esc(r.sub)}</span></div>`)
      .join('') || (this.input.value ? '<div class="sr dim">No matches</div>' : '');
    this.list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  }

  private choose(i: number, travel: boolean) {
    const r = this.results[i];
    if (!r) return;
    this.close();
    r.run(travel);
  }
}
