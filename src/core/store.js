// Persistent progress & settings (localStorage, failure-tolerant).

import { SAVE_KEY } from '../config.js';

const DEFAULTS = {
  settings: { volume: 0.7, muted: false, blood: true, shake: true, unlockAll: false, touch: 'auto' },
  levels: {}, // id -> { best, teeth: [bool...], completed }
  character: 'marco',
};

export class Store {
  constructor() {
    this.data = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        this.data = { ...this.data, ...d, settings: { ...this.data.settings, ...(d.settings || {}) } };
      }
    } catch (e) {
      /* storage unavailable: play without saving */
    }
  }

  get settings() {
    return this.data.settings;
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch (e) {
      /* ignore */
    }
  }

  level(id) {
    return this.data.levels[id] || { best: null, teeth: [], completed: false };
  }

  recordFinish(id, time, teeth) {
    const prev = this.level(id);
    const newBest = prev.best == null || time < prev.best;
    const merged = [];
    const n = Math.max(prev.teeth.length, teeth.length);
    for (let i = 0; i < n; i++) merged[i] = !!(prev.teeth[i] || teeth[i]);
    this.data.levels[id] = { best: newBest ? time : prev.best, teeth: merged, completed: true };
    this.save();
    return { newBest, best: this.data.levels[id].best };
  }

  isUnlocked(index, levels) {
    if (this.settings.unlockAll || index === 0) return true;
    const prev = levels[index - 1];
    return !!(prev && this.level(prev.id).completed);
  }

  reset() {
    this.data.levels = {};
    this.save();
  }
}
