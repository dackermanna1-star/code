// Physical and astronomical constants (SI units unless noted).
export const G = 6.6743e-11;
export const C_LIGHT = 299_792_458;
export const SIGMA_SB = 5.670374419e-8;
export const K_B = 1.380649e-23;
export const AMU = 1.6605390666e-27;

export const AU = 1.495978707e11;
export const LY = 9.4607304725808e15;
export const PC = 3.0856775814913673e16;
export const KPC = PC * 1e3;
export const MPC = PC * 1e6;

export const SOLAR_MASS = 1.98847e30;
export const SOLAR_RADIUS = 6.957e8;
export const SOLAR_LUMINOSITY = 3.828e26;
export const SOLAR_TEMP = 5772;
export const SOLAR_CONSTANT = SOLAR_LUMINOSITY / (4 * Math.PI * AU * AU); // W/m^2 at 1 AU

export const EARTH_MASS = 5.9722e24;
export const EARTH_RADIUS = 6.371e6;
export const EARTH_G = 9.80665;
export const JUPITER_MASS = 1.89813e27;
export const JUPITER_RADIUS = 7.1492e7;

export const DAY = 86400;
export const YEAR = 365.25 * DAY;
export const GYR = 1e9 * YEAR;

/** Seconds since J2000.0 (2000-01-01T12:00:00 TT, approximated as UTC). */
export function unixMsToJ2000Seconds(ms: number): number {
  return (ms - Date.UTC(2000, 0, 1, 12, 0, 0)) / 1000;
}
