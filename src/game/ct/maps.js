// Maps outside DOOM's ExMy / MAPxx scheme, launched by name (?map=CHINATWN,
// the menu's episode list, Game.newGame(1, skill, 'CHINATWN')). Such a map
// is a stand-alone mission: a pistol start, no next map, and finishing it
// (w.exitLevel) shows the stats, then the finale text, then the title.
// A map marker found in a PWAD without an entry here plays the same way
// under its own name.

export const CUSTOM_MAPS = {
  CHINATWN: {
    title: 'CHINATOWN',
    // Menu entry: the graphic if the WAD has it, else this text in the DOOM font.
    menuPatch: 'M_EPICT',
    menuText: 'chinatown',
    // First lump present wins (the IWAD tunes stand in until D_CHINAT exists).
    music: ['D_CHINAT', 'D_E1M5', 'D_STALKS'],
    sky: ['CTSKY1', 'SKY1'],
    // Intermission background, first present wins.
    interpic: ['CTTITLE', 'INTERPIC', 'WIMAP0'],
    par: 600,
    finale: {
      flat: ['CFASPH1', 'FLOOR4_8', 'SLIME16'],
      music: ['D_CTEVAC', 'D_VICTOR', 'D_READ_M'],
      text: 'the helicopter lifts off the pier and\n'
        + 'banks away over wallabout bay. below,\n'
        + 'chinatown burns under the neon, its\n'
        + 'streets choked with the dead.\n\n'
        + 'you made it out. the coast guard\n'
        + 'will want to know what happened down\n'
        + 'there, and you will tell them, once\n'
        + 'your hands stop shaking.\n\n'
        + 'but the radio keeps crackling with\n'
        + 'voices from the city. somebody else\n'
        + 'is still waiting for a ride.\n\n'
        + 'the year of the zombie has only begun.',
    },
  },
};

export function customMapDef(name) {
  return CUSTOM_MAPS[name] || { title: name, music: [], sky: [], interpic: ['INTERPIC'], par: 0, finale: null };
}
