"""Hand-drawn material maps for every LaptopCraft food & drink icon (16x16).

Legend per sprite: '.' = transparent; other chars map to a Mat (auto-shaded) or Px (exact decal).
"""
from pixel import Mat, Px

# ---- shared material ramps (highlight, base, shadow, outline) -----------------------------------
CHEESE = Mat('#ffe27a', '#f7c843', '#e09a2b', '#9a5a16')
CRUST = Mat('#eab46a', '#c98a3c', '#9c6328', '#5e3a17')
BUN = Mat('#f4c06e', '#d99040', '#b06a28', '#6b3c16')
LETTUCE = Mat('#a6e05e', '#5fb03a', '#3d8a2a', '#1f5218')
PATTY = Mat('#93593a', '#6b3a1f', '#4e2814', '#2e160a')
TOMATO = Mat('#f26a52', '#d63a2c', '#a52a1f', '#5e140e')
CARTON = Mat('#f0604a', '#d33328', '#a3241c', '#5a100c')
WHITE = Mat('#ffffff', '#f1ece0', '#cfc6b2', '#7e7564')
FRY = Mat('#ffe68a', '#f5c542', '#d9a028', '#8c5e12')
SAUSAGE = Mat('#e0704e', '#b8432c', '#8a2c1c', '#4e1408')
SHELL = Mat('#ffe08a', '#f2c14e', '#d49a2e', '#8a5a14')
TORTILLA = Mat('#f8e2b0', '#e8c888', '#c9a062', '#7a5a2c')
FOIL = Mat('#ffffff', '#d4dbe3', '#9aa6b4', '#4e5866')
NORI_TOP = Mat('#5a8a4c', '#40663a', '#2f4a2a', '#132013')
NORI = Mat('#3e6234', '#263d24', '#18281a', '#0b140b')
RICE = Mat('#ffffff', '#f4f1e8', '#d6d0c0', '#7e7868')
SALMON = Mat('#ffb07a', '#f2804a', '#d0602e', '#7a3010')
WOOD_BOWL = Mat('#a87444', '#845530', '#5e3a1e', '#33200e')
LACQUER = Mat('#ec6a52', '#c0392b', '#8e2a20', '#4a120c')
BROTH = Mat('#f6cf8e', '#e3ac62', '#c58a44', '#6e4a1c')
DOUGH = Mat('#fff6e2', '#f1e0bd', '#d6bf94', '#86704a')
FRIED = Mat('#f2b552', '#cf7f2c', '#9e5a1c', '#5a300c')
GLAZE = Mat('#f78a3a', '#d8481c', '#9a2a10', '#4e140a')
PANCAKE = Mat('#f8cf82', '#e2a654', '#b87a34', '#6a4214')
SYRUP = Mat('#d58232', '#a45518', '#743a0c', '#3a1a04')
DONUT = Mat('#f2c47c', '#d9a05a', '#b07a3a', '#674216')
FROSTING = Mat('#ffd0e4', '#ff8fbd', '#e0629c', '#86284f')
WRAPPER = Mat('#9ad8f2', '#54acd9', '#3482b2', '#173f63')
CONE = Mat('#f4cc8c', '#dca660', '#b67e3e', '#694418')
SCOOP = Mat('#ffe0ec', '#ffb3cf', '#ee86ad', '#8a3458')
GLASS = Mat('#ffffff', '#e4f2f8', '#b6d2e0', '#4c6b7c')
SHAKE = Mat('#ffd8e6', '#f7a7c4', '#dc7ca0', '#7e3254')
CREAM = Mat('#ffffff', '#f7f3ea', '#ddd4c2', '#7e7462')
CAN_RED = Mat('#ff7062', '#da2a2c', '#a3161a', '#4e080a')
SILVER = Mat('#ffffff', '#c9d1d9', '#8b97a5', '#3c4450')
COFFEE = Mat('#b5824e', '#8a5730', '#64391c', '#2e1a0a')
PLASTIC = Mat('#ffffff', '#e8eef2', '#c2ccd4', '#56626c')
DARK_CAN = Mat('#55556a', '#30303c', '#1e1e26', '#07070a')
LATTICE = Mat('#f2c066', '#d68f2e', '#a8661a', '#5e3510')
GOLD_FILL = Mat('#fff6b0', '#ffd84a', '#e5a71e', '#7a5208')
TIN = Mat('#f2f4f6', '#b7c0ca', '#848f9c', '#3a424c')
COOKIE = Mat('#edbb7c', '#d7975a', '#b2733c', '#5e3814')
BERRY_SMOOTHIE = Mat('#ff7a98', '#d23a5a', '#9a1e3a', '#4e0c1c')
JAR = Mat('#ffffff', '#d6e8ef', '#a2c0ce', '#46677a')
BERRY = Mat('#ff6a6a', '#c8202e', '#8e1222', '#480810')
LEAF = Mat('#8edc5a', '#4ea83a', '#2f7a28', '#164418')
BONE = Mat('#ffffff', '#efe8d6', '#cfc4a8', '#77694a')
CHORUS_DOUGH = Mat('#f0c48e', '#d9a066', '#b47a42', '#5e3814')
STRAW_R = Px('#e8343a')
STRAW_W = Px('#ffffff')

SPRITES: dict[str, tuple[list[str], dict]] = {}


def sprite(name, grid, palette):
	SPRITES[name] = (grid, palette)


# ---- Pigstep Pizza ------------------------------------------------------------------------------
sprite('pizza_slice', [
	'................',
	'................',
	'.......CC.......',
	'......YCCC......',
	'......YYCCC.....',
	'.....YRRYCCC....',
	'.....RpRRYCCC...',
	'....YRRRYYYCC...',
	'....YYRYYRRYCC..',
	'...YYYYYRpRRCC..',
	'...YYgYYRRRYY...',
	'..YYYgYYYRYY....',
	'..YRRYYYYY......',
	'.YRpRRYY........',
	'.YRRRY..........',
	'................',
], {'Y': CHEESE, 'C': CRUST, 'R': Px('#c0392b'), 'p': Px('#e8604a'), 'g': Px('#4ea83a')})

sprite('pepperoni_pizza', [
	'................',
	'.....CCCCCC.....',
	'....CCCCCCCC....',
	'...CCYYYYRRYC...',
	'..CCYYYYRpRRCC..',
	'.CCYRRYYRRRrYCC.',
	'.CYRpRRYYrYYgYC.',
	'.CYRRRrYYgYYYYC.',
	'.CYYRrYYYgYRRYC.',
	'.CYYYYYYYRpRRYC.',
	'.CYYYRRYYRRRrYC.',
	'..CYRpRRYYRrYC..',
	'...CRRRrYYYYC...',
	'....CCRrYYCC....',
	'.....CCCCCC.....',
	'................',
], {'Y': CHEESE, 'C': CRUST, 'R': Px('#c0392b'), 'p': Px('#e8604a'), 'r': Px('#8e2219'), 'g': Px('#4ea83a')})

sprite('spaghetti', [
	'................',
	'................',
	'.......g........',
	'......gRRs......',
	'....sSRRRRSs....',
	'...SdRMmRRRdS...',
	'..sSRRmmRMmRSd..',
	'..SdsRRRRmmRdS..',
	'.WsSdsSRRSsdSsW.',
	'.WWdSsdSdsSdSWW.',
	'.WWWWWWWWWWWWWW.',
	'..WWWWWWWWWWWW..',
	'...WWWWWWWWWW...',
	'....WWWWWWWW....',
	'................',
	'................',
], {'S': Px('#f2d27a', '#7a5a14'), 's': Px('#ffeaa8', '#7a5a14'), 'd': Px('#d2a84a', '#7a5a14'), 'R': Px('#d23f2a', '#5e140e'),
	'M': Px('#a8603a', '#3e1a0a'), 'm': Px('#7a3a1e', '#3e1a0a'), 'g': Px('#5fb03a', '#164418'), 'W': WOOD_BOWL})

# ---- The Nether Grill ---------------------------------------------------------------------------
sprite('cheeseburger', [
	'................',
	'................',
	'.....BBBBBB.....',
	'...BBBBBsBBBB...',
	'..BBsBBBBBBsBB..',
	'.BBBBBBsBBBBBBB.',
	'.BBsBBBBBBBsBBB.',
	'.dddddddddddddd.',
	'.LLLLLLLLLLLLLL.',
	'.YYYYYYYYYYYYYY.',
	'.PYYPPPPPYYPPPP.',
	'.PPYPPPPPPYPPPP.',
	'.PPPPPPPPPPPPPP.',
	'.BBBBBBBBBBBBBB.',
	'..BBBBBBBBBBBB..',
	'................',
], {'B': BUN, 's': Px('#fff4d0'), 'd': Px('#8a4e1c'), 'L': LETTUCE, 'Y': CHEESE, 'P': PATTY})

sprite('fries', [
	'................',
	'......h...h.....',
	'....h.F.h.F.....',
	'....F.FhF.Fhh...',
	'...hFfFFfhFFF...',
	'...FFfFFfFFfF...',
	'...FFfFFfFFfFF..',
	'..RRRRFFfFFRRRR.',
	'..RRRRRRRRRRRRR.',
	'..RRRRRYRYRRRRR.',
	'...RRRRYYYRRRR..',
	'...RRRRRYRRRRR..',
	'...RRRRRRRRRRR..',
	'....RRRRRRRRR...',
	'....RRRRRRRRR...',
	'................',
], {'F': Px('#f5c542', '#8c5e12'), 'f': Px('#d9a028', '#8c5e12'), 'h': Px('#ffe68a', '#8c5e12'), 'R': CARTON, 'Y': Px('#ffd23f')})

sprite('hot_dog', [
	'................',
	'................',
	'................',
	'...........SS...',
	'........BBSSS...',
	'.......BBSmSB...',
	'......BBSmSBB...',
	'.....BBSmSBB....',
	'....BBSmSBBB....',
	'...BBSmSBBB.....',
	'...BSmSBBB......',
	'...SmSBBB.......',
	'..SSSBBB........',
	'..SSBB..........',
	'................',
	'................',
], {'S': SAUSAGE, 'm': Px('#ffd23f'), 'B': BUN})

sprite('blaze_hot_wings', [
	'................',
	'............f...',
	'.....GGGG..fyf..',
	'...GGsGGGG.fyyf.',
	'..GGsGGGGGG.ff..',
	'..GsGGGGeGGG....',
	'.GGGGGGGGGGG....',
	'.GGGeGGGGGGG....',
	'.GGGGGGGGeGG....',
	'..GGGGGGGGGG....',
	'...GGGGGGGGG....',
	'....GGeGGGGo....',
	'......GGGGoOo...',
	'.........oOOOo..',
	'..........oOo...',
	'................',
], {'G': GLAZE, 's': Px('#ffe0a0'), 'b': Px('#ffffff'), 'o': BONE, 'O': BONE, 'f': Px('#ffa020', '#a04008'), 'y': Px('#ffe85a', '#a04008'), 'e': Px('#fff1c8')})

sprite('fried_chicken_bucket', [
	'................',
	'........oo......',
	'........oO......',
	'...FF...FF.FF...',
	'..FFFFFFFFFFFF..',
	'.FFFFFFFFFFFFFF.',
	'.FFFFFFFFFFFFFF.',
	'.eeeeeeeeeeeeee.',
	'..RRWWRRWWRRWW..',
	'..RRWWRRWWRRWW..',
	'..RRWWRRWWRRWW..',
	'..RRWWRRWWRRWW..',
	'...RWWRRWWRRW...',
	'...RWWRRWWRRW...',
	'...rrrrrrrrrr...',
	'................',
], {'F': FRIED, 'o': BONE, 'O': BONE, 'e': Mat('#ffffff', '#eceae4', '#c9c4b8', '#6e6a60'),
	'R': Px('#d33328', '#5a100c'), 'W': Px('#f4f1ea', '#6e6a60'), 'r': Px('#8e1e16', '#4a0c08')})

# ---- Taco Blaze ---------------------------------------------------------------------------------
sprite('taco', [
	'................',
	'................',
	'................',
	'.....LL..L.LL...',
	'...LLLtLLLcLLL..',
	'..LtMMtMcMMtML..',
	'.SSSSSSSSSSSSSS.',
	'.SSSSSSoSSSSSSS.',
	'.SSoSSSSSSSSoSS.',
	'..SSSSSoSSSSSS..',
	'..SSSoSSSSSoSS..',
	'...SSSSSSSSSS...',
	'....SSSoSSSS....',
	'.....SSSSSS.....',
	'................',
	'................',
], {'L': LETTUCE, 't': Px('#e0402e'), 'c': Px('#ffd23f'), 'M': Px('#7a4022'), 'S': SHELL, 'o': Px('#cf8a2a')})

sprite('burrito', [
	'................',
	'................',
	'..........TTT...',
	'.........TrgbT..',
	'........TbrtrgT.',
	'.......TTgrbrrT.',
	'......TTTTrgbT..',
	'.....FFTTTTTT...',
	'....FfFFTTTT....',
	'...FFFFfFTT.....',
	'..FfFFFFFF......',
	'..FFFfFFF.......',
	'..FFFFFf........',
	'...FFFF.........',
	'................',
	'................',
], {'T': TORTILLA, 'r': Px('#fbf6ea'), 'g': Px('#5fb03a'), 'b': Px('#6b3a1f'), 't': Px('#d63a2c'), 'F': FOIL, 'f': Px('#ffffff')})

sprite('nachos', [
	'................',
	'................',
	'................',
	'......C....C....',
	'.....CCC..CCc...',
	'...C.CCYcCCCc.C.',
	'..CCcYYYYCYYcCC.',
	'..CYYYYrYYYYYCC.',
	'.CCYgYYYYYrYYYC.',
	'.WRWRWRWRWRWRWR.',
	'.WRWRWRWRWRWRWR.',
	'..WRWRWRWRWRWR..',
	'..WRWRWRWRWRWR..',
	'...rrrrrrrrrr...',
	'................',
	'................',
], {'C': Mat('#ffd47a', '#eaa63e', '#c27a22', '#6a3c0a'), 'c': Px('#c27a22'), 'Y': Px('#ffd83a', '#8a5a08'),
	'r': Px('#d63a2c', '#5a100c'), 'g': Px('#5fb03a'), 'W': Px('#f4f1ea', '#6e6a60'), 'R': Px('#d33328', '#5a100c')})

# ---- Sushi Sea ----------------------------------------------------------------------------------
sprite('sushi_roll', [
	'................',
	'................',
	'.....NNNNNN.....',
	'...NNRRRRRRNN...',
	'..NRRRSSgRRRRN..',
	'..NRRSSSggRRRN..',
	'..KNRRRgSSRRNK..',
	'..KKNNRRRRNNKK..',
	'..KKKKNNNNKKKK..',
	'..KKKKKKKKKKKK..',
	'..KKKKKKKKKKKK..',
	'..KKKKKKKKKKKK..',
	'...KKKKKKKKKK...',
	'.....KKKKKK.....',
	'................',
	'................',
], {'N': NORI_TOP, 'R': RICE, 'S': Px('#f2804a'), 'g': Px('#7cc242'), 'K': NORI})

sprite('salmon_nigiri', [
	'................',
	'................',
	'................',
	'................',
	'.....SSSSSS.....',
	'...SSSsSSSsSS...',
	'..SSsSSSsSSSsS..',
	'.SSsSSSsSSSsSSS.',
	'.SsSSSsSSSsSSSS.',
	'.SSSSSSSSSSSSSS.',
	'..RRRRRRRRRRRR..',
	'..RRRRRRRRRRRR..',
	'..RRRRRRRRRRRR..',
	'...RRRRRRRRRR...',
	'................',
	'................',
], {'S': SALMON, 's': Px('#ffd2b4'), 'R': RICE})

# ---- Ramen Ravine -------------------------------------------------------------------------------
sprite('ramen_bowl', [
	'................',
	'.............t..',
	'............t.T.',
	'...........t.T..',
	'..........t.T...',
	'.........t.T....',
	'...LLLLLtLTLL...',
	'.LLeeBnnWWnnBLL.',
	'.LBeYeBnWkWgnBL.',
	'.LLLLLLLLLLLLLL.',
	'.LLLLLLLLLLLLLL.',
	'..cccccccccccc..',
	'...LLLLLLLLLL...',
	'....LLLLLLLL....',
	'.....ffffff.....',
	'................',
], {'t': Px('#e3b27a', '#6e4a22'), 'T': Px('#b98450', '#5a3a14'), 'L': LACQUER, 'e': Px('#ffffff', '#7e7564'),
	'Y': Px('#f8a51e'), 'B': BROTH, 'n': Px('#fbe7a4'), 'W': Px('#fdfaf2'), 'k': Px('#f06a9a'), 'g': Px('#6cc04a'),
	'c': Px('#f6e2c0', '#4a120c'), 'f': Px('#6a1a12', '#2e0a06')})

sprite('dumplings', [
	'................',
	'................',
	'................',
	'................',
	'........eEeEe...',
	'.......EEEEEEE..',
	'......EEEEEEEEE.',
	'...dDdDdDEEEEEE.',
	'..DDDDDDDDEEEEE.',
	'.DDDDDDDDDDbbbb.',
	'.DDDDDDDDDD.....',
	'.DDDDDDDDDD.....',
	'..bbbbbbbbb.....',
	'................',
	'................',
	'................',
], {'D': DOUGH, 'E': Mat('#f6ebd2', '#e2cda4', '#c4a97c', '#86704a'), 'd': Px('#c9ad80'), 'e': Px('#b89c70', '#86704a'),
	'b': Px('#c98a4a', '#6a4418')})

# ---- Sweet Berry Bakery -------------------------------------------------------------------------
sprite('pancakes', [
	'................',
	'................',
	'................',
	'......yy........',
	'....SSyySSSS....',
	'..SSSSSSSSSSSS..',
	'.PSSPPPPPPPSSPP.',
	'.pSpppppppppSpp.',
	'.PSPPPPPPPPPSPP.',
	'.pppppppppppSpp.',
	'.PPPPPPPPPPPPPP.',
	'.pppppppppppppp.',
	'.WWWWWWWWWWWWWW.',
	'..WWWWWWWWWWWW..',
	'................',
	'................',
], {'y': Px('#fff2a0', '#a08a20'), 'S': SYRUP, 'P': PANCAKE, 'p': Px('#b87a34', '#6a4214'), 'W': WHITE})

sprite('croissant', [
	'................',
	'................',
	'................',
	'................',
	'......AAAA......',
	'....BBAAAABB....',
	'...BBBAAAABBB...',
	'..CBBBAAAABBBC..',
	'.CCBBBAAAABBBCC.',
	'.CCBBBAAAABBBCC.',
	'.CCBBBAAAABBBCC.',
	'.CC.BBB..BBB.CC.',
	'.CC..........CC.',
	'..C..........C..',
	'................',
	'................',
], {'A': Mat('#ffd98a', '#e9a84a', '#bf7a2a', '#5e3510'), 'B': Mat('#f6c46c', '#dc9a3e', '#b06c22', '#5e3510'),
	'C': Mat('#e8b05a', '#c98432', '#a0601c', '#5e3510')})

sprite('donut', [
	'................',
	'.....DDDDDD.....',
	'....DFFFFFFD....',
	'...DFFaFFFbFD...',
	'..DFFFFFFFFFFD..',
	'.DFcFFF..FFFaFD.',
	'.DFFFF....FFFFD.',
	'.DFFbF....FcFFD.',
	'.DFFFF....FFFFD.',
	'.DFaFFF..FFFFFD.',
	'.DDFFFFFFbFFFDD.',
	'..DDFcFFFFFaDD..',
	'...DDFFFFFFDD...',
	'....DDDDDDDD....',
	'.....DDDDDD.....',
	'................',
], {'D': DONUT, 'F': FROSTING, 'a': Px('#ffffff'), 'b': Px('#4fc3f7'), 'c': Px('#ffd23f')})

sprite('cupcake', [
	'................',
	'.......bb.......',
	'.......Bbl......',
	'.....FFBFl......',
	'....FFFFFFF.....',
	'...FFFFFFFFF....',
	'...FFFFFFFFFF...',
	'..FFFFFFFFFFFF..',
	'..FFFFFFFFFFFF..',
	'..WwWWwWWwWWwW..',
	'...WwWWwWWwWW...',
	'...WwWWwWWwWW...',
	'...WwWWwWWwWW...',
	'....WwWWwWWw....',
	'................',
	'................',
], {'b': Px('#ff7070', '#480810'), 'B': Px('#c8202e', '#480810'), 'l': Px('#4ea83a', '#164418'), 'F': FROSTING,
	'W': WRAPPER, 'w': Px('#2f74a2', '#173f63')})

sprite('ice_cream_cone', [
	'................',
	'.....SSSSS......',
	'....SSSSSSSS....',
	'...SSSSSSSSSS...',
	'...SSSSSSSSSS...',
	'...SSSSSSSSSSS..',
	'..SSSSSSSSSSSS..',
	'..SSdSSSSSSdSS..',
	'...CCSSCCSCCC...',
	'....CxCCxCCx....',
	'....CCxCCxCC....',
	'.....CCxCCx.....',
	'.....xCCxCC.....',
	'......CxCC......',
	'.......CC.......',
	'................',
], {'S': SCOOP, 'd': Px('#ee86ad', '#8a3458'), 'C': CONE, 'x': Px('#a46e30', '#694418')})

sprite('golden_apple_pie', [
	'................',
	'................',
	'................',
	'.....KKKKKK.....',
	'...KKGLGLGLKK...',
	'..KLLLLLLLLLLK..',
	'.KGLGLGsGLGLGLK.',
	'.KLLLLLLLLLLLLK.',
	'.KGLsLGLGLGLGLK.',
	'..KLLLLLLLLLLK..',
	'..kKKKKKKKKKKk..',
	'..TTTTTTTTTTTT..',
	'...TTTTTTTTTT...',
	'................',
	'................',
	'................',
], {'T': TIN, 'K': Mat('#f6c46c', '#d99a3e', '#b07224', '#5e3510'), 'k': Px('#b07224', '#5e3510'), 'L': LATTICE,
	'G': Px('#fff07a'), 's': Px('#ffffff')})

sprite('chorus_cookie', [
	'................',
	'................',
	'.....KKKKKK.....',
	'....KKKKKKKK....',
	'...KKpKKKKKKK...',
	'..KKKPPKKKpKKK..',
	'..KKKKKKKKPPKK..',
	'..KpKKKKKKKKKK..',
	'..KPPKKKpKKKKK..',
	'..KKKKKKPPKKpK..',
	'..KKKpKKKKKKPK..',
	'...KKPKKKKKKK...',
	'....KKKKKKKK....',
	'.....KKKKKK.....',
	'................',
	'................',
], {'K': CHORUS_DOUGH, 'p': Px('#c48ae0'), 'P': Px('#7a3aa0')})

# ---- Drinks -------------------------------------------------------------------------------------
sprite('milkshake', [
	'...........r....',
	'......cc..W.....',
	'.....cCCc.r.....',
	'....CCCCCCW.....',
	'...CCCCCCCrCC...',
	'....GSSSSSWSG...',
	'....GSSSSSSSG...',
	'.....GSSSSSG....',
	'.....GSSSSSG....',
	'......GSSSG.....',
	'.......GSG......',
	'.......GGG......',
	'.......GGG......',
	'.....GGGGGGG....',
	'.....GGGGGGG....',
	'................',
], {'c': Px('#ff4a5a', '#5a0c14'), 'C': CREAM, 'r': STRAW_R, 'W': STRAW_W, 'G': GLASS, 'S': SHAKE})

sprite('cola_can', [
	'................',
	'.....SSSSSS.....',
	'....SSSSSSSS....',
	'....RRRRRRRR....',
	'....RRRRRRRR....',
	'....RRRRRRRR....',
	'....RwRRRRRR....',
	'....wwwRRRRw....',
	'....RRwwwwwR....',
	'....RRRRRRRR....',
	'....RRRRRRRR....',
	'....RRRRRRRR....',
	'....RRRRRRRR....',
	'....SSSSSSSS....',
	'.....SSSSSS.....',
	'................',
], {'S': SILVER, 'R': CAN_RED, 'w': Px('#ffffff')})

sprite('iced_coffee', [
	'.........gg.....',
	'..........g.....',
	'.....PPPPPgP....',
	'....PPPPPPgPP...',
	'...PPPPPPPPPPP..',
	'...GGGGGGGGGGG..',
	'...GwwwwwwwwwG..',
	'....GwwCwwCwG...',
	'....GCiiCCCCG...',
	'....GCiiCCiiG...',
	'....GCCCCCiiG...',
	'.....GCCCCCG....',
	'.....GCCCCCG....',
	'.....GGGGGGG....',
	'................',
	'................',
], {'g': Px('#3fa04a', '#164418'), 'P': PLASTIC, 'G': GLASS, 'C': COFFEE, 'i': Px('#d8eef8'), 'w': Px('#e9d2b0')})

sprite('redstone_rush_energy_drink', [
	'................',
	'.....SSSSSS.....',
	'.....SSSSSS.....',
	'.....RRRRRR.....',
	'.....DDDDDD.....',
	'.....DDDrDD.....',
	'.....DDrrDD.....',
	'.....DrrDDD.....',
	'.....DrrrrD.....',
	'.....DDDrrD.....',
	'.....DDrrDD.....',
	'.....DDrDDD.....',
	'.....DDDDDD.....',
	'.....RRRRRR.....',
	'.....SSSSSS.....',
	'................',
], {'S': SILVER, 'R': Mat('#ff5a4a', '#d0201c', '#9a1210', '#4a0606'), 'D': DARK_CAN, 'r': Px('#ff3a2a')})

sprite('sweet_berry_smoothie', [
	'..........r.....',
	'......BB..W.....',
	'.....BbBL.r.....',
	'.....BBLL.W.....',
	'....JJJJJJrJ....',
	'....JMMMMMWJ....',
	'....JMMMMMMJ....',
	'....JSSSSSSJ....',
	'....JSSSsSSJ....',
	'....JSSSSSSJ....',
	'....JSsSSSSJ....',
	'....JSSSSsSJ....',
	'....JSSSSSSJ....',
	'.....JJJJJJ.....',
	'................',
	'................',
], {'B': BERRY, 'b': Px('#ffb0b0'), 'L': LEAF, 'r': STRAW_R, 'W': STRAW_W, 'J': JAR, 'M': Px('#ffd0dc', '#4e0c1c'),
	'S': BERRY_SMOOTHIE, 's': Px('#6e0c22')})
