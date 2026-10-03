import type { AudioEngine } from '../../audio/Audio';

interface Layer {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

/**
 * Layered battle score: a taiko/bass drive, an epic layer (shamisen, strings,
 * choir) on top, and a domain drone. Layers loop in sync and crossfade.
 */
export class Music {
  private layers = new Map<string, Layer>();
  private bus: GainNode | null = null;
  started = false;

  constructor(private audio: AudioEngine) {}

  start() {
    const ctx = this.audio.ctx;
    if (!ctx || this.started || !this.audio.ready) return;
    this.started = true;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(this.audio.musicBus);
    const t0 = ctx.currentTime + 0.05;
    for (const name of ['music_drive', 'music_epic', 'music_domain']) {
      const b = this.audio.bufferOf(name)?.[0];
      if (!b) continue;
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain);
      gain.connect(this.bus);
      src.start(t0);
      this.layers.set(name, { src, gain });
    }
  }

  /** Target levels per layer (0..1), eased over `fade` seconds. */
  mix(drive: number, epic: number, domain: number, fade = 1.5) {
    const ctx = this.audio.ctx;
    if (!ctx) return;
    const set = (n: string, v: number) => {
      const l = this.layers.get(n);
      if (l) l.gain.gain.setTargetAtTime(v, ctx.currentTime, fade / 3);
    };
    set('music_drive', drive);
    set('music_epic', epic);
    set('music_domain', domain);
  }

  /** Duck everything (cinematic beats, silence before a big hit). */
  duck(level: number, fade = 0.3) {
    const ctx = this.audio.ctx;
    if (!ctx || !this.bus) return;
    this.bus.gain.setTargetAtTime(level, ctx.currentTime, fade / 3);
  }

  stop() {
    for (const l of this.layers.values()) {
      try {
        l.src.stop();
      } catch {
        /* stopped */
      }
    }
    this.layers.clear();
    this.started = false;
  }
}
