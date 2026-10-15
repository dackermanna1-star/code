"""Winchester Model 1897 pump shotgun (field/riot, 20" barrel) -- authored from published dimensions
(Commons 'WncsterCatMod97trench.jpg' used only for proportions). 'bolt' = slide/bolt block, 'mag' = 12-ga shell at the loading port."""
from wkit import *

META = dict(name='S1897', real_length_m=1.0, cycle_node='bolt', mag_kind='tube')
BORE = 128.0
TUBE = 103.0
SIGHT = 142.0


def build(g):
    stock = [(4, -42, 6), (60, -26), (250, 44, 16), (300, 66, 10), (332, 74), (338, 112), (300, 118, 6), (230, 108, 30), (60, 104), (6, 98, 6)]
    g.side('stock', stock, 40, 'wood', bevel=9, bres=3, taper=[(4, 0.95), (150, 1.0), (280, 0.75), (338, 0.8)])
    g.side('buttplate', [(-4, -44, 3), (6, -44), (8, 100), (-2, 100, 3)], 40, 'rubber', bevel=2.5)
    # receiver: tall, rounded, exposed hammer
    recv = [(330, 76), (512, 80, 6), (520, 90), (520, 150, 6), (380, 150, 12), (346, 140, 8), (330, 118)]
    g.side('recv', recv, 36, 'blued', bevel=4, bres=2)
    g.side('hammer', [(326, 128), (342, 124), (346, 138), (336, 160, 3), (326, 158, 3)], 8, 'blued', bevel=1.2)
    g.box('port', 410, 500, 112, 140, 1.5, 'park!', s=18.4, r=3, bevel=0.4)
    # bolt / slide block
    g.side('bolt_block', [(380, 140), (500, 140), (500, 152, 3), (380, 152, 3)], 26, 'bright', group='bolt', bevel=1.8)
    g.pivot('bolt', 440, 146)
    # trigger guard + trigger
    g.side('guard', [(344, 80), (350, 50, 8), (404, 48, 10), (412, 80)], 12, 'blued', bevel=1.5, holes=[[(356, 80), (360, 58, 6), (396, 56, 7), (400, 80)]])
    g.side('trigger', [(370, 80), (376, 80), (378, 68, 3), (383, 60, 2), (379, 59), (371, 67, 3)], 6, 'blued', bevel=1)
    # magazine tube + ribbed walnut pump (slide handle)
    g.tube('magtube', 512, 900, 11.5, 'blued', u=TUBE, segs=22)
    g.lathe('mag_cap', [(894, 0), (894, 12.5), (912, 12.5), (916, 10), (916, 0)], 'blued', u=TUBE, segs=22)
    rib = []
    for i in range(18):
        x0 = 600 + i * 11
        rib += [(x0, 19.5), (x0 + 3, 21), (x0 + 8, 21), (x0 + 11, 19.5)]
    g.lathe('pump', [(600, 12)] + rib + [(798, 12)], 'wood', u=TUBE, segs=28, closed=True)
    g.side('pump_bar', [(520, TUBE + 6), (620, TUBE + 6), (620, TUBE + 12), (520, TUBE + 12)], 6, 'blued', s=10, bevel=1)
    # barrel + bead + band
    g.tube('barrel', 512, 1000, 12.0, 'blued', u=BORE, r1=11.2, bore=9.2)
    g.lathe('band', [(886, 0), (886, 9), (898, 9), (898, 0)], 'blued', u=TUBE + 13, segs=16)
    g.side('band_link', [(886, TUBE + 8), (898, TUBE + 8), (898, BORE - 6), (886, BORE - 6)], 10, 'blued', bevel=1)
    g.lathe('bead', [(0, 0), (0, 2.2), (3, 2.0), (4.5, 0)], 'brass', f=990, u=BORE + 10.5, axis='u', segs=12)
    # 'mag': a 12-ga shell sitting in the loading port / lifter
    g.tube('shell', 420, 486, 10.2, 'red_shell', group='mag', u=TUBE, segs=18)
    g.lathe('shell_head', [(408, 0), (408, 11), (420, 11), (420, 0)], 'brass', group='mag', u=TUBE, segs=18)
    g.pivot('mag', 447, TUBE)
    g.grip = (300, 92)
    g.empty('muzzle', 1000, BORE)
    g.empty('grip_support', 700, TUBE)
    g.empty('sight_eye', 160, SIGHT)
