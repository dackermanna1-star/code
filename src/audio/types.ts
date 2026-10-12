// Shared audio type definitions (re-exported from ./audio).

export type SoundName =
  | 'cast_spark' | 'cast_generic' | 'cast_heavy' | 'cast_fire' | 'cast_bomb' | 'cast_dig' | 'cast_electric' | 'cast_ice'
  | 'cast_heal' | 'cast_teleport' | 'cast_material' | 'not_enough_mana'
  | 'impact_small' | 'impact_dirt' | 'explosion_small' | 'explosion_big' | 'dig' | 'chainsaw'
  | 'fire_ignite' | 'fire_crackle' | 'water_splash' | 'liquid_pour' | 'steam_hiss' | 'electric_zap' | 'freeze' | 'glass_break' | 'acid_sizzle'
  | 'enemy_alert' | 'enemy_melee' | 'enemy_shoot' | 'enemy_hurt' | 'enemy_death' | 'creature_screech'
  | 'player_hurt' | 'player_death' | 'footstep' | 'jump' | 'land' | 'levitate' | 'kick'
  | 'pickup_gold' | 'pickup_item' | 'pickup_spell' | 'pickup_heart' | 'wand_edit' | 'potion_throw' | 'drink'
  | 'ui_click' | 'ui_hover' | 'ui_open' | 'perk_pick' | 'heal' | 'holy_mountain' | 'gods_angry' | 'collapse' | 'teleport' | 'win' | 'gold_despawn';

export interface PlayOpts {
  x?: number;
  y?: number;
  z?: number;
  /** Linear gain multiplier (default 1). Values > 1 are allowed but clamped to 4. */
  volume?: number;
  /** Pitch/frequency multiplier (default 1). */
  pitch?: number;
}

export type LoopKey = 'fire' | 'liquid' | 'levitate' | 'chainsaw' | 'steam' | 'wind';

export type AmbienceId =
  | 'menu' | 'surface' | 'mines' | 'coalpits' | 'snow' | 'hiisi' | 'jungle' | 'vault' | 'holymountain' | 'none';

export interface AudioStats {
  /** SFX voices currently allocated. */
  voices: number;
  /** Fresh voices started (cumulative). */
  played: number;
  /** Plays rejected by rate limiting / voice cap (cumulative). */
  dropped: number;
  /** Plays folded into an already-playing instance of the same sound (cumulative). */
  merged: number;
  /** Plays skipped because they were too far away / too quiet (cumulative). */
  culled: number;
}
