"""
Builds the Showdown's display fonts: each family is split by Fontsource into
unicode-range chunks; this pulls just the glyphs the game's text uses out of
those chunks and merges them into one small woff2 per family.

usage: python3 tools/subset-fonts.py <fontsource node_modules/@fontsource dir>
"""
import glob
import os
import re
import sys

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont

SRC = sys.argv[1] if len(sys.argv) > 1 else 'node_modules/@fontsource'
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'showdown', 'fonts')
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'showdown')

ASCII = ''.join(chr(c) for c in range(0x20, 0x7f))
PUNCT = '「」『』、。・…！？―ー〜（）：　×←→↑↓★☆●○■□◆◇—–’‘“”'


def game_text():
    """Every character used by the Showdown's source (strings, comments and all)."""
    chars = set(ASCII + PUNCT)
    for path in glob.glob(os.path.join(ROOT, '**', '*.*'), recursive=True):
        if path.endswith(('.ts', '.css', '.html')):
            chars |= set(open(path, encoding='utf-8').read())
    chars |= set(open(os.path.join(ROOT, '..', '..', 'showdown.html'), encoding='utf-8').read())
    return ''.join(sorted(c for c in chars if ord(c) >= 0x20))


def build(family, weight, name, text):
    files = sorted(glob.glob(os.path.join(SRC, family, 'files', f'{family}-*-{weight}-normal.woff2')))
    if not files:
        print('missing', family)
        return
    want = set(ord(c) for c in text)
    parts = []
    for i, f in enumerate(files):
        font = TTFont(f)
        have = set(font.getBestCmap().keys()) & want
        if not have:
            continue
        opts = subset.Options()
        opts.layout_features = ['*']
        opts.name_IDs = ['*']
        opts.notdef_outline = True
        opts.glyph_names = False
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=sorted(have))
        sub.subset(font)
        font.flavor = None
        tmp = os.path.join('/tmp', f'_sub_{name}_{i}.ttf')
        font.save(tmp)
        parts.append(tmp)
        want -= have
    if not parts:
        return
    if len(parts) == 1:
        merged = TTFont(parts[0])
    else:
        merged = Merger().merge(parts)
    merged.flavor = 'woff2'
    os.makedirs(OUT, exist_ok=True)
    dst = os.path.join(OUT, f'{name}.woff2')
    merged.save(dst)
    print(f'{name}: {len(parts)} chunks -> {os.path.getsize(dst) // 1024} KB, missing {len(want)}')


if __name__ == '__main__':
    text = game_text()
    build('yuji-syuku', 400, 'brush', text)
    build('dela-gothic-one', 400, 'impact', text)
    build('shippori-mincho', 700, 'mincho', text)
    build('bangers', 400, 'comic', ASCII + '’‘“”—–…')
    build('oswald', 500, 'oswald', ASCII + '’‘“”—–…×')
