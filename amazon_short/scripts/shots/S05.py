"""S05 – 'The canopy hides the sun' POV straight up past giant trunks into the leaf ceiling; only specks of sky."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts')
from shotlib import *
s, sh = setup('S05'); N = sh['frames']
E = ENV.build_env(forest_cfg(seed=52, cam=(0, 0, 1.6), density=0.6, clear=[(0, 0, 3.0)], giants=[(-3.5, 2.0, 1.3), (3.0, 3.5, 1.5), (1.0, -4.0, 1.2)], n_poles=70, n_canopy=110, n_lianas=40))
day_light(3.0, (30, 0, 120), 0.9, 0.0)
cam = camera('CAM', (0, 0, 1.6), (0, 0.5, 30), 16)
cam_path(cam, [(1, (0, 0, 1.6), (0.6, 1.0, 30)), (N, (0, 0.05, 1.65), (-0.6, 0.9, 30))])
c = cam.rotation_euler
cam.data.dof.use_dof = False
ENV.mist_fog(10, 60, (0.55, 0.6, 0.55), 0.1)
finish(s, 'S05'); render_if_requested()
