"""16x16 inventory icons for every wearable, authored as pixel grids.

Light comes from the top-left (vanilla convention); outlines are a darker shade of the local colour.
'.' is transparent. The hoodie icon is greyscale (tinted by the dye colour) plus an untinted overlay.
"""
from lib import grid_image, upscale, write_png

ICONS = {}


def icon(item_id, palette, rows):
    ICONS[item_id] = (palette, rows)


# ============================================================================================ hats
icon("top_hat", {
    "k": "#121016", "b": "#2b2731", "B": "#38333f", "h": "#544d5f", "H": "#706880",
    "r": "#a3202e", "R": "#d24b58", "d": "#5e121b",
}, [
    "................",
    "....kkkkkkkk....",
    "...kHHhhhhhbk...",
    "...kHhBBBBBbk...",
    "...khBBBBBBbk...",
    "...khBBBBBBbk...",
    "...khBBBBBBbk...",
    "...khBBBBBBbk...",
    "...kRRRRRRRdk...",
    "...krrrrrrrdk...",
    ".kkkbbbbbbbbbkk.",
    "khhBBBBBBBBBBbbk",
    "kbBBBBBBBBBBBbbk",
    ".kkbbbbbbbbbbkk.",
    "...kkkkkkkkkk...",
    "................",
])

icon("cowboy_hat", {
    "k": "#3a220f", "d": "#6b4223", "b": "#8f5b31", "l": "#ad7643", "h": "#cf9a5e",
    "n": "#2a190c", "N": "#4a2e18", "s": "#e2e6ec",
}, [
    "................",
    "................",
    "................",
    ".....kkk.kkk....",
    "....khhlklbbk...",
    "....khlllbbbk...",
    "....khllbbbbk...",
    "....klllbbbdk...",
    "k...kNNNNsNNk..k",
    "kk..knnnnnnnk.kk",
    "khkkkkkkkkkkkkdk",
    ".khhhllllllbbdk.",
    "..kkbbbbbbbddk..",
    "....kkkkkkkk....",
    "................",
    "................",
])

icon("baseball_cap", {
    "k": "#4c0b10", "d": "#8a1720", "b": "#c4262f", "l": "#e0434b", "h": "#f37b80",
    "w": "#f6f2ea", "g": "#3fd16b", "u": "#2d6b3a",
}, [
    "................",
    "................",
    "................",
    "......kkkk......",
    "....kkhhllkk....",
    "...khhllllbbk...",
    "..khllwwlbbbdk..",
    "..khlwgwbbbbdk..",
    "..kllbwbbbbbdk..",
    "..klbbbbbbbbdk..",
    "..kdbbbbbbbddkk.",
    "..kkddddddkkllhk",
    "....kkkkkkudbbbk",
    "..........kkkkk.",
    "................",
    "................",
])

icon("snapback_cap", {
    "k": "#0c1838", "d": "#1b3270", "b": "#2b4fa8", "l": "#4670c8", "h": "#7ea0e6",
    "v": "#1d2c55", "V": "#2c4078", "y": "#f6d24a", "g": "#5fd35a", "x": "#10240f",
}, [
    "................",
    "................",
    "................",
    "......kkkk......",
    "....kkhhllkk....",
    "...khhllllbbk...",
    "..khllgggglbdk..",
    "..khlgxggxbbdk..",
    "..kllgxxxxbbdk..",
    "..klbgxggxbbdk..",
    ".kkdbbbbbbbbdk..",
    "kVVVkddddddddk..",
    "kvyvvvvkkkkkk...",
    ".kkkkkkk........",
    "................",
    "................",
])

icon("beanie", {
    "k": "#0b3b39", "d": "#16706c", "b": "#1f8f8a", "l": "#33aaa4", "h": "#5fcfc8",
    "w": "#fbf6e8", "c": "#e2d6b8", "C": "#c4b591", "S": "#f3ead2", "s": "#cfc1a0",
    "R": "#1b7d78", "r": "#13615d",
}, [
    "................",
    "......kkkk......",
    ".....kwwwck.....",
    ".....kwwccCk....",
    "......kcCCk.....",
    "....kkkkkkkk....",
    "...khhllllbbk...",
    "..khllllllbbdk..",
    "..kSSSSSSSSssk..",
    "..klllllllbbdk..",
    ".kRrRrRrRrRrRrk.",
    ".kRrRrRrRrRrRrk.",
    ".kRrRrRrRrRrRrk.",
    "..kkkkkkkkkkkk..",
    "................",
    "................",
])

icon("party_hat", {
    "k": "#5e0f3a", "m": "#e0338f", "M": "#f06bb0", "y": "#ffd23f", "Y": "#fff09a", "o": "#d99a17",
    "c": "#46d4f5",
}, [
    ".......kk.......",
    "......kYyk......",
    "......kyok......",
    ".......kk.......",
    ".......kMk......",
    "......kMyk......",
    "......kyymk.....",
    ".....kMmyyk.....",
    ".....kyymmmk....",
    "....kMyyycmk....",
    "....kmmmyyyyk...",
    "...kyyymmmmyk...",
    "...kmcyyyymmmk..",
    "..kyyyyyyyyyyyk.",
    "..kkkkkkkkkkkkk.",
    "................",
])

icon("chef_hat", {
    "k": "#7d7d78", "w": "#ffffff", "W": "#f2f2ec", "g": "#d8d8d0", "G": "#b8b8b0",
}, [
    "................",
    "....kkk..kkk....",
    "...kwwwkkwwWk...",
    "..kwwwwwwwWWgk..",
    "..kwwwwwwWWWgk..",
    "..kwwwwWWWWggk..",
    "..kWWWWWWWgggk..",
    "...kGGGGGGGGk...",
    "...kwgWgWgWGk...",
    "...kwgWgWgWGk...",
    "...kwgWgWgWGk...",
    "...kWWWWWWWGk...",
    "...kkkkkkkkkk...",
    "................",
    "................",
    "................",
])

icon("wizard_hat", {
    "k": "#141440", "d": "#22225e", "b": "#30307e", "l": "#4848a6", "h": "#6a6ac8",
    "y": "#ffd447", "w": "#ffffff", "p": "#5b2a8a", "P": "#7a42b0",
}, [
    "..........kkk...",
    ".........kbbdk..",
    "........kblk.k..",
    ".......khbk.....",
    "......kblbk.....",
    "......khywk.....",
    ".....khlbbdk....",
    ".....klbbybk....",
    "....khbybbbdk...",
    "....klbbbbwdk...",
    "...khbwbbbbbdk..",
    "...kPPPPyPPppk..",
    ".kkdddddddddddkk",
    "kllbbbbbbbbbybdk",
    ".kkkkkkkkkkkkkk.",
    "................",
])

icon("golden_crown", {
    "k": "#6b4a0c", "d": "#b07a18", "b": "#f0b42a", "l": "#ffd65a", "h": "#fff3b0",
    "r": "#e0283c", "R": "#ff7a88", "g": "#2fd66b", "G": "#a8ffcb", "u": "#2e6fe0", "U": "#9cc0ff",
    "v": "#a3122a", "p": "#f4f0ea",
}, [
    "................",
    "................",
    ".......kk.......",
    "..kk..kRrk..kk..",
    ".kpdk..kk..kpdk.",
    ".kbk..klbk..kbk.",
    ".khbk.khbk.khbk.",
    ".khbbkhlbbkkbbk.",
    ".khlbbhlbbbbbdk.",
    ".khllbbbbbbbddk.",
    ".khUubbGgbbUudk.",
    ".khuubbggbbuudk.",
    ".khlbbbbbbbbbdk.",
    ".kkkkkkkkkkkkkk.",
    "................",
    "................",
])

icon("flower_crown", {
    "k": "#1e4a1b", "v": "#3f8f3a", "V": "#5fb83f",
    "r": "#e33b3b", "R": "#ff8080", "y": "#ffd83b", "o": "#f29516", "u": "#4f7df0", "U": "#9ab6ff",
    "w": "#f7f7f2", "p": "#f48bb6", "P": "#b46ae8", "n": "#2b1a10",
}, [
    "................",
    "................",
    "................",
    "................",
    ".....rRr.wyw....",
    "...yykrnrwwyw...",
    "..yoyv.rk.wVuU..",
    ".pPpV......uuu..",
    ".pyp........Vv..",
    ".kPpk......rRrk.",
    "..kvVwyw..PpPrk.",
    "...kVwwywpPyPVk.",
    "....kkvVvVkPkk..",
    "......kkkk......",
    "................",
    "................",
])

icon("pirate_hat", {
    "k": "#08070a", "b": "#1f1b22", "l": "#35303a", "h": "#4a4452", "y": "#d8a93a", "Y": "#ffe08a",
    "w": "#f2efe4", "x": "#141010",
}, [
    "................",
    "................",
    "................",
    "......kkkk......",
    "....kkYYyykk....",
    "...kYhhhllbyk...",
    "..kYhlwwwlbbyk..",
    ".kYhlwxwxwbbbyk.",
    "kYhllbwwwbbbbbyk",
    "kyhlbbwxwbbbbbyk",
    "kyllwbbbbbwbbbyk",
    ".kyylbbbbbbbyyk.",
    "..kkyyyyyyyykk..",
    "....kkkkkkkk....",
    "................",
    "................",
])

icon("viking_helmet", {
    "k": "#2e3238", "d": "#5f6770", "b": "#9aa3ad", "l": "#c2cad3", "h": "#e6ecf2",
    "z": "#7a5520", "Z": "#c99a3a", "c": "#efe6cf", "C": "#c9bc9a", "x": "#8a7b5c",
}, [
    "................",
    "k..............k",
    "ck............ck",
    "cck..........xck",
    "Cck....kk....kcC",
    "xcck.khhlbk.kccx",
    ".xcckhllbbbkkccx",
    ".kxCkhlbbbbdkCxk",
    "..kkhlbbbbbbdkk.",
    "...khlbbbbbbdk..",
    "...kZZzZZzZZzk..",
    "...kkkkbdkkkkk..",
    "......kbdk......",
    "......kkkk......",
    "................",
    "................",
])

icon("propeller_cap", {
    "k": "#2a2a2a", "r": "#e23b3b", "R": "#ff7676", "y": "#ffd23f", "Y": "#fff09a",
    "u": "#2f6fe0", "U": "#7ea8ff", "g": "#3fbf4f", "G": "#86e892", "s": "#c9ced6", "d": "#8a1d1d",
}, [
    "................",
    ".kkkkk...kkkkk..",
    "kRrrrrkykuuuUUk.",
    ".kkkkkkYkkkkkk..",
    ".......sk.......",
    ".......sk.......",
    ".....kkkkkk.....",
    "....kRrryyYk....",
    "...kRrrryyyyk...",
    "..kRrrrryyyyyk..",
    "..kgggggguuuuk..",
    "..kGggggguuuuk..",
    "..kddddddddddkk.",
    "...kkkkkkkkrrrk.",
    "...........kkk..",
    "................",
])

icon("sunglasses", {
    "k": "#6b4d10", "y": "#e9b949", "Y": "#fff0b0", "a": "#2a2350", "b": "#5a3f6a",
    "c": "#a8565a", "o": "#d9733f", "w": "#ffffff",
}, [
    "................",
    "................",
    "................",
    "................",
    "................",
    "kyYYYyyykkyyyyyk",
    "kyaaaaaykkyaaaay",
    "ywaabbbayyawabba",
    "yawbbcbbykwbbcby",
    "ybbccccy..yccccy",
    ".ycooooy..yoooy.",
    "..yoooy....yooy.",
    "...yyy......yy..",
    "................",
    "................",
    "................",
])

icon("nerd_glasses", {
    "k": "#000000", "b": "#1b1a1d", "g": "#4a474f", "l": "#cdeeff", "L": "#a9d8f2", "w": "#ffffff",
    "t": "#f3f0e6", "T": "#cfcabb",
}, [
    "................",
    "................",
    "................",
    "................",
    "................",
    "gggggggggggggggg",
    "bbbbbbbbbbbbbbbb",
    "bbwlllbttbwlllbb",
    ".blwlLbTTblwlLb.",
    ".bllLLbttbllLLb.",
    ".bLLLLb..bLLLLb.",
    ".bbbbbb..bbbbbb.",
    "................",
    "................",
    "................",
    "................",
])

icon("headphones", {
    "k": "#4a0a12", "r": "#d8263a", "R": "#f2606f", "d": "#8c1626", "b": "#1e1e23", "B": "#3a3a42",
    "w": "#f6f6f6", "s": "#cfd3da",
}, [
    "................",
    ".....kkkkkk.....",
    "...kkRRRrrrkk...",
    "..kRrkkkkkkddk..",
    ".kRrk......kddk.",
    ".krk........kdk.",
    ".krk........kdk.",
    ".ksk........ksk.",
    "kRrrk......kddrk",
    "kRwrB......Bdwdk",
    "kRwrB......Bdwdk",
    "kRwwB......Bdwwk",
    "krrrB......Bdddk",
    ".kkkk......kkkk.",
    "................",
    "................",
])

# ============================================================================================ tops
_TEE = [
    "................",
    "................",
    "....kkk..kkk....",
    "..kkbbbkkbbbkk..",
    ".kbbbbbbbbbbbbk.",
    "kbbbbbbbbbbbbbbk",
    "kbbbbbbbbbbbbbbk",
    ".kkkbbbbbbbbkkk.",
    "...kbbbbbbbbk...",
    "...kbbbbbbbbk...",
    "...kbbbbbbbbk...",
    "...kbbbbbbbbk...",
    "...kbbbbbbbbk...",
    "...kbbbbbbbbk...",
    "...kkkkkkkkkk...",
    "................",
]

icon("creeper_tee", {
    "k": "#1e4d1c", "b": "#5fbf4a", "l": "#86d96f", "d": "#3f8f33", "x": "#10240f",
}, [
    "................",
    "................",
    "....kkk..kkk....",
    "..kklllkklllkk..",
    ".klllllddllllbk.",
    "klllbbbbbbbbbbdk",
    "kldbbbbbbbbbbddk",
    ".kkklbbbbbbdkkk.",
    "...klxxbbxxbk...",
    "...klxxbbxxbk...",
    "...klbbxxbbdk...",
    "...klbxxxxbdk...",
    "...klbxbbxbdk...",
    "...kbbbbbbddk...",
    "...kkkkkkkkkk...",
    "................",
])

icon("emerald_tee", {
    "k": "#8a8a84", "b": "#f4f4ef", "l": "#ffffff", "d": "#d6d6cf",
    "i": "#202020", "r": "#e0283c", "R": "#ff8a96", "g": "#2fbf5f", "G": "#a8ffcb", "e": "#17803c",
}, [
    "................",
    "................",
    "....kkk..kkk....",
    "..kklllkklllkk..",
    ".klllllddllllbk.",
    "klllbbbbbbbbbbdk",
    "kldbbbbbbbbbbddk",
    ".kkklibrrbrrkkk.",
    "...klibrRrrrk...",
    "...klibbrrrdk...",
    "...klbbbbrbdk...",
    "...klbbgGbbdk...",
    "...klbggGebdk...",
    "...kbbbeebbdk...",
    "...kkkkkkkkkk...",
    "................",
])

icon("denim_jacket", {
    "k": "#16264a", "b": "#3c64a8", "l": "#5a86cc", "h": "#86aee6", "d": "#2a4a85",
    "w": "#f4f4ef", "W": "#d6d6cf", "y": "#d8a93a",
}, [
    "................",
    "................",
    "....kkk..kkk....",
    "..kkhhlkkllbkk..",
    ".khhlllwwlllbdk.",
    "khllbbdwWdbbbbdk",
    "khlkbbbwWbbbkbdk",
    "khlkyhbwWbyhkddk",
    "khlkbbbwWbbbkddk",
    "khlkbbbwWbbbkddk",
    "khlkbbywWybbkddk",
    "kddkbbbwWbbbkddk",
    ".kkkbbywWybbkkk.",
    "...kdddwWdddk...",
    "...kkkkkkkkkk...",
    "................",
])

icon("tuxedo_jacket", {
    "k": "#050507", "b": "#1c1b22", "l": "#2f2d38", "h": "#4a4757", "w": "#ffffff", "W": "#dcdcd6",
    "r": "#121214", "s": "#3a3846",
}, [
    "................",
    "................",
    "....kkk..kkk....",
    "..kkhhlkklllkk..",
    ".khhllswwsllbbk.",
    "khllbbsrrsbbbbbk",
    "khlkbbswWsbbkbbk",
    "khlkbbbsWsbbkbbk",
    "khlkbbbwWbbbkbbk",
    "khlkbbbrWbbbkbbk",
    "khlkbbbbWbbbkbbk",
    "wwwkbbbrWbbbkwww",
    ".kkkbbbbsbbbkkk.",
    "...kbbbbbbbbk...",
    "...kkkkkkkkkk...",
    "................",
])

icon("hawaiian_shirt", {
    "k": "#7a2a08", "b": "#f07a2a", "l": "#ff9e52", "d": "#c95a17",
    "f": "#ff4f8a", "F": "#ffd1e1", "y": "#ffe14a", "g": "#2e9e5a", "G": "#5fd38a", "w": "#fff3e0",
}, [
    "................",
    "................",
    "....kkk..kkk....",
    "..kkllwkkwlbkk..",
    ".kllfFlwwlGgbdk.",
    "klgflfbwwbgGbbdk",
    "klGgflbbbbbfbddk",
    ".kkkbbfFbbffkkk.",
    "...kbfyfbbbFk...",
    "...kGbfbgGbbk...",
    "...kgGbbbgfFk...",
    "...kbbfFbbfyk...",
    "...kbfyfgGbfk...",
    "...kbbfbbgbdk...",
    "...kkkkkkkkkk...",
    "................",
])

# Hoodie: greyscale (tinted by the dye colour); the overlay holds the untinted drawstrings.
icon("hoodie", {
    "k": "#2a2a2a", "b": "#bdbdbd", "l": "#dedede", "h": "#f4f4f4", "d": "#8e8e8e", "D": "#6e6e6e",
}, [
    "................",
    ".....kkkkkk.....",
    "....khllllbk....",
    "...kkhkDDkbkk...",
    "..khhlkDDkbbdk..",
    ".khllbbkkbbbbdk.",
    "khllbbbbbbbbbbdk",
    "khlkbbbbbbbbkbdk",
    "khlkbbbbbbbbkbdk",
    "khlkbdddddddkddk",
    "khlkbdbbbbbdkddk",
    "kDDkbdbbbbbdkDDk",
    ".kkkbbbbbbbbkkk.",
    "...kDDDDDDDDk...",
    "...kkkkkkkkkk...",
    "................",
])

icon("hoodie_overlay", {
    "w": "#f6f6f6", "s": "#c9c9c9", "a": "#d8d8d8", "h": (255, 255, 255, 64),
}, [
    "................",
    "................",
    ".....hhh........",
    "................",
    "................",
    "......w..w......",
    "......w..w......",
    "......w..w......",
    "......s..s......",
    "......a..a......",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
])

# ============================================================================================ bottoms
icon("jeans", {
    "k": "#13213f", "b": "#3a5a96", "l": "#5476b3", "h": "#7a9ad0", "d": "#26406e",
    "y": "#d8a93a", "n": "#6b4523", "s": "#e0b24a",
}, [
    "................",
    "...kkkkkkkkkk...",
    "...knnnnynnnk...",
    "...khlbsbbsbk...",
    "...khlbbbbbdk...",
    "...khlbbkbbdk...",
    "...khlbdkhlbdk..",
    "...khlbdkhlbdk..",
    "..khlbbdkhlbdk..",
    "..khlbbdkhlbbdk.",
    "..khlbbdkhlbbdk.",
    "..khlbbdkhlbbdk.",
    "..khhlbdkhhlbdk.",
    "..kkkkkk.kkkkkk.",
    "................",
    "................",
])

icon("cargo_shorts", {
    "k": "#4a3d1e", "b": "#b8a46a", "l": "#d1bf86", "h": "#e6d8a6", "d": "#8f7c48", "D": "#76653a",
    "n": "#5a4a2a",
}, [
    "................",
    "................",
    "................",
    "...kkkkkkkkkk...",
    "...knnnnnnnnk...",
    "...khlbbbbbdk...",
    "..khlbbbkbbbdk..",
    "..khlbbdkhlbdk..",
    ".kDDdbbdkhlbDDk.",
    ".kDddbbdkhlbdDk.",
    ".kDDdbbdkhlbDDk.",
    ".kkhlbbdkhlbdkk.",
    "..kkkkkk.kkkkk..",
    "................",
    "................",
    "................",
])

icon("sweatpants", {
    "k": "#333338", "b": "#8c8c94", "l": "#a6a6ae", "h": "#c4c4cc", "d": "#6e6e76",
    "w": "#f4f4f4", "c": "#55555c",
}, [
    "................",
    "...kkkkkkkkkk...",
    "...kccccccccck..",
    "...khlbwbwbbdk..",
    "...khlbwbwbbdk..",
    "...khlbbkbbbdk..",
    "...khlbdkhlbdk..",
    "...khlbdkhlbdk..",
    "...khlbdkhlbdk..",
    "...khlbdkhlbdk..",
    "...khlbdkhlbdk..",
    "...khlbdkhlbdk..",
    "...kccccdkcccck.",
    "...kkkkkk.kkkkk.",
    "................",
    "................",
])

icon("sneakers", {
    "k": "#4a4a50", "w": "#ffffff", "W": "#e6e6ea", "g": "#c4c4cc", "r": "#e0283c", "R": "#ff6a78",
    "s": "#9a9aa3", "l": "#2a2a2a",
}, [
    "................",
    "................",
    "................",
    "................",
    "................",
    "...kkkkk........",
    "..kWwwwWk.......",
    "..kwlwlwWkk.....",
    "..kwwlwlwwWkk...",
    "..kwrRRwwwwwWkk.",
    "..kwwwrRRrwwwWWk",
    "..kWgggggggggggk",
    "..kssssssssssssk",
    "...kkkkkkkkkkkk.",
    "................",
    "................",
])

icon("cowboy_boots", {
    "k": "#2e1a0b", "b": "#7a4a24", "l": "#9c6434", "h": "#bf8550", "d": "#5a3518", "y": "#e8c25a",
    "s": "#d4d8de", "S": "#8e939b",
}, [
    "................",
    "....kkkkkk......",
    "....khhlbk......",
    "....khybdk......",
    "....klyydk......",
    "....khlybk......",
    "....khlbdk......",
    "....khlbdk......",
    "....khlbdk......",
    "...kkhlbbdkk....",
    "...khlbbbbbdkk..",
    "...khlbbbbbbbdk.",
    "Sskddddkkkkkkkk.",
    ".k.kkkk.........",
    "................",
    "................",
])

icon("bunny_slippers", {
    "k": "#8a3a58", "p": "#f7a8c8", "P": "#ffd1e3", "d": "#d97aa2", "w": "#ffffff", "x": "#2a1a20",
    "n": "#ff5a8a",
}, [
    "................",
    "................",
    "................",
    ".....kk.kk......",
    "....kPpkPpk.....",
    "....kPnkPnk.....",
    "....kPnkPnk.....",
    "....kPpkPpk.....",
    "...kkPpppppkk...",
    "..kPPxpppxppdk..",
    "..kPpppnnpppdk..",
    "..kPpwwpppppdkk.",
    "..kpppppppppdddk",
    "..kddddddddddddk",
    "...kkkkkkkkkkkk.",
    "................",
])


def build():
    for item_id, (palette, rows) in ICONS.items():
        write_png(grid_image(rows, palette, (16, 16)), "textures", "item", "clothing", item_id + ".png")


def contact_sheet(path, scale=8):
    """Dev helper: all icons upscaled on a checkerboard."""
    from PIL import Image
    ids = list(ICONS)
    cols = 7
    rows = (len(ids) + cols - 1) // cols
    cell = 16 * scale + 8
    sheet = Image.new("RGBA", (cols * cell, rows * cell), (60, 60, 70, 255))
    for k, item_id in enumerate(ids):
        palette, grid = ICONS[item_id]
        img = upscale(grid_image(grid, palette, (16, 16)), scale)
        x, y = (k % cols) * cell + 4, (k // cols) * cell + 4
        bg = Image.new("RGBA", img.size, (139, 139, 139, 255))
        sheet.paste(bg, (x, y))
        sheet.alpha_composite(img, (x, y))
    sheet.save(path)
