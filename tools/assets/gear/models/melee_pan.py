# Cast-iron skillet (26 cm). Origin = hand grip on the handle; +Z = toward the pan; cooking face up (+Y).
import math
from gkit import rot_s

OUT = 'weapons'
TEX = 1024
MS = 1.5
META = dict(kind='melee', type='pan', notes='cooking surface faces +Y; roll 90 deg about Z to hold it like a bat')
PC = 212.0      # pan centre f
BOT = -40.0     # outside bottom u


def build(g):
    prof = [(0, 0), (0, 96), (1.2, 102), (4, 106.5), (9, 110), (47, 126), (50, 128.6), (51.6, 128.8), (52.2, 127.0), (51.2, 124.0),
            (8, 103.5), (6.2, 99.5), (5.2, 92), (5.2, 0)]
    g.lathe('pan', prof, 'cast_iron', f=PC, u=BOT, axis='u', segs=72)
    # heat ring on the bottom + helper lip opposite the handle
    g.lathe('ring', [(-0.6, 84), (-0.6, 90), (0.3, 90), (0.3, 84)], 'cast_iron', f=PC, u=BOT, axis='u', segs=72, cap0=False, cap1=False)
    g.side('lip', [(PC + 118, BOT + 44, 3), (PC + 160, BOT + 47, 10), (PC + 160, BOT + 53, 4), (PC + 120, BOT + 53, 2)], 40.0, 'cast_iron', bevel=3.0, bres=3,
           taper=[(PC + 118, 1.0), (PC + 160, 0.75)])
    # handle: rises from the rim, tapered, hanging hole near the end
    side = [(98, BOT + 37, 4), (60, -6, 6), (-70, 8, 10), (-92, 13, 12), (-94, 26, 10), (-70, 24, 6), (60, 10, 6), (100, BOT + 54, 4)]
    hole = [(-80, 14, 5), (-62, 13, 5), (-62, 21, 4), (-80, 22, 4)]
    g.side('handle', side, 24.0, 'cast_iron', bevel=4.5, bres=3, holes=[hole], taper=[(-94, 1.05), (0, 0.95), (100, 0.75)])
    g.empty('tip', PC + 128, BOT + 25)
    g.set_origin(0, 8)
