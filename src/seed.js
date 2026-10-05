// Initial database contents.
//
// Provenance (see docs/RESEARCH.md):
//  * Catalog items made by ROBLOX: real 2007-2008 items, names, asset ids,
//    release dates and prices from the archived Dec 2007 catalog and the
//    ROBLOX wiki. Where a price could not be verified it is marked `unverifiedPrice`.
//  * Games list: real titles/creators/stats as captured on roblox.com's Games
//    page (Sept 2008 Wayback copy, and the 2008 screenshot provided with the brief).
//  * Everything else (ordinary members, forum threads, messages, comments,
//    user-made clothing) is fictional filler written in the style of the era.
'use strict';
const clock = require('./clock');
const crypto = require('crypto');

const SEED_VERSION = 8;
const DAY = 86400000;
let NOW = 0; // set from the site clock when seeding
const ago = (days) => NOW - Math.round(days * DAY);

function hashPassword(password) {
  const salt = crypto.randomBytes(8).toString('hex');
  return `${salt}$${crypto.createHash('sha256').update(salt + ':' + password).digest('hex')}`;
}

// 2008 default look for new members: Bright yellow head and arms, a random
// torso colour and blue legs (2007-2009 default, see research notes).
const PALETTE32 = [1, 208, 194, 199, 26, 21, 24, 226, 23, 107, 102, 11, 45, 135, 106, 105, 141, 28, 37, 119, 29, 151, 38, 192, 104, 9, 101, 5, 153, 217, 18, 125];
function defaultColors(seed = Math.random()) {
  const torso = PALETTE32[Math.floor(seed * PALETTE32.length) % PALETTE32.length];
  return { head: 24, torso, leftArm: 24, rightArm: 24, leftLeg: 102, rightLeg: 102 };
}
const NOOB = { head: 24, torso: 23, leftArm: 24, rightArm: 24, leftLeg: 119, rightLeg: 119 };

// --- Catalog --------------------------------------------------------------------
// type: Hat | TShirt | Shirt | Pants | Decal | Model
// For hats `model` names the builder in public/js/engine/hats.js.
const ROBLOX_HATS = [
  // 2007
  { id: 1028606, name: 'Red Baseball Cap', model: 'RedBaseballCap', created: '2007-05-30', robux: 7, desc: 'Colored a bombastic red, with a stylish looking R on the front.' },
  { id: 1028728, name: 'Blue Baseball Cap', model: 'BlueBaseballCap', created: '2007-05-30', robux: 24, desc: '' },
  { id: 1028715, name: 'Purple Banded Top Hat', model: 'PurpleBandedTopHat', created: '2007-05-30', robux: 5000, unverifiedPrice: true, desc: '' },
  { id: 1028720, name: 'Classic ROBLOX Viking Helm', model: 'VikingHelm', created: '2007-05-30', robux: 125, desc: 'A sturdy Nordic helm fit for Erik the Red!' },
  { id: 1028793, name: 'ROBLOX Classic Police Cap', model: 'PoliceCap', created: '2007-05-30', robux: 125, desc: '' },
  { id: 1028859, name: "Pirate Captain's Hat", model: 'PirateCaptainsHat', created: '2007-05-30', robux: 2000, unverifiedPrice: true, desc: '' },
  { id: 1029025, name: 'The Classic ROBLOX Fedora', model: 'Fedora', created: '2007-05-31', robux: 900, desc: 'A black felt fedora. Ideal for 1920s journalists, detectives, and Linux hackers.' },
  { id: 1029597, name: 'Brown Cowboy Hat', model: 'BrownCowboyHat', created: '2007-06-01', robux: 214, desc: '' },
  { id: 1033722, name: 'Straw Hat', model: 'StrawHat', created: '2007-06-11', robux: 98, desc: 'Made from the finest straws.' },
  { id: 1045408, name: 'Teapot Hat', model: 'TeapotHat', created: '2007-06-29', robux: 1337, creatorName: 'ROBLOX', desc: 'omg y is ur hed a teepawt??' },
  { id: 1048037, name: 'Bighead', model: 'Bighead', created: '2007-07-02', robux: 70, desc: '' },
  { id: 1049198, name: "ROBLOX Classic: Wizard's Hat", model: 'WizardHat', created: '2007-07-03', robux: 50, desc: '' },
  { id: 1081239, name: 'Bucket', model: 'Bucket', created: '2007-08-02', tix: 7331, desc: 'I HAS A BUCKET.' },
  { id: 1082932, name: 'Traffic Cone', model: 'TrafficCone', created: '2007-08-03', tix: 1000, desc: '' },
  { id: 1080950, name: 'Headstack', model: 'Headstack', created: '2007-08-02', tix: 280, desc: '' },
  { id: 1081381, name: 'Firefighter Helmet', model: 'FirefighterHelmet', created: '2007-08-02', tix: 40, desc: '' },
  { id: 1081366, name: 'Astronaut Helmet', model: 'AstronautHelmet', created: '2007-08-02', tix: 115, desc: '' },
  { id: 1080949, name: 'Bunny Ears', model: 'BunnyEars', created: '2007-08-02', robux: 242, desc: 'They keep going and going and going.' },
  { id: 1090508, name: 'Mushroom Hat', model: 'MushroomHat', created: '2007-08-09', tix: 80, desc: '' },
  { id: 1090511, name: 'Sapling', model: 'Sapling', created: '2007-08-09', tix: 100, desc: '' },
  { id: 1098282, name: 'Lampshade', model: 'Lampshade', created: '2007-08-15', tix: 27, desc: '' },
  { id: 1098271, name: 'Mouse Ears', model: 'MouseEars', created: '2007-08-15', tix: 30, desc: 'These black circles look astonishingly similar to mouse ears.' },
  { id: 1098284, name: 'Ribbons', model: 'Ribbons', created: '2007-08-15', tix: 20, desc: '' },
  { id: 1098272, name: 'Little Fluffy Cloud', model: 'LittleFluffyCloud', created: '2007-08-15', tix: 85, desc: '' },
  { id: 1098278, name: 'Satellite Dish', model: 'SatelliteDish', created: '2007-08-15', tix: 325, desc: '' },
  { id: 1098277, name: 'Santa Hat', model: 'SantaHat', created: '2007-08-15', robux: 37, desc: 'August is a fitting time for a Santa Hat.' },
  { id: 1098285, name: 'Stage Prop', model: 'StageProp', created: '2007-08-15', tix: 50, desc: '' },
  { id: 1082936, name: 'Floppy Fish', model: 'FloppyFish', created: '2007-08-03', tix: 60, desc: '' },
  { id: 1090516, name: 'Screw', model: 'Screw', created: '2007-08-09', tix: 70, desc: '' },
  { id: 1136591, name: 'Biology Textbook', model: 'BiologyTextbook', created: '2007-09-12', tix: 90, desc: '' },
  { id: 1139753, name: 'Chemistry Textbook', model: 'ChemistryTextbook', created: '2007-09-14', tix: 90, desc: '' },
  { id: 1098274, name: 'Game Input Device', model: 'GameInputDevice', created: '2007-08-15', tix: 125, desc: '' },
  { id: 1082935, name: 'Headrow', model: 'Headrow', created: '2007-08-03', tix: 210, desc: '' },
  { id: 1098276, name: 'Hammerhead', model: 'Hammerhead', created: '2007-08-15', tix: 250, desc: '' },
  { id: 1086818, name: 'T-Bone Visor', model: 'TBoneVisor', created: '2007-08-06', tix: 400, desc: '' },
  { id: 1158038, name: 'Classic ROBLOX Pumpkin Head', model: 'PumpkinHead', created: '2007-10-04', robux: 250, offsale: true, desc: '' },
  { id: 1165243, name: 'Witch Hat', model: 'WitchHat', created: '2007-10-10', robux: 75, offsale: true, desc: '' },
  { id: 1235487, name: 'Elf Hat', model: 'ElfHat', created: '2007-11-27', tix: 50, desc: '' },
  { id: 1080951, name: 'Builders Club Hard Hat', model: 'BCHardHat', created: '2007-08-02', bcOnly: true, desc: '' },
  // 2008
  { id: 1309911, name: 'Ninja Mask of Shadows', model: 'NinjaMask', created: '2008-01-02', robux: 12, desc: 'The Ninjas of Shadow strike from the darkness...' },
  { id: 1309918, name: 'Blue Winter Cap', model: 'BlueWinterCap', created: '2008-01-02', tix: 29, desc: 'Freezing to death is for chumps.' },
  { id: 1365767, name: 'Valkyrie Helm', model: 'ValkyrieHelm', created: '2008-01-26', tix: 30000, desc: '' },
  { id: 1374258, name: 'Chef Hat', model: 'ChefHat', created: '2008-01-28', tix: 35, desc: 'Anyone can cook! ...if you can afford this hat.' },
  { id: 1374269, name: 'Kitty Ears', model: 'KittyEars', created: '2008-01-31', tix: 30, desc: 'MY EARS. LET ME SHOW YOU THEM.' },
  { id: 1459035, name: '2008 ROBLOX Visor', model: 'RobloxVisor', created: '2008-02-28', tix: 8, desc: '' },
  { id: 1590045, name: 'Football Helmet', model: 'FootballHelmet', created: '2008-03-31', tix: 102, desc: '' },
];

// ROBLOX-made T-shirts on sale in Dec 2007 (prices from the archived catalog).
const ROBLOX_TSHIRTS = [
  ['Do the Brew!', 2, 'brew'], ['Bloxxer', 4, 'bloxxer'], ['Viking Torso', 4, 'viking'], ['Vest', 5, 'vest'],
  ['ASSERT(hax0r);', 5, 'assert'], ['Friends', 8, 'friends'], ['Cat Suit', 9, 'catsuit'], ['Robot', 12, 'robot'],
  ['Inmate', 12, 'inmate'], ['Ballerina', 13, 'ballerina'], ['Erik Is My Hero', 16, 'erik'], ['Camo', 16, 'camo'],
  ['Free Predator', 17, 'predator'], ['Cowboy Vest', 19, 'cowboyvest'], ['Matt Dusek Rox', 23, 'dusek'], ['Raven', 25, 'raven'],
  ['I Heart BM', 45, 'iheartbm'], ['Hawaiian', 56, 'hawaiian'],
];
const ROBLOX_TSHIRTS_ROBUX = [
  { id: 1027950, name: '1 ROBUK Shirt', robux: 1, design: 'robuk' },
  { id: 1028899, name: 'Police Uniform', robux: 3, tix: 15, design: 'police' },
];

// Shirts and Pants released with the clothing update of Apr 24, 2008.
const ROBLOX_CLOTHING = [
  { id: 1804770, type: 'Shirt', name: 'Battle Shirt of Awesomeness', tix: 200, created: '2008-04-24', spec: { style: 'battle', color: '#3a3f47', color2: '#c4281c', color3: '#d8b040' }, desc: '' },
  { id: 1804767, type: 'Pants', name: 'Battle Pants of Awesomeness', tix: 200, created: '2008-04-24', spec: { style: 'battle', color: '#3a3f47', color2: '#c4281c', shoes: '#222222' }, desc: '' },
  { id: 1812625, type: 'Pants', name: 'Grey Wizard Robes', robux: 25, created: '2008-04-24', creatorName: 'SonOfSevenless', spec: { style: 'robe', color: '#8a8a8a', color2: '#6a6a6a' }, desc: "The robes don't make the wizard. But they do make you look totally sweet." },
  { id: 1882758, type: 'Pants', name: 'Red Wizard Robes', robux: 25, created: '2008-04-30', creatorName: 'SonOfSevenless', spec: { style: 'robe', color: '#a8261c', color2: '#7a1a12' }, desc: 'Perfect for the fire mage.' },
  { id: 1804726, type: 'Shirt', name: 'Camo-Shirt', tix: 40, unverifiedPrice: true, created: '2008-04-24', spec: { style: 'camo', color: '#4b5a33' }, desc: '' },
  { id: 1804865, type: 'Shirt', name: 'Stanford Sweatshirt', tix: 60, unverifiedPrice: true, created: '2008-04-24', spec: { style: 'long', color: '#8c1515', color2: '#ffffff', text: 'STANFORD' }, desc: '' },
  { id: 1804746, type: 'Shirt', name: 'White Shirt', tix: 10, unverifiedPrice: true, created: '2008-04-24', spec: { style: 'tee', color: '#f2f2f2' }, desc: '' },
  { id: 1804738, type: 'Pants', name: 'Jeans', tix: 10, unverifiedPrice: true, created: '2008-04-24', spec: { style: 'jeans', color: '#3b5b8f', shoes: '#2a2a2a' }, desc: '' },
];

// Fictional member-made clothing (community filler).
const USER_CLOTHING = [
  { type: 'Shirt', name: 'Black Tux', robux: 5, by: 'xXDarkNinjaXx', spec: { style: 'suit', color: '#151515', color3: '#111111' } },
  { type: 'Pants', name: 'Black Tux Pants', robux: 5, by: 'xXDarkNinjaXx', spec: { style: 'plain', color: '#151515', crease: true, shoes: '#000000' } },
  { type: 'Shirt', name: 'red hoodie', tix: 15, by: 'skaterdude12', spec: { style: 'hoodie', color: '#b8261c', color2: '#eeeeee' } },
  { type: 'Shirt', name: 'Blue Plaid Shirt', tix: 12, by: 'cowboyjim99', spec: { style: 'plaid', color: '#244a8f', color2: '#9fc3ff' } },
  { type: 'Pants', name: 'Army Pants', tix: 10, by: 'Sgt1ronWolf', spec: { style: 'camo', color: '#4b5a33', shoes: '#222222' } },
  { type: 'Shirt', name: 'Striped Sweater', tix: 8, by: 'kittylover22', spec: { style: 'stripes', color: '#e8bac8', color2: '#ffffff' } },
  { type: 'Pants', name: 'Khaki Shorts', tix: 6, by: 'skaterdude12', spec: { style: 'shorts', color: '#c8b48a', shoes: '#5a3a1a' } },
  { type: 'Shirt', name: 'Ninja Suit', robux: 10, by: 'xXDarkNinjaXx', spec: { style: 'long', color: '#1b1b1b' } },
  { type: 'Pants', name: 'Ninja Pants', robux: 10, by: 'xXDarkNinjaXx', spec: { style: 'plain', color: '#1b1b1b', shoes: '#000000' } },
  { type: 'Shirt', name: 'Green Jacket', tix: 20, by: 'MrBrickHead', spec: { style: 'jacket', color: '#2f6b2f', color2: '#f2f2f2' } },
  { type: 'Pants', name: 'Blue Jeans w/ Sneakers', tix: 9, by: 'coolkid2468', spec: { style: 'jeans', color: '#2f4f86', shoes: '#f2f2f2' } },
  { type: 'Shirt', name: 'ROBLOX Jersey #1', tix: 18, by: 'bloxxer4life', spec: { style: 'vest', color: '#0d69ac', color2: '#ffffff', text: '1' } },
  { type: 'TShirt', name: 'I <3 ROBLOX', tix: 1, by: 'kittylover22', spec: { style: 'text', text: 'I <3\nROBLOX', color: '#c4281c', size: 0.24 } },
  { type: 'TShirt', name: 'smiley face', tix: 2, by: 'coolkid2468', spec: { style: 'smiley' } },
  { type: 'TShirt', name: 'flames!!!', tix: 3, by: 'flamer88', spec: { style: 'flame' } },
  { type: 'TShirt', name: 'pwned', tix: 1, by: 'noobslayer99', spec: { style: 'text', text: 'PWNED', color: '#111111', size: 0.26 } },
];

// --- People -----------------------------------------------------------------
// Staff and real 2008 game creators keep their real names but get no invented
// statements; fictional members fill in friends, the forum and game servers.
const STAFF = [
  { id: 1, name: 'ROBLOX', admin: true, created: '2006-02-27', colors: { head: 24, torso: 23, leftArm: 24, rightArm: 24, leftLeg: 119, rightLeg: 119 }, hat: null },
  { id: 156, name: 'builderman', admin: true, created: '2006-02-27', colors: { head: 24, torso: 106, leftArm: 24, rightArm: 24, leftLeg: 26, rightLeg: 26 }, hat: 1080951, tshirtDesign: 'wrench' },
  { id: 261, name: 'Telamon', admin: true, created: '2006-03-08', colors: { head: 24, torso: 26, leftArm: 24, rightArm: 24, leftLeg: 26, rightLeg: 26 }, hat: 1028715 },
  { id: 3, name: 'clockwork', created: '2006-03-01', colors: { head: 24, torso: 194, leftArm: 24, rightArm: 24, leftLeg: 199, rightLeg: 199 }, hat: 1045408 },
  { id: 40, name: 'miked', created: '2006-05-15', colors: { head: 24, torso: 21, leftArm: 24, rightArm: 24, leftLeg: 23, rightLeg: 23 }, hat: 1028606 },
  { id: 4321, name: 'SonOfSevenless', admin: true, created: '2007-02-01', colors: { head: 24, torso: 194, leftArm: 24, rightArm: 24, leftLeg: 194, rightLeg: 194 }, hat: 1049198 },
];

// Fictional members (alphanumeric names, 3-20 chars, as the 2008 sign-up required).
const MEMBERS = [
  'xXDarkNinjaXx', 'coolkid2468', 'bloxxer4life', 'noobslayer99', 'pizzaguy11', 'MrBrickHead', 'awesomeman123', 'ninjaboy2000',
  'rocketman77', 'legoguy44', 'skaterdude12', 'jonny1997', 'kittylover22', 'Shadowkid', 'dogman55', 'superstar2008',
  'Toaster9', 'BuilderBob12', 'flamer88', 'zaxtor', 'minipete', 'redbrick32', 'cooldude5', 'BloxyBoy',
  'Sgt1ronWolf', 'cowboyjim99', 'princesspeach7', 'TheEpicGamer', 'speedy1234', 'Robloxian555',
];

// Real 2008 Games page listings: [title, creator, updatedAgoDays, favorited, played, online, theme]
const LISTED_GAMES = [
  // From the 2008 Games page screenshot supplied with the brief
  ['Zombie Ocean: Resuce mission ~Aquas~ *RESTRICTED*', 'FoxMcBanjo', 0.3, 338, 5458, 143, 'ocean'],
  ['¤The Virus Is spreading™¤ TVIS II Sneak peak', 'Redyz', 0.04, 187, 2812, 141, 'virus'],
  ['Build to Survive ≈ Tsunami™', 'SnowtheFerret', 0.08, 211, 4676, 122, 'tsunami'],
  ['FEAR Mission: The Ones Who Dared [Updated!]', 'Zuka', 4, 70, 1085, 114, 'mansion'],
  ['= Ride A Sinking Ship !FIXED! Read Desc = UPDATED', 'Wargod99', 0.034, 77, 1800, 110, 'ship'],
  ['RPG Labs', 'buttlad', 0.17, 199, 2964, 96, 'rpg'],
  ['battlefield 2', 'spike50100', 0.17, 293, 2986, 96, 'military'],
  ['be a family', 'Orbitor', 0.04, 90, 2612, 94, 'house'],
  // From the Sept 2008 Games page (Wayback copy)
  ['JAIL OBSTACLE COURSE "MAGA UPDATE!!!!!!!!!!!!!!!!"', 'johnbrazendale5', 1, 103, 1648, 299, 'jail'],
  ['You are trapped on a ship with sharks all around!', 'ninjasasuke21', 0.022, 584, 6566, 276, 'ship'],
  ['KICK NOOBS INTO SPARTA PIT OF DOOM!!!', 'Bosound64', 0.04, 354, 4783, 215, 'pit'],
  ['Ω • The LASER Obby Course TWO! • Ω', 'Thales', 0.024, 36, 593, 203, 'laser'],
  ['Area 51 Rebirth New Weps Be Alien 96% Read Discpt', 'Joshosh', 0.46, 912, 13406, 193, 'base'],
  ['DDA 10,000 Ft. Ramp to VIP (#2)', 'MANTY', 30, 227, 3309, 160, 'ramp'],
  ['stay in a hotel or get married (School comin soon)', 'legoman27', 0.02, 125, 1480, 155, 'hotel'],
  ['Clone wars use the force', 'AroOmega', 0.04, 202, 1873, 154, 'space'],
  ['Gladiator Arena Minigames[9] v1.9', 'Stealth Pilot', 1, 288, 5759, 152, 'arena'],
  ['Build your armor and weapons **Update**', 'stealth100', 3, 294, 5740, 119, 'armor'],
  ['Destroy the Wall to be a VIP', 'AgentBloxxer', 7, 219, 3830, 100, 'wall'],
  ['U.S Soldiers vs Clone Troopers: Who will win?', 'chargers21', 0.04, 1318, 13696, 98, 'military'],
  ['War! CTF  *Team Chat!*', 'scripttester123', 0.25, 167, 3175, 98, 'ctf'],
  ['lava obstical corse    (code door) (read des)', 'march900', 5, 85, 1377, 89, 'lava'],
];

function seed() {
  NOW = clock.now();
  const state = {
    seedVersion: SEED_VERSION,
    users: {}, places: {}, items: {}, messages: {}, friendRequests: {},
    sessions: {}, forum: { groups: [], forums: {}, threads: {}, posts: {} },
    comments: {}, ids: { user: 5000000, item: 4000000, place: 4500000, message: 1000, forumPost: 9000000, request: 500 },
    nextId: 0,
  };

  const mkUser = (o) => {
    const u = {
      id: o.id, name: o.name, password: o.password ? hashPassword(o.password) : null,
      created: o.created ? Date.parse(o.created) : ago(100 + Math.random() * 500),
      blurb: o.blurb || '', robux: o.robux ?? 0, tix: o.tix ?? 10, bc: !!o.bc, admin: !!o.admin,
      under13: !!o.under13, superSafe: false, email: '',
      avatar: { colors: o.colors || defaultColors(), hat: o.hat || null, shirt: o.shirt || null, pants: o.pants || null, tshirt: o.tshirt || null },
      inventory: [], favorites: { items: [], places: [] }, friends: [], knockouts: o.ko || 0, wipeouts: o.wo || 0,
      profileViews: Math.floor(Math.random() * 400), forumPosts: 0, badges: o.badges || [], invited: 0,
      lastOnline: o.lastOnline ?? ago(Math.random() * 20), isSeed: true, isBot: !!o.isBot, placeId: null,
      earnings: [], lastAllowance: NOW,
    };
    state.users[u.id] = u;
    return u;
  };

  // staff
  for (const s of STAFF) {
    const u = mkUser({ ...s, robux: 0, tix: 0, bc: true, lastOnline: ago(1 + Math.random() * 5) });
    u.badges = s.admin ? ['Administrator', 'BuildersClub'] : ['BuildersClub'];
  }

  // fictional members
  let mid = 300000;
  const members = MEMBERS.map((name, i) => {
    mid += 11000 + Math.floor(Math.random() * 90000);
    const colors = i % 5 === 0 ? { ...NOOB } : defaultColors(i / MEMBERS.length);
    return mkUser({
      id: mid, name, colors, isBot: true, tix: Math.floor(Math.random() * 900), robux: i % 4 === 0 ? 40 + i * 7 : 0,
      bc: i % 4 === 0, ko: Math.floor(Math.random() * 300), wo: Math.floor(Math.random() * 280),
      lastOnline: i % 3 === 0 ? NOW - 60000 : ago(Math.random() * 6),
      blurb: ['hi im ' + name + '! add me as a friend', 'i like roblox and building stuff. my place is cool, visit it!!', 'dont ask me for tix', 'BC member since 2007', 'im the best swordfighter in roblox lol', '', 'roblox is awesome :)', 'i make obbys'][i % 8],
    });
  });

  // demo account so the site can be explored straight away
  const demo = mkUser({ id: 1600000, name: 'Robloxian2008', password: 'roblox', colors: { ...NOOB }, tix: 150, robux: 0, blurb: '', lastOnline: ago(1) });
  demo.isSeed = true; demo.isBot = false; demo.isDemo = true;

  // creators of listed games (real usernames, minimal profiles)
  const creatorIds = {};
  let cid = 20000;
  const creatorFor = (name) => {
    const existing = Object.values(state.users).find((u) => u.name === name);
    if (existing) return existing;
    cid += 7919;
    const u = mkUser({ id: cid, name, colors: defaultColors((cid % 97) / 97), lastOnline: ago(1 + (cid % 13)) });
    creatorIds[name] = u.id;
    return u;
  };

  // --- catalog items
  const addItem = (o) => {
    const it = {
      id: o.id || ++state.ids.item, type: o.type, name: o.name, desc: o.desc || '',
      creatorId: o.creatorId || 1, robux: o.robux ?? null, tix: o.tix ?? null,
      created: o.created ? Date.parse(o.created) : ago(30 + Math.random() * 200),
      updated: o.updated ?? null, sales: o.sales ?? Math.floor(Math.random() * 4000), favorited: o.favorited ?? Math.floor(Math.random() * 600),
      forSale: !o.offsale && !o.bcOnly, bcOnly: !!o.bcOnly, publicDomain: !!o.publicDomain,
      model: o.model || null, spec: o.spec || null, unverifiedPrice: !!o.unverifiedPrice,
    };
    if (!it.updated) it.updated = it.created + Math.random() * (NOW - it.created) * 0.5;
    state.items[it.id] = it;
    return it;
  };
  for (const hItem of ROBLOX_HATS) {
    const creator = hItem.creatorName ? Object.values(state.users).find((u) => u.name === hItem.creatorName) : null;
    addItem({ ...hItem, type: 'Hat', creatorId: creator ? creator.id : 1, sales: Math.floor(500 + Math.random() * 20000) });
  }
  let tsId = 1027100;
  for (const [name, tix, design] of ROBLOX_TSHIRTS) {
    tsId += 37;
    addItem({ id: tsId, type: 'TShirt', name, tix, created: '2007-05-30', spec: { style: 'design', design }, desc: '' });
  }
  for (const t of ROBLOX_TSHIRTS_ROBUX) addItem({ ...t, type: 'TShirt', created: '2007-05-30', spec: { style: 'design', design: t.design } });
  for (const c of ROBLOX_CLOTHING) {
    const creator = c.creatorName ? Object.values(state.users).find((u) => u.name === c.creatorName) : null;
    addItem({ ...c, creatorId: creator ? creator.id : 1 });
  }
  for (const c of USER_CLOTHING) {
    const creator = Object.values(state.users).find((u) => u.name === c.by);
    addItem({ ...c, creatorId: creator.id, created: new Date(ago(3 + Math.random() * 100)).toISOString().slice(0, 10), sales: Math.floor(Math.random() * 300), favorited: Math.floor(Math.random() * 60) });
  }
  // a few free models (Public Domain)
  for (const [name, model, by] of [['Classic Sword', 'Sword', 'ROBLOX'], ['Rocket Launcher', 'RocketLauncher', 'ROBLOX'], ['Brick House', 'House', 'BuilderBob12'], ['Car', 'Car', 'speedy1234'], ['Tree', 'Tree', 'MrBrickHead'], ['Spawn Tower', 'Tower', 'legoguy44']]) {
    const creator = Object.values(state.users).find((u) => u.name === by);
    addItem({ type: 'Model', name, model, creatorId: creator.id, publicDomain: true, desc: 'Free model. Insert it into your place!' });
  }

  // give members some stuff + outfits
  const hats = Object.values(state.items).filter((i) => i.type === 'Hat' && (i.forSale || i.bcOnly));
  const shirts = Object.values(state.items).filter((i) => i.type === 'Shirt');
  const pants = Object.values(state.items).filter((i) => i.type === 'Pants');
  const tees = Object.values(state.items).filter((i) => i.type === 'TShirt');
  members.forEach((u, i) => {
    const pick = (arr, k) => arr[(i * 7 + k * 13) % arr.length];
    const hat = i % 6 === 5 ? null : pick(hats, 1);
    u.inventory.push(...new Set([hat?.id, pick(hats, 2).id, pick(shirts, 3).id, pick(pants, 4).id, pick(tees, 5).id].filter(Boolean)));
    u.avatar.hat = hat ? hat.id : null;
    if (i % 3 !== 0) { u.avatar.shirt = pick(shirts, 3).id; u.avatar.pants = pick(pants, 4).id; }
    else if (i % 2 === 0) u.avatar.tshirt = pick(tees, 5).id;
    if (u.bc) u.inventory.push(1080951);
    if (u.knockouts >= 10) u.badges.push('CombatInitiation');
    if (u.knockouts >= 100) u.badges.push('Warrior');
    if (u.knockouts >= 250 && u.wipeouts < u.knockouts) u.badges.push('Bloxxer');
    if (u.bc) u.badges.push('BuildersClub');
  });
  for (const s of STAFF) {
    const u = state.users[s.id];
    if (s.hat) { u.avatar.hat = s.hat; u.inventory.push(s.hat); }
  }

  // friendships among members (+ demo has a few)
  const befriend = (a, b) => { if (a === b || a.friends.includes(b.id)) return; a.friends.push(b.id); b.friends.push(a.id); };
  members.forEach((u, i) => { for (let k = 1; k <= 4; k++) befriend(u, members[(i + k * 3) % members.length]); });
  for (const u of members) if (u.friends.length >= 20) u.badges.push('Friendship');
  befriend(demo, members[0]); befriend(demo, members[1]); befriend(demo, members[6]);
  demo.inventory.push(1028606, 1098284);
  demo.avatar.hat = 1028606;

  // --- places
  const addPlace = (o) => {
    const p = {
      id: o.id || ++state.ids.place, name: o.name, creatorId: o.creatorId, desc: o.desc || '',
      created: o.created ? Date.parse(o.created) : ago(60 + Math.random() * 200),
      updated: o.updated ? (typeof o.updated === 'number' ? o.updated : Date.parse(o.updated)) : ago(Math.random() * 30),
      visits: o.visits || 0, favorited: o.favorited || 0, online: o.online || 0, playedRecent: o.played || 0,
      script: o.script || null, theme: o.theme || null, public: true, copylocked: true, featured: !!o.featured,
      maxPlayers: o.maxPlayers || 8,
    };
    state.places[p.id] = p;
    state.comments['place:' + p.id] = [];
    return p;
  };
  const clockwork = Object.values(state.users).find((u) => u.name === 'clockwork');
  const miked = Object.values(state.users).find((u) => u.name === 'miked');
  const legobuild = creatorFor('legobuild');
  addPlace({
    id: 44814, name: 'Dodge The Teapots of Doom!', creatorId: clockwork.id, created: '2007-12-15', updated: '2008-08-28', script: 'teapots',
    desc: 'Dodge the teapots. They will kill you on touch. Also, do not stand where there is no visible ground. That will also kill you. When you get to the end, the difficulty increases and you get sent to the yellow platform so that you can watch everyone else get pwned.',
    visits: 412873, favorited: 3920, online: 112, played: 3411, featured: true, maxPlayers: 12,
  });
  addPlace({
    id: 47828, name: '✪Ultimate Paintball CTF', creatorId: miked.id, created: '2007-05-02', updated: ago(60), script: 'paintball',
    desc: 'Capture the enemy flag and bring it back to your castle! Say "join reds" or "join blues" to switch teams. Press Q to change your gun mode and R to throw a paint grenade. Stand on the white square in the middle for points.',
    visits: 524190, favorited: 191, online: 105, played: 3703, featured: true, maxPlayers: 12,
  });
  addPlace({
    id: 2240711, name: 'The New Robloxian Obstical Course(Grand Opening)', creatorId: legobuild.id, updated: ago(0.17), script: 'obby',
    desc: 'welcome to my obby!! dont touch the red bricks they are lava. there are checkpoints so dont worry. if you beat it you get a sword! plz favorite', visits: 18233, favorited: 70, online: 226, played: 1344, maxPlayers: 10,
  });
  const pharaoh = creatorFor('PharaohKing77');
  addPlace({
    id: 2611430, name: 'The Mummy', creatorId: pharaoh.id, updated: ago(2), script: 'mummy',
    desc: 'One player is the MUMMY. If the mummy touches you, you become a mummy too! Explorers: survive until the timer runs out. Mummies: get everyone! Explore the pyramid... if you dare.', visits: 21877, favorited: 164, online: 88, played: 1620, maxPlayers: 10,
  });
  addPlace({
    id: 1818, name: 'Crossroads', creatorId: 1, created: '2007-04-30', updated: ago(120), script: 'crossroads',
    desc: 'The classic ROBLOX brick battle map. Four areas connected by bridges: grab the tools and bloxx your friends!', visits: 1203342, favorited: 5212, online: 61, played: 2100, featured: true, maxPlayers: 12,
  });
  for (const [title, creator, upd, fav, played, online, theme] of LISTED_GAMES) {
    const c = creatorFor(creator);
    addPlace({ name: title, creatorId: c.id, updated: ago(upd), favorited: fav, played, online, theme, visits: played * (4 + Math.floor(Math.random() * 10)), desc: '' });
  }
  // personal places for members and the demo account ("Happy Home in Robloxia" template)
  for (const u of [...members, demo, ...Object.values(state.users).filter((x) => !x.placeId && !x.isBot && x !== demo)]) {
    if (u.placeId) continue;
    const p = addPlace({ name: `${u.name}'s Place`, creatorId: u.id, script: 'personal', theme: 'happyhome', visits: u === demo ? 0 : Math.floor(Math.random() * 1500), favorited: Math.floor(Math.random() * 5), created: new Date(u.created).toISOString().slice(0, 10), desc: '' });
    u.placeId = p.id;
    if (p.visits >= 100) u.badges.push('Homestead');
    if (p.visits >= 1000) u.badges.push('Bricksmith');
  }
  for (const u of Object.values(state.users)) u.badges = [...new Set(u.badges)];

  // comments on the big places (fictional)
  const commentLines = ['this game is so fun!!!', 'i got to level 5', 'lol i died 20 times', 'best game ever 10/10', 'pls favorite this place', 'how do u beat it', 'too hard :(', 'awesome!', 'first!', 'add me', 'reds rule', 'blues are better', 'i love the teapots lol', 'cool game', 'lag is bad today'];
  for (const pid of [44814, 47828, 2240711, 2611430, 1818]) {
    const list = state.comments['place:' + pid];
    for (let k = 0; k < 12; k++) list.push({ userId: members[(k * 5 + pid) % members.length].id, text: commentLines[(k * 7 + pid) % commentLines.length], t: ago(k * 0.3 + Math.random() * 0.2) });
  }
  for (const it of Object.values(state.items)) {
    if (it.type !== 'Hat' || Math.random() < 0.5) continue;
    state.comments['item:' + it.id] = [0, 1, 2].map((k) => ({ userId: members[(k * 3 + it.id) % members.length].id, text: ['i want this hat', 'so cool', 'too expensive!!', 'i has it', 'wear it with a tux', 'LOL'][(k + it.id) % 6], t: ago(k * 2 + Math.random()) }));
  }

  // inbox for the demo account
  const msg = (from, to, subject, body, t, read = false) => {
    const id = ++state.ids.message;
    state.messages[id] = { id, fromId: from.id, toId: to.id, subject, body, t, read };
  };
  msg(state.users[1], demo, 'Welcome to ROBLOX!', 'Welcome to ROBLOX! Visit the Games page to find places to play, and use the Catalog to customize your character.\n\nHave fun!\n\nThe ROBLOX Team', ago(3), true);
  msg(members[0], demo, 'hi', 'hi want to play teapots with me?', ago(0.2));
  msg(members[6], demo, 'RE: add me', 'ok i added u. come to ultimate paintball, im on reds', ago(1), true);

  // --- forum (ASP.NET Forums layout; groups/forums as of 2008, threads fictional)
  const F = state.forum;
  const groups = [
    ['ROBLOX', [[13, 'General Discussion', 'This is the place for conversation about all things ROBLOX'], [14, 'Creations Gallery', 'Discuss your ROBLOX creations and share the secrets of your success'], [21, 'Suggestions, Feedback, and Ideas', 'Do you have a suggestion for how to make ROBLOX better? Let us know!'], [5, 'Off Topic', 'Feel like talking about stuff other than ROBLOX? Do it here.']]],
    ['Help Center', [[10, 'Building Help', 'Learn the ins and outs of building structures and machines in ROBLOX.'], [11, 'Scripting Help', 'Need help with a script you are writing? For advanced ROBLOX users.'], [9, 'Technical Problems and Bug Reports', 'Are you having trouble installing or upgrading ROBLOX? Found a bug?']]],
    ['Fun', [[18, 'Role-Playing', 'Does your Robloxian want to fly to the moon? Play out your stories here.'], [38, 'ROBLOXiwood', 'The forum for movie-makers!'], [19, 'Rate My Robloxian', 'Show the world of ROBLOX your character and see what they think.']]],
    ['Entertainment', [[26, 'Sports', 'Show off your ROBLOX athlete and talk about sports.'], [27, 'Music', 'Does your Robloxian rock? Talk about music.'], [28, 'Movies/TV/Books', 'Does your Robloxian belong on the silver screen?']]],
  ];
  for (const [gname, forums] of groups) {
    F.groups.push({ name: gname, forums: forums.map((f) => f[0]) });
    for (const [fid, name, desc] of forums) F.forums[fid] = { id: fid, name, desc, group: gname };
  }
  const threadsSeed = [
    [13, 'Dodge the Teapots is the best game ever', ['i agree its so fun', 'no ultimate paintball is better', 'teapots of doom!!!']],
    [13, 'Who wants to be my friend?', ['me!', 'sure send me a request', 'ok']],
    [13, 'Shirts and Pants are AWESOME', ['finally i can make a tux', 'i made jeans already', 'how do u make them? do u need BC?', 'yes you need builders club to make shirts and pants']],
    [13, 'How do you get tix?', ['you get 10 tix every day you log in', 'and when people visit your place', 'oh thanks']],
    [21, 'We need more hats', ['yes!!', 'add a hat that is a pizza', 'Valkyrie Helm is too expensive']],
    [14, 'Check out my castle', ['nice!', 'how did you make the towers?', 'i used cylinders']],
    [10, 'How do I make a door that opens?', ['make a brick and set CanCollide to false', 'use a script with Touched']],
    [11, 'Kill brick script help', ['function onTouched(part)\n  local h = part.Parent:findFirstChild("Humanoid")\n  if h~=nil then h.Health = 0 end\nend\nscript.Parent.Touched:connect(onTouched)', 'thanks it works!']],
    [9, 'Game wont load', ['try reinstalling', 'did you update your graphics drivers?']],
    [5, 'what is your favorite food', ['pizza', 'tacos', 'cake (the cake is a lie)']],
    [19, 'Rate my new outfit 1-10', ['8/10 nice hat', '10/10', '6/10 needs pants']],
    [18, 'RP: The space station (join)', ['*floats in*', '*fixes the oxygen pipes*']],
    [38, 'My new movie: The Bloxxer Returns', ['cant wait!', 'whats it about?']],
    [26, 'ROBLOX basketball league', ['sign me up', 'whats the court called?']],
    [27, 'Favorite song?', ['eye of the tiger lol', 'still alive from portal']],
    [28, 'Best movie of 2008?', ['the dark knight', 'wall-e', 'iron man!']],
  ];
  let tCount = 0;
  for (const [fid, subject, replies] of threadsSeed) {
    const tid = ++state.ids.forumPost;
    const author = members[(tCount * 3) % members.length];
    const t0 = ago(1 + tCount * 0.7);
    const posts = [{ id: tid, userId: author.id, body: subject.endsWith('?') ? subject : subject + (tCount % 2 ? '!!' : ''), t: t0 }];
    replies.forEach((r, k) => {
      const pid = ++state.ids.forumPost;
      posts.push({ id: pid, userId: members[(tCount * 3 + k + 1) % members.length].id, body: r, t: t0 + (k + 1) * 3600000 * (1 + Math.random()) });
    });
    F.threads[tid] = { id: tid, forumId: fid, subject, posts: posts.map((p) => p.id), views: 20 + Math.floor(Math.random() * 400), t: t0 };
    for (const p of posts) { F.posts[p.id] = { ...p, threadId: tid }; state.users[p.userId].forumPosts++; }
    tCount++;
  }
  state.nextId = 1;
  return state;
}

module.exports = { seed, SEED_VERSION, defaultColors, PALETTE32 };
