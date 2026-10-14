// Debug and test hooks for the Chinatown map script, exposed by the app as
// window.doom.ct (tools/ct/SPEC.md section 11):
//   state()      the objective state (stage, flags, timers, waves) or null
//   goto(stage)  teleport to the start of a stage (1-6; 7 the radio
//                hold-out, 8 the helicopter waiting) with every earlier
//                objective done; returns the new state

export function ctDebug(game) {
  const script = () => {
    const w = game.world;
    return game.state === 'level' && w && w.ct && w.ct.script ? w.ct.script : null;
  };
  return {
    state() {
      const s = script();
      return s ? s.state() : null;
    },
    goto(stage) {
      const s = script();
      if (!s) throw new Error('not playing the Chinatown map');
      return s.goto(stage);
    },
  };
}
