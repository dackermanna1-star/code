// CS 1.6 buy menu contents: categories, per-team item order (number keys),
// prices and the info-panel text shown next to the weapon picture.

export const CATEGORIES = [
  { key: 1, id: 'pistol', label: 'Handgun' },
  { key: 2, id: 'shotgun', label: 'Shotgun' },
  { key: 3, id: 'smg', label: 'Sub-Machine Gun' },
  { key: 4, id: 'rifle', label: 'Rifle' },
  { key: 5, id: 'mg', label: 'Machine Gun' },
  { key: 6, id: 'primammo', label: 'Primary weapon ammo', direct: true },
  { key: 7, id: 'secammo', label: 'Secondary weapon ammo', direct: true },
  { key: 8, id: 'equip', label: 'Equipment' },
];

// item order per category and team (index + 1 = number key)
// ALL: zombie survival sells both teams' guns (the auto-snipers move to the MG page so
// every page fits the 1-9 keys)
export const MENU = {
  pistol: { T: ['glock', 'usp', 'p228', 'deagle', 'elite'], CT: ['glock', 'usp', 'p228', 'deagle', 'fiveseven'], ALL: ['glock', 'usp', 'p228', 'deagle', 'elite', 'fiveseven'] },
  shotgun: { T: ['m3', 'xm1014'], CT: ['m3', 'xm1014'] },
  smg: { T: ['mac10', 'mp5', 'ump45', 'p90'], CT: ['tmp', 'mp5', 'ump45', 'p90'], ALL: ['mac10', 'tmp', 'mp5', 'ump45', 'p90'] },
  rifle: { T: ['galil', 'ak47', 'scout', 'sg552', 'awp', 'g3sg1'], CT: ['famas', 'scout', 'm4a1', 'aug', 'sg550', 'awp'], ALL: ['galil', 'famas', 'ak47', 'm4a1', 'sg552', 'aug', 'scout', 'awp'] },
  mg: { T: ['m249'], CT: ['m249'], ALL: ['m249', 'g3sg1', 'sg550', 'flamethrower', 'm32', 'rpg'] },
  equip: {
    T: ['vest', 'vesthelm', 'flashbang', 'hegrenade', 'smokegrenade', 'nvgs'],
    CT: ['vest', 'vesthelm', 'flashbang', 'hegrenade', 'smokegrenade', 'defuser', 'nvgs'],
    ALL: ['vest', 'vesthelm', 'flashbang', 'hegrenade', 'smokegrenade', 'molotov', 'nvgs'],
  },
};

// name, price and the classic VGUI info text
// [price, origin, caliber, clip, rate, weight, projectile, velocity, energy]
const W = (name, price, origin, caliber, clip, rate, weight, proj, vel, energy) => ({ name, price, stats: { origin, caliber, clip, rate, weight, proj, vel, energy } });

export const ITEMS = {
  glock: W('9x19mm Sidearm', 400, 'Austria', '9mm Parabellum', '20 rounds', 'N/A', '0.9 kg', '8 g', '1,132 ft/s', '475 Joules'),
  usp: W('K&M .45 Tactical', 500, 'Germany', '.45 ACP', '12 rounds', 'N/A', '1 kg', '15.2 g', '886 ft/s', '553 Joules'),
  p228: W('228 Compact', 600, 'Switzerland / Germany', '.357 SIG', '13 rounds', 'N/A', '1.03 kg', '8.1 g', '1,400 ft/s', '600 Joules'),
  deagle: W('Night Hawk .50C', 650, 'Israel', '.50 Action Express', '7 rounds', 'N/A', '2 kg', '19.4 g', '1,380 ft/s', '1,650 Joules'),
  elite: W('.40 Dual Elites', 800, 'Italy', '9mm Parabellum', '30 rounds', 'N/A', '2.03 kg', '8 g', '1,280 ft/s', '575 Joules'),
  fiveseven: W('ES Five-Seven', 750, 'Belgium', '5.7 x 28mm', '20 rounds', 'N/A', '0.8 kg', '2 g', '2,345 ft/s', '465 Joules'),
  m3: W('Leone 12 Gauge Super', 1700, 'Italy', '12 Gauge', '8 rounds', '68 RPM', '3.5 kg', '50 g (shot)', '1,200 ft/s', '2,193 Joules'),
  xm1014: W('Leone YG1265 Auto Shotgun', 3000, 'Italy', '12 Gauge', '7 rounds', '240 RPM', '4 kg', '50 g (shot)', '1,200 ft/s', '2,193 Joules'),
  mac10: W('Ingram MAC-10', 1400, 'USA', '.45 ACP', '30 rounds', '857 RPM', '3.82 kg', '15.2 g', '919 ft/s', '584 Joules'),
  tmp: W('Schmidt Machine Pistol', 1250, 'Austria', '9mm Parabellum', '30 rounds', '857 RPM', '1.3 kg', '8 g', '1,132 ft/s', '475 Joules'),
  mp5: W('K&M Sub-Machine Gun', 1500, 'Germany', '9mm Parabellum', '30 rounds', '800 RPM', '3.42 kg', '8 g', '1,132 ft/s', '475 Joules'),
  ump45: W('K&M UMP45', 1700, 'Germany', '.45 ACP', '25 rounds', '600 RPM', '2.27 kg', '15.2 g', '1,005 ft/s', '625 Joules'),
  p90: W('ES C90', 2350, 'Belgium', '5.7 x 28mm', '50 rounds', '900 RPM', '3 kg', '2 g', '2,345 ft/s', '465 Joules'),
  galil: W('IDF Defender', 2000, 'Israel', '5.56 NATO', '35 rounds', '650 RPM', '4.1 kg', '4 g', '3,001 ft/s', '1,767 Joules'),
  famas: W('Clarion 5.56', 2250, 'France', '5.56 NATO', '25 rounds', '1,100 RPM', '3.4 kg', '4 g', '3,166 ft/s', '1,775 Joules'),
  ak47: W('CV-47', 2500, 'Russia', '7.62 x 39mm', '30 rounds', '600 RPM', '4.3 kg', '7.9 g', '2,329 ft/s', '1,992 Joules'),
  m4a1: W('Maverick M4A1 Carbine', 3100, 'USA', '5.56 NATO', '30 rounds', '685 RPM', '3.22 kg', '4 g', '2,900 ft/s', '1,708 Joules'),
  sg552: W('Krieg 552', 3500, 'Switzerland', '5.56 NATO', '30 rounds', '727 RPM', '3.5 kg', '4 g', '2,887 ft/s', '1,691 Joules'),
  aug: W('Bullpup', 3500, 'Austria', '5.56 NATO', '30 rounds', '727 RPM', '3.85 kg', '4 g', '3,182 ft/s', '1,793 Joules'),
  scout: W('Schmidt Scout', 2750, 'Austria', '7.62 NATO', '10 rounds', 'N/A', '3.3 kg', '9.8 g', '2,800 ft/s', '2,200 Joules'),
  awp: W('Magnum Sniper Rifle', 4750, 'United Kingdom', '.338 Lapua Magnum', '10 rounds', 'N/A', '6.5 kg', '16.2 g', '3,000 ft/s', '7,000 Joules'),
  g3sg1: W('D3/AU-1', 5000, 'Germany', '7.62 NATO', '20 rounds', 'N/A', '8.9 kg', '9.3 g', '2,800 ft/s', '2,200 Joules'),
  sg550: W('Krieg 550 Commando', 4200, 'Switzerland', '5.56 NATO', '30 rounds', 'N/A', '7.02 kg', '4 g', '3,100 ft/s', '1,785 Joules'),
  m249: W('ES M249 Para', 5750, 'Belgium', '5.56 NATO', '100 rounds', '600 RPM', '7.5 kg', '4 g', '3,000 ft/s', '1,743 Joules'),
  flamethrower: W('M2 Flamethrower', 3500, 'USA', 'Fuel', '100 units', 'Continuous', '30 kg', 'N/A', 'N/A', 'Sets them on fire'),
  m32: W('M32 Grenade Launcher', 4200, 'South Africa', '40 mm', '6 rounds', 'Semi-auto', '5.3 kg', '230 g', '250 ft/s', 'Explodes on contact'),
  rpg: W('RPG-7', 5000, 'USSR', '85 mm rocket', '1 rocket', 'Single shot', '7 kg', '2.6 kg', '380 ft/s', 'Explodes on contact'),
  molotov: { name: 'Molotov Cocktail', price: 400, text: 'A bottle of fuel with a burning rag. Shatters where it lands and sets the floor on fire for 7 seconds. Carry up to 3.' },
  vest: { name: 'Kevlar Vest', price: 650, text: 'Body armour. Absorbs part of the damage from shots to the chest, stomach and arms.' },
  vesthelm: { name: 'Kevlar Vest & Helmet', price: 1000, text: 'Body armour and a kevlar helmet that also protects against shots to the head.' },
  flashbang: { name: 'Flashbang', price: 200, text: 'Stun grenade. Temporarily blinds and deafens anyone looking at it when it detonates.' },
  hegrenade: { name: 'HE Grenade', price: 300, text: 'High explosive fragmentation grenade.' },
  smokegrenade: { name: 'Smoke Grenade', price: 300, text: 'Creates a dense cloud of smoke that blocks vision.' },
  defuser: { name: 'Defusal Kit', price: 200, text: 'Cuts the time needed to defuse the bomb from 10 to 5 seconds.' },
  nvgs: { name: 'NightVision Goggles', price: 1250, text: 'Lets you see in dark areas. Press N to toggle.' },
};

// equipment pictures in the info panel reuse the HUD / kill icons
export const ITEM_ICON = { vest: 'suit_full', vesthelm: 'suithelmet_full', defuser: 'defuser', nvgs: null, flashbang: 'flashbang', hegrenade: 'hegrenade', smokegrenade: 'smokegrenade', molotov: 'molotov' };

export function itemsFor(cat, team) {
  const t = team === 'CT' ? 'CT' : team === 'ALL' ? 'ALL' : 'T';
  return (MENU[cat] && (MENU[cat][t] || MENU[cat].T)) || [];
}
