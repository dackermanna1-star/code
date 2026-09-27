// Dialogue system: queued, prioritised voice lines with per-category
// cooldowns, subtitles (character-coloured) and optional speech synthesis
// with a distinct voice per survivor. Radio lines get static bursts.
import { LINES, SCRIPTS } from './lines.js';
import { CHARACTERS } from '../entities/characters.js';
import { pick } from '../core/math.js';

const SPEAKER_STYLE = {
  pilot: { name: 'Pilot', color: '#9fd0ff', voice: { pitch: 0.9, rate: 1.05, prefer: ['Google UK English Male', 'Daniel', 'Microsoft Guy', 'male'] }, radio: true },
  news: { name: 'News Chopper 5', color: '#ffd080', voice: { pitch: 1.0, rate: 1.0, prefer: ['Google US English', 'Alex', 'male'] }, radio: true },
  radio: { name: 'Radio', color: '#b0ffb0', voice: { pitch: 1.0, rate: 1.0, prefer: ['male'] }, radio: true },
};

export class VoiceSystem {
  constructor(game) {
    this.game = game;
    this.queue = [];
    this.current = null;
    this.cool = new Map(); // key -> time
    this.global = 0;
    this.voices = [];
    this.voiceFor = {};
    this.enabled = true;
    this.subs = null; // callback(text, speaker, color, duration)
    this.scriptTimers = [];
    this.tts = typeof window !== 'undefined' && 'speechSynthesis' in window;
    if (this.tts) {
      const load = () => { this.voices = window.speechSynthesis.getVoices() || []; this.voiceFor = {}; };
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }
  }
  reset() {
    this.queue = [];
    this.current = null;
    for (const t of this.scriptTimers) clearTimeout(t);
    this.scriptTimers = [];
    if (this.tts) try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  }
  pickVoice(id, cfg) {
    if (this.voiceFor[id] !== undefined) return this.voiceFor[id];
    let v = null;
    const vs = this.voices.filter((x) => /en[-_]/i.test(x.lang) || /english/i.test(x.name));
    for (const p of cfg.prefer || []) {
      v = vs.find((x) => x.name.toLowerCase().includes(p.toLowerCase()));
      if (v) break;
    }
    if (!v && vs.length) v = vs[(id.length * 7) % vs.length];
    this.voiceFor[id] = v;
    return v;
  }
  // Say a categorised line for survivor s. prio: 0 chatter .. 3 critical
  say(s, category, prio = 1, opts = {}) {
    if (!s || !this.enabled) return false;
    const id = s.char ? s.char.id : s;
    const set = LINES[id] && LINES[id][category];
    if (!set) return false;
    const now = this.game.time;
    const key = id + ':' + category;
    const catKey = '*:' + category;
    const cd = opts.cooldown ?? (prio >= 3 ? 2 : prio >= 2 ? 5 : 10);
    if ((this.cool.get(key) || -1e9) > now || (this.cool.get(catKey) || -1e9) > now) return false;
    if (prio < 2 && this.current && this.current.prio >= prio) return false;
    // far away bots don't chatter
    const p = this.game.player;
    if (s.pos && p && !s.isHuman && s.pos.distanceTo(p.pos) > 30 && prio < 3) return false;
    this.cool.set(key, now + cd);
    this.cool.set(catKey, now + (opts.teamCooldown ?? Math.min(cd, 4)));
    this.enqueue({ who: id, text: opts.text || pick(set), prio });
    return true;
  }
  // Play a scripted conversation by key (or array of lines).
  script(keyOrLines, onDone) {
    const lines = typeof keyOrLines === 'string' ? SCRIPTS[keyOrLines] : keyOrLines;
    if (!lines) return;
    let last = 0;
    for (const l of lines) {
      const t = setTimeout(() => {
        // skip lines from dead survivors
        const s = this.game.survivors.find((x) => x.char.id === l.who);
        if (s && s.dead) return;
        this.enqueue({ who: l.who, text: l.text, prio: 2, force: true });
      }, l.d * 1000);
      this.scriptTimers.push(t);
      last = Math.max(last, l.d);
    }
    if (onDone) this.scriptTimers.push(setTimeout(onDone, (last + 3) * 1000));
  }
  enqueue(item) {
    if (item.prio >= 3 && this.current && this.current.prio < 3) {
      this.stopCurrent();
    }
    this.queue.push(item);
    this.queue.sort((a, b) => b.prio - a.prio);
    if (this.queue.length > 6) this.queue.length = 6;
    this.pump();
  }
  stopCurrent() {
    if (this.tts) try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    this.current = null;
  }
  pump() {
    if (this.current || !this.queue.length) return;
    const item = this.queue.shift();
    this.current = item;
    const ch = CHARACTERS[item.who];
    const style = ch ? { name: ch.name, color: ch.color, voice: ch.voice } : SPEAKER_STYLE[item.who] || SPEAKER_STYLE.radio;
    const dur = Math.max(1.6, item.text.length * 0.065);
    this.subs?.(item.text, style.name, style.color, dur + 0.8);
    if (style.radio) this.game.audio.play('radioStatic', { vol: 0.6 });
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (this.current === item) this.current = null;
      setTimeout(() => this.pump(), 250);
    };
    const settings = this.game.settings;
    if (this.tts && settings.tts && (settings.voice ?? 1) > 0.01) {
      try {
        const u = new SpeechSynthesisUtterance(item.text);
        const v = this.pickVoice(item.who, style.voice);
        if (v) u.voice = v;
        u.pitch = style.voice.pitch;
        u.rate = style.voice.rate * (item.prio >= 3 ? 1.12 : 1);
        u.volume = Math.min(1, (settings.voice ?? 1) * (settings.master ?? 1));
        u.onend = finish;
        u.onerror = finish;
        window.speechSynthesis.speak(u);
        setTimeout(finish, (dur + 3) * 1000); // safety
      } catch (e) {
        setTimeout(finish, dur * 1000);
      }
    } else {
      setTimeout(finish, dur * 1000);
    }
  }
}
