/**
 * Photometric helpers: visual (photopic) efficacy of a blackbody relative to
 * the Sun, and absolute visual magnitudes. Used so that red dwarfs look as
 * dim to the eye as they really are (most of their output is infrared).
 */
const H = 6.62607015e-34, C = 299792458, KB = 1.380649e-23;

function planck(lambda: number, T: number) {
  return 1 / (Math.pow(lambda, 5) * (Math.exp((H * C) / (lambda * KB * T)) - 1));
}
// CIE photopic luminosity function approximation (λ in µm)
function photopic(lum: number) {
  return 1.019 * Math.exp(-285.4 * (lum - 0.559) ** 2);
}
function visualFraction(T: number) {
  let num = 0;
  for (let l = 380; l <= 780; l += 5) {
    const lam = l * 1e-9;
    num += planck(lam, T) * photopic(l / 1000) * 5e-9;
  }
  // total ∝ σT⁴ / (2πhc²)·… : normalise with the analytic integral of B_λ
  const total = (Math.PI ** 4 / 15) * Math.pow((KB * T) / (H * C), 4);
  return num / total;
}

const TABLE: number[] = [];
const T_MIN = 300, T_MAX = 60000, NT = 256;
let SUN = 1;
function build() {
  for (let i = 0; i < NT; i++) {
    const T = T_MIN * Math.pow(T_MAX / T_MIN, i / (NT - 1));
    TABLE.push(visualFraction(T));
  }
  SUN = visualFraction(5772);
}
build();

/** Fraction of bolometric output that the eye perceives, relative to the Sun (Sun = 1). */
export function visualEfficacy(T: number): number {
  if (!(T > 0)) return 0;
  const x = (Math.log(Math.min(Math.max(T, T_MIN), T_MAX) / T_MIN) / Math.log(T_MAX / T_MIN)) * (NT - 1);
  const i = Math.min(NT - 2, Math.floor(x));
  const f = x - i;
  return (TABLE[i] * (1 - f) + TABLE[i + 1] * f) / SUN;
}

/** Absolute visual magnitude from bolometric luminosity (L☉) and temperature. */
export function absMagV(lumSun: number, T: number): number {
  const lv = lumSun * visualEfficacy(T);
  if (lv <= 0) return 99;
  return 4.83 - 2.5 * Math.log10(lv);
}
