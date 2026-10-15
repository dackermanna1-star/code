// Gerstner wave set shared by the water vertex shader and the CPU (getWaterHeight for swimming/boats).

export interface Wave {
  /** Direction (unit) the wave travels toward. */
  dx: number;
  dz: number;
  wavelength: number;
  amplitude: number;
  /** 0..1 Gerstner steepness (crest sharpness). */
  steepness: number;
}

export const WAVES: Wave[] = [
  { dx: 0.8, dz: 0.6, wavelength: 62, amplitude: 0.32, steepness: 0.45 },
  { dx: 0.4, dz: 0.92, wavelength: 37, amplitude: 0.18, steepness: 0.5 },
  { dx: 0.98, dz: -0.2, wavelength: 21, amplitude: 0.09, steepness: 0.55 },
  { dx: 0.55, dz: 0.83, wavelength: 11, amplitude: 0.04, steepness: 0.6 },
];

const G = 9.81;

/** Vertical displacement of the wave set at (x, z), time t, scaled by `amp` (0 = calm). */
export function waveHeight(x: number, z: number, t: number, amp: number): number {
  if (amp <= 0) return 0;
  let y = 0;
  for (const w of WAVES) {
    const k = (2 * Math.PI) / w.wavelength;
    const c = Math.sqrt(G / k);
    const f = k * (w.dx * x + w.dz * z - c * t);
    y += w.amplitude * Math.sin(f);
  }
  return y * amp;
}

/** GLSL constants/functions for the same wave set. */
export function wavesGlsl(): string {
  const lines = WAVES.map(
    (w, i) =>
      `const vec4 WAVE${i} = vec4(${w.dx.toFixed(4)}, ${w.dz.toFixed(4)}, ${w.wavelength.toFixed(3)}, ${w.amplitude.toFixed(4)}); const float WSTEEP${i} = ${w.steepness.toFixed(3)};`,
  );
  const calls = WAVES.map((_, i) => `  gerstner( WAVE${i}, WSTEEP${i}, p, t, amp, pos, tang, bitang );`).join('\n');
  return `
${lines.join('\n')}
void gerstner( vec4 w, float steep, vec2 p, float t, float amp, inout vec3 pos, inout vec3 tang, inout vec3 bitang ) {
  float k = 6.28318530718 / w.z;
  float c = sqrt( 9.81 / k );
  vec2 d = w.xy;
  float f = k * ( dot( d, p ) - c * t );
  float a = w.w * amp;
  float q = steep / ( k * max( w.w, 1e-4 ) * ${WAVES.length.toFixed(1)} );
  float s = sin( f ), co = cos( f );
  pos.x += q * a * d.x * co;
  pos.z += q * a * d.y * co;
  pos.y += a * s;
  tang += vec3( - q * d.x * d.x * k * a * s, d.x * k * a * co, - q * d.x * d.y * k * a * s );
  bitang += vec3( - q * d.x * d.y * k * a * s, d.y * k * a * co, - q * d.y * d.y * k * a * s );
}
void wavesAt( vec2 p, float t, float amp, out vec3 offset, out vec3 normal ) {
  vec3 pos = vec3( 0.0 );
  vec3 tang = vec3( 1.0, 0.0, 0.0 );
  vec3 bitang = vec3( 0.0, 0.0, 1.0 );
${calls}
  offset = pos;
  normal = normalize( cross( bitang, tang ) );
}
`;
}
