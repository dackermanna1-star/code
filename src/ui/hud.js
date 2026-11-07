// STUB — replaced by the HUD / menus module.
export async function init(app) {
  const root = document.getElementById('hud');
  if (app.debug.autostart || app.debug.noui) return { stub: true };
  const b = document.createElement('button');
  b.textContent = 'Board the aircraft';
  b.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:16px 28px;font-size:18px;';
  b.onclick = () => { b.remove(); app.started = true; app.events.emit('app:start', {}); app.input.setMode('play'); };
  root.appendChild(b);
  return { stub: true };
}
