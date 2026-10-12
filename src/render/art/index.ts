// Procedural pixel art (UI icons, wand sprites, menu backdrop). Everything is generated in code and is
// deterministic from its inputs; PixelImage works in Node, toCanvas/toDataURL/drawMenuBackdrop need a DOM.
export * from './pixels';
export { spellIcon, spellGlyph, spellFrame, hasSpellGlyph, SPELL_GLYPH_IDS, SPELL_TYPE_COLORS, SPELL_ICON_SIZE } from './spellIcons';
export type { SpellIconType } from './spellIcons';
export { wandSprite, wandSpriteInfo, wandPixelsForVoxel, WAND_OUTLINE } from './wandSprite';
export type { WandSpriteStats, WandSpriteInfo, WandMaterial } from './wandSprite';
export { potionIcon, goldIcon, heartIcon, chestIcon, perkIcon, refresherIcon, orbIcon, PERK_ICON_IDS, ITEM_ICON_SIZE } from './itemIcons';
export { drawMenuBackdrop, resetMenuBackdrop } from './logo';
