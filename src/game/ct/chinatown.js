// The CHINATWN map script: No More Room in Hell's nmo_chinatown objective
// chain (tools/ct/SPEC.md section 9) on top of the generic specials in
// ct/level.js. Six objectives, NMRiH's own words:
//   1 escape the subway (chain 903/50, elevator door 904/1 -> sector 1,
//     out through portal 100 and over 905/130)
//   2 fuel the generator (gas can 9040, panel 904/2, button 904/3 lights,
//     the arch gate, sector 2, rolls up over 20 s)
//   3 release the roadblock ladder (switch 904/4 -> ladder 902/80,
//     shortcut 904/5 -> door 4, onto the deck over 905/131)
//   4 through the sewers (portal 101, water, plank 54, ladder 902/81, out
//     over 905/132; 904/6 -> shortcut door 5)
//   5 weld the gate's lock (blowtorch 9042, hold 904/7 for 12 s, then hold
//     the crank 904/8 to wind gate 6 open; through it to the north)
//   6 power the radio and call (boards 55 unlock door 7, plug 9041, socket
//     904/9, radio 904/10), hold out 60 s, then reach the helicopter over
//     the pier's north end (sector 160) within 30 s
// Random rolls (which gas can, which blowtorch, whether the welder garage is
// shut) use w.rng at level start, mixed with the game's roll seed (Game
// newGame, kept by saves) so that every game and every restart differs.
// Everything the script knows is in `s` (CtLevel state), plain numbers,
// arrays and object references, so saves keep it; looping sounds are
// cosmetic and restarted after a load.

import { MT } from '../tables.js';
import { normAngle, pointToAngle } from '../defs.js';
import { teleportMove } from '../map.js';
import { VerticalDoor } from '../specials/doors.js';
import { movePlane, findLowestCeilingSurrounding, sectorSound } from '../specials/util.js';
import { KEY_ITEM } from './items.js';
import { Director } from './director.js';
import { heliPath, spawnHeli, tickHeli, heliLeave } from './heli.js';

const T = 35;
export const OBJECTIVES = [
  '',
  'Escape the subway!',
  'Find fuel for generator to open the gate!',
  'Release the ladder on the roadblock!',
  'Find your way through the sewers!',
  "Use welder on the gate's lock to open it!",
  'Power up the radio and call for rescue!',
];
// Stages after the six objectives.
export const STAGE = { HOLDOUT: 7, EXTRACT: 8, OVER: 9 };
const HOLDOUT_TEXT = 'Hold out until rescue arrives!';
const EXTRACT_TEXT = 'Get to the helicopter at the end of the pier!';
const RADIO_TEXT = 'Rescue is coming in 60 seconds. Hang tight!';

// Breakable lines by tag (SPEC section 8).
const BREAKABLES = {
  50: { hp: 50, material: 'metal' }, // subway platform chain
  51: { hp: 5, material: 'wood' }, // pre-sewer board
  52: { hp: 50, material: 'wood' }, // boarded medical room
  53: { hp: 85, material: 'wood' }, // laundromat back doorway
  54: { hp: 300, material: 'wood' }, // sewer plank barricade
  55: { hp: 25, material: 'wood' }, // dock side-room boards (unlock door 7)
  56: { hp: 45, material: 'glass' }, // laundromat windows
  57: { hp: 1, material: 'glass' }, // dock warehouse partition
};

const DOOR1_TICS = 6 * T;
const GATE2_TICS = 20 * T;
const WELD_TICS = 12 * T;
const CRANK_OPEN_TICS = 8 * T;
const CRANK_CLOSE_TICS = 16 * T;
const HOLDOUT_TICS = 60 * T;
const EXTRACT_TICS = 30 * T;
const BOARD_TICS = 1; // aboard the moment the player reaches the zone, as in NMRiH
const ZONE_REACH = 160; // a map without a zone sector: this near the hover point
const CENTER_TICS = 3 * T;
const GARAGE_TAG = 8; // optional: the welder garage doorway the 50% roll may shut
const LADDER_ROADBLOCK = 80;

// Byte k of the game's roll seed, well mixed (each roll gets its own).
function seedByte(seed, k) {
  let h = Math.imul((seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0, 0x85ebca6b) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 13)) & 255;
}

export class ChinatownScript {
  constructor(ct) {
    this.ct = ct;
    this.w = ct.w;
    this.director = new Director(this);
    this.cache = new Map();
    // Cosmetic sound loop origins and HUD memo (not saved).
    this.weldSound = null;
    this.genSound = null;
    this.hudCache = null;
    this.hudTic = -1;
  }

  freshState() {
    return {
      stage: 1,
      done: [true, false, false, false, false, false, false],
      center: '', centerTics: 0, centerTotal: 0,
      garageSealed: false,
      door1: false,
      generator: false, genLoopTic: 0,
      gate: 0, // arch gate: 0 shut, 1 rising, 2 open
      ladder: false,
      weld: 0, welded: false,
      crankTic: -1, crankStarted: false, crankSoundTic: 0, gateOpen: 0,
      gate6: [], // [{ sector, floor, top }]
      inGate: false,
      socket: false,
      holdout: 0,
      heli: null,
      extract: 0,
      boarding: 0,
      result: 0, // 1 rescued, -1 rescue missed
      failTic: 0,
      music: '',
      dir: Director.freshState(),
    };
  }

  get s() { return this.ct.s.script; }

  // --- Map lookups (static map data) ---------------------------------------------

  lines(special, tag) {
    const key = `l${special}:${tag}`;
    if (!this.cache.has(key)) this.cache.set(key, this.w.level.lines.filter((l) => l.special === special && l.tag === tag));
    return this.cache.get(key);
  }

  sectors(tag) {
    const key = `s${tag}`;
    if (!this.cache.has(key)) this.cache.set(key, this.w.level.sectors.filter((s) => s.tag === tag));
    return this.cache.get(key);
  }

  // Centre of a set of sectors' bounding boxes, or null.
  centre(secs) {
    if (!secs.length) return null;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const s of secs) {
      minx = Math.min(minx, s.bbox.minx); miny = Math.min(miny, s.bbox.miny);
      maxx = Math.max(maxx, s.bbox.maxx); maxy = Math.max(maxy, s.bbox.maxy);
    }
    return { x: (minx + maxx) / 2, y: (miny + maxy) / 2, minx, miny, maxx, maxy };
  }

  lineMid(line) {
    return { x: (line.v1.x + line.v2.x) / 2, y: (line.v1.y + line.v2.y) / 2 };
  }

  zoneSectors() {
    const key = 'zone';
    if (!this.cache.has(key)) this.cache.set(key, this.w.level.sectors.filter((s) => s.tag === 160 || s.special === 66));
    return this.cache.get(key);
  }

  zoneCentre() { return this.centre(this.zoneSectors()); }

  // Is the player where the helicopter picks him up? The zone sector, or
  // on a map without one, close under the hovering helicopter.
  inZone(mo) {
    if (this.zoneSectors().length) return this.ct.inExtractionZone(mo);
    const h = this.s.heli;
    const p = h && h.path[h.path.length - 1];
    return !!p && Math.hypot(mo.x - p.x, mo.y - p.y) < ZONE_REACH;
  }

  things(type) {
    return [...this.w.mobjs].filter((m) => m.type === type).sort((a, b) => a.id - b.id);
  }

  player() { return this.w.player; }

  // --- Feedback ---------------------------------------------------------------------

  // A short centred message (always shown, unlike player.message).
  say(text, tics = CENTER_TICS) {
    const s = this.s;
    s.center = text;
    s.centerTics = s.centerTotal = tics;
  }

  // Swaps a texture on these lines' sides (button lit, ladder down...).
  swapTexture(lines, from, to) {
    const res = this.w.res;
    const a = res.textureNum(from), b = res.textureNum(to);
    if (!a || !b) return;
    for (const line of lines) {
      for (const side of [line.front, line.back]) {
        if (!side) continue;
        let hit = false;
        if (side.toptexture === a) { side.toptexture = b; hit = true; }
        if (side.midtexture === a) { side.midtexture = b; hit = true; }
        if (side.bottomtexture === a) { side.bottomtexture = b; hit = true; }
        if (hit) this.w.sideChanged(side);
      }
    }
  }

  // How high a door or gate sector opens: like DOOM, 4 under the lowest
  // ceiling around it, but ignoring neighbours that are shut themselves
  // (a gate's track or frame drawn as a closed sector).
  doorTop(sec) {
    let top = Infinity;
    for (const line of sec.lines) {
      const other = line.frontsector === sec ? line.backsector : line.frontsector;
      if (!other || other === sec || other.ceilingheight <= other.floorheight) continue;
      top = Math.min(top, other.ceilingheight);
    }
    return top === Infinity ? findLowestCeilingSurrounding(sec) - 4 : top - 4;
  }

  // Opens the doors tagged `tag` (staying open), over `tics` if given.
  openDoor(tag, tics = 0) {
    const w = this.w;
    const started = w.specials.doDoor({ tag }, 'open');
    for (const sec of this.sectors(tag)) {
      const d = sec.specialdata;
      if (!(d instanceof VerticalDoor) || d.direction !== 1) continue;
      d.topheight = this.doorTop(sec);
      if (tics) d.speed = Math.max(0.01, (d.topheight - sec.ceilingheight) / tics);
    }
    return started;
  }

  // Doors tagged `tag` open at once (debug goto).
  setDoorOpen(tag) {
    const w = this.w;
    for (const sec of this.sectors(tag)) {
      if (sec.specialdata) continue;
      sec.ceilingheight = this.doorTop(sec);
      w.changeSector(sec, false);
    }
  }

  // Marks objectives up to k done and moves on to the next stage.
  complete(k) {
    const s = this.s;
    if (s.done[k]) return;
    for (let i = 1; i <= k; i++) s.done[i] = true;
    s.stage = Math.max(s.stage, k + 1);
    this.w.sound(null, 'getpow');
    const next = this.objectiveText();
    this.say(next ? `OBJECTIVE: ${next}` : 'OBJECTIVE COMPLETE', 4 * T);
  }

  objectiveText() {
    const s = this.s;
    if (s.stage <= 6) return OBJECTIVES[s.stage];
    if (s.result === -1) return 'Rescue is gone.';
    if (s.stage === STAGE.HOLDOUT) return HOLDOUT_TEXT;
    if (s.stage === STAGE.EXTRACT) return EXTRACT_TEXT;
    return '';
  }

  // --- Level start --------------------------------------------------------------------

  start() {
    const w = this.w;
    const s = this.s;
    // One gas can of the candidate spots, one blowtorch, and maybe a shut
    // welder garage (never when the blowtorch is in there). A roll is a
    // w.rng draw plus a byte of the game's seed.
    const roll = (k) => (w.rng.P() + seedByte(w.rollSeed, k)) & 255;
    const keepOne = (type, k) => {
      const list = this.things(type);
      if (list.length < 2) return list[0] || null;
      const keep = list[roll(k) % list.length];
      for (const m of list) if (m !== keep) w.removeMobj(m);
      return keep;
    };
    keepOne(MT.CT_IGAS, 0);
    const torches = this.things(MT.CT_ITOR);
    const torch = keepOne(MT.CT_ITOR, 1);
    const garage = this.sectors(GARAGE_TAG);
    if (garage.length) {
      const c = this.centre(garage);
      const near = torches.slice().sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
      const roll2 = roll(2) & 1;
      if (roll2 && torch && torch !== near) {
        s.garageSealed = true;
        for (const sec of garage) {
          sec.ceilingheight = sec.floorheight;
          w.changeSector(sec, false);
        }
      }
    }
    // The roadblock ladder hangs out of reach until the switch.
    this.ct.enableLadder(LADDER_ROADBLOCK, false);
    // The crank gate's travel.
    s.gate6 = this.sectors(6).map((sec) => ({ sector: sec, floor: sec.floorheight, top: this.doorTop(sec) }));
    this.say(`OBJECTIVE: ${OBJECTIVES[1]}`, 4 * T);
  }

  // After a savegame load: the looping sounds come back.
  loaded() {
    const s = this.s;
    if (s.generator && !s.genLoopTic) this.startGeneratorLoop();
    if (s.heli && s.heli.mo && !s.heli.mo.removed) this.w.sound(s.heli.mo, 'heli', { loop: true, channel: 'heli' });
  }

  // --- Hooks from CtLevel ---------------------------------------------------------------

  breakable(tag) { return BREAKABLES[tag] || null; }

  broken(line) {
    if (line.tag === 55) {
      // The boards held the warehouse door shut.
      this.openDoor(7);
    }
  }

  holdable(line) { return line.tag === 7 || line.tag === 8; }

  cross(line, side, thing) {
    const s = this.s;
    switch (line.tag) {
      case 130: this.complete(1); break;
      case 131: if (s.ladder || s.stage > 3) this.complete(3); break;
      case 132:
        if (!s.done[4]) this.director.wave('sewer');
        this.complete(4);
        break;
      case 133: if (s.welded) this.complete(5); break;
      default:
        if (line.tag >= 140 && line.tag <= 159) this.director.ambush(line.tag);
        break;
    }
  }

  use(line, thing) {
    const w = this.w;
    const s = this.s;
    const p = thing.player;
    switch (line.tag) {
      case 1: // freight elevator door
        if (s.door1) break;
        s.door1 = true;
        this.openDoor(1, DOOR1_TICS);
        this.button(line);
        break;
      case 2: // generator panel
        if (s.generator) { this.say('The generator is running.'); break; }
        if (!p.keyItems[KEY_ITEM.GAS]) { this.say('The generator is out of fuel.'); w.sound(thing, 'noway'); break; }
        p.keyItems[KEY_ITEM.GAS] = false;
        s.generator = true;
        w.sound(this.lineOrigin(line), 'genstr');
        s.genLoopTic = w.leveltime + 2 * T;
        this.swapTexture(this.lines(904, 3), 'CTBUT1', 'CTBUT2');
        this.brighten(line);
        for (const l of this.lines(904, 3)) this.brighten(l);
        this.say('The generator sputters to life.');
        break;
      case 3: // arch gate button
        if (!s.generator) { this.say('The gate has no power.'); w.sound(thing, 'noway'); break; }
        if (s.gate) break;
        s.gate = 1;
        w.sound(this.lineOrigin(line), 'swtchn');
        this.openDoor(2, GATE2_TICS);
        for (const sec of this.sectors(2)) sectorSound(w, sec, 'rollgt');
        this.director.wave('gate');
        break;
      case 4: // ladder release switch
        if (s.ladder) break;
        s.ladder = true;
        this.ct.enableLadder(LADDER_ROADBLOCK, true);
        this.swapTexture(this.lines(902, LADDER_ROADBLOCK), 'CTLADR3', 'CTLADR2');
        this.button(line);
        this.director.wave('ladder');
        this.say('The ladder is down.');
        break;
      case 5: // market shortcut door
        if (this.openDoor(4)) this.button(line);
        break;
      case 6: // sewer exit shortcut door
        if (this.openDoor(5)) this.button(line);
        break;
      case 7: // padlock (the weld itself is hold-use)
        if (s.welded) break;
        if (!p.keyItems[KEY_ITEM.TORCH]) { this.say('You need a blowtorch to cut the lock.'); w.sound(thing, 'noway'); }
        break;
      case 8: // crank (hold-use)
        if (!s.welded) { this.say('The gate is locked.'); w.sound(thing, 'noway'); }
        break;
      case 9: // power socket
        if (s.socket) break;
        if (!p.keyItems[KEY_ITEM.PLUG]) { this.say('The radio needs power. Find a plug.'); w.sound(thing, 'noway'); break; }
        p.keyItems[KEY_ITEM.PLUG] = false;
        s.socket = true;
        w.sound(this.lineOrigin(line), 'plugin');
        this.swapTexture([line], 'CTSOCK1', 'CTSOCK2');
        this.swapTexture(this.lines(904, 10), 'CTRADI1', 'CTRADI2');
        this.say('The radio has power.');
        break;
      case 10: // radio
        if (!s.socket) { this.say('The radio has no power.'); w.sound(thing, 'noway'); break; }
        if (s.stage >= STAGE.HOLDOUT) break;
        this.callRadio(line);
        break;
      default: break;
    }
  }

  hold(line, player, tics) {
    const w = this.w;
    const s = this.s;
    if (line.tag === 7) {
      if (s.welded || !player.keyItems[KEY_ITEM.TORCH]) return;
      s.weld++;
      const at = this.lineOrigin(line, player.mo.z + 40);
      if (!this.weldSound) {
        this.weldSound = at;
        w.sound(at, 'weld', { loop: true, channel: 'weld' });
      }
      if (w.fx && w.fx.weldSparks && !(s.weld & 1)) w.fx.weldSparks(at.x, at.y, at.z, pointToAngle(at.x, at.y, player.mo.x, player.mo.y));
      if (s.weld >= WELD_TICS) {
        s.welded = true;
        player.keyItems[KEY_ITEM.TORCH] = false;
        this.stopWeldSound();
        this.swapTexture([line], 'CTPADL1', 'CTPADL2');
        w.sound(at, 'chainb');
        this.say('The lock is cut. Turn the crank to open the gate.');
      }
    } else if (line.tag === 8) {
      if (!s.welded) return;
      s.crankTic = w.leveltime;
      if (!s.crankStarted) {
        s.crankStarted = true;
        this.director.wave('crank');
      }
      if (w.leveltime >= s.crankSoundTic && s.gateOpen < 1) {
        s.crankSoundTic = w.leveltime + 12;
        w.sound(this.lineOrigin(line), 'crank');
      }
    }
  }

  holdEnd(line) {
    if (line.tag === 7) this.stopWeldSound();
  }

  stopWeldSound() {
    if (this.weldSound) this.w.stopLoop(this.weldSound, 'weld');
    this.weldSound = null;
  }

  callRadio(line) {
    const w = this.w;
    const s = this.s;
    this.complete(6);
    s.stage = STAGE.HOLDOUT;
    s.holdout = HOLDOUT_TICS;
    w.sound(this.lineOrigin(line), 'radio');
    this.say(RADIO_TEXT, 5 * T);
    const music = w.game && w.game.firstLump ? w.game.firstLump(['D_CTEVAC']) : null;
    if (music) {
      s.music = music;
      w.game.emit('music', music);
    }
    this.director.wave('holdout');
  }

  // --- Per tic --------------------------------------------------------------------------

  tick() {
    const w = this.w;
    const s = this.s;
    const p = this.player();
    if (s.centerTics > 0) s.centerTics--;
    if (s.genLoopTic && w.leveltime >= s.genLoopTic) {
      s.genLoopTic = 0;
      this.startGeneratorLoop();
    }
    // The arch gate rolling up (its motor), then fully open.
    if (s.gate === 1) {
      if (this.sectors(2).every((sec) => !sec.specialdata)) {
        s.gate = 2;
        this.complete(2);
      } else if (w.leveltime % (3 * T) === 0) {
        for (const sec of this.sectors(2)) sectorSound(w, sec, 'rollgt');
      }
    }
    this.tickCrank();
    if (p && p.mo) this.tickGatePass(p);
    if (s.stage === STAGE.HOLDOUT && s.result === 0) {
      if (--s.holdout <= 0) {
        s.stage = STAGE.EXTRACT;
        // It hovers above the zone's floor (the pier deck).
        const zone = this.zoneSectors();
        const floor = zone.length ? Math.max(...zone.map((sec) => sec.floorheight)) : null;
        s.heli = spawnHeli(w, heliPath(w, this.zoneCentre(), floor));
        if (s.heli) this.say('The helicopter is coming in!');
        else this.rescued(); // a map with neither path nodes nor a zone: nothing to wait for
      }
    }
    if (s.heli) this.tickExtraction(p);
    if (s.result === -1 && p && p.playerstate === 'live' && p.cmd.use && w.leveltime - s.failTic > 2 * T) {
      // Mission failed: use restarts the level, as after death.
      p.playerstate = 'reborn';
    }
    this.director.tick(s.stage >= STAGE.HOLDOUT && s.result === 0);
  }

  startGeneratorLoop() {
    const line = this.lines(904, 2)[0];
    if (!line) return;
    const gen = this.nearest(MT.CT_PGEN, this.lineMid(line), 512);
    this.genSound = gen || this.lineOrigin(line);
    this.w.sound(this.genSound, 'genrun', { loop: true, channel: 'gen' });
  }

  // The level is over: the generator, the rotor and the torch fall silent.
  stopLoops() {
    const w = this.w;
    const s = this.s;
    if (this.genSound) w.stopLoop(this.genSound, 'gen');
    this.genSound = null;
    if (s.heli && s.heli.mo) w.stopLoop(s.heli.mo, 'heli');
    this.stopWeldSound();
  }

  // Aboard: SPEC, rescued -> the finale text, then the title.
  rescued() {
    const s = this.s;
    s.result = 1;
    s.stage = STAGE.OVER;
    this.say('You made it out!');
    this.stopLoops();
    this.w.exitLevel(false, { finale: true });
  }

  // The crank winds gate 6 open while held and lets it sink back when not.
  tickCrank() {
    const w = this.w;
    const s = this.s;
    if (!s.gate6.length) return;
    const held = s.welded && s.crankTic === w.leveltime;
    let open = 0;
    for (const g of s.gate6) {
      const sec = g.sector;
      const range = Math.max(1, g.top - g.floor);
      if (held && sec.ceilingheight < g.top) movePlane(w, sec, range / CRANK_OPEN_TICS, g.top, false, 1, 1);
      else if (!held && sec.ceilingheight > g.floor) movePlane(w, sec, range / CRANK_CLOSE_TICS, g.floor, false, 1, -1);
      open = Math.max(open, (sec.ceilingheight - g.floor) / range);
    }
    s.gateOpen = open;
  }

  // Stage 5 ends once the player has gone through the weld gate northwards.
  tickGatePass(p) {
    const s = this.s;
    if (!s.welded || s.done[5]) return;
    const c = this.centre(this.sectors(6));
    if (!c) return;
    const mo = p.mo;
    const near = mo.x >= c.minx - 32 && mo.x <= c.maxx + 32;
    if (near && mo.y >= c.miny - 24 && mo.y <= c.maxy + 24) s.inGate = true;
    if (s.inGate && near && mo.y > c.maxy + 24) this.complete(5);
    else if (s.inGate && !near) s.inGate = false;
  }

  tickExtraction(p) {
    const w = this.w;
    const s = this.s;
    const phase = tickHeli(w, s.heli);
    if (s.result !== 0) {
      if (phase === 'gone') s.heli = null;
      return;
    }
    if (phase === 'hover' && !s.extract && !s.boarding) {
      s.extract = EXTRACT_TICS;
      this.say('Get to the helicopter! 30 seconds!');
    }
    if (!s.extract) return;
    if (p && p.mo && p.playerstate === 'live' && this.inZone(p.mo)) {
      if (++s.boarding >= BOARD_TICS) {
        this.rescued();
        return;
      }
    } else {
      s.boarding = 0;
    }
    if (--s.extract <= 0) {
      s.extract = 0;
      s.result = -1;
      s.failTic = w.leveltime;
      heliLeave(s.heli);
      this.say('The helicopter has left without you. Rescue is gone.', 6 * T);
      if (p) p.message = 'Mission failed. Press use to try again.';
    }
  }

  // --- Helpers ------------------------------------------------------------------------------

  lineOrigin(line, z = null) {
    const m = this.lineMid(line);
    const sec = line.frontsector;
    return { x: m.x, y: m.y, z: z ?? (sec ? sec.floorheight + 48 : 0) };
  }

  nearest(type, at, maxDist = Infinity) {
    let best = null, bd = maxDist;
    for (const m of this.things(type)) {
      const d = Math.hypot(m.x - at.x, m.y - at.y);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  // Standing in front of one of these lines, close and facing it (no
  // tracing: the HUD asks every frame).
  facing(mo, lines, reach = 96) {
    for (const line of lines) {
      const len = line.length || 1;
      const ux = line.dx / len, uy = line.dy / len;
      const rx = mo.x - line.v1.x, ry = mo.y - line.v1.y;
      const along = rx * ux + ry * uy;
      const out = rx * uy - ry * ux; // distance in front (right of v1->v2)
      if (along < -16 || along > len + 16 || out <= 0 || out > reach) continue;
      // Looking into the line: against its front normal.
      if (Math.cos(mo.angle) * -uy + Math.sin(mo.angle) * ux > 0.7) return true;
    }
    return false;
  }

  button(line) {
    this.swapTexture([line], 'CTBUT1', 'CTBUT2');
    this.w.sound(this.lineOrigin(line), 'swtchn');
  }

  // The generator powers the lights around its panel and the gate button.
  brighten(line) {
    for (const sec of [line.frontsector, line.backsector]) {
      if (sec) sec.lightlevel = Math.min(255, sec.lightlevel + 48);
    }
  }

  music() { return this.s.music || null; }

  // --- HUD ----------------------------------------------------------------------------------

  // Where the objective is (automap marker), by what's left to do.
  marker() {
    const s = this.s;
    const p = this.player();
    const mid = (special, tag) => { const l = this.lines(special, tag)[0]; return l ? this.lineMid(l) : null; };
    const item = (type) => { const m = this.things(type)[0]; return m ? { x: m.x, y: m.y } : null; };
    const has = (k) => p && p.keyItems[k];
    switch (s.stage) {
      case 1:
        if (this.ct.breakables.lines.some((l) => l.tag === 50 && this.ct.breakables.intact(l))) return mid(903, 50);
        if (!s.door1) return mid(904, 1);
        return mid(905, 130);
      case 2:
        if (s.gate) return this.centre(this.sectors(2)) || mid(904, 3);
        if (s.generator) return mid(904, 3);
        if (!has(KEY_ITEM.GAS)) return item(MT.CT_IGAS) || mid(904, 2);
        return mid(904, 2);
      case 3:
        if (!s.ladder) return mid(904, 4);
        return mid(902, LADDER_ROADBLOCK) || mid(905, 131);
      case 4:
        return mid(902, 81) || mid(905, 132);
      case 5:
        if (!s.welded) return has(KEY_ITEM.TORCH) ? mid(904, 7) : (item(MT.CT_ITOR) || mid(904, 7));
        return this.centre(this.sectors(6)) || mid(904, 8);
      case 6:
        if (!s.socket) return has(KEY_ITEM.PLUG) ? mid(904, 9) : (item(MT.CT_IPLG) || mid(904, 9));
        return mid(904, 10);
      case STAGE.HOLDOUT:
        return mid(904, 10);
      case STAGE.EXTRACT:
        return this.zoneCentre();
      default:
        return null;
    }
  }

  // Read by the HUD and the automap every frame: worked out once per tic.
  hud() {
    const w = this.w;
    if (this.hudCache && this.hudTic === w.leveltime) return this.hudCache;
    this.hudCache = this.makeHud();
    this.hudTic = w.leveltime;
    return this.hudCache;
  }

  makeHud() {
    const s = this.s;
    const w = this.w;
    const p = this.player();
    let progress = null;
    const holding = this.ct.s.holdLine >= 0 ? w.level.lines[this.ct.s.holdLine] : null;
    if (holding && holding.tag === 7 && !s.welded && p && p.keyItems[KEY_ITEM.TORCH]) progress = { label: 'WELDING', frac: s.weld / WELD_TICS };
    else if (s.welded && s.gateOpen > 0 && !s.done[5]) progress = { label: holding && holding.tag === 8 ? 'CRANKING' : 'GATE', frac: s.gateOpen };
    else if (s.weld > 0 && !s.welded && p && p.mo && this.facing(p.mo, this.lines(904, 7))) {
      // Welding let go part way: the kept progress shows, dimmed.
      progress = { label: 'WELDED', frac: s.weld / WELD_TICS, idle: true };
    }
    let countdown = null;
    if (s.stage === STAGE.HOLDOUT && s.result === 0) countdown = { label: 'RESCUE IN', tics: s.holdout };
    else if (s.extract > 0 && s.result === 0) countdown = { label: 'EXTRACTION', tics: s.extract };
    return {
      objective: this.objectiveText(),
      progress,
      countdown,
      items: p ? p.keyItems.slice() : [],
      center: s.centerTics > 0 ? { text: s.center, tics: s.centerTics, total: s.centerTotal } : null,
      marker: s.result === 0 ? this.marker() : null,
      failed: s.result === -1,
      fade: p && p.climb && p.climb.phase === 'fade' ? p.climb.t : -1,
    };
  }

  // --- Debug (window.doom.ct) --------------------------------------------------------------

  state() {
    const s = this.s;
    const p = this.player();
    return {
      stage: s.stage,
      objective: this.objectiveText(),
      done: s.done.slice(1),
      generator: s.generator, gate: s.gate, ladder: s.ladder, weld: s.weld, welded: s.welded,
      gateOpen: +s.gateOpen.toFixed(3), socket: s.socket, holdout: s.holdout, extract: s.extract,
      heli: s.heli ? { phase: s.heli.phase, node: s.heli.i, x: s.heli.mo ? Math.round(s.heli.mo.x) : null, y: s.heli.mo ? Math.round(s.heli.mo.y) : null } : null,
      result: s.result, garageSealed: s.garageSealed,
      items: p ? p.keyItems.slice() : [],
      waves: { alive: this.director.aliveCount(), spawned: s.dir.spawned, queued: s.dir.queue.reduce((n, j) => n + j.n, 0) },
      ladderOff: this.ct.s.ladderOff.slice(),
    };
  }

  // Puts the player at the start of `stage` (1-6, 7 hold-out, 8 the
  // helicopter waiting) with every earlier objective done.
  goto(stage) {
    const w = this.w;
    const s = this.s;
    const p = this.player();
    this.hudCache = null;
    stage = Math.max(1, Math.min(STAGE.EXTRACT, stage | 0));
    const br = this.ct.breakables;
    if (stage >= 2) {
      for (const l of br.lines) if (l.tag === 50 && br.intact(l)) br.break(l, null);
      s.door1 = true;
      this.setDoorOpen(1);
      s.done[1] = true;
    }
    if (stage >= 3) {
      if (p) p.keyItems[KEY_ITEM.GAS] = false;
      for (const m of this.things(MT.CT_IGAS)) w.removeMobj(m);
      if (!s.generator) {
        s.generator = true;
        this.swapTexture(this.lines(904, 3), 'CTBUT1', 'CTBUT2');
        this.startGeneratorLoop();
      }
      s.gate = 2;
      this.setDoorOpen(2);
      s.done[2] = true;
    }
    if (stage >= 4) {
      if (!s.ladder) {
        s.ladder = true;
        this.ct.enableLadder(LADDER_ROADBLOCK, true);
        this.swapTexture(this.lines(902, LADDER_ROADBLOCK), 'CTLADR3', 'CTLADR2');
      }
      this.setDoorOpen(4);
      s.done[3] = true;
    }
    if (stage >= 5) {
      this.setDoorOpen(5);
      s.done[4] = true;
    }
    if (stage >= 6) {
      if (p) p.keyItems[KEY_ITEM.TORCH] = false;
      for (const m of this.things(MT.CT_ITOR)) w.removeMobj(m);
      if (!s.welded) {
        s.welded = true;
        s.weld = WELD_TICS;
        for (const l of this.lines(904, 7)) this.swapTexture([l], 'CTPADL1', 'CTPADL2');
      }
      s.done[5] = true;
    }
    if (stage >= 7) {
      for (const l of br.lines) if (l.tag === 55 && br.intact(l)) br.break(l, null);
      if (p) p.keyItems[KEY_ITEM.PLUG] = false;
      for (const m of this.things(MT.CT_IPLG)) w.removeMobj(m);
      if (!s.socket) {
        s.socket = true;
        this.swapTexture(this.lines(904, 9), 'CTSOCK1', 'CTSOCK2');
        this.swapTexture(this.lines(904, 10), 'CTRADI1', 'CTRADI2');
      }
    }
    s.stage = Math.max(s.stage, Math.min(stage, 6));
    if (stage >= 7 && s.stage < STAGE.HOLDOUT) {
      const radio = this.lines(904, 10)[0];
      if (radio) this.callRadio(radio);
      else { s.done[6] = true; s.stage = STAGE.HOLDOUT; s.holdout = HOLDOUT_TICS; }
    }
    if (stage >= 8 && s.stage === STAGE.HOLDOUT) s.holdout = 1;
    if (stage <= 6) this.say(`OBJECTIVE: ${OBJECTIVES[stage]}`, 4 * T);
    const at = this.stageStart(stage);
    if (p && p.mo && at) this.teleport(p, at.x, at.y, at.angle);
    return this.state();
  }

  // Where each stage begins.
  stageStart(stage) {
    const w = this.w;
    const front = (line, d = 40) => {
      if (!line) return null;
      const m = this.lineMid(line);
      const len = line.length || 1;
      const nx = line.dy / len, ny = -line.dx / len; // front normal
      return { x: m.x + nx * d, y: m.y + ny * d, angle: normAngle(Math.atan2(-ny, -nx)) };
    };
    const top = (tag) => {
      const m = this.ct.ladderTop(tag);
      return m ? { x: m.x, y: m.y, angle: m.angle } : null;
    };
    switch (stage) {
      case 1: {
        const st = w.playerStart;
        return st ? { x: st.x, y: st.y, angle: ((st.angle / 45) | 0) * (Math.PI / 4) } : null;
      }
      case 2: return front(this.lines(904, 2)[0]);
      case 3: {
        const c = this.centre(this.sectors(2));
        return c ? { x: c.x, y: c.y, angle: Math.PI / 2 } : front(this.lines(904, 4)[0]);
      }
      case 4: return top(80) || front(this.lines(905, 131)[0]);
      case 5: return top(81) || front(this.lines(905, 132)[0]);
      case 6: {
        const c = this.centre(this.sectors(6));
        return c ? { x: c.x, y: c.maxy + 48, angle: Math.PI / 2 } : front(this.lines(904, 9)[0]);
      }
      default: return front(this.lines(904, 10)[0]);
    }
  }

  teleport(p, x, y, angle) {
    const w = this.w;
    const mo = p.mo;
    p.climb = null;
    teleportMove(w, mo, x, y);
    mo.z = mo.floorz;
    mo.momx = mo.momy = mo.momz = 0;
    if (angle !== undefined) mo.angle = normAngle(angle);
    mo.saveInterp();
    p.viewz = mo.z + p.viewheight;
    p.prevViewz = p.viewz;
  }
}
