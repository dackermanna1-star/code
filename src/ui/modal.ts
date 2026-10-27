/** Centered modal panel with a title bar; only one is open at a time. */
const open: Modal[] = [];

export class Modal {
  readonly root: HTMLElement;
  readonly content: HTMLElement;
  readonly header: HTMLElement;
  onOpen: () => void = () => {};
  onClose: () => void = () => {};

  constructor(parent: HTMLElement, title: string, cls = '') {
    this.root = document.createElement('div');
    this.root.className = `modal-wrap ${cls}`;
    this.root.innerHTML = `<div class="panel modal" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="modal-head"><h2>${title}</h2><div class="modal-tools"></div><button class="icon-btn" data-close aria-label="Close">✕</button></div>
        <div class="modal-content"></div></div>`;
    this.content = this.root.querySelector('.modal-content')!;
    this.header = this.root.querySelector('.modal-tools')!;
    this.root.querySelector('[data-close]')!.addEventListener('click', () => this.close());
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.close();
    });
    this.root.style.display = 'none';
    parent.appendChild(this.root);
  }

  get isOpen() {
    return open.includes(this);
  }

  open() {
    if (this.isOpen) return;
    for (const m of [...open]) m.close();
    open.push(this);
    this.root.style.display = '';
    this.onOpen();
  }

  close() {
    const i = open.indexOf(this);
    if (i < 0) return;
    open.splice(i, 1);
    this.root.style.display = 'none';
    this.onClose();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  static anyOpen() {
    return open.length > 0;
  }

  static closeTop(): boolean {
    const m = open[open.length - 1];
    if (!m) return false;
    m.close();
    return true;
  }
}
