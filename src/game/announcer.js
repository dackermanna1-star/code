// Round announcements ("Terrorists win!", "Bomb has been planted.") through the
// browser's speech synthesiser, flattened and slowed toward the 1.6 radio voice.
// Disabled with `announcer 0` in the console.

export class Announcer {
  constructor(settings) {
    this.settings = settings;
    this.voice = null;
    const synth = globalThis.speechSynthesis;
    if (!synth) return;
    const pickVoice = () => {
      const vs = synth.getVoices();
      this.voice = vs.find((v) => /en[-_]US/i.test(v.lang) && /male|david|alex|daniel|fred/i.test(v.name)) || vs.find((v) => /^en/i.test(v.lang)) || null;
    };
    pickVoice();
    synth.addEventListener?.('voiceschanged', pickVoice);
  }

  say(text) {
    const synth = globalThis.speechSynthesis;
    if (!synth || !this.settings.get('announcer')) return;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/!$/, ''));
      if (this.voice) u.voice = this.voice;
      u.rate = 0.95;
      u.pitch = 0.75;
      u.volume = Math.min(1, (this.settings.get('volume') ?? 0.8) * 0.9);
      synth.speak(u);
    } catch { /* ignore */ }
  }
}
