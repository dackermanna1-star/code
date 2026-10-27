/** Title screen: continue, start a new journey (known or procedural universe), settings, controls. */
export interface StartActions {
  canContinue: boolean;
  continueJourney: () => void;
  newKnown: () => void;
  newProcedural: (seed: number) => void;
  settings: () => void;
  help: () => void;
}

export class StartScreen {
  readonly root: HTMLElement;
  isOpen = false;

  constructor(parent: HTMLElement, private actions: StartActions) {
    this.root = document.createElement('div');
    this.root.className = 'start-screen';
    this.root.innerHTML = `
      <div class="start-inner">
        <h1>INFINITE&nbsp;COSMOS</h1>
        <p class="tag">A physically based, seamlessly explorable universe — from pebbles to superclusters.</p>
        <div class="start-btns">
          <button class="primary big" data-a="continue" ${actions.canContinue ? '' : 'hidden'}>Continue journey</button>
          <button class="big ${actions.canContinue ? '' : 'primary'}" data-a="known">Known Universe<small>Solar System, real stars, exoplanets and the Local Group, embedded in a procedural cosmos</small></button>
          <button class="big" data-a="proc">Procedural Universe<small>A new universe from a seed — every galaxy, star and world generated</small></button>
          <div class="seed-row"><label for="seed-in">Seed</label><input id="seed-in" type="number" value="${Math.floor(Math.random() * 1e9)}" /><button data-a="dice" title="Random seed">⚄</button></div>
          <div class="start-small"><button data-a="settings">Settings</button><button data-a="help">Controls</button></div>
        </div>
        <p class="fine dim">Speculative technology (warp drive, hyperspace jumps) is fiction and labelled as such. Catalogued objects use real data; everything else is generated from physical models.</p>
      </div>`;
    this.root.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
      if (!a) return;
      const seedIn = this.root.querySelector('#seed-in') as HTMLInputElement;
      switch (a.dataset.a) {
        case 'continue': this.close(); actions.continueJourney(); break;
        case 'known': this.close(); actions.newKnown(); break;
        case 'proc': this.close(); actions.newProcedural(Math.floor(+seedIn.value) || 1); break;
        case 'dice': seedIn.value = String(Math.floor(Math.random() * 1e9)); break;
        case 'settings': actions.settings(); break;
        case 'help': actions.help(); break;
      }
    });
    this.root.style.display = 'none';
    parent.appendChild(this.root);
  }

  open() {
    this.isOpen = true;
    this.root.style.display = '';
    this.root.parentElement?.classList.add('starting');
    (this.root.querySelector('.start-btns button:not([hidden])') as HTMLElement | null)?.focus();
  }

  close() {
    this.isOpen = false;
    this.root.style.display = 'none';
    this.root.parentElement?.classList.remove('starting');
  }
}
