from wkit import *

def build(g):
    g.side('stock', [(0, -40, 4), (0, 20, 4), (200, 25, 10), (220, -10, 6), (180, -20), (40, -60, 8)], 36, 'wood', bevel=6, bres=3)
    g.side('recv', [(200, -30, 2), (200, 25, 2), (420, 25, 2), (420, -30, 2)], 26, 'park')
    g.tube('barrel', 420, 700, 9, 'steel', bore=4)
    g.side('mag', [(330, -30), (370, -30), (360, -180, 4), (310, -175, 4)], 22, 'park', group='mag')
    g.box('bolt', 300, 360, 5, 18, 8, 'bright', group='bolt', s=14)
    g.rail('rail', 220, 410, 25)
    g.grip = (260, -60)
    g.empty('muzzle', 700, 0)
    g.pivot('mag', 350, -30)
    g.pivot('bolt', 330, 10, 14)
