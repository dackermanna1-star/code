// Saves live in localStorage. Every access is guarded: storage can be unavailable (private
// windows, sandboxed previews) and the game must keep working without it.
const SAVE_KEY = 'levelzero.save.v1';
const SETTINGS_KEY = 'levelzero.settings.v1';

function read(key) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
function write(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; }
}

export const loadSave = () => read(SAVE_KEY);
export const writeSave = (data) => write(SAVE_KEY, data);
export const loadSettings = () => read(SETTINGS_KEY);
export const writeSettings = (s) => write(SETTINGS_KEY, s);
