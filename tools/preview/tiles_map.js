// Tiny tilemap helper for the tiles preview: mimics engine/map.js autotiling (TECH §5.1) —
// wall kinds (face_low / face_high / top), wall masks (N1 E2 S4 W8 = neighbour is wall/window),
// same-key masks (railing, pit, stage front), per-cell variants and door lintels — and draws the
// three layers (floor → faces → tops) through art drawTile, at world-pixel positions.
import { TILES, LEGEND } from '../../src/data/tiles.js';
import { hashStr } from '../../src/art/util.js';

export function buildMap(id, rows, legend = {}) {
  const L = { ...LEGEND, ...legend };
  const h = rows.length, w = rows[0].length;
  rows.forEach((r, y) => { if (r.length !== w) throw new Error(`${id}: row ${y} length ${r.length} != ${w}`); });
  const keys = rows.map((r) => [...r].map((ch) => { const k = L[ch]; if (!k) throw new Error(`${id}: char '${ch}'`); return k; }));
  const inB = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const tileAt = (x, y) => (inB(x, y) ? keys[y][x] : 'void');
  const kind = (x, y) => TILES[tileAt(x, y)].kind;
  const isWall = (x, y) => inB(x, y) && (kind(x, y) === 'wall' || kind(x, y) === 'window');
  const isOpen = (x, y) => inB(x, y) && !isWall(x, y) && tileAt(x, y) !== 'void';
  const isDoor = (x, y) => inB(x, y) && kind(x, y) === 'door';
  const wallKind = (x, y) => {
    if (!isWall(x, y)) return null;
    if (isOpen(x, y + 1)) return 'face_low';
    if (isWall(x, y + 1) && isOpen(x, y + 2)) return 'face_high';
    return 'top';
  };
  const wallMask = (x, y) => (isWall(x, y - 1) ? 1 : 0) | (isWall(x + 1, y) ? 2 : 0) | (isWall(x, y + 1) ? 4 : 0) | (isWall(x - 1, y) ? 8 : 0);
  const sameMask = (x, y) => {
    const k = tileAt(x, y);
    return (tileAt(x, y - 1) === k ? 1 : 0) | (tileAt(x + 1, y) === k ? 2 : 0) | (tileAt(x, y + 1) === k ? 4 : 0) | (tileAt(x - 1, y) === k ? 8 : 0);
  };
  const seed = hashStr(id);
  const variantAt = (x, y) => {
    let hh = Math.imul(x + 7, 374761393) ^ Math.imul(y + 13, 668265263) ^ seed;
    hh = Math.imul(hh ^ (hh >>> 13), 1274126177);
    return ((hh ^ (hh >>> 16)) >>> 0) & 0xffff;
  };
  // door lintels: cells of a vertical D run above its bottom two (single D in a vertical wall = side door)
  const lintel = new Set();
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    if (!isDoor(x, y)) continue;
    const y0 = y; while (y + 1 < h && isDoor(x, y + 1)) y++;
    const len = y - y0 + 1;
    if (len === 1 && isWall(x, y0 - 1) && isWall(x, y0 + 1)) continue;
    const top = Math.max(y0, y - 1);
    for (let yy = y0; yy < top; yy++) lintel.add(`${x},${yy}`);
  }
  return { id, w, h, tileAt, wallKind, wallMask, sameMask, variantAt, lintel, isWall };
}

/** Draw a map's layers onto ctx (already translated so world px land where wanted). */
export function renderMap(ctx, art, m, { clean = false, ox = 0, oy = 0, t = 0, waterMask = false } = {}) {
  const make = () => { const c = document.createElement('canvas'); c.width = (m.w + ox) * 16; c.height = (m.h + oy) * 16; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; };
  const [F, f] = make(), [A, a] = make(), [T, tp] = make();
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const key = m.tileAt(x, y), def = TILES[key];
    const o = { kind: undefined, mask: 0, variant: m.variantAt(x, y), clean, t: 0 };
    let c = f;
    if (def.kind === 'wall' || def.kind === 'window') { o.kind = m.wallKind(x, y); o.mask = m.wallMask(x, y); c = o.kind === 'top' ? tp : a; }
    else if (def.kind === 'door') { if (m.lintel.has(`${x},${y}`)) { o.kind = 'top'; o.mask = m.wallMask(x, y); } }
    else if (key === 'railing' || key === 'stage_front') { o.mask = m.sameMask(x, y); c = a; }
    else if (key === 'pit') o.mask = m.sameMask(x, y);
    else if ((key === 'floor_water' || key.startsWith('floor_stairs')) && waterMask) o.mask = m.sameMask(x, y) | 16; // proposed engine addition
    art.drawTile(c, key, (x + ox) * 16, (y + oy) * 16, o);
  }
  // animated pass (water) like map.drawAnimatedTiles, screen-space draw with t
  if (t) for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const key = m.tileAt(x, y);
    if (!TILES[key].animated) continue;
    art.drawTile(f, key, (x + ox) * 16, (y + oy) * 16, { kind: undefined, mask: waterMask ? m.sameMask(x, y) | 16 : 0, variant: m.variantAt(x, y), clean, t });
  }
  const src = { floor: F, faces: A, tops: T };
  return { layers: src, compose(target, actors = []) {
    target.drawImage(F, 0, 0);
    target.drawImage(A, 0, 0);
    for (const fn of actors) fn(target);
    target.drawImage(T, 0, 0);
  } };
}

// ---------------------------------------------------------------------------------------------
// mock scenes (30×17 tiles = 480×272; origin offsets put corridors on world rows 13–17 like the game)
export const SCENES = {
  corridor: {
    title: 'School corridor — classrooms north (windows), hall north wall with doors, double door south',
    oy: 3,
    rows: [
      '##############################',
      '##W###W###W####W###W###W###W##',
      '##W###W###W####W###W###W###W##',
      '#.............#..............#',
      '#.............#..............#',
      '#.....dd......#..............#',
      '#.............#..............#',
      '######D############D##########',
      '######D############D##########',
      '######D############D##########',
      ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
      ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
      ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
      ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
      ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
      '###########DD#######XXX#######',
      '###########DD#######XXX#######',
    ],
    actors: [[9, 12], [20, 13], [6, 5]],
  },
  classroom: {
    title: 'Classroom — window wall, lino with fallen ceiling, side door, south wall',
    rows: [
      '                              ',
      ' ############################ ',
      ' ##W###W###W######W###W###W## ',
      ' ##W###W###W######W###W###W## ',
      ' #..........................# ',
      ' #..........................# ',
      ' #.........ddd..............# ',
      ' #........dddd..............D ',
      ' #..........d...............# ',
      ' #..........................# ',
      ' #..........................# ',
      ' #..........................# ',
      ' ##########DD################ ',
      ' ##########DD################ ',
      ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,, ',
      ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,, ',
      ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,, ',
    ],
    actors: [[8, 8], [17, 6]],
  },
  restroom: {
    title: 'Restroom — glazed tile wainscot, ceramic floor, office carpet next door (panel walls)',
    rows: [
      '                              ',
      ' TTTTTTTTTTTTTTTTT PPPPPPPPPP ',
      ' TTTTTTTTTTTTTTTTT PPPPPPPPPP ',
      ' TTTTTTTTTTTTTTTTT PPPPPPPPPP ',
      ' T_______________T P\"\"\"\"\"\"\"\"P ',
      ' T_______________T P\"\"\"\"\"\"\"\"P ',
      ' T_______________T P\"\"\"\"\"\"\"\"P ',
      ' T_______________D D\"\"\"\"\"\"\"\"P ',
      ' T_______________T P\"\"\"\"\"\"\"\"P ',
      ' T_______________T P\"\"\"\"\"\"\"\"P ',
      ' TTTTTTDTTTTTTTTTT PPPPDPPPPP ',
      ' ######D##########PPPPPDPPPPP ',
      ' ######D##########PPPPPDPPPPP ',
      ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,, ',
      ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,, ',
      ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,, ',
      '                              ',
    ],
    actors: [[7, 6], [24, 6]],
  },
  basement: {
    title: 'Basement — concrete, standing water, coal bin (rock), grate, stairs up',
    rows: [
      '                              ',
      ' CCCCCCCCCCCCCCCCCCCCCCCCCCCC ',
      ' CCCCCCCCCCCCCCCCCCC^^^CCCCCC ',
      ' CCCCCCCCCCCCCCCCCCC^^^CCCCCC ',
      ' C:::::::::::::::::::::::::::C',
      ' C::::::~~~~:::::::::::rrr:::C',
      ' C:::::~~~~~~~::::::::::rrr::C',
      ' C:::::::~~~~~~:::::::::::::C ',
      ' C::::::::::::::::::::::::::C ',
      ' CCCCCCCCCCCDCCCC::::CCCCCCCC ',
      ' RRRRRRRRRRRDRRRR::::CCCCCCCC ',
      ' RRRRRRRRRRRDRRRR::::CCCCCCCC ',
      ' R%%%%%%%%%;;;;;R::::~~:::::C ',
      ' R%%%%%%%%%%;;;;R:::~~~~::::C ',
      ' R%%%%%%%%%%%;;;R:::::::::::C ',
      ' RRRRRRRRRRRRRRRRCCCCCCCCCCCC ',
      '                              ',
    ],
    actors: [[14, 7], [6, 13]],
  },
  gym: {
    title: 'Gym — painted block with the green-and-gold stripe, maple floor, auditorium apron',
    rows: [
      '                              ',
      ' GGGGGGGGGGGGGGGGGGGGGGGGGGGG ',
      ' GGGGGGGGGGGGGGGGGGGGGGGGGGGG ',
      ' GGGGGGGGGGGGGGGGGGGGGGGGGGGG ',
      ' G==========================G ',
      ' G==========================G ',
      ' G==========================G ',
      ' G==========================G ',
      ' G==========================G ',
      ' GGGGGGGGGGGDDGGGGG=========G ',
      ' PPPPPPPPPPPDDPPPPP=========G ',
      ' PPPPPPPPPPPDDPPPPP=========G ',
      ' P================P=========G ',
      ' P=^^FFFFFFFFFF^^=P=========G ',
      ' P\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"P=========G ',
      ' PPPPPPPPPPPPPPPPPPGGGGGGGGGG ',
      '                              ',
    ],
    actors: [[10, 7], [20, 12]],
  },
  breaker: {
    title: 'Breaker — tarred timber, plank walkways with railings over the burning pit, coal, grate, stairs',
    rows: [
      'RRRRRRRRRRRRRRRRRRRRRRRRRRRRRR',
      'RKKKKKKKKKKKKKRRRRRRRRRRRRRRRR',
      'RKKKKKKKKKKKKKRRRRRRRRRRRRRRRR',
      'RKKKKKKKKKKKKKRRRRRRRRRRRRRRRR',
      'Rppppppppppppp;;;;;;;;;;;;%%%R',
      'Rppppppppppppprrrrrrr;;;;%%%%R',
      'R|||||||||pppp|||||||;;;;;%%%R',
      'RZZZZZZZZ|ppp|ZZZZZZ|;;;;;;;;R',
      'RZZZZZZZZ|ppp|ZZZZZZ|;;vvv;;;R',
      'RZZZZZZZZ|ppp|ZZZZZZ|;;vvv;%%R',
      'RZZZZZZZZ|ppp|ZZZZZZ|;;;;;;%%R',
      'RZZZZZZZZ|ppp|ZZZZZZ|;;^^^;;;R',
      'RZZZZZZZZ|ppp|ZZZZZZ|;;^^^;;;R',
      'R;;;;;;;;;ppp;;;;;;;;;;%%;;;;R',
      'R;;;;;;;;;;;;;;;;;%%%%%;;;;;;R',
      'R;;;;;;;;;;;;;;;;;;;;;;;;;;;;R',
      'RRRRRRRRRRRRRRRRRRRRRRRRRRRRRR',
    ],
    actors: [[11, 9], [5, 14]],
  },
  exterior: {
    title: 'Exterior — brick facade with windows, front doors, granite steps, wet lot, dead lawn',
    oy: 0,
    rows: [
      '                              ',
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      'BUBBUBBUBBUBBBDDBBBUBBUBBUBBUB',
      'BUBBUBBUBBUBBBDDBBBUBBUBBUBBUB',
      'gggggggggggs^^^^sggggggggggggg',
      'gggggggggggs^^^^sggggggggggggg',
      'gggg;;gggggsssssssggggggggg;gg',
      'gggggggggggsssssssgggggg;;;ggg',
      ';;;;;;;;;;;sssssss;;;;;;;;;;;;',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ],
    actors: [[14, 7], [8, 11]],
  },
  vault: {
    title: 'Lobby / vault — marble floor & wall, collapsed stair rubble, debris, railed gallery, wood panel',
    rows: [
      '                              ',
      ' MMMMMMMMMMMMMMMMMMMMMMMMMMMM ',
      ' MMMMMMMMMMMMMMMMMMMMMMMMMMMM ',
      ' MMMMMMMMMMMMMMMMMMMMMMMMMMMM ',
      ' MmmmmmmmmmmmmmmmmmmmmmmmmmmM ',
      ' MmmmmmmmmmmmmmmmmmmmmmmmmmmM ',
      ' MmmmmmmmmmmmmmmmmmmmmmmmmmmM ',
      ' MmmmmmmmmmmmmmmmmmmmmmmmmmmM ',
      ' MMMMMMMMMMMMMMMMMMMmmmmmmmmM ',
      ' ##XXXX######WWW####mmmmmmmmM ',
      ' ##XXXX######WWW####mmmmmmmmM ',
      ' ##XXXX######WWW####mmmmmmmmM ',
      ' #ddddd,,,,,,,,,,,,#||||||||M ',
      ' #,dd,,,,,,,,,,,,,,#ZZZZZZZZM ',
      ' #,,,,,,,,,,,,,,,,,#ZZZZZZZZM ',
      ' ##################MMMMMMMMMM ',
      '                              ',
    ],
    actors: [[10, 13], [13, 6]],
  },
};
