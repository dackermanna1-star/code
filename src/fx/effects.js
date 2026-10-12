// Placeholder effects layer.
export function createEffects() {
  const noop = () => {};
  return new Proxy({}, { get: (t, k) => (k === 'stagger' || k === 'bloodColorFor' ? () => false : noop) });
}
