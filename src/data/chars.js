// CHARACTER DEFINITIONS — speaker ids, display names, sprite ids and portrait expression sets.
// Contract between scripts (g.say(id, expr, ...)), UI (dialogue), art (sprites/portraits), audio (blips).
//
// Portrait expressions: every id listed in `expr` MUST exist in art/portraits.js for that character.
// Portrait options (all characters): { light: 'normal'|'dark'|'under'|'fluor'|'red'|'dawn', grime: 0|1|2 }
// Friends also accept { enrolled: true } (pale, glassy, desaturated, faint amber tint at the edges).

export const CHARS = {
  tess: {
    name: 'Tess', color: '#dc6f2c', sprite: 'tess', blip: 'tess',
    expr: [
      'neutral', 'curious', 'talk', 'smirk', 'smile', 'laugh', 'confused', 'skeptical', 'suspicious',
      'worried', 'anxious', 'scared', 'terrified', 'shocked', 'horrified', 'disgusted', 'angry',
      'determined', 'sad', 'crying', 'exhausted', 'dissociated', 'devastated', 'relieved',
      'eyes_shut',   // squeezing her eyes shut (heads-down scenes)
      'look_away',   // gaze averted, guilty (transfer-form moments)
    ],
  },
  danny: {
    name: 'Danny', color: '#5fae6b', sprite: 'danny', blip: 'danny',
    expr: ['neutral', 'grin', 'laugh', 'talk', 'smug', 'nervous', 'worried', 'scared', 'sad', 'serious', 'relieved', 'entranced', 'flicker'],
  },
  leah: {
    name: 'Leah', color: '#c8423b', sprite: 'leah', blip: 'leah',
    expr: ['neutral', 'deadpan', 'smirk', 'talk', 'annoyed', 'worried', 'scared', 'hurt', 'crying', 'smile', 'relieved', 'entranced', 'false'],
    // 'false' = the false Leah in Room 201: perfectly composed, faint wrongness (pupils too still, smile held)
  },
  marcus: {
    name: 'Marcus', color: '#8fb0c9', sprite: 'marcus', blip: 'marcus',
    expr: ['neutral', 'soft_smile', 'talk', 'thoughtful', 'worried', 'scared', 'urgent', 'sad', 'grief', 'determined', 'relieved', 'entranced'],
  },
  colonel: {
    name: 'The Colonel', nameShown: '???', color: '#b22234', sprite: 'colonel', blip: 'colonel',
    // nameShown is used until the flag `colonel_named` is set (he's "???" in early encounters).
    expr: ['serene', 'speaking', 'looking', 'wrong', 'confused', 'dissolving'],
  },
  adair: {
    name: 'Miss Adair', nameShown: '???', color: '#9ec3c9', sprite: 'adair', blip: null,
    expr: ['sad', 'urgent', 'pointing', 'peace'],
  },
  denise: {
    name: 'Denise', color: '#d9b85a', sprite: 'denise', blip: 'denise',
    expr: ['lure', 'wrong', 'peace'],
  },
  kevin: {
    name: 'Safety Patrol', color: '#f06a1c', sprite: 'kevin', blip: null,
    expr: [],
  },
  voice: {
    name: 'INTERCOM', color: '#c4bdb0', sprite: null, blip: 'intercom',
    expr: [], // no portrait: UI shows a speaker-grille icon
  },
};

// Sprite sheet ids that art/sprites.js must provide (see TECH.md §Sprites for animation names).
export const SPRITE_IDS = [
  'tess', 'danny', 'leah', 'marcus',              // party
  'danny_e', 'leah_e', 'marcus_e',                // entranced ("enrolled") variants: pale, slow
  'denise', 'kevin', 'adair',                     // supernatural humans
  'colonel',                                      // the Colonel (large frames)
  'figure79',                                     // faceless 1979 student silhouette (compact past views)
  'husk_a', 'husk_b', 'husk_c', 'husk_d',         // standing/seated husk variants (sizes)
  'breakerboy',                                   // 1894 breaker-boy husk with cap & lamp
];
