// =============================================================================
// ANNOUNCER — serialises PA announcements so they never overlap (adapted from
// the flight sim's crew.js). Requests carry a max delay in real seconds (a
// stale "next stop" is dropped). Durations are estimated from the text and
// refined by the audio module's cabin:announcement {duration} /
// cabin:announcementEnd events. Timing uses real (wall) seconds because the
// audio plays in real time, whatever the time warp.
// =============================================================================
import { ANNOUNCEMENTS } from './announcements.js';

export function estimateDuration(id) {
  const a = ANNOUNCEMENTS[id];
  if (!a) return 3;
  const words = a.text.split(/\s+/).length;
  return words / 2.6 + (a.chime && a.chime !== 'none' ? 2.2 : 0.5);
}

export class Announcer {
  constructor(emit, state) {
    this.emit = emit;
    this.state = state;
    this.queue = [];
    this.current = null;      // { id, end }
    this.busyUntil = 0;
    this.now = 0;
    this.silent = false;
    this.log = [];
  }
  request(id, { maxDelay = 40, front = false } = {}) {
    if (this.silent || !ANNOUNCEMENTS[id]) return false;
    if (this.current?.id === id || this.queue.some((q) => q.id === id)) return false;
    const item = { id, t: this.now, maxDelay };
    if (front) this.queue.unshift(item); else this.queue.push(item);
    return true;
  }
  cancel() {
    const had = !!(this.current || this.queue.length);
    this.queue.length = 0;
    this.current = null;
    this.busyUntil = 0;
    this.state.cabin.announcement = null;
    return had;
  }
  get busy() { return !!this.current || this.now < this.busyUntil; }
  update(realDt) {
    this.now += realDt;
    const now = this.now, cab = this.state.cabin;
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
      this.busyUntil = now + dur + 1.5;
      cab.announcement = q.id;
      this.log.push(q.id);
      this.emit('trip:announce', { id: q.id, speaker: ANNOUNCEMENTS[q.id].speaker, text: ANNOUNCEMENTS[q.id].text, chime: ANNOUNCEMENTS[q.id].chime, estimatedDuration: dur });
      break;
    }
  }
  onStarted(p) {
    if (!p || !this.current || p.id !== this.current.id) return;
    if (p.duration > 0) { this.current.end = this.now + p.duration; this.busyUntil = this.current.end + 1.5; }
  }
  onEnded(p) {
    if (!p || !this.current || p.id !== this.current.id) return;
    this.current.end = this.now;
    this.busyUntil = this.now + 1.5;
    if (this.state.cabin.announcement === p.id) this.state.cabin.announcement = null;
    this.current = null;
  }
}
