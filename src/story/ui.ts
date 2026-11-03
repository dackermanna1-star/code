import * as THREE from 'three';
import './story.css';

const el = (tag: string, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

/** Who's talking: the name's colour on the subtitles. */
const VOICE: Record<string, string> = {
  SCARLET: '#ff5a6a',
  IVY: '#8fd4ff',
  DOYLE: '#ffb35a',
  'THE BUTCHER': '#ff4a30',
  BUTCHER: '#ff4a30',
};
export interface PhoneMsg {
  /** in: from the contact; out: hers. */
  dir: 'in' | 'out';
  text: string;
  time?: string;
  /** Under her last message: 'Delivered', 'Read 10:58 PM', 'Not delivered'. */
  status?: string;
  fail?: boolean;
}

const GUN = '<svg viewBox="0 0 64 40"><path fill="currentColor" d="M2 8h34v-3h6v3h20v9H40l-2 3h-6l-3 14H18l4-14h-6l-2-3H2zM22 22h5l-1 5h-5z"/><rect x="44" y="9" width="18" height="7" fill="#1a0a0c" opacity=".35"/></svg>';

/**
 * The story's own layer over the game: letterbox bars and subtitles for scenes, the phone the
 * prologue opens on, the chapter's card, the objective and its marker in the world, tutorial
 * prompts, the hold-to-skip ring, a black fade.
 */
export class StoryUI {
  root = el('div');
  private barsEl = el('div', 'bars', '<i></i><i></i>');
  private subEl = el('div', 'sub');
  private phoneEl = el('div', 'phone');
  private phoneLog = el('div', 'ph-log');
  private phoneName = el('b');
  private phoneSub = el('small');
  private phoneAv = el('div', 'av');
  private phoneClock = el('div', 'ph-clock');
  private phoneIn = el('div', 'ph-in', '<span></span><i></i>');
  private cardEl = el('div', 'card');
  private stampEl = el('div', 'stamp');
  private objEl = el('div', 'obj');
  private markEl = el('div', 'mark', '<i></i><span></span>');
  private tutEl = el('div', 'tut');
  private skipEl = el('div', 'skip', '<span class="ring"></span><span>HOLD</span><kbd>SPACE</kbd><span>SKIP</span>');
  private itemEl = el('div', 'item');
  private fadeEl = el('div', 'fade');
  /** A note read on screen (a page, a photo's back), and the journal of everything found. */
  private readEl = el('div', 'read');
  private journalEl = el('div', 'journal');
  private subT = 0;
  private stampT = 0;
  private itemT = 0;
  private markAt: THREE.Vector3 | null = null;
  private markLabel = '';
  private objText = '';

  constructor() {
    this.root.id = 'story';
    const top = el('div', 'ph-top');
    const who = el('div');
    who.append(this.phoneName, this.phoneSub);
    top.append(this.phoneAv, who);
    this.phoneEl.append(el('div', 'ph-notch'), this.phoneClock, el('div', 'ph-batt'), top, this.phoneLog, this.phoneIn);
    // (the black goes over the world and the HUD; lines, the phone and the card play on top of it)
    this.root.append(this.barsEl, this.stampEl, this.objEl, this.markEl, this.tutEl, this.itemEl, this.fadeEl, this.subEl, this.skipEl, this.phoneEl, this.cardEl, this.readEl, this.journalEl);
    document.body.append(this.root);
  }

  // ------------------------------------------------------------------ scenes
  bars(on: boolean) {
    this.barsEl.classList.toggle('on', on);
    this.subEl.classList.toggle('low', !on);
  }
  /** A line on screen for `dur` s (a bark is smaller and doesn't need the bars). */
  say(who: string, text: string, dur: number, bark = false) {
    const c = VOICE[who] ?? '#d8cfc2';
    this.subEl.innerHTML = `${who ? `<span class="who" style="color:${c}">${who}</span>` : ''}<span class="line">${text}</span>`;
    this.subEl.classList.toggle('bark', bark);
    this.subEl.classList.add('on');
    this.subT = dur;
  }
  clearSay() {
    this.subEl.classList.remove('on');
    this.subT = 0;
  }
  skip(show: boolean, p = 0) {
    this.skipEl.classList.toggle('on', show);
    this.skipEl.style.setProperty('--p', String(p));
  }
  fade(on: boolean, dur = 0.8) {
    this.fadeEl.style.setProperty('--fd', `${dur}s`);
    this.fadeEl.classList.toggle('on', on);
  }

  // ------------------------------------------------------------------ the phone
  phoneOpen(contact: string, initial: string, sub: string, clock: string) {
    this.phoneLog.innerHTML = '';
    this.phoneInput('');
    this.phoneName.textContent = contact;
    this.phoneSub.textContent = sub;
    this.phoneAv.textContent = initial;
    this.phoneClock.textContent = clock;
    this.phoneEl.classList.add('on');
  }
  /** The phone calling someone: their initial big in the middle, the name, 'calling…'. */
  phoneCall(contact: string, initial: string, status: string, clock: string) {
    this.phoneOpen(contact, initial, '', clock);
    this.phoneLog.innerHTML = `<div class="call"><i>${initial}</i><b>${contact}</b><span>${status}</span></div>`;
  }
  /** What she's typing in the bar. */
  phoneInput(text: string) {
    (this.phoneIn.firstElementChild as HTMLElement).textContent = text;
  }
  phoneClockSet(t: string) {
    this.phoneClock.textContent = t;
  }
  phoneDay(text: string) {
    this.phoneLog.append(el('div', 'day', text));
  }
  phoneTyping(on: boolean) {
    this.phoneLog.querySelector('.typing')?.remove();
    if (on) this.phoneLog.append(el('div', 'typing', '<i></i><i></i><i></i>'));
  }
  phoneMsg(m: PhoneMsg) {
    this.phoneTyping(false);
    const old = this.phoneLog.querySelector('.ts.st');
    if (old) old.remove();
    if (m.time) this.phoneLog.append(el('div', `ts ${m.dir === 'out' ? 'r' : 'l'}`, m.time));
    const b = el('div', `msg ${m.dir}${m.fail ? ' fail' : ''}`);
    b.textContent = m.text;
    this.phoneLog.append(b);
    if (m.status) this.phoneLog.append(el('div', `ts r st${m.fail ? ' warn' : ''}`, m.status));
    // (the oldest scroll off the top)
    while (this.phoneLog.children.length > 26) this.phoneLog.firstElementChild?.remove();
    if (m.dir === 'in') {
      this.phoneEl.classList.remove('shake');
      void this.phoneEl.offsetWidth;
      this.phoneEl.classList.add('shake');
    }
  }
  phoneClose() {
    this.phoneEl.classList.remove('on');
  }

  // ------------------------------------------------------------------ the chapter's card
  card(kick: string, title: string, place: string, clock: string, gate = '') {
    const [h, m] = clock.split(':');
    const cl = m !== undefined ? `${h}<s>:</s>${m}` : clock;
    this.cardEl.innerHTML = `<div class="ck">${kick}</div><div class="ct">${title}</div><div class="cr"></div><div class="cp">${place}</div><div class="cc">${cl}</div><div class="gate">${gate}</div>`;
    this.cardEl.classList.remove('on');
    void this.cardEl.offsetWidth;
    this.cardEl.classList.add('on');
  }
  cardGate(text: string) {
    const g = this.cardEl.querySelector('.gate');
    if (!g) return;
    g.textContent = text;
    g.classList.toggle('on', !!text);
  }
  cardHide() {
    this.cardEl.classList.remove('on');
  }
  stamp(place: string, clock: string, dur = 5) {
    this.stampEl.innerHTML = `<b>${place}</b><span>${clock}</span>`;
    this.stampEl.classList.add('on');
    this.stampT = dur;
  }

  // ------------------------------------------------------------------ objective, marker, tutorial
  get objectiveText() {
    return this.objText;
  }
  objective(text: string | null, sub = '') {
    if (!text) {
      this.objEl.classList.remove('on');
      this.objText = '';
      return;
    }
    const changed = text !== this.objText;
    this.objText = text;
    this.objEl.innerHTML = `<small>OBJECTIVE</small><b>${text}</b>${sub ? `<em>${sub}</em>` : ''}`;
    this.objEl.classList.add('on');
    if (changed) {
      this.objEl.classList.remove('new');
      void this.objEl.offsetWidth;
      this.objEl.classList.add('new');
    }
  }
  objectiveVisible(on: boolean) {
    this.objEl.style.visibility = on ? '' : 'hidden';
  }
  /** Where the objective's marker stands (null: none). */
  get markerAt() {
    return this.markAt;
  }
  marker(at: THREE.Vector3 | null, label = '') {
    this.markAt = at ? at.clone() : null;
    this.markLabel = label;
    this.markEl.classList.toggle('on', !!at);
  }
  /** Keys (as shown on their caps), what they do, a line under it, and n of m done. */
  tutor(keys: string[], text: string, sub = '', progress?: [number, number]) {
    const pr = progress ? `<div class="pr">${Array.from({ length: progress[1] }, (_, i) => `<i class="${i < progress[0] ? 'on' : ''}"></i>`).join('')}</div>` : '';
    this.tutEl.innerHTML = `<div class="keys">${keys.map((k) => `<kbd>${k}</kbd>`).join('')}</div><div class="tx">${text}${sub ? `<small>${sub}</small>` : ''}</div>${pr}`;
    this.tutEl.classList.remove('done');
    this.tutEl.classList.add('on');
  }
  tutorDone() {
    this.tutEl.classList.add('done');
  }
  tutorHide() {
    this.tutEl.classList.remove('on');
  }
  item(kick: string, name: string, desc: string, dur = 4.5) {
    this.itemEl.innerHTML = `${GUN}<div><small>${kick}</small><b>${name}</b><span>${desc}</span></div>`;
    this.itemEl.classList.add('on');
    this.itemT = dur;
  }

  // ------------------------------------------------------------------ notes and the journal
  /** A note, read: its title, its text (paper on screen); closes with E, ESC or SPACE. */
  read(kind: string, title: string, text: string) {
    const close = '<div class="rk"><kbd>E</kbd> CLOSE</div>';
    this.readEl.className = 'read on ' + kind;
    this.readEl.innerHTML = `<div class="paper"><small>${kind === 'photo' ? 'PHOTOGRAPH' : kind === 'evidence' ? 'EVIDENCE' : 'NOTE'}</small><h3>${title}</h3><p>${text.replace(/\n/g, '<br>')}</p></div>${close}`;
  }
  readClose() {
    this.readEl.classList.remove('on');
  }
  get reading() {
    return this.readEl.classList.contains('on');
  }
  /** The journal (TAB): the chapter's objective, and everything found so far, newest first. */
  journal(open: boolean, o: { objective: string; chapter: string; entries: { title: string; text: string; kind: string; chapter: string }[]; found: number; total: number } | null = null) {
    this.journalEl.classList.toggle('on', open);
    if (!open || !o) return;
    const list = o.entries.length
      ? o.entries.map((e) => `<div class="je"><small>${e.chapter} · ${e.kind.toUpperCase()}</small><b>${e.title}</b><p>${e.text.replace(/\n/g, '<br>')}</p></div>`).join('')
      : '<div class="je none">Nothing yet. Look around: notes, photographs, things people leave behind.</div>';
    this.journalEl.innerHTML = `<div class="jbox"><div class="jh"><small>JOURNAL</small><b>${o.chapter}</b><span>FOUND ${o.found} / ${o.total} THIS CHAPTER</span></div><div class="jo"><small>NOW</small>${o.objective || '—'}</div><div class="jl">${list}</div><div class="rk"><kbd>TAB</kbd> CLOSE</div></div>`;
  }
  get journalOpen() {
    return this.journalEl.classList.contains('on');
  }

  /** Everything passing (a line, a card, a stamp, a prompt): gone. */
  clearTransient() {
    this.clearSay();
    this.itemT = this.stampT = 0;
    this.itemEl.classList.remove('on');
    this.stampEl.classList.remove('on');
    this.tutorHide();
    this.marker(null);
    this.objective(null);
  }

  /** In a scene (or a menu) the game's furniture steps aside. */
  gameplayVisible(on: boolean) {
    this.objEl.style.display = on ? '' : 'none';
    this.markEl.style.display = on ? '' : 'none';
    this.tutEl.style.display = on ? '' : 'none';
  }

  update(realDt: number, cam: THREE.Camera, player: THREE.Vector3) {
    if (this.subT > 0 && (this.subT -= realDt) <= 0) this.subEl.classList.remove('on');
    if (this.stampT > 0 && (this.stampT -= realDt) <= 0) this.stampEl.classList.remove('on');
    if (this.itemT > 0 && (this.itemT -= realDt) <= 0) this.itemEl.classList.remove('on');
    const at = this.markAt;
    if (at) {
      const v = _v.copy(at).project(cam);
      const W = window.innerWidth, H = window.innerHeight;
      let x = v.x, y = v.y;
      const behind = v.z > 1;
      if (behind) {
        x = -x;
        y = -y;
      }
      const edge = behind || Math.abs(x) > 0.92 || Math.abs(y) > 0.85;
      if (edge) {
        const a = Math.atan2(y, x);
        x = Math.cos(a) * 0.9;
        y = Math.sin(a) * 0.8;
      }
      this.markEl.style.left = `${((x + 1) / 2) * W}px`;
      this.markEl.style.top = `${((1 - y) / 2) * H}px`;
      this.markEl.classList.toggle('edge', edge);
      const d = Math.hypot(at.x - player.x, at.z - player.z);
      const span = this.markEl.lastElementChild as HTMLElement;
      const txt = `${this.markLabel ? this.markLabel + ' · ' : ''}${Math.round(d)} M`;
      if (span.textContent !== txt) span.textContent = txt;
    }
  }
}

const _v = new THREE.Vector3();
