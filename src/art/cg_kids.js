// The four friends, seated on the front steps (front view), as hand-placed pixel maps for the dawn
// CG. ~20×31 px each (Marcus taller): small, but each reads by silhouette + one accent — Tess's copper
// hair and light denim, Danny's backwards red cap and midnight-green jacket, Leah's black bob, round
// glasses and cherry-red Docs, Marcus's height, beanie, olive field jacket and headphones.
import { PAL, mix, U, Buf, mixU } from './cg_kit.js';
import { CAST } from './cg_cast.js';

const OUT = U('#0d0a0e');           // outline: the same warm near-black the sprites and props use
const pick = (r, i) => r[Math.min(r.length - 1, i)];

// ---- maps ('.' = empty, 'o' = outline) --------------------------------------------------------
const TESS = [
  '.......oooooo.......',
  '.....ooHHHHhhoo.....',
  '....oHHHHhhhhhko....',
  '...oHHhhhhhhhhhko...',
  '...oHhhHhhhhkhhhko..',
  '..okhhhhhhhhhhhhhko.',
  '..okhhSSSSSSSdhhhko.',
  '..okhSSeSSSSeSdhhko.',
  '..okhSSSSSSSSSdhhko.',
  '..okhSfSSSSSfSdhhko.',
  '..okhhSSSSmSSddhhko.',
  '..okhhhdSSSSddhhhko.',
  '..okkhhoddddohhhko..',
  '.okkhhqoJttJoqhhko..',
  '.oqJJJJJJttJJJJnJqo.',
  'oqJJJjjJJttJJjnJJJqo',
  'oJJjjjjJJttJnjjjjJqo',
  'oJjjjjjjJttnjjjjjjqo',
  'oJjjjjjjjtnjjjjjjjqo',
  'oJjjjoSSSSSSSSojjjqo',
  'oqjjoSSSSSSSSSSojjqo',
  '.oqqoddddddddddoqqo.',
  '..ooppbppoopppbpoo..',
  '...oppbppoopppbppo..',
  '...opppbpoopppbppo..',
  '...opppbpoopppbppo..',
  '...opppbpoopppbppo..',
  '..oxxxxxxooxxxxxxo..',
  '..oxwxxxxooxxxxwxo..',
  '..owwwwwwoowwwwwwo..',
  '...oooooo..oooooo...',
];
const DANNY = [
  '......ooooooo.......',
  '.....oCCCcccco......',
  '....oCCcccccccro....',
  '...oCcccccccccrro...',
  '...occcoohhoocccro..',
  '...orrrrrrrrrrrrro..',
  '..osoSSSSSSSSSSsdso.',
  '..osSSeSSSSSSeSSdso.',
  '...oSSSSSSSSSSSSdo..',
  '...oSSSSSsdSSSSSdo..',
  '...oSSmwwwwwmSSddo..',
  '...odSSmmmmmSSddo...',
  '....oddSSSSSddoo....',
  '..ooqgWWWddWWWgqoo..',
  '.oqgGGgggWWgggGGgqo.',
  'oqgGGggggWWggggGGgqo',
  'oqGWWWWWWWWWWWWWWGqo',
  'oqGggggggWWggggggGqo',
  'oqgggggggWWgggggggqo',
  'oqgggoSSSSSSSSogggqo',
  'oqWWoSSSSSSSSSSoWWqo',
  '.oqqoddddddddddoqqo.',
  '..ooPPpPPooPPpPPoo..',
  '..oPPPpPPooPPPpPPo..',
  '..oPwwpPPooPPpwwPo..',
  '..oPPPpPPooPPPpPPo..',
  '..oPPPpbPooPPbpPPo..',
  '.owwwwwwwoowwwwwwwo.',
  '.owxwwwwwoowwwwwxwo.',
  '.oxxxxxxxooxxxxxxxo.',
  '..ooooooo..ooooooo..',
];
const LEAH = [
  '......oooooooo......',
  '....ookKKkkkkkoo....',
  '...okKLKkkkkkkkko...',
  '..okKLKkkkkkkkkkko..',
  '..okKKkkkkkkkkkkko..',
  '..okkkkkkkkkkkkkko..',
  '..okkSggSSSSggSkko..',
  '..okkgeSggggeSgkko..',
  '..okkSggSSSSggSdko..',
  '..okkSSSSSSSSSdkko..',
  '..okkSSSSmmSSddkko..',
  '..okkkdSSSSSSddkkko.',
  '..okkkkoddddokkkkko.',
  '..ooaAAAAttAAAAaoo..',
  '.oaABBAAAttAAABBAao.',
  'oaABBAAAAttAAAABBAao',
  'oaABAAAAAttAAAAABAao',
  'oaAAAAAAAttAAAAAAAao',
  'oaAAAAoccccccoAAAAao',
  'oaAAABocccucccoBAAao',
  'oaABBBoccccccoBBBAao',
  '.oaaayyYRYYRYyyaaao.',
  '..oyYRYYYRYYYRYYYo..',
  '...onnNnnoonnNnno...',
  '...onnNnnoonnNnno...',
  '...onnNnnoonnNnno...',
  '...onnNnnoonnNnno...',
  '..oDDEEDDooDDEEDDo..',
  '..oDFEEEDooDEEFEDo..',
  '..oxzxxxxooxxxxzxo..',
  '...oooooo..oooooo...',
];
const MARCUS = [
  '......oooooooo......',
  '.....obBBBBbbbo.....',
  '....obBBBBBbbbbo....',
  '....obBVBBBBbbbo....',
  '...obVVVVVVVVVVbo...',
  '...obbbbbbbbbbbbo...',
  '...osSSSSSSSSSSdo...',
  '..osSSeSSSSSeSSddso.',
  '...oSSSSSSSSSSSddo..',
  '...oSSSSSdSSSSSddo..',
  '...osSSSmmmmSSSddo..',
  '....odSSSSSSSSddo...',
  '.....oddddddddo.....',
  '...ohhHHhddhHHhho...',
  '..oaAhhhhhhhhhhAao..',
  '.oaAOOAAAttAAAOOAao.',
  'oaAOOAAAAttAAAAOOAao',
  'oaAOAAAAAttAAAAAOAao',
  'oaAAaaaAAttAAaaaAAao',
  'oaAAAAAAAttAAAAAAAao',
  'oaAAAAAAAttAAAAAAAao',
  'oaAAAoSSSSSSSSoAAAao',
  'oaaaoSSSSSSSSSSoaaao',
  '.oaaoddddddddddoaao.',
  '..oojjJjjoojjJjjoo..',
  '...ojjJjjoojjJjjo...',
  '...ojjJjjoojjJjjo...',
  '...ojjJjjoojjJjjo...',
  '...ojjJjjoojjJjjo...',
  '...ojjJjjoojjJjjo...',
  '...ouuUuuoouuUuuo...',
  '..ouuUUuuoouuUUuuo..',
  '..oxxxxxxooxxxxxxo..',
  '...oooooo..oooooo...',
];

// ---- legends: char → packed color -------------------------------------------------------------
const c = (ramp, i) => pick(ramp, i);
const COMMON = { o: OUT };
const LEGEND = {
  tess: {
    k: c(CAST.tessHair, 0), h: c(CAST.tessHair, 2), H: c(CAST.tessHair, 3),
    S: c(CAST.skin, 3), s: c(CAST.skin, 2), d: c(CAST.skin, 1), e: U(mix(PAL.green_d, PAL.ink, 0.4)), f: U(PAL.freckle), m: c(CAST.skin, 0),
    q: c(CAST.denim, 1), j: c(CAST.denim, 2), J: c(CAST.denim, 3), t: c(CAST.black, 1), n: c(CAST.canvas, 2),
    p: c(CAST.black, 2), b: c(CAST.black, 1), x: c(CAST.black, 1), w: U(PAL.g6),
  },
  danny: {
    r: c(CAST.cap, 1), c: c(CAST.cap, 2), C: c(CAST.cap, 3), h: c(CAST.dannyHair, 2),
    S: c(CAST.skin, 3), s: c(CAST.skin, 2), d: c(CAST.skin, 1), e: U(PAL.hair_b), m: c(CAST.skin, 0), w: U(PAL.white),
    q: c(CAST.eagles, 1), g: c(CAST.eagles, 2), G: c(CAST.eagles, 3), W: c(CAST.silver, 3),
    P: c(CAST.jeans, 2), p: c(CAST.jeans, 1), b: c(CAST.jeans, 0), x: U(PAL.g4),
  },
  leah: {
    k: c(CAST.leahHair, 1), K: c(CAST.leahHair, 2), L: c(CAST.leahHair, 3),
    S: c(CAST.skin, 3), s: c(CAST.skin, 2), d: c(CAST.skin, 1), e: U(PAL.hair_k), m: c(CAST.skin, 0), g: U(PAL.g5),
    a: c(CAST.cardigan, 1), A: c(CAST.cardigan, 2), B: c(CAST.cardigan, 3), t: c(CAST.black, 1),
    c: c(CAST.black, 1), u: U(PAL.exit_red),
    y: c(CAST.plaid, 1), Y: c(CAST.plaid, 2), R: c(CAST.plaidLine, 2),
    n: c(CAST.black, 1), N: c(CAST.black, 3), D: c(CAST.docs, 1), E: c(CAST.docs, 2), F: c(CAST.docs, 3), x: c(CAST.black, 0), z: U(PAL.yellow),
  },
  marcus: {
    b: c(CAST.beanie, 1), B: c(CAST.beanie, 2), V: c(CAST.beanie, 3),
    S: c(CAST.dskin, 3), s: c(CAST.dskin, 2), d: c(CAST.dskin, 1), e: U(PAL.dskin_dd), m: c(CAST.dskin, 0),
    h: c(CAST.black, 2), H: U(PAL.g5),
    a: c(CAST.olive, 1), A: c(CAST.olive, 2), O: c(CAST.olive, 3), t: c(CAST.black, 2),
    j: c(CAST.navy, 1), J: c(CAST.navy, 2), u: c(CAST.work, 2), U: c(CAST.work, 3), x: c(CAST.work, 0),
  },
};
export const KID_MAPS = { tess: TESS, danny: DANNY, leah: LEAH, marcus: MARCUS };

/**
 * Render one kid to a Buf. opts.tint: packed color mixed into every non-outline pixel (scene light);
 * opts.rim: packed color for the light-facing (left) edge pixels.
 */
export function renderKid(id, { tint = 0, tintK = 0, rim = 0 } = {}) {
  const map = KID_MAPS[id], leg = { ...COMMON, ...LEGEND[id] };
  const w = Math.max(...map.map((r) => r.length)), h = map.length;
  const b = new Buf(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < map[y].length; x++) {
    const ch = map[y][x];
    if (ch === '.') continue;
    let col = leg[ch];
    if (col === undefined) col = U('#ff00ff');           // unmapped: loud on purpose
    if (ch !== 'o' && tint) col = mixU(col, tint, tintK);
    b.px(x, y, col);
  }
  if (rim) {
    // the first lit pixel inside the outline on each row's left side catches the dawn
    for (let y = 1; y < h; y++) {
      const row = map[y];
      const i = row.indexOf('o');
      if (i >= 0 && row[i + 1] && row[i + 1] !== '.' && row[i + 1] !== 'o') b.px(i + 1, y, mixU(b.get(i + 1, y), rim, 0.45));
    }
  }
  return b;
}
