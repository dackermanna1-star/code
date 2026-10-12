// Per-map compatibility rules for modern movement. DOOM's maps were built
// for a player who cannot jump, so a few spots where jumping skips intended
// progression can be listed here. Rules:
//   noJump: true                 -> jumping disabled for the whole map
//   noJumpSectors: [indices]     -> jumping disabled while standing in these sectors
//
// The shareware episode plays as intended with jumping enabled (the 36-unit
// jump only reaches ledges a few units higher than a normal step), so the
// table starts empty except for the boss arenas, where jumping onto the
// pillars would trivialise the fights.

export const MAP_COMPAT = {
  E1M8: { noJumpSectors: [] },
  E2M8: { noJump: true },
  E3M8: { noJump: true },
  MAP07: {},
  MAP30: { noJump: true },
};
