// ITEM CATALOG — ids are contracts used by scripts (g.give/g.take/g.has), maps (pickup.item),
// UI (inventory), art (art/icons.js draws an icon per id) and endings.
//
// desc may be a string or a function (state) => string for chapter-dependent descriptions.
// `examine` (optional) is a script id run when the player chooses "Examine" in the inventory.
// `use` (optional) is a script id or engine action run when the player chooses "Use".
// Final in-character text is owned by the lore/narrative pass; keep ids stable.

export const ITEMS = {
  flashlight:      { name: 'Maglite', key: true, use: 'engine:toggle_flashlight',
                     desc: "Dad's flashlight. Heavy enough to count as a weapon, if I were the kind of person who hit things." },
  sketchbook:      { name: 'Sketchbook', key: true, use: 'engine:open_sketchbook',
                     desc: 'Half drawings, half lists. Now also a map of a building that keeps changing its mind.' },
  compact:         { name: "Mom's Compact", key: true, use: 'engine:use_compact',
                     desc: (s) => s.flags.compact_unlocked
                       ? "Mom's compact. In it, the school remembers October 19, 1979."
                       : "Mom's compact mirror. The glass has a crack across it. I've been meaning to buy her a new one." },
  transfer_form:   { name: 'Transfer Form', key: true,
                     desc: (s) => s.flags.form_used
                       ? 'Somebody else\'s name in my handwriting, over mine.'
                       : 'PA Student Withdrawal/Transfer Form. Mom signed it. I was supposed to hand it in Monday.' },
  mixtape:         { name: "Leah's Mixtape", key: true, examine: 'item.mixtape',
                     desc: (s) => s.flags.bond_leah
                       ? 'FOR THE DRIVE. She meant Philly. She knew the whole time.'
                       : 'A TDK-90 in Leah\'s handwriting: FOR THE DRIVE.' },
  gum:             { name: 'Big Red', key: false, use: 'item.gum', desc: 'Five sticks left. Cinnamon. Mom says it smells like a candle.' },
  house_key:       { name: 'House Key', key: true, desc: 'Our key. Brass, with a pink rubber cap so I can find it in the dark.' },
  danny_flashlight:{ name: "Danny's Flashlight", key: true,
                     desc: 'Red plastic. Masking tape: DANNY K. It was still on when I picked it up.' },
  bolt_cutters:    { name: 'Bolt Cutters', key: true, desc: "Danny's uncle's. Danny said he'd 'basically' asked." },
  camcorder:       { name: "Leah's Camcorder", key: true, examine: 'item.camcorder',
                     desc: "Her dad's Palmcorder. The red light is still on. I don't want to watch it again." },
  keyring:         { name: "Janitor's Keys", key: true, desc: 'A steel ring. Two keys left on it: OFFICE and 2F GATE.' },
  hall_pass:       { name: 'Hall Pass', key: true, desc: 'A block of wood the size of a brick. HALL PASS — RM 206. Somebody chewed the corner.' },
  withdrawn_stamp: { name: 'Withdrawn Stamp', key: true, desc: "Rubber stamp and an ink pad from Haupt's safe. WITHDRAWN." },
  aud_key:         { name: 'Auditorium Key', key: true, desc: 'Long, old, brass. Paper tag: AUD — MAIN.' },
  case_key:        { name: 'Small Brass Key', key: true, desc: 'From the card catalog, drawer HA–HE. H for Hallowell.' },
  charter:         { name: "Founder's Charter", key: true, examine: 'doc:charter_full',
                     desc: 'The whole will. "I shall be the first scholar of Hallowell School, and subject to its rules as any child."' },
  denise_photo:    { name: 'Photo of Denise', key: true,
                     desc: 'Denise Webb, fifteen, in her band uniform. On the back, in pencil: "My girl. Fall 1979. —Mama"' },
  diary_page:      { name: "Denise's Diary Page", key: true, examine: 'doc:denise_diary',
                     desc: 'Torn from a diary. Her handwriting leans hard to the right, like she was in a hurry.' },
  red_pen:         { name: 'Red Pen', key: true, desc: "Miss Adair's. A teacher's red felt-tip. It still writes." },
  battery:         { name: 'D Batteries', key: false, stack: true, use: 'engine:use_battery',
                     desc: 'Two D cells. Enough to keep the dark back a little longer.' },
};
