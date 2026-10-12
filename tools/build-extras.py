#!/usr/bin/env python3
"""Build assets/wads/doomx-extras.wad from a Freedoom Phase 1 IWAD.

The shareware DOOM1.WAD ships only Episode 1 content, so it lacks the plasma
rifle, BFG 9000, cell ammo and the episode 2-4 demons. This script copies just
those lumps out of freedoom1.wad (BSD licensed, same palette) into a small
fallback PWAD. The engine only uses a fallback lump when the loaded IWAD does
not provide one, so a registered DOOM.WAD always wins.

Usage: python3 tools/build-extras.py path/to/freedoom1.wad
"""
import struct
import sys
from pathlib import Path

SPRITES = ['PLSG', 'PLSF', 'BFGG', 'BFGF', 'PLAS', 'BFUG', 'CELL', 'CELP',
           'PLSS', 'PLSE', 'BFS1', 'BFE1', 'BFE2', 'SKUL', 'HEAD', 'CYBR', 'SPID']
SOUNDS = ['DSPLASMA', 'DSBFG', 'DSCACSIT', 'DSCACDTH', 'DSSKLATK', 'DSSKLDTH',
          'DSCYBSIT', 'DSCYBDTH', 'DSSPISIT', 'DSSPIDTH', 'DSHOOF', 'DSMETAL']


def read_wad(path):
    data = Path(path).read_bytes()
    _, count, offset = struct.unpack('<4sii', data[:12])
    lumps = []
    for i in range(count):
        pos, size, name = struct.unpack('<ii8s', data[offset + 16 * i:offset + 16 * i + 16])
        lumps.append((name.rstrip(b'\0').decode('latin1'), data[pos:pos + size]))
    return lumps


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'freedoom1.wad'
    lumps = read_wad(src)
    out = []
    by_name = {n: d for n, d in lumps}
    for s in SOUNDS:
        out.append((s, by_name[s]))
    out.append(('S_START', b''))
    in_sprites = False
    for name, data in lumps:
        if name in ('S_START', 'SS_START'):
            in_sprites = True
            continue
        if name in ('S_END', 'SS_END'):
            in_sprites = False
            continue
        if in_sprites and name[:4] in SPRITES:
            out.append((name, data))
    out.append(('S_END', b''))

    header_size = 12
    body = bytearray()
    directory = bytearray()
    for name, data in out:
        directory += struct.pack('<ii8s', header_size + len(body), len(data), name.encode('latin1'))
        body += data
    wad = struct.pack('<4sii', b'PWAD', len(out), header_size + len(body)) + body + directory
    dest = Path(__file__).resolve().parent.parent / 'assets' / 'wads' / 'doomx-extras.wad'
    dest.write_bytes(wad)
    print(f'wrote {dest} ({len(out)} lumps, {len(wad)} bytes)')


if __name__ == '__main__':
    main()
