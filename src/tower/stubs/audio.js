// Stand-in audio: the sandbox's procedural engine with a few mappings.
import { AudioEngine } from '../../game/audio.js';

export class TowerAudio {
  constructor() {
    this.e = new AudioEngine();
  }
  unlock() {
    this.e.unlock();
  }
  setVolume(v) {
    this.e.setVolume(v);
  }
  setListener(p, f) {
    this.e.setListener(p, f);
  }
  rifle() {
    this.e.gunshot('sniper', null);
  }
  bolt() {
    this.e.gunHandling('charge', 'rifle');
  }
  magOut() {
    this.e.gunHandling('magOut', 'rifle');
  }
  magIn() {
    this.e.gunHandling('magIn', 'rifle');
  }
  dryFire() {
    this.e.gunHandling('dry', 'rifle');
  }
  bulletImpact(m, p) {
    this.e.bulletImpact(m === 'flesh' ? 'flesh' : 'ground', p, 0.6);
  }
  headshotCrack(p) {
    this.e.bulletImpact('bone', p, 1);
  }
  zombieGroan(k, p) {
    this.e.zombieGroan(k === 'brute' ? 'brute' : 'walker', p, 0.6);
  }
  zombieScream(p) {
    this.e.zombieSnarl('runner', p);
  }
  bossRoar(k, p) {
    this.e.zombieSnarl('brute', p);
  }
  gateHit() {
    this.e.impact('wood', 0.8, null);
  }
  gateBreak() {}
  explosion(p) {
    this.e.impact('metal', 1, p);
    this.e.bodyFall(1, p);
  }
  fire() {}
  bodyFall(p, i) {
    this.e.bodyFall(i, p);
  }
  boneCrack(p, i) {
    this.e.boneCrack(i, p);
  }
  ambience() {}
  horde() {}
  waveSiren() {
    this.e.sting('wave');
  }
  waveCleared() {
    this.e.sting('clear');
  }
  cash() {}
  ui() {}
  heartbeat(r) {
    this.e.heartbeat(r);
  }
  breathHold() {}
  slowMo() {}
  music() {}
}
