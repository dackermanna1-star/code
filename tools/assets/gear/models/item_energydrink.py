# Energy drink: 500 ml aluminium can with a printed wrap (fictional VOLTAGE brand), necked lid and pull tab.
# Origin = bottom centre on the ground.
OUT = 'items'
TEX = 512
META = dict(kind='boost', type='energy_drink')


def build(g):
    wrap = g.decal_kind('alu_print', 'can', g.work + '/labels/energy_can.png', rough=0.32, metal=0.35)
    prof = [(3.5, 0), (2.5, 20), (0.6, 27), (0, 29.5), (0.6, 31.6), (3.0, 32.8), (8, 33.0), (150, 33.0), (157, 30.8), (163.5, 27.2),
            (165.5, 26.8), (167.6, 27.4), (168.4, 26.6), (167.2, 25.6), (164.2, 25.6), (164.0, 0)]
    can = g.lathe('can', prof, wrap, axis='u', segs=56)
    g.decal_uv(can, ('cyl', 0, 0), (-180, 8, 180, 152))
    # pull tab + rivet + mouth score
    g.lathe('rivet', [(164.0, 0), (164.0, 2.6), (165.4, 2.4), (165.6, 0)], 'alu', f=0, axis='u', segs=12)
    g.front('tab', [(-6, 164.6, 2), (6, 164.6, 2), (6, 165.6, 2), (-6, 165.6, 2)], -8, 14, 'alu', bevel=0.3)
    g.front('score', [(-7, 163.9, 3), (7, 163.9, 3), (7, 164.3, 3), (-7, 164.3, 3)], -17, -5, 'alu!', bevel=0.1)
    g.set_origin(0, 0)
