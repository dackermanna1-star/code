/** Cinematic camera panel (F10): record keyframes, play, save and replay paths. */
import { Modal } from './modal';
import type { CinematicDirector, CameraPath } from '../sim/cinematic';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface CinemaActions {
  addKey: () => void;
  play: (p: CameraPath) => void;
  stop: () => void;
}

export class CinemaPanel {
  readonly modal: Modal;
  letterbox = true;

  constructor(parent: HTMLElement, private dir: CinematicDirector, private actions: CinemaActions) {
    this.modal = new Modal(parent, 'Cinematic camera', 'cinema-modal');
    this.modal.onOpen = () => this.render();
    dir.onChange = () => { if (this.modal.isOpen) this.render(); };
    this.modal.content.addEventListener('click', (e) => this.onClick(e));
    this.modal.content.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement | HTMLSelectElement;
      if (el.name === 'segment') { dir.current.segment = +el.value; this.render(); }
      if (el.name === 'lapse') dir.current.timeLapse = +el.value;
      if (el.name === 'letterbox') this.letterbox = (el as HTMLInputElement).checked;
    });
  }

  render() {
    const c = this.dir.current;
    const lapses = [[1, 'real time'], [60, '1 min / s'], [3600, '1 h / s'], [86400, '1 day / s'], [2.6e6, '1 month / s']] as const;
    this.modal.content.innerHTML = `
      <p class="dim">Fly to a viewpoint and press <kbd>[</kbd> (or “Add keyframe”) to record it. Keyframes follow their planet, so a path recorded
      around a moving world stays framed. <kbd>]</kbd> plays and stops. Hide the interface with <kbd>F2</kbd> for clean footage.</p>
      <div class="field"><label>Keyframes</label><div class="ctl mono">${c.keys.length}</div></div>
      <div class="field"><label for="seg">Seconds per segment</label><div class="ctl"><input id="seg" name="segment" type="range" min="1" max="30" step="0.5" value="${c.segment}" /><output>${c.segment.toFixed(1)} s</output></div></div>
      <div class="field"><label for="lapse">Time-lapse during playback</label><div class="ctl"><select id="lapse" name="lapse">${lapses.map(([v, l]) => `<option value="${v}" ${v === c.timeLapse ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="field"><label for="lb">Letterbox</label><div class="ctl"><input id="lb" name="letterbox" type="checkbox" ${this.letterbox ? 'checked' : ''} /></div></div>
      <div class="row-btns">
        <button data-a="add" class="primary">Add keyframe</button>
        <button data-a="play" ${c.keys.length < 2 ? 'disabled' : ''}>${this.dir.playing ? 'Stop' : 'Play'}</button>
        <button data-a="save" ${c.keys.length < 2 ? 'disabled' : ''}>Save path…</button>
        <button data-a="clear">Clear</button>
      </div>
      <h3>Saved paths</h3>
      <div class="cat-list">${this.dir.saved.map((p) => `<div class="cat-item"><div class="ci-main"><div class="ci-name">${esc(p.name)}</div>
        <div class="ci-sub dim">${p.keys.length} keyframes · ${(p.segment * (p.keys.length - 1)).toFixed(0)} s${p.timeLapse > 1 ? ' · time-lapse' : ''}</div></div>
        <div class="ci-act"><button data-play="${esc(p.id)}">Play</button><button data-del="${esc(p.id)}" title="Delete">🗑</button></div></div>`).join('') || '<p class="dim">No saved paths.</p>'}</div>`;
  }

  private onClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    const a = t.dataset.a;
    if (a === 'add') this.actions.addKey();
    else if (a === 'play') { if (this.dir.playing) this.actions.stop(); else { this.modal.close(); this.actions.play(this.dir.current); } }
    else if (a === 'save') { const n = window.prompt('Path name', this.dir.current.name); if (n) this.dir.saveCurrent(n); }
    else if (a === 'clear') this.dir.clear();
    else if (t.dataset.play) { const p = this.dir.saved.find((x) => x.id === t.dataset.play); if (p) { this.modal.close(); this.actions.play(p); } }
    else if (t.dataset.del) this.dir.remove(t.dataset.del);
  }
}
