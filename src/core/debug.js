// URL parameters for testing / screenshots. Examples:
//   ?autostart=1&quality=low&phase=cruise&seat=16A&look=80,-5&tod=18.6&mute=1
//   ?phase=approach&progress=0.5&cam=cinematic&timescale=5&shot=1
//   ?pos=0,1.66,-3&look=0,0     (standing at a cabin position, yaw/pitch in degrees)
export function parseDebugParams() {
  const p = new URLSearchParams(location.search);
  const num = (k) => (p.has(k) ? Number(p.get(k)) : undefined);
  const list = (k) => (p.has(k) ? p.get(k).split(',').map(Number) : undefined);
  return {
    autostart: p.get('autostart') === '1',
    quality: p.get('quality') || undefined,
    phase: p.get('phase') || undefined,
    progress: num('progress'),
    seat: p.get('seat') || undefined,
    pos: list('pos'),
    look: list('look'),
    cam: p.get('cam') || undefined,
    tod: num('tod'),
    weather: p.get('weather') || undefined,
    timescale: num('timescale'),
    mute: p.get('mute') === '1',
    shot: p.get('shot') === '1',
    fps: p.get('fps') === '1',
    colliders: p.get('colliders') === '1',
    paused: p.get('paused') === '1',
    noui: p.get('noui') === '1',
    reversedDepth: p.has('reversedDepth') ? p.get('reversedDepth') !== '0' : undefined,
    module: p.get('module') || undefined,   // free-form flag for module-specific debugging
    raw: p,
  };
}
