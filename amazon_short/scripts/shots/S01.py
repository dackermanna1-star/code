"""S01 – 'What would happen if you got lost alone in the Amazon rainforest?' Dawn flight low over endless misty canopy,
tilting down into a gap in the leaves."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts')
from shotlib import *
import aerial as AE
s, sh = setup('S01'); N = sh['frames']
A = AE.build_aerial(dict(center=(0, 0), size=1400, res=4.0, seed=1, river=dict(y=420, width=110), mist=0.5, mist_levels=[40]))
ENV.world_hdri(1.0, 2.4, 'kloofendal_misty_morning_puresky_2k.hdr')
s.view_settings.exposure = 0.2
ENV.sun(4.0, (math.radians(78), 0, math.radians(200)), (1.0, 0.78, 0.55), 1.0)
cam = camera('CAM', (0, -320, 95), (0, 300, 10), 26)
cam_path(cam, [(1, (-10, -360, 140), (0, 300, 20)), (70, (0, -260, 105), (0, 40, 10)), (N, (8, -200, 80), (12, -110, 0))])
handheld(cam, 1, N, amp=0.15, rot_amp=0.002, seed=1)
cam.data.dof.use_dof = False; cam.data.clip_end = 3000
ENV.mist_fog(150, 1500, (0.78, 0.8, 0.8), 0.4, glare=True, grade=dict(gain=(1.06, 1.0, 0.92), sat=1.05))
finish(s, 'S01'); render_if_requested()
