// Sentence, parole, endings and lifetime statistics.
export class Progression {
  constructor(sim, opts = {}) {
    this.sim = sim;
    this.sentence = { total: opts.days || 21, daysLeft: opts.days || 21, served: 0, crime: opts.crime || 'Grand Theft Lawnmower' };
    this.behavior = 50;           // 0..100, parole board looks at this
    this.stats = { fightsWon: 0, kos: 0, timesKOd: 0, crimes: 0, arrests: 0, ramenEarned: 0, favors: 0, daysInHole: 0, trainingGains: 0 };
    this.ended = null;
    const ev = sim.events;
    ev.on('ko', (e) => { if (e.by && e.by.isPlayer) this.stats.kos++; if (e.c.isPlayer) this.stats.timesKOd++; });
    ev.on('crime', (e) => { if (e.c.isPlayer) { this.stats.crimes++; this.behavior = Math.max(0, this.behavior - e.def.severity * 6); } });
    ev.on('punished', (e) => { if (e.c.isPlayer) { this.stats.arrests++; if (e.result.days) this.addDays(e.result.days, 'punishment'); } });
    ev.on('paid', (e) => { if (e.c.isPlayer) { this.stats.ramenEarned += e.amount; this.behavior = Math.min(100, this.behavior + 0.5); } });
    ev.on('favorDone', () => { this.stats.favors++; });
    ev.on('statGain', (e) => { if (e.c.isPlayer) this.stats.trainingGains++; });
  }
  addDays(n, reason) {
    this.sentence.daysLeft += n; this.sentence.total += n;
    this.sim.events.emit('sentenceChange', { delta: n, reason });
  }
  onClock(ev) {
    if (ev.type !== 'day' || this.ended) return;
    const s = this.sentence;
    s.served++; s.daysLeft--;
    this.behavior = Math.min(100, this.behavior + 4);
    this.sim.events.emit('newDay', { day: ev.day, daysLeft: s.daysLeft });
    if (s.served > 0 && s.served % 7 === 0 && s.daysLeft > 1) this.paroleHearing();
    if (s.daysLeft <= 0) this.end('released');
  }
  paroleHearing() {
    const s = this.sentence;
    let cut = 0;
    if (this.behavior >= 80) cut = 3; else if (this.behavior >= 65) cut = 2; else if (this.behavior >= 50) cut = 1;
    cut = Math.min(cut, s.daysLeft - 1);
    if (cut > 0) { s.daysLeft -= cut; s.total -= cut; }
    this.sim.events.emit('parole', { cut, behavior: this.behavior });
  }
  end(kind) {
    if (this.ended) return;
    this.ended = { kind, day: this.sim.clock.day, t: this.sim.clock.total };
    this.sim.events.emit('ending', this.ended);
  }
  lateUpdate() {
    const p = this.sim.player;
    if (!p || this.ended) return;
    const room = this.sim.world.roomAt(p.x, p.z);
    if (room && room.id === 'outside' && p.z > 110) this.end('escaped');
  }
  title() {
    const st = this.stats, p = this.sim.player;
    if (this.ended?.kind === 'escaped') return 'Fugitive';
    if (st.kos >= 15) return 'Yard Legend';
    if (st.crimes === 0) return 'Model Prisoner';
    if ((p?.respect || 0) > 60) return 'Respected Veteran';
    if (st.ramenEarned > 60) return 'Noodle Tycoon';
    return 'Survivor';
  }
}
