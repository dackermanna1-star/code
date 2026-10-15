// Single-file quick-test entry: serves embedded assets through a fetch shim, presets ?quick=1,
// and adds a click-to-play overlay with controls. Built by tools/singlefile/build.mjs.
import { EMBED } from './.gen/embedded';

const MIME: Record<string, string> = { glb: 'model/gltf-binary', json: 'application/json', png: 'image/png', jpg: 'image/jpeg' };
const cache = new Map<string, Uint8Array>();
function bytes(key: string): Uint8Array {
  let b = cache.get(key);
  if (!b) {
    const bin = atob(EMBED[key]);
    b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    cache.set(key, b);
  }
  return b;
}

const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const m = /(?:^|\/)(assets\/[^?#]+)/.exec(url);
  if (m) {
    const key = decodeURIComponent(m[1]);
    if (key in EMBED) {
      const ext = key.split('.').pop() ?? '';
      return new Response(bytes(key) as BodyInit, { status: 200, headers: { 'content-type': MIME[ext] ?? 'application/octet-stream' } });
    }
    return new Response('', { status: 404, statusText: 'not embedded' });
  }
  return realFetch(input as RequestInfo, init);
}) as typeof fetch;

(window as any).__BOOT_FLAGS__ = 'quick=1';

function overlay(): void {
  const el = document.createElement('div');
  el.id = 'qt-overlay';
  el.style.cssText =
    'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);font:15px/1.5 system-ui,sans-serif;color:#eee;cursor:pointer';
  el.innerHTML = `<div style="max-width:560px;background:rgba(15,18,22,.92);padding:26px 32px;border:1px solid #555;border-radius:6px">
    <div style="font-size:26px;font-weight:700;letter-spacing:2px;margin-bottom:6px">BATTLEGROUNDS — quick test</div>
    <div style="color:#bbb;margin-bottom:14px">Early build: island + character movement & camera only (no weapons, loot, bots, buildings or trees yet).</div>
    <table style="border-spacing:14px 2px;margin-left:-14px">
      <tr><td><b>WASD</b></td><td>move</td><td><b>Shift</b></td><td>sprint</td></tr>
      <tr><td><b>Ctrl</b></td><td>walk</td><td><b>Space</b></td><td>jump / vault / climb</td></tr>
      <tr><td><b>C</b></td><td>crouch</td><td><b>Z</b></td><td>prone</td></tr>
      <tr><td><b>Q / E</b></td><td>lean</td><td><b>V</b></td><td>1st / 3rd person</td></tr>
      <tr><td><b>Alt</b></td><td>free look</td><td><b>RMB</b></td><td>aim</td></tr>
      <tr><td><b>Esc</b></td><td>release mouse</td><td></td><td></td></tr>
    </table>
    <div style="margin-top:16px;font-size:18px;text-align:center;color:#ffd75e" id="qt-msg">Loading the island…</div></div>`;
  document.body.appendChild(el);
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const lock = () => (canvas as any).requestPointerLock?.();
  el.addEventListener('click', lock);
  canvas.addEventListener('click', lock);
  document.addEventListener('pointerlockchange', () => {
    el.style.display = document.pointerLockElement === canvas ? 'none' : 'flex';
  });
  const msg = el.querySelector('#qt-msg') as HTMLElement;
  const poll = setInterval(() => {
    const g = (window as any).__game?.ctx;
    if (g?.player) {
      msg.textContent = 'Click to play';
      clearInterval(poll);
    }
  }, 300);
}

overlay();
import('../../src/main');
