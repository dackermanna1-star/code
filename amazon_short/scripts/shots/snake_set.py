"""Shared set S26–S28: leaf-litter path where a fer-de-lance lies coiled, camouflaged."""
from shotlib import *
import creatures as CR
SNAKE_XY = (0.0, 0.0)
def build(cam_xy):
    E = ENV.build_env(forest_cfg(seed=261, cam=(cam_xy[0], cam_xy[1], 1.0), density=1.0, litter=1.6, clear=[(0, 0.4, 2.2), (cam_xy[0], cam_xy[1], 1.2)],
                                 giants=[(-4.0, 6.0, 1.4), (4.5, 7.0, 1.2)], n_poles=45, wet=0.5, path=dict(pts=[(0, -10), (0, 0), (0.3, 10)], width=1.4)))
    T = E['terrain']
    gz = ENV.height_at(T, *SNAKE_XY)
    # coiled S-shape body resting on litter (tail -> head)
    pts = [(0.15, -0.25, 0), (0.3, -0.05, 0), (0.18, 0.18, 0), (-0.12, 0.2, 0), (-0.28, 0.0, 0), (-0.15, -0.18, 0), (0.05, -0.12, 0), (0.08, 0.05, 0), (0.0, 0.25, 0.02), (-0.02, 0.38, 0.05)]
    body, cu, head, tongue = CR.snake('CR_Lancehead', 1.5, 0.028, [(p[0] + SNAKE_XY[0], p[1] + SNAKE_XY[1], gz + 0.03 + p[2]) for p in pts])
    head.location = (SNAKE_XY[0] - 0.02, SNAKE_XY[1] + 0.385, gz + 0.075); head.rotation_euler = (math.radians(8), 0, math.radians(-8))
    return E, T, body, head, tongue
