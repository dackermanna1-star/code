"""S09 – 'So you walk.' Ground-level: boots stride through the mud past the lens."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts'); sys.path.insert(0, '/home/user/code/amazon_short/scripts/shots')
from shotlib import *
import rest_set
s, sh = setup('S09'); N = sh['frames']
E = rest_set.build((1.6, -2.2), clear_view((1.6, -2.2), (0.6, -1.0), 1.2, 0.8, 1.2))
T = E['terrain']
col, rig, acts = character(0.15, 0.45, ['UAL_Walk_Loop'])
pts = [Vector((-0.2, -0.7)), Vector((0.8, -1.5)), Vector((2.0, -2.0)), Vector((3.4, -2.3))]
sp_, sc = locomote(rig, T, pts, 1, N, 'UAL_Walk_Loop', ease_in=8, ease_out=1)
clip(rig, acts, 'Walk_Loop', -5, dur=N + 10, scale=sc, blend_in=0, blend_out=0)
gz = ENV.height_at(T, 1.6, -2.2)
cam = camera('CAM', (1.5, -2.35, gz + 0.18), (0.6, -1.3, gz + 0.25), 24)
cam_path(cam, [(1, (1.45, -2.4, gz + 0.16), (0.3, -1.2, gz + 0.3)), (N, (1.55, -2.5, gz + 0.2), (2.6, -2.0, gz + 0.35))])
focus_on(cam, rig, 'foot_r', 2.0)
ENV.mist_fog(2, 22, (0.44, 0.51, 0.44), 0.5)
finish(s, 'S09'); render_if_requested()
