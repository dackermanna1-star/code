// Art facade (HW.art). Implementations live in sibling modules; each exports the functions imported
// here. This file is a stable contract owned by the lead — implementers change their own modules only.
import * as tiles from './tiles.js';
import * as props from './props.js';
import * as sprites from './sprites.js';
import * as portraits from './portraits.js';
import * as cg from './cg.js';
import * as icons from './icons.js';

export const art = {
  async init(onProgress) {
    const steps = [tiles.initTiles, props.initProps, sprites.initSprites, portraits.initPortraits, cg.initCg, icons.initIcons];
    for (let i = 0; i < steps.length; i++) {
      await steps[i]();
      onProgress?.((i + 1) / steps.length);
      await new Promise((r) => setTimeout(r, 0)); // let the loading bar paint
    }
  },
  drawTile: (ctx, key, px, py, opts) => tiles.drawTile(ctx, key, px, py, opts || {}),
  prop: (type, opts) => props.getProp(type, opts || {}),
  drawPropDynamic: (ctx, type, px, py, params, t) => props.drawPropDynamic(ctx, type, px, py, params || {}, t || 0),
  sprite: (id) => sprites.getSprite(id),
  portrait: (char, expr, opts) => portraits.getPortrait(char, expr, opts || {}),
  cg: (id) => cg.getCg(id),
  icon: (id) => icons.getIcon(id),
  glyph: (name) => icons.getGlyph(name),
};
export default art;
