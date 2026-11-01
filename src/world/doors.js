// Door entities (logic only). A door occupies an opening on a room boundary. Doors slide
// open/closed; their collider is enabled while mostly closed. Passability for navigation
// and movement is decided by `canPass(agent)`, which consults an authorisation hook
// installed by the rules system (schedules, jobs, keycards).
export class Door {
  constructor(def, index) {
    Object.assign(this, def);
    this.index = index;
    this.amount = 0;          // 0 closed .. 1 open (animated)
    this.target = 0;
    this.locked = false;      // hard lock (solitary, lockdown)
    this.scheduledOpen = false;
    this.holdOpen = 0;        // seconds an auto door stays open
    this.collider = null;
    this.opaque = def.style === 'staff' || def.style === 'office';
    this.authorize = (agent) => !!(agent && agent.isStaff);
    this.width = def.to - def.from;
  }
  get isOpen() { return this.amount > 0.65; }
  /** Can this agent pass (now or by triggering the door)? */
  canPass(agent) {
    if (this.locked) return !!(agent && agent.isStaff && this.style !== 'cell');
    if (this.scheduledOpen) return true;
    return this.authorize(agent);
  }
  update(dt, nearbyAuthorized) {
    if (this.locked) this.target = 0;
    else if (this.scheduledOpen) this.target = 1;
    else {
      if (nearbyAuthorized) this.holdOpen = 1.2;
      this.holdOpen = Math.max(0, this.holdOpen - dt);
      this.target = this.holdOpen > 0 ? 1 : 0;
    }
    const speed = this.style === 'cell' || this.style === 'gate' ? 0.9 : 2.6;
    const prev = this.amount;
    if (this.amount < this.target) this.amount = Math.min(this.target, this.amount + speed * dt);
    else if (this.amount > this.target) this.amount = Math.max(this.target, this.amount - speed * dt);
    if (this.collider) this.collider.enabled = this.amount < 0.7;
    return prev !== this.amount ? (this.amount > prev ? 'opening' : 'closing') : null;
  }
  center() {
    const mid = (this.from + this.to) / 2;
    return this.orient === 'h' ? [mid, this.line] : [this.line, mid];
  }
}
