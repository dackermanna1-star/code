// The heist's screens: the planning board (crew, loadout, mask), the in-game
// HUD (objectives, subtitles, minimap with health and armour, wanted stars,
// the take, timers, hold-to-interact prompts, hostage and suspicion meters),
// the BRUTEFORCE hacking minigame, and the results / failure screens.
import { GUNS } from '../warzone/guns.js';
import { MASKS, maskTexture } from './models.js';

const CSS = `
.hz{position:absolute;inset:0;pointer-events:none;font-family:Arial,Helvetica,sans-serif;color:#fff;z-index:6;}
.hz *{box-sizing:border-box;}
.rbx-gui.hz-mode .rbx-playerlist,.rbx-gui.hz-mode .rbx-health,.rbx-gui.hz-mode .rbx-backpack,.rbx-gui.hz-mode .rbx-safechat-btn,.rbx-gui.hz-mode .rbx-report,.rbx-gui.hz-mode .rbx-fp-tip,.rbx-gui.hz-mode .rbx-camctrl,.rbx-gui.hz-mode .rbx-chatbar,.rbx-gui.hz-mode .rbx-chatlog{display:none!important;}
.ds-hud.hz-hide .score,.ds-hud.hz-hide .cash,.ds-hud.hz-hide .help,.ds-hud.hz-hide .hp{display:none!important;}
.ds-hud.hz-hide .feed{top:210px;}
.hz .obj{position:absolute;left:14px;top:40px;width:330px;}
.hz .obj .t{font:bold 12px Arial;letter-spacing:2px;color:#e8c040;text-shadow:0 1px 2px #000;margin-bottom:4px;}
.hz .obj div.o{font-size:14px;padding:4px 8px;margin:2px 0;background:linear-gradient(90deg,rgba(0,0,0,.6),rgba(0,0,0,0));text-shadow:0 1px 2px #000;transition:opacity .4s;}
.hz .obj div.o.done{opacity:.45;text-decoration:line-through;}
.hz .obj div.o.opt{color:#b8d8ff;font-size:13px;}
.hz .obj div.o b{color:#ffd040;}
.hz .sub{position:absolute;left:50%;bottom:150px;transform:translateX(-50%);max-width:760px;text-align:center;font-size:19px;text-shadow:0 0 4px #000,0 2px 3px #000;line-height:1.35;}
.hz .sub b{color:#ffd040;} .hz .sub .who{font-weight:bold;}
.hz .right{position:absolute;right:18px;top:40px;text-align:right;}
.hz .stars{font-size:30px;letter-spacing:2px;color:rgba(255,255,255,.18);text-shadow:0 0 2px #000;}
.hz .stars i{font-style:normal;} .hz .stars i.on{color:#fff;} .hz .stars.flash i.on{animation:hzStar .5s infinite alternate;}
@keyframes hzStar{from{color:#fff}to{color:#5aa0ff}}
.hz .take{font:bold 26px Arial;color:#7cf27c;text-shadow:0 2px 3px #000;margin-top:2px;}
.hz .take small{display:block;font-size:11px;letter-spacing:2px;color:#ddd;}
.hz .bag{font-size:12px;color:#ddd;margin-top:2px;} .hz .bag .b{display:inline-block;width:120px;height:7px;background:rgba(0,0,0,.5);vertical-align:middle;margin-left:6px;border:1px solid rgba(255,255,255,.3);} .hz .bag .b i{display:block;height:100%;background:#d8c040;}
.hz .timer{margin-top:10px;font:bold 15px Arial;padding:5px 10px;background:rgba(0,0,0,.55);display:inline-block;border-left:4px solid #e04040;}
.hz .timer.blue{border-color:#4080ff;} .hz .timer.yel{border-color:#e8c040;}
.hz .timer .p{display:block;height:4px;background:rgba(255,255,255,.2);margin-top:4px;} .hz .timer .p i{display:block;height:100%;background:#e8c040;}
.hz .hostages{position:absolute;left:50%;top:34px;transform:translateX(-50%);font:bold 13px Arial;background:rgba(0,0,0,.55);padding:5px 12px;display:none;letter-spacing:1px;}
.hz .hostages .w{color:#ff5050;animation:hzStar .4s infinite alternate;}
.hz .mm{position:absolute;left:16px;bottom:22px;width:196px;}
.hz .mm canvas{width:196px;height:196px;border-radius:50%;border:3px solid rgba(0,0,0,.6);box-shadow:0 0 0 1px rgba(255,255,255,.25);display:block;}
.hz .mm .bars{display:flex;gap:4px;margin-top:5px;} .hz .mm .bars div{flex:1;height:8px;background:rgba(0,0,0,.6);border:1px solid rgba(0,0,0,.6);} .hz .mm .bars i{display:block;height:100%;transition:width .2s;}
.hz .mm .hp i{background:#5ab84a;} .hz .mm .ar i{background:#4a8ae8;} .hz .mm .hp.low i{background:#d83a2a;}
.hz .mm .lives{font-size:12px;margin-top:3px;color:#ddd;text-shadow:0 1px 2px #000;}
.hz .prompt{position:absolute;left:50%;top:58%;transform:translateX(-50%);text-align:center;display:none;}
.hz .prompt .k{display:inline-block;width:38px;height:38px;border-radius:50%;position:relative;vertical-align:middle;margin-right:8px;}
.hz .prompt .k svg{position:absolute;inset:0;} .hz .prompt .k span{position:absolute;inset:0;line-height:38px;font:bold 16px Arial;}
.hz .prompt .l{font-size:16px;text-shadow:0 1px 3px #000;vertical-align:middle;background:rgba(0,0,0,.45);padding:5px 10px;}
.hz .prompt .l.no{color:#ff8a7a;}
.hz .susp{position:absolute;left:50%;top:22%;transform:translateX(-50%);display:none;text-align:center;}
.hz .susp .eye{font-size:30px;} .hz .susp .bar{width:120px;height:6px;background:rgba(0,0,0,.6);margin:3px auto;} .hz .susp .bar i{display:block;height:100%;background:#ffd040;}
.hz .susp .lbl{font:bold 12px Arial;letter-spacing:2px;color:#ffd040;text-shadow:0 1px 2px #000;}
.hz .big{position:absolute;left:0;right:0;top:30%;text-align:center;font:bold 46px Impact,'Arial Black',Arial;letter-spacing:3px;text-shadow:0 3px 6px #000;display:none;}
.hz .big small{display:block;font:bold 18px Arial;letter-spacing:4px;margin-top:6px;}
.hz .popup{position:absolute;left:50%;top:44%;transform:translateX(-50%);font:bold 20px Arial;color:#7cf27c;text-shadow:0 2px 3px #000;white-space:nowrap;animation:hzUp 1.6s forwards;}
@keyframes hzUp{from{opacity:1;margin-top:0}to{opacity:0;margin-top:-50px}}
.hz .maskfx{position:absolute;inset:0;display:none;align-items:center;justify-content:center;}
.hz .maskfx img{width:40%;animation:hzMask .7s ease-in forwards;}
@keyframes hzMask{from{transform:scale(.4);opacity:0}50%{opacity:1}to{transform:scale(4.2);opacity:0}}
.hz .masked{position:absolute;inset:0;background:radial-gradient(ellipse 70% 60% at 50% 48%,rgba(0,0,0,0) 62%,rgba(0,0,0,.55) 100%);display:none;}
.hz .letter{position:absolute;inset:0;pointer-events:none;} .hz .letter:before,.hz .letter:after{content:'';position:absolute;left:0;right:0;height:0;background:#000;transition:height .6s;} .hz .letter:before{top:0;} .hz .letter:after{bottom:0;}
.hz .letter.on:before,.hz .letter.on:after{height:11%;}
.hz .fade{position:absolute;inset:0;background:#000;opacity:0;transition:opacity 1s;}
.hz.cine .obj,.hz.cine .right,.hz.cine .mm,.hz.cine .keys,.hz.cine .hostages{display:none;}
.hz .keys{position:absolute;right:16px;bottom:150px;font-size:12px;text-align:right;color:#ddd;text-shadow:0 1px 2px #000;line-height:1.6;}
.hz .keys b{display:inline-block;min-width:18px;padding:0 4px;border:1px solid rgba(255,255,255,.6);border-radius:3px;text-align:center;margin-left:6px;color:#fff;background:rgba(0,0,0,.4);}
/* planning board */
.hz-board{position:absolute;inset:0;z-index:30;pointer-events:auto;display:flex;align-items:center;justify-content:center;background:rgba(10,8,6,.55);}
.hz-board .cork{width:1080px;max-width:97vw;max-height:95vh;overflow:auto;background:#b88a58 radial-gradient(rgba(0,0,0,.08) 1px,transparent 1.5px) 0 0/7px 7px;border:14px solid #5a3a1e;box-shadow:0 10px 50px rgba(0,0,0,.7),inset 0 0 40px rgba(60,30,0,.5);padding:16px 20px;color:#222;font-family:'Courier New',monospace;position:relative;}
.hz-board h1{margin:0;font:bold 34px Impact,'Arial Black',Arial;letter-spacing:3px;color:#1c1c1c;text-shadow:1px 1px 0 rgba(255,255,255,.3);}
.hz-board h1 span{color:#a01818;}
.hz-board .subt{font:15px 'Marker Felt','Comic Sans MS',cursive;color:#2a1a0a;margin:2px 0 10px;}
.hz-board .cols{display:flex;gap:16px;align-items:flex-start;}
.hz-board .note{background:#fdfbe8;padding:10px 12px;box-shadow:2px 3px 6px rgba(0,0,0,.4);position:relative;transform:rotate(-1deg);}
.hz-board .note:before{content:'';position:absolute;left:50%;top:-6px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#ff6a6a,#a01010);box-shadow:1px 2px 2px rgba(0,0,0,.5);}
.hz-board .plan{width:250px;font-size:12px;line-height:1.5;}
.hz-board .plan h3,.hz-board h3{margin:0 0 6px;font:bold 14px Arial;letter-spacing:2px;}
.hz-board .plan ol{margin:0;padding-left:18px;}
.hz-board .photo{width:250px;height:150px;margin-top:14px;transform:rotate(1.5deg);padding:6px 6px 22px;background:#fff;box-shadow:2px 3px 6px rgba(0,0,0,.4);position:relative;}
.hz-board .photo canvas{width:100%;height:100%;background:#556;display:block;}
.hz-board .photo span{position:absolute;bottom:3px;left:0;right:0;text-align:center;font:13px 'Marker Felt','Comic Sans MS',cursive;}
.hz-board .crew{flex:1;}
.hz-board .role{margin-bottom:10px;}
.hz-board .role h3{color:#1c1c1c;background:rgba(255,255,255,.55);display:inline-block;padding:2px 8px;}
.hz-board .cards{display:flex;gap:10px;}
.hz-board .card{width:150px;background:#fff;padding:5px 5px 6px;box-shadow:2px 3px 6px rgba(0,0,0,.4);cursor:pointer;transition:transform .12s;border:3px solid transparent;font-family:Arial;}
.hz-board .card:nth-child(1){transform:rotate(-1.5deg);} .hz-board .card:nth-child(2){transform:rotate(1deg);} .hz-board .card:nth-child(3){transform:rotate(-.5deg);}
.hz-board .card:hover{transform:scale(1.04);} .hz-board .card.sel{border-color:#c01818;}
.hz-board .card canvas{width:100%;height:76px;background:#7a8a9a;display:block;}
.hz-board .card .n{font:bold 13px Arial;margin-top:3px;} .hz-board .card .d{font-size:10px;color:#555;height:26px;line-height:1.25;}
.hz-board .card .cut{font:bold 12px Arial;color:#a01818;float:right;}
.hz-board .sk{height:5px;background:#ddd;margin-top:3px;} .hz-board .sk i{display:block;height:100%;background:#2a8a2a;}
.hz-board .gear{width:290px;}
.hz-board .opt{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;}
.hz-board .opt div{background:#fdfbe8;padding:4px 7px;font:12px Arial;cursor:pointer;box-shadow:1px 2px 3px rgba(0,0,0,.35);border:2px solid transparent;}
.hz-board .opt div.sel{border-color:#c01818;background:#fff;font-weight:bold;}
.hz-board .opt div small{color:#777;}
.hz-board .masks div{padding:2px;} .hz-board .masks img{width:44px;height:36px;display:block;}
.hz-board .gunpic{width:100%;height:96px;background:linear-gradient(#5a5a50,#2a2a26);display:block;margin-bottom:6px;}
.hz-board .foot{display:flex;justify-content:space-between;align-items:center;margin-top:12px;}
.hz-board .cutinfo{font:bold 15px Arial;background:#fdfbe8;padding:8px 12px;box-shadow:2px 3px 6px rgba(0,0,0,.4);}
.hz-board .cutinfo b{color:#1a7a1a;font-size:18px;}
.hz-board .go{font:bold 22px Impact,'Arial Black',Arial;letter-spacing:3px;background:#a01818;color:#fff;border:3px solid #600;padding:10px 30px;cursor:pointer;box-shadow:2px 4px 8px rgba(0,0,0,.5);}
.hz-board .go:hover{background:#c02020;}
.hz-board .bal{font:13px Arial;color:#222;margin-top:4px;}
/* hacking */
.hz-hack{position:absolute;inset:0;z-index:31;display:flex;align-items:center;justify-content:center;pointer-events:auto;background:rgba(0,0,0,.45);}
.hz-hack .term{width:640px;max-width:96vw;background:#020a04;border:2px solid #20c050;box-shadow:0 0 30px rgba(40,255,100,.25);padding:14px 18px;font-family:'Courier New',monospace;color:#40ff80;position:relative;overflow:hidden;}
.hz-hack .term:after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.25) 0 1px,transparent 1px 3px);pointer-events:none;}
.hz-hack h2{margin:0 0 4px;font-size:20px;letter-spacing:4px;} .hz-hack .info{font-size:12px;opacity:.8;margin-bottom:10px;}
.hz-hack .cols{display:flex;gap:6px;justify-content:center;height:260px;position:relative;}
.hz-hack .col{width:56px;height:260px;overflow:hidden;position:relative;border:1px solid rgba(64,255,128,.2);}
.hz-hack .col.act{border-color:#40ff80;box-shadow:0 0 10px rgba(64,255,128,.5);}
.hz-hack .col.ok{border-color:#40ff80;background:rgba(64,255,128,.12);}
.hz-hack .col .s{position:absolute;left:0;right:0;text-align:center;font:bold 30px 'Courier New',monospace;}
.hz-hack .col .s.tg{color:#ff4040;text-shadow:0 0 8px #f00;}
.hz-hack .lock{position:absolute;left:0;right:0;top:110px;height:40px;border-top:2px solid rgba(64,255,128,.6);border-bottom:2px solid rgba(64,255,128,.6);pointer-events:none;}
.hz-hack .bot{display:flex;justify-content:space-between;margin-top:10px;font-size:14px;}
.hz-hack .msg{text-align:center;font-size:22px;margin-top:6px;height:28px;letter-spacing:3px;}
.hz-hack .bad{color:#ff4040;}
/* results */
.hz-res{position:absolute;inset:0;z-index:32;pointer-events:auto;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(0,0,0,.55),rgba(0,0,0,.92));font-family:Arial;}
.hz-res .box{width:620px;max-width:95vw;max-height:94vh;overflow:auto;}
.hz-res h1{margin:0;text-align:center;font:bold 56px Impact,'Arial Black',Arial;letter-spacing:4px;color:#f0c030;text-shadow:0 4px 10px #000;}
.hz-res h1.fail{color:#e03030;}
.hz-res .sub{text-align:center;letter-spacing:5px;font-size:15px;margin-bottom:16px;color:#ddd;}
.hz-res .row{display:flex;justify-content:space-between;padding:7px 12px;background:rgba(255,255,255,.06);margin:3px 0;font-size:16px;opacity:0;animation:hzIn .35s forwards;}
.hz-res .row.big{font-size:22px;font-weight:bold;background:rgba(240,192,48,.15);}
.hz-res .row .g{color:#7cf27c;} .hz-res .row .r{color:#ff7a6a;}
@keyframes hzIn{from{opacity:0;transform:translateX(-20px)}to{opacity:1;transform:none}}
.hz-res .btns{text-align:center;margin-top:16px;opacity:0;animation:hzIn .4s forwards;}
.hz-res button{font:bold 16px Arial;letter-spacing:2px;padding:10px 22px;margin:0 6px;cursor:pointer;background:#2a2a2a;color:#fff;border:2px solid #888;}
.hz-res button.main{background:#a01818;border-color:#600;}
`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const money = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');

// --- crew ------------------------------------------------------------------------------------------------
export const CREW = {
  gunman: [
    { id: 'gus', name: 'Gus Malone', cut: 8, skill: 0.45, hp: 130, gun: 'mp5', mask: 'pig', desc: 'Ex mall cop. Means well. Slow to aim.', face: 0 },
    { id: 'rosa', name: 'Rosa "Rattle" Vega', cut: 12, skill: 0.72, hp: 170, gun: 'm4', mask: 'skull', desc: 'Ex-Army. Keeps her head when it hits the fan.', face: 1 },
    { id: 'tank', name: 'Tank', cut: 18, skill: 0.9, hp: 240, gun: 'm249', mask: 'hockey', desc: 'Nobody knows his real name. Carries a machine gun.', face: 2 },
  ],
  hacker: [
    { id: 'pixel', name: 'Pixel', cut: 6, skill: 0.4, time: 40, lives: 2, delay: 0, desc: '15 years old. Says he is "basically a pro".', face: 3 },
    { id: 'nyx', name: 'Nyx', cut: 10, skill: 0.7, time: 55, lives: 3, delay: 15, desc: 'Slows the police dispatch by 15 seconds.', face: 4 },
    { id: 'zero', name: 'Zero Cool', cut: 15, skill: 0.95, time: 70, lives: 4, delay: 30, desc: 'Hacked Builders Club once. Delays police 30s.', face: 5 },
  ],
  driver: [
    { id: 'lou', name: 'Lucky Lou', cut: 5, skill: 0.4, speed: 0.88, armor: 0.75, desc: 'Has a license. Probably. Might hit things.', face: 6 },
    { id: 'speedy', name: 'Speedy', cut: 9, skill: 0.7, speed: 1.0, armor: 1.0, desc: 'Knows every back street in Robloxia.', face: 7 },
    { id: 'ghost', name: 'Ghost', cut: 13, skill: 0.95, speed: 1.12, armor: 1.3, desc: 'Never been caught. Armoured van.', face: 8 },
  ],
};
export const PRIMARIES = [
  { id: 'mp5', att: ['reddot'] }, { id: 'remington', att: [] }, { id: 'ak47', att: [] }, { id: 'm4', att: ['holo', 'foregrip'] }, { id: 'm249', att: ['reddot'] },
];
export const ARMOR = [
  { id: 'none', name: 'None', armor: 0, speed: 1 }, { id: 'light', name: 'Light vest', armor: 50, speed: 0.95 }, { id: 'heavy', name: 'Heavy armor', armor: 100, speed: 0.86 },
];

/** A ROBLOX-style head shot for the crew cards (canvas). */
function drawFace(cv, k) {
  const x = cv.getContext('2d'), w = cv.width, h = cv.height;
  const bgs = ['#5a6a7a', '#6a5a4a', '#4a5a4a', '#3a3a5a', '#5a3a5a', '#2a4a5a', '#6a6a4a', '#4a4a4a', '#2a2a2a'];
  x.fillStyle = bgs[k % bgs.length]; x.fillRect(0, 0, w, h);
  const skins = ['#f5cd30', '#d8a27a', '#8a5a3a', '#f5cd30', '#e8c8a0', '#c89060', '#f5cd30', '#a8704a', '#e8d0b0'];
  // shoulders and shirt
  x.fillStyle = ['#2a2a2a', '#4a5a2a', '#1a1a1a', '#3a6aa8', '#5a2a6a', '#1a1a2a', '#8a2a2a', '#2a3a5a', '#111'][k % 9];
  x.fillRect(w * 0.18, h * 0.7, w * 0.64, h * 0.4);
  x.fillStyle = skins[k % skins.length];
  x.beginPath(); x.roundRect ? x.roundRect(w * 0.33, h * 0.16, w * 0.34, h * 0.52, 10) : x.rect(w * 0.33, h * 0.16, w * 0.34, h * 0.52); x.fill();
  x.fillStyle = '#111';
  x.fillRect(w * 0.42, h * 0.32, 4, 7); x.fillRect(w * 0.56, h * 0.32, 4, 7);
  x.strokeStyle = '#111'; x.lineWidth = 2; x.beginPath();
  if (k % 3 === 0) x.arc(w / 2, h * 0.44, 8, 0.2, Math.PI - 0.2); else if (k % 3 === 1) { x.moveTo(w * 0.43, h * 0.52); x.lineTo(w * 0.57, h * 0.52); } else x.arc(w / 2, h * 0.56, 8, Math.PI + 0.3, -0.3);
  x.stroke();
  // a hat / hair / shades for some
  if (k === 2 || k === 8) { x.fillStyle = '#111'; x.fillRect(w * 0.37, h * 0.3, w * 0.26, 8); }
  if (k === 1 || k === 4) { x.fillStyle = '#3a2410'; x.fillRect(w * 0.31, h * 0.1, w * 0.38, h * 0.12); }
  if (k === 5) { x.fillStyle = '#1a1a1a'; x.fillRect(w * 0.3, h * 0.08, w * 0.4, h * 0.14); x.fillRect(w * 0.28, h * 0.2, w * 0.44, 4); }
  if (k === 6) { x.fillStyle = '#a01818'; x.fillRect(w * 0.32, h * 0.08, w * 0.36, h * 0.1); x.fillRect(w * 0.6, h * 0.16, w * 0.16, 4); }
  x.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < h; i += 3) x.fillRect(0, i, w, 1);
}

// --- planning board ---------------------------------------------------------------------------------------------
export class PlanningBoard {
  constructor(root, opts) {
    this.opts = opts;
    this.choice = { gunman: 'rosa', hacker: 'nyx', driver: 'speedy', primary: 'm4', sidearm: 'glock', mask: 'hockey', armor: 'light', diff: 'normal', voices: true, ...(opts.last || {}) };
    const el = document.createElement('div'); el.className = 'hz-board';
    root.appendChild(el); this.el = el;
    el.addEventListener('click', (e) => this.click(e));
    el.addEventListener('mousedown', (e) => e.stopPropagation());
    this.render();
  }
  get potential() { return this.choice.diff === 'hard' ? 1.5 : 1; }
  cuts() { const c = this.choice; return CREW.gunman.find((x) => x.id === c.gunman).cut + CREW.hacker.find((x) => x.id === c.hacker).cut + CREW.driver.find((x) => x.id === c.driver).cut; }
  render() {
    const c = this.choice;
    const card = (role, m) => `<div class="card${c[role] === m.id ? ' sel' : ''}" data-role="${role}" data-id="${m.id}"><canvas width="140" height="76" data-face="${m.face}"></canvas><div class="n">${esc(m.name)} <span class="cut">${m.cut}%</span></div><div class="d">${esc(m.desc)}</div><div class="sk"><i style="width:${Math.round(m.skill * 100)}%"></i></div></div>`;
    const opt = (key, id, label, extra = '') => `<div class="${c[key] === id ? 'sel' : ''}" data-key="${key}" data-id="${id}">${label}${extra}</div>`;
    const yours = 100 - this.cuts();
    this.el.innerHTML = `<div class="cork">
      <h1>THE FIRST ROBLOXIA <span>JOB</span></h1>
      <div class="subt">Target: First Robloxia Bank, 1 Main Street &nbsp;·&nbsp; Vault: cash, gold bars, safe deposit boxes &nbsp;·&nbsp; Potential take: <b>${money((this.opts.potential || 2290000) * this.potential)}</b></div>
      <div class="cols">
        <div>
          <div class="note plan"><h3>THE PLAN</h3><ol>
            <li>Walk in like customers.</li>
            <li><i>Optional:</i> lift the manager's <b>keycard</b> and kill the <b>silent alarm</b> in the security room before anyone notices.</li>
            <li>Mask up (<b>G</b>). Everybody on the floor! Keep the hostages down (<b>F</b> to shout).</li>
            <li>Get through the STAFF door (keycard, or blow it).</li>
            <li>Hack the vault gate. Drill the vault.</li>
            <li>Bag the cash and gold (hold <b>E</b>).</li>
            <li>Out the back to the van. Lose the cops.</li></ol>
            <div style="margin-top:8px;font-size:11px;border-top:1px dashed #999;padding-top:6px"><b>CONTROLS</b><br>Click the game to use the mouse · click: shoot<br>E: aim (tap) / use &amp; grab (hold) · F: shout<br>G: mask · R: reload · Shift: sprint · 1/2: guns · M: mute</div></div>
          <div class="photo"><canvas class="bankpic" width="240" height="120"></canvas><span>the target</span></div>
        </div>
        <div class="crew">
          <div class="role"><h3>GUNMAN</h3><div class="cards">${CREW.gunman.map((m) => card('gunman', m)).join('')}</div></div>
          <div class="role"><h3>HACKER</h3><div class="cards">${CREW.hacker.map((m) => card('hacker', m)).join('')}</div></div>
          <div class="role"><h3>DRIVER</h3><div class="cards">${CREW.driver.map((m) => card('driver', m)).join('')}</div></div>
        </div>
        <div class="gear note" style="transform:rotate(.6deg)">
          <h3>LOADOUT</h3>
          <canvas class="gunpic" width="270" height="96"></canvas>
          <div class="opt">${PRIMARIES.map((p) => opt('primary', p.id, esc(GUNS[p.id].name))).join('')}</div>
          <div class="opt">${['glock', 'deagle'].map((g) => opt('sidearm', g, esc(GUNS[g].name))).join('')}</div>
          <h3>MASK</h3>
          <div class="opt masks">${Object.keys(MASKS).map((m) => `<div class="${c.mask === m ? 'sel' : ''}" data-key="mask" data-id="${m}" title="${esc(MASKS[m].name)}"><img src="${this.maskSrc(m)}" alt=""></div>`).join('')}</div>
          <h3>ARMOR</h3>
          <div class="opt">${ARMOR.map((a) => opt('armor', a.id, a.name)).join('')}</div>
          <h3>DIFFICULTY</h3>
          <div class="opt">${opt('diff', 'normal', 'Normal', ' <small>3 lives</small>')}${opt('diff', 'hard', 'Hard', ' <small>x1.5 take, 2 lives</small>')}</div>
          <div class="opt">${opt('voices', true, 'Voices on')}${opt('voices', false, 'Voices off')}</div>
        </div>
      </div>
      <div class="foot">
        <div><div class="cutinfo">Crew takes ${this.cuts()}% &nbsp;·&nbsp; Your cut: <b>${yours}%</b> (up to ${money((this.opts.potential || 2290000) * this.potential * yours / 100)})</div>
        <div class="bal">Your account: ${money(this.opts.balance || 0)} &nbsp;·&nbsp; Heists pulled: ${this.opts.done || 0}</div></div>
        <button class="go" data-go="1">START HEIST</button>
      </div></div>`;
    for (const cv of this.el.querySelectorAll('canvas[data-face]')) drawFace(cv, +cv.dataset.face);
    const bp = this.el.querySelector('.bankpic'); if (bp && this.opts.bankPic) this.opts.bankPic(bp);
    const gp = this.el.querySelector('.gunpic'); if (gp && this.opts.preview) { const P = PRIMARIES.find((p) => p.id === c.primary); this.opts.preview(gp, c.primary, P.att); }
  }
  maskSrc(id) { const t = maskTexture(id); return t.image.toDataURL ? t.image.toDataURL() : ''; }
  click(e) {
    const t = e.target.closest('[data-role],[data-key],[data-go]');
    if (!t) return;
    if (t.dataset.go) { this.close(); this.opts.onStart?.(this.choice); return; }
    if (t.dataset.role) this.choice[t.dataset.role] = t.dataset.id;
    if (t.dataset.key) { let v = t.dataset.id; if (v === 'true') v = true; if (v === 'false') v = false; this.choice[t.dataset.key] = v; }
    this.opts.onClick?.();
    this.render();
  }
  close() { this.el.remove(); }
}

// --- the HUD ---------------------------------------------------------------------------------------------
export class HeistHud {
  constructor(root) {
    if (!document.getElementById('hz-css')) { const st = document.createElement('style'); st.id = 'hz-css'; st.textContent = CSS; document.head.appendChild(st); }
    root.classList.add('hz-mode');
    root.querySelector('.ds-hud')?.classList.add('hz-hide');
    const el = document.createElement('div'); el.className = 'hz';
    el.innerHTML = `
      <div class="masked"></div><div class="letter"></div>
      <div class="obj"><div class="t">OBJECTIVES</div><div class="list"></div></div>
      <div class="hostages"></div>
      <div class="right"><div class="stars"><i>★</i><i>★</i><i>★</i><i>★</i><i>★</i></div><div class="take"><small>THE TAKE</small><span>$0</span></div><div class="bag">BAG<span class="b"><i style="width:0"></i></span></div><div class="timers"></div></div>
      <div class="susp"><div class="eye">👁</div><div class="bar"><i></i></div><div class="lbl">SUSPICIOUS</div></div>
      <div class="prompt"><span class="k"><svg viewBox="0 0 38 38"><circle cx="19" cy="19" r="16" fill="rgba(0,0,0,.55)" stroke="rgba(255,255,255,.35)" stroke-width="3"/><circle class="ring" cx="19" cy="19" r="16" fill="none" stroke="#ffd040" stroke-width="3" stroke-dasharray="100.5" stroke-dashoffset="100.5" transform="rotate(-90 19 19)"/></svg><span>E</span></span><span class="l"></span></div>
      <div class="sub"></div>
      <div class="big"></div>
      <div class="mm"><canvas width="196" height="196"></canvas><div class="bars"><div class="hp"><i style="width:100%"></i></div><div class="ar"><i style="width:0"></i></div></div><div class="lives"></div></div>
      <div class="keys"></div>
      <div class="maskfx"><img alt=""></div>
      <div class="fade"></div>`;
    root.appendChild(el);
    this.el = el;
    const q = (s) => el.querySelector(s);
    this.list = q('.obj .list'); this.subEl = q('.sub'); this.stars = q('.stars'); this.takeEl = q('.take span'); this.bagEl = q('.bag i'); this.bagBox = q('.bag');
    this.timers = q('.timers'); this.hostEl = q('.hostages'); this.susp = q('.susp'); this.suspBar = q('.susp .bar i');
    this.prompt = q('.prompt'); this.ring = q('.prompt .ring'); this.promptL = q('.prompt .l'); this.promptK = q('.prompt .k span');
    this.bigEl = q('.big'); this.mmCanvas = q('.mm canvas'); this.hp = q('.mm .hp'); this.hpI = q('.mm .hp i'); this.arI = q('.mm .ar i'); this.livesEl = q('.mm .lives');
    this.keysEl = q('.keys'); this.maskfx = q('.maskfx'); this.maskedEl = q('.masked'); this.letter = q('.letter'); this.fadeEl = q('.fade');
    this.subQueue = []; this.subT = 0;
    this.bigT = 0;
  }
  setObjectives(items) {
    this.list.innerHTML = items.map((o) => `<div class="o${o.done ? ' done' : ''}${o.opt ? ' opt' : ''}">${o.opt ? '○ ' : '■ '}${o.text}</div>`).join('');
  }
  /** A line of dialogue or an instruction at the bottom of the screen. */
  say(who, text, secs = 4, color = '#7fc0ff') {
    // don't fall behind: keep at most a couple of lines waiting
    while (this.subQueue.length > 1) this.subQueue.shift();
    this.subQueue.push({ who, text, secs, color });
    if (this.subT <= 0) this._nextSub();
  }
  clearSubs() { this.subQueue.length = 0; this.subT = 0; this.subEl.innerHTML = ''; }
  _nextSub() {
    const s = this.subQueue.shift();
    if (!s) { this.subEl.innerHTML = ''; return; }
    this.subEl.innerHTML = s.who ? `<span class="who" style="color:${s.color}">${esc(s.who)}:</span> ${s.text}` : s.text;
    this.subT = s.secs;
  }
  setStars(n, flash) { if (this._stars === n + ':' + flash) return; this._stars = n + ':' + flash; [...this.stars.children].forEach((s, i) => s.classList.toggle('on', i < n)); this.stars.classList.toggle('flash', !!flash); }
  setTake(v, fill) { if (this._take === v + ':' + fill) return; this._take = v + ':' + fill; this.takeEl.textContent = money(v); this.bagEl.style.width = Math.round(Math.min(1, fill) * 100) + '%'; }
  setTimers(list) {
    const key = JSON.stringify(list);
    if (key === this._timersKey) return;
    this._timersKey = key;
    this.timers.innerHTML = list.map((t) => `<div><div class="timer ${t.cls || ''}">${esc(t.label)} ${t.value ?? ''}${t.p != null ? `<span class="p"><i style="width:${Math.round(t.p * 100)}%"></i></span>` : ''}</div></div>`).join('');
  }
  setHostages(n, warn, show) { if (this._host === `${n}:${warn}:${show}`) return; this._host = `${n}:${warn}:${show}`; this.hostEl.style.display = show ? 'block' : 'none'; if (show) this.hostEl.innerHTML = `HOSTAGES ${n}${warn ? ` &nbsp;<span class="w">⚠ ${warn} GETTING UP - SHOUT (F) OR AIM AT THEM</span>` : ''}`; }
  setSuspicion(v, label = 'SUSPICIOUS') { const key = v > 0.01 ? Math.round(v * 50) + label : 0; if (key === this._susp) return; this._susp = key; this.susp.style.display = v > 0.01 ? 'block' : 'none'; this.suspBar.style.width = Math.round(Math.min(1, v) * 100) + '%'; this.susp.querySelector('.lbl').textContent = label; }
  setPrompt(label, progress = 0, ok = true, key = 'E') {
    if (!label) { if (this._prompt !== null) { this._prompt = null; this.prompt.style.display = 'none'; } return; }
    this._prompt = label;
    this.prompt.style.display = 'block';
    this.promptL.innerHTML = label; this.promptL.classList.toggle('no', !ok); this.promptK.textContent = key;
    this.ring.setAttribute('stroke-dashoffset', String(100.5 * (1 - progress)));
  }
  setVitals(hp, armor, maxArmor, lives) {
    const key = `${Math.ceil(hp)}:${Math.ceil(armor)}:${maxArmor}:${lives}`;
    if (key === this._vit) return; this._vit = key;
    this.hpI.style.width = Math.max(0, Math.min(100, hp)) + '%'; this.hp.classList.toggle('low', hp < 30);
    this.arI.style.width = (maxArmor ? Math.max(0, armor / maxArmor * 100) : 0) + '%';
    this.livesEl.textContent = lives != null ? `LIVES: ${'♥ '.repeat(Math.max(0, lives))}` : '';
  }
  setKeys(html) { if (this._keys !== html) { this._keys = html; this.keysEl.innerHTML = html; } }
  big(text, sub = '', secs = 3, color = '#fff') { this.bigEl.style.display = 'block'; this.bigEl.style.color = color; this.bigEl.innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}`; this.bigT = secs; }
  popup(text, color = '#7cf27c') { const p = document.createElement('div'); p.className = 'popup'; p.style.color = color; p.textContent = text; this.el.appendChild(p); setTimeout(() => p.remove(), 1700); }
  maskOn(id) {
    const img = this.maskfx.querySelector('img'); img.src = maskTexture(id).image.toDataURL();
    this.maskfx.style.display = 'flex'; img.style.animation = 'none'; void img.offsetWidth; img.style.animation = '';
    setTimeout(() => { this.maskfx.style.display = 'none'; this.maskedEl.style.display = 'block'; }, 650);
  }
  letterbox(on) { this.letter.classList.toggle('on', on); }
  cinematic(on) { this.el.classList.toggle('cine', on); }
  fade(v) { this.fadeEl.style.opacity = v; }
  show(on) { this.el.style.display = on ? '' : 'none'; }
  update(dt) {
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this._nextSub(); }
    if (this.bigT > 0) { this.bigT -= dt; if (this.bigT <= 0) this.bigEl.style.display = 'none'; }
  }
}

// --- minimap ----------------------------------------------------------------------------------------------
/** A top-down radar of the bank and streets that turns with the camera. */
export class Minimap {
  constructor(canvas, rects, range = 70) {
    this.canvas = canvas; this.range = range;
    // pre-draw the map: 2 px per stud over x,z in [-200,200]
    const S = 2, ext = 200;
    const m = document.createElement('canvas'); m.width = m.height = ext * 2 * S;
    const x = m.getContext('2d');
    x.fillStyle = '#5a6a4a'; x.fillRect(0, 0, m.width, m.height);
    const R = (x0, x1, z0, z1, col) => { x.fillStyle = col; x.fillRect((x0 + ext) * S, (z0 + ext) * S, (x1 - x0) * S, (z1 - z0) * S); };
    for (const r of rects) R(r.x0, r.x1, r.z0, r.z1, r.col);
    this.img = m; this.S = S; this.ext = ext;
  }
  draw(cx, cz, yaw, blips, route = null) {
    const c = this.canvas, x = c.getContext('2d'), w = c.width, h = c.height;
    const k = (w / 2) / this.range; // px per stud
    x.save();
    x.fillStyle = route ? '#5a6a4a' : '#2a2a2a'; x.fillRect(0, 0, w, h);
    x.beginPath(); x.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); x.clip();
    x.translate(w / 2, h / 2);
    x.rotate(yaw);
    if (route) {
      // the getaway: just the road you're on
      x.strokeStyle = '#3a3a3c'; x.lineWidth = 9; x.lineJoin = 'round'; x.beginPath();
      route.forEach(([px, pz], i) => (i ? x.lineTo((px - cx) * k, (pz - cz) * k) : x.moveTo((px - cx) * k, (pz - cz) * k)));
      x.stroke();
      x.strokeStyle = '#8a7ad8'; x.lineWidth = 3; x.stroke();
    } else {
      const s = k / this.S;
      x.drawImage(this.img, (-cx - this.ext) * k, (-cz - this.ext) * k, this.img.width * s, this.img.height * s);
    }
    for (const b of blips) {
      const bx = (b.x - cx) * k, bz = (b.z - cz) * k;
      let px = bx, pz = bz;
      const d = Math.hypot(px, pz), lim = w / 2 - 7;
      if (d > lim) { if (!b.edge) continue; px *= lim / d; pz *= lim / d; }
      x.save(); x.translate(px, pz); x.rotate(-yaw);
      x.fillStyle = b.color; x.strokeStyle = '#000'; x.lineWidth = 1.5;
      if (b.shape === 'star') { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 3 : 7; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fill(); x.stroke(); }
      else if (b.shape === 'sq') { x.fillRect(-5, -5, 10, 10); x.strokeRect(-5, -5, 10, 10); }
      else { x.beginPath(); x.arc(0, 0, b.r || 4, 0, Math.PI * 2); x.fill(); x.stroke(); }
      x.restore();
    }
    x.restore();
    // the player: an arrow in the middle pointing up
    x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(w / 2, h / 2 - 8); x.lineTo(w / 2 + 6, h / 2 + 6); x.lineTo(w / 2, h / 2 + 2); x.lineTo(w / 2 - 6, h / 2 + 6); x.closePath(); x.fill(); x.stroke();
  }
}

// --- BRUTEFORCE: the hacking minigame ---------------------------------------------------------------------
const WORDS = ['ROBLOXIA', 'BLOXCOLA', 'BRICKTOP', 'VAULTKEY', 'GOLDBARS', 'TIXTOKEN', 'NOOBSAFE', 'TELAMONS'];
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&';
export class HackGame {
  constructor(root, { time = 50, lives = 3, onDone, onKey }) {
    this.word = WORDS[(Math.random() * WORDS.length) | 0];
    this.time = time; this.lives = lives; this.onDone = onDone; this.onKey = onKey;
    this.col = 0; this.done = false;
    const el = document.createElement('div'); el.className = 'hz-hack';
    el.innerHTML = `<div class="term"><h2>BRUTEFORCE.EXE</h2><div class="info">VAULT GATE TIME-LOCK // press SPACE (or click) when the <span style="color:#ff4040">red</span> letter is inside the lock bars</div>
      <div class="cols"></div><div class="msg"></div><div class="bot"><span class="lv"></span><span class="tm"></span></div></div>`;
    root.appendChild(el); this.el = el;
    this.colsEl = el.querySelector('.cols'); this.msg = el.querySelector('.msg'); this.lv = el.querySelector('.lv'); this.tm = el.querySelector('.tm');
    this.cols = [...this.word].map((ch, i) => {
      const c = document.createElement('div'); c.className = 'col';
      const lock = document.createElement('div'); lock.className = 'lock'; c.appendChild(lock);
      this.colsEl.appendChild(c);
      // a strip of 14 symbols with the target among them, scrolling vertically
      const syms = []; for (let k = 0; k < 14; k++) syms.push(ABC[(Math.random() * ABC.length) | 0]);
      const ti = 3 + ((Math.random() * 8) | 0); syms[ti] = ch;
      for (let k = 0; k < 14; k++) if (k !== ti && syms[k] === ch) syms[k] = '#';
      const els = syms.map((s, k) => { const d = document.createElement('div'); d.className = 's' + (k === ti ? ' tg' : ''); d.textContent = s; c.appendChild(d); return d; });
      return { el: c, els, ti, off: Math.random() * 14 * 40, speed: (70 + Math.random() * 40 + i * 9) * (Math.random() < 0.5 ? 1 : -1), ok: false };
    });
    this.keyFn = (e) => { if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); this.press(); } if (e.key === 'Escape') { e.stopPropagation(); this.finish(false, 'ABORTED'); } };
    window.addEventListener('keydown', this.keyFn, true);
    el.addEventListener('mousedown', (e) => { e.stopPropagation(); this.press(); });
    this.render();
  }
  press() {
    if (this.done) return;
    const c = this.cols[this.col];
    const y = this.symY(c, c.ti);
    if (y > 108 && y + 32 < 154) {
      c.ok = true; c.el.classList.add('ok'); c.el.classList.remove('act');
      this.onKey?.(true);
      this.col++;
      if (this.col >= this.cols.length) { this.finish(true, 'ACCESS GRANTED'); return; }
    } else {
      this.lives--; this.onKey?.(false);
      this.msg.innerHTML = '<span class="bad">DENIED</span>'; setTimeout(() => { if (!this.done) this.msg.textContent = ''; }, 500);
      c.speed *= 1.25;
      if (this.lives <= 0) { this.finish(false, 'LOCKOUT'); return; }
    }
  }
  symY(c, k) { const L = 14 * 40; return ((k * 40 + c.off) % L + L) % L - 40; }
  render() {
    this.cols.forEach((c, i) => {
      c.el.classList.toggle('act', i === this.col && !this.done);
      c.els.forEach((e, k) => { e.style.top = (c.ok ? (k - c.ti) * 40 + 114 : this.symY(c, k)) + 'px'; });
    });
    this.lv.textContent = 'ATTEMPTS: ' + '■ '.repeat(Math.max(0, this.lives));
    this.tm.textContent = 'TIME ' + Math.max(0, this.time).toFixed(1);
  }
  update(dt) {
    if (this.done) return;
    this.time -= dt;
    if (this.time <= 0) { this.finish(false, 'TIMED OUT'); return; }
    for (const c of this.cols) if (!c.ok) c.off += c.speed * dt;
    this.render();
  }
  finish(ok, text) {
    if (this.done) return;
    this.done = true; this.render();
    this.msg.innerHTML = ok ? text : `<span class="bad">${text}</span>`;
    window.removeEventListener('keydown', this.keyFn, true);
    setTimeout(() => { this.el.remove(); this.onDone?.(ok); }, ok ? 900 : 1300);
  }
  abort() { if (!this.done) { this.done = true; window.removeEventListener('keydown', this.keyFn, true); this.el.remove(); } }
}

// --- results ------------------------------------------------------------------------------------------------
export function showResults(root, { passed, title, rows, buttons }) {
  const el = document.createElement('div'); el.className = 'hz-res';
  el.addEventListener('mousedown', (e) => e.stopPropagation());
  el.innerHTML = `<div class="box"><h1 class="${passed ? '' : 'fail'}">${passed ? 'HEIST PASSED' : 'HEIST FAILED'}</h1><div class="sub">${esc(title)}</div>
    ${rows.map((r, i) => `<div class="row${r.big ? ' big' : ''}" style="animation-delay:${0.25 + i * 0.18}s"><span>${esc(r.label)}</span><span class="${r.cls || ''}">${esc(r.value)}</span></div>`).join('')}
    <div class="btns" style="animation-delay:${0.4 + rows.length * 0.18}s">${buttons.map((b, i) => `<button class="${i === 0 ? 'main' : ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
  el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; el.remove(); buttons[+b.dataset.i].fn(); });
  root.appendChild(el);
  return el;
}
