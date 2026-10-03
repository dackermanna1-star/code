// Runtime side of the background music: a look-ahead scheduler that turns Composer bars into
// AudioBufferSourceNodes (samples come from the Bank, rendered ahead of time).
//
// Bars are composed three ahead (their samples are requested at SOON priority) and a bar is
// scheduled as a whole once its downbeat is less than LOOKAHEAD seconds away, so main-thread
// stalls shorter than that never disturb the timing.

import { Composer, BAR_SEC, PART_GAIN, PART_PAN, CHOKE_TC, CHOKE_CUT, type BarInfo } from './music';
import { INSTRUMENTS, type Inst } from './instruments';
import { PRIO_SOON, type Bank } from './bank';

const LOOKAHEAD = 1.0;
const QUEUE_BARS = 3;
/** level of the first bars after (re)starting — a soft entry instead of a fade automation */
const ENTRY_LEVELS = [0.55, 0.8];

export const noteKey = (part: Inst, midi: number): string => `note:${part}:${midi}`;

interface Live {
  src: AudioBufferSourceNode;
  gain: GainNode;
  end: number;
}

export class MusicPlayer {
  running = false;
  /** bars scheduled since construction (debug) */
  barsScheduled = 0;
  /** render missing samples synchronously (offline tests / no-worker mode) */
  sync = false;
  private composer: Composer | null = null;
  private queue: BarInfo[] = [];
  private nextBar = -1;
  private sinceStart = 0;
  private readonly parts = new Map<Inst, AudioNode>();
  private readonly live = new Set<Live>();
  private readonly choke = new Map<string, Live>();

  constructor(
    private readonly ctx: BaseAudioContext,
    out: AudioNode,
    private readonly bank: Bank,
  ) {
    for (const p of INSTRUMENTS) {
      const pan = PART_PAN[p];
      let node: AudioNode;
      if (pan && typeof ctx.createStereoPanner === 'function') {
        const sp = ctx.createStereoPanner();
        sp.pan.value = pan;
        node = sp;
      } else node = ctx.createGain();
      node.connect(out);
      this.parts.set(p, node);
    }
  }

  start(seed = Math.floor(Math.random() * 1e6)): void {
    if (this.running) return;
    this.running = true;
    this.composer = new Composer(seed);
    this.queue = [];
    this.nextBar = -1;
    this.sinceStart = 0;
    this.fill();
  }

  /** Stops composing and fades every sounding / scheduled note out over `fade` seconds. */
  stop(fade = 0.5): void {
    this.running = false;
    this.composer = null;
    this.queue = [];
    this.nextBar = -1;
    const now = this.ctx.currentTime;
    const f = Math.max(0.02, fade);
    for (const l of this.live) {
      try {
        l.gain.gain.setTargetAtTime(0, now, f / 4);
        l.src.stop(now + f + 0.02);
      } catch {
        /* already stopped */
      }
    }
    this.choke.clear();
  }

  /** Called every ~100 ms by the engine. */
  tick(): void {
    if (!this.running || !this.composer) return;
    this.fill();
    const now = this.ctx.currentTime;
    if (this.nextBar < 0) {
      // wait until the first two bars can be played without gaps
      if (!this.ready(this.queue[0]) || !this.ready(this.queue[1])) return;
      this.nextBar = now + 0.12;
    }
    // the main thread stalled for longer than the look-ahead: re-anchor instead of cramming notes
    if (this.nextBar < now + 0.02) this.nextBar = now + 0.06;
    for (let guard = 0; guard < 4 && this.nextBar < now + LOOKAHEAD; guard++) {
      const bar = this.queue[0];
      if (!bar || !this.ready(bar)) break;
      this.schedule(bar, this.nextBar);
      this.queue.shift();
      this.nextBar += BAR_SEC;
      this.fill();
    }
    for (const l of this.live) if (l.end < now - 0.5) this.live.delete(l);
  }

  /** Offline helper: schedules bars synchronously until context time `until`. */
  scheduleUntil(until: number): void {
    if (!this.running) return;
    this.sync = true;
    this.fill();
    if (this.nextBar < 0) this.nextBar = this.ctx.currentTime + 0.05;
    while (this.nextBar < until) {
      const bar = this.queue[0];
      if (!bar || !this.ready(bar)) break;
      this.schedule(bar, this.nextBar);
      this.queue.shift();
      this.nextBar += BAR_SEC;
      this.fill();
    }
  }

  get liveNotes(): number {
    return this.live.size;
  }

  private fill(): void {
    while (this.composer && this.queue.length < QUEUE_BARS) {
      const bar = this.composer.next();
      this.queue.push(bar);
      for (const n of bar.notes) {
        const key = noteKey(n.part, n.midi);
        if (!this.bank.has(key)) this.bank.request(key, { k: 'note', inst: n.part, midi: n.midi }, PRIO_SOON);
      }
    }
  }

  private ready(bar: BarInfo | undefined): boolean {
    if (!bar) return false;
    for (const n of bar.notes) {
      const key = noteKey(n.part, n.midi);
      if (this.bank.has(key)) continue;
      if (this.sync && this.bank.renderNow(key, { k: 'note', inst: n.part, midi: n.midi })) continue;
      return false;
    }
    return true;
  }

  private schedule(bar: BarInfo, t0: number): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const entry = ENTRY_LEVELS[this.sinceStart] ?? 1;
    this.sinceStart++;
    for (const n of bar.notes) {
      const buf = this.bank.get(noteKey(n.part, n.midi));
      const dest = this.parts.get(n.part);
      if (!buf || !dest) continue;
      const t = Math.max(t0 + n.t, now);
      const rate = n.cents ? Math.pow(2, n.cents / 1200) : 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      if (rate !== 1) src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = n.vel * PART_GAIN[n.part] * entry;
      src.connect(g);
      g.connect(dest);
      src.start(t);
      const live: Live = { src, gain: g, end: t + buf.duration / rate };
      if (n.ch) {
        // a new note on the same uke string / the bass damps the previous one (as a player would)
        const prev = this.choke.get(n.ch);
        if (prev && prev.end > t) {
          try {
            prev.gain.gain.setTargetAtTime(0, t, CHOKE_TC);
            prev.src.stop(t + CHOKE_CUT);
          } catch {
            /* ignore */
          }
          prev.end = Math.min(prev.end, t + CHOKE_CUT);
        }
        this.choke.set(n.ch, live);
      }
      src.onended = () => {
        try {
          g.disconnect();
        } catch {
          /* ignore */
        }
        this.live.delete(live);
      };
      this.live.add(live);
    }
    this.barsScheduled++;
  }
}
