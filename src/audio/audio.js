// STUB — replaced by the audio agent. Full API: docs/TECH.md §10.
const handle = () => ({ stop() {}, setPos() {}, setVol() {} });
export const audio = {
  ready: false,
  occluder: null,
  init() {}, unlock() { this.ready = true; }, update() {},
  sfx() { return handle(); }, loop() { return handle(); },
  ambience() {}, music() {}, silence() {}, duck() {},
  footstep() {}, blip() {}, murmur() {},
  setListener() {}, setVolumes() {},
  async renderOffline() { return new Float32Array(0); },
};
export default audio;
