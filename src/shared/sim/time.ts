/** Day/night cycle. Phase 0 = sunrise; day occupies [0, 1-night). */
export function dayPhase(timeSec: number, dayLengthMin: number): number {
  const cycle = Math.max(60, dayLengthMin * 60);
  const p = (timeSec / cycle) % 1;
  return p < 0 ? p + 1 : p;
}

/** Sun elevation in [-1, 1] (sine-like), positive during the day. */
export function sunElevation(phase: number, nightFraction: number): number {
  const day = 1 - nightFraction;
  if (phase < day) return Math.sin((Math.PI * phase) / day);
  return -Math.sin((Math.PI * (phase - day)) / nightFraction);
}

/** 0 (deep night) .. 1 (full day) skylight factor with soft dawn/dusk. */
export function daylight(phase: number, nightFraction: number): number {
  const e = sunElevation(phase, nightFraction);
  return Math.max(0.06, Math.min(1, 0.5 + e * 1.6));
}

export function clockString(phase: number, nightFraction: number): string {
  // Map so that sunrise = 06:00 and sunset = 06:00 + day span scaled into 24h.
  const dayHours = 24 * (1 - nightFraction);
  let hours: number;
  if (phase < 1 - nightFraction) hours = 6 + (phase / (1 - nightFraction)) * dayHours;
  else hours = 6 + dayHours + ((phase - (1 - nightFraction)) / nightFraction) * (24 - dayHours);
  hours %= 24;
  const h = Math.floor(hours), m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
