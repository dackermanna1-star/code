// ITEM CATALOG — ids are contracts used by scripts (g.give/g.take/g.has), maps (pickup.item),
// UI (inventory), art (art/icons.js draws an icon per id) and endings.
//
// desc may be a string or a function (state) => string for chapter-dependent descriptions.
// `examine` (optional) is a script id run when the player chooses "Examine" in the inventory.
// `use` (optional) is a script id or engine action run when the player chooses "Use".
// Final in-character text is owned by the lore/narrative pass; keep ids stable.

export const ITEMS = {
  flashlight:      { name: 'Maglite', key: true, use: 'engine:toggle_flashlight',
                     desc: (s) => s.flags.ch6_marcus_taken
                       ? "Dad's Maglite. As long as it's on, I can see what's coming."
                       : "Dad's Maglite. Heavy enough to count as a weapon, if I were the kind of person who hit things." },
  sketchbook:      { name: 'Sketchbook', key: true, use: 'engine:open_sketchbook',
                     desc: 'Half drawings, half lists. Now also a map of a building that keeps changing its mind.' },
  compact:         { name: "Mom's Compact", key: true, use: 'engine:use_compact',
                     desc: (s) => s.flags.compact_unlocked
                       ? "Mom's compact. In the mirror, it's still October 19, 1979."
                       : "Mom's compact, cracked right across the mirror. I keep meaning to buy her a new one." },
  transfer_form:   { name: 'Transfer Form', key: true,
                     desc: (s) => (!s.flags.form_used && !s.flags.form_used_on
                       ? 'PA Student Withdrawal/Transfer Form, signed by Mom. It goes to the office Monday, and that\'s that.'
                       : s.flags.form_used_on === 'tess'
                         ? 'Reason: moving to Philadelphia. First time I wrote it down and didn\'t cross it out.'
                         : 'Mom\'s signature, and somebody else\'s name over mine. She\'d understand.') },
  mixtape:         { name: "Leah's Mixtape", key: true, examine: 'item.mixtape',
                     desc: (s) => s.flags.bond_leah
                       ? 'FOR THE DRIVE. She meant Philly — she knew the whole time.'
                       : 'A TDK SA90, Leah\'s handwriting on the J-card: FOR THE DRIVE. Pittsburgh\'s not till Thanksgiving, but okay.' },
  gum:             { name: 'Big Red', key: false, use: 'item.gum', desc: 'Big Red, five sticks left. Mom says it makes the car smell like a candle shop.' },
  house_key:       { name: 'House Key', key: true, desc: 'Our front door key, with a pink rubber cap so I can find it in the dark. Ours until Christmas.' },
  danny_flashlight:{ name: "Danny's Flashlight", key: true,
                     desc: (s) => (s.flags.danny_light_used || (s.chapter || 0) >= 3
                       ? 'It\'s still on. It\'s been on this whole time.'
                       : 'Red plastic, masking tape: DANNY K. It was still on when it rolled to my feet.') },
  bolt_cutters:    { name: 'Bolt Cutters', key: true, desc: "Uncle Frank's bolt cutters. Danny says he 'basically' asked." },
  camcorder:       { name: "Leah's Camcorder", key: true, examine: 'item.camcorder',
                     desc: "Her dad's VHS-C camcorder. The red light's still on, and I don't want to watch that tape again." },
  keyring:         { name: "Janitor's Keys", key: true, desc: 'The custodian\'s key ring, mostly empty. Two keys left on it, tagged OFFICE and 2F GATE.' },
  hall_pass:       { name: 'Hall Pass', key: true, desc: 'A block of wood the size of a brick: HALL PASS — RM 206. Somebody chewed the corner.' },
  withdrawn_stamp: { name: 'Withdrawn Stamp', key: true, desc: "The principal's rubber stamp and ink pad, from Haupt's safe: WITHDRAWN. The pad's still wet." },
  aud_key:         { name: 'Auditorium Key', key: true, desc: 'Long, old, brass. Paper tag: AUD — MAIN.' },
  case_key:        { name: 'Small Brass Key', key: true, desc: 'From the card catalog, drawer HA–HE. H for Hallowell.' },
  charter:         { name: "Founder's Charter", key: true, examine: 'doc:charter_full',
                     desc: 'The whole Charter, in his own hand. "...subject to its rules as any child; and I shall be the last to leave it."' },
  denise_photo:    { name: 'Photo of Denise', key: true,
                     desc: 'Denise Webb, fifteen, in her band uniform, laughing at somebody off camera. On the back, in pencil: "My girl. Fall 1979. —Mama"' },
  diary_page:      { name: "Denise's Diary Page", key: true, examine: 'doc:denise_diary',
                     desc: 'Torn from Denise\'s diary. Her handwriting leans hard to the right, like she was in a hurry.' },
  red_pen:         { name: 'Red Pen', key: true, desc: "Miss Adair's red Flair, the pen she graded with. It still writes." },
  battery:         { name: 'D Batteries', key: false, stack: true, use: 'engine:use_battery',
                     desc: 'Two D cells. Enough to keep the dark back a little longer.' },
};
