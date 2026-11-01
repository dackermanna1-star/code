// Clock and the daily regime of Gravelmouth. One game day runs 06:00 -> 06:00; the sentence
// counts down at each 06:00. Periods drive NPC routines, door states and lighting.
import { formatClock } from '../core/mathutil.js';

export const PERIODS = [
  { id: 'wake', start: 6 * 60, end: 6 * 60 + 30, name: 'Wake-Up', where: 'cell', desc: 'Cells open. Get up and get moving.' },
  { id: 'breakfast', start: 6 * 60 + 30, end: 7 * 60 + 30, name: 'Breakfast', where: 'mess', desc: 'Breakfast is served in the Mess Hall.' },
  { id: 'work', start: 7 * 60 + 30, end: 11 * 60 + 30, name: 'Work Detail', where: 'job', desc: 'Report to your work assignment.' },
  { id: 'lunch', start: 11 * 60 + 30, end: 12 * 60 + 30, name: 'Lunch', where: 'mess', desc: 'Lunch in the Mess Hall.' },
  { id: 'yard', start: 12 * 60 + 30, end: 16 * 60, name: 'Yard Time', where: 'yard', desc: 'The yard gate is open.' },
  { id: 'free', start: 16 * 60, end: 17 * 60 + 30, name: 'Free Time', where: 'free', desc: 'Free movement. Showers, gym, library.' },
  { id: 'dinner', start: 17 * 60 + 30, end: 18 * 60 + 30, name: 'Dinner', where: 'mess', desc: 'Dinner in the Mess Hall.' },
  { id: 'rec', start: 18 * 60 + 30, end: 21 * 60, name: 'Evening Rec', where: 'free', desc: 'Rec room, gym and library are open.' },
  { id: 'lockup', start: 21 * 60, end: 22 * 60, name: 'Lock-Up', where: 'cell', desc: 'Return to your cell. Doors lock at 21:30.' },
  { id: 'lightsout', start: 22 * 60, end: 30 * 60, name: 'Lights Out', where: 'bed', desc: 'Lights out. Sleep.' },
];

export class Clock {
  constructor(startTotal = 6 * 60) {
    this.total = startTotal;      // game minutes since day 0 00:00
    this.scale = 1.5;             // game minutes per real second
    this.boost = 1;               // sleep / time-skip multiplier
    this.listeners = [];
    this._period = this.period.id;
  }
  get minutes() { return ((this.total % 1440) + 1440) % 1440; }
  get dayIndex() { return Math.floor((this.total - 360) / 1440); }
  get day() { return this.dayIndex + 1; }
  get hhmm() { return formatClock(this.minutes); }
  get period() {
    const m = this.minutes < 360 ? this.minutes + 1440 : this.minutes;
    return PERIODS.find((p) => m >= p.start && m < p.end) || PERIODS[0];
  }
  periodAt(minutes) {
    const m = minutes < 360 ? minutes + 1440 : minutes;
    return PERIODS.find((p) => m >= p.start && m < p.end) || PERIODS[0];
  }
  minutesUntil(hhmm) { let d = hhmm - this.minutes; if (d < 0) d += 1440; return d; }
  /** Advance by real seconds; returns list of events crossed. */
  advance(dt) {
    const prevDay = this.dayIndex;
    this.total += dt * this.scale * this.boost;
    const events = [];
    const p = this.period.id;
    if (p !== this._period) { events.push({ type: 'period', from: this._period, to: p }); this._period = p; }
    if (this.dayIndex !== prevDay) events.push({ type: 'day', day: this.day });
    return events;
  }
  skipTo(totalMinutes) { this.total = totalMinutes; }
  get cellsOpen() { const m = this.minutes; return m >= 6 * 60 && m < 21 * 60 + 30; }
  get yardOpen() { const id = this.period.id; return id === 'yard' || id === 'free'; }
  get lightsOut() { return this.period.id === 'lightsout'; }
}
