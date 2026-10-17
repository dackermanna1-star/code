// Outfit/material ramps for the four friends as they appear in CGs — the same materials the sprite
// and portrait rigs use (sprites_friends.js / portraits_*.js), so the kids read as the same people.
// Each ramp runs dark → light (5 steps) and is used with cg_kit shade().
import { PAL, mix, rampStops } from './cg_kit.js';

export const CAST = {
  // Tess: copper hair, light-wash denim jacket (her dad's), black tee/jeans, black high-tops w/ white soles
  tessHair: rampStops([PAL.hair_r_dd, PAL.hair_r_d, PAL.hair_r, PAL.hair_r_l, PAL.hair_r_ll], 5),
  denim: rampStops([mix(PAL.denim_d, PAL.blue_dd, 0.5), PAL.denim_d, PAL.denim, PAL.denim_l, PAL.denim_ll], 5),
  black: rampStops([PAL.ink, PAL.night, PAL.shadow, PAL.g1, PAL.g2], 5),
  skin: rampStops([PAL.skin_dd, PAL.skin_d, PAL.skin, PAL.skin_l, mix(PAL.skin_l, PAL.white, 0.4)], 5),
  dskin: rampStops([PAL.dskin_dd, PAL.dskin_d, PAL.dskin, PAL.dskin_l, mix(PAL.dskin_l, PAL.skin_d, 0.5)], 5),
  canvas: rampStops(['#1c1d0f', '#30311a', '#484826', '#626034', '#7e7c46'], 5),     // olive bag
  // Danny: backwards red cap, midnight-green Starter jacket w/ silver trim, light ripped jeans, white kicks
  cap: rampStops([PAL.blood_d, PAL.red_d, PAL.red, PAL.red_l, '#e06a5a'], 5),
  eagles: rampStops(['#08171a', '#0e2b2c', '#15433f', '#226058', '#3a8075'], 5),
  silver: rampStops([PAL.g2, PAL.g3, PAL.g5, PAL.g6, PAL.white], 5),
  jeans: rampStops([PAL.denim_d, PAL.denim, PAL.denim_l, PAL.denim_ll, mix(PAL.denim_ll, PAL.white, 0.5)], 5),
  dannyHair: rampStops([PAL.hair_b, mix(PAL.hair_b, PAL.hair_b_l, 0.5), PAL.hair_b_l, mix(PAL.hair_b_l, PAL.tan, 0.4), PAL.tan], 5),
  // Leah: dark bob, round wire glasses, oversized gray cardigan, plaid skirt, black tights, cherry-red Docs
  leahHair: rampStops([PAL.ink, PAL.hair_k, PAL.hair_k_l, mix(PAL.hair_k_l, PAL.g3, 0.5), PAL.g4], 5),
  cardigan: rampStops(['#232227', '#3a393f', '#56545b', '#77747a', '#98949a'], 5),
  plaid: rampStops(['#141822', '#202a36', '#2c3a44', '#3e4e52', '#566460'], 5),
  plaidLine: rampStops(['#3a1416', '#5a2020', '#7a3a2a', '#9a5a3a', '#b87a4c'], 5),
  docs: rampStops([PAL.velvet_d, PAL.red_d, PAL.red, PAL.red_l, '#e06a5e'], 5),
  // Marcus: tall, dark skin, olive M-65 field jacket, black knit beanie, headphones round his neck
  olive: rampStops(['#1c1d0f', '#30311a', '#484826', '#626034', '#7e7c46'], 5),
  beanie: rampStops(['#08080b', '#121216', '#1c1c22', '#2c2c34', '#40404a'], 5),
  work: rampStops([PAL.brown_dd, PAL.brown_d, PAL.tan, PAL.tan_l, PAL.maple_l], 5),
  // the Colonel's coat
  navy: rampStops([PAL.navy_dd, PAL.navy_d, PAL.navy, PAL.navy_l, mix(PAL.navy_l, PAL.blue_l, 0.5)], 5),
  sash: rampStops([PAL.blood_d, PAL.velvet_d, PAL.crimson, PAL.crimson_l, mix(PAL.crimson_l, PAL.red_l, 0.6)], 5),
  brass: rampStops([PAL.brass_d, PAL.brass, PAL.gold, PAL.gold_l, PAL.white], 5),
};
