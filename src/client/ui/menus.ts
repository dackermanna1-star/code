import { ACTION_LABELS, DEFAULT_KEYS, keyLabel, saveSettings, type Action, type Settings } from '../settings';

const $ = (id: string) => document.getElementById(id)!;

export function show(id: string, on: boolean) {
  $(id).classList.toggle('hidden', !on);
}

/** Settings screen: sliders, toggles and key rebinding (persisted). */
export class SettingsUI {
  private listening: Action | null = null;
  onChange: () => void = () => undefined;

  constructor(private s: Settings) {
    $('s-close').onclick = () => {
      show('settings', false);
      this.onClose();
    };
    $('s-reset').onclick = () => {
      this.s.keys = { ...DEFAULT_KEYS };
      saveSettings(this.s);
      this.render();
    };
    window.addEventListener('keydown', (e) => {
      if (!this.listening) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape') this.s.keys[this.listening] = e.code;
      this.listening = null;
      saveSettings(this.s);
      this.render();
    }, true);
  }

  onClose: () => void = () => undefined;

  open() {
    this.render();
    show('settings', true);
  }

  private render() {
    const s = this.s;
    const range = (key: keyof Settings, label: string, min: number, max: number, step: number, fmt = (v: number) => String(v)) =>
      `<div class="set"><span>${label}</span><span><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}" /> <b data-v="${key}">${fmt(s[key] as number)}</b></span></div>`;
    const check = (key: keyof Settings, label: string) => `<div class="set"><span>${label}</span><input type="checkbox" data-c="${key}" ${s[key] ? 'checked' : ''} /></div>`;
    let html = '<h3>Gameplay</h3>' +
      range('sensitivity', 'Mouse sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2)) +
      range('fov', 'Field of view', 55, 110, 1) +
      check('invertY', 'Invert mouse Y') +
      '<h3>Graphics</h3>' +
      range('renderDistance', 'Render distance (chunks)', 3, 10, 1) +
      range('pixelRatio', 'Resolution scale', 0.5, 2, 0.25, (v) => `${Math.round(v * 100)}%`) +
      check('ao', 'Ambient occlusion') +
      check('showFps', 'Show FPS / stats') +
      '<h3>Audio</h3>' +
      range('volume', 'Master volume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`) +
      range('sfxVolume', 'Effects', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`) +
      range('ambientVolume', 'Ambience', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`) +
      range('musicVolume', 'Music', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`) +
      '<h3>Controls (click to rebind, Esc to cancel)</h3>';
    for (const a of Object.keys(ACTION_LABELS) as Action[]) {
      html += `<div class="set"><span>${ACTION_LABELS[a]}</span><button class="bind ${this.listening === a ? 'listening' : ''}" data-a="${a}">${this.listening === a ? 'press a key…' : keyLabel(s.keys[a])}</button></div>`;
    }
    const body = $('settings-body');
    body.innerHTML = html;
    body.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((el) => {
      el.oninput = () => {
        const k = el.dataset.k as keyof Settings;
        (s as unknown as Record<string, number>)[k] = Number(el.value);
        const out = body.querySelector(`[data-v="${k}"]`);
        if (out) out.textContent = k === 'sensitivity' ? Number(el.value).toFixed(2) : ['volume', 'sfxVolume', 'ambientVolume', 'musicVolume', 'pixelRatio'].includes(k) ? `${Math.round(Number(el.value) * 100)}%` : el.value;
        saveSettings(s);
        this.onChange();
      };
    });
    body.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((el) => {
      el.onchange = () => {
        (s as unknown as Record<string, boolean>)[el.dataset.c!] = el.checked;
        saveSettings(s);
        this.onChange();
      };
    });
    body.querySelectorAll<HTMLButtonElement>('button.bind').forEach((el) => {
      el.onclick = () => {
        this.listening = el.dataset.a as Action;
        this.render();
      };
    });
  }
}

export function renderHelp(s: Settings) {
  const k = (a: Action) => `<kbd>${keyLabel(s.keys[a])}</kbd>`;
  $('help-body').innerHTML = `
  <h3>Survive</h3>
  <p>You wash up on a beach with a rock, a torch and a bandage. Watch the bars bottom-right: <b>health</b>, <b>calories</b> and <b>water</b>. Hunger and thirst drain over time and faster when sprinting, cold or hot. At zero you take damage.</p>
  <p>Drink from rivers and lakes (${k('interact')} while looking at fresh water — the ocean is salty). Eat berries and mushrooms, hunt animals and <b>cook</b> meat on a campfire: raw meat poisons you.</p>
  <p>Cold biomes and nights need clothing or a fire. Bleeding needs a bandage. Radiation near monuments needs a hazmat suit or anti-rad pills.</p>
  <h3>Gather &amp; craft</h3>
  <p>Hit trees, stone and ore with ${'LMB'}. Resources pay out per hit; better tools pay more. Breaking a tree's base fells the whole tree. Surface boulders hold metal and sulfur ore.</p>
  <p>Open the inventory with ${k('inventory')}. Crafting is on the right: choose a recipe and amount, then Craft. Advanced items need a nearby <b>workbench</b> and a learned <b>blueprint</b> — research items at a Research Table with scrap from barrels and crates.</p>
  <p>Smelt ore into metal fragments and sulfur in a furnace (wood as fuel). Gunpowder = charcoal + sulfur.</p>
  <h3>Build</h3>
  <p>Hold a <b>Building Plan</b>: LMB places the highlighted piece, RMB cycles the piece type, ${k('rotate')} rotates stairs. Start with a foundation on the ground, then walls, a doorway and floors. Pieces start as twig.</p>
  <p>Hold a <b>Hammer</b>: RMB upgrades the piece you look at (wood → stone → sheet metal → armored), LMB repairs, ${k('demolish')} demolishes recently placed pieces. Stability falls the further you build from foundations.</p>
  <p>Place a <b>Claim Totem</b> on a foundation and keep it stocked with materials: it pays upkeep. Without upkeep your base slowly decays. Put doors (RMB on a doorway) and code locks on doors.</p>
  <h3>Fight</h3>
  <p>Monuments (shown on the map ${k('map')}) hold loot crates and armed <b>scavengers</b>. Guns: LMB fire, RMB aim, ${k('reload')} reload. Bullets travel and drop. Headshots hurt more. Crouch (${k('crouch')}) to stay unseen.</p>
  <p>Explosives (LMB to throw) stick to walls and breach structures — the stronger the tier, the more charges it takes.</p>
  <h3>Controls</h3>
  <p>${k('forward')}${k('left')}${k('back')}${k('right')} move · ${k('jump')} jump/swim · ${k('sprint')} sprint · ${k('crouch')} crouch · 1–6 / wheel select belt · ${k('interact')} use/open/pick up · ${k('drop')} drop held · ${k('chat')} console (/help) · Esc pause.</p>
  <p>If you die, your items stay in your body — go back and loot it. Respawn at a sleeping bag to stay close.</p>`;
}
