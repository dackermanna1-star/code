/** Player-side settings persisted in localStorage (best effort; works without it). */
export interface Settings {
  name: string;
  server: string;
  sensitivity: number;
  fov: number;
  renderDistance: number;
  invertY: boolean;
  volume: number;
  sfxVolume: number;
  ambientVolume: number;
  musicVolume: number;
  ao: boolean;
  pixelRatio: number;
  showFps: boolean;
  keys: Record<Action, string>;
}

export type Action =
  | 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sprint' | 'crouch' | 'inventory' | 'interact'
  | 'reload' | 'map' | 'chat' | 'teamChat' | 'team' | 'drop' | 'demolish' | 'rotate' | 'help';

export const ACTION_LABELS: Record<Action, string> = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right', jump: 'Jump / swim up',
  sprint: 'Sprint', crouch: 'Crouch', inventory: 'Inventory & crafting', interact: 'Use / open / pick up / drink',
  reload: 'Reload', map: 'Map', chat: 'Chat', teamChat: 'Team chat', team: 'Team panel', drop: 'Drop held item',
  demolish: 'Demolish (hammer)', rotate: 'Rotate stairs / cycle tier', help: 'Controls help',
};

export const DEFAULT_KEYS: Record<Action, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sprint: 'ShiftLeft', crouch: 'ControlLeft',
  inventory: 'Tab', interact: 'KeyE', reload: 'KeyR', map: 'KeyM', chat: 'Enter', teamChat: 'KeyY', team: 'KeyT',
  drop: 'KeyG', demolish: 'KeyX', rotate: 'KeyQ', help: 'F1',
};

const DEFAULTS: Settings = {
  name: '',
  server: '',
  sensitivity: 1,
  fov: 75,
  renderDistance: 7,
  invertY: false,
  volume: 0.8,
  sfxVolume: 1,
  ambientVolume: 0.6,
  musicVolume: 0.25,
  ao: true,
  pixelRatio: 1,
  showFps: true,
  keys: { ...DEFAULT_KEYS },
};

const KEY = 'corrode.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { ...DEFAULTS, ...s, keys: { ...DEFAULT_KEYS, ...(s.keys ?? {}) } };
    }
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULTS, keys: { ...DEFAULT_KEYS } };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}

/** Per-browser identity token (proves name ownership to a server). */
export function identityToken(): string {
  const k = 'corrode.identity';
  try {
    let t = localStorage.getItem(k);
    if (!t) {
      const a = new Uint8Array(24);
      crypto.getRandomValues(a);
      t = [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(k, t);
    }
    return t;
  } catch {
    const a = new Uint8Array(24);
    crypto.getRandomValues(a);
    return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}

export function keyLabel(code: string) {
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('Left', ' L').replace('Right', ' R');
}
