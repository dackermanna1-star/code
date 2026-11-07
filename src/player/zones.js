import { ZONES } from '../core/constants.js';

// =============================================================================
// Cabin zones for acoustics (audio) and lav lighting (galley):
//   'lav-fwd' | 'lav-aft-l' | 'lav-aft-r' | 'galley-fwd' | 'galley-aft' |
//   'entry-fwd' | 'entry-aft' | 'business' | 'economy'
// =============================================================================

/** Zone id for a floor point (aircraft-local x, z). */
export function zoneAt(x, z) {
  const Z = ZONES;
  if (z < Z.forwardEntry.zMin) {
    // vestibule in front of the cockpit door, flanked by the forward lav (left) and galley (right)
    const lav = Z.forwardLav;
    if (x <= lav.xMax && x >= lav.xMin - 0.3) return 'lav-fwd';
    if (x >= Z.forwardGalley.xMin - 0.05) return 'galley-fwd';
    return 'entry-fwd';
  }
  if (z <= Z.forwardEntry.zMax) {
    // the crew works the forward galley from the right half of the entry area
    if (x > 0.32 && z < Z.forwardEntry.zMin + 0.75) return 'galley-fwd';
    return 'entry-fwd';
  }
  if (z < Z.classDividerZ) return 'business';
  if (z < Z.aftLavs.zMin) return 'economy';
  if (z < Z.aftLavs.zMax) {
    if (x <= Z.aftLavs.left.xMax) return 'lav-aft-l';
    if (x >= Z.aftLavs.right.xMin) return 'lav-aft-r';
    return 'entry-aft';
  }
  if (z < Z.aftEntry.zMax) return 'entry-aft';
  return 'galley-aft';
}

/** Floor material under a point – used to pick footstep sounds. */
export function surfaceAt(zone) {
  if (!zone) return 'carpet';
  return zone === 'business' || zone === 'economy' ? 'carpet' : 'vinyl';
}

/** Debounced zone tracker that emits `player:zone` {zone, prev}. */
export class ZoneTracker {
  constructor(app) {
    this.app = app;
    this.zone = null;
    this._cand = null;
    this._t = 0;
  }

  update(x, z, dt, force = false) {
    const zn = zoneAt(x, z);
    if (zn === this.zone && !force) { this._cand = null; return; }
    if (zn !== this._cand) { this._cand = zn; this._t = 0; }
    this._t += dt;
    if (force || this.zone === null || this._t >= 0.12) {
      const prev = this.zone;
      this.zone = zn;
      this._cand = null;
      if (prev !== zn || force) this.app.events.emit('player:zone', { zone: zn, prev });
    }
  }
}
