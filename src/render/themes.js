// Visual + gameplay flavour for each dungeon depth.
export const THEMES = [
  {
    id: 'crypt',
    name: 'The Forgotten Crypt',
    wall: '#6f6a66', mortar: '#2a2522', floor: '#6a625a', ceiling: '#3d3835', moss: '#4d5a36',
    fog: '#0d0f14', fogDensity: 0.046, hemiSky: '#5068a8', hemiGround: '#2a1e18', hemiIntensity: 0.75,
    torch: '#ffa860', accent: '#8fb3ff', blood: '#7a0d0d',
    enemies: { skeleton: 4, skeletonArcher: 2, ghoul: 2, slime: 1.2, bat: 1.3, goblin: 1, spider: 1.5, bandit: 1.3, banditArcher: 0.8 },
  },
  {
    id: 'warrens',
    name: 'The Goblin Warrens',
    wall: '#7a5f48', mortar: '#2b1d14', floor: '#6b5640', ceiling: '#3b2c20', moss: null,
    fog: '#120c08', fogDensity: 0.045, hemiSky: '#6a6a98', hemiGround: '#20140c', hemiIntensity: 0.7,
    torch: '#ffb468', accent: '#ffcf6b', blood: '#7a0d0d',
    enemies: { goblin: 3.5, bandit: 2.2, banditArcher: 1.6, spearman: 1.6, brute: 1.5, bat: 1.5, cultist: 1, bomber: 1.2, spider: 1.4, skeleton: 0.8, slime: 0.8 },
  },
  {
    id: 'catacombs',
    name: 'The Drowned Catacombs',
    wall: '#4f6766', mortar: '#162222', floor: '#4b5b58', ceiling: '#283433', moss: '#3f6b4a',
    fog: '#08131a', fogDensity: 0.06, hemiSky: '#4f8a95', hemiGround: '#0d1a1a', hemiIntensity: 0.55,
    torch: '#7fe0ff', accent: '#66ffd9', blood: '#5c0c12',
    enemies: { ghoul: 3, slime: 2, skeleton: 2, skeletonGuard: 2, cultist: 2, knight: 1.3, skeletonArcher: 1.5, spider: 1.5, bat: 1 },
  },
  {
    id: 'forge',
    name: 'The Infernal Forge',
    wall: '#5a3a33', mortar: '#140806', floor: '#4a3430', ceiling: '#251512', moss: null, lava: true,
    fog: '#160604', fogDensity: 0.05, hemiSky: '#a04a2a', hemiGround: '#200805', hemiIntensity: 0.55,
    torch: '#ff6a2a', accent: '#ff5522', blood: '#6e0a0a',
    enemies: { brute: 2.3, cultist: 2.3, knight: 2, sellsword: 2, spearman: 1.6, banditArcher: 1.5, bomber: 2, goblin: 1.5, skeletonArcher: 0.6 },
  },
  {
    id: 'abyss',
    name: 'The Abyssal Depths',
    wall: '#4a4060', mortar: '#120e1a', floor: '#3e3650', ceiling: '#1e1a28', moss: '#5d3f8a',
    fog: '#0b0814', fogDensity: 0.058, hemiSky: '#7a5aaa', hemiGround: '#0e0816', hemiIntensity: 0.6,
    torch: '#c48aff', accent: '#e07aff', blood: '#4a0a3a',
    enemies: { knight: 2.6, ghoul: 2, cultist: 2.3, brute: 1.8, sellsword: 1.6, skeletonGuard: 2, bomber: 1.4, skeleton: 1.2, skeletonArcher: 1.4, spider: 1 },
  },
];

export function themeForFloor(floor) {
  return THEMES[(floor - 1) % THEMES.length];
}
