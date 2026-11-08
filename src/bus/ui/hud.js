// STUB — replaced by the bus HUD / menus module.
export async function init(app) {
  if (app.debug.autostart || app.debug.noui) return { stub: true };
  const b = document.createElement('button');
  b.textContent = 'Board the coach';
  b.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:16px 28px;font-size:18px;';
  b.onclick = () => { b.remove(); app.started = true; app.events.emit('app:start', {}); app.input.setMode('play'); };
  document.getElementById('hud').appendChild(b);
  return { stub: true };
}
