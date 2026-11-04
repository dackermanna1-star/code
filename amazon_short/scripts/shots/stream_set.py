"""Shared stream set (S13–S19, S21, S30): a brown forest creek winding along -Y (downstream)."""
from shotlib import *
STREAM = [(-3.0, 40), (-1.5, 22), (0.5, 10), (0.0, 0), (1.2, -10), (0.0, -24), (2.0, -40)]
def build(cam_xy, seed=91, extra_clear=(), wet=0.45, rain=0.0, density=1.1, giants=None, **kw):
    cfg = forest_cfg(seed=seed, cam=(cam_xy[0], cam_xy[1], 1.4), density=density, clear=list(extra_clear),
                     stream=dict(pts=STREAM, width=2.6, depth=0.75, bank=1.4, level=-0.42, speed=0.45),
                     giants=giants or [(6.5, 5.0, 1.3), (-6.0, -6.0, 1.4)], n_poles=45, wet=wet, rain_ripples=rain)
    cfg.update(kw)
    return ENV.build_env(cfg)
