// =============================================================================
// ANNOUNCER — serialises cabin / flight-deck PAs so they never overlap and keep
// a natural order. Requests carry a max delay (stale PAs are dropped, e.g. a
// "doors armed" that could not be said before pushback). Durations are
// estimated from the text and refined by the audio module's
// 'cabin:announcement' {duration} / 'cabin:announcementEnd' events.
// Timing uses real (wall) seconds: the audio plays in real time.
// =============================================================================
import { ANNOUNCEMENTS } from './announcements.js';

export function estimateDuration(id) {
  const a = ANNOUNCEMENTS[id];
  if (!a) return 3;
  const words = a.text.split(/\s+/).length;
  return words / 2.55 + (a.chime && a.chime !== 'none' ? 2.4 : 0.6);
}

export class Announcer {
  constructor(director) {
    this.D = director;
    this.queue = [];
    this.current = null;      // { id, end }
    this.busyUntil = 0;
  }
  /** Queue an announcement. opts: { maxDelay (s), front (jump the queue) } */
  request(id, { maxDelay = 45, front = false } = {}) {
    const D = this.D;
    if (D.silent || !ANNOUNCEMENTS[id]) return false;
    if (this.current?.id === id || this.queue.some((q) => q.id === id)) return false;
    const item = { id, t: D.realTime, maxDelay };
    if (front) this.queue.unshift(item); else this.queue.push(item);
    return true;
  }
  /** Drop everything (skips / restart). */
  cancel() {
    const had = this.current || this.queue.length;
    this.queue.length = 0;
    this.current = null;
    this.busyUntil = 0;
    this.D.state.cabin.announcement = null;
    return !!had;
  }
  get busy() { return !!this.current || this.D.realTime < this.busyUntil; }
  update() {
    const D = this.D, now = D.realTime, cab = D.state.cabin;
    if (this.current && now >= this.current.end) {
      if (cab.announcement === this.current.id) cab.announcement = null;
      this.current = null;
    }
    if (this.current || now < this.busyUntil) return;
    while (this.queue.length) {
      const q = this.queue.shift();
      if (now - q.t > q.maxDelay) continue;
      const dur = estimateDuration(q.id);
      this.current = { id: q.id, end: now + dur };
      this.busyUntil = now + dur + 1.4;
      cab.announcement = q.id;
      D.emit('cabin:announce', { id: q.id });
      break;
    }
  }
  /** audio module: playback started (with the real duration). */
  onStarted(p) {
    if (!p || !this.current || p.id !== this.current.id) return;
    if (p.duration > 0) { this.current.end = this.D.realTime + p.duration; this.busyUntil = this.current.end + 1.4; }
  }
  /** audio module: playback ended. */
  onEnded(p) {
    if (!p || !this.current || p.id !== this.current.id) return;
    this.current.end = this.D.realTime;
    this.busyUntil = this.D.realTime + 1.4;
    if (this.D.state.cabin.announcement === p.id) this.D.state.cabin.announcement = null;
    this.current = null;
  }
}
