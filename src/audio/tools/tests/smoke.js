// Normal session smoke test (rendering on): module errors + audio state after a while.
(async () => {
  const app = __app; await new Promise((r) => setTimeout(r, 15000));
  return { moduleErrors: Object.keys(app.moduleErrors || {}), audioError: (app.moduleErrors || {}).audio || null, frames: app.frame, phase: app.flight.state.phase, stats: app.audio.debug?.stats?.(), api: Object.keys(app.audio) };
})()
