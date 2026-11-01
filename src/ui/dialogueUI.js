// Conversation panel + small pick-lists (vending, job board). Keyboard (1-8, arrows+Enter/E),
// mouse and gamepad (D-pad + A) all work; moving away closes conversations naturally.
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export class DialogueUI {
  constructor(game, root) {
    this.game = game;
    this.panel = el('div', 'dlg ui-interactive');
    root.appendChild(this.panel);
    this.sel = 0;
    this.list = null; // {title, items:[{label, fn, disabled, tag}], onClose}
  }
  get d() { return this.game.sim.dialogue; }
  openList(title, items, sub = '') { this.list = { title, items, sub }; this.sel = 0; this.render(); }
  closeList() { this.list = null; this.render(); }
  get open() { return this.d.active || !!this.list; }
  update() {
    const input = this.game.input;
    if (!this.open) { if (this.panel.classList.contains('show')) this.render(); return; }
    const opts = this.list ? this.list.items : this.d.options;
    for (let i = 0; i < 8; i++) if (input.consume(`choice${i + 1}`, 0.2)) { this.pick(i); return; }
    if (input.consume('menuUp', 0.2)) { this.sel = (this.sel + opts.length - 1) % opts.length; this.render(); }
    if (input.consume('menuDown', 0.2)) { this.sel = (this.sel + 1) % opts.length; this.render(); }
    if (input.consume('confirm', 0.2) && (this.list || this.d.age > 0.3)) this.pick(this.sel);
    if (input.consume('back_ui', 0.2)) { if (this.list) this.closeList(); else this.d.close('bye'); }
    if (this.d.active && this.lastRender !== this.d.lines.length + ':' + this.d.options.length + this.d.mode) this.render();
  }
  pick(i) {
    const opts = this.list ? this.list.items : this.d.options;
    const o = opts[i];
    if (!o || o.disabled) { this.game.audio?.ui('bad'); return; }
    this.game.audio?.ui('click');
    if (this.list) { const keep = o.fn(); if (!keep) this.closeList(); else this.render(); return; }
    this.d.choose(i);
    this.sel = 0;
    this.render();
  }
  render() {
    const d = this.d;
    const show = this.open;
    this.panel.classList.toggle('show', show);
    if (!show) { this.panel.innerHTML = ''; return; }
    if (this.list) {
      this.panel.innerHTML = `<div class="dlg-head"><div class="dlg-name">${this.list.title}</div><div class="dlg-sub">${this.list.sub || ''}</div></div>
        <ol class="dlg-opts">${this.list.items.map((o, i) => `<li class="${i === this.sel ? 'sel' : ''}${o.disabled ? ' dis' : ''}" data-i="${i}"><kbd>${i + 1}</kbd><span>${o.label}</span>${o.tag ? `<em>${o.tag}</em>` : ''}</li>`).join('')}</ol>
        <div class="dlg-foot"><kbd>Esc</kbd> close</div>`;
    } else {
      const npc = d.npc, p = d.player;
      const op = this.game.sim.social.opinionOf(npc, p);
      const crew = npc.def.crew ? this.game.crews[npc.def.crew] : null;
      const role = npc.kind === 'guard' ? 'Corrections Officer' : npc.kind === 'staff' ? npc.def.role === 'warden' ? 'Warden' : 'Infirmary' : `${npc.app.idNumber} · ${npc.def.crime || ''}`;
      this.panel.innerHTML = `<div class="dlg-head"><div class="dlg-name">${npc.name}${crew ? `<span class="crewtag" style="--c:${crew.color}">${crew.name}</span>` : ''}</div>
        <div class="dlg-sub">${role}</div>
        <div class="opmeter"><span style="left:${50 + op / 2}%"></span><b>${op > 40 ? 'Friendly' : op > 10 ? 'Warm' : op > -10 ? 'Neutral' : op > -40 ? 'Cold' : 'Hostile'}</b></div></div>
        <div class="dlg-log">${d.lines.slice(-4).map((l) => `<p class="${l.player ? 'me' : 'them'} ${l.mood}"><b>${l.who}:</b> ${l.text}</p>`).join('')}</div>
        <ol class="dlg-opts">${d.options.map((o, i) => `<li class="${i === this.sel ? 'sel' : ''}${o.disabled ? ' dis' : ''} ${o.tag || ''}" data-i="${i}"><kbd>${i + 1}</kbd><span>${o.label}</span>${o.tag ? `<em>${o.tag}</em>` : ''}</li>`).join('')}</ol>
        <div class="dlg-foot">Walk away to leave · <kbd>Esc</kbd></div>`;
      this.lastRender = d.lines.length + ':' + d.options.length + d.mode;
    }
    this.panel.querySelectorAll('li').forEach((li) => li.addEventListener('click', (e) => { e.stopPropagation(); this.pick(+li.dataset.i); }));
    this.panel.querySelectorAll('li').forEach((li) => li.addEventListener('mouseenter', () => { this.sel = +li.dataset.i; this.panel.querySelectorAll('li').forEach((x) => x.classList.toggle('sel', x === li)); }));
  }
}
