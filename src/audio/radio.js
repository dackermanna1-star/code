// Radio chatter: squelch open, band-limited static under the transmission and a
// squelch tail on close. The voice is either speechSynthesis (when enabled and a
// voice exists) or a synthesised, unintelligible radio "babble". One transmission
// at a time; requests are rate limited, de-duplicated and queued by priority.
import { Rng, clamp } from './dsp.js';

const MAX_QUEUE = 4;
const MIN_GAP = 0.6;
const STALE = 10;

export class Radio {
  constructor(ctx, mixer, bank) {
    this.ctx = ctx;
    this.bank = bank;
    this.rng = new Rng(0x7ad10);
    this.out = mixer.radio;
    this.staticGain = new GainNode(ctx, { gain: 0 });
    this.staticSrc = new AudioBufferSourceNode(ctx, { buffer: bank.get('radio:static').near[0].buffer, loop: true });
    this.staticSrc.connect(this.staticGain).connect(this.out);
    this.staticSrc.start();
    this.queue = [];
    this.current = null;
    this.nextFree = 0;
    this.lastAccept = -Infinity;
    this.lastText = '';
    this.speechEnabled = false;
    this.volume = 1;
    this.voices = [null, null];
    this.timer = 0;
    this.stats = { requested: 0, accepted: 0, dropped: 0, spoken: 0, babbled: 0 };
    this.synth = typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null;
    if (this.synth) {
      this.onVoices = () => this.loadVoices();
      this.loadVoices();
      if (this.synth.addEventListener) this.synth.addEventListener('voiceschanged', this.onVoices);
    }
  }

  // Two distinct English voices if possible: US for faction 0, another accent for faction 1.
  loadVoices() {
    const all = this.synth.getVoices() || [];
    const en = all.filter((v) => /^en/i.test(v.lang));
    const pool = en.length ? en : all;
    const a = pool.find((v) => /en[-_]US/i.test(v.lang)) || pool[0] || null;
    const b = pool.find((v) => v !== a && /en[-_](GB|AU|IE|NZ|ZA|IN)/i.test(v.lang)) || pool.find((v) => v !== a) || a;
    this.voices = [a, b];
  }

  setSpeech(enabled) {
    this.speechEnabled = !!enabled;
    if (!enabled && this.current && this.current.mode === 'speech') {
      this.synth.cancel();
      this.close();
    }
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
  }

  request(text, faction = 0, opts = {}) {
    this.stats.requested++;
    const now = this.ctx.currentTime;
    const priority = clamp(Math.round(opts.priority ?? 1), 0, 2);
    const msg = text == null ? '' : String(text);
    const repeat = msg && msg === this.lastText && now - this.lastAccept < 4;
    if (repeat || (priority < 2 && now - this.lastAccept < MIN_GAP)) {
      this.stats.dropped++;
      return false;
    }
    this.queue.push({ text: msg, faction: faction === 1 ? 1 : 0, priority, t: now });
    this.queue.sort((a, b) => b.priority - a.priority || a.t - b.t);
    while (this.queue.length > MAX_QUEUE) {
      this.queue.pop();
      this.stats.dropped++;
    }
    this.lastAccept = now;
    this.lastText = msg;
    this.stats.accepted++;
    return true;
  }

  update() {
    const now = this.ctx.currentTime;
    if (this.current) {
      const c = this.current;
      if (c.mode === 'babble' && now >= c.endAt) this.close();
      else if (c.mode === 'speech' && now > c.deadline) {
        this.synth.cancel();
        this.close();
      }
      return;
    }
    while (this.queue.length && now - this.queue[0].t > STALE) {
      this.queue.shift();
      this.stats.dropped++;
    }
    if (this.queue.length && now >= this.nextFree) this.open(this.queue.shift());
  }

  oneShot(key, when, gain, rate = 1) {
    const entry = this.bank.pick(key);
    if (!entry) return 0;
    const src = new AudioBufferSourceNode(this.ctx, { buffer: entry.buffer, playbackRate: rate });
    const g = new GainNode(this.ctx, { gain });
    src.connect(g).connect(this.out);
    src.start(when);
    src.onended = () => g.disconnect();
    return entry.duration / rate;
  }

  open(item) {
    const now = this.ctx.currentTime;
    this.oneShot('radio:squelch_open', now, 0.7);
    this.staticGain.gain.setTargetAtTime(0.06, now + 0.02, 0.02);
    const voice = this.voices[item.faction];
    if (this.speechEnabled && this.synth && voice && item.text) {
      const u = new SpeechSynthesisUtterance(item.text);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = 1.15;
      u.pitch = item.faction ? 1.12 : 0.8;
      u.volume = 0.6 * this.volume;
      const tx = { mode: 'speech', item, deadline: now + 2.5 + item.text.length / 11 };
      u.onend = () => this.current === tx && this.close();
      u.onerror = u.onend;
      this.current = tx;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (this.current === tx) this.synth.speak(u);
      }, 120);
      this.stats.spoken++;
    } else {
      const rate = this.rng.range(0.95, 1.06);
      const start = now + 0.09;
      const len = this.oneShot(`radio:babble_${item.faction}`, start, 0.55, rate);
      this.current = { mode: 'babble', item, endAt: start + len };
      this.stats.babbled++;
    }
  }

  close() {
    const now = this.ctx.currentTime;
    this.oneShot('radio:squelch_close', now, 0.6);
    this.staticGain.gain.setTargetAtTime(0, now + 0.12, 0.03);
    this.current = null;
    this.nextFree = now + this.rng.range(0.35, 0.9);
  }

  cancel() {
    this.queue.length = 0;
    clearTimeout(this.timer);
    if (this.current && this.current.mode === 'speech') this.synth.cancel();
    if (this.current) this.close();
  }

  dispose() {
    this.cancel();
    if (this.synth && this.synth.removeEventListener) this.synth.removeEventListener('voiceschanged', this.onVoices);
    try {
      this.staticSrc.stop();
    } catch {
      // not started
    }
    this.staticGain.disconnect();
  }
}
