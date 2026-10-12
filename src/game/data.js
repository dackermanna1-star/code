// DOOM (1993) game data tables and text.
//
// Transcribed mechanically from id Software's linuxdoom-1.10 source release
// (p_spec.c, p_switch.c, g_game.c, wi_stuff.c, f_finale.c, st_stuff.c, am_map.c,
// m_random.c, d_englsh.h) and cross-checked against Chocolate Doom, which
// restores a few details of the DOS v1.9 executables (DOSY, the per-game quit
// message lists, the episode 4 par time overflow). Do not edit by hand.

// p_spec.c animdefs[]: animated flats (istexture false) and walls (istexture
// true). Every lump from startname to endname in WAD order cycles, advancing
// every `speed` tics. Entries whose startname is missing are skipped.
export const ANIMDEFS = [
  { istexture: false, endname: 'NUKAGE3', startname: 'NUKAGE1', speed: 8 },
  { istexture: false, endname: 'FWATER4', startname: 'FWATER1', speed: 8 },
  { istexture: false, endname: 'SWATER4', startname: 'SWATER1', speed: 8 },
  { istexture: false, endname: 'LAVA4', startname: 'LAVA1', speed: 8 },
  { istexture: false, endname: 'BLOOD3', startname: 'BLOOD1', speed: 8 },
  { istexture: false, endname: 'RROCK08', startname: 'RROCK05', speed: 8 },
  { istexture: false, endname: 'SLIME04', startname: 'SLIME01', speed: 8 },
  { istexture: false, endname: 'SLIME08', startname: 'SLIME05', speed: 8 },
  { istexture: false, endname: 'SLIME12', startname: 'SLIME09', speed: 8 },
  { istexture: true, endname: 'BLODGR4', startname: 'BLODGR1', speed: 8 },
  { istexture: true, endname: 'SLADRIP3', startname: 'SLADRIP1', speed: 8 },
  { istexture: true, endname: 'BLODRIP4', startname: 'BLODRIP1', speed: 8 },
  { istexture: true, endname: 'FIREWALL', startname: 'FIREWALA', speed: 8 },
  { istexture: true, endname: 'GSTFONT3', startname: 'GSTFONT1', speed: 8 },
  { istexture: true, endname: 'FIRELAVA', startname: 'FIRELAV3', speed: 8 },
  { istexture: true, endname: 'FIREMAG3', startname: 'FIREMAG1', speed: 8 },
  { istexture: true, endname: 'FIREBLU2', startname: 'FIREBLU1', speed: 8 },
  { istexture: true, endname: 'ROCKRED3', startname: 'ROCKRED1', speed: 8 },
  { istexture: true, endname: 'BFALL4', startname: 'BFALL1', speed: 8 },
  { istexture: true, endname: 'SFALL4', startname: 'SFALL1', speed: 8 },
  { istexture: true, endname: 'WFALL4', startname: 'WFALL1', speed: 8 },
  { istexture: true, endname: 'DBRAIN4', startname: 'DBRAIN1', speed: 8 },
];

// p_switch.c alphSwitchList[]: switch texture pairs. Episode 1 = shareware,
// 2 = registered/retail (episodes 2 and 3), 3 = commercial (DOOM II). A game
// loads every pair whose episode is <= its own (shareware 1, registered and
// retail 2, commercial 3).
export const SWITCHES = [
  { name1: 'SW1BRCOM', name2: 'SW2BRCOM', episode: 1 },
  { name1: 'SW1BRN1', name2: 'SW2BRN1', episode: 1 },
  { name1: 'SW1BRN2', name2: 'SW2BRN2', episode: 1 },
  { name1: 'SW1BRNGN', name2: 'SW2BRNGN', episode: 1 },
  { name1: 'SW1BROWN', name2: 'SW2BROWN', episode: 1 },
  { name1: 'SW1COMM', name2: 'SW2COMM', episode: 1 },
  { name1: 'SW1COMP', name2: 'SW2COMP', episode: 1 },
  { name1: 'SW1DIRT', name2: 'SW2DIRT', episode: 1 },
  { name1: 'SW1EXIT', name2: 'SW2EXIT', episode: 1 },
  { name1: 'SW1GRAY', name2: 'SW2GRAY', episode: 1 },
  { name1: 'SW1GRAY1', name2: 'SW2GRAY1', episode: 1 },
  { name1: 'SW1METAL', name2: 'SW2METAL', episode: 1 },
  { name1: 'SW1PIPE', name2: 'SW2PIPE', episode: 1 },
  { name1: 'SW1SLAD', name2: 'SW2SLAD', episode: 1 },
  { name1: 'SW1STARG', name2: 'SW2STARG', episode: 1 },
  { name1: 'SW1STON1', name2: 'SW2STON1', episode: 1 },
  { name1: 'SW1STON2', name2: 'SW2STON2', episode: 1 },
  { name1: 'SW1STONE', name2: 'SW2STONE', episode: 1 },
  { name1: 'SW1STRTN', name2: 'SW2STRTN', episode: 1 },
  { name1: 'SW1BLUE', name2: 'SW2BLUE', episode: 2 },
  { name1: 'SW1CMT', name2: 'SW2CMT', episode: 2 },
  { name1: 'SW1GARG', name2: 'SW2GARG', episode: 2 },
  { name1: 'SW1GSTON', name2: 'SW2GSTON', episode: 2 },
  { name1: 'SW1HOT', name2: 'SW2HOT', episode: 2 },
  { name1: 'SW1LION', name2: 'SW2LION', episode: 2 },
  { name1: 'SW1SATYR', name2: 'SW2SATYR', episode: 2 },
  { name1: 'SW1SKIN', name2: 'SW2SKIN', episode: 2 },
  { name1: 'SW1VINE', name2: 'SW2VINE', episode: 2 },
  { name1: 'SW1WOOD', name2: 'SW2WOOD', episode: 2 },
  { name1: 'SW1PANEL', name2: 'SW2PANEL', episode: 3 },
  { name1: 'SW1ROCK', name2: 'SW2ROCK', episode: 3 },
  { name1: 'SW1MET2', name2: 'SW2MET2', episode: 3 },
  { name1: 'SW1WDMET', name2: 'SW2WDMET', episode: 3 },
  { name1: 'SW1BRIK', name2: 'SW2BRIK', episode: 3 },
  { name1: 'SW1MOD1', name2: 'SW2MOD1', episode: 3 },
  { name1: 'SW1ZIM', name2: 'SW2ZIM', episode: 3 },
  { name1: 'SW1STON6', name2: 'SW2STON6', episode: 3 },
  { name1: 'SW1TEK', name2: 'SW2TEK', episode: 3 },
  { name1: 'SW1MARB', name2: 'SW2MARB', episode: 3 },
  { name1: 'SW1SKULL', name2: 'SW2SKULL', episode: 3 },
];

// Every string macro from d_englsh.h, keyed by its original name. DOSY uses the
// DOS executable text "(press y to quit to dos.)" (linuxdoom printed
// "(press y to quit)"). Strings containing %s are printf formats.
export const STRINGS = {
  D_DEVSTR: 'Development mode ON.\n',
  D_CDROM: 'CD-ROM Version: default.cfg from c:\\doomdata\n',
  PRESSKEY: 'press a key.',
  PRESSYN: 'press y or n.',
  QUITMSG: 'are you sure you want to\nquit this great game?',
  LOADNET: "you can't do load while in a net game!\n\npress a key.",
  QLOADNET: "you can't quickload during a netgame!\n\npress a key.",
  QSAVESPOT: "you haven't picked a quicksave slot yet!\n\npress a key.",
  SAVEDEAD: "you can't save if you aren't playing!\n\npress a key.",
  QSPROMPT: "quicksave over your game named\n\n'%s'?\n\npress y or n.",
  QLPROMPT: "do you want to quickload the game named\n\n'%s'?\n\npress y or n.",
  NEWGAME: "you can't start a new game\nwhile in a network game.\n\npress a key.",
  NIGHTMARE: "are you sure? this skill level\nisn't even remotely fair.\n\npress y or n.",
  SWSTRING:
    'this is the shareware version of doom.\n' +
    '\n' +
    'you need to order the entire trilogy.\n' +
    '\n' +
    'press a key.',
  MSGOFF: 'Messages OFF',
  MSGON: 'Messages ON',
  NETEND: "you can't end a netgame!\n\npress a key.",
  ENDGAME: 'are you sure you want to end the game?\n\npress y or n.',
  DOSY: '(press y to quit to dos.)',
  DETAILHI: 'High detail',
  DETAILLO: 'Low detail',
  GAMMALVL0: 'Gamma correction OFF',
  GAMMALVL1: 'Gamma correction level 1',
  GAMMALVL2: 'Gamma correction level 2',
  GAMMALVL3: 'Gamma correction level 3',
  GAMMALVL4: 'Gamma correction level 4',
  EMPTYSTRING: 'empty slot',
  GOTARMOR: 'Picked up the armor.',
  GOTMEGA: 'Picked up the MegaArmor!',
  GOTHTHBONUS: 'Picked up a health bonus.',
  GOTARMBONUS: 'Picked up an armor bonus.',
  GOTSTIM: 'Picked up a stimpack.',
  GOTMEDINEED: 'Picked up a medikit that you REALLY need!',
  GOTMEDIKIT: 'Picked up a medikit.',
  GOTSUPER: 'Supercharge!',
  GOTBLUECARD: 'Picked up a blue keycard.',
  GOTYELWCARD: 'Picked up a yellow keycard.',
  GOTREDCARD: 'Picked up a red keycard.',
  GOTBLUESKUL: 'Picked up a blue skull key.',
  GOTYELWSKUL: 'Picked up a yellow skull key.',
  GOTREDSKULL: 'Picked up a red skull key.',
  GOTINVUL: 'Invulnerability!',
  GOTBERSERK: 'Berserk!',
  GOTINVIS: 'Partial Invisibility',
  GOTSUIT: 'Radiation Shielding Suit',
  GOTMAP: 'Computer Area Map',
  GOTVISOR: 'Light Amplification Visor',
  GOTMSPHERE: 'MegaSphere!',
  GOTCLIP: 'Picked up a clip.',
  GOTCLIPBOX: 'Picked up a box of bullets.',
  GOTROCKET: 'Picked up a rocket.',
  GOTROCKBOX: 'Picked up a box of rockets.',
  GOTCELL: 'Picked up an energy cell.',
  GOTCELLBOX: 'Picked up an energy cell pack.',
  GOTSHELLS: 'Picked up 4 shotgun shells.',
  GOTSHELLBOX: 'Picked up a box of shotgun shells.',
  GOTBACKPACK: 'Picked up a backpack full of ammo!',
  GOTBFG9000: 'You got the BFG9000!  Oh, yes.',
  GOTCHAINGUN: 'You got the chaingun!',
  GOTCHAINSAW: 'A chainsaw!  Find some meat!',
  GOTLAUNCHER: 'You got the rocket launcher!',
  GOTPLASMA: 'You got the plasma gun!',
  GOTSHOTGUN: 'You got the shotgun!',
  GOTSHOTGUN2: 'You got the super shotgun!',
  PD_BLUEO: 'You need a blue key to activate this object',
  PD_REDO: 'You need a red key to activate this object',
  PD_YELLOWO: 'You need a yellow key to activate this object',
  PD_BLUEK: 'You need a blue key to open this door',
  PD_REDK: 'You need a red key to open this door',
  PD_YELLOWK: 'You need a yellow key to open this door',
  GGSAVED: 'game saved.',
  HUSTR_MSGU: '[Message unsent]',
  HUSTR_E1M1: 'E1M1: Hangar',
  HUSTR_E1M2: 'E1M2: Nuclear Plant',
  HUSTR_E1M3: 'E1M3: Toxin Refinery',
  HUSTR_E1M4: 'E1M4: Command Control',
  HUSTR_E1M5: 'E1M5: Phobos Lab',
  HUSTR_E1M6: 'E1M6: Central Processing',
  HUSTR_E1M7: 'E1M7: Computer Station',
  HUSTR_E1M8: 'E1M8: Phobos Anomaly',
  HUSTR_E1M9: 'E1M9: Military Base',
  HUSTR_E2M1: 'E2M1: Deimos Anomaly',
  HUSTR_E2M2: 'E2M2: Containment Area',
  HUSTR_E2M3: 'E2M3: Refinery',
  HUSTR_E2M4: 'E2M4: Deimos Lab',
  HUSTR_E2M5: 'E2M5: Command Center',
  HUSTR_E2M6: 'E2M6: Halls of the Damned',
  HUSTR_E2M7: 'E2M7: Spawning Vats',
  HUSTR_E2M8: 'E2M8: Tower of Babel',
  HUSTR_E2M9: 'E2M9: Fortress of Mystery',
  HUSTR_E3M1: 'E3M1: Hell Keep',
  HUSTR_E3M2: 'E3M2: Slough of Despair',
  HUSTR_E3M3: 'E3M3: Pandemonium',
  HUSTR_E3M4: 'E3M4: House of Pain',
  HUSTR_E3M5: 'E3M5: Unholy Cathedral',
  HUSTR_E3M6: 'E3M6: Mt. Erebus',
  HUSTR_E3M7: 'E3M7: Limbo',
  HUSTR_E3M8: 'E3M8: Dis',
  HUSTR_E3M9: 'E3M9: Warrens',
  HUSTR_E4M1: 'E4M1: Hell Beneath',
  HUSTR_E4M2: 'E4M2: Perfect Hatred',
  HUSTR_E4M3: 'E4M3: Sever The Wicked',
  HUSTR_E4M4: 'E4M4: Unruly Evil',
  HUSTR_E4M5: 'E4M5: They Will Repent',
  HUSTR_E4M6: 'E4M6: Against Thee Wickedly',
  HUSTR_E4M7: 'E4M7: And Hell Followed',
  HUSTR_E4M8: 'E4M8: Unto The Cruel',
  HUSTR_E4M9: 'E4M9: Fear',
  HUSTR_1: 'level 1: entryway',
  HUSTR_2: 'level 2: underhalls',
  HUSTR_3: 'level 3: the gantlet',
  HUSTR_4: 'level 4: the focus',
  HUSTR_5: 'level 5: the waste tunnels',
  HUSTR_6: 'level 6: the crusher',
  HUSTR_7: 'level 7: dead simple',
  HUSTR_8: 'level 8: tricks and traps',
  HUSTR_9: 'level 9: the pit',
  HUSTR_10: 'level 10: refueling base',
  HUSTR_11: "level 11: 'o' of destruction!",
  HUSTR_12: 'level 12: the factory',
  HUSTR_13: 'level 13: downtown',
  HUSTR_14: 'level 14: the inmost dens',
  HUSTR_15: 'level 15: industrial zone',
  HUSTR_16: 'level 16: suburbs',
  HUSTR_17: 'level 17: tenements',
  HUSTR_18: 'level 18: the courtyard',
  HUSTR_19: 'level 19: the citadel',
  HUSTR_20: 'level 20: gotcha!',
  HUSTR_21: 'level 21: nirvana',
  HUSTR_22: 'level 22: the catacombs',
  HUSTR_23: "level 23: barrels o' fun",
  HUSTR_24: 'level 24: the chasm',
  HUSTR_25: 'level 25: bloodfalls',
  HUSTR_26: 'level 26: the abandoned mines',
  HUSTR_27: 'level 27: monster condo',
  HUSTR_28: 'level 28: the spirit world',
  HUSTR_29: 'level 29: the living end',
  HUSTR_30: 'level 30: icon of sin',
  HUSTR_31: 'level 31: wolfenstein',
  HUSTR_32: 'level 32: grosse',
  PHUSTR_1: 'level 1: congo',
  PHUSTR_2: 'level 2: well of souls',
  PHUSTR_3: 'level 3: aztec',
  PHUSTR_4: 'level 4: caged',
  PHUSTR_5: 'level 5: ghost town',
  PHUSTR_6: "level 6: baron's lair",
  PHUSTR_7: 'level 7: caughtyard',
  PHUSTR_8: 'level 8: realm',
  PHUSTR_9: 'level 9: abattoire',
  PHUSTR_10: 'level 10: onslaught',
  PHUSTR_11: 'level 11: hunted',
  PHUSTR_12: 'level 12: speed',
  PHUSTR_13: 'level 13: the crypt',
  PHUSTR_14: 'level 14: genesis',
  PHUSTR_15: 'level 15: the twilight',
  PHUSTR_16: 'level 16: the omen',
  PHUSTR_17: 'level 17: compound',
  PHUSTR_18: 'level 18: neurosphere',
  PHUSTR_19: 'level 19: nme',
  PHUSTR_20: 'level 20: the death domain',
  PHUSTR_21: 'level 21: slayer',
  PHUSTR_22: 'level 22: impossible mission',
  PHUSTR_23: 'level 23: tombstone',
  PHUSTR_24: 'level 24: the final frontier',
  PHUSTR_25: 'level 25: the temple of darkness',
  PHUSTR_26: 'level 26: bunker',
  PHUSTR_27: 'level 27: anti-christ',
  PHUSTR_28: 'level 28: the sewers',
  PHUSTR_29: 'level 29: odyssey of noises',
  PHUSTR_30: 'level 30: the gateway of hell',
  PHUSTR_31: 'level 31: cyberden',
  PHUSTR_32: 'level 32: go 2 it',
  THUSTR_1: 'level 1: system control',
  THUSTR_2: 'level 2: human bbq',
  THUSTR_3: 'level 3: power control',
  THUSTR_4: 'level 4: wormhole',
  THUSTR_5: 'level 5: hanger',
  THUSTR_6: 'level 6: open season',
  THUSTR_7: 'level 7: prison',
  THUSTR_8: 'level 8: metal',
  THUSTR_9: 'level 9: stronghold',
  THUSTR_10: 'level 10: redemption',
  THUSTR_11: 'level 11: storage facility',
  THUSTR_12: 'level 12: crater',
  THUSTR_13: 'level 13: nukage processing',
  THUSTR_14: 'level 14: steel works',
  THUSTR_15: 'level 15: dead zone',
  THUSTR_16: 'level 16: deepest reaches',
  THUSTR_17: 'level 17: processing area',
  THUSTR_18: 'level 18: mill',
  THUSTR_19: 'level 19: shipping/respawning',
  THUSTR_20: 'level 20: central processing',
  THUSTR_21: 'level 21: administration center',
  THUSTR_22: 'level 22: habitat',
  THUSTR_23: 'level 23: lunar mining project',
  THUSTR_24: 'level 24: quarry',
  THUSTR_25: "level 25: baron's den",
  THUSTR_26: 'level 26: ballistyx',
  THUSTR_27: 'level 27: mount pain',
  THUSTR_28: 'level 28: heck',
  THUSTR_29: 'level 29: river styx',
  THUSTR_30: 'level 30: last call',
  THUSTR_31: 'level 31: pharaoh',
  THUSTR_32: 'level 32: caribbean',
  HUSTR_CHATMACRO1: "I'm ready to kick butt!",
  HUSTR_CHATMACRO2: "I'm OK.",
  HUSTR_CHATMACRO3: "I'm not looking too good!",
  HUSTR_CHATMACRO4: 'Help!',
  HUSTR_CHATMACRO5: 'You suck!',
  HUSTR_CHATMACRO6: 'Next time, scumbag...',
  HUSTR_CHATMACRO7: 'Come here!',
  HUSTR_CHATMACRO8: "I'll take care of it.",
  HUSTR_CHATMACRO9: 'Yes',
  HUSTR_CHATMACRO0: 'No',
  HUSTR_TALKTOSELF1: 'You mumble to yourself',
  HUSTR_TALKTOSELF2: "Who's there?",
  HUSTR_TALKTOSELF3: 'You scare yourself',
  HUSTR_TALKTOSELF4: 'You start to rave',
  HUSTR_TALKTOSELF5: "You've lost it...",
  HUSTR_MESSAGESENT: '[Message Sent]',
  HUSTR_PLRGREEN: 'Green: ',
  HUSTR_PLRINDIGO: 'Indigo: ',
  HUSTR_PLRBROWN: 'Brown: ',
  HUSTR_PLRRED: 'Red: ',
  HUSTR_KEYGREEN: 'g',
  HUSTR_KEYINDIGO: 'i',
  HUSTR_KEYBROWN: 'b',
  HUSTR_KEYRED: 'r',
  AMSTR_FOLLOWON: 'Follow Mode ON',
  AMSTR_FOLLOWOFF: 'Follow Mode OFF',
  AMSTR_GRIDON: 'Grid ON',
  AMSTR_GRIDOFF: 'Grid OFF',
  AMSTR_MARKEDSPOT: 'Marked Spot',
  AMSTR_MARKSCLEARED: 'All Marks Cleared',
  STSTR_MUS: 'Music Change',
  STSTR_NOMUS: 'IMPOSSIBLE SELECTION',
  STSTR_DQDON: 'Degreelessness Mode On',
  STSTR_DQDOFF: 'Degreelessness Mode Off',
  STSTR_KFAADDED: 'Very Happy Ammo Added',
  STSTR_FAADDED: 'Ammo (no keys) Added',
  STSTR_NCON: 'No Clipping Mode ON',
  STSTR_NCOFF: 'No Clipping Mode OFF',
  STSTR_BEHOLD: 'inVuln, Str, Inviso, Rad, Allmap, or Lite-amp',
  STSTR_BEHOLDX: 'Power-up Toggled',
  STSTR_CHOPPERS: "... doesn't suck - GM",
  STSTR_CLEV: 'Changing Level...',
  E1TEXT:
    'Once you beat the big badasses and\n' +
    "clean out the moon base you're supposed\n" +
    "to win, aren't you? Aren't you? Where's\n" +
    'your fat reward and ticket home? What\n' +
    "the hell is this? It's not supposed to\n" +
    'end this way!\n' +
    '\n' +
    'It stinks like rotten meat, but looks\n' +
    'like the lost Deimos base.  Looks like\n' +
    "you're stuck on The Shores of Hell.\n" +
    'The only way out is through.\n' +
    '\n' +
    'To continue the DOOM experience, play\n' +
    'The Shores of Hell and its amazing\n' +
    'sequel, Inferno!\n',
  E2TEXT:
    "You've done it! The hideous cyber-\n" +
    'demon lord that ruled the lost Deimos\n' +
    'moon base has been slain and you\n' +
    'are triumphant! But ... where are\n' +
    'you? You clamber to the edge of the\n' +
    'moon and look down to see the awful\n' +
    'truth.\n' +
    '\n' +
    'Deimos floats above Hell itself!\n' +
    "You've never heard of anyone escaping\n" +
    "from Hell, but you'll make the bastards\n" +
    'sorry they ever heard of you! Quickly,\n' +
    'you rappel down to  the surface of\n' +
    'Hell.\n' +
    '\n' +
    "Now, it's on to the final chapter of\n" +
    'DOOM! -- Inferno.',
  E3TEXT:
    'The loathsome spiderdemon that\n' +
    'masterminded the invasion of the moon\n' +
    'bases and caused so much death has had\n' +
    'its ass kicked for all time.\n' +
    '\n' +
    'A hidden doorway opens and you enter.\n' +
    "You've proven too tough for Hell to\n" +
    'contain, and now Hell at last plays\n' +
    'fair -- for you emerge from the door\n' +
    'to see the green fields of Earth!\n' +
    'Home at last.\n' +
    '\n' +
    "You wonder what's been happening on\n" +
    'Earth while you were battling evil\n' +
    "unleashed. It's good that no Hell-\n" +
    'spawn could have come through that\n' +
    'door with you ...',
  E4TEXT:
    'the spider mastermind must have sent forth\n' +
    'its legions of hellspawn before your\n' +
    'final confrontation with that terrible\n' +
    'beast from hell.  but you stepped forward\n' +
    'and brought forth eternal damnation and\n' +
    'suffering upon the horde as a true hero\n' +
    'would in the face of something so evil.\n' +
    '\n' +
    'besides, someone was gonna pay for what\n' +
    'happened to daisy, your pet rabbit.\n' +
    '\n' +
    'but now, you see spread before you more\n' +
    'potential pain and gibbitude as a nation\n' +
    'of demons run amok among our cities.\n' +
    '\n' +
    'next stop, hell on earth!',
  C1TEXT:
    'YOU HAVE ENTERED DEEPLY INTO THE INFESTED\n' +
    'STARPORT. BUT SOMETHING IS WRONG. THE\n' +
    'MONSTERS HAVE BROUGHT THEIR OWN REALITY\n' +
    "WITH THEM, AND THE STARPORT'S TECHNOLOGY\n" +
    'IS BEING SUBVERTED BY THEIR PRESENCE.\n' +
    '\n' +
    'AHEAD, YOU SEE AN OUTPOST OF HELL, A\n' +
    'FORTIFIED ZONE. IF YOU CAN GET PAST IT,\n' +
    'YOU CAN PENETRATE INTO THE HAUNTED HEART\n' +
    'OF THE STARBASE AND FIND THE CONTROLLING\n' +
    "SWITCH WHICH HOLDS EARTH'S POPULATION\n" +
    'HOSTAGE.',
  C2TEXT:
    'YOU HAVE WON! YOUR VICTORY HAS ENABLED\n' +
    'HUMANKIND TO EVACUATE EARTH AND ESCAPE\n' +
    'THE NIGHTMARE.  NOW YOU ARE THE ONLY\n' +
    'HUMAN LEFT ON THE FACE OF THE PLANET.\n' +
    'CANNIBAL MUTATIONS, CARNIVOROUS ALIENS,\n' +
    'AND EVIL SPIRITS ARE YOUR ONLY NEIGHBORS.\n' +
    'YOU SIT BACK AND WAIT FOR DEATH, CONTENT\n' +
    'THAT YOU HAVE SAVED YOUR SPECIES.\n' +
    '\n' +
    'BUT THEN, EARTH CONTROL BEAMS DOWN A\n' +
    'MESSAGE FROM SPACE: "SENSORS HAVE LOCATED\n' +
    'THE SOURCE OF THE ALIEN INVASION. IF YOU\n' +
    'GO THERE, YOU MAY BE ABLE TO BLOCK THEIR\n' +
    'ENTRY.  THE ALIEN BASE IS IN THE HEART OF\n' +
    'YOUR OWN HOME CITY, NOT FAR FROM THE\n' +
    'STARPORT." SLOWLY AND PAINFULLY YOU GET\n' +
    'UP AND RETURN TO THE FRAY.',
  C3TEXT:
    'YOU ARE AT THE CORRUPT HEART OF THE CITY,\n' +
    'SURROUNDED BY THE CORPSES OF YOUR ENEMIES.\n' +
    "YOU SEE NO WAY TO DESTROY THE CREATURES'\n" +
    'ENTRYWAY ON THIS SIDE, SO YOU CLENCH YOUR\n' +
    'TEETH AND PLUNGE THROUGH IT.\n' +
    '\n' +
    'THERE MUST BE A WAY TO CLOSE IT ON THE\n' +
    "OTHER SIDE. WHAT DO YOU CARE IF YOU'VE\n" +
    'GOT TO GO THROUGH HELL TO GET TO IT?',
  C4TEXT:
    'THE HORRENDOUS VISAGE OF THE BIGGEST\n' +
    "DEMON YOU'VE EVER SEEN CRUMBLES BEFORE\n" +
    'YOU, AFTER YOU PUMP YOUR ROCKETS INTO\n' +
    'HIS EXPOSED BRAIN. THE MONSTER SHRIVELS\n' +
    'UP AND DIES, ITS THRASHING LIMBS\n' +
    "DEVASTATING UNTOLD MILES OF HELL'S\n" +
    'SURFACE.\n' +
    '\n' +
    "YOU'VE DONE IT. THE INVASION IS OVER.\n" +
    'EARTH IS SAVED. HELL IS A WRECK. YOU\n' +
    'WONDER WHERE BAD FOLKS WILL GO WHEN THEY\n' +
    'DIE, NOW. WIPING THE SWEAT FROM YOUR\n' +
    'FOREHEAD YOU BEGIN THE LONG TREK BACK\n' +
    'HOME. REBUILDING EARTH OUGHT TO BE A\n' +
    'LOT MORE FUN THAN RUINING IT WAS.\n',
  C5TEXT:
    "CONGRATULATIONS, YOU'VE FOUND THE SECRET\n" +
    "LEVEL! LOOKS LIKE IT'S BEEN BUILT BY\n" +
    'HUMANS, RATHER THAN DEMONS. YOU WONDER\n' +
    'WHO THE INMATES OF THIS CORNER OF HELL\n' +
    'WILL BE.',
  C6TEXT:
    "CONGRATULATIONS, YOU'VE FOUND THE\n" +
    "SUPER SECRET LEVEL!  YOU'D BETTER\n" +
    'BLAZE THROUGH THIS ONE!\n',
  P1TEXT:
    'You gloat over the steaming carcass of the\n' +
    "Guardian.  With its death, you've wrested\n" +
    'the Accelerator from the stinking claws\n' +
    'of Hell.  You relax and glance around the\n' +
    'room.  Damn!  There was supposed to be at\n' +
    "least one working prototype, but you can't\n" +
    'see it. The demons must have taken it.\n' +
    '\n' +
    'You must find the prototype, or all your\n' +
    'struggles will have been wasted. Keep\n' +
    'moving, keep fighting, keep killing.\n' +
    'Oh yes, keep living, too.',
  P2TEXT:
    'Even the deadly Arch-Vile labyrinth could\n' +
    "not stop you, and you've gotten to the\n" +
    'prototype Accelerator which is soon\n' +
    'efficiently and permanently deactivated.\n' +
    '\n' +
    "You're good at that kind of thing.",
  P3TEXT:
    "You've bashed and battered your way into\n" +
    'the heart of the devil-hive.  Time for a\n' +
    'Search-and-Destroy mission, aimed at the\n' +
    'Gatekeeper, whose foul offspring is\n' +
    "cascading to Earth.  Yeah, he's bad. But\n" +
    "you know who's worse!\n" +
    '\n' +
    'Grinning evilly, you check your gear, and\n' +
    'get ready to give the bastard a little Hell\n' +
    'of your own making!',
  P4TEXT:
    "The Gatekeeper's evil face is splattered\n" +
    'all over the place.  As its tattered corpse\n' +
    'collapses, an inverted Gate forms and\n' +
    'sucks down the shards of the last\n' +
    'prototype Accelerator, not to mention the\n' +
    "few remaining demons.  You're done. Hell\n" +
    'has gone back to pounding bad dead folks \n' +
    'instead of good live ones.  Remember to\n' +
    'tell your grandkids to put a rocket\n' +
    'launcher in your coffin. If you go to Hell\n' +
    "when you die, you'll need it for some\n" +
    'final cleaning-up ...',
  P5TEXT:
    "You've found the second-hardest level we\n" +
    'got. Hope you have a saved game a level or\n' +
    'two previous.  If not, be prepared to die\n' +
    'aplenty. For master marines only.',
  P6TEXT:
    'Betcha wondered just what WAS the hardest\n' +
    'level we had ready for ya?  Now you know.\n' +
    'No one gets out alive.',
  T1TEXT:
    "You've fought your way out of the infested\n" +
    'experimental labs.   It seems that UAC has\n' +
    'once again gulped it down.  With their\n' +
    'high turnover, it must be hard for poor\n' +
    'old UAC to buy corporate health insurance\n' +
    'nowadays..\n' +
    '\n' +
    'Ahead lies the military complex, now\n' +
    'swarming with diseased horrors hot to get\n' +
    'their teeth into you. With luck, the\n' +
    'complex still has some warlike ordnance\n' +
    'laying around.',
  T2TEXT:
    'You hear the grinding of heavy machinery\n' +
    "ahead.  You sure hope they're not stamping\n" +
    "out new hellspawn, but you're ready to\n" +
    'ream out a whole herd if you have to.\n' +
    'They might be planning a blood feast, but\n' +
    'you feel about as mean as two thousand\n' +
    'maniacs packed into one mad killer.\n' +
    '\n' +
    "You don't plan to go down easy.",
  T3TEXT:
    'The vista opening ahead looks real damn\n' +
    'familiar. Smells familiar, too -- like\n' +
    "fried excrement. You didn't like this\n" +
    "place before, and you sure as hell ain't\n" +
    'planning to like it now. The more you\n' +
    'brood on it, the madder you get.\n' +
    'Hefting your gun, an evil grin trickles\n' +
    'onto your face. Time to take some names.',
  T4TEXT:
    'Suddenly, all is silent, from one horizon\n' +
    'to the other. The agonizing echo of Hell\n' +
    'fades away, the nightmare sky turns to\n' +
    'blue, the heaps of monster corpses start \n' +
    'to evaporate along with the evil stench \n' +
    "that filled the air. Jeeze, maybe you've\n" +
    'done it. Have you really won?\n' +
    '\n' +
    'Something rumbles in the distance.\n' +
    'A blue light begins to glow inside the\n' +
    'ruined skull of the demon-spitter.',
  T5TEXT:
    'What now? Looks totally different. Kind\n' +
    "of like King Tut's condo. Well,\n" +
    "whatever's here can't be any worse\n" +
    "than usual. Can it?  Or maybe it's best\n" +
    'to let sleeping gods lie..',
  T6TEXT:
    "Time for a vacation. You've burst the\n" +
    "bowels of hell and by golly you're ready\n" +
    'for a break. You mutter to yourself,\n' +
    "Maybe someone else can kick Hell's ass\n" +
    'next time around. Ahead lies a quiet town,\n' +
    'with peaceful flowing water, quaint\n' +
    'buildings, and presumably no Hellspawn.\n' +
    '\n' +
    'As you step off the transport, you hear\n' +
    "the stomp of a cyberdemon's iron shoe.",
  CC_ZOMBIE: 'ZOMBIEMAN',
  CC_SHOTGUN: 'SHOTGUN GUY',
  CC_HEAVY: 'HEAVY WEAPON DUDE',
  CC_IMP: 'IMP',
  CC_DEMON: 'DEMON',
  CC_LOST: 'LOST SOUL',
  CC_CACO: 'CACODEMON',
  CC_HELL: 'HELL KNIGHT',
  CC_BARON: 'BARON OF HELL',
  CC_ARACH: 'ARACHNOTRON',
  CC_PAIN: 'PAIN ELEMENTAL',
  CC_REVEN: 'REVENANT',
  CC_MANCU: 'MANCUBUS',
  CC_ARCH: 'ARCH-VILE',
  CC_SPIDER: 'THE SPIDER MASTERMIND',
  CC_CYBER: 'THE CYBERDEMON',
  CC_HERO: 'OUR HERO',
};

// hu_stuff.c mapnames[] / mapnames2[] / mapnamesp[] / mapnamest[] (HUSTR_*,
// PHUSTR_*, THUSTR_* in d_englsh.h). Vanilla DOOM II uses doom2 for MAP01-MAP32.
export const LEVEL_NAMES = {
  doom: {
    E1M1: 'E1M1: Hangar',
    E1M2: 'E1M2: Nuclear Plant',
    E1M3: 'E1M3: Toxin Refinery',
    E1M4: 'E1M4: Command Control',
    E1M5: 'E1M5: Phobos Lab',
    E1M6: 'E1M6: Central Processing',
    E1M7: 'E1M7: Computer Station',
    E1M8: 'E1M8: Phobos Anomaly',
    E1M9: 'E1M9: Military Base',
    E2M1: 'E2M1: Deimos Anomaly',
    E2M2: 'E2M2: Containment Area',
    E2M3: 'E2M3: Refinery',
    E2M4: 'E2M4: Deimos Lab',
    E2M5: 'E2M5: Command Center',
    E2M6: 'E2M6: Halls of the Damned',
    E2M7: 'E2M7: Spawning Vats',
    E2M8: 'E2M8: Tower of Babel',
    E2M9: 'E2M9: Fortress of Mystery',
    E3M1: 'E3M1: Hell Keep',
    E3M2: 'E3M2: Slough of Despair',
    E3M3: 'E3M3: Pandemonium',
    E3M4: 'E3M4: House of Pain',
    E3M5: 'E3M5: Unholy Cathedral',
    E3M6: 'E3M6: Mt. Erebus',
    E3M7: 'E3M7: Limbo',
    E3M8: 'E3M8: Dis',
    E3M9: 'E3M9: Warrens',
    E4M1: 'E4M1: Hell Beneath',
    E4M2: 'E4M2: Perfect Hatred',
    E4M3: 'E4M3: Sever The Wicked',
    E4M4: 'E4M4: Unruly Evil',
    E4M5: 'E4M5: They Will Repent',
    E4M6: 'E4M6: Against Thee Wickedly',
    E4M7: 'E4M7: And Hell Followed',
    E4M8: 'E4M8: Unto The Cruel',
    E4M9: 'E4M9: Fear',
  },
  doom2: {
    MAP01: 'level 1: entryway',
    MAP02: 'level 2: underhalls',
    MAP03: 'level 3: the gantlet',
    MAP04: 'level 4: the focus',
    MAP05: 'level 5: the waste tunnels',
    MAP06: 'level 6: the crusher',
    MAP07: 'level 7: dead simple',
    MAP08: 'level 8: tricks and traps',
    MAP09: 'level 9: the pit',
    MAP10: 'level 10: refueling base',
    MAP11: "level 11: 'o' of destruction!",
    MAP12: 'level 12: the factory',
    MAP13: 'level 13: downtown',
    MAP14: 'level 14: the inmost dens',
    MAP15: 'level 15: industrial zone',
    MAP16: 'level 16: suburbs',
    MAP17: 'level 17: tenements',
    MAP18: 'level 18: the courtyard',
    MAP19: 'level 19: the citadel',
    MAP20: 'level 20: gotcha!',
    MAP21: 'level 21: nirvana',
    MAP22: 'level 22: the catacombs',
    MAP23: "level 23: barrels o' fun",
    MAP24: 'level 24: the chasm',
    MAP25: 'level 25: bloodfalls',
    MAP26: 'level 26: the abandoned mines',
    MAP27: 'level 27: monster condo',
    MAP28: 'level 28: the spirit world',
    MAP29: 'level 29: the living end',
    MAP30: 'level 30: icon of sin',
    MAP31: 'level 31: wolfenstein',
    MAP32: 'level 32: grosse',
  },
  plutonia: {
    MAP01: 'level 1: congo',
    MAP02: 'level 2: well of souls',
    MAP03: 'level 3: aztec',
    MAP04: 'level 4: caged',
    MAP05: 'level 5: ghost town',
    MAP06: "level 6: baron's lair",
    MAP07: 'level 7: caughtyard',
    MAP08: 'level 8: realm',
    MAP09: 'level 9: abattoire',
    MAP10: 'level 10: onslaught',
    MAP11: 'level 11: hunted',
    MAP12: 'level 12: speed',
    MAP13: 'level 13: the crypt',
    MAP14: 'level 14: genesis',
    MAP15: 'level 15: the twilight',
    MAP16: 'level 16: the omen',
    MAP17: 'level 17: compound',
    MAP18: 'level 18: neurosphere',
    MAP19: 'level 19: nme',
    MAP20: 'level 20: the death domain',
    MAP21: 'level 21: slayer',
    MAP22: 'level 22: impossible mission',
    MAP23: 'level 23: tombstone',
    MAP24: 'level 24: the final frontier',
    MAP25: 'level 25: the temple of darkness',
    MAP26: 'level 26: bunker',
    MAP27: 'level 27: anti-christ',
    MAP28: 'level 28: the sewers',
    MAP29: 'level 29: odyssey of noises',
    MAP30: 'level 30: the gateway of hell',
    MAP31: 'level 31: cyberden',
    MAP32: 'level 32: go 2 it',
  },
  tnt: {
    MAP01: 'level 1: system control',
    MAP02: 'level 2: human bbq',
    MAP03: 'level 3: power control',
    MAP04: 'level 4: wormhole',
    MAP05: 'level 5: hanger',
    MAP06: 'level 6: open season',
    MAP07: 'level 7: prison',
    MAP08: 'level 8: metal',
    MAP09: 'level 9: stronghold',
    MAP10: 'level 10: redemption',
    MAP11: 'level 11: storage facility',
    MAP12: 'level 12: crater',
    MAP13: 'level 13: nukage processing',
    MAP14: 'level 14: steel works',
    MAP15: 'level 15: dead zone',
    MAP16: 'level 16: deepest reaches',
    MAP17: 'level 17: processing area',
    MAP18: 'level 18: mill',
    MAP19: 'level 19: shipping/respawning',
    MAP20: 'level 20: central processing',
    MAP21: 'level 21: administration center',
    MAP22: 'level 22: habitat',
    MAP23: 'level 23: lunar mining project',
    MAP24: 'level 24: quarry',
    MAP25: "level 25: baron's den",
    MAP26: 'level 26: ballistyx',
    MAP27: 'level 27: mount pain',
    MAP28: 'level 28: heck',
    MAP29: 'level 29: river styx',
    MAP30: 'level 30: last call',
    MAP31: 'level 31: pharaoh',
    MAP32: 'level 32: caribbean',
  },
};

// g_game.c pars[][] and cpars[], in seconds. Vanilla has no episode 4 par times:
// pars[4][...] reads past the array into cpars[], so E4Mx gets cpars[x] (the
// values below, as Chocolate Doom emulates). wi_stuff.c never draws the par for
// episode 4 (it only draws it when epsd < 3).
export const PAR_TIMES = {
  doom: {
    E1M1: 30, E1M2: 75, E1M3: 120, E1M4: 90, E1M5: 165, E1M6: 180, E1M7: 180, E1M8: 30, E1M9: 165,
    E2M1: 90, E2M2: 90, E2M3: 90, E2M4: 120, E2M5: 90, E2M6: 360, E2M7: 240, E2M8: 30, E2M9: 170,
    E3M1: 90, E3M2: 45, E3M3: 90, E3M4: 150, E3M5: 90, E3M6: 90, E3M7: 165, E3M8: 30, E3M9: 135,
    E4M1: 90, E4M2: 120, E4M3: 120, E4M4: 90, E4M5: 150, E4M6: 120, E4M7: 120, E4M8: 270, E4M9: 90,
  },
  doom2: {
    MAP01: 30, MAP02: 90, MAP03: 120, MAP04: 120, MAP05: 90, MAP06: 150, MAP07: 120, MAP08: 120,
    MAP09: 270, MAP10: 90, MAP11: 210, MAP12: 150, MAP13: 150, MAP14: 150, MAP15: 210, MAP16: 150,
    MAP17: 420, MAP18: 150, MAP19: 210, MAP20: 150, MAP21: 240, MAP22: 150, MAP23: 180, MAP24: 150,
    MAP25: 150, MAP26: 300, MAP27: 330, MAP28: 420, MAP29: 300, MAP30: 180, MAP31: 120, MAP32: 30,
  },
};

// f_finale.c text screens. Doom shows its text after ExM8 and then the art
// screen (F_ArtScreenDrawer): HELP2 for episode 1 (CREDIT in Ultimate Doom),
// VICTORY2, the episode 3 bunny scroll (PFUB2/PFUB1, then END0-END6 with a
// pistol sound per stage) or ENDPIC. DOOM II shows c1-c4 after finishing
// MAP06/11/20/30 (MAP30 then starts the cast call) and c5/c6 when taking the
// secret exits from MAP15 (to MAP31) and MAP31 (to MAP32).
// The text types out one character every TEXTSPEED tics; Doom waits
// TEXTWAIT tics after the full text before moving to the art screen.
export const FINALE_TEXTSPEED = 3;
export const FINALE_TEXTWAIT = 250;
export const FINALE = {
  music: { doom: 'victor', doom2: 'read_m' },
  doom: {
    e1: { text: STRINGS.E1TEXT, flat: 'FLOOR4_8', afterMap: 8, map: 'E1M8', art: 'HELP2', artUltimate: 'CREDIT' },
    e2: { text: STRINGS.E2TEXT, flat: 'SFLR6_1', afterMap: 8, map: 'E2M8', art: 'VICTORY2' },
    e3: { text: STRINGS.E3TEXT, flat: 'MFLR8_4', afterMap: 8, map: 'E3M8', art: null, bunnyScroll: true },
    e4: { text: STRINGS.E4TEXT, flat: 'MFLR8_3', afterMap: 8, map: 'E4M8', art: 'ENDPIC' },
  },
  doom2: {
    c1: { text: STRINGS.C1TEXT, flat: 'SLIME16', afterMap: 6, map: 'MAP06' },
    c2: { text: STRINGS.C2TEXT, flat: 'RROCK14', afterMap: 11, map: 'MAP11' },
    c3: { text: STRINGS.C3TEXT, flat: 'RROCK07', afterMap: 20, map: 'MAP20' },
    c4: { text: STRINGS.C4TEXT, flat: 'RROCK17', afterMap: 30, map: 'MAP30' },
    c5: { text: STRINGS.C5TEXT, flat: 'RROCK13', afterMap: 15, map: 'MAP15' },
    c6: { text: STRINGS.C6TEXT, flat: 'RROCK19', afterMap: 31, map: 'MAP31' },
  },
  tnt: {
    c1: { text: STRINGS.T1TEXT, flat: 'SLIME16', afterMap: 6, map: 'MAP06' },
    c2: { text: STRINGS.T2TEXT, flat: 'RROCK14', afterMap: 11, map: 'MAP11' },
    c3: { text: STRINGS.T3TEXT, flat: 'RROCK07', afterMap: 20, map: 'MAP20' },
    c4: { text: STRINGS.T4TEXT, flat: 'RROCK17', afterMap: 30, map: 'MAP30' },
    c5: { text: STRINGS.T5TEXT, flat: 'RROCK13', afterMap: 15, map: 'MAP15' },
    c6: { text: STRINGS.T6TEXT, flat: 'RROCK19', afterMap: 31, map: 'MAP31' },
  },
  plutonia: {
    c1: { text: STRINGS.P1TEXT, flat: 'SLIME16', afterMap: 6, map: 'MAP06' },
    c2: { text: STRINGS.P2TEXT, flat: 'RROCK14', afterMap: 11, map: 'MAP11' },
    c3: { text: STRINGS.P3TEXT, flat: 'RROCK07', afterMap: 20, map: 'MAP20' },
    c4: { text: STRINGS.P4TEXT, flat: 'RROCK17', afterMap: 30, map: 'MAP30' },
    c5: { text: STRINGS.P5TEXT, flat: 'RROCK13', afterMap: 15, map: 'MAP15' },
    c6: { text: STRINGS.P6TEXT, flat: 'RROCK19', afterMap: 31, map: 'MAP31' },
  },
};

// wi_stuff.c intermission map data for episodes 1-3 (index 0-2 = wbs->epsd).
// lnodes[epsd][map] is where WISPLAT ("level done") and WIURH0/WIURH1 ("you are
// here") are drawn for map index 0-8 (patch offsets still apply).
// anims[epsd][j] animates the WIMAP<epsd> background with patches named
// WIA<epsd><j:02><frame:02>. period is TICRATE/3 = 11 (or TICRATE/4 = 8) tics.
// ANIM_ALWAYS loops, starting after 1 + M_Random() % period tics. ANIM_LEVEL
// steps once per period and holds its last frame, but only when wbs->next ==
// data1 at its first tic (anim 7 is held back during StatCount); the stats and
// ShowNextLoc phases both re-run WI_initAnimatedBack. ANIM_RANDOM (data1 =
// period deviation, data2 = base period) is unused by the stock tables.
// Episode 2 anim 8 has no lumps of its own: it reuses anim 4's patches
// ("MONDO HACK" in WI_loadData), recorded as patchesFrom: 4.
export const INTERMISSION = {
  lnodes: [
    [ // episode 1: E1M1..E1M9
      { x: 185, y: 164 }, { x: 148, y: 143 }, { x: 69, y: 122 },
      { x: 209, y: 102 }, { x: 116, y: 89 }, { x: 166, y: 55 },
      { x: 71, y: 56 }, { x: 135, y: 29 }, { x: 71, y: 24 },
    ],
    [ // episode 2: E2M1..E2M9
      { x: 254, y: 25 }, { x: 97, y: 50 }, { x: 188, y: 64 },
      { x: 128, y: 78 }, { x: 214, y: 92 }, { x: 133, y: 130 },
      { x: 208, y: 136 }, { x: 148, y: 140 }, { x: 235, y: 158 },
    ],
    [ // episode 3: E3M1..E3M9
      { x: 156, y: 168 }, { x: 48, y: 154 }, { x: 174, y: 95 },
      { x: 265, y: 75 }, { x: 130, y: 48 }, { x: 279, y: 23 },
      { x: 198, y: 48 }, { x: 140, y: 25 }, { x: 281, y: 136 },
    ],
  ],
  anims: [
    [
      { type: 'ANIM_ALWAYS', period: 11, nanims: 3, loc: { x: 224, y: 104 }, data1: 0, data2: 0 },
      { type: 'ANIM_ALWAYS', period: 11, nanims: 3, loc: { x: 184, y: 160 }, data1: 0, data2: 0 },
      { type: 'ANIM_ALWAYS', period: 11, nanims: 3, loc: { x: 112, y: 136 }, data1: 0, data2: 0 },
      { type: 'ANIM_ALWAYS', period: 11, nanims: 3, loc: { x: 72, y: 112 }, data1: 0, data2: 0 },
      { type: 'ANIM_ALWAYS', period: 11, nanims: 3, loc: { x: 88, y: 96 }, data1: 0, data2: 0 },
      { type: 'ANIM_ALWAYS', period: 11, nanims: 3, loc: { x: 64, y: 48 }, data1: 0, data2: 0 },
      { type: 'ANIM_ALWAYS', period: 11, nanims: 3, loc: { x: 192, y: 40 }, data1: 0, data2: 0 },
      { type: 'ANIM_ALWAYS', period: 11, nanims: 3, loc: { x: 136, y: 16 }, data1: 0, data2: 0 },
      { type: 'ANIM_ALWAYS', period: 11, nanims: 3, loc: { x: 80, y: 16 }, data1: 0, data2: 0 },
      { type: 'ANIM_ALWAYS', period: 11, nanims: 3, loc: { x: 64, y: 24 }, data1: 0, data2: 0 },
    ],
    [
      { type: 'ANIM_LEVEL', period: 11, nanims: 1, loc: { x: 128, y: 136 }, data1: 1, data2: 0 },
      { type: 'ANIM_LEVEL', period: 11, nanims: 1, loc: { x: 128, y: 136 }, data1: 2, data2: 0 },
      { type: 'ANIM_LEVEL', period: 11, nanims: 1, loc: { x: 128, y: 136 }, data1: 3, data2: 0 },
      { type: 'ANIM_LEVEL', period: 11, nanims: 1, loc: { x: 128, y: 136 }, data1: 4, data2: 0 },
      { type: 'ANIM_LEVEL', period: 11, nanims: 1, loc: { x: 128, y: 136 }, data1: 5, data2: 0 },
      { type: 'ANIM_LEVEL', period: 11, nanims: 1, loc: { x: 128, y: 136 }, data1: 6, data2: 0 },
      { type: 'ANIM_LEVEL', period: 11, nanims: 1, loc: { x: 128, y: 136 }, data1: 7, data2: 0 },
      { type: 'ANIM_LEVEL', period: 11, nanims: 3, loc: { x: 192, y: 144 }, data1: 8, data2: 0 },
      { type: 'ANIM_LEVEL', period: 11, nanims: 1, loc: { x: 128, y: 136 }, data1: 8, data2: 0, patchesFrom: 4 },
    ],
    [
      { type: 'ANIM_ALWAYS', period: 11, nanims: 3, loc: { x: 104, y: 168 }, data1: 0, data2: 0 },
      { type: 'ANIM_ALWAYS', period: 11, nanims: 3, loc: { x: 40, y: 136 }, data1: 0, data2: 0 },
      { type: 'ANIM_ALWAYS', period: 11, nanims: 3, loc: { x: 160, y: 96 }, data1: 0, data2: 0 },
      { type: 'ANIM_ALWAYS', period: 11, nanims: 3, loc: { x: 104, y: 80 }, data1: 0, data2: 0 },
      { type: 'ANIM_ALWAYS', period: 11, nanims: 3, loc: { x: 120, y: 32 }, data1: 0, data2: 0 },
      { type: 'ANIM_ALWAYS', period: 8, nanims: 3, loc: { x: 40, y: 0 }, data1: 0, data2: 0 },
    ],
  ],
};

// f_finale.c castorder[]: the DOOM II cast call after MAP30.
export const CAST = [
  { name: 'ZOMBIEMAN', type: 'MT_POSSESSED' },
  { name: 'SHOTGUN GUY', type: 'MT_SHOTGUY' },
  { name: 'HEAVY WEAPON DUDE', type: 'MT_CHAINGUY' },
  { name: 'IMP', type: 'MT_TROOP' },
  { name: 'DEMON', type: 'MT_SERGEANT' },
  { name: 'LOST SOUL', type: 'MT_SKULL' },
  { name: 'CACODEMON', type: 'MT_HEAD' },
  { name: 'HELL KNIGHT', type: 'MT_KNIGHT' },
  { name: 'BARON OF HELL', type: 'MT_BRUISER' },
  { name: 'ARACHNOTRON', type: 'MT_BABY' },
  { name: 'PAIN ELEMENTAL', type: 'MT_PAIN' },
  { name: 'REVENANT', type: 'MT_UNDEAD' },
  { name: 'MANCUBUS', type: 'MT_FATSO' },
  { name: 'ARCH-VILE', type: 'MT_VILE' },
  { name: 'THE SPIDER MASTERMIND', type: 'MT_SPIDER' },
  { name: 'THE CYBERDEMON', type: 'MT_CYBORG' },
  { name: 'OUR HERO', type: 'MT_PLAYER' },
];

// st_stuff.c / am_map.c cheat sequences. params is the number of characters
// typed after the sequence (idmus##, idclev##). noclip (idspispopd) only works
// in Doom 1 and commercial_noclip (idclip) only in DOOM II; powerup[0-5] are
// idbehold v/s/i/r/a/l and powerup[6] is bare idbehold, which prints
// STSTR_BEHOLD. amap (iddt) is checked by the automap while it is open.
// idmypos prints "ang=0x%x;x,y=(0x%x,0x%x)" (angle, x, y in hex fixed point).
export const CHEATS = {
  mus: { seq: 'idmus', params: 2 },
  god: { seq: 'iddqd', params: 0 },
  ammo: { seq: 'idkfa', params: 0 },
  ammonokey: { seq: 'idfa', params: 0 },
  noclip: { seq: 'idspispopd', params: 0 },
  commercial_noclip: { seq: 'idclip', params: 0 },
  powerup: [
    { seq: 'idbeholdv', params: 0 },
    { seq: 'idbeholds', params: 0 },
    { seq: 'idbeholdi', params: 0 },
    { seq: 'idbeholdr', params: 0 },
    { seq: 'idbeholda', params: 0 },
    { seq: 'idbeholdl', params: 0 },
    { seq: 'idbehold', params: 0 },
  ],
  choppers: { seq: 'idchoppers', params: 0 },
  clev: { seq: 'idclev', params: 2 },
  mypos: { seq: 'idmypos', params: 0 },
  amap: { seq: 'iddt', params: 0 },
};

// Quit confirmation messages (m_menu.c). The v1.9 executables pick
// endmsg[gametic % 8] from the list for the running game and append
// "\n\n" + STRINGS.DOSY. Index 0 is QUITMSG in both lists.
export const QUIT_MESSAGES = {
  doom: [
    'are you sure you want to\nquit this great game?',
    "please don't leave, there's more\ndemons to toast!",
    "let's beat it -- this is turning\ninto a bloodbath!",
    "i wouldn't leave if i were you.\ndos is much worse.",
    "you're trying to say you like dos\nbetter than me, right?",
    "don't leave yet -- there's a\ndemon around that corner!",
    "ya know, next time you come in here\ni'm gonna toast ya.",
    'go ahead and leave. see if i care.',
  ],
  doom2: [
    'are you sure you want to\nquit this great game?',
    'you want to quit?\nthen, thou hast lost an eighth!',
    "don't go now, there's a \ndimensional shambler waiting\nat the dos prompt!",
    'get outta here and go back\nto your boring programs.',
    "if i were your boss, i'd \n deathmatch ya in a minute!",
    'look, bud. you leave now\nand you forfeit your body count!',
    "just leave. when you come\nback, i'll be waiting with a bat.",
    "you're lucky i don't smack\nyou for thinking about leaving.",
  ],
};

// m_random.c rndtable[256]. P_Random/M_Random pre-increment their index:
// index = (index + 1) & 0xff; return RNDTABLE[index].
export const RNDTABLE = [
    0,   8, 109, 220, 222, 241, 149, 107,  75, 248, 254, 140,  16,  66,  74,  21,
  211,  47,  80, 242, 154,  27, 205, 128, 161,  89,  77,  36,  95, 110,  85,  48,
  212, 140, 211, 249,  22,  79, 200,  50,  28, 188,  52, 140, 202, 120,  68, 145,
   62,  70, 184, 190,  91, 197, 152, 224, 149, 104,  25, 178, 252, 182, 202, 182,
  141, 197,   4,  81, 181, 242, 145,  42,  39, 227, 156, 198, 225, 193, 219,  93,
  122, 175, 249,   0, 175, 143,  70, 239,  46, 246, 163,  53, 163, 109, 168, 135,
    2, 235,  25,  92,  20, 145, 138,  77,  69, 166,  78, 176, 173, 212, 166, 113,
   94, 161,  41,  50, 239,  49, 111, 164,  70,  60,   2,  37, 171,  75, 136, 156,
   11,  56,  42, 146, 138, 229,  73, 146,  77,  61,  98, 196, 135, 106,  63, 197,
  195,  86,  96, 203, 113, 101, 170, 247, 181, 113,  80, 250, 108,   7, 255, 237,
  129, 226,  79, 107, 112, 166, 103, 241,  24, 223, 239, 120, 198,  58,  60,  82,
  128,   3, 184,  66, 143, 224, 145, 224,  81, 206, 163,  45,  63,  90, 168, 114,
   59,  33, 159,  95,  28, 139, 123,  98, 125, 196,  15,  70, 194, 253,  54,  14,
  109, 226,  71,  17, 161,  93, 186,  87, 244, 138,  20,  52, 123, 251,  26,  36,
   17,  46,  52, 231, 232,  76,  31, 221,  84,  37, 216, 165, 212, 106, 197, 242,
   98,  43,  39, 175, 254, 145, 190,  84, 118, 222, 187, 136, 120, 163, 236, 249,
];
