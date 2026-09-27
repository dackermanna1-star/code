// Placeholder-free minimal audio facade; replaced by the full procedural engine in audioEngine.js.
export class NullAudio {
  play() {}
  update() {}
  setReverb() {}
  music() {}
  loop() { return { stop() {}, set() {} }; }
  stopAll() {}
}
