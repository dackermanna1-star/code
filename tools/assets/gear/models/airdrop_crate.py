# Airdrop / care package: painted plywood supply crate on a skid with high-visibility cargo straps, steel corner
# angles, stencils and a lifting ring. Origin = bottom centre on the ground; 'smoke' empty = flare position,
# 'chute_attach' = where the canopy lines meet. See airdrop_crate_chute for the descending variant.
from _airdrop import crate
import gkit

OUT = 'items'
TEX = 1024
MS = 6.0
META = dict(kind='airdrop', nodes_note="'crate' mesh, empties 'chute_attach', 'smoke'")
gkit.KINDS['ply_od'] = dict(gkit.KINDS['plywood'], base='#4c5136', var='#454a30', rough=0.75, wear='#9a8a62', wear_amt=0.9, wear_rough=0.7)
gkit.KINDS['webbing_yel'] = dict(gkit.KINDS['webbing_od'], base='#c8901a', var='#b88418', wear='#d8a848')


def build(g):
    crate(g)
    g.set_origin(0, 0)
