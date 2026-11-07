// =============================================================================
// PA ANNOUNCEMENTS. 'cabin:announce' {id} -> queue -> handset key click ->
// chime (per announcement) -> pre-rendered neural-TTS voice
// (assets/audio/announcements/<id>.ogg, see tools/gen_announcements.py) through
// the PA bus -> unkey. Emits 'cabin:announcement' {id, speaker, speakerName,
// text, duration, sentences} when the voice starts and 'cabin:announcementEnd'
// {id} when it ends. Falls back to window.speechSynthesis when the file is
// missing / undecodable. The state machine runs on wall-clock time (app.time)
// so the director is released even while the AudioContext is still locked.
// =============================================================================
import { ANNOUNCEMENTS, SPEAKERS } from '../flight/announcements.js';

const BASE = 'assets/audio/announcements/';
// chime -> [foley name, seconds from key-up to voice start]
const CHIMES = { pa: ['chime_pa', 2.05], seatbelt: ['chime_seatbelt', 1.55], triple: ['chime_triple', 2.6], none: [null, 0.4] };

export class Announcer {
  /** host: { app, ctx, paVoice (AudioNode), playPa(name, when), events } */
  constructor(host) {
    this.h = host;
    this.app = host.app;
    this.index = {};
    this.buffers = new Map();     // id -> Promise<AudioBuffer|null>
    this.queue = [];
    this.cur = null;
    this._ready = this._loadIndex();
  }

  async _loadIndex() {
    try {
      const r = await fetch(BASE + 'index.json');
      if (r.ok) this.index = await r.json();
    } catch { this.index = {}; }
  }

  /** Decode (and cache) the announcement buffer. Never throws. */
  load(id) {
    if (this.buffers.has(id)) return this.buffers.get(id);
    const p = (async () => {
      try {
        const r = await fetch(BASE + id + '.ogg');
        if (!r.ok) return null;
        const data = await r.arrayBuffer();
        return await new Promise((res) => {
          try {
            const pr = this.h.ctx.decodeAudioData(data, (b) => res(b), () => res(null));
            if (pr && pr.catch) pr.catch(() => res(null));
          } catch { res(null); }
        });
      } catch { return null; }
    })();
    this.buffers.set(id, p);
    return p;
  }

  /** Prefetch everything in the background (after unlock). */
  prefetchAll() {
    let i = 0;
    const ids = Object.keys(ANNOUNCEMENTS);
    const next = () => { if (i >= ids.length) return; this.load(ids[i++]).then(() => setTimeout(next, 120)); };
    next();
  }

  request(id) {
    if (!ANNOUNCEMENTS[id]) return false;
    if (this.cur?.id === id || this.queue.includes(id)) return false;
    this.queue.push(id);
    this.load(id);
    return true;
  }

  get active() { return !!this.cur; }
  get speaking() { return !!this.cur && this.cur.stage === 'voice'; }

  cancel() {
    this.queue.length = 0;
    if (this.cur) this._finish(true);
  }

  update() {
    const now = this.app.time;
    if (!this.cur && this.queue.length) this._start(this.queue.shift(), now);
    const c = this.cur;
    if (!c) return;
    if (c.stage === 'chime' && now >= c.tVoice) {
      if (c.buffer === undefined && now < c.tVoice + 4) return;   // still decoding: wait a little
      this._voice(now);
    } else if (c.stage === 'voice' && now >= c.tEnd) {
      this._finish(false);
    }
  }

  _start(id, now) {
    const a = ANNOUNCEMENTS[id];
    const enabled = this.app.settings.get('announcements') !== false;
    if (!enabled) { this.app.events.emit('cabin:announcementEnd', { id, skipped: true }); return; }
    const [chime, lead] = CHIMES[a.chime] || CHIMES.none;
    const c = this.cur = { id, a, stage: 'chime', tVoice: now + lead + 0.15, tEnd: 0, src: null, buffer: undefined, utter: null };
    this.load(id).then((b) => { if (this.cur === c) c.buffer = b; });
    const running = this.h.ctx.state === 'running';
    if (running) {
      this.h.playPa('mic_key', 0, 0.9);
      if (chime) this.h.playPa(chime, 0.15);
    }
  }

  _voice(now) {
    const c = this.cur, a = c.a, ctx = this.h.ctx;
    const meta = this.index[c.id];
    let duration;
    c.stage = 'voice';
    if (c.buffer) {
      duration = c.buffer.duration;
      if (ctx.state === 'running') {
        const s = ctx.createBufferSource();
        s.buffer = c.buffer;
        s.connect(this.h.paVoice);
        s.start();
        c.src = s;
      }
    } else {
      duration = this._speak(a.text, a.speaker, c);
    }
    c.tEnd = now + duration + 0.05;
    const sentences = meta?.sentences || estimateSentences(a.text, duration);
    const payload = { id: c.id, speaker: a.speaker, speakerName: SPEAKERS[a.speaker]?.name, text: a.text, duration, sentences };
    this.app.events.emit('cabin:announcement', payload);
    this.app.events.emit('ife:paFor', { id: c.id, duration });
  }

  _finish(cancelled) {
    const c = this.cur;
    this.cur = null;
    if (!c) return;
    try { c.src?.stop(); } catch { /* already stopped */ }
    if (c.utter) { try { window.speechSynthesis?.cancel(); } catch { /* */ } }
    if (c.stage === 'voice' && this.h.ctx.state === 'running') this.h.playPa('mic_key', 0, 0.6, 1.25);
    this.app.events.emit('cabin:announcementEnd', { id: c.id, cancelled });
  }

  /** speechSynthesis fallback. Returns the expected duration (s). */
  _speak(text, speaker, c) {
    const words = text.split(/\s+/).length, est = words / 2.6 + 0.5;
    try {
      const ss = window.speechSynthesis;
      if (!ss || typeof SpeechSynthesisUtterance === 'undefined') return est;
      const u = new SpeechSynthesisUtterance(text);
      const voices = ss.getVoices() || [];
      const want = SPEAKERS[speaker]?.voice === 'male' ? /male|david|daniel|alex|fred|guy|george|mark/i : /female|samantha|zira|susan|karen|victoria|aria|jenny|kate/i;
      u.voice = voices.find((v) => /^en/i.test(v.lang) && want.test(v.name)) || voices.find((v) => /^en/i.test(v.lang)) || null;
      u.rate = 0.95; u.pitch = speaker === 'captain' ? 0.85 : 1.05;
      u.volume = Math.min(1, (this.app.settings.get('announcementVolume') ?? 1) * (this.app.settings.get('masterVolume') ?? 1));
      if (this.app.debug?.mute) u.volume = 0;
      u.onend = () => { if (this.cur === c) c.tEnd = Math.min(c.tEnd, this.app.time); };
      c.utter = u;
      ss.speak(u);
    } catch { /* no speech */ }
    return est;
  }

  /** Free-form PA through the fallback voice (API say()). */
  say(text, speaker = 'purser') {
    const id = `say_${Date.now()}`;
    const c = { id, a: { text, speaker }, stage: 'voice', tEnd: 0 };
    const d = this._speak(text, speaker, c);
    this.app.events.emit('cabin:announcement', { id, speaker, speakerName: SPEAKERS[speaker]?.name, text, duration: d, sentences: estimateSentences(text, d) });
    setTimeout(() => this.app.events.emit('cabin:announcementEnd', { id }), d * 1000);
    return d;
  }
}

function estimateSentences(text, duration) {
  const parts = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const total = parts.reduce((s, p) => s + p.length, 0) || 1;
  let t = 0;
  return parts.map((p) => { const s = { t: +t.toFixed(2), text: p }; t += duration * p.length / total; return s; });
}
