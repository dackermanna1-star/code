"""Shared set for S07–S09: small clearing with a fallen mossy log he sits on."""
from shotlib import *
LOG_XY = (0.0, 0.35)
def build(cam_xy, extra_clear=()):
    E = ENV.build_env(forest_cfg(seed=71, cam=(cam_xy[0], cam_xy[1], 1.4), density=1.1, clear=[(0, 0.2, 3.0)] + list(extra_clear),
                                 giants=[(-4.0, 6.0, 1.4), (5.0, 4.5, 1.1)], n_poles=50, wet=0.35))
    col, objs = ENV.ph_objects('dead_tree_trunk_02')
    lg = bpy.data.objects.new('PR_SitLog', None); lg.instance_type = 'COLLECTION'; lg.instance_collection = col
    lg.location = (LOG_XY[0], LOG_XY[1], ENV.height_at(E['terrain'], *LOG_XY) - 0.05); lg.scale = (0.5, 0.48, 0.48); lg.rotation_euler.z = math.radians(4)
    bpy.context.scene.collection.objects.link(lg)
    day_light(3.6, (48, 0, 140), 0.8, 0.6)
    return E
