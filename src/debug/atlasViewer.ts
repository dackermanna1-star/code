import { CharacterLibrary } from '../character/library';
import { registerVariants } from '../character/variants';
import { paintCharacter } from '../character/texture';

/** Debug page: ?viewer=atlas&variant=NAME - the painted layers (colour and finish mask) of a variant. */
export function runAtlasViewer(params: URLSearchParams) {
  const lib = new CharacterLibrary();
  registerVariants(lib);
  const v = lib.get(params.get('variant') ?? 'player');
  const layers = paintCharacter(v.outfit, v.def.spec, v.hiFace);
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;background:#222;padding:6px';
  const which = params.get('show') ?? 'all';
  for (const l of layers) {
    if (which !== 'mask') wrap.appendChild(l.color);
    if (which !== 'color') wrap.appendChild(l.mask);
  }
  document.body.appendChild(wrap);
  (window as unknown as { __ready: boolean }).__ready = true;
}
