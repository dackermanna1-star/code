// Text for the VGUI team / class menus.

// briefings for other maps, by game mode (the team select shows the map's own name)
export const MODE_BRIEFING = {
  hostage: [
    'Mission Briefing:',
    '',
    'Counter-Terrorists: Rescue the hostages. Walk up to a hostage and press USE to make it follow you, then lead it back to your spawn.',
    '',
    'Terrorists: Prevent the Counter-Terrorists from rescuing the hostages.',
  ],
  bomb: [
    'Mission Briefing:',
    '',
    'Terrorists: Plant the bomb at one of the bomb targets.',
    '',
    'Counter-Terrorists: Prevent the bombing. If the bomb is planted, defuse it before it detonates.',
  ],
};

export const MAP_BRIEFING = {
  title: 'de_dust2',
  text: [
    'Mission Briefing:',
    '',
    'Terrorists: Destroy one of the two bomb targets.',
    '',
    'Counter-Terrorists: Prevent the Terrorists from bombing either target. If the bomb is planted, defuse it before it detonates.',
    '',
    'The Terrorists start in their spawn to the south; the Counter-Terrorists start between bombsite A and bombsite B to the north.',
    '',
    'Map by David Johnston',
  ],
};

export const TEAM_BUTTONS = [
  { key: 1, label: 'Terrorist Forces' },
  { key: 2, label: 'CT Forces' },
  null,
  { key: 5, label: 'Auto-Select' },
  { key: 6, label: 'Spectate' },
];

export const CLASSES = {
  T: [
    { key: 1, skin: 'terror', name: 'Phoenix Connexion', text: 'Having established a reputation for killing anyone that gets in their way, the Phoenix Faction is one of the most feared terrorist groups in Eastern Europe. Formed shortly after the breakup of the USSR.' },
    { key: 2, skin: 'leet', name: 'Elite Crew', text: 'Middle Eastern fundamentalist group bent on world domination and various other evil deeds.' },
    { key: 3, skin: 'arctic', name: 'Arctic Avengers', text: 'Swedish terrorist faction founded in 1977. Famous for their bombing of the Canadian embassy in 1990.' },
    { key: 4, skin: 'guerilla', name: 'Guerilla Warfare', text: 'A terrorist faction founded in the Middle East, this group has a reputation for ruthlessness. Their disgust for the American lifestyle was demonstrated in their 1982 bombing of a school bus full of Rock and Roll musicians.' },
  ],
  CT: [
    { key: 1, skin: 'urban', name: 'Seal Team 6', text: 'ST-6 (to be known later as DEVGRU) was founded in 1980 under the command of Lieutenant-Commander Richard Marcincko. ST-6 was placed on permanent alert to respond to terrorist attacks against American targets worldwide.' },
    { key: 2, skin: 'gsg9', name: 'GSG-9', text: 'GSG-9 was born out of the tragic events that led to the death of several Israeli athletes during the 1972 Olympic games in Munich, Germany.' },
    { key: 3, skin: 'sas', name: 'SAS', text: 'The world-renowned British SAS was founded in the Second World War by a man named David Stirling. Their role during WW2 involved gathering intelligence behind enemy lines and executing sabotage strikes and assassinations against key targets.' },
    { key: 4, skin: 'gign', name: 'GIGN', text: "France's elite Counter-Terrorist unit, the GIGN, was designed to be a fast response force that could decisively react to any large-scale terrorist incident. Consisting of no more than 100 men, the GIGN has earned its reputation through a history of successful ops." },
  ],
};

export const AUTO_SELECT_TEXT = 'Let the game choose a model for you.';
