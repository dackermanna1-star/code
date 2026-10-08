// Single-file edition: a 2008-style game menu and avatar maker, plus the real
// game client. The website's server calls are answered locally; your avatar
// and your place are kept in this browser (localStorage).
// Build with: node tools/build-standalone.js  ->  dist/ROBLOX2008.html
import * as THREE from 'three';
import { CharacterModel } from '../public/js/engine/CharacterModel.js';
import { BRICKCOLORS } from '../public/js/engine/BrickColor.js';
import { renderPlaceThumbnail } from '../public/js/places/index.js';
import { MENU_CSS, CLIENT_CSS, LOGO } from './generated/assets.js';

const PALETTE = [1, 208, 194, 199, 26, 21, 24, 226, 23, 107, 102, 11, 45, 135, 106, 105, 141, 28, 37, 119, 29, 151, 38, 192, 104, 9, 101, 5, 153, 217, 18, 125];
const MEMBERS = ['xXDarkNinjaXx', 'coolkid2468', 'bloxxer4life', 'noobslayer99', 'pizzaguy11', 'MrBrickHead', 'awesomeman123', 'ninjaboy2000', 'rocketman77', 'legoguy44', 'skaterdude12', 'jonny1997', 'kittylover22', 'Shadowkid', 'dogman55', 'superstar2008', 'Toaster9', 'BuilderBob12', 'flamer88', 'zaxtor', 'minipete', 'redbrick32', 'cooldude5', 'BloxyBoy', 'Sgt1ronWolf', 'cowboyjim99', 'princesspeach7', 'TheEpicGamer', 'speedy1234', 'Robloxian555'];

const HATS = [
  ['RedBaseballCap', 'Red Baseball Cap'], ['BlueBaseballCap', 'Blue Baseball Cap'], ['PurpleBandedTopHat', 'Purple Banded Top Hat'], ['VikingHelm', 'Classic ROBLOX Viking Helm'],
  ['PoliceCap', 'ROBLOX Classic Police Cap'], ['PirateCaptainsHat', "Pirate Captain's Hat"], ['Fedora', 'The Classic ROBLOX Fedora'], ['BrownCowboyHat', 'Brown Cowboy Hat'],
  ['StrawHat', 'Straw Hat'], ['TeapotHat', 'Teapot Hat'], ['Bighead', 'Bighead'], ['WizardHat', "ROBLOX Classic: Wizard's Hat"], ['Bucket', 'Bucket'], ['TrafficCone', 'Traffic Cone'],
  ['Headstack', 'Headstack'], ['FirefighterHelmet', 'Firefighter Helmet'], ['AstronautHelmet', 'Astronaut Helmet'], ['BunnyEars', 'Bunny Ears'], ['MushroomHat', 'Mushroom Hat'],
  ['Sapling', 'Sapling'], ['Lampshade', 'Lampshade'], ['MouseEars', 'Mouse Ears'], ['Ribbons', 'Ribbons'], ['LittleFluffyCloud', 'Little Fluffy Cloud'], ['SatelliteDish', 'Satellite Dish'],
  ['SantaHat', 'Santa Hat'], ['StageProp', 'Stage Prop'], ['FloppyFish', 'Floppy Fish'], ['Screw', 'Screw'], ['BiologyTextbook', 'Biology Textbook'], ['ChemistryTextbook', 'Chemistry Textbook'],
  ['GameInputDevice', 'Game Input Device'], ['Headrow', 'Headrow'], ['Hammerhead', 'Hammerhead'], ['TBoneVisor', 'T-Bone Visor'], ['PumpkinHead', 'Classic ROBLOX Pumpkin Head'],
  ['WitchHat', 'Witch Hat'], ['ElfHat', 'Elf Hat'], ['BCHardHat', 'Builders Club Hard Hat'], ['NinjaMask', 'Ninja Mask of Shadows'], ['BlueWinterCap', 'Blue Winter Cap'],
  ['ValkyrieHelm', 'Valkyrie Helm'], ['ChefHat', 'Chef Hat'], ['KittyEars', 'Kitty Ears'], ['RobloxVisor', '2008 ROBLOX Visor'], ['FootballHelmet', 'Football Helmet'],
];
const TSHIRTS = [['brew', 'Do the Brew!'], ['bloxxer', 'Bloxxer'], ['viking', 'Viking Torso'], ['vest', 'Vest'], ['assert', 'ASSERT(hax0r);'], ['friends', 'Friends'], ['catsuit', 'Cat Suit'], ['robot', 'Robot'], ['inmate', 'Inmate'], ['ballerina', 'Ballerina'], ['erik', 'Erik Is My Hero'], ['camo', 'Camo'], ['predator', 'Free Predator'], ['cowboyvest', 'Cowboy Vest'], ['dusek', 'Matt Dusek Rox'], ['raven', 'Raven'], ['iheartbm', 'I Heart BM'], ['hawaiian', 'Hawaiian'], ['robuk', '1 ROBUK Shirt'], ['police', 'Police Uniform']];
const SHIRTS = {
  battle: ['Battle Shirt of Awesomeness', { style: 'battle', color: '#3a3f47', color2: '#c4281c', color3: '#d8b040' }],
  camo: ['Camo-Shirt', { style: 'camo', color: '#4b5a33' }],
  stanford: ['Stanford Sweatshirt', { style: 'long', color: '#8c1515', color2: '#ffffff', text: 'STANFORD' }],
  white: ['White Shirt', { style: 'tee', color: '#f2f2f2' }],
  tux: ['Black Tux', { style: 'suit', color: '#151515', color3: '#111111' }],
  hoodie: ['red hoodie', { style: 'hoodie', color: '#b8261c', color2: '#eeeeee' }],
  plaid: ['Blue Plaid Shirt', { style: 'plaid', color: '#244a8f', color2: '#9fc3ff' }],
};
const PANTS = {
  battle: ['Battle Pants of Awesomeness', { style: 'battle', color: '#3a3f47', color2: '#c4281c', shoes: '#222222' }],
  greyrobes: ['Grey Wizard Robes', { style: 'robe', color: '#8a8a8a', color2: '#6a6a6a' }],
  redrobes: ['Red Wizard Robes', { style: 'robe', color: '#a8261c', color2: '#7a1a12' }],
  jeans: ['Jeans', { style: 'jeans', color: '#3b5b8f', shoes: '#2a2a2a' }],
  tuxpants: ['Black Tux Pants', { style: 'plain', color: '#151515', crease: true, shoes: '#000000' }],
  shorts: ['Khaki Shorts', { style: 'shorts', color: '#c8b48a', shoes: '#5a3a1a' }],
};

const PLACES = [
  { id: 44814, name: 'Dodge The Teapots of Doom!', creator: 'clockwork', script: 'teapots', bots: 6, desc: 'Dodge the teapots. They will kill you on touch. Also, do not stand where there is no visible ground. That will also kill you. When you get to the end, the difficulty increases and you get sent to the yellow platform so that you can watch everyone else get pwned.' },
  { id: 47828, name: '✪Ultimate Paintball CTF', creator: 'miked', script: 'paintball', bots: 9, desc: 'Capture the enemy flag and bring it back to your castle! Say "join reds" or "join blues" to switch teams. Press Q to change your gun mode and R to throw a paint grenade. Stand on the white square in the middle for points.' },
  { id: 2240711, name: 'The New Robloxian Obstical Course(Grand Opening)', creator: 'legobuild', script: 'obby', bots: 5, desc: 'welcome to my obby!! dont touch the red bricks they are lava. there are checkpoints so dont worry. if you beat it you get a sword! plz favorite' },
  { id: 2611430, name: 'The Mummy', creator: 'PharaohKing77', script: 'mummy', bots: 7, desc: 'One player is the MUMMY. If the mummy touches you, you become a mummy too! Explorers: survive until the timer runs out. Mummies: get everyone!' },
  { id: 1818, name: 'Crossroads', creator: 'ROBLOX', script: 'crossroads', bots: 7, desc: 'The classic ROBLOX brick battle map. Four areas connected by bridges: grab the tools and bloxx your friends!' },
  { id: 3104570, name: 'Desert Strike [BETA]', creator: 'Robloxian2008', script: 'warzone', bots: 11, desc: 'Coalition vs Militia in a desert town! Start with a pistol, earn cash for every kill and buy better guns and attachments (press B). Click the game to use the mouse, click to shoot, E to aim down the sights, R to reload, Shift to sprint. First team to 50 kills wins!' },
  { id: 3104571, name: 'Bank Heist [BETA]', creator: 'Robloxian2008', script: 'heist', bots: 0, desc: 'Rob the First Robloxia Bank! Pick your crew, mask up (G), keep the hostages down, hack the vault gate, drill the vault and grab the cash and gold - then fight your way out to the getaway van and lose the cops. Click to shoot, E to aim, F to shout, R to reload, hold E to interact.' },
  { id: 3104572, name: 'Natural Disaster Survival', creator: 'Robloxian2008', script: 'disasters', bots: 9, desc: 'Survive natural disasters on five maps! Tornadoes, tsunamis, floods, earthquakes, meteor showers, volcanic eruptions, thunderstorms, fires, acid rain and blizzards. Get up high, get inside or get out of the way - survivors get a point.' },
  { id: 3104573, name: 'MEGA OBBY (32 Stages!)', creator: 'Robloxian2008', script: 'megaobby', bots: 8, desc: 'Climb 32 stages through five zones - Sky Meadows, Volcano Isles, Neon City, Frozen Peaks and the Cosmic Void! Trampolines, trusses, rising lava, fire spinners, laser gates, a glass bridge, swinging axes, an avalanche, low gravity and more. Checkpoints save your stage. Can you reach the top of the Mega Tower? (Press R to reset.)' },
  { id: 3104574, name: 'Escape the Haunted Hotel', creator: 'Robloxian2008', script: 'hotel', bots: 0, desc: "You wake up in Room 313 of the Ravenhurst Hotel at 3:33 in the morning. The power is out, the front doors are chained, and the Night Manager is walking the halls. Find a way out - and don't let him see you. Hide in wardrobes, hold your breath, watch the lights. (Single player. Best with headphones, in the dark.)" },
  { id: 3104575, name: 'The Elevator', creator: 'Robloxian2008', script: 'elevator', bots: 8, desc: 'Get in the elevator. The doors close, and up you go - stopping at 10 random floors out of 30 on the way to the top. A beach. A room where the floor is lava. A disco. The moon. A jungle temple. A minefield. A museum where the statues move when you look away. A bowling lane where YOU are the pins. Step out and look around if you dare, but get back in before the doors close! Every floor has a secret bonus. Make it to the penthouse to finish the ride. (Click the buttons by the door: one holds the doors for your friends.)' },
  { id: 3104576, name: 'The Outbreak', creator: 'Robloxian2008', script: 'outbreak', bots: 0, desc: 'South Karevia, three weeks after the outbreak. You wake on the coast with a shirt, a flashlight, one bandage and a pistol with two spare magazines. Find food and water. Find better weapons. The dead walk the towns, bandits hold the roads, and the military base in the hills is full of guns - and the dead soldiers who carried them. Melee and gunfights, looting, hunger, thirst, bleeding, broken legs, a day and night cycle and weather. When you die, you lose everything. How long can you last? (Single player. Tab: inventory, F: interact, M: map, V: third person.)' },
  { id: 1600001, name: 'My Place', creator: 'you', script: 'personal', bots: 0, desc: 'Your own place, started from "Happy Home in Robloxia". Use the Tools and Insert menus at the top of the game window to build, and save when you leave.' },
];

// --- storage ------------------------------------------------------------------
const store = {
  get(k, d) { try { const v = localStorage.getItem('rbx2008:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('rbx2008:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const DEFAULT_ME = { name: 'Robloxian2008', colors: { head: 24, torso: 23, leftArm: 24, rightArm: 24, leftLeg: 119, rightLeg: 119 }, hat: 'RedBaseballCap', tshirt: '', shirt: '', pants: '' };
function me() { return { ...DEFAULT_ME, ...store.get('me', {}) }; }
function appearance(m) {
  return {
    colors: m.colors, face: 'Smile', hats: m.hat ? [m.hat] : [],
    shirt: m.shirt && SHIRTS[m.shirt] ? SHIRTS[m.shirt][1] : null,
    pants: m.pants && PANTS[m.pants] ? PANTS[m.pants][1] : null,
    tshirt: m.tshirt ? { style: 'design', design: m.tshirt } : null,
  };
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function botAppearance() {
  const torso = pick(PALETTE);
  return {
    colors: { head: 24, torso, leftArm: 24, rightArm: 24, leftLeg: pick([102, 119, 26, 23, 28, 194]), rightLeg: 0 },
    face: 'Smile', hats: Math.random() < 0.6 ? [pick(HATS)[0]] : [],
    shirt: Math.random() < 0.3 ? pick(Object.values(SHIRTS))[1] : null,
    pants: Math.random() < 0.3 ? pick(Object.values(PANTS))[1] : null,
    tshirt: Math.random() < 0.35 ? { style: 'design', design: pick(TSHIRTS)[0] } : null,
  };
}

// --- the "server" ---------------------------------------------------------------
function installLocalServer() {
  const json = (o) => Promise.resolve(new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  const realFetch = window.fetch.bind(window);
  window.fetch = (url, opts = {}) => {
    const u = new URL(String(url), 'http://local/');
    const path = u.pathname.toLowerCase();
    if (path === '/game/join.ashx') {
      const pl = PLACES.find((p) => p.id === Number(u.searchParams.get('placeId'))) || PLACES[0];
      const m = me();
      const pool = [...MEMBERS];
      const bots = [];
      for (let i = 0; i < pl.bots; i++) {
        const name = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        const a = botAppearance(); a.colors.rightLeg = a.colors.leftLeg;
        bots.push({ id: 2000 + i, name, appearance: a });
      }
      return json({
        place: { id: pl.id, name: pl.name, script: pl.script, theme: pl.script === 'personal' ? 'happyhome' : null, creator: pl.creator, creatorId: 1, build: pl.script === 'personal' ? store.get('place', null) : null, maxPlayers: 12 },
        player: { id: 1600000, name: m.name, appearance: appearance(m), guest: false }, bots, mode: 'online', buildMode: pl.script === 'personal',
      });
    }
    if (path === '/game/models.ashx') return json({ models: ['House', 'Car', 'Tree', 'Tower'].map((m, i) => ({ id: i + 1, name: m, model: m })) });
    if (path === '/game/saveplace.ashx') {
      try { store.set('place', JSON.parse(opts.body).build); } catch { return json({ ok: false }); }
      return json({ ok: true });
    }
    if (path === '/game/visit.ashx' || path === '/game/report.ashx') return json({ ok: true, badges: [] });
    return realFetch(url, opts);
  };
  navigator.sendBeacon = () => true;
}

// --- game mode -------------------------------------------------------------------
async function startGame(placeId) {
  document.title = 'ROBLOX';
  document.head.insertAdjacentHTML('beforeend', `<style>${CLIENT_CSS}</style>`);
  document.body.className = '';
  document.body.innerHTML = '<div id="Viewport"><canvas id="GameCanvas" tabindex="0"></canvas></div><div id="Gui"></div>';
  installLocalServer();
  window.RBX_JOIN = { placeId, mode: 'online' };
  window.RBX_EXIT = () => { location.hash = ''; location.reload(); };
  await import('../public/js/client.js');
}

// --- menu ---------------------------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const colorCss = (n) => { const c = BRICKCOLORS[n]; return `rgb(${c[1]},${c[2]},${c[3]})`; };

function menu() {
  document.head.insertAdjacentHTML('beforeend', `<style>${MENU_CSS}</style>`);
  document.body.className = 'menu';
  const m = me();
  document.body.innerHTML = `
  <div id="Container">
    <div id="Header"><img src="${LOGO}" alt="ROBLOX" width="267" height="70"/><div id="Tag">Think. Create.</div></div>
    <div id="Nav"><a href="#" data-tab="games" class="on">Games</a> | <a href="#" data-tab="character">My Character</a> | <a href="#" data-tab="help">Help</a></div>
    <div id="Body">
      <div id="TabGames">
        <h2>Games</h2>
        <table id="Games">${PLACES.map((p, i) => `
          <tr><td class="thumb"><canvas width="160" height="100" data-i="${i}"></canvas></td>
          <td class="info"><div class="name">${esc(p.name)}</div><div class="by">Creator: <span>${esc(p.creator)}</span></div>
          <div class="desc">${esc(p.desc)}</div><button class="Button" data-play="${p.id}">Visit Online</button></td></tr>`).join('')}
        </table>
      </div>
      <div id="TabCharacter" style="display:none">
        <h2>My Character</h2>
        <div class="row">
          <div class="box" id="Preview"><h4>My Character</h4><canvas id="CharCanvas" width="220" height="250"></canvas></div>
          <div class="box" id="Wardrobe"><h4>My Wardrobe</h4>
            <p><label>Character Name<br/><input id="Name" maxlength="20" value="${esc(m.name)}"/></label></p>
            <p><label>Hat<br/><select id="Hat"><option value="">(none)</option>${HATS.map(([k, n]) => `<option value="${k}"${m.hat === k ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label></p>
            <p><label>T-Shirt<br/><select id="TShirt"><option value="">(none)</option>${TSHIRTS.map(([k, n]) => `<option value="${k}"${m.tshirt === k ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label></p>
            <p><label>Shirt<br/><select id="Shirt"><option value="">(none)</option>${Object.entries(SHIRTS).map(([k, [n]]) => `<option value="${k}"${m.shirt === k ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label></p>
            <p><label>Pants<br/><select id="Pants"><option value="">(none)</option>${Object.entries(PANTS).map(([k, [n]]) => `<option value="${k}"${m.pants === k ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label></p>
          </div>
          <div class="box" id="Colors"><h4>Color Chooser</h4><p>Click a body part, then a color:</p>
            <div id="Mannequin">${['head', 'rightArm', 'torso', 'leftArm', 'rightLeg', 'leftLeg'].map((p) => `<div class="bp ${p}" data-part="${p}"></div>`).join('')}</div>
            <div id="Palette">${PALETTE.map((n) => `<div class="sw" data-c="${n}" title="${esc(BRICKCOLORS[n][0])}" style="background:${colorCss(n)}"></div>`).join('')}</div>
          </div>
        </div>
      </div>
      <div id="TabHelp" style="display:none">
        <h2>Help</h2>
        <ul>
          <li><b>Walk:</b> W A S D, or the Up and Down arrow keys. <b>Jump:</b> Space.</li>
          <li><b>Turn the camera:</b> the Left and Right arrow keys, or hold the right mouse button and drag. <b>Zoom:</b> I and O, or the mouse wheel. <b>Tilt:</b> Page Up / Page Down.</li>
          <li><b>Tools:</b> press 1-9, then click to use. <b>Chat:</b> press "/" or click the chat bar; the speech bubble opens Safe Chat.</li>
          <li><b>Desert Strike:</b> click the game to use the mouse, click to shoot, <b>E</b> to aim down the sights, R to reload, Shift to sprint, 1/2 to switch guns, <b>B</b> for the buy menu.</li>
          <li><b>Natural Disaster Survival:</b> wait in the lobby, then survive the disaster on the island. Floods and tsunamis: climb up high (ladders, roofs, towers). Acid rain and blizzards: get under a roof. Tornadoes: run. Earthquakes: get out of the buildings.</li>
          <li><b>Bank Heist:</b> pick your crew on the planning board, then <b>G</b> to put on your mask, <b>F</b> to shout at the hostages, hold <b>E</b> to grab loot and use things (tap <b>E</b> to aim), R to reload, Shift to sprint, M to mute.</li>
          <li><b>Leave a game:</b> Exit, at the top of the game window.</li>
          <li>The other players are simulated. Your character and your place are saved in this browser.</li>
        </ul>
        <p class="small">Unofficial, non-commercial recreation of ROBLOX circa 2008, made for fun. ROBLOX is a trademark of Roblox Corporation; this file is not affiliated with it and contains no original ROBLOX images or sounds.</p>
      </div>
    </div>
    <div id="Footer">An unofficial recreation of ROBLOX, circa 2008. Single-file edition.</div>
  </div>`;

  // tabs
  for (const a of document.querySelectorAll('#Nav a')) a.onclick = (e) => {
    e.preventDefault();
    for (const b of document.querySelectorAll('#Nav a')) b.classList.toggle('on', b === a);
    for (const t of ['games', 'character', 'help']) document.getElementById('Tab' + t[0].toUpperCase() + t.slice(1)).style.display = a.dataset.tab === t ? '' : 'none';
    if (a.dataset.tab === 'character') drawCharacter();
  };
  for (const b of document.querySelectorAll('[data-play]')) b.onclick = () => { location.hash = 'play=' + b.dataset.play; location.reload(); };

  // character editing
  let part = 'torso';
  const save = (patch) => { store.set('me', { ...me(), ...patch }); paintMannequin(); drawCharacter(); };
  document.getElementById('Name').oninput = (e) => save({ name: e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 20) || 'Robloxian2008' });
  document.getElementById('Hat').onchange = (e) => save({ hat: e.target.value });
  document.getElementById('TShirt').onchange = (e) => save({ tshirt: e.target.value });
  document.getElementById('Shirt').onchange = (e) => save({ shirt: e.target.value });
  document.getElementById('Pants').onchange = (e) => save({ pants: e.target.value });
  for (const el of document.querySelectorAll('#Mannequin .bp')) el.onclick = () => { part = el.dataset.part; paintMannequin(); };
  for (const el of document.querySelectorAll('#Palette .sw')) el.onclick = () => save({ colors: { ...me().colors, [part]: Number(el.dataset.c) } });
  function paintMannequin() {
    const c = me().colors;
    for (const el of document.querySelectorAll('#Mannequin .bp')) { el.style.background = colorCss(c[el.dataset.part]); el.classList.toggle('sel', el.dataset.part === part); }
  }
  paintMannequin();
  renderThumbs();
}

let renderer = null;
function getRenderer() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  return renderer;
}

async function renderThumbs() {
  for (const cv of document.querySelectorAll('#Games canvas')) {
    const p = PLACES[Number(cv.dataset.i)];
    try {
      const url = await renderPlaceThumbnail(getRenderer(), { script: p.script, theme: p.script === 'personal' ? 'happyhome' : null, build: p.script === 'personal' ? store.get('place', null) : null, name: p.name }, 160, 100);
      const img = new Image();
      img.onload = () => cv.getContext('2d').drawImage(img, 0, 0);
      img.src = url;
    } catch (e) { console.warn(e); }
    await new Promise((r) => setTimeout(r, 30));
  }
}

function drawCharacter() {
  const cv = document.getElementById('CharCanvas');
  if (!cv) return;
  const r = getRenderer();
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xeef2ff, 0x8a8478, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-0.6, 1.1, -1); scene.add(sun);
  const model = new CharacterModel(appearance(me()));
  scene.add(model.root);
  const box = new THREE.Box3().setFromObject(model.root);
  const c = box.getCenter(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(30, cv.width / cv.height, 0.1, 100);
  cam.position.copy(c).add(new THREE.Vector3(-0.42, 0.28, -1).normalize().multiplyScalar(box.getSize(new THREE.Vector3()).y * 2.2));
  cam.lookAt(c);
  r.setPixelRatio(1); r.setSize(cv.width, cv.height, false); r.setClearColor(0xffffff, 1);
  r.render(scene, cam);
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.drawImage(r.domElement, 0, 0);
  model.dispose();
}

const m = /^#play=(\d+)/.exec(location.hash);
if (m) startGame(Number(m[1])).catch((e) => { console.error(e); document.body.textContent = 'An error occured. Please try again later'; });
else menu();
