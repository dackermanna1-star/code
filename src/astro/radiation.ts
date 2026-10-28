/**
 * Surface radiation dose (mSv/yr), calibrated on measured values:
 *
 *  - galactic cosmic rays: ≈380 mSv/yr on an airless surface (Chang'e 4 LND
 *    on the Moon), ≈230 under Mars' ≈17 g/cm² of air (Curiosity RAD), ≈45 at
 *    airliner altitude (≈200 g/cm²) and ≈0.3 at sea level (1033 g/cm²): a
 *    soft component (e-folding 40 g/cm²) plus a penetrating one (165 g/cm²),
 *    with the soft part screened by a magnetosphere away from the poles;
 *  - solar energetic particles: scale with insolation and stellar activity,
 *    stopped by a few g/cm² of air;
 *  - trapped particles around giant planets: steep with orbital distance,
 *    calibrated on the Galilean moons (Io ≈ 36 Sv/day, Europa ≈ 5.4,
 *    Ganymede ≈ 0.08, Callisto ≈ 0.0001);
 *  - the ground: natural radionuclides in rock (≈0.8) and radon in air (≈1.3).
 *
 * Earth at sea level comes to ≈2.4 mSv/yr, the reference for "× Earth".
 */

export const EARTH_DOSE = 2.4; // mSv/yr
const GCR_SURFACE = 380;       // mSv/yr on an airless surface (half the sky blocked by the body)
const SEP_1AU = 25;            // mSv/yr long-term average at 1 AU for a Sun-like activity of 0.3
const JUPITER_MASS = 1.898e27;

export interface DoseEnv {
  /** solar-particle dose in free space at the body (mSv/yr) */
  sep: number;
  /** trapped-particle dose in free space at the body (mSv/yr) */
  trapped: number;
}

export function doseEnv(insolation: number, activity: number, host?: { mass: number; radius: number; moonA: number; isGiant: boolean }): DoseEnv {
  let trapped = 0;
  if (host?.isGiant) {
    const k = Math.min(2, host.mass / JUPITER_MASS) ** 4; // belts weaken steeply for smaller giants
    trapped = Math.pow(10, 8.73 - 0.2725 * (host.moonA / host.radius)) * k;
  }
  return { sep: SEP_1AU * insolation * (activity / 0.3), trapped };
}

/** rock share of the crust (icy worlds have ice crusts whatever their bulk) */
export const crustRock = (type: string, c: { iron: number; silicate: number; ice: number }) =>
  type === 'icy' ? 0.05 : (c.silicate + c.iron) / (c.silicate + c.iron + c.ice + 1e-9);

/** air column (g/cm²) above a point at pressure P (bar) under gravity g */
export const airColumn = (P: number, g: number) => (P * 1e5) / Math.max(g, 0.01) / 10;

export interface DoseParts { cosmic: number; solar: number; trapped: number; ground: number; total: number }

/**
 * Dose at a surface point: column (g/cm²), field (× Earth), magnetic latitude
 * (rad), rocky fraction of the crust (0 ice .. 1 silicate), whether air traps radon.
 */
export function surfaceDose(env: DoseEnv, column: number, field: number, lat: number, rocky: number, air: boolean): DoseParts {
  const c4 = Math.cos(lat) ** 4, B = Math.min(field, 5);
  const soft = 1 / (1 + 3 * B * c4), hard = 1 / (1 + 0.15 * B * c4);
  const cosmic = GCR_SURFACE * (0.6 * Math.exp(-column / 40) * soft + 0.4 * Math.exp(-column / 165) * hard);
  const solar = env.sep * Math.exp(-column / 8) * soft;
  const trapped = env.trapped * Math.exp(-column / 10) / (1 + 10 * B); // a moon's own magnetosphere deflects belt particles
  const ground = 0.1 + 0.7 * rocky + (air && rocky > 0.5 ? 1.3 : 0);
  return { cosmic, solar, trapped, ground, total: cosmic + solar + trapped + ground };
}
