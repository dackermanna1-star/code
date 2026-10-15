// Optional spoken callouts via the browser's speech synthesis (off by default).
export class Voice {
  constructor(settings) {
    this.settings = settings;
    this.ok = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.voices = [];
    if (this.ok) {
      const load = () => { this.voices = window.speechSynthesis.getVoices() || []; };
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }
    this.busyUntil = 0;
  }
  pick(gender) {
    const en = this.voices.filter((v) => /^en/i.test(v.lang));
    const pool = en.length ? en : this.voices;
    const f = pool.filter((v) => /female|woman|zira|samantha|victoria|karen|tessa|fiona|moira/i.test(v.name));
    const m = pool.filter((v) => !/female|woman|zira|samantha|victoria|karen|tessa|fiona|moira/i.test(v.name));
    return gender === 'f' ? (f[0] || pool[0]) : (m[0] || pool[0]);
  }
  say(s, text) {
    if (!this.ok || !this.settings.get('voiceTTS')) return;
    const now = performance.now();
    if (now < this.busyUntil) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      const v = this.pick(s.def.voice);
      if (v) u.voice = v;
      u.pitch = s.def.pitch || 1; u.rate = (s.def.rate || 1) * 1.1;
      u.volume = (this.settings.get('masterVolume') || 0.8) * 0.9;
      window.speechSynthesis.speak(u);
      this.busyUntil = now + 900 + text.length * 45;
    } catch (e) { /* ignore */ }
  }
}
