// Gentle first-session onboarding: a short list of objectives that advance
// as you naturally do things. Never blocks anything.
import { G } from '../game.js';
import { el } from '../core/utils.js';

const STEPS = [
  { text: 'Welcome home! Look around (mouse) and walk with WASD.', done: (s) => s.moved },
  { text: 'There\'s a welcome package at your door. Open the front door with E.', ev: 'frontDoor' },
  { text: 'Grab the package (E) and open it — left-click while holding, or E on it.', act: 'unbox' },
  { text: 'Press Tab to open your phone.', ev: 'phone' },
  { text: 'Order something to eat from GrubHop.', act: 'order' },
  { text: 'Deliveries take a few minutes. Explore meanwhile — try the coffee machine, TV or fridge!', ev: 'delivered' },
  { text: 'Your food is at the door! Pick it up, open it, then left-click to eat.', act: 'eat' },
  { text: 'You\'re all settled in. Check the Goals app for daily challenges. Enjoy!', timeout: 10 },
];

export class Tutorial {
  constructor() {
    this.s = (G.state.tutorial ||= { step: 0, done: false });
    this.el = el('div', { id: 'objective', class: 'hidden' }, el('div', { class: 'ob-k' }, 'GETTING STARTED'), el('div', { class: 'ob-t' }));
    document.getElementById('ui').appendChild(this.el);
    const adv = (key) => { const st = STEPS[this.s.step]; if (!this.s.done && st && (st.ev === key || st.act === key)) this.next(); };
    G.events.on('frontDoor', (open) => open && adv('frontDoor'));
    G.events.on('phone', (open) => open && adv('phone'));
    G.events.on('delivered', () => adv('delivered'));
    G.events.on('act', (type) => adv(type));
    this.t = 0;
    if (!this.s.done && this.s.step > 0) this.show();
  }
  begin() { this.s.step = 0; this.s.done = false; this.show(); }
  show() {
    const st = STEPS[this.s.step];
    if (!st) { this.finish(); return; }
    this.el.querySelector('.ob-t').textContent = st.text;
    this.el.classList.remove('hidden');
    this.el.classList.remove('pop'); void this.el.offsetWidth; this.el.classList.add('pop');
    this.t = 0;
  }
  next() {
    G.audio.play('success');
    this.s.step++;
    if (this.s.step >= STEPS.length) this.finish(); else this.show();
  }
  finish() { this.s.done = true; this.el.classList.add('hidden'); }
  update(dt) {
    if (this.s.done) return;
    const st = STEPS[this.s.step];
    if (!st) return;
    this.t += dt;
    if (st.done && st.done({ moved: G.player.pos.distanceTo(this._start ||= G.player.pos.clone()) > 1.5 })) this.next();
    else if (st.timeout && this.t > st.timeout) this.next();
  }
}
